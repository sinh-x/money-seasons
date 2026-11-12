// Disposable synthetic member-mode browser fixture. No existing endpoint/data.
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openHouseholdStore } from '../persistence.mjs';
import { openMembershipManager } from '../membership-service.mjs';
import { hashPassword } from '../membership.mjs';
import { createHouseholdService } from '../household-service.mjs';
import { createServer } from '../server.mjs';
import { createAuth } from '../auth.mjs';
import { blankPlan } from '../public/model.js';
import { blankHousehold, individualPlan, setSharing } from '../public/household-model.js';
import { prefixProxy } from './prefix-proxy.mjs';
export const MEMBER_PASSWORD = 'Synthetic member browser only';
export function syntheticHousehold() {
  const make = (name, income, expense) => ({ ...blankPlan(), name, objects: [{ id: 'person', name: 'Cùng tên', type: 'person' }], items: [
    { id: 'income', objectId: 'person', name: `Thu ${name}`, description: '', type: 'income', status: 'confirmed', amount: income, recurrence: { kind: 'interval', anchor: '2026-11', end: '2027-12', everyMonths: 1 }, amountChanges: [] },
    { id: 'expense', objectId: 'person', name: `Chi ${name}`, description: '', type: 'expense', status: 'confirmed', amount: expense, recurrence: { kind: 'once', anchor: '2026-11', end: '2026-11', everyMonths: 1 }, amountChanges: [] }
  ] });
  return setSharing({ ...blankHousehold(), individuals: [individualPlan('lan', make('Lan', 20_000_000, 2_000_000)), individualPlan('minh', make('Minh', 15_000_000, 5_000_000))] }, 'lan', 'lan', 'items', 'expense', false);
}
export async function memberFixture({ basePath = '' } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-member-browser-'));
  let store, membership, server, proxy;
  try {
    const verifier = await hashPassword(MEMBER_PASSWORD);
    await fs.writeFile(path.join(directory, 'users.json'), JSON.stringify({ version: 1, revision: 1, users: ['lan', 'minh'].map(id => ({ id, username: id, name: id === 'lan' ? 'Lan' : 'Minh', enabled: true, credentialVersion: 1, password: verifier })) }), { mode: 0o600 });
    await fs.writeFile(path.join(directory, 'roles.json'), JSON.stringify({ version: 1, adminIds: ['minh'] }), { mode: 0o600 });
    membership = await openMembershipManager(directory, { rolesFile: path.join(directory, 'roles.json') });
    store = await openHouseholdStore(directory); await store.transact(0, () => syntheticHousehold());
    const household = createHouseholdService({ store, membership }); let implementation;
    const auth = Object.fromEntries(['boundary', 'session', 'login', 'logout'].map(key => [key, (...args) => implementation[key](...args)]));
    server = createServer({ household, administration: membership, auth, basePath });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    if (basePath) { proxy = prefixProxy(server.address().port, basePath); await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve)); }
    const origin = `http://127.0.0.1:${(proxy || server).address().port}`;
    if ([3080, 3081].includes((proxy || server).address().port)) throw new Error('Reserved fixture port');
    implementation = await createAuth({ membership, origins: [origin], basePath, secure: false });
    return { base: origin + basePath, directory, async close() { if (proxy) await new Promise(r => proxy.close(r)); await new Promise(r => server.close(r)); await store.close(); await membership.close(); await fs.rm(directory, { recursive: true, force: true }); } };
  } catch (e) { proxy?.close(); server?.close(); await store?.close(); await membership?.close(); await fs.rm(directory, { recursive: true, force: true }); throw e; }
}
