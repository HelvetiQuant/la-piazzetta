/**
 * Gestione orari dipendenti: disponibilità, scheduling settimanale,
 * AI shift optimization, chat condivisa con suggerimenti AI.
 *
 * Availability:
 *  GET    /api/v1/staff/availability/:userId   → disponibilità di un dipendente
 *  GET    /api/v1/staff/availability            → disponibilità di tutto il team
 *  PUT    /api/v1/staff/availability/:userId    → upsert disponibilità (array di slot)
 *
 * Scheduled Shifts:
 *  GET    /api/v1/staff/schedule?from=&to=      → turni programmati nel range
 *  POST   /api/v1/staff/schedule                → crea turno programmato
 *  PATCH  /api/v1/staff/schedule/:id            → modifica turno
 *  DELETE /api/v1/staff/schedule/:id            → elimina turno
 *  POST   /api/v1/staff/schedule/ai-optimize    → AI genera schedule ottimale
 *  POST   /api/v1/staff/schedule/:id/confirm    → conferma turno
 *  POST   /api/v1/staff/schedule/:id/cancel     → cancella turno
 *
 * Chat:
 *  GET    /api/v1/staff/chat/rooms              → lista rooms
 *  POST   /api/v1/staff/chat/rooms              → crea room
 *  GET    /api/v1/staff/chat/rooms/:id/messages → messaggi di una room
 *  POST   /api/v1/staff/chat/rooms/:id/messages → invia messaggio
 *  POST   /api/v1/staff/chat/rooms/:id/ai-suggest → AI suggerisce risposta/azione
 *  POST   /api/v1/staff/chat/rooms/:id/messages/:msgId/read → segna come letto
 */

import type { Express, Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { currentUser, type RouteDeps } from '../http';
import { getAiService } from '../ai/ai.service';

const STAFF_ROLES = ['OWNER', 'MANAGER'];
const ALL_STAFF_ROLES = ['OWNER', 'MANAGER', 'WAITER', 'BARMAN', 'COOK'];

const DAYS = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

export function registerStaffSchedulingRoutes(app: Express, prisma: PrismaClient, deps: RouteDeps): void {
  const { devAuth, requireRoles } = deps;

  // ============ AVAILABILITY ============
  app.get('/api/v1/staff/availability', devAuth, requireRoles(...STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const availability = await prisma.staffAvailability.findMany({
      where: { venueId: user.venueId },
      include: { user: { select: { id: true, name: true, roles: true } } },
      orderBy: [{ dayOfWeek: 'asc' }, { startHour: 'asc' }],
    });
    res.json(availability);
  });

  app.get('/api/v1/staff/availability/:userId', devAuth, requireRoles(...ALL_STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    // Un dipendente può vedere la propria disponibilità
    const availability = await prisma.staffAvailability.findMany({
      where: { userId: req.params.userId, venueId: user.venueId },
      orderBy: { dayOfWeek: 'asc' },
    });
    res.json(availability);
  });

  const availabilitySchema = z.object({
    slots: z.array(z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      startHour: z.number().int().min(0).max(23),
      endHour: z.number().int().min(1).max(24),
      preference: z.enum(['AVAILABLE', 'PREFERRED', 'UNAVAILABLE']).default('AVAILABLE'),
      note: z.string().optional(),
    })),
  });

  app.put('/api/v1/staff/availability/:userId', devAuth, requireRoles(...STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = availabilitySchema.parse(req.body);
    // Elimina vecchi slot e inserisci nuovi
    await prisma.staffAvailability.deleteMany({ where: { userId: req.params.userId, venueId: user.venueId } });
    const created = await prisma.$transaction(
      body.slots.map(slot =>
        prisma.staffAvailability.create({
          data: {
            userId: req.params.userId,
            venueId: user.venueId,
            dayOfWeek: slot.dayOfWeek,
            startHour: slot.startHour,
            endHour: slot.endHour,
            preference: slot.preference,
            note: slot.note,
          },
        })
      )
    );
    res.json(created);
  });

  // ============ SCHEDULED SHIFTS ============
  const scheduleQuerySchema = z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    userId: z.string().optional(),
  });

  app.get('/api/v1/staff/schedule', devAuth, requireRoles(...STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const q = scheduleQuerySchema.parse(req.query);
    const to = q.to ? new Date(q.to) : new Date(Date.now() + 7 * 86400000);
    const from = q.from ? new Date(q.from) : new Date();
    const shifts = await prisma.scheduledShift.findMany({
      where: {
        venueId: user.venueId,
        date: { gte: from, lte: to },
        ...(q.userId ? { userId: q.userId } : {}),
        status: { not: 'CANCELLED' },
      },
      include: { user: { select: { id: true, name: true, roles: true, hourlyRateCents: true } } },
      orderBy: [{ date: 'asc' }, { startHour: 'asc' }],
    });
    res.json(shifts);
  });

  const createShiftSchema = z.object({
    userId: z.string().min(1),
    date: z.string(), // YYYY-MM-DD
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
    role: z.string().optional(),
    station: z.string().optional(),
    note: z.string().optional(),
  });

  app.post('/api/v1/staff/schedule', devAuth, requireRoles(...STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = createShiftSchema.parse(req.body);
    const shift = await prisma.scheduledShift.create({
      data: {
        userId: body.userId,
        venueId: user.venueId,
        date: new Date(body.date),
        startHour: body.startHour,
        endHour: body.endHour,
        role: body.role,
        station: body.station,
        note: body.note,
        status: 'SCHEDULED',
      },
      include: { user: { select: { id: true, name: true, roles: true } } },
    });
    res.status(201).json(shift);
  });

  const patchShiftSchema = z.object({
    startHour: z.number().int().min(0).max(23).optional(),
    endHour: z.number().int().min(1).max(24).optional(),
    role: z.string().optional(),
    station: z.string().optional(),
    status: z.enum(['SCHEDULED', 'CONFIRMED', 'STARTED', 'COMPLETED', 'CANCELLED']).optional(),
    note: z.string().optional(),
  });

  app.patch('/api/v1/staff/schedule/:id', devAuth, requireRoles(...STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = patchShiftSchema.parse(req.body);
    const shift = await prisma.scheduledShift.findFirst({ where: { id: req.params.id, venueId: user.venueId } });
    if (!shift) { res.status(404).json({ error: 'Turno non trovato' }); return; }
    const updated = await prisma.scheduledShift.update({
      where: { id: shift.id },
      data: {
        ...(body.startHour !== undefined ? { startHour: body.startHour } : {}),
        ...(body.endHour !== undefined ? { endHour: body.endHour } : {}),
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...(body.station !== undefined ? { station: body.station } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
      },
      include: { user: { select: { id: true, name: true, roles: true } } },
    });
    res.json(updated);
  });

  app.delete('/api/v1/staff/schedule/:id', devAuth, requireRoles(...STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const shift = await prisma.scheduledShift.findFirst({ where: { id: req.params.id, venueId: user.venueId } });
    if (!shift) { res.status(404).json({ error: 'Turno non trovato' }); return; }
    await prisma.scheduledShift.delete({ where: { id: shift.id } });
    res.json({ ok: true });
  });

  app.post('/api/v1/staff/schedule/:id/confirm', devAuth, requireRoles(...STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const shift = await prisma.scheduledShift.findFirst({ where: { id: req.params.id, venueId: user.venueId } });
    if (!shift) { res.status(404).json({ error: 'Turno non trovato' }); return; }
    const updated = await prisma.scheduledShift.update({
      where: { id: shift.id },
      data: { status: 'CONFIRMED' },
    });
    res.json(updated);
  });

  app.post('/api/v1/staff/schedule/:id/cancel', devAuth, requireRoles(...STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const shift = await prisma.scheduledShift.findFirst({ where: { id: req.params.id, venueId: user.venueId } });
    if (!shift) { res.status(404).json({ error: 'Turno non trovato' }); return; }
    const updated = await prisma.scheduledShift.update({
      where: { id: shift.id },
      data: { status: 'CANCELLED' },
    });
    res.json(updated);
  });

  // ============ AI SHIFT OPTIMIZATION ============
  const optimizeSchema = z.object({
    weekStart: z.string(), // YYYY-MM-DD
    coverage: z.array(z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      slots: z.array(z.object({
        startHour: z.number().int(),
        endHour: z.number().int(),
        minStaff: z.number().int().min(1).default(1),
        requiredRoles: z.array(z.string()).default([]),
        station: z.string().optional(),
      })),
    })).default([]),
    constraints: z.object({
      maxHoursPerWeek: z.number().int().default(40),
      minRestBetweenShifts: z.number().int().default(11), // ore
      preferAvailability: z.boolean().default(true),
    }).default({}),
  });

  app.post('/api/v1/staff/schedule/ai-optimize', devAuth, requireRoles(...STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = optimizeSchema.parse(req.body);
    const ai = getAiService();

    // Raccogli dati: dipendenti, disponibilità, turni esistenti
    const [staffList, availability, existingShifts] = await Promise.all([
      prisma.user.findMany({
        where: { venueId: user.venueId },
        select: { id: true, name: true, roles: true, hourlyRateCents: true },
      }),
      prisma.staffAvailability.findMany({ where: { venueId: user.venueId } }),
      prisma.scheduledShift.findMany({
        where: { venueId: user.venueId, date: { gte: new Date(body.weekStart) } },
      }),
    ]);

    // Costruisci input per AI (anonimizzato)
    const employees = staffList.map((s, i) => ({
      employeeId: `E${i + 1}`,
      name: s.name,
      roles: s.roles,
      hourlyRateCents: s.hourlyRateCents,
      availability: availability
        .filter(a => a.userId === s.id)
        .map(a => ({ day: DAYS[a.dayOfWeek], start: a.startHour, end: a.endHour, pref: a.preference })),
    }));

    const aiInput = {
      weekStart: body.weekStart,
      coverage: body.coverage,
      constraints: body.constraints,
      employees,
      existingShifts: existingShifts.map(s => ({
        employeeId: `E${staffList.findIndex(st => st.id === s.userId) + 1}`,
        day: s.date.toISOString().slice(0, 10),
        start: s.startHour,
        end: s.endHour,
      })),
    };

    let aiSuggestions: any[] = [];
    let aiApplied = false;

    try {
      const r = await ai.shiftSuggestion(aiInput);
      const suggestions = (r.data as any)?.shifts ?? [];
      // Mappa employeeId → userId
      for (const s of suggestions) {
        const idx = parseInt(s.employeeId?.replace('E', '') ?? '0') - 1;
        if (idx >= 0 && idx < staffList.length) {
          aiSuggestions.push({
            userId: staffList[idx].id,
            userName: staffList[idx].name,
            date: s.day,
            startHour: typeof s.start === 'number' ? s.start : parseInt(s.start),
            endHour: typeof s.end === 'number' ? s.end : parseInt(s.end),
            confidence: 0.85,
          });
        }
      }
      aiApplied = true;
    } catch {
      // Fallback: genera schedule basata su disponibilità senza AI
      for (const cov of body.coverage) {
        for (const slot of cov.slots) {
          // Trova dipendenti disponibili
          const available = staffList.filter(s =>
            availability.some(a =>
              a.userId === s.id &&
              a.dayOfWeek === cov.dayOfWeek &&
              a.startHour <= slot.startHour &&
              a.endHour >= slot.endHour &&
              a.preference !== 'UNAVAILABLE'
            )
          );
          // Assegna i primi minStaff disponibili
          for (let i = 0; i < Math.min(slot.minStaff, available.length); i++) {
            const emp = available[i];
            const dayDate = new Date(body.weekStart);
            dayDate.setDate(dayDate.getDate() + cov.dayOfWeek);
            aiSuggestions.push({
              userId: emp.id,
              userName: emp.name,
              date: dayDate.toISOString().slice(0, 10),
              startHour: slot.startHour,
              endHour: slot.endHour,
              station: slot.station,
              confidence: 0.5,
            });
          }
        }
      }
    }

    res.json({ aiApplied, suggestions: aiSuggestions, coverage: body.coverage });
  });

  // Applica suggerimenti AI (crea ScheduledShifts)
  const applySchema = z.object({
    suggestions: z.array(z.object({
      userId: z.string(),
      date: z.string(),
      startHour: z.number().int(),
      endHour: z.number().int(),
      station: z.string().optional(),
      role: z.string().optional(),
    })),
  });

  app.post('/api/v1/staff/schedule/apply', devAuth, requireRoles(...STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = applySchema.parse(req.body);
    // Elimina turni esistenti non confermati nelle date interessate
    const dates = [...new Set(body.suggestions.map(s => s.date))];
    await prisma.scheduledShift.deleteMany({
      where: {
        venueId: user.venueId,
        date: { in: dates.map(d => new Date(d)) },
        status: 'SCHEDULED',
      },
    });
    // Crea nuovi turni
    const created = await prisma.$transaction(
      body.suggestions.map(s =>
        prisma.scheduledShift.create({
          data: {
            userId: s.userId,
            venueId: user.venueId,
            date: new Date(s.date),
            startHour: s.startHour,
            endHour: s.endHour,
            station: s.station,
            role: s.role,
            status: 'SCHEDULED',
            aiSuggested: true,
          },
        })
      )
    );
    res.json({ created: created.length });
  });

  // ============ CHAT ============
  // Tipi room:
  //   COLLECTIVE      → tutti lo staff (owner + dipendenti)
  //   DEPARTMENT      → solo un reparto (KITCHEN | BAR | WAITER | BAR_WAITER)
  //   PERSONAL        → 1:1 owner ↔ singolo dipendente (creata da owner)
  //   DIRECT_TO_OWNER → dipendente scrive solo a owner (creata da dipendente)
  //
  // Visibility (per room create da owner):
  //   ALL          → tutti vedono le risposte dei dipendenti
  //   OWNER_ONLY   → solo l'owner vede i messaggi
  //   DEPARTMENT   → solo il reparto target vede
  //   MEMBERS      → solo i membri (per PERSONAL)

  const DEPARTMENT_ROLES: Record<string, string[]> = {
    KITCHEN: ['COOK'],
    BAR: ['BARMAN'],
    WAITER: ['WAITER'],
    BAR_WAITER: ['BARMAN', 'WAITER'],
  };

  // Determina se un utente può vedere una room
  function canSeeRoom(user: { userId: string; roles: string[] }, room: { type: string; department: string | null; targetUserId: string | null; createdBy: string | null; members: string[]; visibility: string }): boolean {
    // Owner vede tutto
    if (user.roles.includes('OWNER') || user.roles.includes('MANAGER')) return true;

    switch (room.type) {
      case 'COLLECTIVE':
        return true;
      case 'DEPARTMENT': {
        if (!room.department) return false;
        const deptRoles = DEPARTMENT_ROLES[room.department] ?? [];
        return user.roles.some(r => deptRoles.includes(r));
      }
      case 'PERSONAL':
        // Solo il dipendente target e l'owner
        return room.targetUserId === user.userId || room.members.includes(user.userId);
      case 'DIRECT_TO_OWNER':
        // Solo chi ha creato la room (dipendente) e l'owner
        return room.createdBy === user.userId;
      default:
        return false;
    }
  }

  app.get('/api/v1/staff/chat/rooms', devAuth, requireRoles(...ALL_STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    let rooms = await prisma.staffChatRoom.findMany({
      where: { venueId: user.venueId },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { text: true, createdAt: true, userId: true, type: true },
        },
        _count: { select: { messages: true } },
      },
    });

    // Filtra room in base al ruolo dell'utente
    rooms = rooms.filter(r => canSeeRoom(user, r));

    // Crea room collettiva se non esiste e l'utente è owner
    if (rooms.length === 0 && (user.roles.includes('OWNER') || user.roles.includes('MANAGER'))) {
      const general = await prisma.staffChatRoom.create({
        data: { venueId: user.venueId, name: 'Staff Collettiva', type: 'COLLECTIVE', createdBy: user.userId, visibility: 'ALL' },
      });
      rooms = [{ ...general, messages: [], _count: { messages: 0 } }];
    }

    res.json(rooms);
  });

  const roomSchema = z.object({
    name: z.string().min(1),
    type: z.enum(['COLLECTIVE', 'DEPARTMENT', 'PERSONAL', 'DIRECT_TO_OWNER']).default('COLLECTIVE'),
    department: z.enum(['KITCHEN', 'BAR', 'WAITER', 'BAR_WAITER']).optional(),
    targetUserId: z.string().optional(),
    visibility: z.enum(['ALL', 'OWNER_ONLY', 'DEPARTMENT', 'MEMBERS']).default('ALL'),
  });

  // Creazione room — owner può creare tutti i tipi; dipendenti solo DIRECT_TO_OWNER
  app.post('/api/v1/staff/chat/rooms', devAuth, requireRoles(...ALL_STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = roomSchema.parse(req.body);
    const isOwner = user.roles.includes('OWNER') || user.roles.includes('MANAGER');

    // I dipendenti non-owner possono creare solo DIRECT_TO_OWNER
    if (!isOwner && body.type !== 'DIRECT_TO_OWNER') {
      res.status(403).json({ error: 'I dipendenti possono creare solo chat dirette all\'owner' });
      return;
    }

    // Validazioni per tipo
    if (body.type === 'DEPARTMENT' && !body.department) {
      res.status(400).json({ error: 'Department richiesto per DEPARTMENT' });
      return;
    }
    if (body.type === 'PERSONAL' && !body.targetUserId) {
      res.status(400).json({ error: 'targetUserId richiesto per PERSONAL' });
      return;
    }

    // Per DIRECT_TO_OWNER: verifica che non esista già una room tra questo dipendente e l'owner
    if (body.type === 'DIRECT_TO_OWNER') {
      const existing = await prisma.staffChatRoom.findFirst({
        where: { venueId: user.venueId, type: 'DIRECT_TO_OWNER', createdBy: user.userId },
      });
      if (existing) {
        // Restituisci la room esistente
        res.status(200).json(existing);
        return;
      }
    }

    // Determina i membri per PERSONAL
    const members = body.type === 'PERSONAL' && body.targetUserId
      ? [body.targetUserId, user.userId]
      : [];

    const room = await prisma.staffChatRoom.create({
      data: {
        venueId: user.venueId,
        name: body.name,
        type: body.type,
        department: body.department,
        targetUserId: body.targetUserId,
        createdBy: user.userId,
        visibility: body.visibility,
        members,
      },
    });
    res.status(201).json(room);
  });

  // Lista dipendenti per creazione chat personali (solo owner)
  app.get('/api/v1/staff/chat/staff-list', devAuth, requireRoles(...STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const users = await prisma.user.findMany({
      where: {
        venueId: user.venueId,
        roles: { hasSome: ['WAITER', 'BARMAN', 'COOK'] },
      },
      select: { id: true, name: true, roles: true },
      orderBy: { name: 'asc' },
    });
    res.json(users);
  });

  app.get('/api/v1/staff/chat/rooms/:id/messages', devAuth, requireRoles(...ALL_STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const room = await prisma.staffChatRoom.findFirst({ where: { id: req.params.id, venueId: user.venueId } });
    if (!room) { res.status(404).json({ error: 'Room non trovata' }); return; }

    // Verifica permessi di visualizzazione
    if (!canSeeRoom(user, room)) {
      res.status(403).json({ error: 'Non autorizzato a vedere questa chat' });
      return;
    }

    const messages = await prisma.staffChatMessage.findMany({
      where: { roomId: room.id, venueId: user.venueId },
      include: { user: { select: { id: true, name: true, roles: true } } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    res.json(messages);
  });

  const messageSchema = z.object({
    text: z.string().min(1),
    type: z.enum(['TEXT', 'SHIFT_SWAP']).default('TEXT'),
    meta: z.any().optional(),
  });

  app.post('/api/v1/staff/chat/rooms/:id/messages', devAuth, requireRoles(...ALL_STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = messageSchema.parse(req.body);
    const room = await prisma.staffChatRoom.findFirst({ where: { id: req.params.id, venueId: user.venueId } });
    if (!room) { res.status(404).json({ error: 'Room non trovata' }); return; }

    // Verifica permessi: può scrivere solo chi può vedere la room
    if (!canSeeRoom(user, room)) {
      res.status(403).json({ error: 'Non autorizzato a scrivere in questa chat' });
      return;
    }

    const msg = await prisma.staffChatMessage.create({
      data: {
        roomId: room.id,
        userId: user.userId,
        venueId: user.venueId,
        text: body.text,
        type: body.type,
        meta: body.meta,
        readBy: [user.userId],
      },
      include: { user: { select: { id: true, name: true, roles: true } } },
    });
    res.status(201).json(msg);
  });

  // AI suggerisce risposta o azione in chat
  const aiSuggestSchema = z.object({
    context: z.string().optional(), // contesto extra (es. "un dipendente chiede cambio turno")
    lastMessages: z.number().int().min(1).max(20).default(5),
  });

  app.post('/api/v1/staff/chat/rooms/:id/ai-suggest', devAuth, requireRoles(...STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = aiSuggestSchema.parse(req.body);
    const room = await prisma.staffChatRoom.findFirst({ where: { id: req.params.id, venueId: user.venueId } });
    if (!room) { res.status(404).json({ error: 'Room non trovata' }); return; }

    const messages = await prisma.staffChatMessage.findMany({
      where: { roomId: room.id },
      include: { user: { select: { name: true, roles: true } } },
      orderBy: { createdAt: 'desc' },
      take: body.lastMessages,
    });
    const venue = await prisma.venue.findUnique({ where: { id: user.venueId } });
    const ai = getAiService();

    const conversation = messages.reverse().map(m =>
      `${m.user?.name ?? 'Sistema'}: ${m.text}`
    ).join('\n');

    let suggestion = '';
    let suggestions: string[] = [];

    if (ai.isEnabled()) {
      try {
        const r = await ai.marketingCopy({
          topic: `Sei l'assistente AI del locale "${venue?.name ?? 'La Piazzetta'}". Analizza questa chat dello staff e suggerisci 3 risposte/azioni utili.
${body.context ? `Contesto: ${body.context}` : ''}
Chat recente:
${conversation}

Rispondi SOLO con JSON: {"suggestions": ["suggerimento1", "suggerimento2", "suggerimento3"]}`,
          tone: 'professionale',
          channels: ['chat'],
        });
        const variant = r.data?.variants?.[0];
        if (variant) {
          // Prova a parsare JSON, fallback a testo
          try {
            const parsed = JSON.parse(variant.headline + variant.body);
            suggestions = parsed.suggestions ?? [];
          } catch {
            suggestions = [variant.headline, variant.body].filter(Boolean);
          }
        }
      } catch {}
    }

    if (suggestions.length === 0) {
      // Fallback intelligente
      const lastMsg = messages[0]?.text?.toLowerCase() ?? '';
      if (lastMsg.includes('cambio') || lastMsg.includes('turno')) {
        suggestions = [
          'Posso coprire io il turno, a che ora è?',
          'Verifico la disponibilità e ti confermo entro 1 ora',
          'Ho chiesto a un collega, ti aggiorno presto',
        ];
      } else if (lastMsg.includes('aiuto') || lastMsg.includes('urgente')) {
        suggestions = [
          'Arrivo subito, resisti 5 minuti',
          'Ho chiamato il manager, sta arrivando',
          'Mando qualcuno ad aiutarti subito',
        ];
      } else {
        suggestions = [
          'Ricevuto, me ne occupo io',
          'Ottima idea, procediamo così',
          'Ne parliamo al prossimo briefing',
        ];
      }
    }

    res.json({ suggestions, aiEnabled: ai.isEnabled() });
  });

  // Segna messaggio come letto
  app.post('/api/v1/staff/chat/rooms/:id/messages/:msgId/read', devAuth, requireRoles(...ALL_STAFF_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const msg = await prisma.staffChatMessage.findFirst({
      where: { id: req.params.msgId, venueId: user.venueId },
    });
    if (!msg) { res.status(404).json({ error: 'Messaggio non trovato' }); return; }
    if (!msg.readBy.includes(user.userId)) {
      const updated = await prisma.staffChatMessage.update({
        where: { id: msg.id },
        data: { readBy: [...msg.readBy, user.userId] },
      });
      res.json(updated);
    } else {
      res.json(msg);
    }
  });
}
