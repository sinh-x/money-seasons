import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.mjs';
import http from 'node:http';

const server = createServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => new Promise(resolve => server.close(resolve)));

test('health endpoint reports application health', async () => {
  const r = await fetch(`${base}/healthz`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { status: 'ok', app: 'money-seasons', version: '0.1.0' });
});

test('application and assets have appropriate types and safety headers', async () => {
  for (const [url, type] of [['/', 'text/html'], ['/app.js', 'text/javascript'], ['/model.js', 'text/javascript'], ['/styles.css', 'text/css'], ['/favicon.svg', 'image/svg+xml']]) {
    const r = await fetch(`${base}${url}`);
    assert.equal(r.status, 200);
    assert.ok(r.headers.get('content-type').startsWith(type));
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.ok(r.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
    assert.ok((await r.text()).length > 0);
  }
});

test('HEAD has no response body', async () => {
  const r = await fetch(base, { method: 'HEAD' });
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '');
});

test('unknown paths, repository files and traversal are never served', async () => {
  for (const url of ['/missing', '/package.json', '/server.mjs', '/.env', '/%2e%2e/README.md', '/..%2fREADME.md', '/public/index.html']) {
    assert.equal((await fetch(`${base}${url}`)).status, 404);
  }
});

test('malformed absolute request URLs cannot crash the server', async () => {
  const status = await new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port: server.address().port, path: 'http://[invalid', method: 'GET' }, response => {
      response.resume(); response.on('end', () => resolve(response.statusCode));
    });
    request.on('error', reject); request.end();
  });
  assert.equal(status, 400);
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
});

test('writes are not accepted; there is no financial-data API', async () => {
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const r = await fetch(`${base}/`, { method, body: 'synthetic' });
    assert.equal(r.status, 405);
    assert.equal(r.headers.get('allow'), 'GET, HEAD');
  }
});
