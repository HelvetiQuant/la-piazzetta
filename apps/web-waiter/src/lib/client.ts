// Client HTTP condiviso: login JWT (email/password o PIN), refresh automatico
// sul primo 401, e fetch autenticato verso l'API reale (niente header dev-auth
// in produzione). VITE_API_URL punta al backend sul portatile in LAN, es.
// http://192.168.1.50:3000/api/v1 (default: stesso host, porta 3000).

const API =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  `${location.protocol}//${location.hostname}:3000/api/v1`;
const DEFAULT_VENUE = (import.meta.env.VITE_VENUE_ID as string | undefined) || 'venue_piazzetta';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
  tokenType: 'Bearer';
}
export interface SessionUser {
  userId: string;
  venueId: string;
  roles: string[];
}

const STORAGE_KEY = 'piazzetta.tokens';

function loadTokens(): Tokens | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
}
function saveTokens(t: Tokens | null) {
  tokens = t;
  if (t) localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
  else localStorage.removeItem(STORAGE_KEY);
}

function decodeUser(accessToken: string): SessionUser | null {
  try {
    const [, payload] = accessToken.split('.');
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return { userId: claims.sub, venueId: claims.venueId, roles: claims.roles ?? [] };
  } catch {
    return null;
  }
}

let tokens: Tokens | null = loadTokens();
let refreshing: Promise<Tokens> | null = null;

export function currentUser(): SessionUser | null {
  return tokens ? decodeUser(tokens.accessToken) : null;
}
export function isLoggedIn(): boolean {
  return !!tokens;
}
export function venueId(): string {
  return currentUser()?.venueId || DEFAULT_VENUE;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `Errore ${res.status}`);
  return data as T;
}

export async function loginPassword(email: string, password: string, venue = DEFAULT_VENUE): Promise<void> {
  saveTokens(await postJson<Tokens>('/auth/login', { venueId: venue, email, password }));
}
export async function loginPin(userId: string, pin: string, venue = DEFAULT_VENUE): Promise<void> {
  saveTokens(await postJson<Tokens>('/auth/login-pin', { venueId: venue, userId, pin }));
}
export function logout(): void {
  const t = tokens;
  saveTokens(null);
  if (t) postJson('/auth/logout', { refreshToken: t.refreshToken }).catch(() => {});
}

async function doRefresh(): Promise<Tokens> {
  if (!tokens) throw new Error('Non autenticato');
  if (!refreshing) {
    refreshing = postJson<Tokens>('/auth/refresh', { refreshToken: tokens.refreshToken })
      .then((t) => {
        saveTokens(t);
        return t;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

/** Fetch autenticato con refresh trasparente al primo 401. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!tokens) throw new Error('Non autenticato');

  const run = async (): Promise<Response> =>
    fetch(`${API}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${tokens!.accessToken}`,
        ...(init.headers ?? {}),
      },
    });

  let res = await run();
  if (res.status === 401) {
    try {
      await doRefresh();
      res = await run();
    } catch {
      saveTokens(null);
      throw new Error('Sessione scaduta, effettua di nuovo il login');
    }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `Errore ${res.status}`);
  return data as T;
}
