import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, mkdir, symlink, link, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { hashPassword, verifyPassword, validateMembership, authenticateMember, memberIdentity, readPrivateJSON, createMembershipDirectory } from '../membership.mjs';

const password = 'synthetic-member-password-only';
const verifier = { algorithm: 'scrypt', salt: 'a'.repeat(64), key: 'b'.repeat(128) };
const user = (id, changes = {}) => ({ id, username: id, name: 'Synthetic member', enabled: true, credentialVersion: 1, password: verifier, ...changes });
const fixture = () => ({ users: { version: 1, revision: 1, users: [user('lan'), user('minh')] }, roles: { version: 1, adminIds: ['lan'] } });

test('private membership validates unique identities and separate operator-only roles', () => {
  const { users, roles } = fixture(), original = JSON.stringify({ users, roles });
  assert.deepEqual(validateMembership(users, roles), { users, roles });
  assert.equal(JSON.stringify({ users, roles }), original);
  assert.equal(memberIdentity(users, roles, 'lan').admin, true);
  assert.equal(memberIdentity(users, roles, 'minh').admin, false);
  assert.deepEqual(Object.keys(memberIdentity(users, roles, 'lan')).sort(), ['admin', 'credentialVersion', 'id', 'name', 'username']);
  assert.doesNotMatch(JSON.stringify(memberIdentity(users, roles, 'lan')), /password|salt|key/);
  roles.adminIds.push('minh'); assert.doesNotThrow(() => validateMembership(users, roles));
  users.users[0].enabled = false; assert.doesNotThrow(() => validateMembership(users, roles));
  assert.throws(() => memberIdentity(users, roles, 'lan'), /login-required/);
  users.users[1].enabled = false; assert.throws(() => validateMembership(users, roles), /enabled-admin-required/);
});

test('malformed config, duplicate usernames, role injection and missing enabled admin fail closed', () => {
  const changes = [
    (u, r) => { r.adminIds = []; }, (u, r) => { r.adminIds = ['unknown']; },
    (u, r) => { r.adminIds = ['lan', 'lan']; }, (u, r) => { r.extra = true; },
    u => { u.users.push(user('lan')); }, u => { u.users[1].username = 'lan'; },
    u => { u.users[1].username = 'Lan'; }, u => { u.users[0].admin = true; },
    u => { u.users[0].enabled = false; }, u => { u.users[0].credentialVersion = 0; },
    u => { u.users[0].password = { ...verifier, cost: 1 }; },
    u => { u.users[0].password = { ...verifier, salt: '00' }; },
    u => { u.users[0].password = { ...verifier, algorithm: 'plaintext' }; },
    u => { u.users[0].id = '../lan'; }, u => { u.revision = Number.MAX_SAFE_INTEGER + 1; },
    u => { u.users[0].name = ' '; }, u => { u.password = password; }
  ];
  for (const change of changes) {
    const { users, roles } = fixture(); change(users, roles);
    assert.throws(() => validateMembership(users, roles));
  }
});

test('salted fixed-parameter scrypt, bounded password input and indistinguishable invalid identities', async () => {
  const first = await hashPassword(password), second = await hashPassword(password);
  assert.notDeepEqual(first, second); assert.equal(first.algorithm, 'scrypt');
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('wrong', first), false);
  for (const invalid of ['', 'short', null, 'a'.repeat(1025)]) await assert.rejects(hashPassword(invalid));
  assert.equal(await verifyPassword('a'.repeat(1025), first), false);
  const { users, roles } = fixture(); users.users[0].password = first;
  assert.equal((await authenticateMember(users, roles, 'lan', password)).id, 'lan');
  for (const [name, value] of [['LAN', password], ['unknown', password], ['lan', 'wrong'], ['lan', null]]) {
    await assert.rejects(authenticateMember(users, roles, name, value), { message: 'invalid-login' });
  }
  roles.adminIds = ['minh']; users.users[0].enabled = false;
  await assert.rejects(authenticateMember(users, roles, 'lan', password), { message: 'invalid-login' });
});

test('session identity is refreshed from current credential/role state, with no finance privilege', () => {
  const { users, roles } = fixture(), before = memberIdentity(users, roles, 'lan');
  roles.adminIds = ['minh'];
  assert.equal(memberIdentity(users, roles, 'lan').admin, false);
  users.users[0].credentialVersion++;
  assert.notEqual(memberIdentity(users, roles, 'lan').credentialVersion, before.credentialVersion);
  assert.throws(() => memberIdentity(users, roles, 'absent'), /login-required/);
  assert.equal('plan' in before, false);
});

test('directory reload revokes epochs, cannot delete members, and rejects in-flight stale authentication', async () => {
  const { users, roles } = fixture(); users.users[0].password = await hashPassword(password);
  const directory = createMembershipDirectory(users, roles), before = directory.current('lan');
  const pending = directory.authenticate('lan', password);
  directory.replace(users, { ...roles, adminIds: ['minh'] });
  await assert.rejects(pending, /invalid-login/);
  assert.ok(directory.current('lan').authEpoch > before.authEpoch);
  const revoked = directory.current('lan').authEpoch;
  directory.replace(users, roles); assert.ok(directory.current('lan').authEpoch > revoked);
  const originalEpoch = directory.current('lan').authEpoch;
  directory.replace(structuredClone(users), structuredClone(roles)); assert.equal(directory.current('lan').authEpoch, originalEpoch);
  const removed = structuredClone(users); removed.users.pop(); assert.throws(() => directory.replace(removed, roles), /member-deletion-denied/);
  const changed = structuredClone(users); changed.users[0].password = await hashPassword(password + '-new');
  assert.throws(() => directory.replace(changed, roles), /credential-version-required/);
  changed.users[0].credentialVersion++;
  directory.replace(changed, roles);
  await assert.rejects(directory.authenticate('lan', password), /invalid-login/);
  assert.equal((await directory.authenticate('lan', password + '-new')).id, 'lan');
  const disabled = structuredClone(changed); disabled.users[0].enabled = false;
  directory.replace(disabled, { version: 1, adminIds: ['minh'] });
  assert.throws(() => directory.current('lan'), /login-required/);
  // Failed replacement did not install zero-admin state.
  assert.throws(() => directory.replace(disabled, roles));
  assert.equal(directory.current('minh').admin, true);
});

test('private JSON reads only bounded owned files outside Git, without symlink or hardlink aliases', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-membership-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'users.json');
  await writeFile(file, JSON.stringify(fixture().users), { mode: 0o600 });
  assert.deepEqual(await readPrivateJSON(file), fixture().users);
  await assert.rejects(readPrivateJSON('relative.json'));
  await chmod(file, 0o644); await assert.rejects(readPrivateJSON(file)); await chmod(file, 0o600);
  await chmod(dir, 0o755); await assert.rejects(readPrivateJSON(file)); await chmod(dir, 0o700);
  const alias = path.join(dir, 'alias'); await symlink(file, alias); await assert.rejects(readPrivateJSON(alias));
  const parentAlias = path.join(dir, 'parent'); await symlink(dir, parentAlias); await assert.rejects(readPrivateJSON(path.join(parentAlias, 'users.json')));
  const hard = path.join(dir, 'hard'); await link(file, hard); await assert.rejects(readPrivateJSON(hard));
  const repo = path.join(dir, 'checkout'); await mkdir(repo, { mode: 0o700 });
  await writeFile(path.join(repo, '.git'), 'gitdir: synthetic');
  await writeFile(path.join(repo, 'roles.json'), '{}', { mode: 0o600 });
  await assert.rejects(readPrivateJSON(path.join(repo, 'roles.json')));
  const oversized = path.join(dir, 'oversized'); await writeFile(oversized, ' '.repeat(1_000_001), { mode: 0o600 });
  await assert.rejects(readPrivateJSON(oversized));
  const malformed = path.join(dir, 'malformed'); await writeFile(malformed, Buffer.from([0xff]), { mode: 0o600 });
  await assert.rejects(readPrivateJSON(malformed));
});
