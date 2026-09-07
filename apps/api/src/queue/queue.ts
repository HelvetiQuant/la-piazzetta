/**
 * Astrazione di coda job con driver pluggabile.
 *
 * Il driver di default è **in-memory** (nessuna infrastruttura, ottimo per dev e
 * test): esegue gli handler in modo asincrono con retry e backoff. Per la
 * produzione si sostituisce con l'adapter BullMQ/Redis (`bullmq.adapter.ts`)
 * senza toccare i produttori/consumatori: stessa interfaccia `Queue`.
 */

import { backoffDelays } from '../ai/ai.logic';

export type JobHandler<T = unknown> = (data: T) => Promise<void> | void;

export interface EnqueueOptions {
  maxAttempts?: number; // default 3
}

export interface Queue {
  /** Registra il consumatore della coda. */
  process<T = unknown>(queue: string, handler: JobHandler<T>): void;
  /** Accoda un job. */
  add<T = unknown>(queue: string, data: T, opts?: EnqueueOptions): Promise<void>;
  /** Attende lo svuotamento (utile nei test). */
  drain(): Promise<void>;
}

interface Pending {
  run: () => Promise<void>;
}

/**
 * Driver in-memory. Gli errori dell'handler innescano retry con lo stesso
 * backoff esponenziale usato dall'AiService. Superati i tentativi, il job va in
 * dead-letter (log) senza bloccare la coda.
 */
export class InMemoryQueue implements Queue {
  private handlers = new Map<string, JobHandler>();
  private inflight = new Set<Promise<void>>();
  private readonly sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  process<T>(queue: string, handler: JobHandler<T>): void {
    this.handlers.set(queue, handler as JobHandler);
  }

  async add<T>(queue: string, data: T, opts: EnqueueOptions = {}): Promise<void> {
    const handler = this.handlers.get(queue);
    if (!handler) return; // nessun consumatore: no-op (coerente con moduli opzionali)
    const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);

    const task = (async () => {
      const delays = [0, ...backoffDelays(maxAttempts - 1)];
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (delays[attempt] > 0) await this.sleep(delays[attempt]);
        try {
          await handler(data);
          return;
        } catch (err) {
          if (attempt === maxAttempts - 1) {
            console.error(`[queue:${queue}] job in dead-letter dopo ${maxAttempts} tentativi:`, err);
          }
        }
      }
    })();

    const tracked = task.finally(() => this.inflight.delete(tracked));
    this.inflight.add(tracked);
    await Promise.resolve(); // cede il turno: enqueue non blocca sul completamento
  }

  async drain(): Promise<void> {
    while (this.inflight.size > 0) {
      await Promise.all(Array.from(this.inflight));
    }
  }
}

/** Singleton condiviso. Sostituibile con l'adapter BullMQ via `setQueue`. */
let shared: Queue = new InMemoryQueue();
export function getQueue(): Queue {
  return shared;
}
export function setQueue(q: Queue): void {
  shared = q;
}
