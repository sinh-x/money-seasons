# MS-006 implementation verification

Date: 2026-11-09 · Branch: `feature/MS-006-docker-data-isolation` · Base: `ae6a7cbc7d8a0376ce367312c4c94f535974db2f`

## Disposition

P1–P4 implementation deliverables are present, with phase commits. **Not release-ready / not full acceptance:** the required live synthetic Docker proof is blocked by the absent isolated-daemon gate. No independent review, CI, native workflow approval, human UAT, production deployment, gateway change or household-data access was performed. Requirements/UAT **plan** approval is not executed UAT.

- P1 `6d7e640`: identity/private-path/port guards, fixed production 3080 and optional dev cookie names; 17 targeted tests passed at that checkpoint.
- P2 `5f20580`: bounded read-only snapshots, NEW-only datasets, exact originals/provenance and stopped-only selection; 42 targeted persistence/server/clone tests passed.
- P3 `c5034d5`: namespaced Compose/TLS/images/networks/credentials/runtime mounts and guarded lifecycle; 33 targeted tests passed. Live Docker verification remained unproven, not silently waived.
- P4 (accompanying commit): synthetic harness, browser cookie-jar checks, operating/compatibility docs, registration/collision hardening and final regression. The isolated Docker check refuses before daemon contact; this is a blocked proof, not a passing skip.

## Fresh checks

Linux/x64, UID1000, Node **v22.23.4**, npm **10.9.9**, Chrome **156.0.8078.79**. Existing pinned Playwright **1.63.0** / axe Playwright **4.11.1** dependencies were reused through a temporary worktree-local dependency symlink, removed afterward. No install/download/lockfile change or runtime dependency was added.

| Exact approved-plan command | Actual result |
|---|---|
| `npm run check` | Exit 0; includes new host helpers/harness/browser modules |
| `node --test test/local-stack.test.mjs test/deployment.test.mjs` | Exit 0; 12/12 tests |
| `node --test test/stack-data.test.mjs` | Exit 0; 13/13 tests |
| `node --test test/persistence.test.mjs test/auth.test.mjs test/server.test.mjs` | Exit 0; 36/36 tests |
| `npm test` | Exit 0; **121/121**, zero failures/skips/cancellations |
| `node scripts/stack-isolation-check.mjs --synthetic-only` | **Exit 1 / blocked:** explicit private Unix socket, expected isolated daemon ID/root not supplied. Refused BEFORE daemon contact or fixture creation; no default Docker fallback |
| `BROWSER_PATH="$(command -v google-chrome)" npm run test:browser` | Exit 0; **34 groups, 127 axe scans**, zero detected violations/page errors/external requests; includes two localhost-port cookie jars and peer logout isolation |

All seven commands were attempted; **6/7 exit 0, not 100%**. Additional registration/collision tests were followed by renewed syntax/targeted/full Node runs. Browser code was unchanged by that final guard-only adjustment. Do not claim AC-14/NFR-7 satisfied or Critical/Major review findings closed on this evidence.

Both Compose documents rendered successfully with `docker compose --env-file /dev/null ... config --format json`, using only synthetic placeholder paths/origins and no daemon. Production rendered `127.0.0.1:3080:3080`; development rendered its explicit port consistently in Caddy publication, environment, health and app origin. Static rendering is not runtime qualification. `git diff --check` passed.

Ephemeral logs: `/tmp/ms006-final-{syntax,identity,clones,store-auth,regression,docker,browser}.log`. Browser report/screenshots/synthetic exports: `/tmp/ms-001-browser-EdX2oC/`. These are temporary local evidence, not durable release artifacts; no actual financial content or production credentials were used. The browser report retains accessibility incomplete items for separate human review; zero automated violations is not accessibility certification or visual/human UAT.

## Coverage and remaining proof

- **AC-1–3:** fixed production port/static Compose, invalid/reserved/occupied port negatives, full identity/registration/device/inode binding, peer-port/relocation/collision refusal, and no partial registration poisoning. Actual concurrent two-stack publication remains Docker-gated.
- **AC-4/11:** unit command model exercises five scoped build/up/down cycles and rejects foreign mounts before Compose effects; source configuration is absent from lifecycle/runtime environments. Live P/B container/image/start/mount/data/session invariants are implemented in the harness but **not executed**.
- **AC-5/6/12:** synthetic atomic source replacement, read-only committed envelope/digest, independent original and working inodes, create-only same-ID race, bounded UTF-8/schema/size guards, private modes and symlink/hardlink/Git/overlap negatives. Fault injection at claim/write/data-sync/completion boundaries retains unselectable partial targets and existing manifests.
- **AC-7:** stopped-proof callback mandatory, actual CLI requires zero owned containers after scoped down, unknown writer locks/foreign/incomplete data refuse, previous datasets retained. Live daemon-stop/selection integration remains Docker-gated.
- **AC-8:** synthetic v1 and v2 copies require existing migration acknowledgment, preserve exact source/raw original/archive and change only the working copy. Current/newer/corrupt cases covered. No real-data migration performed.
- **AC-9/10:** source-secret/lock/CA/env/archive canaries not copied, random independent dev credentials, instance cookie namespaces and production-default Secure/HttpOnly/SameSite/CSRF/origin regressions. Same-browser localhost-port coexistence/logout was executed over test-only HTTP fixtures. Real Caddy TLS/independent-CA/runtime session tests are in the **unrun** Docker harness; no HTTPS runtime qualification is claimed.
- **AC-13/14:** scoped payload-free status/provenance and bounded refusals, exact guide for setup/new-copy/selection/migration/teardown/legacy recovery. Actual guide reproduction by the UAT owner, independent review, full seven-command pass and TS-1–TS-14 sign-off remain **Not run / not accepted**.

The tools do not implement destructive reset/delete, forced overwrite, in-place port editing, stale-lock stealing, automated refresh or production copy-back. Rejecting legacy port3081 and requiring full scoped down (not merely exited containers) before selection are conservative protections. Production's existing cookie name remains `ms_session` by default. No financial model/schema/calculation changes.

## Next operator action

Provision an explicitly isolated empty Docker daemon with cached exact bases, private socket/root and verified ID, following [the guide](worktree-isolation.md#automated-proof-and-human-uat), then rerun the Docker proof and all seven commands on the exact candidate under the applicable review authority. Do not point the harness at a normal/live daemon, provision production data, or weaken PID/security/ownership checks to make it pass. Resolve failures and owned-resource cleanup first; independent review/CI/human UAT and any real provisioning or rollout require their own evidence/authorization.
