/**
 * Augmentation globale del tipo Express Request per evitare cast `as any`
 * su req.devUser e req.logStart, iniettati dai middleware auth/logger.
 * Con NodeNext, `declare global` funziona meglio di `declare module`.
 */
declare global {
  namespace Express {
    interface Request {
      /** Utente dev iniettato da devAuth (header x-venue-id / x-user-id / x-user-roles).
       *  Non opzionale: le route protette da devAuth lo garantiscono. */
      devUser: {
        venueId: string;
        userId: string;
        roles: string[];
      };
      /** Timestamp di inizio richiesta, iniettato dal security logger. */
      logStart?: number;
    }
  }
}

export {};
