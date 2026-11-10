# Canonical-main production workflow: backend3080 / HTTPS3443

This is the tracked production Docker path, not `local:*` or a private preview snapshot. It runs `compose.yaml` plus `compose.production-local.yaml` from the **canonical checkout on main**, with a private environment file and immutable revision-tagged production images. MS-003 adds two supported profiles below. These source changes do **not** update the running installation: the last operator-reported deployment was root-local **https://localhost:3443**. Full private-tailnet integration still requires application release/deployment, DFC-003 gateway cutover and real device/UAT evidence. No LAN/public/Funnel access or automatic host trust changes.

## Promotion and configuration

1. Verify a scoped feature/release candidate using Node, browser and synthetic Docker checks; keep source changes on a feature/release branch. Local tests do not issue native workflow approvals or human UAT.
2. On explicit operator approval, merge the verified release into `main` in the canonical checkout. Preserve history; no implicit remote push. Keep `develop` integrated too. Production builds never perform Git updates themselves.
3. For an **existing installation, retain** its authoritative data directory, separate Caddy directory and credential. New provisioning is only for a separately authorized new installation: directories owned UID1000/mode0700 and credential owned0600 outside them. Paths must be canonical, outside Git and free of links; no shared worktree/test storage. Existing data/secrets are never overwritten, copied or reset automatically.
4. Privately create `$HOME/.config/money-seasons/production.env` (parent0700/file0600) using the reference keys in `ops/production.env.example`. Set the exact canonical root, **full main commit SHA**, exact observed Docker daemon ID/socket, data/passphrase/CA references and `https://localhost:3443`. No literal passwords belong in `.env`, shell history, command arguments or Git. `MONEY_SEASONS_PRODUCTION_CONFIG` may select another private config path; it cannot override the canonical-main checks.
5. The local hostname is shared across ports. An optional stable `MONEY_SEASONS_COOKIE_NAME=ms_dev_<64-lowercase-hex>` selects the instance namespace; root defaults to `ms_session`. With a prefix, the effective name becomes `ms_path_` + SHA-256 of UTF-8(namespace + NUL + prefix), and Path becomes prefix + `/`. Login/logout use the same host-only name/path and retain Secure/HttpOnly/SameSite=Strict, CSRF, rate/session limits and exact Host/Origin checks. Do not set the derived name as the configured namespace. Changing prefix invalidates sessions; reauthenticate. No unrelated/root cookie is cleared. Cookie paths/names avoid accidental collisions, **not isolation from untrusted same-origin applications**.

Historical initialization on 2026-11-09 created separate empty production storage and a credential. **Later that day Sinh explicitly authorized a one-time copy of the saved3081 plan**, with a retained private original (MS-003 comment `c-20261109104335905`); subsequent wrap-up confirmed it. Production now holds the authoritative independent copy, not an empty store. Never silently recopy3081, replace credentials/CA, seed, convert or reset. Refresh private metadata at an authorized cutover; historical comments are not current byte/revision proof.

## Exact profiles and URL contract

Root-local remains compatible with existing private config: omit `MONEY_SEASONS_BASE_PATH` or set it empty, with `MONEY_SEASONS_ORIGINS=https://localhost:3443`.

For the selected tailnet-with-local-fallback profile, replace only these private configuration settings after the release/backup/cutover gates:

```dotenv
MONEY_SEASONS_BASE_PATH=/lichtaichinh
MONEY_SEASONS_ORIGINS=https://drgnfly.tail10c2c6.ts.net,https://localhost:3443
```

The production parser permits only those two profiles: no extra/duplicate origins, HTTP, paths, trailing slashes, wildcard hosts, unknown/duplicate keys or alternate ports. Origin ordering may be canonicalized. The proxy profile is derived, not another private-file setting. An ambient shell prefix/origin cannot override private pins; use `production:*`, not bare Compose as an alternative deployment controller. See `ops/production.env.example`.

General application deployments accept empty or an ASCII prefix of at most128 bytes matching `^/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*$`. No trimming/normalization; `/`, trailing/repeated slashes, dot segments, escapes, Unicode, whitespace, query/fragment and markup are rejected before credentials/store/listen. The browser reads inert escaped startup configuration and uses the same grammar. Malformed present configuration stops before API calls. CSP and runtime dependencies are unchanged; no HTML base element or forwarded-prefix authority.

Example: browser `/lichtaichinh/api/plan` becomes backend `/api/plan` after **one** proxy strip. All assets/transitive modules, home, session/login/logout, save/read/export and recovery stay prefixed. The backend itself still serves root-internal routes and `/healthz`; never add another strip there.

| Local3443, prefixed profile | Result |
| --- | --- |
| `/` or `/lichtaichinh` |308 to `/lichtaichinh/`, preserving query and method/body |
| `/lichtaichinh/*` | Strip one prefix and proxy to HTTP127.0.0.1:3080 |
| `/healthz` | Root-internal health proxy for existing probes |
| Unprefixed assets/API, similarly named or double-prefixed routes |404, no root app alias |

Root-local retains its existing root proxy. Local TLS remains bound to both loopbacks with the existing CA. DFC-003 owns the **separate central gateway** redirect/strip route and actual TLS/hostname/device policy; its root `/api/*` belongs to another service. Both proxies preserve public Host/Origin; no auth-header rewrite or forwarded-header bypass. Local CA tests do not prove tailnet TLS.

## Deploy and operate

From the canonical checkout:

```sh
npm run production:config    # validate main/canonical/private paths/ownership/daemon and Compose
npm run production:build     # build only revision-tagged production images; no running-service change
npm run production:up        # RECREATE owned services from prebuilt images; no pull/build; health wait <=90s
npm run production:status
npm run production:verify    # real CA HTTPS, health and unauthenticated API denial; no plan payloads
npm run production:down      # only production project; preserve all data/credentials/CA/images
```

Project is **money-seasons-production**, distinct from old `money-seasons`, preview and per-worktree dev projects. `up` does not evict occupied ports, stop other projects, pull, build, clone data, seed demos, migrate, clear writer locks or change Git. Missing images/private settings or unknown ownership refuses. Data/CA/credential binds, labels, exact tags, networks and publications are verified before effects. `up` explicitly recreates the owned services, including configuration-only changes; it is a disruptive authorized deployment, not a harmless check. `verify` refuses stale release/prefix/origin/cookie/proxy settings and uses profile-correct local HTTPS routes; `status` exposes only allowlisted identity/profile-match results, not raw environments. Ownership inventory still recognizes owned prior revisions/profiles so they can be stopped/recreated. Unknown/stale writer locks need separately proven operator recovery; never automatically delete them.

Both services run with non-root/read-only roots, ALL capabilities dropped, no-new-privileges, 128MiB/PID64 and `restart: unless-stopped`. Backend is **127.0.0.1:3080** only. Caddy uses host networking but binds **127.0.0.1:3443 and [::1]:3443 only**, proxying HTTP to127.0.0.1:3080; its admin API and automatic trust/redirect installation are disabled. Docker must already be available at the explicit pinned daemon. A configured restart policy is not proof of a tested host reboot.

### Health-probe reaper fix

BusyBox HTTPS `wget` spawns `ssl_client` helpers. Without an init reaper, those orphaned helpers became zombies under Caddy PID1: observed51 zombies +8 Caddy threads, exhausted PID64 and `procReady not received`, despite externally healthy HTTPS. **Caddy now uses `init: true`**, like the app, so Docker's init process reaps adopted children. GOMAXPROCS2/PID64 and every security cap remain unchanged. A live100-probe test kept the preview Caddy PID count at8 before/after with healthy native probes. This is a targeted fix, not a privileged restart or relaxed PID cap; retain longer-term host observation separately.

## HTTPS and passphrase

Open **https://localhost:3443/** for root-local or **https://localhost:3443/lichtaichinh/** for the prefixed profile (not HTTP3080 for login). Read the private passphrase file in your local editor; never share its contents or screenshots containing it. The new production passphrase is independent of preview and was not extracted from a clipboard screenshot.

The private CA persists under `$MONEY_SEASONS_CADDY_DIR/caddy/pki/authorities/local/`; only `root.crt` is public. A browser may warn because no host trust was installed. A site-specific localhost exception is an operator choice; never disable validation globally or share CA keys.

```sh
curl --cacert /absolute/private/production/caddy/caddy/pki/authorities/local/root.crt \
  https://localhost:3443/healthz
```

## Cutover, updates and rollback

Before occupying3080/3443, identify and retain the exact previous instance and image, prove its writer/data boundaries and keep its private credential/CA/data intact. Build/validate production **before** stopping that instance. Then explicitly stop only that prior project, start production and verify. On failure, stop only the checked production project and restore the retained previous instance; never adopt a foreign container or prune globally.

Later updates: verify/approve a new release, merge to main, privately update only the pinned release setting, build new tagged images, then explicitly deploy. Labels allow owned previous production revisions but refuse foreign storage/containers; data paths cannot change under a running instance without an explicit stopped transition. Old images and independent originals/backups must be retained for a compatible rollback. An older image may not read a newer schema; no automatic downgrade/conversion is claimed. Git rollback alone does not roll back financial data.

### Existing-data app-first cutover checklist

1. Record the verified feature/release candidate, independent review and CI evidence or explicit owning disposition. Obtain explicit canonical-main promotion permission; preserve history and integrate develop through its owner. Pin the full clean main commit and build/validate images **before** stopping services. Do not run production commands from a feature worktree or infer remote push permission.
2. With exact instance/action permission, refresh only metadata needed to identify canonical release/image, daemon ID/socket, project/container labels, private data/credential/CA references, current writer and schema compatibility. Do not dump environments or financial records. Record exact previous compatible images/config privately.
3. Arrange a no-edit window and a private retained-original backup procedure. Separately authorize stopping **only** the owned production writer; prove containers stopped and writer-lock settlement. Before new software writes, create an exclusive original using verified ownership/private-mode/no-follow/size/durability guards; verify it privately. Keep the source untouched. Unknown locks, backup or durability stop the cutover; no automatic lock clearing. This repository does not provide a generic backup/copy command to execute blindly.
4. Update only approved release/profile pins, retaining data/credential/CA/original references. Start one writer through the guarded production workflow. Verify local prefix, real local-CA TLS, health and routing; perform the separately authorized **read-only** private plan/envelope/revision equality check. Report only equality/revision outcomes, never payloads, passwords, keys, exports, low-entropy secret hashes or personal screenshots. `production:verify` deliberately performs no authenticated data read, so its pass is not this equality proof.
5. Supply DFC-003 the exact ready release/profile, local verification and HTTP127.0.0.1:3080 contract. Its owner reconciles its gateway baseline, preserves unrelated root/API routes and existing TLS/listener, validates, obtains reload permission and cuts over. Do not wait for gateway completion to implement/release the app, and do not mark full integration accepted at app readiness.
6. After gateway cutover, qualify valid tailnet TLS/hostname,308 slash/query behavior, prefixed auth/assets and unrelated gateway routes. Operators must prove permitted-device access, unauthorized-device denial **before app access**, no public/Funnel access and no direct LAN/backend exposure. No automatic Serve/443/ACL/firewall/trust change. Sinh performs actual desktop/mobile UAT. A real-plan edit/save needs separate explicit consent; do not inject a synthetic fixture or silently replace a plan to test saving. Keep3443, the CA and all rollback resources until separately retired.

Rollback: stop only the checked new writer, retain any intervening writes as another private original, and establish old-image/data-schema compatibility. For compatible software, retain current data and use the checked prior release/profile; DFC-003 rolls back its route through its owner. For incompatible or unknown schemas, stop for an explicit recovery/loss-window decision—never overwrite current data automatically or claim Git reversal restores data. Reverify local endpoint and private references. No dual writers, global prune or automatic resource retirement.

## Synthetic qualification and remaining acceptance

`npm run check`, `npm test` and `npm run test:browser` cover syntax, unit/security and isolated browser root/prefix flows (including conflicts/lost acknowledgements/legacy originals). The browser runner uses no normal profile or real service. `npm run test:isolation` retains the MS-006 daemon gate. `npm run test:production-profiles` uses that same explicit daemon gate and only new labelled fixtures/nonreserved ports: renders both actual Compose profiles, exercises tracked Caddy routing with test-only port substitutions, verifies TLS/auth/100 health probes per transition and rehearses root→prefix→compatible-root with unchanged synthetic plan bytes/revision/credential/CA. No household data is used. It does not call production:* or bypass canonical-main checks. Shared-development mode requires explicit operator approval and pinned socket/ID/root; missing prerequisites fail, never use the default daemon silently.

Synthetic results are not independent review, hosted CI, installed production qualification, a real old-image compatibility proof, gateway/device qualification or human UAT. Those remain separately pending until their owners supply exact evidence. The local3443 frontend never grants gateway-edit or sensitive-data authority.
