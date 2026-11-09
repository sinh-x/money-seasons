// Host-only development identity and private filesystem guards. Never opens production stores.
import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const checkout = fileURLToPath(new URL('../', import.meta.url));
export const inside = (child, parent) => child === parent || child.startsWith(parent + path.sep);
export const fail = code => { throw new Error(code); };
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function devPort(value) {
  if (!/^\d+$/.test(String(value))) fail('Explicit integer development port required');
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 3080 || port === 3081) fail('Invalid/reserved development port (3080 production; 3081 legacy)');
  return port;
}
export async function pathGuard(filename) {
  if (!path.isAbsolute(filename) || path.resolve(filename) !== filename) fail('Canonical absolute path required');
  let current = path.parse(filename).root;
  for (const part of filename.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const s = await fs.lstat(current);
    if (!s.isDirectory()) fail('Symlink/non-directory path refused');
    try { await fs.lstat(path.join(current, '.git')); fail('Private state must be outside Git'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
}
export async function privateDir(filename, create = false) {
  await pathGuard(path.dirname(filename));
  if (create) await fs.mkdir(filename, { mode: 0o700 }).catch(e => { if (e.code !== 'EEXIST') throw e; });
  await pathGuard(filename);
  const s = await fs.lstat(filename);
  if (s.uid !== process.getuid() || (s.mode & 0o777) !== 0o700) fail('Directory must be owned and mode 0700');
}
export async function privateTree(filename) {
  async function ancestors(dir) {
    try {
      await pathGuard(dir);
      const s = await fs.lstat(dir);
      if (s.uid !== process.getuid() || (s.mode & 0o022)) fail('Unsafe state ancestor');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      await ancestors(path.dirname(dir)); await privateDir(dir, true);
    }
  }
  await ancestors(path.dirname(filename));
  await privateDir(filename, true);
}
export async function readPrivate(filename, limit = 64_000) {
  await privateDir(path.dirname(filename));
  const handle = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const s = await handle.stat();
    if (!s.isFile() || s.uid !== process.getuid() || s.nlink !== 1 || (s.mode & 0o777) !== 0o600 || s.size > limit) fail('Unsafe private file');
    // Bounded even if an uncooperative writer grows the inode after fstat.
    const bytes = Buffer.alloc(limit + 1);
    let size = 0, n;
    while (size < bytes.length && (n = (await handle.read(bytes, size, bytes.length - size, null)).bytesRead)) size += n;
    if (size > limit) fail('Private file exceeds limit');
    return bytes.subarray(0, size);
  } finally { await handle.close(); }
}
export async function syncDir(dir) {
  const h = await fs.open(dir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { await h.sync(); } finally { await h.close(); }
}
export async function exclusiveFile(filename, bytes) {
  const h = await fs.open(filename, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await h.writeFile(bytes); await h.sync(); } finally { await h.close(); }
}
export async function atomicJson(filename, value) {
  // Existing target must be safe; never replace an unexpected link.
  await readPrivate(filename);
  const temp = path.join(path.dirname(filename), `.manifest-${randomBytes(12).toString('hex')}`);
  try {
    await exclusiveFile(temp, JSON.stringify(value) + '\n');
    await fs.rename(temp, filename); await syncDir(path.dirname(filename));
  } finally { await fs.unlink(temp).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
}
export async function withInstanceLock(instance, action) {
  const lock = path.join(instance.base, 'operation.lock');
  await exclusiveFile(lock, JSON.stringify({ pid: process.pid }));
  try { return await action(); }
  finally { await fs.unlink(lock); await syncDir(instance.base); }
}
export async function worktreeIdentity(root = checkout) {
  if (await fs.realpath(root) !== path.resolve(root)) fail('Aliased worktree refused');
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const worktree = await fs.realpath(git('rev-parse', '--show-toplevel'));
  if (worktree !== path.resolve(root)) fail('Exact physical worktree root required');
  const repository = await fs.realpath(path.resolve(root, git('rev-parse', '--git-common-dir')));
  const s = await fs.stat(worktree);
  return identityFor({ repository, worktree, device: String(s.dev), inode: String(s.ino) });
}
export function identityFor(binding) {
  const id = digest(JSON.stringify([binding.repository, binding.worktree]));
  return { ...binding, id, project: `ms-dev-${id.slice(0, 24)}`, cookieName: `ms_dev_${id}` };
}
export async function loadInstance({ root = checkout, home = os.homedir(), port, create = false } = {}) {
  if (process.getuid() !== 1000) fail('Development containers require host UID 1000');
  if (port !== undefined) devPort(port);
  const identity = await worktreeIdentity(root);
  const parent = path.join(home, '.local/share/money-seasons-dev');
  // Only newly created ancestors receive private modes; existing unsafe ones are never repaired.
  if (create) await privateTree(parent); else await privateDir(parent);
  const registryLock = path.join(parent, 'registry.lock');
  await exclusiveFile(registryLock, JSON.stringify({ pid: process.pid }));
  try { return await load(); }
  finally { await fs.unlink(registryLock); await syncDir(parent); }
  async function load() {
  const base = path.join(parent, identity.id);
  if (create) await privateDir(base, true); else await privateDir(base);
  const manifest = path.join(base, 'instance.json');
  let existing;
  try {
    const state = JSON.parse((await readPrivate(manifest)).toString('utf8'));
    for (const [key, value] of Object.entries(identity)) if (state[key] !== value) fail('Foreign/replaced worktree manifest refused');
    if (state.version !== 1 || devPort(state.port) !== state.port || (port !== undefined && devPort(port) !== state.port)) fail('Manifest/port mismatch; port changes require a separate instance');
    if (state.selected !== null && (typeof state.selected !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(state.selected))) fail('Invalid selected dataset');
    existing = state;
  } catch (e) {
    if (e.code !== 'ENOENT' || !create) throw e;
  }
  const selectedPort = existing ? existing.port : devPort(port);
  // Full identity and port collision check, including a truncated Docker prefix collision.
  for (const entry of await fs.readdir(parent)) {
    if (entry === identity.id || entry === 'registry.lock') continue;
    const peer = JSON.parse((await readPrivate(path.join(parent, entry, 'instance.json'))).toString('utf8'));
    if (peer.project === identity.project || peer.id === identity.id || peer.port === selectedPort) fail('Existing instance identity/port collision');
  }
  if (existing) return { ...existing, base, manifest };
  const state = { version: 1, ...identity, port: selectedPort, selected: null };
  await exclusiveFile(manifest, JSON.stringify(state) + '\n'); await syncDir(base); await syncDir(parent);
  return { ...state, base, manifest };
  }
}
export async function availablePort(port) {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', () => reject(new Error('Development port unavailable; owner left unchanged'))); server.listen(devPort(port), '127.0.0.1', resolve); });
  await new Promise(resolve => server.close(resolve));
}
