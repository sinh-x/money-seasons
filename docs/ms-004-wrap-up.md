# MS-004 — wrap-up and local develop integration

## Request and boundaries

Sinh explicitly requested: “okay let wrap this up and merge this to develop”. This authorizes local integration of `feature/MS-004-expense-grouping` using the repository's **no-fast-forward merge** convention. It does not approve the external r001 requirements/UAT/matrix retrospectively, replace independent review or sign off the 16 human UAT scenarios.

Preflight: both worktrees were clean. Canonical `/home/sinh/git-repos/sinh-x/money-seasons` was on `develop` at `dcb139580444efc0a5b51afdaa8050bbdb087a13`, an ancestor of selected feature `a6c5b08709af17b1c0c379d43b2582dfa7edea55` in `/home/sinh/.treehouse/money-seasons-01c784/2/money-seasons`. This documentation is committed on the feature before integration. The resulting merge identity is obtained from `git log develop --merges`, not predicted in this file.

**No push/fetch, release/main merge, tag, branch deletion, worktree return, private-data migration or additional service restart is included.** Keep the feature checkout: the local test stack's configuration still references it. Other worktrees and the port-3080 app remain untouched.

## Delivered history

| Phase/follow-up | Commit | Scope |
|---|---|---|
| P1 | `fc42997` | Optional-v3 tag schema, strict shared validation, absent-only starters and pure monthly grouping |
| P2 | `f5f8d82` | Helper asset serving and atomic store/API/CAS/restart/export/import regressions |
| P3 | `e930d2d` | Monthly Expenses, three optional grouping dimensions plus fixed inner recurrence split, inline tags/management, dynamic schedules and amount-only visibility |
| P4 | `14e2937` | Integration/limit/collision/focus coverage, recovery regression, feature guide and unexecuted UAT addendum |
| UI feedback | `a6c5b08` | One bundled tag section; side-by-side key/value rows and individual remove buttons, including narrow screens |

Feature/compatibility guidance: [ms-004.md](ms-004.md). Tests cover missing-key **Khác**, stable identities/referenced deletion protection, draft definition atomicity, unknown versus zero, retained estimate history, no view-only saves and unchanged forecast arithmetic. Old strict readers reject optional tag fields rather than strip them; preserve private exports/tag-aware builds for rollback. Existing v1/v2 original-preservation gates remain.

## Fresh pre-merge checks

Executed at feature `a6c5b08` before this documentation-only wrap-up:

- `npm run check`: exit 0.
- `npm test`: **94/94**, zero failures/skips/cancellations/todo.
- `git diff --check develop...HEAD`: exit 0.
- Isolated Chrome runner: **33 groups / 127 axe scans**, zero detected violations, page errors or external requests.
- Logs: `/tmp/ms004-premerge-{syntax,node,browser}.log`; browser report/screenshots: `/tmp/ms004-premerge-browser.Lb6Jjr/` (ephemeral synthetic evidence).

These are local implementation checks, not native exact-FeatureSHA matrix/review admission. Axe incomplete contrast nodes remain explicitly recorded as open manual-review findings, not assumed passing results. After merging, verify both merge parents/tree equality and rerun checks from canonical `develop`; the actual completion is recorded in the final handoff, not pre-asserted here.

## Local preview already updated under separate requests

Sinh separately requested showing the implementation on the existing synthetic local stack, then requested the compact tag inputs. `https://localhost:3081` was rebuilt to production-source candidate **`a6c5b08`**. CA-verified HTTPS served the updated app/styles/helper bytes, health returned 200, unauthenticated finance/session endpoints remained 401, and both services were healthy at that check. The port-3080 container ID/image/start time were unchanged. Existing private data/passphrase/CA mounts were retained; no login, financial-record read/write, seeding or migration was performed.

The known local Caddy OCI `procReady not received` probe failure recurred during that update; restarting only local Caddy restored health. Its underlying cause remains unproven; no PID/security limits were relaxed. A short healthy result is not a permanent fix. Integration itself does not rebuild/restart or requalify this stack. Public production source is unchanged by the wrap-up documentation, so no additional restart is needed to view these features.

## Still separate / not closed by merging

- All **16 human UAT scenarios** in the [MS-004 addendum](uat.md#ms-004--human-uat-addendum-not-executed), including manual contrast/accessibility review and physical-device checks.
- Formal/native r001 requirements, matrix, workflow/source publication and independent exact-SHA review. Historical external artifacts remain unchanged; local Git integration does not advance those gates or automatically close the PA ticket.
- Real private-device/Tailscale HTTPS/ACL qualification, household rollout, data migration and backup/rollback operations.
- Permanent diagnosis of the recurring local Caddy health-probe problem.
- Any remote push/hosted PR, release to `main`, branch deletion or checkout return needs separate scope.
