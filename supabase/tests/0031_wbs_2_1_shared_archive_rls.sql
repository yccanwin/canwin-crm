begin;

select plan(31);

insert into public.departments(id,code,name,status) overriding system value values(2111,'archive-a','Archive Department A','active'),(2112,'archive-b','Archive Department B','active'),(2113,'archive-inactive','Archive Inactive Department','inactive');
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,email_change)
select '00000000-0000-0000-0000-000000000000',user_id,'authenticated','authenticated',email,'',now(),now(),now(),'{}','{}','','','','' from(values
('00000000-0000-4000-8000-000000002111'::uuid,'archive-a@example.test'),('00000000-0000-4000-8000-000000002112'::uuid,'archive-b@example.test'),('00000000-0000-4000-8000-000000002113'::uuid,'archive-disabled@example.test'),('00000000-0000-4000-8000-000000002114'::uuid,'archive-inactive@example.test'))as fixture(user_id,email);
insert into auth.sessions(id,user_id,created_at,updated_at) values
('11000000-0000-4000-8000-000000002111','00000000-0000-4000-8000-000000002111',now(),now()),('11000000-0000-4000-8000-000000002112','00000000-0000-4000-8000-000000002112',now(),now()),('11000000-0000-4000-8000-000000002113','00000000-0000-4000-8000-000000002113',now(),now()),('11000000-0000-4000-8000-000000002114','00000000-0000-4000-8000-000000002114',now(),now());
insert into public.members(id,auth_user_id,primary_department_id,role,status,accepted_at,disabled_at,disabled_by_member_id,disabled_reason) overriding system value values
(2111,'00000000-0000-4000-8000-000000002111',2111,'sales','active',now(),null,null,null),(2112,'00000000-0000-4000-8000-000000002112',2112,'department_manager','active',now(),null,null,null),(2113,'00000000-0000-4000-8000-000000002113',2111,'sales','disabled',now(),now(),2112,'Synthetic disabled member'),(2114,'00000000-0000-4000-8000-000000002114',2113,'sales','active',now(),null,null,null);
insert into public.accounts(id,public_id,name,created_by_member_id,updated_by_member_id) overriding system value values(2111,'21000000-0000-4000-8000-000000000011','Shared Account A',2111,2111),(2112,'21000000-0000-4000-8000-000000000012','Shared Account B',2112,2112);
insert into public.stores(id,public_id,account_id,name,created_by_member_id,updated_by_member_id) overriding system value values(2111,'21000000-0000-4000-8000-000000000013',2111,'Shared Store A',2111,2111),(2112,'21000000-0000-4000-8000-000000000014',2112,'Shared Store B',2112,2112);

select is((select count(*) from information_schema.role_table_grants where table_schema='public' and table_name in('accounts','stores') and grantee='anon'),0::bigint,'anon has no shared archive grants');
select is((select count(*) from information_schema.role_table_grants where table_schema='public' and table_name in('accounts','stores') and grantee='authenticated' and privilege_type='SELECT'),2::bigint,'authenticated receives SELECT on both tables');
select is((select count(*) from information_schema.role_table_grants where table_schema='public' and table_name in('accounts','stores') and grantee='authenticated' and privilege_type<>'SELECT'),0::bigint,'authenticated receives no shared archive write grant');
select is((select count(*) from information_schema.role_table_grants where table_schema='public' and table_name in('accounts','stores') and grantee='service_role' and privilege_type='SELECT'),2::bigint,'service_role receives SELECT on both tables');
select is((select count(*) from information_schema.role_table_grants where table_schema='public' and table_name in('accounts','stores') and grantee='service_role' and privilege_type<>'SELECT'),0::bigint,'service_role receives no shared archive write grant');
select is((select count(*) from information_schema.role_usage_grants where object_schema='public' and object_name in('accounts_id_seq','stores_id_seq') and grantee in('anon','authenticated','service_role')),0::bigint,'Data API roles have no WBS 2.1 sequence usage');
select is((select count(*) from pg_policies where schemaname='public' and tablename in('accounts','stores') and cmd='SELECT' and roles='{authenticated}'),2::bigint,'both tables expose exactly the authenticated select policy');
select is((select count(*) from pg_policies where schemaname='public' and tablename in('accounts','stores') and cmd<>'SELECT'),0::bigint,'shared archive has no direct write policy');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000002111","role":"authenticated","session_id":"11000000-0000-4000-8000-000000002111"}',true);
select is((select count(*) from public.accounts where id in(2111,2112)),2::bigint,'department A sales reads global accounts');
select is((select count(*) from public.stores where id in(2111,2112)),2::bigint,'department A sales reads global stores');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000002112","role":"authenticated","session_id":"11000000-0000-4000-8000-000000002112"}',true);
select is((select count(*) from public.accounts where id in(2111,2112)),2::bigint,'department B manager reads the same accounts');
select is((select count(*) from public.stores where id in(2111,2112)),2::bigint,'department B manager reads the same stores');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000002111","role":"authenticated","session_id":"11000000-0000-4000-8000-000000002111","user_metadata":{"role":"super_admin","primary_department_id":2112}}',true);
select is((select count(*) from public.accounts where id in(2111,2112)),2::bigint,'forged metadata cannot change the already-global account scope');
select is((select count(*) from public.stores where id in(2111,2112)),2::bigint,'forged metadata cannot change the already-global store scope');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000002113","role":"authenticated","session_id":"11000000-0000-4000-8000-000000002113"}',true);
select is((select count(*) from public.accounts),0::bigint,'disabled member old JWT reads no accounts');
select is((select count(*) from public.stores),0::bigint,'disabled member old JWT reads no stores');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000002114","role":"authenticated","session_id":"11000000-0000-4000-8000-000000002114"}',true);
select is((select count(*) from public.accounts),0::bigint,'inactive department old JWT reads no accounts');
select is((select count(*) from public.stores),0::bigint,'inactive department old JWT reads no stores');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000002111","role":"authenticated","session_id":"11000000-0000-4000-8000-000000002111"}',true);
select throws_ok($$insert into public.accounts(name,created_by_member_id,updated_by_member_id) values('Denied',2111,2111)$$,'42501','permission denied for table accounts','authenticated cannot insert accounts');
select throws_ok($$update public.accounts set name='Denied' where id=2111$$,'42501','permission denied for table accounts','authenticated cannot update accounts');
select throws_ok($$delete from public.accounts where id=2111$$,'42501','permission denied for table accounts','authenticated cannot delete accounts');
select throws_ok($$insert into public.stores(account_id,name,created_by_member_id,updated_by_member_id) values(2111,'Denied',2111,2111)$$,'42501','permission denied for table stores','authenticated cannot insert stores');
reset role;

set local role service_role;
select throws_ok($$insert into public.accounts(name,created_by_member_id,updated_by_member_id) values('Denied service',2111,2111)$$,'42501','permission denied for table accounts','service_role cannot insert accounts');
select throws_ok($$update public.stores set name='Denied service' where id=2111$$,'42501','permission denied for table stores','service_role cannot update stores');
select throws_ok($$delete from public.stores where id=2111$$,'42501','permission denied for table stores','service_role cannot delete stores');
select ok(not has_sequence_privilege('service_role','public.accounts_id_seq','USAGE'),'service_role cannot allocate account identities');
select ok(not has_sequence_privilege('service_role','public.stores_id_seq','USAGE'),'service_role cannot allocate store identities');
reset role;

select is((select count(*) from public.accounts where id in(2111,2112)),2::bigint,'denied account writes have zero side effects');
select is((select count(*) from public.stores where id in(2111,2112)),2::bigint,'denied store writes have zero side effects');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','app_private') and p.prokind in('f','p') and(lower(coalesce(p.prosrc,'')) like '%user_metadata%' or lower(coalesce(p.prosrc,'')) like '%raw_user_meta_data%')),0::bigint,'authorization functions never trust user-editable metadata');
select is((select count(*) from pg_policies where schemaname='public' and tablename in('accounts','stores')),2::bigint,'no hidden policy expands the contract');

select * from finish();
rollback;
