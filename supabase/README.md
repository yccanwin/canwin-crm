# CanWin CRM Supabase boundary

This directory is reserved for the Supabase backend of CanWin CRM. The current
scope is **WBS 1.1 scaffolding only**: no Supabase project is connected and no
database object, migration, Edge Function, test, seed, credential, or runtime
configuration is defined here yet.

## Directory contract

- `migrations/` — reviewed SQL migrations only. Keep empty until the database
  model and security rules are approved in WBS 1.4 or later.
- `functions/` — Supabase Edge Functions and their function-local support files.
  Keep empty until a function has an approved contract, authorization model,
  and test plan.
- `tests/` — backend-focused database, RLS, and Edge Function tests. Security
  tests must accompany future access-control changes.

Do not place application frontend code, generated build artifacts, ad-hoc SQL,
database dumps, or local credentials in this directory.

## Security baseline for later WBS work

Future database work must be deny-by-default:

1. Enable RLS on every table in an exposed schema before granting Data API
   access. An enabled table with no permissive policy is the expected starting
   state.
2. Add narrowly scoped policies only after the ownership and role model is
   approved. `TO authenticated` alone is not authorization. Update policies
   require both `USING` and `WITH CHECK`, plus a compatible select policy.
3. Treat views and privileged functions as security-sensitive. Prefer
   `security_invoker`; any justified `security definer` function belongs in a
   non-exposed schema with explicit grants and authorization checks.
4. Review grants, RLS policies, storage policies, and negative tests together.
   No security migration may be introduced before WBS 1.4+ review.

## Secrets and environments

- Never commit secret keys, `service_role` keys, database passwords, access
  tokens, private keys, or populated `.env` files.
- Browser/client code may never receive a secret or `service_role` key.
- Environment setup, project references, and deployment configuration are
  intentionally out of scope for WBS 1.1.
- If examples are added later, use obvious placeholders only and document where
  operators must provide values through an approved secret store.

The placeholder files below exist only so the empty directory boundaries are
kept in source control. Replace a placeholder only when its later WBS deliverable
has been approved.
