// Canonical-main production deployment. No implicit provisioning, source update, pull or data migration.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import https from 'node:https';
import { parseEnv } from 'node:util';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkout, worktreeIdentity, privateDir, readPrivate, inside, fail, withInstanceLock, GuardError } from './stack-identity.mjs';
import { docker } from './local-stack.mjs';
import { validateBasePath } from '../public/base-path.js';

export const productionProject = 'money-seasons-production';
const sourceLabel = 'org.money-seasons.source', purposeLabel = 'org.money-seasons.purpose', revisionLabel = 'org.opencontainers.image.revision';
const keys = ['MONEY_SEASONS_PRODUCTION_REPO', 'MONEY_SEASONS_RELEASE', 'MONEY_SEASONS_DATA_DIR', 'MONEY_SEASONS_PASSPHRASE_FILE', 'MONEY_SEASONS_CADDY_DIR', 'MONEY_SEASONS_ORIGINS', 'MONEY_SEASONS_BASE_PATH', 'MONEY_SEASONS_COOKIE_NAME', 'MONEY_SEASONS_DOCKER_HOST', 'MONEY_SEASONS_DOCKER_ID'];
export function productionSettings(raw) {
  const seen = new Set();
  for (const line of raw.split(/\r?\n/).filter(s => s.trim() && !s.trim().startsWith('#'))) {
    const key = line.match(/^([A-Z_]+)=/)?.[1];
    if (!keys.includes(key) || seen.has(key)) fail('Unknown/duplicate production setting'); seen.add(key);
  }
  const config = parseEnv(raw);
  for (const key of keys.filter(k => !['MONEY_SEASONS_COOKIE_NAME', 'MONEY_SEASONS_BASE_PATH'].includes(k))) if (!config[key]) fail('Missing explicit private production setting');
  for (const key of ['MONEY_SEASONS_PRODUCTION_REPO', 'MONEY_SEASONS_DATA_DIR', 'MONEY_SEASONS_PASSPHRASE_FILE', 'MONEY_SEASONS_CADDY_DIR']) if (!path.isAbsolute(config[key]) || path.resolve(config[key]) !== config[key]) fail('Canonical absolute production paths required');
  if (!/^[a-f0-9]{40}$/.test(config.MONEY_SEASONS_RELEASE) || !config.MONEY_SEASONS_DOCKER_HOST.startsWith('unix:///')) fail('Invalid release/explicit Unix daemon');
  const prefix = validateBasePath(config.MONEY_SEASONS_BASE_PATH);
  if (!['', '/lichtaichinh'].includes(prefix)) fail('Unknown production prefix profile');
  const origins = config.MONEY_SEASONS_ORIGINS.split(',');
  const expected = prefix ? ['https://drgnfly.tail10c2c6.ts.net', 'https://localhost:3443'] : ['https://localhost:3443'];
  if (origins.length !== expected.length || new Set(origins).size !== origins.length || origins.some(o => !expected.includes(o))) fail('Invalid production origin profile');
  config.MONEY_SEASONS_ORIGINS = expected.join(',');
  if (config.MONEY_SEASONS_COOKIE_NAME && config.MONEY_SEASONS_COOKIE_NAME !== 'ms_session' && !/^ms_dev_[a-f0-9]{64}$/.test(config.MONEY_SEASONS_COOKIE_NAME)) fail('Invalid cookie namespace');
  const data = config.MONEY_SEASONS_DATA_DIR, ca = config.MONEY_SEASONS_CADDY_DIR, secret = config.MONEY_SEASONS_PASSPHRASE_FILE;
  if (inside(data, ca) || inside(ca, data) || inside(secret, data) || inside(secret, ca)) fail('Production data/CA/credential paths must be separate');
  return config;
}
export function productionEnvironment(config) {
  // Private pins only: never inherit ambient MONEY_SEASONS_*, COMPOSE_* or Docker context.
  return { PATH: process.env.PATH, HOME: os.homedir(), COMPOSE_DISABLE_ENV_FILE: '1', DOCKER_HOST: config.MONEY_SEASONS_DOCKER_HOST,
    ...config, MONEY_SEASONS_BASE_PATH: config.MONEY_SEASONS_BASE_PATH || '',
    MONEY_SEASONS_PROXY_PROFILE: config.MONEY_SEASONS_BASE_PATH ? 'tailnet-local' : 'root-local' };
}
export function productionArgs(root, args) {
  return ['compose', '--env-file', '/dev/null', '--project-directory', root, '-p', productionProject, '-f', path.join(root, 'compose.yaml'), '-f', path.join(root, 'compose.production-local.yaml'), ...args];
}
export async function productionContext(command) {
  if (process.getuid() !== 1000) fail('Host/container UID1000 required');
  const file = process.env.MONEY_SEASONS_PRODUCTION_CONFIG || path.join(os.homedir(), '.config/money-seasons/production.env');
  const config = productionSettings((await readPrivate(file, 8192)).toString('utf8'));
  const identity = await worktreeIdentity();
  const git = (...args) => execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (identity.worktree !== config.MONEY_SEASONS_PRODUCTION_REPO || identity.registration !== identity.repository || git('branch', '--show-current') !== 'main') fail('Production requires main in the configured canonical checkout, not a development worktree');
  if (['up', 'build', 'config', 'verify'].includes(command) && (git('rev-parse', 'HEAD') !== config.MONEY_SEASONS_RELEASE || git('status', '--porcelain'))) fail('Production requires the exact pinned clean main commit; no automatic Git update');
  await privateDir(config.MONEY_SEASONS_DATA_DIR); await privateDir(config.MONEY_SEASONS_CADDY_DIR);
  await readPrivate(config.MONEY_SEASONS_PASSPHRASE_FILE, 4096);
  const env = productionEnvironment(config);
  const run = args => docker(args, { env, cwd: identity.worktree, timeout: 180_000 });
  if (run(['info', '--format', '{{.ID}}']) !== config.MONEY_SEASONS_DOCKER_ID) fail('Production Docker daemon identity mismatch');
  return { config, root: identity.worktree, run, base: path.dirname(config.MONEY_SEASONS_PASSPHRASE_FILE) };
}
function owns(labels, root) { return labels?.[purposeLabel] === 'production' && labels?.[sourceLabel] === root; }
export function verifyProductionContainer(c, { config, root }) {
  const labels = c.Config?.Labels, service = labels?.['com.docker.compose.service'], revision = labels?.[revisionLabel];
  if (!owns(labels, root) || labels['com.docker.compose.project'] !== productionProject || !['web', 'caddy'].includes(service) || !/^[a-f0-9]{40}$/.test(revision)) fail('Unknown production container ownership');
  if (c.Config.Image !== `${productionProject}-${service}:${revision}` || !c.HostConfig.ReadonlyRootfs || c.HostConfig.Privileged || c.HostConfig.PidsLimit !== 64 || c.HostConfig.Init !== true) fail('Unexpected production image/security/init/PID configuration');
  const expected = service === 'web' ? [['/data', config.MONEY_SEASONS_DATA_DIR, true], ['/run/private/passphrase', config.MONEY_SEASONS_PASSPHRASE_FILE, false]] : [['/etc/caddy/Caddyfile', path.join(root, 'ops/Caddyfile.production-local'), false], ['/data', config.MONEY_SEASONS_CADDY_DIR, true]];
  const binds = c.Mounts.filter(m => m.Type === 'bind');
  if (binds.length !== expected.length || expected.some(([target, source, rw]) => !binds.some(m => m.Destination === target && m.Source === source && m.RW === rw)) || c.Mounts.some(m => !['bind', 'tmpfs'].includes(m.Type))) fail('Foreign production storage/mount refused');
  if (service === 'web') {
    const ports = c.HostConfig.PortBindings;
    if (Object.keys(ports).length !== 1 || ports['3080/tcp']?.length !== 1 || ports['3080/tcp'][0].HostIp !== '127.0.0.1' || ports['3080/tcp'][0].HostPort !== '3080' || Object.keys(c.NetworkSettings.Networks).join() !== `${productionProject}_default`) fail('Unexpected backend publication/network');
  } else if (c.HostConfig.NetworkMode !== 'host') fail('Unexpected Caddy network');
  return service;
}
export function productionProfileMatches(c, config) {
  const service = c.Config?.Labels?.['com.docker.compose.service'];
  if (!['web', 'caddy'].includes(service) || c.Config.Labels[revisionLabel] !== config.MONEY_SEASONS_RELEASE) return false;
  const expected = { MONEY_SEASONS_BASE_PATH: config.MONEY_SEASONS_BASE_PATH || '' };
  if (service === 'web') Object.assign(expected, { MONEY_SEASONS_ORIGINS: config.MONEY_SEASONS_ORIGINS, MONEY_SEASONS_COOKIE_NAME: config.MONEY_SEASONS_COOKIE_NAME || 'ms_session' });
  else expected.MONEY_SEASONS_PROXY_PROFILE = config.MONEY_SEASONS_BASE_PATH ? 'tailnet-local' : 'root-local';
  // Compare only the allowlisted public config, without dumping raw environments.
  return Object.entries(expected).every(([key, value]) => {
    const entries = (c.Config.Env || []).filter(e => e.startsWith(key + '='));
    return entries.length === 1 && entries[0] === key + '=' + value;
  });
}
export function productionProbeRoutes(config) {
  const prefix = config.MONEY_SEASONS_BASE_PATH || '';
  const routes = [['/healthz', 200], [prefix + '/', 200], ...['session', 'plan', 'export'].map(p => [prefix + '/api/' + p, 401])];
  if (prefix) routes.push(['/', 308, prefix + '/'], [prefix, 308, prefix + '/'], [prefix + '?x=%2Fsafe&n=1', 308, prefix + '/?x=%2Fsafe&n=1'], ['/app.js', 404], ['/api/plan', 404], [prefix + 'x/', 404], [prefix + prefix + '/', 404]);
  return routes;
}
export function productionInventory(context) {
  const { config, root, run } = context;
  const ids = run(['ps', '-aq', '--filter', `label=com.docker.compose.project=${productionProject}`]).split(/\s+/).filter(Boolean);
  const containers = ids.length ? JSON.parse(run(['inspect', ...ids])) : [], seen = new Set();
  for (const c of containers) { const service = verifyProductionContainer(c, context); if (seen.has(service)) fail('Duplicate production service'); seen.add(service); }
  const nets = run(['network', 'ls', '-q', '--filter', `label=com.docker.compose.project=${productionProject}`]).split(/\s+/).filter(Boolean);
  if (nets.length) for (const n of JSON.parse(run(['network', 'inspect', ...nets]))) if (!owns(n.Labels, root) || n.Name !== `${productionProject}_default` || Object.keys(n.Containers || {}).some(id => !ids.some(prefix => id.startsWith(prefix)))) fail('Foreign production network/attachment');
  const named = run(['network', 'ls', '--format', '{{.Name}}', '--filter', `name=^${productionProject}_default$`]);
  if (named && !nets.length) fail('Unowned production network collision');
  for (const service of ['web', 'caddy']) {
    const collisions = run(['ps', '-aq', '--filter', `name=^/${productionProject}-${service}-1$`]).split(/\s+/).filter(Boolean);
    if (collisions.some(id => !ids.includes(id))) fail('Unowned production container name collision');
    const tag = `${productionProject}-${service}:${config.MONEY_SEASONS_RELEASE}`;
    if (run(['image', 'ls', '-q', '--filter', `reference=${tag}`])) for (const image of JSON.parse(run(['image', 'inspect', tag]))) if (!owns(image.Config.Labels, root) || image.Config.Labels[revisionLabel] !== config.MONEY_SEASONS_RELEASE) fail('Unowned production image tag');
  }
  return containers;
}
async function freePort(port, host) {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', () => reject(new GuardError('Production port occupied; owner unchanged'))); server.listen({ port, host, ipv6Only: host === '::1' }, resolve); });
  await new Promise(r => server.close(r));
}
async function settled(data) {
  try { await fs.lstat(path.join(data, 'writer.lock')); fail('Unknown production writer lock; no automatic recovery'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
}
export async function verifyProduction(context) {
  const containers = productionInventory(context);
  if (containers.length !== 2 || containers.some(c => !c.State.Running || c.State.Health?.Status !== 'healthy')) fail('Production services are not healthy');
  if (containers.some(c => !productionProfileMatches(c, context.config))) fail('Production release/profile mismatch; owned services require authorized recreation');
  const ca = await fs.readFile(path.join(context.config.MONEY_SEASONS_CADDY_DIR, 'caddy/pki/authorities/local/root.crt'));
  for (const [route, status, location] of productionProbeRoutes(context.config)) {
    const actual = await new Promise((resolve, reject) => {
      const req = https.get({ hostname: 'localhost', family: 4, port: 3443, path: route, ca, rejectUnauthorized: true }, res => { res.resume(); res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location })); });
      req.setTimeout(10_000, () => req.destroy(new Error('HTTPS timeout'))); req.on('error', reject);
    });
    if (actual.status !== status || actual.location !== location) fail('Production HTTPS/routing/unauthorized boundary check failed');
  }
  return containers;
}
export async function main(command) {
  if (!['config', 'build', 'up', 'down', 'status', 'verify'].includes(command)) fail('Usage: production-stack.mjs config|build|up|down|status|verify');
  const context = await productionContext(command), { config, root, run } = context;
  return withInstanceLock(context, async () => {
    const before = productionInventory(context), compose = args => run(productionArgs(root, args));
    if (command === 'config') { compose(['config', '--quiet']); console.log('Production configuration valid; no service changes.'); return; }
    if (command === 'build') { compose(['build', '--pull=false']); productionInventory(context); console.log('Pinned production images built; services unchanged.'); return; }
    if (command === 'down') { compose(['down', '--timeout', '30']); if (productionInventory(context).length) fail('Production stop uncertain'); await settled(config.MONEY_SEASONS_DATA_DIR); console.log('Only production stopped; all data/credentials/CA/images retained.'); return; }
    if (command === 'up') {
      if (!before.some(c => c.Config.Labels['com.docker.compose.service'] === 'web' && c.State.Running)) { await freePort(3080, '127.0.0.1'); await settled(config.MONEY_SEASONS_DATA_DIR); }
      if (!before.some(c => c.Config.Labels['com.docker.compose.service'] === 'caddy' && c.State.Running)) { await freePort(3443, '127.0.0.1'); await freePort(3443, '::1'); }
      for (const service of ['web', 'caddy']) run(['image', 'inspect', `${productionProject}-${service}:${config.MONEY_SEASONS_RELEASE}`]);
      compose(['up', '-d', '--no-build', '--pull', 'never', '--force-recreate', '--wait', '--wait-timeout', '90']);
    }
    const containers = command === 'status' ? before : await verifyProduction(context);
    console.log(JSON.stringify({ role: 'production', source: root, branch: 'main', release: config.MONEY_SEASONS_RELEASE, url: 'https://localhost:3443' + (config.MONEY_SEASONS_BASE_PATH || '') + '/', profile: config.MONEY_SEASONS_BASE_PATH ? 'tailnet-local' : 'root-local', backend: 'http://127.0.0.1:3080', services: containers.map(c => ({ service: c.Config.Labels['com.docker.compose.service'], id: c.Id, revision: c.Config.Labels[revisionLabel], configuredProfileMatches: productionProfileMatches(c, config), state: c.State.Status, health: c.State.Health?.Status })) }, null, 2));
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(process.argv[2]); }
  catch (e) { console.error(e instanceof GuardError ? e.message : 'Production operation refused/failed; inspect private configuration and owned resources. No payload/secret logged.'); process.exitCode = 1; }
}
