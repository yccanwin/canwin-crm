# CanWin CRM environment and secrets policy

Status: WBS 1.2 policy and placeholder contract only. This document does not
create a Supabase project, issue a key, or authorize a deployment.

Normative references verified on 2026-08-09:

- [Understanding API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Migrating to publishable and secret API keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)
- [Edge Function environment variables](https://supabase.com/docs/guides/functions/secrets)

## Non-negotiable environment separation

Development, test, and production must be three independent Supabase projects.
They must not share a project reference, database, Storage bucket, Auth tenant,
publishable key, secret key, legacy key, CI secret, or service account. Promotion
means applying reviewed code and migrations to the next project; it never means
copying a database or key set between environments.

Test uses synthetic data only. Production records, user identifiers, uploaded
files, tokens, and database dumps are prohibited in both development and test,
including when values have merely been masked rather than generated.

## Configuration matrix

| Environment | Supabase boundary | Allowed data | Browser configuration | Server / Edge Function configuration | Injection and access | Accountable owner |
| --- | --- | --- | --- | --- | --- | --- |
| `dev` | Dedicated development project and dev-only keys | Synthetic fixtures and developer-generated records | `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the dev project | Dev `SUPABASE_SECRET_KEYS` JSON dictionary only when a reviewed backend function requires elevated access | Developer-local untracked files or dev-scoped CI secrets; backend maintainers may access dev secrets | Backend Lead; individual developers own their local copies |
| `test` | Dedicated test project and test-only keys | Synthetic, resettable automated-test data only | Test project values injected into the test build | Test `SUPABASE_SECRET_KEYS` JSON dictionary, isolated from dev and prod | Protected test CI environment; QA can trigger tests but cannot read high-privilege values | QA Lead for data; DevOps/Security for secret custody |
| `prod` | Dedicated production project and prod-only keys | Approved live customer and operational data | Production project values injected only into the production build | Production `SUPABASE_SECRET_KEYS` JSON dictionary, one named key per backend component where practical | Protected production deployment environment with approval and least-privilege operator access | Service Owner is accountable; DevOps/Security are custodians |

Every deployment must fail closed when its expected environment identifier and
project URL do not match the selected deployment environment. No fallback may
silently select another environment's values.

## Configuration classification

### Public configuration

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` containing a new `sb_publishable_...` key
- `SUPABASE_URL` and publishable-key material where used by controlled backend
  tooling

All `VITE_*` variables are public. Vite embeds them in browser bundles; users can
recover them from source maps, JavaScript, or network traffic. A publishable key
identifies the client but does not authorize rows by itself, so exposed schemas
still require deny-by-default RLS policies. Public classification means safe to
disclose, not safe to use as a substitute for authorization.

### Sensitive operational configuration

- CI/CD access tokens and deployment credentials
- Supabase Management API tokens
- database connection strings and passwords
- webhook signing secrets, third-party API tokens, and private Auth signing
  material

These values stay in an approved local or hosted secret store. They must be
masked in logs and restricted by environment and job.

### High-privilege configuration

- `SUPABASE_SECRET_KEYS`, whose values are named `sb_secret_...` keys
- any individually injected `sb_secret_...` key
- legacy `SUPABASE_SERVICE_ROLE_KEY` / `service_role` keys during a time-bounded
  migration only

Secret keys and legacy `service_role` keys provide elevated access and bypass
RLS. They are server-only, may never appear in `VITE_*`, browser code, mobile or
desktop bundles, URLs, query strings, client-visible responses, screenshots, or
logs. The legacy `anon` and `service_role` JWT keys remain compatibility options,
but new CanWin CRM implementation must default to publishable and secret keys.

## Variable contract

- The web client reads `VITE_SUPABASE_PUBLISHABLE_KEY`. It must contain only the
  environment's publishable `sb_publishable_...` key.
- Supabase Edge Functions receive `SUPABASE_SECRET_KEYS` as a JSON dictionary
  keyed by key name. Function code selects the approved named entry; it must not
  assume the variable itself is a single key string.
- `SUPABASE_PUBLISHABLE_KEYS` is likewise a JSON dictionary in Edge Functions.
- `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` may be documented for
  legacy migration compatibility, but must not be introduced as the default for
  new code.
- `.env.example` files contain obvious placeholders only. A populated `.env`
  file is local/secret-store material and must never be committed.

## Storage and injection

1. **Hosted runtime:** store Edge Function secrets in the target environment's
   Supabase secret facility. Never paste production values into dev or test.
2. **CI/CD:** use protected, environment-scoped secret variables. Deployment jobs
   receive only the target environment's values, only for the job lifetime.
   Mask output, disable shell tracing around injection, and prevent secret-bearing
   artifacts, caches, and logs from being retained.
3. **Local frontend:** use an ignored developer-local environment file for the
   dev publishable key. No server secret is permitted, even for localhost.
4. **Local Edge Functions:** use an ignored local secrets file populated with dev
   values only. The checked-in `supabase/functions/.env.example` is a contract,
   not a source for runnable credentials.
5. **Pull requests:** untrusted/forked PR jobs receive no secrets. Static checks
   and unit tests must run without production or high-privilege values.

## Rotation procedure

The Service Owner sets the rotation schedule; DevOps/Security execute and record
rotations, and the Backend Lead validates consumers.

1. Inventory the named key, environment, consumers, owner, creation date, and
   last-used evidence without recording the key value.
2. Create a replacement key in the same environment with a distinct name. A key
   must never be copied from another environment.
3. Update the environment-scoped secret store, deploy consumers, and verify
   expected access plus denied-access tests.
4. Confirm the old key has no remaining consumers or recent use, then deactivate
   or delete it according to the provider workflow.
5. Record completion, validation evidence, and the next rotation date.

Use one named secret key per backend component where practical so it can be
rotated independently. Legacy key migration follows the same staged cutover, but
the destination is a new `sb_secret_...` key rather than another legacy default.

## Suspected leak response

1. Treat the event as an incident; notify the Service Owner and Security owner
   immediately. Do not paste the suspected value into chat or a ticket.
2. Stop further exposure: disable affected deployments/artifacts or access paths,
   preserve sanitized evidence, and identify the exact environment and key name.
3. Create and deploy a replacement to known-good consumers, validate it, then
   revoke/delete the compromised key. For a high-privilege key, assume data access
   was possible even if RLS was enabled.
4. Review Supabase/database/auth/storage and CI logs for misuse; invalidate any
   derivative credentials or sessions when applicable.
5. Remove the value from code, artifacts, caches, logs, and shared systems. Git
   history cleanup alone is not remediation because existing clones retain it.
6. Document scope, timeline, impact, root cause, corrective actions, and follow-up
   monitoring without reproducing the secret.

## Responsibilities

| Role | Responsibility |
| --- | --- |
| Service Owner | Accountable for production access, rotation policy, incident severity, and exception approval |
| Backend Lead | Defines each server consumer, selects named keys, and verifies authorization and denied-access behavior |
| Frontend Lead | Ensures browser builds use only `VITE_SUPABASE_PUBLISHABLE_KEY` and contain no sensitive values |
| DevOps/Security | Custodies CI/runtime secrets, controls deployment environments, performs rotation/revocation, and audits access |
| QA Lead | Guarantees test automation uses the isolated test project and synthetic data only |
| Developers | Keep local values untracked, use dev-only credentials, and report suspected exposure immediately |

Exceptions require written approval from the Service Owner and Security owner,
an expiry date, compensating controls, and a removal ticket. Compatibility alone
is not approval to begin a new implementation with legacy keys.

## Prohibited actions

- Committing, hard-coding, logging, screenshotting, or messaging any sensitive or
  high-privilege value.
- Putting `SUPABASE_SECRET_KEYS`, `sb_secret_...`, `service_role`, database
  passwords, or management tokens in any `VITE_*` variable.
- Reusing a Supabase project or any key across dev, test, and prod.
- Using production data, dumps, accounts, uploads, or tokens in dev/test.
- Giving secrets to forked PRs, browser tests, client bundles, build artifacts,
  source maps, or persistent CI caches.
- Using the legacy `anon` or `service_role` keys as the default for new code.
- Falling back to another environment when configuration is missing.
- Creating real values in `.env.example` or treating placeholders as usable
  credentials.
