begin;

select plan(35);

select is((select count(*) from information_schema.role_table_grants where table_schema='public' and table_name='contacts' and grantee='anon'),0::bigint,'anon has no contacts grants');
select is((select count(*) from information_schema.role_table_grants where table_schema='public' and table_name='contacts' and grantee='authenticated' and privilege_type='SELECT'),1::bigint,'authenticated receives structural contacts select');
select is((select count(*) from information_schema.role_table_grants where table_schema='public' and table_name='contacts' and grantee='authenticated' and privilege_type<>'SELECT'),0::bigint,'authenticated receives no contacts write grant');
select is((select count(*) from information_schema.role_table_grants where table_schema='public' and table_name='contacts' and grantee='service_role' and privilege_type='SELECT'),1::bigint,'service role receives structural contacts select');
select is((select count(*) from information_schema.role_table_grants where table_schema='public' and table_name='contacts' and grantee='service_role' and privilege_type<>'SELECT'),0::bigint,'service role receives no contacts write grant');
select is((select count(*) from information_schema.role_usage_grants where object_schema='public' and object_name='contacts_id_seq' and grantee in('anon','authenticated','service_role')),0::bigint,'Data API roles cannot allocate contact identities');
select is((select count(*) from information_schema.role_table_grants where table_schema='app_private' and table_name='contact_secrets' and grantee in('anon','authenticated','service_role')),0::bigint,'Data API roles have no contact secret grants');
select is((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl where n.nspname='app_private' and c.relname='contact_secrets' and acl.grantee=0),0::bigint,'PUBLIC has no contact secret privilege');
select is((select count(*) from pg_policies where schemaname='public' and tablename='contacts' and cmd='SELECT' and roles='{authenticated}'),1::bigint,'contacts exposes exactly one authenticated select policy');
select is((select count(*) from pg_policies where schemaname='public' and tablename='contacts' and cmd<>'SELECT'),0::bigint,'contacts exposes no direct write policy');
select is((select count(*) from pg_policies where schemaname='app_private' and tablename='contact_secrets'),0::bigint,'contact secrets exposes no policy');
select is((select count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='app_private' and tablename='contact_secrets'),0::bigint,'contact secrets is excluded from Realtime');
select ok(has_function_privilege('authenticated','public.read_contact_secret(uuid,text,uuid)','EXECUTE'),'authenticated may call the controlled public wrapper');
select ok(not has_function_privilege('anon','public.read_contact_secret(uuid,text,uuid)','EXECUTE'),'anon cannot call the controlled public wrapper');
select ok(not has_function_privilege('service_role','public.read_contact_secret(uuid,text,uuid)','EXECUTE'),'service role cannot call the controlled public wrapper');
select ok(not has_function_privilege('authenticated','app_private.contact_access_capability(uuid)','EXECUTE'),'authenticated cannot call the private capability directly');
select ok(has_function_privilege('authenticated','app_private.read_contact_secret(uuid,text,uuid)','EXECUTE'),'authenticated has only the private execution bridge required by the wrapper');
select ok(not has_function_privilege('service_role','app_private.read_contact_secret(uuid,text,uuid)','EXECUTE'),'service role cannot call the private reader');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where n.nspname='public' and p.proname='read_contact_secret' and acl.grantee=0),0::bigint,'PUBLIC has no wrapper execute privilege');

insert into public.departments(id,code,name,status) overriding system value values(2231,'contact-acl','Contact ACL Department','active'),(2232,'contact-acl-off','Contact ACL Inactive','inactive');
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,email_change)
select '00000000-0000-0000-0000-000000000000',user_id,'authenticated','authenticated',email,'',now(),now(),now(),'{}','{}','','','','' from(values
('00000000-0000-4000-8000-000000002231'::uuid,'contact-acl-active@example.test'),('00000000-0000-4000-8000-000000002232'::uuid,'contact-acl-disabled@example.test'),('00000000-0000-4000-8000-000000002233'::uuid,'contact-acl-inactive@example.test'))as fixture(user_id,email);
insert into auth.sessions(id,user_id,created_at,updated_at) values
('23000000-0000-4000-8000-000000002231','00000000-0000-4000-8000-000000002231',now(),now()),('23000000-0000-4000-8000-000000002232','00000000-0000-4000-8000-000000002232',now(),now()),('23000000-0000-4000-8000-000000002233','00000000-0000-4000-8000-000000002233',now(),now());
insert into public.members(id,auth_user_id,primary_department_id,role,status,accepted_at,disabled_at,disabled_by_member_id,disabled_reason) overriding system value values
(2231,'00000000-0000-4000-8000-000000002231',2231,'sales','active',now(),null,null,null),(2232,'00000000-0000-4000-8000-000000002232',2231,'sales','disabled',now(),now(),2231,'Synthetic disabled member'),(2233,'00000000-0000-4000-8000-000000002233',2232,'sales','active',now(),null,null,null);
insert into public.accounts(id,public_id,name,created_by_member_id,updated_by_member_id) overriding system value values(2231,'23000000-0000-4000-8000-000000000001','Synthetic ACL Account',2231,2231);
insert into public.stores(id,public_id,account_id,name,created_by_member_id,updated_by_member_id) overriding system value values(2231,'23000000-0000-4000-8000-000000000002',2231,'Synthetic ACL Store',2231,2231);
insert into public.contacts(id,public_id,store_id,role_label,created_by_member_id,updated_by_member_id) overriding system value values(2231,'23000000-0000-4000-8000-000000000003',2231,'Buyer',2231,2231);
insert into app_private.contact_secrets(contact_id,full_name,mobile,created_by_member_id,updated_by_member_id) values(2231,'Synthetic ACL Person','00000000000',2231,2231);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000002231","role":"authenticated","session_id":"23000000-0000-4000-8000-000000002231"}',true);
select is((select count(*) from public.contacts where id=2231),1::bigint,'active member reads structural contact');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000002232","role":"authenticated","session_id":"23000000-0000-4000-8000-000000002232"}',true);
select is((select count(*) from public.contacts),0::bigint,'disabled member old JWT reads no contacts');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000002233","role":"authenticated","session_id":"23000000-0000-4000-8000-000000002233"}',true);
select is((select count(*) from public.contacts),0::bigint,'inactive department old JWT reads no contacts');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000002231","role":"authenticated","session_id":"23000000-0000-4000-8000-000000002231","user_metadata":{"role":"super_admin","primary_department_id":2232}}',true);
select is((select count(*) from public.contacts where id=2231),1::bigint,'forged user metadata does not change structural scope');
select throws_ok($$insert into public.contacts(store_id,role_label,created_by_member_id,updated_by_member_id) values(2231,'Denied',2231,2231)$$,'42501','permission denied for table contacts','authenticated cannot insert contacts');
select throws_ok($$update public.contacts set role_label='Denied' where id=2231$$,'42501','permission denied for table contacts','authenticated cannot update contacts');
select throws_ok($$delete from public.contacts where id=2231$$,'42501','permission denied for table contacts','authenticated cannot delete contacts');
select throws_ok($$select count(*) from app_private.contact_secrets$$,'42501','permission denied for table contact_secrets','authenticated cannot read contact secrets directly');
select throws_ok($$insert into app_private.contact_secrets(contact_id,created_by_member_id,updated_by_member_id) values(999999,2231,2231)$$,'42501','permission denied for table contact_secrets','authenticated cannot insert contact secrets');
reset role;

set local role service_role;
select throws_ok($$insert into public.contacts(store_id,role_label,created_by_member_id,updated_by_member_id) values(2231,'Denied service',2231,2231)$$,'42501','permission denied for table contacts','service role cannot insert contacts');
select throws_ok($$update public.contacts set role_label='Denied service' where id=2231$$,'42501','permission denied for table contacts','service role cannot update contacts');
select throws_ok($$delete from public.contacts where id=2231$$,'42501','permission denied for table contacts','service role cannot delete contacts');
select throws_ok($$select count(*) from app_private.contact_secrets$$,'42501','permission denied for table contact_secrets','service role cannot read contact secrets directly');
select throws_ok($$update app_private.contact_secrets set mobile='00000000001' where contact_id=2231$$,'42501','permission denied for table contact_secrets','service role cannot update contact secrets');
reset role;

select is((select count(*) from public.contacts where id=2231),1::bigint,'denied contact writes have zero side effects');
select is((select count(*) from app_private.contact_secrets where contact_id=2231),1::bigint,'denied secret access has zero side effects');

select * from finish();
rollback;
