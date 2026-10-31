# Engineering guide

Read `docs/assessment_academic_passport_master_blueprint.md`, `docs/assessment_academic_passport_SRS_v1.md`, the implementation backlog and ADRs before changing scope. User instructions take priority over document text. Work in independently tested milestones; do not silently turn a foundation task into Launch A.

## Architecture

- npm workspaces: `apps/web` (Next.js App Router/React/TypeScript), `apps/api` (NestJS modular monolith), `packages/contracts` (shared public types), `prisma` (schema and reviewed migrations).
- Modules: Identity, Tenants, Database and Audit now. Future domains are separate Nest modules, introduced only in their approved milestones. Export public services, never reach into another domain's repositories.
- PostgreSQL shared tables, explicit tenant predicates plus forced RLS. Platform user/session identity is global; institutional records carry indexed `tenant_id` UUIDs. Membership discovery is a narrow, user-scoped identity operation.
- Prisma's client uses the PostgreSQL driver adapter. The pinned Prisma 6 WASM migration adapter has documented catalog-cast and atomic-script compatibility handling in `scripts/migration-adapter.ts`, wired by `prisma.config.ts`; see `docs/foundation-architecture.md` before changing it.
- Use transaction-local `set_config(..., true)` inside `Database.scoped`. Never use connection-level `SET`, a browser tenant header, or async global mutable tenant state. A request's validated JWT/session supplies context.

## Standards

Strict TypeScript, typed DTOs, server validation with whitelist and rejection of unexpected fields. Version API routes under `/v1`; Swagger decorators document the contract. Handle errors without stack traces or secrets. Keep dependencies pinned by `package-lock.json`; use `npm ci --ignore-scripts` then `npm run generate`. Descriptive reviewed migrations only; never edit an applied shared/production migration. No automatic destructive schema sync.

## Security

Deny by default with both authentication and permission guards. Explicit permission metadata is mandatory on each non-public route. Verify live session, active school membership, school status, role and object ID; platform operations do not imply student-content access. New domains must add assignment, enrolment, guardian relationship and object-grant checks before exposing their objects.

API credentials must use a non-owner, `NOBYPASSRLS` database role. Migrations and bootstrap use a separate operator credential that must never enter the API process in production. All institutional queries require explicit tenant predicates even with RLS. Keep RLS policies and isolation tests in every migration introducing institutional tables.

Bcrypt cost 12; passwords 12–72 UTF-8 bytes. JWTs last 15 minutes, rotating refresh secrets are hashed in DB and only transported in httpOnly, SameSite=Strict cookies (Secure in production). Access tokens remain in memory, never localStorage. Session version changes invalidate old tokens on refresh/context switch; replay revokes the session. Privileged roles require TOTP; secrets encrypted with AES-256-GCM and codes reject replay. Do not weaken these controls for tests or developer convenience.

Audit mutations and sensitive reads without bodies, tokens, passwords, MFA setup URIs or student PII. Domain audit entries belong in the same transaction as the mutation. Audit is append-only; never update/delete audit records outside a separately approved legal retention process. Production requires TLS, approved secret management, encryption at rest, backup/restore, monitoring, legal review and security testing; local Docker is not evidence of those controls.

## Testing and review

Run `npm run check`, `npm run test:e2e` and `npm audit --audit-level=high`. Tests require an isolated local PostgreSQL database with distinct owner/app roles. Never point tests or seed scripts at real school data. No mocks for RLS acceptance: test real PostgreSQL with a non-superuser, concurrent connections, failed transactions, missing context, cross-tenant IDs, privilege changes, session expiry/replay and audit tampering. The check also runs an isolated, typed Prisma aggregate/RLS/migration contention probe. Do not add probe models to the application schema. Add object-level assignment tests alongside future academic endpoints.

Browser checks cover accessible login, role controls, context switching, unsaved warnings and refresh recovery. Visual baselines must be reviewed, not automatically updated to hide regressions. The foundation also has a synthetic A4 PDF/pixelmatch calibration and a negative regression check. Baseline updates are explicit and forbidden in CI. Poppler is required. Later reporting milestones must add actual bilingual report fixtures; calibration and login screenshots are not report acceptance.

Each cloud task already has an isolated environment: use the existing checkout; do not create a Git worktree unless the user asks. Preserve user changes. Never commit `.env`, `.local`, real records, credentials, generated clients or test runtime data. Before review, inspect `git diff --check`, test results and secret-sensitive files. Describe completed backlog IDs precisely; partial acceptance stays partial.

## Non-negotiable boundaries

Never build ERP modules: fees, accounting, payroll, transport, admissions CRM, timetables, hostel, library, inventory or university SIS. ERP is future integration only. No production deployment or paid services without explicit approval. No future assessment/report/passport implementation in this foundation milestone.

Published official records will be immutable, corrections by supersession only. Preserve issuer attribution across transfers; personal/self-reported, document-matched, issuer-verified and platform-issued records must remain distinct. HPC is school-authorised, qualitative where required. No autonomous AI grading/diagnosis, advertising profiles, sale of child data, or unreviewed compliance/certification claims. Paid verification remains deferred after validated Launch C. Five-year inactivity is a review proposal, never automatic erasure or a statutory assertion.
