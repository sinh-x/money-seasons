import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { memberFixture, MEMBER_PASSWORD } from './member-fixture.mjs';
if (process.env.BASE_URL) throw new Error('Refusing external browser target');
const fixture = await memberFixture({ basePath: process.argv.includes('--prefix') ? '/lichtaichinh' : '' });
let browser;
const errors = [];
try {
  browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || undefined, headless: true });
  const a = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), b = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const lan = await a.newPage(), minh = await b.newPage();
  for (const p of [lan, minh]) p.on('pageerror', e => errors.push(e.message));
  const login = async (p, username) => { await p.goto(fixture.base + '/'); await p.locator('[name=username]').fill(username); await p.locator('[name=passphrase]').fill(MEMBER_PASSWORD); await p.locator('#login-form button').click(); await p.locator('#application').waitFor({ state: 'visible' }); };
  const state = (p, route = '/api/plan') => p.evaluate(async route => (await fetch((document.documentElement.dataset.basePath || '') + route)).json(), route);
  const confirm = async p => { await p.locator('#confirm-dialog').waitFor({ state: 'visible' }); await p.locator('#confirm-form button[type=submit]').click(); };
  const close = async p => { await p.locator('#editor [data-close]').first().click(); await p.locator('#editor').waitFor({ state: 'hidden' }); };
  await login(lan, 'lan'); await login(minh, 'minh');
  assert.equal(await lan.locator('#users-button').isVisible(), false); assert.equal(await minh.locator('#users-button').isVisible(), true);
  await minh.locator('#home-button').click(); await minh.waitForFunction(() => document.querySelector('#member-name').textContent.includes('Home'));
  const initial = await state(minh, '/api/home'); assert.equal(initial.plan.items.length, 3); assert.ok(!JSON.stringify(initial).includes('Chi Lan'));
  assert.equal(initial.plan.items.filter(i => i.type === 'income').reduce((n, i) => n + i.amount, 0), 35_000_000);
  assert.equal(await minh.locator('#workspace [data-privacy]').count(), 0, 'Home calendar has no privacy controls, including for its viewer’s own records');
  const ownerLabels = await minh.locator('#workspace .owner-label').allTextContents();
  assert.ok(ownerLabels.length > 0, 'Home calendar retains owner labels');
  assert.ok(ownerLabels.every(text => ['Lan', 'Minh'].includes(text)), 'Owner labels show only display names, not technical IDs');
  assert.ok(ownerLabels.every(text => !/Chia sẻ|Riêng tư|Giữ riêng/.test(text)), 'Home calendar omits redundant privacy status');
  assert.ok(!(await minh.locator('#workspace').textContent()).includes('Chi Lan'), 'private expense absent from Home calendar');
  assert.ok(await lan.locator('#workspace [data-privacy]').count() > 0, 'My calendar retains owner privacy controls');
  console.log('PASS Home calendar shared-only, owner labels without privacy controls/status; My controls retained');
  for (const p of [lan, minh]) {
    for (const view of ['expense', 'income']) {
      await p.locator(`[data-view=${view}]`).click();
      const captions = await p.locator('#workspace .object-header small').allTextContents();
      assert.ok(captions.length > 0, 'Object cards remain visible');
      assert.ok(captions.every(text => !text.includes('Mã ')), 'Object cards omit technical codes in My and Home');
    }
  }
  await minh.locator('[data-view=calendar]').click();
  await lan.locator('[data-view=income]').click();
  await lan.locator('[data-action=item][data-id=income]').first().click();
  assert.ok((await lan.locator('#edit-form [name=objectId] option').allTextContents()).every(text => !text.includes('[person]')), 'Object choices omit internal IDs');
  await lan.locator('#edit-form [name=amount]').fill('22tr'); await lan.locator('#edit-form button[type=submit]').click(); await confirm(lan);
  await lan.locator('#editor').waitFor({ state: 'hidden' });
  const started = Date.now();
  await minh.waitForFunction(() => document.querySelector('#workspace').textContent.includes('37.000.000'), { timeout: 5000 });
  assert.ok(Date.now() - started <= 5000);
  console.log('PASS live My → Home 35M → 37M, private 2M excluded');
  await minh.locator('[data-view=income]').click();
  const foreignId = JSON.stringify(['lan', 'income']);
  await minh.locator('[data-action=item]').filter({ hasText: 'Sửa chi tiết' }).evaluateAll((nodes, id) => nodes.find(n => n.dataset.id === id).click(), foreignId);
  await minh.locator('#edit-form [name=name]').fill('Thu Lan đã cộng tác'); await minh.locator('#edit-form button[type=submit]').click(); await confirm(minh);
  await minh.locator('#editor').waitFor({ state: 'hidden' });
  await lan.waitForFunction(() => document.querySelector('#workspace').textContent.includes('Thu Lan đã cộng tác'), { timeout: 5000 });
  assert.equal((await state(lan)).plan.items[0].name, 'Thu Lan đã cộng tác');
  console.log('PASS confirmed collaborative source edit retains owner');
  // Owner unshares while a collaborator is editing: foreign form and content purge.
  await minh.locator('[data-action=item]').filter({ hasText: 'Sửa chi tiết' }).evaluateAll((nodes, id) => nodes.find(n => n.dataset.id === id).click(), foreignId);
  await lan.locator('[data-privacy=income]').first().click(); await confirm(lan);
  await minh.locator('#editor').waitFor({ state: 'hidden', timeout: 5000 });
  await minh.waitForFunction(() => !document.querySelector('#workspace').textContent.includes('Thu Lan đã cộng tác'), { timeout: 5000 });
  console.log('PASS unshare purges stale collaborator dialog and Home');
  await b.setOffline(true); await minh.waitForFunction(() => document.querySelector('#freshness').textContent.includes('DỮ LIỆU CŨ'));
  assert.ok(await minh.locator('[data-mutate]').first().isDisabled());
  await b.setOffline(false); await minh.waitForFunction(() => document.querySelector('#freshness').textContent === '', { timeout: 5000 });
  console.log('PASS offline blocks edits and reconnect revalidates');
  await minh.locator('#users-button').click(); await minh.locator('#edit-form [name=id]').fill('anh'); await minh.locator('#edit-form [name=username]').fill('anh'); await minh.locator('#edit-form [name=name]').fill('Anh'); await minh.locator('#edit-form [name=password]').fill('Synthetic new user password'); await minh.locator('#edit-form button[type=submit]').click(); await confirm(minh); await minh.locator('#editor').waitFor({ state: 'hidden' });
  assert.equal((await state(minh, '/api/users')).users.length, 3);
  await minh.locator('#period-button').click(); await minh.locator('[name=startMonth]').fill('2026-12'); await minh.locator('[name=endMonth]').fill('2027-01'); await minh.locator('#edit-form button[type=submit]').click(); await confirm(minh); await minh.locator('#editor').waitFor({ state: 'hidden' });
  await lan.waitForFunction(() => document.querySelector('#plan-title').textContent.includes('12 / 2026'), { timeout: 5000 });
  assert.equal((await state(lan)).plan.items[0].recurrence.anchor, '2026-11');
  console.log('PASS durable user creation and common period without schedule truncation');
  for (const width of [1440, 390]) {
    await lan.setViewportSize({ width, height: 1000 });
    for (const view of ['calendar', 'expense', 'income', 'accounts', 'debts']) {
      await lan.locator(`[data-view=${view}]`).click();
      assert.ok(await lan.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const report = await new AxeBuilder({ page: lan }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      assert.deepEqual(report.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), [], `${width}/${view}`);
    }
    await lan.locator('#password-button').click(); await lan.locator('[name=currentPassword]').waitFor({ state: 'visible' }); assert.equal(await lan.locator('#edit-form [name=password]').getAttribute('minlength'), '6'); await close(lan);
  }
  await lan.locator('#logout-button').click(); await confirm(lan); await lan.locator('#access-panel').waitFor({ state: 'visible' });
  assert.equal(await lan.locator('#workspace').textContent(), '');
  assert.deepEqual(errors, []); console.log('PASS 390/1440 five workspaces, axe, password controls, logout purge');
} finally { await browser?.close(); await fixture.close(); }
