# MS-006: private worktree environments

## Boundaries

Production Compose reserves **127.0.0.1:3080** behind its existing private HTTPS gateway. Development rejects 3080 and **3081** (the historical singleton). This change does not restart or inspect production, change the gateway, adopt the singleton, or authorize household-data access. Never combine `compose.local.yaml` with production Compose. Use the scoped CLI, not hand-written Compose overrides.

Requirements/UAT-plan r001 were directly approved; implementation and automated checks are **not independent review, release approval or human UAT**. The operator later explicitly approved scoped synthetic verification on the existing development daemon and pulling its missing Node base image. See [verification](ms-006-verification.md) for actual results and remaining checks. No reset/delete/refresh-in-place/merge/copy-back exists. A “reset” means clone a NEW dataset and explicitly select it after stopping; old copies remain recoverable.

## Prerequisites and identity

Linux, Node 22+, host UID **1000**, Docker Compose, local atomic-rename/file+directory-fsync filesystem. Never broaden permissions, run privileged, steal a writer lock, or change host trust/firewall settings to make a check pass. Build images require available base images; automatic verification requires cached exact bases and an operator-supplied isolated daemon.

Identity is SHA-256 of the registered repository's canonical Git common directory plus the **physical worktree root**, not branch name/basename. The manifest also binds the checkout registration and filesystem device/inode. Branch changes preserve identity; moved/replaced/foreign manifests refuse, never auto-adopt. Two existing separately allocated worktrees get different identities even with equal basenames. A truncated Docker prefix is checked against full instance labels before effects.

State is outside Git:

```text
$HOME/.local/share/money-seasons-dev/FULL_WORKTREE_SHA256/
  instance.json                 # private identity, explicit port, selected dataset ID
  passphrase                    # independent random dev credential, created only for runtime
  caddy/                        # independent private CA/certificates; never share this directory
  datasets/ID/
    original.json               # exact immutable-by-convention source bytes; independent inode
    dataset.json                # complete provenance: digest/schema/version/revision/timestamp
    data/plan.json              # independent writable copy, the ONLY app data bind
```

Managed state directories are owned **0700** and host-created files **0600**, never symlinks/hardlinks. Existing unsafe modes/owners/aliases/Git-contained paths refuse; the tools do not repair them. Shared `.local`/`share` ancestors may be owned non-writable-by-others directories. Do not copy/move the manifest between checkouts. A stale `registry.lock` / `operation.lock` is unknown state: prove the exact process is gone before separately authorized operator recovery. Do not automate lock deletion.

## First setup — synthetic qualification

Use **two already allocated/admitted checkouts**; no branch/worktree allocation is performed by these commands. Choose distinct explicit ports 1024–65535 excluding 3080/3081 (e.g. A=3082, B=3083). Ports are persisted, never picked as fallback or killed on collision. Port changes on an initialized instance refuse; no in-place port-edit interface is provided.

Create a synthetic committed JSON envelope and private source configuration from either checkout:

```sh
export MS_SYNTHETIC_ROOT="$(mktemp -d /tmp/ms006-source.XXXXXX)"
node --input-type=module <<'NODE'
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { blankPlan } from './public/model.js';
const root = process.env.MS_SYNTHETIC_ROOT;
await fs.mkdir(path.join(root, 'source'), { mode: 0o700 });
const planFile = path.join(root, 'source/plan.json');
await fs.writeFile(planFile, JSON.stringify({ schemaVersion: 'money-seasons-store/v1', revision: 1, plan: blankPlan() }), { flag: 'wx', mode: 0o600 });
await fs.writeFile(path.join(root, 'source.json'), JSON.stringify({ planFile }), { flag: 'wx', mode: 0o600 });
NODE
export MS_SOURCE_CONFIG="$MS_SYNTHETIC_ROOT/source.json"
```

Run in **worktree A** (and the same steps in **worktree B**, using port **3083**, dataset **b-001**, and its own existing checkout):

```sh
npm run local:init -- --port 3082
npm run local:clone -- --source-config "$MS_SOURCE_CONFIG" --dataset a-001
npm run local:select -- --dataset a-001
npm run local:up
npm run local:status
```

`init` registers state/port; it does not provision data, generate production credentials or start containers. `clone` does not select. `select` requires Docker to prove **no containers remain for this instance**, including stopped containers; use scoped `down` first. Unknown/unreachable daemon state is not a stopped proof. Both the previous and target dataset must be complete, owned, valid, and free of any writer lock. Foreign/incomplete IDs refuse.

Open **https://localhost:3082** and **https://localhost:3083** (exact hostname/port). Read each instance's private `passphrase` in a local editor; never print/paste it into logs, screenshots or tickets. Cookies have independent full-instance names; one browser can keep both logins. Restarting one app invalidates only its in-memory sessions, so log into that instance again.

Only Caddy publishes loopback HTTPS. The app's 3080 remains **internal**, not a host publication. Caddy's listen address, health URL and app's exact allowed origin use the same stored port. Non-root/read-only roots/ALL dropped capabilities/no-new-privileges/128MiB/PID64 remain; Caddy retains GOMAXPROCS=2. Builds have no container network access. Runtime never receives a source-config path, source mount, production credential or production CA.

## Local certificates

Every instance has its own CA. Host trust is never automatically modified. A site-specific browser exception is an operator choice; do not disable certificate checking globally or share private CA keys. Verify without trust-store changes using the public root path from the exact instance status:

```sh
curl --cacert /absolute/instance/caddy/caddy/pki/authorities/local/root.crt \
  https://localhost:3082/healthz
```

The certificate is public; its surrounding directory includes private keys. Keep all instance state private. Retaining `caddy/` preserves the CA through rebuild/down/up.

## Separately authorized real-data clone

This implementation session does **not** authorize a real clone. When the operator separately authorizes access, privately configure a 0600 JSON file in an owned 0700 directory outside Git:

```json
{"planFile":"/absolute/operator-selected/private-source/plan.json"}
```

The source must be an owned 0600, single-link regular **committed store envelope**, in a private 0700 directory outside Git, with no symlink components. Plan-only browser exports are not store envelopes and are rejected. Source/development storage cannot overlap or be nested. Maximum plan is 1,000,000 UTF-8 bytes; envelope 1,001,024 bytes. Current and supported v1/v2 plans validate; corrupt/newer schemas refuse without creating defaults.

The host command reads **one read-only/no-follow descriptor**, giving the old OR new committed atomic-renamed envelope while the source app keeps running. It never calls `openStore` on the source, touches its lock, writes/stops it, copies unrelated files, or mounts it into development. Source writers must use the existing atomic replacement protocol, not edit JSON in place. No credentials, locks, sessions, certificates, `.env`, archives or other files are copied. Only raw original, independent working envelope and payload-free provenance are created.

Private copies retain real names/amounts/history for faithful trials. They are **unencrypted**; do not put them in Git, shared backup/sync locations, screenshots, test artifacts, ticket attachments or logs. Automated checks always use synthetic data.

## Migration, trial edits and refresh

Open the selected copy in the version being tested. v1/v2 conversion reuses the application's existing review/acknowledgment/explicit confirmation UI; cancellation saves nothing. Confirmation archives the exact legacy envelope inside the working directory before changing it. `original.json` always preserves the exact clone input independently of migrations. No financial-model/conversion rules were changed by MS-006.

To trial fresher data, **never reuse an existing ID** (IDs match `[a-z0-9][a-z0-9-]{0,63}`). No `--force`/overwrite flag exists:

```sh
# In A; a-001 may still be running. This does not select/switch it.
npm run local:clone -- --source-config "$MS_SOURCE_CONFIG" --dataset a-002
npm run local:down
npm run local:select -- --dataset a-002
npm run local:up
```

A/a-001 remains private/recoverable; B and production are unchanged. To return, stop A and explicitly select a-001. Do not edit manifests directly. A failed/interrupted/ENOSPC clone retains a partial directory, never marks it selectable, and never changes current selection. Use a different new ID; partial disposal/retention is a separate operator task, not an automatic cleanup.

## Lifecycle, status, teardown and recovery

```sh
npm run local:status       # exact worktree/instance/URL/dataset/provenance, no finance/secret payload
npm run local:up           # rebuild scoped images, start selected data, wait <=90s for health
npm run local:build        # rebuild scoped image tags only, no container replacement
npm run local:down         # scoped stop/removal; preserve all data/credentials/CA/images
```

Labels, image tags, networks, bind mounts, service names and loopback publications are checked **before** lifecycle changes. Unknown ownership or unreachable Docker refuses; no global `down`, prune, volume deletion, orphan removal or automatic adoption. `.env`, `COMPOSE_*`, production variables and caller `MS_DEV_*` overrides cannot retarget the CLI. Direct Docker commands bypass these guards and are not the supported interface.

Down/up/build must never need a source config. Missing selected working data fails before Docker startup; no empty/demo seed, source fallback, lock clearing or automatic switch occurs. Health timeout is nonzero and preserves resources for private diagnosis; do not relax PID/security limits to hide the historical Caddy `procReady` issue. `status` is a snapshot, not proof of data durability/backup or long-term host health.

Teardown is **down only**. Dataset deletion, disk-space management, image pruning, CA replacement, moved-checkout recovery and legacy-singleton maintenance are deferred. For stale/unknown `writer.lock`, follow [existing operator recovery](ms-001.md#operator-recovery); never unlink a lock while its exact writer might exist. Missing/corrupt state needs private operator diagnosis, not an automated repair or source overwrite.

## Automated proof and human UAT

Run the seven commands from the approved plan (details in [verification](ms-006-verification.md)). `npm test` owns synthetic temp data; browser checks own ephemeral loopback servers/profiles, never existing endpoints. Test-only insecure HTTP cookies are excluded from the production image; production/default auth remains Secure/HttpOnly/SameSite=Strict and CSRF/origin enforced.

By default, the Docker harness requires an **exclusive empty daemon** on a private owned Unix socket and private Docker root, exact daemon ID, and cached exact Node/Caddy base images. It never starts a daemon, silently selects a default endpoint, downloads missing bases, or substitutes real services. Rootless Docker is rejected because its UID remapping does not satisfy the unchanged host/container UID1000 private-bind contract:

```sh
export MS_ISOLATION_DOCKER_HOST=unix:///absolute/private/fixture-daemon/docker.sock
export MS_ISOLATION_DAEMON_ID=operator-verified-id
export MS_ISOLATION_DOCKER_ROOT=/absolute/private/fixture-daemon/data
node scripts/stack-isolation-check.mjs --synthetic-only
```

Exclusive-mode preflight binds socket/ID/root, checks no existing containers/volumes/foreign networks, and verifies cached bases.

**Separately approved development-daemon mode:** when the operator explicitly authorizes shared development Docker, set `MS_ISOLATION_MODE=shared-development` alongside an explicit canonical Unix socket (for example `unix:///run/docker.sock`) and the independently checked daemon ID/root. This is an intentional test-prerequisite variation, not an automatic fallback or authorization to use production. In this mode the harness does not inventory unrelated containers/networks/volumes: all subsequent queries/mutations are restricted to new random-fixture-derived full identities, guarded labels, exact image tags and mounts. It still requires both base images cached; any missing-base pull requires separate approval and is not performed by the harness. Existing service/container/data lifecycles, reserved ports and global cleanup remain off limits.

The harness copies code into two equal-basename synthetic source roots (no Git checkout lifecycle), starts protected synthetic source P plus A/B on nonreserved ephemeral ports, verifies real TLS using each CA, edits/migrates/selects copies and performs **five A rebuild/down/up cycles**, comparing P/B IDs/images/start times/mounts/digests/sessions. Cleanup removes only owned labelled fixture resources; uncertain cleanup retains private temp state and exits nonzero. No required skip counts as success.

Human UAT remains separate: use two independently admitted existing worktrees and disposable synthetic data; execute TS-1–TS-14 in the approved plan. Verify production's fixed port statically, never probe live 3080/3081 during automated tests. A passing seven-command developer run is automated evidence only. AC-14/human UAT, independent review and release readiness still require their respective owners' evidence.
