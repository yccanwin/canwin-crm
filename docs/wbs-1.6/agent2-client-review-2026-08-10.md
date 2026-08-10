# WBS 1.6 Agent 2 client compatibility final review

## Disposition

**PASS — no open Agent 2 client blocker.**

This disposition is limited to the WBS 1.6 browser-client compatibility slice
at the exact implementation SHA below. It confirms safe trace-envelope parsing
and WBS 1.5 Auth-flow compatibility; it does not approve the database/runtime
implementation, third-party supervision, protected merge, or resulting `main`.

## Review identity

- Repository: `https://github.com/yccanwin/canwin-crm`
- Pull request: [#11](https://github.com/yccanwin/canwin-crm/pull/11)
- Exact reviewed implementation SHA:
  `0bf6fb8a5dbee32c6a727c4dff6473d24b22bdbc`
- Push Quality run / job:
  [31348278773 / 93334226055](https://github.com/yccanwin/canwin-crm/actions/runs/31348278773/job/93334226055)
- Pull-request Quality run / job:
  [31348280529 / 93334231275](https://github.com/yccanwin/canwin-crm/actions/runs/31348280529/job/93334231275)
- Review date/timezone: 2026-08-10, Asia/Shanghai
- Review method: exact-commit static inspection of the Auth types, adapter,
  error normalizer, existing AuthProvider/page consumers, and client test
  definitions. Agent 2 did not rerun tests for this review.

The cited run and job identifiers are the exact-SHA Quality evidence references
for this implementation. Independent remote-tip, PR-head, evidence-tail, merge,
and resulting-`main` verification remains an Agent 0 gate.

## Client contract results

| Requirement | Result | Direct evidence |
| --- | --- | --- |
| Validate `request_id` and `correlation_id` as safe UUIDs | **PASS** | `apps/web/src/auth/auth-types.ts` adds only the optional `correlation_id` field. `apps/web/src/auth/auth-errors.ts` accepts trace identifiers only through the canonical UUID validator, including valid version and variant nibbles; invalid, overlong, or control-character values are discarded. |
| Parse a stable RPC error envelope | **PASS** | `apps/web/src/auth/auth-adapter.ts` extracts only a stable business code and validated trace identifiers from the frozen error envelope. Malformed fields cannot become client authority or user-visible raw text. |
| Parse `FunctionsHttpError` JSON safely | **PASS** | The adapter reads the Edge Function body through `FunctionsHttpError.context.json()` and applies the same stable-envelope and UUID validation path. It does not forward the provider object or body verbatim. |
| Fail closed for malformed or non-JSON Edge responses | **PASS** | Missing, malformed, or non-JSON bodies degrade to the stable `UNEXPECTED` client error with no accepted trace identifier or raw response detail. |
| Prevent original provider/database error leakage | **PASS** | `apps/web/src/auth/auth-errors.ts` maps only known stable codes to fixed Chinese message/recovery text. Raw provider/database `message`, `safe_params`, relation/constraint detail, stack text, and unknown fields are not copied into the normalized error. |
| Preserve WBS 1.5 AuthProvider and page behavior | **PASS** | Existing adapter rejections still pass through `normalizeAuthError`; login, invitation, blocked/session, and logout consumers continue to render only the stable `message` and `recovery` fields. The additive optional trace field does not change `AccessContext` or the Auth state machine. |
| Avoid client-side scope expansion | **PASS** | No new UI, route, Auth state, storage behavior, console/log output, observability RPC, or locally inferred role/capability was introduced. Trace identifiers remain transient error metadata and are not rendered, persisted, or logged. |

## Exact 60-test client scope

The exact implementation contains **60 Vitest cases** across the existing
frontend suite:

| Test file | Cases | Scope |
| --- | ---: | --- |
| `apps/web/src/App.test.tsx` | 13 | WBS 1.5 login, invitation, loading, session-event, capability, and logout regression |
| `apps/web/src/auth/auth-adapter.test.ts` | 9 | Existing Auth/Edge contracts plus success-envelope compatibility, validated RPC/Edge trace metadata, invalid trace rejection, and non-JSON fail-closed behavior |
| `apps/web/src/auth/auth-errors.test.ts` | 10 | Stable Chinese mappings, unknown-error fallback, valid trace retention, raw-field suppression, and invalid/overlong/control-character trace rejection |
| `apps/web/src/auth/auth-machine.test.ts` | 4 | Active, restricted, disabled, and memberless state resolution |
| `apps/web/src/auth/return-to.test.ts` | 24 | Safe protected-route restoration and malicious/control-character rejection |
| **Total** | **60** | WBS 1.5 baseline 51 plus 9 WBS 1.6 client compatibility cases |

The 60-case exact scope exceeds the frozen WBS 1.6 frontend minimum of 58.
The cited Quality runs/jobs are the execution evidence; this review does not
claim an additional local test execution by Agent 2.

## Findings

| Severity | Open findings |
| --- | --- |
| P0 | **None** |
| P1 | **None** |

## Pending governance gates

The following remain **Pending** and are not promoted by this client PASS:

1. third-party supervisor review and disposition;
2. Agent 0 independent exact-SHA and evidence-tail verification;
3. protected Squash merge authorization and execution; and
4. verification of the resulting `main` tip and its exact Quality run.

This record contains no secret, JWT, credential, invitation value, production
data, real email address, or customer identity.

## Final Agent 2 decision

- Validated request/correlation UUID handling: **PASS**
- `FunctionsHttpError` JSON and malformed/non-JSON fail-closed handling:
  **PASS**
- Raw-error non-disclosure and WBS 1.5 compatibility: **PASS**
- No UI/state/storage/log/permission expansion: **PASS**
- Exact 60-test client scope: **PASS**
- Open Agent 2 P0/P1: **none**
- Agent 2 WBS 1.6 client disposition: **PASS**
