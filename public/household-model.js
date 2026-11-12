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
// A whole-plan editor is owner-only. Existing privacy survives both edits and
// confirmed imports; new parents default shared. No ownership or roles in input.
export function replaceIndividual(source, actorId, candidate, { replace = false } = {}) {
  const next = validateHousehold(source), plan = validatePlan(candidate);
  if (plan.startMonth !== next.startMonth || plan.endMonth !== next.endMonth) fail();
  const old = next.individuals.find(p => p.ownerId === actorId);
  if (!replace && old) for (const [kind, history] of [['accounts', 'snapshots'], ['debtAccounts', 'debtSnapshots']]) {
    if (old.plan[kind].some(a => !plan[kind].some(b => b.id === a.id) && old.plan[history].some(s => s.accountId === a.id))) fail();
  }
  const own = individualPlan(actorId, plan);
  for (const kind of parents) for (const permission of own.sharing[kind]) {
    permission.shared = old?.sharing[kind].find(p => p.id === permission.id)?.shared ?? true;
  }
  if (old) next.individuals[next.individuals.indexOf(old)] = own;
  else next.individuals.push(own);
  return validateHousehold(next);
}
export function setPeriod(source, startMonth, endMonth) {
  const next = validateHousehold(source);
  monthRange(startMonth, endMonth);
  Object.assign(next, { startMonth, endMonth });
  for (const owner of next.individuals) Object.assign(owner.plan, { startMonth, endMonth });
  return validateHousehold(next);
}
export function setSharing(source, actorId, ownerId, kind, recordId, shared) {
  if (actorId !== ownerId || !validOwner(actorId) || !parents.includes(kind) || typeof shared !== 'boolean') fail();
  const next = validateHousehold(source), owner = next.individuals.find(member => member.ownerId === ownerId);
  const permission = owner?.sharing[kind].find(record => record.id === recordId);
  if (!permission) fail();
  permission.shared = shared;
  return validateHousehold(next);
}

// Pure transaction reducer: the persistence owner must call it against CURRENT
// source and a CURRENT authenticated actor inside its serialized CAS operation.
// It does not itself acknowledge a save, authenticate a member or grant admin.
export function applyRecordChange(source, actorId, command) {
  if (!command || !['create', 'update', 'delete'].includes(command.action)) fail();
  shape(command, ['ownerId', 'kind', 'id', 'action', 'confirmed', ...(command.action === 'delete' ? [] : ['value'])]);
  const { ownerId, kind, id, action, value } = command;
  const historyParent = { snapshots: 'accounts', debtSnapshots: 'debtAccounts' };
  if (command.confirmed !== true || !validOwner(actorId) || !['items', 'accounts', 'debtAccounts', 'snapshots', 'debtSnapshots'].includes(kind)) fail();
  const next = validateHousehold(source);
  if (!next.individuals.some(member => member.ownerId === actorId)) fail();
  const owner = next.individuals.find(member => member.ownerId === ownerId);
  if (!owner) fail();
  const records = owner.plan[kind], existing = records.find(record => record.id === id);
  if ((action === 'create' && existing) || (action !== 'create' && !existing)) fail();
  if (action !== 'delete' && (!value || value.id !== id)) fail();
  const parent = historyParent[kind];
  if (parent && existing && value && existing.accountId !== value.accountId) fail();
  if (actorId !== ownerId) {
    // A new top-level record always belongs to its creator. A new snapshot is
    // instead part of an already-shared parent's history with the parent's owner.
    if (action === 'create' && !parent) fail();
    const permissionId = parent ? (existing ?? value).accountId : id;
    if (!owner.sharing[parent ?? kind].some(permission => permission.id === permissionId && permission.shared)) fail();
    if (kind === 'items' && value) {
      const sharedItems = owner.plan.items.filter(item => owner.sharing.items.some(permission => permission.id === item.id && permission.shared));
      if (!sharedItems.some(item => item.objectId === value.objectId)) fail();
      for (const tag of value.tags ?? []) {
        if (!sharedItems.some(item => item.tags?.some(known => known.keyId === tag.keyId && known.valueId === tag.valueId))) fail();
      }
    }
  }
  if (action === 'delete') {
    const history = kind === 'accounts' ? 'snapshots' : kind === 'debtAccounts' ? 'debtSnapshots' : null;
    if (history && owner.plan[history].some(snapshot => snapshot.accountId === id)) fail();
    owner.plan[kind] = records.filter(record => record.id !== id);
    if (parents.includes(kind)) owner.sharing[kind] = owner.sharing[kind].filter(permission => permission.id !== id);
  } else if (action === 'create') {
    records.push(structuredClone(value));
    if (parents.includes(kind)) owner.sharing[kind].push({ id, shared: true });
  } else records[records.indexOf(existing)] = structuredClone(value);
  return validateHousehold(next);
}
