/**
 * Interfaccia del terminale di pagamento (POS) per lo scambio importo.
 *
 * Il terminale fisico è un PAX A920 Pro con protocollo ECR configurabile
 * (17, 21, 37, 47, 99). Questa interfaccia astrae il driver concreto:
 * il backend parla con un `PaymentTerminal` e non sa se sotto c'è un
 * terminale vero, un mock o nessun terminale.
 *
 * Vincoli di progettazione (vedi PROMPT_IMPLEMENTAZIONE 2.7):
 * - Il numero di protocollo è configurabile (`POS_ECR_PROTOCOL`), non cablato.
 * - Timeout e stato ambiguo: se il POS non risponde, restituisci `UNKNOWN`,
 *   non `DECLINED`. Un doppio addebito è peggio di un mancato incasso.
 * - Fallback manuale sempre disponibile: il cameriere può registrare il
 *   pagamento con carta digitando l'importo sul terminale come si fa oggi.
 */

/** Esito di una transazione POS. */
export type PosOutcome = 'APPROVED' | 'DECLINED' | 'UNKNOWN';

/** Risposta del terminale a una richiesta di pagamento. */
export interface PosResponse {
  outcome: PosOutcome;
  /** Codice terminale (TML), stampato sullo scontrino del POS. */
  terminalId?: string;
  /** Codice di autorizzazione della transazione. */
  authCode?: string;
  /** Numero transazione assegnato dal terminale. */
  txnId?: string;
  /** Messaggio di errore o declino, leggibile dal cameriere. */
  message?: string;
}

/** Richiesta di pagamento al terminale. */
export interface PosRequest {
  /** Importo in centesimi di euro. */
  amountCents: number;
  /** Mancia in centesimi (opzionale, per la funzione mancia del terminale). */
  tipCents?: number;
  /** Identificativo per tracciare la richiesta (idempotenza lato backend). */
  requestId: string;
}

/**
 * Driver del terminale di pagamento. Implementazioni:
 * - `MockPosDriver` per CI e sviluppo senza terminale.
 * - `EcrPosDriver` (futuro) per il PAX A920 Pro via TCP.
 *
 * Il driver non conosce Prisma né Express: è puro I/O verso il dispositivo.
 */
export interface PaymentTerminal {
  /** Nome del driver, per logging. */
  readonly name: string;
  /** Verifica se il terminale è raggiungibile e configurato. */
  isAvailable(): boolean;
  /** Invia un importo al terminale e attende l'esito. */
  sendPayment(req: PosRequest): Promise<PosResponse>;
}
