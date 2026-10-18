import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { config } from './config.js';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

export const COOKIE_NAME = 'panel_session';

const SCRYPT_KEYLEN = 32;

/** Format hash: scrypt$<saltBase64>$<keyBase64>. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function sign(payload: string): string {
  return createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
}

/** Token sesi stateless: <expiresAt>.<nonce>.<hmac>, tahan restart server. */
export function createSessionToken(): string {
  const payload = `${Date.now() + config.sessionTtlMs}.${randomBytes(12).toString('base64url')}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const idx = token.lastIndexOf('.');
  if (idx < 0) return false;
  const payload = token.slice(0, idx);
  const mac = Buffer.from(token.slice(idx + 1));
  const expected = Buffer.from(sign(payload));
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) return false;
  const expiresAt = Number.parseInt(payload.split('.')[0] ?? '', 10);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

/**
 * Atribut Secure mengikuti protokol permintaan, bukan satu sakelar global.
 * Dengan begitu akses lewat HTTPS Tailscale tetap mendapat cookie Secure
 * walau panel juga dibuka lewat http:// di alamat IP tailnet.
 */
function useSecureCookie(c: Context): boolean {
  if (config.insecureCookies) return false;
  if (c.req.header('x-forwarded-proto') === 'https') return true;
  try {
    return new URL(c.req.url).protocol === 'https:';
  } catch {
    return false;
  }
}

export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure: useSecureCookie(c),
    sameSite: 'Strict',
    path: '/',
    maxAge: Math.floor(config.sessionTtlMs / 1000),
  });
}

export function clearSessionCookie(c: Context): void {
  setCookie(c, COOKIE_NAME, '', {
    httpOnly: true,
    secure: useSecureCookie(c),
    sameSite: 'Strict',
    path: '/',
    maxAge: 0,
  });
}

export function isAuthenticated(c: Context): boolean {
  return verifySessionToken(getCookie(c, COOKIE_NAME));
}

/** Semua /api, /ws, dan /preview wajib melewati ini. */
export const requireAuth: MiddlewareHandler = async (c, next) => {
  if (!isAuthenticated(c)) return c.json({ error: 'unauthorized' }, 401);
  await next();
};

/** Tolak permintaan yang berubah status dari origin lain (CSRF). */
export const checkOrigin: MiddlewareHandler = async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const origin = c.req.header('origin');
    if (origin && !isAllowedOrigin(origin, c.req.header('host'))) {
      return c.json({ error: 'origin tidak diizinkan' }, 403);
    }
  }
  await next();
};

export function isAllowedOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return false;
  if (config.allowedOrigins.includes(origin)) return true;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Rate limit sederhana per-IP untuk endpoint login. */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  check(key: string): boolean {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    entry.count += 1;
    if (this.hits.size > 1000) this.prune(now);
    return entry.count <= this.limit;
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private prune(now: number): void {
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }
}
