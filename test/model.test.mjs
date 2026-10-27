import test from 'node:test';
import assert from 'node:assert/strict';
import { blankPlan, demoPlan, validatePlan, forecast, occurs, MAX_AMOUNT } from '../public/model.js';

const scenario = changes => {
  const p = blankPlan(2027);
  p.openingCash = 100;
  p.items = [{ id: 'one', name: 'Synthetic', type: 'expense', status: 'confirmed', repeat: 'once', start: 2, end: 2, amount: 50, category: 'Khác', actuals: {}, ...changes }];
  return validatePlan(p);
};

test('synthetic year matches independently worked monthly balances', () => {
  const result = forecast(validatePlan(demoPlan()));
  assert.deepEqual(result.map(m => m.closing), [24.5, 10.5, 16.5, -1.5, 4.5, 10.5, 16.5, 22.5, -7.5, -1.5, 4.5, 35.5].map(n => n * 1_000_000));
  assert.equal(result.reduce((n, m) => n + m.income, 0), 385_000_000);
  assert.equal(result.reduce((n, m) => n + m.expense, 0), 369_500_000);
  assert.deepEqual(result.map(m => m.incomplete), [false, false, false, false, false, false, false, false, false, false, true, true]);
});

test('tentative toggle changes July and following months by exactly 18m', () => {
  const baseline = forecast(demoPlan());
  const alternative = forecast(demoPlan(), true);
  for (let i = 0; i < 12; i++) assert.equal(baseline[i].closing - alternative[i].closing, i < 6 ? 0 : 18_000_000);
  assert.equal(alternative[6].closing, -1_500_000);
});

test('actual replaces planned once and preserves planned value', () => {
  const p = scenario({ actuals: { 2: 70 } });
  const m = forecast(p);
  assert.equal(m[1].expense, 70);
  assert.equal(m[1].closing, 30);
  assert.equal(m[2].closing, 30);
  assert.equal(p.items[0].amount, 50);
});

test('actual zero is real; clearing actual restores planned amount', () => {
  const p = scenario({ actuals: { 2: 0 } });
  assert.equal(forecast(p)[1].expense, 0);
  delete p.items[0].actuals[2];
  assert.equal(forecast(p)[1].expense, 50);
});

test('recorded actual on tentative item always contributes', () => {
  assert.equal(forecast(scenario({ status: 'tentative' }))[1].expense, 0);
  assert.equal(forecast(scenario({ status: 'tentative', actuals: { 2: 10 } }))[1].expense, 10);
});

test('unknown amount differs from zero and incompleteness carries forward', () => {
  const unknown = forecast(scenario({ amount: null }));
  assert.equal(unknown[0].incomplete, false);
  assert.equal(unknown[1].missing, 1);
  assert.equal(unknown[1].entries[0].effective, null);
  assert.equal(unknown[11].incomplete, true);
  assert.equal(forecast(scenario({ amount: 0 }))[11].incomplete, false);
});

test('actual fills unknown planned amount for its occurrence', () => {
  const m = forecast(scenario({ amount: null, actuals: { 2: 25 } }));
  assert.equal(m[1].expense, 25);
  assert.equal(m[1].incomplete, false);
});

test('excluded unknown tentative amount does not mark baseline incomplete', () => {
  const p = scenario({ amount: null, status: 'tentative' });
  assert.equal(forecast(p)[11].incomplete, false);
  assert.equal(forecast(p, true)[11].incomplete, true);
});

test('unknown opening cash keeps the whole forecast incomplete', () => {
  assert.ok(forecast(blankPlan()).every(m => m.incomplete));
  const p = blankPlan(); p.openingCash = 0;
  assert.ok(forecast(p).every(m => !m.incomplete && m.closing === 0));
});

test('monthly recurrence starts and ends inclusively without leaking', () => {
  const p = scenario({ repeat: 'monthly', start: 3, end: 5, amount: 10 });
  assert.deepEqual(forecast(p).map(m => m.expense), [0, 0, 10, 10, 10, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(occurs(p.items[0], 2), false);
  assert.equal(occurs(p.items[0], 5), true);
});

test('whole VND remains exact over 12 months and maximum-size plans', () => {
  const p = scenario({ repeat: 'monthly', start: 1, end: 12, amount: 1 });
  assert.equal(forecast(p)[11].closing, 88);
  p.items = Array.from({ length: 500 }, (_, i) => ({ ...p.items[0], id: String(i), amount: MAX_AMOUNT }));
  assert.equal(forecast(validatePlan(p))[11].closing, 100 - MAX_AMOUNT * 500 * 12);
});

test('export/import round-trip preserves money, nulls, actuals and statuses', () => {
  const p = demoPlan();
  const imported = validatePlan(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(imported, p);
  assert.deepEqual(forecast(imported, true), forecast(p, true));
});

test('validation rejects malformed and unsupported records', () => {
  const invalid = [null, {}, [], { ...demoPlan(), version: 2 }, { ...demoPlan(), currency: 'USD' },
    { ...demoPlan(), year: 2027.5 }, { ...demoPlan(), demo: 'yes' }, { ...demoPlan(), name: '' },
    { ...demoPlan(), openingCash: -1 }, { ...demoPlan(), openingCash: 1.5 },
    { ...demoPlan(), items: new Array(501).fill(null) }];
  for (const p of invalid) assert.throws(() => validatePlan(p));
  for (const change of [{ amount: NaN }, { amount: MAX_AMOUNT + 1 }, { amount: '100' }, { amount: 0.1 },
    { start: 0 }, { end: 13 }, { start: 3, end: 2 }, { repeat: 'weekly' }, { type: 'transfer' },
    { status: 'cancelled' }, { actuals: [] }, { actuals: { 1: 30 } }, { actuals: { 2: null } },
    { actuals: { '02': 20 } }, { category: null }, { name: '' }]) assert.throws(() => scenario(change));
});

test('duplicate IDs and one-off ranges are invalid', () => {
  const p = scenario();
  p.items.push(structuredClone(p.items[0]));
  assert.throws(() => validatePlan(p));
  assert.throws(() => scenario({ start: 1, end: 12, repeat: 'once' }));
});

test('validation drops unknown metadata, including attempted inventory cash', () => {
  const p = demoPlan();
  p.assets = [{ value: 999_000_000 }];
  p.items[0].extra = true;
  const clean = validatePlan(p);
  assert.equal('assets' in clean, false);
  assert.equal('extra' in clean.items[0], false);
  assert.equal(forecast(clean)[11].closing, 35_500_000);
});

test('forecast does not mutate the supplied plan', () => {
  const p = demoPlan();
  const snapshot = JSON.stringify(p);
  forecast(p); forecast(p, true);
  assert.equal(JSON.stringify(p), snapshot);
});
