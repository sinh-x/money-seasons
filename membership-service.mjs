// Private, server-only credential administration. No role mutation or finance
// authority is exposed here. Provision users.json/roles.json outside Git first.
import path from 'node:path';
import { openMembershipStore, StoreError } from './persistence.mjs';
import { validateMembership, createMembershipDirectory, readPrivateJSON, hashPassword, verifyPassword } from './membership.mjs';

const fail = (code, status = 503) => { throw new StoreError(code, status); };
function shape(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail('invalid-member-command', 400);
}
export async function openMembershipManager(directory, { rolesFile, hook } = {}) {
  // No seed/default, implicit bootstrap, permission repair or credential logging.
  const initial = await readPrivateJSON(path.join(directory, 'users.json'));
  let roles = await readPrivateJSON(rolesFile);
  validateMembership(initial, roles);
  const store = await openMembershipStore(directory, { hook, validate: value => validateMembership(value, roles).users });
  let users, members;
  try { users = (await store.read()).users; members = createMembershipDirectory(users, roles); }
  catch (e) { await store.close(); throw e; }
  let queue = Promise.resolve(), closing = false, uncertain = false, invalidRoles = false;
  function available() { if (closing || uncertain || invalidRoles) fail('membership-unavailable'); }
  function current(id) { available(); return members.current(id); }
  function authorize(actor, admin = false) {
    available();
    let value;
    try {
      value = current(actor?.id);
      if (!Number.isSafeInteger(actor?.authEpoch) || value.authEpoch !== actor.authEpoch) throw new Error('revoked');
    } catch { fail('login-required', 401); }
    if (admin && !value.admin) fail('admin-required', 403);
    return value;
  }
  function enqueue(operation) {
    if (closing) return Promise.reject(new StoreError('membership-unavailable'));
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  }
  async function observedUsers() {
    const state = await store.read();
    if (state.durabilityUncertain || JSON.stringify(state.users) !== JSON.stringify(users)) {
      uncertain = true; fail('membership-source-changed-restart-required');
    }
    return state.users;
  }
  function storageFailure(e) {
    if (/durability-uncertain|store-unavailable|source-changed|membership-install/.test(e.code ?? '')) uncertain = true;
    throw e;
  }
  async function commit(actor, expectedRevision, reducer, admin) {
    try {
      const saved = await store.transact(expectedRevision, source => {
        authorize(actor, admin);
        if (JSON.stringify(source) !== JSON.stringify(users)) { uncertain = true; fail('membership-source-changed-restart-required'); }
        const next = reducer(structuredClone(source));
        next.revision = source.revision + 1;
        try { return validateMembership(next, roles).users; }
        catch { fail('invalid-member-change', 400); }
      }, { authorize: () => authorize(actor, admin) });
      // Install epochs only after file+directory fsync. A post-rename failure must
      // never leave old credentials usable or pretend the change did not happen.
      try { members.replace(saved.users, roles); users = saved.users; }
      catch { uncertain = true; fail('membership-install-restart-required'); }
      return { revision: saved.revision };
    } catch (e) { return storageFailure(e); }
  }
  function revision(expected) {
    if (!Number.isSafeInteger(expected) || expected < 1) fail('invalid-revision', 400);
    if (expected !== users.revision) fail('revision-conflict', 409);
    if (users.revision === Number.MAX_SAFE_INTEGER) fail('revision-exhausted');
  }
  async function passwordHash(value) {
    try { return await hashPassword(value); } catch { fail('invalid-password', 400); }
  }
  return {
    current,
    async authenticate(username, password) {
      available();
      const result = await members.authenticate(username, password);
      available();
      if (current(result.id).authEpoch !== result.authEpoch) fail('invalid-login', 401);
      return result;
    },
    self(actor) {
      return enqueue(async () => {
        authorize(actor);
        try { await observedUsers(); } catch (e) { return storageFailure(e); }
        const { id, username, name, admin } = authorize(actor);
        return { revision: users.revision, member: { id, username, name, admin } };
      });
    },
    list(actor) {
      return enqueue(async () => {
        authorize(actor, true);
        try { await observedUsers(); } catch (e) { return storageFailure(e); }
        authorize(actor, true);
        return { revision: users.revision, users: users.users.map(({ id, username, name, enabled }) => ({ id, username, name, enabled, admin: roles.adminIds.includes(id) })) };
      });
    },
    manage(actor, input) {
      const command = structuredClone(input), identity = structuredClone(actor);
      return enqueue(async () => {
        authorize(identity, true);
        const keys = { create: ['id', 'username', 'name', 'password'], reset: ['id', 'password'], access: ['id', 'enabled'] };
        if (!command || !Object.hasOwn(keys, command.action)) fail('invalid-member-command', 400);
        shape(command, ['action', 'expectedRevision', ...keys[command.action]]);
        revision(command.expectedRevision);
        const hashed = command.action === 'access' ? null : await passwordHash(command.password);
        authorize(identity, true);
        return commit(identity, command.expectedRevision, next => {
          const user = next.users.find(u => u.id === command.id);
          if (command.action === 'create') {
            if (user) fail('invalid-member-change', 400);
            next.users.push({ id: command.id, username: command.username, name: command.name, enabled: true, credentialVersion: 1, password: hashed });
          } else {
            if (!user) fail('invalid-member-change', 400);
            if (command.action === 'access') user.enabled = command.enabled;
            else {
              if (user.credentialVersion === Number.MAX_SAFE_INTEGER) fail('credential-version-exhausted');
              user.password = hashed; user.credentialVersion++;
            }
          }
          return next;
        }, true);
      });
    },
    password(actor, input) {
      const command = structuredClone(input), identity = structuredClone(actor);
      return enqueue(async () => {
        authorize(identity); shape(command, ['expectedRevision', 'currentPassword', 'password']); revision(command.expectedRevision);
        let source;
        try { source = await observedUsers(); } catch (e) { return storageFailure(e); }
        const user = source.users.find(u => u.id === identity.id);
        if (!user || !await verifyPassword(command.currentPassword, user.password)) fail('current-password-required', 403);
        const hashed = await passwordHash(command.password); authorize(identity);
        return commit(identity, command.expectedRevision, next => {
          const own = next.users.find(u => u.id === identity.id);
          if (own.credentialVersion === Number.MAX_SAFE_INTEGER) fail('credential-version-exhausted');
          own.password = hashed; own.credentialVersion++;
          return next;
        }, false);
      });
    },
    // Operator port only. No HTTP endpoint accepts a role list/file path. Invalid
    // config fails closed; only a valid reload can recover that config error.
    reloadRoles() {
      return enqueue(async () => {
        if (uncertain) fail('membership-restart-required');
        try {
          await observedUsers();
          const next = await readPrivateJSON(rolesFile);
          validateMembership(users, next); members.replace(users, next);
          roles = next; invalidRoles = false;
        } catch (e) { invalidRoles = true; return storageFailure(e); }
      });
    },
    async close() { closing = true; await queue; await store.close(); }
  };
}
