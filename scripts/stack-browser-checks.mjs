// Synthetic loopback cookie-jar regression; HTTPS transport is separately checked by Docker harness.
import assert from 'node:assert/strict';
import { testApp, PASSPHRASE } from './fixture-support.mjs';
export async function stackBrowserChecks(browser) {
  const apps = [], names = ['a', 'b'].map(c => `ms_dev_${c.repeat(64)}`);
  let context;
  try {
    for (const cookieName of names) apps.push(await testApp({ cookieName, hostname: 'localhost' }));
    context = await browser.newContext();
    const pages = await Promise.all(apps.map(() => context.newPage()));
    for (let i = 0; i < 2; i++) {
      await pages[i].goto(apps[i].base);
      const status = await pages[i].evaluate(async passphrase => (await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passphrase }) })).status, PASSPHRASE);
      assert.equal(status, 200);
    }
    const jar = await context.cookies();
    assert.deepEqual(jar.map(c => c.name).sort(), names.slice().sort());
    for (const c of jar) { assert.equal(c.httpOnly, true); assert.equal(c.sameSite, 'Strict'); }
    for (const p of pages) assert.equal(await p.evaluate(async () => (await fetch('/api/session')).status), 200);
    assert.equal(await pages[1].evaluate(async () => {
      const session = await (await fetch('/api/session')).json();
      return (await fetch('/api/logout', { method: 'POST', headers: { 'X-CSRF-Token': session.csrf } })).status;
    }), 200);
    assert.equal(await pages[0].evaluate(async () => (await fetch('/api/session')).status), 200);
    assert.equal(await pages[1].evaluate(async () => (await fetch('/api/session')).status), 401);
    assert.deepEqual((await context.cookies()).map(c => c.name), [names[0]]);
  } finally { await context?.close(); for (const app of apps) await app.close(); }
}
