/**
 * Rotte di autenticazione: login (email/password e PIN), refresh, logout.
 * Pubbliche (non passano dal middleware di auth).
 */

import type { Express, Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthService, AuthError } from './auth.service.js';

export function registerAuthRoutes(app: Express, prisma: PrismaClient, auth: AuthService = new AuthService(prisma)): void {
  const loginSchema = z.object({ venueId: z.string().min(1), email: z.string().email(), password: z.string().min(1) });
  const pinSchema = z.object({ venueId: z.string().min(1), userId: z.string().min(1), pin: z.string().min(1) });
  const refreshSchema = z.object({ refreshToken: z.string().min(1) });

  async function handle(res: Response, fn: () => Promise<unknown>) {
    try {
      res.json(await fn());
    } catch (err) {
      if (err instanceof AuthError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      throw err;
    }
  }

  app.post('/api/v1/auth/login', async (req: Request, res: Response) => {
    const b = loginSchema.parse(req.body);
    await handle(res, () => auth.loginWithPassword(b.venueId, b.email, b.password));
  });

  app.post('/api/v1/auth/login-pin', async (req: Request, res: Response) => {
    const b = pinSchema.parse(req.body);
    await handle(res, () => auth.loginWithPin(b.venueId, b.userId, b.pin));
  });

  app.post('/api/v1/auth/refresh', async (req: Request, res: Response) => {
    const b = refreshSchema.parse(req.body);
    await handle(res, () => auth.refresh(b.refreshToken));
  });

  app.post('/api/v1/auth/logout', async (req: Request, res: Response) => {
    const b = refreshSchema.parse(req.body);
    await auth.revoke(b.refreshToken);
    res.json({ ok: true });
  });
}
