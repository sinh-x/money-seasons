# 0.4.0 — Individual plans and one shared Home

## Scope

MS-005 integrates distinct member logins, owner-only private finance and one derived
shared Home. Shared edits update one source with confirmation; only owners change
privacy. Account history follows parent privacy. Admin manages access/passwords
and the common forecast period, not other members' private finances. Role grants
remain private operator configuration. Existing exact-VND, unknown/zero, schedule,
estimate, cash/debt, expense-tag and conflict/durability semantics are retained.

The Vietnamese My/Home five-workspace UI polls every two seconds, blocks edits
when disconnected, refreshes permissions on reconnect, and clears obsolete foreign
drafts on privacy revocation. Routine polling/disclaimer/debug ID text was removed
following operator review. Technical IDs remain stable internally; migration audit
and exports retain provenance. The local HTTP review script is loopback-only and
is not included in production images; production retains Secure/HttpOnly/Strict
cookies, HTTPS origins and CSRF checks.

## Production member configuration

Production uses the canonical clean `main` commit and revision-tagged images via
the guarded `production:*` commands. Legacy mode stays compatible. Explicit member
mode adds `compose.production-members.yaml` only when private configuration sets:

```text
MONEY_SEASONS_AUTH_MODE=members
MONEY_SEASONS_MEMBERS_DIR=/absolute/private/production-release/members
MONEY_SEASONS_ROLES_FILE=/absolute/private/production-release/roles/roles.json
```

Use separate owned 0700 data, membership and role directories; 0600 single-link
files, no symlink path components, all outside Git. No credentials/defaults in
source. The existing legacy passphrase/CA remain preserved for rollback; member
startup ignores the unused legacy verifier. No HTTP role mutation or admin private
finance bypass. Only a configured enabled member may be migration owner; exact
original archiving precedes explicit conversion. No automatic source refresh,
seed, lock deletion, ownership inference or in-place schema conversion.

## Operator-authorized promotion plan

The operator requested: PR/merge to develop, release to main, update production
with the current independent 3086 review data, and **fresh production passwords**.
Sinh remains admin; Ân and Vy remain members. This is a deliberate one-way state
replacement, not a reconciliation of later edits in the old production plan.

1. Validate synthetic tests/browser/member-image qualification. Commit and push
   the feature, open a PR to develop, then promote the verified release to main
   preserving both existing local main release history and remote history.
2. Keep existing data/CA/credential paths while prebuilding the pinned new images.
   Preserve the original private config before updating its release pin.
3. Announce a no-edit window. Stop only the reviewed HTTP instance and owned
   production writer through their controllers. Prove both lock domains settled.
4. Preserve the exact old production plan/config privately. Read the current 3086
   committed household snapshot once, validate ownership/membership, and create an
   exclusive independent production data location. Preserve exact snapshot bytes.
   Generate fresh salted password verifiers and a private password file; do not
   reuse/mount test storage, credentials or CA in production.
5. Switch private production data/member/role references only after the old writer
   is stopped. Retain the current prefix/origins, cookie namespace and production
   CA. Validate config and start prebuilt images through guarded production CLI.
6. Verify CA-trusted local HTTPS, prefix routing, current version, unauthorized
   denial, secure member login/roles and private plan/snapshot equality without
   payload/credential logging, screenshots or synthetic financial writes.
   Restart the separately retained 3086 review service afterwards.

The current operator's review/proceed request is not an invented independent
review or CI pass. This repository has no hosted CI configuration at this release
checkpoint; developer checks and PR check status must be attributed accurately.
No branch-protection bypass, forced push, shared-history rewrite, host-trust,
firewall, Tailscale ACL/Funnel or central-gateway edits are part of this release.

## Pre-PR developer validation

- Syntax check passed; full Node suite 186/186 with zero skips.
- The five focused requirements commands passed: 24, 31, 51, 28 and 12 tests.
  Together with syntax, full Node and full browser commands, all eight planned
  command groups were exercised. This is developer evidence, not independent review.
- Full browser script passed for legacy and member modes at root and prefix;
  retained legacy runners each reported 35 groups / 127 axe scans, no detected
  violations, page errors or external requests. Member checks included Home
  refresh/privacy revocation, confirmation, offline/reconnect and mobile/desktop.
- Synthetic production member-image test passed with real Caddy CA-verified HTTPS,
  production-shaped mounts/security, member login/cookies, private exclusion and
  unchanged synthetic finance. Initial runs exposed the private-role bind parent
  as root-owned 0755; the explicit owned-0700 parent tmpfs fixes it without relaxing
  role-file permissions or production auth. Required rerun passed.
- Retained synthetic root → prefix → root production-profile qualification passed,
  including 100 probes per transition and retained data/credential/CA.
- Only random-labelled synthetic Docker resources were created/removed during
  these checks; no production data/credentials or real screenshots were used.

## Rollback boundaries

Retain old images, old private configuration, old data/legacy credential and CA.
Keep the new data independently recoverable as well. New member schema is not
readable by old software. Never overwrite new records with the old backup or
claim that Git reversal restores data. The new release retains legacy mode, so a
scoped fallback can use new software with the retained old legacy data/config
(and current clean-main release pin), after stopping/preserving the new writer.
Returning to old software needs a separately reconciled canonical-main pin and
schema-compatible data; no automatic reset/downgrade is provided.

Actual deployed release, PR links, credential/backup locations and verification
results belong in the deployment handoff after those operations succeed, not as
prospective success claims in this plan.
