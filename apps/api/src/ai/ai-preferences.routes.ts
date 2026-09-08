//
// ai-preferences.routes.ts
// 
// Preferenze AI che si adattano all'owner — impara dall'uso.
// L'AI è utile, mai invadente, sempre presente.
//

import type { Express, Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { RouteDeps } from '../http.js';

export function registerAiPreferenceRoutes(app: Express, prisma: PrismaClient, deps: RouteDeps) {
  // GET /api/v1/ai-preferences — leggi preferenze attuali
  app.get('/api/v1/ai-preferences', deps.devAuth, async (req: Request, res: Response) => {
    const venueId = (req as any).devUser.venueId;
    let prefs = await prisma.aiPreference.findUnique({ where: { venueId } });
    if (!prefs) {
      // Crea preferenze di default
      prefs = await prisma.aiPreference.create({
        data: { venueId }
      });
    }
    res.json(prefs);
  });

  // PATCH /api/v1/ai-preferences — aggiorna preferenze
  app.patch('/api/v1/ai-preferences', deps.devAuth, async (req: Request, res: Response) => {
    const venueId = (req as any).devUser.venueId;
    const { tonePreference, language, suggestionFrequency, preferredTopics, avoidedTopics } = req.body;
    const prefs = await prisma.aiPreference.upsert({
      where: { venueId },
      update: {
        ...(tonePreference && { tonePreference }),
        ...(language && { language }),
        ...(suggestionFrequency && { suggestionFrequency }),
        ...(preferredTopics && { preferredTopics }),
        ...(avoidedTopics && { avoidedTopics }),
      },
      create: { venueId, tonePreference, language, suggestionFrequency, preferredTopics, avoidedTopics },
    });
    res.json(prefs);
  });

  // POST /api/v1/ai-preferences/feedback — registra feedback (utile/non utile)
  app.post('/api/v1/ai-preferences/feedback', deps.devAuth, async (req: Request, res: Response) => {
    const venueId = (req as any).devUser.venueId;
    const { interactionId, feedback } = req.body; // feedback: 1 = utile, -1 = non utile
    // Aggiorna l'interazione
    if (interactionId) {
      await prisma.aiInteraction.update({
        where: { id: interactionId },
        data: { feedback },
      }).catch(() => {});
    }
    // Aggiorna contatori preferenze
    const prefs = await prisma.aiPreference.upsert({
      where: { venueId },
      update: {
        positiveFeedback: { increment: feedback > 0 ? 1 : 0 },
        negativeFeedback: { increment: feedback < 0 ? 1 : 0 },
      },
      create: { venueId },
    });
    res.json(prefs);
  });

  // POST /api/v1/ai-preferences/interaction — logga interazione (per imparare)
  app.post('/api/v1/ai-preferences/interaction', deps.devAuth, async (req: Request, res: Response) => {
    const venueId = (req as any).devUser.venueId;
    const { section, prompt, response, modelUsed, tokensUsed } = req.body;
    const interaction = await prisma.aiInteraction.create({
      data: {
        venueId,
        section: section || 'unknown',
        prompt: prompt || '',
        response: response || null,
        modelUsed: modelUsed || 'claude-haiku',
        tokensUsed: tokensUsed || 0,
      },
    });
    // Aggiorna pesi sezioni e contatore
    const prefs = await prisma.aiPreference.upsert({
      where: { venueId },
      update: {
        interactionCount: { increment: 1 },
        lastSuggestionAt: new Date(),
        sectionWeights: await computeSectionWeights(prisma, venueId),
      },
      create: { venueId, interactionCount: 1, lastSuggestionAt: new Date() },
    });
    res.json({ interaction, prefs });
  });

  // GET /api/v1/ai-preferences/suggestions — ottieni suggerimento contestuale (non invadente)
  app.get('/api/v1/ai-preferences/suggestions', deps.devAuth, async (req: Request, res: Response) => {
    const venueId = (req as any).devUser.venueId;
    const section = (req.query.section as string) || 'dashboard';
    
    let prefs = await prisma.aiPreference.findUnique({ where: { venueId } });
    if (!prefs) {
      prefs = await prisma.aiPreference.create({ data: { venueId } });
    }

    // Rispetta la frequenza: non suggerire troppo spesso
    const now = new Date();
    if (prefs.lastSuggestionAt) {
      const elapsed = now.getTime() - prefs.lastSuggestionAt.getTime();
      const minInterval = prefs.suggestionFrequency === 'low' ? 3600000 : // 1 ora
                          prefs.suggestionFrequency === 'medium' ? 900000 : // 15 min
                          60000; // 1 min (high)
      if (elapsed < minInterval) {
        res.json({ suggestion: null, reason: 'too_soon' });
        return;
      }
    }

    // Genera suggerimento basato sulla sezione e preferenze
    const suggestion = generateContextualSuggestion(section, prefs);
    res.json({ suggestion, prefs });
  });
}

// Calcola pesi sezioni basati sulle interazioni
async function computeSectionWeights(prisma: PrismaClient, venueId: string): Promise<any> {
  const interactions = await prisma.aiInteraction.groupBy({
    by: ['section'],
    where: { venueId, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    _count: true,
  });
  const weights: Record<string, number> = {};
  const max = Math.max(...interactions.map(i => i._count), 1);
  for (const i of interactions) {
    weights[i.section] = Math.round((i._count / max) * 100) / 100;
  }
  return weights;
}

// Genera suggerimento contestuale non invadente
function generateContextualSuggestion(section: string, prefs: any): string | null {
  const suggestions: Record<string, string[]> = {
    dashboard: [
      'Vuoi che analizzi le vendite di oggi e ti suggerisca il prodotto più profittevole?',
      'Notiamo meno coperti del solito. Vuoi un idea per attrarre più clienti a pranzo?',
      'Il ticket medio è basso oggi. Posso suggerire alcuni upsell per il personale?',
    ],
    marketing: [
      'Vuoi che crei un post per Instagram basato sul piatto del giorno?',
      'Posso generare 3 varianti di caption per la tua prossima campagna.',
      'Vuoi un report sull\'engagement dei tuoi post social?',
    ],
    staff: [
      'Vuoi che suggerisca i turni ottimali per la prossima settimana?',
      'Posso analizzare le ore lavorative e suggerire ottimizzazioni.',
    ],
    menu: [
      'Vuoi che suggerisca nuovi piatti basati sulle tendenze stagionali?',
      'Posso analizzare quali prodotti vendono meno e suggerire modifiche.',
    ],
    inventory: [
      'Vuoi che controlli le giacenze e suggerisca riordini?',
      'Posso prevedere la domanda della prossima settimana.',
    ],
    accounting: [
      'Vuoi un riepilogo della situazione contabile del mese?',
      'Posso suggerire come ottimizzare le spese per aumentare il margine.',
    ],
  };
  const pool = suggestions[section] || suggestions.dashboard;
  // Evita di ripetere lo stesso suggerimento
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx] || null;
}
