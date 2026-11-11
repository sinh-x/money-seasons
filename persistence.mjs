import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { validatePlan, MAX_BYTES } from './public/model.js';
import { validatePlan as validateV2, validateLegacyPlan } from './public/legacy-model.js';
import { validateHousehold } from './public/household-model.js';

export class StoreError extends Error {
  constructor(code, status = 503) { super(code); this.code = code; this.status = status; }
}
const schemaVersion = 'money-seasons-store/v1';
const inside = (child, parent) => child === parent || child.startsWith(`${parent}${path.sep}`);
const privateFile = stat => stat.isFile() && stat.nlink === 1 && (stat.mode & 0o077) === 0 && stat.uid === process.getuid();
async function noSymlinkComponents(directory) {
  let current = path.parse(directory).root;
  for (const component of directory.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    if (!(await fs.lstat(current)).isDirectory()) throw new StoreError('unsafe-data-directory');
    try { await fs.lstat(path.join(current, '.git')); throw new StoreError('data-directory-must-be-outside-repository'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
}

export function openStore(directory, options) { return openFinanceStore(directory, options, false); }
// Same file and writer lock as legacy storage: no second source, implicit
// conversion, or parallel legacy writer. Migration will be an explicit operation.
export function openHouseholdStore(directory, options) { return openFinanceStore(directory, options, true); }
async function openFinanceStore(directory, { hook = async () => {} } = {}, household) {
  const format = household ? 'money-seasons-household/v1' : schemaVersion;
  const key = household ? 'household' : 'plan';
  const validate = household ? validateHousehold : validatePlan;
  // The household has one bounded plan per owner, not one global individual cap.
  // Client commands remain limited to MAX_BYTES at the HTTP boundary.
  const maxFileBytes = household ? Infinity : MAX_BYTES + 1024;
  if (!directory || !path.isAbsolute(directory)) throw new StoreError('private-data-directory-required');
  const dir = path.resolve(directory), repo = fileURLToPath(new URL('.', import.meta.url));
  if (inside(dir, path.resolve(repo))) throw new StoreError('data-directory-must-be-outside-repository');
  // Do not follow symlinks, even in parent components. Existing directories must already be private.
  await noSymlinkComponents(path.dirname(dir));
  await fs.mkdir(dir, { mode: 0o700 }).catch(e => { if (e.code !== 'EEXIST') throw e; });
  await noSymlinkComponents(dir);
  const stat = await fs.lstat(dir);
  if (stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0) throw new StoreError('data-directory-must-be-private');
  const filename = path.join(dir, 'plan.json'), lockname = path.join(dir, 'writer.lock');
  let lock;
  try {
    lock = await fs.open(lockname, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    await lock.writeFile(JSON.stringify({ pid: process.pid })); await lock.sync();
  } catch {
    await lock?.close();
    // Never steal a live, stale or unknown lock. Operator recovery is explicit.
    throw new StoreError('writer-lock-unavailable');
  }
  let queue = Promise.resolve(), closing = false, uncertain = false, initialized = false;
  async function read() {
    let handle;
    try {
      handle = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = await handle.stat();
      if (!privateFile(stat) || stat.size > maxFileBytes) throw new StoreError('unsafe-plan-file');
      const raw = await handle.readFile();
      if (raw.length > maxFileBytes) throw new StoreError('invalid-store');
      const envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
      if (envelope.schemaVersion !== format || !Number.isSafeInteger(envelope.revision) || envelope.revision < 1 ||
          (household && (Object.keys(envelope).length !== 3 || !Object.hasOwn(envelope, key)))) throw new StoreError('invalid-store');
      const migrationRequired = !household && [1, 2].includes(envelope.plan?.version);
      if (migrationRequired) {
        // Validate but do not normalize, reinterpret, or discard any original field.
        (envelope.plan.version === 1 ? validateLegacyPlan : validateV2)(envelope.plan);
      } else validate(envelope[key]);
      const plan = structuredClone(envelope[key]);
      initialized = true;
      return { schemaVersion: format, revision: envelope.revision, [key]: plan, ...(migrationRequired ? { migrationRequired: true } : {}) };
    } catch (e) {
      if (e.code === 'ENOENT' && !initialized) return { schemaVersion: format, revision: 0, [key]: null };
      throw new StoreError('store-unavailable');
    } finally { await handle?.close(); }
  }
  try {
    await read();
    const handle = await fs.open(dir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { await handle.sync(); } finally { await handle.close(); }
  } catch (e) { await lock.close(); await fs.unlink(lockname); throw e; }
  const api = {
    read: () => queue.then(async () => ({ ...await read(), ...(uncertain ? { durabilityUncertain: true } : {}) })),
    save(candidate, expectedRevision, { migrationConfirmed = false, reduce, authorize = () => {} } = {}) {
      if (closing) return Promise.reject(new StoreError('store-closed'));
      const operation = queue.then(async () => {
        authorize();
        if (uncertain) throw new StoreError('durability-uncertain-restart-required');
        const current = await read();
        authorize();
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new StoreError('invalid-revision', 400);
        if (current.revision !== expectedRevision) throw new StoreError('revision-conflict', 409);
        if (current.revision === Number.MAX_SAFE_INTEGER) throw new StoreError('revision-exhausted');
        if (current.migrationRequired && !migrationConfirmed) throw new StoreError('migration-confirmation-required', 400);
        let plan;
        try { plan = validate(reduce ? reduce(current[key]) : candidate); }
        catch (e) { if (e instanceof StoreError) throw e; throw new StoreError(household ? 'invalid-household' : 'invalid-plan', 400); }
        if (current.migrationRequired) {
          // Archive exact original envelope before changing it. Never overwrite an archive.
          const original = await fs.readFile(filename);
          const digest = createHash('sha256').update(original).digest('hex');
          const archive = path.join(dir, `original-${digest}.json`);
          let handle;
          try {
            await hook('before-archive');
            handle = await fs.open(archive, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
            await handle.writeFile(original); await handle.sync(); await handle.close(); handle = undefined;
          } catch (e) {
            await handle?.close();
            if (e.code !== 'EEXIST') throw new StoreError('original-preservation-failed');
            const existing = await fs.open(archive, constants.O_RDONLY | constants.O_NOFOLLOW);
            try {
              const stat = await existing.stat();
              if (!privateFile(stat) || stat.size !== original.length || !(await existing.readFile()).equals(original)) throw new StoreError('original-preservation-failed');
            } finally { await existing.close(); }
          }
          const directory = await fs.open(dir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
          try { await directory.sync(); } finally { await directory.close(); }
        }
        const envelope = { schemaVersion: format, revision: current.revision + 1, [key]: plan };
        const bytes = JSON.stringify(envelope);
        if (!household && Buffer.byteLength(JSON.stringify(plan)) > MAX_BYTES) throw new StoreError('plan-too-large', 413);
        const tmp = path.join(dir, `.save-${randomBytes(16).toString('hex')}`);
        let file, renamed = false, directoryHandle;
        try {
          await hook('before-write');
          file = await fs.open(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
          await file.writeFile(bytes);
          await hook('before-file-sync'); await file.sync();
          await file.close(); file = undefined;
          await hook('before-rename');
          authorize(); // Revoke queued/in-flight credentials before the commit boundary.
          await fs.rename(tmp, filename); renamed = true;
          await hook('after-rename');
          directoryHandle = await fs.open(dir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
          await directoryHandle.sync();
          await hook('after-directory-sync');
          initialized = true;
          return envelope;
        } catch (e) {
          uncertain ||= renamed;
          if (!renamed && e instanceof StoreError) throw e;
          throw new StoreError(renamed ? 'durability-uncertain-reload-required' : 'save-failed');
        } finally {
          await file?.close(); await directoryHandle?.close();
          if (!renamed) await fs.unlink(tmp).catch(() => {});
        }
      });
      queue = operation.catch(() => {});
      return operation;
    },
    async close() {
      closing = true; await queue;
      if (lock) { await lock.close(); lock = undefined; await fs.unlink(lockname); }
    }
  };
  // Household callers must reduce CURRENT state under the serialized CAS queue;
  // there is intentionally no raw whole-household save API for HTTP consumers.
  return household ? { read: api.read, close: api.close,
    transact: (expectedRevision, reduce, options) => {
      if (typeof reduce !== 'function') return Promise.reject(new StoreError('invalid-transaction', 400));
      return api.save(undefined, expectedRevision, { ...options, reduce });
    }
  } : api;
}
