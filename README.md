# Money Seasons

**Lịch tài chính gia đình · Cùng hiểu, cùng lên kế hoạch.**

Vietnamese/whole-VND monthly planning for one family. Default **November 2026–December 2027 (14 months)**; configurable 1–120 consecutive months within 2000–2100. One private laptop JSON file is authoritative, shared through **Tailscale private HTTPS** plus a family passphrase.

MS-001's four implementation phases are now committed on its feature branch following Sinh's explicit request to resume and commit each phase. The basis is the r002 requirements/UAT draft and v003 five-workspace mockup. This is an implementation candidate, **not independent workflow approval, human UAT or production deployment**. Historical review artifacts and the workflow publication blocker are not rewritten. See [implementation details](docs/ms-001.md), [development plan](docs/development-plan.md) and [UAT checklist](docs/uat.md).

The [MS-001 wrap-up handoff](docs/ms-001-wrap-up.md) records the explicit local `develop` integration request, fresh checks and remaining operational/UAT limits. Local integration does not push code, restart services or migrate financial data.

## Five workspaces

- **Lịch tài chính:** chronological monthly columns, separate income/expense groups, account reference dates, opening/closing totals; month cards/detail on narrow screens.
- **Rõ chi:** create/select a Person, Group or Category, then add purpose, details and schedule. Enter the amount later.
- **Đa thu:** same shared objects, but only objects with income details appear. Unknown/zero/tentative or out-of-month income still qualifies. All objects remain available in Add Income.
- **Tài khoản:** named cash accounts with dated balance snapshots. History is retained; only the latest applicable reference date contributes.
- **Công nợ:** separate payable/receivable accounts and dated balances. Totals use each account's latest reference date applicable to **Tháng xem**, not the sum of its history or necessarily the globally newest balance. Missing balances stay unknown; explicit zero is valid. Manual repayment plans are expenses; collection plans are income. Planning never automatically changes debt balances.

Types differ only by labeled icons, not permissions/calculations. Shared renames apply across income/expenses. Equal-looking names have distinct IDs; there is no implicit merge. Referenced objects cannot be deleted until details are explicitly moved or removed. Account histories cannot be silently deleted.

## Overall view and details

Use the arrow/name controls to collapse or expand:

- Income/expense object cards: keep name, type, entry count and monthly total visible; hide individual entries/actions.
- Calendar object groups: keep each object's monthly totals while hiding its detail rows.
- Calendar income/expense sections: hide the whole section's groups/details while its overall monthly totals and closing cash remain visible.
- Cash/debt history: hide dated records while account cards and balance totals stay visible.

**Thu gọn tất cả / Mở rộng tất cả** applies to the current workspace. Nested group choices survive closing/reopening a calendar section. Controls support keyboard Enter/Space and announce expanded state. Choices remain during page navigation/rerenders, reset on a full reload, and are never financial edits: no save request, revision change, forecast change or exported preference. Unknown/partial totals remain labeled even when collapsed.

## Amounts and calculations

All stored amounts are exact integer VND, at most 1 trillion per field. Blank planned amount = **unknown**, not zero. Cash/debt snapshots require a known amount; zero is valid.

| Input | Stored VND |
|---|---:|
| `5` / `500` / `5000` | 5,000 / 500,000 / 5,000,000 |
| `5M` / `5tr` / `5 triệu` | 5,000,000 |
| `5 trăm` / `5 ngàn` | 500,000 / 5,000 |
| `5,000` / `5.000` | 5,000,000 |
| `1,5tr` / `1.5tr` | 1,500,000 |
| `500 VND` / `500đ` | 500 |

Bare numbers mean thousands. One/two decimal digits are accepted; consistent three-digit comma/dot groups are grouping, **not three decimal places**. Mixed separators, negatives, exponents, unknown units, fractional VND and overflow reject without rounding. Every amount editor shows a parsed preview. Reopened stored amounts include `VND` to avoid accidental rescaling.

- Schedules: once, monthly, every N months (1–120), yearly. **Save the full schedule independently of the forecast window**, including dates before/after it within 2000–2100. Only overlapping occurrences affect the displayed forecast. The forecast remains 1–120 months; a routine can span longer. Changing the window never truncates/deletes/re-anchors/extends a routine or its estimate history. Out-of-window entries remain editable in Income/Expenses.
- Estimate edits preview/confirm the effective occurrence month. Earlier values remain; later change points still apply. Replacing a same-month point is explicit. Schedule changes cannot orphan saved estimate history.
- Tentative amounts are excluded unless the reversible comparison switch is enabled. There are **no active item-level actuals, payments or transactions**.
- At the first month and any month containing a cash snapshot, opening cash resets to the sum of each account's latest applicable dated balance. Other accounts may have older dates; those dates are shown. Otherwise the previous closing estimate carries forward, including across January.
- The **full refresh-month plan** applies: opening + income − expense. Today's balance may already reflect spending; this approximate scenario is not reconciliation or a promise of daily affordability. December snapshots never affect November. Missing data propagates until a complete reset and complete plans resolve it.
- Debt snapshots alone never change cash; liabilities/receivables are not netted into available money. No automatic settlement, interest or amortization.

## Local Docker + Caddy test stack

```sh
npm run local:up
```

Open **https://localhost:3081**. This separate loopback-only stack uses private synthetic-test storage and leaves the old port-3080 app alone. **Running this command rebuilds/deploys the current source.** Following Sinh's separate update request, the local stack now serves v0.3.0 with both services healthy; see [update evidence](docs/local-stack.md#current-v3-update-2026-11-03-explicitly-requested). Existing storage/passphrase were retained and no plan migration was performed. Export any legacy original before explicitly converting it.

The generated local-only passphrase lives at `~/.local/share/money-seasons-local-test/passphrase`; open it privately in your editor, never print/paste it into logs/tickets. Caddy uses a local CA, with no automatic host-trust changes. See [local stack guide](docs/local-stack.md). Do not import household data into the test stack.

## Operator setup (separate authorization)

Node 22+ on Linux or Docker Compose; no runtime npm dependencies. Qualify with synthetic data first.

1. Privately provision a 12+ character passphrase in a regular, non-symlinked file **outside Git/public assets**, mode **0600**. Do not put the secret in a command argument or shell history. The app keeps a salted scrypt verifier in memory; the file is not encrypted by the app.
2. Provision a dedicated data directory **outside any Git checkout**, mode **0700**, owned by the app UID, with no symlinked parents. Use a local filesystem supporting atomic same-directory rename and file/directory fsync, never a network share or multiple writers.
3. Configure private paths and exact controlled HTTPS origins (placeholders below, no real secrets):

   ```sh
   export MONEY_SEASONS_DATA_DIR=/absolute/private/money-seasons-data
   export MONEY_SEASONS_PASSPHRASE_FILE=/absolute/private/money-seasons-passphrase
   export MONEY_SEASONS_ORIGINS=https://your-private-family-name.your-tailnet.ts.net
   npm start                         # 127.0.0.1:3080 by default
   # OR:
   docker compose config --quiet
   docker compose up -d --build --wait
   ```

   Origins have no trailing slash/path; comma-separate multiple origins. Missing/unsafe config fails closed; there is **no production insecure-cookie switch**. Direct HTTP is a transport/health endpoint, not a production login URL.
4. Docker runs as **UID 1000**, read-only root, dropped capabilities, loopback port only. Host data/secret paths must already exist and be accessible to UID 1000 with the private modes above. Do not broaden permissions or run privileged. Keep one writer.
5. Operator separately provisions **Tailscale private HTTPS**, preserving Host/Origin, and restricts access to family devices. **No Funnel**, public listener, ordinary LAN publication or database. The app does not change TLS/Tailscale/ACLs. Rate limits use the direct peer, not untrusted forwarded headers; a proxy shares the client limit.
6. Verify allowed family device → HTTPS/passphrase → synthetic shared plan; **unauthorized device denied**; unauthenticated API denied; no LAN/public reachability. These real-network checks remain pending.

Laptop sleep/offline means unavailable, not an offline queue. `/healthz` reports process health, not backup/store/network qualification. No finance payloads/passphrases are logged.

## Saving, conflicts and recovery

Acknowledged saves are serialized/revision-checked, atomically renamed and file/directory-fsynced. Another browser's newer revision rejects your stale write; no automatic merge/overwrite. The unsaved candidate and form are retained. Close the form, **export the unsaved draft**, read back status, then explicitly reload/reapply by hand. A lost response requires rereading before retry; uncertain durability blocks more writes until operator recovery.

Exports are **unencrypted plan-only JSON**, not secrets/sessions/server revisions. Imports validate/preview/confirm whole-plan replacement. Maximum raw import/save request: 1,000,000 UTF-8 bytes. Store corruption does not silently become a demo. Local persistence is **not a backup**: retain manual exports separately. See [operator recovery](docs/ms-001.md#operator-recovery).

### Existing v1/v2 plans

No automatic upload, conversion or actual deletion. A legacy server store is read/export-only until explicitly converted. Browser keys remain untouched; old origins/profiles are isolated, so export from the old app if the key is inaccessible.

1. Download/keep the original, including actuals and old opening cash.
2. Review the original-year period and conservative label→object mapping (one separately identified object per old detail; equal text is not identity).
3. Explicitly acknowledge that old actuals are **excluded from the active plans-only forecast**. They remain in the downloaded original and, for a legacy server store, a byte-exact private `original-<sha256>.json` archive before replacement.
4. Confirm conversion/replacement against the loaded revision. Old plan IDs, years and estimate history remain; no January amount is relabeled as November. Old opening cash has no account/date and is **not converted into a made-up balance**. Enter genuine dated snapshots separately; missing cash remains unknown.
5. Extend the period separately if needed. Conversion of real data remains an operator-authorized action, not part of implementation tests.

## Checks (isolated synthetic fixtures)

```sh
npm ci
npm run check
node --test test/model.test.mjs test/amount-input.test.mjs test/accounts-debts.test.mjs
node --test test/server.test.mjs test/persistence.test.mjs test/auth.test.mjs
node --test test/deployment.test.mjs
npm test
BROWSER_PATH="$(command -v google-chrome)" npm run test:browser
```

Playwright/axe are pinned development dependencies. The browser runner owns an ephemeral loopback child server, private temporary store and isolated profiles; refuses `BASE_URL`; never attaches to 3080/3081 or a normal profile. Artifacts go under `/tmp/ms-001-browser.*`. Fault hooks/fixture insecure cookies are test-only and excluded from Docker. These checks are not independent exact-FeatureSHA review, security certification or the [16 human UAT scenarios](docs/uat.md).

## Code / exclusions

`public/model.js`: v3 objects/plans/accounts/debts/forecast. `amount-input.js`: exact parser. `legacy-model.js`: read/convert old schemas and historical regression only. `persistence.mjs`, `auth.mjs`, `server.mjs`: private storage/access/API. `public/app.js`: five views and safe edit/recovery flows.

Deferred: databases, cloud/banks, automatic/off-machine backups, multiple plans, personal roles, membership, automatic debt allocation, transaction ledger/actual entry, daily forecasting, noncash asset pricing and preparation targets. Follow [Git Flow](docs/branching.md); local commits do not imply remote backup, merge, push or release.
