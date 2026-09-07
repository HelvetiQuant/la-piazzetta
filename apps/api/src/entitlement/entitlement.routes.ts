/**
 * Endpoint entitlements + factory di middleware `requireModule` per il paywall
 * contestuale a livello di route (403 con invito all'upgrade).
 */

import type { Express, Request, Response, NextFunction, RequestHandler } from 'express';
import type { PrismaClient } from '@prisma/client';
import { currentUser, type RouteDeps } from '../http';
import { EntitlementService } from './entitlement.service';
import { hasModule } from './entitlement.logic';
import type { ModuleId } from './plans.config';

/**
 * Gate per-modulo: risponde 403 `{ upgradeRequired, module }` se il piano del
 * venue non include il modulo. Usa `req.devUser` popolato dal middleware auth.
 */
export function requireModule(moduleId: ModuleId, svc: EntitlementService): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = currentUser(req);
    if (!user) {
      res.status(401).json({ error: 'Autenticazione richiesta' });
      return;
    }
    const ent = await svc.forVenue(user.venueId);
    if (!hasModule(ent, moduleId)) {
      res.status(403).json({ error: `Modulo "${moduleId}" non incluso nel piano ${ent.plan}`, upgradeRequired: true, module: moduleId });
      return;
    }
    next();
  };
}

/**
 * Registra le rotte entitlement. Il `svc` (EntitlementService con cache Redis
 * o in-memory) è passato dall'entrypoint per evitare un secondo singleton con
 * cache separata (che renderebbe inefficaci le invalidazioni).
 */
export function registerEntitlementRoutes(app: Express, prisma: PrismaClient, deps: RouteDeps, svc: EntitlementService): void {
  const { devAuth } = deps;

  // Paywall contestuale per la UI: cosa è attivo per il venue corrente.
  app.get('/api/v1/me/entitlements', devAuth, async (req: Request, res: Response) => {
    const user = currentUser(req);
    const ent = await svc.forVenue(user.venueId);
    res.json(ent);
  });
}
