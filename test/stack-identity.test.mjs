import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { identityFor, loadInstance, worktreeIdentity, privateTree, devPort, availablePort, readPrivate, privateDir, checkout } from '../scripts/stack-identity.mjs';

test('identity binds repository and physical worktree, never basename/branch', () => {
  const a = identityFor({ repository: '/repo/.git', worktree: '/one/app', device: '1', inode: '2' });
  const b = identityFor({ repository: '/repo/.git', worktree: '/two/app', device: '1', inode: '3' });
  assert.notEqual(a.project, b.project); assert.notEqual(a.cookieName, b.cookieName);
  assert.equal(a.id.length, 64); assert.deepEqual(identityFor({ ...a }), a);
});
test('reserved, invalid and occupied ports refuse without affecting owner', async () => {
  for (const p of [undefined, 0, 1023, 3080, 3081, 65536, 1.5, 'abc', '3082x']) assert.throws(() => devPort(p));
  const server = net.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { await assert.rejects(availablePort(server.address().port)); assert.ok(server.listening); }
  finally { await new Promise(r => server.close(r)); }
});
test('private manifest is stable, rejects changed binding, port and unsafe files', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-identity-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const options = { home, root: path.resolve(checkout), port: 43001, create: true };
  const a = await loadInstance(options), b = await loadInstance(options);
  assert.deepEqual(a, b); assert.equal((await fs.stat(a.base)).mode & 0o777, 0o700);
  await assert.rejects(loadInstance({ ...options, port: 43002 }));
  await fs.chmod(a.manifest, 0o644); await assert.rejects(loadInstance(options)); await fs.chmod(a.manifest, 0o600);
  await fs.writeFile(a.manifest, JSON.stringify({ ...a, inode: 'foreign' })); await assert.rejects(loadInstance(options));
});
test('registered peer port collisions and relocated checkout registrations refuse even on reload', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-registration-')); t.after(() => fs.rm(home, { recursive: true, force: true }));
  const a = await loadInstance({ home, port: 43004, create: true });
  const peer = { version: 1, ...identityFor({ repository: a.repository, worktree: '/synthetic/peer', registration: '/synthetic/registration' }), port: a.port, selected: null };
  const dir = path.join(path.dirname(a.base), peer.id); await fs.mkdir(dir, { mode: 0o700 });
  const file = path.join(dir, 'instance.json'); await fs.writeFile(file, JSON.stringify(peer), { mode: 0o600 });
  await assert.rejects(loadInstance({ home }));
  await fs.writeFile(file, JSON.stringify({ ...peer, port: 43005, registration: a.registration }));
  await assert.rejects(loadInstance({ home }));
});

test('refused port collision does not leave a partial instance that blocks peers', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-collision-')); t.after(() => fs.rm(home, { recursive: true, force: true }));
  const parent = path.join(home, '.local/share/money-seasons-dev'); await privateTree(parent);
  const peer = { version: 1, ...identityFor({ repository: '/synthetic/repo', worktree: '/synthetic/peer', registration: '/synthetic/gitdir' }), port: 43007, selected: null };
  const dir = path.join(parent, peer.id); await fs.mkdir(dir, { mode: 0o700 }); await fs.writeFile(path.join(dir, 'instance.json'), JSON.stringify(peer), { mode: 0o600 });
  await assert.rejects(loadInstance({ home, create: true, port: 43007 }));
  await assert.rejects(fs.stat(path.join(parent, (await worktreeIdentity()).id)));
  assert.equal((await loadInstance({ home, create: true, port: 43008 })).port, 43008);
});

test('symlinks, hardlinks and Git-contained private state refuse', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-guards-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'safe'); await fs.writeFile(file, 'synthetic', { mode: 0o600 });
  const alias = path.join(dir, 'alias'); await fs.symlink(dir, alias); await assert.rejects(privateDir(alias));
  await fs.link(file, path.join(dir, 'hard')); await assert.rejects(readPrivate(file));
  await fs.mkdir(path.join(dir, '.git')); await assert.rejects(privateDir(dir));
});
