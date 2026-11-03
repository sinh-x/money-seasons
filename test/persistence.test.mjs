import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { openStore } from '../persistence.mjs';
import { blankPlan, convertLegacy, validatePlan } from '../public/model.js';
import { blankPlan as legacyBlank } from '../public/legacy-model.js';

async function fixture(t, options) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-store-'));
  const dir = path.join(root, 'data');
  const store = await openStore(dir, options);
  t.after(async () => { await store.close(); await fs.rm(root, { recursive: true, force: true }); });
  return { store, dir, root };
}

test('acknowledged revision survives close/reopen; private modes and stripped envelope', async t => {
  const { store, dir } = await fixture(t);
  assert.equal((await store.read()).revision, 0);
  const saved = await store.save(blankPlan(), 0);
  assert.equal(saved.revision, 1);
  assert.equal((await fs.stat(dir)).mode & 0o777, 0o700);
  assert.equal((await fs.stat(path.join(dir, 'plan.json'))).mode & 0o777, 0o600);
  await store.close();
  const reopened = await openStore(dir);
  assert.deepEqual(await reopened.read(), saved);
  await reopened.close();
});

test('legacy store blocks silent writes and retains byte-exact original on explicit migration', async t => {
  const { store, dir } = await fixture(t); await store.close();
  const old = legacyBlank('2027-01', '2027-12'); old.openingCash = 100;
  const raw = JSON.stringify({ schemaVersion: 'money-seasons-store/v1', revision: 5, plan: old }, null, 2);
  await fs.writeFile(path.join(dir, 'plan.json'), raw, { mode: 0o600 });
  const reopened = await openStore(dir);
  try {
  const state = await reopened.read(); assert.equal(state.migrationRequired, true); assert.deepEqual(state.plan, old);
  const next = convertLegacy(old, { confirmed: true });
  await assert.rejects(reopened.save(next, 5), /migration-confirmation/);
  assert.equal(await fs.readFile(path.join(dir, 'plan.json'), 'utf8'), raw);
  const saved = await reopened.save(next, 5, { migrationConfirmed: true }); assert.equal(saved.revision, 6);
  const archive = (await fs.readdir(dir)).find(n => n.startsWith('original-'));
  assert.ok(archive); assert.equal(await fs.readFile(path.join(dir, archive), 'utf8'), raw);
  assert.equal((await fs.stat(path.join(dir, archive))).mode & 0o777, 0o600);
  assert.deepEqual(validatePlan(saved.plan), next);
  } finally { await reopened.close(); }
});

test('archive failure leaves original and revision intact', async t => {
  const { store, dir } = await fixture(t); await store.close();
  const old = legacyBlank();
  const raw = JSON.stringify({ schemaVersion: 'money-seasons-store/v1', revision: 1, plan: old });
  await fs.writeFile(path.join(dir, 'plan.json'), raw, { mode: 0o600 });
  const reopened = await openStore(dir, { hook: async stage => { if (stage === 'before-archive') throw new Error('synthetic'); } });
  try {
  await assert.rejects(reopened.save(convertLegacy(old, { confirmed: true }), 1, { migrationConfirmed: true }), /preservation/);
  assert.equal(await fs.readFile(path.join(dir, 'plan.json'), 'utf8'), raw);
  } finally { await reopened.close(); }
});

test('populated active objects, estimates, cash/debt history survive restart byte-for-field', async t => {
  const { store, dir } = await fixture(t), p = blankPlan('2025-11', '2026-01');
  p.objects = [{ id: 'group', name: 'Synthetic family', type: 'group' }];
  p.items = [{ id: 'plan', objectId: 'group', name: 'Synthetic', description: '', type: 'expense', status: 'confirmed', amount: null,
    recurrence: { kind: 'interval', anchor: p.startMonth, end: '2037-12', everyMonths: 1 }, amountChanges: [{ month: '2025-12', amount: 0 }, { month: '2030-01', amount: 5 }] }];
  p.accounts = [{ id: 'cash', name: 'Cash' }];
  p.snapshots = [{ id: 'snap1', accountId: 'cash', date: '2025-11-01', amount: 3000 }, { id: 'snap2', accountId: 'cash', date: '2025-12-01', amount: 4000 }];
  p.debtAccounts = [{ id: 'debt', name: 'Debt', direction: 'payable' }];
  p.debtSnapshots = [{ id: 'debt-snap', accountId: 'debt', date: '2025-11-01', amount: 9000 }];
  const saved = await store.save(p, 0); await store.close();
  const reopened = await openStore(dir);
  try { assert.deepEqual(await reopened.read(), saved); assert.deepEqual((await reopened.read()).plan, p); }
  finally { await reopened.close(); }
});

test('serialized expected-revision check gives one winner; stale edits do not overwrite', async t => {
  const { store } = await fixture(t);
  const results = await Promise.allSettled([store.save(blankPlan(), 0), store.save({ ...blankPlan(), name: 'Other' }, 0)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
  assert.equal((await store.read()).plan.name, blankPlan().name);
  await assert.rejects(store.save({ version: 99 }, 1), e => e.status === 400);
  assert.equal((await store.read()).revision, 1);
});

test('sole writer; corrupt/missing initialized store never resets; symlinks and aliases refused', async t => {
  const { store, dir, root } = await fixture(t);
  await assert.rejects(openStore(dir), /writer-lock/);
  await store.save(blankPlan(), 0);
  const target = path.join(dir, 'plan.json');
  const envelope = await store.read();
  envelope.plan.name = 'invalid-byte-placeholder';
  const invalidUtf8 = Buffer.from(JSON.stringify(envelope).replace('invalid-byte-placeholder', '\u00ff'));
  const marker = invalidUtf8.indexOf(Buffer.from('\u00ff'));
  invalidUtf8[marker] = 0xff; // Invalid UTF-8 inside otherwise valid JSON; never silently repair it.
  await fs.writeFile(target, invalidUtf8);
  await assert.rejects(store.read(), /store-unavailable/);
  await fs.unlink(target);
  await assert.rejects(store.read(), /store-unavailable/);
  await fs.writeFile(target, '{corrupt', { mode: 0o600 });
  await assert.rejects(store.read(), /store-unavailable/);
  await store.close();
  await assert.rejects(openStore(dir), /store-unavailable/);
  await fs.unlink(target);
  const elsewhere = path.join(root, 'elsewhere'); await fs.writeFile(elsewhere, 'private', { mode: 0o600 });
  await fs.symlink(elsewhere, target);
  await assert.rejects(openStore(dir), /store-unavailable/);
  await fs.unlink(target); await fs.link(elsewhere, target);
  await assert.rejects(openStore(dir), /store-unavailable/);
  const linkedDir = path.join(root, 'linked'); await fs.symlink(dir, linkedDir);
  await assert.rejects(openStore(linkedDir), /unsafe-data-directory/);
});

test('unsafe directories and insecure files fail closed', async t => {
  const { store, dir, root } = await fixture(t);
  await store.close();
  await fs.chmod(dir, 0o755); await assert.rejects(openStore(dir), /private/); await fs.chmod(dir, 0o700);
  const bad = path.join(dir, 'plan.json'); await fs.writeFile(bad, '{}', { mode: 0o644 });
  await assert.rejects(openStore(dir), /store-unavailable/);
  await assert.rejects(openStore(process.cwd()), /outside-repository/);
  await fs.unlink(bad);
  await fs.writeFile(path.join(dir, 'writer.lock'), 'unknown', { mode: 0o600 });
  await assert.rejects(openStore(dir), /writer-lock/);
  await fs.unlink(path.join(dir, 'writer.lock'));
  assert.ok(root.startsWith(os.tmpdir()));
});

for (const code of ['ENOSPC', 'EACCES', 'EROFS']) {
  test(`injected ${code} leaves prior revision intact; no successful acknowledgement`, async t => {
    let inject = false;
    const { store } = await fixture(t, { hook: async stage => {
      if (inject && stage === 'before-write') throw Object.assign(new Error('synthetic filesystem failure'), { code });
    } });
    await store.save(blankPlan(), 0); inject = true;
    await assert.rejects(store.save({ ...blankPlan(), name: 'Not saved' }, 1), e => e.status === 503);
    const state = await store.read(); assert.equal(state.revision, 1); assert.equal(state.plan.name, blankPlan().name);
  });
}

test('finance reads wait for acknowledgement boundary instead of observing an in-progress rename', async t => {
  let release, renamed;
  const afterRename = new Promise(resolve => { renamed = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const { store } = await fixture(t, { hook: async stage => { if (stage === 'after-rename') { renamed(); await gate; } } });
  const saving = store.save(blankPlan(), 0); await afterRename;
  let readCompleted = false;
  const reading = store.read().then(state => { readCompleted = true; return state; });
  try { await new Promise(resolve => setTimeout(resolve, 15)); assert.equal(readCompleted, false); }
  finally { release(); }
  const saved = await saving; assert.deepEqual(await reading, saved);
});

for (const stage of ['before-write', 'before-file-sync', 'before-rename', 'after-rename', 'after-directory-sync']) {
  test(`injected storage failure at ${stage} never acknowledges; file is complete old/new`, async t => {
    let inject = false;
    const { store, dir } = await fixture(t, { hook: async point => { if (inject && point === stage) throw new Error('synthetic disk failure'); } });
    await store.save(blankPlan(), 0); inject = true;
    await assert.rejects(store.save({ ...blankPlan(), name: 'New' }, 1), e => e.status === 503);
    const raw = JSON.parse(await fs.readFile(path.join(dir, 'plan.json'), 'utf8'));
    const renamed = stage.startsWith('after-');
    assert.equal(raw.revision, renamed ? 2 : 1);
    assert.equal((await store.read()).revision, raw.revision);
    inject = false;
    if (renamed) await assert.rejects(store.save(blankPlan(), 2), /uncertain/);
    else assert.equal((await store.save(blankPlan(), 1)).revision, 2);
  });
}

for (const stage of ['before-rename', 'after-rename', 'after-directory-sync']) {
  test(`SIGKILL at ${stage} leaves complete old/new JSON; stale lock requires operator recovery`, async t => {
    const { store, dir } = await fixture(t);
    await store.save(blankPlan(), 0); await store.close();
    const code = `import {openStore} from './persistence.mjs'; import {blankPlan} from './public/model.js';
      const s = await openStore(${JSON.stringify(dir)}, {hook: async stage => {if(stage === ${JSON.stringify(stage)}) process.kill(process.pid, 'SIGKILL')}});
      await s.save({...blankPlan(),name:'After crash'},1);`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: process.cwd(), timeout: 10_000 });
    assert.equal(child.signal, 'SIGKILL');
    const raw = JSON.parse(await fs.readFile(path.join(dir, 'plan.json'), 'utf8'));
    assert.equal(raw.revision, stage === 'before-rename' ? 1 : 2);
    await assert.rejects(openStore(dir), /writer-lock/);
    // Test operator recovery only: the exact owned child above is proven terminated.
    await fs.unlink(path.join(dir, 'writer.lock'));
    const restarted = await openStore(dir); assert.equal((await restarted.read()).revision, raw.revision); await restarted.close();
  });
}
