# WBS 1.4 third-party supervisor review package

## Review target

- Repository: `https://github.com/yccanwin/canwin-crm`
- Branch: `agent/wbs-1-4-supabase`
- Review target: the current remote branch tip at the time of review
- WBS item: `1.4 Supabase environments and migration mechanism`
- Required outcome: `PASS`, `FAIL`, or `CONDITIONAL`, with findings and the
  exact reviewed commit SHA

The reviewer must not request or record project keys, database passwords,
connection strings, customer data, document contents, or unmasked project
references. Team OS 3.0 is outside this review and must not be modified.

## Acceptance scope

The review should determine whether the branch provides:

1. Three independent CRM Supabase environments with an approved Tokyo-region,
   zero-cost free-plan operating posture.
2. A pinned Supabase CLI, reviewed local configuration, append-only migration
   directory, seed boundary, and documented promotion/forward-fix lifecycle.
3. Direct evidence that local reset, seed execution, migration listing, and the
   four-test empty-baseline database suite passed.
4. Direct evidence that dev/test/prod share PostgreSQL major 17, an empty
   application schema, no `anon`/`authenticated` public-table grants, and an
   empty migration baseline.
5. A forward-fix rehearsal proving an applied migration remained byte-for-byte
   unchanged while a later migration repaired state, followed by complete
   cleanup to the empty baseline.
6. Secret-boundary, dependency-audit, lint, typecheck, test, build, and hosted
   CI evidence with no temporary migration or installer artifact committed.
7. Proof that Team OS 3.0 remained active and was neither migrated nor changed.

## Evidence index

- `docs/wbs-1.4/acceptance-evidence-2026-08-09.md`
- `docs/supabase-environments-and-migrations.md`
- `docs/wbs-1.4/acceptance-evidence-template.md`
- `supabase/config.toml`
- `supabase/migrations/README.md`
- `supabase/seed.sql`
- `supabase/tests/0001_wbs_1_4_baseline.sql`
- `scripts/verify-supabase-baseline.mjs`
- `.github/workflows/quality.yml`
- GitHub Actions runs `31304705400` and `31304869663`

## Required reviewer checks

- Record the exact full commit SHA and confirm it equals the remote branch tip.
- Confirm `supabase/migrations` contains no rehearsal SQL file.
- Confirm project identifiers in public evidence are masked and no credential
  or customer data appears in the reviewed changes.
- Confirm the migration lifecycle forbids dashboard-only drift and mutation of
  deployed migration history.
- Confirm the evidence distinguishes technical implementation from formal
  review status and does not claim third-party approval prematurely.
- Inspect the current branch-tip GitHub Actions result; a passing result from an
  older commit alone is insufficient.

## Supervisor disposition

Complete this section without adding secrets or customer data:

- Reviewer name / organization:
- Review date and timezone:
- Reviewed full commit SHA:
- Branch-tip Quality run URL:
- Disposition (`PASS`, `FAIL`, or `CONDITIONAL`):
- Blocking findings:
- Non-blocking findings:
- Evidence or report reference:
- Signature / approval reference, if applicable:

Until this section is completed by the external reviewer and independently
verified by Agent 0, WBS 1.4 remains formally unaccepted.
