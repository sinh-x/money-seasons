// Isolated synthetic fixtures only. Never attaches to an existing service or browser profile.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../persistence.mjs';
import { createAuth } from '../auth.mjs';
import { createServer } from '../server.mjs';

export const PASSPHRASE = 'synthetic-family-test-only';
export async function testApp({ hook, now, cookieName, hostname = '127.0.0.1' } = {}) {
  if (!['127.0.0.1', 'localhost'].includes(hostname)) throw new Error('Loopback fixture hostname required');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'money-seasons-test-'));
  let store, server;
  try {
    store = await openStore(path.join(directory, 'data'), { hook });
    let implementation;
    const auth = Object.fromEntries(['boundary', 'session', 'login', 'logout'].map(key => [key, (...args) => implementation[key](...args)]));
    server = createServer({ store, auth });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://${hostname}:${server.address().port}`;
    if (['3080', '3081'].includes(String(server.address().port))) throw new Error('Reserved fixture port refused');
    implementation = await createAuth({ passphrase: PASSPHRASE, origins: [base], secure: false, now, cookieName });
    return { base, directory, store, server,
      async login() {
        const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ passphrase: PASSPHRASE }) });
        if (!r.ok) throw new Error('Synthetic login failed');
        return { Cookie: r.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': (await r.json()).csrf, Origin: base, 'Content-Type': 'application/json' };
      },
      async close() { await new Promise(resolve => server.close(resolve)); await store.close(); await rm(directory, { recursive: true, force: true }); }
    };
  } catch (e) { server?.close(); await store?.close(); await rm(directory, { recursive: true, force: true }); throw e; }
}
