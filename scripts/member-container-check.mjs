// New random-labelled synthetic resources only; never production:* or real data.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import https from 'node:https';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { isolationPreflight } from './stack-isolation-check.mjs';
import { docker } from './local-stack.mjs';
import { productionSettings, productionEnvironment, productionArgs } from './production-stack.mjs';
import { syntheticHousehold } from './member-fixture.mjs';
import { hashPassword } from '../membership.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const gate = await isolationPreflight();
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ms005-member-image-'));
const project = 'ms005-proof-' + randomBytes(12).toString('hex'), label = 'org.money-seasons.synthetic';
const env = { ...gate.dockerEnv, DOCKER_CONFIG: path.join(directory, 'docker-config') };
const run = args => {
 const result = spawnSync('docker', args, { env, cwd: root, encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
 // This runner has synthetic-only mounts; no password is passed in argv/env.
 if (result.error || result.status !== 0) throw new Error(`Synthetic Docker ${args[0]} failed: ${(result.stderr || result.error?.message || '').slice(-2000)}`);
 return result.stdout.trim();
};
const file = path.join(directory, 'compose.json');
const compose = args => run(['compose', '--env-file', '/dev/null', '-p', project, '-f', file, ...args]);
const ports = [];
async function port() {
 const s = net.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise(r => s.close(r));
 if ([3080, 3081, 3085, 3086, 3443, ...ports].includes(p)) return port(); ports.push(p); return p;
}
function owned() {
 const ids = run(['ps', '-aq', '--filter', `label=com.docker.compose.project=${project}`]).split(/\s+/).filter(Boolean);
 const containers = ids.length ? JSON.parse(run(['inspect', ...ids])) : [];
 for (const c of containers) assert.equal(c.Config.Labels[label], project);
 return containers;
}
let configured = false, qualified = false;
try {
 for (const dir of ['docker-config', 'data', 'members', 'roles', 'caddy']) await fs.mkdir(path.join(directory, dir), { mode: 0o700 });
 const password = randomBytes(3).toString('hex'), verifier = await hashPassword(password); // Six-character policy boundary.
 await fs.writeFile(path.join(directory, 'members/users.json'), JSON.stringify({ version: 1, revision: 1, users: ['lan', 'minh'].map(id => ({ id, username: id, name: id, enabled: true, credentialVersion: 1, password: verifier })) }), { mode: 0o600, flag: 'wx' });
 await fs.writeFile(path.join(directory, 'roles/roles.json'), JSON.stringify({ version: 1, adminIds: ['minh'] }), { mode: 0o600, flag: 'wx' });
 const finance = JSON.stringify({ schemaVersion: 'money-seasons-household/v1', revision: 1, household: syntheticHousehold() });
 await fs.writeFile(path.join(directory, 'data/plan.json'), finance, { mode: 0o600, flag: 'wx' });
 await fs.writeFile(path.join(directory, 'passphrase'), randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
 const backend = await port(), frontend = await port(), prefix = '/lichtaichinh';
 const config = productionSettings(Object.entries({ MONEY_SEASONS_PRODUCTION_REPO: root.replace(/\/$/, ''), MONEY_SEASONS_RELEASE: 'c'.repeat(40), MONEY_SEASONS_DATA_DIR: path.join(directory, 'data'), MONEY_SEASONS_PASSPHRASE_FILE: path.join(directory, 'passphrase'), MONEY_SEASONS_CADDY_DIR: path.join(directory, 'caddy'), MONEY_SEASONS_AUTH_MODE: 'members', MONEY_SEASONS_MEMBERS_DIR: path.join(directory, 'members'), MONEY_SEASONS_ROLES_FILE: path.join(directory, 'roles/roles.json'), MONEY_SEASONS_BASE_PATH: prefix, MONEY_SEASONS_ORIGINS: 'https://drgnfly.tail10c2c6.ts.net,https://localhost:3443', MONEY_SEASONS_DOCKER_HOST: gate.host, MONEY_SEASONS_DOCKER_ID: process.env.MS_ISOLATION_DAEMON_ID }).map(([k,v]) => `${k}=${v}`).join('\n'));
 const rendered = JSON.parse(docker(productionArgs(root, ['config', '--format', 'json'], config), { env: productionEnvironment(config), cwd: root }));
 assert.equal(rendered.services.web.environment.MONEY_SEASONS_AUTH_MODE, 'members');
 assert.equal(rendered.services.web.volumes.find(v => v.target === '/run/private/roles.json').read_only, true);
 assert.equal(rendered.services.web.volumes.find(v => v.target === '/members').source, path.join(directory, 'members'));
 rendered.name = project; rendered.networks.default.name = project + '_default'; rendered.networks.default.labels = { [label]: project };
 for (const [name, service] of Object.entries(rendered.services)) {
  assert.equal(service.read_only, true); assert.equal(service.init, true); assert.equal(service.pids_limit, 64); assert.deepEqual(service.cap_drop, ['ALL']);
  service.image = `${project}-${name}:test`; service.labels = { [label]: project }; service.build.labels = { [label]: project }; service.restart = 'no';
 }
 rendered.services.web.ports[0].published = String(backend);
 rendered.services.web.environment.MONEY_SEASONS_ORIGINS = `https://localhost:${frontend}`;
 const proxy = path.join(directory, 'Caddyfile');
 await fs.writeFile(proxy, (await fs.readFile(path.join(root, 'ops/Caddyfile.production-local'), 'utf8')).replaceAll(':3080', ':' + backend).replaceAll(':3443', ':' + frontend), { mode: 0o600, flag: 'wx' });
 rendered.services.caddy.volumes.find(v => v.target === '/etc/caddy/Caddyfile').source = proxy;
 rendered.services.caddy.healthcheck.test = rendered.services.caddy.healthcheck.test.map(v => v.replace('localhost:3443', 'localhost:' + frontend));
 await fs.writeFile(file, JSON.stringify(rendered), { mode: 0o600, flag: 'wx' }); configured = true;
 owned(); compose(['build', '--pull=false']); compose(['up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '90']);
 assert.equal(owned().length, 2); assert.ok(owned().every(c => c.State.Health.Status === 'healthy'));
 const ca = await fs.readFile(path.join(directory, 'caddy/caddy/pki/authorities/local/root.crt'));
 const request = (route, { data, headers = {} } = {}) => new Promise((resolve, reject) => {
  const req = https.request({ hostname: 'localhost', family: 4, port: frontend, path: route, ca, method: data ? 'POST' : 'GET', headers: { Origin: `https://localhost:${frontend}`, ...headers, ...(data ? { 'Content-Type': 'application/json' } : {}) } }, res => {
   let body = ''; res.on('data', c => body += c); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
  }); req.setTimeout(10000, () => req.destroy(new Error('synthetic HTTPS timeout'))); req.on('error', reject); req.end(data ? JSON.stringify(data) : undefined);
 });
 assert.equal((await request(prefix + '/api/home')).status, 401);
 const login = await request(prefix + '/api/login', { data: { username: 'minh', password } }); assert.equal(login.status, 200);
 const cookie = login.headers['set-cookie'][0]; for (const flag of ['Secure', 'HttpOnly', 'SameSite=Strict', 'Path=/lichtaichinh/']) assert.ok(cookie.includes(flag));
 const headers = { Cookie: cookie.split(';')[0] };
 const home = await request(prefix + '/api/home', { headers }); assert.equal(home.status, 200); assert.equal(JSON.parse(home.body).plan.items.length, 3); assert.ok(!home.body.includes('Chi Lan'));
 assert.equal((await request(prefix + '/api/users', { headers })).status, 200);
 assert.equal((await request(prefix + '/member-ui.js')).status, 200);
 assert.equal((await request('/api/home', { headers })).status, 404);
 assert.equal(await fs.readFile(path.join(directory, 'data/plan.json'), 'utf8'), finance);
 qualified = true; console.log('PASS synthetic production member image: exact overlay/mounts/security, prefixed CA-verified HTTPS, member login/cookies, private exclusion, admin and unchanged finance');
} finally {
 if (configured) { owned(); compose(['down', '--timeout', '30']); assert.equal(owned().length, 0); }
 // Only exact fixture image tags; never prune, inspect or modify unrelated services.
 for (const service of ['web', 'caddy']) {
  const tag = `${project}-${service}:test`, ids = run(['image', 'ls', '-q', '--filter', `reference=${tag}`]);
  if (ids) { const image = JSON.parse(run(['image', 'inspect', tag]))[0]; assert.equal(image.Config.Labels[label], project); run(['image', 'rm', tag]); }
 }
 await fs.rm(directory, { recursive: true, force: true });
 if (!qualified) process.exitCode = 1;
}
