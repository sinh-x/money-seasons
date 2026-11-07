# MS-001 — local implementation evidence

## Four phase commits

| Phase | Commit | Scope |
|---|---|---|
| P1 | `82f1017` | Active v3 model, exact shorthand parser, dated cash/debt forecast, preserved legacy model/regressions |
| P2 | `66f3e49` | Durable private JSON/auth/API, revision conflicts, legacy preservation gate and private deployment tooling |
| P3 | `b72dcd5` | Five mockup-based workspaces, shared objects/Income visibility, previews, calendar and safe recovery/migration UI |
| P4 | See commit `test(MS-001): P4 integration regressions and recovery handoff` | Full regression closure, explicit unknown subtotal labels, populated restart/legacy preservation checks, operating/recovery/UAT guidance |

Base `b3d7e0fc268b23ae6906fb2c2624f736df9c64f1`; branch `feature/MS-001-configurable-planning`. These are local phase commits, not a merge/push/release. Prior uncommitted candidate was preserved/reconciled; no real financial inputs or secrets were committed.

## Final synthetic implementation checks

Executed in the selected checkout on 2026-11-03, before the P4 commit, then documented here. Node **v22.23.4**, npm **10.9.9**, Linux/x64, Chrome **156.0.8078.79**, Playwright1.63.0/axe4.11.1. The six r002 command forms were used as **local implementation checks**, not an independently admitted exact-FeatureSHA/matrix review. No native package/source/matrix approval is claimed.

| Check | Actual result |
|---|---|
| `test -n "$(command -v google-chrome)" && npm run check` | Exit0; production modules syntax checked |
| `node --test test/model.test.mjs test/amount-input.test.mjs test/accounts-debts.test.mjs` | Exit0; **15/15** |
| `node --test test/server.test.mjs test/persistence.test.mjs test/auth.test.mjs` | Exit0; **31/31** |
| `node --test test/deployment.test.mjs` | Exit0; **4/4** |
| `npm test` | Exit0; **64/64**, zero failures/skips/cancellations/todo; includes12 legacy regressions and2 local-stack checks |
| `BROWSER_PATH="$(command -v google-chrome)" BROWSER_ARTIFACTS="$(mktemp -d /tmp/ms-001-browser.XXXXXX)" npm run test:browser` | Exit0; **16 groups,66 axe scans**, zero detected violations/page errors/external requests |
| `git diff --check` | Passed |
| Both Compose configs | Parsed with `config --quiet`; production config used explicitly synthetic placeholder paths/origin, no real config/secrets or containers |

The first unconfigured production Compose parse correctly refused missing required private environment variables; a separate parse with synthetic placeholders passed. This is configuration validation only, not a build, storage mount or runtime qualification.

Node logs are ephemeral `/tmp/ms001-final-{model,server,deployment,all}.log`; final browser report/screenshots/synthetic exports are in `/tmp/ms-001-browser.eIt606/`. They are not committed or a durable evidence service. The browser report records intentional401/409/503 cases and one deliberately lost-ack `ERR_FAILED`; it rejects unexpected response/failure paths. All contexts, stores, ports and fault/SIGKILL children belong to the harness. No production endpoint/profile/disk-fill operation was used.

### What the checks cover

- Default14-month identities/window bounds; anchored schedules and forward estimates; exact scaled inputs/roundtrip/overflow; unknown vs0, reversible tentative inclusion.
- Shared typed stable objects, same-name disambiguation, cross-tab rename, safe deletion, Income presence rules, hostile text rendered inertly.
- Cash snapshot dates/order/future rejection/same-day corrections; worked mixed-date pooled reset/full refresh-month plan/carry; separate debt totals and ordinary manual plans.
- Populated objects/plans/history/cash/debt persist across owned close/reopen; private modes/aliases/corruption/sole writer; CAS; file-sync/rename/directory-sync failures, ENOSPC/EACCES/EROFS injection, owned-child SIGKILL old/new completeness.
- Private auth/session/expiry/logout/restart/attempt/Origin/CSRF boundaries; explicit original download/legacy exclusion, byte-exact server archives, archive failure unchanged, active lossless exports/imports/cancel/invalid.
- Browser conflict retains form/candidate/export; manual reload/reapply; lost ack reread; unavailable retry gated by reread.
- All five populated workspaces and object/plan/cash/debt dialogs at320/360/390/768/1440px; contained table scrolling/card alternative, maximum-size values/long names/unknown totals, keyboard Escape/focus restoration; named WCAG2 A/AA+2.1 AA scans.

### Agent visual observation

Inspected actual Chrome screenshots of desktop calendar, mobile expense objects/details and mobile month detail. Observed year-visible chronological columns, separately grouped flows and explicit unknown labels, contained scrolling, readable parsed/maximum values, stacked narrow-screen controls/cards and labeled native month dialog. This is agent observation of synthetic data, **not Sinh's UAT** or an accessibility certification.

## Focused debt-total verification

Sinh requested checking debt totals. Read-only source review plus synthetic regressions found **no arithmetic defect in the exercised cases**; no production model/UI change was needed. This does not verify household inputs or constitute human UAT.

The model and rendered Debt summary both use the latest reference-dated snapshot **applicable to the selected month**, once per account; history is not summed. Payable/receivable directions remain separate, missing balances are counted as unknown, and explicit0 is known0. A later-entered historical record cannot override a newer applicable date; a later-month balance cannot flow backward. Same-day corrections replace once and preserve the snapshot ID. Planned repayments/collections remain ordinary cash plans and do not automatically reduce debt balances.

Shared fixture `scripts/debt-fixture.mjs` contains only synthetic accounts/dates/VND. Independently worked results: November payable8000+4000=12000 plus one unknown; receivable2500 plus one unknown. December payable7000+0=7000 plus one unknown; receivable2000+1500=3500. January without updates keeps those debt references (not cash-flow subtraction). Browser verified all summary/card figures, monthly switching without saves, and same-day historical correction without a cash change. Also checked reordered/backfilled history, duplicate-looking names with distinct IDs, missing versus0, invalid debt dates/amounts/links/duplicate days, maximum500 accounts with exact totals, and a separate sorted-history reference across a synthetic year.

Syntax/diff checks and **74/74 Node tests** passed, including10 focused accounts/debts tests. Isolated browser: **19 groups/97 axe scans**, zero detected violations/page errors/external requests. Inspected the synthetic Debt totals screenshot. Ephemeral artifacts: `/tmp/ms-001-browser.yYVAsn/`; Node log `/tmp/ms001-debt-total-tests.log`. Tests use their owned temporary server/store/profile only. No existing plan/passphrase was read, no live service updated or real debt changed; this is regression coverage/documentation only, so no local-stack rebuild is required.

## Confirmed follow-up: collapse overall/detail views

Sinh selected all four requested locations: Income/Expense object cards, calendar object groups, whole calendar income/expense sections and cash/debt history. Implemented page-local view controls plus workspace-scoped collapse-all/expand-all, keeping names/counts/monthly totals and account/section balances visible. Nested group state survives a parent section toggle. Native keyboard buttons expose expanded/control relationships; focus and contained table scroll positions survive rerenders. A full reload resets disclosure choices; no schema, financial export, save or calculation change.

Local syntax/diff checks and **69/69 Node tests** passed. Isolated browser run: **18 groups/96 axe scans**, zero detected violations/page errors/external requests. Added five-width checks for all four locations, nested state, preserved unknown/partial totals, Enter/Space/focus/scroll behavior, valid control targets, zero PUT requests and byte-for-field unchanged server envelope/revision. Inspected synthetic collapsed mobile Expense and desktop Calendar screenshots. Ephemeral artifacts: `/tmp/ms-001-browser.ByraBN/`; Node log `/tmp/ms001-collapse-tests.log`. After a separate foreground confirmation, collapse-controls commit `9707513` was rebuilt/deployed to `https://localhost:3081`. All six public assets match the checkout over CA-verified HTTPS, finance/session endpoints still401/no-store, and both services were healthy at verification. Private data/passphrase/CA mounts retained; no authenticated plan read/write/migration. The old3080 instance retained its exact ID/image/start time. Caddy's already documented probe issue had recurred; only local Caddy was restarted as part of the authorized update. Its underlying cause remains unproven and no security/PID limits were relaxed. Human UAT remains Not run.

## Confirmed follow-up: schedules independent of forecast windows

Sinh confirmed: save the full income/expense schedule independently, forecast only overlapping months, and do not automatically extend the forecast. This supersedes only the old window-exclusion rejection; supported dates, history validation, arithmetic and data preservation remain. Active v3 schema is unchanged; no plan migration is needed. Saved schedules may span more than120 months within2000–2100, while each forecast remains1–120 months.

Local syntax and **69/69 Node tests** passed, zero failures/skips/cancellations/todo. Browser: **17 groups/66 axe scans**, zero detected violations/page errors/external requests. New synthetic model/API/browser checks cover a long yearly schedule, schedules entirely before/after the forecast, anchored gaps, ignored out-of-window unknowns, out-of-window estimate editing, persisted/exported future history, and shrinking/moving/expanding the window without altering saved entries. Existing populated-store restart coverage now includes a schedule and change point beyond the window. Browser artifacts: `/tmp/ms-001-browser.F3bjqx/`; Node log: `/tmp/ms001-independent-schedule-tests.log` (ephemeral, synthetic only).

The behavior was checked on an owned temporary fixture, not by changing household data. After a separate foreground confirmation, `b474963` was rebuilt/deployed to the localhost test stack. CA-verified HTTPS public assets match the checkout; unauthenticated finance endpoints remain denied; old3080 container ID/image/start time unchanged. Private storage/credentials retained, no authenticated finance read/write/migration. Caddy's prior OCI probe failure recurred despite the concurrency bound; a scoped Caddy restart restored healthy probes, but the underlying host/runtime cause remains unproven. Both services were healthy at verification. Human UAT and native workflow promotion remain unclaimed.

## Separately authorized local-stack follow-up

After the four-phase implementation, Sinh requested updating the local stack. The app was rebuilt, the local web service recreated, and the pre-existing Caddy health failure resolved with bounded `GOMAXPROCS=2`, retaining the64-PID cap. Both services are healthy. CA-verified HTTPS serves0.3.0; all six deployed HTML/JS/CSS assets match the checkout; unauthenticated finance/session requests return401/no-store. All64 Node tests passed after the config adjustment. The old3080 container ID/image/start time remained unchanged. No login/finance read/migration or host trust/private-network changes were performed. See [current update evidence](local-stack.md#current-v3-update-2026-11-03-explicitly-requested).

The unperformed runtime line below describes the original four-phase implementation checkpoint; the follow-up supersedes it **only for the localhost test stack**, not real-family rollout, UAT or independent review.

## Still not performed / not claimed (four-phase checkpoint)

- Native workflow/source continuation, package/matrix promotion and independent exact-FeatureSHA review or Critical/Major clearance.
- Fresh Docker image build/container restart/runtime qualification; existing3080/3081 stacks remain untouched/possibly older. Historical local-Caddy results are explicitly historical.
- Real Tailscale HTTPS/ACL/device denial, host trust/firewall changes, hardware power-loss testing, other browsers or physical phones.
- Real-data/secret access, actual plan migration, off-machine backup, merge/push/release or checkout return.
- All **16 human UAT scenarios remain Not run**: [uat.md](uat.md). Operator rollout and Sinh acceptance are separate actions.

## MS-004 — local implementation checks

Scope: [monthly Expenses, structured tags and amount visibility](ms-004.md). Explicit local P1–P4 implementation/test/commit authorization was confirmed in `d-97f1cd`. External r001 requirements/UAT/matrix approval remains pending; these are implementation checks, not native promotion or an independently admitted exact-SHA review. Existing MS-001/MS-002 evidence above remains historical.

| Phase | Commit | Scope |
|---|---|---|
| P1 | `fc42997` | Optional-v3 tags, absent-only starters, strict shared validation and pure monthly grouping; 38 targeted tests passed |
| P2 | `f5f8d82` | Helper asset allowlist; atomic store/API, CAS/invalid/declined/restart/empty-library regression fixtures; 35 tests passed |
| P3 | `e930d2d` | Monthly UI, three grouping slots/fixed type, inline tags/management, dynamic schedules, money-only switches; 92 Node tests, 32 browser groups/127 axe scans passed |
| P4 | Commit titled `test(MS-004): complete integration coverage and feature handoff` | Fixture/payload/collision bounds, retained view-control focus, queued-confirmation-close regression, shared row-library projection, in-app help and documentation/UAT addendum |

Final pre-P4-commit checks were run on Linux/x64 with Node **v22.23.4**, npm **10.9.9**, Chrome **156.0.8078.79**, Playwright **1.63.0**, axe **4.11.1**. Existing canonical development dependencies matched the worktree lockfile and were reused through a temporary local symlink; no install, lockfile change or runtime dependency was added. All servers/stores/browser contexts were owned synthetic fixtures, ephemeral loopback ports only; no existing 3080/3081 service, household record, credential or real-data migration was accessed.

| Local command (r001 seven-command forms) | Actual result |
|---|---|
| `npm run check` | Exit 0, including `public/expense-tags.js` syntax |
| `node --test test/expense-tags.test.mjs test/model.test.mjs test/amount-input.test.mjs test/accounts-debts.test.mjs test/demo-data.test.mjs` | Exit 0; **40/40** |
| `node --test test/server.test.mjs test/persistence.test.mjs test/auth.test.mjs` | Exit 0; **35/35** |
| `node --test test/deployment.test.mjs test/local-stack.test.mjs` | Exit 0; **7/7**; no container deployment |
| `npm test` | Exit 0; **94/94**, zero failures/skips/cancellations/todo |
| `test -n "$(command -v google-chrome)" && BROWSER_PATH="$(command -v google-chrome)" BROWSER_ARTIFACTS="$(mktemp -d /tmp/ms004-browser.XXXXXX)" npm run test:browser` | Exit 0; **33 groups / 127 axe scans**, zero detected violations/page errors/external requests |
| `git diff --check` | Exit 0 |

Ephemeral logs: `/tmp/ms004-p4-{syntax,model,store,deployment,all,browser}-final.log`. Browser report/screenshots/synthetic exports: `/tmp/ms004-browser.JiOscV/`. These paths are temporary evidence, not durable release artifacts. The seven commands are rerun after the P4 commit before handoff; no independent workflow authority is inferred from their exit codes.

Coverage includes November 8/December 4 occurrences, known 12,050,000 + 2 unknown versus tentative 13,850,000 + 2, grouping permutations/one membership/Khác/empty objects, exact starter names, no view-only PUTs, explicit-empty/old-v3 compatibility, optional tag rows/definitions, atomic cancellation/invalid/declined/conflict handling, identity-preserving rename/protected deletion, imported IDs named `new`, NFC/code-point/case/name rules, payload limit, once/monthly/yearly/custom schedules, hidden invalid and zero/unknown/literal amounts, December estimate with earlier/later history, tagged restart/export/import, five widths and keyboard/focus/reload defaults. Existing demo, Income, calendar, cash/debt, auth/CAS, legacy-original and fault/recovery tests pass.

An additional isolated check loaded the **actual pre-MS-004 model source from base `dcb139580444efc0a5b51afdaa8050bbdb087a13`** through a data module, using unchanged legacy/demo imports: old untagged fixture accepted, tagged v3 rejected with the strict unsupported-field error, input unchanged. No old reader stripped fields or touched a saved store. Starter ID collision-chain regression also verifies allocated IDs remain within the 80-character bound.

### Failures retained, then repaired

P3 browser attempts `/tmp/ms004-p3-browser-01.log` through `-09.log` and their `/tmp/ms004-browser.*` failure artifacts were retained. Initial failures exposed outdated harness assumptions (all schedules shown by default, visible money, option-disabled assertions and row ordering); the harness now explicitly selects the intended view/identity. A later import-confirmation timeout exposed a queued old close event clearing a new confirmation callback; the product guard and a deterministic browser regression repair that race. A PA output-safety hook rejected an ambiguous dynamic log destination before execution; final checks use explicit `/tmp/ms004-p4-*.log` paths. No failed run is represented as passing.

### Accessibility finding and agent observation

The recorded final browser run has **109/127 scans with incomplete color-contrast results** (including obscured/off-viewport text and short icon content). Every incomplete node/reason is retained in `report.json` under an explicit **open manual-review finding for Sinh**, not counted as passing contrast evidence. No human accessibility certification, Critical/Major clearance or accepted/deferred severity disposition is claimed.

Inspected actual synthetic desktop grouping/form and narrow-screen month/form/tag-row screenshots. Observed month context above summaries, readable stacked controls, adjacent native switch/label, visible keyboard focus, retained inline tag fields and save/remove actions, without unintended horizontal overflow in automated checks. This is agent screenshot observation only; it does not resolve every incomplete contrast result or substitute for human UAT/physical-device testing.

All **16 MS-004 human UAT scenarios remain Not run**; see the [addendum](uat.md#ms-004--human-uat-addendum-not-executed). Formal r001/native package and matrix approval, independent exact-SHA review, real-device/network checks, rollout, merge/push and checkout return remain separate and unperformed.
