# 0.4.1 — Explicit six-character member password policy

The operator selected **six characters minimum** for individual member passwords
and requested that production apply the current private credentials-file values.
This intentionally relaxes the previous 12-character member policy; longer unique
passwords remain preferable. Passwords shorter than six or larger than 1024 UTF-8
bytes still reject without a write. Legacy shared-family passphrase requirements
are unchanged.

The salted scrypt format/work factor, timing-safe verification, rate/session
limits, credential-version revocation, enabled-admin invariant, durable CAS/fsync,
HTTPS, Secure/HttpOnly/SameSite cookies and CSRF/origin enforcement are unchanged.
Existing password verifiers remain valid; policy changes do not generate or rotate
passwords by themselves. The UI own-password minimum/help and admin reset guidance
now agree with the backend's six-character member boundary.

## Private production password application

Stable operator file: `~/.local/share/money-seasons/credentials.txt`, owned 0600 in
an owned 0700 directory outside Git. Never paste passwords into commands, logs or
PRs. One unique `username: password` line per existing production user; usernames,
IDs, enabled flags and roles are not changed by a password-file application.

Editing this file is not an automatic live configuration update. On the explicit
operator apply/redeploy request: validate every entry before downtime, preserve
current config and hashed user store privately, stop the owned production writer,
prove lock settlement, then use durable membership reset operations against current
revisions. Hash passwords before saving, revoke sessions, verify each enabled
login privately, and leave the plaintext input file unchanged. No direct live
`users.json` edits, credential regeneration, source-copy refresh or financial
writes. Restart production from its clean pinned main release and retain the old
images/config/verifiers for explicitly controlled rollback.

Tests add hashing and durable create/reset/own-change boundaries at five/six
characters, UI minimum coverage, and six-character credentials in the synthetic
production member-image test. The new boundary test first failed under the old
policy, then passed after the change. Focused tests: 36/36; full Node: 187/187,
zero skips; syntax and production member-image qualification passed. Legacy root
and prefix browser runners and member root passed; the combined 600-second run
timed out during the final member-prefix runner. That exact runner subsequently
passed in a fresh standalone run, including the UI minimum check. Do not claim
the timed-out combined invocation exited successfully. Synthetic fixture values
are unrelated to real passwords. Production credential contents are never
committed or logged. No hosted CI or independent-review pass is claimed.
