# Money Seasons — development plan

**Status:** interactive local mockup accepted by Sinh as the starting foundation. Detailed personal requirements and full MVP scope remain under review. The requested requirements ticket **MS-001** is created (`idea`, assigned to `sinh`).

Based on discovery in **PA:d-830b2f/rogue-one/rogue-one**, the planning discussion in **PA:d-8b8b88/rogue-one/rogue-one**, and the latest mockup request in **PA:d-b356fa/rogue-one/rogue-one**. The latest request explicitly advances a mockup plus a local server/Docker foundation before design/flow confirmation and further tickets; it supersedes the earlier documentation-only pause for this slice only.

## Agreed direction

- Start as a personal tool: **one individual managing their own or one family's finances**. This is not a multi-household service.
- Prioritize annual planning and preparation for expensive months over daily transaction logging.
- Start local-only. The mockup now has a small static Node server and loopback-bound Docker deployment on this machine; a financial-data backend or external self-hosting remains deferred.
- Keep forecasts approximate and understandable rather than attempting accounting-level precision.
- Support current money and future income/expenses, planned and actual amounts, existing and tentative commitments, and a simple view of existing assets/debts alongside future plans.
- Keep the plan and ticket references in this repository. Sinh authorized saving the foundation and creating one follow-up requirements ticket. Foundation commit `ca0fda1` / tag `foundation-v0.1` is saved and **MS-001** is created; this does not authorize implementing the full MVP or converting all existing drafts.
- Sinh selected **Vietnamese + VND** for the first mockup. Other finance rules and architecture choices in the mockup are provisional.

## Current review slice

The running mockup covers short setup → annual map → month detail → editing/actuals, plus browser-local save/reload and versioned export/import. See [mockup assumptions, verification, and review checklist](mockup.md) and [startup instructions](../README.md). Assets/debts and preparation targets remain excluded from the mockup. Sinh accepted this as a good starting foundation and requested a requirements ticket for personal details/usage adjustments, including November 2026–December 2027. Detailed task-level UAT is not recorded. The drafts below are not thereby completed or implementation-ready.

## Proposed first experience

**Open app → enter current cash and planning period → add income/expenses → see the annual map → inspect or edit a month.**

Setup should be short and progressively editable:

- No sign-in, organization/household creation workflow, invitations, roles, or permissions.
- One default personal/family plan; no household selector or required family-member inventory.
- Optional labels for people or beneficiaries can be added when useful, including a household-wide item. They are not user accounts.
- Let people list commitments before filling amounts. Skipped or unknown values must remain visibly incomplete, not become zero.
- Assets, debts, actual amounts, and preparation targets are optional details, not prerequisites for opening the calendar.
- Start with opening available cash, not a detailed account reconciliation or historical transaction import.

A responsive 12-month overview and a month-detail list are proposed. Exact event dates may be useful metadata, but exact-date forecasting is not part of this plan. Mobile should not require editing a squeezed 12-column table.

## Proposed MVP boundary

### Include

1. A single local personal/family plan with a planning period and explicit currency.
2. Opening available cash and editable recurring or one-off income/expenses.
3. Existing commitments and tentative future commitments, visibly distinguished.
4. A lightweight current asset/debt inventory; liquid cash is distinguished from non-liquid assets.
5. Approximate monthly forecasts carried across the year, incomplete-input notices, and negative projected month-end warnings.
6. Planned versus actual amounts without counting the same occurrence twice.
7. Basic preparation targets and reserved amounts, subject to the scope review in MS-D01.
8. Local persistence plus versioned export/import, recovery guidance, and clear privacy/data-loss warnings.

### Exclude initially

- Multiple households, multiple signed-in users, sharing, roles, authentication, and device sync.
- A financial-data backend, public self-hosting deployment, or hosted service. The latest request adds a local static server/Docker foundation for the mockup, not a data service.
- Bank connections, automatic payments, investment advice, and transaction-import pipelines.
- Full bookkeeping, credit-card accounting, debt amortization, automatic valuations, and multi-currency conversion.
- Guaranteed bill-before-payday detection or exact-day cash-safety claims.
- Lunar recurrence, external reminders/calendars, and weather-driven predictions.

A simple debt balance does not imply an amortization engine. Repayments may be entered as planned outgoing cash without automatically generating a schedule. New borrowing, asset sales, and other financing flows require explicit rules before support; they must not silently become earned income.

## Calculation and safety principles

Approximate inputs do not justify avoidable arithmetic errors:

- Use exact money representations and an explicit currency; unknown is not zero.
- Opening cash + inflows − outflows carries forward month to month. If inputs are missing, label the estimate as incomplete.
- A positive month-end balance does not prove cash is sufficient on every day within that month.
- Preserve the original planned amount when an actual amount is entered. Define one effective cash event, not planned plus actual.
- Non-liquid assets must never inflate available cash. Do not add a savings balance twice through both opening cash and the asset inventory.
- Keep debt balances separate from repayment cash events. Avoid counting an opening debt as an immediate expense.
- A preparation target does not create money. Earmarking funds must not create a duplicate expense when the bill is paid.
- Keep the calculation model independent of browser persistence. Version the export schema; do not build a speculative backend or generic storage framework.
- Use synthetic fixtures only. Do not commit household records, exports, screenshots with personal information, or credentials.

These are implementation guardrails. The exact monthly rules below still require MS-D01 decisions and examples.

## Decisions still open

| Decision | Resolution point |
|---|---|
| Vietnamese/VND selected for the mockup; confirm long-term language/currency scope | MS-D01 |
| Follow-up period requested: November 2026–December 2027 (14 consecutive months); opening balance reference and extended-period rules to settle | MS-001 (requirements); related historical MS-D01 |
| Which confirmed/tentative items enter the default estimate, and how alternatives are shown | MS-D01 |
| Where actual amounts apply, including partial, late, cancelled, or changed payments | MS-D01; explicitly defer unsupported states |
| Minimal recurrence rules, annual occurrences, and changes to future plans | MS-D01 |
| Asset/debt fields and how liquid savings relate to opening cash | MS-D01 |
| Whether preparation targets belong in the first usable release or the next increment | MS-D01 |
| Mockup uses vanilla modules, localStorage and schema-v1 JSON; review long-term stack, browser support and recovery requirements | MS-D03 |
| Budget, schedule, hosting, and later self-hosting migration | Not committed |

## Development sequence and gates

The [ticket index](tickets.md) links active requirements ticket **MS-001**, the next step with Sinh. The historical **MS-Dxx** drafts below use local identifiers only; they are not registered PA tickets or marked ready for implementation.

| Stage | Drafts | Exit evidence |
|---|---|---|
| 1. Settle the boundary | MS-D01 | Sinh reviews the scope and a worked synthetic year, including incomplete and tentative inputs |
| 2. Validate the lightweight experience | MS-D02 | Sinh reviews the actual prototype; setup works without household administration or a mandatory asset inventory |
| 3. Establish a local foundation | MS-D03, MS-D04 | Reviewed technical decisions; save/reload and recovery tests; deterministic monthly engine fixtures |
| 4. Build the useful planning slice | MS-D05, MS-D06 | Enter current cash and commitments, reopen the app, and inspect an editable annual plan |
| 5. Extend and verify | MS-D07, MS-D08 if retained, MS-D09 | Plan/actual behavior, preparation semantics where included, recovery, mobile checks, and Sinh's acceptance |

The ticket graph is an ordering guide, not a staffing or delivery estimate. Drafting or rendering a prototype is not evidence that Sinh has used or accepted it. Automated checks and human review must be reported separately.

## Documentation ownership

Discovery history remains in the [original project notes](../../tools/learning-management/projects/money-seasons/README.md). This relative link assumes the local workspace layout; it does not resolve in an isolated clone.

This repository owns the development plan and local implementation ticket drafts from this discussion onward. Do not maintain a second implementation backlog in the discovery repository. The earlier discovery roadmap remains historical/proposed where it differs from this discussion.

**Next action:** work through **MS-001** with Sinh to confirm details and usage requirements for November 2026–December 2027 before implementation. Keep actual financial records out of Git and the ticket, record only non-sensitive requirements/decisions, and revise related historical drafts rather than converting them wholesale. Foundation acceptance does not settle production architecture or constitute detailed task-level UAT.
