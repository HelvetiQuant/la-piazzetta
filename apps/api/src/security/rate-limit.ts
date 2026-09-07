/**
 * Rate limiting middleware — fixed window con contatori.
 *
 * Driver di default **in-memory** (per-processo, sufficiente per il portatile
 * in sala); in produzione con più istanze si innesta un adapter Redis via
 * `RedisRateLimitStore` (stessa interfaccia) così i contatori sono condivisi.
 *
 * Nessuna dipendenza esterna per il driver in-memory; Redis è lazy.
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';

export interface RateLimitOptions {
  /** Finestra temporale in millisecondi. */
  windowMs: number;
  /** Numero massimo di richieste per finestra per chiave. */
  max: number;
  /** Funzione per derivare la chiave (default: IP + percorso). */
  keyFn?: (req: Request) => string;
  /** Messaggio di errore. */
  message?: string;
  /** Header standard `RateLimit-*` nella risposta. */
  standardHeaders?: boolean;
}

export interface RateLimitStore {
  /** Incrementa il contatore per la chiave e ritorna { count, resetAt }. */
  incr(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
}

// ---- Driver in-memory ----

interface Bucket {
  count: number;
  resetAt: number;
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, Bucket>();

  async incr(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    const now = Date.now();
    const b = this.buckets.get(key);
    if (!b || now >= b.resetAt) {
      const resetAt = now + windowMs;
      this.buckets.set(key, { count: 1, resetAt });
      return { count: 1, resetAt };
    }
    b.count++;
    return { count: b.count, resetAt: b.resetAt };
  }

  /** Pulizia periodica dei bucket scaduti (opzionale, chiamare via timer). */
  sweep(): void {
    const now = Date.now();
    for (const [k, b] of this.buckets) {
      if (now >= b.resetAt) this.buckets.delete(k);
    }
  }
}

// ---- Driver Redis (lazy, opzionale) ----

export class RedisRateLimitStore implements RateLimitStore {
  private readonly client: any;
  constructor(client: any) {
    this.client = client;
  }

  static async fromUrl(redisUrl: string): Promise<RedisRateLimitStore> {
    const Redis = (await import('ioredis')).default;
    const client = new Redis(redisUrl, { maxRetriesPerRequest: 2 });
    // Listener 'error' obbligatorio: senza di esso un errore di connessione
    // EventEmitter fa terminare il processo Node (unhandled error).
    client.on('error', (err: unknown) => console.warn('[rate-limit:redis] errore:', (err as Error)?.message ?? err));
    return new RedisRateLimitStore(client);
  }

  async incr(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    const redisKey = `rl:${key}`;
    // INCR + EXPIRE: il TTL va impostato SOLO al primo incremento della finestra,
    // altrimenti sotto traffico continuo la chiave non scade mai (lockout permanente).
    // Usiamo MULTI/EXEC per atomicità; PEXPIRE solo se count === 1.
    const pipeline = this.client.pipeline();
    pipeline.incr(redisKey);
    // PEXPIRE condizionale: imposta il TTL solo se la chiave è nuova (TTL -1).
    // ioredis non supporta PEXPIRE NX direttamente in pipeline, quindi usiamo
    // un pattern: dopo INCR, se count === 1 impostiamo il TTL.
    const results = await pipeline.exec();
    const count = Number(results[0][1]);
    if (count === 1) {
      await this.client.pexpire(redisKey, windowMs);
    }
    // Recupera il TTL reale per restituirlo al client (secondi al reset).
    const ttlMs = await this.client.pttl(redisKey);
    const resetAt = ttlMs > 0 ? Date.now() + ttlMs : Date.now() + windowMs;
    return { count, resetAt };
  }
}

/**
 * Crea un middleware di rate limiting Express.
 *
 * Risponde 429 Too Many Requests quando il contatore supera `max` nella
 * finestra. Include header `RateLimit-Limit`, `RateLimit-Remaining`,
 * `RateLimit-Reset` (secondi al reset) se `standardHeaders` è attivo.
 */
export function rateLimit(opts: RateLimitOptions, store: RateLimitStore = new InMemoryRateLimitStore()): RequestHandler {
  const keyFn = opts.keyFn ?? defaultKeyFn;
  const message = opts.message ?? 'Troppe richieste, riprova tra poco';
  const headers = opts.standardHeaders ?? true;

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = keyFn(req);
    try {
      const { count, resetAt } = await store.incr(key, opts.windowMs);
      const remaining = Math.max(0, opts.max - count);
      const resetSec = Math.ceil((resetAt - Date.now()) / 1000);

      if (headers) {
        res.setHeader('RateLimit-Limit', String(opts.max));
        res.setHeader('RateLimit-Remaining', String(remaining));
        res.setHeader('RateLimit-Reset', String(resetSec));
      }

      if (count > opts.max) {
        if (headers) res.setHeader('Retry-After', String(resetSec));
        res.status(429).json({ error: message, retryAfterSec: resetSec });
        return;
      }
      next();
    } catch {
      // se lo store fallisce (es. Redis down), fail-open: lascia passare
      next();
    }
  };
}

/** Chiave default: IP + percorso (limita per endpoint per IP). */
function defaultKeyFn(req: Request): string {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || req.socket?.remoteAddress || 'unknown';
  return `${ip}:${req.path}`;
}

/** Chiave per endpoint di login: limita per IP solo sul path di login. */
export function loginKeyFn(req: Request): string {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || req.socket?.remoteAddress || 'unknown';
  return `login:${ip}`;
}

/**
 * Risolve lo store di rate limiting: Redis se REDIS_URL è impostata e ioredis
 * è installato, altrimenti in-memory. Per lo store in-memory, schedula la
 * pulizia periodica dei bucket scaduti (evita crescita indefinita della mappa
 * con chiavi per-IP).
 */
export async function resolveRateLimitStore(redisUrl?: string): Promise<RateLimitStore> {
  const url = redisUrl ?? process.env.REDIS_URL;
  if (!url) {
    const store = new InMemoryRateLimitStore();
    // Pulizia ogni 5 minuti dei bucket scaduti (unref: non tiene attivo il processo).
    setInterval(() => store.sweep(), 5 * 60 * 1000).unref();
    return store;
  }
  try {
    return await RedisRateLimitStore.fromUrl(url);
  } catch (err) {
    console.warn('[rate-limit] Redis non disponibile, uso store in-memory:', (err as Error).message);
    const store = new InMemoryRateLimitStore();
    setInterval(() => store.sweep(), 5 * 60 * 1000).unref();
    return store;
  }
}
