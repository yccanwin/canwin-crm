begin;

select plan(90);

select is((select public_id::text from public.portrait_field_definitions where field_key='has_legal_person_id'),'23000000-0000-4000-8000-000000000001','legal-person definition has fixed UUID');
select is((select public_id::text from public.portrait_field_definitions where field_key='has_business_license'),'23000000-0000-4000-8000-000000000002','license definition has fixed UUID');
select is((select public_id::text from public.portrait_field_definitions where field_key='documents_complete'),'23000000-0000-4000-8000-000000000003','documents-complete definition has fixed UUID');
select is((select value_type from public.portrait_field_definitions where field_key='has_legal_person_id'),'boolean','legal-person type is boolean');
select is((select value_type from public.portrait_field_definitions where field_key='has_business_license'),'boolean','license type is boolean');
select is((select value_type from public.portrait_field_definitions where field_key='documents_complete'),'boolean','documents-complete type is boolean');
select is((select source_kind from public.portrait_field_definitions where field_key='has_legal_person_id'),'system_derived','legal-person source is derived');
select is((select source_kind from public.portrait_field_definitions where field_key='has_business_license'),'system_derived','license source is derived');
select is((select source_kind from public.portrait_field_definitions where field_key='documents_complete'),'system_derived','documents-complete source is derived');
select is((select context_scope from public.portrait_field_definitions where field_key='has_legal_person_id'),'store_global','legal-person scope global');
select is((select context_scope from public.portrait_field_definitions where field_key='has_business_license'),'store_global','license scope global');
select is((select context_scope from public.portrait_field_definitions where field_key='documents_complete'),'store_department','documents-complete scope departmental');
select is((select count(*) from public.portrait_field_definitions where source_kind='system_derived' and status='reserved' and is_read_only),3::bigint,'all three definitions are reserved read-only');
select is((select count(*) from public.portrait_field_definitions where source_kind='system_derived' and privacy_class='shared_non_sensitive'),3::bigint,'all three definitions are non-sensitive');
select is((select count(*) from public.portrait_field_definitions where source_kind='system_derived' and not allow_keyword_search),3::bigint,'reserved definitions disable keyword search');
select is((select count(*) from public.portrait_field_definitions where source_kind='system_derived' and validation_rules @> '{"unknown_when_absent":true}'),3::bigint,'absence means unknown for all reserved definitions');
select is((select count(*) from public.portrait_field_definitions where source_kind='system_derived' and allowed_filter_operators=array['is_true','is_false','is_unknown']),3::bigint,'derived booleans project fixed operators');
select is((select count(*) from public.portrait_field_definitions where source_kind='system_derived' and schema_version=1),3::bigint,'reserved definitions publish schema version one');
select is((select array_agg(field_key order by sort_order,public_id) from public.portrait_field_definitions where source_kind='system_derived'),array['has_legal_person_id','has_business_license','documents_complete'],'reserved definitions use stable secondary sorting');
select is((select count(distinct field_key) from public.portrait_field_definitions where source_kind='system_derived'),3::bigint,'reserved field keys are distinct');
select is((select count(distinct public_id) from public.portrait_field_definitions where source_kind='system_derived'),3::bigint,'reserved public ids are distinct');
select is((select count(*) from public.portrait_field_definitions where source_kind='system_derived' and version=1),3::bigint,'reserved definitions start at version one');
select is((select count(*) from public.store_derived_portrait_values),0::bigint,'reserved definitions have no default current values');
select is((select count(*) from app_private.store_derived_portrait_history),0::bigint,'reserved definitions have no default history');

insert into public.departments(id,code,name,status) overriding system value values
(23501,'portrait-sem','Portrait Semantics','active');
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,email_change)
values('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000023501','authenticated','authenticated','portrait-sem@example.test','',now(),now(),now(),'{}','{}','','','','');
insert into auth.sessions(id,user_id,created_at,updated_at) values
('23500000-0000-4000-8000-000000023501','00000000-0000-4000-8000-000000023501',now(),now());
insert into public.members(id,auth_user_id,primary_department_id,role,status,accepted_at) overriding system value values
(23501,'00000000-0000-4000-8000-000000023501',23501,'super_admin','active',now());
insert into public.accounts(id,public_id,name,created_by_member_id,updated_by_member_id) overriding system value values
(23501,'23500000-0000-4000-8000-000000000001','Synthetic Portrait Account',23501,23501);
insert into public.stores(id,public_id,account_id,name,created_by_member_id,updated_by_member_id) overriding system value values
(23501,'23500000-0000-4000-8000-000000000002',23501,'Synthetic Portrait Store',23501,23501);

insert into public.portrait_field_definitions(id,public_id,field_key,label,value_type,source_kind,privacy_class,context_scope,status,is_read_only,allow_keyword_search,sort_order,created_by_member_id,updated_by_member_id) overriding system value values
(23501,'23500000-0000-4000-8000-000000000101','sem_text','Text','text','manual','shared_non_sensitive','store_global','active',false,true,10,23501,23501),
(23502,'23500000-0000-4000-8000-000000000102','sem_single','Single','single_select','manual','shared_non_sensitive','store_global','active',false,false,20,23501,23501),
(23503,'23500000-0000-4000-8000-000000000103','sem_multi','Multi','multi_select','manual','shared_non_sensitive','store_global','active',false,false,30,23501,23501),
(23504,'23500000-0000-4000-8000-000000000104','sem_boolean','Boolean','boolean','manual','shared_non_sensitive','store_global','active',false,false,40,23501,23501),
(23505,'23500000-0000-4000-8000-000000000105','sem_number','Number','number','manual','shared_non_sensitive','store_global','active',false,false,50,23501,23501);

select is((select count(*) from public.portrait_field_definitions where id between 23501 and 23505),5::bigint,'all five manual types are accepted');
select is((select allowed_filter_operators from public.portrait_field_definitions where id=23501),array['equals','prefix'],'searchable text operators fixed');
select is((select allowed_filter_operators from public.portrait_field_definitions where id=23502),array['equals'],'single-select operators fixed');
select is((select allowed_filter_operators from public.portrait_field_definitions where id=23503),array['contains_any','contains_all'],'multi-select operators fixed');
select is((select allowed_filter_operators from public.portrait_field_definitions where id=23504),array['is_true','is_false'],'boolean operators fixed');
select is((select allowed_filter_operators from public.portrait_field_definitions where id=23505),array['eq','gte','lte','between'],'number operators fixed');
select throws_ok($$insert into public.portrait_field_definitions(field_key,label,value_type,source_kind,privacy_class,context_scope,is_read_only,allow_keyword_search,created_by_member_id,updated_by_member_id) values('bad_search','Bad','number','manual','shared_non_sensitive','store_global',false,true,23501,23501)$$,'23514',null,'number field cannot enable keyword search');
select throws_ok($$insert into public.portrait_field_definitions(field_key,label,value_type,source_kind,privacy_class,context_scope,is_read_only,created_by_member_id,updated_by_member_id) values('bad_scope','Bad','text','manual','shared_non_sensitive','store_department',false,23501,23501)$$,'23514',null,'manual field cannot be department scoped');
select throws_ok($$insert into public.portrait_field_definitions(field_key,label,value_type,source_kind,privacy_class,context_scope,is_read_only,created_by_member_id,updated_by_member_id) values('bad_private','Bad','text','manual','private','store_global',false,23501,23501)$$,'23514',null,'portrait privacy cannot become private payload');
select throws_ok($$insert into public.portrait_field_definitions(field_key,label,value_type,source_kind,privacy_class,context_scope,is_read_only,validation_rules,created_by_member_id,updated_by_member_id) values('bad_rule','Bad','text','manual','shared_non_sensitive','store_global',false,'{"email":"x"}',23501,23501)$$,'23514',null,'validation rules cannot contain sensitive keys');

insert into public.portrait_field_options(id,public_id,field_definition_id,option_key,label,created_by_member_id,updated_by_member_id) overriding system value values
(23501,'23500000-0000-4000-8000-000000000201',23502,'single_a','Single A',23501,23501),
(23502,'23500000-0000-4000-8000-000000000202',23503,'multi_a','Multi A',23501,23501),
(23503,'23500000-0000-4000-8000-000000000203',23503,'multi_b','Multi B',23501,23501);
select is((select count(*) from public.portrait_field_options where id between 23501 and 23503),3::bigint,'select options accepted only for select fields');
select throws_ok($$insert into public.portrait_field_options(field_definition_id,option_key,label,created_by_member_id,updated_by_member_id) values(23501,'bad','Bad',23501,23501)$$,'23514','PORTRAIT_OPTION_FIELD_INVALID','text field rejects options');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000023501","role":"authenticated","session_id":"23500000-0000-4000-8000-000000023501"}',true);
select is((select array_agg(key order by key) from jsonb_object_keys(public.read_portrait_catalog()) as key),array['fields','schema_version'],'catalog envelope has exact top-level keys');
select is(jsonb_array_length(public.read_portrait_catalog()->'fields'),8,'catalog contains five manual and three reserved definitions');
select is((select count(*) from jsonb_array_elements(public.read_portrait_catalog()->'fields') as field where (select array_agg(key order by key) from jsonb_object_keys(field) as key)=array['allow_keyword_search','allowed_filter_operators','capabilities','constraints','context_scope','description','field_key','label','options','privacy_level','public_id','schema_version','sort_order','source_kind','status','value_type']),8::bigint,'every catalog field has the exact wire keys');
select is((select count(*) from jsonb_array_elements(public.read_portrait_catalog()->'fields') as field where field->>'privacy_level'='shared_non_sensitive'),8::bigint,'catalog exposes only the safe privacy level');
select is((select count(*) from jsonb_array_elements(public.read_portrait_catalog()->'fields') as field where field->'capabilities'='{"can_set":false,"can_clear":false}'::jsonb),8::bigint,'read-only WBS 2.3 capabilities are explicit');
select is((select field->'allowed_filter_operators' from jsonb_array_elements(public.read_portrait_catalog()->'fields') as field where field->>'field_key'='sem_text'),'["equals","prefix"]'::jsonb,'text wire operators match the parser');
select is((select field->'allowed_filter_operators' from jsonb_array_elements(public.read_portrait_catalog()->'fields') as field where field->>'field_key'='sem_single'),'["equals"]'::jsonb,'single-select wire operators match the parser');
select is((select field->'allowed_filter_operators' from jsonb_array_elements(public.read_portrait_catalog()->'fields') as field where field->>'field_key'='sem_multi'),'["contains_any","contains_all"]'::jsonb,'multi-select wire operators match the parser');
select is((select field->'allowed_filter_operators' from jsonb_array_elements(public.read_portrait_catalog()->'fields') as field where field->>'field_key'='sem_boolean'),'["is_true","is_false"]'::jsonb,'manual boolean wire operators exclude unknown');
select is((select field->'allowed_filter_operators' from jsonb_array_elements(public.read_portrait_catalog()->'fields') as field where field->>'field_key'='has_legal_person_id'),'["is_true","is_false","is_unknown"]'::jsonb,'derived boolean wire operators include unknown');
select is((select count(*) from jsonb_array_elements(public.read_portrait_catalog()->'fields') as field where field->>'source_kind'='system_derived' and field->>'status'='reserved'),3::bigint,'baseline catalog preserves all three reserved statuses');
select is((select field->'allowed_filter_operators' from jsonb_array_elements(public.read_portrait_catalog()->'fields') as field where field->>'field_key'='sem_number'),'["eq","gte","lte","between"]'::jsonb,'number wire operators match the parser');
select is((select field->'constraints' from jsonb_array_elements(public.read_portrait_catalog()->'fields') as field where field->>'field_key'='sem_text'),'{"min_length":1,"max_length":500}'::jsonb,'text constraints match physical storage checks');
select is((select field->'constraints' from jsonb_array_elements(public.read_portrait_catalog()->'fields') as field where field->>'field_key'='sem_multi'),'{"min_selections":1,"max_selections":50}'::jsonb,'multi-select constraints match deferred completeness and link limit');
select is((select field->'constraints' from jsonb_array_elements(public.read_portrait_catalog()->'fields') as field where field->>'field_key'='sem_number'),'{"maximum_scale":12}'::jsonb,'number scale matches numeric storage');
select is((select jsonb_agg(value->>'public_id' order by ordinal) from jsonb_array_elements((select field->'options' from jsonb_array_elements(public.read_portrait_catalog()->'fields') as field where field->>'field_key'='sem_multi')) with ordinality as option(value,ordinal)),to_jsonb(array['23500000-0000-4000-8000-000000000202','23500000-0000-4000-8000-000000000203']),'nested options use stable sort order and public UUIDs');
select is((select count(*) from jsonb_array_elements(public.read_portrait_catalog()->'fields') as field where field->>'value_type' not in('single_select','multi_select') and jsonb_array_length(field->'options')<>0),0::bigint,'non-select field option arrays are empty');
select ok(not jsonb_path_exists(public.read_portrait_catalog(),'$.**.id'),'catalog contains no raw bigint id key');
reset role;

insert into public.store_portrait_values(id,public_id,store_id,field_definition_id,value_type,revision,text_value,created_by_member_id,updated_by_member_id) overriding system value values
(23501,'23500000-0000-4000-8000-000000000301',23501,23501,'text',1,'Alpha value',23501,23501);
insert into public.store_portrait_values(id,public_id,store_id,field_definition_id,value_type,revision,single_select_option_id,created_by_member_id,updated_by_member_id) overriding system value values
(23502,'23500000-0000-4000-8000-000000000302',23501,23502,'single_select',1,23501,23501,23501);
insert into public.store_portrait_values(id,public_id,store_id,field_definition_id,value_type,revision,created_by_member_id,updated_by_member_id) overriding system value values
(23503,'23500000-0000-4000-8000-000000000303',23501,23503,'multi_select',1,23501,23501);
insert into public.store_portrait_value_options(value_id,option_id,created_by_member_id) values
(23503,23502,23501),(23503,23503,23501);
insert into public.store_portrait_values(id,public_id,store_id,field_definition_id,value_type,revision,boolean_value,created_by_member_id,updated_by_member_id) overriding system value values
(23504,'23500000-0000-4000-8000-000000000304',23501,23504,'boolean',1,false,23501,23501);
insert into public.store_portrait_values(id,public_id,store_id,field_definition_id,value_type,revision,number_value,created_by_member_id,updated_by_member_id) overriding system value values
(23505,'23500000-0000-4000-8000-000000000305',23501,23505,'number',1,0.000000000001,23501,23501);

select is((select text_value from public.store_portrait_values where id=23501),'Alpha value','text slot preserves value');
select is((select text_search_value from public.store_portrait_values where id=23501),'alpha value','text search expression normalized');
select is((select single_select_option_id from public.store_portrait_values where id=23502),23501::bigint,'single-select option stored');
select is((select count(*) from public.store_portrait_value_options where value_id=23503),2::bigint,'multi-select links stored and deduplicated');
select is((select boolean_value from public.store_portrait_values where id=23504),false,'false remains a formal value');
select is((select number_value::text from public.store_portrait_values where id=23505),'0.000000000001','numeric precision preserved');
select is((select count(*) from public.store_portrait_values where status='active'),5::bigint,'five active values coexist for five fields');
select throws_ok($$insert into public.store_portrait_values(store_id,field_definition_id,value_type,revision,text_value,boolean_value,created_by_member_id,updated_by_member_id) values(23501,23501,'text',2,'Bad',true,23501,23501)$$,'23514',null,'typed slots are mutually exclusive');
select throws_ok($$insert into public.store_portrait_values(store_id,field_definition_id,value_type,revision,number_value,created_by_member_id,updated_by_member_id) values(23501,23501,'number',2,1,23501,23501)$$,'23514','PORTRAIT_VALUE_FIELD_INVALID','value type must equal definition');
select throws_ok($$insert into public.store_portrait_values(store_id,field_definition_id,value_type,revision,single_select_option_id,created_by_member_id,updated_by_member_id) values(23501,23502,'single_select',2,23502,23501,23501)$$,'23514','PORTRAIT_SINGLE_OPTION_INVALID','single option must belong to same field');
select throws_ok($$insert into public.store_portrait_value_options(value_id,option_id,created_by_member_id) values(23503,23501,23501)$$,'23514','PORTRAIT_MULTI_OPTION_INVALID','multi option must belong to same field');
select throws_ok($$insert into public.store_portrait_value_options(value_id,option_id,created_by_member_id) values(23503,23502,23501)$$,'23505',null,'multi option duplicate rejected');
select throws_ok($$update public.portrait_field_definitions set value_type='number' where id=23501$$,'23514','PORTRAIT_DEFINITION_IDENTITY_IMMUTABLE','published field type immutable');
select throws_ok($$update public.portrait_field_definitions set field_key='renamed' where id=23501$$,'23514','PORTRAIT_DEFINITION_IDENTITY_IMMUTABLE','published field key immutable');
select throws_ok($$update public.portrait_field_definitions set source_kind='system_derived' where id=23501$$,'23514','PORTRAIT_DEFINITION_IDENTITY_IMMUTABLE','published source immutable');
select throws_ok($$update public.portrait_field_definitions set context_scope='store_department' where id=23501$$,'23514','PORTRAIT_DEFINITION_IDENTITY_IMMUTABLE','published context immutable');
select throws_ok($$update public.portrait_field_definitions set status='active' where field_key='has_legal_person_id'$$,'23514','SYSTEM_DERIVED_DEFINITION_LIFECYCLE_RESERVED','reserved definition cannot activate manually');
select throws_ok($$update public.portrait_field_definitions set label='Changed' where field_key='has_business_license'$$,'23514','SYSTEM_DERIVED_DEFINITION_RESERVED','reserved definition attributes immutable');
select throws_ok($$delete from public.portrait_field_definitions where id=23501$$,'23503','PORTRAIT_DEFINITION_DELETE_FORBIDDEN','definition deletion forbidden');
select throws_ok($$delete from public.portrait_field_options where id=23501$$,'23503','PORTRAIT_OPTION_DELETE_FORBIDDEN','option deletion forbidden');
select throws_ok($$delete from public.store_portrait_values where id=23501$$,'23503','PORTRAIT_VALUE_DELETE_FORBIDDEN','value deletion forbidden');
select throws_ok($$update public.store_portrait_values set text_value='Changed' where id=23501$$,'23514','PORTRAIT_VALUE_REVISION_IMMUTABLE','formal revision content immutable');

update public.store_portrait_values set status='inactive',inactive_at=now(),inactive_by_member_id=23501,updated_by_member_id=23501 where id=23501;
select is((select status from public.store_portrait_values where id=23501),'inactive','active revision may deactivate');
select is((select version from public.store_portrait_values where id=23501),2::bigint,'deactivation increments version');
select throws_ok($$update public.store_portrait_values set status='active',inactive_at=null,inactive_by_member_id=null where id=23501$$,'23514','PORTRAIT_VALUE_ONLY_DEACTIVATION_ALLOWED','old revision cannot reactivate');
insert into public.store_portrait_values(id,public_id,store_id,field_definition_id,value_type,revision,text_value,created_by_member_id,updated_by_member_id) overriding system value values
(23506,'23500000-0000-4000-8000-000000000306',23501,23501,'text',2,'Replacement',23501,23501);
select is((select revision from public.store_portrait_values where id=23506),2::bigint,'replacement uses next revision');
select is((select count(*) from public.store_portrait_values where store_id=23501 and field_definition_id=23501 and status='active'),1::bigint,'store field has one active revision');

update public.portrait_field_options set status='inactive',inactive_at=now(),inactive_by_member_id=23501,updated_by_member_id=23501 where id=23501;
select is((select status from public.portrait_field_options where id=23501),'inactive','option may deactivate with history retained');
select throws_ok($$insert into public.store_portrait_values(store_id,field_definition_id,value_type,revision,single_select_option_id,created_by_member_id,updated_by_member_id) values(23501,23502,'single_select',2,23501,23501,23501)$$,'23514','PORTRAIT_SINGLE_OPTION_INVALID','inactive option cannot enter new value');
update public.portrait_field_definitions set status='inactive',inactive_at=now(),inactive_by_member_id=23501,updated_by_member_id=23501 where id=23505;
select is((select allowed_filter_operators from public.portrait_field_definitions where id=23505),array['eq','gte','lte','between']::text[],'inactive field retains its exact parser operator contract');
select throws_ok($$insert into public.store_portrait_values(store_id,field_definition_id,value_type,revision,number_value,created_by_member_id,updated_by_member_id) values(23501,23505,'number',2,1,23501,23501)$$,'23514','PORTRAIT_VALUE_FIELD_INVALID','inactive field cannot accept new value');
update public.portrait_field_definitions set status='active',inactive_at=null,inactive_by_member_id=null,updated_by_member_id=23501 where id=23505;
select is((select status from public.portrait_field_definitions where id=23505),'active','manual definition controlled recovery remains structurally possible');

select throws_ok($$truncate table public.portrait_field_definitions$$,'23514','PORTRAIT_APPEND_ONLY','definition truncate forbidden');
select throws_ok($$truncate table public.portrait_field_options$$,'23514','PORTRAIT_APPEND_ONLY','option truncate forbidden');
select throws_ok($$truncate table public.store_portrait_values$$,'23514','PORTRAIT_APPEND_ONLY','value truncate forbidden');
select throws_ok($$truncate table public.store_portrait_value_options$$,'23514','PORTRAIT_APPEND_ONLY','multi-link truncate forbidden');

select * from finish();
rollback;
