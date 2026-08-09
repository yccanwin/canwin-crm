# WBS 1.5 Agent 2 client-flow final review

## Disposition

**PASS — no open Agent 2 client-flow blocker.**

The reviewed implementation closes both previously reported findings:

- `A2-P1-01` required client-state regression coverage: **CLOSED**
- `A2-P1-02` direct 360-pixel Auth-flow evidence: **CLOSED**

This PASS is limited to the WBS 1.5 frontend Auth slice and the evidence bound
below. It does not approve later CRM business screens, production invitations,
Team OS routing, or the overall Gate 1 exit.

## Review identity

- Repository: `https://github.com/yccanwin/canwin-crm`
- Branch: `agent/wbs-1-5-auth-members`
- Pull request: [#10](https://github.com/yccanwin/canwin-crm/pull/10)
- Exact reviewed implementation SHA:
  `2563911b6cbb2253f470d4341d1048d740f487f1`
- Push Quality run:
  [31327172530](https://github.com/yccanwin/canwin-crm/actions/runs/31327172530)
- Push Quality job:
  [93279287838](https://github.com/yccanwin/canwin-crm/actions/runs/31327172530/job/93279287838)
- Pull-request Quality run:
  [31327174437](https://github.com/yccanwin/canwin-crm/actions/runs/31327174437)
- Pull-request Quality job:
  [93279293286](https://github.com/yccanwin/canwin-crm/actions/runs/31327174437/job/93279293286)
- Review date/timezone: 2026-08-10, Asia/Shanghai
- Review method: exact-commit static inspection, test-definition inventory,
  GitHub run/job metadata inspection, and independent inspection of the
  sanitized mobile viewport evidence record. No test was rerun by Agent 2.

Both GitHub runs were independently queried during this review:

| Run | Job | Event | Head SHA | Status | Conclusion |
| --- | --- | --- | --- | --- | --- |
| `31327172530` | `93279287838` | `push` | `2563911b6cbb2253f470d4341d1048d740f487f1` | `completed` | `success` |
| `31327174437` | `93279293286` | `pull_request` | `2563911b6cbb2253f470d4341d1048d740f487f1` | `completed` | `success` |

The PR run's structured job metadata also reports `success` for Auth contract,
database/Auth tests, Real-Auth verification, lint, typecheck, frontend test,
and production build steps. Full downloadable logs were unavailable to this
reviewer credential (`HTTP 403`), so the 51-test count below was independently
reconstructed from the exact commit rather than inferred from a run number.

## Security and client-authority boundary

The client remains default-deny and presents server authority rather than
inventing it:

- `apps/web/src/auth/auth-adapter.ts:102-111` first verifies identity with
  `auth.getUser()` and then unwraps the server `get_my_auth_context` envelope.
- `apps/web/src/auth/auth-machine.ts:21-45` requires a live active member,
  active primary department, and allowed `can_access_crm` capability before
  rendering protected UI.
- `apps/web/src/pages/HomePage.tsx:15-22,72-120` gates invitation UI and each
  target role on separate server capabilities.
- `apps/web/src/auth/auth-adapter.ts:168-190` accepts only the browser
  publishable-key contract. No service-role/secret key is present in the
  frontend path.
- No reviewed frontend authorization decision reads `user_metadata`.

## Exact 51-test inventory

The exact implementation contains **51 executed Vitest cases**:

| Test file | Cases | Direct scope |
| --- | ---: | --- |
| `apps/web/src/App.test.tsx` | 13 | unresolved loading, login, credential error, invitation success/failures, invite capability controls, auth-change failures, explicit logout |
| `apps/web/src/auth/auth-adapter.test.ts` | 4 | Auth-context envelope, invitation RPC parameter, Edge invite body/idempotency key, local-scope sign-out |
| `apps/web/src/auth/auth-errors.test.ts` | 6 | credential, network, three invitation mappings, unknown backend code |
| `apps/web/src/auth/auth-machine.test.ts` | 4 | active, restricted, disabled, and memberless invite/blocked states |
| `apps/web/src/auth/return-to.test.ts` | 24 | thirteen unsafe/script targets, ten raw/encoded control-character targets, one allowed store/consume path |
| **Total** | **51** | Exact static expansion of normal and parameterized tests. |

The PR Quality job's `Test` step is `success`; the same exact-SHA job also has
successful lint, typecheck, and build steps.

## WEB-01 through WEB-07 result

| ID | Result | Direct evidence |
| --- | --- | --- |
| WEB-01 | **PASS** | `apps/web/src/App.test.tsx:13-31` holds `getAuthenticatedUser()` unresolved, directly asserts the loading heading is visible and the protected workbench is absent, then releases identity resolution and proves the workbench appears. `apps/web/src/auth/auth-machine.ts:4-8` and `apps/web/src/App.tsx:47-55` preserve the loading-first implementation. |
| WEB-02 | **PASS** | `apps/web/src/App.test.tsx:34-61` covers independent active-member login and safe invalid-credential recovery without raw provider text. `apps/web/src/auth/auth-machine.test.ts:5-37` covers active, restricted, disabled, and missing-member invite/blocked resolution. |
| WEB-03 | **PASS** | `apps/web/src/App.test.tsx:63-96` covers valid invitation acceptance plus expired, already-used, and wrong-account UI recovery. `apps/web/src/auth/auth-errors.test.ts:18-48` independently verifies stable Chinese code/message/recovery mappings and raw-provider suppression. `apps/web/src/auth/auth-errors.ts:19-39,94-100` maps the real backend invitation codes to safe client states. |
| WEB-04 | **PASS within WBS 1.5 route scope** | `apps/web/src/App.tsx:25-44` stores a protected target before login and consumes it only after successful authorization. `apps/web/src/auth/return-to.ts:47-48` explicitly allowlists only `/`, the sole protected WBS 1.5 route, and the store/consume regression remains in `apps/web/src/auth/return-to.test.ts:48-53`. |
| WEB-05 | **PASS** | `apps/web/src/auth/return-to.test.ts:15-46` directly covers absolute, protocol-relative, encoded external, backslash, multiple script-scheme/casing/encoding inputs, and raw plus encoded NUL/tab/newline/carriage-return/DEL characters. `apps/web/src/auth/return-to.ts:20-48` rejects control characters before and after decoding and fails all non-allowlisted targets closed to `/`. |
| WEB-06 | **PASS** | `apps/web/src/App.test.tsx:141-180` directly covers `SIGNED_OUT`, failed `TOKEN_REFRESHED`, failed `USER_UPDATED`, protected-state clearing, return to login, stable expired-session message, and explicit local logout. `apps/web/src/auth/AuthProvider.tsx:33-52,62-73,128-142` clears sensitive state and removes protected context on these paths. |
| WEB-07 | **PASS** | `docs/wbs-1.5/mobile-viewport-evidence-2026-08-10.md` binds a real `360 x 800` Chromium capture to the exact implementation SHA and records the login, invitation/error/progress, active workbench, logout, and post-logout measurements listed below. |

## A2-P1-01 closure

`A2-P1-01` is **CLOSED** because all previously missing direct client assertions
now exist at the exact reviewed SHA:

1. unresolved loading proves no protected-content flash;
2. expired, already-used, and wrong-account invitation states use stable safe
   Chinese mappings and are exercised through the real page flow;
3. script schemes plus raw and encoded control characters fail closed; and
4. `SIGNED_OUT`, failed `TOKEN_REFRESHED`, and failed `USER_UPDATED` events
   clear protected state and return to independent login.

The changes are not test-only veneers: the corresponding production
`AuthProvider`, error normalizer, and `return_to` sanitizer were reviewed and
match the assertions.

## A2-P1-02 closure and 360-pixel measurements

`A2-P1-02` is **CLOSED** by
`docs/wbs-1.5/mobile-viewport-evidence-2026-08-10.md`.

The record is bound to the exact implementation SHA, states an explicit
`360 x 800` CSS viewport, uses the acceptance rule
`document.documentElement.scrollWidth <= window.innerWidth`, and records:

| State | `innerWidth` | `scrollWidth` | Interaction/visibility result |
| --- | ---: | ---: | --- |
| Independent login | 360 | 360 | Email, password, and login button visible and inside viewport |
| Login submit progress | 360 | 360 | Actual button changed to `正在验证…`; flow reached workbench |
| Invitation form | 360 | 360 | Both password inputs and submit action visible and usable |
| Invitation validation error | 360 | 360 | Actual mismatch alert visible and inside viewport |
| Invitation submit progress | 360 | 360 | Actual button changed to `正在激活…` and remained in viewport |
| Active workbench | 360 | 345 | Actual logout action visible and inside viewport |
| Post-logout login | 360 | 360 | Actual login page rendered without horizontal overflow |

All measured widths satisfy the no-horizontal-overflow predicate. The evidence
also records that inspected controls and messages remained visible and usable,
not merely that the document width happened to fit.

### Evidence fixture integrity

The exact SHA's evidence fixture is suitable for this scoped capture:

- `apps/web/evidence/auth-mobile.html:1-12` is a separate Vite evidence entry.
- `apps/web/src/evidence/auth-mobile.tsx:1-8,144-155` imports and renders the
  production `LoginPage`, `InviteAcceptPage`, `HomePage`, `AuthContext`, and
  production stylesheet.
- `apps/web/src/evidence/auth-mobile.tsx:57-80` supports only
  `login|invite|home` scenarios.
- `apps/web/src/evidence/auth-mobile.tsx:95-137` makes real page controls expose
  login progress, invitation validation/progress, and home-to-login logout.
- IDs and displayed identities are synthetic; the fixture does not call
  Supabase or deliver an invitation.
- Production `apps/web/src/main.tsx` does not import the evidence fixture, and
  `scripts/verify-auth-contract.mjs` enforces that separation and the reviewed
  synthetic UUID namespace.

No real email, invitation token/link, JWT, key, hosted project reference,
employee identity, customer data, or document content appears in the mobile
evidence record.

## Explicit scope and deferred boundary

- This review closes WEB-07 only for WBS 1.5 login, invitation acceptance, and
  logout. Full mobile coverage for later CRM business modules remains
  **WBS 7.4**.
- Future protected business routes must be added to and tested in the explicit
  `return_to` allowlist when those routes are introduced; this PASS approves
  only the current `/` protected route.
- Full AC-12 responsibility transfer remains WBS 4.2, 5.1, and 5.6.
- Reusable audit, domain events, outbox, request/correlation IDs, and
  observability remain WBS 1.6.
- Production SMTP, hosted Auth redirect configuration, production invitation
  delivery, SSO, MFA, password recovery, business tables, Realtime, Storage,
  and Team OS entry switching remain outside WBS 1.5.

## Remaining process gates, not Agent 2 findings

There is no open Agent 2 P0/P1. The evidence and review documents are a
documentation tail outside the implementation SHA. Before formal WBS 1.5
completion, Agent 0 must still:

1. ensure the tail changes only sanitized review/evidence records;
2. bind the documentation-tail SHA to a new successful Quality run;
3. obtain the independent third-party supervisor disposition; and
4. verify that no supervisor P0/P1 remains open before merge/final acceptance.

These are required governance gates but are not defects in the reviewed
frontend implementation.

## Final Agent 2 decision

- Client architecture and Supabase browser boundary: **PASS**
- Exact 51-test client suite: **PASS**
- WEB-01 through WEB-07: **PASS**
- `A2-P1-01`: **CLOSED**
- `A2-P1-02`: **CLOSED**
- New Agent 2 blocker: **none**
- Agent 2 WBS 1.5 client-flow disposition: **PASS**
