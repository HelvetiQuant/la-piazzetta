/**
 * Strumenti dell'assistente owner: ogni funzione interroga Prisma (o i service
 * di dominio) e restituisce un JSON compatto da re-iniettare nel transcript.
 * I nomi corrispondono a TOOL_DEFS in assistant.logic.ts — contratto stabile.
 */

import type { PrismaClient } from '@prisma/client';
import { generateAiPost } from '../../marketing/marketing.service.js';

type Args = Record<string, unknown>;

interface Ctx {
  prisma: PrismaClient;
  venueId: string;
  userId: string;
  venueName: string;
}

const EUR = (cents: number) => `€${(cents / 100).toFixed(2)}`;

function dayRange(iso: string): { gte: Date; lt: Date } {
  const gte = new Date(`${iso}T00:00:00.000Z`);
  const lt = new Date(gte.getTime() + 24 * 3600 * 1000);
  return { gte, lt };
}

// ---------- sales_report ----------
async function salesReport(ctx: Ctx, args: Args) {
  const from = String(args.from ?? new Date().toISOString().slice(0, 10));
  const to = String(args.to ?? from);
  const { gte } = dayRange(from);
  const { lt } = dayRange(to);
  const payments = await ctx.prisma.payment.findMany({
    where: { venueId: ctx.venueId, createdAt: { gte, lt } },
    select: { method: true, amountCents: true, tipCents: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const byDay: Record<string, { total: number; count: number }> = {};
  const byMethod: Record<string, number> = {};
  let total = 0;
  let tips = 0;
  for (const p of payments) {
    const day = p.createdAt.toISOString().slice(0, 10);
    const d = (byDay[day] ??= { total: 0, count: 0 });
    d.total += p.amountCents;
    d.count += 1;
    byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amountCents;
    total += p.amountCents;
    tips += p.tipCents;
  }
  return {
    period: { from, to },
    totalCents: total,
    totalFormatted: EUR(total),
    transactions: payments.length,
    tipsFormatted: EUR(tips),
    byDay: Object.fromEntries(Object.entries(byDay).map(([k, v]) => [k, { total: EUR(v.total), count: v.count }])),
    byMethod: Object.fromEntries(Object.entries(byMethod).map(([k, v]) => [k, EUR(v)])),
  };
}

// ---------- staff_availability ----------
async function staffAvailability(ctx: Ctx, args: Args) {
  const date = String(args.date ?? new Date().toISOString().slice(0, 10));
  const role = args.role ? String(args.role) : undefined;
  const fromHour = typeof args.fromHour === 'number' ? args.fromHour : undefined;
  const toHour = typeof args.toHour === 'number' ? args.toHour : undefined;
  const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0=Dom..6=Sab
  const { gte, lt } = dayRange(date);

  const users = await ctx.prisma.user.findMany({
    where: {
      venueId: ctx.venueId,
      ...(role ? { roles: { has: role } } : {}),
      NOT: { roles: { has: 'OWNER' } },
    },
    select: {
      id: true, name: true, roles: true,
      availability: { where: { dayOfWeek } },
      scheduledShifts: { where: { date: { gte, lt } } },
      shifts: { where: { startedAt: { gte, lt } } },
    },
    orderBy: { name: 'asc' },
  });

  const overlaps = (a: { startHour: number; endHour: number }) =>
    fromHour === undefined || toHour === undefined || (a.startHour < toHour && a.endHour > fromHour);

  return {
    date,
    dayOfWeek,
    filter: { role: role ?? 'tutti', fromHour, toHour },
    staff: users.map((u) => {
      const avails = u.availability.filter(overlaps);
      const scheduled = u.scheduledShifts.filter((s) => s.status !== 'CANCELLED');
      return {
        name: u.name,
        roles: u.roles,
        availability: avails.map((a) => `${a.startHour}-${a.endHour} ${a.preference}`),
        scheduled: scheduled.map((s) => `${s.startHour}-${s.endHour} ${s.station ?? ''} ${s.status}`.trim()),
        workedThatDay: u.shifts.length > 0,
        available: avails.some((a) => a.preference !== 'UNAVAILABLE'),
      };
    }),
  };
}

// ---------- inventory_status ----------
async function inventoryStatus(ctx: Ctx, args: Args) {
  const lowOnly = args.lowOnly === true;
  const items = await ctx.prisma.stockItem.findMany({
    where: { product: { venueId: ctx.venueId } },
    include: { product: { select: { name: true, code: true, unit: true } } },
    orderBy: { quantity: 'asc' },
  });
  const rows = items
    .filter((s) => !lowOnly || s.quantity <= s.reorderLevel)
    .slice(0, 60)
    .map((s) => ({
      product: s.product.name,
      code: s.product.code,
      qty: s.quantity,
      unit: s.product.unit,
      reorderLevel: s.reorderLevel,
      low: s.quantity <= s.reorderLevel,
    }));
  return { count: rows.length, lowCount: rows.filter((r) => r.low).length, items: rows };
}

// ---------- orders_summary ----------
async function ordersSummary(ctx: Ctx) {
  const [openSessions, activeOrders] = await Promise.all([
    ctx.prisma.tableSession.findMany({
      where: { venueId: ctx.venueId, status: 'OPEN' },
      include: { table: { select: { name: true, code: true } } },
    }),
    ctx.prisma.order.findMany({
      where: { venueId: ctx.venueId, status: { in: ['SENT', 'IN_PREPARATION', 'READY'] } },
      include: { items: { select: { status: true, station: true } } },
    }),
  ]);
  return {
    openTables: openSessions.map((s) => ({
      table: s.table.name ?? s.table.code,
      guests: s.guests,
      openedAt: s.createdAt,
    })),
    activeOrders: activeOrders.map((o) => ({
      id: o.id,
      status: o.status,
      pendingItems: o.items.filter((i) => i.status !== 'SERVED' && i.status !== 'CANCELLED').length,
      stations: [...new Set(o.items.map((i) => i.station))],
    })),
  };
}

// ---------- credit_report ----------
async function creditReport(ctx: Ctx) {
  const customers = await ctx.prisma.customer.findMany({
    where: { venueId: ctx.venueId, balanceCents: { gt: 0 }, active: true },
    orderBy: { balanceCents: 'desc' },
    take: 30,
  });
  const total = customers.reduce((s, c) => s + c.balanceCents, 0);
  return {
    totalOpenCredit: EUR(total),
    customersWithDebt: customers.length,
    top: customers.map((c) => ({
      name: `${c.name} ${c.surname ?? ''}`.trim(),
      balance: EUR(c.balanceCents),
      limit: c.limitCents > 0 ? EUR(c.limitCents) : null,
    })),
  };
}

// ---------- draft_marketing_post ----------
async function draftMarketingPost(ctx: Ctx, args: Args) {
  const topic = String(args.topic ?? '');
  if (!topic) return { error: 'topic mancante' };
  const channels = Array.isArray(args.channels) ? args.channels.map(String) : ['instagram'];
  const tone = String(args.tone ?? 'amichevole');

  const gen = await generateAiPost({
    topic,
    tone,
    channels,
    venueName: ctx.venueName,
  });
  if (!gen) return { error: 'generazione AI non riuscita' };

  const mediaAssetId = typeof args.mediaAssetId === 'string' ? args.mediaAssetId : undefined;
  const scheduledFor = typeof args.scheduledFor === 'string' ? new Date(`${args.scheduledFor}T12:00:00Z`) : undefined;

  const post = await ctx.prisma.socialPost.create({
    data: {
      venueId: ctx.venueId,
      caption: gen.caption,
      hashtags: gen.hashtags,
      platforms: channels,
      status: 'DRAFT',
      mediaAssetId,
      scheduledAt: scheduledFor,
      aiGenerated: true,
      aiPrompt: topic,
      createdBy: ctx.userId,
    },
  });
  return {
    draftPostId: post.id,
    caption: gen.caption,
    hashtags: gen.hashtags,
    status: 'DRAFT',
    mediaAttached: Boolean(mediaAssetId),
    note: 'Bozza creata — l\'owner la revisiona e pubblica da Marketing.',
  };
}

// ---------- schedule_instruction ----------
async function scheduleInstruction(ctx: Ctx, args: Args) {
  const triggerType = String(args.triggerType ?? 'manual');
  const description = String(args.description ?? '');
  if (!description) return { error: 'description mancante' };
  const instr = await ctx.prisma.aiInstruction.create({
    data: {
      venueId: ctx.venueId,
      userId: ctx.userId,
      triggerType,
      description,
      payload: (args.payload ?? {}) as never,
    },
  });
  return {
    instructionId: instr.id,
    triggerType,
    description,
    status: 'PENDING',
    note: triggerType === 'media_upload'
      ? 'Verrà eseguita automaticamente al prossimo upload di una foto in Marketing → Media.'
      : 'Registrata.',
  };
}

// ---------- list_pending_instructions ----------
async function listPendingInstructions(ctx: Ctx) {
  const list = await ctx.prisma.aiInstruction.findMany({
    where: { venueId: ctx.venueId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });
  return {
    count: list.length,
    instructions: list.map((i) => ({ id: i.id, trigger: i.triggerType, description: i.description, createdAt: i.createdAt })),
  };
}

/** Dispatch un tool call; errori → oggetto {error} (mai lanciare al modello). */
export async function executeTool(ctx: Ctx, name: string, args: Args): Promise<unknown> {
  try {
    switch (name) {
      case 'sales_report': return await salesReport(ctx, args);
      case 'staff_availability': return await staffAvailability(ctx, args);
      case 'inventory_status': return await inventoryStatus(ctx, args);
      case 'orders_summary': return await ordersSummary(ctx);
      case 'credit_report': return await creditReport(ctx);
      case 'draft_marketing_post': return await draftMarketingPost(ctx, args);
      case 'schedule_instruction': return await scheduleInstruction(ctx, args);
      case 'list_pending_instructions': return await listPendingInstructions(ctx);
      default: return { error: `Strumento sconosciuto: ${name}` };
    }
  } catch (err) {
    return { error: `Errore esecuzione ${name}: ${err instanceof Error ? err.message : String(err)}` };
  }
}
