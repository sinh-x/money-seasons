// Explicit host-only snapshot provisioning. Never calls openStore on the source.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { validateHousehold } from '../public/household-model.js';
import { validatePlan, MAX_BYTES } from '../public/model.js';
import { validatePlan as validateV2, validateLegacyPlan } from '../public/legacy-model.js';
import { privateDir, readPrivate, exclusiveFile, syncDir, digest, inside, fail, withInstanceLock, atomicJson } from './stack-identity.mjs';

export const ENVELOPE_LIMIT = MAX_BYTES + 1024;
export function datasetId(id) {
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) fail('Invalid dataset ID');
  return id;
}
export function snapshotInfo(raw) {
  if (raw.length > ENVELOPE_LIMIT) fail('Snapshot exceeds envelope limit');
  try {
    const envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
    const household = envelope.schemaVersion === 'money-seasons-household/v1';
    if ((!household && envelope.schemaVersion !== 'money-seasons-store/v1') || !Number.isSafeInteger(envelope.revision) || envelope.revision < 1) fail('Invalid envelope');
    if (household) {
      if (Object.keys(envelope).length !== 3) fail('Invalid envelope');
      validateHousehold(envelope.household);
      return { digest: digest(raw), schemaVersion: envelope.schemaVersion, planVersion: 4, revision: envelope.revision };
    }
    if (Buffer.byteLength(JSON.stringify(envelope.plan)) > MAX_BYTES) fail('Plan exceeds limit');
    const version = envelope.plan?.version;
    if (version === 1) validateLegacyPlan(envelope.plan);
    else if (version === 2) validateV2(envelope.plan);
    else validatePlan(envelope.plan);
    return { digest: digest(raw), schemaVersion: envelope.schemaVersion, planVersion: version, revision: envelope.revision };
  } catch { fail('Snapshot schema/UTF-8/size validation refused (no payload logged)'); }
}
function datasetPath(instance, id) { return path.join(instance.base, 'datasets', datasetId(id)); }
export async function sourceSnapshot(instance, configFile) {
  // A config path is not a production credential. No paths are passed to a runtime.
  let config;
  try { config = JSON.parse((await readPrivate(configFile, 4096)).toString('utf8')); }
  catch { fail('Private source config unavailable/invalid'); }
  if (!config || Object.keys(config).length !== 1 || typeof config.planFile !== 'string' || path.basename(config.planFile) !== 'plan.json') fail('Source config requires only an absolute planFile ending in plan.json');
  const sourceDir = path.dirname(config.planFile), stateRoot = path.dirname(instance.base);
  if (!path.isAbsolute(config.planFile) || path.resolve(config.planFile) !== config.planFile || inside(sourceDir, stateRoot) || inside(stateRoot, sourceDir)) fail('Source/development storage overlap refused');
  const raw = await readPrivate(config.planFile, ENVELOPE_LIMIT);
  return { raw, info: snapshotInfo(raw) };
}
export async function cloneDataset(instance, { sourceConfig, id, hook = async () => {} }) {
  datasetId(id);
  return withInstanceLock(instance, async () => {
    // Validate source and target parents before creating any dataset.
    const { raw, info } = await sourceSnapshot(instance, sourceConfig);
    const datasets = path.join(instance.base, 'datasets');
    await privateDir(datasets, true);
    const target = datasetPath(instance, id), completion = path.join(target, 'dataset.json');
    // mkdir is an exclusive claim, never a rename-overwrite. Partial targets are deliberately retained.
    await fs.mkdir(target, { mode: 0o700 });
    try {
      await syncDir(datasets); await hook('after-claim');
      await privateDir(path.join(target, 'data'), true);
      await hook('before-original-write');
      await exclusiveFile(path.join(target, 'original.json'), raw);
      await hook('before-plan-write');
      await exclusiveFile(path.join(target, 'data/plan.json'), raw);
      await hook('before-data-sync'); await syncDir(path.join(target, 'data')); await syncDir(target);
      const metadata = { version: 1, instanceId: instance.id, dataset: id, ...info, createdAt: new Date().toISOString(), complete: true };
      await hook('before-complete');
      await exclusiveFile(completion, JSON.stringify(metadata) + '\n');
      await hook('before-completion-sync'); await syncDir(target); await syncDir(datasets);
      return metadata;
    } catch {
      // A failed operation cannot activate; do not delete working/original data or repair the target.
      await fs.unlink(completion).catch(e => { if (e.code !== 'ENOENT') throw e; });
      await syncDir(target).catch(() => {});
      fail('Clone incomplete; target retained and unselectable. Use a NEW dataset ID');
    }
  });
}
export async function inspectDataset(instance, id) {
  const directory = datasetPath(instance, id);
  await privateDir(directory); await privateDir(path.join(directory, 'data'));
  const metadata = JSON.parse((await readPrivate(path.join(directory, 'dataset.json'))).toString('utf8'));
  if (metadata.version !== 1 || metadata.instanceId !== instance.id || metadata.dataset !== id || metadata.complete !== true) fail('Foreign/incomplete dataset refused');
  const original = snapshotInfo(await readPrivate(path.join(directory, 'original.json'), ENVELOPE_LIMIT));
  for (const key of ['digest', 'schemaVersion', 'planVersion', 'revision']) if (original[key] !== metadata[key]) fail('Original/provenance mismatch');
  snapshotInfo(await readPrivate(path.join(directory, 'data/plan.json'), ENVELOPE_LIMIT));
  return { directory, data: path.join(directory, 'data'), metadata };
}
export async function writerSettled(data) {
  try { await fs.lstat(path.join(data, 'writer.lock')); fail('Writer lock present/unknown; no automatic lock recovery'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
}
export async function selectDataset(instance, id, { proveStopped } = {}) {
  datasetId(id);
  return withInstanceLock(instance, async () => {
    if (typeof proveStopped !== 'function' || await proveStopped(instance) !== true) fail('Stopped runtime proof required');
    const state = JSON.parse((await readPrivate(instance.manifest)).toString('utf8'));
    if (state.id !== instance.id || state.worktree !== instance.worktree) fail('Instance changed during selection');
    if (state.selected) { const current = await inspectDataset(instance, state.selected); await writerSettled(current.data); }
    const selected = await inspectDataset(instance, id); await writerSettled(selected.data);
    await atomicJson(instance.manifest, { ...state, selected: id });
    return selected.metadata;
  });
}
