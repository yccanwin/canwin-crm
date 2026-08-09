# WBS 1.5 third-party supervisor review package template

## Review target

- Repository: `https://github.com/yccanwin/canwin-crm`
- Branch: Pending
- Pull request: Pending
- WBS item: `1.5 Auth, invitations, members, and primary department`
- Exact reviewed implementation SHA: Pending
- Branch-tip Quality run: Pending
- Required disposition: `PASS`, `FAIL`, or `CONDITIONAL`

The supervisor reviews the exact implementation SHA. A successful run from an
older commit does not count. No reviewer should request or record a database
password, secret/service-role key, JWT, invitation link/token, real employee
email, customer data, document content, or unmasked hosted project reference.

## Scope

The review covers invite-only Auth configuration, membership and department
constraints, invitation state and acceptance, WBS 1.5 table RLS/grants,
privileged database code, the invite Edge Function boundary, mobile login and
session recovery, safe `return_to`, static checks, full pgTAP, and Real-JWT runtime evidence.

It does not approve full AC-12 responsibility transfer, WBS 1.6 audit/events,
business-domain RLS, Storage, production SMTP, production invitations, Team OS
entry switching, or the overall Gate 1 exit.

## Requirement traceability

| Requirement | FED / ADR / WBS source | Test IDs | Evidence | Disposition |
| --- | --- | --- | --- | --- |
| One primary department | FED D-03; ADR-0002; WBS 1.5 | DB-01, DB-02 | Pending | Pending |
| Authoritative membership authorization | ADR-0003; ADR-0006 | DB-05 through DB-10 | Pending | Pending |
| Controlled invitation lifecycle | WBS 1.5 | AUTH-01 through AUTH-03 | Pending | Pending |
| Edge completion envelope and delivery status | WBS 1.5 | AUTH-06 | Pending | Pending |
| Old JWT denied after member/department disable | ADR-0003; AC-12 foundation | DB-08, AUTH-04, AUTH-05 | Pending | Pending |
| Independent mobile login/session recovery | ADR-0006; WBS 1.5 | WEB-01 through WEB-07 | Pending | Pending |
| Safe `return_to` | ADR-0006 | WEB-04, WEB-05 | Pending | Pending |
| Secret and evidence boundary | ADR-0003 | SEC-01 through SEC-03 | Pending | Pending |

## Evidence index

- Acceptance evidence record: Pending
- Migration and hash: Pending
- Full pgTAP TAP report, 54 planned assertions, and exit code: Pending
- Real-JWT runtime manifest, sanitized JSON, and 43 executed assertions: Pending
- Live local Edge Function start and invitation response envelope/status: Pending
- Frontend test and mobile-width evidence: Pending
- RLS/grant/function catalog assertions: Pending
- Static verifier, dependency audit, and secret scan: Pending
- Exact-SHA push and pull-request Quality URLs: Pending
- Agent 1 direct review: Pending
- Agent 2 client-flow review: Pending

## Required reviewer checks

- [ ] The exact SHA equals the remote feature-branch tip.
- [ ] The Quality run is successful for that exact SHA.
- [ ] Global public signup is disabled, while the email provider remains enabled for invited-member password login; callbacks are exact and local.
- [ ] Each active member has exactly one non-null primary department.
- [ ] Anonymous, sales, department-manager, super-administrator, cross-department, and disabled-member paths match the frozen matrix.
- [ ] Forged user metadata cannot affect authorization.
- [ ] WBS 1.5 public tables use forced RLS and least-privilege grants.
- [ ] Privileged functions use a fixed search path, revoke default execution, and re-check the caller.
- [ ] Wrong-user, wrong-email, expired, revoked, and replayed invitations have zero unauthorized side effects.
- [ ] Edge delivery does not report success unless the completion envelope has `ok === true` and database status `sent`; failed delivery requires `delivery_failed`.
- [ ] Hosted Edge reads plural publishable/secret dictionaries; single-key fallback is possible only for localhost CLI, and the implicit local origin is exactly `http://127.0.0.1:4173`.
- [ ] An access token issued before member disable cannot read WBS 1.5 data afterward.
- [ ] Malicious external `return_to` values fail closed.
- [ ] Frontend and evidence contain no secret/service-role key, JWT, invitation token, or real data.
- [ ] Team OS 3.0 is outside the diff.
- [ ] Full AC-12 and Gate 1 are not prematurely represented as passed.
- [ ] The required `quality` job itself starts the complete local Supabase stack, runs the full pgTAP suite without a file selector, serves the real Edge Function, and runs the Real-JWT runtime verifier.

## Findings

| ID | Severity (`P0`/`P1`) | Finding | Owner | Due date | Retest evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Pending | Pending | Pending | Pending | Pending | Pending | Pending |

Any open P0 or P1 blocks `PASS`. `CONDITIONAL` does not count as formal WBS
completion unless every stated condition is closed and the exact affected
regression set is rerun.

## Supervisor disposition

- Reviewer / organization: Pending
- Review date and timezone: Pending
- Exact reviewed implementation SHA: Pending
- Disposition (`PASS`, `FAIL`, or `CONDITIONAL`): Pending
- Blocking findings: Pending
- Non-blocking findings: Pending
- Signature or immutable review reference: Pending

## Agent 0 independent verification

- Verified reviewer identity/reference: Pending
- Verified exact implementation SHA and branch tip: Pending
- Verified supervisor-only tail diff, if any: Pending
- Verified exact-SHA Quality results: Pending
- Verified all P0/P1 findings closed: Pending
- Final WBS 1.5 acceptance decision: Pending

If the supervisor disposition is committed as a documentation-only tail commit,
record both the implementation SHA and the supervisor-tail SHA. Agent 0 must
verify that the tail changes only the review record and must require a new green
Quality run for the tail SHA.
