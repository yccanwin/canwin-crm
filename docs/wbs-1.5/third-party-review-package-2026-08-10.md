# WBS 1.5 unified third-party supervisor review package

Status: **Ready for independent review after the documentation-tail CI is
green. Supervisor disposition is not yet recorded.**

## Review target

- Repository: `https://github.com/yccanwin/canwin-crm`
- Branch: `agent/wbs-1-5-auth-members`
- Pull request: [#10](https://github.com/yccanwin/canwin-crm/pull/10)
- WBS item: `1.5 Auth, invitations, members, and primary department`
- Exact reviewed implementation SHA:
  `2563911b6cbb2253f470d4341d1048d740f487f1`
- Implementation push Quality:
  [31327172530](https://github.com/yccanwin/canwin-crm/actions/runs/31327172530)
- Implementation PR Quality:
  [31327174437](https://github.com/yccanwin/canwin-crm/actions/runs/31327174437)
- Documentation-tail SHA and Quality: Pending until this package and the
  internal review records are committed and checked
- Required supervisor disposition: `PASS`, `FAIL`, or `CONDITIONAL`

The supervisor reviews the exact implementation SHA and its evidence chain. A
green run from an older SHA is not evidence. Do not request or record a key,
JWT, invitation link/token, real employee email, customer data, document
content, database password, or unmasked hosted project reference.

## Scope and explicit exclusions

Included: invite-only Auth, member/department constraints, authoritative roles,
invitation state and atomic acceptance, WBS 1.5 RLS/grants, privileged database
code, invite Edge boundary, login/session recovery, safe `return_to`, 360px
Auth-slice usability, static checks, full pgTAP, real Auth/JWT/Edge runtime,
frontend tests, build, dependency audit, and no-secret CI evidence.

Excluded: full AC-12 responsibility transfer; WBS 1.6 audit/events/outbox;
business-domain RLS; Storage/documents; Realtime; production SMTP/redirects or
real invitations; SSO/MFA/password recovery; Team OS entry switching; the
overall Gate 1 exit; and mobile coverage for future business modules.

## Requirement traceability

| Requirement | FED / ADR / WBS source | Test IDs | Evidence | Internal state; supervisor disposition |
| --- | --- | --- | --- | --- |
| One primary department | FED D-03; ADR-0002; WBS 1.5 | DB-01, DB-02 | Migration hash; pgTAP 54; acceptance requirement table | Ready; Pending |
| Authoritative membership authorization | ADR-0003; ADR-0006 | DB-03 through DB-08 | `0010`, `0012`, runtime 44, Agent 1 record | Ready; Pending |
| Controlled invitation lifecycle | WBS 1.5 | AUTH-01 through AUTH-03 | `0011`, real Edge/Auth runtime, frontend invitation states | Ready; Pending |
| Edge completion envelope and delivery status | WBS 1.5 | AUTH-06 | Edge source, static verifier, runtime manifest | Ready; Pending |
| Old JWT denied after member/department disable | ADR-0003; AC-12 foundation | DB-08, AUTH-04, AUTH-05 | `0012`; real runtime scopes for both revocation paths | Ready; Pending |
| Independent mobile login/session recovery | ADR-0006; WBS 1.5 | WEB-01 through WEB-07 | Frontend 51; mobile viewport record; Agent 2 record | Ready; Pending |
| Safe `return_to` | ADR-0006 | WEB-04, WEB-05 | Script/absolute/protocol-relative/backslash/encoded/control-character regression tests | Ready; Pending |
| Secret and evidence boundary | ADR-0003 | SEC-01 through SEC-03 | Linux suppression probe; two public-log scans; env verifier | Ready; Pending |

## Evidence index

- Acceptance record:
  `docs/wbs-1.5/acceptance-evidence-2026-08-10.md`
- Frozen role/tests/scope contract:
  `docs/wbs-1.5/role-tests-and-scope-boundaries.md`
- Mobile evidence:
  `docs/wbs-1.5/mobile-viewport-evidence-2026-08-10.md`
- Migration and SHA-256: acceptance record Review identity
- Database tests: `supabase/tests/0010_wbs_1_5_auth_schema.sql`,
  `0011_wbs_1_5_invitation_acceptance.sql`, and
  `0012_wbs_1_5_roles_and_stale_jwt.sql`
- Real runtime: `scripts/verify-auth-runtime.mjs`
- Static/suppression gates: `scripts/verify-auth-contract.mjs` and
  `scripts/verify-ci-credential-suppression.mjs`
- Invite function: `supabase/functions/invite-member/index.ts`
- Frontend Auth and evidence fixture: `apps/web/src/auth/`,
  `apps/web/src/pages/`, and `apps/web/evidence/auth-mobile.html`
- Exact-SHA push Quality:
  [run 31327172530 / job 93279287838](https://github.com/yccanwin/canwin-crm/actions/runs/31327172530/job/93279287838)
- Exact-SHA PR Quality:
  [run 31327174437 / job 93279293286](https://github.com/yccanwin/canwin-crm/actions/runs/31327174437/job/93279293286)
- Agent 1 review:
  `docs/wbs-1.5/agent1-final-review-2026-08-10.md`
- Agent 2 review:
  `docs/wbs-1.5/agent2-client-flow-review-2026-08-10.md`
- Agent 3 review:
  `docs/wbs-1.5/agent3-quality-review-2026-08-10.md`

## Required supervisor checks

- [ ] Remote branch tip and PR head are the recorded documentation-tail SHA.
- [ ] The implementation ancestor is exactly
  `2563911b6cbb2253f470d4341d1048d740f487f1` and the tail diff is documentation
  only.
- [ ] Push and PR `quality` runs are successful for both the implementation
  SHA and current documentation-tail SHA.
- [ ] Public signup is disabled while invited-member password login and the
  exact local callback remain enabled.
- [ ] Each member has one non-null primary department and cannot create a
  second membership to bypass that constraint.
- [ ] Anonymous, sales, department-manager, super-administrator,
  cross-department, restricted/disabled-member, and inactive-department paths
  match the frozen matrix.
- [ ] Forged user metadata changes no authorization result.
- [ ] All WBS 1.5 public tables force RLS and use least-privilege grants.
- [ ] Privileged functions fix their search path, revoke default execution,
  and re-check the live caller.
- [ ] Wrong-user/email, expired, inactive/revoked, and replayed invitations
  have zero unauthorized side effects.
- [ ] Edge success requires `ok === true` and status `sent`; provider failure
  is persisted as `delivery_failed`.
- [ ] Hosted Edge uses plural key dictionaries; single-key fallback is
  localhost-only; the implicit local origin is exactly
  `http://127.0.0.1:4173`.
- [ ] Old tokens lose protected table/RPC access after member disable and after
  primary-department disable.
- [ ] WEB-01 through WEB-06 are directly covered by the 51-test suite.
- [ ] The 360px record proves login, invitation error/progress, logout, and
  post-logout login have no horizontal overflow.
- [ ] External/script/control-character `return_to` values fail closed.
- [ ] Public evidence contains no secret/service-role key, JWT, invitation
  token/link, real email, customer data, or raw credential-bearing log.
- [ ] Team OS 3.0 is outside the repository diff and was not touched.
- [ ] Full AC-12, Gate 1, production operations, and later mobile scope are not
  prematurely represented as passed.

## Findings

| ID | Severity (`P0`/`P1`) | Finding | Owner | Due date | Retest evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| None reported internally | N/A | No open P0/P1 after internal review; supervisor must independently confirm | N/A | N/A | Evidence index above | Awaiting supervisor |

Any open P0 or P1 blocks `PASS`. `CONDITIONAL` is not formal completion until
all conditions close and the affected regression set reruns on the exact
resulting SHA.

## Supervisor disposition

Complete this section without adding secrets or real data:

- Reviewer / organization: Pending
- Review date and timezone: Pending
- Exact reviewed implementation SHA: Pending
- Exact reviewed documentation-tail SHA: Pending
- Disposition (`PASS`, `FAIL`, or `CONDITIONAL`): Pending
- Blocking findings: Pending
- Non-blocking findings: Pending
- Signature or immutable review reference: Pending

## Agent 0 independent verification

- Verified reviewer identity/reference: Pending
- Verified implementation SHA and ancestry: Pending
- Verified documentation/supervisor-only tail diff: Pending
- Verified exact-SHA push and PR Quality results: Pending
- Verified all P0/P1 findings closed: Pending
- Final WBS 1.5 acceptance decision: Pending

If the supervisor disposition is added as another documentation-only tail,
record the implementation SHA, evidence-tail SHA, and supervisor-tail SHA. The
new tail must have green push and PR Quality runs before Agent 0 may request
protected merge authorization.
