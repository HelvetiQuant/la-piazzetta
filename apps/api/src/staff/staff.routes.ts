/**
 * Modulo stipendi e turni staff.
 *
 * Endpoint (OWNER/MANAGER):
 *  - Shifts (clock-in/out):
 *    POST   /api/v1/staff/shifts/clock-in       → apre un turno
 *    POST   /api/v1/staff/shifts/:id/clock-out  → chiude un turno
 *    GET    /api/v1/staff/shifts?from=&to=&userId= → lista turni
 *    PATCH  /api/v1/staff/shifts/:id            → modifica (break, note)
 *    DELETE /api/v1/staff/shifts/:id            → elimina turno
 *
 *  - Payroll (stipendi):
 *    POST   /api/v1/staff/payroll/calculate     → calcola stipendio da turni
 *    GET    /api/v1/staff/payroll?from=&to=&status= → lista voci stipendio
 *    PATCH  /api/v1/staff/payroll/:id           → aggiorna (bonus, deduzioni, status)
 *    GET    /api/v1/staff/payroll/summary?from=&to= → riepilogo stipendi periodo
 *
 *  - Staff:
 *    GET    /api/v1/staff                        → lista dipendenti con hourlyRate
 *    PATCH  /api/v1/staff/:userId/rate           → imposta stipendio orario
 */

import type { Express, Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { currentUser, type RouteDeps } from '../http';

const STAFF_ROLES = ['OWNER', 'MANAGER'];
const ALL_STAFF_ROLES = ['OWNER', 'MANAGER', 'WAITER', 'BARMAN', 'COOK'];

export function registerStaffRoutes(app: Express, prisma: PrismaClient, deps: RouteDeps): void {
  const { devAuth, requireRoles } = deps;

  // ---- Staff list ----
  app.get('/api/v1/staff', devAuth, requireRoles(...STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const staff = await prisma.user.findMany({
      where: { venueId: user.venueId },
      select: { id: true, email: true, name: true, roles: true, hourlyRateCents: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
    res.json(staff);
  });

  const rateSchema = z.object({ hourlyRateCents: z.number().int().min(0) });
  app.patch('/api/v1/staff/:userId/rate', devAuth, requireRoles(...STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { hourlyRateCents } = rateSchema.parse(req.body);
    const updated = await prisma.user.update({
      where: { id: req.params.userId },
      data: { hourlyRateCents },
      select: { id: true, name: true, hourlyRateCents: true },
    });
    res.json(updated);
  });

  // ---- Shifts ----
  const clockInSchema = z.object({
    userId: z.string().optional(), // opzionale: se assente, usa il proprio userId
    shiftRole: z.enum(['WAITER', 'BARMAN', 'COOK']).optional(),
    note: z.string().optional(),
  });

  app.post('/api/v1/staff/shifts/clock-in', devAuth, requireRoles(...ALL_STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = clockInSchema.parse(req.body);

    // Se il dipendente fa clock-in da solo (non owner), usa il proprio userId
    const targetUserId = (user.roles.includes('OWNER') || user.roles.includes('MANAGER'))
      ? body.userId
      : user.userId;

    if (!targetUserId) {
      res.status(400).json({ error: 'userId richiesto' });
      return;
    }

    // Verifica che non ci sia già un turno aperto
    const open = await prisma.shift.findFirst({
      where: { userId: targetUserId, venueId: user.venueId, status: 'OPEN' },
    });
    if (open) {
      res.status(400).json({ error: 'Turno già aperto per questo dipendente', shiftId: open.id });
      return;
    }

    // Determina shiftRole: se non specificato, deriva dal ruolo dell'utente
    let shiftRole = body.shiftRole;
    if (!shiftRole) {
      const targetUser = await prisma.user.findUnique({ where: { id: targetUserId }, select: { roles: true } });
      if (targetUser) {
        if (targetUser.roles.includes('COOK')) shiftRole = 'COOK';
        else if (targetUser.roles.includes('BARMAN') && !targetUser.roles.includes('WAITER')) shiftRole = 'BARMAN';
        else if (targetUser.roles.includes('WAITER') && !targetUser.roles.includes('BARMAN')) shiftRole = 'WAITER';
        // Se ha entrambi, è obbligatorio scegliere
      }
    }

    // Se l'utente ha sia WAITER che BARMAN e non ha specificato shiftRole, errore
    if (!shiftRole) {
      const targetUser = await prisma.user.findUnique({ where: { id: targetUserId }, select: { roles: true } });
      if (targetUser && targetUser.roles.includes('WAITER') && targetUser.roles.includes('BARMAN')) {
        res.status(400).json({ error: 'Seleziona il ruolo per questo turno: WAITER o BARMAN' });
        return;
      }
    }

    const shift = await prisma.shift.create({
      data: {
        userId: targetUserId,
        venueId: user.venueId,
        startedAt: new Date(),
        shiftRole,
        note: body.note,
      },
      include: { user: { select: { id: true, name: true, roles: true } } },
    });
    res.status(201).json(shift);
  });

  const clockOutSchema = z.object({
    breakMinutes: z.number().int().min(0).default(0),
    note: z.string().optional(),
  });

  app.post('/api/v1/staff/shifts/:id/clock-out', devAuth, requireRoles(...STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = clockOutSchema.parse(req.body);
    const shift = await prisma.shift.findFirst({ where: { id: req.params.id, venueId: user.venueId } });
    if (!shift) { res.status(404).json({ error: 'Turno non trovato' }); return; }
    if (shift.status === 'CLOSED') { res.status(400).json({ error: 'Turno già chiuso' }); return; }
    const updated = await prisma.shift.update({
      where: { id: shift.id },
      data: { endedAt: new Date(), breakMinutes: body.breakMinutes, note: body.note, status: 'CLOSED' },
    });
    res.json(updated);
  });

  // ---- Dipendente: il proprio turno attivo ----
  app.get('/api/v1/staff/me/shift', devAuth, requireRoles(...ALL_STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const shift = await prisma.shift.findFirst({
      where: { userId: user.userId, venueId: user.venueId, status: 'OPEN' },
      include: { user: { select: { id: true, name: true, roles: true } } },
    });
    res.json(shift);
  });

  // ---- Dipendente: clock-out self-service ----
  app.post('/api/v1/staff/me/shift/clock-out', devAuth, requireRoles(...ALL_STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = clockOutSchema.parse(req.body);
    const shift = await prisma.shift.findFirst({
      where: { userId: user.userId, venueId: user.venueId, status: 'OPEN' },
    });
    if (!shift) { res.status(404).json({ error: 'Nessun turno aperto' }); return; }
    const updated = await prisma.shift.update({
      where: { id: shift.id },
      data: { endedAt: new Date(), breakMinutes: body.breakMinutes, note: body.note, status: 'CLOSED' },
    });
    res.json(updated);
  });

  const shiftQuerySchema = z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    userId: z.string().optional(),
    status: z.enum(['OPEN', 'CLOSED']).optional(),
  });

  app.get('/api/v1/staff/shifts', devAuth, requireRoles(...STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const q = shiftQuerySchema.parse(req.query);
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 7 * 24 * 3600 * 1000);
    const shifts = await prisma.shift.findMany({
      where: {
        venueId: user.venueId,
        ...(q.userId ? { userId: q.userId } : {}),
        ...(q.status ? { status: q.status } : {}),
        startedAt: { gte: from, lte: to },
      },
      include: { user: { select: { name: true, email: true, roles: true, hourlyRateCents: true } } },
      orderBy: { startedAt: 'desc' },
    });
    // Calcola ore lavorate per ogni turno chiuso
    const enriched = shifts.map((s) => {
      let hoursWorked = 0;
      if (s.endedAt) {
        const netMs = s.endedAt.getTime() - s.startedAt.getTime() - s.breakMinutes * 60 * 1000;
        hoursWorked = Math.max(0, netMs / (1000 * 60 * 60));
      }
      const payCents = Math.round(hoursWorked * s.user.hourlyRateCents);
      return { ...s, hoursWorked, payCents };
    });
    res.json(enriched);
  });

  const shiftPatchSchema = z.object({
    breakMinutes: z.number().int().min(0).optional(),
    note: z.string().optional(),
    startedAt: z.string().datetime().optional(),
    endedAt: z.string().datetime().optional(),
  });

  app.patch('/api/v1/staff/shifts/:id', devAuth, requireRoles(...STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = shiftPatchSchema.parse(req.body);
    const shift = await prisma.shift.findFirst({ where: { id: req.params.id, venueId: user.venueId } });
    if (!shift) { res.status(404).json({ error: 'Turno non trovato' }); return; }
    const updated = await prisma.shift.update({
      where: { id: shift.id },
      data: {
        ...(body.breakMinutes !== undefined ? { breakMinutes: body.breakMinutes } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
        ...(body.startedAt ? { startedAt: new Date(body.startedAt) } : {}),
        ...(body.endedAt ? { endedAt: new Date(body.endedAt), status: 'CLOSED' } : {}),
      },
    });
    res.json(updated);
  });

  app.delete('/api/v1/staff/shifts/:id', devAuth, requireRoles(...STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const shift = await prisma.shift.findFirst({ where: { id: req.params.id, venueId: user.venueId } });
    if (!shift) { res.status(404).json({ error: 'Turno non trovato' }); return; }
    await prisma.shift.delete({ where: { id: shift.id } });
    res.json({ ok: true });
  });

  // ---- Payroll ----
  const calculateSchema = z.object({
    userId: z.string().min(1),
    periodStart: z.string().datetime(),
    periodEnd: z.string().datetime(),
    bonusCents: z.number().int().default(0),
    deductionCents: z.number().int().default(0),
    note: z.string().optional(),
  });

  app.post('/api/v1/staff/payroll/calculate', devAuth, requireRoles(...STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = calculateSchema.parse(req.body);
    const periodStart = new Date(body.periodStart);
    const periodEnd = new Date(body.periodEnd);

    const u = await prisma.user.findFirst({ where: { id: body.userId, venueId: user.venueId } });
    if (!u) { res.status(404).json({ error: 'Dipendente non trovato' }); return; }

    // Somma ore dai turni chiusi nel periodo
    const shifts = await prisma.shift.findMany({
      where: { userId: body.userId, venueId: user.venueId, status: 'CLOSED', startedAt: { gte: periodStart, lte: periodEnd } },
    });
    let totalHours = 0;
    for (const s of shifts) {
      if (s.endedAt) {
        const netMs = s.endedAt.getTime() - s.startedAt.getTime() - s.breakMinutes * 60 * 1000;
        totalHours += Math.max(0, netMs / (1000 * 60 * 60));
      }
    }
    totalHours = Math.round(totalHours * 100) / 100;

    const hourlyRateCents = u.hourlyRateCents;
    const basePayCents = Math.round(totalHours * hourlyRateCents);
    const netPayCents = basePayCents + body.bonusCents - body.deductionCents;

    // Upsert: se esiste già una voce per lo stesso periodo, sovrascrive
    const existing = await prisma.payrollEntry.findFirst({
      where: { userId: body.userId, venueId: user.venueId, periodStart, periodEnd },
    });
    const entry = await prisma.payrollEntry.upsert({
      where: { id: existing?.id ?? '__nonexistent__' },
      create: {
        userId: body.userId, venueId: user.venueId, periodStart, periodEnd,
        totalHours, hourlyRateCents, basePayCents,
        bonusCents: body.bonusCents, deductionCents: body.deductionCents, netPayCents,
        note: body.note,
      },
      update: {
        totalHours, hourlyRateCents, basePayCents,
        bonusCents: body.bonusCents, deductionCents: body.deductionCents, netPayCents,
        note: body.note,
      },
    });
    res.json(entry);
  });

  const payrollQuerySchema = z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    status: z.enum(['DRAFT', 'APPROVED', 'PAID']).optional(),
  });

  app.get('/api/v1/staff/payroll', devAuth, requireRoles(...STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const q = payrollQuerySchema.parse(req.query);
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * 24 * 3600 * 1000);
    const entries = await prisma.payrollEntry.findMany({
      where: {
        venueId: user.venueId,
        ...(q.status ? { status: q.status } : {}),
        periodStart: { gte: from, lte: to },
      },
      include: { user: { select: { name: true, email: true, roles: true } } },
      orderBy: { periodStart: 'desc' },
    });
    res.json(entries);
  });

  const payrollPatchSchema = z.object({
    bonusCents: z.number().int().optional(),
    deductionCents: z.number().int().optional(),
    status: z.enum(['DRAFT', 'APPROVED', 'PAID']).optional(),
    note: z.string().optional(),
  });

  app.patch('/api/v1/staff/payroll/:id', devAuth, requireRoles(...STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = payrollPatchSchema.parse(req.body);
    const entry = await prisma.payrollEntry.findFirst({ where: { id: req.params.id, venueId: user.venueId } });
    if (!entry) { res.status(404).json({ error: 'Voce stipendio non trovata' }); return; }
    const bonusCents = body.bonusCents ?? entry.bonusCents;
    const deductionCents = body.deductionCents ?? entry.deductionCents;
    const updated = await prisma.payrollEntry.update({
      where: { id: entry.id },
      data: {
        ...(body.bonusCents !== undefined ? { bonusCents } : {}),
        ...(body.deductionCents !== undefined ? { deductionCents } : {}),
        ...(body.status ? { status: body.status } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
        netPayCents: entry.basePayCents + bonusCents - deductionCents,
      },
    });
    res.json(updated);
  });

  app.get('/api/v1/staff/payroll/summary', devAuth, requireRoles(...STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const q = payrollQuerySchema.parse(req.query);
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * 24 * 3600 * 1000);
    const entries = await prisma.payrollEntry.findMany({
      where: { venueId: user.venueId, periodStart: { gte: from, lte: to } },
      include: { user: { select: { name: true } } },
    });
    const summary = {
      totalGrossCents: entries.reduce((s, e) => s + e.basePayCents + e.bonusCents, 0),
      totalNetCents: entries.reduce((s, e) => s + e.netPayCents, 0),
      totalDeductionsCents: entries.reduce((s, e) => s + e.deductionCents, 0),
      totalBonusCents: entries.reduce((s, e) => s + e.bonusCents, 0),
      totalHours: entries.reduce((s, e) => s + e.totalHours, 0),
      count: entries.length,
      byStatus: {
        DRAFT: entries.filter((e) => e.status === 'DRAFT').length,
        APPROVED: entries.filter((e) => e.status === 'APPROVED').length,
        PAID: entries.filter((e) => e.status === 'PAID').length,
      },
      byEmployee: entries.map((e) => ({
        userId: e.userId, name: e.user.name, netPayCents: e.netPayCents, hours: e.totalHours, status: e.status,
      })),
    };
    res.json(summary);
  });
}
