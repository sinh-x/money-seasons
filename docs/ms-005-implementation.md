# MS-005 implementation index

## 1. Scope and status

**Partial implementation; not product acceptance or a deployable multi-user feature.**
This is the living builder index for the r003 individual-plan/live-Home requirements.
P1 adds isolated membership/schema primitives; P2a adds member-session revocation
and a current-source shared-write reducer. The production entry point, finance HTTP
API, storage format and UI still use the existing single shared plan. Do not deploy this
as privacy isolation or migrate real data on the strength of these foundations.

Requirements: `agent-teams/requirements/artifacts/packages/MS-005/ms-005-individual-home-v4/r003/requirements.md`;
paired `uat.md` contains 14 unexecuted human scenarios. Native publication decision:
`decision-fe4dafd7-fa26-4b58-8fa0-8bde65e68680`, ticket comment
`c-20261111124357001`. Raw matrix digest:
`62fee9a959883781f04ad82db1337d6e0d57254a6466a6505490412b10296e63`.
Approved bytes and historical Draft/pending labels were not edited.

## 2. Identity and baseline

Builder `d-b46794`, native `pa-advisory-runtime/v1`, sole direct orchestrator.
Canonical key/root: `money-seasons` / `/home/sinh/git-repos/sinh-x/money-seasons`.
Authenticated checkout: `/home/sinh/.treehouse/money-seasons-01c784/5/money-seasons`.
Branch: `feature/MS-005-individual-home-plans`; initial clean base/HEAD:
`d0961a35290a4e74d02965466be4b090a6b1eab7`.
Lease `8fc73e7c34ac9014e265838baa7a0426`, holder `pa:money-seasons:MS-005` retained.

Reobserved old-base delta `ae6a7cbc7d8a0376ce367312c4c94f535974db2f` → selected
base: 38 files, +2067/-154. Auth/server/UI/prefix/browser-fixture delta inspected;
finance model and persistence unchanged. Preserve MS-003 prefix allowlist,
prefix-and-instance cookies, CSRF/origin boundaries, and MS-006 external private
storage/worktree isolation. Ops files are not changed or executed by P1. No other
checkout, service, real finance or real credential source was used.

## 3. P1 changes and design

- `membership.mjs`: strict separate user and operator-role schemas, enabled-admin
  invariant, fixed-parameter salted scrypt, safe identity projection, bounded
  external private JSON reading with UID/mode/link/symlink/Git checks. No default
  credential, in-app role mutation or finance data in membership responses.
- `public/household-model.js`: v4 household envelope with common period and one
  v3 source plan per immutable owner namespace. Explicit per-parent sharing flags
  for items, cash accounts and debt accounts; histories follow their parent.
  Existing v3 financial algorithms and per-individual caps remain unchanged.
- Home is a derived projection, never persisted duplicate records. Tuple-encoded
  owner/source IDs prevent collisions; provenance accompanies each visible record.
  Only referenced objects/tag keys/**used tag values** appear. Plan titles and
  unrelated metadata are excluded. Home runs pooled raw-record arithmetic without
  a single individual's list/byte caps; exact overflow still rejects.
- Pure owner-only sharing transition preserves source/history. Its actor argument
  is a future server-authenticated input, **not** authority supplied by a browser.
- `test/membership.test.mjs`, `test/home.test.mjs`: synthetic boundary/financial
  fixtures; `package.json` includes both new runtime modules in syntax checking.

P1 addresses foundations for FR1–5, AC1–5, NFR1/3/5, with early FR8/AC8 pooled
projection tests. These tests do not establish end-to-end privacy or AC completion.

## 4. P1 checks and original failure

All commands ran in the authenticated checkout using admitted operations. Native
results include stdout/stderr/exit and settled cleanup in the deployment activity.

| Order | Command | Result | Operation |
|---|---|---|---|
| RED | `node --test test/membership.test.mjs test/home.test.mjs` | exit 1, both modules absent (test-first) | `op-17011409-a3aa-4313-a1f6-09ccf8b68290` |
| 1 | `node --test test/membership.test.mjs test/home.test.mjs` | exit 0, 12/12, no skips | `op-fd50994c-cc13-43dc-ab21-0a03c43ea5b2` |
| 2 | `npm run check` | exit 0 | `op-940a205f-c74a-413c-a78f-bf26691683c8` |
| 3 | `node --test test/model.test.mjs test/auth.test.mjs test/base-path.test.mjs test/prefix-proxy.test.mjs` | exit 0, 22/22, no skips | `op-408b45b1-49d6-4064-acf9-200c0eecf5b6` |

Node v22.23.4 / npm 10.9.9 observed. No installation. Focused checks, **not** the
requirements-owned eight-command independent matrix. Original RED failure retained;
no failed test was deleted or weakened to produce green. Commit identity is recorded
in the ticket after commit (avoids a self-referential commit hash here).

### P2a security-core checkpoint

P1 commit: `e141bb0bfac622b5c844c09d93e435f4196c19fc`.
P2 was split without weakening acceptance: P2a security primitives, then P2b durable
administration/scoped HTTP integration. P3 depends on **both**, not P2a alone.

- `membership.mjs`: validated in-memory directory, monotonic per-user session
  epochs across role revocation/restoration, reset, disable and reactivation;
  rejects member deletion, credential-version rollback and stale in-flight login.
  Its `replace()` is an internal post-durable-commit/operator port, not a public
  admin endpoint or a persistence implementation.
- `auth.mjs`: explicitly selected member provider (exclusive of legacy passphrase),
  username/password shape checks, current identity/epoch recheck on every request.
  Existing CSRF, expiry, rate limits, session capacity and prefix/instance cookie
  isolation remain. Production startup does **not** select member mode yet.
- `public/household-model.js`: confirmed current-source create/update/delete
  reducer, current sharing permission, immutable IDs/owner namespace, default
  sharing for creator-owned records, private metadata/reference restrictions,
  parent history authorization and account-deletion guards. This is not a CAS
  store: P2b must invoke it inside serialized current-identity/revision checks.
- `server.mjs`: staged member sessions are refused before touching legacy whole-plan
  reads/exports/writes, including admin members. This is a safe integration guard,
  **not** the completed scoped API. Legacy passphrase flows stay unchanged.
- Tests extend auth/membership/server and add `test/sharing.test.mjs`.

| Order | Command | Result | Operation |
|---|---|---|---|
| RED | `node --test test/auth.test.mjs test/membership.test.mjs test/persistence.test.mjs test/server.test.mjs test/sharing.test.mjs` | exit 1: missing new exports and unguarded mock-member route (200, expected 503); 30 pass/4 fail | `op-aece8929-1e09-49d8-99df-0b038f1e11d8` |
| 1 | same five-file command | exit 0, 51/51, no skips | `op-b3b6ac68-1682-402b-9221-553c612e2a3e` |
| 2 | `npm run check` | exit 0 | `op-bc4067b5-ec78-4bee-9d4e-d86e6b1a1192` |
| 3 | `node --test test/home.test.mjs test/base-path.test.mjs test/prefix-proxy.test.mjs` | exit 0, 12/12, no skips | `op-5809b45d-c370-4582-a8fe-08996e010fc5` |

All final checks completed/allowed/available with exit 0 and settled cleanup. The
first failure preceded implementation, is preserved, and was repaired by adding
missing behavior, not weakening tests. P2a addresses part of FR1–6/11 and NFR1/4/5;
no complete FR/AC acceptance is claimed. P2a commit is recorded in the ticket.

## 5. Findings and admission limits

Read-only `ppa decision verify` returned `WORKFLOW_SOURCE` at `admitted-run`
(`op-ea475320-c42a-4a9f-9756-91d36c4e555c`). CLI help shows that port is for JSON
workflow decisions, not this native document-package confirmation. No workflow
admission/recovery or approval replay attempted. Requirements approval is attributed
to existing native documents/tickets publication plus its linked JSON, not a pass
from that incompatible verifier. This advisory start is independently registry-proven.

External session-log writes were denied in preceding runs; no unchanged external
write or alternate-path workaround is attempted. This repository index and ticket
comments preserve engineering evidence, not a claim that an external session log exists.

## 6. Acceptance and boundaries

No independent review, full matrix execution, hosted CI, browser/UAT observation,
human acceptance, push/PR/merge, deployment, real migration or checkout return.
No implementation child. No legacy approval/counter history changed.
P1/P2a foundations remain unactivated until separately tested scoped
server/persistence/UI integration. Existing persisted records were not converted.

## 7. Remaining dependency-ordered work

1. P2b: durable private user management and operator-role reload, household
   persistence, authenticated scoped API reads/writes/exports, owner-only sharing,
   serialized current-member+permission+CAS checks, hostile-ID/import tests. Wire
   the P2a directory only after acknowledged durable updates; preserve the legacy
   route guard until actual scoped responses and writes are implemented. Renew
   all five-file P2 checks plus focused prefix/home/syntax checks after changes.
2. P3: common period administration, current member validation, explicit enabled
   migration owner with exact original archive, own-only import/reset and full
   pooled finance/history/tag compatibility. No automatic conversion.
3. P4: Vietnamese My/Home five-workspace UI, owner labels/privacy/admin controls,
   collaborator confirmation, five-second refresh and stale/reconnect/draft isolation;
   isolated root+prefix desktop/mobile browser qualification.
4. P5: non-secret setup/migration/recovery docs and inert example; full independent
   review inputs with current exact candidate and matrix authority.
5. Separate remote authorization, independent review, required CI, actual Sinh UAT;
   integration only after its owning gates. Operator-only checkout return is separate.

## 8. Learning and resume

Keep ownership outside the unchanged v3 plan rather than widening financial record
validators to accept credentials/roles. Scope supporting metadata down to values,
not merely whole tag keys. Never validate a pooled Home using one individual's
500-record cap. Pure-model privacy tests are necessary but cannot prove server
identity, transactional authorization, session revocation or actual live refresh.
Resume from committed P1/P2a at **P2b**, not a replay of the resolved requirements
baseline mismatch. This XL implementation is intentionally checkpointed before the
next security-critical storage/API integration; it is not ready for UAT or release.
The remaining required phases are unfinished, not skipped-and-passing.

Self-improvement (`infra`/`skill`): the workflow-only decision verifier gives an
unhelpful WORKFLOW_SOURCE for document-package IDs. Route those IDs to an explicit
read-only document decision projection, or describe the unsupported decision family
before execution. Keep native publication evidence and code-writer admission
separate; never turn this mismatch into repeated approval or a general edit veto.
A raw NUL-containing read-only inventory operation also had unproven result
publication; a fresh JSON-encoded NUL-safe observation succeeded. Preserve the
original unknown result rather than claiming a proven root cause or replaying a write.
