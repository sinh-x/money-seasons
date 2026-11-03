import test from 'node:test';
import assert from 'node:assert/strict';
import { blankPlan, validatePlan, forecast, latestSnapshot, debtTotal, setSnapshot, todayISO, validDate, MAX_AMOUNT } from '../public/model.js';
import { debtFixture, DEBT_EXPECTED } from '../scripts/debt-fixture.mjs';
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
test('debt totals use one latest dated balance per account, never sum history or net directions', () => {
  const p = validatePlan(debtFixture()), original = JSON.stringify(p);
  for (const row of DEBT_EXPECTED) for (const direction of ['payable', 'receivable']) assert.deepEqual(debtTotal(p, direction, row.month), row[direction], `${row.month} ${direction}`);
  assert.deepEqual(debtTotal(p, 'payable', '2025-10'), { known: 10000, missing: 2 });
  assert.equal(latestSnapshot(p.debtSnapshots, 'pay-a', '2025-11').date, '2025-11-20');
  assert.equal(latestSnapshot(p.debtSnapshots, 'pay-b', '2025-12').amount, 0);
  assert.equal(JSON.stringify(p), original);
  p.debtSnapshots.reverse();
  for (const row of DEBT_EXPECTED) assert.deepEqual(debtTotal(p, 'payable', row.month), row.payable);
});
test('debt corrections retain IDs and replace once; missing/zero/equal names remain distinct', () => {
  const p = validatePlan(debtFixture()); p.debtAccounts[1].name = p.debtAccounts[0].name;
  assert.deepEqual(debtTotal(validatePlan(p), 'payable', '2025-11'), { known: 12000, missing: 1 });
  const correction = { id: 'replacement', accountId: 'pay-a', date: '2025-11-20', amount: 0 };
  assert.throws(() => setSnapshot(p, correction, { debt: true }));
  const next = setSnapshot(p, correction, { debt: true, confirmed: true });
  assert.equal(next.debtSnapshots.find(s => s.date === correction.date).id, 'pa-nov-latest');
  assert.deepEqual(debtTotal(next, 'payable', '2025-11'), { known: 4000, missing: 1 });
  assert.deepEqual(debtTotal(next, 'payable', '2025-12'), { known: 7000, missing: 1 });
  assert.deepEqual(debtTotal(next, 'receivable', '2025-12'), { known: 3500, missing: 0 });
  assert.deepEqual(debtTotal(blankPlan(), 'payable', '2025-11'), { known: 0, missing: 0 });
  const noMissing = structuredClone(next); noMissing.debtAccounts = noMissing.debtAccounts.filter(a => a.id !== 'pay-unknown');
  assert.deepEqual(debtTotal(validatePlan(noMissing), 'payable', '2025-12'), { known: 7000, missing: 0 });
  assert.deepEqual(forecast(next), forecast(p)); // Debt balance edits alone never change cash.
});
test('invalid debt snapshots are rejected before totals: dates, duplicate days, amounts and links', () => {
  for (const change of [{ date: '2100-01-01' }, { date: '2025-02-29' }, { amount: null }, { amount: -1 }, { amount: 0.5 }, { amount: MAX_AMOUNT + 1 }, { accountId: 'missing' }]) {
    const p = debtFixture(); Object.assign(p.debtSnapshots[0], change); assert.throws(() => validatePlan(p), JSON.stringify(change));
  }
  const duplicate = debtFixture(); duplicate.debtSnapshots.push({ ...duplicate.debtSnapshots[0], id: 'duplicate-day' }); assert.throws(() => validatePlan(duplicate));
});
test('maximum supported debt-account totals stay exact and separated', () => {
  const p = blankPlan('2025-11', '2025-11');
  p.debtAccounts = Array.from({ length: 500 }, (_, n) => ({ id: `debt-${n}`, name: 'Synthetic maximum', direction: n % 2 ? 'payable' : 'receivable' }));
  p.debtSnapshots = p.debtAccounts.map((a, n) => ({ id: `snapshot-${n}`, accountId: a.id, date: '2025-11-01', amount: MAX_AMOUNT }));
  const valid = validatePlan(p);
  for (const direction of ['payable', 'receivable']) assert.deepEqual(debtTotal(valid, direction, '2025-11'), { known: Number(250n * BigInt(MAX_AMOUNT)), missing: 0 });
});
test('debt totals match an independent sorted-history ledger across a synthetic year', () => {
  const p = blankPlan('2025-01', '2025-12');
  p.debtAccounts = Array.from({ length: 30 }, (_, n) => ({ id: `a-${n}`, name: 'Synthetic reference', direction: n % 2 ? 'payable' : 'receivable' }));
  p.debtSnapshots = p.debtAccounts.flatMap((a, n) => n % 5 === 0 ? [] : Array.from({ length: 6 }, (_, m) => ({ id: `s-${n}-${m}`, accountId: a.id, date: `2025-${String(m + 1).padStart(2, '0')}-15`, amount: ((n + 3) * (m + 11) * 997) % 1000000 })));
  p.debtSnapshots.reverse(); const valid = validatePlan(p);
  for (let m = 1; m <= 12; m++) {
    const month = `2025-${String(m).padStart(2, '0')}`, latest = new Map();
    // Independent reference: process ascending dated history once, then sum by direction.
    for (const s of [...p.debtSnapshots].sort((a, b) => a.date.localeCompare(b.date))) if (s.date <= `${month}-31`) latest.set(s.accountId, BigInt(s.amount));
    for (const direction of ['payable', 'receivable']) {
      let known = 0n, missing = 0;
      for (const a of p.debtAccounts.filter(a => a.direction === direction)) { if (latest.has(a.id)) known += latest.get(a.id); else missing++; }
      assert.deepEqual(debtTotal(valid, direction, month), { known: Number(known), missing });
    }
  }
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
