# School Assessment SaaS & Lifelong Academic Passport

## Final Product Blueprint and Development Master Plan

**Version:** 1.2 — 31 October 2026  
**Status:** Architecture finalised; technology stack decisions recorded in ADR v1.0. Regulatory, pricing and international assumptions pending validation.  
**Working product name:** Assessment & Academic Passport (brand TBD)  
**Related documents:** SRS v1.1 · Implementation Backlog v1.1 · ADR v1.0

> **North star:** Create an assessment once, record results once, and reuse trusted evidence across classroom reports, official school reports, holistic progress, and a portable student academic history.

---

## Change Log

| Version | Date | Summary |
|---|---|---|
| 1.0 | 31 Oct 2026 | Initial blueprint |
| 1.1 | 31 Oct 2026 | ERP integration section added (§12A) |
| 1.2 | 31 Oct 2026 | Technology stack finalised; ADR v1.0 produced. Added §12B Report Rendering Engine, §12C Marks-Entry UX. Updated §12 stack (Puppeteer, Prisma, JWT, Search strategy). Updated §15 screens (Bulk Export Centre, School Context Switcher). Verification explicitly deferred post-passport validation. Open questions updated. |

---

## 1. Executive Decision Register

  -----------------------------------------------------------------------
  Decision                            Final position
  ----------------------------------- -----------------------------------
  ERP                                 **Absolutely excluded.** No fees,
                                      payroll, transport, admissions CRM,
                                      hostel, library, inventory,
                                      timetables or accounting.

  Institutional customer              Schools from pre-primary through
                                      Class 12.

  Boards                              CBSE, CISCE (ICSE/ISC),
                                      configurable Indian State Boards;
                                      phased board packs.

  Business                            Multi-tenant B2B SaaS for schools;
                                      independent B2C Academic Passport.

  Governance                          Hybrid: teachers own classroom
                                      tests and reports; administrators
                                      control official report templates,
                                      grading rules and permissions;
                                      authorised school sign-off required
                                      for publication.

  Published records                   **Immutable after publication** at
                                      exam/term/year close. Errors
                                      corrected only through a newly
                                      issued superseding record with
                                      provenance; never overwrite.

  Transfers                           School enrolment ends; student's
                                      eligible historical published
                                      records remain accessible through
                                      personal passport subject to legal
                                      and contractual controls.

  Personal storage                    Hybrid cloud + downloadable PDFs
                                      and portable ZIP/JSON archive to
                                      student device.

  Retention                           While active and lawfully
                                      necessary; **five-year inactivity
                                      review is a proposed business
                                      policy**, not an automatic
                                      statutory rule or unconditional
                                      guarantee.

  Higher education                    **Personal passport only**:
                                      programmes, semesters, subjects,
                                      credits, marks, grades, projects
                                      and evidence. No university ERP or
                                      institutional at-risk reporting in
                                      scope.

  Personal report                     Allowed, clearly marked
                                      self-reported and never
                                      impersonating official
                                      institutional issuance.

  Verification                        Separate self-reported,
                                      document-matched, issuer-verified
                                      and platform-issued statuses.
                                      Paid human verification deferred
                                      to post-passport validation; not
                                      removed from long-term roadmap.

  HPC                                 School-authorised,
                                      stage-appropriate holistic
                                      reporting only; no self-issued
                                      "official HPC."

  International                       Country-neutral core,
                                      country-specific
                                      academic/compliance packs; India
                                      first (including Telugu bilingual
                                      PDF support), UAE discovery next.

  AI                                  Optional assistive
                                      drafting/analysis only; human
                                      approval, source attribution, and
                                      no autonomous grading/diagnosis.
  -----------------------------------------------------------------------

### Scope boundary

This is an **assessment, reporting, learning evidence and academic-record continuity product**, not a school ERP, learning management system, exam proctoring platform, or credential issuer.

---

## 2. Product Architecture: Two Linked Workspaces

### A. School Assessment Workspace (B2B)

School subscribes; configures school identity, board, academic year, grade/section/subject structure, teacher assignments, assessments, grading rules and report templates. Teachers record results and approved developmental evidence. School authorities publish official immutable reports. School workspace is authoritative for its own issued records.

### B. Personal Academic Passport (B2C)

Student/guardian account persists across school transfers, non-subscribing schools, gap years, higher education and alumni life. Stores eligible school-issued reports, student-created tests, self-reported higher-education results, projects and supporting documents. Student may export/download eligible records. Personal content never becomes institutionally certified merely by being entered.

**Identity ≠ enrolment ≠ record ownership ≠ record provenance ≠ permission.** These must be separate objects in the domain model.

---

## 3. Users and Authorisation

  -----------------------------------------------------------------------
  Role                                Capabilities
  ----------------------------------- -----------------------------------
  Platform superadmin                 Tenant provisioning, billing,
                                      framework distribution, operational
                                      controls; no routine unrestricted
                                      student-content access.

  School owner/admin                  School setup, academic directory,
                                      template and policy configuration,
                                      imports, teacher roles, reporting
                                      operations, bulk export.

  Principal/authorised approver       Official template approval,
                                      publication approval, correction
                                      authorisation.

  Class teacher                       Class overview, consolidated
                                      results, teacher remarks, review
                                      workflows, permitted developmental
                                      evidence.

  Subject teacher                     Assigned assessments, marks,
                                      competency evidence, classroom
                                      reports, interventions within
                                      assigned scope.

  Student                             Published reports and personal
                                      records; personal tests and
                                      portfolio; no edits to official
                                      records.

  Guardian                            Age/relationship-dependent access
                                      and approvals; no automatic access
                                      to confidential internal teacher
                                      notes.

  Verification reviewer               Time-limited, minimum-necessary
                                      evidence access, decision logging;
                                      cannot modify source marks.
                                      (Deferred to post-Launch C.)

  Institution verifier                Optional later issuer-confirmation
                                      channel; not general school/college
                                      management access.
  -----------------------------------------------------------------------

All authorisation is tenant-scoped and object-level, enforced server-side. Users with roles in multiple schools must explicitly switch their active school context via the School Context Switcher. Account age, guardian authority, consent, retention and cross-border data transfers require jurisdiction-specific implementation.

---

## 4. School Onboarding and Academic Directory

1. Create school tenant, legal identity, campus(es), board, country/state, school logo and branding.
2. Configure academic year, grade structure, sections, subjects, teacher assignments.
3. Import students through downloadable XLSX/CSV templates with preview, duplicate detection, validation and row-level error reports.
4. Link student identity to a school-specific enrolment; avoid duplicate passports using consent-aware identity matching.
5. Import marks and historical records where authorised; distinguish imported legacy evidence from platform-issued official records.
6. Configure grading scales, assessment components, periods, weights, attendance inputs if used for reporting, rubric descriptors, and report approval roles.
7. Assign published template versions to grade, assessment period, and school year.

Minimal directory is **not** admissions CRM or ERP.

---

## 5. Assessment Engine

### Assessment types

FA1/FA2/FA3/FA4, SA1/SA2, periodic/unit/weekly/monthly tests, practicals, projects, assignments, oral assessments, rubrics, custom assessment types. These are configurable labels, **not universal board-mandated structures**.

### Assessment lifecycle

`DRAFT → OPEN → RESULTS_IN_PROGRESS → SUBMITTED → VERIFIED → LOCKED → REPORT_DRAFT → APPROVED → PUBLISHED`

- Draft/open results can be amended by authorised users with audit trails.
- Each assessment can contain multiple components, maximum marks, competencies, evidence and status codes (absent/exempt/incomplete/withheld).
- Manual and spreadsheet-style marks entry, bulk CSV/XLSX import, validation, version history and exception reports.
- Weighted calculations follow an explicit, versioned school policy, with rounding and missing-data handling specified.
- No default numeric conversion of qualitative HPC descriptors.
- A school may publish end-of-exam, term or annual reports; publication locks a snapshot, not all future student learning.

### Key calculations

For an applicable numeric component, `normalised_component = obtained / maximum`. Weighted aggregate = `sum(normalised_component × applicable_weight) / sum(applicable_weight)` over included components, then scaled to reporting units. Exemptions and missing results follow the configured policy. Store calculation inputs, policy version, outputs and rounding method in the publication snapshot.

---

## 6. Official Report Card Studio

### Screens

1. **Template Library:** filter by board, stage, grade, school year, report type, draft/published; duplicate/archive/compare.
2. **New Template Wizard:** choose report type, target grades, assessment period, base template, board pack.
3. **Visual Builder:** component library left, live paginated A4/Letter canvas centre, properties right; reorder sections and set conditional visibility.
4. **Branding:** school name/logo, colours, fonts, letterhead, watermark, bilingual text (English + regional language), authorised signature blocks.
5. **Data Binding:** choose approved student/assessment/attendance/portfolio sources; inspect field provenance.
6. **Academic Policy:** grading rules, component weights, totals, absent/exempt logic, subject ordering and promotion display.
7. **HPC Builder:** stage-specific rubrics, competencies, narrative evidence, reflection and stakeholder inputs where applicable.
8. **Preview & QA:** sample students, long names, missing data, pagination, print simulation, bilingual content, accessibility.
9. **Approval & Publish:** template version approval separate from student-result approval.
10. **Versions & Audit:** immutable published versions, comparisons, effective dates and superseding versions.

### Component library

School header; student identity/photo; exam summary; subject marks matrix; grade/percentage; attendance summary (reporting only); academic trend chart; competency rubric; co-curricular activities; teacher remarks; growth milestones; portfolio highlights; signatures; QR verification; explanatory legend; footer/page number; bilingual field pairs.

### Official template rules

- School admin can create and edit drafts; principal/authorised role approves publication.
- Teachers cannot modify official template structure; they may author classroom test report layouts within allowed controls.
- Templates and academic rules are versioned separately.
- A report is rendered from a frozen data snapshot and frozen template/policy version via the Report Rendering Engine (§12B).
- Official reports contain issuer identity and immutable report ID; no unauthorised signatures or seals.
- QR verification endpoint exposes minimum information and can indicate superseded status.

### Reports to support

- Classroom test report (teacher-created, non-official unless school policy says otherwise)
- Subject progress report
- FA/SA or configurable assessment summary
- Term/half-yearly/annual report card
- Foundational, Preparatory, Middle and Secondary stage HPC configurations where relevant
- Student developmental portfolio / growth report
- Personal academic progress report (explicitly non-certified)
- Personal higher-education semester/year summary (explicitly non-certified unless independently verified)
- Verified-record extract / evidence summary with precise verification level

---

## 7. Holistic Progress and Growth Tracking

### HPC

Stage-aware and board/country-aware competency frameworks. Store observation date, rubric, competency, level/descriptor, evidence, reviewer and source. Support appropriate teacher, student, peer and guardian input without implying that every input is mandatory for every grade or board. Distinguish official requirements from illustrative templates; review CBSE/PARAKH specifications for each release.

### Growth case lifecycle

`OBSERVED → BASELINE_CAPTURED → ACTION_PLANNED → INTERVENTION_ACTIVE → REVIEWED → IMPROVED / CONTINUING / ESCALATED → CLOSED / REOPENED`

Fields: concern or strength framed non-stigmatisingly; subject/competency; evidence; intervention; owner; review date; measured outcome; next step; consent/visibility controls. Keep sensitive internal notes separate from shareable student portfolio highlights.

### Analytics

Student/subject/class trend; improvement across assessments; competency coverage; evidence completeness; assessment data-quality issues; intervention outcome metrics; report readiness. Avoid automatic psychological or medical conclusions.

---

## 8. Student Academic Passport

### School years

- Linked to school enrolments, not locked to one institution.
- Published reports displayed read-only with school provenance and publication date.
- Student can download individual PDFs and export eligible report bundles to local device.
- Student-created practice assessments, subjects, projects, reflections and personal reports remain editable **until explicitly published/finalised by the student**; published personal snapshots are immutable and may be superseded.
- Student can label an external institution as context, but cannot use its official seal or present self-entered records as issuer-certified.

### After Class 12

Create one or more education programmes: B.Tech, BA, BSc, BCom, BCA, MBBS, diploma, M.Tech, MSc, MBA, PhD or custom. Configure semester/trimester/year, courses, subjects/papers, credits, assessment attempts, grades, CGPA/SGPA or marks, grading scale and supporting evidence. Preserve native grade schemes; never infer universal percentage conversions. Track supplementary/backlog attempts distinctly.

### Transfer and access

- Departure ends school staff's new-entry rights for that enrolment; historical issuer records remain attributed to the school.
- Student's eligible published copies remain in passport under agreed access/retention terms.
- Incoming school access requires appropriate sharing authorisation; never automatically expose prior confidential interventions.
- Non-subscribing institutions do not prevent personal passport use.
- School subscription lapse triggers grace/export/offboarding processes, not automatic loss of every student's copies.

---

## 9. Verification Product and Badge Semantics

> **Status: Deferred to post-Launch C.** Paid human document verification will not be built until the core school platform and Academic Passport are validated by pilot schools. The verification product remains on the long-term roadmap.

  -----------------------------------------------------------------------
  Level                   Meaning                 Can be granted by
  ----------------------- ----------------------- -----------------------
  Self-reported           User entered the        Automatic
                          result; no evidence     
                          verified.               

  Document-matched        Reviewer checked        Human reviewer
                          entered fields against  (deferred)
                          an uploaded document.   
                          **Issuer authenticity   
                          not established.**      

  Issuer-verified         Result independently    Controlled
                          confirmed via an        source-verification
                          authorised issuer or    workflow (deferred)
                          trusted official        
                          source.                 

  Platform-issued         Authorised subscribing  School publication
  official                school issued the       workflow
                          immutable report        
                          in-platform.            
  -----------------------------------------------------------------------

**Never display a generic "Verified" badge without specifying what was verified.** An uploaded scan alone cannot establish authenticity.

---

## 10. Data Retention, Immutability and Export

### Published record invariants

1. Published report content, grades, template snapshot and original signature metadata cannot be changed in place.
2. Corrections create a **new published record** with `supersedes_report_id`; old record is marked superseded in a separate status/provenance layer.
3. All published artifacts receive content hash, timestamp, issuer and version.
4. Immutability is a logical/business guarantee while lawfully retained, **not a prohibition on legally required erasure**.
5. Deletion/retention workflows must support lawful erasure without covertly changing the original published record.

### Passport retention policy proposal

- Active account: retain data only while the purpose and legal basis remain valid.
- Five years of inactivity: **review trigger**, not guaranteed statutory retention duration or automatic right to keep data.
- Prior to account closure: staged notifications and accessible export, where contact is possible and lawful.
- Separate schedules for school records, internal developmental notes, uploaded evidence, payment records, reviewer logs, and published personal copies.
- Students can download PDF + ZIP archive + machine-readable JSON/CSV, with manifest and hashes.
- Once downloaded to personal devices, files are outside platform remote deletion control.
- For minors: guardian verification, age transition and applicable consent rules.
- Jurisdiction-specific privacy/legal review required before production, including India's DPDP regime and country-specific retention and cross-border transfer requirements.

---

## 11. International Strategy

### Product localisation architecture

- Country/region/board packs: grade labels, academic calendars, grading scales, language, competency rubrics, required report fields, local conventions.
- Tenant-level timezone, locale, currency, print size (A4/Letter), number formatting and school year.
- Unicode and bilingual-ready frontend; language translations versioned.
- Embedded Unicode fonts in PDFs: Noto Sans (English), Noto Sans Telugu (Telugu). Additional language fonts added via the font pack registry.
- Country-specific data residency, privacy, consent, processor agreements and age rules where required.
- No blanket claims of CBSE, CISCE, KHDA, UK or US regulatory compliance without verified, current requirements.

### Rollout sequence

1. India: start with one or two board configurations and pilot schools; include Telugu+English bilingual PDF support from launch.
2. Expand Indian State Board coverage using validated packs.
3. UAE: discovery and pilots, especially Indian-curriculum schools; confirm local rules first.
4. Other Gulf markets: market-by-market validation.
5. UK/US/other regions only after dedicated product/legal research.
6. Personal passport internationalisation can precede local official school reporting, but verification claims and privacy still require localisation.

---

## 12. Recommended Technology Stack

### Frontend

- **Next.js + React + TypeScript** for web application, responsive school/teacher/student portals.
- **Tailwind CSS + shadcn/ui** (Radix UI primitives with design tokens); keyboard accessibility, dark-mode-ready, consistent design system.
- **TanStack Query** for server state; **React Hook Form + Zod** for forms and validation.
- **TanStack Table** for the high-density marks-entry grid; row virtualisation for rosters of 50+ students.
- **i18next or equivalent** for UI localisation.
- Initially **responsive web/PWA**; native mobile apps are deferred.

### Backend

- **NestJS (TypeScript)** modular monolith with clearly separated domains: Identity, Tenants, Directory, Assessment, Grading, Templates, Reports, HPC, Portfolio, Passport, Verification, Billing, Integration, Audit. See ADR-001.
- **PostgreSQL** primary relational database; `tenant_id` isolation with row-level security as a defence-in-depth layer. See ADR-003.
- **Prisma** ORM with generated TypeScript client; Prisma Migrate for schema evolution. Subject to one-week technical validation (ADR-002).
- **Redis + BullMQ** for PDF generation jobs, bulk exports, bulk imports, notifications and asynchronous tasks.
- **S3-compatible object storage** for PDF snapshots and uploaded evidence; private buckets, encryption, lifecycle policies and short-lived signed access URLs.
- **React SSR + Puppeteer/Chromium** for faithful, branded, print-ready A4 PDF generation. See §12B and ADR-004.
- **OpenAPI** documented REST API; background jobs for batch generation. No GraphQL requirement for MVP.
- **JWT + bcrypt + TOTP MFA** for authentication; privileged roles require MFA. No full OIDC provider for MVP. See ADR-006.
- **PostgreSQL full-text search** (tsvector/GIN indexes) initially; dedicated search engine introduced only when justified. See ADR-005.

### Infrastructure

- Cloud-hosted container deployment; India-region hosting for Indian tenants subject to contractual/regulatory requirements.
- Managed PostgreSQL, object storage, secrets manager, central logging, metrics, tracing, automated backups and restore drills.
- CI/CD via GitHub Actions; infrastructure as code (Terraform or equivalent).
- Payment gateway supporting Indian billing (Razorpay); select provider after commercial and compliance review.
- Email/SMS notifications through approved providers and consented channels.
- AI later via provider abstraction, strict privacy controls, redaction, teacher review and no unapproved training on student records.

### Architectural choices

All final stack decisions are documented in ADR v1.0 with rationale and review triggers.

- **Modular monolith first**, not microservices. Extract only when a specific bounded context justifies independent scaling.
- API-first modules; event/outbox pattern for durable audit and report jobs.
- No blockchain required; content hashes and append-only audit/provenance suffice.
- PDF and structured data are both preserved; neither alone is sufficient for reproducibility.
- Strong tenant isolation; personal passport records are a separate logical domain with explicit sharing grants.

---

## 12A. Existing ERP Integration — Confirmed Addition

**Purpose:** Connect to schools' existing ERP/SIS systems without replacing them. Three modes: standalone manual entry, Excel/CSV import/export, or authorised API synchronisation.

**Inbound by default:** student identity and enrolment, classes, sections, subjects, teachers and assignments, academic years, and optionally attendance summaries used for reporting. **Outbound only with explicit school configuration:** approved assessment results and published report-card PDF/metadata, where the ERP supports it. Confidential HPC/intervention notes and personal passport records are never synced by default.

**Implementation:** Build a vendor-neutral Integration Gateway with scoped API credentials/OAuth where available, connector adapters, configurable field mapping, external ID mapping, pagination, rate limits, webhook handling or scheduled polling, incremental sync, idempotency, retry/dead-letter queue, validation, reconciliation dashboard and audit logs. Protect secrets and restrict integration access to each tenant.

**Source-of-truth policy:** Assign one authoritative system for each entity/field. Resolve conflicts explicitly; never silently overwrite teacher-approved results. **Published reports are immutable snapshots and must never be overwritten by ERP updates.** School transfer and deactivation events must not erase historical reports or personal passport data.

**Phasing:** MVP includes robust CSV/XLSX onboarding and documented generic REST API; implement one or two vendor-specific connectors only after identifying pilot-school ERP vendors and confirming their API access terms.

**Additional data model:** `integration_connections`, `integration_credentials_refs`, `integration_field_mappings`, `external_entity_links`, `integration_sync_runs`, `integration_sync_errors`, `integration_webhook_events`, `integration_conflicts`.

---

## 12B. Report Rendering Engine

The Report Rendering Engine is a reusable backend service shared by all report types: classroom assessment reports, official report cards, HPC reports, personal academic reports and bulk class/section exports. It is not part of the no-code Report Card Studio UI — it is the rendering infrastructure the Studio invokes.

### Rendering pipeline

```
1. Input: Template JSON (from Report Card Studio) + Assessment/student data references
2. Validate data bindings: confirm all referenced fields exist in the approved snapshot
3. Commit versioned report snapshot: template_version_id, policy_version_id, data_snapshot (JSON),
   student_id, school_id, academic_year, period — stored immutably before PDF generation begins
4. Hydrate React component tree with snapshot data
5. Server-side render: renderToStaticMarkup(ReportComponent) → HTML string
6. Inject into HTML shell:
   - Embedded fonts (Noto Sans, Noto Sans Telugu via base64 @font-face)
   - Tailwind CSS compiled and inlined
   - @page print rules (A4, margins)
   - No external resource references
7. Puppeteer: page.setContent(html, { waitUntil: 'networkidle0' })
              page.pdf({ format: 'A4', printBackground: true, margin: { top:'12mm', right:'10mm', bottom:'18mm', left:'10mm' } })
8. Compute SHA-256 hash of PDF bytes
9. Upload PDF to S3 private bucket
10. Store report_artifact record: s3_key, sha256_hash, size_bytes, generated_at, puppeteer_version
11. Return presigned URL (15-minute expiry) for immediate preview/download
```

### Print layout requirements (all report types)

- **Page size:** A4 (210 × 297mm)
- **Margins:** top 12mm, right 10mm, bottom 18mm, left 10mm
- **Signature/stamp block:** minimum 28mm reserved at the bottom of the last page — plain white background, no content — for physical ink signature and school stamp
- **Background printing:** enabled (`printBackground: true`)
- **Fonts:** embedded as base64 `@font-face` data URIs; never loaded from CDN during render
- **Units:** use `mm`, `pt`, `rem` only — no `vh`, `vw`, `%` on heights, `position: fixed`
- **Charts:** rendered as inline SVG with explicit `width` and `height` attributes
- **Page breaks:** controlled via `page-break-before: always` / `page-break-inside: avoid` on section containers
- **Long names and overflow:** report components must handle student names up to 80 characters and subject names up to 60 characters without layout breaks

### Bilingual support (English + Telugu for India pilot)

- Each report template component supports a `secondary_language` field pair (e.g., subject name in English + subject name in Telugu)
- When `secondary_language = 'te'`, bilingual cells render English on top, Telugu directly below in smaller weight
- Noto Sans Telugu embedded in the HTML shell for all Indian tenant reports
- Template builder exposes bilingual field input for: school name, subject names, assessment labels, grade descriptors, teacher remarks, footer text
- Future multilingual extension: add fonts and field pairs via the board/country pack registry

### Bulk export

- Admin selects: academic year, report type, grade, section (or individual students)
- System enqueues one BullMQ job per section (not one per student) for efficient batching
- Each section job generates individual PDFs then packages them into a named ZIP archive: `{school}_{grade}_{section}_{exam}_{date}.zip`
- Progress streamed via Server-Sent Events to the admin UI (percentage complete, error count)
- ZIP stored in S3 private bucket with 48-hour expiry; download link emailed to requesting admin
- Partial failures: ZIP is created with successful PDFs; a manifest file lists failed student IDs and reasons
- Admin can re-trigger failed individual PDFs from the Bulk Export Centre

### Performance targets

- Single PDF generation: p95 < 8 seconds under normal load
- Batch of 50 PDFs (one class): complete within 3 minutes
- Batch of 1,000 PDFs: complete within the pilot-agreed batch window (initially 30 minutes); see NFR-004

### Visual regression testing

- A golden PDF fixture is stored for each report type and board configuration
- On every CI build, regenerate the golden fixture and compare PNG snapshots (page by page) using pixelmatch
- Pixel difference threshold: < 0.1% of total pixels per page (excluding dynamic date fields)
- Failing visual regression blocks the build

---

## 12C. Marks-Entry UX Specification

The marks-entry grid (BL-023) is the most critical teacher-facing feature. It must feel like a spreadsheet — zero training required for a teacher who has used Excel.

### Grid layout

- **Columns (frozen left):** Roll number, Student name (fixed; scroll horizontally to subject columns)
- **Columns (per assessment component):** one editable cell per student per component
- **Rows:** one per enrolled student, ordered by roll number; virtualised for 50+ students
- **Status column (far right):** row-level save status icon (saved / saving / unsaved changes / error)
- **Header row:** assessment component name, maximum marks, current completion count

### Keyboard navigation

| Key | Behaviour |
|---|---|
| Tab | Move to next cell (right); at row end, move to first editable cell of next row |
| Shift+Tab | Move to previous cell |
| Enter | Move to cell directly below (same component, next student) |
| Shift+Enter | Move to cell directly above |
| Arrow keys | Move in direction within the grid |
| Escape | Discard in-progress edit for current cell; restore last saved value |
| Delete / Backspace | Clear cell value; set status to blank (not zero) |

### Data entry behaviour

- Typing a number immediately enters edit mode; no click-to-edit required
- Maximum marks shown in cell header; server validates `0 ≤ value ≤ maximum`
- Decimal precision follows the configured school policy (e.g., 0.5 marks allowed)
- Status codes (Absent, Exempt, Incomplete, Withheld) entered via a dropdown in the cell or by typing A/E/I/W (configurable shorthand)
- Blank cell is treated as "not yet entered" — never silently treated as zero
- Out-of-range values shown with a red border inline; save blocked until resolved

### Clipboard paste from Excel/Sheets

- Select a range of cells in the grid; Ctrl+V / Cmd+V pastes clipboard tab-separated values
- Paste is validated row by row before committing: row count and column count must match selection
- Mismatches (different column count, non-numeric values) shown in a paste preview modal before applying
- Successful paste enters an unsaved state (yellow row indicators); teacher must confirm batch save

### Autosave and save states

- Cell-level autosave: 1.5 seconds after the last keystroke in a cell, save is triggered automatically
- Row-level save status indicator: `●` grey = unmodified, `●` yellow = unsaved, `●` blue = saving, `✓` green = saved, `✗` red = save error
- Bulk "Save all" button always available; saves all unsaved rows in a single request
- Submit button disabled until all rows are saved and validated

### Optimistic concurrency

- Every `assessment_result` row has a `version` integer column
- Draft PUT includes `If-Match: version` header
- Server returns 409 if another user saved a newer version since the teacher loaded the grid
- On 409, the conflicting cell is highlighted; teacher sees the other value and can choose to keep theirs or accept the server value
- Never silently overwrite a concurrent change

### Low-bandwidth and offline recovery

- All unsaved cell values are written to IndexedDB in real-time as the teacher types
- On reconnection after a network loss, the pending queue is replayed in order
- Deduplication key: `(assessment_id, student_id, component_id, saved_at_client_timestamp)`; server rejects exact duplicates via idempotency check
- On page reload with pending IndexedDB data, a recovery banner asks the teacher: "You have 12 unsaved marks from the previous session. Restore?" — never auto-apply without confirmation
- The recovery does not overwrite marks that were saved by another user while offline

### Permissions and locking

- Once an assessment is `SUBMITTED` or `LOCKED`, all cells become read-only with a visible lock indicator
- Teachers can only see and edit students in their assigned class/subject
- Any edits to locked assessments require an authorised rollback (admin/principal action) before the grid re-opens

---

## 13. Core Data Model

### Identity and tenancy

`users`, `student_identities`, `guardian_relationships`, `organisations`, `schools`, `campuses`, `school_memberships`, `academic_years`, `grades`, `sections`, `subjects`, `teacher_assignments`, `student_enrolments`, `school_context_grants`.

### Assessments

`assessment_periods`, `assessments`, `assessment_targets`, `assessment_components`, `assessment_results`, `assessment_result_revisions`, `grading_policies`, `grading_policy_versions`, `assessment_competencies`, `assessment_evidence`.

### HPC and portfolios

`frameworks`, `framework_versions`, `competencies`, `competency_assessments`, `feedback_records`, `student_reflections`, `portfolio_entries`, `growth_cases`, `growth_observations`, `growth_interventions`, `growth_reviews`, `growth_closures`.

### Reporting

`report_templates`, `report_template_versions`, `report_definitions`, `report_runs`, `student_reports`, `report_approvals`, `report_publications`, `report_supersessions`, `report_artifacts`, `report_verification_tokens`, `report_snapshots`, `bulk_export_jobs`.

### Passport and higher education

`personal_workspaces`, `education_programmes`, `programme_terms`, `personal_subjects`, `personal_assessments`, `personal_results`, `grade_scales`, `personal_projects`, `portable_report_copies`, `record_provenance`, `record_access_grants`, `student_transfers`.

### Verification and compliance (deferred)

`verification_requests`, `verification_evidence`, `verification_reviews`, `verification_decisions`, `issuer_confirmations`, `payments`, `consent_records`, `retention_policies`, `deletion_requests`, `export_jobs`, `audit_events`, `notification_events`.

### Integration

`integration_connections`, `integration_credentials_refs`, `integration_field_mappings`, `external_entity_links`, `integration_sync_runs`, `integration_sync_errors`, `integration_webhook_events`, `integration_conflicts`.

### Mandatory columns and invariants

UUID identifiers; issuer/source; creation and publication timestamps; `tenant_id` scope on all institutional tables; immutable revision ID; `schema_version`; `policy_version`; `content_sha256`; lifecycle status; `supersedes_id`; retention category. Explicit object access grants and auditable consent.

---

## 14. Essential APIs (illustrative)

- `POST /v1/schools` — provision tenant.
- `POST /v1/schools/{id}/students/imports/preview` — validate roster.
- `POST /v1/schools/{id}/students/imports/{jobId}/commit` — commit roster.
- `POST /v1/assessments` — create assessment.
- `PUT /v1/assessments/{id}/results/draft` — draft marks upsert with optimistic concurrency (`If-Match` header).
- `POST /v1/assessments/{id}/submit` — submit results.
- `POST /v1/assessments/{id}/lock` — lock approved results.
- `POST /v1/report-templates` — create draft.
- `POST /v1/report-templates/{id}/versions/{v}/approve` — approve official template.
- `POST /v1/report-runs` — queue PDF generation (single or batch).
- `POST /v1/student-reports/{id}/publish` — immutable publication.
- `POST /v1/student-reports/{id}/corrections` — propose superseding correction.
- `POST /v1/bulk-exports` — create bulk export job (grade/section/exam scope).
- `GET /v1/bulk-exports/{id}/status` — SSE stream of job progress.
- `GET /v1/bulk-exports/{id}/download` — signed ZIP download URL.
- `GET /v1/passport/reports` — authorised portable reports.
- `POST /v1/passport/exports` — create device-download archive.
- `POST /v1/passport/programmes` — higher education programme.
- `POST /v1/passport/personal-results` — self-entered result.
- `POST /v1/auth/context-switch` — switch active school context; returns new scoped JWT.
- `GET /v1/verify/{token}` — privacy-minimised public verification.

Every mutation requires authentication, role/object authorisation, validation, audit, and idempotency where needed. Sensitive reads are logged.

---

## 15. Product Screens

### School admin

Dashboard; School Settings; Academic Directory; Student Imports; Staff Assignments; School Context Switcher (for admins with multiple school roles); Assessment Policies; Assessment Calendar; Report Template Library; Report Card Studio; HPC Frameworks; Report Review Queue; Published Reports; **Bulk Export Centre** (class/section/exam/student-selection ZIP downloads with progress indicators); Growth Analytics; Audit & Permissions; Subscription.

### Teacher

Dashboard; My Classes; Create Assessment; Marks Grid; Bulk Import; Classroom Test Report; Competency Assessment; Observations; Intervention Cases; Portfolio Evidence; Class Report Review; Notifications.

### Principal

Approvals; Official Template Review; Report Publication; Correction Requests; Academic Insights; Audit.

### Student / guardian

Passport Timeline; Official Reports; Download Centre; Personal Tests; Personal Results; Learning Portfolio; Shared Access; Consent & Privacy; Programme Manager; Verification Requests (deferred); Account & Exports.

### Verification staff (deferred)

Review Queue; Evidence Viewer; Field Match; Source Check; Decision; Escalation; Audit/Quality Control.

---

## 16. Development Phases and Launch Gates

  ---------------------------------------------------------------------------------------
  Phase                   Build                                Release gate
  ----------------------- ------------------------------------ --------------------------
  0 — Discovery (4–6      Interview 20–30 schools, assess      At least 3 committed pilot
  weeks)                  competitors, review board packs,     schools and validated
                          legal/privacy design, bilingual      reporting requirements.
                          requirements, prototype report        ADR technical validation
                          builder.                             sprint complete.

  1 — Core foundation     Tenant/auth/roles/context-switch,    Tenant isolation tests,
  (6–8 weeks)             school directory, imports, academic  successful representative
                          year configuration, audit,           roster imports. JWT + MFA
                          Prisma validation, baseline          working for all roles.
                          infrastructure.                      

  2 — Assessment MVP      Teacher assessments, marks grid      Real teachers complete
  (8–10 weeks)            (full Excel-like UX), imports,       exam cycle without
                          grading policies, class reports,     spreadsheet workarounds.
                          validation, IndexedDB recovery.      Marks grid keyboard nav
                                                               accepted by pilot teacher.

  3 — Report Rendering    Report Rendering Engine,             Full school
  Engine + Report Card    React+Puppeteer pipeline, bilingual  exam-to-published-report
  Studio (8–10 weeks)     Telugu+English PDF, no-code          workflow passes acceptance
                          template builder, approval,          tests. Visual regression
                          A4 PDFs with print layout,           tests pass. Golden report
                          bulk export, immutable               fixtures approved by pilot
                          publication, corrections, QR.        school.

  **Launch A — Paid       Limited India rollout; essentials    Paying pilots, support
  School Beta**           report cards and assessment.         SLAs, backup/restore and
                          Bilingual PDF support included.      security review.

  4 — HPC & Growth        Stage-specific frameworks,           Board pack validated;
  (10–14 weeks)           observations, intervention           teachers report net time
                          lifecycle, evidence and analytics.   savings.

  **Launch B — Full       Assessment + HPC + Growth +          Retention, privacy, QA,
  School Product**        generic ERP integration.             reporting accuracy and
                                                               renewal signals.

  5 — Student Passport    Personal identity, transfer,         Transfers and exports
  (8–12 weeks)            portable reports, downloads,         tested; guardian controls
                          personal tests.                      verified.

  **Launch C —            Student continuity product.          Consent and offboarding
  Passport**                                                   controls pass review.
                                                               Passport validated by
                                                               pilot students.

  6 — Higher Education    Programme/semester/credits/grades,   Supports different
  (6–10 weeks)            self-entered records, evidence       academic structures
                          attachments.                         without forced
                                                               conversions.

  7 — Human               Payments, review queues, document    **Only begins after
  Verification            matching, precise badges, appeals.   Launch C is validated.**
  (8–12 weeks, deferred)                                       Fraud/quality pilot;
                                                               reviewer economics
                                                               proven.

  **Launch D — Verified   Paid evidence review.                Document-match semantics
  Passport**                                                   clearly communicated; no
                                                               false authentication
                                                               claims.

  8 — International       Localisation, legal review, country  Country-specific
  (market-dependent)      packs, international pilots.         compliance and market
                                                               demand validated.
  ---------------------------------------------------------------------------------------

**Timing is indicative, not a committed schedule.** With a small team, the full vision may take 18–30+ months; school MVP can be released earlier. Re-estimate after discovery and staffing.

---

## 17. Quality Assurance and Acceptance Criteria

1. **Isolation:** School A cannot read or mutate School B data; fuzz-test cross-tenant object IDs.
2. **Marks accuracy:** Weighted results match independently calculated fixtures, including absent/exempt/incomplete.
3. **Import resilience:** Duplicate student IDs, malformed rows, wrong sections and re-uploads are handled predictably.
4. **Publication:** Published content cannot be updated through any UI, API, job or admin bypass; supersession preserves history.
5. **PDF quality:** Print A4, multi-page, long names, variable subjects, Unicode, bilingual Telugu+English, stable page breaks, correct margins, stamp/signature space.
6. **Visual regression:** PDF fixtures regenerate identically (< 0.1% pixel difference) in CI.
7. **Template governance:** Unapproved templates cannot produce official published reports.
8. **HPC:** Qualitative competencies remain qualitative unless an explicitly permitted policy exists.
9. **Passport:** Transfer does not change issuer attribution; guardian/student permissions are tested.
10. **Verification:** Document-matched never implies issuer-confirmed; reviewer decisions are logged and reversible only through a new decision event.
11. **Retention:** Export, account closure, consent withdrawal and lawful erasure are testable and auditable.
12. **Accessibility:** Keyboard navigation, accessible forms, contrast, meaningful error messages.
13. **Marks grid:** Keyboard navigation, clipboard paste, offline recovery, concurrency conflict resolution all pass acceptance tests with a real teacher.
14. **Bulk export:** Class/section ZIP generates correctly, partial failures handled, download link secure.
15. **Reliability:** Restore drills, queue retry/idempotency, monitoring and operational runbooks.

---

## 18. Security, Privacy and Governance

- Privacy-by-design, data minimisation and purpose-specific processing.
- Child data and guardian consent require specialist legal review; no advertising profiles based on children's academic data.
- Encrypt at rest and in transit; signed short-lived object URLs; admin MFA (TOTP); least privilege.
- Reviewer access separated from school admin access; mask unnecessary identifiers.
- Per-tenant backups, disaster recovery, retention schedules, breach-response plan.
- Document processing sandbox, malware scanning, file type and size validation.
- Export/erasure procedures and immutable provenance compatible with lawful deletion.
- Vendor due diligence, subprocessors, contracts, cross-border transfer controls and regional hosting.
- Legal review before launch: Indian DPDP framework and applicable education rules; local requirements for UAE/other jurisdictions.
- Do not claim statutory compliance or official board certification without review.

---

## 19. Business and Go-to-Market

### Primary customer

Independent private schools (initial hypothesis: 300–1,500 students), especially those using manual marksheets or inflexible reporting software. Start with a small Telangana/Andhra Pradesh pilot cohort, then expand by board and geography.

### Value proposition

- Less duplicate teacher entry.
- Accurate, configurable, school-branded, bilingual report cards.
- Continuous learning evidence and intervention history.
- Student academic continuity independent of school transfers.

### Pricing and sales

Test per-student/year school tiers with minimum school fees; annual contracts; onboarding and custom template migration may be separately priced if necessary. Personal passport basic continuity should be free; optional paid evidence review is a separate future service. Never paywall legally required access to existing records.

### Key metrics

- Schools contacted → demo → pilot → paid conversion.
- Teacher activation and weekly active usage during assessment cycles.
- Minutes to create test, enter marks, publish report.
- Report error rate and correction rate.
- Teacher net time saved vs previous workflow.
- School annual recurring revenue, retention and support cost.
- Passport activation, transfer continuity, exports.
- Verification acceptance/rejection, review minutes, false-positive rate, appeal rate, contribution margin (post-Launch C).

---

## 20. Team and Delivery Model

**Initial core:** product owner/domain expert; UX designer; 2 full-stack engineers; backend/data engineer (can overlap initially); QA automation engineer; fractional DevOps/security; education-framework adviser. Legal/privacy counsel before handling real student records. Later: customer success, sales, verification operations and independent security review.

Use design-first vertical slices, short release cycles, automated tests and pilot feedback. Do not overbuild a generic drag-and-drop document engine; use structured components with reliable printing and constrained bindings.

---

## 21. Recommended First Vertical Slice

**School registration → student import → teacher assignment → create FA1 → enter marks (marks grid keyboard nav) → generate classroom test report PDF (React+Puppeteer) → aggregate subject results → select approved template → principal approval → publish immutable PDF → student passport view → download local PDF → bulk export class ZIP.**

This vertical slice tests the central product thesis end to end, including the Report Rendering Engine and bilingual PDF.

---

## 22. Explicitly Deferred / Excluded

**Excluded permanently from current product strategy:** ERP modules, school fees/accounting, transport, payroll, admissions CRM, timetable, hostel, library, inventory, university SIS/ERP, university institutional at-risk analytics, autonomous AI diagnosis, automatic institutional credential certification.

**Deferred until after Launch C:** Paid human verification product (EP10). WhatsApp report delivery (schools distribute reports themselves).

**Deferred until justified:** Native mobile apps, broad country coverage, real-time issuer integrations, sophisticated AI, advanced predictive analytics, offline-first synchronisation, dedicated search engine (Meilisearch/OpenSearch), OIDC/SAML SSO, large-scale public verification marketplace.

---

## 23. Open Questions Requiring Validation

1. Confirm brand/product names and legal business entity.
2. Identify first pilot schools, board versions and real sample report cards.
3. Confirm which school staff may publish official reports, and whether two-stage approval is needed.
4. Confirm whether published student reports are issued per exam, term and/or year per school.
5. Establish guardian/student consent and portable-copy contractual rights with legal counsel.
6. Set country-specific retention periods; five-year inactivity is a **proposal only**.
7. Choose identity recovery and age-of-majority transition policy.
8. Test willingness to pay for school SaaS tiers.
9. Verify any issuer-confirmation integration agreements before advertising that badge.
10. **Stack decisions are made (ADR v1.0).** Confirm cloud provider and payment gateway after cost/security evaluation.
11. Review local UAE requirements before any international institutional pilot.
12. Determine accessibility, additional regional language and page-size priorities beyond Telugu+English.

---

## 24. Definition of Success

A school can configure its assessment system and official report designs without developer intervention; teachers can record evidence once and reuse it; published records are authentic, immutable and correctable only by supersession; a student can move schools without losing eligible portable history; personal higher-education results are clearly distinguished from issuer-certified credentials; and report cards are beautiful, print-ready, bilingual documents that schools are proud to issue.

**Final product boundary:** A specialised, globally extensible assessment and academic-continuity platform — **never an ERP**.
