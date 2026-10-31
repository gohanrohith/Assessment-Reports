# Architecture Decision Records
## School Assessment SaaS & Lifelong Academic Passport

**Document ID:** ADR-001  
**Version:** 1.0  
**Date:** 31 October 2026  
**Status:** Accepted — all decisions below are binding for the first development phase  
**Referenced by:** Master Blueprint v1.2, SRS v1.1, Implementation Backlog v1.1

---

## How to use these records

Each ADR documents one architectural decision: the context, alternatives evaluated, the decision taken, rationale, and consequences. A decision may only be reversed by a new ADR that supersedes it. Linking a backlog item to an ADR requirement (`ADR-001`, `ADR-003`, etc.) means the implementation must satisfy that decision's consequences.

---

## ADR-001 — Backend Framework: NestJS Modular Monolith

**Status:** Accepted  
**Decides:** BL-004 (architecture ADR approval)

### Context

The product requires 15+ distinct domain modules (Identity, Assessment, Grading, Reporting, Passport, Verification, ERP Integration, etc.) with a complex authorisation matrix — 8 roles, object-level permissions evaluated on every request (AUTH-001) — audit logging on every high-risk mutation (AUTH-003), OpenAPI as the binding contract (SRS §16), and a validation-heavy marks-entry pipeline that must reject invalid data at the edge.

### Options evaluated

| Option | Summary |
|---|---|
| A — Express.js + TypeScript | Manual wiring of middleware, auth, validation, audit; no enforced module structure |
| B — NestJS modular monolith | DI container, decorators, built-in module system, guards, interceptors, pipes |
| C — Fastify + TypeScript plugins | Higher throughput ceiling, but similar manual wiring to Express |

### Decision

**Option B — NestJS modular monolith.** Start as a single deployable; extract services only if load or team-size justifies it.

### Rationale

- **Auth guards:** `@UseGuards(JwtAuthGuard, RolesGuard, ObjectPermissionGuard)` applied consistently on every controller — not per-developer manual wiring on 80+ routes.
- **Audit logging:** A global `AuditInterceptor` wraps every mutating request; no route can silently bypass it.
- **Validation:** `@UsePipes(new ValidationPipe({ whitelist: true }))` with class-validator DTOs enforces marks-entry constraints (ASM-006) and template bindings (TPL-003) at the framework layer.
- **OpenAPI:** `@nestjs/swagger` auto-generates the OpenAPI spec from decorators — the contract stays in sync with the implementation.
- **Module boundaries:** `AssessmentModule`, `ReportingModule`, `PassportModule`, `VerificationModule` are NestJS modules with explicit imports/exports — prevents accidental cross-domain coupling.
- **Testing:** Injectable services are trivially mockable in Jest; no request-object threading required.

### Consequences

- Team must invest 1–2 weeks learning NestJS patterns (DI, decorators, modules, guards, interceptors). This is a one-time cost.
- Module structure must be defined before Phase 1 coding begins (BL-004).
- Each domain module exports only its public service interface; direct repository access from another module is prohibited.
- Remain on modular monolith until a specific bounded context (e.g. PDF generation) demonstrates a need for independent scaling.

---

## ADR-002 — ORM: Prisma

**Status:** Accepted, pending 1-week technical validation  
**Decides:** BL-004

### Context

The product has 50+ tables with complex relational integrity requirements (immutable publication snapshots, supersession chains, tenant scoping, grading policy versioning), schema evolution across pilot schools, and needs type-safe query construction.

### Options evaluated

| Option | Summary |
|---|---|
| A — Prisma | Schema-first, generated TypeScript client, Prisma Migrate |
| B — Drizzle ORM | TypeScript-native, lighter, less mature for complex queries |
| C — Raw SQL (pg) | Maximum control, no abstraction overhead, high maintenance burden |

### Decision

**Option A — Prisma**, subject to a one-week technical validation sprint before Phase 1 coding.

### Rationale

- Generated `PrismaClient` provides complete type safety across all 50+ models — incorrect field names, missing relations and type mismatches are compile-time errors.
- `PrismaClient` as an injectable NestJS service integrates without boilerplate.
- Prisma Migrate produces reversible, auditable migration files — critical for a product where schema errors could affect published records.
- Drizzle is lighter but has less established patterns for complex aggregation queries (grading calculations) and RLS integration.
- Raw SQL rejected: the volume and complexity of queries across 50+ tables would require extensive hand-written type mapping and migration management.

### Validation criteria (complete before Phase 1 sprint 1)

1. Confirm `$executeRaw('SET app.current_tenant_id = $1', [tenantId])` works within a Prisma transaction for RLS.
2. Confirm complex aggregation (weighted grade calculation with GROUP BY, conditional logic) is expressible without raw SQL fallback.
3. Confirm Prisma Migrate handles forward migrations on a live database without table locks on the critical paths.
4. If any criterion fails, evaluate Drizzle as fallback and record a superseding ADR.

### Consequences

- Prisma schema file (`.prisma`) is the authoritative data model definition; database schema is derived from it.
- All Prisma migrations committed to version control with descriptive names.
- `PrismaService` is a singleton provided by `DatabaseModule`, injected into all domain repositories.

---

## ADR-003 — Multi-tenancy: Shared PostgreSQL Tables with tenant_id and Row-Level Security

**Status:** Accepted (provisional — review at 10+ production tenants or on demonstrated performance concern)  
**Decides:** BL-004, BL-007, SEC-004

### Context

The product must isolate school data between tenants while supporting the Academic Passport, which is a cross-tenant construct — a student's records span multiple school enrolments across their lifetime.

### Options evaluated

| Option | Summary |
|---|---|
| A — Shared tables + tenant_id + RLS | Single set of tables; RLS policy enforces isolation; cross-tenant queries are native joins |
| B — Schema-per-tenant | Each school = a separate PostgreSQL schema (`s{tenantId}`); migration complexity; hard cross-tenant joins |
| C — Database-per-tenant | Maximum isolation; operationally impractical for SaaS at scale |

### Decision

**Option A — Shared tables with `tenant_id` column as the primary isolation mechanism, plus PostgreSQL Row-Level Security as a defence-in-depth layer.**

### Rationale

- The Academic Passport requires cross-tenant reads: a student's `portable_report_copies` reference records from multiple prior school tenants. With schema-per-tenant, these joins require a federation layer or a separate passport database. With shared tables, they are standard foreign-key joins filtered by `record_access_grants`.
- The `student_identities` table is inherently cross-tenant (one student, many enrolments). Schema-per-tenant would duplicate student identity records or require a separate identity database regardless.
- Simpler migration orchestration: one migration file applies to every tenant simultaneously; no per-tenant migration tracking.
- At pilot scale (3–15 schools), shared table performance is not a concern. Indexes on `tenant_id` are sufficient.
- RLS policies provide a safety net against application-layer bugs — if application code omits a `WHERE tenant_id = $tenantId` clause, the RLS policy prevents data leakage.

### Implementation requirements

- Every tenant-scoped table must have a `tenant_id UUID NOT NULL` column, indexed.
- All application queries must pass `tenant_id` explicitly; never rely on RLS alone (RLS is a defence layer, not the primary control).
- NestJS `TenantContextMiddleware` sets `SET app.current_tenant_id = '...'` at the start of every request.
- RLS policy on every tenant-scoped table: `USING (tenant_id = current_setting('app.current_tenant_id')::uuid)`.
- Automated cross-tenant isolation tests (SEC-004) must fuzz-test with valid tokens from School A attempting to access School B objects.
- Per-tenant data export: implemented via `export_jobs` with filtered queries, not schema dump.
- DPDP erasure: `deletion_requests` workflow targets specific `tenant_id` rows.

### Review trigger

Any of: >10 production tenants, measured query p95 > 300ms on tenant-scoped reads under pilot load, regulatory requirement for physical data separation, or customer contractual requirement for dedicated database.

---

## ADR-004 — PDF Engine: React SSR + Puppeteer/Chromium

**Status:** Accepted  
**Decides:** BL-031, BL-035, BL-042

### Context

Report cards must be beautiful, school-branded, colourful A4 PDFs with exact print layouts, embedded Unicode fonts, bilingual content (English + Telugu for India pilot), a physical signature and stamp space, and support for multi-page layouts with variable content (20+ subjects, long student names).

### Options evaluated

| Option | Summary |
|---|---|
| A — React SSR + Puppeteer | Full CSS, React components, school branding, chart SVGs |
| B — pdfkit programmatic | Code-driven drawing; no HTML/CSS; difficult to design and maintain |
| C — Playwright/Chromium | Same underlying tech as Puppeteer; team unfamiliar; no benefit over Puppeteer |
| D — wkhtmltopdf | Outdated, poor CSS support, no active maintenance |

### Decision

**Option A — React `renderToStaticMarkup` + Puppeteer/Chromium.** See §12B of the Blueprint for the complete pipeline architecture.

### Pipeline

```
Template JSON (from Report Card Studio)
  → Validated data bindings (REP-002)
  → Versioned report snapshot committed to database
  → React report component tree hydrated with snapshot data
  → renderToStaticMarkup() → HTML string
  → Injected into HTML shell with embedded fonts, Tailwind CSS, @page rules
  → Puppeteer: page.setContent(html, { waitUntil: 'networkidle0' })
  → page.pdf({ format: 'A4', printBackground: true, margin: { top: '12mm', right: '10mm', bottom: '18mm', left: '10mm' } })
  → SHA-256 hash computed on PDF bytes
  → Upload to S3 private bucket → presigned URL stored in report_artifacts
  → Signed download URL served on request (15-minute expiry)
```

### Mandatory HTML shell requirements

- `@page { size: A4; margin: 12mm 10mm 18mm 10mm; }` — bottom margin accommodates stamp/signature space.
- `printBackground: true` — preserves colour bands, school header, grade highlight cells.
- Embedded fonts via `@font-face` with base64 data URIs: Noto Sans for English, Noto Sans Telugu for Telugu/bilingual content.
- No `vh`, `vw`, `100%` height, `position: fixed`, or scroll-dependent CSS in report components.
- Footer signature block: minimum 28mm height, blank white space reserved for physical authorised stamp and ink signature.
- All chart data rendered as inline SVG — no canvas elements (not captured by Puppeteer without additional config).

### Rationale

- Full CSS/Tailwind control over colours, typography, layout — design quality matches the product's commercial intent.
- Same React component library used for on-screen PDF preview (iframe) and server-side render — single source of truth for report layout.
- Puppeteer is Chromium-based and well-established for A4 report generation.
- Pre-rendering the report snapshot data into the React component tree before PDF generation means the PDF is reproducible from the stored snapshot at any future date.

### Consequences

- Chromium binary in production Docker image: approximately 200–250MB additional size. Accepted.
- PDF generation must run as a background BullMQ job — never synchronously on an API request.
- Visual regression tests must compare PNG snapshots of generated PDFs using pixelmatch or similar.
- Puppeteer instance pool must be managed to avoid memory leaks (use `puppeteer-cluster` or equivalent pooling).
- Fonts must be embedded (not loaded from CDN) to prevent external network calls during PDF rendering.

---

## ADR-005 — Search: PostgreSQL Full-Text Search Initially

**Status:** Accepted  
**Decides:** BL-004

### Context

The product requires search for students (by name, roll number), reports, assessment titles, and portfolio entries across school and passport interfaces.

### Options evaluated

| Option | Summary |
|---|---|
| A — PostgreSQL tsvector + GIN index | Built-in, no new service, sufficient for MVP loads |
| B — Meilisearch | Fast, typo-tolerant, multilingual; additional service to operate |
| C — OpenSearch/Elasticsearch | Enterprise-grade; significant operational overhead |

### Decision

**Option A — PostgreSQL full-text search** for MVP. Introduce a dedicated search engine only when justified by measured latency or relevance failures under production load.

### Implementation requirements

- Add `tsvector` generated columns on `student_identities(full_name, roll_number)`, `assessments(title)`, and `report_templates(name)`.
- GIN indexes on all `tsvector` columns.
- Trigram (`pg_trgm`) indexes for partial-name and roll-number prefix search.
- Search queries use `to_tsquery` with `plainto_tsquery` fallback for user-entered text.

### Review trigger

p95 search latency > 300ms under production load, or complex multilingual relevance requirements that PostgreSQL cannot satisfy.

---

## ADR-006 — Authentication: JWT + bcrypt + TOTP MFA

**Status:** Accepted  
**Decides:** BL-008, AUTH-001, SEC-003

### Context

8 roles, multi-school context switching, guardian verification for minors, time-bounded reviewer access, student/guardian mobile-first flows.

### Options evaluated

| Option | Summary |
|---|---|
| A — JWT + bcrypt + TOTP MFA | Custom, familiar, fully controlled; no external provider |
| B — Full OIDC provider (Keycloak, Auth0) | Standards-compliant SSO; significant infrastructure and configuration overhead for MVP |
| C — Managed auth service (Clerk, Supabase Auth) | Vendor dependency; may not support all role/tenant patterns required |

### Decision

**Option A — JWT + bcrypt + TOTP MFA.** OIDC/SAML enterprise SSO deferred until schools request it, post-Launch B.

### Implementation requirements

- Passwords hashed with bcrypt, cost factor 12.
- JWT access tokens: 15-minute expiry. Refresh tokens: 7-day expiry, stored httpOnly cookie, rotated on use.
- TOTP MFA (RFC 6238, Google Authenticator-compatible) enforced at login for: School Admin, Principal/Approver, Platform Superadmin, Verification Reviewer.
- Guardian/student identity verification: email OTP (6-digit, 10-minute expiry) for account creation and recovery.
- School context switching: JWT payload contains `active_school_id`; user requests a context-switch token for a different authorised school (see AUTH-002, school-switcher screen).
- Reviewer time-bounded access: `reviewer_access_grants` table with `expires_at`; JWT claims validated against grant expiry on every reviewer request.
- All auth events (login, logout, MFA enrol, MFA verify, context switch, password change, account recovery) generate audit events.

### Future consideration

OIDC/SAML enterprise SSO integration when schools request it for staff single sign-on (typically post-Launch B). Implement as an optional authentication strategy in NestJS's Passport.js integration.

---

*End of ADR v1.0*
