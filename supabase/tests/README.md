# Database test boundary

WBS 1.4 reserves this directory for migration, RLS, RPC, Storage, and database
contract tests. Business-schema tests arrive with their owning WBS item.

Every exposed table introduced later must have both authorized and denied-path
tests. Local tests use synthetic data only and run after `supabase db reset
--local`. Hosted test execution must target the dedicated test project and may
not receive production credentials or data.

`0001_wbs_1_4_baseline.sql` began as the executable empty-baseline proof. After
the first business migration it remains as a continuing platform guard: it
checks PostgreSQL 17, the absence of anonymous public-table grants, and the
presence of migration history. The historical zero-table proof remains bound
to the accepted WBS 1.4 commit and evidence package.

WBS 1.5 adds three focused suites:

- `0010_wbs_1_5_auth_schema.sql` proves the Auth/member schema, one-primary-
  department constraints, indexed foreign keys, forced RLS, grants, and
  privileged-function hardening.
- `0011_wbs_1_5_invitation_acceptance.sql` proves bound and atomic invitation
  acceptance, failure rollback, expiration, revocation, and replay behavior.
- `0012_wbs_1_5_roles_and_stale_jwt.sql` proves anonymous, sales, department-
  manager, super-administrator, cross-department, restricted, and disabled
  authorization paths, including stale-claim denial.

Run the local reset before the database suite:

```powershell
npm.cmd exec -- supabase db reset --local --yes
npm.cmd exec -- supabase test db --local
```

The pgTAP suite is a database contract test. It does not replace the WBS 1.5
black-box test that obtains a Real-JWT from local or dedicated test Supabase
Auth, calls the Data API/RPC boundary, disables the authoritative membership,
and proves that the pre-disable token can no longer read protected data.

Test reports and review packages must use synthetic identities and sanitized
references. Never preserve JWTs, invitation links or tokens, secret/service-
role keys, real employee emails, customer data, or unmasked hosted project
references in the repository, CI log, or evidence bundle.
