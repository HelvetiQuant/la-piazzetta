/**
 * Verifica runtime dei blocchi auth / coda / entitlement (Node >= 22).
 *   node --experimental-strip-types --loader ./tests/ts-resolve.mjs tests/auth-queue-entitlement.test.mts
 */

import { signJwt, verifyJwt, parseBearer } from '../apps/api/src/auth/jwt.util.ts';
import { hashSecret, verifySecret, sha256Hex, randomToken } from '../apps/api/src/auth/password.util.ts';
import { AuthService } from '../apps/api/src/auth/auth.service.ts';
import { InMemoryQueue } from '../apps/api/src/queue/queue.ts';
import { InMemoryCache } from '../apps/api/src/entitlement/cache.ts';
import { resolveEntitlements, hasModule, hasFeature, limitOf } from '../apps/api/src/entitlement/entitlement.logic.ts';

let passed = 0;
let failed = 0;
function ok(cond: boolean, msg: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`FAIL: ${msg}`);
  }
}
function eq(a: unknown, b: unknown, msg: string) {
  ok(JSON.stringify(a) === JSON.stringify(b), `${msg} (atteso ${JSON.stringify(b)}, ottenuto ${JSON.stringify(a)})`);
}

// ---------- JWT ----------
const secret = 'test-secret';
const tok = signJwt({ sub: 'u1', venueId: 'v1', roles: ['OWNER'], typ: 'access' }, secret, 60);
const v = verifyJwt(tok, secret);
ok(v.valid && v.claims.sub === 'u1' && v.claims.venueId === 'v1', 'JWT roundtrip valido');
ok(verifyJwt(tok, 'wrong').valid === false, 'JWT segreto errato rifiutato');
ok(verifyJwt(tok + 'x', secret).valid === false, 'JWT manomesso rifiutato');
const expired = signJwt({ sub: 'u1', venueId: 'v1', roles: [] }, secret, -1);
const ev = verifyJwt(expired, secret);
ok(ev.valid === false && ev.reason === 'expired', 'JWT scaduto rifiutato');
eq(parseBearer('Bearer abc.def.ghi'), 'abc.def.ghi', 'parseBearer estrae il token');
eq(parseBearer('Basic xxx'), null, 'parseBearer ignora non-Bearer');

// ---------- password / PIN ----------
const h = hashSecret('S3greta!');
ok(verifySecret('S3greta!', h), 'password corretta verificata');
ok(!verifySecret('sbagliata', h), 'password errata rifiutata');
ok(!verifySecret('x', null), 'hash assente -> false');
eq(sha256Hex('abc'), sha256Hex('abc'), 'sha256 deterministico');
ok(randomToken() !== randomToken(), 'randomToken diverso ad ogni chiamata');

// ---------- entitlement.logic ----------
const start = resolveEntitlements('START');
ok(hasModule(start, 'inventory') && !hasModule(start, 'suppliers'), 'START: inventory sì, suppliers no');
const pro = resolveEntitlements('PRO');
ok(hasModule(pro, 'suppliers') && !hasModule(pro, 'ai'), 'PRO: suppliers sì, ai no');
const proAi = resolveEntitlements('PRO', ['ai-suite']);
ok(hasModule(proAi, 'ai') && hasFeature(proAi, 'ai-forecast'), 'PRO + ai-suite: ai attivo');
eq(proAi.rejectedAddons, [], 'ai-suite accettato su PRO (dip. suppliers presente)');
const startAi = resolveEntitlements('START', ['ai-suite']);
ok(!hasModule(startAi, 'ai') && startAi.rejectedAddons.length === 1, 'ai-suite rifiutato su START (manca suppliers)');
const marketingNoDep = resolveEntitlements('PRO', ['marketing']);
ok(startAi.rejectedAddons[0].reason.includes('suppliers'), 'motivo rifiuto cita la dipendenza');
ok(marketingNoDep.rejectedAddons.length === 1, 'marketing rifiutato senza ai');
const marketingOk = resolveEntitlements('PRO', ['ai-suite', 'marketing']);
ok(hasModule(marketingOk, 'marketing'), 'marketing ok con ai-suite prima');
const unknown = resolveEntitlements('PRO', ['inesistente']);
eq(unknown.rejectedAddons[0].reason, 'add-on sconosciuto', 'add-on sconosciuto segnalato');
const ent = resolveEntitlements('ENTERPRISE');
eq(limitOf(ent, 'tables'), Infinity, 'ENTERPRISE tables illimitato');
eq(limitOf(pro, 'tables'), 60, 'PRO tables = 60');

// ---------- cache TTL ----------
const cache = new InMemoryCache<number>(50);
await cache.set('k', 7);
eq(await cache.get('k'), 7, 'cache hit');
await cache.invalidate('k');
eq(await cache.get('k'), undefined, 'cache invalidata');
await cache.set('k2', 9, 10);
await new Promise((r) => setTimeout(r, 25));
eq(await cache.get('k2'), undefined, 'cache scaduta per TTL');

// ---------- coda in-memory ----------
{
  const q = new InMemoryQueue();
  const seen: string[] = [];
  q.process<string>('emails', async (d) => {
    seen.push(d);
  });
  await q.add('emails', 'a');
  await q.add('emails', 'b');
  await q.drain();
  eq(seen.sort(), ['a', 'b'], 'coda: processa i job accodati');

  // no-op se nessun consumatore
  await q.add('nessuno', 'x');
  await q.drain();
  ok(true, 'coda: add senza consumatore non lancia');

  // retry: fallisce 2 volte poi ok
  const q2 = new InMemoryQueue();
  let attempts = 0;
  q2.process<number>('flaky', async () => {
    attempts++;
    if (attempts < 3) throw new Error('boom');
  });
  await q2.add('flaky', 1, { maxAttempts: 3 });
  await q2.drain();
  eq(attempts, 3, 'coda: retry fino al successo (3 tentativi)');
}

// ---------- AuthService con Prisma mockato ----------
function mockPrisma() {
  const users: any[] = [];
  const refreshTokens: any[] = [];
  let seq = 0;
  return {
    _users: users,
    _refreshTokens: refreshTokens,
    user: {
      async findFirst({ where }: any) {
        return users.find((u) => Object.entries(where).every(([k, val]) => u[k] === val)) ?? null;
      },
      async findUnique({ where }: any) {
        return users.find((u) => u.id === where.id) ?? null;
      },
    },
    refreshToken: {
      async create({ data }: any) {
        const rec = { id: `rt${++seq}`, revokedAt: null, ...data };
        refreshTokens.push(rec);
        return rec;
      },
      async findFirst({ where }: any) {
        return refreshTokens.find((r) => Object.entries(where).every(([k, val]) => r[k] === val)) ?? null;
      },
      async update({ where, data }: any) {
        const r = refreshTokens.find((x) => x.id === where.id);
        Object.assign(r, data);
        return r;
      },
      async updateMany({ where, data }: any) {
        let n = 0;
        for (const r of refreshTokens) {
          if (Object.entries(where).every(([k, val]) => r[k] === val)) {
            Object.assign(r, data);
            n++;
          }
        }
        return { count: n };
      },
    },
  } as any;
}

{
  const prisma = mockPrisma();
  prisma._users.push({ id: 'u1', venueId: 'v1', roles: ['WAITER'], passwordHash: hashSecret('pw'), pin: hashSecret('1234') });
  const auth = new AuthService(prisma, { secret: 's', accessTtlSec: 60, refreshTtlSec: 3600 });

  prisma._users[0].email = 'a@b.it';
  const login = await auth.loginWithPassword('v1', 'a@b.it', 'pw');
  ok(!!login.accessToken && !!login.refreshToken, 'login password: token emessi');
  ok(verifyJwt(login.accessToken, 's').valid, 'login: access token valido');
  eq(prisma._refreshTokens.length, 1, 'login: refresh token persistito (hash)');
  ok(prisma._refreshTokens[0].tokenHash !== login.refreshToken, 'refresh token salvato come hash, non in chiaro');

  await auth.loginWithPassword('v1', 'a@b.it', 'sbagliata').then(() => ok(false, 'pw errata doveva fallire')).catch(() => ok(true, 'login: password errata rifiutata'));

  const pinLogin = await auth.loginWithPin('v1', 'u1', '1234');
  ok(!!pinLogin.accessToken, 'login PIN riuscito');

  const refreshed = await auth.refresh(login.refreshToken);
  ok(!!refreshed.accessToken, 'refresh: nuova coppia emessa');
  ok(prisma._refreshTokens[0].revokedAt !== null, 'refresh: vecchio token revocato (rotazione)');
  await auth.refresh(login.refreshToken).then(() => ok(false, 'refresh riuso doveva fallire')).catch(() => ok(true, 'refresh: token già usato/revocato rifiutato'));

  await auth.revoke(refreshed.refreshToken);
  await auth.refresh(refreshed.refreshToken).then(() => ok(false, 'logout doveva invalidare')).catch(() => ok(true, 'logout: refresh revocato'));
}

console.log(`\nAuth/Queue/Entitlement — asserzioni superate: ${passed}, fallite: ${failed}`);
if (failed > 0) process.exit(1);
