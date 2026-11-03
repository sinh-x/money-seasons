import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, stat, chmod, symlink, unlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

test('local Caddy stack is a separate loopback-only internal project with no app host port', async () => {
  const source = await readFile('compose.local.yaml', 'utf8');
  assert.match(source, /name: money-seasons-local-test/);
  assert.match(source, /image: money-seasons-local-test-web:latest/);
  assert.match(source, /127\.0\.0\.1:3081:3081/);
  assert.match(source, /MONEY_SEASONS_ORIGINS: https:\/\/localhost:3081/);
  assert.match(source, /backend:\s+internal: true/);
  assert.match(source, /networks: \[backend\]/);
  assert.match(source, /networks: \[edge, backend\]/);
  assert.doesNotMatch(source.split('  caddy:')[0], /^\s+ports:/m);
  assert.match(source, /user: "1000:1000"/);
  assert.match(source, /image: money-seasons-local-test-caddy:2\.10\.2/);
  const caddyImage = await readFile('ops/Dockerfile.caddy-local', 'utf8');
  assert.match(caddyImage, /FROM caddy:2\.10\.2-alpine@sha256:[a-f0-9]{64}/);
  assert.match(caddyImage, /RUN setcap -r \/usr\/bin\/caddy/);
  assert.match(caddyImage, /USER 1000:1000/);
  assert.equal((source.match(/read_only: true/g) || []).length, 4); // two roots + two read-only config/secret mounts
  assert.doesNotMatch(source, /network_mode:|external:|privileged:|3080:3080/);
  const config = await readFile('ops/Caddyfile.local', 'utf8');
  for (const expected of ['admin off', 'auto_https disable_redirects', 'skip_install_trust', 'tls internal', 'reverse_proxy web:3080']) assert.ok(config.includes(expected));
  assert.doesNotMatch(config, /header_up\s+Host|acme|funnel/i);
});

test('local bootstrap creates private state, preserves credentials and refuses unsafe existing files', async t => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'ms-local-bootstrap-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const run = () => spawnSync(process.execPath, ['scripts/local-stack.mjs', 'init'], { env: { ...process.env, HOME: home }, encoding: 'utf8' });
  if (process.getuid() !== 1000) { assert.equal(run().status, 1); return; }
  const first = run(); assert.equal(first.status, 0, first.stderr);
  const base = path.join(home, '.local/share/money-seasons-local-test'), secret = path.join(base, 'passphrase');
  assert.equal((await stat(base)).mode & 0o777, 0o700);
  assert.equal((await stat(path.join(base, 'data'))).mode & 0o777, 0o700);
  assert.equal((await stat(secret)).mode & 0o777, 0o600);
  const original = await readFile(secret, 'utf8'); assert.ok(original.trim().length >= 12); assert.ok(!first.stdout.includes(original.trim()));
  assert.equal(run().status, 0); assert.equal(await readFile(secret, 'utf8'), original);
  await chmod(secret, 0o644); assert.equal(run().status, 1); assert.equal(await readFile(secret, 'utf8'), original);
  await chmod(secret, 0o600); await unlink(secret); await symlink('/dev/null', secret); assert.equal(run().status, 1);
});
