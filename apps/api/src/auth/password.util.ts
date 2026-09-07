/**
 * Hashing di password e PIN con `scrypt` nativo (salt casuale per record).
 * Formato memorizzato: `scrypt$<N>$<saltB64>$<hashB64>`. Verifica in tempo
 * costante. Nessuna dipendenza esterna.
 */

import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

const N = 16384; // costo scrypt
const KEYLEN = 32;

/** Crea l'hash di una password/PIN in chiaro. */
export function hashSecret(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, KEYLEN, { N });
  return `scrypt$${N}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/** Verifica un valore in chiaro contro un hash memorizzato. */
export function verifySecret(plain: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  const salt = Buffer.from(parts[2], 'base64');
  const expected = Buffer.from(parts[3], 'base64');
  if (!Number.isFinite(n) || salt.length === 0 || expected.length === 0) return false;
  const got = scryptSync(plain, salt, expected.length, { N: n });
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/**
 * Hash SHA-256 (esadecimale) usato per i refresh token: nel DB non salviamo mai
 * il token in chiaro, solo il suo digest, così un dump del DB non è riusabile.
 */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Token opaco casuale (per refresh token). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
