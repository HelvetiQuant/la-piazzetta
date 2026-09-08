/**
 * Dashboard metrics — KPI singoli e aggregati per la dashboard proprietario.
 *
 * Endpoint:
 *  GET /api/v1/stats/dashboard?from=&to=&range=today|week|month
 *
 * Ritorna:
 *  - kpis: ricavi totali, numero ordini, scontrino medio, coperti, tempo medio consegna
 *  - revenueByDay: serie temporale ricavi per giorno (grafico)
 *  - ordersByHour: distribuzione ordini per ora del giorno (heatmap/bar)
 *  - topProducts: top 10 prodotti per ricavo e per quantità
 *  - stationBreakdown: ricavi e tempi per BAR vs TAVOLA_CALDA
 *  - paymentStatus: breakdown ordini per stato (SENT/READY/SERVED/PAID)
 */

import type { Express, Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { currentUser, type RouteDeps } from '../http.js';

const rangeSchema = z.object({
  range: z.enum(['today', 'yesterday', 'week', 'month', 'custom']).default('today'),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

function rangeToDates(range: string, from?: string, to?: string): { from: Date; to: Date } {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (range) {
    case 'today':
      return { from: todayStart, to: now };
    case 'yesterday': {
      const yStart = new Date(todayStart.getTime() - 24 * 3600 * 1000);
      return { from: yStart, to: todayStart };
    }
    case 'week': {
      const weekStart = new Date(todayStart.getTime() - 7 * 24 * 3600 * 1000);
      return { from: weekStart, to: now };
    }
    case 'month': {
      const monthStart = new Date(todayStart.getTime() - 30 * 24 * 3600 * 1000);
      return { from: monthStart, to: now };
    }
    case 'custom':
      return { from: new Date(from!), to: new Date(to!) };
    default:
      return { from: todayStart, to: now };
  }
}

export function registerDashboardRoutes(app: Express, prisma: PrismaClient, deps: RouteDeps): void {
  const { devAuth, requireRoles } = deps;

  app.get('/api/v1/stats/dashboard', devAuth, requireRoles('OWNER', 'MANAGER'), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const q = rangeSchema.parse(req.query);
    const { from, to } = rangeToDates(q.range, q.from, q.to);

    // Tutti gli ordini nel range
    const orders = await prisma.order.findMany({
      where: {
        session: { table: { venueId: user.venueId } },
        placedAt: { gte: from, lte: to },
      },
      include: {
        items: { select: { productId: true, product: { select: { name: true } }, station: true, quantity: true, unitCents: true, status: true } },
        session: { select: { guests: true } },
      },
      orderBy: { placedAt: 'asc' },
    });

    // --- KPI singoli ---
    const totalRevenueCents = orders.reduce((s, o) => s + o.totalCents, 0);
    const paidOrders = orders.filter((o) => o.status === 'PAID');
    const paidRevenueCents = paidOrders.reduce((s, o) => s + o.totalCents, 0);
    const totalOrders = orders.length;
    const avgTicketCents = totalOrders > 0 ? Math.round(totalRevenueCents / totalOrders) : 0;
    const totalGuests = orders.reduce((s, o) => s + (o.session?.guests ?? 0), 0);

    // Tempo medio consegna (placedAt -> servedAt) per ordini serviti
    const servedOrders = orders.filter((o) => o.servedAt && o.placedAt);
    const avgDeliverySec = servedOrders.length > 0
      ? Math.round(servedOrders.reduce((s, o) => s + (o.servedAt!.getTime() - o.placedAt.getTime()) / 1000, 0) / servedOrders.length)
      : 0;

    // --- Revenue by day ---
    const revenueByDayMap = new Map<string, number>();
    for (const o of orders) {
      const day = o.placedAt.toISOString().slice(0, 10);
      revenueByDayMap.set(day, (revenueByDayMap.get(day) ?? 0) + o.totalCents);
    }
    const revenueByDay = Array.from(revenueByDayMap.entries())
      .map(([date, cents]) => ({ date, cents }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // --- Orders by hour ---
    const ordersByHour = new Array(24).fill(0);
    for (const o of orders) {
      ordersByHour[o.placedAt.getHours()]++;
    }

    // --- Top products (by revenue and by quantity) ---
    const productAgg = new Map<string, { name: string; quantity: number; revenueCents: number; station: string }>();
    for (const o of orders) {
      for (const it of o.items) {
        const key = it.productId;
        const existing = productAgg.get(key) ?? { name: it.product.name, quantity: 0, revenueCents: 0, station: it.station };
        existing.quantity += it.quantity;
        existing.revenueCents += it.quantity * it.unitCents;
        productAgg.set(key, existing);
      }
    }
    const topByRevenue = Array.from(productAgg.values())
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .slice(0, 10);
    const topByQuantity = Array.from(productAgg.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    // --- Station breakdown ---
    const stationAgg = new Map<string, { revenueCents: number; itemCount: number; orderCount: number }>();
    for (const o of orders) {
      const stationsInOrder = new Set<string>();
      for (const it of o.items) {
        stationsInOrder.add(it.station);
        const s = stationAgg.get(it.station) ?? { revenueCents: 0, itemCount: 0, orderCount: 0 };
        s.revenueCents += it.quantity * it.unitCents;
        s.itemCount += it.quantity;
        stationAgg.set(it.station, s);
      }
      for (const st of stationsInOrder) {
        const s = stationAgg.get(st)!;
        s.orderCount++;
      }
    }
    const stationBreakdown = Array.from(stationAgg.entries()).map(([station, v]) => ({ station, ...v }));

    // --- Payment status breakdown ---
    const statusAgg = new Map<string, number>();
    for (const o of orders) {
      statusAgg.set(o.status, (statusAgg.get(o.status) ?? 0) + 1);
    }
    const paymentStatus = Array.from(statusAgg.entries()).map(([status, count]) => ({ status, count }));

    // --- Comparison with previous period (delta %) ---
    const prevRangeMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - prevRangeMs);
    const prevOrders = await prisma.order.findMany({
      where: {
        session: { table: { venueId: user.venueId } },
        placedAt: { gte: prevFrom, lt: from },
      },
      select: { totalCents: true, session: { select: { guests: true } } },
    });
    const prevRevenue = prevOrders.reduce((s, o) => s + o.totalCents, 0);
    const prevOrderCount = prevOrders.length;
    const prevGuests = prevOrders.reduce((s, o) => s + (o.session?.guests ?? 0), 0);

    const revenueDeltaPct = prevRevenue > 0 ? Math.round(((totalRevenueCents - prevRevenue) / prevRevenue) * 100) : 0;
    const ordersDeltaPct = prevOrderCount > 0 ? Math.round(((totalOrders - prevOrderCount) / prevOrderCount) * 100) : 0;
    const guestsDeltaPct = prevGuests > 0 ? Math.round(((totalGuests - prevGuests) / prevGuests) * 100) : 0;

    res.json({
      range: { from: from.toISOString(), to: to.toISOString(), label: q.range },
      kpis: {
        totalRevenueCents,
        paidRevenueCents,
        totalOrders,
        avgTicketCents,
        totalGuests,
        avgDeliverySec,
        revenueDeltaPct,
        ordersDeltaPct,
        guestsDeltaPct,
      },
      revenueByDay,
      ordersByHour: ordersByHour.map((count, hour) => ({ hour, count })),
      topProducts: { byRevenue: topByRevenue, byQuantity: topByQuantity },
      stationBreakdown,
      paymentStatus,
    });
  });
}
