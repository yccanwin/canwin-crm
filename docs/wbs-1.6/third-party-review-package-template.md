# WBS 1.6 third-party supervisor review package template

Status: **Defined; supervisor review and Agent 0 verification are Pending.**

## Review target

- Repository / PR: `Pending`
- Exact implementation SHA: `Pending`
- Exact evidence-tail SHA: `Pending`
- Migration SHA-256: `Pending`
- Push Quality run / job: `Pending`
- Pull-request Quality run / job: `Pending`
- Internal Agent 1/2/3 review references: `Pending`
- Acceptance record: `docs/wbs-1.6/acceptance-evidence-template.md`
- Frozen contract: `docs/wbs-1.6/contract-and-scope.md`

The supervisor reviews the exact SHA. An older green run is not evidence. Do
not request or preserve a key, JWT, database URL/password, raw Supabase status,
event payload, contact/document value, real email, customer data, or raw log.

## Traceability

| Requirement | Test IDs | Required evidence | Internal state | Supervisor result |
| --- | --- | --- | --- | --- |
| Forced RLS and explicit ACL | `DB16-RLS-*`, `RT16-AUTH-*` | catalog and real-JWT denial matrix | Defined | Pending |
| Append-only ledgers | `DB16-APP-*` | update/delete zero-side-effect results | Defined | Pending |
| Canonical schema fingerprint | `DB16-EVT-*` | payload schema and SHA-256 comparison | Defined | Pending |
| Atomic event/outbox | `DB16-EVT-*`, `RT16-EVT-*` | controlled-fault before/after counts | Defined | Pending |
| Idempotency and sequence | `DB16-SEQ-*`, `RT16-CON-*` | replay/conflict and 16-worker manifest | Defined | Pending |
| Request/correlation/causation | `DB16-TRC-*`, `RT16-EVT-*` | transaction-local and root/child proof | Defined | Pending |
| Safe errors/frontend compatibility | `DB16-ERR-*`, frontend tests | field allow-list and recovery fallback | Defined | Pending |
| Active super_admin metrics only | `DB16-MET-*`, `RT16-AUTH/MET-*` | positive and denied/stale-JWT paths | Defined | Pending |
| Secret/PII boundary | `SEC16-*` | count-only public-log scans | Defined | Pending |

## Required supervisor checks

- [ ] Remote branch tip and PR head equal the exact reviewed SHA.
- [ ] That SHA has successful push and PR `quality` runs and all steps succeed.
- [ ] The migration is the only WBS 1.6 migration and its hash is recorded.
- [ ] All five public tables and the private aggregate allocator force RLS.
- [ ] ACLs deny public/anon/authenticated; service_role has only the frozen
  public-table SELECT grants and no new sequence/write privilege.
- [ ] Public schema contains no `SECURITY DEFINER`; private functions fix empty
  search paths and default execution is revoked.
- [ ] Private trace/audit/error/event helpers are not executable by anon,
  authenticated, or service_role.
- [ ] Private metrics is the narrow SECURITY DEFINER exception, performs a
  live active-super_admin check, and the public wrapper is SECURITY INVOKER.
- [ ] Update/delete attempts cannot mutate audit, event, outbox, or operational
  error ledgers.
- [ ] Definition fingerprint equals canonical `payload_schema` SHA-256.
- [ ] Event/outbox composite FK binds ID, type, version, and correlation.
- [ ] Same-key replay is one event/outbox and a conflicting fingerprint has
  zero side effects.
- [ ] Sixteen synchronized same-aggregate writers commit sequences exactly
  `1..16`; different aggregates remain independent and no deadlock occurs.
- [ ] Controlled outbox failure commits no event, outbox, or sequence state.
- [ ] Request ID is database-generated and transaction-local; correlation
  defaults to it and valid supplied correlation is preserved.
- [ ] Causation references an existing event with matching correlation.
- [ ] Error envelopes contain only stable safe fields and safe UUID traces.
- [ ] Frontend parses `FunctionsHttpError.context.json()`, validates request and
  correlation UUIDs, and fails closed for malformed/non-JSON bodies.
- [ ] Real JWT proves anon/sales/manager/disabled old JWT cannot read ledgers or
  metrics, while an active super_admin receives only aggregate metrics.
- [ ] Recursive sensitive-key canaries commit no event or outbox.
- [ ] WBS 1.6 pgTAP is at least 72, full pgTAP at least 126, runtime at least
  28, and frontend Vitest at least 58; audit/lint/typecheck/build succeed.
- [ ] Four credential value classes and the PII value class each have zero
  matches in both public exact-SHA logs.
- [ ] No raw status/database/runtime log is printed or uploaded.
- [ ] Claim/settle/lease worker, retry/dead-letter, notifications, business RPC
  integration, dashboards, exports, and production operations remain excluded.

## Findings

| ID | Severity (`P0`/`P1`) | Finding | Owner | Retest SHA/evidence | Status |
| --- | --- | --- | --- | --- | --- |
| Pending | Pending | Pending | Pending | Pending | Open |

Any open P0/P1 blocks completion. A conditional result is not completion until
every condition closes on a new exact SHA and the affected regression set is
rerun.

## Supervisor disposition

- Reviewer / organization: Pending
- Review date/timezone: Pending
- Exact reviewed implementation SHA: Pending
- Exact reviewed evidence-tail SHA: Pending
- Disposition (`PASS`, `FAIL`, or `CONDITIONAL`): Pending
- Blocking findings: Pending
- Non-blocking observations: Pending
- Signature or immutable reference: Pending

## Agent 0 independent verification

- Reviewer identity/reference: Pending
- SHA ancestry and documentation-only tail: Pending
- Exact-SHA push and PR Quality: Pending
- All P0/P1 closed: Pending
- Protected Squash-merge request decision: Pending
- Resulting `main` tip and Quality: Pending

The final supervisor or Agent 0 evidence-tail commit cannot self-reference.
After push, a separate verification must bind the exact tail SHA to remote tip,
PR head, push/PR runs and jobs. Merge and `main` remain Pending until actually
completed; no template state may be promoted early.
