import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

test('Docker retains private loopback publication, read-only root, restricted persistent mounts', async () => {
  const compose = await readFile('compose.yaml', 'utf8'), docker = await readFile('Dockerfile', 'utf8');
  const ignore = await readFile('.dockerignore', 'utf8');
  for (const source of ['server.mjs', 'persistence.mjs', 'auth.mjs']) assert.ok(ignore.includes('!' + source));
  assert.ok(ignore.startsWith('**\n')); // No exports, secrets, test credentials or dependencies in context.
  assert.match(compose, /127\.0\.0\.1:\$\{MONEY_SEASONS_PORT:-3080\}:3080/);
  assert.match(compose, /read_only: true/); assert.match(compose, /no-new-privileges:true/);
  assert.match(compose, /cap_drop:\s+- ALL/);
  for (const value of ['MONEY_SEASONS_DATA_DIR: /data', 'target: /data', 'target: /run/private/passphrase', 'create_host_path: false', 'MONEY_SEASONS_ORIGINS:']) assert.ok(compose.includes(value));
  assert.match(docker, /USER node/); assert.ok(docker.includes('persistence.mjs auth.mjs'));
  assert.doesNotMatch(compose, /5432|funnel|network_mode:\s*host|privileged:\s*true/i);
});

test('production startup fails closed without private config; no insecure-cookie environment switch', async () => {
  const result = spawnSync(process.execPath, ['server.mjs'], { env: { PATH: process.env.PATH, MONEY_SEASONS_INSECURE: '1' }, encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.status, 1); assert.match(result.stderr, /Startup refused/);
  const source = await readFile('server.mjs', 'utf8');
  assert.doesNotMatch(source, /secure:\s*false|MONEY_SEASONS_INSECURE/);
});

test('operator guide separates HTTPS/family restrictions, private persistence and human rollout checks', async () => {
  const readme = await readFile('README.md', 'utf8'), recovery = await readFile('docs/ms-001.md', 'utf8');
  for (const required of ['Tailscale private HTTPS', 'No Funnel', 'unauthorized device denied', 'UID 1000', '0700', '0600', 'no production insecure-cookie switch']) assert.ok(readme.includes(required), required);
  for (const required of ['writer.lock', 'no live or unknown writer', 'durabilityUncertain', 'power-loss', '16 human UAT']) assert.ok(recovery.includes(required), required);
});

test('private exports, state, env and dependencies are ignored by Git', async () => {
  const ignored = await readFile('.gitignore', 'utf8');
  for (const entry of ['.env', '/private-data/', '/exports/', 'node_modules/']) assert.ok(ignored.includes(entry));
});
