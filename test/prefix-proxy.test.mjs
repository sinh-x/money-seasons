import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { testApp } from '../scripts/fixture-support.mjs';
import { apiPath } from '../public/base-path.js';
import { blankPlan } from '../public/model.js';

test('browser API join admits only validated prefix and known routes', () => {
  assert.equal(apiPath('/nested/app_2', '/api/plan'), '/nested/app_2/api/plan');
  assert.equal(apiPath('', '/api/logout'), '/api/logout');
  for (const route of ['//evil.test', '/api/../plan', '/api/plan?x', 'https://evil.test', '/lichtaichinh/api/plan']) assert.throws(() => apiPath('/lichtaichinh', route));
  assert.throws(() => apiPath('/bad/', '/api/plan'));
});
test('strip-once proxy renders inert assets/home and retains lifecycle, CSP and boundary checks', async t => {
  const root = await testApp(), app = await testApp({ basePath: '/lichtaichinh' });
  t.after(() => root.close()); t.after(() => app.close());
  const html = await fetch(app.base + '/');
  assert.equal(html.headers.get('content-security-policy'), (await fetch(root.base)).headers.get('content-security-policy'));
  const source = await html.text();
  assert.match(source, /data-base-path="\/lichtaichinh"/);
  assert.ok(!source.includes('{{BASE_PATH}}')); assert.ok(!source.includes('<base'));
  for (const name of ['favicon.svg', 'styles.css', 'app.js']) assert.ok(source.includes(`="/lichtaichinh/${name}"`));
  assert.match(source, /href="\/lichtaichinh\/" class="brand"/);
  for (const route of ['/app.js', '/base-path.js', '/model.js', '/legacy-model.js', '/demo-data.js', '/expense-tags.js']) assert.equal((await fetch(app.base + route)).status, 200);
  for (const route of ['/', '/lichtaichinh']) {
    const r = await fetch(app.origin + route + '?next=%2Fsafe&x=1', { redirect: 'manual', method: 'POST', body: 'synthetic' });
    assert.equal(r.status, 308); assert.equal(r.headers.get('location'), '/lichtaichinh/?next=%2Fsafe&x=1');
  }
  for (const route of ['/api/plan', '/app.js', '/lichtaichinhx/', '/lichtaichinh/lichtaichinh/api/plan']) assert.equal((await fetch(app.origin + route)).status, 404);
  assert.equal((await fetch(app.origin + '/healthz')).status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${app.server.address().port}/healthz`)).status, 200);
  const headers = await app.login();
  const put = (revision, name) => fetch(app.base + '/api/plan', { method: 'PUT', headers, body: JSON.stringify({ plan: { ...blankPlan(), name }, expectedRevision: revision, operation: 'replace', confirmed: true }) });
  assert.equal((await put(0, 'Synthetic prefix')).status, 200);
  assert.equal((await put(0, 'Stale')).status, 409);
  const state = await (await fetch(app.base + '/api/plan', { headers })).json();
  assert.equal(state.revision, 1); assert.equal(state.plan.name, 'Synthetic prefix');
  assert.deepEqual(await (await fetch(app.base + '/api/export', { headers })).json(), state.plan);
  for (const extra of [{ Origin: 'https://evil.test' }, { Origin: '', 'X-Forwarded-Host': new URL(app.origin).host }, { Host: 'evil.test', 'X-Forwarded-Host': new URL(app.origin).host }, { 'X-CSRF-Token': '' }]) {
    // Node fetch replaces Host; use the wire-level client so this really sends the attack.
    const status = await new Promise((resolve, reject) => {
      const req = http.request(app.base + '/api/logout', { method: 'POST', headers: { ...headers, ...extra } }, res => {
        res.resume(); res.on('end', () => resolve(res.statusCode));
      });
      req.on('error', reject); req.end('{}');
    });
    assert.equal(status, 403);
  }
  const forged = await fetch(app.base + '/', { headers: { 'X-Forwarded-Prefix': '/evil' } });
  assert.match(await forged.text(), /data-base-path="\/lichtaichinh"/);
  const logout = await fetch(app.base + '/api/logout', { method: 'POST', headers, body: '{}' });
  assert.equal(logout.status, 200); assert.match(logout.headers.get('set-cookie'), /Path=\/lichtaichinh\/;/);
  for (const route of ['/api/session', '/api/plan', '/api/export']) assert.equal((await fetch(app.base + route, { headers })).status, 401);
});
