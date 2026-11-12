// Server-only boundary: raw household storage never crosses into HTTP responses.
// The actor is a server-issued session snapshot, not an owner ID from a request.
import { StoreError } from './persistence.mjs';
import { blankPlan, validatePlan, convertLegacy } from './public/model.js';
import { projectHome, projectIndividual, individualPlan, setSharing, applyRecordChange, blankHousehold, replaceIndividual, setPeriod } from './public/household-model.js';

const fail = (code, status) => { throw new StoreError(code, status); };
function shape(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail('invalid-command', 400);
}
export function createHouseholdService({ store, membership }) {
  function authorize(actor) {
    try {
      const current = membership.current(actor?.id);
      if (!Number.isSafeInteger(actor?.authEpoch) || current.authEpoch !== actor.authEpoch) throw new Error('revoked');
      return current;
    } catch { fail('login-required', 401); }
  }
  function projected(household, actor, scope) {
    if (!household) fail('household-initialization-required', 503);
    if (scope === 'home') {
      const view = projectHome(household);
      view.owners = [...new Set(view.provenance.map(p => p.ownerId))].map(id => {
        let name = id;
        try { name = membership.current(id).name; } catch { /* Disabled members retain records/ownership. */ }
        return { id, name };
      });
      return view;
    }
    if (scope !== 'individual') fail('invalid-scope', 400);
    if (!household.individuals.some(p => p.ownerId === actor.id)) {
      // A newly provisioned member has an empty personal view, without writing
      // anything merely by reading or inferring ownership of legacy records.
      return { scope: 'individual', ...individualPlan(actor.id, blankPlan(household.startMonth, household.endMonth)) };
    }
    return projectIndividual(household, actor.id);
  }
  async function read(actor, scope = 'individual') {
    authorize(actor);
    const state = await store.read();
    authorize(actor); // Reads can wait behind a durable write or credential revoke.
    if (state.migrationRequired) return { revision: state.revision, migrationRequired: true };
    if (!state.household) return { revision: state.revision, ...projected(blankHousehold(), actor, scope) };
    return { revision: state.revision, ...projected(state.household, actor, scope),
      ...(state.durabilityUncertain ? { durabilityUncertain: true } : {}) };
  }
  async function mutate(actor, expectedRevision, reducer) {
    const saved = await store.transact(expectedRevision, current => {
      authorize(actor);
      try { return reducer(current ?? blankHousehold()); }
      catch (e) { if (e instanceof StoreError) throw e; fail('record-change-denied', 403); }
    }, { authorize: () => authorize(actor) });
    authorize(actor);
    // An acknowledgement contains no foreign private source or credentials.
    return { revision: saved.revision };
  }
  return {
    read,
    async migration(actor) {
      if (!authorize(actor).admin) fail('admin-required', 403);
      const state = await store.read();
      if (!authorize(actor).admin) fail('admin-required', 403);
      if (!state.migrationRequired || state.durabilityUncertain) fail('migration-unavailable', 400);
      return { revision: state.revision, plan: state.legacyPlan };
    },
    async migrate(actor, input) {
      shape(input, ['expectedRevision', 'ownerId', 'confirmed']);
      if (input.confirmed !== true) fail('confirmation-required', 400);
      const check = () => {
        if (!authorize(actor).admin) fail('admin-required', 403);
        try { membership.current(input.ownerId); } catch { fail('enabled-owner-required', 400); }
      };
      check();
      const saved = await store.transact(input.expectedRevision, (current, legacy) => {
        check();
        if (current || !legacy) fail('migration-unavailable', 400);
        const plan = legacy.version === 3 ? validatePlan(legacy) : convertLegacy(legacy, { confirmed: true });
        return { ...blankHousehold(plan.startMonth, plan.endMonth), individuals: [individualPlan(input.ownerId, plan)] };
      }, { authorize: check, migrationConfirmed: true });
      return { revision: saved.revision };
    },
    edit(actor, input) {
      authorize(actor); shape(input, ['expectedRevision', 'plan', 'operation', 'confirmed', ...(Object.hasOwn(input ?? {}, 'privateRecords') ? ['privateRecords'] : [])]);
      if (input.confirmed !== true || !['edit', 'replace'].includes(input.operation)) fail('confirmation-required', 400);
      const candidate = structuredClone(input.plan);
      return mutate(actor, input.expectedRevision, current => {
        let next = replaceIndividual(current, actor.id, candidate, { replace: input.operation === 'replace' });
        if (input.privateRecords !== undefined) {
          if (!Array.isArray(input.privateRecords) || input.privateRecords.length > 1500) fail('invalid-command', 400);
          for (const record of input.privateRecords) {
            shape(record, ['kind', 'id']);
            if (!['items', 'accounts', 'debtAccounts'].includes(record.kind) || current.individuals.find(p => p.ownerId === actor.id)?.plan[record.kind].some(p => p.id === record.id)) fail('new-record-required', 400);
            next = setSharing(next, actor.id, actor.id, record.kind, record.id, false);
          }
        }
        return next;
      });
    },
    period(actor, input) {
      shape(input, ['expectedRevision', 'startMonth', 'endMonth', 'confirmed']);
      if (input.confirmed !== true) fail('confirmation-required', 400);
      return mutate(actor, input.expectedRevision, current => {
        if (!authorize(actor).admin) fail('admin-required', 403);
        return setPeriod(current, input.startMonth, input.endMonth);
      });
    },
    async export(actor, scope = 'individual') {
      const { revision, durabilityUncertain, ...view } = await read(actor, scope);
      if (durabilityUncertain) fail('durability-uncertain-restart-required', 503);
      if (view.migrationRequired) fail('migration-required', 409);
      return view;
    },
    change(actor, input) {
      authorize(actor); shape(input, ['expectedRevision', 'command']);
      const command = structuredClone(input.command);
      return mutate(actor, input.expectedRevision, current => {
        // Creating the actor's first source is part of this one atomic operation.
        if (!current.individuals.some(p => p.ownerId === actor.id)) current.individuals.push(individualPlan(actor.id, blankPlan(current.startMonth, current.endMonth)));
        return applyRecordChange(current, actor.id, command);
      });
    },
    share(actor, input) {
      authorize(actor); shape(input, ['expectedRevision', 'ownerId', 'kind', 'id', 'shared']);
      const { expectedRevision, ownerId, kind, id, shared } = structuredClone(input);
      return mutate(actor, expectedRevision, current => setSharing(current, actor.id, ownerId, kind, id, shared));
    }
  };
}
