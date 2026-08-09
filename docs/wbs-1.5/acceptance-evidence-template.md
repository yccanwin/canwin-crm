# WBS 1.5 acceptance evidence template

Status: Pending

This template records evidence for `1.5 Auth, invitations, members, and primary
department`. Its presence is not evidence that the item passed. Replace every
`Pending` value with a direct, sanitized reference before requesting review.

## Review identity

- Repository: `https://github.com/yccanwin/canwin-crm`
- Branch: Pending
- Pull request: Pending
- Exact implementation SHA: Pending
- Review date/timezone: Pending
- Test environment: local / dev / test (select one; never production by default)
- Migration filename and SHA-256: Pending

## Requirement results

| Requirement | Result | Direct evidence |
| --- | --- | --- |
| Invite-only Auth; global public signup disabled and invited-member email login enabled | Pending | Pending |
| Password and exact callback configuration | Pending | Pending |
| One Auth user, one member, one non-null primary department | Pending | Pending |
| Sales / department manager / super administrator role matrix | Pending | Pending |
| Invitation acceptance is bound, atomic, expiring, and replay safe | Pending | Pending |
| Edge delivery completion requires both transport success and an explicit successful business envelope/status | Pending | Pending |
| Hosted Edge uses plural key dictionaries; official single-key fallback is localhost-only; local origin is fixed | Pending | Pending |
| Public tables use forced RLS and least-privilege grants | Pending | Pending |
| Privileged functions are hardened and do not trust user metadata | Pending | Pending |
| Disabled membership denies an old Real-JWT access token | Pending | Pending |
| Login, logout, invite acceptance, session recovery, and safe `return_to` | Pending | Pending |
| No service-role key, invitation token, JWT, or real personal data is exposed | Pending | Pending |

## Automated evidence

- Static Auth contract (`npm run verify:auth`) command/output: Pending
- Complete local Supabase start and environment identity: Pending
- Full pgTAP (`npx supabase test db --local`) TAP output, exit code, and result against the current 54-assertion plan: Pending
- Live Edge/Auth runtime (`functions serve --no-verify-jwt` then `npm run verify:auth:runtime`) sanitized JSON result and result against the current 43-assertion suite: Pending
- Frontend unit/integration test report and result against the current 28-test suite: Pending
- Production build command/output: Pending
- Mobile-width login/invitation evidence: Pending
- Dependency audit and secret scan: Pending
- Branch-tip push Quality run: Pending
- Exact-SHA pull-request Quality run: Pending

The Real-JWT evidence must obtain tokens from local or dedicated test Supabase
Auth. Setting PostgreSQL request claims alone is useful unit coverage but does
not satisfy the black-box requirement. Evidence must not contain tokens, email
links, project secrets, unmasked hosted project references, or real employee
data.

## Manual inspection

- Migration review, including RLS, grants, function privileges, and search path: Pending
- Frontend authorization review (the client presents server state; it does not infer roles): Pending
- Invite Edge Function secret and caller-validation review: Pending
- Hosted plural-key dictionaries, localhost-only official CLI fallback, and fixed local origin review: Pending
- Invite Edge Function completion-envelope and `sent` / `delivery_failed` state review: Pending
- Diff scan proving Team OS 3.0 is untouched: Pending
- Open P0/P1 findings: Pending

## Known limitations

- Full AC-12 transfer blocking, atomic business-responsibility transfer, and
  historical actor verification remain dependent on WBS 4.2, 5.1, and 5.6.
- The reusable audit, domain-event, outbox, request-ID, and observability base is
  WBS 1.6. WBS 1.5 does not complete Gate 1 by itself.
- Production SMTP, hosted Auth redirect configuration, and production user
  invitations require separate user authorization and are not proven by local
  Inbucket evidence.
- Team OS entry switching and its rollback belong to WBS 8.2 through 8.4.

## Review dispositions

- Agent 1 direct security review: Pending
- Agent 2 client-flow review: Pending
- Third-party supervisor disposition: Pending
- Agent 0 independent verification: Pending
- Merge authorization and main-branch Quality result: Pending

WBS 1.5 may be marked complete only when all required rows have direct evidence,
the exact reviewed SHA has green required checks, all required reviews are
complete, and no P0/P1 finding remains open.
