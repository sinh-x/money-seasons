import test from 'node:test';
import assert from 'node:assert/strict';
import { blankPlan, validatePlan, forecast, latestSnapshot, debtTotal, setSnapshot, todayISO, validDate } from '../public/model.js';
const fixture = () => ({ ...blankPlan('2025-11', '2026-01'), objects: [{ id: 'group', name: 'Synthetic', type: 'group' }],
  accounts: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], snapshots: [
    { id: 'a-nov', accountId: 'a', date: '2025-11-01', amount: 3000 },
    { id: 'b-nov', accountId: 'b', date: '2025-11-01', amount: 7000 },
    { id: 'b-dec', accountId: 'b', date: '2025-12-05', amount: 6000 }],
  items: [{ id: 'expense', objectId: 'group', name: 'Synthetic expense', description: '', type: 'expense', status: 'confirmed', amount: 2000,
    recurrence: { kind: 'interval', anchor: '2025-11', end: '2026-01', everyMonths: 1 }, amountChanges: [] }] });
test('worked pooled reset with stale mixed dates, full refresh-month plans and no retroactive reset', () => {
  const p = validatePlan(fixture()), result = forecast(p);
  assert.deepEqual(result.map(m => m.opening), [10000, 9000, 7000]);
  assert.deepEqual(result.map(m => m.closing), [8000, 7000, 5000]);
  assert.deepEqual(result.map(m => m.reset), [true, true, false]);
  assert.equal(result[1].references[0].snapshot.date, '2025-11-01');
  p.snapshots.push({ id: 'backfill', accountId: 'b', date: '2025-10-01', amount: 99 });
  assert.equal(latestSnapshot(p.snapshots, 'b', '2025-11').amount, 7000);
  assert.deepEqual(forecast(validatePlan(p)), result);
});
test('unknown baseline and unknown plan carry until complete reset; explicit zero known', () => {
  const p = fixture(); p.snapshots = p.snapshots.filter(s => s.id !== 'b-nov');
  let results = forecast(validatePlan(p)); assert.equal(results[0].incomplete, true); assert.equal(results[1].incomplete, false);
  p.items[0].amount = null; results = forecast(validatePlan(p)); assert.ok(results.every(m => m.incomplete));
  p.items[0].amount = 0; p.snapshots.forEach(s => { s.amount = 0; }); assert.equal(forecast(validatePlan(p))[1].incomplete, false);
});
test('debt directions separate from cash; repayment and collection ordinary plans counted once', () => {
  const p = fixture(), before = forecast(validatePlan(p));
  p.debtAccounts = [{ id: 'owed', name: 'Payable', direction: 'payable' }, { id: 'lent', name: 'Receivable', direction: 'receivable' }];
  p.debtSnapshots = [{ id: 'd1', accountId: 'owed', date: '2025-11-01', amount: 9000 }, { id: 'd2', accountId: 'lent', date: '2025-11-01', amount: 4000 }];
  assert.deepEqual(forecast(validatePlan(p)), before);
  assert.deepEqual(debtTotal(p, 'payable', '2025-11'), { known: 9000, missing: 0 });
  assert.deepEqual(debtTotal(p, 'receivable', '2025-10'), { known: 0, missing: 1 });
  p.items.push({ ...p.items[0], id: 'repay', amount: 1000 }, { ...p.items[0], id: 'collect', type: 'income', amount: 400 });
  assert.equal(forecast(validatePlan(p))[0].closing, 7400);
  assert.equal(debtTotal(p, 'payable', '2026-01').known, 9000);
});
test('today uses Vietnam zone; leap dates, future dates, duplicate snapshots and references validate', () => {
  assert.equal(todayISO(new Date('2026-11-03T18:00:00Z')), '2026-11-04');
  assert.equal(validDate('2024-02-29'), true); assert.equal(validDate('2025-02-29'), false);
  const p = fixture(); p.snapshots.push({ id: 'future', accountId: 'a', date: '2100-01-01', amount: 1 }); assert.throws(() => validatePlan(p));
  p.snapshots.pop(); p.snapshots.push({ ...p.snapshots[0], id: 'duplicate-date' }); assert.throws(() => validatePlan(p));
  p.snapshots.pop(); p.accounts.pop(); assert.throws(() => validatePlan(p));
});
test('same-date correction explicit, stable ID, no silent account/history deletion', () => {
  const p = validatePlan(fixture()), snapshot = { id: 'replacement', accountId: 'a', date: '2025-11-01', amount: 0 };
  assert.throws(() => setSnapshot(p, snapshot));
  const q = setSnapshot(p, snapshot, { confirmed: true }); assert.equal(q.snapshots[0].id, 'a-nov'); assert.equal(q.snapshots[0].amount, 0); assert.equal(p.snapshots[0].amount, 3000);
});
