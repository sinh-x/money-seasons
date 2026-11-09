import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { isolationPreflight } from '../scripts/stack-isolation-check.mjs';

test('synthetic Docker harness fails closed before contacting a default/unapproved daemon', async () => {
  for (const env of [{}, { DOCKER_HOST: 'unix:///var/run/docker.sock' }, { MS_ISOLATION_DOCKER_HOST: 'unix:///var/run/docker.sock', MS_ISOLATION_DAEMON_ID: 'x', MS_ISOLATION_DOCKER_ROOT: '/tmp' }]) {
    let called = false;
    await assert.rejects(isolationPreflight(env, () => { called = true; }), /gate missing/);
    assert.equal(called, false);
  }
});
test('isolated gate binds exact private socket, daemon ID/root, empty resources and cached images', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-daemon-gate-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const socket = path.join(root, 'fixture.sock'), daemonRoot = path.join(root, 'docker-root'); await fs.mkdir(daemonRoot, { mode: 0o700 });
  const server = net.createServer(); await new Promise(r => server.listen(socket, r)); t.after(() => new Promise(r => server.close(r)));
  const env = { MS_ISOLATION_DOCKER_HOST: `unix://${socket}`, MS_ISOLATION_DAEMON_ID: 'fixture-id', MS_ISOLATION_DOCKER_ROOT: daemonRoot };
  const commands = [];
  const run = args => {
    commands.push(args);
    if (args[0] === 'info') return JSON.stringify({ ID: 'fixture-id', DockerRootDir: daemonRoot });
    if (args[0] === 'network') return 'bridge\nhost\nnone';
    return '';
  };
  assert.equal((await isolationPreflight(env, run)).host, env.MS_ISOLATION_DOCKER_HOST);
  assert.equal(commands.filter(args => args[0] === 'image').length, 2);
  await assert.rejects(isolationPreflight({ ...env, MS_ISOLATION_DAEMON_ID: 'wrong' }, run), /mismatch/);
  await assert.rejects(isolationPreflight(env, args => args[0] === 'ps' ? 'foreign' : run(args)), /no containers/);
});
