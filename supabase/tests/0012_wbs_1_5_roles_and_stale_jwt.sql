begin;

select plan(17);

insert into public.departments (id, code, name, status)
overriding system value
values
  (1201, 'roles-a', 'Roles Department A', 'active'),
  (1202, 'roles-b', 'Roles Department B', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000',
  user_id,
  'authenticated',
  'authenticated',
  email,
  '',
  now(), now(), now(), '{}', '{}', '', '', '', ''
from (
  values
    ('00000000-0000-4000-8000-000000001201'::uuid, 'sa@example.test'),
    ('00000000-0000-4000-8000-000000001202'::uuid, 'manager-a@example.test'),
    ('00000000-0000-4000-8000-000000001203'::uuid, 'sales-a@example.test'),
    ('00000000-0000-4000-8000-000000001204'::uuid, 'sales-b@example.test'),
    ('00000000-0000-4000-8000-000000001205'::uuid, 'disabled-a@example.test')
) as users(user_id, email);

insert into auth.sessions (id, user_id, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000001201', '00000000-0000-4000-8000-000000001201', now(), now()),
  ('10000000-0000-4000-8000-000000001202', '00000000-0000-4000-8000-000000001202', now(), now()),
  ('10000000-0000-4000-8000-000000001203', '00000000-0000-4000-8000-000000001203', now(), now()),
  ('10000000-0000-4000-8000-000000001204', '00000000-0000-4000-8000-000000001204', now(), now()),
  ('10000000-0000-4000-8000-000000001205', '00000000-0000-4000-8000-000000001205', now(), now());

insert into public.members (id, auth_user_id, primary_department_id, role, status, accepted_at)
overriding system value
values
  (1201, '00000000-0000-4000-8000-000000001201', 1201, 'super_admin', 'active', now()),
  (1202, '00000000-0000-4000-8000-000000001202', 1201, 'department_manager', 'active', now()),
  (1203, '00000000-0000-4000-8000-000000001203', 1201, 'sales', 'active', now()),
  (1204, '00000000-0000-4000-8000-000000001204', 1202, 'sales', 'active', now()),
  (1205, '00000000-0000-4000-8000-000000001205', 1201, 'sales', 'active', now());

insert into public.member_profiles (member_id, display_name)
values
  (1201, 'Super Admin'),
  (1202, 'Manager A'),
  (1203, 'Sales A'),
  (1204, 'Sales B'),
  (1205, 'Disabled A');

insert into public.member_invitations (
  id, email_normalized, display_name, department_id, target_role, status,
  created_by_member_id, idempotency_key, created_at, expires_at
)
values (
  '30000000-0000-4000-8000-000000001201',
  'pending-a@example.test',
  'Pending A',
  1201,
  'sales',
  'pending_delivery',
  1202,
  '20000000-0000-4000-8000-000000001201',
  now(),
  now() + interval '1 day'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000001203","role":"authenticated","session_id":"10000000-0000-4000-8000-000000001203"}', true);
select is((select count(*) from public.departments), 1::bigint, 'sales sees only the primary department');
select is((select count(*) from public.members), 1::bigint, 'sales sees only their own member row');
select is((select count(*) from public.member_invitations), 0::bigint, 'sales sees no invitations');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000001202","role":"authenticated","session_id":"10000000-0000-4000-8000-000000001202"}', true);
select is((select count(*) from public.members), 4::bigint, 'department manager sees members in the same department');
select is((select count(*) from public.member_invitations), 1::bigint, 'department manager sees invitations in the same department');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000001201","role":"authenticated","session_id":"10000000-0000-4000-8000-000000001201"}', true);
select is(
  (select count(*) from public.departments where id in (1201, 1202)),
  2::bigint,
  'super admin sees all fixture departments'
);
select is(
  (select count(*) from public.members where id between 1201 and 1205),
  5::bigint,
  'super admin sees all fixture members'
);
reset role;

set local role service_role;
update public.members
set status = 'disabled',
    disabled_at = now(),
    disabled_by_member_id = 1201,
    disabled_reason = 'Synthetic stale JWT test'
where id = 1205;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000001205","role":"authenticated","session_id":"10000000-0000-4000-8000-000000001205"}', true);
select is((select count(*) from public.departments), 0::bigint, 'disabled member old JWT sees no department');
select is((select count(*) from public.members), 0::bigint, 'disabled member old JWT sees no member rows');
select is(public.get_my_auth_context() #>> '{data,capabilities,can_access_crm,reason_code}', 'MEMBERSHIP_DISABLED', 'disabled member receives only a safe disabled context');
select is(public.prepare_member_invitation('blocked@example.test', 'Blocked', 1201, 'sales', '20000000-0000-4000-8000-000000001205') #>> '{error,code}', 'MEMBERSHIP_INACTIVE', 'disabled member cannot invoke a guarded mutation');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000001204","role":"authenticated","session_id":"10000000-0000-4000-8000-000000001204","user_metadata":{"role":"super_admin","primary_department_id":1201}}', true);
select is((select count(*) from public.departments), 1::bigint, 'forged user metadata cannot expand department access');
select is((select count(*) from public.members), 1::bigint, 'forged user metadata cannot expand member access');
reset role;

set local role service_role;
update public.departments
set status = 'inactive'
where id = 1202;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000001204","role":"authenticated","session_id":"10000000-0000-4000-8000-000000001204"}', true);
select is(
  (select count(*) from public.departments)
    + (select count(*) from public.members)
    + (select count(*) from public.member_profiles)
    + (select count(*) from public.member_invitations),
  0::bigint,
  'inactive primary department makes every protected table invisible to an old JWT'
);
select is(
  public.get_my_auth_context() #>> '{data,capabilities,can_access_crm,reason_code}',
  'DEPARTMENT_INACTIVE',
  'inactive primary department is reflected by the realtime access context'
);
select is(
  public.prepare_member_invitation('inactive-department@example.test', 'Inactive Department', 1201, 'sales', '20000000-0000-4000-8000-000000001206') #>> '{error,code}',
  'MEMBERSHIP_INACTIVE',
  'inactive primary department blocks guarded mutations for an old JWT'
);
reset role;

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app_private')
      and p.prokind in ('f', 'p')
      and (lower(coalesce(p.prosrc, '')) like '%user_metadata%' or lower(coalesce(p.prosrc, '')) like '%raw_user_meta_data%')
  ),
  'no authorization function trusts user-editable metadata'
);

select * from finish();
rollback;
