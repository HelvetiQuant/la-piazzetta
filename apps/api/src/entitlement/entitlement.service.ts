/**
 * EntitlementService — risolve piano+add-on di un venue in entitlements,
 * con cache (TTL) e invalidazione al cambio piano.
 *
 * Sorgente: `Venue.plan` (stringa) + tabella `VenueAddon` (add-on attivi).
 */

import type { PrismaClient } from '@prisma/client';
import { resolveEntitlements, type Entitlements } from './entitlement.logic';
import { InMemoryCache, resolveCache, type Cache } from './cache';

export class EntitlementService {
  private readonly prisma: PrismaClient;
  private readonly cache: Cache<Entitlements>;
  private readonly ttlMs: number;
  constructor(prisma: PrismaClient, cache: Cache<Entitlements> = new InMemoryCache<Entitlements>(), ttlMs = 5 * 60 * 1000) {
    this.prisma = prisma;
    this.cache = cache;
    this.ttlMs = ttlMs;
  }

  /** Factory asincrona: risolve la cache Redis se REDIS_URL è impostata. */
  static async create(prisma: PrismaClient, ttlMs = 5 * 60 * 1000): Promise<EntitlementService> {
    const cache = await resolveCache<Entitlements>(process.env.REDIS_URL, ttlMs);
    return new EntitlementService(prisma, cache, ttlMs);
  }

  /** Entitlements del venue (cache-aside). */
  async forVenue(venueId: string): Promise<Entitlements> {
    const cached = await this.cache.get(venueId);
    if (cached) return cached;

    const venue = await this.prisma.venue.findUnique({ where: { id: venueId } });
    const addons = await this.prisma.venueAddon.findMany({ where: { venueId, active: true }, select: { addonId: true } });
    const ent = resolveEntitlements(venue?.plan, addons.map((a) => a.addonId));

    await this.cache.set(venueId, ent, this.ttlMs);
    return ent;
  }

  /** Invalida la cache di un venue (da chiamare al cambio piano/add-on). */
  async invalidate(venueId: string): Promise<void> {
    await this.cache.invalidate(venueId);
  }
}

// Nota: il singleton `getEntitlementService` è stato rimosso in v0.11 per
// evitare una seconda istanza con cache separata da quella Redis-backed creata
// da `EntitlementService.create()` nell'entrypoint. L'istanza va passata
// esplicitamente ai moduli route (vedi `registerEntitlementRoutes(app, prisma, deps, svc)`).
