begin;

select plan(20);

select is(
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('departments', 'members', 'member_profiles', 'member_invitations')),
  4::bigint,
  'WBS 1.5 creates the four auth and membership tables'
);

select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('departments', 'members', 'member_profiles', 'member_invitations') and c.relrowsecurity and c.relforcerowsecurity),
  4::bigint,
  'all exposed WBS 1.5 tables enable and force RLS'
);

select is(
  (select count(*) from information_schema.role_table_grants where table_schema = 'public' and table_name in ('departments', 'members', 'member_profiles', 'member_invitations') and grantee = 'anon'),
  0::bigint,
  'anon has no table grant'
);

select is(
  (select count(*) from information_schema.role_table_grants where table_schema = 'public' and table_name in ('departments', 'members', 'member_profiles', 'member_invitations') and grantee = 'authenticated' and privilege_type = 'SELECT'),
  4::bigint,
  'authenticated receives SELECT only through RLS on all four tables'
);

select is(
  (select count(*) from information_schema.role_table_grants where table_schema = 'public' and table_name in ('departments', 'members', 'member_profiles', 'member_invitations') and grantee = 'authenticated' and privilege_type <> 'SELECT'),
  0::bigint,
  'authenticated receives no direct write grant'
);

select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.members'::regclass and contype = 'u' and pg_get_constraintdef(oid) like 'UNIQUE (auth_user_id)%'),
  'auth user maps to at most one member'
);

select ok(
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'members' and column_name = 'primary_department_id' and is_nullable = 'NO'),
  'every member has exactly one non-null primary department'
);

select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.members'::regclass and conname = 'members_role_check'),
  'member role is constrained'
);

select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.members'::regclass and conname = 'members_status_check'),
  'member status is constrained'
);

select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.member_invitations'::regclass and conname = 'member_invitations_target_role_check'),
  'invitation target role is constrained'
);

select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'member_invitations_one_open_email_idx' and indexdef like '%WHERE (status = ANY%'),
  'only one open invitation is allowed per normalized email'
);

select is(
  (
    select count(*)
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f'
      and c.connamespace = 'public'::regnamespace
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid and a.attnum = any(i.indkey)
      )
  ),
  0::bigint,
  'all WBS 1.5 foreign key columns are indexed'
);

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('prepare_member_invitation', 'complete_member_invitation_delivery', 'get_my_auth_context', 'accept_my_invitation') and p.prosecdef),
  0::bigint,
  'all public RPC wrappers are security invoker'
);

select ok(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app_private' and p.prosecdef) >= 10,
  'privileged authority functions live in app_private'
);

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app_private' and p.prosecdef and position('search_path=' in array_to_string(p.proconfig, ',')) = 0),
  0::bigint,
  'every private security definer fixes its search path'
);

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'app_private') and p.prokind in ('f', 'p') and (lower(coalesce(p.prosrc, '')) like '%user_metadata%' or lower(coalesce(p.prosrc, '')) like '%raw_user_meta_data%')),
  0::bigint,
  'authorization functions never reference user-editable metadata'
);

select ok(
  not has_function_privilege('anon', 'public.accept_my_invitation(uuid)', 'EXECUTE'),
  'anon cannot accept an invitation'
);

select ok(
  has_function_privilege('authenticated', 'public.accept_my_invitation(uuid)', 'EXECUTE'),
  'authenticated users may call the guarded acceptance RPC'
);

select ok(
  not has_function_privilege('authenticated', 'public.complete_member_invitation_delivery(uuid,uuid,boolean,text)', 'EXECUTE'),
  'authenticated users cannot complete delivery'
);

select ok(
  not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'member_invitations' and column_name like '%token%'),
  'application invitation storage contains no raw token column'
);

select * from finish();
rollback;
