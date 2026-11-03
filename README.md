# Money Seasons

**Lịch tài chính gia đình · Biết trước những tháng cần nhiều tiền.**

> **MS-001 implementation is paused by Sinh for further requirements and mockup development.** See [current intake and resume gates](docs/requirements-follow-up.md). The worktree contains partial, untested form edits: do not continue coding or rebuild the local stack from it until the revised requirements/mockup are reviewed and implementation is explicitly resumed. Operating commands below are reference only during this pause.

Vietnamese/whole-VND monthly planning for one family. Configurable **1–120 consecutive months**, initially **November 2026–December 2027**. One private JSON file on the laptop is authoritative; family browsers share it through **private Tailscale HTTPS plus a shared passphrase**.

MS-001 implementation follows Model → Persistence/access → UI → Integration. This is an implementation candidate, **not human UAT, production security certification, or ordinary PA workflow approval**. No live plan or network configuration is changed by checking out the code. The accepted `foundation-v0.1` remains historical; [foundation notes](docs/mockup.md) describe that older browser-only version.

## Local Docker + Caddy test stack

```sh
npm run local:up
```

Open **https://localhost:3081**. This starts a separate loopback-only, synthetic-test stack, leaving the existing app on port 3080 untouched. A local Caddy certificate warning is expected until you choose a browser exception/manual CA trust; host trust is not changed automatically. Retrieve the generated login passphrase privately from `~/.local/share/money-seasons-local-test/passphrase`.

See [local stack guide](docs/local-stack.md) for certificate verification, private storage, rebuild/stop commands and isolation limits. Do not import real household data into the test stack.

## Operator setup (separate from implementation)

Node **22+ on Linux**, or Docker Compose. No runtime npm dependencies. First qualify the candidate with synthetic data. Do not reuse the old unauthenticated deployment as if it already had these settings.

1. Privately provision a **12+ character family passphrase** in a file outside Git, static assets and exports. Use a local trusted editor/secret tool, not a command-line argument or shell-history command containing the secret. File mode must be `0600` (or more restrictive); it must be a regular, non-symlinked file. The app derives a salted scrypt verifier in memory; the private configuration file itself is not encrypted by the app.
2. Create a dedicated **existing directory outside any Git checkout**, mode `0700`, for the JSON store. Use a local filesystem supporting atomic same-directory rename and file/directory fsync. No symlinked parent components, network share, or multiple app writers. Do not put other applications' data there.
3. Configure the following environment variables privately. These examples contain **placeholders, not working credentials**:

   ```sh
   export MONEY_SEASONS_DATA_DIR=/absolute/private/money-seasons-data
   export MONEY_SEASONS_PASSPHRASE_FILE=/absolute/private/money-seasons-passphrase
   export MONEY_SEASONS_ORIGINS=https://your-private-family-name.your-tailnet.ts.net
   ```

   Origins are exact HTTPS origins, comma-separated if needed, with **no trailing slash/path**. Only configure origins controlled by the operator. Missing/unsafe config fails closed; there is no production insecure-cookie switch.

4. Start **one** app process:

   ```sh
   npm start                         # default 127.0.0.1:3080
   # OR, after setting the same variables:
   docker compose config --quiet
   docker compose up -d --build --wait
   ```

   Docker runs as `node` (UID 1000), with a read-only root and loopback-only published port. Its `/data` bind mount is the sole writable application directory; its passphrase mount is read-only. **Both host paths must already exist and be accessible to UID 1000**, with the private modes above. The server refuses a data directory owned by another UID. Do not fix this by making files world-readable/writable or running privileged. Do not set Node `HOST=0.0.0.0` outside the container. `PORT` overrides Node's port; `MONEY_SEASONS_PORT` overrides the Compose loopback port.

5. The operator separately configures/verifies a **Tailscale private HTTPS reverse proxy** to the loopback app, preserving the original Host and Origin, with tailnet access restricted to allowed family devices. **No Funnel, public listener, ordinary LAN publication, or database service.** The app does not configure Tailscale, TLS, or ACLs. Never forward untrusted client identity headers: rate limits deliberately use the direct peer address, so a local proxy shares the client limit across family members.

6. Before real use, verify: allowed family device → HTTPS → passphrase required → shared synthetic plan editable; unauthorized device denied; unauthenticated API denied; no LAN/public reachability. Direct `http://localhost:3080` is a health/transport endpoint, **not the production browser login URL** (cookies require HTTPS).

```sh
curl http://127.0.0.1:3080/healthz     # process health only; no finance data
# Docker lifecycle, only for the operator's identified instance:
docker compose logs --tail=50 web
docker compose down
```

Stopping/rebuilding with the **same data directory** preserves acknowledged saves; changing directories creates a different store. Laptop sleep/offline means unavailable, not an offline queue. Logs exclude plan bodies/passphrases. `/healthz` is not a finance-store, network-security or backup certification.

## Use the plan

1. Log in. An empty server does **not** silently save a sample or migrate browser data. Set the period and cash **immediately before its first month**, or explicitly leave cash unknown; confirm initialization.
2. Add income/expenses. Category and optional person/household text are independent labels, not accounts. Amount blank = unknown; `0` is real.
3. Choose once, monthly, every-N-months, or yearly, with an explicit anchor/end. Extending the plan never extends a routine.
4. Read the chronological year groups. Month detail crosses December–January with one continuous cash balance. Negative/incomplete labels concern known monthly totals, **not daily affordability or financial advice**.
5. Record an actual for the selected **year-month**. It replaces that occurrence's estimate once. Clear it to restore the estimate. A tentative item's actual always counts; tentative estimates are excluded unless the comparison switch is on.
6. Estimate edits preview/confirm an effective occurrence month. Earlier estimates and every actual remain; existing later change points remain. Same-month change-point replacement is explicit. Schedule edits cannot orphan history/actuals. Deleting previews the removed series/history/actuals and confirms.
7. Save status shows the acknowledged revision. If another family browser saved first, the stale write is rejected. The unsaved candidate and form remain; close the form to **export the unsaved draft**, then read back status. Explicitly reload the server plan and reapply wanted edits by hand. No automatic merge or blind overwrite. Network/lost-acknowledgement errors require rereading before retry; uncertain durability requires operator recovery.
8. Export regularly to a safe private location. Exports are **unencrypted** and contain plan fields only, not sessions, secrets or server revisions. Import validates/previews and confirms whole-plan replacement. Maximum raw API/import JSON is 1,000,000 UTF-8 bytes.

## Existing v1 browser plan / recovery

**Export the original before upgrade or migration.** Browser storage is origin/profile-specific: an old `localhost` key is not accessible from the new private HTTPS origin. Export from the old app/profile first, then import that v1 file after login to the candidate. If the old key is accessible, the migration button offers the same explicit flow.

- Download the original v1 bytes and acknowledge keeping them before conversion/upload. The old `money-seasons.plan.v1` key is never modified/deleted.
- Convert **only the original January–December year**. Existing 2027 items/IDs/actuals remain in their 2027 months; zero actuals survive. Opening cash still means immediately before that January.
- Preview and confirm initialization/replacement against the loaded server revision. Cancellation, invalid input and conflicts never silently replace the server.
- **Separately** extend to November 2026–December 2027. A changed first month requires an explicitly reconfirmed new opening value or unknown; January cash must not be reused as November cash.

The app has **no automatic backups, encryption at rest, off-machine replication or recovery from disk loss**. A local disk file is persistence, not a backup. Keep manual exports separately; see the [failure and lock recovery procedure](docs/ms-001.md#operator-recovery).

## Checks (isolated synthetic data only)

```sh
npm ci
npm run check
node --test test/model.test.mjs
node --test test/server.test.mjs test/persistence.test.mjs test/auth.test.mjs
node --test test/deployment.test.mjs
npm test
BROWSER_PATH="$(command -v google-chrome)" npm run test:browser
```

Playwright/axe are development-only dependencies. Without a system Chrome, install Playwright Chromium with `npx playwright install chromium`. The runner **owns a fresh ephemeral loopback child server, temporary store and isolated browser profiles**; it refuses `BASE_URL` and never attaches to port 3080 or the normal browser profile. Artifacts go to a fresh `/tmp/ms-001-browser-*` directory (`BROWSER_ARTIFACTS` can select another temporary directory). Synthetic credentials and the test harness are excluded from the production image. Production startup never activates the test-only insecure-cookie option.

The recorded r001 requirements matrix additionally asserts exact Chrome `155.0.8059.39` before syntax. Local checks are **not an independently authorized exact-FeatureSHA matrix review**. Docker image/runtime qualification, actual Tailscale/ACL verification, other browsers/physical devices, and all 16 Sinh UAT scenarios remain separate gates. See [implementation details and traceability](docs/ms-001.md), [development plan](docs/development-plan.md), and [ticket reconciliation](docs/tickets.md).

## Code

- `public/model.js`: v2 validation, recurrence/history/forecast, explicit v1 conversion.
- `persistence.mjs`: private single-writer JSON envelope, revision CAS, serialized atomic/fsynced saves.
- `auth.mjs`, `server.mjs`: shared passphrase sessions, same-origin/CSRF checks, authenticated API, static allowlist.
- `public/app.js`, `index.html`, `styles.css`: Vietnamese UI, conflicts/recovery, migration, year groups and native dialogs.
- `test/`, `scripts/`: synthetic deterministic/failure/browser checks.

No PostgreSQL/LPG/SQLite, accounts/roles, multiple plans, automatic backups, bank links, daily accounting, assets/debts or preparation targets in this slice. See [Git Flow guide](docs/branching.md); work stays on the feature branch until review/integration. No remote backup is implied by a local Git commit.
