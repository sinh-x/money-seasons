# Money Seasons — development plan

## MS-001: four-phase implementation candidate

Sinh's current request explicitly resumes implementation in the selected rogue-one checkout and requests **one commit per planned phase**. The previous intake pause is historical, not a current stop instruction for this request. Use r002's revised requirements/UAT draft and v003 mockup, not r001's superseded actual-entry/opening-cash behavior. Canonical PA package/workflow promotion and human acceptance remain separate; historical artifacts are unchanged. Sinh subsequently explicitly requested wrap-up and a local merge into `develop`; see the [integration handoff](ms-001-wrap-up.md). This authorizes local integration without claiming those separate gates complete.

| Phase | Depends on | Delivered scope | Verification |
|---|---|---|---|
| P1 Model | Foundation | v3 shared typed objects; anchored plans/estimate history; exact amount shorthand; dated cash/debt snapshots; pooled forecast | Named model/parser/accounts-debts tests; retained legacy regressions |
| P2 Persistence/access | P1 | Private serialized revision CAS/durable JSON, auth/session/CSRF, explicit legacy gate and original preservation, private mounts/local-stack tooling | Store/API/auth/deployment/local-stack tests, fault/restart/SIGKILL fixtures |
| P3 UI | P1–P2 | Five mockup-based workspaces; Income visibility; amount previews; date-aware accounts/debts; calendar table/cards/detail; conflict/export/migration flows | Isolated browser groups/axe/five widths/screenshots |
| P4 Integration | P1–P3 | Regression closure, schema/recovery/operating guidance, historical-ticket reconciliation, human UAT checklist | Six local command forms; evidence and separate remaining gates |

Commit identities and latest local evidence: [verification.md](verification.md). Candidate base is `b3d7e0fc268b23ae6906fb2c2624f736df9c64f1` on `feature/MS-001-configurable-planning`. The accepted `foundation-v0.1` remains untouched; [foundation mockup notes](mockup.md) are historical.

## Behavior retained/revised

- Vietnamese/VND; rough inputs, exact arithmetic; unknown distinct from0.
- Default2026-11–2027-12, configurable1–120 forecast months; original years and chronological carry retained. Subsequently confirmed: save full income/expense schedules independently, even beyond120 months within2000–2100; forecast only the intersection. Shrinking/moving the forecast preserves schedules/estimate history and keeps outside-window details editable.
- Shared Person/Group/Category registry, icons only; separate income/expense details. Income shows only objects with income entries, regardless of amount/schedule/status.
- Amount input defaults to thousands with shared previews and explicit-VND edit round trips.
- Dated account snapshots replace manual undated opening cash. Latest applicable reference date wins. A monthly refresh restarts the mixed-date pooled baseline; full-month plans apply. Otherwise carry forward. This is approximate planning, not reconciliation.
- Debt directions stay separate from cash. Manual repayments/collections are ordinary plans, never automatic debt settlement.
- Active actual-entry removed. Original legacy actuals/opening data retained/exported/archived before explicit conversion; no fabricated historical cash.
- One private laptop JSON family plan, shared-passphrase/Tailscale HTTPS, atomic revisioned saves, conflict refusal, manual recovery/export. Browser is not authority.

## Deliberate exclusions

No transaction ledger, paid/received tracking, automatic interest/amortization/debt netting, banks/databases, automatic/off-machine backups, multiple plans, personal login roles/membership, public/Funnel access, offline sync, noncash asset valuation, daily forecasting or preparation targets. A laptop file is not a backup. Financial records/secrets/screenshots must never enter Git/PA artifacts.

## Review and rollout still needed

1. Independent exact-FeatureSHA review and supported native workflow/source continuation through its existing owner. This explicit rogue-one implementation does not publish/promote the pending r002 draft or resolve the old publication blocker.
2. Operator separately qualifies production private filesystem/image/runtime, HTTPS/Tailscale ACLs and allowed/unauthorized devices. The localhost synthetic stack has been separately rebuilt/verified as recorded in [local-stack.md](local-stack.md); this does not qualify real-family production access. Its recurring Caddy probe issue remains unresolved.
3. Sinh executes/records all [16 human UAT scenarios](uat.md); automated checks do not accept requirements.
4. Separately authorize real-data migration, preserve originals and review legacy mapping/actual exclusion/new dated balances privately.
5. The latest explicit wrap-up request authorizes a local no-fast-forward feature merge into `develop`, preserving phase history. Release/production rollout still requires the remaining gates; push, release tags, `main` integration and checkout return are not included. Follow [Git Flow](branching.md) for subsequent release work.

Historical MS-D01/D05/D06/D07/D09 are reconciled in [tickets.md](tickets.md), not duplicated into a new backlog. Previous intake is archived in [requirements-follow-up.md](requirements-follow-up.md).
