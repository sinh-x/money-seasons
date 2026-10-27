# Money Seasons — ticket index and historical drafts

**Status: requirements ticket MS-001 created. Sinh accepted the mockup/local Docker foundation; full MVP implementation is not approved.**

## Active requirements ticket

| PA ID | Title | Status | Owner |
|---|---|---|---|
| **MS-001** | Gather Sinh's usage requirements for November 2026–December 2027 planning | idea — requirements/input first | sinh |

View the canonical ticket with `ppa ticket show MS-001`. It covers personal input needs and usage adjustments for a continuous **14-month** plan, including opening-balance reference, cross-year carry-forward/recurrence/actuals, and safe preservation of existing 2027 data. This is a requirements ticket, not implementation authorization. Keep personal financial values in an agreed private location, not in Git or PA ticket content. Do not duplicate the ticket's acceptance criteria here.

Saved foundation: commit `ca0fda1`, annotated tag `foundation-v0.1`. No other draft has been converted.

## Historical local drafts

The **MS-Dxx** local IDs below are planning references, not PA ticket numbers. Scope follows the [development plan](development-plan.md): a personal, local-only tool for one individual or one family, with lightweight setup and approximate annual/monthly planning.

All **MS-Dxx historical drafts** remain **Draft**. This does not describe the separate registered MS-001 requirements ticket. Dependencies describe proposed ordering, not approval. Sinh is the scope and user-acceptance decision owner. Vietnamese/VND is selected for the mockup; final finance rules, product scope and long-term stack remain subject to review. No delivery dates or estimates are committed.

## Mockup evidence — not ticket completion

The latest request advanced a local interactive mockup before final design/flow agreement. It provides partial exploration/evidence relevant to D02–D07, but does not close their scope or human-review gates. The static server/Docker foundation is an explicit update to the earlier browser-only deployment boundary; there is still no financial-data backend. See [mockup assumptions, test results and review checklist](mockup.md). Sinh has now accepted it as a starting foundation and requested a requirements ticket for personal inputs/usage adjustments and November 2026–December 2027 planning. This is not detailed completion of these drafts. The requested follow-up is now **MS-001** above. Use it as the canonical next requirements work item, reconcile related drafts after Sinh's input, and do not create a parallel implementation backlog.

## Historical draft overview

| Local ID | Title | Depends on |
|---|---|---|
| MS-D01 | Agree MVP rules and a synthetic household year | — |
| MS-D02 | Prototype a lightweight personal/family planning flow | D01 |
| MS-D03 | Choose stack and establish local persistence/recovery | D01, D02 |
| MS-D04 | Implement the monthly planning model and engine | D01, D03 |
| MS-D05 | Build minimal setup and current-position editing | D02, D03, D04 |
| MS-D06 | Build the editable annual map and month detail | D04, D05 |
| MS-D07 | Add actual amounts and monthly review | D06 |
| MS-D08 | Add basic preparation targets, if retained in the MVP | D06; scope gate in D01 |
| MS-D09 | Validate and harden the local MVP | D07, D08 if retained |

## MS-D01 — Agree MVP rules and a synthetic household year

**Goal:** turn the agreed direction into a small, testable specification before selecting a framework or implementing screens.

### Scope

- Confirm the annual/monthly MVP and optional preparation-target boundary.
- Decide language/currency, planning period, opening cash reference point, mid-year setup, and unknown/empty states.
- Define confirmed versus tentative commitments and which enter the baseline forecast.
- Define plan/actual substitution, the treatment or explicit deferral of partial/late payments, and edits to future recurring occurrences.
- Specify simple recurrence patterns and lightweight asset/debt fields without introducing bookkeeping or an amortization engine.
- Establish how cash, liquid savings, non-liquid assets, debt balances, and reservations avoid double-counting.

### Acceptance criteria

- [ ] Sinh reviews a concise scope showing confirmed decisions, excluded features, and intentionally unsupported cases.
- [ ] A committed synthetic 12-month example includes opening cash, recurring income/expenses, one large annual cost, an existing debt/repayment, a non-liquid asset, a tentative cost, a missing amount, and a planned event with an actual amount.
- [ ] Expected monthly balances demonstrate carry-forward and a projected shortage; changing the tentative-item assumption has an explicitly documented effect.
- [ ] Missing values produce incomplete estimates, not an apparent zero cost. The monthly forecast limitation is stated in plain language.
- [ ] Where preparation is included, the example shows the target gap and whether a proposed contribution is feasible under the stated assumptions; no promise of guaranteed affordability.
- [ ] The plan and downstream drafts are updated to match the decisions; unresolved essentials block implementation readiness.

**Evidence:** reviewed scope, decision record, synthetic inputs and expected outputs. No personal financial data.

## MS-D02 — Prototype a lightweight personal/family planning flow

**Goal:** validate the experience before committing to application architecture.

**Dependencies:** MS-D01.

### Acceptance criteria

- [ ] Prototype covers opening cash/planning period → income/expenses → annual map → month detail, with optional inventory and actuals; include preparation only if retained.
- [ ] No sign-in, household selector, invitations, roles, mandatory family-member list, or required full asset/debt wizard.
- [ ] Users can list items before amounts, skip optional details, and return to edit them.
- [ ] Empty, unknown, tentative, negative-balance, and plan/actual states are visibly distinct and follow D01 rules.
- [ ] Mobile uses a readable list or stacked months; keyboard interaction, labels, and non-color-only warnings are specified.
- [ ] Sinh reviews the prototype and records feedback on finding an expensive month and understanding the warning. A generated HTML file alone does not satisfy review.

**Evidence:** synthetic prototype and human review notes. No production persistence or unapproved stack requirement.

## MS-D03 — Choose stack and establish local persistence/recovery

**Goal:** create only the foundation needed for a single local plan.

**Dependencies:** MS-D01, MS-D02.

### Acceptance criteria

- [ ] Review the mockup's provisional framework/storage choices and record the selected long-term approach, supported browser assumptions, and tradeoffs.
- [ ] The calculation model is independent of browser storage; no financial-data backend, account system, speculative sync, or generic multi-household framework is built. The mockup's local static server/Docker foundation is allowed by the latest request.
- [ ] A minimal application can save and reload a synthetic single-plan record, including its schema version.
- [ ] Versioned export/import round-trips money, currency, period, ownership labels where used, statuses, planned/actual amounts, and optional inventory without precision loss.
- [ ] Invalid, malformed, and unsupported-version imports do not overwrite the existing plan. Replacement/reset requires explicit confirmation and a recovery/export opportunity.
- [ ] Storage failures and unavailable storage are surfaced rather than reporting a false successful save.
- [ ] Explain that local does not mean encrypted or backed up: browser clearing, private browsing, device loss, shared browser profiles, and sensitive export files have visible warnings.
- [ ] Build/test commands and local startup instructions are documented; no finance payload is sent to a service or analytics endpoint.

**Evidence:** technical decision, minimal scaffold, persistence/import tests. Export schema can evolve through explicit versions; full domain round-trip is checked again in D09.

## MS-D04 — Implement the monthly planning model and engine

**Goal:** implement deterministic estimates without pretending they are exact-day accounting.

**Dependencies:** MS-D01, MS-D03.

### Acceptance criteria

- [ ] Exact money representation and explicit currency follow D01; missing and zero values remain distinct.
- [ ] Opening cash carries forward through the selected period with monthly inflows/outflows and a completeness indicator.
- [ ] Recurring and one-off occurrences, tentative-item inclusion, and edits obey the agreed boundaries.
- [ ] Planned and actual data can coexist, but one occurrence contributes only once under the D01 effective-amount rule.
- [ ] Inventory assets do not automatically become spendable cash; opening savings and cash cannot be duplicated. Debt balances are distinct from repayment cash outflows.
- [ ] Tests match the D01 fixture, including a shortage, unknown amount, legitimate zero, tentative item, recurrence boundary, and plan/actual replacement.
- [ ] Forecast output states that monthly totals do not establish within-month cash safety.

**Evidence:** pure model/engine tests and documented assumptions. No bank integration, daily ordering, credit-card accounting, or amortization.

## MS-D05 — Build minimal setup and current-position editing

**Goal:** let an individual reach the plan quickly, with optional family context.

**Dependencies:** MS-D02, MS-D03, MS-D04.

### Acceptance criteria

- [ ] Setup requests only D01's essential period/currency and opening-cash inputs; unknown cash produces an incomplete state rather than silently defaulting to zero.
- [ ] Users can add existing recurring commitments and future income/expenses without creating accounts for family members.
- [ ] Optional beneficiary labels include a household-wide choice, with no required personal names or family-member inventory.
- [ ] Simple assets/debts can be recorded or skipped; UI distinguishes non-liquid value, available cash, debt balances, and scheduled repayments.
- [ ] Listing first and entering amounts later works. Validation and an incomplete state preserve intentionally missing amounts.
- [ ] Save/reload preserves setup and optional inventory. Editing or deleting cash-linked data cannot silently double-count or erase associated cash events.

**Evidence:** synthetic interaction and persistence tests. No organization administration or compulsory long onboarding wizard.

## MS-D06 — Build the editable annual map and month detail

**Goal:** deliver the first useful end-to-end planning slice.

**Dependencies:** MS-D04, MS-D05.

### Acceptance criteria

- [ ] Overview shows monthly income, outgoing cash, carried closing cash, and incomplete/negative-balance indicators for the planning period.
- [ ] Users can add/edit one-off and supported recurring plans, identify existing versus tentative commitments, and see the chosen forecast assumptions.
- [ ] Month detail explains the items behind a total; annual and monthly views use the same engine and agree after edits.
- [ ] Changing one occurrence versus future occurrences follows D01 rules and does not silently rewrite recorded actuals.
- [ ] Missing amounts are visible where totals appear; no positive-balance display implies guaranteed daily affordability.
- [ ] Desktop and mobile support the core edit flow without depending on a narrow 12-column spreadsheet.
- [ ] Reopening restores the same synthetic plan and balances.

**Evidence:** engine/UI integration tests, persisted synthetic scenario, and actual browser checks separated from automated results.

## MS-D07 — Add actual amounts and monthly review

**Goal:** compare the plan with what happened without turning the app into a full transaction ledger.

**Dependency:** MS-D06.

### Acceptance criteria

- [ ] Users can record and correct an actual income/expense while preserving the original planned amount.
- [ ] Planned and actual amounts and their difference are distinguishable in month detail.
- [ ] The forecast applies D01's effective-amount rule exactly once; entering, changing, or clearing an actual recomputes later months consistently.
- [ ] Tentative, cancelled, skipped, missing, and actual states are distinguished where supported. Unsupported partial/late-payment behaviors are not implied by UI labels.
- [ ] History/plan edits obey the agreed recurrence boundaries and survive reload/export/import.

**Evidence:** before/after synthetic balances and regression tests for duplicate counting. No receipt collection or daily expense-log requirement.

## MS-D08 — Add basic preparation targets

**Goal:** help prepare for an expensive month without inventing money or adding duplicate expenses.

**Dependency:** MS-D06. **Scope gate:** retain for MVP or explicitly defer in MS-D01.

### Acceptance criteria

- [ ] A target links to an upcoming planned cost and shows target amount, already reserved amount, and remaining gap.
- [ ] Contribution suggestions use the D01 eligibility rules. Zero eligible periods, unknown target amounts, overfunding, and insufficient estimated cash have explicit states.
- [ ] A synthetic 12-million target with zero reserved and six eligible affordable contributions suggests 2 million per contribution, in the selected currency.
- [ ] A target or suggestion does not increase actual cash. Reserved amounts, total cash, spendable estimates, and the eventual bill are not double-counted.
- [ ] Changes to the linked bill or target cannot leave a misleading stale suggestion; deleting or unlinking has an explicit behavior.
- [ ] Label affordability as an estimate under visible assumptions, not a guarantee.

**Evidence:** target/reservation tests, synthetic warning states, and interface review. No automatic transfers or bank accounts required.

## MS-D09 — Validate and harden the local MVP

**Goal:** show the agreed personal/family flow works and data can be recovered.

**Dependencies:** MS-D07 and MS-D08 if retained. Update the dependency explicitly if D08 is deferred.

### Acceptance criteria

- [ ] D01's synthetic year passes end to end: setup → annual plan → edit month → actual amount → reload → export/import; include preparation only if retained.
- [ ] Expected engine outputs match displayed values. Unknown, tentative, negative, and plan/actual states remain understandable after reload/import.
- [ ] Import tests cover corrupted/unsupported files, replacement confirmation, precision, and all implemented domain fields. Rejected imports preserve existing data.
- [ ] Test supported browsers and mobile/desktop interaction, keyboard access, readable labels, and non-color-only warnings; record actual observations separately from automated checks.
- [ ] Local storage limitations, sensitive exports, backup steps, reset behavior, and approximate-forecast limitations are documented in the UI/help.
- [ ] No personal finance records, credentials, or screenshots containing personal information enter committed fixtures or test artifacts.
- [ ] Sinh performs the agreed core tasks and records acceptance or remaining issues. Passing tests or rendering a page alone is not human acceptance.

**Evidence:** automated results, browser observation notes, recovery walkthrough, and Sinh's acceptance/issues. No release date or external deployment is implied.

---

## Before converting these drafts to PA tickets

1. Review the running mockup and MS-D01 with Sinh; amend scope, flow, provisional rules and dependencies based on that feedback.
2. Confirm which tickets to create and their destination/metadata. These drafts do not authorize creation.
3. Carry acceptance criteria and unresolved decisions into the real tickets; record their assigned IDs here instead of treating these local IDs as PA IDs.
4. Use one implementation backlog after conversion; replace detailed drafts with links or archive them to avoid divergent task state.
