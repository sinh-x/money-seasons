import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { loadInstance, exclusiveFile } from '../scripts/stack-identity.mjs';
import { cloneDataset, selectDataset, inspectDataset } from '../scripts/stack-data.mjs';
import { blankPlan } from '../public/model.js';
import { dockerEnvironment, composeArgs, prepareRuntime, verifyContainer, inventory, lifecycle, expectedMounts } from '../scripts/local-stack.mjs';

const instance = { id: 'a'.repeat(64), project: `ms-dev-${'a'.repeat(24)}`, port: 43003, base: '/private/a', worktree: '/checkout/a', cookieName: `ms_dev_${'a'.repeat(64)}` };
function container(service = 'web', owner = instance, data = '/private/a/data') {
  return { Id: `owned-${service}`, Config: { Image: `${owner.project}-${service}:dev`, Labels: { 'org.money-seasons.instance': owner.id, 'com.docker.compose.project': owner.project, 'com.docker.compose.service': service } },
    Mounts: expectedMounts(owner, data, service).map(([Destination, Source, RW]) => ({ Type: 'bind', Destination, Source, RW })),
    HostConfig: { PortBindings: service === 'web' ? {} : { [`${owner.port}/tcp`]: [{ HostIp: '127.0.0.1', HostPort: String(owner.port) }] } },
    NetworkSettings: { Networks: Object.fromEntries(['backend', ...(service === 'caddy' ? ['edge'] : [])].map(n => [`${owner.project}_${n}`, {}])) }, State: { Running: false, Status: 'exited' } };
}
test('worktree Compose retains loopback, internal app and hardening with required namespaces', async () => {
  const source = await fs.readFile('compose.local.yaml', 'utf8');
  assert.match(source, /name: \$\{MS_DEV_PROJECT:\?/); assert.match(source, /image: \$\{MS_DEV_PROJECT:\?\}-web:dev/);
  assert.match(source, /127\.0\.0\.1:\$\{MS_DEV_PORT:\?\}:\$\{MS_DEV_PORT:\?\}/);
  assert.match(source, /MONEY_SEASONS_COOKIE_NAME: \$\{MS_DEV_COOKIE:\?\}/);
  assert.match(source, /backend:\s+internal: true/); assert.match(source, /networks: \[backend\]/);
  assert.match(source, /networks: \[edge, backend\]/); assert.doesNotMatch(source.split('  caddy:')[0], /^\s+ports:/m);
  for (const expected of ['GOMAXPROCS: "2"', 'pids_limit: 64', 'user: "1000:1000"', 'cap_drop: [ALL]', 'no-new-privileges:true', 'mem_limit: 128m']) assert.ok(source.includes(expected));
  assert.equal((source.match(/read_only: true/g) || []).length, 4);
  assert.doesNotMatch(source, /money-seasons-local-test|3081|\$\{HOME\}|external:|privileged:/);
  const config = await fs.readFile('ops/Caddyfile.local', 'utf8');
  for (const expected of ['admin off', 'skip_install_trust', 'tls internal', 'https://localhost:{$MS_DEV_PORT}', 'reverse_proxy web:3080']) assert.ok(config.includes(expected));
  const image = await fs.readFile('ops/Dockerfile.caddy-local', 'utf8');
  assert.match(image, /RUN setcap -r/); assert.match(image, /USER 1000:1000/);
});
test('Docker argv/environment cannot inherit production, project or dotenv overrides', () => {
  process.env.COMPOSE_PROJECT_NAME = 'money-seasons'; process.env.MS_DEV_PROJECT = 'money-seasons'; process.env.MONEY_SEASONS_DATA_DIR = '/production';
  try {
    const env = dockerEnvironment(instance, '/private/a/data');
    assert.equal(env.MS_DEV_PROJECT, instance.project); assert.equal(env.COMPOSE_PROJECT_NAME, undefined); assert.equal(env.MONEY_SEASONS_DATA_DIR, undefined);
    const args = composeArgs(instance, ['down']); assert.ok(args.includes('/dev/null')); assert.ok(args.includes(instance.project)); assert.ok(!args.includes('money-seasons'));
  } finally { delete process.env.COMPOSE_PROJECT_NAME; delete process.env.MS_DEV_PROJECT; delete process.env.MONEY_SEASONS_DATA_DIR; }
});
test('private runtime credentials are independent, stable, and unsafe files refuse', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-runtime-')); t.after(() => fs.rm(home, { recursive: true, force: true }));
  const a = await loadInstance({ home, port: 43003, create: true }); await prepareRuntime(a);
  const secret = path.join(a.base, 'passphrase'), before = await fs.readFile(secret);
  await prepareRuntime(a); assert.deepEqual(await fs.readFile(secret), before);
  assert.equal((await fs.stat(secret)).mode & 0o777, 0o600);
  await fs.chmod(secret, 0o644); await assert.rejects(prepareRuntime(a)); assert.deepEqual(await fs.readFile(secret), before);
});
test('foreign labels/mounts/images/ports/networks refuse before lifecycle effects', () => {
  for (const service of ['web', 'caddy']) assert.equal(verifyContainer(instance, '/private/a/data', container(service)), service);
  for (const mutate of [c => { c.Config.Labels['org.money-seasons.instance'] = 'foreign'; }, c => { c.Config.Image = 'production'; }, c => { c.Mounts[0].Source = '/production'; }, c => { c.Mounts.push({ Type: 'volume' }); }, c => { c.HostConfig.PortBindings = { '3080/tcp': [] }; }, c => { c.NetworkSettings.Networks.production = {}; }]) {
    const c = container(); mutate(c); assert.throws(() => verifyContainer(instance, '/private/a/data', c));
  }
});
test('inventory refuses unowned Docker images/networks and unknown daemon errors', async () => {
  await assert.rejects(inventory(instance, '/private/a/data', () => { throw new Error('daemon unknown'); }));
  const run = args => {
    if (args[0] === 'image' && args[1] === 'ls') return 'collision';
    if (args[0] === 'image' && args[1] === 'inspect') return JSON.stringify([{ Config: { Labels: {} } }]);
    return '';
  };
  await assert.rejects(inventory(instance, '/private/a/data', run), /image tag collision/);
  await assert.rejects(inventory(instance, '/private/a/data', args => args[0] === 'network' && args.includes('--format') ? 'collision' : ''), /network name collision/);
  await assert.rejects(inventory(instance, '/private/a/data', args => {
    if (args[0] === 'network' && args[1] === 'ls') return 'owned-network';
    if (args[0] === 'network' && args[1] === 'inspect') return JSON.stringify([{ Name: `${instance.project}_backend`, Internal: true, Labels: { 'org.money-seasons.instance': instance.id }, Containers: { foreign: {} } }]);
    return '';
  }), /Foreign network attachment/);
});
test('lifecycle command model scopes five rebuild/down/up cycles; foreign mounts prevent all effects', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-lifecycle-')); t.after(() => fs.rm(home, { recursive: true, force: true }));
  let a = await loadInstance({ home, port: 43006, create: true });
  const source = path.join(home, 'source'); await fs.mkdir(source, { mode: 0o700 });
  const planFile = path.join(source, 'plan.json'); await exclusiveFile(planFile, JSON.stringify({ schemaVersion: 'money-seasons-store/v1', revision: 1, plan: blankPlan() }));
  const sourceConfig = path.join(home, 'source.json'); await exclusiveFile(sourceConfig, JSON.stringify({ planFile }));
  await cloneDataset(a, { sourceConfig, id: 'trial' }); await selectDataset(a, 'trial', { proveStopped: async () => true });
  a = await loadInstance({ home }); const data = (await inspectDataset(a, 'trial')).data;
  let state = [], calls = [];
  const run = (args, options) => {
    calls.push(args);
    assert.equal(options.env.MS_DEV_PROJECT, a.project); assert.equal(options.env.MS_DEV_DATA, data);
    if (args[0] === 'ps') {
      if (args.includes(`label=com.docker.compose.project=${a.project}`)) return state.map(c => c.Id).join('\n');
      return state.filter(c => args.includes(`name=^/${a.project}-${c.Config.Labels['com.docker.compose.service']}-1$`)).map(c => c.Id).join('\n');
    }
    if (args[0] === 'inspect') return JSON.stringify(state);
    if (args[0] === 'compose') {
      assert.ok(args.includes(a.project)); assert.ok(args.includes('/dev/null'));
      if (args.includes('up')) state = ['web', 'caddy'].map(s => ({ ...container(s, a, data), State: { Running: true, Status: 'running', Health: { Status: 'healthy' } } }));
      if (args.includes('down')) state = [];
    }
    return '';
  };
  for (let i = 0; i < 5; i++) { await lifecycle(a, 'up', { run }); await lifecycle(a, 'down', { run }); }
  assert.equal(calls.filter(c => c[0] === 'compose' && c.includes('up')).length, 5);
  const passphrase = await fs.readFile(path.join(a.base, 'passphrase'));
  state = [container('web', a, data)]; state[0].Mounts[0].Source = '/foreign'; calls = [];
  await assert.rejects(lifecycle(a, 'up', { run }), /mounts/);
  assert.equal(calls.some(c => c[0] === 'compose'), false); assert.deepEqual(await fs.readFile(path.join(a.base, 'passphrase')), passphrase);
});

test('missing selected data and invalid CLI options fail before Docker or bootstrap', async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-command-')); t.after(() => fs.rm(home, { recursive: true, force: true }));
  const a = await loadInstance({ home, port: 43003, create: true }); let called = false;
  await assert.rejects(lifecycle(a, 'up', { run: () => { called = true; } })); assert.equal(called, false);
  for (const args of [['init', '--port', '3080'], ['up', '--project', 'money-seasons'], ['reset'], ['clone', '--dataset', 'x', '--force', 'yes']]) {
    const r = spawnSync(process.execPath, ['scripts/local-stack.mjs', ...args], { env: { ...process.env, HOME: home }, encoding: 'utf8' });
    assert.equal(r.status, 1); assert.doesNotMatch(r.stdout, /synthetic-family-test-only/);
  }
});
