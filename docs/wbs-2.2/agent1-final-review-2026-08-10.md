# WBS 2.2 Agent 1 final database and RLS review

- Review date and timezone: `2026-08-10`, Asia/Shanghai (UTC+8)
- Reviewer role: Agent 1 — backend, database, RLS, and sensitive-data boundary
- Repository: `yccanwin/canwin-crm`
- Branch: `agent/wbs-2-2-contact-secrets`
- Pull request: [#14](https://github.com/yccanwin/canwin-crm/pull/14)
- Reviewed implementation full SHA: `6a3f4d1105ccb8345d2ce751f593ffaafafd4b89`
- Migration SHA-256: `B7E649B3438A5630A0CDA1974C94C80CD6F78F6527C8D147481A8E6241AAA93B`
- Disposition: **PASS**
- Open P0 findings: **0**
- Open P1 findings: **0**

This review is bound to the exact implementation SHA above. This document is a
documentation-only evidence tail and is not covered by the implementation runs
listed below. Its future commit requires its own exact-head Quality evidence.

## Exact-SHA Quality evidence

| Trigger | Run | Job | Reviewed PR head | Result |
| --- | --- | --- | --- | --- |
| Push | [31405862026](https://github.com/yccanwin/canwin-crm/actions/runs/31405862026) | [93511915238](https://github.com/yccanwin/canwin-crm/actions/runs/31405862026/job/93511915238) | `6a3f4d1105ccb8345d2ce751f593ffaafafd4b89` | **PASS** |
| Pull request | [31405915945](https://github.com/yccanwin/canwin-crm/actions/runs/31405915945) | [93512096256](https://github.com/yccanwin/canwin-crm/actions/runs/31405915945/job/93512096256) | `6a3f4d1105ccb8345d2ce751f593ffaafafd4b89` (job checkout: GitHub merge-ref) | **PASS** |

Both runs completed successfully. The push job directly checked out the
implementation SHA. The pull-request job checked out GitHub's merge-ref built
from reviewed head `6a3f4d1105ccb8345d2ce751f593ffaafafd4b89` and the target base; this record
does not present the merge-ref as the implementation SHA.

## Sanitized verification counts

- Full pgTAP regression: **12 files / 393 assertions PASS**.
- WBS 2.2 pgTAP subset: **134 assertions PASS**.
- Contact access runtime: **249 assertions PASS**.
- Real Auth runtime sessions: **9**.
- Explicit revoked-session case: **1**, with stale-session access denied.

These are aggregate, sanitized counts only. This record contains no key, JWT,
password, session value, email address, contact value, customer record, raw
response, raw log, or hosted-project identifier.

## Database and RLS final verification

1. **Structural and sensitive-data separation — PASS.** `public.contacts`
   contains only the frozen non-identifying contact structure, while plaintext
   identity and channels remain isolated in `app_private.contact_secrets`.
2. **Relationship and lifecycle integrity — PASS.** Contact-to-store and
   secret-to-contact relationships use restrictive foreign keys. Required
   indexes, status constraints, audit fields, versioning, immutable identity,
   physical-delete denial, and truncate denial are present and covered.
3. **RLS and ACL boundary — PASS.** Both tables enable and force RLS. The
   private secret table has no ordinary row policy, direct Data API grant,
   service-role access, identity allocation path, or Realtime publication.
4. **Controlled plaintext exit — PASS.** The public RPC is a security-invoker
   wrapper. Privileged implementation and capability functions remain in the
   private schema, use an empty fixed `search_path`, and have explicit execution
   revocations and grants.
5. **Live authorization — PASS.** Plaintext authorization is recalculated from
   the current Auth identity, live session, member, primary department,
   account, store, and contact state. User-editable metadata and caller-supplied
   authority fields are not trusted.
6. **Default denial and safe envelope — PASS.** Ordinary roles remain denied
   until the later claimed-opportunity capability is implemented. Denied
   responses contain only the stable access result and reason code and omit all
   sensitive keys and values.
7. **Auditing and leakage boundary — PASS.** Allowed and denied reads create
   trace-bound, sanitized audit records. Only safe aggregate counts are stored;
   caller text and contact values are excluded.
8. **Scope control — PASS.** WBS 2.2 does not add the WBS 2.4 contact write
   service, a shadow claim/opportunity model, document handling, portrait
   calculation, AI access, notification access, or production operation.

## Remaining governance gates

- Third-party supervisor disposition: **Pending**.
- Agent 0 independent verification: **Pending**.
- User-authorized protected Squash merge: **Pending**.
- Resulting `main` Quality run: **Pending**.

## Conclusion

Agent 1 gives the WBS 2.2 database, RLS, ACL, sensitive-contact RPC, audit, and
scope boundary a final **PASS** at implementation SHA
`6a3f4d1105ccb8345d2ce751f593ffaafafd4b89`. No P0 or P1 finding remains open
in Agent 1 scope. This record does not authorize merge and does not declare WBS
2.2 formally complete while the remaining governance gates are Pending.
