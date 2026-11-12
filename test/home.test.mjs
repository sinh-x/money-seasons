import test from 'node:test';
import assert from 'node:assert/strict';
import { blankPlan, forecast, MAX_AMOUNT } from '../public/model.js';
import { blankHousehold, individualPlan, validateHousehold, projectHome, projectIndividual, setSharing, sourceIdentity } from '../public/household-model.js';

const item = (id, amount, type = 'income') => ({ id, objectId: 'person', name: 'Equal name', description: '', type, status: 'confirmed', amount,
  recurrence: { kind: 'interval', anchor: '2026-11', end: '2027-12', everyMonths: 1 }, amountChanges: [] });
function plan(amount = 20_000_000) {
  return { ...blankPlan(), objects: [{ id: 'person', name: 'Equal person', type: 'person' }], items: [item('salary', amount)],
    accounts: [{ id: 'cash', name: 'Cash' }], snapshots: [{ id: 'balance', accountId: 'cash', date: '2026-11-01', amount: 0 }],
    debtAccounts: [{ id: 'debt', name: 'Debt', direction: 'payable' }], debtSnapshots: [{ id: 'owed', accountId: 'debt', date: '2026-11-01', amount: 100 }] };
}
const home = () => ({ ...blankHousehold(), individuals: [individualPlan('lan', plan()), individualPlan('minh', plan(15_000_000))] });

test('explicit individuals retain source IDs and default sharing for all parent records', () => {
  const p = plan(), original = JSON.stringify(p), member = individualPlan('lan', p);
  assert.equal(JSON.stringify(p), original); assert.equal(member.ownerId, 'lan');
  for (const kind of ['items', 'accounts', 'debtAccounts']) assert.deepEqual(member.sharing[kind], member.plan[kind].map(r => ({ id: r.id, shared: true })));
  assert.equal(member.plan.items[0].id, 'salary');
  assert.throws(() => individualPlan('', p));
  assert.throws(() => validateHousehold(p)); // No implicit migration or inferred owner.
  const h = home(); assert.deepEqual(validateHousehold(h), h);
});

test('strict schema rejects owner collisions, missing privacy, foreign fields and inconsistent periods', () => {
  const changes = [
    h => h.individuals.push(h.individuals[0]), h => { h.individuals[0].ownerId = ''; },
    h => { h.individuals[0].admin = true; }, h => { h.individuals[0].plan.items[0].ownerId = 'minh'; },
    h => { h.individuals[0].sharing.items = []; }, h => { h.individuals[0].sharing.items[0].shared = 'true'; },
    h => { h.individuals[0].sharing.items.push({ id: 'salary', shared: false }); },
    h => { h.individuals[0].sharing.items.push({ id: 'absent', shared: true }); },
    h => { h.individuals[0].plan.startMonth = '2026-12'; }, h => { h.endMonth = '2040-01'; },
    h => { h.individuals[0].plan.items[0].amount = MAX_AMOUNT + 1; }, h => { h.users = []; }
  ];
  for (const change of changes) { const h = home(); change(h); assert.throws(() => validateHousehold(h)); }
});

test('Home uses one shared raw source per owner/ID, exact totals and separate debts', () => {
  let h = home();
  h.individuals[0].plan.items.push(item('private', 2_000_000, 'expense'));
  h.individuals[0].sharing.items.push({ id: 'private', shared: false });
  h.individuals[1].plan.items.push(item('expense', 5_000_000, 'expense'));
  h.individuals[1].sharing.items.push({ id: 'expense', shared: true });
  const original = JSON.stringify(h), view = projectHome(h), row = forecast(view.plan)[0];
  assert.equal(row.income, 35_000_000); assert.equal(row.expense, 5_000_000); assert.equal(row.opening, 0);
  assert.equal(row.closing, 30_000_000); assert.equal(view.plan.items.length, 3);
  assert.notEqual(view.plan.items[0].id, view.plan.items[1].id);
  assert.equal(view.plan.debtAccounts.length, 2); assert.equal(JSON.stringify(h), original);
  assert.deepEqual(projectHome(h), view);
  assert.equal(view.provenance.find(p => p.id === sourceIdentity('lan', 'salary')).ownerId, 'lan');
  h.individuals[0].plan.items[0].amount = 22_000_000;
  assert.equal(forecast(projectHome(h).plan)[0].income, 37_000_000);
  assert.equal(sourceIdentity('a:b', 'c'), JSON.stringify(['a:b', 'c']));
  assert.notEqual(sourceIdentity('a:b', 'c'), sourceIdentity('a', 'b:c'));
});

test('unsharing is owner-only, source-preserving, and covers complete parent histories', () => {
  const h = home(), original = JSON.stringify(h);
  for (const actor of ['minh', 'admin', '', undefined]) assert.throws(() => setSharing(h, actor, 'lan', 'accounts', 'cash', false));
  assert.equal(JSON.stringify(h), original);
  let next = setSharing(h, 'lan', 'lan', 'accounts', 'cash', false);
  next = setSharing(next, 'lan', 'lan', 'debtAccounts', 'debt', false);
  next = setSharing(next, 'lan', 'lan', 'items', 'salary', false);
  assert.deepEqual(next.individuals[0].plan, h.individuals[0].plan);
  assert.equal(projectHome(next).provenance.some(p => p.ownerId === 'lan'), false);
  assert.deepEqual(projectIndividual(next, 'lan').plan, h.individuals[0].plan);
  assert.throws(() => projectIndividual(next, 'unknown'));
  assert.throws(() => setSharing(h, 'lan', 'lan', 'snapshots', 'balance', false));
  assert.throws(() => setSharing(h, 'lan', 'lan', 'items', 'salary', 0));
});

test('Home discloses only referenced object/tag keys and values, never private metadata or plan name', () => {
  const h = home(), p = h.individuals[0].plan;
  p.name = 'PRIVATE PLAN TITLE';
  p.objects.push({ id: 'private-object', name: 'PRIVATE OBJECT', type: 'person' });
  p.items.push({ ...item('private', 1, 'expense'), objectId: 'private-object' });
  h.individuals[0].sharing.items.push({ id: 'private', shared: false });
  p.tagDefinitions = [{ id: 'tag', name: 'Purpose', values: [{ id: 'shared-value', name: 'Visible' }, { id: 'private-value', name: 'PRIVATE VALUE' }] },
    { id: 'unused', name: 'PRIVATE KEY', values: [] }];
  p.items[0].type = 'expense'; p.items[0].tags = [{ keyId: 'tag', valueId: 'shared-value' }];
  p.items[1].tags = [{ keyId: 'tag', valueId: 'private-value' }];
  const view = projectHome(h);
  assert.doesNotMatch(JSON.stringify(view), /PRIVATE|private-object|private-value|unused/);
  assert.equal(view.plan.tagDefinitions.length, 1); assert.equal(view.plan.tagDefinitions[0].values.length, 1);
  assert.equal(view.plan.items[0].tags[0].keyId, view.plan.tagDefinitions[0].id);
  assert.match(JSON.stringify(projectIndividual(h, 'lan')), /PRIVATE/);
  assert.doesNotMatch(JSON.stringify(projectIndividual(h, 'minh')), /PRIVATE/);
});

test('shared snapshots pool raw resets and unknowns; private cash is excluded, not a missing account', () => {
  const h = home(); h.individuals[1].plan.snapshots = [];
  assert.equal(forecast(projectHome(h).plan)[0].missingAccounts, 1);
  const next = setSharing(h, 'minh', 'minh', 'accounts', 'cash', false);
  assert.equal(forecast(projectHome(next).plan)[0].missingAccounts, 0);
  const empty = setSharing(next, 'lan', 'lan', 'accounts', 'cash', false);
  assert.equal(forecast(projectHome(empty).plan)[0].incomplete, true);
  h.individuals[0].plan.snapshots.push({ id: 'dec', accountId: 'cash', date: '2026-11-02', amount: 100 });
  h.individuals[0].plan.items[0].amount = null;
  const row = forecast(projectHome(h).plan)[0];
  assert.equal(row.opening, 100); assert.equal(row.incomeMissing, 1);
});

test('Home does not reuse individual list caps, but still rejects arithmetic overflow', () => {
  const p = plan(1); p.items = Array.from({ length: 500 }, (_, n) => item(`i${n}`, 1));
  const h = { ...blankHousehold(), individuals: [individualPlan('lan', p), individualPlan('minh', p)] };
  assert.equal(projectHome(h).plan.items.length, 1000);
  assert.equal(forecast(projectHome(h).plan)[0].income, 1000);
  const huge = { ...p, startMonth: '2000-01', endMonth: '2009-12' };
  huge.items = Array.from({ length: 50 }, (_, n) => ({ ...item(`i${n}`, MAX_AMOUNT), recurrence: { kind: 'interval', anchor: huge.startMonth, end: huge.endMonth, everyMonths: 1 } }));
  const overflow = { ...blankHousehold(huge.startMonth, huge.endMonth), individuals: [individualPlan('lan', huge), individualPlan('minh', huge)] };
  assert.throws(() => validateHousehold(overflow), /giới hạn/);
});
