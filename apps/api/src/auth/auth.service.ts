/**
 * AuthService — login email/password e login con PIN su device condivisi,
 * emissione di access token (JWT HS256) + refresh token opaco con rotazione e
 * revoca. Il refresh token è memorizzato SOLO come hash SHA-256.
 */

import type { PrismaClient } from '@prisma/client';
import { signJwt, verifyJwt, verifyJwtMulti, loadSecretKeys, type JwtClaims, type SecretKey } from './jwt.util';
import { verifySecret, sha256Hex, randomToken } from './password.util';

export interface AuthConfig {
  secret: string;
  accessTtlSec: number;
  refreshTtlSec: number;
  /** Lista di segreti per la rotazione zero-downtime (corrente + precedenti). */
  secretKeys: SecretKey[];
  /** kid del segreto corrente (usato in firma). */
  currentKid?: string;
}

export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const secretKeys = loadSecretKeys(env);
  const secret = env.JWT_SECRET ?? 'dev-insecure-secret-change-me';
  return {
    secret,
    accessTtlSec: Number(env.JWT_ACCESS_TTL_SEC) || 15 * 60,
    refreshTtlSec: Number(env.JWT_REFRESH_TTL_SEC) || 30 * 24 * 3600,
    secretKeys,
    currentKid: secretKeys.length > 0 ? secretKeys[0].kid : undefined,
  };
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
  tokenType: 'Bearer';
}

interface AuthUser {
  id: string;
  venueId: string;
  roles: string[];
  passwordHash?: string | null;
  pin?: string | null;
}

export class AuthError extends Error {
  readonly status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

export class AuthService {
  private readonly cfg: AuthConfig;
  private readonly prisma: PrismaClient;
  constructor(prisma: PrismaClient, cfg?: Partial<AuthConfig>) {
    this.prisma = prisma;
    this.cfg = { ...loadAuthConfig(), ...cfg };
  }

  /** Emette access token (JWT) + refresh token (opaco, hash su DB). */
  async issueTokens(user: AuthUser): Promise<IssuedTokens> {
    const accessToken = signJwt(
      { sub: user.id, venueId: user.venueId, roles: user.roles, typ: 'access' },
      this.cfg.secret,
      this.cfg.accessTtlSec,
      undefined,
      this.cfg.currentKid,
    );
    const refreshToken = randomToken();
    const expiresAt = new Date(Date.now() + this.cfg.refreshTtlSec * 1000);
    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: sha256Hex(refreshToken), expiresAt },
    });
    return { accessToken, refreshToken, expiresInSec: this.cfg.accessTtlSec, tokenType: 'Bearer' };
  }

  /** Login con email + password (nel contesto di un venue). */
  async loginWithPassword(venueId: string, email: string, password: string): Promise<IssuedTokens> {
    const user = await this.prisma.user.findFirst({ where: { venueId, email } });
    if (!user || !verifySecret(password, user.passwordHash)) {
      throw new AuthError('Credenziali non valide');
    }
    return this.issueTokens(user);
  }

  /** Login con PIN su device condiviso: venue + userId + PIN. */
  async loginWithPin(venueId: string, userId: string, pin: string): Promise<IssuedTokens> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, venueId } });
    if (!user || !verifySecret(pin, user.pin)) {
      throw new AuthError('PIN non valido');
    }
    return this.issueTokens(user);
  }

  /** Rotazione del refresh token: revoca il vecchio ed emette una nuova coppia. */
  async refresh(refreshToken: string): Promise<IssuedTokens> {
    const tokenHash = sha256Hex(refreshToken);
    const record = await this.prisma.refreshToken.findFirst({ where: { tokenHash } });
    if (!record || record.revokedAt || record.expiresAt.getTime() <= Date.now()) {
      throw new AuthError('Refresh token non valido o scaduto');
    }
    const user = await this.prisma.user.findUnique({ where: { id: record.userId } });
    if (!user) throw new AuthError('Utente inesistente');

    await this.prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
    return this.issueTokens(user);
  }

  /** Logout: revoca il refresh token corrente. Idempotente. */
  async revoke(refreshToken: string): Promise<void> {
    const tokenHash = sha256Hex(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Verifica un access token e ritorna i claims (o lancia AuthError). */
  verifyAccess(token: string): JwtClaims {
    // Rotazione: se ci sono più segreti, usa verifyJwtMulti; altrimenti verifyJwt.
    const res = this.cfg.secretKeys.length > 0
      ? verifyJwtMulti(token, this.cfg.secretKeys)
      : verifyJwt(token, this.cfg.secret);
    if (!res.valid) throw new AuthError(`Token non valido: ${res.reason}`);
    return res.claims;
  }
}
