import type { Express, Request, Response } from 'express';
import type { PrismaClient, Prisma } from '@prisma/client';
import { z } from 'zod';
import { currentUser, type RouteDeps } from '../http.js';
import { applyTransaction, type CreditTxType } from './credit.logic.js';
import { NotificationService } from '../notifications/notification.service.js';

type Tx = Prisma.TransactionClient;

// Ruoli abilitati alla gestione crediti in cassa.
const CASSA_ROLES = ['OWNER', 'MANAGER', 'CASHIER'];
// Ruoli che possono inserire consumazioni a credito (sala e banco).
const STAFF_CREDIT_ROLES = ['OWNER', 'MANAGER', 'CASHIER', 'BARMAN', 'WAITER'];

export function registerCreditRoutes(app: Express, prisma: PrismaClient, deps: RouteDeps): void {
  const { devAuth, requireRoles } = deps;
  const notifier = new NotificationService({ prisma });

  /** Invia notifica al cliente del credito (WhatsApp se ha telefono, email se ha email). */
  async function notifyCustomer(
    customer: { id: string; name: string; surname?: string | null; phone?: string | null; email?: string | null; balanceCents: number },
    title: string,
    body: string,
  ): Promise<void> {
    const recipient: any = { name: `${customer.name} ${customer.surname ?? ''}`.trim() };
    if (customer.phone) recipient.phone = customer.phone;
    if (customer.email) recipient.email = customer.email;
    if (!recipient.phone && !recipient.email) return; // nessun contatto, skip
    await notifier.notify(recipient, { title, body, severity: 'info' }, `credit:${customer.id}:${title}`).catch(() => {});
  }

  // ---- Anagrafica: inserimento manuale del cliente creditore in cassa ----
  const createCustomerSchema = z.object({
    name: z.string().min(1),
    surname: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    notes: z.string().optional(),
    limitCents: z.number().int().nonnegative().default(0),
    openingBalanceCents: z.number().int().nonnegative().default(0), // debito pregresso opzionale
  });

  app.post('/api/v1/credit/customers', devAuth, requireRoles(...CASSA_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = createCustomerSchema.parse(req.body);

    const customer = await prisma.$transaction(async (tx: Tx) => {
      const c = await tx.customer.create({
        data: {
          venueId: user.venueId,
          name: body.name,
          surname: body.surname,
          phone: body.phone,
          email: body.email,
          notes: body.notes,
          limitCents: body.limitCents,
          balanceCents: body.openingBalanceCents,
        },
      });
      if (body.openingBalanceCents > 0) {
        await tx.creditTransaction.create({
          data: {
            customerId: c.id,
            type: 'CHARGE',
            amountCents: body.openingBalanceCents,
            balanceAfterCents: body.openingBalanceCents,
            note: 'Saldo iniziale (inserimento manuale)',
            createdBy: user.userId,
          },
        });
      }
      return c;
    });

    res.status(201).json(customer);
  });

  // ---- Elenco clienti con saldo (opz. solo con debito) ----
  app.get('/api/v1/credit/customers', devAuth, requireRoles(...CASSA_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const onlyDebtors = req.query.debtors === 'true';
    const search = (req.query.q as string | undefined)?.trim();

    const customers = await prisma.customer.findMany({
      where: {
        venueId: user.venueId,
        active: true,
        ...(onlyDebtors ? { balanceCents: { gt: 0 } } : {}),
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: [{ balanceCents: 'desc' }, { name: 'asc' }],
    });

    const totalOutstanding = customers.reduce((s, c) => s + Math.max(0, c.balanceCents), 0);
    res.json({ customers, totalOutstandingCents: totalOutstanding });
  });

  // ---- Dettaglio + estratto conto ----
  app.get('/api/v1/credit/customers/:id', devAuth, requireRoles(...CASSA_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const id = req.params.id as string;
    const customer = await prisma.customer.findFirst({ where: { id, venueId: user.venueId } });
    if (!customer) {
      res.status(404).json({ error: 'Cliente non trovato' });
      return;
    }
    const transactions = await prisma.creditTransaction.findMany({
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ customer, transactions });
  });

  // ---- Movimento credito: addebito / pagamento / rettifica ----
  const txSchema = z.object({
    type: z.enum(['CHARGE', 'PAYMENT', 'ADJUST']),
    amountCents: z.number().int(), // ADJUST può essere negativo
    orderId: z.string().optional(),
    method: z.enum(['CASH', 'POS']).optional(),
    note: z.string().optional(),
  });

  app.post('/api/v1/credit/customers/:id/transactions', devAuth, requireRoles(...CASSA_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const id = req.params.id as string;
    const body = txSchema.parse(req.body);

    try {
      const result = await prisma.$transaction(async (tx: Tx) => {
        const customer = await tx.customer.findFirst({ where: { id, venueId: user.venueId } });
        if (!customer) throw new HttpError(404, 'Cliente non trovato');

        const applied = applyTransaction({
          currentBalanceCents: customer.balanceCents,
          limitCents: customer.limitCents,
          type: body.type as CreditTxType,
          amountCents: body.amountCents,
        });
        if (!applied.ok) throw new HttpError(409, applied.error ?? 'Operazione non consentita');

        const transaction = await tx.creditTransaction.create({
          data: {
            customerId: id,
            type: body.type,
            amountCents: Math.abs(body.amountCents),
            balanceAfterCents: applied.newBalanceCents,
            orderId: body.orderId,
            method: body.method,
            note: body.note,
            createdBy: user.userId,
          },
        });
        const updated = await tx.customer.update({
          where: { id },
          data: { balanceCents: applied.newBalanceCents },
        });
        return { customer: updated, transaction };
      });
      // Invia notifica al cliente: totale aggiornato dopo ogni movimento
      const c = result.customer as any;
      const fullName = `${c.name} ${c.surname ?? ''}`.trim();
      const verb = body.type === 'CHARGE' ? 'Nuova consumazione a credito' : body.type === 'PAYMENT' ? 'Pagamento ricevuto' : 'Rettifica saldo';
      await notifyCustomer(c, verb, `${verb}: ${body.type === 'CHARGE' ? '+' : '−'}${fmtEuroCents(body.amountCents)}. Nuovo saldo: ${fmtEuroCents(c.balanceCents)}. — La Piazzetta`);
      res.status(201).json(result);
    } catch (e) {
      if (e instanceof HttpError) {
        res.status(e.status).json({ error: e.message });
        return;
      }
      throw e;
    }
  });

  // ---- Aggiorna anagrafica / limite / disattiva ----
  const updateSchema = z.object({
    name: z.string().min(1).optional(),
    surname: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    notes: z.string().optional(),
    limitCents: z.number().int().nonnegative().optional(),
    active: z.boolean().optional(),
  });

  app.patch('/api/v1/credit/customers/:id', devAuth, requireRoles(...CASSA_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const id = req.params.id as string;
    const body = updateSchema.parse(req.body);
    const existing = await prisma.customer.findFirst({ where: { id, venueId: user.venueId } });
    if (!existing) {
      res.status(404).json({ error: 'Cliente non trovato' });
      return;
    }
    const updated = await prisma.customer.update({ where: { id }, data: body });
    res.json(updated);
  });

  // ---- Endpoint staff (BARMAN/WAITER): registra consumazione a credito ----
  // Crea o trova il cliente per telefono, addebita l'importo in una sola chiamata.
  // Il fido viene controllato: se il cliente ha un limite e lo supera, rifiuta.
  const staffChargeSchema = z.object({
    name: z.string().min(1, 'Nome obbligatorio'),
    surname: z.string().optional(),
    phone: z.string().min(1, 'Telefono obbligatorio per il credito'),
    amountCents: z.number().int().positive('Importo deve essere positivo'),
    note: z.string().optional(),
    orderId: z.string().optional(),
  });

  app.post('/api/v1/credit/staff-charge', devAuth, requireRoles(...STAFF_CREDIT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = staffChargeSchema.parse(req.body);

    try {
      const result = await prisma.$transaction(async (tx: Tx) => {
        // Cerca cliente per telefono (se esiste), altrimenti lo crea
        let customer = await tx.customer.findFirst({
          where: { venueId: user.venueId, phone: body.phone },
        });
        if (!customer) {
          customer = await tx.customer.create({
            data: {
              venueId: user.venueId,
              name: body.name,
              surname: body.surname,
              phone: body.phone,
              notes: `Cliente registrato da ${user.userId} (${new Date().toISOString().slice(0, 10)})`,
            },
          });
        }

        // Applica l'addebito con controllo fido
        const applied = applyTransaction({
          currentBalanceCents: customer.balanceCents,
          limitCents: customer.limitCents,
          type: 'CHARGE',
          amountCents: body.amountCents,
        });
        if (!applied.ok) {
          throw new HttpError(409, applied.error ?? 'Operazione non consentita');
        }

        const transaction = await tx.creditTransaction.create({
          data: {
            customerId: customer.id,
            type: 'CHARGE',
            amountCents: body.amountCents,
            balanceAfterCents: applied.newBalanceCents,
            orderId: body.orderId,
            note: body.note ?? `Consumazione a credito registrata da ${user.userId}`,
            createdBy: user.userId,
          },
        });
        const updated = await tx.customer.update({
          where: { id: customer.id },
          data: { balanceCents: applied.newBalanceCents },
        });
        return { customer: updated, transaction };
      });
      // Invia notifica al cliente: totale aggiornato dopo consumazione a credito
      const c = result.customer as any;
      await notifyCustomer(c, 'Consumazione a credito', `Nuova consumazione a credito: +${fmtEuroCents(body.amountCents)}. Nuovo saldo: ${fmtEuroCents(c.balanceCents)}. — La Piazzetta`);
      res.status(201).json(result);
    } catch (e) {
      if (e instanceof HttpError) {
        res.status(e.status).json({ error: e.message });
        return;
      }
      throw e;
    }
  });

  // ---- Ricerca clienti per telefono (per staff sala/banco) ----
  app.get('/api/v1/credit/lookup', devAuth, requireRoles(...STAFF_CREDIT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const phone = (req.query.phone as string | undefined)?.trim();
    if (!phone) {
      res.status(400).json({ error: 'Parametro phone obbligatorio' });
      return;
    }
    const customer = await prisma.customer.findFirst({
      where: { venueId: user.venueId, phone },
    });
    res.json({ customer });
  });

  // ---- Reminder manuale: owner invia saldo al cliente via WhatsApp o email ----
  app.post('/api/v1/credit/customers/:id/remind', devAuth, requireRoles(...CASSA_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const customer = await prisma.customer.findFirst({ where: { id: req.params.id, venueId: user.venueId } });
    if (!customer) { res.status(404).json({ error: 'Cliente non trovato' }); return; }
    if (customer.balanceCents <= 0) { res.status(400).json({ error: 'Saldo non negativo, nessun debito da ricordare' }); return; }

    const fullName = `${customer.name} ${customer.surname ?? ''}`.trim();
    const body = `Gentile ${fullName}, le ricordiamo che il suo saldo a credito presso La Piazzetta è di ${fmtEuroCents(customer.balanceCents)}. La invitiamo a regolarizzare la posizione. Grazie! — La Piazzetta`;
    const channel = (req.body as { channel?: string })?.channel ?? 'auto'; // auto | whatsapp | email

    const recipient: any = { name: fullName };
    if (channel === 'whatsapp' || channel === 'auto') recipient.phone = customer.phone;
    if (channel === 'email' || channel === 'auto') recipient.email = customer.email;

    const result = await notifier.notify(recipient, {
      title: 'Promemoria saldo a credito',
      body,
      severity: 'warning',
    }, `credit-reminder:${customer.id}:${new Date().toISOString().slice(0, 10)}`);

    res.json({ ok: result.outcome === 'SENT', channel: result.channel, error: result.error });
  });
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function fmtEuroCents(cents: number): string {
  return '€ ' + (cents / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
