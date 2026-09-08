/**
 * Cache generica con TTL e invalidazione. Driver di default **in-memory**;
 * l'interfaccia è compatibile con un adapter Redis (`RedisCache`, più sotto)
 * da innestare in produzione senza cambiare i chiamanti.
 */

import type { Redis as RedisClient } from 'ioredis';

export interface Cache<V> {
  get(key: string): Promise<V | undefined>;
  set(key: string, value: V, ttlMs?: number): Promise<void>;
  invalidate(key: string): Promise<void>;
  clear(): Promise<void>;
}

interface Entry<V> {
  value: V;
  expiresAt: number; // 0 = mai
}

export class InMemoryCache<V> implements Cache<V> {
  private store = new Map<string, Entry<V>>();
  private readonly defaultTtlMs: number;
  constructor(defaultTtlMs = 5 * 60 * 1000) {
    this.defaultTtlMs = defaultTtlMs;
  }

  async get(key: string): Promise<V | undefined> {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (e.expiresAt !== 0 && Date.now() >= e.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return e.value;
  }

  async set(key: string, value: V, ttlMs = this.defaultTtlMs): Promise<void> {
    this.store.set(key, { value, expiresAt: ttlMs > 0 ? Date.now() + ttlMs : 0 });
  }

  async invalidate(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

/**
 * Adapter Redis per la cache entitlement — drop-in per la produzione.
 *
 * NON importa `ioredis` staticamente: caricamento lazy solo se `REDIS_URL` è
 * presente e il pacchetto è installato. I valori sono serializzati in JSON;
 * il TTL è gestito da Redis stesso (PX = millisecondi). Se Redis non è
 * raggiungibile al `get`, la cache fallisce aperta (ritorna undefined) così
 * l'EntitlementService ricade sul DB — il sistema non si blocca.
 */
export class RedisCache<V> implements Cache<V> {
  private readonly client: RedisClient;
  private readonly defaultTtlMs: number;
  private readonly prefix: string;

  constructor(client: RedisClient, defaultTtlMs = 5 * 60 * 1000, prefix = 'ent:') {
    this.client = client;
    this.defaultTtlMs = defaultTtlMs;
    this.prefix = prefix;
  }

  /** Crea un'istanza da REDIS_URL con caricamento lazy di ioredis. */
  static async fromUrl(redisUrl: string, defaultTtlMs = 5 * 60 * 1000, prefix = 'ent:'): Promise<RedisCache<any>> {
    const { Redis: RedisCtor } = await import('ioredis');
    const client = new RedisCtor(redisUrl, { maxRetriesPerRequest: 2, lazyConnect: false });
    // Listener 'error' obbligatorio: senza di esso un errore di connessione
    // EventEmitter fa terminare il processo Node (unhandled error).
    client.on('error', (err: unknown) => console.warn('[cache:redis] errore:', (err as Error)?.message ?? err));
    return new RedisCache<any>(client, defaultTtlMs, prefix);
  }

  private k(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get(key: string): Promise<V | undefined> {
    try {
      const raw = await this.client.get(this.k(key));
      return raw ? (JSON.parse(raw) as V) : undefined;
    } catch {
      // fail-open: cache miss → il service ricade sul DB
      return undefined;
    }
  }

  async set(key: string, value: V, ttlMs = this.defaultTtlMs): Promise<void> {
    try {
      const raw = JSON.stringify(value);
      if (ttlMs > 0) await this.client.set(this.k(key), raw, 'PX', ttlMs);
      else await this.client.set(this.k(key), raw);
    } catch {
      // fail-silent: se Redis non scrive, il prossimo get farà cache miss
    }
  }

  async invalidate(key: string): Promise<void> {
    try {
      await this.client.del(this.k(key));
    } catch {
      /* fail-silent */
    }
  }

  async clear(): Promise<void> {
    try {
      // SCAN + DEL per non bloccare Redis con KEYS su dataset grandi
      let cursor = '0';
      do {
        const [next, keys] = await this.client.scan(cursor, 'MATCH', `${this.prefix}*`, 'COUNT', 200);
        cursor = next;
        if (keys.length > 0) await this.client.del(...keys);
      } while (cursor !== '0');
    } catch {
      /* fail-silent */
    }
  }
}

/**
 * Attiva la cache Redis per gli entitlement se `REDIS_URL` è impostata e
 * `ioredis` è installato; altrimenti resta in-memory. Ritorna la cache attiva.
 */
export async function resolveCache<V>(redisUrl?: string, ttlMs = 5 * 60 * 1000): Promise<Cache<V>> {
  const url = redisUrl ?? process.env.REDIS_URL;
  if (!url) return new InMemoryCache<V>(ttlMs);
  try {
    return await RedisCache.fromUrl(url, ttlMs);
  } catch (err) {
    console.warn('[cache] Redis non disponibile, uso cache in-memory:', (err as Error).message);
    return new InMemoryCache<V>(ttlMs);
  }
}
