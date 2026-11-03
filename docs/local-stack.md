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

## Historical qualification (earlier v2 candidate only)

**The evidence below predates this v3 revision; it is not fresh qualification.** This implementation session did not rebuild/restart or inspect the running stack. A previously started instance can still serve the older image and store. Export its original before a separately authorized upgrade; the new app gates a v1/v2 server store behind explicit preserved-original conversion. Current synthetic source checks are in [verification.md](verification.md).

The earlier local images were built and both containers reached healthy status on this machine. Verified the real TLS chain with the dedicated public CA (no `curl -k` or host trust changes), unauthenticated API refusal, production Secure/HttpOnly/SameSite cookie flags, hostile-origin/CSRF refusal, revision-conflict rejection, and plan-only export. Isolated Chrome logged in through Caddy and displayed the 14-month year groups and independently worked December–January cash carry. Restarting **only this stack's web container** preserved the synthetic plan/revision and invalidated its old session. The fixture was then replaced with an empty local test plan and unknown opening cash; no synthetic financial amounts remain in the running plan.

Node regression checks: **45/45 passed**, syntax checks and Compose config validation passed. Inspected the rendered synthetic Chrome month-detail screenshot. This is local-stack qualification, not real-family network verification or Sinh UAT. The existing port-3080 container's ID, original start time and image were unchanged. Host certificate trust/Tailscale/firewall settings were not altered.

The data directory is persistence, **not backup**. Export any wanted synthetic test plan before resetting. Nothing here automatically deletes state, imports browser data, seeds a real balance, updates the old service, or enables public/family access. Real rollout still requires independently verified private HTTPS/ACLs and Sinh UAT.
