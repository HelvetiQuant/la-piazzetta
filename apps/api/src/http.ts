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
/**
 * Evento operativo per la dashboard proprietario in tempo reale. Riusa lo stesso
 * canale WebSocket dei KDS (vedi `realtime/kds-ws.ts`): quando un ordine viene
 * pagato, una sessione chiusa o una scorta scende sotto soglia, il server lo
 * segnala e la dashboard ricarica i KPI senza aspettare il polling.
 */
export interface DashboardEvent {
  kind: 'order.paid' | 'session.closed' | 'stock.critical';
  /** Importo incassato in centesimi (order.paid / session.closed). */
  amountCents?: number;
  /** Prodotto sotto soglia (stock.critical). */
  productId?: string;
  productName?: string;
  quantity?: number;
  reorderLevel?: number;
  [key: string]: unknown;
}

export interface RouteDeps {
  devAuth: RequestHandler;
  requireRoles: (...allowed: string[]) => RequestHandler;
  /** Hook real-time: notifica i client KDS che la board di una postazione è cambiata. */
  onBoardChange?: (venueId: string, station: 'BAR' | 'TAVOLA_CALDA') => void;
  /** Hook real-time: notifica la dashboard proprietario di un evento operativo. */
  onDashboardEvent?: (venueId: string, event: DashboardEvent) => void;
}

export type { Request, Response, NextFunction };
