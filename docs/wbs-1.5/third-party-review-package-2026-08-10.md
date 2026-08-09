# WBS 1.5 unified third-party supervisor review package

Status: **Supervisor disposition recorded (PASS). Awaiting Agent 0
independent verification and user-authorized protected merge.**

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
- Documentation-content tail SHA:
  `65ef06a199ee4709a31a953b1a3dc1069b88aec3`
- Documentation-content push Quality:
  [31327837731 / job 93281017732](https://github.com/yccanwin/canwin-crm/actions/runs/31327837731/job/93281017732)
- Documentation-content PR Quality:
  [31327839946 / job 93281024833](https://github.com/yccanwin/canwin-crm/actions/runs/31327839946/job/93281024833)
- Current evidence-binding tail SHA and Quality: read from the current PR head;
  this package cannot self-reference the commit that records the immutable
  links above. The supervisor must record that SHA in the disposition.
- Required supervisor disposition: `PASS`, `FAIL`, or `CONDITIONAL`

The supervisor reviews the exact implementation SHA and its evidence chain. A
green run from an older SHA is not evidence. Do not request or record a key,
JWT, invitation link/token, real employee email, customer data, document
content, database password, or unmasked hosted project reference.

The current binding tail may differ from the documentation-content SHA only by
documentation that binds the immutable run links above. It must itself have
green push and PR `quality` runs before review begins.

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

- [ ] Remote branch tip and PR head are the same current evidence-binding tail
  SHA, and both of that SHA's push and PR `quality` runs are successful.
- [ ] The implementation ancestor is exactly
  `2563911b6cbb2253f470d4341d1048d740f487f1`, the documentation-content ancestor
  is exactly `65ef06a199ee4709a31a953b1a3dc1069b88aec3`, and the binding-tail diff is
  documentation only.
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

- Reviewer / organization: WorkBuddy AI supervisor, engaged by the CanWin CRM
  project owner (yccanwin / Qi Jie) as the independent reviewer for the WBS
  1.5 acceptance gate.
- Review date and timezone: 2026-08-10 03:10 Asia/Shanghai (UTC+8)
- Exact reviewed implementation SHA:
  `2563911b6cbb2253f470d4341d1048d740f487f1` (verified ancestor of the PR head)
- Exact reviewed documentation-tail SHA:
  `65ef06a199ee4709a31a953b1a3dc1069b88aec3` (verified ancestor of the PR head)
- Evidence-binding PR head SHA:
  `cc865663109ff16a654fcbe50934a6206efc5581` (equals remote branch tip and PR
  head after a fresh fetch)
- Disposition (`PASS`, `FAIL`, or `CONDITIONAL`): **PASS**
- Blocking findings: None.
- Non-blocking findings:
  1. Supabase CLI was upgraded from `2.109.1` (WBS 1.4) to `2.112.0`; the
     pinned version and lockfile stay consistent and `verify:supabase` passes
     in CI. No action required.
  2. The 51 frontend tests include 24 parameterized `return_to` regression
     cases; the CI run reports 5 files / 51 tests passed. WEB-04/WEB-05
     coverage is direct and confirmed in the CI log.
- Signature or immutable review reference: Supervisor disposition recorded
  directly in this file by the reviewer on 2026-08-10; commit and Quality runs
  recorded after this tail is pushed. Independent verification of this
  disposition by Agent 0 remains required before acceptance.

### Supervisor verification performed (independent, 2026-08-10)

1. Remote branch tip and PR head are the same SHA
   `cc865663109ff16a654fcbe50934a6206efc5581`; its push Quality
   `31328095401` and PR Quality `31328098029` both completed success.
2. Implementation ancestor `2563911b` and documentation-content ancestor
   `65ef06a` are both ancestors of the head; the binding-tail diff
   (`65ef06a..cc86566`) touches only two documentation files
   (`acceptance-evidence` and this package).
3. Push and PR Quality are successful for the implementation SHA
   (`31327172530`, `31327174437`) and the documentation tail
   (`31327837731`, `31327839946`), all with matching head SHAs.
4. Public signup disabled (`enable_signup = false` global) while the email
   provider stays enabled for invited members; local callback
   `http://127.0.0.1:4173` is the exact allowed local origin.
5. Each member has `primary_department_id bigint not null`, `auth_user_id`
   is unique, and membership creation is restricted so a second membership
   cannot bypass the one-primary-department rule.
6. Anonymous, sales, department-manager, super-administrator,
   cross-department, restricted/disabled-member, and inactive-department
   paths are covered by `0012` pgTAP (17 assertions) and the runtime scope
   list ("authoritative roles and departments", "stale JWT denial",
   "inactive-department stale JWT denial").
7. Authorization derives from live database member/department state; forged
   user metadata and stale JWT claims are not trusted (ADR-0003/0006,
   runtime denial evidence).
8. All WBS 1.5 public tables (`departments`, `members`, `member_profiles`,
   `member_invitations`) have `ENABLE` + `FORCE ROW LEVEL SECURITY`; default
   grants revoked from `public`/`anon`/`authenticated` and least-privilege
   grants applied.
9. 11 `SECURITY DEFINER` functions fix `search_path = ''`, revoke default
   execution, and re-check the live caller; `app_private` execution revoked
   and the two public privileged entry points revoked from `anon`.
10. Invitation lifecycle: unique code, unique `auth_user_id`, idempotency
    key, one-open-email and one-sent-auth-user partial unique indexes;
    wrong-user/expired/revoked/replay paths covered by `0011` pgTAP
    (14 assertions) and runtime replay/wrong-user rejection.
11. Edge completion envelope requires `ok === true` and status `sent`; a
    provider failure is persisted as `delivery_failed` before returning
    502, otherwise 500 `INVITATION_DELIVERY_STATE_FAILED`.
12. Edge uses hosted plural key dictionaries with a localhost-only single-key
    fallback; `CANWIN_APP_ORIGINS` origin allow-list; the implicit local
    origin is exactly `http://127.0.0.1:4173`.
13. Old JWTs are denied protected access after member disable and after
    primary-department disable (runtime scopes, `0012`).
14. WEB-01..WEB-06 covered by the 51-test suite (5 files / 51 tests passed
    in CI log).
15. The 360px record (`apps/web/evidence/auth-mobile.html` +
    `mobile-viewport-evidence-2026-08-10.md`) proves login, invitation
    error/progress, logout, and post-logout login have no horizontal
    overflow at `360 x 800`; identities are synthetic.
16. `return_to` fails closed: length limit, control characters, backslash,
    protocol-relative `//`, absolute origins, query/hash, and credentials
    all rejected; only `/` is allowed (24 parameterized regression tests).
17. Public evidence secret scan: 0 matches for credential patterns in
    `docs/wbs-1.5`; CI credential-suppression proof passed (`exit 19`,
    `secret_exposed=false`, `raw_log_mode_0600`, raw log removed); the
    `sb_secret_`-shaped grep hit is a count-table label, not a secret.
18. Team OS 3.0 is outside this repository diff (all 50 PR files are within
    `yccanwin/canwin-crm`).
19. Full AC-12, Gate 1, production operations, and later mobile scope are
    explicitly excluded from this review and not represented as passed.

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
