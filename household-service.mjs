// Server-only boundary: raw household storage never crosses into HTTP responses.
// The actor is a server-issued session snapshot, not an owner ID from a request.
import { StoreError } from './persistence.mjs';
import { blankPlan } from './public/model.js';
import { projectHome, projectIndividual, individualPlan, setSharing, applyRecordChange } from './public/household-model.js';

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
    if (scope === 'home') return projectHome(household);
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
    return { revision: state.revision, ...projected(state.household, actor, scope),
      ...(state.durabilityUncertain ? { durabilityUncertain: true } : {}) };
  }
  async function mutate(actor, expectedRevision, reducer) {
    const saved = await store.transact(expectedRevision, current => {
      authorize(actor);
      if (!current) fail('household-initialization-required', 503);
      try { return reducer(current); }
      catch (e) { if (e instanceof StoreError) throw e; fail('record-change-denied', 403); }
    }, { authorize: () => authorize(actor) });
    authorize(actor);
    // An acknowledgement contains no foreign private source or credentials.
    return { revision: saved.revision };
  }
  return {
    read,
    async export(actor, scope = 'individual') {
      const { revision, durabilityUncertain, ...view } = await read(actor, scope);
      if (durabilityUncertain) fail('durability-uncertain-restart-required', 503);
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
