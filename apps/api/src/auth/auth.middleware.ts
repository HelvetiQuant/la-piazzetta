/**
 * Middleware di autenticazione REALE (sostituisce il devAuth a soli header).
 *
 * Ordine: se è presente `Authorization: Bearer <jwt>` lo verifica e popola
 * `(req as any).devUser` dai claims. Solo FUORI produzione, in assenza di Bearer, accetta
 * ancora gli header dev (`x-venue-id`/`x-user-id`/`x-user-roles`) per test locali.
 * La forma di `(req as any).devUser` resta invariata: i moduli a valle non cambiano.
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { DevUser } from '../http.js';
import { parseBearer } from './jwt.util.js';
import type { AuthService } from './auth.service.js';

export function makeAuthMiddleware(auth: AuthService, opts: { allowDevHeaders?: boolean } = {}): RequestHandler {
  const allowDev = opts.allowDevHeaders ?? process.env.NODE_ENV !== 'production';

  return (req: Request, res: Response, next: NextFunction) => {
    const token = parseBearer(req.headers['authorization'] as string | undefined);

    if (token) {
      try {
        const claims = auth.verifyAccess(token);
        (req as any).devUser = { venueId: claims.venueId, userId: claims.sub, roles: claims.roles } as DevUser;
        return next();
      } catch {
        res.status(401).json({ error: 'Token non valido o scaduto' });
        return;
      }
    }

    if (allowDev) {
      const venueId = req.headers['x-venue-id'] as string;
      const userId = req.headers['x-user-id'] as string;
      const rolesHeader = req.headers['x-user-roles'] as string;
      if (venueId && userId && rolesHeader) {
        (req as any).devUser = { venueId, userId, roles: rolesHeader.split(',') } as DevUser;
        return next();
      }
    }

    res.status(401).json({ error: 'Autenticazione richiesta' });
  };
}
