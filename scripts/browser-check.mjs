// Owns its server, synthetic data, temporary artifacts and isolated profiles only.
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { PASSPHRASE } from './fixture-support.mjs';
import { blankPlan, forecast, validatePlan } from '../public/model.js';
import { demoPlan as legacyDemo } from '../public/legacy-model.js';
import { debtFixture } from './debt-fixture.mjs';
if (process.env.BASE_URL) throw new Error('Refusing BASE_URL: browser checks own an isolated synthetic child server.');
const artifacts = process.env.BROWSER_ARTIFACTS || await mkdtemp(path.join(os.tmpdir(), 'ms-001-browser-'));
if (!path.resolve(artifacts).startsWith(os.tmpdir() + path.sep)) throw new Error('Artifacts must be outside Git in a temporary directory.');
await mkdir(artifacts, { recursive: true, mode: 0o700 });
console.log(`Synthetic browser artifacts: ${artifacts}`);
const child = fork(new URL('./browser-server.mjs', import.meta.url), [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
let browser, base, page;
const results = [], errors = [], external = [], scans = [], responseLedger = [], failedRequests = [];
const timeout = setTimeout(() => { child.kill('SIGTERM'); process.exitCode = 1; }, 360000);
const check = async (name, action) => { await action(); results.push(name); console.log(`PASS ${name}`); };
function watch(p) {
  p.on('pageerror', e => errors.push(e.message));
  p.on('response', r => { if (r.status() >= 400) responseLedger.push({ path: new URL(r.url()).pathname, status: r.status() }); });
  p.on('requestfailed', r => failedRequests.push({ path: new URL(r.url()).pathname, error: r.failure().errorText }));
  p.on('request', r => { if (!r.url().startsWith(base + '/') && !r.url().startsWith('blob:')) external.push(r.url()); });
}
const visible = (p, selector) => p.locator(selector).waitFor({ state: 'visible' });
const snapshot = p => p.evaluate(async () => (await fetch('/api/plan')).json());
const close = async p => { await p.locator('#editor [data-close]').first().click(); await p.locator('#editor').waitFor({ state: 'hidden' }); };
const confirm = async p => { await visible(p, '#confirm-dialog'); await p.locator('#confirm-form button[type=submit]').click(); };
const cancelConfirm = async p => { await p.locator('#confirm-dialog [data-close]').first().click(); };
async function saved(p, before) { await p.waitForFunction(n => document.querySelector('#save-status').textContent.startsWith(`Đã lưu · phiên bản ${n + 1}`), before); }
async function submit(p, needsConfirm = false) {
  const before = (await snapshot(p)).revision;
  await p.locator('#edit-form button[type=submit]').click();
  if (needsConfirm) await confirm(p);
  await saved(p, before); await p.locator('#editor').waitFor({ state: 'hidden' });
}
const nav = async (p, name) => p.locator(`[data-view="${name}"]`).click();
async function login(p) {
  await p.goto(base); await visible(p, '#login-form'); await p.locator('[name=passphrase]').fill(PASSPHRASE);
  await p.locator('#login-form button').click(); await visible(p, '#application');
}
async function axe(p, name) {
  const report = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  scans.push({ name, violations: report.violations });
  assert.deepEqual(report.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), [], name);
}
async function overflow(p) {
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'unintended page overflow');
  for (const d of await p.locator('dialog[open]').all()) assert.ok(await d.evaluate(n => n.scrollWidth <= n.clientWidth), 'dialog overflow');
}
async function importPlan(p, plan) {
  const before = (await snapshot(p)).revision;
  await p.locator('#import-file').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(plan)) });
  await confirm(p); await saved(p, before);
}
async function object(p, name, type = 'person') {
  await p.locator('[data-action=object]:not([data-id])').click();
  await p.locator('#edit-form [name=name]').fill(name); await p.locator('[name=objectType]').selectOption(type); await submit(p);
}
async function item(p, { kind = 'expense', name = 'Synthetic expense', amount = '', repeat = 'monthly', start = '2026-11', end = '2027-12', status = 'confirmed' } = {}) {
  await p.locator(`[data-action=item][data-kind="${kind}"]:not([data-object])`).first().click();
  const f = p.locator('#edit-form'); await f.locator('[name=name]').fill(name); await f.locator('[name=description]').fill('Synthetic details');
  await f.locator('[name=amount]').fill(amount); await f.locator('[name=status]').selectOption(status); await f.locator('[name=repeat]').selectOption(repeat);
  await f.locator('[name=start]').fill(start); await f.locator('[name=end]').fill(end); return f;
}
async function put(p, plan) {
  return p.evaluate(async plan => {
    const state = await (await fetch('/api/plan')).json(), session = await (await fetch('/api/session')).json();
    return (await fetch('/api/plan', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf }, body: JSON.stringify({ expectedRevision: state.revision, plan, operation: 'replace', confirmed: true }) })).status;
  }, plan);
}
try {
  [{ base }] = await once(child, 'message'); assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/); assert.ok(!['3080', '3081'].includes(new URL(base).port));
  browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || undefined, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  page = await context.newPage(); watch(page);
  await check('private login, five widths, no implicit sample or save', async () => {
    await page.goto(base); await visible(page, '#login-form');
    for (const width of [320, 360, 390, 768, 1440]) { await page.setViewportSize({ width, height: 1000 }); await overflow(page); await axe(page, `login-${width}`); }
    await page.locator('[name=passphrase]').fill('wrong-synthetic'); await page.locator('#login-form button').click(); await visible(page, '#login-error');
    await page.locator('[name=passphrase]').fill(PASSPHRASE); await page.locator('#login-form button').click(); await visible(page, '#application');
    assert.equal((await snapshot(page)).plan, null); assert.equal(await page.locator('.calendar-table thead th').count(), 15);
  });
  await check('explicit setup, default 14-month chronology, safe invalid window', async () => {
    await page.locator('#settings-button').click(); await axe(page, 'setup');
    await page.locator('[name=endMonth]').fill('2026-10'); await page.locator('#edit-form button[type=submit]').click(); await visible(page, '#form-error');
    assert.equal((await snapshot(page)).plan, null);
    await page.locator('[name=endMonth]').fill('2027-12'); await submit(page);
    assert.equal((await snapshot(page)).plan.version, 3);
    await page.locator('[data-action=cards]').click(); assert.deepEqual(await page.locator('.year-heading').allTextContents(), ['2026', '2027']);
    assert.equal(await page.locator('.month-card').count(), 14);
  });
  await check('shared typed objects, equal names disambiguated, literal hostile text', async () => {
    await nav(page, 'expense'); await object(page, '<b>Family</b>', 'group'); await object(page, 'Synthetic person', 'person'); await object(page, 'Synthetic person', 'category');
    const state = await snapshot(page); assert.equal(state.plan.objects.length, 3); assert.notEqual(state.plan.objects[1].id, state.plan.objects[2].id);
    assert.equal(await page.locator('.object-title b').count(), 0); await axe(page, 'expense-objects');
    await nav(page, 'income'); assert.equal(await page.locator('.object-card').count(), 0);
  });
  await check('amount-later expense, zero distinct, Income visibility including tentative out-of-month', async () => {
    await nav(page, 'expense'); await item(page); await axe(page, 'planned-entry'); await submit(page);
    assert.equal((await snapshot(page)).plan.items[0].amount, null);
    await nav(page, 'calendar'); assert.ok((await page.locator('.stat-value').nth(2).textContent()).includes('chưa biết'));
    await nav(page, 'income'); assert.equal(await page.locator('.object-card').count(), 0);
    const f = await item(page, { kind: 'income', name: 'Future tentative', amount: '', start: '2027-03', end: '2027-03', repeat: 'once', status: 'tentative' });
    assert.equal(await f.locator('[name=objectId] option').count(), 3); await submit(page);
    assert.equal(await page.locator('.object-card').count(), 1);
    await page.locator('.detail-row [data-action=item]').first().click(); await page.locator('[name=amount]').fill('0'); await submit(page, true);
    assert.equal((await snapshot(page)).plan.items.find(i => i.type === 'income').amountChanges[0].amount, 0);
  });
  await check('shared rename and safe referenced-object deletion; last income hides only card', async () => {
    await page.locator('.object-card [data-action=object]').click(); await page.locator('[name=name]').fill('Renamed shared'); await submit(page);
    await nav(page, 'expense'); assert.ok((await page.locator('.object-title').allTextContents()).includes('Renamed shared'));
    await page.locator('.object-card').first().locator('[data-action=delete-object]').click(); await visible(page, '#toast'); assert.equal((await snapshot(page)).plan.objects.length, 3);
    await nav(page, 'income'); await page.locator('[data-action=delete-item]').click(); await cancelConfirm(page); assert.equal(await page.locator('.object-card').count(), 1);
    const before = (await snapshot(page)).revision; await page.locator('[data-action=delete-item]').click(); await confirm(page); await saved(page, before);
    assert.equal(await page.locator('.object-card').count(), 0); assert.equal((await snapshot(page)).plan.objects.length, 3);
  });
  await check('shared parser previews, invalid preservation and saved editor no rescaling', async () => {
    await nav(page, 'expense'); await page.locator('.detail-row [data-action=item]').first().click();
    for (const [input, output] of [['5', '5.000'], ['500', '500.000'], ['5000', '5.000.000'], ['5M', '5.000.000'], ['5tr', '5.000.000'], ['5 trăm', '500.000'], ['5 ngàn', '5.000'], ['5,000', '5.000.000']]) {
      await page.locator('[name=amount]').fill(input); assert.ok((await page.locator('.amount-preview').textContent()).includes(output), input);
    }
    const before = (await snapshot(page)).revision;
    await page.locator('[name=amount]').fill('1e3'); await page.locator('#edit-form button[type=submit]').click(); assert.equal((await snapshot(page)).revision, before);
    await page.locator('[name=amount]').fill('5M'); await submit(page, true);
    await page.locator('.detail-row [data-action=item]').first().click(); assert.equal(await page.locator('[name=amount]').inputValue(), '5000000 VND');
    await submit(page); assert.equal((await snapshot(page)).plan.items[0].amountChanges[0].amount, 5000000);
  });
  await check('forward-only estimates from January calendar cell; cancel preserves history', async () => {
    await nav(page, 'calendar'); await page.locator('[data-action=table]').click();
    await page.locator('.calendar-table [data-month="2027-01"]').click(); await page.locator('[name=amount]').fill('10');
    await page.locator('#edit-form button[type=submit]').click(); await cancelConfirm(page); await close(page);
    assert.equal((await snapshot(page)).plan.items[0].amountChanges.length, 1);
    await page.locator('.calendar-table [data-month="2027-01"]').click(); await page.locator('[name=amount]').fill('10'); await submit(page, true);
    const state = await snapshot(page), result = forecast(state.plan);
    assert.equal(result[0].expense, 5000000); assert.equal(result[1].expense, 5000000); assert.equal(result[2].expense, 10000);
  });
  await check('full schedules independent of forecast, outside-window editing and safe window changes', async () => {
    const original = (await snapshot(page)).plan;
    await nav(page, 'expense');
    await item(page, { name: 'Synthetic long annual', amount: '10 VND', repeat: 'yearly', start: '2027-10', end: '2037-10' }); await submit(page);
    let state = await snapshot(page);
    assert.equal(state.plan.endMonth, '2027-12');
    assert.equal(state.plan.items.find(i => i.name === 'Synthetic long annual').recurrence.end, '2037-10');
    assert.deepEqual(forecast(state.plan).filter(m => m.entries.some(i => i.name === 'Synthetic long annual')).map(m => m.month), ['2027-10']);
    await item(page, { name: 'Synthetic past once', amount: '0', repeat: 'once', start: '2020-01', end: '2020-01' }); await submit(page);
    await nav(page, 'income');
    await item(page, { kind: 'income', name: 'Synthetic future unknown', amount: '', repeat: 'once', start: '2040-01', end: '2040-01' }); await submit(page);
    assert.equal(await page.locator('.object-card').count(), 1);
    const future = page.locator('.detail-row').filter({ hasText: 'Synthetic future unknown' });
    assert.ok((await future.textContent()).includes('Ngoài kỳ dự báo'));
    await future.locator('[data-action=item]').first().click();
    assert.equal(await page.locator('[name=effectiveMonth]').inputValue(), '2040-01');
    await page.locator('[name=amount]').fill('0'); await submit(page, true);
    state = await snapshot(page); const fullItems = structuredClone(state.plan.items);
    assert.ok(forecast(state.plan).every(m => m.incomeMissing === 0));
    await page.locator('#settings-button').click(); await page.locator('[name=startMonth]').fill('2028-01'); await page.locator('[name=endMonth]').fill('2028-06'); await submit(page, true);
    state = await snapshot(page); assert.deepEqual(state.plan.items, fullItems); assert.ok(forecast(state.plan).every(m => m.entries.length === 0));
    await nav(page, 'expense');
    const past = page.locator('.detail-row').filter({ hasText: 'Synthetic past once' });
    await past.locator('[data-action=item]').first().click(); assert.equal(await page.locator('[name=effectiveMonth]').inputValue(), '2020-01'); await submit(page);
    const long = page.locator('.detail-row').filter({ hasText: 'Synthetic long annual' });
    await long.locator('[data-action=item]').first().click(); assert.equal(await page.locator('[name=effectiveMonth]').inputValue(), '2028-10'); await close(page);
    await page.reload(); await visible(page, '#application'); assert.deepEqual((await snapshot(page)).plan.items, fullItems);
    await importPlan(page, original);
  });
  await check('cash account dates/required amounts, same-day correction confirmation', async () => {
    await nav(page, 'accounts'); await page.locator('[data-action=account]:not([data-id])').click(); await page.locator('[name=name]').fill('Synthetic A'); await submit(page);
    await page.locator('[data-action=snapshot]').first().click(); await axe(page, 'cash-snapshot');
    assert.equal(await page.locator('[name=amount]').getAttribute('required'), '');
    await page.locator('[name=date]').fill('2025-11-01'); await page.locator('[name=amount]').fill('3'); await submit(page);
    assert.equal((await snapshot(page)).plan.snapshots[0].amount, 3000);
    await page.locator('.history-table [data-action=snapshot]').click(); await page.locator('[name=amount]').fill('0'); await submit(page, true);
    assert.equal((await snapshot(page)).plan.snapshots[0].amount, 0);
  });
  await check('cash/debt pooled worked example agrees with cards/table, dates and isolated debt', async () => {
    const p = blankPlan('2025-11', '2026-01');
    p.objects = [{ id: 'family', type: 'group', name: 'Synthetic family' }]; p.accounts = [{ id: 'a', name: 'Synthetic A' }, { id: 'b', name: 'Synthetic B' }];
    p.snapshots = [{ id: 'an', accountId: 'a', date: '2025-11-01', amount: 3000 }, { id: 'bn', accountId: 'b', date: '2025-11-01', amount: 7000 }, { id: 'bd', accountId: 'b', date: '2025-12-05', amount: 6000 }];
    p.items = [{ id: 'cost', objectId: 'family', name: 'Synthetic cost', description: '', type: 'expense', status: 'confirmed', amount: 2000, recurrence: { kind: 'interval', anchor: '2025-11', end: '2026-01', everyMonths: 1 }, amountChanges: [] }];
    await importPlan(page, validatePlan(p)); await nav(page, 'calendar'); await page.locator('[data-action=cards]').click();
    assert.deepEqual(await page.locator('.month-card .closing').allTextContents(), ['8.000 ₫', '7.000 ₫', '5.000 ₫']);
    await page.locator('[data-action=table]').click(); assert.ok((await page.locator('.calendar-table').textContent()).includes('2025-11-01 · Mốc cũ'));
    await nav(page, 'debts'); await page.locator('[data-action=account]:not([data-id])').click(); await page.locator('[name=name]').fill('Synthetic payable'); await submit(page);
    await page.locator('[data-action=snapshot]').click(); await page.locator('[name=date]').fill('2025-11-01'); await page.locator('[name=amount]').fill('9'); await submit(page);
    assert.deepEqual(forecast((await snapshot(page)).plan).map(m => m.closing), [8000, 7000, 5000]);
  });
  await check('manual debt repayment/collection ordinary plans, no assumed amount or balance mutation', async () => {
    await page.locator('[data-action=debt-plan]').click(); assert.equal(await page.locator('[name=amount]').inputValue(), '');
    await page.locator('[name=amount]').fill('1'); await page.locator('[name=start]').fill('2025-12'); await submit(page);
    const state = await snapshot(page); assert.equal(state.plan.debtSnapshots[0].amount, 9000); assert.equal(forecast(state.plan)[1].closing, 6000);
    await page.locator('[data-action=account]:not([data-id])').click(); await page.locator('[name=name]').fill('Synthetic receivable'); await page.locator('[name=direction]').selectOption('receivable'); await submit(page);
    await page.locator('[data-action=debt-plan]').last().click(); await page.locator('[name=amount]').fill('400 VND'); await page.locator('[name=start]').fill('2025-12'); await submit(page);
    assert.equal(forecast((await snapshot(page)).plan)[1].closing, 6400);
  });
  await check('debt display matches independently worked multi-account totals by selected month', async () => {
    const original = (await snapshot(page)).plan, fixture = validatePlan(debtFixture());
    await importPlan(page, fixture); await nav(page, 'debts');
    const before = await snapshot(page), cashBefore = forecast(before.plan);
    const expected = [
      ['2025-11', '12.000 ₫ + ? (chưa biết)', '2.500 ₫ + ? (chưa biết)', ['8.000 ₫', '4.000 ₫', 'Chưa biết', '2.500 ₫', 'Chưa biết']],
      ['2025-12', '7.000 ₫ + ? (chưa biết)', '3.500 ₫', ['7.000 ₫', '0 ₫', 'Chưa biết', '2.000 ₫', '1.500 ₫']],
      ['2026-01', '7.000 ₫ + ? (chưa biết)', '3.500 ₫', ['7.000 ₫', '0 ₫', 'Chưa biết', '2.000 ₫', '1.500 ₫']]
    ];
    for (const [month, payable, receivable, accounts] of expected) {
      await page.locator('#view-month').selectOption(month);
      assert.deepEqual((await page.locator('.summary-grid .stat-value').allTextContents()).slice(0, 2), [payable, receivable]);
      assert.deepEqual(await page.locator('.account-card .account-balance').allTextContents(), accounts);
    }
    assert.deepEqual(await snapshot(page), before); // Merely viewing a month is not a save.
    await page.locator('#view-month').selectOption('2025-12'); await axe(page, 'debt-worked-totals');
    await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: path.join(artifacts, 'debt-worked-totals.png'), fullPage: true });
    await page.locator('.history-table [data-action=snapshot][data-date="2025-11-20"]').click();
    await page.locator('[name=amount]').fill('0'); await submit(page, true);
    assert.equal(await page.locator('.summary-grid .stat-value').first().textContent(), '7.000 ₫ + ? (chưa biết)');
    await page.locator('#view-month').selectOption('2025-11');
    assert.equal(await page.locator('.summary-grid .stat-value').first().textContent(), '4.000 ₫ + ? (chưa biết)');
    const corrected = await snapshot(page); assert.equal(corrected.plan.debtSnapshots.length, fixture.debtSnapshots.length);
    assert.deepEqual(forecast(corrected.plan), cashBefore);
    await importPlan(page, original);
  });
  await check('lossless versioned exports and invalid/cancelled import preserves state', async () => {
    const state = await snapshot(page), downloadEvent = page.waitForEvent('download'); await page.locator('#export-button').click();
    const file = await downloadEvent; await file.saveAs(path.join(artifacts, 'synthetic-export.json'));
    assert.deepEqual(JSON.parse(await readFile(path.join(artifacts, 'synthetic-export.json'), 'utf8')), state.plan);
    const exported = await page.evaluate(async () => (await fetch('/api/export')).json()); assert.deepEqual(exported, state.plan);
    await page.locator('#import-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{broken') }); await visible(page, '#toast'); assert.deepEqual(await snapshot(page), state);
    await page.locator('#import-file').setInputFiles({ name: 'cancel.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(blankPlan())) }); await cancelConfirm(page); assert.deepEqual(await snapshot(page), state);
    await importPlan(page, exported); assert.deepEqual((await snapshot(page)).plan, exported);
  });
  await check('legacy migration retains original actuals and discloses exclusion before confirm', async () => {
    const old = legacyDemo();
    await page.locator('#import-file').setInputFiles({ name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(old)) });
    await visible(page, '#editor'); assert.ok((await page.locator('#editor').textContent()).includes('KHÔNG tham gia dự báo mới'));
    assert.equal(await page.locator('[name=ack]').isDisabled(), true); const before = await snapshot(page);
    const event = page.waitForEvent('download'); await page.locator('[data-action=download-original]').click(); await (await event).saveAs(path.join(artifacts, 'synthetic-original-v2.json'));
    assert.deepEqual(JSON.parse(await readFile(path.join(artifacts, 'synthetic-original-v2.json'), 'utf8')), old);
    await page.locator('[name=ack]').check(); await submit(page, true);
    const state = await snapshot(page); assert.equal(state.plan.startMonth, '2027-01'); assert.equal(state.plan.items[0].id, old.items[0].id); assert.equal('actuals' in state.plan.items[0], false); assert.equal(state.plan.snapshots.length, 0); assert.ok(state.revision > before.revision);
  });
  await check('revision conflicts retain unsaved form/export; explicit reload and reapply', async () => {
    await importPlan(page, blankPlan()); await nav(page, 'expense'); await object(page, 'Conflict object');
    const other = await context.newPage(); watch(other); await other.goto(base); await visible(other, '#application');
    const state = await snapshot(other); state.plan.name = 'Other browser'; assert.equal(await put(other, state.plan), 200);
    await item(page, { name: 'Unsaved conflict', amount: '5' }); await page.locator('#edit-form button[type=submit]').click();
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.startsWith('CHƯA LƯU'));
    assert.equal(await page.locator('[name=name]').inputValue(), 'Unsaved conflict');
    await close(page); const downloadEvent = page.waitForEvent('download'); await page.locator('#export-button').click(); assert.ok((await downloadEvent).suggestedFilename().includes('UNSAVED'));
    await page.locator('#reconcile-button').click(); assert.equal(await page.locator('#retry-button').isVisible(), false);
    await page.locator('#reload-button').click(); await confirm(page); await page.waitForFunction(() => document.querySelector('#plan-title').textContent.startsWith('Other browser'));
    await item(page, { name: 'Reapplied manually', amount: '5' }); await submit(page); await other.close();
  });
  await check('lost acknowledgement reconciles, outage retry gated by reread', async () => {
    let lose = true;
    await page.route('**/api/plan', async route => { if (route.request().method() === 'PUT' && lose) { lose = false; await route.fetch(); await route.abort(); } else await route.continue(); });
    await item(page, { name: 'Lost ack', amount: '0' }); await page.locator('#edit-form button[type=submit]').click(); await page.waitForFunction(() => document.querySelector('#save-status').textContent.startsWith('CHƯA LƯU')); await close(page);
    await page.locator('#reconcile-button').click(); await page.waitForFunction(() => document.querySelector('#save-status').textContent.startsWith('Đã lưu'));
    await page.unroute('**/api/plan');
    child.send({ action: 'failure', stage: 'before-write' }); await once(child, 'message');
    await item(page, { name: 'Outage draft', amount: '1' }); await page.locator('#edit-form button[type=submit]').click(); await page.waitForFunction(() => document.querySelector('#save-status').textContent.startsWith('CHƯA LƯU')); await close(page);
    assert.equal(await page.locator('#retry-button').isVisible(), false); await page.locator('#reconcile-button').click(); await visible(page, '#retry-button');
    child.send({ action: 'failure', stage: null }); await once(child, 'message');
    const before = (await snapshot(page)).revision; await page.locator('#retry-button').click(); await saved(page, before);
  });
  await check('all five workspaces and dialogs at five widths: overflow, axe, keyboard, screenshots', async () => {
    const populated = (await snapshot(page)).plan;
    populated.items.push({ ...structuredClone(populated.items[0]), id: 'layout-unknown', type: 'income', name: 'Synthetic unknown', amount: null, amountChanges: [] });
    populated.accounts = [{ id: 'layout-cash', name: 'Synthetic cash '.repeat(5).trim() }];
    populated.snapshots = [{ id: 'layout-cash-snap', accountId: 'layout-cash', date: '2025-11-01', amount: 1000000000000 }];
    populated.debtAccounts = [{ id: 'layout-debt', name: 'Synthetic debt '.repeat(5).trim(), direction: 'payable' }];
    populated.debtSnapshots = [{ id: 'layout-debt-snap', accountId: 'layout-debt', date: '2025-11-01', amount: 1000000000000 }];
    await importPlan(page, populated);
    for (const width of [320, 360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const name of ['calendar', 'expense', 'income', 'accounts', 'debts']) { await nav(page, name); await overflow(page); await axe(page, `${name}-${width}`); }
      await nav(page, 'expense'); await page.locator('[data-action=object]:not([data-id])').click(); await overflow(page); await axe(page, `object-${width}`); await page.keyboard.press('Escape');
      assert.equal(await page.locator('[data-action=object]:not([data-id])').evaluate(e => e === document.activeElement), true);
      await item(page, { name: 'Not saved keyboard', amount: '5' }); await overflow(page); await axe(page, `plan-${width}`); await page.keyboard.press('Escape');
      await nav(page, 'accounts'); await page.locator('[data-action=account]:not([data-id])').click(); await overflow(page); await axe(page, `account-${width}`); await close(page);
      await page.locator('[data-action=snapshot]').first().click(); await overflow(page); await axe(page, `cash-snapshot-${width}`); await close(page);
      await nav(page, 'debts'); await page.locator('[data-action=account]:not([data-id])').click(); await overflow(page); await axe(page, `debt-account-${width}`); await close(page);
      await page.locator('[data-action=snapshot]').first().click(); await overflow(page); await axe(page, `debt-snapshot-${width}`); await close(page);
    }
    await page.setViewportSize({ width: 1440, height: 1000 }); await nav(page, 'calendar'); await page.locator('[data-action=table]').click(); await page.screenshot({ path: path.join(artifacts, 'desktop-calendar.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 1000 }); await page.locator('[data-action=cards]').click(); await page.screenshot({ path: path.join(artifacts, 'mobile-calendar.png'), fullPage: true });
    await page.locator('[data-action=month]').first().click(); await overflow(page); await axe(page, 'month-detail-mobile'); await page.screenshot({ path: path.join(artifacts, 'mobile-month.png'), fullPage: true }); await close(page);
    await nav(page, 'expense'); await page.screenshot({ path: path.join(artifacts, 'mobile-expenses.png'), fullPage: true });
    await page.locator('#help-button').click(); await axe(page, 'help'); await close(page);
  });
  await check('collapse overview/details in all requested views: keyboard, nested state, totals and zero saves', async () => {
    const before = await snapshot(page), writes = [];
    const observe = r => { if (r.method() === 'PUT') writes.push(r.url()); }; page.on('request', observe);
    try {
      for (const width of [320, 360, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await nav(page, 'expense'); await page.locator('[data-collapse-all=open]').click();
        let toggle = page.locator('.object-title [data-collapse]').first();
        const total = await page.locator('.object-card .object-total').first().textContent();
        await toggle.focus(); await page.keyboard.press('Enter');
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        assert.equal(await toggle.evaluate(e => e === document.activeElement), true);
        assert.equal(await page.locator('.detail-row').first().isVisible(), false);
        assert.equal(await page.locator('.object-card .object-total').first().isVisible(), true);
        assert.equal(await page.locator('.object-card .object-total').first().textContent(), total);
        await nav(page, 'income'); await nav(page, 'expense'); assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        await page.locator('[data-collapse-all=close]').click(); await overflow(page); await axe(page, `expense-collapsed-${width}`);
        if ([390, 1440].includes(width)) { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: path.join(artifacts, `collapsed-expenses-${width}.png`), fullPage: true }); }
        await page.locator('[data-collapse-all=open]').click(); assert.equal(await page.locator('.detail-row').first().isVisible(), true);
        await nav(page, 'income'); await page.locator('[data-collapse-all=close]').click();
        assert.equal(await page.locator('.object-card .object-total').first().isVisible(), true);
        assert.ok((await page.locator('.object-card .object-total').first().textContent()).includes('chưa biết'));
        await overflow(page); await axe(page, `income-collapsed-${width}`); await page.locator('[data-collapse-all=open]').click();
        await nav(page, 'calendar'); await page.locator('[data-action=table]').click(); await page.locator('[data-collapse-all=open]').click();
        const totals = await page.locator('.calendar-table .total-row, .calendar-table .balance-row').allTextContents();
        const group = page.locator('[data-collapse^="calendar:expense:"]').first();
        await page.locator('.table-scroll').evaluate(e => { e.scrollLeft = 200; });
        await group.evaluate(e => e.focus({ preventScroll: true }));
        const left = await page.locator('.table-scroll').evaluate(e => e.scrollLeft);
        await page.keyboard.press('Space'); assert.equal(await group.getAttribute('aria-expanded'), 'false');
        assert.equal(await group.evaluate(e => e === document.activeElement), true);
        assert.equal(await page.locator('.table-scroll').evaluate(e => e.scrollLeft), left);
        assert.equal(await group.evaluate(e => e.getAttribute('aria-controls').split(' ').every(id => document.getElementById(id)?.hidden)), true);
        await page.locator('[data-collapse="section:expense"]').click(); assert.equal(await page.locator('#calendar-expense-groups').isVisible(), false);
        assert.equal(await page.getByText('Tổng chi dự kiến', { exact: true }).isVisible(), true);
        await page.locator('[data-collapse="section:expense"]').click(); assert.equal(await group.getAttribute('aria-expanded'), 'false');
        await overflow(page); await axe(page, `calendar-group-collapsed-${width}`);
        await page.locator('[data-collapse-all=close]').click();
        assert.equal(await page.locator('#calendar-income-groups').isVisible(), false);
        assert.equal(await page.locator('#calendar-expense-groups').isVisible(), false);
        assert.deepEqual(await page.locator('.calendar-table .total-row, .calendar-table .balance-row').allTextContents(), totals);
        await overflow(page); await axe(page, `calendar-sections-collapsed-${width}`);
        if ([390, 1440].includes(width)) { await page.locator('.table-scroll').evaluate(e => { e.scrollLeft = 0; }); await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: path.join(artifacts, `collapsed-calendar-${width}.png`), fullPage: true }); }
        await page.locator('[data-collapse-all=open]').click(); assert.equal(await group.getAttribute('aria-expanded'), 'true');
        for (const view of ['accounts', 'debts']) {
          await nav(page, view); const summary = await page.locator('.summary-grid').textContent();
          toggle = page.locator(`[data-collapse="history:${view}"]`); await toggle.focus(); await page.keyboard.press('Enter');
          assert.equal(await toggle.getAttribute('aria-expanded'), 'false'); assert.equal(await page.locator('.history-table').isVisible(), false);
          assert.equal(await page.locator('.account-card').first().isVisible(), true); assert.equal(await page.locator('.summary-grid').textContent(), summary);
          await overflow(page); await axe(page, `${view}-history-collapsed-${width}`);
          await page.locator('[data-collapse-all=open]').click(); assert.equal(await page.locator('.history-table').isVisible(), true);
        }
      }
      assert.deepEqual(writes, []); assert.deepEqual(await snapshot(page), before);
      assert.equal(await page.locator('[data-collapse]').evaluateAll(elements => elements.every(e => e.getAttribute('aria-controls').split(' ').every(id => !!document.getElementById(id)))), true);
    } finally { page.off('request', observe); }
  });
  await check('fresh browser reads persisted state; logout denies finance; no active actual fields', async () => {
    const state = await snapshot(page), fresh = await browser.newContext(); const p = await fresh.newPage(); watch(p); await login(p); assert.deepEqual((await snapshot(p)).plan, state.plan);
    assert.equal(await p.locator('[name=actual], [data-actual]').count(), 0);
    await p.locator('#logout-button').click(); await confirm(p); await visible(p, '#login-form'); assert.equal(await p.evaluate(async () => (await fetch('/api/plan')).status), 401); await fresh.close();
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    const allowed = { '/api/session': [401], '/api/login': [401], '/api/plan': [401, 409, 503] };
    assert.deepEqual(responseLedger.filter(r => !allowed[r.path]?.includes(r.status)), []);
    assert.deepEqual(failedRequests.filter(r => r.path !== '/api/plan' || !r.error.includes('ERR_FAILED')), []);
  });
  await writeFile(path.join(artifacts, 'report.json'), JSON.stringify({ groups: results, scans, errors, external, responseLedger, failedRequests, browser: browser.version(), humanUAT: 'Not run', productionDeployment: 'Not performed' }, null, 2));
  console.log(`${results.length} groups; ${scans.length} axe scans; no detected violations, page errors or external requests. Human UAT not run.`);
} catch (error) {
  if (page) await page.screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: true }).catch(() => {});
  await writeFile(path.join(artifacts, 'failure.json'), JSON.stringify({ message: error.message, stack: error.stack, results, scans, errors, external }, null, 2));
  throw error;
} finally {
  clearTimeout(timeout); await browser?.close();
  if (child.connected) { child.send({ action: 'close' }); await once(child, 'exit'); }
}
