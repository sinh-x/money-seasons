import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoData } from '../public/demo-data.js';
import { demoPlan, validatePlan, forecast, monthRange, occurs, plannedAmount, cashBaseline, debtTotal, reviseEstimate } from '../public/model.js';
const find = (p, id) => { const i = p.items.find(i => i.id === id); assert.ok(i, id); return i; };
const months = (p, id) => monthRange(p.startMonth, p.endMonth).filter(m => occurs(find(p, id), m));
const monthly = { kind: 'interval', anchor: '2026-11', end: '2027-12', everyMonths: 1 };

test('AC1/2: deterministic valid v3, exact fictional identity, counts, unique IDs and references', () => {
  const p = demoPlan(); assert.deepEqual(p, demoPlan()); assert.deepEqual(p, createDemoData());
  assert.equal(p.version, 3); assert.equal(p.demo, true); assert.equal(p.currency, 'VND');
  assert.equal(p.name, 'Gia đình mẫu Minh – Lan');
  assert.equal(p.startMonth, '2026-11'); assert.equal(p.endMonth, '2027-12');
  assert.equal(monthRange(p.startMonth, p.endMonth).length, 14);
  assert.equal(p.objects.length, 9); assert.equal(p.items.length, 19);
  assert.deepEqual(p.objects.map(o => [o.type, o.name]), [
    ['person', 'Minh (chồng · mẫu)'], ['person', 'Lan (vợ · mẫu)'], ['person', 'An (con · mẫu)'], ['person', 'Bình (con · mẫu)'],
    ['group', 'Gia đình (mẫu)'], ['category', 'Nhà ở'], ['category', 'Sinh hoạt'], ['category', 'Đi lại'], ['category', 'Dự phòng']
  ]);
  const records = ['objects', 'items', 'accounts', 'snapshots', 'debtAccounts', 'debtSnapshots'].flatMap(k => p[k]);
  assert.equal(new Set(records.map(r => r.id)).size, records.length);
  for (const i of p.items) {
    assert.ok(p.objects.some(o => o.id === i.objectId));
    assert.ok(i.amount === null || (Number.isSafeInteger(i.amount) && i.amount >= 0));
    assert.deepEqual(i.amountChanges, i.id === 'utilities' ? [{ month: '2027-01', amount: 1800000 }] : []);
  }
  assert.ok(Buffer.byteLength(JSON.stringify(p), 'utf8') <= 1000000);
  for (const today of ['2026-11-01', '2026-11-05', '2027-12-31', '2030-01-01']) assert.deepEqual(validatePlan(p, { today }), p);
});

test('AC3: all twelve regular entries have exact ownership, literal VND and monthly bounds', () => {
  const p = demoPlan(), expected = [
    ['minh-income', 'minh', 'income', 25000000], ['lan-income', 'lan', 'income', 18000000],
    ['rent', 'housing', 'expense', 8000000], ['groceries', 'living', 'expense', 6000000],
    ['utilities', 'living', 'expense', 1500000], ['travel', 'transport', 'expense', 2000000],
    ['minh-lunch', 'minh', 'expense', 1200000], ['lan-lunch', 'lan', 'expense', 1200000],
    ['an-school', 'an', 'expense', 3000000], ['an-activities', 'an', 'expense', 600000],
    ['binh-kindergarten', 'binh', 'expense', 2500000], ['binh-activities', 'binh', 'expense', 400000]
  ];
  for (const [id, owner, type, amount] of expected) {
    const i = find(p, id); assert.equal(i.objectId, owner); assert.equal(i.type, type); assert.equal(i.amount, amount);
    assert.equal(i.status, 'confirmed'); assert.deepEqual(i.recurrence, monthly); assert.equal(months(p, id).length, 14);
  }
  assert.ok(p.items.filter(i => i.type === 'income').every(i => ['minh', 'lan'].includes(i.objectId)));
  for (const id of ['minh', 'lan', 'an', 'binh']) assert.ok(p.items.some(i => i.objectId === id && i.type === 'expense'));
});

test('AC4/5: anchored yearly and once occurrences, utilities forward history unchanged', () => {
  const p = demoPlan();
  assert.equal(find(p, 'insurance').objectId, 'family'); assert.equal(find(p, 'insurance').amount, 6000000);
  assert.deepEqual(find(p, 'insurance').recurrence, { kind: 'interval', anchor: '2026-11', end: '2027-11', everyMonths: 12 });
  assert.deepEqual(months(p, 'insurance'), ['2026-11', '2027-11']);
  assert.equal(find(p, 'school-supplies').objectId, 'an'); assert.equal(find(p, 'school-supplies').amount, 1200000);
  assert.deepEqual(months(p, 'school-supplies'), ['2027-08']);
  for (const [id, month] of [['school-supplies', '2027-08'], ['dental', '2026-12'], ['free-activity', '2026-11'], ['holiday', '2027-06'], ['collection', '2026-12']]) {
    assert.deepEqual(find(p, id).recurrence, { kind: 'once', anchor: month, end: month, everyMonths: 1 });
  }
  assert.deepEqual(['2026-11', '2026-12', '2027-01', '2027-12'].map(m => plannedAmount(find(p, 'utilities'), m)), [1500000, 1500000, 1800000, 1800000]);
});

test('AC6: unknown dental, known free zero and reversible tentative-only June comparison', () => {
  const p = demoPlan(), raw = JSON.stringify(p), normal = forecast(p), compare = forecast(p, true);
  for (const [id, owner, amount, status] of [['dental', 'binh', null, 'confirmed'], ['free-activity', 'family', 0, 'confirmed'], ['holiday', 'reserve', 8000000, 'tentative']]) {
    const i = find(p, id); assert.equal(i.objectId, owner); assert.equal(i.amount, amount); assert.equal(i.status, status); assert.equal(i.type, 'expense');
  }
  assert.ok(p.items.filter(i => i.id !== 'holiday').every(i => i.status === 'confirmed'));
  assert.equal(normal[0].missing, 0); assert.equal(normal[1].expenseMissing, 1);
  assert.equal(normal[1].entries.find(i => i.id === 'dental').effective, null);
  for (let n = 0; n < normal.length; n++) assert.equal(compare[n].expense - normal[n].expense, normal[n].month === '2027-06' ? 8000000 : 0);
  assert.deepEqual(forecast(p), normal); assert.equal(JSON.stringify(p), raw);
});

test('AC7/8: dated cash history, fixed debts, repayment/collection never settle or net balances', () => {
  const p = demoPlan();
  assert.deepEqual(p.accounts, [{ id: 'wallet', name: 'Ví mẫu' }, { id: 'bank', name: 'Ngân hàng mẫu' }]);
  assert.deepEqual(p.snapshots.map(s => [s.accountId, s.date, s.amount]), [
    ['wallet', '2026-10-15', 2000000], ['wallet', '2026-11-01', 3000000], ['bank', '2026-11-01', 47000000]
  ]);
  assert.equal(cashBaseline(p, '2026-10').known, 2000000);
  assert.equal(cashBaseline(p, '2026-11').known, 50000000);
  assert.equal(cashBaseline(p, '2026-11').references[0].snapshot.id, 'wallet-nov');
  assert.deepEqual(p.debtAccounts, [{ id: 'loan', name: 'Khoản vay mẫu', direction: 'payable' }, { id: 'lent', name: 'Khoản cho mượn mẫu', direction: 'receivable' }]);
  assert.deepEqual(p.debtSnapshots.map(s => [s.accountId, s.date, s.amount]), [['loan', '2026-11-01', 30000000], ['lent', '2026-11-01', 3000000]]);
  const repayment = find(p, 'repayment'), collection = find(p, 'collection');
  assert.equal(repayment.objectId, 'family'); assert.equal(repayment.amount, 2000000); assert.equal(repayment.type, 'expense'); assert.deepEqual(repayment.recurrence, monthly);
  assert.equal(collection.objectId, 'minh'); assert.equal(collection.amount, 500000); assert.equal(collection.type, 'income'); assert.deepEqual(months(p, 'collection'), ['2026-12']);
  for (const month of monthRange(p.startMonth, p.endMonth)) {
    assert.deepEqual(debtTotal(p, 'payable', month), { known: 30000000, missing: 0 });
    assert.deepEqual(debtTotal(p, 'receivable', month), { known: 3000000, missing: 0 });
  }
  assert.deepEqual(forecast(validatePlan({ ...p, debtSnapshots: [] })), forecast(p));
});

test('AC9: independent November, December and January known totals and carried incompleteness', () => {
  const rows = forecast(demoPlan());
  assert.deepEqual(rows.slice(0, 3).map(m => [m.month, m.opening, m.income, m.expense, m.closing, m.incomplete, m.missing, m.expenseMissing]), [
    ['2026-11', 50000000, 43000000, 34400000, 58600000, false, 0, 0],
    ['2026-12', 58600000, 43500000, 28400000, 73700000, true, 1, 1],
    ['2027-01', 73700000, 43000000, 28700000, 88000000, true, 0, 0]
  ]);
  assert.equal(rows[2].openingIncomplete, true); assert.ok(rows.slice(1).every(m => m.incomplete));
});

test('AC11: nested edits and JSON import/export cannot contaminate seed/copies; reset is exact', () => {
  const original = demoPlan(), copy = demoPlan(), edited = reviseEstimate(copy, 'minh-lunch', '2026-11', 1300000);
  assert.deepEqual(find(edited, 'minh-lunch').amountChanges, [{ month: '2026-11', amount: 1300000 }]);
  assert.deepEqual(validatePlan(JSON.parse(JSON.stringify(edited))), edited);
  copy.objects[0].name = 'Edited'; copy.items[0].amount = 0; copy.items[0].recurrence.anchor = '2027-01';
  copy.items[4].amountChanges[0].amount = 0; copy.snapshots[0].amount = 0; copy.debtSnapshots[0].amount = 0;
  const raw = createDemoData(); raw.items[0].amount = 1;
  assert.deepEqual(demoPlan(), original); assert.deepEqual(createDemoData(), original);
  assert.equal(find(demoPlan(), 'minh-lunch').amount, 1200000);
});
