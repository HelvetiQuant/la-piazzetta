/**
 * Rotte AI: upsell, generazione contenuti marketing e riordino predittivo
 * (previsione consumi → proposta d'acquisto). Coerenti con lo stile degli altri
 * moduli: auth dev + RBAC via `deps`, validazione Zod, nessun accoppiamento
 * diretto — usano l'`AiService` condiviso.
 */

import type { Express, Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { currentUser, type RouteDeps } from '../http';
import { getAiService, AiDisabledError, AiBudgetExceededError, type AiService } from './ai.service';
import { computeReorder } from '../suppliers/reorder.logic';
import { forecastTargetLevel } from './ai.logic';

const AI_ROLES = ['OWNER', 'MANAGER'];

/** Gestione uniforme degli errori applicativi dell'AI. */
function handleAiError(err: unknown, res: Response): boolean {
  if (err instanceof AiDisabledError) {
    res.status(503).json({ error: err.message, aiEnabled: false });
    return true;
  }
  if (err instanceof AiBudgetExceededError) {
    res.status(429).json({ error: err.message });
    return true;
  }
  return false;
}

export function registerAiRoutes(app: Express, prisma: PrismaClient, deps: RouteDeps, ai: AiService = getAiService()): void {
  const { devAuth, requireRoles } = deps;

  // ---- Stato del servizio (per la dashboard / paywall) ----
  app.get('/api/v1/ai/status', devAuth, async (_req: Request, res: Response) => {
    res.json({ enabled: ai.isEnabled(), budgetSpentCents: ai.budgetSpentCents() });
  });

  // ---- Upsell su un carrello ----
  const upsellSchema = z.object({
    items: z.array(z.object({ productId: z.string(), quantity: z.number().int().positive() })).min(1),
  });

  app.post('/api/v1/ai/upsell', devAuth, requireRoles('OWNER', 'MANAGER', 'WAITER'), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = upsellSchema.parse(req.body);
    const [cartProducts, catalog] = await Promise.all([
      prisma.product.findMany({ where: { id: { in: body.items.map((i) => i.productId) }, venueId: user.venueId } }),
      prisma.product.findMany({ where: { venueId: user.venueId }, select: { code: true, name: true, category: true, priceCents: true } }),
    ]);
    const cart = body.items.map((i) => {
      const p = cartProducts.find((x) => x.id === i.productId);
      return { code: p?.code, name: p?.name, category: p?.category, quantity: i.quantity };
    });
    try {
      const r = await ai.suggestUpsell({ cart, catalog });
      res.json({ suggestions: r.data?.suggestions ?? [], provider: r.provider, cached: r.cached });
    } catch (err) {
      if (!handleAiError(err, res)) throw err;
    }
  });

  // ---- Marketing copy ----
  const marketingSchema = z.object({
    topic: z.string().min(1),
    tone: z.string().default('amichevole'),
    channels: z.array(z.string()).default(['instagram', 'email']),
  });

  app.post('/api/v1/ai/marketing-copy', devAuth, requireRoles(...AI_ROLES), async (req: Request, res: Response) => {
    const body = marketingSchema.parse(req.body);
    try {
      const r = await ai.marketingCopy(body);
      res.json({ variants: r.data?.variants ?? [], provider: r.provider });
    } catch (err) {
      if (!handleAiError(err, res)) throw err;
    }
  });

  // ---- Riordino predittivo: forecast consumi -> proposte d'acquisto ----
  const forecastSchema = z.object({
    windowDays: z.number().int().positive().max(180).default(28),
    horizonDays: z.number().int().positive().max(30).default(7),
  });

  app.post('/api/v1/suppliers/reorder-proposals/ai', devAuth, requireRoles(...AI_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { windowDays, horizonDays } = forecastSchema.parse(req.body);

    const products = await prisma.product.findMany({
      where: { venueId: user.venueId, stock: { isNot: null } },
      include: { stock: true, listings: { include: { supplier: true } } },
    });
    if (products.length === 0) {
      res.json({ proposals: [], unassigned: [], aiApplied: false });
      return;
    }

    // Storico consumi (movimenti SALE) per prodotto e per giorno, ultimi N giorni.
    const since = new Date(Date.now() - windowDays * 24 * 3600 * 1000);
    const movements = await prisma.stockMovement.findMany({
      where: { type: 'SALE', createdAt: { gte: since }, product: { venueId: user.venueId } },
      select: { productId: true, qtyDelta: true, createdAt: true },
    });
    const history: Record<string, number[]> = {};
    const perDay: Record<string, Map<string, number>> = {};
    for (const m of movements) {
      const day = m.createdAt.toISOString().slice(0, 10);
      (perDay[m.productId] ??= new Map()).set(day, (perDay[m.productId].get(day) ?? 0) + Math.abs(m.qtyDelta));
    }
    for (const [pid, days] of Object.entries(perDay)) history[pid] = Array.from(days.values());

    // Forecast AI (con fallback: se disabilitato, media mobile locale).
    let forecast: Record<string, number> = {};
    let aiApplied = false;
    try {
      const r = await ai.demandForecast({ history, horizonDays });
      for (const f of r.data?.forecast ?? []) {
        if (Number.isFinite(f.dailyUnits) && f.dailyUnits >= 0) forecast[f.productId] = f.dailyUnits;
      }
      aiApplied = true;
    } catch (err) {
      if (handleAiError(err, res)) return; // budget/altro errore applicativo → risposta già inviata
      throw err;
    }

    const safetyDays = 3;
    type Line = { productId: string; name: string; unit: string; quantity: number; reorderLevel: number; targetLevel: number; forecastDailyUnits: number; packSize: number; packs: number; orderedBase: number; packPriceCents: number; lineCostCents: number };
    const bySupplier = new Map<string, { supplierId: string; supplierName: string; lines: Line[]; totalCents: number }>();
    const unassigned: { productId: string; name: string; deficitBase: number }[] = [];

    for (const p of products) {
      const stock = p.stock!;
      const listings = p.listings.filter((l) => l.supplier.active);
      const chosen = listings.find((l) => l.preferred) ?? listings.slice().sort((a, b) => a.packPriceCents / Math.max(1, a.packSize) - b.packPriceCents / Math.max(1, b.packSize))[0];
      const daily = forecast[p.id] ?? 0;

      // Il forecast ALZA il target del riordino quando la domanda prevista lo supera.
      const staticTarget = stock.parLevel > 0 ? stock.parLevel : stock.reorderLevel;
      const dynamicTarget = forecastTargetLevel(daily, chosen?.leadTimeDays ?? 2, safetyDays, staticTarget);

      const sug = computeReorder({
        quantity: stock.quantity,
        reorderLevel: stock.reorderLevel,
        parLevel: dynamicTarget, // target guidato dalla previsione
        packSize: chosen?.packSize ?? 1,
      });
      if (!sug.needed) continue;
      if (!chosen) {
        unassigned.push({ productId: p.id, name: p.name, deficitBase: sug.deficitBase });
        continue;
      }

      const lineCost = sug.packs * chosen.packPriceCents;
      const g = bySupplier.get(chosen.supplierId) ?? { supplierId: chosen.supplierId, supplierName: chosen.supplier.name, lines: [], totalCents: 0 };
      g.lines.push({
        productId: p.id, name: p.name, unit: p.unit, quantity: stock.quantity, reorderLevel: stock.reorderLevel,
        targetLevel: sug.targetLevel, forecastDailyUnits: daily, packSize: sug.packSize, packs: sug.packs,
        orderedBase: sug.orderedBase, packPriceCents: chosen.packPriceCents, lineCostCents: lineCost,
      });
      g.totalCents += lineCost;
      bySupplier.set(chosen.supplierId, g);
    }

    res.json({
      aiApplied,
      horizonDays,
      windowDays,
      proposals: Array.from(bySupplier.values()).sort((a, b) => b.totalCents - a.totalCents),
      unassigned,
    });
  });
}
