# WBS 1.4 acceptance evidence — work in progress

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

## Repository quality evidence

- `npm.cmd run check` passed on 2026-08-09 after clearing two untracked,
  generated TypeScript build-information files.
- The aggregate run passed scaffold, environment boundary, quality
  configuration, Supabase baseline, lint, typecheck, one Vitest test, and the
  production Vite build.
- `.github/workflows/quality.yml` runs `npm run verify:supabase` in the required
  `quality` job; the Supabase baseline is therefore part of the protected CI
  status rather than a local-only check.

## Evidence still required before acceptance

- Docker-backed `supabase db reset --local`
- Local migration list and database test output
- Seed execution verification
- Local rollback/forward-fix rehearsal
- Final secret scan and hosted CI run for the completed evidence commit
- Agent 0 / Agent 1 review and third-party supervisor disposition

WBS 1.4 remains in progress until every item above has direct evidence.
