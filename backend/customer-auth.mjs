import { hmac } from './domain.mjs';

const enabled = value => value === true || value === 'true';
const strong = value => typeof value === 'string' && value.length >= 32 && value.length <= 4096;
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const stmt = (db, sql, ...args) => db.prepare(sql).bind(...args);
export const CUSTOMER_CODE_MINUTES = 10;
export const CUSTOMER_SESSION_SECONDS = 8 * 60 * 60;
export const CUSTOMER_CSRF_SECONDS = 15 * 60;
export const CUSTOMER_COOKIE = '__Host-exactmec_customer';
export const CUSTOMER_LOCAL_COOKIE = 'exactmec_customer_dev';

/** No environment flag/header can enable the localhost-only test bypass. */
export function customerPortalConfiguration(env = {}, context = {}) {
  if (!env.DB || !strong(env.CUSTOMER_AUTH_SECRET) || !strong(env.RATE_LIMIT_SECRET) || !strong(env.CONTACT_HASH_SECRET) || typeof context.sendCode !== 'function') return null;
  try {
    const site = new URL(env.SITE_ORIGIN);
    if (site.origin !== env.SITE_ORIGIN || site.username || site.password || site.pathname !== '/' || site.search || site.hash) return null;
    const local = context.localSynthetic === true && ['localhost', '127.0.0.1'].includes(site.hostname) && ['http:', 'https:'].includes(site.protocol);
    if (!local && (site.origin !== 'https://exactmec.com' || !enabled(env.CUSTOMER_PORTAL_ENABLED) || !enabled(env.RELEASE) || !enabled(env.LEGAL_APPROVED))) return null;
    return Object.freeze({ origin: site.origin, localSynthetic: local, cookieName: local ? CUSTOMER_LOCAL_COOKIE : CUSTOMER_COOKIE });
  } catch { return null; }
}

export const customerEmailHash = (env, email) => hmac(env.CONTACT_HASH_SECRET, `email:${email.toLowerCase()}`);
export const customerAuthHash = (env, purpose, value) => hmac(env.CUSTOMER_AUTH_SECRET, `${purpose}:${value}`);
export function customerRandomToken(prefix = '') {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return prefix + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function customerRandomCode() {
  const random = new Uint32Array(1);
  do { crypto.getRandomValues(random); } while (random[0] >= 4294000000);
  return String(random[0] % 1000000).padStart(6, '0');
}
export const customerChallengeValid = value => typeof value === 'string' && /^cc_[A-Za-z0-9_-]{43}$/.test(value);
export const customerSessionTokenValid = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
export function customerCookieToken(request, config) {
  const values = (request.headers.get('Cookie') || '').split(';').map(part => part.trim()).filter(part => part.startsWith(config.cookieName + '='));
  if (values.length !== 1) return null;
  const token = values[0].slice(config.cookieName.length + 1);
  return customerSessionTokenValid(token) ? token : null;
}
export function customerSessionCookie(config, token, expired = false) {
  return `${config.cookieName}=${expired ? '' : token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${expired ? 0 : CUSTOMER_SESSION_SECONDS}${config.localSynthetic ? '' : '; Secure'}`;
}
export function customerConstantEqual(a, b) {
  if (!hex(a) || !hex(b)) return false;
  let different = 0;
  for (let index = 0; index < 64; index++) different |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return different === 0;
}
export async function customerIssueCsrf(session, env, config) {
  const expires = Math.min(Math.floor(session.expires_at / 1000), Math.floor(Date.now() / 1000) + CUSTOMER_CSRF_SECONDS);
  return `${expires}.${await customerAuthHash(env, 'customer-csrf', `${config.origin}:${session.token_hash}:${expires}`)}`;
}
export async function customerVerifyCsrf(token, session, env, config) {
  if (typeof token !== 'string' || !/^\d{10}\.[a-f0-9]{64}$/.test(token)) return false;
  const [rawExpires, signature] = token.split('.');
  const expires = Number(rawExpires); const current = Math.floor(Date.now() / 1000);
  if (expires <= current || expires > current + CUSTOMER_CSRF_SECONDS || expires > Math.floor(session.expires_at / 1000)) return false;
  return customerConstantEqual(signature, await customerAuthHash(env, 'customer-csrf', `${config.origin}:${session.token_hash}:${rawExpires}`));
}
export async function customerReadSession(request, env, config) {
  const token = customerCookieToken(request, config);
  if (!token) return null;
  const tokenHash = await customerAuthHash(env, 'customer-session', `${config.origin}:${token}`);
  return stmt(env.DB, 'SELECT token_hash,email_hash,created_at,expires_at FROM customer_sessions WHERE token_hash=? AND expires_at>?', tokenHash, Date.now()).first();
}
export async function customerCleanup(env) {
  const current = Date.now();
  await env.DB.batch([
    stmt(env.DB, 'DELETE FROM customer_rate_buckets WHERE expires_at<=?', current),
    stmt(env.DB, 'DELETE FROM customer_auth_challenges WHERE expires_at<=?', current),
    stmt(env.DB, 'DELETE FROM customer_sessions WHERE expires_at<=?', current),
  ]);
}
export async function customerRate(env, purpose, value, { limit, seconds }) {
  const duration = seconds * 1000;
  const start = Math.floor(Date.now() / duration) * duration;
  const bucket = await hmac(env.RATE_LIMIT_SECRET, `customer:${purpose}:${start}:${value}`);
  const row = await stmt(env.DB, 'INSERT INTO customer_rate_buckets(bucket_hash,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(bucket_hash) DO UPDATE SET attempts=attempts+1 RETURNING attempts', bucket, start + duration).first();
  return { allowed: row.attempts <= limit, retryAfter: Math.max(1, Math.ceil((start + duration - Date.now()) / 1000)) };
}
export async function customerReserveEmail(env, emailHash) {
  const bucket = await hmac(env.RATE_LIMIT_SECRET, `customer:email-cooldown:${emailHash}`);
  const current = Date.now();
  const row = await stmt(env.DB, 'INSERT INTO customer_rate_buckets(bucket_hash,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(bucket_hash) DO UPDATE SET attempts=1,expires_at=excluded.expires_at WHERE customer_rate_buckets.expires_at<=? RETURNING bucket_hash', bucket, current + 60000, current).first();
  return !!row;
}
