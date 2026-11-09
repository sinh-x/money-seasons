# Canonical-main production workflow: backend3080 / HTTPS3443

This is the tracked production Docker path, not `local:*` or a private preview snapshot. It runs `compose.yaml` plus `compose.production-local.yaml` from the **canonical checkout on main**, with a private environment file and immutable revision-tagged production images. The public-facing URL is currently **https://localhost:3443**, not the future `/lichtaichinh/` gateway route. No LAN/public/Funnel access or automatic host trust changes.

## Promotion and configuration

1. Verify a scoped feature/release candidate using Node, browser and synthetic Docker checks; keep source changes on a feature/release branch. Local tests do not issue native workflow approvals or human UAT.
2. On explicit operator approval, merge the verified release into `main` in the canonical checkout. Preserve history; no implicit remote push. Keep `develop` integrated too. Production builds never perform Git updates themselves.
3. Privately provision an authoritative data directory and separate Caddy directory, owned UID1000/mode0700; provision a separate generated passphrase file owned0600 outside those directories. Paths must be canonical, outside Git and free of links; no shared worktree/test storage. Existing data/secrets are never overwritten, copied or reset automatically.
4. Privately create `$HOME/.config/money-seasons/production.env` (parent0700/file0600) using the reference keys in `ops/production.env.example`. Set the exact canonical root, **full main commit SHA**, exact observed Docker daemon ID/socket, data/passphrase/CA references and `https://localhost:3443`. No literal passwords belong in `.env`, shell history, command arguments or Git. `MONEY_SEASONS_PRODUCTION_CONFIG` may select another private config path; it cannot override the canonical-main checks.
5. The local hostname is shared across ports. An optional stable `MONEY_SEASONS_COOKIE_NAME=ms_dev_<64-lowercase-hex>` uses the existing instance namespace support to avoid colliding with historical localhost sessions; this does not weaken Secure/HttpOnly/SameSite/CSRF checks. Ordinary production default remains `ms_session` when unset. MS-003 will separately implement its prefix/cookie contract.

User decisions on 2026-11-09: canonical repository is the intended main/production source; backend3080 and separate local HTTPS3443; **create a NEW separate empty production store and production credential**, retaining preview and old browser data. The new server stays empty until the user's explicit first save/import. Do not infer permission to import/convert real data or silently promote a test dataset. The future family URL and retained-original migration remain separate MS-003/DFC-003 work.

## Deploy and operate

From the canonical checkout:

```sh
npm run production:config    # validate main/canonical/private paths/ownership/daemon and Compose
npm run production:build     # build only revision-tagged production images; no running-service change
npm run production:up        # use prebuilt images, no pull/build; health wait <=90s
npm run production:status
npm run production:verify    # real CA HTTPS, health and unauthenticated API denial; no plan payloads
npm run production:down      # only production project; preserve all data/credentials/CA/images
```

Project is **money-seasons-production**, distinct from old `money-seasons`, preview and per-worktree dev projects. `up` does not evict occupied ports, stop other projects, pull, build, clone data, seed demos, migrate, clear writer locks or change Git. Missing images/private settings or unknown ownership refuses. Data/CA/credential binds, labels, exact tags, networks and publications are verified before effects. Unknown/stale writer locks need separately proven operator recovery; never automatically delete them.

Both services run with non-root/read-only roots, ALL capabilities dropped, no-new-privileges, 128MiB/PID64 and `restart: unless-stopped`. Backend is **127.0.0.1:3080** only. Caddy uses host networking but binds **127.0.0.1:3443 and [::1]:3443 only**, proxying HTTP to127.0.0.1:3080; its admin API and automatic trust/redirect installation are disabled. Docker must already be available at the explicit pinned daemon. A configured restart policy is not proof of a tested host reboot.

### Health-probe reaper fix

BusyBox HTTPS `wget` spawns `ssl_client` helpers. Without an init reaper, those orphaned helpers became zombies under Caddy PID1: observed51 zombies +8 Caddy threads, exhausted PID64 and `procReady not received`, despite externally healthy HTTPS. **Caddy now uses `init: true`**, like the app, so Docker's init process reaps adopted children. GOMAXPROCS2/PID64 and every security cap remain unchanged. A live100-probe test kept the preview Caddy PID count at8 before/after with healthy native probes. This is a targeted fix, not a privileged restart or relaxed PID cap; retain longer-term host observation separately.

## HTTPS and passphrase

Open **https://localhost:3443** (not HTTP3080 for login). Read the private passphrase file in your local editor; never share its contents or screenshots containing it. The new production passphrase is independent of preview and was not extracted from a clipboard screenshot.

The private CA persists under `$MONEY_SEASONS_CADDY_DIR/caddy/pki/authorities/local/`; only `root.crt` is public. A browser may warn because no host trust was installed. A site-specific localhost exception is an operator choice; never disable validation globally or share CA keys.

```sh
curl --cacert /absolute/private/production/caddy/caddy/pki/authorities/local/root.crt \
  https://localhost:3443/healthz
```

## Cutover, updates and rollback

Before occupying3080/3443, identify and retain the exact previous instance and image, prove its writer/data boundaries and keep its private credential/CA/data intact. Build/validate production **before** stopping that instance. Then explicitly stop only that prior project, start production and verify. On failure, stop only the checked production project and restore the retained previous instance; never adopt a foreign container or prune globally.

Later updates: verify/approve a new release, merge to main, privately update only the pinned release setting, build new tagged images, then explicitly deploy. Labels allow owned previous production revisions but refuse foreign storage/containers; data paths cannot change under a running instance without an explicit stopped transition. Old images and independent originals/backups must be retained for a compatible rollback. An older image may not read a newer schema; no automatic downgrade/conversion is claimed. Git rollback alone does not roll back financial data.

MS-003 can reuse this stable **HTTP3080-backend / separate HTTPS proxy** contract. Its eventual central Caddy root origin, `/lichtaichinh/` browser/API/cookie support, canonical-main real-data cutover and external device/UAT qualification remain unimplemented/deferred. The local3443 frontend is not authorization to edit the central gateway.
