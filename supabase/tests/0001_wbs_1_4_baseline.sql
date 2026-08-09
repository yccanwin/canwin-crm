begin;

select plan(3);

select is(
  current_setting('server_version_num')::integer / 10000,
  17,
  'local PostgreSQL major version matches config.toml'
);

select is(
  (
    select count(*)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee = 'anon'
  ),
  0::bigint,
  'application tables expose no anonymous grants'
);

select ok(
  to_regclass('supabase_migrations.schema_migrations') is not null,
  'migration history exists after the first application migration'
);

select * from finish();

rollback;
