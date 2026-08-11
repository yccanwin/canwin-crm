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

WBS 1.6 adds three focused suites and must not replace the earlier regression
set:

- `0020_wbs_1_6_schema_rls_append_only.sql` proves the five public ledger and
  observability tables, the private aggregate sequence table, forced RLS,
  explicit ACLs, privileged-function hardening, and append-only protection.
- `0021_wbs_1_6_event_outbox_atomicity.sql` proves event/outbox atomicity,
  idempotency, per-aggregate sequence allocation, causation, and rollback with
  zero committed side effects.
- `0022_wbs_1_6_trace_error_metrics.sql` proves database-generated request and
  correlation IDs, safe error envelopes, sensitive-key rejection, active
  super-administrator metrics, and denied role/stale-JWT paths.

The WBS 1.6 suites contain at least 72 new pgTAP assertions. Together with the
accepted 54-assertion baseline, the full database run must report at least 126
assertions. Evidence must record both the WBS 1.6 subtotal and the full total;
running only the new files is not acceptance evidence.

The existing 51 frontend tests remain required. WBS 1.6 adds seven concrete
trace/Edge safety cases for `correlation_id`, validated UUIDs,
`FunctionsHttpError.context.json()`, invalid identifiers, and malformed or
non-JSON fallback, so the full frontend regression floor is 58 tests.

Run the local reset before the database suite:

```powershell
npm.cmd exec -- supabase db reset --local --yes
npm.cmd exec -- supabase test db --local
```

The pgTAP suite is a database contract test. It does not replace the WBS 1.5
black-box test that obtains a Real-JWT from local or dedicated test Supabase
Auth, calls the Data API/RPC boundary, disables the authoritative membership,
and proves that the pre-disable token can no longer read protected data.

WBS 1.6 additionally requires `scripts/verify-observability-runtime.mjs`. It
uses real local JWTs for the metrics and direct-table denial matrix, and fixed
local Docker `psql` sessions for atomicity and synchronized concurrency. It
must connect only to `127.0.0.1`/`localhost` and the fixed
`supabase_db_canwin-crm` container, capture local status output in memory, and
never print a database credential, JWT, event payload, or raw error/log.

Test reports and review packages must use synthetic identities and sanitized
references. Never preserve JWTs, invitation links or tokens, secret/service-
role keys, real employee emails, customer data, or unmasked hosted project
references in the repository, CI log, or evidence bundle.

WBS 2.1 adds `0030_wbs_2_1_account_store_schema.sql` and
`0031_wbs_2_1_shared_archive_rls.sql`. Together they freeze the global
account/store schema, constraints, audit identity, least grants, shared reads,
stale-session denial, and direct-write refusal. They add 73 assertions without
replacing the earlier WBS 1.4–1.6 regression suites.

WBS 2.2 adds exactly three focused suites without replacing any earlier
regression:

- `0032_wbs_2_2_contacts_schema.sql` proves the public/private field boundary,
  one-store ownership, restrictive foreign keys, immutable identity, forced
  RLS, and required indexes.
- `0033_wbs_2_2_contacts_acl.sql` proves explicit table/sequence/function ACLs,
  no direct private-table path, Realtime exclusion, empty-search-path
  privileged functions, and no shadow claim authority.
- `0034_wbs_2_2_contact_read_rpc.sql` proves the safe denial envelope,
  super-admin reason gate, live session/member/department checks, sanitized
  allow/deny audit, and zero sensitive canary leakage.

The WBS 2.2 plans are frozen at 53, 35, and 46 assertions respectively, for an
exact subtotal of 134. Evidence must record both this subtotal and the full
pgTAP total; extra WBS 2.2 suites are not allowed.
`scripts/verify-contact-access-runtime.mjs` separately uses local real Auth JWTs
for anon, A1, A2, MA, B1, SA, disabled, inactive-department, old-session, and
forged-metadata paths. It refuses non-local Supabase URLs and prints only
sanitized counts. Any unauthorized plaintext, partial value, mask, tail,
recoverable value, direct private-table/Realtime value, or audit canary is P0.

Contact test fixtures must use synthetic canaries held only in process memory.
Never paste canaries, raw RPC responses, JWTs, keys, local status output, names,
contact channels, SQL errors, or stack traces into CI output or review evidence.
