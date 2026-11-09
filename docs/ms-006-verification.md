# MS-006 implementation verification

Date: 2026-11-09 · Branch: `feature/MS-006-docker-data-isolation` · Base: `ae6a7cbc7d8a0376ce367312c4c94f535974db2f`

## Current disposition

**All seven developer verification commands passed**, including real synthetic Docker isolation on the **explicitly operator-authorized shared development daemon**. This is a recorded variation from the original exclusive-empty-daemon prerequisite, not a claim that the original native operator gates were issued. Suitable for the user's requested local `develop` integration; **not production release approval, independent review, CI or human UAT**. No production setup, gateway/service change or household-data access occurred. Requirements/UAT **plan** approval remains distinct from executed UAT.

The user clarified that production setup is a later decision after integration, with the future main/GitHub checkout intended as the production location. This verification does not create or configure that production checkout, deploy anything, push Git branches, or change `main`.

## Phase history and follow-up approval

- P1 `6d7e640`: identity/private-path/port guards, fixed production 3080 and optional dev cookie names; 17 targeted tests passed at that checkpoint.
- P2 `5f20580`: bounded read-only snapshots, NEW-only datasets, exact originals/provenance and stopped-only selection; 42 targeted persistence/server/clone tests passed.
- P3 `c5034d5`: namespaced Compose/TLS/images/networks/credentials/runtime mounts and guarded lifecycle; 33 targeted tests passed.
- P4 `cb61349`: synthetic harness, browser cookie-jar checks, operating guide and registration/collision hardening; 121 Node tests and browser passed. **At that historical checkpoint** Docker exited 1 before daemon contact because the exclusive-daemon prerequisite was absent (six of seven commands passed). That result was not relabelled as a passing skip.
- Follow-up: the user explicitly answered **“Yes, run scoped tests on development Docker”** after being told the shared-daemon test prerequisite would differ. The harness now accepts only explicit `MS_ISOLATION_MODE=shared-development` plus a pinned Unix socket/daemon ID/root; exclusive remains the default and there is no silent fallback. Shared mode never inventories unrelated containers/networks/volumes and uses only new random-fixture-derived identities, exact tags and checked labels/mounts. Rootless mode refuses because remapped UID1000 cannot satisfy the retained private-bind contract.
- The Caddy base was cached, but the required Node base was not. The user separately answered **“Yes, pull the required Node base image”**. Only `node:22.23.0-alpine` was pulled into the development cache (digest `sha256:ab07539e0988b63558ff621f5fbe1077054c39d9809112974fb79993949d41cd`); no existing image tag/service was rebuilt or restarted. The base remains cached; the harness itself does not pull missing bases.

## Renewed checks

Linux/x64, UID1000, Node **v22.23.4**, npm **10.9.9**, Chrome **156.0.8078.79**. Pinned Playwright **1.63.0** / axe Playwright **4.11.1** dependencies were reused from the existing cache through a temporary dependency symlink. No npm install, dependency/lockfile change or runtime dependency was added.

The seven commands below were rerun in order. Docker environment explicitly selected `shared-development`, canonical socket `unix:///run/docker.sock`, and the independently read daemon ID/root. This environment is the approved developer-test variation, not native workflow admission.

| Exact command | Actual result |
|---|---|
| `npm run check` | Exit 0; includes runtime, host helpers, harness and browser modules |
| `node --test test/local-stack.test.mjs test/deployment.test.mjs` | Exit 0; 12/12 tests |
| `node --test test/stack-data.test.mjs` | Exit 0; 13/13 tests |
| `node --test test/persistence.test.mjs test/auth.test.mjs test/server.test.mjs` | Exit 0; 36/36 tests |
| `npm test` | Exit 0; **121/121**, zero failures/skips/cancellations |
| `node scripts/stack-isolation-check.mjs --synthetic-only` | **Exit 0:** real P/A/B synthetic stacks, five A rebuild/down/up cycles, TLS/auth/session isolation, copy-only migration, NEW-only clone, stopped-only selection and missing-data refusal; cleanup succeeded |
| `BROWSER_PATH="$(command -v google-chrome)" npm run test:browser` | Exit 0; **34 groups, 127 axe scans**, zero detected violations/page errors/external requests; includes same-browser localhost-port cookie coexistence and peer logout isolation |

**7/7 exit 0**, no required skips/cancellations. The Docker harness also passed once separately before this complete renewed run. Both runs cleaned up their owned containers/networks/image tags and temporary synthetic data. No unrelated workloads were inventoried, stopped or changed; no global prune/cleanup or real 3080/3081 endpoint was used. The separately approved Node base-image cache addition is the only retained Docker-cache effect.

Both Compose documents also rendered successfully with synthetic placeholder paths/origins and no runtime effects. Production rendered `127.0.0.1:3080:3080`; development rendered its explicit port consistently in Caddy publication, environment, health and app origin. `git diff --check` passed.

Ephemeral logs: `/tmp/ms006-merge-{syntax,identity,clones,store-auth,regression,docker,browser}.log`; first Docker pass `/tmp/ms006-shared-docker-1.log`. Browser report/screenshots/synthetic exports: `/tmp/ms-001-browser-KI2xWz/`. These are temporary local evidence, not durable release artifacts; no actual financial content or production credentials were used. Accessibility incomplete items remain in the browser report for human review; zero automated violations is not accessibility certification or human UAT.

## Coverage and remaining acceptance

- **AC-1–3:** fixed production port/static Compose, invalid/reserved/occupied port negatives, full identity/registration/device/inode binding, peer-port/relocation/collision refusal, and no partial-registration poisoning. Real P/A/B stacks concurrently used distinct nonreserved loopback HTTPS ports with internal app backends.
- **AC-4/11:** five real scoped A rebuild/down/up cycles preserved P/B container IDs/images/start times/mounts/data digests and authenticated sessions; A's saved data/credentials/CA persisted. Foreign mounts/attachments refuse before lifecycle effects. Normal lifecycle never receives a source config; missing selected data refused before startup.
- **AC-5/6/12:** synthetic atomic source replacement gives a whole committed envelope/digest; independent original/working inodes, same-ID race, bounded UTF-8/schema/size, private-mode/symlink/hardlink/Git/overlap negatives. Fault injection retains unselectable partial targets and existing manifests. Runtime clone created a NEW inactive dataset while A ran and refused reuse of an existing ID.
- **AC-7:** stopped proof mandatory; actual CLI requires zero owned containers after scoped down. Running selection refused in real Docker; stopped selection succeeded and retained the previous dataset. Unknown writer/foreign/incomplete negatives covered by Node tests.
- **AC-8:** v1/v2 Node copies and real v2 Docker copy require existing conversion acknowledgment, preserving source/raw original/archive and changing only the working copy. Current/newer/corrupt cases covered. No real-data migration occurred.
- **AC-9/10:** source-secret/lock/CA/env/archive canaries not copied; independent dev credentials, instance cookie namespaces, production-default Secure/HttpOnly/SameSite/CSRF/origin regressions. Real Caddy TLS verified using each fixture CA without disabling verification; separate CA identities, shared-cookie-header coexistence/peer logout and preserved P/B sessions checked. Actual browser same-host/different-port cookies checked separately on isolated test HTTP fixtures.
- **AC-13/14:** targeted payload-free status/provenance, bounded refusals and operating guide are present; all seven developer commands passed under the approved shared-development variation. **Independent review, CI, actual guide reproduction by the UAT owner and TS-1–TS-14 human sign-off remain Not run / not accepted.** No Critical/Major review disposition is fabricated from passing developer checks.

No destructive reset/delete, forced overwrite, in-place port editing, stale-lock stealing, automated refresh or production copy-back was added. Rejecting legacy port3081 and requiring scoped down before selection remain conservative protections. Production's cookie defaults to `ms_session`; no financial model/schema/calculation changes.

## Next steps

The user's requested local merge targets `develop` only, preserving feature phase history. Keep the ticket worktree/branch reserved; no checkout return, branch deletion, push, release or production deployment is implied. Independent review/CI/human UAT and any real provisioning or production setup require their own evidence/authorization. Use [the guide](worktree-isolation.md) for later explicit private-copy provisioning; never substitute live data or weaken security/ownership checks to make a test pass.
