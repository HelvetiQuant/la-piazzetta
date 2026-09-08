//
// staff-notes.routes.ts
//
// Note/Rules dello staff — messaggi importanti dall'owner.
// Il dipendente ha notifica lampeggiante e deve rispondere obbligatoriamente.
//

import type { Express, Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { RouteDeps } from '../http.js';
import { z } from 'zod';

const createNoteSchema = z.object({
  targetScope: z.enum(['ALL', 'DEPARTMENT', 'INDIVIDUAL']),
  targetValue: z.string().min(1), // "ALL" | "KITCHEN" | "BAR" | "WAITERS" | userId
  type: z.enum(['NOTE', 'TASK', 'WARNING', 'RULE', 'SUGGESTION']).default('NOTE'),
  priority: z.number().min(1).max(5).default(3),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  dueDate: z.string().datetime().optional(),
  requiresAck: z.boolean().default(true),
});

const respondSchema = z.object({
  text: z.string().min(1).max(1000),
});

export function registerStaffNoteRoutes(app: Express, prisma: PrismaClient, deps: RouteDeps) {
  // POST /api/v1/staff-notes — crea nota (solo owner/manager)
  app.post('/api/v1/staff-notes', deps.devAuth, deps.requireRoles('OWNER', 'MANAGER'), async (req: Request, res: Response) => {
    const venueId = (req as any).devUser.venueId;
    const senderId = (req as any).devUser.userId;
    const parsed = createNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation error', issues: parsed.error.issues });
      return;
    }
    const data = parsed.data;
    const note = await prisma.staffNote.create({
      data: {
        venueId,
        senderId,
        targetScope: data.targetScope,
        targetValue: data.targetValue,
        type: data.type,
        priority: data.priority,
        title: data.title,
        body: data.body,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        requiresAck: data.requiresAck,
      },
    });
    res.status(201).json(note);
  });

  // GET /api/v1/staff-notes — lista note (owner: tutte, staff: solo per lui)
  app.get('/api/v1/staff-notes', deps.devAuth, async (req: Request, res: Response) => {
    const venueId = (req as any).devUser.venueId;
    const user = (req as any).devUser;
    const status = req.query.status as string | undefined;

    const where: any = { venueId, status: status || 'ACTIVE' };

    // Staff vede solo note dirette a lui
    if (!user.roles.includes('OWNER') && !user.roles.includes('MANAGER')) {
      const userRoles = user.roles;
      const departments: string[] = [];
      if (userRoles.includes('COOK')) departments.push('KITCHEN');
      if (userRoles.includes('BARMAN')) departments.push('BAR');
      if (userRoles.includes('WAITER')) departments.push('WAITERS');

      where.OR = [
        { targetScope: 'ALL' },
        { targetScope: 'DEPARTMENT', targetValue: { in: departments } },
        { targetScope: 'INDIVIDUAL', targetValue: user.userId },
      ];
    }

    const notes = await prisma.staffNote.findMany({
      where,
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });
    res.json(notes);
  });

  // GET /api/v1/staff-notes/pending — note non ancora confermate dall'utente corrente
  app.get('/api/v1/staff-notes/pending', deps.devAuth, async (req: Request, res: Response) => {
    const venueId = (req as any).devUser.venueId;
    const user = (req as any).devUser;
    const userId = user.userId;
    const userRoles = user.roles;
    const departments: string[] = [];
    if (userRoles.includes('COOK')) departments.push('KITCHEN');
    if (userRoles.includes('BARMAN')) departments.push('BAR');
    if (userRoles.includes('WAITER')) departments.push('WAITERS');

    const allNotes = await prisma.staffNote.findMany({
      where: {
        venueId,
        status: 'ACTIVE',
        requiresAck: true,
        OR: [
          { targetScope: 'ALL' },
          { targetScope: 'DEPARTMENT', targetValue: { in: departments } },
          { targetScope: 'INDIVIDUAL', targetValue: userId },
        ],
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });

    // Filtra: note dove l'utente NON ha ancora confermato
    const pending = allNotes.filter(n => {
      const ackedBy = n.acknowledgedBy as string[];
      return !ackedBy.includes(userId);
    });

    res.json(pending);
  });

  // POST /api/v1/staff-notes/:id/ack — conferma ricezione (dipendente)
  app.post('/api/v1/staff-notes/:id/ack', deps.devAuth, async (req: Request, res: Response) => {
    const venueId = (req as any).devUser.venueId;
    const userId = (req as any).devUser.userId;
    const note = await prisma.staffNote.findUnique({ where: { id: req.params.id, venueId } });
    if (!note) {
      res.status(404).json({ error: 'Nota non trovata' });
      return;
    }
    const ackedBy = note.acknowledgedBy as string[];
    if (!ackedBy.includes(userId)) {
      ackedBy.push(userId);
      await prisma.staffNote.update({
        where: { id: note.id },
        data: { acknowledgedBy: ackedBy },
      });
    }
    res.json({ ok: true, acknowledgedBy: ackedBy });
  });

  // POST /api/v1/staff-notes/:id/respond — rispondi alla nota (dipendente)
  app.post('/api/v1/staff-notes/:id/respond', deps.devAuth, async (req: Request, res: Response) => {
    const venueId = (req as any).devUser.venueId;
    const userId = (req as any).devUser.userId;
    const parsed = respondSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation error', issues: parsed.error.issues });
      return;
    }
    const note = await prisma.staffNote.findUnique({ where: { id: req.params.id, venueId } });
    if (!note) {
      res.status(404).json({ error: 'Nota non trovata' });
      return;
    }
    const responses = note.responses as any[];
    responses.push({ userId, text: parsed.data.text, at: new Date().toISOString() });

    // Auto-ack quando risponde
    const ackedBy = note.acknowledgedBy as string[];
    if (!ackedBy.includes(userId)) {
      ackedBy.push(userId);
    }

    const updated = await prisma.staffNote.update({
      where: { id: note.id },
      data: { responses, acknowledgedBy: ackedBy },
    });
    res.json(updated);
  });

  // PATCH /api/v1/staff-notes/:id — modifica nota (owner)
  app.patch('/api/v1/staff-notes/:id', deps.devAuth, deps.requireRoles('OWNER', 'MANAGER'), async (req: Request, res: Response) => {
    const venueId = (req as any).devUser.venueId;
    const { title, body, priority, type, status, dueDate } = req.body;
    const note = await prisma.staffNote.update({
      where: { id: req.params.id, venueId },
      data: {
        ...(title !== undefined && { title }),
        ...(body !== undefined && { body }),
        ...(priority !== undefined && { priority }),
        ...(type !== undefined && { type }),
        ...(status !== undefined && { status }),
        ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
      },
    });
    res.json(note);
  });

  // DELETE /api/v1/staff-notes/:id — elimina nota (owner)
  app.delete('/api/v1/staff-notes/:id', deps.devAuth, deps.requireRoles('OWNER', 'MANAGER'), async (req: Request, res: Response) => {
    const venueId = (req as any).devUser.venueId;
    await prisma.staffNote.delete({ where: { id: req.params.id, venueId } });
    res.json({ ok: true });
  });
}
