import test from 'node:test';
import assert from 'node:assert/strict';
import { blankPlan, demoPlan, validatePlan, forecast, occurs, MAX_AMOUNT, monthRange, changeWindow, reviseEstimate, plannedAmount, migrateV1 } from '../public/legacy-model.js';

export const syntheticItem = (changes = {}) => ({ id: 'one', name: 'Synthetic', type: 'expense', status: 'confirmed',
  amount: 10, category: 'Sinh hoạt', personLabel: 'Gia đình', amountChanges: [], actuals: {},
  recurrence: { kind: 'interval', anchor: '2026-11', end: '2027-12', everyMonths: 1 }, ...changes });
const scenario = (changes = {}) => validatePlan({ ...blankPlan(), openingCash: 100, items: [syntheticItem(changes)] });
const legacy = () => ({ version: 1, currency: 'VND', year: 2027, name: 'Synthetic v1', openingCash: 100, demo: false,
  items: [{ id: 'old', name: 'Synthetic', type: 'expense', status: 'confirmed', repeat: 'monthly', start: 1, end: 12,
    amount: 10, category: 'Sinh hoạt', actuals: { 11: 12, 12: 0 } }] });

test('inclusive year-month window boundaries and initial 14 months', () => {
  const p = blankPlan();
  assert.deepEqual(monthRange(p.startMonth, p.endMonth), ['2026-11', '2026-12', ...Array.from({ length: 12 }, (_, n) => `2027-${String(n + 1).padStart(2, '0')}`)]);
  assert.equal(monthRange('2000-01', '2000-01').length, 1);
  assert.equal(monthRange('2091-01', '2100-12').length, 120);
  for (const [a, b] of [['1999-12', '2000-01'], ['2100-12', '2101-01'], ['2027-02', '2027-01'], ['2000-01', '2010-01'], ['2026-1', '2027-01']]) {
    assert.throws(() => monthRange(a, b));
  }
});

test('synthetic foundation retains independently worked balances after v2 conversion', () => {
  const p = demoPlan(), result = forecast(p);
  assert.deepEqual(result.map(m => m.closing), [24.5, 10.5, 16.5, -1.5, 4.5, 10.5, 16.5, 22.5, -7.5, -1.5, 4.5, 35.5].map(n => n * 1_000_000));
  assert.equal(result.reduce((n, m) => n + m.income, 0), 385_000_000);
  assert.equal(result.reduce((n, m) => n + m.expense, 0), 369_500_000);
  assert.deepEqual(result.map(m => m.incomplete), [false, false, false, false, false, false, false, false, false, false, true, true]);
  const alternative = forecast(p, true);
  for (let i = 0; i < 12; i++) assert.equal(result[i].closing - alternative[i].closing, i < 6 ? 0 : 18_000_000);
});

test('actual replaces once, December closing carries into January without reset', () => {
  const p = scenario({ actuals: { '2026-11': 12 } }), data = forecast(p);
  assert.equal(data[0].expense, 12);
  assert.equal(data[0].closing, 88);
  assert.equal(data[1].closing, 78);
  assert.equal(data[2].opening, 78);
  assert.equal(p.items[0].amount, 10);
});

test('year-specific actuals, zero, clearing and tentative actuals', () => {
  const p = scenario({ status: 'tentative', actuals: { '2026-11': 0, '2027-11': 15 } });
  assert.equal(forecast(p)[0].expense, 0);
  assert.equal(forecast(p)[12].expense, 15);
  delete p.items[0].actuals['2026-11'];
  assert.equal(forecast(p, true)[0].expense, 10);
  assert.equal(forecast(p)[0].expense, 0);
});

test('unknown versus zero; completeness propagates and comparison reverses', () => {
  const p = scenario({ amount: null, actuals: { '2026-11': 25 } });
  assert.equal(forecast(p)[0].incomplete, false);
  assert.equal(forecast(p)[1].missing, 1);
  assert.equal(forecast(p).at(-1).incomplete, true);
  assert.equal(forecast(scenario({ amount: 0 })).at(-1).incomplete, false);
  const q = scenario({ amount: null, status: 'tentative' });
  assert.equal(forecast(q).at(-1).incomplete, false);
  assert.equal(forecast(q, true).at(-1).incomplete, true);
  assert.ok(forecast(blankPlan()).every(m => m.incomplete));
});

test('once, monthly, anchored every N and yearly schedules', () => {
  for (const [kind, everyMonths, end, expected] of [
    ['once', 1, '2026-11', ['2026-11']],
    ['interval', 1, '2027-02', ['2026-11', '2026-12', '2027-01', '2027-02']],
    ['interval', 2, '2027-03', ['2026-11', '2027-01', '2027-03']],
    ['interval', 12, '2027-12', ['2026-11', '2027-11']]
  ]) {
    const p = scenario({ recurrence: { kind, everyMonths, anchor: '2026-11', end } });
    assert.deepEqual(forecast(p).filter(m => m.expense).map(m => m.month), expected);
    assert.equal(occurs(p.items[0], '2026-10'), false);
  }
  for (const n of [0, 1.5, 121]) assert.throws(() => scenario({ recurrence: { kind: 'interval', everyMonths: n, anchor: '2026-11', end: '2027-12' } }));
});

test('future estimate change preserves prior estimates, actuals and original immutable input', () => {
  const p = scenario({ actuals: { '2026-12': 12 } }), snapshot = JSON.stringify(p);
  const next = reviseEstimate(p, 'one', '2027-01', 20);
  assert.equal(JSON.stringify(p), snapshot); // preview/cancel is a no-op
  assert.deepEqual(forecast(next).slice(0, 4).map(m => m.expense), [10, 12, 20, 20]);
  assert.equal(plannedAmount(next.items[0], '2026-12'), 10);
  const replaced = reviseEstimate(next, 'one', '2027-01', null);
  assert.deepEqual(replaced.items[0].amountChanges, [{ month: '2027-01', amount: null }]);
  assert.equal(replaced.items[0].actuals['2026-12'], 12);
  assert.throws(() => reviseEstimate(p, 'one', '2026-10', 20));
});

test('window changes require explicit new opening and cannot drop occurrences or extend routines', () => {
  const p = scenario();
  assert.throws(() => changeWindow(p, '2026-10', p.endMonth));
  const next = changeWindow(p, '2026-10', '2028-01', null);
  assert.equal(next.openingCash, null);
  assert.deepEqual(next.items[0].recurrence, p.items[0].recurrence);
  assert.throws(() => changeWindow(p, '2026-12', p.endMonth, 0));
  assert.throws(() => changeWindow(p, p.startMonth, '2027-11'));
});

test('legacy migration preserves original year/IDs/actual zero and leaves original untouched', () => {
  const old = legacy(), snapshot = JSON.stringify(old), p = migrateV1(old);
  assert.equal(JSON.stringify(old), snapshot);
  assert.equal(p.startMonth, '2027-01');
  assert.equal(p.endMonth, '2027-12');
  assert.equal(p.openingCash, 100);
  assert.equal(p.items[0].id, 'old');
  assert.deepEqual(p.items[0].actuals, { '2027-11': 12, '2027-12': 0 });
  assert.equal(forecast(p)[10].expense, 12);
  assert.equal(forecast(p)[11].expense, 0);
  assert.throws(() => changeWindow(p, '2026-11', p.endMonth));
  old.items[0].id = '__proto__';
  assert.equal(migrateV1(old).items[0].id, '__proto__'); // An ID value is not an object/prototype key.
  for (const change of [{ version: 9 }, { year: 2027.5 }, { currency: 'USD' }]) assert.throws(() => migrateV1({ ...old, ...change }));
});

test('whole VND, safe totals, 500 maximum-valued items over 120 months reject overflow', () => {
  const p = scenario({ amount: 1 });
  assert.equal(forecast(p).at(-1).closing, 86);
  p.startMonth = '2000-01'; p.endMonth = '2009-12';
  p.items = Array.from({ length: 500 }, (_, n) => syntheticItem({ id: String(n), amount: MAX_AMOUNT,
    recurrence: { kind: 'interval', anchor: p.startMonth, end: p.endMonth, everyMonths: 1 } }));
  assert.throws(() => validatePlan(p), /giới hạn/);
  const small = structuredClone(p); small.items.forEach(i => { i.amount = 1; });
  assert.equal(forecast(validatePlan(small)).at(-1).closing, 100 - 500 * 120);
  // Also reject aggregate overflow even if opposing flows keep cash near zero.
  p.items.forEach((i, n) => { i.type = n % 2 ? 'expense' : 'income'; });
  assert.throws(() => validatePlan(p), /giới hạn/);
});

test('round trip supports labels/history/actuals, strips unknown metadata', () => {
  const p = reviseEstimate(scenario({ amount: null, actuals: { '2027-11': 0 } }), 'one', '2027-01', 20);
  const input = JSON.parse(JSON.stringify(p)); input.secret = 'discard'; input.items[0].extra = true;
  assert.deepEqual(validatePlan(input), p);
  assert.deepEqual(forecast(validatePlan(input), true), forecast(p, true));
});

test('invalid fields, IDs, history and orphaned actuals reject', () => {
  for (const change of [{ amount: NaN }, { amount: MAX_AMOUNT + 1 }, { amount: '100' }, { amount: 0.1 },
    { type: 'transfer' }, { status: 'cancelled' }, { actuals: [] }, { actuals: { '2026-10': 1 } },
    { actuals: { '2026-11': null } }, { category: null }, { name: '' },
    { personLabel: 'x'.repeat(81) }, { category: 'x'.repeat(41) }, { id: '' },
    { amountChanges: [{ month: '2027-01', amount: 1 }, { month: '2027-01', amount: 2 }] },
    { amountChanges: [{ month: '2027-02', amount: 1 }, { month: '2027-01', amount: 2 }] }
  ]) {
    assert.throws(() => scenario(change), JSON.stringify(change));
  }
  assert.throws(() => scenario({ actuals: JSON.parse('{"__proto__":1}') }));
  const p = scenario(); p.items.push(structuredClone(p.items[0]));
  assert.throws(() => validatePlan(p));
  for (const change of [{ version: 1 }, { currency: 'USD' }, { openingCash: -1 }, { items: Array(501).fill(null) }]) assert.throws(() => validatePlan({ ...scenario(), ...change }));
  assert.throws(() => scenario({ recurrence: { kind: 'once', everyMonths: 1, anchor: '2026-11', end: '2026-12' } }));
  const snapshot = JSON.stringify(demoPlan()), q = demoPlan(); forecast(q); forecast(q, true);
  assert.equal(JSON.stringify(q), snapshot);
});
