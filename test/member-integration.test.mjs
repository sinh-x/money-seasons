import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openHouseholdStore } from '../persistence.mjs';
import { createHouseholdService } from '../household-service.mjs';
import { createMembershipDirectory, hashPassword } from '../membership.mjs';
import { blankHousehold, individualPlan, setSharing } from '../public/household-model.js';
import { blankPlan } from '../public/model.js';
import { startApplication } from '../server.mjs';
const password = 'Synthetic integration password';
const plan = () => ({ ...blankPlan(), objects: [{ id: 'o', name: 'Person', type: 'person' }], items: [{ id: 'i', objectId: 'o', name: 'Income', description: '', type: 'income', status: 'confirmed', amount: 20_000_000, recurrence: { kind: 'interval', anchor: '2026-01', end: '2028-01', everyMonths: 1 }, amountChanges: [{ month: '2028-01', amount: 22_000_000 }] }] });
async function fixture(t, { legacy = false, hook } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-member-integration-'));
  const users = { version: 1, revision: 1, users: await Promise.all(['lan', 'minh'].map(async id => ({ id, username: id, name: id, enabled: true, credentialVersion: 1, password: await hashPassword(password) }))) };
  const roles = { version: 1, adminIds: ['minh'] }, membership = createMembershipDirectory(users, roles);
  const original = JSON.stringify({ schemaVersion: 'money-seasons-store/v1', revision: 7, plan: plan() }, null, 2) + '\n';
  if (legacy) await fs.writeFile(path.join(root, 'plan.json'), original, { mode: 0o600 });
  const store = await openHouseholdStore(root, { hook, allowMigration: true });
  if (!legacy) await store.transact(0, () => setSharing({ ...blankHousehold(), individuals: [individualPlan('lan', plan())] }, 'lan', 'lan', 'items', 'i', false));
  const service = createHouseholdService({ store, membership });
  const f = { root, store, service, membership, users, roles, original, lan: membership.current('lan'), minh: membership.current('minh') };
  t.after(async () => { await f.app?.close(); await store.close(); await fs.rm(root, { recursive: true, force: true }); });
  return f;
}
test('common period preserves complete histories; owner-only editor/import retains privacy and rejects forged fields', async t => {
  const f = await fixture(t);
  await assert.rejects(f.service.period(f.lan, { expectedRevision: 1, startMonth: '2026-12', endMonth: '2027-01', confirmed: true }), { status: 403 });
  await f.service.period(f.minh, { expectedRevision: 1, startMonth: '2026-12', endMonth: '2027-01', confirmed: true });
  const own = await f.service.read(f.lan);
  assert.equal(own.plan.items[0].amountChanges[0].month, '2028-01');
  assert.equal(own.plan.items[0].recurrence.anchor, '2026-01');
  await f.service.edit(f.lan, { expectedRevision: 2, plan: { ...own.plan, name: 'Renamed' }, operation: 'edit', confirmed: true });
  assert.equal((await f.service.read(f.minh, 'home')).plan.items.length, 0);
  await assert.rejects(f.service.edit(f.minh, { expectedRevision: 3, plan: { ...own.plan, ownerId: 'lan' }, operation: 'replace', confirmed: true }));
  await assert.rejects(f.service.edit(f.lan, { expectedRevision: 3, plan: blankPlan(), operation: 'replace', confirmed: true }));
  await f.service.edit(f.minh, { expectedRevision: 3, plan: { ...blankPlan('2026-12', '2027-01'), name: 'Only Minh' }, operation: 'replace', confirmed: true });
  assert.equal((await f.service.read(f.lan)).plan.name, 'Renamed');
  await assert.rejects(f.service.period(f.minh, { expectedRevision: 4, startMonth: '2026-01', endMonth: '2036-01', confirmed: true }));
});
test('private-at-create is atomic, existing privacy cannot be changed through new-record overrides', async t => {
  const f = await fixture(t), own = await f.service.read(f.lan);
  const next = structuredClone(own.plan); next.items.push({ ...next.items[0], id: 'new-private', name: 'Never shared' });
  await f.service.edit(f.lan, { expectedRevision: 1, plan: next, operation: 'edit', confirmed: true, privateRecords: [{ kind: 'items', id: 'new-private' }] });
  assert.equal((await f.service.read(f.minh, 'home')).plan.items.length, 0);
  await assert.rejects(f.service.edit(f.lan, { expectedRevision: 2, plan: next, operation: 'edit', confirmed: true, privateRecords: [{ kind: 'items', id: 'i' }] }));
  assert.equal((await f.store.read()).revision, 2);
});
test('migration is explicit enabled-owner selection and exact-original archive, never inferred admin', async t => {
  const f = await fixture(t, { legacy: true });
  assert.equal((await f.service.read(f.lan)).migrationRequired, true);
  await assert.rejects(f.service.migration(f.lan), { status: 403 });
  assert.equal((await f.service.migration(f.minh)).plan.items.length, 1);
  await assert.rejects(f.service.migrate(f.minh, { expectedRevision: 7, ownerId: 'missing', confirmed: true }));
  await assert.rejects(f.service.migrate(f.minh, { expectedRevision: 7, ownerId: 'lan', confirmed: false }));
  assert.equal(await fs.readFile(path.join(f.root, 'plan.json'), 'utf8'), f.original);
  await f.service.migrate(f.minh, { expectedRevision: 7, ownerId: 'lan', confirmed: true });
  const state = await f.store.read(); assert.equal(state.revision, 8);
  assert.equal(state.household.individuals[0].ownerId, 'lan');
  assert.equal((await f.service.read(f.minh, 'home')).plan.items.length, 1);
  const archive = (await fs.readdir(f.root)).find(n => n.startsWith('original-'));
  assert.equal(await fs.readFile(path.join(f.root, archive), 'utf8'), f.original);
  await assert.rejects(f.service.migrate(f.minh, { expectedRevision: 8, ownerId: 'minh', confirmed: true }));
});
test('migration archive failure leaves legacy bytes and revision unchanged', async t => {
  const f = await fixture(t, { legacy: true, hook: async stage => { if (stage === 'before-archive') throw new Error('synthetic fault'); } });
  await assert.rejects(f.service.migrate(f.minh, { expectedRevision: 7, ownerId: 'lan', confirmed: true }));
  assert.equal(await fs.readFile(path.join(f.root, 'plan.json'), 'utf8'), f.original);
});
test('real startup composes member mode, refuses missing config and keeps credentials off HTTP', async t => {
  const f = await fixture(t);
  const members = path.join(f.root, 'members'); await fs.mkdir(members, { mode: 0o700 });
  await fs.writeFile(path.join(members, 'users.json'), JSON.stringify(f.users), { mode: 0o600 });
  await fs.writeFile(path.join(members, 'roles.json'), JSON.stringify(f.roles), { mode: 0o600 });
  await f.store.close();
  const app = await startApplication({ MONEY_SEASONS_AUTH_MODE: 'members', MONEY_SEASONS_MEMBERS_DIR: members, MONEY_SEASONS_ROLES_FILE: path.join(members, 'roles.json'), MONEY_SEASONS_DATA_DIR: f.root, MONEY_SEASONS_ORIGINS: 'https://localhost:3099', PORT: '0' });
  f.app = app;
  const base = `http://127.0.0.1:${app.server.address().port}`;
  assert.match(await (await fetch(base)).text(), /data-auth-mode="members"/);
  assert.equal((await fetch(base + '/api/home')).status, 403); // Plain HTTP loopback is not the configured HTTPS origin.
  assert.equal((await fetch(base + '/users.json')).status, 404);
  await app.reloadRoles();
  await assert.rejects(startApplication({ MONEY_SEASONS_AUTH_MODE: 'members' }));
});
