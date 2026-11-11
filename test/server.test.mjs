import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createServer } from '../server.mjs';
import { testApp } from '../scripts/fixture-support.mjs';
import { blankPlan, demoPlan, convertLegacy, forecast } from '../public/model.js';
import { demoPlan as legacyDemo } from '../public/legacy-model.js';
import { tagLibrary } from '../public/expense-tags.js';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const app = await testApp(), { base } = app;
test.after(() => app.close());
const put = (headers, expectedRevision, plan, extras = {}) => fetch(`${base}/api/plan`, { method: 'PUT', headers,
  body: JSON.stringify({ expectedRevision, plan, operation: 'replace', confirmed: true, ...extras }) });

test('health/assets/HEAD retain types and safety headers; private files never served', async () => {
  assert.deepEqual(await (await fetch(`${base}/healthz`)).json(), { status: 'ok', app: 'money-seasons', version: '0.3.0' });
  for (const [url, type] of [['/', 'text/html'], ['/app.js', 'text/javascript'], ['/model.js', 'text/javascript'], ['/demo-data.js', 'text/javascript'], ['/expense-tags.js', 'text/javascript'], ['/styles.css', 'text/css'], ['/favicon.svg', 'image/svg+xml']]) {
    const r = await fetch(`${base}${url}`);
    assert.equal(r.status, 200); assert.ok(r.headers.get('content-type').startsWith(type));
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff'); assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.ok(r.headers.get('content-security-policy').includes("frame-ancestors 'none'")); assert.ok((await r.text()).length);
  }
  for (const url of ['/', '/demo-data.js', '/expense-tags.js']) {
    const head = await fetch(base + url, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
    assert.equal(head.headers.get('x-content-type-options'), 'nosniff');
    if (url.endsWith('.js')) assert.match(head.headers.get('content-type'), /^text\/javascript/);
  }
  assert.equal((await fetch(base + '/unknown-asset.js')).status, 404);
  for (const url of ['/package.json', '/plan.json', '/data/plan.json', '/writer.lock', '/auth.mjs', '/.env', '/..%2fREADME.md', '/%2e%2e/README.md']) assert.equal((await fetch(base + url)).status, 404);
  for (const method of ['POST', 'PUT', 'DELETE']) assert.equal((await fetch(base, { method, body: 'synthetic' })).status, 405);
});

test('member sessions cannot reach the legacy unscoped finance API during staged integration', async t => {
  let reads = 0, writes = 0;
  const store = { read() { reads++; return { plan: { private: 'must-not-leak' } }; }, save() { writes++; return {}; } };
  const auth = { session() { return { csrf: 'synthetic', member: { id: 'lan', admin: true } }; } };
  const server = createServer({ store, auth });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.ok(![3080, 3081, 3443].includes(server.address().port));
  for (const [route, method] of [['/api/plan', 'GET'], ['/api/export', 'GET'], ['/api/plan', 'PUT']]) {
    const response = await fetch(base + route, { method });
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'member-finance-not-configured' });
  }
  assert.equal(reads, 0); assert.equal(writes, 0);
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

test('family demo is explicit revisioned replacement, persists exactly, stale replacement preserves bytes', async t => {
  const isolated = await testApp(); t.after(() => isolated.close());
  const a = await isolated.login(), b = await isolated.login();
  const get = headers => fetch(isolated.base + '/api/plan', { headers }).then(r => r.json());
  const save = (headers, revision, plan, confirmed = true) => fetch(isolated.base + '/api/plan', { method: 'PUT', headers,
    body: JSON.stringify({ expectedRevision: revision, plan, operation: 'replace', confirmed }) });
  const empty = await get(a); assert.equal(empty.revision, 0); assert.equal(empty.plan, null);
  const initial = { ...blankPlan(), name: 'Synthetic existing plan A' };
  assert.equal((await save(a, 0, initial)).status, 200);
  const file = path.join(isolated.directory, 'data', 'plan.json'), bytes = await readFile(file), before = await get(a);
  // Merely loading the app/module or rereading never seeds or replaces a plan.
  for (const url of ['/', '/app.js', '/model.js', '/demo-data.js']) assert.equal((await fetch(isolated.base + url)).status, 200);
  assert.deepEqual(await get(b), before); assert.deepEqual(await readFile(file), bytes);
  assert.equal((await save(a, before.revision, demoPlan(), false)).status, 400);
  assert.deepEqual(await get(a), before); assert.deepEqual(await readFile(file), bytes);
  const sample = await save(a, before.revision, demoPlan()); assert.equal(sample.status, 200);
  const saved = await sample.json(); assert.equal(saved.revision, before.revision + 1); assert.deepEqual(saved.plan, demoPlan());
  assert.deepEqual((await get(await isolated.login())).plan, demoPlan());
  assert.deepEqual((await isolated.store.read()).plan, demoPlan());
  const newer = { ...demoPlan(), name: 'Synthetic newer plan' };
  assert.equal((await save(b, saved.revision, newer)).status, 200); const newerBytes = await readFile(file);
  assert.equal((await save(a, saved.revision, demoPlan())).status, 409);
  assert.deepEqual(await readFile(file), newerBytes); assert.deepEqual((await get(a)).plan, newer);
  const exported = await (await fetch(isolated.base + '/api/export', { headers: a })).json(); assert.deepEqual(exported, newer);
});

test('expense definitions and assignments commit atomically, export/import losslessly and reject stale/invalid writes', async t => {
  const isolated = await testApp(); t.after(() => isolated.close());
  const a = await isolated.login(), b = await isolated.login();
  const get = () => fetch(isolated.base + '/api/plan', { headers: a }).then(r => r.json());
  const save = (headers, plan, revision, confirmed = true) => fetch(isolated.base + '/api/plan', { method: 'PUT', headers, body: JSON.stringify({ plan, expectedRevision: revision, operation: 'replace', confirmed }) });
  const original = demoPlan(); assert.equal((await save(a, original, 0)).status, 200);
  const before = await get(), filename = path.join(isolated.directory, 'data', 'plan.json'), bytes = await readFile(filename);
  for (const url of ['/expense-tags.js', '/api/plan', '/api/export']) assert.equal((await fetch(isolated.base + url, { headers: a })).status, 200);
  assert.deepEqual(await readFile(filename), bytes); assert.deepEqual(await get(), before);
  const candidate = structuredClone(original); candidate.tagDefinitions = tagLibrary(candidate);
  const expense = candidate.items.find(i => i.type === 'expense'), key = candidate.tagDefinitions[0];
  expense.tags = [{ keyId: key.id, valueId: key.values[0].id }];
  assert.equal((await save(a, candidate, before.revision, false)).status, 400); assert.deepEqual(await get(), before);
  const invalid = structuredClone(candidate); invalid.items.find(i => i.id === expense.id).tags[0].valueId = 'missing';
  assert.equal((await save(a, invalid, before.revision)).status, 400); assert.deepEqual(await readFile(filename), bytes);
  assert.equal((await save(a, candidate, before.revision)).status, 200);
  const acknowledged = await get(); assert.deepEqual(acknowledged.plan, candidate); assert.equal(acknowledged.revision, before.revision + 1);
  const stale = structuredClone(candidate); stale.tagDefinitions.push({ id: 'stale-key', name: 'Stale', values: [] });
  assert.equal((await save(b, stale, before.revision)).status, 409); assert.deepEqual(await get(), acknowledged);
  const exported = await (await fetch(isolated.base + '/api/export', { headers: a })).json(); assert.deepEqual(exported, candidate);
  assert.equal((await save(a, exported, acknowledged.revision)).status, 200); assert.deepEqual((await get()).plan, candidate);
  const deleted = structuredClone(candidate); deleted.tagDefinitions = [];
  const latest = await get(); assert.equal((await save(a, deleted, latest.revision)).status, 400); assert.deepEqual(await get(), latest);
  const explicitEmpty = structuredClone(original); explicitEmpty.tagDefinitions = [];
  assert.equal((await save(a, explicitEmpty, latest.revision)).status, 200); assert.deepEqual((await get()).plan.tagDefinitions, []);
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
