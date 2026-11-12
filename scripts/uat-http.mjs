// Explicit LOCAL UAT only. Not copied into the production image.
// Default mode owns synthetic data. --dataset selects an already provisioned
// private copy; it never reads a source or seeds/repairs missing selected data.
// There is no production insecure-auth environment switch. Bind/origins are
// fixed to loopback; HTTP has an independent source, credentials and cookie.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { loadInstance, devPort, privateDir, exclusiveFile, syncDir, digest } from './stack-identity.mjs';
import { inspectDataset } from './stack-data.mjs';
import { hashPassword } from '../membership.mjs';
import { openMembershipManager } from '../membership-service.mjs';
import { openHouseholdStore } from '../persistence.mjs';
import { createHouseholdService } from '../household-service.mjs';
import { createAuth } from '../auth.mjs';
import { createServer } from '../server.mjs';
import { syntheticHousehold } from './member-fixture.mjs';
export async function startHTTPUAT(port, { dataset, home } = {}) {
  port = devPort(port);
  const instance = await loadInstance({ ...(home ? { home } : {}) });
  const selected = dataset === undefined ? null : await inspectDataset(instance, dataset);
  const directory = selected ? selected.data : path.join(instance.base, `http-${port}`);
  const membersDirectory = selected ? path.join(selected.directory, 'members') : directory;
  let created = false;
  if (!selected) {
    try { await fs.mkdir(directory, { mode: 0o700 }); created = true; }
    catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
  await privateDir(directory); await privateDir(membersDirectory);
  if (created) {
    const credentials = ['lan', 'minh'].map(id => ({ id, password: randomBytes(24).toString('base64url') }));
    const users = await Promise.all(credentials.map(async c => ({ id: c.id, username: c.id, name: c.id === 'lan' ? 'Lan' : 'Minh', enabled: true, credentialVersion: 1, password: await hashPassword(c.password) })));
    await exclusiveFile(path.join(directory, 'users.json'), JSON.stringify({ version: 1, revision: 1, users }));
    await exclusiveFile(path.join(directory, 'roles.json'), JSON.stringify({ version: 1, adminIds: ['minh'] }));
    await exclusiveFile(path.join(directory, 'credentials.txt'), credentials.map(c => `${c.id}: ${c.password}`).join('\n') + '\n');
    await exclusiveFile(path.join(directory, 'plan.json'), JSON.stringify({ schemaVersion: 'money-seasons-household/v1', revision: 1, household: syntheticHousehold() }));
    await syncDir(directory); await syncDir(instance.base);
  }
  let membership, store, server;
  try {
    membership = await openMembershipManager(membersDirectory, { rolesFile: path.join(membersDirectory, 'roles.json') });
    store = await openHouseholdStore(directory);
    const state = await store.read();
    if (!state.household) throw new Error('No implicit reinitialization');
    const auth = await createAuth({ membership, secure: false, origins: [`http://127.0.0.1:${port}`, `http://localhost:${port}`], cookieName: `ms_dev_${digest(instance.id + ':http:' + port + (dataset === undefined ? '' : ':dataset:' + dataset))}` });
    server = createServer({ household: createHouseholdService({ store, membership }), administration: membership, auth });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    return { server, url: `http://127.0.0.1:${port}`, dataset: dataset ?? null, credentialsFile: path.join(membersDirectory, 'credentials.txt'), async close() { await new Promise(r => server.close(r)); await store.close(); await membership.close(); } };
  } catch (e) { server?.close(); await store?.close(); await membership?.close(); throw e; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [flag, port, datasetFlag, dataset, ...rest] = process.argv.slice(2);
    if (flag !== '--port' || !port || rest.length || (datasetFlag !== undefined && (datasetFlag !== '--dataset' || !dataset))) throw new Error('Explicit port and optional dataset required');
    const app = await startHTTPUAT(port, { dataset });
    console.log(JSON.stringify({ url: app.url, credentialsFile: app.credentialsFile, dataset: app.dataset, syntheticOnly: app.dataset === null, loopbackOnly: true }));
    let stopping = false;
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { if (!stopping) { stopping = true; await app.close(); } });
  } catch { console.error('Local HTTP UAT refused; private state retained. No automatic repair or secret output.'); process.exitCode = 1; }
}
