# MS-005 manual input / UAT stack

## Current local candidate

**Preferred review URL: http://localhost:3086** (loopback-only HTTP, no certificate warning).
The independent HTTP candidate runs as user unit `ms005-http-a1e68544-3086`.
**Current HTTP dataset contains a private, one-time copy of production finances.**
The operator explicitly requested this copy and selected Sinh as admin and owner;
Ân and Vy are members. Production itself was not migrated or modified.

Current logins (new independent passwords, not the old Lan/Minh files):
- `sinh` — Sinh, admin; owns the migrated plan.
- `an` — Ân, member; starts with an empty personal plan.
- `vy` — Vy, member; starts with an empty personal plan.

Open this private password file in your editor; never paste its contents:
`/home/sinh/.local/share/money-seasons-dev/a1e68544aea12bd3fd040da4733298598a29121363240b6f7e4606f5c4a0f1bb/datasets/production-review-20261111235519-1bbcda/members/credentials.txt`

The source was read through the guarded read-only finance snapshot path. No
production password, session, certificate or unrelated file was copied. The exact
source is preserved independently as dataset `original.json` and as a hashed
original archive in the new working data directory. The copied v3 financial plan
was verified unchanged after owner assignment; all copied parents default shared
with Home. Sinh can make records private from My; admin has no private bypass.

This is **not continuous synchronization**. Local trial edits never copy back to
production, and later production edits do not automatically refresh this copy.
A future refresh requires a NEW explicitly selected copy, never overwriting this
one. The old Lan/Minh HTTP data/passwords remain intact under `http-3086/`, and the
synthetic HTTPS stack remains independent. Cookies are dataset-separated.

Stop: `systemctl --user stop ms005-http-a1e68544-3086`.
Restart while active: `systemctl --user restart ms005-http-a1e68544-3086`.
The unit is transient. After stopping, the matching foreground start is:
`npm run uat:http -- --port 3086 --dataset production-review-20261111235519-1bbcda`.
Omitting `--dataset` deliberately opens the preserved synthetic Lan/Minh stack,
NOT the private production copy. Explicit selection refuses missing/corrupt data
or membership and never silently seeds, repairs or falls back to another source.

Keep this real-data copy private and loopback-only. No LAN exposure, screenshots,
finance/credential logs or shared artifacts. Storage/exports are unencrypted;
private local copies are not backups. Only the host-only review script opts into
loopback HTTP cookies; production startup/Secure cookies are unchanged and the
script remains excluded from production images. This is not release acceptance.

Verification: guarded original/archive and owner-plan equality; three logins,
roles, empty member scopes and shared-source ownership checked without payload
output or finance writes. Production container ID/image/start time unchanged.
Synthetic regression suite: 185/185, zero skips; startup/migration focus 6/6 and
syntax checks passed. No automated browser screenshots/axe on private data.

### Synthetic HTTPS alternative (unchanged)

The earlier HTTPS alternative remains **https://localhost:3085** (exact hostname).
Both scoped containers are healthy. Credentials below apply to HTTPS only.
This is synthetic-only testing, not production rollout or product acceptance.

Accounts: **lan** (member), **minh** (admin). Generated, independent passwords are in
this private local file; open it in your editor, do not paste it into chat/logs:

`/home/sinh/.local/share/money-seasons-dev/a1e68544aea12bd3fd040da4733298598a29121363240b6f7e4606f5c4a0f1bb/uat-credentials.txt`

The browser may warn about the instance's local CA. Choose a site-specific
exception if desired; no host trust changes were made. The public CA is
`~/.local/share/money-seasons-dev/a1e68544aea12bd3fd040da4733298598a29121363240b6f7e4606f5c4a0f1bb/caddy/caddy/pki/authorities/local/root.crt`.
Never share the surrounding directory (it contains private keys).

Use separate browser profiles/private windows for Lan and Minh on this one URL.
Initial Home: 35M income, 5M expense; Lan's private 2M expense is absent. Names,
amounts and histories in this stack are synthetic and disposable, but trial edits
persist. No real source was read, migrated or copied. No production/3081 lifecycle
was changed. Do not enter real finances/credentials during this synthetic UAT.

From this checkout:

```sh
npm run local:status
npm run local:up       # rebuild only this instance after source changes
npm run local:down     # scoped stop; preserves credentials, data and CA
```

For a NEW, uninitialized admitted worktree only:

```sh
npm run uat:init -- --port 3085  # choose an unused explicit nonreserved port
npm run local:up
```

Initialization refuses existing selections/configuration and never overwrites
passwords or datasets. Partial failure requires private operator diagnosis, not
lock deletion, permission broadening, or automatic retry/repair. The private
manifest explicitly selects member mode and the guarded Compose overlay.
The first build revealed missing runtime modules in the image allowlist; this
was corrected in Dockerfile/.dockerignore and the scoped image rebuilt.

## Human checks — NOT RUN by the agent

1. Sign in as Lan; navigate Của tôi and all five workspaces at desktop and 390px.
2. In Minh's Home, see both owners, equal-name objects kept distinct and no private
   Lan expense. Confirm 35M/5M and unknown cash (not fabricated zero).
3. Lan edits shared income 20M → 22M. Minh sees 37M within five seconds.
4. Minh edits Lan's shared record. Confirmation must identify owner/record.
   Cancel writes nothing; confirm changes the original once, not a copy.
5. Lan chooses Giữ riêng. Minh's Home removes the record; an open collaborator
   editor closes and discards its obsolete foreign draft. Only Lan can reshare.
6. Create income/expense/cash/debt in My or Home. New Home records belong to the
   creator; sharing is default, with a private-at-create choice. Parent privacy
   includes snapshot histories; shared accounts retain reference/history guards.
7. Disconnect Minh's browser. Stale state blocks edits. Reconnect reloads current
   data/permissions. Check switching scopes and logout clear private drafts/views.
8. Minh changes common period, creates/resets/disables/reactivates a test user.
   Non-admin controls are absent and APIs refuse unauthorized management. Last
   enabled admin cannot be disabled. Reset/disable revokes existing sessions.
9. Change own password; sign in again. Admin is not a private-finance bypass,
   but trusted password reset and host access are outside the privacy guarantee.
10. Export My and Home. My is owner-only; Home contains shared provenance only.
    Preview/cancel import; confirm replaces only My. Wrong period/foreign owner,
    malformed references, whole-Home replacement and >1MB requests reject.
11. Competing saves: retain/export only own unsaved draft; reread and manually
    reapply, never automatically overwrite or retry old permission. Uncertain
    durability blocks edits until operator reconciliation/restart.
12. Separately provision a disposable legacy fixture for migration UAT: no auto
    conversion; admin previews original and explicitly chooses enabled owner.
    Cancel/invalid owner/archive fault persist nothing; exact original envelope
    is archived before conversion. v1/v2 actuals and undated opening cash are
    excluded with disclosure. Do not test migration on real data here.

Full normative TS-1–TS-14 remain in the published r003 UAT package referenced by
`docs/ms-005-implementation.md`. This checklist is a practical companion, not a
replacement or claim those human scenarios passed.

## Operator composition (no default credentials)

Legacy startup remains default for compatibility. Member startup explicitly sets:

```text
MONEY_SEASONS_AUTH_MODE=members
MONEY_SEASONS_MEMBERS_DIR=/absolute/private/members
MONEY_SEASONS_ROLES_FILE=/absolute/private/roles/roles.json
MONEY_SEASONS_DATA_DIR=/absolute/private/finance
MONEY_SEASONS_ORIGINS=https://exact-private-host
MONEY_SEASONS_BASE_PATH=/optional-prefix
```

Provision owned 0700 directories and 0600, single-link files outside Git without
symlink components. `users.json` schema is version 1, revision >=1, users containing
immutable id, username, name, enabled, credentialVersion and a salted scrypt
verifier from `hashPassword` in `membership.mjs`. No plaintext password in users.
`roles.json` is `{"version":1,"adminIds":["operator-selected-existing-id"]}`.
At least one enabled configured admin is required; multiple admins are supported.
Use generated unique passwords, not fixture passwords. There is no HTTP role or
member-delete endpoint. SIGHUP rereads roles and revokes changed sessions; invalid
roles fail closed. User credential changes use the durable API, not external
live editing; unexpected credential-file drift fails closed until restart.

The common period is separate from schedules: changing it never reanchors,
truncates or fabricates saved records. Personal imports must already match it.
Migration keeps the exact source in `original-SHA256.json` and requires an enabled
explicit owner. Acknowledged writes use serialized revision CAS, fsync and atomic
rename. Never steal a writer/users lock or silently initialize over corrupt data.
Data is unencrypted private local storage, not backup; scoped exports are not a
whole-household/credential backup and previous downloads cannot be recalled.

## Automated evidence and limits

- `npm run check`: passed.
- `npm test`: final 184/184, zero skips.
- Retained legacy root and prefix browser runners: each 35 groups / 127 axe scans,
  no detected violations, page errors or external requests. The first combined
  run hit the harness's 300s timeout during the second runner; root had completed,
  and a fresh standalone prefix run subsequently completed successfully.
  A final complete `npm run test:browser` (both legacy and both member runners)
  then passed with a 600-second harness limit.
- New member root and prefix runners: live totals, confirmation/source ownership,
  unshare while editing, offline/reconnect, durable user creation, common period,
  five workspaces at 390/1440, axe and logout purge passed.
- Focused startup/migration/period/scoped HTTP/persistence tests: 44/44 passed
  before adding the final private-at-create regression (included in 184/184).
- Live stack: CA-verified HTTPS, member login, Secure/HttpOnly/SameSite cookies,
  unauthenticated denial, private-data exclusion and current asset digests passed.
  An earlier asset comparison detected the expected pre-rebuild image; the final
  scoped rebuild and fresh digest comparison passed. No finance writes in smoke checks.

These are developer checks, not independent review, hosted CI, human UAT, release
approval, or production migration/deployment. The final source is uncommitted for
review; do not infer approval from healthy containers. Existing MS-006 isolation
harness was not rerun against Docker in this session.
