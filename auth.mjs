import { randomBytes, scrypt as derive, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { validateBasePath } from './public/base-path.js';
const scrypt = promisify(derive);
const WINDOW = 15 * 60_000, LIFETIME = 24 * 60 * 60_000;
export class AuthError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}
export async function readPassphrase(filename) {
  if (!filename) throw new Error('Private passphrase file required');
  const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 4096 || (stat.mode & 0o077) !== 0) throw new Error('Passphrase file must be private');
    return (await file.readFile('utf8')).replace(/\r?\n$/, '');
  } finally { await file.close(); }
}
export async function createAuth({ passphrase, origins, secure = true, now = Date.now, cookieName = 'ms_session', basePath = '' }) {
  validateBasePath(basePath);
  if (cookieName !== 'ms_session' && !/^ms_dev_[a-f0-9]{64}$/.test(cookieName)) throw new Error('Invalid instance cookie namespace');
  if (basePath) cookieName = 'ms_path_' + createHash('sha256').update(cookieName + '\0' + basePath).digest('hex');
  const cookiePrefix = `${cookieName}=`;
  if (typeof passphrase !== 'string' || passphrase.length < 12 || Buffer.byteLength(passphrase) > 1024) throw new Error('Passphrase must be 12–1024 bytes');
  if (!Array.isArray(origins) || !origins.length) throw new Error('Explicit allowed origins required');
  const allowed = new Set(origins.map(value => {
    const url = new URL(value);
    if (url.origin !== value || url.username || url.password ||
        (secure ? url.protocol !== 'https:' : !['http:', 'https:'].includes(url.protocol))) throw new Error('Allowed origins must be exact HTTPS origins');
    if (!secure && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Insecure cookies only allowed in isolated loopback tests');
    return value;
  }));
  const hosts = new Set([...allowed].map(o => new URL(o).host));
  const salt = randomBytes(32), verifier = await scrypt(passphrase, salt, 64);
  passphrase = undefined;
  const sessions = new Map(), attempts = [];
  const tokenHash = token => createHash('sha256').update(token).digest('hex');
  function prune() {
    const time = now();
    while (attempts.length && attempts[0].time <= time - WINDOW) attempts.shift();
    for (const [key, session] of sessions) if (session.expires <= time) sessions.delete(key);
  }
  function boundary(req, mutation = false) {
    if (!hosts.has(req.headers.host) || (req.headers.origin && !allowed.has(req.headers.origin)) ||
        (mutation && !allowed.has(req.headers.origin))) throw new AuthError('request-origin-denied', 403);
    if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) throw new AuthError('request-origin-denied', 403);
  }
  function session(req, mutation = false) {
    boundary(req, mutation); prune();
    const cookies = String(req.headers.cookie || '').split(';').map(x => x.trim()).filter(x => x.startsWith(cookiePrefix));
    if (cookies.length !== 1) throw new AuthError('login-required', 401);
    const token = cookies[0].slice(cookiePrefix.length);
    if (!/^[a-f0-9]{64}$/.test(token)) throw new AuthError('login-required', 401);
    const entry = sessions.get(tokenHash(token));
    if (!entry) throw new AuthError('login-required', 401);
    if (mutation && req.headers['x-csrf-token'] !== entry.csrf) throw new AuthError('csrf-denied', 403);
    return entry;
  }
  const cookie = (token, age = LIFETIME / 1000) => `${cookieName}=${token}; Path=${basePath}/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`;
  return {
    boundary, session,
    async login(req, input) {
      boundary(req, true); prune();
      const address = req.socket.remoteAddress; // Never trust X-Forwarded-For.
      if (attempts.length >= 30 || attempts.filter(a => a.address === address).length >= 5) throw new AuthError('login-rate-limited', 429);
      const attempt = { address, time: now() }; attempts.push(attempt); // Reserve before asynchronous derivation.
      if (typeof input !== 'string' || Buffer.byteLength(input) > 1024) throw new AuthError('invalid-login', 401);
      const candidate = await scrypt(input, salt, 64);
      if (!timingSafeEqual(candidate, verifier)) throw new AuthError('invalid-login', 401);
      const index = attempts.indexOf(attempt); if (index !== -1) attempts.splice(index, 1);
      prune();
      if (sessions.size >= 256) throw new AuthError('session-capacity', 503);
      const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
      sessions.set(tokenHash(token), { csrf, expires: now() + LIFETIME });
      return { csrf, cookie: cookie(token) };
    },
    logout(req) {
      session(req, true);
      const token = String(req.headers.cookie).split(';').map(x => x.trim()).find(x => x.startsWith(cookiePrefix)).slice(cookiePrefix.length);
      sessions.delete(tokenHash(token));
      return cookie('', 0);
    }
  };
}
