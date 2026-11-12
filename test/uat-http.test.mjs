// Synthetic-only coverage of explicit private-copy HTTP selection. Never production.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import { loadInstance, privateDir, exclusiveFile } from '../scripts/stack-identity.mjs';
import { cloneDataset } from '../scripts/stack-data.mjs';
import { startHTTPUAT } from '../scripts/uat-http.mjs';
import { hashPassword } from '../membership.mjs';
import { blankPlan } from '../public/model.js';
import { blankHousehold, individualPlan } from '../public/household-model.js';
async function port() {
  const s = net.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r));
  const p = s.address().port; await new Promise(r => s.close(r));
  if ([3080, 3081].includes(p)) return port();
  return p;
}
test('HTTP explicit dataset requires a complete private copy and its own membership; no implicit seed, production switch or fallback', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-http-selection-'));
  let app;
  t.after(async () => { await app?.close(); await fs.rm(root, { recursive: true, force: true }); });
  const home = path.join(root, 'home'); await privateDir(home, true);
  const selectedPort = await port();
  const instance = await loadInstance({ home, port: selectedPort, create: true });
  await assert.rejects(startHTTPUAT(selectedPort, { dataset: 'missing', home }));
  await assert.rejects(fs.stat(path.join(instance.base, `http-${selectedPort}`)), { code: 'ENOENT' });
  const source = path.join(root, 'source'); await privateDir(source, true);
  const original = JSON.stringify({ schemaVersion: 'money-seasons-household/v1', revision: 1, household: { ...blankHousehold(), individuals: [individualPlan('sinh', blankPlan())] } });
  await exclusiveFile(path.join(source, 'plan.json'), original);
  await exclusiveFile(path.join(source, 'source.json'), JSON.stringify({ planFile: path.join(source, 'plan.json') }));
  await cloneDataset(instance, { sourceConfig: path.join(source, 'source.json'), id: 'copy-001' });
  const directory = path.join(instance.base, 'datasets/copy-001'), members = path.join(directory, 'members');
  await assert.rejects(startHTTPUAT(selectedPort, { dataset: 'copy-001', home }));
  await privateDir(members, true);
  const password = 'Synthetic-only HTTP selection password', verifier = await hashPassword(password);
  await exclusiveFile(path.join(members, 'users.json'), JSON.stringify({ version: 1, revision: 1, users: [['sinh', 'Sinh'], ['an', 'Ân'], ['vy', 'Vy']].map(([id, name]) => ({ id, username: id, name, enabled: true, credentialVersion: 1, password: verifier })) }));
  await exclusiveFile(path.join(members, 'roles.json'), JSON.stringify({ version: 1, adminIds: ['sinh'] }));
  app = await startHTTPUAT(selectedPort, { dataset: 'copy-001', home });
  assert.equal(app.server.address().address, '127.0.0.1');
  assert.equal(app.dataset, 'copy-001'); assert.equal(app.credentialsFile, path.join(members, 'credentials.txt'));
  for (const [username, name] of [['sinh', 'Sinh'], ['an', 'Ân'], ['vy', 'Vy']]) {
    const response = await fetch(app.url + '/api/login', { method: 'POST', headers: { Origin: app.url, 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    assert.equal(response.status, 200);
    const login = await response.json(); assert.equal(login.member.name, name); assert.equal(login.member.admin, username === 'sinh');
    const headers = { Cookie: response.headers.get('set-cookie').split(';')[0] };
    const own = await (await fetch(app.url + '/api/plan', { headers })).json(); assert.equal(own.ownerId, username);
    assert.equal((await fetch(app.url + '/api/users', { headers })).status, username === 'sinh' ? 200 : 403);
  }
  assert.equal(await fs.readFile(path.join(directory, 'original.json'), 'utf8'), original);
  assert.equal(await fs.readFile(path.join(source, 'plan.json'), 'utf8'), original);
  await app.close(); app = null;
  await fs.unlink(path.join(directory, 'data/plan.json'));
  await assert.rejects(startHTTPUAT(selectedPort, { dataset: 'copy-001', home }));
  await assert.rejects(fs.stat(path.join(directory, 'data/plan.json')), { code: 'ENOENT' });
});
