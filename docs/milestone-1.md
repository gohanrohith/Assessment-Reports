# Milestone 1 — Foundation delivery and acceptance evidence

Scope: Next.js/NestJS monorepo, local PostgreSQL/Prisma, staff authentication, school tenancy, foundation permissions/audit, development environment and CI/release-artifact preparation. This is not the backlog's complete Phase 1 (directory/imports) or Launch A. Source product documents are preserved unchanged.

## Delivered backlog items

| ID | Foundation outcome | Evidence / limits |
| --- | --- | --- |
| BL-004A | Prisma technical validation and engineering GO | Isolated typed aggregation/conditional projection/decimal fixtures, forced RLS, migration lock timeout, metadata-only forward migration and rollback; see prisma-validation.md for limits |
| BL-007 | Tenant provisioning/status lifecycle and school profile; separate school contexts | Real DB/API tests isolate schools, reject cross-school IDs, restrict profile updates, configure branding/locale/year/campuses; no student data endpoints |
| BL-008 | Staff login/logout/password change, 15-minute JWT, seven-day rotating httpOnly refresh cookie, TOTP for privileged roles | Expiry, replay, concurrent credential/MFA operations, browser renewal without lost edits, MFA enrollment/replay, all-role tests; student/guardian OTP onboarding and recovery are not exposed |
| BL-010 | Append-only audit pipeline | Atomic domain events and global controller interception, actor/object/correlation metadata, read auditing, database trigger and privileges reject tampering; later domain-specific audit events arrive with those domains |
| BL-012 | Shared DB rate limits, secure headers, strict validation and origin checks | Abuse/input tests, unknown fields denied, malformed IDs/timezones denied, secure cookie policy, no browser token persistence; trusted-ingress tuning and penetration test remain pre-production gates |
| BL-087 | Multi-school switcher and scoped token endpoint with unsaved warning | Browser test switches two schools, cancels/accepts unsaved warning, restores session on reload; API tests prove old token/context invalidation |

“Delivered” means implemented and validated for the foundation, ready for code review, **not QA ACCEPTED or RELEASED**. No pilot/product/legal approval is fabricated.

## Partial or external acceptance

| ID | Delivered now | Remaining acceptance |
| --- | --- | --- |
| BL-004 | Modular monolith and tenancy design documented | Formal architecture/product sign-off and pilot discovery are external |
| BL-006 | Monorepo, standards, CI lint/format/typecheck/test/build/security gates, browser screenshot and real PDF pixelmatch regression harness, manual release-artifact workflow | GitHub branch protection and observed remote Actions run require API access; actual bilingual product report fixtures arrive with the later rendering engine |
| BL-009 | Deny-by-default guards, all-role foundation matrix, school object checks, school-admin staff access management, concurrent-edit protection and audited session revocation | Academic class/subject assignment, enrolment, guardian relationship and object-grant policies must be implemented with those future domain objects; no such unprotected endpoints exist now |

BL-001/002/003/005 are product, legal and pilot work; not claimed complete. BL-011 storage encryption/signed student files and BL-013 production backup/monitoring are not implemented because their infrastructure and file workflows are outside this milestone. No ERP, assessments, grading, report engine/studio, publication, import or passport phases were started.

## Executed checks

- Strict TypeScript across API, web, shared contracts, scripts and browser tests; ESLint and Prettier.
- **31** real PostgreSQL API/security tests: role matrix, forced RLS, concurrent pool isolation, rollback context reset, fuzzed school IDs, MFA, session expiry/logout/refresh reuse, concurrent rotation, membership/status revocation, audit tampering and abuse validation.
- An isolated typed Prisma probe verifies native weighted/conditional aggregate patterns and decimal arithmetic under RLS, plus lock-contention rollback and a non-rewriting forward schema change.
- **1** migration rollback check: deliberately failing DDL leaves no table behind.
- **8** Chromium browser tests: keyboard/login screenshot, context/session recovery, unsaved warning, stale-token renewal with edited settings, expired-session sign-in recovery, password lifecycle, staff role management, and real A4 PDF/pixelmatch calibration with an intentional-regression check. Both visual baselines reviewed.
- Both production builds; exact cloud install script executes frozen dependency installation, generation, idempotent DB initialization/migration/seed and build.
- Initial migration and repeated no-op deployment. Seed rerun preserves existing accounts. Source-watch development startup and direct/proxied database health requests passed.
- Runtime dependency audit: **0 vulnerabilities** after patched overrides. Full audit reports 3 low and 27 moderate development-tool findings, zero high/critical; CI gates on high/critical.

## Remaining blockers and limits

GitHub API returned Forbidden in this environment, so remote PR creation and branch-protection changes require working API access; native Git read was successful. The original remote had no refs, so review requires a source-specification baseline plus the foundation branch. Environment settings hold reusable installation/start instructions; saving a draft does not publish a snapshot.

Production hosting, TLS/secrets/encryption/backup/restore/observability, actual GitHub CI execution, architecture/legal/pilot sign-off, account recovery, MFA reset and membership creation/invites are not shipped. CI/CD currently produces a reviewed artifact only; no deployment credentials or targets are configured. No production deployment or paid service was used.
