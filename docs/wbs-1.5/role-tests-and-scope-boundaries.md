# WBS 1.5 role tests and scope boundaries

Status: acceptance contract; no test result is implied by this document.

## Authoritative model

Supabase Auth proves identity. Current database membership proves authorization.
Role and primary department must not be read from user-editable metadata. Every
member has one stable member record and exactly one non-null primary department;
membership status changes do not delete that record.

The least-privilege role contract for WBS 1.5 is:

| Actor | Department visibility | Member/profile visibility | Invitation visibility and creation |
| --- | --- | --- | --- |
| Anonymous | None | None | None |
| Auth user without accepted membership | None | None | May only attempt its bound invitation acceptance |
| Active sales | Own primary department | Self only | None |
| Active department manager | Own primary department | Own department | Own department, assignable sales role only |
| Active super administrator | All departments | All members | All departments and assignable roles |
| Restricted or disabled member | None | Minimal safe denial context only | None |

Authenticated clients receive no direct insert, update, or delete grant on the
four WBS 1.5 tables. Writes use controlled functions that derive the actor from
`auth.uid()` and re-check live membership. Client-side role names are display
data, never an authorization boundary.

## Required database and Real-JWT tests

| ID | Required assertion |
| --- | --- |
| DB-01 | Member/Auth user uniqueness, non-null primary department, foreign keys, and delete restrictions hold. |
| DB-02 | All WBS 1.5 public tables enable and force RLS; anon has no table or function access. |
| DB-03 | Sales can read only self and own department context and cannot mutate role, department, or status. |
| DB-04 | MA can manage only department A sales; MB has the symmetric boundary; neither can cross departments or assign super admin. |
| DB-05 | SA has only the explicitly documented cross-department authority. |
| DB-06 | Forged `user_metadata` role or department values do not change any result. |
| DB-07 | Privileged functions have a fixed empty search path, no PUBLIC/anon execute, and validate the caller. |
| DB-08 | UPDATE policies, if any, include both `USING` and `WITH CHECK`; exposed views, if any, use `security_invoker`. |
| AUTH-01 | Public signup fails; a server-authorized invite appears in local Inbucket without exposing its token. |
| AUTH-02 | Bound, confirmed, unexpired invitation acceptance creates exactly one member/profile in the invited department and role. |
| AUTH-03 | Wrong user/email, expired, revoked, inactive-department, existing-member, and replay cases fail with zero unauthorized writes. |
| AUTH-04 | A token obtained while active loses all WBS 1.5 table/RPC access immediately after database membership is disabled. |
| AUTH-05 | A token obtained while the department is active loses WBS 1.5 access after that primary department becomes inactive. |
| AUTH-06 | Edge delivery returns success only when the completion RPC returns `ok === true` and status `sent`; provider failure must be persisted as `delivery_failed`. |
| AUTH-07 | Hosted Edge requires plural key dictionaries; official single-key variables are accepted only against localhost, and the default local allowed origin is exactly `http://127.0.0.1:4173`. |

pgTAP may set request claims for deterministic policy unit tests. AUTH-01 through
AUTH-05 additionally require a black-box run that obtains a real token from the
local or dedicated test Auth service and calls the Data API/RPC boundary.

The required GitHub `quality` job must start the complete local Supabase stack,
run the complete pgTAP directory (not a selected SQL file), obtain local keys
from `supabase status`, serve the real invite Edge Function, and run the
Real-JWT verifier through that Edge endpoint. The current baselines are 54
planned pgTAP assertions, 44 Real-JWT runtime assertions, and 51 frontend
unit/integration tests; these numbers describe the suites to be evidenced and
do not claim an unrecorded run passed.

## Required client tests

| ID | Required assertion |
| --- | --- |
| WEB-01 | Initial loading never flashes protected content before session and profile checks finish. |
| WEB-02 | Valid active-member login succeeds; invalid credentials, missing membership, and disabled membership show safe recovery states. |
| WEB-03 | Invite acceptance covers valid, expired, reused, and wrong-account states. |
| WEB-04 | A protected deep link survives refresh/login and returns only after successful authorization. |
| WEB-05 | Absolute, protocol-relative, backslash, script-scheme, encoded external, and control-character `return_to` inputs fail closed. |
| WEB-06 | Logout, refresh failure, and signed-out/auth-change events clear protected state and route to login. |
| WEB-07 | Login, invite acceptance, and logout remain usable at a 360-pixel viewport without horizontal overflow. |

The mobile-width evidence entrypoints are
`apps/web/evidence/auth-mobile.html` and
`apps/web/src/evidence/auth-mobile.tsx`. The evidence entrypoint must reuse the
production `LoginPage`, `InviteAcceptPage`, `HomePage`, and `AuthContext`, and
must support the `login`, `invite`, and `home` scenarios. All UUID literals in
the fixture must remain in the reviewed synthetic UUID namespace. Production
`main.tsx` must not import the evidence fixture, so the fixture cannot become a
production authentication path. The fixture's presence is not visual evidence
by itself; the 360-pixel browser capture and inspection remain separately
required.

Stable application errors use `{code, message_key, safe_params, request_id}` or
an equivalent safe client mapping. Raw database/Auth errors, secrets, tokens,
and invitation links must not be rendered, logged, or preserved as evidence.

## Deliberate boundaries

- WBS 1.5 establishes live member status and the future responsibility-check
  extension point. It does not complete AC-12's opportunity/customer transfer,
  atomic batch rollback, or historical business-actor proof; those depend on
  WBS 4.2, 5.1, and 5.6.
- WBS 1.6 owns the reusable default-deny RLS framework, append-only audit,
  domain events, outbox, request/correlation IDs, and observability. WBS 1.5
  still protects every table and privileged function it creates.
- WBS 8 owns hosted CRM entry, Team OS routing, unavailable-page behavior, and
  production rollback. WBS 1.5 owns only independent login and safe local
  return-path handling.
- Business tables, Realtime, Storage, documents, SSO, MFA, password recovery,
  production SMTP, and production invitations are outside this item.

Local Inbucket is sufficient to prove the development invitation path. Changing
hosted Auth/SMTP configuration or sending a real invitation is an external
operation and requires the project's user-authorization process.
