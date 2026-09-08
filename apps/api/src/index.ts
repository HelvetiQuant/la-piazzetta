import 'dotenv/config';
import cors from 'cors';
import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { z } from 'zod';
import type { DevUser, RouteDeps } from './http.js';
import { registerOrderRoutes } from './orders/orders.routes.js';
import { registerStatsRoutes } from './stats/stats.routes.js';
import { registerDashboardRoutes } from './stats/dashboard.routes.js';
import { registerStaffRoutes } from './staff/staff.routes.js';
import { registerStaffSchedulingRoutes } from './staff/scheduling.routes.js';
import { registerMarketingRoutes } from './marketing/marketing.routes.js';
import { registerAccountingRoutes } from './accounting/accounting.routes.js';
import { registerCreditRoutes } from './credit/credit.routes.js';
import { registerInventoryRoutes } from './inventory/inventory.routes.js';
import { registerSupplierRoutes } from './suppliers/suppliers.routes.js';
import { registerPurchaseRoutes } from './suppliers/purchase.routes.js';
import { registerAiRoutes } from './ai/ai.routes.js';
import { registerAiPreferenceRoutes } from './ai/ai-preferences.routes.js';
import { registerMenuAddOnRoutes } from './menu-addons/menu-addons.routes.js';
import { registerStaffNoteRoutes } from './staff/staff-notes.routes.js';
import { registerCashierRoutes } from './cashier/cashier.routes.js';
import { registerAgentRoutes } from './agent/agent.routes.js';
import { AuthService, AuthError } from './auth/auth.service.js';
import { makeAuthMiddleware } from './auth/auth.middleware.js';
import { registerAuthRoutes } from './auth/auth.routes.js';
import { EntitlementService } from './entitlement/entitlement.service.js';
import { registerEntitlementRoutes, requireModule } from './entitlement/entitlement.routes.js';
import { getLogger, requestLogger, errorLogger } from './security/logger.js';
import { rateLimit, resolveRateLimitStore, loginKeyFn, type RateLimitStore } from './security/rate-limit.js';
import { getKdsWebSocket } from './realtime/kds-ws.js';
import { tryEnableBullmq } from './queue/bullmq.adapter.js';

const log = getLogger();
const prisma = new PrismaClient();
const app = express();

type Tx = Prisma.TransactionClient;

// In LAN sul portatile i frontend girano su origin diverse (porte Vite):
// CORS_ORIGIN=* di default; impostare un valore esplicito in produzione.
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

// Logging strutturato di ogni richiesta (salta /health e /ws).
app.use(requestLogger(log));

// --- Auth ---
// Controllo hardening: in produzione JWT_SECRET è OBBLIGATORIO. Senza di esso
// il fallback al segreto dev-noto renderebbe i token falsificabili.
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  log.error('JWT_SECRET mancante in produzione: avvio abortito.');
  process.exit(1);
}

const authService = new AuthService(prisma);

// Middleware di auth REALE: verifica JWT Bearer (con rotazione multi-secret);
// fuori produzione accetta ancora gli header dev per i test locali.
// Popola `req.devUser` come prima, quindi i moduli a valle restano invariati.
const devAuth: RequestHandler = makeAuthMiddleware(authService);

function requireRoles(...allowed: string[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).devUser as DevUser;
    if (!user || !user.roles.some((r) => allowed.includes(r) || r === 'OWNER')) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
}

const deps: RouteDeps = { devAuth, requireRoles };

app.get('/api/v1/health', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'la-piazzetta-api' });
});

// --- Avvio: TUTTO il wiring asincrono è serializzato in bootstrap() così
// l'ordine di registrazione dei middleware è deterministico (i middleware
// di protezione vengono registrati PRIMA delle rotte che devono proteggere).
async function bootstrap(): Promise<void> {
  // 1. Risolvi le dipendenze asincrone (cache Redis, store rate-limit, BullMQ).
  const [entitlements, rateLimitStore] = await Promise.all([
    EntitlementService.create(prisma),
    resolveRateLimitStore(),
  ]);
  await tryEnableBullmq(); // coda job: BullMQ/Redis se presente, altrimenti in-memory

  // 2. Rate limiting sulle rotte pubbliche di auth (PRIMA di registerAuthRoutes).
  // Anti brute-force su login: chiavi distinte per endpoint.
  app.use('/api/v1/auth/login', rateLimit({ windowMs: 60_000, max: 10, keyFn: (req) => `login:${req.ip}:${req.path}`, message: 'Troppi tentativi di login, riprova tra 1 minuto' }, rateLimitStore));
  app.use('/api/v1/auth/login-pin', rateLimit({ windowMs: 60_000, max: 20, keyFn: (req) => `loginpin:${req.ip}`, message: 'Troppi tentativi PIN, riprova tra 1 minuto' }, rateLimitStore));
  app.use('/api/v1/auth/refresh', rateLimit({ windowMs: 60_000, max: 30, message: 'Troppe richieste di refresh' }, rateLimitStore));

  // 3. Rotte pubbliche di autenticazione (login/refresh/logout).
  registerAuthRoutes(app, prisma, authService);

  // 4. Paywall contestuale per la UI (passa l'istanza con cache Redis).
  registerEntitlementRoutes(app, prisma, deps, entitlements);

  // 5. Gating del modulo AI a piano/add-on + rate limiting costi (PRIMA delle
  //    rotte AI registrate da registerAiRoutes).
  app.use('/api/v1/ai', devAuth, requireModule('ai', entitlements));
  app.use('/api/v1/suppliers/reorder-proposals/ai', devAuth, requireModule('ai', entitlements));
  app.use('/api/v1/ai', rateLimit({
    windowMs: 60_000,
    max: Number(process.env.AI_RATE_LIMIT_PER_MIN) || 60,
    keyFn: (req) => `ai:${(req as any).devUser?.userId ?? req.ip}`,
    message: 'Limite richieste AI raggiunto per questo minuto',
  }, rateLimitStore));

  // 6. Rotte tavoli/sessioni/prodotti (invariate).
  registerTableAndProductRoutes(app, prisma, deps);

  // 7. Moduli di dominio. Le route ordini notificano via WebSocket i client
  //    KDS connessi (push-on-mutation invece del solo polling).
  const kdsWs = getKdsWebSocket(authService);
  const orderDeps: RouteDeps = {
    devAuth,
    requireRoles,
    onBoardChange: (venueId, station) => kdsWs.notifyBoardUpdate(venueId, station),
  };

  registerOrderRoutes(app, prisma, orderDeps); // creazione ordini con station + timestamp, board per postazione, stato riga
  registerStatsRoutes(app, prisma, deps); // statistiche tempi di preparazione
  registerDashboardRoutes(app, prisma, deps); // KPI dashboard: revenue, ordini, top prodotti, coperti
  registerStaffRoutes(app, prisma, deps); // stipendi e turni staff
  registerStaffSchedulingRoutes(app, prisma, deps); // scheduling, availability, chat con AI
  registerMarketingRoutes(app, prisma, deps); // marketing avanzato: social, AI, Canva, analytics
  registerAccountingRoutes(app, prisma, deps); // contabilità italiana: piano conti, fatture, registrazioni, CE, BP, export
  registerCreditRoutes(app, prisma, deps); // crediti clienti in cassa
  registerInventoryRoutes(app, prisma, deps); // magazzino: movimenti storicizzati, rettifiche, low stock
  registerSupplierRoutes(app, prisma, deps); // fornitori: anagrafica, listino, proposte di riordino
  registerPurchaseRoutes(app, prisma, deps); // ordini d'acquisto: ciclo bozza->inviato->ricevuto + ricezione merce
  registerAiRoutes(app, prisma, deps); // AI: upsell, marketing copy, riordino predittivo (OpenAI + Anthropic)
  registerAiPreferenceRoutes(app, prisma, deps); // AI preferences: impara dall'owner, non invadente
  registerMenuAddOnRoutes(app, prisma, deps); // Menu add-on: consigli da promuovere via staff
  registerStaffNoteRoutes(app, prisma, deps); // Note/rules staff: notifiche lampeggianti con ack obbligatorio
  registerCashierRoutes(app, prisma, deps); // Cassa: pagamenti, cassetto, vendita al banco, chiusura giornaliera
  registerAgentRoutes(app, prisma, deps); // Agente: approvazione one-tap, proposte riordino

  // 7b. Serve le web app dei dipendenti come file statici (build Vite).
  // Il backend diventa l'unico server: API + web app cameriere/KDS.
  const path = await import('path');
  const fs = await import('fs');
  const webApps = [
    { mount: '/owner', dir: '../web-owner/dist' },
    { mount: '/waiter', dir: '../web-waiter/dist' },
    { mount: '/kds-bar', dir: '../web-kds-bar/dist' },
    { mount: '/kds-kitchen', dir: '../web-kds-kitchen/dist' },
  ];
  for (const { mount, dir } of webApps) {
    const absDir = path.resolve(dir);
    if (fs.existsSync(absDir)) {
      app.use(mount, express.static(absDir));
      // SPA fallback: qualsiasi route non di API serve index.html
      app.get(`${mount}/*`, (_req: Request, res: Response) => {
        res.sendFile(path.join(absDir, 'index.html'));
      });
      log.info('Serving web app', { mount, dir: absDir });
    } else {
      log.warn('Web app dir not found, skipping', { mount, dir: absDir });
    }
  }

  // 8. Error handlers (ordine: errorLogger logga, errorHandler risponde).
  app.use(errorLogger(log));
  app.use(errorHandler);

  // 9. Avvio server HTTP + WebSocket.
  const server = app.listen(PORT, () => log.info('API listening', { port: PORT }));
  kdsWs.attach(server, '/ws');

  // Health endpoint esteso con stato real-time.
  app.get('/api/v1/health/realtime', (_req: Request, res: Response) => {
    res.json({ ok: true, wsConnected: kdsWs.connectedCount() });
  });
}

// --- Error handler finale: risponde (il logging è già fatto da errorLogger) ---
const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: 'Validation error', issues: err.issues });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    res.status(400).json({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof AuthError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  // Il log dell'errore 500 è già stato emesso da errorLogger; qui rispondiamo soltanto.
  res.status(500).json({ error: 'Internal server error' });
};

// --- Rotte tavoli/sessioni/prodotti (estratte per leggibilità) ---
function registerTableAndProductRoutes(app: express.Express, prisma: PrismaClient, deps: RouteDeps): void {
  const { devAuth, requireRoles } = deps;

  app.get('/api/v1/orders-tables/tables', devAuth, async (req: Request, res: Response) => {
    const user = (req as any).devUser as DevUser;
    const tables = await prisma.table.findMany({
      where: { venueId: user.venueId },
      orderBy: { code: 'asc' },
      include: { sessions: { where: { state: 'OPEN' }, take: 1 } },
    });
    res.json(tables);
  });

  const createTableSchema = z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    area: z.enum(['indoor', 'outdoor']).default('indoor'),
    seats: z.number().int().positive().default(4),
  });

  app.post('/api/v1/orders-tables/tables', devAuth, requireRoles('OWNER', 'MANAGER'), async (req: Request, res: Response) => {
    const user = (req as any).devUser as DevUser;
    const body = createTableSchema.parse(req.body);
    const table = await prisma.table.create({ data: { ...body, venueId: user.venueId, state: 'FREE' } });
    res.status(201).json(table);
  });

  const openSessionSchema = z.object({ guests: z.number().int().positive().default(1) });

  app.post('/api/v1/orders-tables/tables/:id/sessions', devAuth, requireRoles('OWNER', 'MANAGER', 'WAITER'), async (req: Request, res: Response) => {
    const user = (req as any).devUser as DevUser;
    const id = req.params.id as string;
    const { guests } = openSessionSchema.parse(req.body);
    const table = await prisma.table.findFirst({ where: { id, venueId: user.venueId } });
    if (!table || table.state !== 'FREE') {
      res.status(400).json({ error: 'Table not free' });
      return;
    }
    const session = await prisma.$transaction(async (tx: Tx) => {
      const s = await tx.tableSession.create({ data: { tableId: id, venueId: user.venueId, guests } });
      await tx.table.update({ where: { id }, data: { state: 'OCCUPIED' } });
      return s;
    });
    res.status(201).json(session);
  });

  app.get('/api/v1/orders-tables/sessions/:id/orders', devAuth, requireRoles('OWNER', 'MANAGER', 'WAITER', 'CASHIER'), async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const user = (req as any).devUser as DevUser;
    const orders = await prisma.order.findMany({
      where: { sessionId: id, venueId: user.venueId },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(orders);
  });

  app.get('/api/v1/orders-tables/orders', devAuth, async (req: Request, res: Response) => {
    const user = (req as any).devUser as DevUser;
    const status = (req.query.status as string | undefined) ?? undefined;
    const orders = await prisma.order.findMany({
      where: { venueId: user.venueId, ...(status ? { status } : {}) },
      include: { items: { include: { product: true } }, session: { include: { table: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(orders);
  });

  app.get('/api/v1/products', devAuth, async (req: Request, res: Response) => {
    const user = (req as any).devUser as DevUser;
    const products = await prisma.product.findMany({ where: { venueId: user.venueId }, include: { stock: true } });
    res.json(products);
  });

  // === CRUD Prodotti (menu management per owner/manager) ===
  const productCreateSchema = z.object({
    code: z.string().min(1).max(40),
    name: z.string().min(1).max(120),
    category: z.string().min(1).max(60).default('generic'),
    priceCents: z.number().int().min(0),
    unit: z.string().max(10).default('pz'),
    preparation: z.string().max(500).optional(),
  });
  const productUpdateSchema = productCreateSchema.partial();

  app.post('/api/v1/products', devAuth, requireRoles('OWNER', 'MANAGER'), async (req: Request, res: Response) => {
    const user = (req as any).devUser as DevUser;
    const body = productCreateSchema.parse(req.body);
    try {
      const product = await prisma.product.create({
        data: { venueId: user.venueId, code: body.code, name: body.name, category: body.category, priceCents: body.priceCents, unit: body.unit },
        include: { stock: true },
      });
      res.status(201).json(product);
    } catch (e: any) {
      if (e?.code === 'P2002') { res.status(409).json({ error: `Codice "${body.code}" già esistente` }); return; }
      throw e;
    }
  });

  app.patch('/api/v1/products/:id', devAuth, requireRoles('OWNER', 'MANAGER'), async (req: Request, res: Response) => {
    const user = (req as any).devUser as DevUser;
    const id = req.params.id as string;
    const body = productUpdateSchema.parse(req.body);
    const existing = await prisma.product.findFirst({ where: { id, venueId: user.venueId } });
    if (!existing) { res.status(404).json({ error: 'Prodotto non trovato' }); return; }
    try {
      const product = await prisma.product.update({ where: { id }, data: body, include: { stock: true } });
      res.json(product);
    } catch (e: any) {
      if (e?.code === 'P2002') { res.status(409).json({ error: `Codice "${body.code}" già esistente` }); return; }
      throw e;
    }
  });

  app.delete('/api/v1/products/:id', devAuth, requireRoles('OWNER', 'MANAGER'), async (req: Request, res: Response) => {
    const user = (req as any).devUser as DevUser;
    const id = req.params.id as string;
    const existing = await prisma.product.findFirst({ where: { id, venueId: user.venueId } });
    if (!existing) { res.status(404).json({ error: 'Prodotto non trovato' }); return; }
    // Verifica che non ci siano ordini collegati
    const orderCount = await prisma.orderItem.count({ where: { productId: id } });
    if (orderCount > 0) {
      // Disattiva invece di eliminare: rinomina con prefisso e mantiene storico
      await prisma.product.update({ where: { id }, data: { name: `[DISATTIVATO] ${existing.name}`, code: `${existing.code}_DEL_${Date.now()}`.slice(0, 40) } });
      res.json({ ok: true, deactivated: true, message: 'Prodotto disattivato (presente in storico ordini)' });
      return;
    }
    await prisma.product.delete({ where: { id } });
    res.json({ ok: true });
  });
}

const PORT = process.env.PORT || 3000;

bootstrap().catch((err) => {
  log.error('bootstrap failed', { error: err?.message, stack: err?.stack });
  process.exit(1);
});
