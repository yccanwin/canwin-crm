# WBS 1.5 Agent 1 final backend, Auth, and security review

- Review date and timezone: `2026-08-10`, Asia/Shanghai (UTC+8)
- Reviewer role: Agent 1 — backend, data, Auth, and security
- Repository: `yccanwin/canwin-crm`
- Branch: `agent/wbs-1-5-auth-members`
- Pull request: [#10](https://github.com/yccanwin/canwin-crm/pull/10)
- Reviewed implementation full SHA: `2563911b6cbb2253f470d4341d1048d740f487f1`
- Frontend test baseline: `51`
- Disposition: **PASS**

This review is bound to the exact implementation SHA above. The review record
itself is a documentation tail and is not covered by the implementation runs
listed below. Its future commit must receive its own green Quality evidence and
must not be represented as the implementation SHA.

The review used the exact implementation source, the sanitized acceptance
record, the mobile viewport evidence, and the supplied exact-SHA GitHub Quality
results. No production or hosted Supabase project was changed, and no raw
credential-bearing output was reproduced.

## Exact-SHA Quality evidence

| Trigger | Run | Job | Exact head SHA | Result |
| --- | --- | --- | --- | --- |
| Push | [31327172530](https://github.com/yccanwin/canwin-crm/actions/runs/31327172530) | [93279287838](https://github.com/yccanwin/canwin-crm/actions/runs/31327172530/job/93279287838) | `2563911b6cbb2253f470d4341d1048d740f487f1` | **PASS** |
| Pull request | [31327174437](https://github.com/yccanwin/canwin-crm/actions/runs/31327174437) | [93279293286](https://github.com/yccanwin/canwin-crm/actions/runs/31327174437/job/93279293286) | `2563911b6cbb2253f470d4341d1048d740f487f1` | **PASS** |

The required `quality` job covers locked dependency installation, high-severity
dependency audit, static scaffold/environment/Supabase/Auth contracts,
credential-suppression failure-path verification, the complete local Supabase
stack, full pgTAP, live Edge/Auth runtime, lint, typecheck, all `51` frontend
tests, and the production build. The sanitized acceptance evidence records
`54` pgTAP assertions and `44` live Auth/Edge runtime assertions as passing on
the same implementation SHA.

No Supabase key, service-role value, JWT, invitation token or link, raw
startup/status/Edge log, real email address, employee identity, customer data,
or hosted project reference is included in this record.

## Backend and database security verification

1. **Authoritative member and department model — PASS.** The migration creates
   one stable member for each Auth user and requires one non-null primary
   department. Authorization is calculated from current database rows rather
   than user-editable metadata.
2. **RLS and least-privilege grants — PASS.** WBS 1.5 public tables enable and
   force RLS. Anonymous access is revoked. Authenticated users receive only the
   documented reads subject to RLS and do not receive direct table-write
   authority. Controlled service-role privileges remain limited to the
   documented backend delivery and administration paths.
3. **Privileged function boundary — PASS.** Authority helpers are kept in the
   non-exposed `app_private` schema. Required `SECURITY DEFINER` functions use
   an empty fixed `search_path`, revoke default/public execution, and re-check
   the live caller. Public RPCs remain security invokers with explicit grants.
4. **Live revocation and stale JWT denial — PASS.** An actor must have both an
   active member row and an active primary department. Tokens issued before a
   member is disabled or its department is deactivated immediately lose
   protected table and guarded-RPC access; stale JWT claims cannot restore
   authority.
5. **Bound, atomic invitation lifecycle — PASS.** Preparation enforces the
   frozen role and department matrix. Delivery binds the application
   invitation to the exact Auth user. Acceptance re-checks Auth identity,
   normalized email, expiry, department state, current membership, and
   invitation state. Member/profile creation and invitation acceptance remain
   atomic and replay safe.
6. **Edge completion envelope — PASS.** The invite Edge Function validates the
   caller through Auth, uses hosted plural publishable/secret key dictionaries,
   permits the official single-key fallback only on localhost, and applies an
   exact allowed origin. It returns success only when completion reports
   `ok === true` and `data.status === 'sent'`; a delivery or completion failure
   cannot be returned as HTTP success.
7. **Credential suppression — PASS.** Raw Supabase startup, status,
   environment, and Edge output is confined to restricted runner-temporary
   files, is not replayed or uploaded, and is cleaned on normal, failure, and
   signal exits. The controlled failure probe preserves exit code `19`, checks
   fixed safe output, proves sentinel non-exposure and cleanup, and only claims
   POSIX mode `0600` when that property is actually verified on Linux.

## Final client Auth security verification

1. **Session-refresh fail-closed behavior — PASS.** `SIGNED_IN`,
   `TOKEN_REFRESHED`, and `USER_UPDATED` events defer a fresh authenticated-user
   and server access-context lookup outside the Supabase callback. If a refresh
   lookup has no user or fails, `AuthProvider` clears protected client state,
   stores only a sanitized return target, removes the prior access context, and
   resolves to the expired signed-out state. A failed refresh therefore cannot
   continue rendering the previous protected workbench.
2. **Signed-out handling — PASS.** An unsolicited `SIGNED_OUT` event clears
   protected client state and routes back through the signed-out flow. Explicit
   logout clears the safe return target, uses local-scope Auth sign-out, and
   does not expose provider or credential details.
3. **`return_to` control-character and navigation boundary — PASS.** The client
   rejects C0/DEL control characters both before and after URL decoding. It
   also rejects decode errors, backslashes, protocol-relative or foreign-origin
   targets, credentials, query strings, fragments, script schemes, and routes
   outside the current explicit `/` allowlist. Encoded control characters
   cannot bypass the first validation layer.
4. **Invitation error mapping — PASS.** Expired, already-used/replayed, and
   wrong-account invitation failures map to stable application error codes and
   safe recovery guidance. Provider text is discarded, unknown codes collapse
   to the stable unexpected-error state, and no raw database/Auth detail is
   rendered.
5. **No client-side authority expansion — PASS.** The client presents current
   server capabilities but does not derive authority from a role label,
   `user_metadata`, or stale JWT claims. Database RLS and guarded RPCs remain
   authoritative even if client state is manipulated.

## Mobile evidence fixture isolation

- `apps/web/evidence/auth-mobile.html` and
  `apps/web/src/evidence/auth-mobile.tsx` reuse the production `LoginPage`,
  `InviteAcceptPage`, `HomePage`, `AuthContext`, and stylesheet for reproducible
  evidence only.
- The fixture is not imported by `apps/web/src/main.tsx`, is not a production
  authentication route, and the production build remains rooted at
  `index.html`. The Auth contract verifier enforces that production-entry
  separation.
- Fixture identities and UUIDs are confined to the reviewed synthetic
  namespace. It contains no real email, credential, JWT, invitation token,
  customer data, or hosted project identifier and does not call Supabase.
- Direct evidence in
  [`mobile-viewport-evidence-2026-08-10.md`](./mobile-viewport-evidence-2026-08-10.md)
  is bound to the reviewed implementation SHA and records a `360 x 800`
  viewport. Login, invitation validation, invitation submit progress, the
  active workbench, logout, and the post-logout real login page all satisfied
  `document.documentElement.scrollWidth <= window.innerWidth`.

## Findings

- Open P0 findings: **none**.
- Open P1 findings: **none**.
- Non-blocking Agent 1 findings: **none**.

## Scope boundaries and remaining gates

- This PASS covers the WBS 1.5 backend, database, Auth client boundary, invite
  Edge Function, credential-safe CI path, and the reviewed Auth evidence
  fixture at implementation SHA
  `2563911b6cbb2253f470d4341d1048d740f487f1`.
- It does not approve production SMTP or hosted invitation delivery, full
  AC-12 opportunity/customer responsibility transfer, WBS 1.6 reusable audit
  and event infrastructure, later business-domain RLS or Storage, Team OS
  entry switching, or the overall Gate 1 exit.
- Team OS 3.0 is outside this repository and remains untouched.
- WBS 1.5 is not formally complete until the documentation-tail Quality checks,
  third-party supervisor disposition, Agent 0 independent verification,
  authorized protected merge, and the resulting `main` Quality run are all
  recorded as passed.

## Conclusion

Agent 1 gives the final WBS 1.5 backend, database, Auth, Edge, credential, and
evidence-isolation boundary a **PASS** for implementation SHA
`2563911b6cbb2253f470d4341d1048d740f487f1`. The supplied push and pull-request
Quality runs are green, all `51` frontend tests are included in the recorded
quality baseline, and no P0 or P1 finding remains open in Agent 1 scope. This
record may be added to the documentation-only evidence tail; it does not by
itself authorize merge or declare WBS 1.5 complete.
