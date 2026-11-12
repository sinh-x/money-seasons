import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuth, readPassphrase } from '../auth.mjs';
import { createMembershipDirectory, hashPassword } from '../membership.mjs';
import { mkdtemp, writeFile, chmod, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const secret = 'synthetic-family-test-only', origin = 'https://family.example.test';
const request = (address = '127.0.0.1', extra = {}) => ({ headers: { host: 'family.example.test', origin, ...extra }, socket: { remoteAddress: address } });

test('secure 256-bit sessions; CSRF, expiry, logout and restart invalidation', async () => {
  let time = 0;
  const options = { passphrase: secret, origins: [origin], now: () => time };
  const auth = await createAuth(options), login = await auth.login(request(), secret);
  assert.match(login.cookie, /^ms_session=[a-f0-9]{64};/);
  for (const flag of ['HttpOnly', 'SameSite=Strict', 'Secure', 'Max-Age=86400']) assert.ok(login.cookie.includes(flag));
  assert.equal(login.csrf.length, 64);
  const req = request('127.0.0.1', { cookie: login.cookie.split(';')[0], 'x-csrf-token': login.csrf });
  assert.equal(auth.session(req, true).csrf, login.csrf);
  assert.throws(() => auth.session(request('127.0.0.1', { cookie: req.headers.cookie }), true), e => e.status === 403);
  const restarted = await createAuth(options);
  assert.throws(() => restarted.session(req), e => e.status === 401);
  assert.match(auth.logout(req), /Max-Age=0/);
  assert.throws(() => auth.session(req), e => e.status === 401);
  const next = await auth.login(request(), secret); req.headers.cookie = next.cookie.split(';')[0];
  time = 24 * 60 * 60_000;
  assert.throws(() => auth.session(req), e => e.status === 401);
});

test('development cookies coexist across localhost ports and logout is instance scoped', async () => {
  const names = ['a', 'b'].map(c => `ms_dev_${c.repeat(64)}`);
  const origins = ['https://localhost:43001', 'https://localhost:43002'];
  const auths = await Promise.all(names.map((cookieName, i) => createAuth({ passphrase: secret, origins: [origins[i]], cookieName })));
  const req = (i, cookie, csrf) => ({ headers: { host: new URL(origins[i]).host, origin: origins[i], cookie, 'x-csrf-token': csrf }, socket: { remoteAddress: '127.0.0.1' } });
  const logins = await Promise.all(auths.map((a, i) => a.login(req(i), secret)));
  const jar = logins.map(l => l.cookie.split(';')[0]).join('; ');
  for (let i = 0; i < 2; i++) assert.equal(auths[i].session(req(i, jar)).csrf, logins[i].csrf);
  assert.match(auths[1].logout(req(1, jar, logins[1].csrf)), new RegExp(`^${names[1]}=;`));
  assert.equal(auths[0].session(req(0, jar)).csrf, logins[0].csrf);
  assert.throws(() => auths[0].session(req(0, jar + '; ' + logins[0].cookie.split(';')[0])));
  await assert.rejects(createAuth({ passphrase: secret, origins: [origin], cookieName: 'bad; cookie' }));
});

test('five client failures per 15m, global thirty; forwarded identities ignored', async () => {
  let time = 0;
  const auth = await createAuth({ passphrase: secret, origins: [origin], now: () => time });
  for (let n = 0; n < 5; n++) await assert.rejects(auth.login(request('one', { 'x-forwarded-for': String(n) }), 'wrong'), e => e.status === 401);
  await assert.rejects(auth.login(request('one'), secret), e => e.status === 429);
  for (let n = 0; n < 25; n++) await assert.rejects(auth.login(request(String(n)), 'wrong'), e => e.status === 401);
  await assert.rejects(auth.login(request('new'), secret), e => e.status === 429);
  time += 15 * 60_000;
  assert.ok((await auth.login(request('one'), secret)).csrf);
});

test('parallel failures reserve capacity before expensive verification', async () => {
  const auth = await createAuth({ passphrase: secret, origins: [origin] });
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => auth.login(request(), 'wrong')));
  assert.equal(results.filter(r => r.reason.status === 401).length, 5);
  assert.equal(results.filter(r => r.reason.status === 429).length, 5);
});

test('host/origin/fetch-site spoof denied; missing origin on writes denied', async () => {
  const auth = await createAuth({ passphrase: secret, origins: [origin] });
  for (const changes of [{ host: 'evil.test' }, { origin: 'https://evil.test' }, { origin: undefined }, { 'sec-fetch-site': 'cross-site' }]) {
    await assert.rejects(auth.login(request('local', changes), secret), e => e.status === 403);
  }
  await assert.rejects(createAuth({ passphrase: 'short', origins: [origin] }));
  await assert.rejects(createAuth({ passphrase: secret, origins: [] }));
  await assert.rejects(createAuth({ passphrase: secret, origins: ['http://localhost:3080'] }));
  await assert.rejects(createAuth({ passphrase: secret, origins: [origin + '/path'] }));
  await assert.rejects(createAuth({ passphrase: secret, origins: ['http://public.test'], secure: false }));
});

test('member sessions bind current identity and revoke across roles/password/disable without bypassing CSRF', async () => {
  const password = await hashPassword(secret);
  const users = { version: 1, revision: 1, users: ['lan', 'minh'].map(id => ({ id, username: id, name: id, enabled: true, credentialVersion: 1, password })) };
  const roles = { version: 1, adminIds: ['lan'] }, membership = createMembershipDirectory(users, roles);
  const auth = await createAuth({ membership, origins: [origin], basePath: '/lichtaichinh' });
  const login = await auth.login(request(), { username: 'lan', password: secret });
  const req = request('127.0.0.1', { cookie: login.cookie.split(';')[0], 'x-csrf-token': login.csrf });
  assert.equal(auth.session(req, true).member.id, 'lan'); assert.equal(login.member.admin, true);
  assert.doesNotMatch(JSON.stringify(login.member), /password|salt|key/);
  assert.match(login.cookie, /Path=\/lichtaichinh\/; HttpOnly; SameSite=Strict/);
  assert.throws(() => auth.session(request('127.0.0.1', { cookie: req.headers.cookie }), true), e => e.status === 403);
  membership.replace(users, { version: 1, adminIds: ['minh'] });
  assert.throws(() => auth.session(req), e => e.status === 401);
  membership.replace(users, roles); assert.throws(() => auth.session(req), e => e.status === 401);
  const again = await auth.login(request(), { username: 'lan', password: secret });
  req.headers.cookie = again.cookie.split(';')[0]; req.headers['x-csrf-token'] = again.csrf;
  users.users[0].credentialVersion++;
  membership.replace(users, roles); assert.throws(() => auth.session(req), e => e.status === 401);
  const third = await auth.login(request(), { username: 'lan', password: secret });
  req.headers.cookie = third.cookie.split(';')[0];
  users.users[0].enabled = false; membership.replace(users, { version: 1, adminIds: ['minh'] });
  assert.throws(() => auth.session(req), e => e.status === 401);
  await assert.rejects(auth.login(request(), { username: 'lan', password: secret }), e => e.status === 401);
  await assert.rejects(auth.login(request(), { username: 'minh', password: secret, admin: true }), e => e.status === 401);
  await assert.rejects(createAuth({ membership, passphrase: secret, origins: [origin] }));
});

test('member login attempts share existing rate limits and origin boundary', async () => {
  const password = await hashPassword(secret), users = { version: 1, revision: 1, users: [{ id: 'lan', username: 'lan', name: 'Lan', enabled: true, credentialVersion: 1, password }] };
  const membership = createMembershipDirectory(users, { version: 1, adminIds: ['lan'] });
  const auth = await createAuth({ membership, origins: [origin] });
  await assert.rejects(auth.login(request('bad', { origin: 'https://evil.test' }), { username: 'lan', password: secret }), e => e.status === 403);
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => auth.login(request(), { username: 'absent', password: 'wrong' })));
  assert.equal(results.filter(r => r.reason.status === 401).length, 5);
  assert.equal(results.filter(r => r.reason.status === 429).length, 5);
});

test('private passphrase file only, bounded and not symlinked', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-secret-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const filename = path.join(dir, 'passphrase');
  await writeFile(filename, secret + '\n', { mode: 0o600 });
  assert.equal(await readPassphrase(filename), secret);
  await chmod(filename, 0o644); await assert.rejects(readPassphrase(filename)); await chmod(filename, 0o600);
  const alias = path.join(dir, 'alias'); await symlink(filename, alias); await assert.rejects(readPassphrase(alias));
});
