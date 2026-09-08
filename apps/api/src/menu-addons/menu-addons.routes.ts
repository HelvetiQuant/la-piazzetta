//
// menu-addons.routes.ts
//
// Add-on menu — consigli dell'owner da promuovere tramite lo staff.
// Lo staff vede gli add-on attivi e li propone ai clienti.
//

import type { Express, Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { RouteDeps } from '../http.js';
import { z } from 'zod';

const createAddOnSchema = z.object({
  productId: z.string(),
  title: z.string().min(1).max(100),
  staffScript: z.string().min(1).max(500), // come proporlo al cliente
  targetRoles: z.array(z.string()).optional().default(['WAITER', 'BARMAN']),
  activeFrom: z.string().datetime().optional(),
  activeTo: z.string().datetime().optional(),
  timeWindow: z.string().optional().nullable(), // es. "11:00-14:00"
  weekDays: z.array(z.number().min(1).max(7)).optional().default([1,2,3,4,5,6,7]),
  priority: z.number().min(1).max(5).optional().default(3),
  discountPct: z.number().min(0).max(100).optional().default(0),
});

const updateAddOnSchema = createAddOnSchema.partial().extend({
  status: z.enum(['ACTIVE', 'PAUSED', 'EXPIRED']).optional(),
});

export function registerMenuAddOnRoutes(app: Express, prisma: PrismaClient, deps: RouteDeps) {
  // GET /api/v1/menu-addons — lista add-on (owner vede tutti, staff vede solo attivi)
  app.get('/api/v1/menu-addons', deps.devAuth, async (req: Request, res: Response) => {
    const venueId = (req as any).devUser.venueId;
    const user = (req as any).devUser;
    const status = req.query.status as string | undefined;
    
    const where: any = { venueId };
    if (status) where.status = status;
    // Staff vede solo ACTIVE
    if (!user.roles.includes('OWNER') && !user.roles.includes('MANAGER')) {
      where.status = 'ACTIVE';
    }

    const addons = await prisma.menuAddOn.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, code: true, priceCents: true, category: true } },
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });
    res.json(addons);
  });

  // GET /api/v1/menu-addons/active — add-on attivi per lo staff ora
  app.get('/api/v1/menu-addons/active', deps.devAuth, async (req: Request, res: Response) => {
    const venueId = (req as any).devUser.venueId;
    const user = (req as any).devUser;
    const now = new Date();
    const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay(); // 1=lun, 7=dom
    const hour = now.getHours();
    const minute = now.getMinutes();
    const timeStr = `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;

    const addons = await prisma.menuAddOn.findMany({
      where: {
        venueId,
        status: 'ACTIVE',
        OR: [
          { activeFrom: null },
          { activeFrom: { lte: now } },
        ],
        AND: [
          { OR: [{ activeTo: null }, { activeTo: { gte: now } }] },
        ],
      },
      include: {
        product: { select: { id: true, name: true, code: true, priceCents: true, category: true } },
      },
      orderBy: [{ priority: 'asc' }],
    });

    // Filtra per giorno settimana, fascia oraria e ruolo utente
    const filtered = addons.filter(a => {
      const weekDays = a.weekDays as number[];
      if (!weekDays.includes(dayOfWeek)) return false;
      
      if (a.timeWindow) {
        // Parse "11:00-14:00"
        const [start, end] = a.timeWindow.split('-');
        if (start && end) {
          if (timeStr < start.trim() || timeStr > end.trim()) return false;
        }
      }

      const targetRoles = a.targetRoles as string[];
      const userRoles = user.roles;
      const hasRole = userRoles.some((r: string) => targetRoles.includes(r) || r === 'OWNER');
      if (!hasRole) return false;

      return true;
    });

    res.json(filtered);
  });

  // POST /api/v1/menu-addons — crea nuovo add-on (solo owner/manager)
  app.post('/api/v1/menu-addons', deps.devAuth, deps.requireRoles('OWNER', 'MANAGER'), async (req: Request, res: Response) => {
    const venueId = (req as any).devUser.venueId;
    const parsed = createAddOnSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation error', issues: parsed.error.issues });
      return;
    }
    const data = parsed.data;
    const addon = await prisma.menuAddOn.create({
      data: {
        venueId,
        productId: data.productId,
        title: data.title,
        staffScript: data.staffScript,
        targetRoles: data.targetRoles,
        activeFrom: data.activeFrom ? new Date(data.activeFrom) : null,
        activeTo: data.activeTo ? new Date(data.activeTo) : null,
        timeWindow: data.timeWindow || null,
        weekDays: data.weekDays,
        priority: data.priority,
        discountPct: data.discountPct,
        status: 'ACTIVE',
      },
      include: {
        product: { select: { id: true, name: true, code: true, priceCents: true, category: true } },
      },
    });
    res.status(201).json(addon);
  });

  // PATCH /api/v1/menu-addons/:id — modifica add-on
  app.patch('/api/v1/menu-addons/:id', deps.devAuth, deps.requireRoles('OWNER', 'MANAGER'), async (req: Request, res: Response) => {
    const venueId = (req as any).devUser.venueId;
    const parsed = updateAddOnSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation error', issues: parsed.error.issues });
      return;
    }
    const data = parsed.data;
    const existing = await prisma.menuAddOn.findFirst({ where: { id: req.params.id, venueId } });
    if (!existing) { res.status(404).json({ error: 'Add-on non trovato' }); return; }
    const addon = await prisma.menuAddOn.update({
      where: { id: existing.id },
      data: {
        ...(data.productId && { productId: data.productId }),
        ...(data.title && { title: data.title }),
        ...(data.staffScript && { staffScript: data.staffScript }),
        ...(data.targetRoles && { targetRoles: data.targetRoles }),
        ...(data.activeFrom !== undefined && { activeFrom: data.activeFrom ? new Date(data.activeFrom) : null }),
        ...(data.activeTo !== undefined && { activeTo: data.activeTo ? new Date(data.activeTo) : null }),
        ...(data.timeWindow !== undefined && { timeWindow: data.timeWindow || null }),
        ...(data.weekDays && { weekDays: data.weekDays }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.discountPct !== undefined && { discountPct: data.discountPct }),
        ...(data.status && { status: data.status }),
      },
      include: {
        product: { select: { id: true, name: true, code: true, priceCents: true, category: true } },
      },
    });
    res.json(addon);
  });

  // DELETE /api/v1/menu-addons/:id — elimina add-on
  app.delete('/api/v1/menu-addons/:id', deps.devAuth, deps.requireRoles('OWNER', 'MANAGER'), async (req: Request, res: Response) => {
    const venueId = (req as any).devUser.venueId;
    const existing = await prisma.menuAddOn.findFirst({ where: { id: req.params.id, venueId } });
    if (!existing) { res.status(404).json({ error: 'Add-on non trovato' }); return; }
    await prisma.menuAddOn.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  });

  // POST /api/v1/menu-addons/:id/track — registra proposta/accettazione (per statistiche)
  app.post('/api/v1/menu-addons/:id/track', deps.devAuth, async (req: Request, res: Response) => {
    const venueId = (req as any).devUser.venueId;
    const { accepted } = req.body; // true = cliente ha accettato, false = solo proposto
    const existing = await prisma.menuAddOn.findFirst({ where: { id: req.params.id, venueId } });
    if (!existing) { res.status(404).json({ error: 'Add-on non trovato' }); return; }
    const addon = await prisma.menuAddOn.update({
      where: { id: existing.id },
      data: {
        timesProposed: { increment: 1 },
        ...(accepted && { timesAccepted: { increment: 1 } }),
      },
    });
    res.json(addon);
  });
}
