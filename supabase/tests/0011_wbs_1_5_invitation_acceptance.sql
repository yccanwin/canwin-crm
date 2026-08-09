begin;

select plan(14);

insert into public.departments (id, code, name, status)
overriding system value
values
  (1101, 'department-a', 'Department A', 'active'),
  (1102, 'department-b', 'Department B', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000001101', 'authenticated', 'authenticated', 'manager@example.test', '', now(), now(), now(), '{}', '{}', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000001102', 'authenticated', 'authenticated', 'invitee@example.test', '', now(), now(), now(), '{}', '{}', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000001103', 'authenticated', 'authenticated', 'other@example.test', '', now(), now(), now(), '{}', '{}', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000001104', 'authenticated', 'authenticated', 'rollback@example.test', '', now(), now(), now(), '{}', '{}', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000001105', 'authenticated', 'authenticated', 'expired@example.test', '', now(), now(), now(), '{}', '{}', '', '', '', '');

insert into auth.sessions (id, user_id, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000001101', '00000000-0000-4000-8000-000000001101', now(), now()),
  ('10000000-0000-4000-8000-000000001102', '00000000-0000-4000-8000-000000001102', now(), now()),
  ('10000000-0000-4000-8000-000000001103', '00000000-0000-4000-8000-000000001103', now(), now()),
  ('10000000-0000-4000-8000-000000001104', '00000000-0000-4000-8000-000000001104', now(), now()),
  ('10000000-0000-4000-8000-000000001105', '00000000-0000-4000-8000-000000001105', now(), now());

insert into public.members (id, auth_user_id, primary_department_id, role, status, accepted_at)
overriding system value
values (1101, '00000000-0000-4000-8000-000000001101', 1101, 'department_manager', 'active', now());

insert into public.member_profiles (member_id, display_name)
values (1101, 'Manager A');

create temporary table invitation_results (label text primary key, result jsonb);
grant select, insert on table invitation_results to authenticated, service_role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000001101","role":"authenticated","session_id":"10000000-0000-4000-8000-000000001101"}',
  true
);

insert into invitation_results
values (
  'prepared',
  public.prepare_member_invitation(
    ' Invitee@Example.Test ',
    'Invitee',
    1101,
    'sales',
    '20000000-0000-4000-8000-000000001101'
  )
);

reset role;

select ok((select (result ->> 'ok')::boolean from invitation_results where label = 'prepared'), 'manager prepares an invitation');

select is(
  (select email_normalized from public.member_invitations where id = (select (result #>> '{data,invitation_id}')::uuid from invitation_results where label = 'prepared')),
  'invitee@example.test',
  'email is normalized by the database'
);

set local role service_role;
insert into invitation_results
select
  'delivered',
  public.complete_member_invitation_delivery(
    (select (result #>> '{data,invitation_id}')::uuid from invitation_results where label = 'prepared'),
    '00000000-0000-4000-8000-000000001102',
    true,
    null
  );
reset role;

select is((select result #>> '{data,status}' from invitation_results where label = 'delivered'), 'sent', 'service delivery binds the exact Auth user');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000001103","role":"authenticated","session_id":"10000000-0000-4000-8000-000000001103"}',
  true
);
insert into invitation_results
select 'wrong-user', public.accept_my_invitation((select (result #>> '{data,invitation_id}')::uuid from invitation_results where label = 'prepared'));
reset role;

select is((select result #>> '{error,code}' from invitation_results where label = 'wrong-user'), 'INVITATION_USER_MISMATCH', 'a different authenticated user cannot accept the invitation');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000001102","role":"authenticated","session_id":"10000000-0000-4000-8000-000000001102"}',
  true
);
insert into invitation_results
select 'accepted', public.accept_my_invitation((select (result #>> '{data,invitation_id}')::uuid from invitation_results where label = 'prepared'));
insert into invitation_results
select 'replayed', public.accept_my_invitation((select (result #>> '{data,invitation_id}')::uuid from invitation_results where label = 'prepared'));
reset role;

select ok((select (result ->> 'ok')::boolean from invitation_results where label = 'accepted'), 'the intended user accepts the invitation');
select is((select count(*) from public.members where auth_user_id = '00000000-0000-4000-8000-000000001102'), 1::bigint, 'acceptance creates exactly one member');
select is((select count(*) from public.member_profiles where member_id = (select id from public.members where auth_user_id = '00000000-0000-4000-8000-000000001102')), 1::bigint, 'acceptance creates exactly one profile');
select is((select status from public.member_invitations where id = (select (result #>> '{data,invitation_id}')::uuid from invitation_results where label = 'prepared')), 'accepted', 'acceptance marks the invitation accepted');
select is((select result #>> '{data,member_id}' from invitation_results where label = 'replayed'), (select result #>> '{data,member_id}' from invitation_results where label = 'accepted'), 'same-user replay returns the original member');

insert into public.member_invitations (
  id, email_normalized, display_name, department_id, target_role, status,
  invited_auth_user_id, created_by_member_id, idempotency_key,
  created_at, expires_at, sent_at
)
values (
  '30000000-0000-4000-8000-000000001104',
  'rollback@example.test',
  'Rollback User',
  1101,
  'sales',
  'sent',
  '00000000-0000-4000-8000-000000001104',
  1101,
  '20000000-0000-4000-8000-000000001104',
  now(),
  now() + interval '1 day',
  now()
);

create function pg_temp.reject_profile_insert()
returns trigger
language plpgsql
as $$
begin
  raise exception 'test profile failure';
end;
$$;

create trigger reject_profile_insert
before insert on public.member_profiles
for each row execute function pg_temp.reject_profile_insert();

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000001104","role":"authenticated","session_id":"10000000-0000-4000-8000-000000001104"}',
  true
);
insert into invitation_results
select 'rolled-back', public.accept_my_invitation('30000000-0000-4000-8000-000000001104');
reset role;

drop trigger reject_profile_insert on public.member_profiles;

select is((select result #>> '{error,code}' from invitation_results where label = 'rolled-back'), 'INTERNAL_ERROR', 'unexpected profile failure returns a stable error envelope');
select is((select count(*) from public.members where auth_user_id = '00000000-0000-4000-8000-000000001104'), 0::bigint, 'profile failure rolls back member creation');
select is((select status from public.member_invitations where id = '30000000-0000-4000-8000-000000001104'), 'sent', 'profile failure leaves invitation unaccepted');

insert into public.member_invitations (
  id, email_normalized, display_name, department_id, target_role, status,
  invited_auth_user_id, created_by_member_id, idempotency_key,
  created_at, expires_at, sent_at
)
values (
  '30000000-0000-4000-8000-000000001105',
  'expired@example.test',
  'Expired User',
  1101,
  'sales',
  'sent',
  '00000000-0000-4000-8000-000000001105',
  1101,
  '20000000-0000-4000-8000-000000001105',
  now() - interval '2 days',
  now() - interval '1 day',
  now() - interval '2 days'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000001105","role":"authenticated","session_id":"10000000-0000-4000-8000-000000001105"}',
  true
);
insert into invitation_results
select 'expired', public.accept_my_invitation('30000000-0000-4000-8000-000000001105');
reset role;

select is((select result #>> '{error,code}' from invitation_results where label = 'expired'), 'INVITATION_EXPIRED', 'expired invitations are rejected');

select is(
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'member_invitations' and column_name like '%token%'),
  0::bigint,
  'no application invitation token is stored'
);

select * from finish();
rollback;
