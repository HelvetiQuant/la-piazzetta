/**
 * Orchestratore dell'assistente owner: loop tool-call.
 *
 * 1. Carica storico conversazione (persistito) → transcript.
 * 2. Chiama AiService.run('assistant') → parse risposta.
 * 3. Se tool_calls → esegue strumenti, appende risultati al transcript, loop.
 * 4. Se reply → persiste messaggi e risponde.
 * Guardie: MAX_STEPS, AiDisabled/Budget → risposta di cortesia.
 */

import type { PrismaClient } from '@prisma/client';
import { getAiService } from '../ai.service.js';
import { parseJsonLoose } from '../ai.logic.js';
import {
  buildSystemPrompt,
  serializeTranscript,
  parseAssistantResponse,
  MAX_STEPS,
  type TranscriptEntry,
} from './assistant.logic.js';
import { executeTool } from './assistant.tools.js';

export interface ChatResult {
  conversationId: string;
  reply: string;
  actions: { tool: string; result: unknown }[];
  provider?: string;
}

export async function assistantChat(
  prisma: PrismaClient,
  opts: { venueId: string; userId: string; message: string; conversationId?: string },
): Promise<ChatResult> {
  const venue = await prisma.venue.findUnique({ where: { id: opts.venueId } });
  const venueName = venue?.name ?? 'il locale';

  // Recupera o crea la conversazione.
  let conversationId = opts.conversationId;
  if (conversationId) {
    const conv = await prisma.aiConversation.findFirst({
      where: { id: conversationId, venueId: opts.venueId },
    });
    if (!conv) conversationId = undefined;
  }
  if (!conversationId) {
    const conv = await prisma.aiConversation.create({
      data: {
        venueId: opts.venueId,
        userId: opts.userId,
        title: opts.message.slice(0, 60),
      },
    });
    conversationId = conv.id;
  }

  // Storico → transcript.
  const past = await prisma.aiMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: 40,
  });
  const history: TranscriptEntry[] = past.map((m) => ({
    role: m.role as TranscriptEntry['role'],
    content: m.content,
    toolName: m.toolName ?? undefined,
  }));
  history.push({ role: 'user', content: opts.message });

  const ai = getAiService();
  const actions: { tool: string; result: unknown }[] = [];
  let reply = '';
  let provider: string | undefined;

  if (!ai.isEnabled()) {
    reply = 'Assistente non configurato: manca una chiave AI (MISTRAL_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY) nel .env del server.';
  } else {
    for (let step = 0; step < MAX_STEPS; step++) {
      const result = await ai.run('assistant', {
        system: buildSystemPrompt(venueName, new Date()),
        user: serializeTranscript(history),
      });
      provider = result.provider;
      const parsed = parseAssistantResponse(result.text, (s) => parseJsonLoose(s));

      if (parsed.type === 'reply') {
        reply = parsed.text;
        history.push({ role: 'assistant', content: parsed.text });
        break;
      }

      // Esegue le tool call e appende i risultati al transcript.
      const ctx = { prisma, venueId: opts.venueId, userId: opts.userId, venueName };
      for (const call of parsed.calls) {
        const out = await executeTool(ctx, call.name, call.args);
        actions.push({ tool: call.name, result: out });
        history.push({ role: 'assistant', content: JSON.stringify({ tool_calls: [call] }) });
        history.push({ role: 'tool', toolName: call.name, content: JSON.stringify(out).slice(0, 6000) });
      }
    }
    if (!reply) reply = 'Ho dovuto interrompere l\'analisi (troppi passaggi). Riprova con una richiesta più semplice.';
  }

  // Persistenza messaggi (utente + risposta assistente; i passaggi intermedi
  // tool restano in memoria per turno — non gonfiamo il DB).
  await prisma.aiMessage.create({
    data: { conversationId, role: 'user', content: opts.message },
  });
  await prisma.aiMessage.create({
    data: { conversationId, role: 'assistant', content: reply },
  });
  await prisma.aiConversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  return { conversationId, reply, actions, provider };
}

/**
 * Hook upload media: esegue le istruzioni PENDING con trigger media_upload.
 * Per ciascuna: se il payload descrive un post (topic/tone), crea la bozza con
 * la foto appena caricata e marca l'istruzione EXECUTED.
 */
export async function processPendingUploadInstructions(
  prisma: PrismaClient,
  venueId: string,
  mediaAssetId: string,
): Promise<{ instructionId: string; result: unknown }[]> {
  const pending = await prisma.aiInstruction.findMany({
    where: { venueId, status: 'PENDING', triggerType: 'media_upload' },
    orderBy: { createdAt: 'asc' },
  });
  if (pending.length === 0) return [];

  const venue = await prisma.venue.findUnique({ where: { id: venueId } });
  const out: { instructionId: string; result: unknown }[] = [];
  for (const instr of pending) {
    const payload = (instr.payload ?? {}) as Record<string, unknown>;
    const result = await executeTool(
      { prisma, venueId, userId: instr.userId, venueName: venue?.name ?? 'il locale' },
      'draft_marketing_post',
      { ...payload, mediaAssetId },
    );
    const ok = !(result as { error?: string })?.error;
    await prisma.aiInstruction.update({
      where: { id: instr.id },
      data: { status: ok ? 'EXECUTED' : 'FAILED', result: result as never, executedAt: new Date() },
    });
    out.push({ instructionId: instr.id, result });
  }
  return out;
}
