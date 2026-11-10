# Local mockup · historical foundation review handoff

> **Historical, as of foundation-v0.1 (2026-10-27), not current operating instructions.** The MS-001 candidate now implements five planning workspaces, dated cash/debt balances, configurable cross-year planning and private server-side JSON/shared-passphrase access. Its local implementation does not imply production deployment or human acceptance. The browser-only/no-API/no-volume/current-URL statements below describe the old foundation only. See [current README](../README.md), [development plan](development-plan.md), and [MS-001 details](ms-001.md). Historical verification/acceptance is preserved, not reused as evidence for the new candidate.

**Deployment:** PA:d-b356fa · **Date:** 2026-10-27 · **State:** accepted by Sinh as a starting foundation; detailed usage requirements and task-level acceptance remain open.

The current request is to build a mockup with a base server/Docker setup on this machine, use it to confirm the design/flow, then create further tickets. This intentionally advances a small prototype ahead of the earlier documentation-only gates. It does **not** approve every draft acceptance criterion, production architecture, or a full MVP rollout. The requested follow-up requirements ticket **MS-001** has now been created; no implementation ticket has been created.

Sinh explicitly selected **Vietnamese + VND** for this mockup. All other decisions below are prototype assumptions for discussion.

## Foundation acceptance

Sinh's follow-up: “all good this is a good start”, with an explicit request to commit/save this foundation and create a **requirements** ticket for personal details and usage adjustments, including **November 2026 through December 2027** (14 consecutive months). This accepts the starting foundation, not every detailed review task below or the full MVP. The current code still supports January–December of one year; the extended period is follow-up scope, not implemented here. No personal balances or financial records have been collected or committed.

Saved checkpoint: commit `ca0fda1`, annotated tag `foundation-v0.1`. The active follow-up is **MS-001** (`idea`, assigned to `sinh`) — requirements gathering for personal input needs and usage adjustments across November 2026–December 2027. Use `ppa ticket show MS-001` for the canonical scope and acceptance criteria. The app itself has not been changed to support that period yet.

## What is usable

- Responsive 12-month map, known income/outflow/end-of-month balances, carry-forward, expensive-month and negative-balance indicators.
- Lightweight setup: plan name, calendar year, opening available cash (can remain unknown). No accounts, family-member inventory, or household administration.
- Add/edit/delete one-off and monthly income/expenses, with confirmed/tentative status and optional amount.
- Month detail with original planned amounts, per-month actual amounts and numerical differences.
- Browser-local save/reload, versioned JSON export/import, replacement confirmations, sample reset and visible save-failure warnings.
- Self-contained assets; Node static server and health endpoint; Docker Compose on loopback.

Not implemented: asset/debt inventory, reserves/preparation targets, daily ordering, reminders, bank connections, authentication, sync, a financial-data API, multi-currency, debt amortization, rolling/mid-year periods, partial/late/cancelled payments, changing only future planned occurrences.

## Provisional technical choices

| Choice | Why this mockup uses it | Tradeoff / alternative |
|---|---|---|
| Vanilla browser ES modules + CSS | No application build tool or runtime dependencies; easy to replace after design review | React/Vite could help a larger component/state surface, but adds build/dependency cost now |
| Node 22 built-in HTTP server | One small process for static assets and `/healthz`; usable directly or in Docker | A static proxy could serve the UI later; no finance payload API is required now |
| Pure `public/model.js` | Calculations and validation are independent of DOM/storage and tested directly | This is not a final accounting/domain model |
| Browser localStorage + schema-v1 JSON | Simple single-plan persistence without server/database/account concerns | Synchronous and browser-profile/origin-specific; no encryption, sync or backup. IndexedDB could support larger records later; SQLite/server persistence would need a separate data/privacy decision |
| Native dialogs, system fonts | Small, keyboard-capable baseline; no external font/CDN traffic | Actual cross-browser, screen-reader and device coverage still needs expansion |
| Node Alpine container | Version-pinned base; non-root `node` user, read-only filesystem, dropped capabilities, no-new-privileges, resource/log limits, health check | Base-image updates remain an ongoing maintenance task; no public TLS/auth deployment is provided |

Runtime has no package dependencies. Playwright and axe-core are pinned **development-only** dependencies in `package-lock.json`; Docker does not install or copy them. `.dockerignore` allowlists application sources so local exports/configuration cannot enter the image build context.

The server accepts GET/HEAD only and serves a fixed asset allowlist; it never accepts financial records. CSP restricts scripts/styles/connections to the same origin and prevents framing. No analytics or third-party assets. This is a local prototype boundary, not a production security certification.

### Operations

See [README](../README.md#run-locally) for commands. Current local URL: **http://localhost:3080**. Container: `money-seasons-web-1`, Compose project: `money-seasons`.

- `docker compose up -d --build --wait` builds/starts; `docker compose down` stops.
- `docker compose logs --tail=50 web` shows server output, not financial payloads.
- `curl http://localhost:3080/healthz` returns app/version/health JSON.
- Code changes require a browser reload for Node, or a rebuild then reload for Docker.
- Keep the same browser profile and origin. `localhost`, `127.0.0.1`, and different ports each have different storage. Moving or rebuilding containers is not a plan migration; export/import between origins if needed.
- Access from another machine should use a tunnel, not expose this unauthenticated prototype: `ssh -N -L 3080:127.0.0.1:3080 USER@THIS_MACHINE`.
- No Docker volume is needed because the container stores no plan. No automatic backup exists. Browser clearing/private mode/device loss can erase data; shared profiles and unencrypted exports can expose it.

## Calculation and editing assumptions

1. **Calendar year, January opening.** Prototype years 2000–2100. It does not interpret today's balance as January's cash or model starting mid-year. Opening cash may be unknown.
2. **Whole VND.** Nonnegative safe integers, maximum 1 trillion VND per field, maximum 500 plan items. These bounds keep even a full-year maximum-size plan within exact integer arithmetic. Expenses are positive inputs with an explicit expense type, not negative amount fields.
3. **One event per month occurrence.** Recurrence is either one selected month or every month in an inclusive start/end range. No annual multi-year generation or exact-day ordering.
4. **Carry-forward.** Opening cash + included effective income − included effective expenses. Each month's closing estimate becomes the next opening estimate.
5. **Unknown ≠ zero.** Blank amounts stay `null`. Totals include only the known portion, with incomplete labels from the first unresolved included amount onward. Explicit zero is valid. An actual amount resolves the unknown planned amount for that occurrence only.
6. **Tentative is excluded by default.** The switch includes tentative planned items for comparison. A recorded actual always counts, even on an originally tentative item. The switch is a temporary view assumption, not persisted/exported plan data; reload returns to the baseline.
7. **Actual replaces planned.** `actuals[month]` is used instead of the planned amount for that occurrence, while preserving the plan. Zero actual is real. Clearing actual restores the planned estimate. No support for partial, late or cancelled payment states is implied.
8. **Series edits are explicit.** Editing a recurring planned item changes the whole series; recorded actuals remain. A new range that would discard an actual is rejected until that actual is deliberately cleared. Delete confirmation removes the whole item/series, including actuals. Future-only editing is deferred.
9. **No invented money.** Only opening cash and explicit income/expense events affect cash. A manually entered loan repayment is outgoing cash, not an opening debt balance or amortization engine. No asset inventory, net worth or reserve totals are added to available cash.
10. **Estimates, not safety guarantees.** A positive month-end balance says nothing about bill-before-payday timing. A negative incomplete estimate is a warning under the known portion, not a precise final shortage.

### Import/recovery boundary

Exports contain `version: 1`, `currency: VND`, year, plan name, demo flag, opening cash and items with IDs, type, status, amount, recurrence range, category and per-month actuals. IDs must be unique. Metadata for unimplemented features is not part of this schema and is not preserved; do not use the mockup as an interchange format for other finance systems.

Invalid JSON, unsupported versions/currencies, invalid amounts/ranges/actuals, duplicates, over-500-item plans and files over 1 MB are rejected before replacing the current plan. Valid replacement still requires confirmation and offers cancellation to export first. Clearing/replacing the sample and deleting a series also require an explicit action.

A storage-write failure leaves edits in memory with a persistent warning, rather than claiming they were saved; export before closing. Unreadable/corrupt saved data is not overwritten on startup: a temporary sample is displayed with a warning. Later explicit saves can replace it, so check/recover any existing backup first. There is no hidden server copy to restore.

## Worked synthetic year

The fixture lives in `demoPlan()` in `public/model.js`; all records are fictional.

- Opening cash: **20,000,000 ₫**.
- Monthly income: **30,000,000 ₫**; December bonus: **25,000,000 ₫**.
- Monthly expenses: living **12,000,000 ₫**, rent **8,000,000 ₫**, manual loan repayment **4,000,000 ₫**.
- January living actual: **13,500,000 ₫**, replacing the planned 12,000,000 ₫.
- One-offs: February Tết **20,000,000 ₫**, April insurance **24,000,000 ₫**, September tuition **36,000,000 ₫**.
- July summer trip: tentative **18,000,000 ₫**, excluded from baseline.
- November vehicle maintenance: amount **unknown**. November and subsequent balances remain incomplete.

Amounts below are **million VND**; unknown maintenance is not included in the known portion.

| Month | Income | Known expenses | Known closing balance | With tentative trip | Completeness |
|---|---:|---:|---:|---:|---|
| Jan | 30 | 25.5 | 24.5 | 24.5 | Complete |
| Feb | 30 | 44 | 10.5 | 10.5 | Complete |
| Mar | 30 | 24 | 16.5 | 16.5 | Complete |
| Apr | 30 | 48 | **−1.5** | **−1.5** | Complete |
| May | 30 | 24 | 4.5 | 4.5 | Complete |
| Jun | 30 | 24 | 10.5 | 10.5 | Complete |
| Jul | 30 | 24 | 16.5 | **−1.5** | Complete |
| Aug | 30 | 24 | 22.5 | 4.5 | Complete |
| Sep | 30 | 60 | **−7.5** | **−25.5** | Complete |
| Oct | 30 | 24 | **−1.5** | **−19.5** | Complete |
| Nov | 30 | 24 + unknown | 4.5 | **−13.5** | Incomplete |
| Dec | 55 | 24 | 35.5 | 17.5 | Incomplete (carry-forward) |

Baseline known totals: income **385,000,000 ₫**, expense **369,500,000 ₫**. Opening 20m + income 385m − expenses 369.5m = **35.5m known year-end estimate**, not a complete final balance. The tentative trip reduces July and every following month by exactly 18m. Entering September tuition actual 40m preserves its 36m plan and lowers September onward by 4m, not 40m + 36m.

## Verification performed

### Automated checks

- `npm test`: **22/22 passed**, covering worked balances, tentative inclusion, actual substitution/zero/clearing, unknowns and carry-forward, recurrence boundaries, exact money bounds, round-trip and invalid schema cases, non-mutation, bounded static serving, headers, HEAD, health, rejected writes, and malformed request URL recovery.
- `npm run check`: passed syntax checks.
- `docker compose config --quiet`: passed. Real image built and container started on this host; health endpoint returned 200. Container restart returned to healthy. Inspection confirmed non-root `node`, read-only filesystem and `127.0.0.1:3080` publication.
- `npm run test:browser` using installed Google Chrome **155.0.8059.39**: **15 grouped checks passed**. Covers the UI walkthrough, actual carry-forward and reload, recurring add/validation/zero, exact export, malformed/future/cancelled/confirmed imports, short blank setup, sample restore, delete confirmation, escaped imported markup/identifiers, storage failure/corrupt startup, no page/console errors, and no external requests.
- Responsive widths **320, 360, 390, 768, 1440 CSS px**: no page horizontal overflow; month detail checked at 390 px.
- axe-core WCAG 2 A/AA and 2.1 AA scans: no detected violations on overview, item list, setup, item editor, month detail, actual editor and help. The scan initially caught low-contrast secondary text, which was darkened and rechecked. This is not a complete accessibility certification.
- `npm audit --omit=dev`: no reported runtime dependency vulnerabilities (there are no runtime package dependencies).

### Agent browser observation

The agent inspected actual Chrome-rendered screenshots of the desktop overview, mobile overview, desktop month detail and mobile month detail. Observed: four-by-three desktop and stacked two-column mobile months, text labels accompanying warning colors, distinct missing-input labels, readable month summaries, and scrollable modal content rather than a squeezed 12-column table. Native dialog Escape closes and returns focus to the opener in the automated keyboard check.

Screenshots are generated under `/tmp/money-seasons-check/` by default, not committed. They are synthetic-only and ephemeral. Automated checks use isolated browser profiles, not Sinh's profile.

**Not verified:** Safari/Firefox, physical phones, complete keyboard/screen-reader coverage, production security, real household data or long-term recovery. Browser execution and agent screenshot inspection are **not Sinh's UAT or acceptance**.

## Design/flow review with Sinh

Open **http://localhost:3080** and use only sample data at first.

- [ ] Can you find the first projected shortage and the most expensive month without explanation?
- [ ] Does the annual map feel like the right starting point, or should first launch open short setup instead?
- [ ] Open April and September: is it clear why the balance is negative and where it carries forward?
- [ ] Toggle the tentative July trip: is “not included” versus “included” understandable?
- [ ] Check November's missing maintenance amount: do the unknown/incomplete labels prevent reading the positive balance as complete?
- [ ] Record tuition actual 40m, reload, and export/import: are plan versus actual and their edit scope clear?
- [ ] Try blank setup: is the January-opening limitation acceptable, or is starting from the current month essential?
- [ ] Review Vietnamese terminology, amount density, warning colors and mobile scrolling. Would compact or larger-text month cards work better?
- [ ] Decide whether asset/debt inventory and preparation targets belong in the next slice or later.
- [ ] Decide whether browser-only finance storage is sufficient for now, or a local server database is actually needed.

Record feedback and non-sensitive requirement decisions in **MS-001**, then reconcile [the related historical drafts](tickets.md), separating agreed behavior from open questions. Keep actual financial values in an agreed private location. No further tickets or implementation are authorized just by creating MS-001. **Do not mark all draft criteria accepted based on foundation approval or automated results.**
