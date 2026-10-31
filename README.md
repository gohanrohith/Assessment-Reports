# School Assessment + Academic Passport

Foundation milestone: a Next.js school workspace and a NestJS identity/tenant API with PostgreSQL, Prisma, forced row-level security, TOTP MFA, scoped sessions and audit. No ERP modules, assessment engine or production deployment.

## Local development

Requires Node **24.19.0**, npm 11, Docker Engine + Compose. All database passwords in Compose are **local examples only**, bound to loopback. Never reuse them for shared environments.

```sh
node scripts/init-env.mjs
npm ci --ignore-scripts
npm run generate
docker compose up -d --wait
# First initialization of a new volume only (idempotent role helper):
docker compose exec -T postgres psql -U assessment_owner -d assessment -v ON_ERROR_STOP=1 < scripts/db-init.sql
npm run db:migrate
npm run db:seed
npm run dev
```

Web port 3000; API port 4000. Next proxies `/v1` to Nest (same-origin cookies). `GET /v1/health` actually queries PostgreSQL. Development OpenAPI lives at `/openapi` on the API port. No browser CDN fonts or remote authentication service is required.

Seed creates two **synthetic** schools and operator/admin/teacher accounts. Newly generated passwords are stored in ignored `.local/demo-credentials.txt` with mode 0600, never printed. Re-running seed preserves existing users. Admin/operator must click **Set up authenticator**, enter their credentials, add the displayed setup URI to a TOTP authenticator, enter its code and confirm. Sign in using the next code (codes cannot be reused). Keep setup URIs private. This is deliberately not a public self-registration flow.

New school tenants are provisioned by platform operators, not by anonymous registration. To create staff accounts, use the out-of-band operator procedure in [the runbook](docs/development-runbook.md). Student/guardian identity onboarding and recovery are deferred; no unverified student accounts are created.

## Validation

```sh
npm run check           # lint, TypeScript, real DB API tests, builds
npm run test:e2e        # packaged Chromium, real web/API/database
npm audit --audit-level=high
npm run maintenance    # remove expired throttle buckets and spent refresh-token hashes
```

Run tests only against disposable local databases. Tests insert synthetic fixtures and preserve audit records. CI provisions a fresh PostgreSQL service. Browser tests start and stop their own built web/API servers; stop `npm run dev` first. Chromium comes from the integrity-locked `@sparticuz/chromium` package; Linux shared libraries are needed (CI installs standard Playwright system dependencies). To review intentional UI changes: `npm run test:e2e -- --update-snapshots`; inspect the changed PNG before committing.

See [architecture](docs/foundation-architecture.md), [milestone evidence](docs/milestone-1.md), [review notes](docs/review.md), and the four source specifications in `docs/`. CI validates and packages release artifacts; deployment is deliberately absent and needs separate approval. GitHub branch protection must be set by a repository administrator.
