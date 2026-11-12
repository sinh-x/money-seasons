import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateBasePath } from '../public/base-path.js';
import { createAuth } from '../auth.mjs';
import { startApplication } from '../server.mjs';

const invalid = ['/', '/a/', '//a', '/a//b', '/a/../b', '/.', '/%61', '/a\\b', ' /a', '/a ', '/a\n', '/é', '/a?x', '/a#x', '/a:b', 'https://evil.test', '/"<>', '/' + 'a'.repeat(128)];
test('prefix grammar is exact, bounded ASCII with no normalization', () => {
  for (const input of [undefined, '', '/lichtaichinh', '/nested/app_2', '/' + 'a'.repeat(127)]) assert.equal(validateBasePath(input), input ?? '');
  for (const input of [...invalid, null, 1, {}]) assert.throws(() => validateBasePath(input), { message: 'Invalid application base path' });
});
test('invalid startup prefix fails before even reading credentials or acquiring a writer', async () => {
  for (const value of invalid) {
    await assert.rejects(startApplication({ MONEY_SEASONS_BASE_PATH: value }), { message: 'Invalid application base path' });
  }
});
test('prefix and instance hash isolate cookies while preserving root naming and security', async () => {
  const passphrase = 'synthetic-prefix-test-only', origin = 'https://family.example.test';
  const req = headers => ({ headers: { host: 'family.example.test', origin, ...headers }, socket: { remoteAddress: '127.0.0.1' } });
  const profiles = [['ms_session', ''], ['ms_session', '/lichtaichinh'], ['ms_session', '/sibling'], ['ms_dev_' + 'a'.repeat(64), '/lichtaichinh'], ['ms_dev_' + 'a'.repeat(64), '']];
  const logins = [], auths = [];
  for (const [cookieName, basePath] of profiles) {
    const auth = await createAuth({ passphrase, origins: [origin], cookieName, basePath });
    const login = await auth.login(req(), passphrase);
    const name = basePath ? 'ms_path_' + createHash('sha256').update(cookieName + '\0' + basePath).digest('hex') : cookieName;
    assert.equal(login.cookie.split('=')[0], name);
    assert.ok(login.cookie.includes(`; Path=${basePath}/;`));
    for (const flag of ['HttpOnly', 'SameSite=Strict', 'Secure', 'Max-Age=86400']) assert.ok(login.cookie.includes(flag));
    assert.ok(!login.cookie.includes('Domain='));
    logins.push(login); auths.push(auth);
  }
  const jar = logins.map(l => l.cookie.split(';')[0]).join('; ');
  for (let i = 0; i < profiles.length; i++) {
    assert.equal(auths[i].session(req({ cookie: jar })).csrf, logins[i].csrf);
    assert.throws(() => auths[i].session(req({ cookie: jar + '; ' + logins[i].cookie.split(';')[0] })), e => e.status === 401);
  }
  assert.throws(() => auths[1].session(req({ cookie: logins[0].cookie.split(';')[0] })), e => e.status === 401);
  const cleared = auths[1].logout(req({ cookie: jar, 'x-csrf-token': logins[1].csrf }));
  assert.equal(cleared, logins[1].cookie.replace(/=[a-f0-9]{64};/, '=;').replace('Max-Age=86400', 'Max-Age=0'));
  assert.equal(auths[0].session(req({ cookie: jar })).csrf, logins[0].csrf);
  await assert.rejects(createAuth({ passphrase, origins: [origin], basePath: '/bad/' }));
  await assert.rejects(createAuth({ passphrase, origins: [origin], cookieName: 'ms_path_' + 'a'.repeat(64), basePath: '/a' }));
});
