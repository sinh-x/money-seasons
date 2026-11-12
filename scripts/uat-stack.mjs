// Explicit synthetic-only MS-005 setup. Never reads a real source, adopts a
// legacy instance, rewrites credentials/datasets, or touches another project.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { loadInstance, availablePort, privateDir, exclusiveFile, syncDir, atomicJson, readPrivate, withInstanceLock, fail } from './stack-identity.mjs';
import { inventory, main as localMain } from './local-stack.mjs';
import { cloneDataset, selectDataset } from './stack-data.mjs';
import { hashPassword } from '../membership.mjs';
import { syntheticHousehold } from './member-fixture.mjs';
export async function setupUAT(port) {
  await availablePort(port);
  let instance = await loadInstance({ port, create: true });
  await withInstanceLock(instance, async () => {
    const state = JSON.parse((await readPrivate(instance.manifest)).toString('utf8'));
    if (state.selected || state.authMode || (await inventory(instance, '')).length) fail('Existing instance retained; use local:status/up, not UAT initialization again');
    const members = path.join(instance.base, 'members'), roles = path.join(instance.base, 'roles');
    await privateDir(members, true); await privateDir(roles, true);
    const credentials = ['lan', 'minh'].map(id => ({ id, password: randomBytes(24).toString('base64url') }));
    const users = await Promise.all(credentials.map(async ({ id, password }) => ({ id, username: id, name: id === 'lan' ? 'Lan' : 'Minh', enabled: true, credentialVersion: 1, password: await hashPassword(password) })));
    await exclusiveFile(path.join(members, 'users.json'), JSON.stringify({ version: 1, revision: 1, users }));
    await exclusiveFile(path.join(roles, 'roles.json'), JSON.stringify({ version: 1, adminIds: ['minh'] }));
    await exclusiveFile(path.join(instance.base, 'uat-credentials.txt'), credentials.map(c => `${c.id}: ${c.password}`).join('\n') + '\n');
    await syncDir(members); await syncDir(roles); await syncDir(instance.base);
    await atomicJson(instance.manifest, { ...state, authMode: 'members' });
  });
  instance = await loadInstance();
  const source = await fs.mkdtemp(path.join(os.tmpdir(), 'ms005-uat-source-'));
  try {
    await exclusiveFile(path.join(source, 'plan.json'), JSON.stringify({ schemaVersion: 'money-seasons-household/v1', revision: 1, household: syntheticHousehold() }));
    await exclusiveFile(path.join(source, 'source.json'), JSON.stringify({ planFile: path.join(source, 'plan.json') }));
    await cloneDataset(instance, { sourceConfig: path.join(source, 'source.json'), id: 'ms005-synthetic-001' });
    await selectDataset(instance, 'ms005-synthetic-001', { proveStopped: async () => (await inventory(instance, '')).length === 0 });
  } finally { await fs.rm(source, { recursive: true, force: true }); }
  console.log(JSON.stringify({ initialized: true, url: `https://localhost:${instance.port}`, credentialsFile: path.join(instance.base, 'uat-credentials.txt'), syntheticOnly: true }));
}
try {
  const [command, flag, port, ...rest] = process.argv.slice(2);
  if (command !== 'init' || flag !== '--port' || !port || rest.length) fail('Usage: node scripts/uat-stack.mjs init --port PORT; then npm run local:up');
  await setupUAT(port);
} catch { console.error('UAT setup refused. Existing resources retained; inspect private state, port and ownership. No automatic repair or secret output.'); process.exitCode = 1; }
