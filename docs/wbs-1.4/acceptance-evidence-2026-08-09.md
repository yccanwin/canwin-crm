# WBS 1.4 acceptance evidence — gates complete, merge pending

- Date: 2026-08-09 (Asia/Shanghai)
- Branch: `agent/wbs-1-4-supabase`
- Supabase CLI: `2.109.1`, pinned in `package.json` and lockfile
- Organization: `yccanwin's Org`
- Region: Northeast Asia (Tokyo), `ap-northeast-1`
- Current project cost: 0 per month, reconfirmed before creation
- User authorization: project-thread confirmation for dev/test/prod creation

## Hosted environment evidence

Project references are deliberately masked. Credentials, URLs, connection
strings, keys, passwords, tokens, and customer data are not recorded here.

| Environment | Masked ref | Final state | PostgreSQL major | `public` tables | `anon` / `authenticated` table grants | Hosted migrations | Security advisor | Performance advisor |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| dev | `foes…dmrb` | `ACTIVE_HEALTHY` | 17 | 0 | 0 | Empty baseline | No lints | No lints |
| test | `nyqk…ksvp` | `INACTIVE` | 17 | 0 | 0 | Empty baseline | No lints | No lints |
| prod | `tgql…eptg` | `INACTIVE` | 17 | 0 | 0 | Empty baseline | No lints | No lints |

The application-schema drift query was executed read-only against each CRM
environment after restoring it in turn. It counted physical tables in the
`public` schema and grants on `public` tables to the `anon` and
`authenticated` roles. Every environment returned the same tuple:
`postgres_major=17`, `public_table_count=0`, and
`exposed_table_grant_count=0`. This directly rules out dashboard-created
application tables and public table grants outside migration history at this
empty baseline.

The free-plan rotation was then returned to its normal operating state:
development `ACTIVE_HEALTHY`, test `INACTIVE`, and production `INACTIVE`.

Team OS 3.0 remained `ACTIVE_HEALTHY` throughout the rotation. It was not
paused, linked, migrated, or otherwise modified.

## Migration and recovery evidence

- The repository contains no business migration yet; the local and all hosted
  migration sequences therefore have the same empty baseline.
- Test and production were only read for migration/advisor evidence. No hosted
  schema or data write was performed.
- Development completed a real pause/restore cycle and returned to
  `ACTIVE_HEALTHY`, proving the zero-cost rotation can recover the normal
  engineering environment.
- Development, test, and production were each queried while active and showed
  the same empty application schema and grant surface. The hosted schema-drift
  comparison therefore passed.
- The documented rollback policy is forward-fix/expand-contract after a
  migration is deployed. Deployed migration history is immutable.

## Local reset, seed, and database-test evidence

- Docker Desktop `4.85.0` provided a Linux/amd64 Docker Engine `29.6.2` for
  local development only. The Supabase stack used the repository's configured
  local ports `54321`-`54324` and was stopped after verification.
- `supabase db reset --local --yes` recreated the local database, initialized
  the managed schemas, applied the repository's empty migration sequence,
  executed `supabase/seed.sql`, and restarted the local services successfully.
- `supabase migration list --local` returned an empty list, matching the
  repository and all three hosted environments.
- `supabase test db --local supabase/tests/0001_wbs_1_4_baseline.sql` passed
  all four pgTAP assertions (`Files=1`, `Tests=4`, `Result: PASS`). The test
  proves PostgreSQL major 17, zero `public` application tables, zero
  `anon`/`authenticated` grants on `public` tables, and no migration-history
  table at the zero-migration baseline.

## Forward-fix rehearsal evidence

- Both temporary rehearsal migrations were created with
  `supabase migration new`; no timestamp or filename was invented manually.
- The first migration created a private, non-exposed rehearsal schema and a
  probe row in the deliberately incomplete `pending` state. A local reset
  applied it once, and a direct read-only query confirmed one matching
  migration-history row.
- Before the fix, the first migration's SHA-256 was
  `103C6978C8BE407AF967E456D673904222E66F773BB4ACFE62D93D84F8A59416`.
  A second, later migration changed the row and default to `ready` and added a
  validating check constraint. After applying both migrations, the first
  file's SHA-256 was identical and each migration had exactly one history row.
  This proves the deployed migration was not edited and the repair moved
  forward through a new migration.
- The two rehearsal migrations and their temporary queries were then removed.
  A final local reset returned the repository to its real empty baseline; a
  read-only query confirmed the rehearsal schema, table, and migration-history
  table were absent. The local stack was stopped while retaining its data
  volume.
- No rehearsal migration or synthetic probe data was pushed to a hosted
  environment.

## Repository quality evidence

- `npm.cmd run check` passed again on the final content-bearing commit
  `5604f17` on 2026-08-09. The aggregate run passed scaffold, environment
  boundary, quality configuration, Supabase baseline, lint, typecheck, one
  Vitest test, and the production Vite build.
- The environment-boundary verifier scanned repository text files for live
  OpenAI, GitHub, Supabase, Google, AWS, Slack, and JWT-style credentials;
  rejected committed non-example environment files and sensitive `VITE_*`
  variables; and passed without reporting a potential credential.
- GitHub Actions Quality run
  [`31304705400`](https://github.com/yccanwin/canwin-crm/actions/runs/31304705400)
  completed successfully for full commit
  `5604f173fc79d8af855fa1d17773be3064d12766`. Its `quality` job passed locked
  dependency installation, high-severity audit, scaffold, environment,
  Supabase, lint, typecheck, test, and production-build steps.
- The following documentation-only evidence commit `896addb` also passed the
  same immutable Quality workflow in run
  [`31304869663`](https://github.com/yccanwin/canwin-crm/actions/runs/31304869663).
  Its full SHA is `896addb0c3cd770ba3c64384fad309c74fc231e2`, and every job
  step completed successfully.
- The supervisor-disposition tail commit
  `962fa8909749b6c2bfba1c0c374ba7ee50923606` passed both push Quality run
  [`31306108368`](https://github.com/yccanwin/canwin-crm/actions/runs/31306108368)
  and PR Quality run
  [`31306110512`](https://github.com/yccanwin/canwin-crm/actions/runs/31306110512).
  Agent 0 independently confirmed both runs have that exact `headSha` and all
  quality steps succeeded, then reran `npm.cmd run check` locally with a zero
  exit code.
- Evidence uses a non-self-referential documentation-tail rule: a document
  cannot contain the CI run created by its own commit. Each documentation-only
  tail commit must pass the unchanged Quality workflow before merge, and that
  branch-tip check plus the preceding recorded run form the auditable chain.
- `.github/workflows/quality.yml` runs `npm run verify:supabase` in the required
  `quality` job; the Supabase baseline is therefore part of the protected CI
  status rather than a local-only check.

## Review evidence

- Third-party supervisor: **PASS**, no blocking findings, recorded in
  `docs/wbs-1.4/third-party-review-package-2026-08-09.md`. The supervisor
  reviewed full SHA `2a3da9ae3693e66faaf658148c9885b9ab67f568` and the later
  supervisor-only tail commit is protected by the two exact-SHA green runs
  above.
- Agent 1 final re-review: **PASS**, no blocking findings, recorded in
  `docs/wbs-1.4/agent1-final-review-2026-08-09.md` against full SHA
  `962fa8909749b6c2bfba1c0c374ba7ee50923606`.
- Agent 0 independently verified the supervisor disposition, commit scope,
  clean worktree, exact-SHA push/PR runs, unchanged quality workflow, and local
  aggregate checks on 2026-08-09.

All WBS 1.4 technical and review gates are complete. The item becomes formally
completed after PR #9 is merged through protected `main` and the resulting
main-branch Quality run succeeds.
