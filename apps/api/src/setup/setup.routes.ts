/**
 * Provisioning iniziale del locale via wizard web.
 *
 * Prima di questo modulo il primo utente OWNER andava creato a mano da Prisma
 * Studio (vedi vecchio README): frizione inutile all'apertura di un locale.
 *
 * Flusso:
 *  1. L'installatore genera un token monouso da CLI: `npm run provision:token`.
 *  2. Apre /owner: se non esiste alcun OWNER, la web app mostra il wizard.
 *  3. Inserisce token + nome locale + email/password owner → POST /setup/provision.
 *  4. Il token viene consumato, Venue + User(OWNER) creati, si può fare login.
 *
 * Sicurezza:
 *  - Le rotte sono PUBBLICHE (nessun utente esiste ancora) ma:
 *    - `/setup/provision` funziona SOLO finché non esiste alcun OWNER;
 *    - richiede un token valido, non scaduto, non già usato (hash SHA-256 su DB);
 *    - è protetta da rate limiting in index.ts.
 */

import type { Express, Request, Response } from 'express';
import type { PrismaClient, Prisma } from '@prisma/client';
import { z } from 'zod';
import { hashSecret, sha256Hex } from '../auth/password.util.js';

const DEFAULT_VENUE_ID = 'venue_piazzetta';

const provisionSchema = z.object({
  token: z.string().min(10),
  venueName: z.string().min(1).max(120),
  venueId: z.string().min(1).max(60).regex(/^[a-z0-9_-]+$/i).optional(),
  ownerName: z.string().min(1).max(120),
  ownerEmail: z.string().email(),
  ownerPassword: z.string().min(8).max(200),
});

export function registerSetupRoutes(app: Express, prisma: PrismaClient): void {
  async function ownerExists(): Promise<boolean> {
    const n = await prisma.user.count({ where: { roles: { has: 'OWNER' } } });
    return n > 0;
  }

  // Stato del provisioning: guida la web app a mostrare il wizard o il login.
  app.get('/api/v1/setup/status', async (_req: Request, res: Response) => {
    const [owner, venueCount] = await Promise.all([
      ownerExists(),
      prisma.venue.count(),
    ]);
    res.json({ needsSetup: !owner, hasVenue: venueCount > 0 });
  });

  // Esegue il provisioning: consuma il token, crea Venue + OWNER.
  app.post('/api/v1/setup/provision', async (req: Request, res: Response) => {
    if (await ownerExists()) {
      res.status(409).json({ error: 'Provisioning già completato: esiste già un utente OWNER.' });
      return;
    }

    const body = provisionSchema.parse(req.body);
    const tokenHash = sha256Hex(body.token.trim());
    const setupToken = await prisma.setupToken.findUnique({ where: { tokenHash } });
    if (!setupToken || setupToken.status !== 'PENDING' || setupToken.expiresAt.getTime() <= Date.now()) {
      res.status(403).json({ error: 'Token di setup non valido, scaduto o già utilizzato.' });
      return;
    }

    try {
      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Riusa il Venue esistente (es. creato dal seed menu) se presente,
        // altrimenti creane uno con id stabile atteso dalle web app.
        const existing = await tx.venue.findFirst({ orderBy: { createdAt: 'asc' } });
        const venue = existing
          ? await tx.venue.update({ where: { id: existing.id }, data: { name: body.venueName } })
          : await tx.venue.create({ data: { id: body.venueId ?? DEFAULT_VENUE_ID, name: body.venueName } });

        const owner = await tx.user.create({
          data: {
            venueId: venue.id,
            email: body.ownerEmail.toLowerCase(),
            name: body.ownerName,
            roles: ['OWNER'],
            passwordHash: hashSecret(body.ownerPassword),
          },
        });

        await tx.setupToken.update({ where: { id: setupToken.id }, data: { status: 'USED', usedAt: new Date() } });
        return { venueId: venue.id, ownerEmail: owner.email };
      });

      res.status(201).json({
        ok: true,
        ...result,
        note: 'Riavvia l\'API per attivare i job automatici dell\'agente per il nuovo locale.',
      });
    } catch (e) {
      const err = e as { code?: string };
      if (err.code === 'P2002') {
        res.status(409).json({ error: 'Esiste già un utente con questa email in questo locale.' });
        return;
      }
      throw e;
    }
  });
}
