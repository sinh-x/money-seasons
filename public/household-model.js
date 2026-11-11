// Credential-free owner-scoped finance schema. Each individual holds the one
// authoritative v3 source plan; ownership is the immutable parent ownerId, not a
// caller-editable label on a copied Home record. The server owns identity/CAS.
import { blankPlan, validatePlan, forecast, debtTotal, monthRange } from './model.js';

const parents = ['items', 'accounts', 'debtAccounts'];
const fail = () => { throw new Error('invalid-household'); };
const validOwner = id => typeof id === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(id);
function shape(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail();
}
export function sourceIdentity(ownerId, id) { return JSON.stringify([ownerId, id]); }
export function blankHousehold(startMonth = '2026-11', endMonth = '2027-12') {
  monthRange(startMonth, endMonth);
  return { version: 4, currency: 'VND', startMonth, endMonth, individuals: [] };
}
// Explicit constructor, NOT migration authorization. The eventual migration
// transaction must preserve original bytes and validate the selected enabled user.
export function individualPlan(ownerId, source) {
  if (!validOwner(ownerId)) fail();
  const plan = validatePlan(source);
  return { ownerId, plan, sharing: Object.fromEntries(parents.map(kind => [kind, plan[kind].map(({ id }) => ({ id, shared: true }))])) };
}
export function validateHousehold(source) {
  shape(source, ['version', 'currency', 'startMonth', 'endMonth', 'individuals']);
  if (source.version !== 4 || source.currency !== 'VND' || !Array.isArray(source.individuals)) fail();
  monthRange(source.startMonth, source.endMonth);
  const next = structuredClone(source), owners = new Set();
  for (const individual of next.individuals) {
    shape(individual, ['ownerId', 'plan', 'sharing']);
    if (!validOwner(individual.ownerId) || owners.has(individual.ownerId)) fail();
    owners.add(individual.ownerId);
    individual.plan = validatePlan(individual.plan);
    if (individual.plan.startMonth !== next.startMonth || individual.plan.endMonth !== next.endMonth) fail();
    shape(individual.sharing, parents);
    for (const kind of parents) {
      const permissions = individual.sharing[kind], records = individual.plan[kind], seen = new Set();
      if (!Array.isArray(permissions) || permissions.length !== records.length) fail();
      for (const permission of permissions) {
        shape(permission, ['id', 'shared']);
        if (typeof permission.shared !== 'boolean' || seen.has(permission.id) || !records.some(record => record.id === permission.id)) fail();
        seen.add(permission.id);
      }
    }
  }
  // Derived Home is not an individual plan: do not enforce a single individual's
  // list/byte caps, but do check exact pooled arithmetic including tentative flows.
  const home = sharedProjection(next).plan;
  forecast(home); forecast(home, true);
  for (const month of monthRange(next.startMonth, next.endMonth)) {
    debtTotal(home, 'payable', month); debtTotal(home, 'receivable', month);
  }
  return next;
}
function sharedProjection(household) {
  const plan = { ...blankPlan(household.startMonth, household.endMonth), name: 'Home', tagDefinitions: [] }, provenance = [];
  for (const { ownerId, plan: source, sharing } of household.individuals) {
    const included = Object.fromEntries(parents.map(kind => [kind, new Set(sharing[kind].filter(p => p.shared).map(p => p.id))]));
    const items = source.items.filter(record => included.items.has(record.id));
    const objectIds = new Set(items.map(item => item.objectId));
    const usedTags = new Map();
    for (const item of items) for (const tag of item.tags ?? []) {
      if (!usedTags.has(tag.keyId)) usedTags.set(tag.keyId, new Set());
      usedTags.get(tag.keyId).add(tag.valueId);
    }
    const id = value => sourceIdentity(ownerId, value);
    function add(kind, record, map = {}) {
      plan[kind].push({ ...structuredClone(record), id: id(record.id), ...map });
      provenance.push({ kind, id: id(record.id), ownerId, sourceId: record.id, shared: true });
    }
    for (const record of source.objects.filter(record => objectIds.has(record.id))) add('objects', record);
    for (const record of items) add('items', record, { objectId: id(record.objectId),
      ...(Object.hasOwn(record, 'tags') ? { tags: record.tags.map(tag => ({ keyId: id(tag.keyId), valueId: id(tag.valueId) })) } : {}) });
    for (const kind of ['accounts', 'debtAccounts']) for (const record of source[kind].filter(record => included[kind].has(record.id))) add(kind, record);
    for (const [kind, parent] of [['snapshots', 'accounts'], ['debtSnapshots', 'debtAccounts']]) {
      for (const record of source[kind].filter(record => included[parent].has(record.accountId))) add(kind, record, { accountId: id(record.accountId) });
    }
    for (const key of source.tagDefinitions ?? []) {
      if (!usedTags.has(key.id)) continue;
      // Key names are necessary; unrelated values of a used key are still private.
      add('tagDefinitions', key, { values: key.values.filter(value => usedTags.get(key.id).has(value.id)).map(value => {
        provenance.push({ kind: 'tagValues', id: id(value.id), ownerId, sourceId: value.id, shared: true });
        return { ...value, id: id(value.id) };
      }) });
    }
  }
  return { scope: 'home', plan, provenance };
}
export function projectHome(source) { return sharedProjection(validateHousehold(source)); }
// actorId must come from an authenticated current server identity, never a query
// parameter supplied as an arbitrary owner to browse. Admin has no bypass here.
export function projectIndividual(source, actorId) {
  const h = validateHousehold(source), individual = h.individuals.find(member => member.ownerId === actorId);
  if (!individual) fail();
  return { scope: 'individual', ...individual };
}
export function setSharing(source, actorId, ownerId, kind, recordId, shared) {
  if (actorId !== ownerId || !validOwner(actorId) || !parents.includes(kind) || typeof shared !== 'boolean') fail();
  const next = validateHousehold(source), owner = next.individuals.find(member => member.ownerId === ownerId);
  const permission = owner?.sharing[kind].find(record => record.id === recordId);
  if (!permission) fail();
  permission.shared = shared;
  return validateHousehold(next);
}
