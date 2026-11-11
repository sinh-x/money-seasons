// Pure current-state authorization tests. HTTP/CAS integration is a separate gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { blankPlan } from '../public/model.js';
import { blankHousehold, individualPlan, setSharing, applyRecordChange, projectHome } from '../public/household-model.js';
const item = (id = 'income') => ({ id, objectId: 'object', name: 'Income', description: '', type: 'income', status: 'confirmed', amount: 20_000_000,
  recurrence: { kind: 'interval', anchor: '2026-11', end: '2027-12', everyMonths: 1 }, amountChanges: [] });
function fixture() {
  const plan = { ...blankPlan(), objects: [{ id: 'object', name: 'Visible', type: 'person' }, { id: 'secret-object', name: 'Private', type: 'person' }], items: [item()],
    accounts: [{ id: 'cash', name: 'Cash' }], snapshots: [{ id: 'snapshot', accountId: 'cash', date: '2026-11-01', amount: 0 }] };
  return { ...blankHousehold(), individuals: [individualPlan('lan', plan), individualPlan('minh', blankPlan())] };
}
const edit = () => ({ ownerId: 'lan', kind: 'items', id: 'income', action: 'update', value: { ...item(), amount: 22_000_000 }, confirmed: true });

test('confirmed collaborator edits one source, retaining immutable owner and privacy', () => {
  const h = fixture(), before = JSON.stringify(h), result = applyRecordChange(h, 'minh', edit());
  assert.equal(JSON.stringify(h), before); assert.equal(result.individuals[0].ownerId, 'lan');
  assert.equal(result.individuals[0].plan.items[0].amount, 22_000_000);
  assert.deepEqual(result.individuals[0].sharing, h.individuals[0].sharing);
  assert.equal(result.individuals[1].plan.items.length, 0);
  assert.equal(projectHome(result).plan.items.length, 1);
});

test('cancel, missing identity, forged fields and foreign creation reject without changing original', () => {
  const h = fixture(), before = JSON.stringify(h);
  for (const command of [
    { ...edit(), confirmed: false }, { ...edit(), confirmed: undefined }, { ...edit(), shared: true },
    { ...edit(), value: { ...item(), ownerId: 'minh' } }, { ...edit(), value: { ...item(), id: 'other' } },
    { ...edit(), action: 'create', id: 'new', value: item('new') }, { ...edit(), ownerId: 'absent' },
    { ...edit(), kind: 'objects', id: 'object', value: { id: 'object', name: 'Changed', type: 'person' } }
  ]) assert.throws(() => applyRecordChange(h, 'minh', command));
  assert.throws(() => applyRecordChange(h, 'absent', edit()));
  assert.equal(JSON.stringify(h), before);
});

test('current privacy defeats stale edits; admin names confer no private access', () => {
  const h = setSharing(fixture(), 'lan', 'lan', 'items', 'income', false), before = JSON.stringify(h);
  for (const actor of ['minh', 'admin']) assert.throws(() => applyRecordChange(h, actor, edit()));
  assert.equal(JSON.stringify(h), before);
  assert.equal(applyRecordChange(h, 'lan', edit()).individuals[0].plan.items[0].amount, 22_000_000);
});

test('collaborators cannot attach private metadata, reparent histories or delete account history silently', () => {
  const h = fixture();
  assert.throws(() => applyRecordChange(h, 'minh', { ...edit(), value: { ...item(), objectId: 'secret-object' } }));
  assert.throws(() => applyRecordChange(h, 'minh', { ownerId: 'lan', kind: 'accounts', id: 'cash', action: 'delete', confirmed: true }));
  assert.throws(() => applyRecordChange(h, 'minh', { ownerId: 'lan', kind: 'snapshots', id: 'snapshot', action: 'update', value: { id: 'snapshot', accountId: 'elsewhere', date: '2026-11-01', amount: 1 }, confirmed: true }));
  const withBalance = applyRecordChange(h, 'minh', { ownerId: 'lan', kind: 'snapshots', id: 'snapshot', action: 'update', value: { id: 'snapshot', accountId: 'cash', date: '2026-11-01', amount: 100 }, confirmed: true });
  assert.equal(withBalance.individuals[0].plan.snapshots[0].amount, 100);
  const privateCash = setSharing(h, 'lan', 'lan', 'accounts', 'cash', false);
  assert.throws(() => applyRecordChange(privateCash, 'minh', { ownerId: 'lan', kind: 'snapshots', id: 'snapshot', action: 'delete', confirmed: true }));
});

test('shared deletion removes only selected source; owner-created records default shared', () => {
  const h = fixture();
  const deleted = applyRecordChange(h, 'minh', { ownerId: 'lan', kind: 'items', id: 'income', action: 'delete', confirmed: true });
  assert.equal(deleted.individuals[0].plan.items.length, 0); assert.equal(deleted.individuals[0].sharing.items.length, 0);
  assert.equal(deleted.individuals[0].plan.objects.length, 2); assert.deepEqual(deleted.individuals[1], h.individuals[1]);
  const added = applyRecordChange(h, 'lan', { ownerId: 'lan', kind: 'items', id: 'new', action: 'create', value: item('new'), confirmed: true });
  assert.deepEqual(added.individuals[0].sharing.items.at(-1), { id: 'new', shared: true });
  assert.equal(added.individuals[0].plan.items.at(-1).id, 'new');
  const duplicate = { ownerId: 'lan', kind: 'items', id: 'income', action: 'create', value: item(), confirmed: true };
  assert.throws(() => applyRecordChange(h, 'lan', duplicate));
});

test('history additions follow parent permission, reject date collisions and never transfer owners', () => {
  const h = fixture(), command = { ownerId: 'lan', kind: 'snapshots', id: 'next', action: 'create', value: { id: 'next', accountId: 'cash', date: '2026-11-02', amount: 100 }, confirmed: true };
  const next = applyRecordChange(h, 'minh', command);
  assert.equal(next.individuals[0].plan.snapshots.length, 2); assert.equal(next.individuals[1].plan.snapshots.length, 0);
  assert.throws(() => applyRecordChange(h, 'minh', { ...command, value: { ...command.value, date: '2026-11-01' } }));
  assert.throws(() => applyRecordChange(setSharing(h, 'lan', 'lan', 'accounts', 'cash', false), 'minh', command));
});
