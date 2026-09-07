/**
 * Real-time WebSocket per KDS e notifiche.
 *
 * Sostituisce il polling a 5s delle webapp KDS con push immediato: quando una
 * comanda cambia stato (creata, riga avanzata, ordine servito), il server
 * notifica tutti i client WebSocket connessi per la postazione interessata.
 *
 * Usa `ws` (WebSocket nativo Node) — aggiunto come dipendenza. L'autenticazione
 * avviene via query string `?token=<jwt>` all'handshake (i browser non possono
 * impostare header custom su WebSocket). Il venue e i ruoli sono estratti dai
 * claims del JWT.
 *
 * Architettura:
 *  - `KdsWebSocketServer` gestisce le connessioni e l'invio broadcast.
 *  - I moduli route chiamano `notifyBoardUpdate(venueId, station)` dopo una
 *    mutazione (creazione ordine, bump riga) per triggerare il push.
 *  - Il client riceve `{ type: 'board-update', station: 'BAR'|'TAVOLA_CALDA' }`
 *    e rifà un GET /board (pull-on-push: semplice e coerente con l'API REST).
 */

import type { Server } from 'http';
import type { AuthService } from '../auth/auth.service';
import type { Station } from '../stations/stations';

type WebSocket = any; // ws.WebSocket (tipizzato loose per non forzare l'import type)

interface ClientInfo {
  ws: WebSocket;
  venueId: string;
  station: Station | 'ALL';
  userId: string;
}

export class KdsWebSocketServer {
  private clients = new Set<ClientInfo>();
  private wss: any = null;

  constructor(private readonly auth: AuthService) {}

  /** Attacca il server WebSocket a un server HTTP esistente. */
  attach(server: Server, path = '/ws'): void {
    // import lazy di `ws`: se non installato, il real-time è disattivato
    // e le webapp KDS continuano col polling (degradazione graceful).
    import('ws')
      .then(({ WebSocketServer }) => {
        this.wss = new WebSocketServer({ server, path });
        this.wss.on('connection', (ws: WebSocket, req: any) => {
          this.handleConnection(ws, req);
        });
        console.log(`[realtime] WebSocket KDS attivo su ${path}`);
      })
      .catch(() => {
        console.warn('[realtime] pacchetto `ws` non installato: KDS resta su polling.');
      });
  }

  private handleConnection(ws: WebSocket, req: any): void {
    // Autenticazione via query string: ?token=<jwt>&station=BAR|TAVOLA_CALDA
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    const stationParam = (url.searchParams.get('station') || 'ALL').toUpperCase() as Station | 'ALL';

    if (!token) {
      ws.close(4001, 'Token mancante');
      return;
    }

    let claims;
    try {
      claims = this.auth.verifyAccess(token);
    } catch {
      ws.close(4003, 'Token non valido');
      return;
    }

    const info: ClientInfo = { ws, venueId: claims.venueId, station: stationParam, userId: claims.sub };
    this.clients.add(info);

    ws.on('close', () => this.clients.delete(info));
    ws.on('error', () => this.clients.delete(info));

    // Conferma connessione
    ws.send(JSON.stringify({ type: 'connected', station: info.station }));
  }

  /**
   * Notifica i client di un venue che la board di una postazione è cambiata.
   * I client filtrano per la loro postazione e rifanno il GET /board.
   */
  notifyBoardUpdate(venueId: string, station: Station): void {
    const msg = JSON.stringify({ type: 'board-update', station, at: Date.now() });
    for (const c of this.clients) {
      if (c.venueId !== venueId) continue;
      if (c.station !== 'ALL' && c.station !== station) continue;
      if (c.ws.readyState === 1 /* OPEN */) {
        c.ws.send(msg);
      }
    }
  }

  /** Notifica generica a tutti i client di un venue (es. nuovo ordine). */
  notifyVenue(venueId: string, payload: unknown): void {
    const msg = JSON.stringify({ type: 'notification', ...payload });
    for (const c of this.clients) {
      // Isolamento tenant: invia SOLO ai client del venue target.
      if (c.venueId === venueId && c.ws.readyState === 1) {
        c.ws.send(msg);
      }
    }
  }

  /** Numero di client connessi (per health/monitoring). */
  connectedCount(): number {
    return this.clients.size;
  }
}

/** Singleton condiviso. */
let shared: KdsWebSocketServer | null = null;
export function getKdsWebSocket(auth: AuthService): KdsWebSocketServer {
  if (!shared) shared = new KdsWebSocketServer(auth);
  return shared;
}
