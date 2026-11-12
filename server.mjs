import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { openStore, openHouseholdStore } from './persistence.mjs';
import { openMembershipManager } from './membership-service.mjs';
import { createHouseholdService } from './household-service.mjs';
import { createAuth, readPassphrase } from './auth.mjs';
import { MAX_BYTES } from './public/model.js';
import { validateBasePath } from './public/base-path.js';

const root = fileURLToPath(new URL('./public/', import.meta.url));
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/model.js', ['model.js', 'text/javascript; charset=utf-8']],
  ['/member-ui.js', ['member-ui.js', 'text/javascript; charset=utf-8']],
  ['/base-path.js', ['base-path.js', 'text/javascript; charset=utf-8']],
  ['/demo-data.js', ['demo-data.js', 'text/javascript; charset=utf-8']],
  ['/legacy-model.js', ['legacy-model.js', 'text/javascript; charset=utf-8']],
  ['/amount-input.js', ['amount-input.js', 'text/javascript; charset=utf-8']],
  ['/expense-tags.js', ['expense-tags.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']]
]);
const error = (code, status) => Object.assign(new Error(code), { code, status });
async function body(req, limit) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw error('json-required', 400);
  const raw = await new Promise((resolve, reject) => {
    let size = 0, chunks = [], rejected = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) { chunks = []; rejected = true; reject(error('body-too-large', 413)); }
      else if (!rejected) chunks.push(chunk);
    });
    req.on('end', () => { if (!rejected) resolve(Buffer.concat(chunks)); });
    req.on('error', () => reject(error('request-failed', 400)));
  });
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); }
  catch { throw error('invalid-json', 400); }
}

export function createServer({ store, household, administration, auth, basePath = '' } = {}) {
  validateBasePath(basePath);
  const escapedPrefix = basePath.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const server = http.createServer({ maxHeaderSize: 16_384 }, async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    res.setHeader('Cache-Control', 'no-store');
    const json = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify(value));
    };
    let pathname;
    try { pathname = new URL(req.url, 'http://localhost').pathname; }
    catch { res.writeHead(400); res.end('Bad request'); return; }
    try {
      if (pathname.startsWith('/api/')) {
        if ((!store && !household) || !auth) throw error('not-configured', 503);
        if (pathname === '/api/login' && req.method === 'POST') {
          auth.boundary(req, true);
          const input = await body(req, 4096), login = await auth.login(req, household ? input : input?.passphrase);
          res.setHeader('Set-Cookie', login.cookie); json(200, { csrf: login.csrf, ...(login.member ? { member: login.member } : {}) }); return;
        }
        const mutation = !['GET', 'HEAD'].includes(req.method);
        const session = auth.session(req, mutation);
        if (pathname === '/api/session' && req.method === 'GET') { json(200, { csrf: session.csrf, ...(session.member ? { member: session.member } : {}) }); return; }
        if (pathname === '/api/logout' && req.method === 'POST') {
          res.setHeader('Set-Cookie', auth.logout(req)); json(200, { loggedOut: true }); return;
        }
        if (household) {
          if (!session.member) throw error('member-login-required', 401);
          // No query-supplied owner, scope, role or alternate export is accepted.
          if (new URL(req.url, 'http://localhost').search) throw error('invalid-query', 400);
          if (administration && req.method === 'GET' && ['/api/member', '/api/users'].includes(pathname)) {
            json(200, await administration[pathname === '/api/member' ? 'self' : 'list'](session.member)); return;
          }
          if (administration && req.method === 'POST' && ['/api/users', '/api/password'].includes(pathname)) {
            const input = await body(req, 4096), actor = auth.session(req, true).member;
            json(200, await administration[pathname === '/api/users' ? 'manage' : 'password'](actor, input)); return;
          }
          const reads = { '/api/plan': 'individual', '/api/home': 'home' };
          const exports = { '/api/export': 'individual', '/api/home/export': 'home' };
          if (req.method === 'GET' && Object.hasOwn(reads, pathname)) {
            json(200, await household.read(session.member, reads[pathname])); return;
          }
          if (req.method === 'GET' && Object.hasOwn(exports, pathname)) {
            const value = await household.export(session.member, exports[pathname]);
            res.setHeader('Content-Disposition', 'attachment; filename="money-seasons.json"'); json(200, value); return;
          }
          if (req.method === 'GET' && pathname === '/api/migration') { json(200, await household.migration(session.member)); return; }
          const commands = { '/api/records': 'change', '/api/sharing': 'share', '/api/individual': 'edit', '/api/period': 'period', '/api/migration': 'migrate' };
          if (req.method === 'POST' && Object.hasOwn(commands, pathname)) {
            const input = await body(req, MAX_BYTES);
            const actor = auth.session(req, true).member; // Body parsing can outlive a revocation.
            json(200, await household[commands[pathname]](actor, input)); return;
          }
          // No whole-Home PUT, raw store, foreign-plan or generic patch endpoint.
          throw error('api-method-or-path-not-found', 404);
        }
        // Never let a staged member-auth provider expose legacy whole-plan routes.
        if (session.member) throw error('member-finance-not-configured', 503);
        if (pathname === '/api/plan' && req.method === 'GET') { json(200, await store.read()); return; }
        if (pathname === '/api/export' && req.method === 'GET') {
          const { plan } = await store.read();
          res.setHeader('Content-Disposition', 'attachment; filename="money-seasons.json"'); json(200, plan); return;
        }
        if (pathname === '/api/plan' && req.method === 'PUT') {
          const input = await body(req, MAX_BYTES);
          if (!input || !['edit', 'replace'].includes(input.operation) || !input.plan ||
              (input.operation === 'replace' && input.confirmed !== true) ||
              (input.expectedRevision === 0 && input.operation !== 'replace')) throw error('confirmation-required', 400);
          json(200, await store.save(input.plan, input.expectedRevision, { migrationConfirmed: input.operation === 'replace' && input.confirmed === true && input.migrationConfirmed === true })); return;
        }
        throw error('api-method-or-path-not-found', 404);
      }
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return;
      }
      if (pathname === '/healthz') { json(200, { status: 'ok', app: 'money-seasons', version: '0.4.1' }); return; }
      const asset = assets.get(pathname);
      if (!asset) { res.writeHead(404); res.end('Not found'); return; }
      const raw = await readFile(path.join(root, asset[0]));
      const data = pathname === '/' ? raw.toString('utf8').replaceAll('{{BASE_PATH}}', escapedPrefix).replaceAll('{{AUTH_MODE}}', household ? 'members' : 'legacy') : raw;
      res.writeHead(200, { 'Content-Type': asset[1] }); res.end(req.method === 'HEAD' ? undefined : data);
    } catch (e) {
      // Never serialize exception text, payloads, secrets, or filesystem paths.
      const known = Number.isInteger(e.status) && e.status >= 400 && e.status <= 599;
      json(known ? e.status : 503, { error: known ? e.code : 'application-unavailable' });
    }
  });
  server.requestTimeout = 15_000; server.headersTimeout = 10_000;
  return server;
}

export async function startApplication(env = process.env) {
  const basePath = validateBasePath(env.MONEY_SEASONS_BASE_PATH);
  const mode = env.MONEY_SEASONS_AUTH_MODE || 'legacy';
  if (!['legacy', 'members'].includes(mode)) throw new Error('invalid-auth-mode');
  let administration, store;
  try {
    if (mode === 'members') administration = await openMembershipManager(env.MONEY_SEASONS_MEMBERS_DIR, { rolesFile: env.MONEY_SEASONS_ROLES_FILE });
    const auth = await createAuth({ ...(administration ? { membership: administration } : { passphrase: await readPassphrase(env.MONEY_SEASONS_PASSPHRASE_FILE) }),
      origins: env.MONEY_SEASONS_ORIGINS?.split(',').map(s => s.trim()), cookieName: env.MONEY_SEASONS_COOKIE_NAME, basePath });
    store = await (administration ? openHouseholdStore : openStore)(env.MONEY_SEASONS_DATA_DIR, { allowMigration: !!administration });
    const household = administration ? createHouseholdService({ store, membership: administration }) : undefined;
    const server = createServer({ store, household, administration, auth, basePath });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(env.PORT || 3080), env.HOST || '127.0.0.1', resolve); });
    return { server, reloadRoles: async () => administration?.reloadRoles(), async close() { await new Promise(resolve => server.close(resolve)); await store.close(); await administration?.close(); } };
  } catch (e) { await store?.close(); await administration?.close(); throw e; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const app = await startApplication();
    console.log('Money Seasons listening; private HTTPS proxy required.');
    process.on('SIGHUP', () => { app.reloadRoles().catch(() => console.error('Private role reload refused; member access fails closed.')); });
    let stopping = false;
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
      if (!stopping) { stopping = true; await app.close(); }
    });
  } catch {
    console.error('Startup refused. Check private storage, passphrase, allowed HTTPS origins, and writer lock. No configuration or data logged.');
    process.exitCode = 1;
  }
}
