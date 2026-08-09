# WBS 1.6 acceptance evidence template

Status: **Defined; all execution and review evidence is Pending.**

Do not change a result to PASS until it is bound to the exact implementation
SHA and the evidence below exists. Use synthetic identities only. Never paste
a key, JWT, database URL/password, raw Supabase status, event payload, contact,
document value, or raw credential-bearing log.

## Review identity

- Repository: `https://github.com/yccanwin/canwin-crm`
- Branch: `Pending`
- Pull request: `Pending`
- Exact implementation SHA: `Pending`
- Migration: `Pending`
- Migration SHA-256: `Pending`
- Push Quality run / job: `Pending`
- Pull-request Quality run / job: `Pending`
- Review date/timezone: `Pending`
- Test environment: local Supabase/PostgreSQL 17 and GitHub Ubuntu; no hosted
  project or production data

## Requirement results

| Requirement | Frozen evidence | Result |
| --- | --- | --- |
| Five public tables plus private aggregate allocator exist | migration/catalog and `DB16-RLS-*` | Pending |
| All six tables force RLS; ACL is default deny | catalog/ACL and negative role paths | Pending |
| Ledger update/delete is blocked | `DB16-APP-*`, runtime zero-side-effect checks | Pending |
| Definition fingerprint equals canonical payload schema SHA-256 | definition catalog and fingerprint test | Pending |
| Event/outbox is atomic and one-to-one | `DB16-EVT-*`, fault-injection manifest | Pending |
| Replay is idempotent and conflicting input fails closed | pgTAP/runtime counts and stable error | Pending |
| Same-aggregate concurrency produces continuous unique sequence | 16-worker synchronized manifest | Pending |
| Different aggregates allocate independently | concurrency manifest | Pending |
| Causation and correlation agree | `DB16-TRC-*`, root/child runtime | Pending |
| Request/correlation use transaction-local database context | trace GUC catalog/runtime | Pending |
| Errors are stable and contain no raw database details | `DB16-ERR-*`, frontend compatibility | Pending |
| Only active super_admin receives aggregate metrics | real-JWT/stale-JWT matrix | Pending |
| Metrics match the field allow-list and contain no row detail | response key manifest | Pending |
| Sensitive payload keys are recursively rejected | pgTAP/runtime synthetic canaries | Pending |
| Secrets and PII are absent from public evidence | count-only scans | Pending |

## Automated evidence

| Gate | Minimum | Exact result | Evidence | State |
| --- | ---: | ---: | --- | --- |
| WBS 1.6 pgTAP | 72 | Pending | sanitized test summary | Pending |
| Full pgTAP regression | 126 | Pending | sanitized test summary | Pending |
| Observability runtime | 28 | Pending | sanitized JSON summary | Pending |
| Frontend Vitest regression | 58 | Pending | sanitized test summary | Pending |
| Dependency audit | 0 high-severity vulnerabilities | Pending | fixed audit summary | Pending |
| Lint / typecheck / build | all success | Pending | Quality job steps | Pending |

### Concurrency and atomicity manifest

- Worker count: `16`
- Same aggregate committed event count: `Pending`
- Same aggregate committed sequence set: `Pending` (must be exactly `1..16`)
- Same-key committed event/outbox count: `Pending` (must be `1 / 1`)
- Different aggregate sequence sets: `Pending`
- Controlled outbox fault event/outbox/sequence side effects: `Pending`
- Deadlock or raw error: `Pending`

Record only aggregate IDs made from synthetic UUIDs, counts, booleans, and
sequence arrays. Do not attach worker stdout/stderr or database status.

### Public-log secret and PII scan

| Pattern class | Push | Pull request |
| --- | ---: | ---: |
| `sb_secret_`-shaped value | Pending | Pending |
| JWT-shaped value | Pending | Pending |
| Credential label followed by a value | Pending | Pending |
| Serialized `SECRET_KEY` value | Pending | Pending |
| Non-synthetic email/phone/ID/document/invitation value | Pending | Pending |

Every final count must be `0`. Pattern labels and verifier source are not
credential values; scans must count values without reproducing matches.

## Manual review

- Migration/RLS/ACL/function search path and grants: Pending
- Append-only trigger and schema-fingerprint review: Pending
- Idempotency fingerprint and lock-order review: Pending
- Causation/correlation and safe error review: Pending
- Runtime local-only/no-raw-output review: Pending
- Frontend `correlation_id`, `FunctionsHttpError.context.json()`, safe UUID,
  and non-JSON fallback review: Pending
- WBS 1.6 scope exclusion review: Pending

## Review dispositions

- Agent 1 security/data review: Pending
- Agent 2 frontend correlation review: Pending
- Agent 3 quality/runtime review: Pending
- Third-party supervisor disposition: Pending
- Agent 0 independent verification: Pending
- Protected merge authorization: Pending
- Squash merge and exact resulting `main` Quality: Pending

The evidence-tail commit containing the completed record cannot self-reference.
After it is pushed, independently bind its exact SHA to the remote branch tip,
PR head, successful push Quality, and successful PR Quality. WBS 1.6 remains
incomplete until the protected merge, exact `main` Quality, progress update,
and required checkpoint are complete.
