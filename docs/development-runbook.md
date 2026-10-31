# Development and operator runbook

Use the existing checkout in an isolated cloud task. No worktrees unless explicitly requested. Follow README setup from repository root; `.env` generation preserves existing files. `DATABASE_URL` must identify `assessment_app` (non-owner, NOBYPASSRLS); `MIGRATION_DATABASE_URL` identifies the local owner. In production inject only the application URL into the API process, not owner credentials. The local combined `.env` is development convenience only.

## Start / stop

`docker compose up -d --wait`, then `npm run dev`. Validate API health with a local HTTP request; sign in and read the active profile for a functional check. Development OpenAPI is regenerated from DTO/controller decorators. `npm run build` then `node apps/api/dist/main.js` and `npm run start -w @assessment/web` validates compiled startup. Stop only processes you started. `docker compose stop` preserves database data. Do not use `down -v` on a database containing user work.

## Bootstrap staff

For synthetic local data, `npm run db:seed` creates generated credentials privately, preserves existing accounts and refuses remote/production targets. For additional staff, the trusted operator sets `NEW_USER_EMAIL`, `NEW_USER_PASSWORD`, `NEW_USER_ROLE`, and (except platform admin) `NEW_USER_SCHOOL_ID` in their secure shell/secret injection, then runs `npm run user:create`. Do not place actual values in committed commands, shell history or chat. Passwords must be 12–72 UTF-8 bytes. Allowed roles: PLATFORM_ADMIN, SCHOOL_ADMIN, PRINCIPAL, CLASS_TEACHER, SUBJECT_TEACHER. School provisioning and user provisioning are audit logged. Duplicate email is rejected, not silently overwritten. Student, guardian and reviewer onboarding is deferred. Multi-school memberships currently require a reviewed operator database change and an audit entry; there is no unauthenticated role assignment endpoint.

## Authentication incident

Revoke affected `Session` rows, investigate correlated audit entries and rotate exposed secrets using approved secret management. Key rotation currently invalidates JWTs; MFA encryption-key rotation needs decrypt/re-encrypt migration under controlled operator custody, not an arbitrary new key. Account recovery, MFA reset and password-change UX are not shipped. No support bypass allowing password-only privileged login.

## Maintenance and future production gates

Run `npm run maintenance` periodically to expire shared rate-counter rows and spent refresh hashes; no academic or audit history is deleted. API origin allowlist is a single configured `WEB_ORIGIN`; do not trust arbitrary forwarded client IPs. The current limiter uses socket IP, so a reverse proxy shares a bucket until a reviewed trusted-proxy configuration is introduced. Before production implement a trusted ingress topology and capacity-tested abuse controls.

Daily encrypted backups with RPO <=24h and RTO <=8h, actual restore drills, monitoring/alert delivery, key custody, dependency scanning and penetration testing are release prerequisites. They are not established by local development setup. Restoring local data can be rehearsed with `pg_dump`/`pg_restore` into a separate disposable database; never overwrite the active database without approval.
