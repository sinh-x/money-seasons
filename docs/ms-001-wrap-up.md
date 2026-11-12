# MS-001 — wrap-up and local integration handoff

## User request and scope

Sinh explicitly requested wrapping up and merging `feature/MS-001-configurable-planning` into local `develop`. Use a no-fast-forward merge to preserve the phase/follow-up history. This is a direct rogue-one local integration request, not a hosted PR, release, native workflow/package promotion, independent review or human UAT sign-off.

The clean canonical checkout is `/home/sinh/git-repos/sinh-x/money-seasons` on `develop`; the selected feature checkout is `/home/sinh/.treehouse/money-seasons-086445/1/money-seasons`. At preflight, `develop` was `b3d7e0fc268b23ae6906fb2c2624f736df9c64f1`, an ancestor of feature `41c60196b26ac95aed4a234362d8d2a1bf8b3b47`. The wrap-up documentation is committed on the feature before merging. The resulting local merge identity is available from `git log develop --merges` and the ticket closeout comment; this file does not pre-assert a completed merge.

A Git remote is configured, but **no push/fetch, remote merge, release tag, branch deletion or checkout return is part of this request**. Preserve the selected checkout and its runtime configuration references. `main` and `foundation-v0.1` are not integration targets.

## Delivered

- Four phase commits: `82f1017` Model; `66f3e49` Persistence/access; `b72dcd5` UI; `3739252` Integration.
- Five workspaces: Calendar, Expenses, Income, Cash Accounts and Debt; shared typed objects; amount-later entry; exact shorthand previews and literal-VND editing.
- Versioned private laptop JSON, shared passphrase/private HTTPS, durable serialized revision checks, visible failures/conflicts, explicit original-preserving migration and manual exports.
- Dated pooled cash forecasts; separate payable/receivable debt snapshots; ordinary manual repayment/collection plans with no automatic debt settlement.
- Full schedules independent of forecast windows (`b474963`); view-only collapse/expand (`9707513`); focused debt-total regressions (`41c6019`).
- Operating/schema/recovery guidance, historical-draft reconciliation and [unexecuted human UAT checklist](uat.md).

All fixtures/screenshots committed or referenced as test evidence are synthetic. No actual financial records, personal screenshots, exports, credentials or read-only support findings are included in this handoff. Live financial inputs remain outside Git. Bare numbers mean thousands; use explicit `VND` for literal amounts and check the preview.

## Fresh pre-integration checks

At feature `41c6019`, before documentation-only wrap-up:

- `git diff --check develop...HEAD` and `npm run check`: passed.
- `npm test`: **74/74**, no failures/skips/cancellations/todo.
- Isolated browser runner: **19 groups / 97 axe scans**, zero detected violations, page errors or external requests.
- Ephemeral synthetic logs: `/tmp/ms001-premerge-tests.log`; browser report/screenshots: `/tmp/ms-001-premerge-browser.bgax1m/`.

These are implementation checks, not an independently approved exact-FeatureSHA review or a security/accessibility certification. After the merge, verify its tree matches the feature and rerun syntax/Node checks from canonical `develop`. Record actual outcomes in the ticket rather than predicting them here.

## Runtime and data boundaries

The separately authorized localhost test stack previously deployed the production-source UI at `9707513`; later commits are test/documentation only. Its URL remains `https://localhost:3081`. Integration alone does not rebuild/restart it, change its mounted storage, apply corrections or migrate data. The old port-3080 instance remains separate. This wrap-up performs no fresh runtime health certification.

The local stack retains its private data/passphrase/CA under the existing documented external directory. Never copy them into Git or point two writers at the same store. If transitioning to a dedicated production directory, separately authorize the operation and export/verify/import privately. A Git merge is not a financial-data migration or backup.

**Known operational issue:** Caddy's OCI `procReady` health-check failure recurs despite `GOMAXPROCS=2`; short-term recovery used only a scoped Caddy restart. The underlying host/runtime cause remains unproven. Do not describe it as permanently fixed, relax PID/security limits, or alter other services without separate authorization. See [local-stack evidence](local-stack.md).

## Remaining work, not silently closed by integration

- Operator private Tailscale HTTPS/ACL/device qualification and any real production transition.
- All16 human UAT scenarios and remaining independent/native workflow/source review/publication work through existing owners. Keep historical r001/r002 artifacts unchanged.
- Permanent diagnosis of the recurring local Caddy probe failure.
- Any push/hosted PR, release to `main`, backup policy, real data correction/migration, or selected-checkout return requires its own explicit scope.

The canonical MS-001 ticket remains the single continuity record; local integration must not automatically declare its native requirements/review/UAT gates complete.
