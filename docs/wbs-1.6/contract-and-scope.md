# WBS 1.6 RLS, audit, event, outbox, and observability contract

Status: **Contract Defined; execution and review evidence Pending.**

This contract freezes the WBS 1.6 foundation. It does not state that a
migration, test, review, deployment, or hosted environment has passed.

## Frozen database surface

The only WBS 1.6 public tables are:

- `public.domain_event_definitions`
- `public.audit_log`
- `public.domain_events`
- `public.event_outbox`
- `public.operational_errors`

`app_private.aggregate_event_sequences` is private mutable allocation state.
All six tables enable and force RLS. `PUBLIC`, `anon`, and `authenticated`
receive no direct table privilege. `service_role` receives explicit `SELECT`
only on the five public tables, no new sequence privilege, and no WBS 1.6
write privilege. New public entities are not auto-exposed; exposure always
requires an explicit reviewed grant.

`audit_log`, `domain_events`, `event_outbox`, and `operational_errors` are
append-only ledgers. Application paths cannot update or delete them. Event
definitions are versioned; an existing `(event_type, schema_version)` is not
silently rewritten. The definition `schema_fingerprint` is the SHA-256 of the
canonical `payload_schema` representation.

## Frozen private functions

```text
app_private.new_trace_context(
  p_correlation_id uuid default null
) returns jsonb

app_private.emit_domain_event(
  p_event_type text,
  p_schema_version integer,
  p_aggregate_type text,
  p_aggregate_id text,
  p_producer text,
  p_idempotency_key uuid,
  p_payload jsonb default '{}'::jsonb,
  p_causation_event_id uuid default null,
  p_actor_member_id bigint default null,
  p_correlation_id uuid default null
) returns jsonb

public.get_observability_snapshot(
  p_window_seconds integer default 300,
  p_correlation_id uuid default null
) returns jsonb
```

`new_trace_context`, `write_audit_log`, `record_operational_error`, and
`emit_domain_event` remain private. They fix `search_path = ''`, have their
default execution privileges revoked, and are not granted to `PUBLIC`, `anon`,
`authenticated`, or `service_role`.

Metrics use a narrow exception: an `app_private` `SECURITY DEFINER`
implementation fixes an empty search path and rechecks the current live member
and department through the authoritative WBS 1.5 helper. It returns data only
when that member is active and has role `super_admin`; every other role returns
the stable `FORBIDDEN` or inactive-membership envelope. A `public` `SECURITY
INVOKER` wrapper delegates to it. Only `authenticated` receives execute on the
wrapper and private metrics implementation. No function in `public` may be
`SECURITY DEFINER`.

## Event, outbox, and tracing invariants

- `event_id` is globally unique. `(producer, idempotency_key)` is unique.
- `(aggregate_type, aggregate_id, aggregate_sequence)` is unique. The
  allocator uses a fixed row-lock/atomic update, never `max(sequence) + 1`.
- A new committed event and its outbox envelope are one transaction. The
  outbox has a composite foreign key binding `event_id`, `event_type`,
  `schema_version`, and `correlation_id` to the event.
- Same key and same canonical input returns the original event and outbox and
  does not consume a sequence. Same key with a different canonical input
  returns `IDEMPOTENCY_CONFLICT` with zero committed event/outbox side effects.
- A root event has no cause. A child `causation_event_id` must reference an
  existing event with the same `correlation_id`; mismatches fail closed.
- The database generates `request_id`. `new_trace_context` stores it in a
  transaction-local GUC and reuses it inside the transaction. When no
  correlation is supplied, `correlation_id = request_id`; a valid supplied
  correlation is preserved.
- Event replays and observability reads create safe audit entries. Audit and
  operational-error metadata never copy a raw payload, database exception,
  JWT, key, contact, or document value.

Payload validation is recursive. Keys are normalized before comparison so
variants such as `id_number`/`idNumber` and `document_url`/`documentUrl` are
covered. At minimum `phone`, `email`, `idnumber`, `documenturl`, `token`,
`password`, `jwt`, and `secret` are forbidden at every nesting depth.

## Safe error and metrics contracts

Public failures use only:

```json
{
  "ok": false,
  "error": {
    "code": "STABLE_CODE",
    "message_key": "crm.error.stable_code",
    "safe_params": {},
    "request_id": "synthetic-uuid",
    "correlation_id": "synthetic-uuid"
  }
}
```

The envelope never includes `SQLERRM`, SQLSTATE, relation/constraint names,
stack traces, raw values, payloads, credentials, or PII. Frontend compatibility
requires safe UUID validation for `request_id` and `correlation_id`, parsing a
`FunctionsHttpError` body through `error.context.json()`, and a fail-closed
`UNEXPECTED` fallback for malformed or non-JSON bodies.

The metrics data allow-list is exactly:

- `generated_at`
- `schema_version`
- `window_seconds`
- `domain_events_total`
- `domain_events_in_window`
- `outbox_pending_total`
- `outbox_dead_letter_total`
- `audit_log_total`
- `audit_denials_in_window`
- `operational_errors_total`
- `operational_errors_in_window`
- `oldest_outbox_age_seconds`

No payload, actor/recipient identifier, idempotency key, contact, document, or
row-level sample is a metric. WBS 1.6 provides only the basic state aggregates,
including `outbox_dead_letter_total`; no production outbox state transition is
implemented here. Lease/retry rates, permanent-failure classification,
alerting, and operational handling arrive with WBS 6.1/6.3.

## Frozen verification floor

| Suite | Frozen IDs | Minimum |
| --- | --- | ---: |
| `0020_wbs_1_6_schema_rls_append_only.sql` | `DB16-RLS-*`, `DB16-APP-*` | 24 pgTAP assertions |
| `0021_wbs_1_6_event_outbox_atomicity.sql` | `DB16-EVT-*`, `DB16-SEQ-*` | 28 pgTAP assertions |
| `0022_wbs_1_6_trace_error_metrics.sql` | `DB16-TRC-*`, `DB16-ERR-*`, `DB16-MET-*` | 20 pgTAP assertions |
| WBS 1.6 subtotal | all above | **72** |
| Full database regression | accepted 54 + WBS 1.6 | **126** |
| Local runtime | `RT16-*` | **28** assertions |
| Frontend regression | WBS 1.5 baseline 51 + 7 tracing/Edge cases | **58** tests |

The runtime obtains local Supabase status into Node memory without printing its
stdout/stderr or any value. It accepts only `127.0.0.1`/`localhost`, uses the
fixed `supabase_db_canwin-crm` Docker container, real local JWTs for role/RLS
paths, and independent `psql` sessions with a synchronized barrier for 16-way
concurrency. A local-only temporary trigger proves fault rollback. No
production test RPC or production test switch is allowed.

Public exact-SHA logs must have zero matches in each of the four credential
value classes already frozen by WBS 1.5, plus zero PII-value matches. Raw
Supabase status, database, Edge, or runtime logs are never replayed or uploaded.

## Scope boundary

WBS 1.6 includes only the reusable ledger, event/outbox transaction primitive,
trace/error contract, base super-admin aggregate snapshot, and evidence gates.

It explicitly excludes:

- claim, assignment, settlement, follow-up, customer, document, or closure
  business RPC integration;
- outbox claim/settle, lease ownership, `SKIP LOCKED` worker behavior, consumer
  cursor, retry/backoff, permanent failure, dead letter, and replay tools;
- in-app notifications, WeCom/DingTalk adapters, notification templates;
- 48/24-hour reminders, expiry Cron, business dashboards, exports;
- external APM, hosted alerting, production operations, and Team OS switching.

Those remain WBS 4.2/4.5/5.3/5.6 and 6.1-6.6. Their absence cannot be recorded
as a WBS 1.6 failure or represented as completed by this foundation.
