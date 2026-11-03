import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { testApp } from '../scripts/fixture-support.mjs';
import { blankPlan, convertLegacy, forecast } from '../public/model.js';
import { demoPlan as legacyDemo } from '../public/legacy-model.js';
import { writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const app = await testApp(), { base } = app;
test.after(() => app.close());
const put = (headers, expectedRevision, plan, extras = {}) => fetch(`${base}/api/plan`, { method: 'PUT', headers,
  body: JSON.stringify({ expectedRevision, plan, operation: 'replace', confirmed: true, ...extras }) });

test('health/assets/HEAD retain types and safety headers; private files never served', async () => {
  assert.deepEqual(await (await fetch(`${base}/healthz`)).json(), { status: 'ok', app: 'money-seasons', version: '0.3.0' });
  for (const [url, type] of [['/', 'text/html'], ['/app.js', 'text/javascript'], ['/model.js', 'text/javascript'], ['/styles.css', 'text/css'], ['/favicon.svg', 'image/svg+xml']]) {
    const r = await fetch(`${base}${url}`);
    assert.equal(r.status, 200); assert.ok(r.headers.get('content-type').startsWith(type));
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff'); assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.ok(r.headers.get('content-security-policy').includes("frame-ancestors 'none'")); assert.ok((await r.text()).length);
  }
  const head = await fetch(base, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
  for (const url of ['/package.json', '/plan.json', '/data/plan.json', '/writer.lock', '/auth.mjs', '/.env', '/..%2fREADME.md', '/%2e%2e/README.md']) assert.equal((await fetch(base + url)).status, 404);
  for (const method of ['POST', 'PUT', 'DELETE']) assert.equal((await fetch(base, { method, body: 'synthetic' })).status, 405);
});

test('malformed URLs do not crash server', async () => {
  const status = await new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: app.server.address().port, path: 'http://[invalid' }, r => { r.resume(); r.on('end', () => resolve(r.statusCode)); });
    req.on('error', reject); req.end();
  });
  assert.equal(status, 400); assert.equal((await fetch(base + '/healthz')).status, 200);
});

test('finance endpoints disclose nothing without auth; Origin and CSRF required', async () => {
  for (const endpoint of ['/api/plan', '/api/export', '/api/session']) assert.equal((await fetch(base + endpoint)).status, 401);
  assert.equal((await put({ Origin: base, 'Content-Type': 'application/json' }, 0, blankPlan())).status, 401);
  const headers = await app.login();
  assert.equal((await put({ ...headers, 'X-CSRF-Token': '' }, 0, blankPlan())).status, 403);
  assert.equal((await put({ ...headers, Origin: 'https://evil.test' }, 0, blankPlan())).status, 403);
  assert.equal((await put(headers, 0, blankPlan(), { confirmed: false })).status, 400);
  assert.equal((await put(headers, 0, blankPlan(), { operation: 'edit' })).status, 400);
  assert.equal((await fetch(base + '/api/plan', { headers })).status, 200);
});

test('two clients CAS conflicts, explicit reapply, session restore, plan-only export and logout', async () => {
  const a = await app.login(), b = await app.login();
  const start = await (await fetch(base + '/api/plan', { headers: a })).json();
  const first = await put(a, start.revision, { ...blankPlan(), name: 'Family A' }); assert.equal(first.status, 200);
  const saved = await first.json();
  assert.equal((await put(b, start.revision, { ...blankPlan(), name: 'Family B' })).status, 409);
  assert.equal((await (await fetch(base + '/api/plan', { headers: b })).json()).plan.name, 'Family A');
  assert.equal((await put(b, saved.revision, { ...saved.plan, name: 'Reapplied B' })).status, 200);
  const exported = await (await fetch(base + '/api/export', { headers: b })).json();
  assert.equal(exported.name, 'Reapplied B'); assert.equal(exported.version, 3);
  for (const key of ['revision', 'csrf', 'passphrase', 'session']) assert.equal(key in exported, false);
  const session = await (await fetch(base + '/api/session', { headers: b })).json(); assert.equal(session.csrf, b['X-CSRF-Token']);
  assert.equal((await fetch(base + '/api/logout', { method: 'POST', headers: b })).status, 200);
  assert.equal((await fetch(base + '/api/plan', { headers: b })).status, 401);
});

test('invalid JSON, schema, unsupported version, totals and oversized bodies preserve revision', async () => {
  const headers = await app.login(), state = await (await fetch(base + '/api/plan', { headers })).json();
  for (const plan of [null, {}, { ...blankPlan(), version: 9 }, { ...blankPlan(), openingCash: 1.5 }]) assert.equal((await put(headers, state.revision, plan)).status, 400);
  assert.equal((await fetch(base + '/api/plan', { method: 'PUT', headers, body: '{broken' })).status, 400);
  assert.equal((await fetch(base + '/api/plan', { method: 'PUT', headers, body: JSON.stringify({ data: 'x'.repeat(1_000_001) }) })).status, 413);
  assert.deepEqual(await (await fetch(base + '/api/plan', { headers })).json(), state);
});

test('legacy API exports original actuals, rejects silent conversion and archives explicit replacement', async t => {
  const isolated = await testApp(); t.after(() => isolated.close());
  const old = legacyDemo(), headers = await isolated.login();
  await writeFile(path.join(isolated.directory, 'data', 'plan.json'), JSON.stringify({ schemaVersion: 'money-seasons-store/v1', revision: 5, plan: old }), { mode: 0o600 });
  const get = endpoint => fetch(isolated.base + endpoint, { headers });
  const state = await (await get('/api/plan')).json(); assert.equal(state.migrationRequired, true);
  assert.deepEqual(await (await get('/api/export')).json(), old);
  const save = migrationConfirmed => fetch(isolated.base + '/api/plan', { method: 'PUT', headers, body: JSON.stringify({ plan: convertLegacy(old, { confirmed: true }), expectedRevision: 5, operation: 'replace', confirmed: true, migrationConfirmed }) });
  assert.equal((await save(false)).status, 400);
  assert.equal((await save(true)).status, 200);
  assert.ok((await readdir(path.join(isolated.directory, 'data'))).some(n => n.startsWith('original-')));
});

test('API saves/exports full out-of-window schedules and history across window changes', async t => {
  const isolated = await testApp(); t.after(() => isolated.close()); const headers = await isolated.login();
  const p = blankPlan(); p.objects = [{ id: 'family', name: 'Synthetic', type: 'group' }];
  p.items = [{ id: 'annual', objectId: 'family', name: 'Synthetic long schedule', description: '', type: 'expense', status: 'confirmed', amount: 10,
    recurrence: { kind: 'interval', anchor: '2027-10', end: '2037-10', everyMonths: 12 }, amountChanges: [{ month: '2030-10', amount: 20 }] }];
  const save = (plan, revision) => fetch(isolated.base + '/api/plan', { method: 'PUT', headers, body: JSON.stringify({ plan, expectedRevision: revision, operation: 'replace', confirmed: true }) });
  let response = await save(p, 0); assert.equal(response.status, 200); let state = await response.json();
  assert.deepEqual(state.plan, p); assert.equal(forecast(state.plan).reduce((n, m) => n + m.expense, 0), 10);
  response = await save({ ...p, startMonth: '2028-01', endMonth: '2028-06' }, state.revision); assert.equal(response.status, 200); state = await response.json();
  assert.deepEqual(state.plan.items, p.items); assert.equal(forecast(state.plan).reduce((n, m) => n + m.expense, 0), 0);
  response = await save({ ...state.plan, startMonth: '2030-01', endMonth: '2030-12' }, state.revision); assert.equal(response.status, 200); state = await response.json();
  assert.deepEqual(state.plan.items, p.items); assert.equal(forecast(state.plan).reduce((n, m) => n + m.expense, 0), 20);
  const exported = await (await fetch(isolated.base + '/api/export', { headers })).json(); assert.deepEqual(exported, state.plan);
});

test('lost acknowledgement reconciles via reread; failed save never responds success', async t => {
  let fail = false;
  const isolated = await testApp({ hook: async stage => { if (fail && stage === 'after-rename') throw new Error('synthetic'); } });
  t.after(() => isolated.close()); const headers = await isolated.login(); fail = true;
  const r = await fetch(isolated.base + '/api/plan', { method: 'PUT', headers, body: JSON.stringify({ plan: blankPlan(), expectedRevision: 0, operation: 'replace', confirmed: true }) });
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /uncertain/);
  const actual = await (await fetch(isolated.base + '/api/plan', { headers })).json();
  assert.equal(actual.revision, 1); assert.deepEqual(actual.plan, blankPlan());
});
