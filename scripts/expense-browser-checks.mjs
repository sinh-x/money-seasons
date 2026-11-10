import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { expenseFixture } from './expense-fixture.mjs';
import { forecast, plannedAmount } from '../public/model.js';

export async function expenseBrowserChecks({ page, context, base, watch, check, snapshot, importPlan, nav, close, submit, confirm, cancelConfirm, saved, put, axe, overflow, planWrites, artifacts }) {
  const NEW_TAG = 'new:'.repeat(21);
  const original = (await snapshot(page)).plan;
  const fixture = expenseFixture(), [category, necessity] = fixture.tagDefinitions;
  const newExpense = async (name = 'New synthetic expense') => {
    await page.locator('[data-action=item][data-kind=expense]:not([data-object])').first().click();
    await page.locator('[name=name]').fill(name);
    return page.locator('#edit-form');
  };
  const show = async value => page.locator('#workspace [data-amount-visibility]').setChecked(value);
  const formShow = async value => page.locator('#editor [data-amount-visibility]').setChecked(value);
  const addNewTag = async (key = 'New key', value = 'New value') => {
    await page.locator('[data-add-tag]').click(); const row = page.locator('[data-tag-row]').last();
    await row.locator('[data-tag-key]').selectOption(NEW_TAG); await row.locator('[data-new-key]').fill(key);
    await row.locator('[data-tag-value]').selectOption(NEW_TAG); await row.locator('[data-new-value]').fill(value); return row;
  };
  const group = async slots => {
    // Clear first so moving the same dimension to a different slot is explicit.
    for (let n = 0; n < 3; n++) await page.locator(`[data-group-level="${n}"]`).selectOption('');
    for (let n = 0; n < slots.length; n++) await page.locator(`[data-group-level="${n}"]`).selectOption(slots[n]);
  };
  const commonDOM = selector => page.locator(selector).evaluate(element => {
    const clone = element.cloneNode(true); clone.querySelectorAll('[data-money-only]').forEach(n => n.remove());
    clone.querySelectorAll('[data-amount-visibility]').forEach(n => { n.removeAttribute('checked'); });
    return clone.outerHTML;
  });
  await check('MS-004 absent-only exact starter library, explicit-empty and zero implicit saves', async () => {
    const old = expenseFixture({ tagged: false }); await importPlan(page, old); await nav(page, 'expense');
    const before = await snapshot(page), writes = planWrites.length;
    await page.locator('[data-action=tags]').click(); assert.equal(await page.locator('[name=manageKey] option').count(), 3);
    await page.locator('[name=manageKey]').selectOption(category.id);
    assert.deepEqual((await page.locator('[name=manageValue] option').allTextContents()).slice(2), category.values.map(v => v.name));
    await close(page); assert.equal(planWrites.length, writes); assert.deepEqual(await snapshot(page), before);
    await importPlan(page, { ...old, tagDefinitions: [] });
    await page.locator('[data-action=tags]').click(); assert.equal(await page.locator('[name=manageKey] option').count(), 1); await close(page);
    assert.deepEqual((await snapshot(page)).plan.tagDefinitions, []);
    await importPlan(page, fixture);
    await page.reload(); await page.locator('#application').waitFor({ state: 'visible' }); await nav(page, 'expense');
    assert.equal(await page.locator('#workspace [data-amount-visibility]').isChecked(), false);
  });
  await check('MS-004 monthly grouping, fallback, search, all schedules and view-only zero PUTs', async () => {
    const before = await snapshot(page), writes = planWrites.length;
    assert.equal(await page.locator('.detail-row').count(), 8); assert.equal(await page.locator('.object-card').count(), 5);
    assert.equal(await page.locator('.summary-grid .stat-value').first().textContent(), '8');
    assert.ok(await page.locator('.month-context').evaluate(e => e.compareDocumentPosition(document.querySelector('.summary-grid')) & Node.DOCUMENT_POSITION_FOLLOWING));
    await page.locator('[data-action=next-month]').click(); assert.equal(await page.locator('.detail-row').count(), 4);
    assert.ok(await page.locator('[data-action=next-month]').evaluate(e => e === document.activeElement));
    await page.locator('[data-action=previous-month]').click(); assert.equal(await page.locator('.detail-row').count(), 8);
    await show(true); const total = await page.locator('.summary-grid').textContent(); assert.match(total, /12\.050\.000/);
    await page.locator('#include-tentative').check(); assert.match(await page.locator('.summary-grid').textContent(), /13\.850\.000/); await page.locator('#include-tentative').uncheck();
    for (const slots of [[], ['object'], [`tag:${category.id}`, 'object', `tag:${necessity.id}`], [`tag:${necessity.id}`, `tag:${category.id}`, 'object'], ['', 'object']]) {
      await group(slots); assert.equal(await page.locator('.detail-row').count(), 8);
      assert.deepEqual((await page.locator('[data-expense-id]').evaluateAll(rows => rows.map(r => r.dataset.expenseId))).sort(), fixture.items.slice(0, 8).map(i => i.id).sort());
    }
    await group([`tag:${category.id}`, 'object', `tag:${necessity.id}`]);
    assert.ok(await page.locator('[data-group-level="2"]').evaluate(e => e === document.activeElement));
    assert.equal(await page.locator('[data-group-level="1"] option').filter({ hasText: 'Danh mục' }).evaluate(e => e.disabled), true);
    const gift = page.locator('[data-expense-id=Gift]');
    assert.ok(await gift.evaluate(e => { let n = e.parentElement, count = 0; while (n) { if (n.matches('.expense-group') && n.querySelector(':scope > header .collapse-toggle')?.textContent === 'Khác') count++; n = n.parentElement; } return count === 2; }));
    await page.locator('#expense-search').fill('Food'); assert.equal(await page.locator('.detail-row').count(), 1); assert.equal(await page.locator('.summary-grid').textContent(), total);
    await page.locator('#expense-search').fill('');
    await page.locator('[data-action=all-expense-schedules]').click(); assert.equal(await page.locator('.detail-row').count(), 11); assert.equal(await page.locator('.summary-grid').textContent(), total);
    await page.locator('[data-action=all-expense-schedules]').click(); await group(['object']);
    const disclosure = page.locator('.object-title [data-collapse]').first(); await disclosure.focus(); await page.keyboard.press('Space');
    assert.equal(await disclosure.getAttribute('aria-expanded'), 'false'); assert.ok(await disclosure.evaluate(e => e === document.activeElement));
    await page.locator('[data-collapse-all=open]').click();
    assert.equal(planWrites.length, writes); assert.deepEqual(await snapshot(page), before);
    assert.deepEqual(await page.evaluate(async () => (await fetch((document.documentElement.dataset.basePath || '') + '/api/export')).json()), before.plan);
  });
  await check('MS-004 exact amount switch/save wording, non-money DOM parity, hidden draft validation', async () => {
    await show(false); const hidden = await commonDOM('#workspace'); await show(true); assert.equal(await commonDOM('#workspace'), hidden);
    await show(false); const f = await newExpense(); assert.equal(await f.locator('[data-tag-row]').count(), 0);
    assert.equal(await f.locator('button[type=submit]').textContent(), 'Lưu chi phí');
    assert.equal(await f.locator('[name=amount]').isVisible(), false);
    const formHidden = await commonDOM('#edit-form');
    await f.locator('[data-amount-visibility]').focus(); await page.keyboard.press('Space');
    assert.equal(await page.locator('#workspace [data-amount-visibility]').isChecked(), true);
    assert.equal(await commonDOM('#edit-form'), formHidden);
    await f.locator('[name=amount]').fill('5tr'); await formShow(false); assert.equal(await f.locator('[name=amount]').inputValue(), '5tr');
    await formShow(true); await f.locator('[name=amount]').fill('1e3'); await formShow(false);
    const before = await snapshot(page), writes = planWrites.length;
    await f.locator('button[type=submit]').click(); await page.locator('#form-error').waitFor({ state: 'visible' });
    assert.equal(planWrites.length, writes); assert.deepEqual(await snapshot(page), before); assert.equal(await f.locator('[name=amount]').inputValue(), '1e3');
    await formShow(true); await f.locator('[name=amount]').fill('5tr'); await formShow(false); await submit(page);
    const created = (await snapshot(page)).plan.items.at(-1); assert.equal(created.amount, 5000000);
    await page.locator(`[data-expense-id="${created.id}"] [data-action=item]:not(.amount-button)`).click();
    assert.equal(await page.locator('[name=amount]').inputValue(), '5000000 VND'); assert.equal(await page.locator('#edit-form button[type=submit]').textContent(), 'Lưu chi phí'); await close(page);
    for (const text of ['CÙNG MỘT KẾ HOẠCH · CÙNG CÁCH NHẬP', 'Chỉ ẩn/hiện số tiền; nội dung và các thao tác giữ nguyên.']) assert.ok(!(await page.locator('#workspace').textContent()).includes(text));
    for (const [input, expected] of [['', null], ['0', 0], ['5', 5000], ['5000 VND', 5000]]) {
      await newExpense(`Money ${input || 'unknown'}`); await formShow(true); await page.locator('[name=amount]').fill(input); await formShow(false); await submit(page);
      assert.equal((await snapshot(page)).plan.items.at(-1).amount, expected);
    }
    await importPlan(page, fixture);
  });
  await check('MS-004 inline tags: cancel/remove/invalid/decline are atomic; valid save creates definitions', async () => {
    const before = await snapshot(page), writes = planWrites.length;
    await newExpense(); await addNewTag('Cancelled', 'Never'); await close(page); assert.deepEqual(await snapshot(page), before);
    await newExpense(); const removed = await addNewTag('Removed', 'Never'); await removed.locator('[data-remove-tag]').click(); await close(page);
    await newExpense(); await addNewTag('', 'Incomplete'); await page.locator('#edit-form button[type=submit]').click(); await page.locator('#form-error').waitFor({ state: 'visible' }); await close(page);
    await page.locator('[data-expense-id=Food] [data-action=item]:not(.amount-button)').click(); await formShow(true); await page.locator('[name=amount]').fill('4tr'); await addNewTag('Declined', 'Never');
    await page.locator('#edit-form button[type=submit]').click(); await cancelConfirm(page); await close(page);
    assert.equal(planWrites.length, writes); assert.deepEqual(await snapshot(page), before);
    await newExpense('Tagged new expense'); await page.locator('[data-add-tag]').click(); const row = page.locator('[data-tag-row]').first();
    await row.locator('[data-tag-key]').selectOption(category.id); await row.locator('[data-tag-value]').selectOption(category.values[0].id);
    const extra = await addNewTag('New synthetic key', 'New synthetic value');
    assert.equal(await extra.locator(`[data-tag-key] option[value="${category.id}"]`).evaluate(e => e.disabled), true);
    await submit(page); const state = await snapshot(page), created = state.plan.tagDefinitions.at(-1);
    assert.equal(created.name, 'New synthetic key'); assert.equal(created.values[0].name, 'New synthetic value'); assert.equal(state.plan.items.at(-1).tags.length, 2);
    await page.locator(`[data-expense-id="${state.plan.items.at(-1).id}"] [data-action=item]:not(.amount-button)`).click(); assert.equal(await page.locator('[data-tag-row]').count(), 2); await close(page);
    // A grouped Add inherits owner/type only, never the selected tag branch.
    await group([`tag:${category.id}`, 'object']);
    await page.locator('.expense-group').filter({ has: page.locator('[data-expense-id=Food]') }).last().locator(':scope > div > footer [data-action=item]').click();
    assert.equal(await page.locator('[data-tag-row]').count(), 0); assert.equal(await page.locator('[name=objectId]').inputValue(), fixture.objects[0].id); assert.equal(await page.locator('[name=repeat]').inputValue(), 'monthly'); await close(page);
    await group(['object']);
  });
  await check('MS-004 imported IDs named new remain identities, never create-definition sentinels', async () => {
    const before = (await snapshot(page)).plan;
    for (const collision of ['key', 'value']) {
      const p = expenseFixture(), key = p.tagDefinitions[0], oldKey = key.id, oldValue = key.values[0].id;
      if (collision === 'key') { key.id = 'new'; p.items.forEach(i => i.tags.forEach(t => { if (t.keyId === oldKey) t.keyId = 'new'; })); }
      else { key.values[0].id = 'new'; p.items.forEach(i => i.tags.forEach(t => { if (t.keyId === oldKey && t.valueId === oldValue) t.valueId = 'new'; })); }
      await importPlan(page, p); await newExpense(`Imported ${collision} identity`); await page.locator('[data-add-tag]').click();
      await page.locator('[data-tag-key]').selectOption(key.id); await page.locator('[data-tag-value]').selectOption(key.values[0].id); await submit(page);
      assert.deepEqual((await snapshot(page)).plan.items.at(-1).tags, [{ keyId: key.id, valueId: key.values[0].id }]);
    }
    await importPlan(page, before);
  });
  await check('MS-004 stable management rename, referenced deletion protection, explicit unassignment', async () => {
    const before = await snapshot(page), newKey = before.plan.tagDefinitions.at(-1), item = before.plan.items.at(-1);
    await page.locator('[data-action=tags]').click(); await page.locator('[name=manageKey]').selectOption(newKey.id); await page.locator('[name=keyName]').fill('Renamed key');
    await page.locator('[name=manageValue]').selectOption(newKey.values[0].id); await page.locator('[name=valueName]').fill('Renamed value'); await submit(page);
    const renamed = await snapshot(page); assert.deepEqual(renamed.plan.items, before.plan.items); assert.equal(renamed.plan.tagDefinitions.at(-1).id, newKey.id);
    await page.locator('[data-action=tags]').click(); await page.locator('[name=manageKey]').selectOption(newKey.id);
    await page.locator('[data-delete-tag-key]').click(); await page.locator('#form-error').waitFor({ state: 'visible' }); assert.deepEqual(await snapshot(page), renamed);
    await page.locator('[name=manageValue]').selectOption(newKey.values[0].id); await page.locator('[data-delete-tag-value]').click(); assert.deepEqual(await snapshot(page), renamed); await close(page);
    await page.locator(`[data-expense-id="${item.id}"] [data-action=item]:not(.amount-button)`).click();
    await page.locator('[data-tag-row]').last().locator('[data-remove-tag]').click(); await submit(page);
    assert.equal((await snapshot(page)).plan.tagDefinitions.at(-1).id, newKey.id);
    await page.locator('[data-action=tags]').click(); await page.locator('[name=manageKey]').selectOption(newKey.id); await page.locator('[data-delete-tag-key]').click();
    const revision = (await snapshot(page)).revision; await confirm(page); await saved(page, revision); await page.locator('#editor').waitFor({ state: 'hidden' });
    assert.ok(!(await snapshot(page)).plan.tagDefinitions.some(k => k.id === newKey.id));
    await importPlan(page, fixture);
  });
  await check('MS-004 dynamic once/monthly/yearly/custom schedules and estimate history preservation', async () => {
    await newExpense('Schedule draft'); const f = page.locator('#edit-form');
    assert.equal(await f.locator('[name=end]').isVisible(), false); assert.equal(await f.locator('[name=end]').isDisabled(), true); assert.equal(await f.locator('[name=everyMonths]').isVisible(), false);
    assert.equal(await f.locator('[name=repeat]').isVisible(), false);
    await f.locator('[name=expenseKind]').selectOption('interval'); await f.locator('[name=repeat]').selectOption('monthly'); assert.equal(await f.locator('[name=end]').isVisible(), true); assert.equal(await f.locator('[name=everyMonths]').isVisible(), false);
    await f.locator('[name=repeat]').selectOption('yearly'); assert.equal(await f.locator('[name=everyMonths]').isVisible(), false);
    await f.locator('[name=repeat]').selectOption('interval'); assert.equal(await f.locator('[name=everyMonths]').isVisible(), true);
    const before = await snapshot(page);
    for (const value of ['0', '1.5', '121']) { await f.locator('[name=everyMonths]').fill(value); await f.locator('button[type=submit]').click(); await page.locator('#form-error').waitFor({ state: 'visible' }); assert.deepEqual(await snapshot(page), before); }
    await f.locator('[name=everyMonths]').fill('3'); await f.locator('[name=end]').fill('2027-05'); await f.locator('[name=expenseKind]').selectOption('once'); await f.locator('[name=expenseKind]').selectOption('interval');
    assert.equal(await f.locator('[name=everyMonths]').inputValue(), '3'); assert.equal(await f.locator('[name=end]').inputValue(), '2027-05'); await close(page);
    for (const [repeat, n] of [['monthly', 1], ['yearly', 12], ['interval', 120], ['once', 1]]) {
      await newExpense(`Schedule ${repeat}`); await page.locator('[name=expenseKind]').selectOption(repeat === 'once' ? 'once' : 'interval');
      if (repeat !== 'once') await page.locator('[name=repeat]').selectOption(repeat);
      if (repeat !== 'once') await page.locator('[name=end]').fill('2040-11');
      if (repeat === 'interval') await page.locator('[name=everyMonths]').fill(String(n));
      await submit(page); const item = (await snapshot(page)).plan.items.at(-1); assert.equal(item.recurrence.everyMonths, n); if (repeat === 'once') assert.equal(item.recurrence.anchor, item.recurrence.end);
    }
    await page.locator('#view-month').selectOption('2026-12'); await page.locator('[data-expense-id=Food] [data-action=item]:not(.amount-button)').click();
    await formShow(true); await page.locator('[name=amount]').fill('3100000 VND'); await formShow(false); await submit(page, true);
    const revised = (await snapshot(page)).plan.items.find(i => i.id === 'Food');
    assert.deepEqual(['2026-11', '2026-12', '2027-01'].map(m => plannedAmount(revised, m)), [3000000, 3100000, 3200000]);
    await page.locator('[data-expense-id=Food] [data-action=item]:not(.amount-button)').click(); await page.locator('[name=end]').fill('2026-12');
    const preserved = await snapshot(page); await page.locator('#edit-form button[type=submit]').click(); await page.locator('#form-error').waitFor({ state: 'visible' }); assert.deepEqual(await snapshot(page), preserved); await close(page);
    await importPlan(page, fixture); await page.locator('#view-month').selectOption('2026-11');
  });
  await check('MS-004 queued old close event cannot erase a newly opened confirmation', async () => {
    const before = await snapshot(page), replacement = { ...before.plan, name: 'Synthetic confirmation race' };
    await page.locator('#import-file').setInputFiles({ name: 'confirmation-race.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(replacement)) });
    await page.locator('#confirm-dialog').waitFor({ state: 'visible' });
    // Reproduce delivery of the previous close task after a new showModal().
    await page.locator('#confirm-dialog').evaluate(d => d.dispatchEvent(new Event('close')));
    await confirm(page); await saved(page, before.revision); assert.deepEqual((await snapshot(page)).plan, replacement);
    await importPlan(page, fixture);
  });
  await check('MS-004 tagged stale save keeps acknowledged library and exportable complete candidate', async () => {
    const other = await context.newPage(); watch(other); await other.goto(base + '/'); await other.locator('#application').waitFor({ state: 'visible' });
    const newer = { ...fixture, name: 'Synthetic newer tags' }; assert.equal(await put(other, newer), 200); const acknowledged = await snapshot(other);
    await newExpense('Conflict tagged expense'); await addNewTag('Conflict key', 'Conflict value'); await page.locator('#edit-form button[type=submit]').click();
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.startsWith('CHƯA LƯU')); assert.deepEqual(await snapshot(page), acknowledged); await close(page);
    const event = page.waitForEvent('download'); await page.locator('#export-button').click(); const download = await event; assert.match(download.suggestedFilename(), /UNSAVED/);
    const filename = path.join(artifacts, 'ms004-unsaved-tags.json'); await download.saveAs(filename); const candidate = JSON.parse(await readFile(filename, 'utf8'));
    assert.equal(candidate.tagDefinitions.at(-1).name, 'Conflict key'); assert.equal(candidate.items.at(-1).tags[0].keyId, candidate.tagDefinitions.at(-1).id);
    await page.locator('#reload-button').click(); await confirm(page); await page.waitForFunction(() => document.querySelector('#plan-title').textContent.startsWith('Synthetic newer tags')); await other.close();
    await importPlan(page, fixture);
  });
  await check('MS-004 five widths, nested grouping, switches/tag dialogs, keyboard and reload defaults', async () => {
    const before = await snapshot(page), writes = planWrites.length;
    await group([`tag:${category.id}`, 'object', `tag:${necessity.id}`]);
    for (const width of [320, 360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const visible of [false, true]) { await show(visible); await overflow(page); await axe(page, `ms004-nested-${width}-${visible}`); }
      if ([320, 1440].includes(width)) { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: path.join(artifacts, `ms004-nested-${width}.png`) }); }
      const source = page.locator('[data-action=item][data-kind=expense]:not([data-object])').first(); await source.click(); await page.locator('[name=name]').fill('Keyboard draft');
      await addNewTag('A long synthetic key for mobile', 'A long synthetic value for mobile');
      await page.locator('[data-add-tag]').click(); const secondTag = page.locator('[data-tag-row]').last();
      await secondTag.locator('[data-tag-key]').selectOption(category.id); await secondTag.locator('[data-tag-value]').selectOption(category.values[0].id);
      assert.equal(await page.locator('.expense-tag-bundle').count(), 1);
      assert.equal(await page.locator('.expense-tag-bundle > #expense-tag-rows > [data-tag-row]').count(), 2);
      for (const row of await page.locator('[data-tag-row]').all()) {
        const keyBox = await row.locator('[data-tag-key]').boundingBox(), valueBox = await row.locator('[data-tag-value]').boundingBox();
        assert.ok(Math.abs(keyBox.y - valueBox.y) <= 1, `key/value share one row at ${width}px`);
        assert.ok(keyBox.x + keyBox.width <= valueBox.x && keyBox.width > 40 && valueBox.width > 40);
        assert.equal(await row.evaluate(e => getComputedStyle(e).borderTopWidth), '0px', 'one shared bundle, not separate tag cards');
      }
      await overflow(page); await axe(page, `ms004-tag-form-${width}`);
      if ([320, 1440].includes(width)) {
        await page.locator('#editor').evaluate(e => { e.scrollTop = 0; }); await page.screenshot({ path: path.join(artifacts, `ms004-tag-form-${width}.png`) });
        await page.locator('#editor').evaluate(e => { e.scrollTop = e.scrollHeight; }); await page.screenshot({ path: path.join(artifacts, `ms004-tag-rows-${width}.png`) });
      }
      await secondTag.locator('[data-remove-tag]').focus(); await page.keyboard.press('Enter');
      assert.equal(await page.locator('[data-tag-row]').count(), 1);
      assert.equal(await page.locator('[data-new-value]').inputValue(), 'A long synthetic value for mobile');
      await page.keyboard.press('Escape'); assert.ok(await source.evaluate(e => e === document.activeElement));
      await page.locator('[data-action=tags]').click(); await page.locator('[name=manageKey]').selectOption(category.id); await page.locator('[name=manageValue]').selectOption(NEW_TAG);
      await overflow(page); await axe(page, `ms004-tag-manager-${width}`); await close(page);
    }
    assert.equal(planWrites.length, writes); assert.deepEqual(await snapshot(page), before);
    assert.deepEqual(forecast(before.plan).map(m => [m.expense, m.expenseMissing]), forecast(fixture).map(m => [m.expense, m.expenseMissing]));
    await page.reload(); await page.locator('#application').waitFor({ state: 'visible' }); await nav(page, 'expense');
    assert.deepEqual(await page.locator('[data-group-level]').evaluateAll(elements => elements.map(e => e.value)), ['object', '', '']);
    assert.equal(await page.locator('#workspace [data-amount-visibility]').isChecked(), false); assert.equal(await page.locator('#expense-search').inputValue(), '');
    assert.equal(await page.locator('.detail-row').count(), 8); assert.equal(planWrites.length, writes); assert.deepEqual(await snapshot(page), before);
  });
  await importPlan(page, original);
}
