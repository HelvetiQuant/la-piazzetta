/**
 * Adapter BullMQ/Redis — drop-in per la produzione.
 *
 * NON importa `bullmq` staticamente: la dipendenza è caricata in modo lazy solo
 * se `REDIS_URL` è impostata e il pacchetto è installato, così l'app resta
 * eseguibile anche senza Redis (dev/test usano l'InMemoryQueue di default).
 *
 * Attivazione (in `index.ts`, opzionale):
 *   import { tryEnableBullmq } from './queue/bullmq.adapter';
 *   await tryEnableBullmq();
 */

import type { Queue, JobHandler, EnqueueOptions } from './queue.js';
import { setQueue } from './queue.js';

export async function tryEnableBullmq(redisUrl = process.env.REDIS_URL): Promise<boolean> {
  if (!redisUrl) return false;
  let bullmq: any;
  try {
    // import dinamico: assente in dev senza dipendenza → si resta in-memory
    bullmq = await import(/* @vite-ignore */ 'bullmq');
  } catch {
    console.warn('[queue] BullMQ non installato: uso la coda in-memory.');
    return false;
  }

  const { Queue: BullQueue, Worker } = bullmq;
  const connection = { url: redisUrl } as any;

  const queues = new Map<string, any>();
  const handlers = new Map<string, JobHandler>();

  const adapter: Queue = {
    process<T>(name: string, handler: JobHandler<T>) {
      handlers.set(name, handler as JobHandler);
      // eslint-disable-next-line no-new
      new Worker(name, async (job: any) => handler(job.data), { connection });
    },
    async add<T>(name: string, data: T, opts: EnqueueOptions = {}) {
      let q = queues.get(name);
      if (!q) {
        q = new BullQueue(name, { connection });
        queues.set(name, q);
      }
      await q.add(name, data, { attempts: opts.maxAttempts ?? 3, backoff: { type: 'exponential', delay: 200 } });
    },
    async drain() {
      /* con BullMQ i job sono persistiti su Redis: no-op */
    },
  };

  setQueue(adapter);
  console.log('[queue] BullMQ/Redis attivo.');
  return true;
}
