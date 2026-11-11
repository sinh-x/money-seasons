// Pure authorization plus isolated HTTP/CAS integration; never real finance data.
import test from 'node:test';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer } from '../server.mjs';
import { createAuth } from '../auth.mjs';
import { createMembershipDirectory, hashPassword } from '../membership.mjs';
import { openHouseholdStore } from '../persistence.mjs';
import { createHouseholdService } from '../household-service.mjs';
import assert from 'node:assert/strict';
import { blankPlan } from '../public/model.js';
import { blankHousehold, individualPlan, setSharing, applyRecordChange, projectHome } from '../public/household-model.js';
const item = (id = 'income') => ({ id, objectId: 'object', name: 'Income', description: '', type: 'income', status: 'confirmed', amount: 20_000_000,
  recurrence: { kind: 'interval', anchor: '2026-11', end: '2027-12', everyMonths: 1 }, amountChanges: [] });
function fixture() {
  const plan = { ...blankPlan(), objects: [{ id: 'object', name: 'Visible', type: 'person' }, { id: 'secret-object', name: 'Private', type: 'person' }], items: [item()],
    accounts: [{ id: 'cash', name: 'Cash' }], snapshots: [{ id: 'snapshot', accountId: 'cash', date: '2026-11-01', amount: 0 }] };
  return { ...blankHousehold(), individuals: [individualPlan('lan', plan), individualPlan('minh', blankPlan())] };
}
const edit = () => ({ ownerId: 'lan', kind: 'items', id: 'income', action: 'update', value: { ...item(), amount: 22_000_000 }, confirmed: true });

async function memberApp(t, { hook, privateIncome = false } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-scoped-api-'));
  const password = 'Synthetic only long password';
  const verifier = await hashPassword(password);
  const users = { version: 1, revision: 1, users: ['lan', 'minh'].map(id => ({ id, username: id, name: id, enabled: true, credentialVersion: 1, password: verifier })) };
  const roles = { version: 1, adminIds: ['minh'] }, membership = createMembershipDirectory(users, roles);
  const store = await openHouseholdStore(root, { hook });
  await store.transact(0, () => privateIncome ? setSharing(fixture(), 'lan', 'lan', 'items', 'income', false) : fixture());
  const household = createHouseholdService({ store, membership });
  // Late binding the authenticated test-only port keeps origin checks real.
  let auth;
  const server = createServer({ household, auth: { boundary: (...args) => auth.boundary(...args), login: (...args) => auth.login(...args), session: (...args) => auth.session(...args), logout: (...args) => auth.logout(...args) } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.ok(![3080, 3081, 3443].includes(server.address().port));
  auth = await createAuth({ membership, origins: [base], secure: false });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await store.close(); await fs.rm(root, { recursive: true, force: true }); });
  async function login(username) {
    const response = await fetch(base + '/api/login', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    assert.equal(response.status, 200);
    const value = await response.json(); assert.equal(value.member.id, username);
    return { Origin: base, Cookie: response.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': value.csrf, 'Content-Type': 'application/json' };
  }
  const request = (headers, route, data) => fetch(base + route, { headers, ...(data ? { method: 'POST', body: JSON.stringify(data) } : {}) });
  const change = (headers, command, expectedRevision = 1) => request(headers, '/api/records', { expectedRevision, command });
  return { store, root, membership, users, roles, login, request, change, household };
}

test('scoped HTTP reads/exports never include another private plan or unrelated metadata, even for admin', async t => {
  const a = await memberApp(t, { privateIncome: true }), lan = await a.login('lan'), minh = await a.login('minh');
  const own = await (await a.request(lan, '/api/plan')).json();
  assert.equal(own.scope, 'individual'); assert.equal(own.ownerId, 'lan'); assert.equal(own.plan.items.length, 1);
  for (const route of ['/api/plan', '/api/export', '/api/home', '/api/home/export']) {
    const response = await a.request(minh, route); assert.equal(response.status, 200);
    const raw = await response.text();
    for (const forbidden of ['secret-object', 'Private', 'Income', 'password', 'credentialVersion', 'individuals']) assert.ok(!raw.includes(forbidden), `${route} leaked ${forbidden}`);
  }
  for (const route of ['/api/plan?ownerId=lan', '/api/export?ownerId=lan', '/api/home?scope=all']) assert.equal((await a.request(minh, route)).status, 400);
  const before = await fs.readFile(path.join(a.root, 'plan.json'));
  assert.equal((await a.change(minh, edit())).status, 403);
  assert.deepEqual(await fs.readFile(path.join(a.root, 'plan.json')), before);
  assert.equal((await a.request({}, '/api/home')).status, 401);
});

test('scoped HTTP edits have real CSRF/confirmation/current privacy/CAS and source-only responses', async t => {
  const a = await memberApp(t), lan = await a.login('lan'), minh = await a.login('minh');
  const before = await fs.readFile(path.join(a.root, 'plan.json'));
  for (const command of [{ ...edit(), confirmed: false }, { ...edit(), value: { ...item(), shared: true } }, { ...edit(), value: { ...item(), objectId: 'secret-object' } }]) assert.equal((await a.change(minh, command)).status, 403);
  assert.equal((await a.change({ ...minh, 'X-CSRF-Token': '' }, edit())).status, 403);
  assert.deepEqual(await fs.readFile(path.join(a.root, 'plan.json')), before);
  const edited = await a.change(minh, edit()); assert.equal(edited.status, 200);
  assert.deepEqual(await edited.json(), { revision: 2 });
  assert.equal((await (await a.request(lan, '/api/plan')).json()).plan.items[0].amount, 22_000_000);
  assert.equal((await a.change(lan, edit())).status, 409);
  const unshare = { expectedRevision: 2, ownerId: 'lan', kind: 'items', id: 'income', shared: false };
  assert.equal((await a.request(minh, '/api/sharing', unshare)).status, 403);
  assert.equal((await a.request(lan, '/api/sharing', unshare)).status, 200);
  assert.equal((await (await a.request(minh, '/api/home')).json()).plan.items.length, 0);
  assert.equal((await a.change(minh, edit(), 3)).status, 403);
  assert.equal((await a.change(minh, edit(), 2)).status, 409);
  assert.equal((await a.request(minh, '/api/records', { expectedRevision: 3, command: edit(), roles: ['admin'] })).status, 400);
});

test('member API rejects oversized, whole-Home and forged ownership writes without persistence', async t => {
  const a = await memberApp(t), lan = await a.login('lan'), minh = await a.login('minh');
  const before = await fs.readFile(path.join(a.root, 'plan.json'));
  assert.equal((await a.request(lan, '/api/records', { data: 'x'.repeat(1_000_001) })).status, 413);
  assert.equal((await a.request(lan, '/api/plan', { expectedRevision: 1, household: fixture(), confirmed: true })).status, 404);
  assert.equal((await a.change(minh, { ...edit(), action: 'create', id: 'foreign', value: item('foreign') })).status, 403);
  assert.equal((await a.request(lan, '/api/sharing', { expectedRevision: 1, ownerId: 'lan', kind: 'items', id: 'income', shared: false, roles: ['admin'] })).status, 400);
  assert.deepEqual(await fs.readFile(path.join(a.root, 'plan.json')), before);
  const create = { ownerId: 'minh', kind: 'accounts', id: 'own-cash', action: 'create', value: { id: 'own-cash', name: 'Synthetic cash' }, confirmed: true };
  assert.equal((await a.change(minh, create)).status, 200);
  const view = await (await a.request(lan, '/api/home')).json();
  assert.ok(view.provenance.some(p => p.ownerId === 'minh' && p.sourceId === 'own-cash'));
  assert.equal((await a.change(lan, { ownerId: 'minh', kind: 'accounts', id: 'own-cash', action: 'delete', confirmed: true }, 2)).status, 200);
  assert.equal((await (await a.request(minh, '/api/plan')).json()).plan.accounts.length, 0);
});

test('revocation before rename is checked again; stale sessions cannot acknowledge writes', async t => {
  let active = false, entered, release;
  const gate = new Promise(resolve => { release = resolve; }), reached = new Promise(resolve => { entered = resolve; });
  const a = await memberApp(t, { hook: async stage => { if (active && stage === 'before-rename') { entered(); await gate; } } });
  const minh = await a.login('minh');
  active = true;
  const saving = a.change(minh, edit()); await reached;
  const next = structuredClone(a.users); next.users.find(u => u.id === 'minh').credentialVersion++;
  a.membership.replace(next, a.roles); release();
  assert.equal((await saving).status, 401);
  assert.equal((await a.store.read()).revision, 1);
  assert.equal((await a.request(minh, '/api/home')).status, 401);
});

test('competing scoped edits have one winner; unknown write durability blocks retry', async t => {
  let inject = false;
  const a = await memberApp(t, { hook: async stage => { if (inject && stage === 'after-rename') throw new Error('synthetic'); } });
  const lan = await a.login('lan'), minh = await a.login('minh');
  const results = await Promise.all([a.change(lan, edit()), a.change(minh, edit())]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  inject = true;
  assert.equal((await a.change(lan, edit(), 2)).status, 503);
  const state = await (await a.request(lan, '/api/plan')).json();
  assert.equal(state.revision, 3); assert.equal(state.durabilityUncertain, true);
  inject = false;
  assert.equal((await a.change(lan, edit(), 3)).status, 503);
});

test('confirmed collaborator edits one source, retaining immutable owner and privacy', () => {
  const h = fixture(), before = JSON.stringify(h), result = applyRecordChange(h, 'minh', edit());
  assert.equal(JSON.stringify(h), before); assert.equal(result.individuals[0].ownerId, 'lan');
  assert.equal(result.individuals[0].plan.items[0].amount, 22_000_000);
  assert.deepEqual(result.individuals[0].sharing, h.individuals[0].sharing);
  assert.equal(result.individuals[1].plan.items.length, 0);
  assert.equal(projectHome(result).plan.items.length, 1);
});

test('cancel, missing identity, forged fields and foreign creation reject without changing original', () => {
  const h = fixture(), before = JSON.stringify(h);
  for (const command of [
    { ...edit(), confirmed: false }, { ...edit(), confirmed: undefined }, { ...edit(), shared: true },
    { ...edit(), value: { ...item(), ownerId: 'minh' } }, { ...edit(), value: { ...item(), id: 'other' } },
    { ...edit(), action: 'create', id: 'new', value: item('new') }, { ...edit(), ownerId: 'absent' },
    { ...edit(), kind: 'objects', id: 'object', value: { id: 'object', name: 'Changed', type: 'person' } }
  ]) assert.throws(() => applyRecordChange(h, 'minh', command));
  assert.throws(() => applyRecordChange(h, 'absent', edit()));
  assert.equal(JSON.stringify(h), before);
});

test('current privacy defeats stale edits; admin names confer no private access', () => {
  const h = setSharing(fixture(), 'lan', 'lan', 'items', 'income', false), before = JSON.stringify(h);
  for (const actor of ['minh', 'admin']) assert.throws(() => applyRecordChange(h, actor, edit()));
  assert.equal(JSON.stringify(h), before);
  assert.equal(applyRecordChange(h, 'lan', edit()).individuals[0].plan.items[0].amount, 22_000_000);
});

test('collaborators cannot attach private metadata, reparent histories or delete account history silently', () => {
  const h = fixture();
  assert.throws(() => applyRecordChange(h, 'minh', { ...edit(), value: { ...item(), objectId: 'secret-object' } }));
  assert.throws(() => applyRecordChange(h, 'minh', { ownerId: 'lan', kind: 'accounts', id: 'cash', action: 'delete', confirmed: true }));
  assert.throws(() => applyRecordChange(h, 'minh', { ownerId: 'lan', kind: 'snapshots', id: 'snapshot', action: 'update', value: { id: 'snapshot', accountId: 'elsewhere', date: '2026-11-01', amount: 1 }, confirmed: true }));
  const withBalance = applyRecordChange(h, 'minh', { ownerId: 'lan', kind: 'snapshots', id: 'snapshot', action: 'update', value: { id: 'snapshot', accountId: 'cash', date: '2026-11-01', amount: 100 }, confirmed: true });
  assert.equal(withBalance.individuals[0].plan.snapshots[0].amount, 100);
  const privateCash = setSharing(h, 'lan', 'lan', 'accounts', 'cash', false);
  assert.throws(() => applyRecordChange(privateCash, 'minh', { ownerId: 'lan', kind: 'snapshots', id: 'snapshot', action: 'delete', confirmed: true }));
});

test('shared deletion removes only selected source; owner-created records default shared', () => {
  const h = fixture();
  const deleted = applyRecordChange(h, 'minh', { ownerId: 'lan', kind: 'items', id: 'income', action: 'delete', confirmed: true });
  assert.equal(deleted.individuals[0].plan.items.length, 0); assert.equal(deleted.individuals[0].sharing.items.length, 0);
  assert.equal(deleted.individuals[0].plan.objects.length, 2); assert.deepEqual(deleted.individuals[1], h.individuals[1]);
  const added = applyRecordChange(h, 'lan', { ownerId: 'lan', kind: 'items', id: 'new', action: 'create', value: item('new'), confirmed: true });
  assert.deepEqual(added.individuals[0].sharing.items.at(-1), { id: 'new', shared: true });
  assert.equal(added.individuals[0].plan.items.at(-1).id, 'new');
  const duplicate = { ownerId: 'lan', kind: 'items', id: 'income', action: 'create', value: item(), confirmed: true };
  assert.throws(() => applyRecordChange(h, 'lan', duplicate));
});

test('history additions follow parent permission, reject date collisions and never transfer owners', () => {
  const h = fixture(), command = { ownerId: 'lan', kind: 'snapshots', id: 'next', action: 'create', value: { id: 'next', accountId: 'cash', date: '2026-11-02', amount: 100 }, confirmed: true };
  const next = applyRecordChange(h, 'minh', command);
  assert.equal(next.individuals[0].plan.snapshots.length, 2); assert.equal(next.individuals[1].plan.snapshots.length, 0);
  assert.throws(() => applyRecordChange(h, 'minh', { ...command, value: { ...command.value, date: '2026-11-01' } }));
  assert.throws(() => applyRecordChange(setSharing(h, 'lan', 'lan', 'accounts', 'cash', false), 'minh', command));
});
