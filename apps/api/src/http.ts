import type { Request, Response, NextFunction, RequestHandler } from 'express';

/** Utente dev iniettato da devAuth (header x-venue-id / x-user-id / x-user-roles). */
export interface DevUser {
  venueId: string;
  userId: string;
  roles: string[];
}

export function currentUser(req: Request): DevUser {
  return (req as any).devUser as DevUser;
}

/**
 * Dipendenze condivise passate ai moduli route così da riusare lo stesso
 * middleware di auth definito nell'entrypoint (`index.ts`).
 *
 * `onBoardChange` è opzionale: se presente, i moduli ordini lo chiamano dopo
 * una mutazione (creazione/avanzamento) per triggerare il push WebSocket KDS.
 */
export interface RouteDeps {
  devAuth: RequestHandler;
  requireRoles: (...allowed: string[]) => RequestHandler;
  /** Hook real-time: notifica i client KDS che la board di una postazione è cambiata. */
  onBoardChange?: (venueId: string, station: 'BAR' | 'TAVOLA_CALDA') => void;
}

export type { Request, Response, NextFunction };
