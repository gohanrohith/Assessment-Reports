# BL-004A — Prisma technical validation result

Engineering result: **GO for the foundation on pinned Prisma 6.19.3**, with the existing reviewed migration adapter compatibility handling. All checks run against real local PostgreSQL and the non-owner `assessment_app` role. No production approval or pilot-load claim is implied.

Run `npm run test:prisma`. The runner generates and typechecks a separate Prisma client from the committed probe templates, creates a random isolated schema, runs the assertions and drops that schema. It does not add assessment or grading tables to the application. `npm run test:migrations` independently verifies failed-DDL rollback.

| Criterion | Evidence |
| --- | --- |
| Parameterized transaction-local tenant context | Probe uses `set_config(..., true)` inside Prisma transactions; missing-context reads return no rows, cross-tenant inserts fail and context does not escape the transaction |
| Native complex aggregate query pattern | Typed `groupBy` uses tenant filters, student/status grouping and decimal sums over generated conditional contribution/eligible-weight columns. Ordinary client creates/updates read these generated values. No raw-SQL SELECT is used for the aggregate |
| Independently known arithmetic | Weighted score 66; exempt-component renormalization 80; absent 0; incomplete remains unfinalized; updating a mark recomputes its stored contribution |
| Forward migration behavior | Nullable column addition completes below the runner's two-second ceiling and leaves the table's PostgreSQL file node unchanged, demonstrating no table rewrite for this tested operation |
| Contention / rollback | Holding a read transaction makes ALTER TABLE fail at a 200ms lock timeout; the rejected migration leaves no column behind. Once the holder releases, the same alteration succeeds |

The application will still need a reviewed grading model, versioned policy semantics, precision/rounding decisions and domain-specific tests in its assessment milestone. Generated projections are a validated query design option, not a shipped grading engine or a promise that every future expression is directly supported by Prisma.

PostgreSQL DDL takes locks. This probe deliberately tests bounded failure under contention rather than claiming lock-free migrations. Production lock/load characterization, backfill plans, concurrent-index strategy and release windows require a representative environment. The current atomic migration adapter cannot wrap `CREATE INDEX CONCURRENTLY`; such a migration needs an explicit separately reviewed nontransactional path before use. Never weaken transactionality globally or hide that PostgreSQL restriction.

Prisma RLS and native aggregate criteria passed, so there is no technical reason from this probe to switch to Drizzle or reverse the source ADR. Architecture review can inspect the exact executable evidence and the migration adapter; pilot/product/legal sign-off remain external gates.
