/**
 * Astrazione del canale di notifica, sullo stesso modello di AiService:
 * routing, fallback, degradazione controllata se manca la configurazione.
 *
 * Riusa il trasporto WhatsApp già implementato in marketing.service.ts
 * (publishToWhatsApp) invece di riscriverlo.
 */

export interface Recipient {
  /** UserId interno (per InApp e lookup contatti). */
  userId?: string;
  /** Numero WhatsApp con prefisso internazionale, es. "393331234567". */
  phone?: string;
  /** Indirizzo email. */
  email?: string;
  /** Endpoint WebPush (subscription). */
  pushEndpoint?: string;
  /** Nome visualizzato. */
  name?: string;
}

export interface Message {
  /** Titolo breve (push, in-app). */
  title: string;
  /** Corpo del messaggio. */
  body: string;
  /** URL di azione (link di approvazione, deep link). */
  actionUrl?: string;
  /** Priorità per il routing. */
  severity?: 'info' | 'warning' | 'urgent';
}

export type SendOutcome = 'SENT' | 'SKIPPED' | 'FAILED';

export interface SendResult {
  outcome: SendOutcome;
  channel: string;
  /** Id esterno (messageId WhatsApp, email Message-ID, ecc.). */
  externalId?: string;
  /** Messaggio di errore per FAILED. */
  error?: string;
}

export interface NotificationChannel {
  readonly name: string;
  /** Chiave/credenziali presenti? Se false, il canale è saltato nel fallback. */
  isAvailable(): boolean;
  /** Invia il messaggio al destinatario. */
  send(to: Recipient, msg: Message): Promise<SendResult>;
}
