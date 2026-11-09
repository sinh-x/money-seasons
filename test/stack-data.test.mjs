import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadInstance, digest, exclusiveFile } from '../scripts/stack-identity.mjs';
import { cloneDataset, selectDataset, inspectDataset, snapshotInfo, ENVELOPE_LIMIT } from '../scripts/stack-data.mjs';
import { blankPlan, convertLegacy } from '../public/model.js';
import { blankPlan as legacyBlank } from '../public/legacy-model.js';
import { openStore } from '../persistence.mjs';
const envelope = (plan = blankPlan(), revision = 1) => Buffer.from(JSON.stringify({ schemaVersion: 'money-seasons-store/v1', revision, plan }, null, 2));
async function fixture(t, raw = envelope()) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-clone-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const instance = await loadInstance({ home: root, port: 43002, create: true });
  const source = path.join(root, 'source'); await fs.mkdir(source, { mode: 0o700 });
  const planFile = path.join(source, 'plan.json'); await exclusiveFile(planFile, raw);
  const sourceConfig = path.join(root, 'source.json'); await exclusiveFile(sourceConfig, JSON.stringify({ planFile }));
  return { instance, source, sourceConfig, planFile, root, clone: id => cloneDataset(instance, { sourceConfig, id }) };
}
test('clone reads only committed plan, independent original/copy, no selection or canaries', async t => {
  const f = await fixture(t);
  for (const name of ['passphrase', 'writer.lock', 'root.key', '.env', 'original-secret.json']) await exclusiveFile(path.join(f.source, name), 'synthetic-canary');
  const before = await fs.readFile(f.planFile), metadata = await f.clone('trial-001');
  const d = await inspectDataset(f.instance, 'trial-001');
  assert.equal(metadata.digest, digest(before)); assert.deepEqual(await fs.readFile(f.planFile), before);
  assert.deepEqual((await fs.readdir(d.directory)).sort(), ['data', 'dataset.json', 'original.json']);
  assert.deepEqual(await fs.readdir(d.data), ['plan.json']);
  assert.notEqual((await fs.stat(path.join(d.directory, 'original.json'))).ino, (await fs.stat(path.join(d.data, 'plan.json'))).ino);
  assert.equal(JSON.parse(await fs.readFile(f.instance.manifest)).selected, null);
  await assert.rejects(f.clone('trial-001')); assert.deepEqual(await fs.readFile(f.planFile), before);
  for (const dir of [d.directory, d.data]) assert.equal((await fs.stat(dir)).mode & 0o777, 0o700);
  for (const file of [path.join(d.directory, 'original.json'), path.join(d.data, 'plan.json')]) assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
});
test('selection requires stopped runtime and no current/target writer; old data retained', async t => {
  const f = await fixture(t); await f.clone('a'); await f.clone('b');
  await assert.rejects(selectDataset(f.instance, 'a'));
  await assert.rejects(selectDataset(f.instance, 'a', { proveStopped: async () => false }));
  const stopped = { proveStopped: async () => true };
  await selectDataset(f.instance, 'a', stopped);
  const a = await inspectDataset(f.instance, 'a');
  await exclusiveFile(path.join(a.data, 'writer.lock'), 'unknown');
  await assert.rejects(selectDataset(f.instance, 'b', stopped));
  assert.equal(JSON.parse(await fs.readFile(f.instance.manifest)).selected, 'a');
  await fs.unlink(path.join(a.data, 'writer.lock')); await selectDataset(f.instance, 'b', stopped);
  assert.equal(JSON.parse(await fs.readFile(f.instance.manifest)).selected, 'b'); assert.ok(await inspectDataset(f.instance, 'a'));
  const b = await inspectDataset(f.instance, 'b');
  const m = path.join(b.directory, 'dataset.json'); const metadata = JSON.parse(await fs.readFile(m));
  await fs.writeFile(m, JSON.stringify({ ...metadata, instanceId: 'foreign' }));
  await assert.rejects(selectDataset(f.instance, 'b', stopped));
});
test('legacy conversion preserves source and exact original, only working copy migrates', async t => {
  const old = legacyBlank(); const raw = envelope(old, 7), f = await fixture(t, raw);
  await f.clone('legacy'); const d = await inspectDataset(f.instance, 'legacy');
  const store = await openStore(d.data);
  try {
    assert.equal((await store.read()).migrationRequired, true);
    const converted = convertLegacy(old, { confirmed: true });
    await assert.rejects(store.save(converted, 7));
    await store.save(converted, 7, { migrationConfirmed: true });
    assert.equal((await store.read()).plan.version, 3);
  } finally { await store.close(); }
  assert.deepEqual(await fs.readFile(f.planFile), raw);
  assert.deepEqual(await fs.readFile(path.join(d.directory, 'original.json')), raw);
  assert.equal((await inspectDataset(f.instance, 'legacy')).metadata.planVersion, 2);
});
test('v1 copy validates and requires original-preserving acknowledged conversion', async t => {
  const old = { version: 1, currency: 'VND', year: 2027, name: 'Synthetic v1', openingCash: 100, demo: false,
    items: [{ id: 'old', name: 'Synthetic', type: 'expense', status: 'confirmed', repeat: 'monthly', start: 1, end: 12, amount: 10, category: 'Synthetic', actuals: { 11: 12, 12: 0 } }] };
  const raw = envelope(old, 2), f = await fixture(t, raw); await f.clone('v1'); const d = await inspectDataset(f.instance, 'v1');
  const store = await openStore(d.data);
  try {
    const converted = convertLegacy(old, { confirmed: true });
    await assert.rejects(store.save(converted, 2));
    await store.save(converted, 2, { migrationConfirmed: true });
    assert.equal((await store.read()).revision, 3);
  } finally { await store.close(); }
  assert.deepEqual(await fs.readFile(f.planFile), raw); assert.deepEqual(await fs.readFile(path.join(d.directory, 'original.json')), raw);
});

test('corrupt/newer/oversize/invalid UTF-8 sources refuse before dataset publication', async t => {
  const f = await fixture(t);
  for (const raw of [Buffer.from('{bad'), envelope({ version: 99 }), Buffer.alloc(ENVELOPE_LIMIT + 1), Buffer.from([0xff])]) {
    await fs.writeFile(f.planFile, raw); await assert.rejects(f.clone('invalid'));
    await assert.rejects(fs.stat(path.join(f.instance.base, 'datasets/invalid')));
  }
  assert.throws(() => snapshotInfo(envelope(blankPlan(), 0)));
  for (const id of ['../peer', '', 'A', 'a'.repeat(65)]) await assert.rejects(f.clone(id));
});
test('unsafe source config/paths/modes/links and overlapping development data refuse', async t => {
  const f = await fixture(t), original = await fs.readFile(f.planFile);
  await fs.chmod(f.planFile, 0o644); await assert.rejects(f.clone('bad')); await fs.chmod(f.planFile, 0o600);
  await fs.link(f.planFile, path.join(f.source, 'hardlink')); await assert.rejects(f.clone('bad')); await fs.unlink(path.join(f.source, 'hardlink'));
  await fs.rename(f.planFile, path.join(f.source, 'saved')); await fs.symlink(path.join(f.source, 'saved'), f.planFile); await assert.rejects(f.clone('bad'));
  await fs.unlink(f.planFile); await fs.rename(path.join(f.source, 'saved'), f.planFile);
  const alias = path.join(f.root, 'alias'); await fs.symlink(f.source, alias);
  await fs.writeFile(f.sourceConfig, JSON.stringify({ planFile: path.join(alias, 'plan.json') })); await assert.rejects(f.clone('bad'));
  await fs.writeFile(f.sourceConfig, JSON.stringify({ planFile: path.join(f.instance.base, 'plan.json') })); await assert.rejects(f.clone('bad'));
  await fs.writeFile(f.sourceConfig, JSON.stringify({ planFile: f.planFile }));
  await fs.mkdir(path.join(f.source, '.git')); await assert.rejects(f.clone('bad'));
  assert.deepEqual(await fs.readFile(f.planFile), original);
});
for (const stage of ['after-claim', 'before-original-write', 'before-plan-write', 'before-data-sync', 'before-complete', 'before-completion-sync']) {
  test(`fault at ${stage} retains incomplete unselectable copy and existing bytes`, async t => {
    const f = await fixture(t); await f.clone('good'); const before = await fs.readFile(f.instance.manifest);
    await assert.rejects(cloneDataset(f.instance, { sourceConfig: f.sourceConfig, id: 'partial', hook: async s => { if (s === stage) throw Object.assign(new Error('synthetic'), { code: 'ENOSPC' }); } }));
    await assert.rejects(inspectDataset(f.instance, 'partial'));
    await assert.rejects(selectDataset(f.instance, 'partial', { proveStopped: async () => true }));
    assert.deepEqual(await fs.readFile(f.instance.manifest), before); assert.ok(await inspectDataset(f.instance, 'good'));
  });
}
test('concurrent same-ID creates have exactly one winner; source atomic saves yield whole envelopes', async t => {
  const f = await fixture(t);
  const race = await Promise.allSettled([f.clone('race'), f.clone('race')]);
  assert.equal(race.filter(r => r.status === 'fulfilled').length, 1);
  const committed = new Set([digest(await fs.readFile(f.planFile))]);
  const writer = (async () => {
    for (let revision = 2; revision < 30; revision++) {
      const raw = envelope(blankPlan(), revision); committed.add(digest(raw));
      const temp = path.join(f.source, 'next'); await exclusiveFile(temp, raw); await fs.rename(temp, f.planFile);
    }
  })();
  const metadata = await f.clone('atomic'); await writer;
  assert.ok(committed.has(metadata.digest));
  assert.deepEqual((await fs.readdir(f.source)).sort(), ['plan.json']);
});
