import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { productionSettings, productionArgs, productionProject, verifyProductionContainer, productionInventory, productionEnvironment, productionProfileMatches, productionProbeRoutes } from '../scripts/production-stack.mjs';
const root = '/synthetic/canonical';
function settings(base = '/private/production') {
  return { MONEY_SEASONS_PRODUCTION_REPO: root, MONEY_SEASONS_RELEASE: 'a'.repeat(40), MONEY_SEASONS_DATA_DIR: `${base}/data`, MONEY_SEASONS_CADDY_DIR: `${base}/caddy`, MONEY_SEASONS_PASSPHRASE_FILE: `${base}/passphrase`, MONEY_SEASONS_ORIGINS: 'https://localhost:3443', MONEY_SEASONS_DOCKER_HOST: 'unix:///run/fixture/docker.sock', MONEY_SEASONS_DOCKER_ID: 'synthetic-daemon' };
}
const text = c => Object.entries(c).map(([k, v]) => `${k}=${v}`).join('\n');
test('production settings fail closed on missing/duplicate/unknown/unsafe inputs', () => {
  const good = settings(); assert.deepEqual({ ...productionSettings(text(good)) }, good);
  for (const raw of ['', text(good) + '\nMONEY_SEASONS_RELEASE=' + 'b'.repeat(40), text(good) + '\nMONEY_SEASONS_PASSPHRASE=secret']) assert.throws(() => productionSettings(raw));
  for (const change of [{ MONEY_SEASONS_ORIGINS: 'http://localhost:3443' }, { MONEY_SEASONS_RELEASE: 'develop' }, { MONEY_SEASONS_DATA_DIR: '/private/../data' }, { MONEY_SEASONS_PASSPHRASE_FILE: good.MONEY_SEASONS_DATA_DIR + '/secret' }, { MONEY_SEASONS_CADDY_DIR: good.MONEY_SEASONS_DATA_DIR }, { MONEY_SEASONS_COOKIE_NAME: 'invalid; cookie' }]) assert.throws(() => productionSettings(text({ ...good, ...change })));
});
test('production prefix profiles are finite and private pins defeat ambient overrides', () => {
  const origins = 'https://drgnfly.tail10c2c6.ts.net,https://localhost:3443';
  const prefixed = { ...settings(), MONEY_SEASONS_BASE_PATH: '/lichtaichinh', MONEY_SEASONS_ORIGINS: origins };
  assert.deepEqual({ ...productionSettings(text(prefixed)) }, prefixed);
  assert.equal(productionSettings(text({ ...prefixed, MONEY_SEASONS_ORIGINS: origins.split(',').reverse().join(',') })).MONEY_SEASONS_ORIGINS, origins);
  for (const change of [{ MONEY_SEASONS_BASE_PATH: '/other' }, { MONEY_SEASONS_BASE_PATH: '/' }, { MONEY_SEASONS_BASE_PATH: '' }, { MONEY_SEASONS_ORIGINS: 'https://localhost:3443' }, { MONEY_SEASONS_ORIGINS: origins + ',https://evil.test' }, { MONEY_SEASONS_ORIGINS: origins + ',https://localhost:3443' }, { MONEY_SEASONS_ORIGINS: origins.replace('https://drgnfly', 'http://drgnfly') }, { MONEY_SEASONS_ORIGINS: origins.replace('.ts.net', '.ts.net/') }, { MONEY_SEASONS_ORIGINS: origins.replace('localhost:3443', 'localhost:3444') }, { MONEY_SEASONS_PROXY_PROFILE: 'root-local' }]) assert.throws(() => productionSettings(text({ ...prefixed, ...change })));
  const before = process.env.MONEY_SEASONS_BASE_PATH;
  try {
    process.env.MONEY_SEASONS_BASE_PATH = '/ambient-attack';
    assert.equal(productionEnvironment(settings()).MONEY_SEASONS_BASE_PATH, '');
    assert.equal(productionEnvironment(prefixed).MONEY_SEASONS_BASE_PATH, '/lichtaichinh');
    assert.equal(productionEnvironment(prefixed).MONEY_SEASONS_PROXY_PROFILE, 'tailnet-local');
  } finally { if (before === undefined) delete process.env.MONEY_SEASONS_BASE_PATH; else process.env.MONEY_SEASONS_BASE_PATH = before; }
});
test('production member mode is explicit, separated and adds only its guarded overlay', () => {
  const members = { ...settings(), MONEY_SEASONS_AUTH_MODE: 'members', MONEY_SEASONS_MEMBERS_DIR: '/private/production/members', MONEY_SEASONS_ROLES_FILE: '/private/production/roles/roles.json' };
  assert.deepEqual({ ...productionSettings(text(members)) }, members);
  for (const change of [{ MONEY_SEASONS_AUTH_MODE: 'insecure' }, { MONEY_SEASONS_MEMBERS_DIR: '' }, { MONEY_SEASONS_ROLES_FILE: '' }, { MONEY_SEASONS_MEMBERS_DIR: members.MONEY_SEASONS_DATA_DIR }, { MONEY_SEASONS_ROLES_FILE: members.MONEY_SEASONS_MEMBERS_DIR + '/roles.json' }, { MONEY_SEASONS_ROLES_FILE: members.MONEY_SEASONS_PASSPHRASE_FILE }, { MONEY_SEASONS_MEMBERS_DIR: '/relative/../members' }, { MONEY_SEASONS_AUTH_MODE: 'legacy' }]) assert.throws(() => productionSettings(text({ ...members, ...change })));
  assert.ok(productionArgs(root, ['config'], members).includes(root + '/compose.production-members.yaml'));
  assert.ok(!productionArgs(root, ['config'], settings()).includes(root + '/compose.production-members.yaml'));
  assert.ok(productionProbeRoutes(members).some(([route, status]) => route === '/api/home' && status === 401));
  const c = container();
  c.Mounts.push({ Type: 'bind', Destination: '/members', Source: members.MONEY_SEASONS_MEMBERS_DIR, RW: true }, { Type: 'bind', Destination: '/run/private/roles.json', Source: members.MONEY_SEASONS_ROLES_FILE, RW: false });
  c.Config.Env = ['MONEY_SEASONS_AUTH_MODE=members', 'MONEY_SEASONS_MEMBERS_DIR=/members', 'MONEY_SEASONS_ROLES_FILE=/run/private/roles.json', 'MONEY_SEASONS_BASE_PATH=', 'MONEY_SEASONS_ORIGINS=https://localhost:3443', 'MONEY_SEASONS_COOKIE_NAME=ms_session'];
  assert.equal(verifyProductionContainer(c, { root, config: members }), 'web');
  assert.equal(productionProfileMatches(c, members), true);
  assert.equal(productionProfileMatches(c, settings()), false);
  assert.throws(() => verifyProductionContainer(c, { root, config: settings() }));
  c.Mounts.at(-1).RW = true;
  assert.throws(() => verifyProductionContainer(c, { root, config: members }));
});
test('production argv uses canonical base plus tracked local-HTTPS overlay, no dotenv/project fallback', () => {
  const args = productionArgs(root, ['up']);
  assert.ok(args.includes('/dev/null')); assert.ok(args.includes(productionProject));
  assert.ok(args.includes(root + '/compose.yaml')); assert.ok(args.includes(root + '/compose.production-local.yaml'));
  assert.ok(!args.includes('compose.local.yaml')); assert.ok(!args.includes('money-seasons-local-preview'));
});
function container(service = 'web') {
  const config = settings();
  return { Config: { Image: `${productionProject}-${service}:${config.MONEY_SEASONS_RELEASE}`, Labels: { 'org.money-seasons.purpose': 'production', 'org.money-seasons.source': root, 'org.opencontainers.image.revision': config.MONEY_SEASONS_RELEASE, 'com.docker.compose.project': productionProject, 'com.docker.compose.service': service } },
    HostConfig: { Init: true, ReadonlyRootfs: true, Privileged: false, PidsLimit: 64, NetworkMode: service === 'caddy' ? 'host' : 'default', PortBindings: service === 'web' ? { '3080/tcp': [{ HostIp: '127.0.0.1', HostPort: '3080' }] } : {} },
    NetworkSettings: { Networks: { [`${productionProject}_default`]: {} } },
    Mounts: (service === 'web' ? [['/data', config.MONEY_SEASONS_DATA_DIR, true], ['/run/private/passphrase', config.MONEY_SEASONS_PASSPHRASE_FILE, false]] : [['/etc/caddy/Caddyfile', root + '/ops/Caddyfile.production-local', false], ['/data', config.MONEY_SEASONS_CADDY_DIR, true]]).map(([Destination, Source, RW]) => ({ Type: 'bind', Destination, Source, RW })) };
}
test('profile verification detects stale release/origin/prefix/namespace/proxy config without blocking ownership inventory', () => {
  const config = settings();
  for (const service of ['web', 'caddy']) {
    const c = container(service);
    assert.equal(productionProfileMatches(c, config), false); // Historical missing config is not current proof.
    c.Config.Env = service === 'web' ? ['MONEY_SEASONS_BASE_PATH=', 'MONEY_SEASONS_ORIGINS=https://localhost:3443', 'MONEY_SEASONS_COOKIE_NAME=ms_session'] : ['MONEY_SEASONS_BASE_PATH=', 'MONEY_SEASONS_PROXY_PROFILE=root-local'];
    assert.equal(productionProfileMatches(c, config), true);
    const changed = { ...config, MONEY_SEASONS_BASE_PATH: '/lichtaichinh', MONEY_SEASONS_ORIGINS: 'https://drgnfly.tail10c2c6.ts.net,https://localhost:3443' };
    assert.equal(verifyProductionContainer(c, { root, config: changed }), service); // Can still stop/recreate owned old profile.
    assert.equal(productionProfileMatches(c, changed), false);
    assert.equal(productionProfileMatches(c, { ...config, MONEY_SEASONS_RELEASE: 'b'.repeat(40) }), false);
    c.Config.Env.push('MONEY_SEASONS_BASE_PATH='); assert.equal(productionProfileMatches(c, config), false);
  }
  assert.deepEqual(productionProbeRoutes(config).map(r => r[0]), ['/healthz', '/', '/api/session', '/api/plan', '/api/export']);
  assert.ok(productionProbeRoutes({ MONEY_SEASONS_BASE_PATH: '/lichtaichinh' }).some(r => r[0] === '/api/plan' && r[1] === 404));
});
test('production ownership/mount/port/init guards reject foreign resources before mutation', () => {
  for (const service of ['web', 'caddy']) assert.equal(verifyProductionContainer(container(service), { root, config: settings() }), service);
  for (const mutate of [c => { c.Config.Labels['org.money-seasons.source'] = '/foreign'; }, c => { c.Mounts[0].Source = '/preview/data'; }, c => { c.HostConfig.Init = false; }, c => { c.HostConfig.Privileged = true; }, c => { c.HostConfig.PortBindings['3080/tcp'][0].HostIp = '0.0.0.0'; }]) {
    const c = container(); mutate(c); assert.throws(() => verifyProductionContainer(c, { root, config: settings() }));
  }
  assert.throws(() => productionInventory({ root, config: settings(), run: () => { throw new Error('daemon unknown'); } }));
});
test('production config command refuses a feature worktree before Docker, without reading any live data', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-production-guard-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'production.env'); await fs.writeFile(file, text(settings(dir)), { mode: 0o600 });
  const r = spawnSync(process.execPath, ['scripts/production-stack.mjs', 'config'], { encoding: 'utf8', env: { ...process.env, MONEY_SEASONS_PRODUCTION_CONFIG: file } });
  assert.equal(r.status, 1); assert.match(r.stderr, /canonical checkout/);
});
test('production HTTPS keeps both loopback binds, PID/security caps, and an init reaper', async () => {
  const source = await fs.readFile('compose.production-local.yaml', 'utf8'), caddy = await fs.readFile('ops/Caddyfile.production-local', 'utf8');
  for (const required of ['init: true', 'pids_limit: 64', 'GOMAXPROCS: "2"', 'user: "1000:1000"', 'cap_drop: [ALL]', 'no-new-privileges:true', 'mem_limit: 128m', 'pull_policy: never']) assert.ok(source.includes(required));
  assert.match(caddy, /bind 127\.0\.0\.1 ::1/); assert.match(caddy, /reverse_proxy 127\.0\.0\.1:3080/);
  assert.doesNotMatch(caddy, /0\.0\.0\.0|funnel|acme|install_trust on/i);
});
