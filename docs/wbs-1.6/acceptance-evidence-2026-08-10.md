# WBS 1.6 acceptance evidence

Status: **Technical gates, Agent 1/2/3, third-party supervisor, and Agent 0
independent verification PASS. Awaiting exact-SHA Quality for the Agent 0
evidence tail, protected merge authorization, Squash merge, and resulting
`main` verification.**

This record is bound to the exact implementation SHA below. All identities,
events, aggregates, and test inputs used by the recorded evidence are
synthetic. This record contains only sanitized counts, fixed status labels,
file references, and public run identifiers. It contains no key, JWT, database
credential, raw Supabase status, event payload, contact or document value, raw
credential-bearing log, real identity, or customer data.

## Review identity

- Repository: `https://github.com/yccanwin/canwin-crm`
- Branch: `agent/wbs-1-6-observability`
- Pull request: [#11](https://github.com/yccanwin/canwin-crm/pull/11)
- Exact implementation SHA:
  `0bf6fb8a5dbee32c6a727c4dff6473d24b22bdbc`
- Migration:
  `supabase/migrations/20260809200324_wbs_1_6_observability_foundation.sql`
- Migration SHA-256:
  `3070631bc2856756639716b9cddfb8a6fa6a0b2005bed7d73a7d8407f8a32094`
- Push Quality run / job:
  [31348278773 / 93334226055](https://github.com/yccanwin/canwin-crm/actions/runs/31348278773/job/93334226055)
- Pull-request Quality run / job:
  [31348280529 / 93334231275](https://github.com/yccanwin/canwin-crm/actions/runs/31348280529/job/93334231275)
- Documentation-content tail SHA:
  `453023d62578e6daa41c69d13d0652421826fc3e`
- Documentation-content tail push Quality run / job:
  [31349234653 / 93336833192](https://github.com/yccanwin/canwin-crm/actions/runs/31349234653/job/93336833192)
- Documentation-content tail pull-request Quality run / job:
  [31349238005 / 93336841927](https://github.com/yccanwin/canwin-crm/actions/runs/31349238005/job/93336841927)
- Evidence-binding tail SHA:
  `b7fff4c459934468939ff474f143359ed8f43606`
- Evidence-binding push Quality run / job:
  [31349699747 / 93338088160](https://github.com/yccanwin/canwin-crm/actions/runs/31349699747/job/93338088160)
- Evidence-binding pull-request Quality run / job:
  [31349702701 / 93338095809](https://github.com/yccanwin/canwin-crm/actions/runs/31349702701/job/93338095809)
- Supervisor disposition tail SHA:
  `a99b9e64135caf5350df4749cd4ce154d8f27d48`
- Supervisor-tail push Quality run / job:
  [31353515435 / 93348679152](https://github.com/yccanwin/canwin-crm/actions/runs/31353515435/job/93348679152)
- Supervisor-tail pull-request Quality run / job:
  [31353517606 / 93348685963](https://github.com/yccanwin/canwin-crm/actions/runs/31353517606/job/93348685963)
- Review date/timezone: `2026-08-10`, Asia/Shanghai (UTC+8)
- Test environment: local Supabase/PostgreSQL 17 and GitHub Ubuntu; no hosted
  project or production data

The push and pull-request Quality jobs above are recorded as successful with
their head SHA equal to the exact implementation SHA. This acceptance record
is a later evidence-tail file and is not contained in, or validated by, those
implementation runs.

The documentation-content tail SHA above contains these five review artifacts:

1. `acceptance-evidence-2026-08-10.md`;
2. `agent1-final-review-2026-08-10.md`;
3. `agent2-client-review-2026-08-10.md`;
4. `agent3-quality-review-2026-08-10.md`; and
5. `third-party-review-package-2026-08-10.md`.

Both documentation-content tail runs and their jobs completed successfully
with `headSha` equal to
`453023d62578e6daa41c69d13d0652421826fc3e`. Their sanitized results were:

| Documentation-content tail gate | Push | Pull request |
| --- | ---: | ---: |
| Full pgTAP regression | `186` | `186` |
| Real Auth runtime assertions | `44` | `44` |
| Observability runtime | `87` assertions / `16` workers | `87` assertions / `16` workers |
| Frontend Vitest | `60` tests | `60` tests |
| Dependency audit | `0` vulnerabilities | `0` vulnerabilities |
| Linux protected raw-log mode | `0600`, `posix-verified` | `0600`, `posix-verified` |
| Credential value-pattern counts | `[0, 0, 0, 0]` | `[0, 0, 0, 0]` |
| PII value-pattern count | `0` | `0` |

## Requirement results

| Requirement | Frozen evidence | Result |
| --- | --- | --- |
| Five public tables plus private aggregate allocator exist | migration catalog; `0020_wbs_1_6_schema_rls_append_only.sql` | **PASS** |
| All six tables force RLS; ACL is default deny | catalog/ACL assertions; negative API-role paths | **PASS** |
| Ledger update/delete is blocked | append-only pgTAP assertions; runtime zero-side-effect checks | **PASS** |
| Definition fingerprint equals canonical payload schema SHA-256 | definition constraint, catalog assertion, and runtime fingerprint check | **PASS** |
| Event/outbox is atomic and one-to-one | `0021_wbs_1_6_event_outbox_atomicity.sql`; controlled outbox-fault manifest | **PASS** |
| Replay is idempotent and conflicting input fails closed | pgTAP replay/conflict assertions; synchronized same-key counts; stable `CW409` | **PASS** |
| Same-aggregate concurrency produces continuous unique sequence | 16-worker synchronized aggregate-only manifest | **PASS** |
| Different aggregates allocate independently | synchronized aggregate-only sequence manifest | **PASS** |
| Causation and correlation agree | composite database constraints; root/child and negative runtime paths | **PASS** |
| Request/correlation use transaction-local database context | trace GUC pgTAP and runtime reuse assertions | **PASS** |
| Errors are stable and contain no raw database details | safe envelope pgTAP; frontend compatibility and failure-output checks | **PASS** |
| Only active super_admin receives aggregate metrics | real-JWT role, stale-member, inactive-department, and forged-metadata matrix | **PASS** |
| Metrics match the field allow-list and contain no row detail | fixed twelve-field response-key and sensitive-field checks | **PASS** |
| Sensitive payload keys are recursively rejected | pgTAP recursive/value canaries and runtime zero-side-effect manifest | **PASS** |
| Secrets and PII are absent from public evidence | count-only push and pull-request log scans | **PASS** |

## Automated evidence

| Gate | Minimum | Exact result | Evidence | State |
| --- | ---: | ---: | --- | --- |
| WBS 1.6 pgTAP | 72 | `132` assertions | `0020`-`0022` sanitized test summary | **PASS** |
| Full pgTAP regression | 126 | `186` assertions | push and pull-request Quality jobs | **PASS** |
| Observability runtime | 28 | `87` assertions / `16` workers | sanitized JSON summary | **PASS** |
| Real Auth runtime regression | WBS 1.5 accepted baseline | `44` assertions | sanitized Auth runtime summary | **PASS** |
| Frontend Vitest regression | 58 | `60` tests | sanitized Vitest summary | **PASS** |
| Dependency audit | 0 high-severity vulnerabilities | `0` vulnerabilities | fixed audit summary | **PASS** |
| Lint / typecheck / build | all success | lint, typecheck, and build succeeded | Quality job steps | **PASS** |

### Concurrency and atomicity manifest

- Worker count: `16`
- Same aggregate committed event count: `16`
- Same aggregate committed sequence set: exactly `1..16`
- Same-key committed event/outbox count: `1 / 1`
- Different aggregate sequence sets: exactly `1..4` for each of two aggregates
- Controlled outbox fault event/outbox/sequence side effects: `0 / 0 / 0`
- Deadlock: `false`
- Raw error included in evidence: `false`

Only aggregate counts, booleans, and sequence ranges are recorded here. Worker
stdout/stderr, aggregate identifiers, database status, and payloads are not
attached.

### Public-log secret and PII scan

| Pattern class | Push | Pull request |
| --- | ---: | ---: |
| Secret-key-shaped value | `0` | `0` |
| JWT-shaped value | `0` | `0` |
| Credential label followed by a value | `0` | `0` |
| Serialized secret-key value | `0` | `0` |
| Non-synthetic email/phone/ID/document/invitation value | `0` | `0` |

Pattern labels and verifier source are not credential values. The scans count
matches without reproducing any candidate value.

## Manual review

- Migration/RLS/ACL/function search path and grants: **PASS** - Agent 1 final
  database and security review
- Append-only trigger and schema-fingerprint review: **PASS** - Agent 1 final
  database and security review
- Idempotency fingerprint and lock-order review: **PASS** - Agent 1 final
  database and security review
- Causation/correlation and safe error review: **PASS** - Agent 1 final
  database and security review
- Runtime local-only/no-raw-output review: **PASS** - Agent 1 and Agent 3 final
  reviews
- Frontend `correlation_id`, `FunctionsHttpError.context.json()`, safe UUID,
  and non-JSON fallback review: **PASS** - Agent 2 final client review
- WBS 1.6 scope exclusion review: **PASS** - Agent 1, Agent 2, and Agent 3
  final reviews

## Review dispositions

- Agent 1 security/data review: **PASS** -
  [`agent1-final-review-2026-08-10.md`](./agent1-final-review-2026-08-10.md)
- Agent 2 frontend correlation review: **PASS** -
  [`agent2-client-review-2026-08-10.md`](./agent2-client-review-2026-08-10.md)
- Agent 3 quality/runtime review: **PASS** -
  [`agent3-quality-review-2026-08-10.md`](./agent3-quality-review-2026-08-10.md)
- Third-party supervisor disposition: **PASS** —
  [`third-party-review-package-2026-08-10.md`](./third-party-review-package-2026-08-10.md)
- Agent 0 independent verification: **PASS** —
  [`agent0-final-verification-2026-08-10.md`](./agent0-final-verification-2026-08-10.md)
- Protected merge authorization: **Pending**
- Squash merge and exact resulting `main` Quality: **Pending**

## Evidence-tail boundary

The immutable chain through supervisor tail
`a99b9e64135caf5350df4749cd4ce154d8f27d48` is independently verified. The
Agent 0 evidence-tail commit containing this amended record cannot
self-reference its future SHA. After it is pushed, a separate check must bind
its exact SHA to the remote branch tip, PR head, and successful push and PR
Quality before protected merge authorization is requested.

WBS 1.6 remains incomplete while the Agent 0 tail Quality gate, explicit merge
authorization, protected Squash merge, the exact resulting `main` Quality
run, progress update to `12/54`, and checkpoint 006 remain Pending.

The stale WBS 1.5 post-merge status sentence is a non-blocking documentation
hygiene item for the subsequent progress closeout; it does not gate WBS 1.6
acceptance or merge.
