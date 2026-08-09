# Migration directory contract

Create every migration from the repository root with:

```powershell
npm.cmd exec -- supabase migration new -- <descriptive_name>
```

The CLI owns the timestamped filename. Review generated SQL, dependencies,
transaction behavior, grants, exposed-schema RLS, and rollback impact before
commit. Once a migration has reached any hosted environment, it is immutable:
do not edit, rename, delete, or reorder it. Corrections use a later forward
migration following expand/contract where compatibility is needed.

The static gate accepts only `YYYYMMDDHHMMSS_snake_case.sql`, requires unique
strictly increasing timestamps, and rejects other files except this README and
the existing placeholder.
