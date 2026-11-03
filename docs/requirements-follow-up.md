# MS-001 — historical reopened requirements / mockup intake

> **Archived intake, 2026-11-03.** Later ticket decisions resolved the input concern, added shared typed objects, dated pooled cash/debt balances, amount shorthand and plans-only entry. Sinh subsequently requested implementation from the planned phases with one commit each in deployment d-43bcb7. See [current implementation](ms-001.md), [development plan](development-plan.md) and [verification](verification.md). The pause and unfinished-code statements below describe the earlier handoff, not the current candidate. Historical artifacts/decisions are not rewritten or promoted by this note.

**Historical state: requirements refinement; implementation PAUSED by Sinh.** These are non-sensitive intake notes, not a final specification, approved mockup, UAT acceptance or authorization to resume implementation.

Latest instruction: “please note these an push the ticket back torequirement work for further requirement/mockup develop first before continue implemtation”. This supersedes the earlier request to continue implementation. Keep MS-001 as the single canonical ticket, owned by requirements/team-manager with Sinh as decision owner. Its existing `requirement-review` status is the requirements-work column, not builder readiness.

## Collected items

| Item | Requested need | What still needs refinement |
|---|---|---|
| 1. Separate transaction entry | Separate **Thêm khoản thu** and **Thêm khoản chi** buttons, each opening a corresponding type-specific input form, rather than one combined add/type-picker flow. | Review field sets, labels/defaults, add/edit behavior and mobile/month-detail entry in a mockup. |
| 2. Recurring expense accuracy | Sinh reports that the current recurring-expense calculation is inaccurate, and explicitly requested **not to fix it yet** while collecting all items. | Obtain a synthetic reproducer: frequency, anchor/start/end, planned/actual amounts, affected months, expected versus displayed totals. Neither cause nor correction is established. Prior passing tests do not disprove this report. |
| 3. Current assets — Tài sản | A way to enter current assets with **Account name / Amount** (Tên tài khoản / Số tiền). This reopens assets for requirements work; they are no longer simply deferred from discussion. | Balance reference date, unknown/zero handling, editing and whether/how account balances contribute to opening cash. Prevent double-counting; do not automatically turn all asset value into spendable cash. Do not assume asset/debt accounting is approved. |
| 4. People-first expenses | Maintain a reusable list of people in the family, also allowing abstract names/groups such as **Friends** and **Relatives**. Expense input philosophy: **Person/group → What it is for → Details → Amount later**. | Model and mock up people/group creation/selection, rename/removal and existing-item links; distinguish person/group, purpose and category. Confirm whether one expense can reference multiple people/groups and how shared expenses are represented. These are not automatically login accounts or roles. |
| 5. Detailed monthly reference | Sinh supplied a detail-view screenshot as visual reference: months as columns, separate income/expense sections, grouped rows, cell editing, monthly totals/carry-forward and an account-based assets section. | Review which table interactions/sections to adopt, how to express person-first grouping and amount-later entry, responsive/mobile behavior, and how detailed table and current overview relate. The screenshot is a reference, not approval of every visible feature. |

Amounts may be filled later; keep **unknown distinct from zero**. Do not require a fabricated amount just to record a person/purpose/details. The reusable people list is a material extension beyond the candidate's current optional free-text personLabel.

## Boundaries retained / not inferred

- Preserve Vietnamese/whole VND, rough inputs with correct arithmetic, actual-replaces-estimate once, tentative comparison and safe saved-data handling unless explicitly revised in review.
- Retain the configurable window and initial **November 2026–December 2027 (14 consecutive months)**. The reference's twelve-column 2027 layout does not authorize dropping 2026 or resetting cash in January.
- Account balances need an explicit relationship to opening cash; listing an asset must not silently increase cash twice. Debt repayments must not be inferred from a debt balance.
- The reference also displays **debt and net-asset sections**. These remain **unconfirmed**, not approved scope. Preparation targets and daily accounting remain deferred unless explicitly requested/reviewed.
- Existing server-side JSON/shared family passphrase direction is not replaced by this intake. People labels are not individual authentication accounts by default. No database, cloud, automatic backup or network changes are authorized here.
- Do not copy the reference image, real account names/balances/debts, credentials or personal screenshots into Git, fixtures, mockups or PA tickets. Capture layout/behavior only; future examples and mockups use synthetic data.

## Required sequence before any implementation resumes

1. Finish gathering and consolidate all requested items with Sinh; do not invent missing rules or rush a calculation fix.
2. Clarify the recurrence example, people/group relationships, asset/opening-cash semantics and debt/net-asset inclusion/exclusion.
3. Prepare a revised **synthetic** requirements brief and mockup showing separate forms, people-first/amount-later entry, assets and the detailed monthly view, including empty/unknown/mobile states. Do not overwrite the preserved historical review artifacts.
4. Review the revised requirements/mockup with Sinh; record decisions and remaining exclusions. Update affected acceptance criteria, worked examples and UAT scenarios, especially recurrence, person links and double-counting safeguards.
5. Only after explicit agreement and a **fresh instruction/authorization to resume implementation**, reconcile the code candidate and its unfinished changes, then run fresh checks. Mockup review alone must not be presented as deployed code or completed UAT.

The historical r001 requirements/UAT pair and prior visual decisions remain preserved as history. This material new scope needs renewed review; do not reuse those decisions as approval of people/assets/new detail behavior. The earlier native publication/verification blocker is not repaired by this note; its existing workflow owner/run/decision must be reconciled through the supported workflow before any ordinary handoff. No new workflow run, queueing, branch, checkout, package publication or deployment is requested here.

## Paused implementation continuity

- Existing candidate lives uncommitted on `feature/MS-001-configurable-planning` in the selected ticket worktree; it is not a completed/accepted release.
- Before the pause, separate-form edits had already begun in `public/app.js`, `public/index.html`, and `public/styles.css`. They are **partial, untested and not deployed**; browser checks still need reconciliation with the new selectors. They are intentionally left untouched, not silently completed or reverted.
- Implementation/test/deploy tasks for those form changes were cancelled when Sinh paused coding. Do not treat prior 45-test/local-stack checks as verification of these later partial edits or the reported recurrence issue.
- The existing local Caddy stack at https://localhost:3081 remains the earlier candidate for reference. Do not rebuild/restart it from the partial working tree during requirements intake. No live financial state or services are changed by these notes.
- Next owner: **requirements/team-manager**, working with Sinh on intake and revised mockup. No analyst/implementation agent has been launched automatically by recording this handoff.
