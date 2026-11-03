# Local Docker + Caddy test stack

This **separate local/synthetic stack** uses the current feature checkout, not the old foundation image on port 3080. It does not expose family/Tailscale/LAN access or change host trust/firewall/Tailscale settings. Use synthetic data only; do not import the household plan here.

## Start / stop

Requires Docker Compose and host UID 1000 (matching the non-root containers):

```sh
npm run local:up       # private bootstrap, image build, start and wait for both health checks
npm run local:status
node scripts/local-stack.mjs logs
npm run local:down     # stops only money-seasons-local-test; preserves state/certificates
```

Open **https://localhost:3081** — use exactly `localhost`, not `127.0.0.1` (certificate/origin restrictions are intentional). No plain HTTP login or HTTP redirect port is published. Do not combine `compose.local.yaml` with `compose.yaml`; it is a standalone Compose project named `money-seasons-local-test`.

The bootstrap creates private files outside all checkouts under:

```text
~/.local/share/money-seasons-local-test/
  passphrase       # generated random local-only password, 0600; never printed or overwritten
  data/            # authoritative local test JSON/lock, 0700
  caddy/           # local CA/certificates, 0700; includes private CA keys
```

Open the **passphrase file in your local editor** to copy it into the login form. Do not paste it into a ticket/chat/log, put it in a command argument, or reuse it for the family's real app. Re-running the bootstrap preserves the secret and existing data. Unsafe existing permissions/symlinks fail closed; the script does not relax permissions or replace files.

## Local certificate

Caddy issues a certificate with its own **local CA**. Your browser will initially warn because this CA is not installed on the host. No public ACME requests or automatic host/container trust installation occur. For this localhost-only synthetic test you may use a site-specific browser exception, or separately choose to trust **only the public root certificate** manually. Never disable certificate validation globally.

The public CA certificate (after startup) is:

```text
~/.local/share/money-seasons-local-test/caddy/caddy/pki/authorities/local/root.crt
```

Verify HTTPS without modifying any trust store:

```sh
curl --cacert "$HOME/.local/share/money-seasons-local-test/caddy/caddy/pki/authorities/local/root.crt" \
  https://localhost:3081/healthz
```

Do not export/share Caddy's entire directory: it contains the private CA key. Its persistence keeps the local certificate authority stable across normal restarts. Deleting it changes the CA and invalidates any previously trusted root/exception.

## Isolation and persistence

- Only Caddy publishes a port: **127.0.0.1:3081**. The Node app has no host port; it joins only an isolated internal Docker backend network. Caddy alone also joins a dedicated edge bridge for loopback port publication (Docker suppresses published ports on internal-only networks).
- Caddy reverse-proxies the original Host/Origin to `web:3080`. Production Secure/HttpOnly/SameSite=Strict cookies and CSRF checks remain enabled; there is no insecure-auth mode.
- Both processes run non-root, read-only root, dropped capabilities, bounded memory/logging. The dedicated Caddy image removes upstream's unnecessary low-port executable capability at build time, so it can run on 3081 with **all** runtime capabilities dropped. Caddy gets private persistent `/data` plus bounded tmpfs for `/config` and `/tmp`; its admin API is disabled.
- The existing `money-seasons-web-1` on **127.0.0.1:3080** and all other Compose projects are left alone. No shared networks, stores, images or secret mounts with that app.
- Rebuild with `npm run local:up` after source changes; there is no live bind-mounted source. The new image names are `money-seasons-local-test-web:latest` and `money-seasons-local-test-caddy:2.10.2`, distinct from other projects' images.
- `local:down`/`local:up` keep acknowledged test saves and local certificates. Sessions are in memory: log in again after the app restarts. Graceful shutdown releases the writer lock. Do not delete a stale lock after an unclean stop without proving the exact writer is gone; see [operator recovery](ms-001.md#operator-recovery).

## Current v3 update (2026-11-03, explicitly requested)

**Latest update:** separately confirmed collapse/expand controls (`9707513`), including the earlier full-schedule/overlapping-forecast behavior (`b474963`), were rebuilt and deployed. Use arrows/names or **Thu gọn tất cả / Mở rộng tất cả** in the current workspace; totals remain visible and no financial saves occur from disclosure toggles. All six served HTML/JS/CSS assets match that checkout over CA-verified HTTPS; unauthenticated finance/session endpoints return401/no-store. Existing private mounts were retained, with no authenticated finance access/migration. The old3080 container ID/image/start time remained unchanged.

**Operational caveat:** the OCI `procReady` health-check failure recurred after the earlier `GOMAXPROCS=2` adjustment. Docker reported60 container tasks while the Caddy process had8 threads, so the original concurrency explanation is not a proven root cause or durable fix. Restarting only local Caddy restored healthy native probes; both services were healthy at verification. No PID/security limits were relaxed. Further host/runtime investigation is separate; do not treat a short healthy check as long-term resolution.

Following Sinh's request to update the local stack, rebuilt the current app and recreated only the `money-seasons-local-test` services as needed. Both web and Caddy are healthy at **https://localhost:3081**. Existing private data/passphrase/CA mounts were retained; no login, finance read, plan replacement or migration was performed. A legacy plan may still require the explicit preserved-original conversion after you log in.

The first update exposed the pre-existing unhealthy Caddy probe (`procReady not received`): the Caddy container reported60 tasks under its64-PID limit. Set `GOMAXPROCS=2` for the local Caddy service to leave headroom without relaxing the PID/capability/security limits. After recreation, Caddy used11 tasks and its native probes passed. The configuration regression now asserts both the concurrency bound and retained64-PID limit.

Verified the real local-CA HTTPS chain, `/healthz` version0.3.0, byte equality of all six deployed HTML/JS/CSS assets against the checkout, and unauthenticated401/no-store responses for plan/export/session. No certificate-validation bypass or host trust/Tailscale/firewall changes. All64 Node tests passed after the configuration adjustment. The old port3080 container retained exactly its pre-update ID, image and start time. This is local-stack update evidence, not human UAT or real-family access acceptance.

## Historical qualification (earlier v2 candidate only)

**The evidence below predates this v3 revision; it is not fresh qualification.** At the original four-phase implementation checkpoint, the running stack had not been rebuilt/restarted or inspected. The separately authorized v3 update is recorded above; old data can still use the legacy schema until explicitly converted. Export its original before a separately authorized upgrade; the new app gates a v1/v2 server store behind explicit preserved-original conversion. Current synthetic source checks are in [verification.md](verification.md).

The earlier local images were built and both containers reached healthy status on this machine. Verified the real TLS chain with the dedicated public CA (no `curl -k` or host trust changes), unauthenticated API refusal, production Secure/HttpOnly/SameSite cookie flags, hostile-origin/CSRF refusal, revision-conflict rejection, and plan-only export. Isolated Chrome logged in through Caddy and displayed the 14-month year groups and independently worked December–January cash carry. Restarting **only this stack's web container** preserved the synthetic plan/revision and invalidated its old session. The fixture was then replaced with an empty local test plan and unknown opening cash; no synthetic financial amounts remain in the running plan.

Node regression checks: **45/45 passed**, syntax checks and Compose config validation passed. Inspected the rendered synthetic Chrome month-detail screenshot. This is local-stack qualification, not real-family network verification or Sinh UAT. The existing port-3080 container's ID, original start time and image were unchanged. Host certificate trust/Tailscale/firewall settings were not altered.

The data directory is persistence, **not backup**. Export any wanted synthetic test plan before resetting. Nothing here automatically deletes state, imports browser data, seeds a real balance, updates the old service, or enables public/family access. Real rollout still requires independently verified private HTTPS/ACLs and Sinh UAT.
