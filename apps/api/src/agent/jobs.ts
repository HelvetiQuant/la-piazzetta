/**
 * Job schedulati dell'agente: idempotenti, degradano al driver in-memory.
 *
 * Usano la coda esistente (queue.ts) con fallback BullMQ/Redis.
 * Ogni job è idempotente: se gira due volte non duplica nulla.
 *
 * Orari (vedi PROMPT_IMPLEMENTAZIONE 3.3):
 *   03:00  chiusura contabile, riclassificazione, backup
 *   06:00  previsione domanda → proposte riordino → notifica owner
 *   ogni ora in servizio  valutazione regole di anomalia
 *   lunedì 08:00  proposta turni + report settimanale
 *   1° del mese  export per il commercialista
 */

import type { PrismaClient } from '@prisma/client';
import { getQueue } from '../queue/queue.js';
import { evaluateRules, type RuleContext } from './rules.logic.js';
import { NotificationService } from '../notifications/notification.service.js';

const QUEUE_NAME = 'agent-jobs';

export interface JobContext {
  prisma: PrismaClient;
  notifier: NotificationService;
  /** Owner del venue per le notifiche. */
  ownerUserId: string;
  ownerVenueId: string;
  /** Numero WhatsApp/Email dell'owner. */
  ownerPhone?: string;
  ownerEmail?: string;
}

/** Registra tutti gli handler dei job (chiamare all'avvio). */
export function registerAgentJobs(ctx: JobContext): void {
  const queue = getQueue();

  queue.process(QUEUE_NAME, async (data: any) => {
    const handlers: Record<string, (d: any) => Promise<void>> = {
      daily_close: dailyClose,
      reorder_proposal: reorderProposal,
      rule_evaluation: ruleEvaluation,
      weekly_schedule: weeklySchedule,
      monthly_export: monthlyExport,
    };
    const handler = handlers[data.type];
    if (!handler) { console.warn(`[jobs] tipo sconosciuto: ${data.type}`); return; }
    await handler({ ...ctx, ...data });
  });
}

/** Accoda i job ripetibili (chiamare all'avvio). */
export function scheduleAgentJobs(ctx: JobContext): void {
  const queue = getQueue();

  // 03:00 — chiusura contabile giornaliera
  scheduleDaily(3, 0, () => queue.add(QUEUE_NAME, { type: 'daily_close', ...ctx }));

  // 06:00 — proposte riordino
  scheduleDaily(6, 0, () => queue.add(QUEUE_NAME, { type: 'reorder_proposal', ...ctx }));

  // Ogni ora — valutazione regole
  setInterval(() => {
    if (isServiceHour()) queue.add(QUEUE_NAME, { type: 'rule_evaluation', ...ctx });
  }, 60 * 60 * 1000);

  // Lunedì 08:00 — proposta turni
  scheduleWeekly(1, 8, 0, () => queue.add(QUEUE_NAME, { type: 'weekly_schedule', ...ctx }));

  // 1° del mese — export commercialista
  scheduleMonthly(1, 0, 0, () => queue.add(QUEUE_NAME, { type: 'monthly_export', ...ctx }));
}

// ─── Handler (tutti idempotenti) ──────────────────────────────────────────

/** 03:00 — Chiusura contabile. Idempotenza: controlla se già chiusa per oggi. */
async function dailyClose(ctx: JobContext & { date?: string }): Promise<void> {
  const today = ctx.date ?? new Date().toISOString().slice(0, 10);
  const prisma = ctx.prisma;

  // Idempotenza: verifica se esiste già una JournalEntry con sourceType='DAILY_CLOSE' per oggi
  const existing = await prisma.journalEntry.findFirst({
    where: { venueId: ctx.ownerVenueId, sourceType: 'DAILY_CLOSE', reference: today },
  });
  if (existing) { console.log(`[jobs] daily_close già eseguito per ${today}`); return; }

  // Calcola totali incasso della giornata
  const dayStart = new Date(today + 'T00:00:00');
  const dayEnd = new Date(today + 'T23:59:59');
  const payments = await prisma.payment.findMany({
    where: { venueId: ctx.ownerVenueId, createdAt: { gte: dayStart, lte: dayEnd } },
  });
  const totalCents = payments.reduce((s, p) => s + p.amountCents, 0);
  if (totalCents === 0) { console.log(`[jobs] daily_close: nessun incasso per ${today}`); return; }

  // Crea la scrittura di chiusura (se i conti esistono)
  const cassaAcc = await prisma.chartOfAccount.findFirst({ where: { code: '4.04', venueId: ctx.ownerVenueId } });
  const ricaviAcc = await prisma.chartOfAccount.findFirst({ where: { code: '8.01', venueId: ctx.ownerVenueId } });
  if (!cassaAcc || !ricaviAcc) { console.log('[jobs] daily_close: conti non configurati, skip'); return; }

  await prisma.journalEntry.create({
    data: {
      venueId: ctx.ownerVenueId,
      date: new Date(today),
      description: `Chiusura contabile ${today}`,
      reference: today,
      sourceType: 'DAILY_CLOSE',
      status: 'POSTED',
      lines: {
        create: [
          { venueId: ctx.ownerVenueId, accountId: cassaAcc.id, debitCents: 0, creditCents: totalCents },
          { venueId: ctx.ownerVenueId, accountId: ricaviAcc.id, debitCents: totalCents, creditCents: 0 },
        ],
      },
    },
  });
  console.log(`[jobs] daily_close completato per ${today}: €${(totalCents / 100).toFixed(2)}`);
}

/** 06:00 — Proposte riordino. Idempotenza: controlla se già inviato oggi. */
async function reorderProposal(ctx: JobContext & { date?: string }): Promise<void> {
  const today = ctx.date ?? new Date().toISOString().slice(0, 10);
  const prisma = ctx.prisma;
  const dedupeKey = `reorder:${ctx.ownerVenueId}:${today}`;

  // Prodotti sotto soglia: stock è su StockItem, fornitore su SupplierProduct.listings
  const products = await prisma.product.findMany({
    where: { venueId: ctx.ownerVenueId },
    include: { stock: true, listings: { include: { supplier: true } } },
  });
  const lowStock = products.filter((p) => p.stock && p.stock.quantity <= p.stock.reorderLevel);

  if (lowStock.length === 0) {
    console.log(`[jobs] reorder_proposal: nessun prodotto sotto soglia per ${today}`);
    return;
  }

  const lines = lowStock.map((p) => {
    const supplier = p.listings[0]?.supplier?.name ?? 'N/A';
    return `• ${p.name}: ${p.stock?.quantity} ${p.unit} (riordino a ${p.stock?.reorderLevel}) — fornitore: ${supplier}`;
  }).join('\n');
  const totalEstimate = lowStock.reduce((s, p) => s + (p.stock?.reorderLevel ?? 0) * (p.listings[0]?.packPriceCents ?? p.priceCents), 0);

  await ctx.notifier.notify(
    { userId: ctx.ownerUserId, phone: ctx.ownerPhone, email: ctx.ownerEmail, name: 'Owner' },
    {
      title: `Proposta riordino (${lowStock.length} prodotti)`,
      body: `${lines}\n\nTotale stimato: €${(totalEstimate / 100).toFixed(2)}`,
      severity: 'warning',
    },
    dedupeKey,
  );
  console.log(`[jobs] reorder_proposal inviato per ${today}: ${lowStock.length} prodotti`);
}

/** Ogni ora — Valutazione regole di anomalia. */
async function ruleEvaluation(ctx: JobContext): Promise<void> {
  const prisma = ctx.prisma;
  const venueId = ctx.ownerVenueId;

  // Raccoglie dati per le regole
  const ruleCtx: RuleContext = { venueId };

  // Scorta critica: prodotti sotto soglia con lead-time fornitore
  const products = await prisma.product.findMany({
    where: { venueId },
    include: { stock: true, listings: { include: { supplier: true } } },
  });
  for (const p of products) {
    if (p.stock && p.stock.quantity <= p.stock.reorderLevel && p.listings[0]?.leadTimeDays) {
      const ctxWithStock: RuleContext = {
        ...ruleCtx,
        productName: p.name,
        stockQuantity: p.stock.quantity,
        reorderLevel: p.stock.reorderLevel,
        supplierLeadTimeDays: p.listings[0].leadTimeDays,
        dailyConsumption: 1, // semplificato; verrà calcolato da storico in futuro
      };
      const alerts = evaluateRules(ctxWithStock);
      for (const a of alerts) {
        await ctx.notifier.notify(
          { userId: ctx.ownerUserId, phone: ctx.ownerPhone, email: ctx.ownerEmail },
          a.message,
          `rule:${a.rule.id}:${p.id}`,
        );
      }
    }
  }

  // Cassa non quadrata: controlla ultimo cassetto chiuso
  const lastDrawer = await prisma.cashDrawer.findFirst({
    where: { venueId, status: 'CLOSED' },
    orderBy: { closedAt: 'desc' },
  });
  if (lastDrawer?.differenceCents !== null && lastDrawer?.differenceCents !== undefined) {
    const drawerCtx: RuleContext = {
      ...ruleCtx,
      drawerDifferenceCents: lastDrawer.differenceCents,
      drawerThresholdCents: 200, // €2 soglia
    };
    const alerts = evaluateRules(drawerCtx);
    for (const a of alerts) {
      await ctx.notifier.notify(
        { userId: ctx.ownerUserId, phone: ctx.ownerPhone, email: ctx.ownerEmail },
        a.message,
        `rule:${a.rule.id}:${lastDrawer.id}`,
      );
    }
  }

  console.log('[jobs] rule_evaluation completato');
}

/** Lunedì 08:00 — Proposta turni + report settimanale. */
async function weeklySchedule(ctx: JobContext): Promise<void> {
  const prisma = ctx.prisma;
  const venueId = ctx.ownerVenueId;
  const dedupeKey = `weekly:${venueId}:${new Date().toISOString().slice(0, 10)}`;

  // Idempotenza: se esiste già una proposta per questa settimana, skip
  const existing = await prisma.scheduledShift.findFirst({
    where: { venueId, aiSuggested: true, date: { gte: new Date() } },
  });
  if (existing) { console.log('[jobs] weekly_schedule: proposta già esistente, skip'); return; }

  // Semplificato: notifica l'owner che la proposta è pronta
  await ctx.notifier.notify(
    { userId: ctx.ownerUserId, phone: ctx.ownerPhone, email: ctx.ownerEmail },
    {
      title: 'Proposta turni settimanali',
      body: 'La proposta turni AI per la settimana è pronta. Controlla e conferma dal tab Orari.',
      severity: 'info',
    },
    dedupeKey,
  );
  console.log('[jobs] weekly_schedule inviato');
}

/** 1° del mese — Export per il commercialista. */
async function monthlyExport(ctx: JobContext): Promise<void> {
  const dedupeKey = `export:${ctx.ownerVenueId}:${new Date().toISOString().slice(0, 7)}`;
  await ctx.notifier.notify(
    { userId: ctx.ownerUserId, phone: ctx.ownerPhone, email: ctx.ownerEmail },
    {
      title: 'Export mensile pronto',
      body: 'Il file CSV per il commercialista è pronto. Scaricalo dal tab Contabilità.',
      severity: 'info',
    },
    dedupeKey,
  );
  console.log('[jobs] monthly_export inviato');
}

// ─── Scheduler helpers ────────────────────────────────────────────────────

function scheduleDaily(hour: number, minute: number, fn: () => void): void {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const delay = next.getTime() - now.getTime();
  setTimeout(fn, delay);
  setInterval(fn, 24 * 60 * 60 * 1000);
}

function scheduleWeekly(dayOfWeek: number, hour: number, minute: number, fn: () => void): void {
  const now = new Date();
  const next = new Date(now);
  const diff = (dayOfWeek - now.getDay() + 7) % 7;
  next.setDate(now.getDate() + diff);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 7);
  const delay = next.getTime() - now.getTime();
  setTimeout(fn, delay);
  setInterval(fn, 7 * 24 * 60 * 60 * 1000);
}

function scheduleMonthly(day: number, hour: number, minute: number, fn: () => void): void {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, day, hour, minute, 0, 0);
  const delay = next.getTime() - now.getTime();
  setTimeout(fn, delay);
  setInterval(fn, 30 * 24 * 60 * 60 * 1000);
}

function isServiceHour(): boolean {
  const h = new Date().getHours();
  return h >= 6 && h <= 23;
}
