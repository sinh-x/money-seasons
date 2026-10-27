// Run against an already-started app. Only synthetic data is used.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const base = process.env.BASE_URL || 'http://127.0.0.1:3080';
const artifacts = process.env.BROWSER_ARTIFACTS || '/tmp/money-seasons-check';
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
const externalRequests = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('request', request => { if (new URL(request.url()).origin !== new URL(base).origin && !request.url().startsWith('data:')) externalRequests.push(request.url()); });
const stored = () => page.evaluate(() => localStorage.getItem('money-seasons.plan.v1'));
const closeTop = async selector => page.locator(`${selector} [data-close]`).first().click();
const submit = async form => page.locator(`${form} button[type="submit"], ${form} button:not([type])`).last().click();
const upload = async value => page.locator('#import-file').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)) });
const snapshot = async (name, fullPage = true) => page.screenshot({ path: `${artifacts}/${name}.png`, fullPage });
let checks = 0;
const ok = name => { checks++; console.log(`PASS ${name}`); };

try {
  await page.goto(base);
  await page.waitForSelector('.month-card');
  assert.equal(await page.locator('.month-card').count(), 12);
  assert.match(await page.locator('#summary').innerText(), /35\.500\.000/);
  await snapshot('desktop');
  ok('Vietnamese demo, 12 months, worked year-end balance');

  await page.locator('[data-month="4"]').first().click();
  assert.match(await page.locator('#month-content').innerText(), /Bảo hiểm hằng năm/);
  assert.match(await page.locator('#month-content').innerText(), /-1\.500\.000/);
  await snapshot('month-detail', false);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#month-dialog').evaluate(el => el.open), false);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.month), '4');
  ok('month detail, shortage explanation, Escape and focus return');

  await page.locator('#include-tentative').check();
  assert.match(await page.locator('.month-card[data-month="7"]').innerText(), /-1,5/);
  await page.locator('#include-tentative').uncheck();
  assert.match(await page.locator('.month-card[data-month="7"]').innerText(), /16,5/);
  ok('tentative assumption changes forecast and reverses cleanly');

  await page.locator('[data-month="9"]').first().click();
  await page.locator('[data-actual="tuition"]').click();
  await page.locator('#actual-form [name="actual"]').fill('40000000');
  await submit('#actual-form');
  assert.match(await page.locator('#month-content').innerText(), /40\.000\.000/);
  assert.match(await page.locator('#month-content').innerText(), /-11\.500\.000/);
  const actualPlan = JSON.parse(await stored());
  assert.equal(actualPlan.items.find(i => i.id === 'tuition').amount, 36_000_000);
  assert.equal(actualPlan.items.find(i => i.id === 'tuition').actuals[9], 40_000_000);
  await closeTop('#month-dialog');
  await page.reload();
  assert.match(await page.locator('#summary').innerText(), /31\.500\.000/);
  ok('actual substitution, original plan retained, carry-forward and reload');

  await page.locator('#add-button').click();
  await page.locator('#item-form [name="name"]').fill('Mẫu kiểm tra lặp');
  await page.locator('#item-form [name="repeat"]').selectOption('monthly');
  await page.locator('#item-form [name="start"]').selectOption('5');
  await page.locator('#item-form [name="end"]').selectOption('3');
  await submit('#item-form');
  assert.match(await page.locator('#item-error').innerText(), /Tháng kết thúc/);
  await page.locator('#item-form [name="end"]').selectOption('7');
  await page.locator('#item-form [name="amount"]').fill('0');
  await submit('#item-form');
  const withZero = JSON.parse(await stored());
  assert.equal(withZero.items.at(-1).amount, 0);
  assert.equal(withZero.items.at(-1).end, 7);
  ok('add recurring item, invalid range rejected, zero preserved');

  const downloadEvent = page.waitForEvent('download');
  await page.locator('#export-button').click();
  const download = await downloadEvent;
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.deepEqual(exported, withZero);
  ok('export contains exact current plan');

  const beforeImport = await stored();
  await upload('{broken');
  assert.match(await page.locator('#toast').innerText(), /JSON bị lỗi/);
  assert.equal(await stored(), beforeImport);
  await upload({ ...exported, version: 99 });
  assert.equal(await stored(), beforeImport);
  assert.equal(await page.locator('#confirm-dialog').evaluate(el => el.open), false);
  const imported = { ...exported, name: 'Kế hoạch được nhập', openingCash: 0 };
  await upload(imported);
  await closeTop('#confirm-dialog');
  assert.equal(await stored(), beforeImport);
  await upload(imported);
  await submit('#confirm-form');
  assert.equal(JSON.parse(await stored()).name, imported.name);
  assert.equal(await page.locator('#plan-title').innerText(), imported.name);
  ok('malformed/future imports rejected; replacement cancel and confirm');

  await page.locator('#new-plan').click();
  await closeTop('#setup-dialog');
  assert.equal(JSON.parse(await stored()).name, imported.name);
  await page.locator('#new-plan').click();
  await page.locator('#setup-form [name="name"]').fill('Kế hoạch trống');
  await page.locator('#setup-form [name="openingCash"]').fill('');
  await submit('#setup-form');
  const empty = JSON.parse(await stored());
  assert.equal(empty.openingCash, null);
  assert.equal(empty.items.length, 0);
  assert.equal(empty.demo, false);
  assert.equal(await page.locator('#demo-banner').isVisible(), false);
  assert.equal(await page.locator('.incomplete-label').count(), 12);
  ok('short setup, blank plan, unknown opening cash and sample replacement warning');

  await page.locator('#help-button').click();
  await page.locator('#restore-demo').click();
  await submit('#confirm-form');
  await page.waitForFunction(() => !document.querySelector('#help-dialog').open);
  assert.equal(JSON.parse(await stored()).demo, true);
  await page.locator('[data-view="items"]').click();
  assert.equal(await page.locator('.plan-item').count(), 10);
  await page.locator('[data-edit="living"]').click();
  await page.locator('#delete-item').click();
  await closeTop('#confirm-dialog');
  assert.equal(JSON.parse(await stored()).items.length, 10);
  await page.locator('#delete-item').click();
  await submit('#confirm-form');
  assert.equal(JSON.parse(await stored()).items.length, 9);
  assert.equal(JSON.parse(await stored()).items.some(i => i.id === 'living'), false);
  ok('restore sample, list navigation, delete cancel and confirmed full-series removal');

  // Restore for visual/accessibility checks.
  await upload(exported);
  await submit('#confirm-form');
  await page.locator('[data-view="year"]').click();
  for (const width of [320, 360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow at ${width}`);
    if (width === 390) {
      await snapshot('mobile');
      await page.locator('[data-month="9"]').first().click();
      assert.equal(await page.locator('#month-dialog').evaluate(el => el.scrollWidth > el.clientWidth), false);
      await snapshot('mobile-detail', false);
      await closeTop('#month-dialog');
    }
  }
  ok('responsive widths 320–1440 and mobile month dialog without horizontal overflow');

  async function audit(name) {
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    if (axe.violations.length) console.log(JSON.stringify(axe.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), null, 2));
    assert.equal(axe.violations.length, 0, `accessibility violations in ${name}`);
  }
  await audit('overview');
  for (const [name, trigger, dialog] of [['setup', '#settings-button', '#setup-dialog'], ['item', '#add-button', '#item-dialog'], ['month', '[data-month="9"]', '#month-dialog'], ['help', '#help-button', '#help-dialog']]) {
    await page.locator(trigger).first().click();
    await audit(name);
    if (name === 'month') {
      await page.locator('[data-actual="tuition"]').click();
      await audit('actual');
      await closeTop('#actual-dialog');
    }
    await closeTop(dialog);
  }
  await page.locator('[data-view="items"]').click();
  await audit('item list');
  ok('automated WCAG A/AA scans of overview, list and five dialogs');

  const hostile = structuredClone(exported);
  hostile.items.at(-1).name = '<img src=x onerror="window.__unsafe=1">';
  hostile.items.at(-1).id = 'x" data-injected="yes';
  await upload(hostile);
  await submit('#confirm-form');
  assert.equal(await page.locator('.plan-item img, [data-injected]').count(), 0);
  assert.equal(await page.evaluate(() => window.__unsafe), undefined);
  assert.match(await page.locator('.plan-item').last().innerText(), /<img/);
  await upload(exported);
  await submit('#confirm-form');
  await page.locator('[data-view="year"]').click();
  ok('imported names and identifiers treated as text, not executable markup');

  // Separate contexts avoid affecting the main synthetic walkthrough.
  const failureContext = await browser.newContext();
  await failureContext.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Synthetic quota error', 'QuotaExceededError'); }; });
  const failurePage = await failureContext.newPage();
  await failurePage.goto(base);
  await failurePage.locator('#settings-button').click();
  await failurePage.locator('#setup-form [name="name"]').fill('Chưa lưu được');
  await failurePage.locator('#setup-form button[type="submit"]').click();
  assert.match(await failurePage.locator('#storage-warning').innerText(), /Không lưu được/);
  assert.equal(await failurePage.locator('#plan-title').innerText(), 'Chưa lưu được');
  assert.equal(await failurePage.evaluate(() => localStorage.getItem('money-seasons.plan.v1')), null);
  await failureContext.close();
  ok('storage failure shown honestly; in-memory state remains exportable');

  const badContext = await browser.newContext();
  await badContext.addInitScript(() => localStorage.setItem('money-seasons.plan.v1', '{invalid'));
  const badPage = await badContext.newPage();
  await badPage.goto(base);
  assert.equal(await badPage.locator('.month-card').count(), 12);
  assert.match(await badPage.locator('#storage-warning').innerText(), /Không đọc được/);
  assert.equal(await badPage.evaluate(() => localStorage.getItem('money-seasons.plan.v1')), '{invalid');
  await badContext.close();
  ok('corrupted saved data not overwritten on startup');

  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  ok('no browser errors or external requests');
  console.log(`\n${checks} browser checks passed. Screenshots: ${artifacts}`);
} finally {
  await browser.close();
}
