begin;

select plan(96);

select is((select count(*) from information_schema.role_table_grants where table_name in('portrait_field_definitions','portrait_field_options','store_portrait_values','store_portrait_value_options','store_derived_portrait_values','store_derived_portrait_history') and grantee='anon'),0::bigint,'anon has zero portrait grants');
select is((select count(*) from information_schema.role_table_grants where table_schema='public' and table_name in('portrait_field_definitions','portrait_field_options','store_portrait_values','store_portrait_value_options','store_derived_portrait_values') and grantee='authenticated' and privilege_type='SELECT'),0::bigint,'authenticated has no raw portrait SELECT grants');
select is((select count(*) from information_schema.role_table_grants where table_name in('portrait_field_definitions','portrait_field_options','store_portrait_values','store_portrait_value_options','store_derived_portrait_values','store_derived_portrait_history') and grantee='authenticated' and privilege_type in('INSERT','UPDATE','DELETE','TRUNCATE')),0::bigint,'authenticated has no direct portrait write grant');
select is((select count(*) from information_schema.role_table_grants where table_name in('portrait_field_definitions','portrait_field_options','store_portrait_values','store_portrait_value_options','store_derived_portrait_values','store_derived_portrait_history') and grantee='service_role'),0::bigint,'service role has zero portrait grants');
select is((select count(*) from information_schema.role_usage_grants where object_name like '%portrait%_id_seq' and grantee='anon'),0::bigint,'anon has zero portrait sequence usage');
select is((select count(*) from information_schema.role_usage_grants where object_name like '%portrait%_id_seq' and grantee='authenticated'),0::bigint,'authenticated has zero portrait sequence usage');
select is((select count(*) from information_schema.role_usage_grants where object_name like '%portrait%_id_seq' and grantee='service_role'),0::bigint,'service role has zero portrait sequence usage');
select is((select count(*) from pg_policies where schemaname='public' and tablename='portrait_field_definitions' and cmd='SELECT'),1::bigint,'definition has one select policy');
select is((select count(*) from pg_policies where schemaname='public' and tablename='portrait_field_options' and cmd='SELECT'),1::bigint,'option has one select policy');
select is((select count(*) from pg_policies where schemaname='public' and tablename='store_portrait_values' and cmd='SELECT'),1::bigint,'manual value has one select policy');
select is((select count(*) from pg_policies where schemaname='public' and tablename='store_portrait_value_options' and cmd='SELECT'),1::bigint,'multi link has one select policy');
select is((select count(*) from pg_policies where schemaname='public' and tablename='store_derived_portrait_values' and cmd='SELECT'),1::bigint,'derived current has one contextual select policy');
select is((select count(*) from pg_policies where tablename in('portrait_field_definitions','portrait_field_options','store_portrait_values','store_portrait_value_options','store_derived_portrait_values','store_derived_portrait_history') and cmd<>'SELECT'),0::bigint,'portrait schema has no direct write policy');
select is((select count(*) from pg_policies where schemaname='app_private' and tablename='store_derived_portrait_history'),0::bigint,'private history has no policy');
select is((select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename in('portrait_field_definitions','portrait_field_options','store_portrait_values','store_portrait_value_options','store_derived_portrait_values','store_derived_portrait_history')),0::bigint,'portrait module is absent from Realtime publication');
select ok(has_function_privilege('authenticated','app_private.portrait_current_department_id()','EXECUTE'),'authenticated has only the RLS department helper bridge');
select ok(not has_function_privilege('anon','app_private.portrait_current_department_id()','EXECUTE'),'anon cannot call department helper');
select ok(not has_function_privilege('service_role','app_private.portrait_current_department_id()','EXECUTE'),'service role cannot call department helper');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where n.nspname='app_private' and p.proname like '%portrait%' and acl.grantee=0),0::bigint,'PUBLIC has no portrait helper execute');
select ok(has_function_privilege('authenticated','public.read_portrait_catalog()','EXECUTE'),'authenticated may execute catalog projection');
select ok(has_function_privilege('authenticated','public.read_store_derived_portraits(uuid)','EXECUTE'),'authenticated may execute derived projection');
select ok(not has_function_privilege('anon','public.read_portrait_catalog()','EXECUTE'),'anon cannot execute catalog projection');
select ok(not has_function_privilege('anon','public.read_store_derived_portraits(uuid)','EXECUTE'),'anon cannot execute derived projection');
select ok(not has_function_privilege('service_role','public.read_portrait_catalog()','EXECUTE'),'service role cannot execute catalog projection');
select ok(not has_function_privilege('service_role','public.read_store_derived_portraits(uuid)','EXECUTE'),'service role cannot execute derived projection');

insert into public.departments(id,public_id,code,name,status) overriding system value values
(23701,'23700000-0000-4000-8000-000000000011','portrait-a','Portrait Department A','active'),
(23702,'23700000-0000-4000-8000-000000000012','portrait-b','Portrait Department B','active'),
(23703,'23700000-0000-4000-8000-000000000013','portrait-off','Portrait Department Off','inactive');
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,email_change)
select '00000000-0000-0000-0000-000000000000',user_id,'authenticated','authenticated',email,'',now(),now(),now(),'{}','{}','','','','' from(values
('00000000-0000-4000-8000-000000023701'::uuid,'portrait-a@example.test'),
('00000000-0000-4000-8000-000000023702'::uuid,'portrait-b@example.test'),
('00000000-0000-4000-8000-000000023703'::uuid,'portrait-disabled@example.test'),
('00000000-0000-4000-8000-000000023704'::uuid,'portrait-off@example.test'),
('00000000-0000-4000-8000-000000023705'::uuid,'portrait-stale@example.test'),
('00000000-0000-4000-8000-000000023706'::uuid,'portrait-admin@example.test'))as fixture(user_id,email);
insert into auth.sessions(id,user_id,created_at,updated_at) values
('23700000-0000-4000-8000-000000023701','00000000-0000-4000-8000-000000023701',now(),now()),
('23700000-0000-4000-8000-000000023702','00000000-0000-4000-8000-000000023702',now(),now()),
('23700000-0000-4000-8000-000000023703','00000000-0000-4000-8000-000000023703',now(),now()),
('23700000-0000-4000-8000-000000023704','00000000-0000-4000-8000-000000023704',now(),now()),
('23700000-0000-4000-8000-000000023706','00000000-0000-4000-8000-000000023706',now(),now());
insert into public.members(id,auth_user_id,primary_department_id,role,status,accepted_at,disabled_at,disabled_by_member_id,disabled_reason) overriding system value values
(23701,'00000000-0000-4000-8000-000000023701',23701,'sales','active',now(),null,null,null),
(23702,'00000000-0000-4000-8000-000000023702',23702,'sales','active',now(),null,null,null),
(23703,'00000000-0000-4000-8000-000000023703',23701,'sales','disabled',now(),now(),23706,'Synthetic disabled'),
(23704,'00000000-0000-4000-8000-000000023704',23703,'sales','active',now(),null,null,null),
(23705,'00000000-0000-4000-8000-000000023705',23701,'sales','active',now(),null,null,null),
(23706,'00000000-0000-4000-8000-000000023706',23701,'super_admin','active',now(),null,null,null);
insert into public.accounts(id,public_id,name,created_by_member_id,updated_by_member_id) overriding system value values
(23701,'23700000-0000-4000-8000-000000000001','Synthetic Portrait ACL Account',23706,23706);
insert into public.stores(id,public_id,account_id,name,created_by_member_id,updated_by_member_id) overriding system value values
(23701,'23700000-0000-4000-8000-000000000002',23701,'Synthetic Portrait ACL Store',23706,23706);

insert into public.portrait_field_definitions(id,public_id,field_key,label,value_type,source_kind,privacy_class,context_scope,status,is_read_only,allow_keyword_search,sort_order,created_by_member_id,updated_by_member_id) overriding system value values
(23701,'23700000-0000-4000-8000-000000000101','acl_text','ACL Text','text','manual','shared_non_sensitive','store_global','active',false,true,1,23706,23706),
(23702,'23700000-0000-4000-8000-000000000102','acl_multi','ACL Multi','multi_select','manual','shared_non_sensitive','store_global','active',false,false,2,23706,23706);
insert into public.portrait_field_definitions(id,public_id,field_key,label,value_type,source_kind,privacy_class,context_scope,status,is_read_only,sort_order,created_by_system,updated_by_system) overriding system value values
(23703,'23700000-0000-4000-8000-000000000103','acl_global_derived','ACL Global Derived','boolean','system_derived','shared_non_sensitive','store_global','active',true,3,'system:test','system:test'),
(23704,'23700000-0000-4000-8000-000000000104','acl_department_derived','ACL Department Derived','boolean','system_derived','shared_non_sensitive','store_department','active',true,4,'system:test','system:test');
insert into public.portrait_field_options(id,public_id,field_definition_id,option_key,label,created_by_member_id,updated_by_member_id) overriding system value values
(23701,'23700000-0000-4000-8000-000000000201',23702,'choice_a','Choice A',23706,23706);
insert into public.store_portrait_values(id,public_id,store_id,field_definition_id,value_type,revision,text_value,created_by_member_id,updated_by_member_id) overriding system value values
(23701,'23700000-0000-4000-8000-000000000301',23701,23701,'text',1,'Shared portrait',23706,23706);
insert into public.store_portrait_values(id,public_id,store_id,field_definition_id,value_type,revision,created_by_member_id,updated_by_member_id) overriding system value values
(23702,'23700000-0000-4000-8000-000000000302',23701,23702,'multi_select',1,23706,23706);
insert into public.store_portrait_value_options(value_id,option_id,created_by_member_id) values(23702,23701,23706);
insert into public.store_derived_portrait_values(id,public_id,store_id,field_definition_id,department_id,revision,freshness,boolean_value,calculation_version,source_version,computed_at,source_changed_at,reason_code,created_by_system,updated_by_system) overriding system value values
(23701,'23700000-0000-4000-8000-000000000401',23701,23703,null,1,'fresh',true,'calc-1','source-1',now(),now()-interval '1 minute','COMPUTED','system:test','system:test'),
(23702,'23700000-0000-4000-8000-000000000402',23701,23704,23701,1,'stale',null,'calc-1','source-2',now()-interval '2 minutes',now()-interval '1 minute','SOURCE_CHANGED','system:test','system:test'),
(23703,'23700000-0000-4000-8000-000000000403',23701,23704,23702,1,'fresh',false,'calc-1','source-1',now(),now()-interval '1 minute','COMPUTED','system:test','system:test');
alter table public.portrait_field_definitions disable trigger portrait_field_definitions_guard;
update public.portrait_field_definitions
set status='active',updated_by_system='system:test'
where field_key in ('has_legal_person_id','has_business_license','documents_complete');
alter table public.portrait_field_definitions enable trigger portrait_field_definitions_guard;
insert into public.store_derived_portrait_values(store_id,field_definition_id,department_id,revision,freshness,boolean_value,calculation_version,source_version,computed_at,source_changed_at,reason_code,created_by_system,updated_by_system)
select 23701,id,null,1,'fresh',true,'calc-1','source-1',now(),now()-interval '1 minute','COMPUTED','system:test','system:test'
from public.portrait_field_definitions where field_key='has_legal_person_id';
insert into public.store_derived_portrait_values(store_id,field_definition_id,department_id,revision,freshness,boolean_value,calculation_version,source_version,computed_at,source_changed_at,reason_code,created_by_system,updated_by_system)
select 23701,id,23701,1,'stale',null,'calc-1','source-2',now()-interval '2 minutes',now()-interval '1 minute','SOURCE_CHANGED','system:test','system:test'
from public.portrait_field_definitions where field_key='documents_complete';
insert into public.store_derived_portrait_values(store_id,field_definition_id,department_id,revision,freshness,boolean_value,calculation_version,source_version,computed_at,source_changed_at,reason_code,created_by_system,updated_by_system)
select 23701,id,23702,1,'fresh',false,'calc-1','source-1',now(),now()-interval '1 minute','COMPUTED','system:test','system:test'
from public.portrait_field_definitions where field_key='documents_complete';
insert into app_private.store_derived_portrait_history(derived_value_id,store_id,field_definition_id,department_id,revision,freshness,boolean_value,calculation_version,source_version,computed_at,source_changed_at,reason_code,recorded_by_system)
values(23702,23701,23704,23701,1,'stale',null,'calc-1','source-2',now()-interval '2 minutes',now()-interval '1 minute','SOURCE_CHANGED','system:test');

set local role anon;
select throws_ok($$select count(*) from public.portrait_field_definitions$$,'42501','permission denied for table portrait_field_definitions','anon cannot read definitions');
select throws_ok($$select count(*) from public.store_portrait_values$$,'42501','permission denied for table store_portrait_values','anon cannot read manual values');
select throws_ok($$select count(*) from public.store_derived_portrait_values$$,'42501','permission denied for table store_derived_portrait_values','anon cannot read derived values');
select throws_ok($$select public.read_portrait_catalog()$$,'42501','permission denied for function read_portrait_catalog','anon cannot call catalog projection');
select throws_ok($$select * from public.read_store_derived_portraits('23700000-0000-4000-8000-000000000002')$$,'42501','permission denied for function read_store_derived_portraits','anon cannot call derived projection');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000023701","role":"authenticated","session_id":"23700000-0000-4000-8000-000000023701"}',true);
select is(jsonb_array_length(public.read_portrait_catalog()->'fields'),5,'department A reads shared catalog through exact projection');
select is((select jsonb_array_length(field->'options') from jsonb_array_elements(public.read_portrait_catalog()->'fields') as field where field->>'field_key'='acl_multi'),1,'department A catalog includes nested safe options');
select is((select count(*) from jsonb_array_elements(public.read_portrait_catalog()->'fields') as field where field->>'source_kind'='system_derived' and field->>'status'='active'),3::bigint,'controlled active fixture projects the three real derived statuses');
select is((select array_agg(key order by key) from jsonb_object_keys(public.read_store_derived_portraits('23700000-0000-4000-8000-000000000002')) as key),array['context','schema_version','values'],'derived response has exact envelope keys');
select is((select array_agg(key order by key) from jsonb_object_keys(public.read_store_derived_portraits('23700000-0000-4000-8000-000000000002')->'context') as key),array['auth_user_public_id','context_version','member_public_id','primary_department_public_id','store_public_id'],'derived context has exact cache identity keys');
select is(public.read_store_derived_portraits('23700000-0000-4000-8000-000000000002')->'context'->>'primary_department_public_id','23700000-0000-4000-8000-000000000011','derived context binds the live primary department public UUID');
select is(jsonb_array_length(public.read_store_derived_portraits('23700000-0000-4000-8000-000000000002')->'values'),3,'derived envelope contains exactly the three frozen fields');
select is((select count(*) from jsonb_array_elements(public.read_store_derived_portraits('23700000-0000-4000-8000-000000000002')->'values') as value where (select array_agg(key order by key) from jsonb_object_keys(value) as key)=array['calculation_version','computed_at','context_version','department_public_id','field_public_id','freshness','reason_code','schema_version','source_changed_at','source_version','store_public_id','value']),3::bigint,'every derived value has the exact wire keys');
select is((select count(*) from jsonb_array_elements(public.read_store_derived_portraits('23700000-0000-4000-8000-000000000002')->'values') as value where (value->>'context_version')::bigint=(public.read_store_derived_portraits('23700000-0000-4000-8000-000000000002')->'context'->>'context_version')::bigint),3::bigint,'all derived values bind the envelope context version');
select throws_ok($$select count(*) from public.store_portrait_values$$,'42501','permission denied for table store_portrait_values','department A cannot bypass the value wire boundary');
select throws_ok($$select count(*) from public.store_portrait_value_options$$,'42501','permission denied for table store_portrait_value_options','department A cannot bypass the option-link wire boundary');
select is((select count(*) from jsonb_array_elements(public.read_store_derived_portraits('23700000-0000-4000-8000-000000000002')->'values') as projected(value) where value->>'field_public_id'='23000000-0000-4000-8000-000000000001'),1::bigint,'department A projection includes frozen global derived value');
select is((select count(*) from jsonb_array_elements(public.read_store_derived_portraits('23700000-0000-4000-8000-000000000002')->'values') as projected(value) where value->>'field_public_id'='23000000-0000-4000-8000-000000000003' and value->>'department_public_id'='23700000-0000-4000-8000-000000000011'),1::bigint,'department A projection includes own frozen department value');
select is((select count(*) from jsonb_array_elements(public.read_store_derived_portraits('23700000-0000-4000-8000-000000000002')->'values') as projected(value) where value->>'department_public_id'='23700000-0000-4000-8000-000000000012'),0::bigint,'department A projection excludes department B context');
select is((select value->'value' from jsonb_array_elements(public.read_store_derived_portraits('23700000-0000-4000-8000-000000000002')->'values') as projected(value) where value->>'field_public_id'='23000000-0000-4000-8000-000000000003'),'null'::jsonb,'stale wire row exposes no old boolean');
select is((select value->>'freshness' from jsonb_array_elements(public.read_store_derived_portraits('23700000-0000-4000-8000-000000000002')->'values') as projected(value) where value->>'field_public_id'='23000000-0000-4000-8000-000000000003'),'stale','stale wire row remains distinct from stale session denial');
select is((select value->'reason_code' from jsonb_array_elements(public.read_store_derived_portraits('23700000-0000-4000-8000-000000000002')->'values') as projected(value) where value->>'field_public_id'='23000000-0000-4000-8000-000000000001'),'null'::jsonb,'database COMPUTED reason normalizes to null on the fresh wire');
select is((select value->>'reason_code' from jsonb_array_elements(public.read_store_derived_portraits('23700000-0000-4000-8000-000000000002')->'values') as projected(value) where value->>'field_public_id'='23000000-0000-4000-8000-000000000002'),'NOT_COMPUTED','absent frozen value projects as explicit unknown');
select is((select app_private.portrait_current_department_id()),23701::bigint,'department helper derives live primary department');
select throws_ok($$select count(*) from app_private.store_derived_portrait_history$$,'42501','permission denied for table store_derived_portrait_history','authenticated cannot read private history');
select throws_ok($$insert into public.portrait_field_definitions(field_key,label,value_type,source_kind,privacy_class,context_scope,is_read_only,created_by_member_id,updated_by_member_id) values('denied','Denied','text','manual','shared_non_sensitive','store_global',false,23701,23701)$$,'42501','permission denied for table portrait_field_definitions','authenticated cannot insert definition');
select throws_ok($$update public.portrait_field_definitions set label='Denied' where id=23701$$,'42501','permission denied for table portrait_field_definitions','authenticated cannot update definition');
select throws_ok($$delete from public.portrait_field_definitions where id=23701$$,'42501','permission denied for table portrait_field_definitions','authenticated cannot delete definition');
select throws_ok($$truncate table public.portrait_field_definitions$$,'42501','permission denied for table portrait_field_definitions','authenticated cannot truncate definition');
select throws_ok($$insert into public.portrait_field_options(field_definition_id,option_key,label,created_by_member_id,updated_by_member_id) values(23702,'denied','Denied',23701,23701)$$,'42501','permission denied for table portrait_field_options','authenticated cannot insert option');
select throws_ok($$update public.portrait_field_options set label='Denied' where id=23701$$,'42501','permission denied for table portrait_field_options','authenticated cannot update option');
select throws_ok($$delete from public.portrait_field_options where id=23701$$,'42501','permission denied for table portrait_field_options','authenticated cannot delete option');
select throws_ok($$insert into public.store_portrait_values(store_id,field_definition_id,value_type,revision,text_value,created_by_member_id,updated_by_member_id) values(23701,23701,'text',2,'Denied',23701,23701)$$,'42501','permission denied for table store_portrait_values','authenticated cannot insert manual value');
select throws_ok($$update public.store_portrait_values set status='inactive' where id=23701$$,'42501','permission denied for table store_portrait_values','authenticated cannot update manual value');
select throws_ok($$delete from public.store_portrait_values where id=23701$$,'42501','permission denied for table store_portrait_values','authenticated cannot delete manual value');
select throws_ok($$truncate table public.store_portrait_values$$,'42501','permission denied for table store_portrait_values','authenticated cannot truncate manual values');
select throws_ok($$insert into public.store_portrait_value_options(value_id,option_id,created_by_member_id) values(23702,23701,23701)$$,'42501','permission denied for table store_portrait_value_options','authenticated cannot insert multi link');
select throws_ok($$delete from public.store_portrait_value_options where value_id=23702$$,'42501','permission denied for table store_portrait_value_options','authenticated cannot delete multi link');
select throws_ok($$insert into public.store_derived_portrait_values(store_id,field_definition_id,revision,freshness,reason_code,created_by_system,updated_by_system) values(23701,23703,2,'unknown','NOT_COMPUTED','system:client','system:client')$$,'42501','permission denied for table store_derived_portrait_values','authenticated cannot insert derived current');
select throws_ok($$update public.store_derived_portrait_values set reason_code='RECOMPUTE_PENDING' where id=23702$$,'42501','permission denied for table store_derived_portrait_values','authenticated cannot update derived current');
select throws_ok($$delete from public.store_derived_portrait_values where id=23702$$,'42501','permission denied for table store_derived_portrait_values','authenticated cannot delete derived current');
select throws_ok($$truncate table public.store_derived_portrait_values$$,'42501','permission denied for table store_derived_portrait_values','authenticated cannot truncate derived current');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000023702","role":"authenticated","session_id":"23700000-0000-4000-8000-000000023702"}',true);
select is(jsonb_array_length(public.read_portrait_catalog()->'fields'),5,'department B reads the same shared catalog');
select is((select count(*) from jsonb_array_elements(public.read_store_derived_portraits('23700000-0000-4000-8000-000000000002')->'values') as projected(value) where value->>'department_public_id'='23700000-0000-4000-8000-000000000011'),0::bigint,'department B projection excludes department A context');
select is((select count(*) from jsonb_array_elements(public.read_store_derived_portraits('23700000-0000-4000-8000-000000000002')->'values') as projected(value) where value->>'department_public_id'='23700000-0000-4000-8000-000000000012'),1::bigint,'department B projection includes own context');
select is((select value->'value' from jsonb_array_elements(public.read_store_derived_portraits('23700000-0000-4000-8000-000000000002')->'values') as projected(value) where value->>'department_public_id'='23700000-0000-4000-8000-000000000012'),'false'::jsonb,'fresh false remains distinct from unknown');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000023703","role":"authenticated","session_id":"23700000-0000-4000-8000-000000023703"}',true);
select throws_ok($$select public.read_portrait_catalog()$$,'42501','SESSION_INVALID','disabled member is rejected by catalog projection');
select throws_ok($$select * from public.read_store_derived_portraits('23700000-0000-4000-8000-000000000002')$$,'42501','SESSION_INVALID','disabled member is rejected by derived projection');
select throws_ok($$select count(*) from public.portrait_field_definitions$$,'42501','permission denied for table portrait_field_definitions','disabled member cannot raw-read definitions');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000023704","role":"authenticated","session_id":"23700000-0000-4000-8000-000000023704"}',true);
select throws_ok($$select public.read_portrait_catalog()$$,'42501','SESSION_INVALID','inactive-department member is rejected by catalog projection');
select throws_ok($$select * from public.read_store_derived_portraits('23700000-0000-4000-8000-000000000002')$$,'42501','SESSION_INVALID','inactive-department member is rejected by derived projection');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000023705","role":"authenticated","session_id":"23700000-0000-4000-8000-000000023705"}',true);
select throws_ok($$select public.read_portrait_catalog()$$,'42501','SESSION_INVALID','deleted-session old JWT is rejected by catalog projection');
select throws_ok($$select * from public.read_store_derived_portraits('23700000-0000-4000-8000-000000000002')$$,'42501','SESSION_INVALID','deleted-session old JWT is rejected by derived projection');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000023701","role":"authenticated","session_id":"23700000-0000-4000-8000-000000023701","user_metadata":{"role":"super_admin","primary_department_id":23702}}',true);
select is((select count(*) from jsonb_array_elements(public.read_store_derived_portraits('23700000-0000-4000-8000-000000000002')->'values') as projected(value) where value->>'department_public_id'='23700000-0000-4000-8000-000000000011'),1::bigint,'forged metadata does not remove true department A scope');
select is((select count(*) from jsonb_array_elements(public.read_store_derived_portraits('23700000-0000-4000-8000-000000000002')->'values') as projected(value) where value->>'department_public_id'='23700000-0000-4000-8000-000000000012'),0::bigint,'forged metadata cannot gain department B scope');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000023706","role":"authenticated","session_id":"23700000-0000-4000-8000-000000023706"}',true);
select is((select count(*) from jsonb_array_elements(public.read_store_derived_portraits('23700000-0000-4000-8000-000000000002')->'values') as projected(value) where value->>'department_public_id'='23700000-0000-4000-8000-000000000011'),1::bigint,'super admin projection sees own primary department row');
select is((select count(*) from jsonb_array_elements(public.read_store_derived_portraits('23700000-0000-4000-8000-000000000002')->'values') as projected(value) where value->>'department_public_id'='23700000-0000-4000-8000-000000000012'),0::bigint,'super admin projection cannot select arbitrary department');
reset role;

set local role service_role;
select throws_ok($$select count(*) from public.portrait_field_definitions$$,'42501','permission denied for table portrait_field_definitions','service role cannot select definitions');
select throws_ok($$select count(*) from public.store_derived_portrait_values$$,'42501','permission denied for table store_derived_portrait_values','service role cannot select derived current');
select throws_ok($$select count(*) from app_private.store_derived_portrait_history$$,'42501','permission denied for table store_derived_portrait_history','service role cannot select history');
select throws_ok($$insert into public.store_portrait_values(store_id,field_definition_id,value_type,revision,text_value,created_by_member_id,updated_by_member_id) values(23701,23701,'text',2,'Denied',23706,23706)$$,'42501','permission denied for table store_portrait_values','service role cannot insert manual value');
select throws_ok($$update public.store_derived_portrait_values set reason_code='RECOMPUTE_PENDING' where id=23702$$,'42501','permission denied for table store_derived_portrait_values','service role cannot update derived current');
select throws_ok($$delete from public.store_derived_portrait_values where id=23702$$,'42501','permission denied for table store_derived_portrait_values','service role cannot delete derived current');
select throws_ok($$truncate table public.store_derived_portrait_values$$,'42501','permission denied for table store_derived_portrait_values','service role cannot truncate derived current');
select throws_ok($$insert into app_private.store_derived_portrait_history(derived_value_id,store_id,field_definition_id,revision,freshness,reason_code,recorded_by_system) values(23701,23701,23703,2,'unknown','NOT_COMPUTED','system:service')$$,'42501','permission denied for table store_derived_portrait_history','service role cannot append history directly');
select throws_ok($$select public.read_portrait_catalog()$$,'42501','permission denied for function read_portrait_catalog','service role cannot call catalog projection');
select throws_ok($$select * from public.read_store_derived_portraits('23700000-0000-4000-8000-000000000002')$$,'42501','permission denied for function read_store_derived_portraits','service role cannot call derived projection');
reset role;

select is((select count(*) from public.store_portrait_values where store_id=23701),2::bigint,'all denied manual writes have zero side effects');
select is((select count(*) from public.store_derived_portrait_values),6::bigint,'all denied derived writes have zero side effects');
select is((select count(*) from app_private.store_derived_portrait_history),1::bigint,'all denied history access has zero side effects');
select is((select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename like '%portrait%'),0::bigint,'no portrait Realtime event source exists');

select * from finish();
rollback;
