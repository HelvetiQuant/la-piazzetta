/**
 * Driver mock del terminale POS per CI e sviluppo.
 *
 * Simula le tre risposte possibili di un PAX A920 Pro:
 * - APPROVED: transazione approvata con codice di autorizzazione.
 * - DECLINED: transazione rifiutata (es. carta bloccata).
 * - UNKNOWN: timeout, terminale spento, rete caduta.
 *
 * Il comportamento è controllato da variabili d'ambiente per testare
 * tutti i rami senza toccare il codice:
 *
 *   POS_MOCK_MODE=approved   (default) — transazione sempre approvata
 *   POS_MOCK_MODE=declined   — transazione sempre rifiutata
 *   POS_MOCK_MODE=timeout    — nessuna risposta (UNKNOWN)
 *   POS_MOCK_MODE=offline    — terminale non disponibile (isAvailable=false)
 *
 * In CI si usa la modalità default (approved) per verificare il flusso
 * felice. I test di robustezza impostano le altre modalità.
 */

import type { PaymentTerminal, PosRequest, PosResponse, PosOutcome } from './terminal.port.js';

type MockMode = 'approved' | 'declined' | 'timeout' | 'offline';

function currentMode(): MockMode {
  const m = process.env.POS_MOCK_MODE ?? 'approved';
  if (m === 'approved' || m === 'declined' || m === 'timeout' || m === 'offline') return m;
  return 'approved';
}

export class MockPosDriver implements PaymentTerminal {
  readonly name = 'MockPosDriver';

  isAvailable(): boolean {
    return currentMode() !== 'offline';
  }

  async sendPayment(req: PosRequest): Promise<PosResponse> {
    const mode = currentMode();
    if (mode === 'offline') {
      return { outcome: 'UNKNOWN', message: 'Terminale non disponibile' };
    }
    // Simula latenza realistica del terminale (200-400ms).
    await new Promise((r) => setTimeout(r, 200 + Math.floor(Math.random() * 200)));

    if (mode === 'timeout') {
      return { outcome: 'UNKNOWN', message: 'Timeout: nessuna risposta dal terminale' };
    }
    if (mode === 'declined') {
      return { outcome: 'DECLINED', message: 'Transazione rifiutata dall\'emittente' };
    }

    // approved: genera codici plausibili.
    const outcome: PosOutcome = 'APPROVED';
    const terminalId = process.env.POS_MOCK_TERMINAL_ID ?? 'TML001';
    const authCode = String(100000 + Math.floor(Math.random() * 900000));
    const txnId = String(Date.now());
    return { outcome, terminalId, authCode, txnId };
  }
}

/** Istanza singleton usata dal backend se nessun driver reale è configurato. */
export const mockPosDriver = new MockPosDriver();
