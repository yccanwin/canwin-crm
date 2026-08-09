# Database test boundary

WBS 1.4 reserves this directory for migration, RLS, RPC, Storage, and database
contract tests. Business-schema tests arrive with their owning WBS item.

Every exposed table introduced later must have both authorized and denied-path
tests. Local tests use synthetic data only and run after `supabase db reset
--local`. Hosted test execution must target the dedicated test project and may
not receive production credentials or data.
