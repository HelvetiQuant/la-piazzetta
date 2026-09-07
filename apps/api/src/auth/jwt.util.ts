/**
 * Firma/verifica JWT **HS256** con `crypto` nativo — nessuna dipendenza esterna.
 * Claims applicativi: { sub, venueId, roles, iat, exp }.
 *
 * Supporta la **rotazione zero-downtime** del segreto: la verifica prova una
 * lista di segreti (corrente + precedenti) identificati da `kid` nell'header.
 * La firma usa sempre il segreto corrente (primo della lista).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface JwtClaims {
  sub: string; // userId
  venueId: string;
  roles: string[];
  iat: number; // secondi epoch
  exp: number; // secondi epoch
  typ?: 'access' | 'refresh';
}

/** Segreto etichettato: `kid` identifica il segreto nell'header JWT. */
export interface SecretKey {
  kid: string; // identificatore del segreto (inserito nell'header JWT)
  secret: string;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlJson(obj: unknown): string {
  return b64url(JSON.stringify(obj));
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function sign(data: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(data).digest());
}

/**
 * Firma un JWT HS256. `claims` senza iat/exp: calcolati da `ttlSec`.
 * Se `kid` è fornito, viene inserito nell'header JWT per consentire la
 * verifica con il segreto corretto durante la rotazione.
 */
export function signJwt(
  claims: Omit<JwtClaims, 'iat' | 'exp'>,
  secret: string,
  ttlSec: number,
  now: number = Math.floor(Date.now() / 1000),
  kid?: string,
): string {
  const header: Record<string, string> = { alg: 'HS256', typ: 'JWT' };
  if (kid) header.kid = kid;
  const payload: JwtClaims = { ...claims, iat: now, exp: now + ttlSec };
  const head = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  return `${head}.${sign(head, secret)}`;
}

export type VerifyResult =
  | { valid: true; claims: JwtClaims }
  | { valid: false; reason: 'format' | 'signature' | 'expired' | 'malformed' };

/** Verifica firma e scadenza. Confronto firma in tempo costante. */
export function verifyJwt(token: string, secret: string, now: number = Math.floor(Date.now() / 1000)): VerifyResult {
  const parts = (token ?? '').split('.');
  if (parts.length !== 3) return { valid: false, reason: 'format' };
  const [head, body, sig] = parts;

  const expected = sign(`${head}.${body}`, secret);
  const a = fromB64url(sig);
  const b = fromB64url(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { valid: false, reason: 'signature' };

  let claims: JwtClaims;
  try {
    claims = JSON.parse(fromB64url(body).toString('utf8'));
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  if (!claims || typeof claims.exp !== 'number' || typeof claims.sub !== 'string') {
    return { valid: false, reason: 'malformed' };
  }
  if (now >= claims.exp) return { valid: false, reason: 'expired' };
  return { valid: true, claims };
}

/**
 * Verifica un JWT contro una **lista di segreti** (rotazione zero-downtime).
 *
 * Strategia:
 *  1. Legge `kid` dall'header JWT; se presente, prova solo il segreto con
 *     quel `kid` (match esatto → veloce e sicuro).
 *  2. Se `kid` non è presente o non corrisponde a nessun segreto, prova tutti
 *     i segreti nell'ordine dato (compatibilità con token pre-rotazione senza
 *     `kid`).
 *  3. Il primo segreto che verifica la firma vince; se nessuno verifica,
 *     ritorna `signature`.
 */
export function verifyJwtMulti(token: string, keys: SecretKey[], now: number = Math.floor(Date.now() / 1000)): VerifyResult {
  const parts = (token ?? '').split('.');
  if (parts.length !== 3) return { valid: false, reason: 'format' };
  const [head, body, sig] = parts;

  // Estrai kid dall'header per il match diretto
  let kid: string | undefined;
  try {
    const header = JSON.parse(fromB64url(head).toString('utf8'));
    kid = header?.kid;
  } catch {
    return { valid: false, reason: 'malformed' };
  }

  const candidates = kid ? keys.filter((k) => k.kid === kid) : keys;
  const tryKeys = candidates.length > 0 ? candidates : keys;

  const a = fromB64url(sig);
  for (const key of tryKeys) {
    const expected = sign(`${head}.${body}`, key.secret);
    const b = fromB64url(expected);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      let claims: JwtClaims;
      try {
        claims = JSON.parse(fromB64url(body).toString('utf8'));
      } catch {
        return { valid: false, reason: 'malformed' };
      }
      if (!claims || typeof claims.exp !== 'number' || typeof claims.sub !== 'string') {
        return { valid: false, reason: 'malformed' };
      }
      if (now >= claims.exp) return { valid: false, reason: 'expired' };
      return { valid: true, claims };
    }
  }
  return { valid: false, reason: 'signature' };
}

/**
 * Parsa `JWT_SECRET` (corrente) e `JWT_SECRET_PREVIOUS` (opzionale, per la
 * rotazione) in una lista di `SecretKey`. Se `JWT_SECRET_KID` è impostato,
 * lo usa come `kid` del segreto corrente; altrimenti genera un kid derivato.
 */
export function loadSecretKeys(env: NodeJS.ProcessEnv = process.env): SecretKey[] {
  const keys: SecretKey[] = [];
  const current = env.JWT_SECRET;
  if (current) {
    const kid = (env.JWT_SECRET_KID as string) || 'current';
    keys.push({ kid, secret: current });
  }
  const previous = env.JWT_SECRET_PREVIOUS;
  if (previous) {
    const kid = (env.JWT_SECRET_PREVIOUS_KID as string) || 'previous';
    keys.push({ kid, secret: previous });
  }
  return keys;
}

/** Estrae il token da un header Authorization: Bearer xxx. */
export function parseBearer(header: string | undefined | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1] : null;
}
