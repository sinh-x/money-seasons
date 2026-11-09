// Scoped worktree CLI. Provisioning is explicit; normal lifecycle never reads a source config.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { checkout, loadInstance, privateDir, readPrivate, exclusiveFile, syncDir, withInstanceLock, availablePort, fail } from './stack-identity.mjs';
import { cloneDataset, selectDataset, inspectDataset, writerSettled } from './stack-data.mjs';

const LABEL = 'org.money-seasons.instance';
export function dockerEnvironment(instance, data = '') {
  // Do not inherit COMPOSE_*, production MONEY_SEASONS_*, dotenv, or caller MS_DEV_* overrides.
  const env = Object.fromEntries(['PATH', 'HOME', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG', 'XDG_RUNTIME_DIR', 'SSH_AUTH_SOCK'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
  return { ...env, HOME: os.homedir(), COMPOSE_DISABLE_ENV_FILE: '1', MS_DEV_ID: instance.id,
    MS_DEV_PROJECT: instance.project, MS_DEV_PORT: String(instance.port), MS_DEV_STATE: instance.base,
    MS_DEV_DATA: data, MS_DEV_COOKIE: instance.cookieName };
}
export function docker(args, { env = process.env, cwd = checkout, timeout = 120_000 } = {}) {
  const result = spawnSync('docker', args, { cwd, env, encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024 });
  // Never echo Docker errors: mount paths, environment or data may be included.
  if (result.error || result.status !== 0) fail(`Scoped Docker operation refused/failed (${result.status ?? 'timeout/tool unavailable'}); resources retained; no automatic recovery`);
  return result.stdout.trim();
}
export function composeArgs(instance, args) {
  return ['compose', '--env-file', '/dev/null', '--project-directory', instance.worktree, '-p', instance.project, '-f', path.join(instance.worktree, 'compose.local.yaml'), ...args];
}
export function expectedMounts(instance, data, service) {
  return service === 'web' ? [
    ['/data', data, true], ['/run/private/passphrase', path.join(instance.base, 'passphrase'), false]
  ] : [
    ['/etc/caddy/Caddyfile', path.join(instance.worktree, 'ops/Caddyfile.local'), false], ['/data', path.join(instance.base, 'caddy'), true]
  ];
}
export function verifyContainer(instance, data, container) {
  const labels = container.Config?.Labels || {}, service = labels['com.docker.compose.service'];
  if (labels[LABEL] !== instance.id || labels['com.docker.compose.project'] !== instance.project || !['web', 'caddy'].includes(service) || labels['com.docker.compose.oneoff'] === 'True') fail('Foreign/unexpected container refused');
  if (container.Config.Image !== `${instance.project}-${service}:dev`) fail('Unexpected instance image');
  const binds = (container.Mounts || []).filter(m => m.Type === 'bind');
  const expected = expectedMounts(instance, data, service);
  if (binds.length !== expected.length || expected.some(([dest, source, rw]) => !binds.some(m => m.Destination === dest && m.Source === source && m.RW === rw))) fail('Foreign/unexpected runtime mounts refused');
  if ((container.Mounts || []).some(m => !['bind', 'tmpfs'].includes(m.Type))) fail('Unexpected persistent volume refused');
  const ports = container.HostConfig?.PortBindings || {};
  if (service === 'web' && Object.keys(ports).length) fail('Backend host publication refused');
  if (service === 'caddy' && (Object.keys(ports).length !== 1 || ports[`${instance.port}/tcp`]?.length !== 1 || ports[`${instance.port}/tcp`][0].HostIp !== '127.0.0.1' || ports[`${instance.port}/tcp`][0].HostPort !== String(instance.port))) fail('Unexpected development publication refused');
  const allowed = new Set([`${instance.project}_backend`, ...(service === 'caddy' ? [`${instance.project}_edge`] : [])]);
  const networks = Object.keys(container.NetworkSettings?.Networks || {});
  if (networks.some(n => !allowed.has(n)) || networks.length !== allowed.size) fail('Unexpected runtime network refused');
  return service;
}
export async function inventory(instance, data, run = args => docker(args, { env: dockerEnvironment(instance, data), cwd: instance.worktree })) {
  const ids = run(['ps', '-aq', '--filter', `label=com.docker.compose.project=${instance.project}`]).split(/\s+/).filter(Boolean);
  const containers = ids.length ? JSON.parse(run(['inspect', ...ids])) : [];
  const seen = new Set();
  for (const container of containers) { const service = verifyContainer(instance, data, container); if (seen.has(service)) fail('Duplicate service refused'); seen.add(service); }
  const networkIds = run(['network', 'ls', '-q', '--filter', `label=com.docker.compose.project=${instance.project}`]).split(/\s+/).filter(Boolean);
  if (networkIds.length) for (const n of JSON.parse(run(['network', 'inspect', ...networkIds]))) {
    if (n.Labels?.[LABEL] !== instance.id || !['backend', 'edge'].some(role => n.Name === `${instance.project}_${role}` && n.Internal === (role === 'backend'))) fail('Foreign/unexpected network refused');
  }
  // Also inspect exact names: an unlabelled collision must not be auto-adopted by Compose.
  for (const role of ['backend', 'edge']) {
    const names = run(['network', 'ls', '--format', '{{.Name}}', '--filter', `name=^${instance.project}_${role}$`]);
    if (names && !networkIds.length) fail('Unowned network name collision');
    if (names) for (const n of JSON.parse(run(['network', 'inspect', `${instance.project}_${role}`]))) if (n.Labels?.[LABEL] !== instance.id || n.Labels?.['com.docker.compose.project'] !== instance.project) fail('Unowned network collision');
  }
  for (const service of ['web', 'caddy']) {
    const tag = `${instance.project}-${service}:dev`;
    const imageIds = run(['image', 'ls', '-q', '--filter', `reference=${tag}`]);
    if (imageIds) for (const image of JSON.parse(run(['image', 'inspect', tag]))) if (image.Config?.Labels?.[LABEL] !== instance.id) fail('Unowned image tag collision');
  }
  // Exact Compose container names catch unlabelled name collisions before build/down/up.
  for (const service of ['web', 'caddy']) {
    const collisions = run(['ps', '-aq', '--filter', `name=^/${instance.project}-${service}-1$`]).split(/\s+/).filter(Boolean);
    if (collisions.some(id => !ids.includes(id))) fail('Unowned container name collision');
  }
  return containers;
}
export async function prepareRuntime(instance) {
  await privateDir(path.join(instance.base, 'caddy'), true);
  const secret = path.join(instance.base, 'passphrase');
  try { await exclusiveFile(secret, randomBytes(32).toString('base64url') + '\n'); }
  catch (e) { if (e.code !== 'EEXIST') throw e; }
  const raw = await readPrivate(secret, 4096);
  if (raw.toString('utf8').trim().length < 12) fail('Development credential invalid');
  await syncDir(instance.base);
}
export async function selectedData(instance) {
  if (!instance.selected) fail('No dataset selected; explicitly clone a NEW dataset and select it while stopped');
  return (await inspectDataset(instance, instance.selected)).data;
}
export async function lifecycle(instance, command, { run = docker } = {}) {
  return withInstanceLock(instance, async () => {
    // Reload under the operation lock so a selection completed while waiting cannot be lost.
    const current = JSON.parse((await readPrivate(instance.manifest)).toString('utf8'));
    if (current.id !== instance.id || current.project !== instance.project || current.port !== instance.port) fail('Instance changed before lifecycle');
    instance = { ...instance, selected: current.selected };
    const data = command === 'status' && !instance.selected ? '' : await selectedData(instance), env = dockerEnvironment(instance, data);
    const call = args => run(args, { env, cwd: instance.worktree });
    const containers = await inventory(instance, data, call);
    if (command === 'status') return containers.map(c => ({ service: c.Config.Labels['com.docker.compose.service'], id: c.Id, state: c.State.Status, health: c.State.Health?.Status }));
    if (command === 'down') {
      call(composeArgs(instance, ['down', '--timeout', '30']));
      if ((await inventory(instance, data, call)).length) fail('Stop proof failed; resources retained');
      await writerSettled(data); return;
    }
    if (!['up', 'build'].includes(command)) fail('Unknown lifecycle command');
    if (!containers.some(c => c.Config.Labels['com.docker.compose.service'] === 'caddy' && c.State.Running)) await availablePort(instance.port);
    if (!containers.some(c => c.Config.Labels['com.docker.compose.service'] === 'web' && c.State.Running)) await writerSettled(data);
    await prepareRuntime(instance);
    call(composeArgs(instance, ['build']));
    if (command === 'up') {
      call(composeArgs(instance, ['up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '90']));
      const after = await inventory(instance, data, call);
      if (after.length !== 2 || after.some(c => !c.State.Running || c.State.Health?.Status !== 'healthy')) fail('Development health proof failed; no automatic restart/cleanup');
    }
  });
}
function options(argv) {
  const [command, ...rest] = argv, values = {};
  const allowed = { init: ['port'], up: ['port'], build: [], down: [], status: [], ps: [], clone: ['source-config', 'dataset'], select: ['dataset'] };
  if (!allowed[command]) fail('Usage: local-stack.mjs init --port PORT | clone --source-config FILE --dataset NEW_ID | select --dataset ID | up [--port PORT] | build | down | status');
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i].slice(2), value = rest[i + 1];
    if (!rest[i].startsWith('--') || !allowed[command].includes(key) || !value || value.startsWith('--') || Object.hasOwn(values, key)) fail('Unknown/duplicate/missing option');
    values[key] = value;
  }
  if ((command === 'init' && !values.port) || (command === 'clone' && (!values['source-config'] || !values.dataset)) || (command === 'select' && !values.dataset)) fail('Required explicit option missing');
  return { command: command === 'ps' ? 'status' : command, values };
}
export async function main(argv) {
  const { command, values } = options(argv);
  if (command === 'init') await availablePort(values.port);
  const instance = await loadInstance({ port: values.port, create: command === 'init' });
  if (command === 'clone') {
    const metadata = await cloneDataset(instance, { sourceConfig: values['source-config'], id: values.dataset });
    console.log(JSON.stringify({ instance: instance.id, worktree: instance.worktree, dataset: metadata.dataset, provenance: metadata, selected: false })); return;
  }
  if (command === 'select') {
    await selectDataset(instance, values.dataset, { proveStopped: async () => {
      const data = instance.selected ? await selectedData(instance) : '';
      return (await inventory(instance, data)).length === 0; // Require scoped down, not merely paused/exited containers.
    } });
  } else if (command !== 'init') {
    const result = await lifecycle(instance, command);
    if (command === 'status') console.log(JSON.stringify({ services: result }));
  }
  const current = await loadInstance();
  let provenance = null;
  if (current.selected) provenance = (await inspectDataset(current, current.selected)).metadata;
  console.log(JSON.stringify({ worktree: current.worktree, instance: current.id, project: current.project, url: `https://localhost:${current.port}`, dataset: current.selected, provenance, privateState: current.base }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(process.argv.slice(2)); }
  catch { console.error('Development command refused/failed. Check explicit options, private ownership, complete dataset, stopped writer and scoped Docker availability. No data/secrets logged; no automatic repair.'); process.exitCode = 1; }
}
