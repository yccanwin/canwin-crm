begin;

select plan(4);

select is(
  current_setting('server_version_num')::integer / 10000,
  17,
  'local PostgreSQL major version matches config.toml'
);

select is(
  (
    select count(*)
    from pg_catalog.pg_tables
    where schemaname = 'public'
  ),
  0::bigint,
  'empty WBS 1.4 baseline has no public application tables'
);

select is(
  (
    select count(*)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'authenticated')
  ),
  0::bigint,
  'empty baseline exposes no public table grants'
);

select ok(
  to_regclass('supabase_migrations.schema_migrations') is null,
  'zero-migration baseline has no migration history table'
);

select * from finish();

rollback;
