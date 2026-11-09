// Synthetic-only proof. Shared development Docker requires explicit operator-selected mode and pinned identity.
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { identityFor, checkout, privateDir, privateTree, pathGuard, exclusiveFile, readPrivate, digest, availablePort } from './stack-identity.mjs';
import { cloneDataset, selectDataset, inspectDataset } from './stack-data.mjs';
import { docker, dockerEnvironment, inventory, lifecycle, selectedData } from './local-stack.mjs';
import { blankPlan, convertLegacy } from '../public/model.js';
import { blankPlan as legacyBlank } from '../public/legacy-model.js';

export async function isolationPreflight(env = process.env, run = docker) {
  const mode = env.MS_ISOLATION_MODE || 'exclusive';
  if (!['exclusive', 'shared-development'].includes(mode)) throw new Error('Unknown isolation mode');
  const shared = mode === 'shared-development';
  const host = env.MS_ISOLATION_DOCKER_HOST, expectedId = env.MS_ISOLATION_DAEMON_ID, root = env.MS_ISOLATION_DOCKER_ROOT;
  if (!host?.startsWith('unix:///') || !expectedId || !root || (!shared && ['/var/run/docker.sock', '/run/docker.sock'].includes(host.slice(7)))) throw new Error('Isolated Docker gate missing: supply explicit private unix socket, expected daemon ID and private Docker root; default daemon is forbidden');
  const socket = host.slice(7);
  if (shared) await pathGuard(path.dirname(socket));
  else { await privateDir(path.dirname(socket)); await privateDir(root); }
  const s = await fs.lstat(socket);
  if (!s.isSocket() || !(shared ? [0, process.getuid()].includes(s.uid) && !(s.mode & 0o002) : s.uid === process.getuid())) throw new Error('Isolated socket ownership refused');
  const dockerEnv = { PATH: env.PATH, HOME: env.HOME, DOCKER_HOST: host, COMPOSE_DISABLE_ENV_FILE: '1' };
  const call = args => run(args, { env: dockerEnv });
  const info = JSON.parse(call(['info', '--format', '{{json .}}']));
  if (info.ID !== expectedId || info.DockerRootDir !== root) throw new Error('Isolated daemon identity/root mismatch');
  if (info.SecurityOptions?.some(option => option.includes('rootless'))) throw new Error('Rootless UID mapping does not satisfy the host/container UID1000 bind contract');
  if (!shared) {
    if (call(['ps', '-aq']) || call(['volume', 'ls', '-q'])) throw new Error('Isolated daemon must have no containers or volumes');
    const networks = call(['network', 'ls', '--format', '{{.Name}}']).split(/\s+/).filter(Boolean);
    if (networks.some(n => !['bridge', 'host', 'none'].includes(n))) throw new Error('Isolated daemon has foreign networks');
  } // Shared mode never inventories unrelated containers, networks, volumes or data.
  for (const image of ['node:22.23.0-alpine', 'caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d']) call(['image', 'inspect', image]);
  call(['compose', 'version']);
  return { host, dockerEnv, mode };
}
async function freePort(used) {
  for (let i = 0; i < 20; i++) {
    const server = net.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port; await new Promise(r => server.close(r));
    if (![3080, 3081, ...used].includes(port)) { used.push(port); return port; }
  }
  throw new Error('Unable to allocate owned nonreserved port');
}
async function fixture(root, label, home, port) {
  // Two equal basenames/different physical paths, no Git branch/checkout allocation.
  const worktree = path.join(root, label, 'app'); await fs.mkdir(worktree, { recursive: true, mode: 0o700 });
  for (const name of ['Dockerfile', '.dockerignore', 'package.json', 'server.mjs', 'persistence.mjs', 'auth.mjs', 'compose.local.yaml', 'public', 'ops']) await fs.cp(path.join(checkout, name), path.join(worktree, name), { recursive: true });
  const s = await fs.stat(worktree), identity = identityFor({ repository: 'synthetic-fixture-only', worktree, device: String(s.dev), inode: String(s.ino) });
  const base = path.join(home, '.local/share/money-seasons-dev', identity.id); await privateTree(path.dirname(base)); await privateDir(base, true);
  const state = { version: 1, ...identity, port, selected: null }, manifest = path.join(base, 'instance.json');
  await exclusiveFile(manifest, JSON.stringify(state)); return { ...state, base, manifest };
}
async function reload(instance) { return { ...instance, ...JSON.parse((await readPrivate(instance.manifest)).toString('utf8')) }; }
async function select(instance, id) {
  const current = await reload(instance);
  await selectDataset(current, id, { proveStopped: async () => (await inventory(current, current.selected ? await selectedData(current) : '')).length === 0 });
  return reload(current);
}
async function request(instance, route, { method = 'GET', cookie, csrf, body, origin = `https://localhost:${instance.port}` } = {}) {
  const ca = await fs.readFile(path.join(instance.base, 'caddy/caddy/pki/authorities/local/root.crt'));
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: 'localhost', family: 4, port: instance.port, path: route, method, ca, rejectUnauthorized: true,
      headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) } }, res => {
      let raw = ''; res.on('data', chunk => { raw += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, cookie: res.headers['set-cookie']?.[0]?.split(';')[0], cookieAttributes: res.headers['set-cookie']?.[0], body: JSON.parse(raw) }));
    });
    req.setTimeout(10_000, () => req.destroy(new Error('Synthetic HTTPS timeout'))); req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}
async function login(instance) {
  const passphrase = (await readPrivate(path.join(instance.base, 'passphrase'))).toString('utf8').trim();
  const result = await request(instance, '/api/login', { method: 'POST', body: { passphrase } });
  assert.equal(result.status, 200);
  for (const flag of ['Secure', 'HttpOnly', 'SameSite=Strict']) assert.ok(result.cookieAttributes.includes(flag));
  return { cookie: result.cookie, csrf: result.body.csrf };
}
async function fingerprint(instance) {
  const data = await selectedData(instance), containers = await inventory(instance, data);
  return { containers: containers.map(c => ({ id: c.Id, image: c.Image, started: c.State.StartedAt, mounts: c.Mounts, networks: Object.keys(c.NetworkSettings.Networks) })).sort((a, b) => a.id.localeCompare(b.id)),
    data: digest(await readPrivate(path.join(data, 'plan.json'), 1_001_024)),
    secret: digest(await readPrivate(path.join(instance.base, 'passphrase'))),
    ca: digest(await fs.readFile(path.join(instance.base, 'caddy/caddy/pki/authorities/local/root.crt'))) };
}
export async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1 || argv[0] !== '--synthetic-only') throw new Error('Only --synthetic-only is supported');
  // Admission occurs BEFORE temp state, daemon discovery or any Docker effect.
  const gate = await isolationPreflight();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ms006-docker-'));
  const savedEnv = { ...process.env }; let clean = true;
  const instances = [], used = [];
  try {
    process.env.DOCKER_HOST = gate.host; delete process.env.DOCKER_CONTEXT;
    process.env.HOME = path.join(root, 'home'); await fs.mkdir(process.env.HOME, { mode: 0o700 });
    process.env.DOCKER_CONFIG = path.join(root, 'docker-config'); await fs.mkdir(process.env.DOCKER_CONFIG, { mode: 0o700 });
    const pHome = path.join(root, 'protected-home'); await fs.mkdir(pHome, { mode: 0o700 });
    for (const [label, home] of [['protected', pHome], ['a', process.env.HOME], ['b', process.env.HOME]]) instances.push(await fixture(root, label, home, await freePort(used)));
    let [p, a, b] = instances;
    assert.notEqual(a.project, b.project); assert.notEqual(a.cookieName, b.cookieName);
    const source = path.join(root, 'synthetic-source'); await fs.mkdir(source, { mode: 0o700 });
    const planFile = path.join(source, 'plan.json');
    await exclusiveFile(planFile, JSON.stringify({ schemaVersion: 'money-seasons-store/v1', revision: 1, plan: blankPlan() }));
    const initialConfig = path.join(root, 'initial-source.json'); await exclusiveFile(initialConfig, JSON.stringify({ planFile }));
    await cloneDataset(p, { sourceConfig: initialConfig, id: 'protected' }); p = await select(p, 'protected'); instances[0] = p;
    await lifecycle(p, 'up'); const sourceConfig = path.join(root, 'protected-source.json');
    await exclusiveFile(sourceConfig, JSON.stringify({ planFile: path.join(await selectedData(p), 'plan.json') }));
    for (const instance of [a, b]) await cloneDataset(instance, { sourceConfig, id: 'trial' });
    a = await select(a, 'trial'); b = await select(b, 'trial'); instances[1] = a; instances[2] = b;
    await lifecycle(a, 'up'); await lifecycle(b, 'up');
    const pLogin = await login(p), bLogin = await login(b), aLogin = await login(a);
    const aSecret = await readPrivate(path.join(a.base, 'passphrase')), bSecret = await readPrivate(path.join(b.base, 'passphrase'));
    assert.notDeepEqual(aSecret, bSecret);
    const protectedBefore = await fingerprint(p), peerBefore = await fingerprint(b), aBefore = await fingerprint(a);
    assert.notEqual(aBefore.ca, peerBefore.ca); assert.notEqual(aBefore.ca, protectedBefore.ca);
    const jar = `${aLogin.cookie}; ${bLogin.cookie}`;
    assert.equal((await request(a, '/api/session', { cookie: jar })).status, 200);
    assert.equal((await request(b, '/api/logout', { method: 'POST', cookie: jar, csrf: bLogin.csrf })).status, 200);
    assert.equal((await request(a, '/api/session', { cookie: jar })).status, 200);
    const peerSession = await login(b);
    assert.equal((await request(a, '/api/plan')).status, 401);
    assert.equal((await request(a, '/api/plan', { ...aLogin, method: 'PUT', body: {}, csrf: undefined })).status, 403);
    assert.equal((await request(a, '/api/session', { ...aLogin, origin: 'https://invalid.example' })).status, 403);
    const plan = (await request(a, '/api/plan', aLogin)).body; plan.plan.name = 'Synthetic worktree A edit';
    assert.equal((await request(a, '/api/plan', { ...aLogin, method: 'PUT', body: { plan: plan.plan, expectedRevision: plan.revision, operation: 'edit' } })).status, 200);
    const aEdited = await fingerprint(a);
    await assert.rejects(availablePort(a.port));
    await cloneDataset(a, { sourceConfig, id: 'fresh' });
    await assert.rejects(select(a, 'fresh')); await assert.rejects(cloneDataset(a, { sourceConfig, id: 'trial' }));
    for (let cycle = 0; cycle < 5; cycle++) {
      await lifecycle(a, 'down'); await lifecycle(a, 'up');
      const current = await fingerprint(a);
      for (const key of ['data', 'secret', 'ca']) assert.equal(current[key], aEdited[key]);
      assert.deepEqual(await fingerprint(p), protectedBefore); assert.deepEqual(await fingerprint(b), peerBefore);
      assert.equal((await request(p, '/api/session', pLogin)).status, 200); assert.equal((await request(b, '/api/session', peerSession)).status, 200);
    }
    await lifecycle(a, 'down'); a = await select(a, 'fresh'); instances[1] = a;
    assert.ok(await inspectDataset(a, 'trial')); await lifecycle(a, 'up'); await lifecycle(a, 'down');
    const legacy = legacyBlank(), legacyFile = path.join(source, 'legacy.json');
    await exclusiveFile(legacyFile, JSON.stringify({ schemaVersion: 'money-seasons-store/v1', revision: 4, plan: legacy }));
    // Source contract always names plan.json. Change only this owned synthetic source, never P.
    await fs.rename(legacyFile, planFile);
    await cloneDataset(a, { sourceConfig: initialConfig, id: 'legacy' }); a = await select(a, 'legacy'); instances[1] = a;
    const original = await fs.readFile(path.join((await inspectDataset(a, 'legacy')).directory, 'original.json'));
    await lifecycle(a, 'up'); const legacyLogin = await login(a), converted = convertLegacy(legacy, { confirmed: true });
    const replacement = { plan: converted, expectedRevision: 4, operation: 'replace', confirmed: true };
    assert.equal((await request(a, '/api/plan', { ...legacyLogin, method: 'PUT', body: replacement })).status, 400);
    assert.equal((await request(a, '/api/plan', { ...legacyLogin, method: 'PUT', body: { ...replacement, migrationConfirmed: true } })).status, 200);
    assert.deepEqual(await fs.readFile(path.join((await inspectDataset(a, 'legacy')).directory, 'original.json')), original);
    await lifecycle(a, 'down');
    const working = path.join(await selectedData(a), 'plan.json'), bytes = await fs.readFile(working); await fs.unlink(working);
    await assert.rejects(lifecycle(a, 'up')); await exclusiveFile(working, bytes);
    assert.deepEqual(await fingerprint(p), protectedBefore); assert.deepEqual(await fingerprint(b), peerBefore);
    console.log(`PASS synthetic Docker isolation (${gate.mode}): protected source + two worktree identities, five rebuild/restart cycles, TLS/auth/session isolation, copy-only migration, NEW-only clone, stopped-only selection and missing-data refusal. Human UAT not run.`);
  } finally {
    // Only validated, labelled fixture resources; never prune or global down. Keep state if ownership/stop is uncertain.
    for (let instance of instances.reverse()) {
      try {
        instance = await reload(instance); await lifecycle(instance, 'down');
        for (const service of ['web', 'caddy']) {
          const tag = `${instance.project}-${service}:dev`, env = dockerEnvironment(instance);
          if (docker(['image', 'ls', '-q', '--filter', `reference=${tag}`], { env })) {
            const image = JSON.parse(docker(['image', 'inspect', tag], { env }))[0];
            assert.equal(image.Config.Labels['org.money-seasons.instance'], instance.id);
            docker(['image', 'rm', tag], { env });
          }
        }
      } catch { clean = false; }
    }
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
    if (clean) await fs.rm(root, { recursive: true, force: true });
    else { console.error(`Owned fixture cleanup is uncertain; private state retained at ${root}. No global cleanup attempted.`); process.exitCode = 1; }
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); }
  catch (e) { console.error(e.message.startsWith('Isolated Docker gate missing:') ? e.message : 'Synthetic isolation proof failed/refused; no production fallback. Inspect only owned fixture state privately.'); process.exitCode = 1; }
}
