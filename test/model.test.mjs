import test from 'node:test';
import assert from 'node:assert/strict';
import { blankPlan, validatePlan, forecast, monthRange, changeWindow, reviseEstimate, occurs, plannedAmount, convertLegacy, MAX_AMOUNT } from '../public/model.js';
export const syntheticItem = (changes = {}) => ({ id: 'one', objectId: 'family', name: 'Synthetic', description: '', type: 'expense', status: 'confirmed', amount: 10,
  recurrence: { kind: 'interval', anchor: '2026-11', end: '2027-12', everyMonths: 1 }, amountChanges: [], ...changes });
export function scenario(changes = {}) {
  return validatePlan({ ...blankPlan(), objects: [{ id: 'family', type: 'group', name: 'Synthetic family' }], items: [syntheticItem(changes)] });
}
test('default 14 months, exact boundaries and safe configurable window', () => {
  assert.equal(monthRange(blankPlan().startMonth, blankPlan().endMonth).length, 14);
  assert.equal(monthRange('2000-01', '2000-01').length, 1);
  assert.equal(monthRange('2091-01', '2100-12').length, 120);
  for (const [a, b] of [['1999-12', '2000-01'], ['2100-12', '2101-01'], ['2027-02', '2027-01'], ['2000-01', '2010-01']]) assert.throws(() => monthRange(a, b));
  const p = scenario(); assert.throws(() => changeWindow(p, '2026-12', p.endMonth));
  assert.deepEqual(changeWindow(p, p.startMonth, '2028-01').items, p.items);
});
test('stable shared registry, identical names distinct IDs, dangling and duplicate IDs reject', () => {
  const p = scenario(); p.objects.push({ id: 'other', type: 'person', name: p.objects[0].name });
  p.items.push(syntheticItem({ id: 'income', type: 'income' }));
  assert.equal(validatePlan(p).items[1].objectId, 'family');
  p.objects[0].name = 'Renamed'; assert.equal(validatePlan(p).objects[0].name, 'Renamed');
  p.objects = []; assert.throws(() => validatePlan(p));
  const q = scenario(); q.objects.push(q.objects[0]); assert.throws(() => validatePlan(q));
});
test('anchored once/N/yearly recurrence and forward estimate history', () => {
  for (const n of [1, 2, 12]) {
    const p = scenario({ recurrence: { kind: 'interval', anchor: '2026-11', end: '2027-12', everyMonths: n } });
    assert.equal(forecast(p).filter(m => m.expense).length, Math.floor(13 / n) + 1);
    assert.equal(occurs(p.items[0], '2026-10'), false);
  }
  for (const n of [0, 1.5, 121]) assert.throws(() => scenario({ recurrence: { kind: 'interval', anchor: '2026-11', end: '2027-12', everyMonths: n } }));
  const p = scenario(), original = JSON.stringify(p), next = reviseEstimate(p, 'one', '2027-01', 20);
  assert.equal(JSON.stringify(p), original);
  assert.deepEqual(forecast(next).slice(0, 4).map(m => m.expense), [10, 10, 20, 20]);
  assert.equal(plannedAmount(next.items[0], '2026-12'), 10);
  assert.deepEqual(reviseEstimate(next, 'one', '2027-01', null).items[0].amountChanges, [{ month: '2027-01', amount: null }]);
  assert.throws(() => reviseEstimate(p, 'one', '2026-10', 10));
});
test('unknown versus zero and reversible tentative inclusion; no active actual data', () => {
  const unknownExpense = forecast(scenario({ amount: null }))[0];
  assert.equal(unknownExpense.missing, 1); assert.equal(unknownExpense.expenseMissing, 1); assert.equal(unknownExpense.incomeMissing, 0);
  const unknownIncome = forecast(scenario({ type: 'income', amount: null }))[0];
  assert.equal(unknownIncome.incomeMissing, 1); assert.equal(unknownIncome.expenseMissing, 0);
  assert.equal(forecast(scenario({ amount: 0 }))[0].missing, 0);
  const p = scenario({ status: 'tentative' }); assert.equal(forecast(p)[0].expense, 0); assert.equal(forecast(p, true)[0].expense, 10); assert.equal(forecast(p)[0].expense, 0);
  assert.throws(() => scenario({ actuals: { '2026-11': 0 } }));
});
test('exact arithmetic and aggregate overflow rejected even with offsetting flows', () => {
  const p = scenario(); p.startMonth = '2000-01'; p.endMonth = '2009-12';
  p.items = Array.from({ length: 500 }, (_, n) => syntheticItem({ id: `i${n}`, amount: MAX_AMOUNT, type: n % 2 ? 'income' : 'expense', recurrence: { kind: 'interval', anchor: p.startMonth, end: p.endMonth, everyMonths: 1 } }));
  assert.throws(() => validatePlan(p), /giới hạn/);
  p.items.forEach(i => { i.amount = 1; }); assert.equal(forecast(validatePlan(p)).at(-1).closing, 0);
  for (const amount of [NaN, -1, 1.5, '1', MAX_AMOUNT + 1]) assert.throws(() => scenario({ amount }));
});
test('lossless round trip, strict shape/history and bounded data', () => {
  const p = reviseEstimate(scenario({ description: '<script>inert</script>' }), 'one', '2027-01', 0);
  assert.deepEqual(validatePlan(JSON.parse(JSON.stringify(p))), p);
  const original = JSON.stringify(p); forecast(p); forecast(p, true); assert.equal(JSON.stringify(p), original);
  for (const change of [{ version: 4 }, { currency: 'USD' }, { secret: 'not-exportable' }, { items: Array(501).fill(null) }]) assert.throws(() => validatePlan({ ...p, ...change }));
  assert.throws(() => scenario({ amountChanges: [{ month: '2027-01', amount: 1 }, { month: '2027-01', amount: 2 }] }));
});
test('explicit conversion preserves old original, years/plans; never fabricates cash or uses legacy actuals', () => {
  const old = { version: 1, currency: 'VND', year: 2027, name: 'Old synthetic', demo: false, openingCash: 100,
    items: [{ id: 'old', name: 'Expense', type: 'expense', status: 'confirmed', repeat: 'monthly', start: 1, end: 12, amount: 10, category: 'Family', actuals: { 11: 99, 12: 0 } }] };
  const raw = JSON.stringify(old); assert.throws(() => convertLegacy(old));
  const p = convertLegacy(old, { confirmed: true }); assert.equal(JSON.stringify(old), raw);
  assert.equal(p.startMonth, '2027-01'); assert.equal(p.items[0].id, 'old'); assert.equal(p.snapshots.length, 0);
  assert.equal(forecast(p)[10].expense, 10); assert.equal(forecast(p)[10].incomplete, true);
  old.items.push({ ...structuredClone(old.items[0]), id: 'second' });
  const duplicates = convertLegacy(old, { confirmed: true });
  assert.equal(duplicates.objects.length, 2); assert.equal(duplicates.objects[0].name, duplicates.objects[1].name);
  assert.notEqual(duplicates.items[0].objectId, duplicates.items[1].objectId);
});
