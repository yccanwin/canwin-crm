# WBS 1.5 acceptance evidence — technical gates passed, external review pending

Status: **Technical implementation, exact-SHA quality gates, and the immutable
documentation-content tail passed; third-party supervisor, Agent 0 final
acceptance, merge, and main CI pending.**

## Review identity

- Repository: `https://github.com/yccanwin/canwin-crm`
- Branch: `agent/wbs-1-5-auth-members`
- Pull request: [#10](https://github.com/yccanwin/canwin-crm/pull/10)
- Exact implementation SHA: `2563911b6cbb2253f470d4341d1048d740f487f1`
- Documentation-content tail SHA:
  `65ef06a199ee4709a31a953b1a3dc1069b88aec3`
- Documentation-content push Quality:
  [31327837731 / job 93281017732](https://github.com/yccanwin/canwin-crm/actions/runs/31327837731/job/93281017732)
- Documentation-content PR Quality:
  [31327839946 / job 93281024833](https://github.com/yccanwin/canwin-crm/actions/runs/31327839946/job/93281024833)
- Evidence-binding tail SHA: the commit containing these immutable links cannot
  self-reference. The supervisor must copy the current PR-head SHA into the
  disposition and verify its push and PR Quality before issuing a decision.
- Review date/timezone: `2026-08-10`, Asia/Shanghai (UTC+8)
- Test environment: local Windows development plus GitHub-hosted Ubuntu CI;
  no production or hosted CRM project was changed
- Migration: `supabase/migrations/20260809095731_wbs_1_5_auth_members.sql`
- Migration SHA-256:
  `CA8AE8F01099A4B86FFBBD3FA6466326A59153C2BE76A489D5B957F35E742A68`

## Requirement results

| Requirement | Result | Direct evidence |
| --- | --- | --- |
| Invite-only Auth; public signup disabled and invited-member email login enabled | PASS | `supabase/config.toml`; `supabase/tests/0010_wbs_1_5_auth_schema.sql`; full pgTAP and Real-JWT runs below |
| Password and exact callback configuration | PASS | Local callback is restricted to `http://127.0.0.1:4173/invite/accept`; config/static verifier and live invitation runtime passed |
| One Auth user, one member, one non-null primary department | PASS | Migration constraints plus DB-01/02 in the 54-assertion pgTAP suite |
| Sales / department manager / super administrator role matrix | PASS | `supabase/tests/0012_wbs_1_5_roles_and_stale_jwt.sql`; protected-table and RPC role assertions passed |
| Invitation acceptance is bound, atomic, expiring, and replay safe | PASS | `0011_wbs_1_5_invitation_acceptance.sql` and the 44-assertion real Auth/Edge runtime |
| Edge completion requires transport success and explicit successful business status | PASS | `supabase/functions/invite-member/index.ts`, static Auth verifier, and live Edge/runtime success |
| Hosted plural key dictionaries; localhost-only single-key fallback; fixed local origin | PASS | Edge source/static verifier; exact-SHA CI served the real function with runtime-only environment data |
| Public tables use forced RLS and least-privilege grants | PASS | Migration catalog assertions in `0010` and Agent 1 security review |
| Privileged functions are hardened and do not trust user metadata | PASS | Fixed empty search path, revoked default execution, live caller checks, forged metadata tests |
| Old JWT is denied after member or primary-department disable | PASS | `0012` plus real runtime scopes `stale JWT denial` and `inactive-department stale JWT denial` |
| Login, logout, invite acceptance, session recovery, safe `return_to`, and mobile Auth slice | PASS | 51 frontend tests and `mobile-viewport-evidence-2026-08-10.md` |
| No service-role/secret key, invitation token, JWT, or real personal data is exposed | PASS | Environment verifier; credential-suppression probe; count-only public-log scans below |

## Automated evidence

### Exact-SHA GitHub Quality

| Trigger | Run | Job | Head | Result |
| --- | --- | --- | --- | --- |
| Push | [31327172530](https://github.com/yccanwin/canwin-crm/actions/runs/31327172530) | [93279287838](https://github.com/yccanwin/canwin-crm/actions/runs/31327172530/job/93279287838) | `2563911b6cbb2253f470d4341d1048d740f487f1` | PASS |
| Pull request | [31327174437](https://github.com/yccanwin/canwin-crm/actions/runs/31327174437) | [93279293286](https://github.com/yccanwin/canwin-crm/actions/runs/31327174437/job/93279293286) | `2563911b6cbb2253f470d4341d1048d740f487f1` | PASS |

Both required jobs are named `quality`; locked installation, high-severity
audit, scaffold, environment, Supabase, Auth, credential suppression, full
local database, real Edge/Auth, lint, typecheck, frontend tests, build, and all
post/complete steps succeeded.

### Documentation-content tail Quality

| Trigger | Run | Job | Head | Result |
| --- | --- | --- | --- | --- |
| Push | [31327837731](https://github.com/yccanwin/canwin-crm/actions/runs/31327837731) | [93281017732](https://github.com/yccanwin/canwin-crm/actions/runs/31327837731/job/93281017732) | `65ef06a199ee4709a31a953b1a3dc1069b88aec3` | PASS |
| Pull request | [31327839946](https://github.com/yccanwin/canwin-crm/actions/runs/31327839946) | [93281024833](https://github.com/yccanwin/canwin-crm/actions/runs/31327839946/job/93281024833) | `65ef06a199ee4709a31a953b1a3dc1069b88aec3` | PASS |

Both documentation-content jobs repeated the full Quality workflow. Sanitized
inspection confirmed pgTAP `54`, real Auth/Edge `44`, frontend `51`, Linux
`raw_log_mode_0600=true` with `posix-verified`, successful build and audit, and
zero matches in all four public-log secret-pattern classes.

### Sanitized results

- `npm.cmd run check`: exit `0`; scaffold, environment, quality configuration,
  Supabase baseline, Auth contract, credential suppression, lint, typecheck,
  tests, and production build passed locally.
- `npm.cmd audit --audit-level=high`: exit `0`; `0` vulnerabilities.
- Linux credential-suppression probe on both exact-SHA runs: controlled child
  exit `19`, `secret_exposed=false`, `raw_log_mode_0600=true`,
  `mode_verification=posix-verified`, and `raw_log_removed=true`.
- Complete local Supabase stack: fixed safe startup success message observed;
  raw startup/status/Edge logs were not replayed or uploaded.
- Full pgTAP: `Files=4`, `Tests=54`, result PASS.
- Real Auth/Edge runtime: `44` assertions, PASS, including real password
  sessions, invitation delivery/acceptance, replay/wrong-user rejection, live
  member and department revocation, and local sign out.
- Frontend Vitest: `5` files and `51` tests passed on both exact-SHA runs.
- Production Vite build: PASS; the production entry remains `index.html` and
  does not import the evidence fixture.
- Mobile Auth slice: `360 x 800`; login, invitation validation and submit
  progress, workbench logout, and post-logout login all remained usable with
  `scrollWidth <= 360`. See
  `docs/wbs-1.5/mobile-viewport-evidence-2026-08-10.md`.

### Public-log credential scan

Both exact-SHA public job logs were processed count-only; no matching value is
reproduced here.

| Pattern class | Push | Pull request |
| --- | ---: | ---: |
| `sb_secret_`-shaped value | 0 | 0 |
| JWT-shaped value | 0 | 0 |
| Supabase secret/service-role/JWT/S3 credential label with a value | 0 | 0 |
| Serialized `SECRET_KEY` status value | 0 | 0 |

Older runs that exposed ephemeral runner-local Supabase startup values are
explicitly excluded from acceptance evidence. They did not contain hosted
dev/test/prod credentials, but they do not satisfy this item's no-secret
evidence rule.

## Manual inspection

- Migration/RLS/grants/function privileges/search path: Agent 1 completed an
  exact-SHA review and recorded PASS with no open P0/P1 findings in
  `agent1-final-review-2026-08-10.md`.
- Frontend authorization: pages present server capabilities and never infer
  authority from editable metadata.
- Invite Edge: caller `getUser`, plural dictionaries, localhost-only fallback,
  exact local origin, and completion `ok/status` envelope were reviewed.
- Client findings A2-P1-01 and A2-P1-02 were closed by the 51-test suite and
  direct 360px evidence; Agent 2 completed an exact-SHA re-review and recorded
  PASS in `agent2-client-flow-review-2026-08-10.md`.
- `origin/main...2563911` changes only the standalone CRM repository. Team OS
  3.0 is outside this repository and was not modified, migrated, linked, or
  switched.
- Agent 3 independently bound the sanitized Quality evidence to the same SHA
  and recorded PASS in `agent3-quality-review-2026-08-10.md`.
- Open implementation P0/P1 findings: none across the three completed internal
  review records. The third-party and Agent 0 dispositions remain required.

## Known limitations

- Full AC-12 responsibility transfer and historical actor proof remain WBS
  4.2, 5.1, and 5.6.
- Reusable audit, domain events, outbox, request IDs, and observability remain
  WBS 1.6; this item alone does not complete Gate 1.
- Production SMTP, hosted redirect configuration, and real invitations require
  separate user authorization and are not proven here.
- Full mobile coverage for later business modules remains WBS 7.4.
- Team OS entry switching and rollback remain WBS 8.2 through 8.4.

## Review dispositions

- Agent 1 direct security review: PASS; no open P0/P1
- Agent 2 client-flow review: PASS; A2-P1-01/02 closed; no open P0/P1
- Agent 3 quality review: PASS; no open P0/P1
- Documentation-content tail Quality: PASS at `65ef06a`; current
  evidence-binding tail Quality remains a handoff prerequisite
- Third-party supervisor disposition: Pending
- Agent 0 independent verification: Pending
- Merge authorization and main-branch Quality: Pending

WBS 1.5 remains incomplete until all reviews are recorded, the
documentation/supervisor tails have exact-SHA green checks, no P0/P1 remains,
the user authorizes protected merge, and the resulting `main` Quality run is
successful.
