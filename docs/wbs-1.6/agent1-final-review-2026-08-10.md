# WBS 1.6 Agent 1 database and security final review

## Disposition

**PASS - no open Agent 1 P0 or P1 finding.**

This disposition is limited to the WBS 1.6 database, authorization,
observability, and runtime-safety implementation at the exact SHA below. It is
an internal technical review and does not replace third-party supervision,
Agent 0 verification, protected merge authorization, or post-merge `main`
verification.

## Review identity and evidence binding

- Review date and timezone: `2026-08-10`, Asia/Shanghai (UTC+8)
- Reviewer role: Agent 1 - backend, database, authorization, and security
- Repository: `yccanwin/canwin-crm`
- Branch: `agent/wbs-1-6-observability`
- Pull request: [#11](https://github.com/yccanwin/canwin-crm/pull/11)
- Reviewed implementation full SHA:
  `0bf6fb8a5dbee32c6a727c4dff6473d24b22bdbc`
- Push Quality run / job:
  [31348278773 / 93334226055](https://github.com/yccanwin/canwin-crm/actions/runs/31348278773/job/93334226055)
- Pull-request Quality run / job:
  [31348280529 / 93334231275](https://github.com/yccanwin/canwin-crm/actions/runs/31348280529/job/93334231275)
- Agent 1 review method: exact-commit, read-only static inspection of the WBS
  1.6 migration, pgTAP suites, runtime verifier, CI wiring, and WBS 1.5 Auth
  compatibility changes. Agent 1 did not rerun the database or runtime tests
  during this final review.

The cited exact-SHA Quality evidence records both push and pull-request jobs as
successful with the following sanitized results:

| Gate | Recorded result |
| --- | ---: |
| Full pgTAP regression | `186` assertions passed |
| Real Auth runtime | `44` assertions passed |
| Observability runtime | `87` assertions passed |
| Synchronized observability workers | `16` |
| Frontend regression | `60` tests passed |

This review record is a documentation tail created after the implementation
SHA. Its future commit must receive its own Quality evidence and must not be
represented as part of the implementation SHA above.

## Database and security verification

1. **RLS, FORCE RLS, and ACL boundary - PASS.** All five new public
   observability tables enable and force RLS and have no API-facing row policy.
   `anon` and `authenticated` receive no direct table grant. `service_role`
   receives SELECT only on those tables, receives no new write or identity
   sequence privilege, and receives no access to the private aggregate
   sequence state.
2. **Secure-by-default future public tables - PASS.** Default privileges remove
   table, sequence, and function access from API roles. The DDL event trigger
   covers `CREATE TABLE`, `CREATE TABLE AS`, and `SELECT INTO`; each new public
   table is automatically changed to ENABLE plus FORCE RLS and has API-role
   grants revoked.
3. **Privileged function boundary - PASS.** Private writers and the metrics
   implementation remain in `app_private`, use `SECURITY DEFINER`, fix an empty
   `search_path`, and revoke default execution from public/API roles. The public
   metrics entry point remains `SECURITY INVOKER`; only `authenticated` may
   traverse the explicitly granted private implementation, whose body performs
   the live authorization check.
4. **Append-only and outbox envelope protection - PASS.** Event definitions,
   audit rows, domain events, and operational errors reject UPDATE, DELETE, and
   TRUNCATE. The outbox rejects DELETE and TRUNCATE and prevents changes to its
   event identity, type, schema version, correlation, and creation timestamp,
   while preserving only the documented future delivery-state fields as
   mutable.
5. **Atomic event, outbox, and audit write - PASS.** A new event, its pending
   outbox row, the aggregate sequence update, and the success audit are written
   in one database transaction. Any later failure raises and rolls back all
   four effects. The dedicated runtime fault probe verifies rollback when the
   outbox insert fails.
6. **Idempotency and concurrency - PASS.** The event writer requires a UUID
   idempotency key, serializes each producer/key pair with a transaction-scoped
   advisory lock, and also enforces a database unique constraint. Identical
   content returns the original event and appends only safe replay audit
   evidence; it does not add an event, outbox row, or sequence. Different
   content returns stable SQLSTATE `CW409`.
7. **Per-aggregate sequence integrity - PASS.** Sequence allocation uses an
   atomic UPSERT against a private, forced-RLS aggregate state table, while a
   stream-level unique constraint protects committed event order. The runtime
   evidence covers synchronized same-aggregate and independent-aggregate
   workers with contiguous committed sequences.
8. **Causation and outbox database binding - PASS.** Composite database
   constraints bind the outbox event type, schema version, and correlation to
   its domain event. Causation must reference an existing event with the same
   correlation; the writer also validates this before insertion. Cross-trace
   or missing causation is rejected without committed side effects.
9. **Shared trace contract - PASS.** `request_id` is generated in the database,
   stored transaction-locally, and reused by nested event, audit, error, and
   metrics operations. An optional correlation UUID is tracing context only and
   is likewise reused within the transaction. Success and error envelopes
   return stable request/correlation fields; error codes are allow-listed by
   shape and no raw database exception is returned.
10. **Sensitive-value rejection - PASS.** Payload, safe audit data, safe error
    context, and safe RPC parameters must be JSON objects within their byte
    limits. Recursive normalized-key checks and value canaries reject credential
    fields, tokens, non-synthetic email addresses, phone and identity-number
    shapes, and protected document paths. Rejected event payloads commit no
    event, outbox, aggregate sequence, or audit side effect.
11. **Metrics authorization and disclosure boundary - PASS.** Metrics are
    calculated from current database rows. Access requires a valid live session,
    an active member, an active primary department, and the current
    `super_admin` role. Disabled members, inactive departments, sales users,
    department managers, and stale or forged metadata claims fail closed. The
    success payload contains only the fixed twelve-field aggregate allow-list;
    no event detail, actor identifier, idempotency value, payload, raw SQL, or
    error stack is exposed. Successful and denied guarded calls append safe
    audit evidence.
12. **WBS 1.5 regression compatibility - PASS.** The original one-argument
    success helper and two-argument error helper signatures remain available,
    while explicit trace overloads are private. The WBS 1.5 service-role table
    grants are not withdrawn. Client parsing accepts the additive trace fields,
    validates UUID shape, discards raw or malformed fields, and preserves the
    existing Auth context, invitation, session-revocation, and stable-error
    behavior covered by the full Auth and frontend regressions.
13. **Runtime random and log-safety fix - PASS.** The synthetic event type uses
    a fixed alphabetic `e` prefix before UUID hex, so every generated third
    segment satisfies the database event-type constraint without reducing
    randomness. The static verifier pins that exact source contract. Runtime
    failure output is limited to frozen `RT16-00` through `RT16-15` stage codes;
    raw command output, database status, credentials, JWTs, payloads, and
    dynamic identifiers are withheld. The runtime is restricted to local
    Supabase endpoints and the fixed local database container.

## Test coverage assessment

- `0020_wbs_1_6_schema_rls_append_only.sql` directly checks schema presence,
  ENABLE/FORCE RLS, absence of API policies and grants, service-role SELECT-only
  access, sequence denial, function security properties, append-only triggers,
  and live DDL probes for ordinary table creation, CTAS, and SELECT INTO.
- `0021_wbs_1_6_event_outbox_atomicity.sql` checks event/outbox/audit creation,
  replay and conflict behavior, sequence allocation, causation, sensitive-input
  rejection, business rollback, and immutable ledger/outbox operations.
- `0022_wbs_1_6_trace_error_metrics.sql` checks transaction trace reuse, stable
  envelopes, recursive sensitive canaries, safe audit/error writers, active
  super-administrator metrics, denied roles, disabled member and inactive
  department behavior, and stale or forged metadata denial.
- The real runtime supplements pgTAP with local real-JWT authorization, direct
  Data API denial, synchronized concurrency, same-key replay, independent
  aggregate streams, causation, sensitive-input zero side effects, and injected
  outbox-failure rollback.

## Findings

- Open P0 findings: **none**.
- Open P1 findings: **none**.
- Non-blocking Agent 1 findings: **none**.

## Remaining governance gates

- Third-party supervisor disposition: **Pending**.
- Agent 0 independent exact-SHA and evidence-tail verification: **Pending**.
- Protected merge authorization and merge: **Pending**.
- Resulting `main` SHA and exact-SHA Quality verification: **Pending**.

Team OS 3.0 remains outside this repository and was not changed. This review
does not approve hosted production activation, later outbox worker claim/lease/
settle behavior, business-domain event retrofits, or any WBS item beyond the
frozen WBS 1.6 foundation scope.

## Final Agent 1 decision

Agent 1 gives the WBS 1.6 database, RLS/ACL, privileged-function,
append-only/outbox, atomic event, idempotency, sequence, causation, trace,
sensitive-data, metrics, future-table, WBS 1.5 compatibility, and local runtime
boundaries a **PASS** at implementation SHA
`0bf6fb8a5dbee32c6a727c4dff6473d24b22bdbc`. No P0 or P1 finding remains open
in Agent 1 scope. This record may enter the documentation-only evidence tail;
it does not by itself authorize merge or declare WBS 1.6 complete.
