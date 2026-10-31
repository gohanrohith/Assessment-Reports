# Review: Foundation for School Assessment + Academic Passport

The repository began without commits. The source-specification baseline is separate from `foundation/milestone-1` so reviewers can inspect application changes without mixing in the uploaded roadmap.

## Proposed PR title

Foundation: scoped school workspace, MFA authentication and PostgreSQL tenant isolation

## Proposed PR description

Introduces an npm monorepo with Next.js and NestJS, PostgreSQL/Prisma migrations, staff login and MFA, rotating sessions, school provisioning/settings and context switching. Every protected request validates its live session and school membership; forced transaction-scoped RLS and explicit object checks isolate schools. Audit events are append-only and sensitive mutations write their audit record atomically.

Adds AGENTS.md, reproducible local/cloud setup, OpenAPI, strict validation, security headers/rate limits, automated CI and a manual build-artifact workflow. There is no production deployment or ERP functionality.

Validation: lint/format/typechecking, 21 PostgreSQL-backed API tests, migration rollback, three real browser tests with a reviewed visual baseline, migration repeatability and both builds. See milestone-1.md for backlog/SRS trace and honest partial acceptance.

Review carefully: the pinned Prisma 6 experimental WASM migration adapter has two narrow, tested compatibility fixes; patched dependency overrides are intentional. Academic-object permission policies, production infrastructure, PDF regression fixtures and pilot/legal sign-off are later acceptance gates.

## Review commands

```sh
git diff main...foundation/milestone-1 --stat
git diff main...foundation/milestone-1
npm run check
npm run test:e2e
npm audit --audit-level=high
```

Do not treat a saved environment draft, a local branch or a local test pass as an executed GitHub Actions run, a published environment, or a deployed application.
