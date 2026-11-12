// Private membership primitives. Never serve this module or serialize user/password
// documents into finance responses. HTTP/session and durable admin writes are separate.
import { randomBytes, scrypt as derive, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { constants } from 'node:fs';
import { open, lstat } from 'node:fs/promises';
import path from 'node:path';

const scrypt = promisify(derive);
const LIMIT = 1_000_000;
const fail = code => { throw new Error(code); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function shape(value, keys) {
  if (!object(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail('invalid-membership');
}
const identifier = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value);
const positive = value => Number.isSafeInteger(value) && value >= 1;
const passwordInput = value => typeof value === 'string' && value.length >= 12 && Buffer.byteLength(value) <= 1024;
function validateVerifier(value) {
  shape(value, ['algorithm', 'salt', 'key']);
  if (value.algorithm !== 'scrypt' || typeof value.salt !== 'string' || !/^[a-f0-9]{64}$/.test(value.salt) ||
      typeof value.key !== 'string' || !/^[a-f0-9]{128}$/.test(value.key)) fail('invalid-membership');
}
export async function hashPassword(password) {
  if (!passwordInput(password)) fail('invalid-password');
  const salt = randomBytes(32);
  const key = await scrypt(password, salt, 64);
  return { algorithm: 'scrypt', salt: salt.toString('hex'), key: key.toString('hex') };
}
export async function verifyPassword(password, verifier) {
  validateVerifier(verifier);
  if (typeof password !== 'string' || Buffer.byteLength(password) > 1024) return false;
  const candidate = await scrypt(password, Buffer.from(verifier.salt, 'hex'), 64);
  return timingSafeEqual(candidate, Buffer.from(verifier.key, 'hex'));
}
export function validateMembership(users, roles) {
  shape(users, ['version', 'revision', 'users']); shape(roles, ['version', 'adminIds']);
  if (users.version !== 1 || !positive(users.revision) || !Array.isArray(users.users) ||
      roles.version !== 1 || !Array.isArray(roles.adminIds)) fail('invalid-membership');
  const ids = new Set(), names = new Set();
  for (const user of users.users) {
    shape(user, ['id', 'username', 'name', 'enabled', 'credentialVersion', 'password']);
    if (!identifier(user.id) || ids.has(user.id) || !identifier(user.username) || names.has(user.username) ||
        typeof user.name !== 'string' || !user.name.trim() || user.name.length > 80 ||
        typeof user.enabled !== 'boolean' || !positive(user.credentialVersion)) fail('invalid-membership');
    validateVerifier(user.password); ids.add(user.id); names.add(user.username);
  }
  if (new Set(roles.adminIds).size !== roles.adminIds.length || roles.adminIds.some(id => !ids.has(id))) fail('invalid-membership');
  if (!users.users.some(user => user.enabled && roles.adminIds.includes(user.id))) fail('enabled-admin-required');
  if (Buffer.byteLength(JSON.stringify(users)) > LIMIT || Buffer.byteLength(JSON.stringify(roles)) > LIMIT) fail('invalid-membership');
  return structuredClone({ users, roles });
}
function identity(user, roles) {
  return { id: user.id, username: user.username, name: user.name, admin: roles.adminIds.includes(user.id), credentialVersion: user.credentialVersion };
}
// Callers must compare the current identity to the stored session epoch on every
// request. The admin flag is only for account/period administration, never finance.
export function memberIdentity(users, roles, id) {
  validateMembership(users, roles);
  const user = users.users.find(user => user.id === id && user.enabled);
  if (!user) fail('login-required');
  return identity(user, roles);
}
const dummy = { algorithm: 'scrypt', salt: '0'.repeat(64), key: '0'.repeat(128) };
export async function authenticateMember(users, roles, username, password) {
  // Snapshot before asynchronous hashing: a caller's mutation cannot change the
  // identity that was verified. Session issuance must still recheck current state.
  const snapshot = validateMembership(users, roles);
  const user = snapshot.users.users.find(user => user.username === username && user.enabled);
  const valid = await verifyPassword(password, user?.password ?? dummy);
  if (!user || !valid) fail('invalid-login');
  return identity(user, snapshot.roles);
}

// In-memory view of separately committed private state. replace() is an internal
// store/operator port, not a public admin API; persist and fsync before installing.
// Reloads retain monotonic epochs even when the operator restores earlier roles.
export function createMembershipDirectory(users, roles) {
  let state = validateMembership(users, roles);
  const epochs = new Map(state.users.users.map(user => [user.id, 1]));
  const security = (user, config) => createHash('sha256').update(JSON.stringify([
    user.username, user.enabled, user.credentialVersion, user.password, config.adminIds.includes(user.id)
  ])).digest('hex');
  const current = id => ({ ...memberIdentity(state.users, state.roles, id), authEpoch: epochs.get(id) });
  return {
    current,
    async authenticate(username, password) {
      const snapshot = state, user = snapshot.users.users.find(user => user.username === username);
      const epoch = epochs.get(user?.id);
      const verified = await authenticateMember(snapshot.users, snapshot.roles, username, password);
      if (epochs.get(verified.id) !== epoch) fail('invalid-login');
      return current(verified.id);
    },
    replace(users, roles) {
      const next = validateMembership(users, roles), updated = new Map(epochs);
      for (const old of state.users.users) {
        const user = next.users.users.find(user => user.id === old.id);
        if (!user) fail('member-deletion-denied');
        if (user.credentialVersion < old.credentialVersion ||
            (JSON.stringify(user.password) !== JSON.stringify(old.password) && user.credentialVersion <= old.credentialVersion)) fail('credential-version-required');
        if (security(user, next.roles) !== security(old, state.roles)) {
          if (updated.get(user.id) === Number.MAX_SAFE_INTEGER) fail('session-epoch-exhausted');
          updated.set(user.id, updated.get(user.id) + 1);
        }
      }
      for (const user of next.users.users) if (!updated.has(user.id)) updated.set(user.id, 1);
      state = next;
      for (const [id, epoch] of updated) epochs.set(id, epoch);
    }
  };
}

// Operator-provisioned JSON only. No bootstrap defaults, file creation, role
// changes, repository search or permissive repair. Parent aliases are rejected.
export async function readPrivateJSON(filename) {
  let file;
  try {
    if (typeof filename !== 'string' || !path.isAbsolute(filename) || path.resolve(filename) !== filename) fail('unsafe-private-config');
    const directory = path.dirname(filename);
    let current = path.parse(directory).root;
    for (const component of directory.slice(current.length).split(path.sep).filter(Boolean)) {
      current = path.join(current, component);
      if (!(await lstat(current)).isDirectory()) fail('unsafe-private-config');
      try { await lstat(path.join(current, '.git')); fail('unsafe-private-config'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const parent = await lstat(directory);
    if (parent.uid !== process.getuid() || (parent.mode & 0o077) !== 0) fail('unsafe-private-config');
    file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0 || stat.size > LIMIT) fail('unsafe-private-config');
    const buffer = Buffer.alloc(LIMIT + 1);
    let bytes = 0;
    while (bytes < buffer.length) {
      const result = await file.read(buffer, bytes, buffer.length - bytes, null);
      if (!result.bytesRead) break;
      bytes += result.bytesRead;
    }
    if (bytes > LIMIT) fail('unsafe-private-config');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytes)));
  } catch { fail('unsafe-private-config'); }
  finally { await file?.close(); }
}
