/**
 * Rotte dell'assistente owner:
 *  POST   /api/v1/ai/assistant/chat              → messaggio → risposta + azioni
 *  GET    /api/v1/ai/assistant/conversations     → lista conversazioni
 *  GET    /api/v1/ai/assistant/conversations/:id → storico messaggi
 *  GET    /api/v1/ai/assistant/instructions      → comandi differiti pending
 *  DELETE /api/v1/ai/assistant/instructions/:id  → annulla comando
 */

import type { Express, Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { currentUser, type RouteDeps } from '../../http.js';
import { assistantChat } from './assistant.service.js';

const OWNER_ROLES = ['OWNER', 'MANAGER'];

export function registerAssistantRoutes(app: Express, prisma: PrismaClient, deps: RouteDeps): void {
  const { devAuth, requireRoles } = deps;

  const chatSchema = z.object({
    message: z.string().min(1).max(4000),
    conversationId: z.string().optional(),
  });

  app.post('/api/v1/ai/assistant/chat', devAuth, requireRoles(...OWNER_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = chatSchema.parse(req.body);
    try {
      const result = await assistantChat(prisma, {
        venueId: user.venueId,
        userId: user.userId,
        message: body.message,
        conversationId: body.conversationId,
      });
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Nessun provider AI')) {
        res.status(503).json({ error: msg });
        return;
      }
      if (msg.includes('Budget AI')) {
        res.status(429).json({ error: msg });
        return;
      }
      res.status(502).json({ error: `Assistente non disponibile: ${msg}` });
    }
  });

  app.get('/api/v1/ai/assistant/conversations', devAuth, requireRoles(...OWNER_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const convs = await prisma.aiConversation.findMany({
      where: { venueId: user.venueId, userId: user.userId },
      orderBy: { updatedAt: 'desc' },
      take: 30,
      include: { _count: { select: { messages: true } } },
    });
    res.json(convs);
  });

  app.get('/api/v1/ai/assistant/conversations/:id', devAuth, requireRoles(...OWNER_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const conv = await prisma.aiConversation.findFirst({
      where: { id: req.params.id as string, venueId: user.venueId },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 200 } },
    });
    if (!conv) { res.status(404).json({ error: 'Conversazione non trovata' }); return; }
    res.json(conv);
  });

  app.get('/api/v1/ai/assistant/instructions', devAuth, requireRoles(...OWNER_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const list = await prisma.aiInstruction.findMany({
      where: { venueId: user.venueId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(list);
  });

  app.delete('/api/v1/ai/assistant/instructions/:id', devAuth, requireRoles(...OWNER_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const instr = await prisma.aiInstruction.findFirst({
      where: { id: req.params.id as string, venueId: user.venueId },
    });
    if (!instr) { res.status(404).json({ error: 'Istruzione non trovata' }); return; }
    await prisma.aiInstruction.update({
      where: { id: instr.id },
      data: { status: 'CANCELLED' },
    });
    res.json({ ok: true });
  });
}
