import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { openStore } from './persistence.mjs';
import { createAuth, readPassphrase } from './auth.mjs';
import { MAX_BYTES } from './public/model.js';

const root = fileURLToPath(new URL('./public/', import.meta.url));
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/model.js', ['model.js', 'text/javascript; charset=utf-8']],
  ['/demo-data.js', ['demo-data.js', 'text/javascript; charset=utf-8']],
  ['/legacy-model.js', ['legacy-model.js', 'text/javascript; charset=utf-8']],
  ['/amount-input.js', ['amount-input.js', 'text/javascript; charset=utf-8']],
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

export function createServer({ store, auth } = {}) {
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
        if (!store || !auth) throw error('not-configured', 503);
        if (pathname === '/api/login' && req.method === 'POST') {
          auth.boundary(req, true);
          const input = await body(req, 4096), login = await auth.login(req, input?.passphrase);
          res.setHeader('Set-Cookie', login.cookie); json(200, { csrf: login.csrf }); return;
        }
        const mutation = !['GET', 'HEAD'].includes(req.method);
        const session = auth.session(req, mutation);
        if (pathname === '/api/session' && req.method === 'GET') { json(200, { csrf: session.csrf }); return; }
        if (pathname === '/api/logout' && req.method === 'POST') {
          res.setHeader('Set-Cookie', auth.logout(req)); json(200, { loggedOut: true }); return;
        }
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
      if (pathname === '/healthz') { json(200, { status: 'ok', app: 'money-seasons', version: '0.3.0' }); return; }
      const asset = assets.get(pathname);
      if (!asset) { res.writeHead(404); res.end('Not found'); return; }
      const data = await readFile(path.join(root, asset[0]));
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
  const auth = await createAuth({ passphrase: await readPassphrase(env.MONEY_SEASONS_PASSPHRASE_FILE),
    origins: env.MONEY_SEASONS_ORIGINS?.split(',').map(s => s.trim()) });
  const store = await openStore(env.MONEY_SEASONS_DATA_DIR);
  const server = createServer({ store, auth });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(env.PORT || 3080), env.HOST || '127.0.0.1', resolve); });
  } catch (e) { await store.close(); throw e; }
  return { server, async close() { await new Promise(resolve => server.close(resolve)); await store.close(); } };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const app = await startApplication();
    console.log('Money Seasons listening; private HTTPS proxy required.');
    let stopping = false;
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
      if (!stopping) { stopping = true; await app.close(); }
    });
  } catch {
    console.error('Startup refused. Check private storage, passphrase, allowed HTTPS origins, and writer lock. No configuration or data logged.');
    process.exitCode = 1;
  }
}
