# CanWin CRM

CanWin CRM is a new, independent, mobile-first internal sales system. It does
not reuse or migrate Team OS 3.0 sales data. Team OS integration is limited to
a configurable first-level entry and the legacy `/sales` redirect after the
CRM passes its release gates.

> Status: WBS 1.1 application scaffold. No production environment, Supabase
> project, authentication, business schema or customer data is connected yet.

## Repository layout

```text
apps/web/          React + TypeScript + Vite client
supabase/          Backend migration, function and test boundaries
scripts/           Repository verification commands
docs/wbs-1.1/      WBS 1.1 acceptance evidence
```

## Local prerequisites

- Node.js `24.14.x`
- Git `2.53` or newer
- Windows PowerShell is the currently verified development shell

The local repository is stored on the D drive and is separate from both the
ChatGPT project mirror and the Team OS repository.

## Install and verify on Windows

PowerShell blocks `npm.ps1` on the current workstation. Use the standard
Windows executable `npm.cmd`; this does not change the machine execution policy.

```powershell
npm.cmd install
npm.cmd run verify:scaffold
npm.cmd run typecheck
npm.cmd run build
```

## Local development

```powershell
npm.cmd run dev
```

The Vite development server is local-only by default. Do not expose it to the
LAN, internet or an external tunnel without user approval.

## Security and environment boundary

- Never commit `.env`, access tokens, Supabase service-role keys, customer
  contact details, document files or production identifiers.
- Only example environment files with placeholders may be committed.
- Supabase environment creation, migrations, Auth and RLS start in later WBS
  items and require their own evidence and approvals.
- The browser must never receive service-role or external-channel secrets.

Environment templates are split by execution boundary:

- `apps/web/.env.development.example`, `.env.test.example` and
  `.env.production.example` contain public browser configuration only.
- `supabase/functions/.env.example` documents server-only placeholders and must
  never be copied into `apps/web`.
- Real local files use `.local` suffixes and remain ignored by Git. Hosted test
  and production values must be injected through the platform secret store.

Validate the boundary before every commit:

```powershell
npm.cmd run verify:env
```

See `docs/environment-and-secrets.md` for the dev/test/prod matrix, ownership,
rotation and incident response rules.

## License

Original CanWin CRM materials are proprietary and restricted to authorized
internal use. See `LICENSE` and `NOTICE.md`. Third-party packages retain their
own license terms.
