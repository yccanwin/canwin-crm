begin;

select plan(53);

select is((select count(*) from information_schema.tables where (table_schema,table_name) in (('public','contacts'),('app_private','contact_secrets'))),2::bigint,'WBS 2.2 creates public contacts and private contact secrets');
select columns_are('public','contacts',array['id','public_id','store_id','role_label','is_primary','status','status_reason','status_changed_at','created_by_member_id','updated_by_member_id','created_at','updated_at','version'],'contacts exposes only frozen structural columns');
select columns_are('app_private','contact_secrets',array['contact_id','full_name','mobile','phone','email','wechat','other','created_by_member_id','updated_by_member_id','created_at','updated_at','version'],'contact secrets keeps identity and channels private');
select is((select count(*) from information_schema.columns where table_schema='public' and table_name='contacts' and column_name in('department_id','owner_member_id','opportunity_id','claim_id','full_name','mobile','phone','email','wechat','other')),0::bigint,'public contacts contains no ownership or sensitive columns');
select is((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='contacts' and c.relrowsecurity and c.relforcerowsecurity),1::bigint,'contacts enables and forces RLS');
select is((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private' and c.relname='contact_secrets' and c.relrowsecurity and c.relforcerowsecurity),1::bigint,'contact secrets enables and forces RLS');
select has_pk('public','contacts','contacts has a primary key');
select has_pk('app_private','contact_secrets','contact secrets has a primary key');
select col_is_unique('public','contacts','public_id','contact public id is unique');
select ok(exists(select 1 from pg_constraint where conrelid='public.contacts'::regclass and confrelid='public.stores'::regclass and contype='f' and confdeltype='r'),'contact store foreign key restricts deletion');
select ok(exists(select 1 from pg_constraint where conrelid='app_private.contact_secrets'::regclass and confrelid='public.contacts'::regclass and contype='f' and confdeltype='r'),'secret contact foreign key restricts deletion');
select is((select count(*) from pg_constraint where conrelid='public.contacts'::regclass and contype='f' and confrelid='public.members'::regclass),2::bigint,'contacts binds both audit actors to members');
select is((select count(*) from pg_constraint where conrelid='app_private.contact_secrets'::regclass and contype='f' and confrelid='public.members'::regclass),2::bigint,'contact secrets binds both audit actors to members');
select is((select count(*) from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey) where c.contype='f' and c.conrelid in('public.contacts'::regclass,'app_private.contact_secrets'::regclass) and not exists(select 1 from pg_index i where i.indrelid=c.conrelid and a.attnum=any(i.indkey))),0::bigint,'every WBS 2.2 foreign key column is indexed');
select is((select count(*) from pg_indexes where (schemaname,indexname) in(('public','contacts_store_status_idx'),('public','contacts_one_active_primary_per_store_idx'),('public','contacts_status_updated_idx'),('public','contacts_created_by_member_id_idx'),('public','contacts_updated_by_member_id_idx'),('app_private','contact_secrets_created_by_member_id_idx'),('app_private','contact_secrets_updated_by_member_id_idx'))),7::bigint,'all frozen WBS 2.2 indexes exist');
select ok((select indexdef like '%UNIQUE INDEX contacts_one_active_primary_per_store_idx%WHERE (is_primary AND (status = ''active''::text))' from pg_indexes where schemaname='public' and indexname='contacts_one_active_primary_per_store_idx'),'each store has at most one active primary contact');
select is((select column_default from information_schema.columns where table_schema='public' and table_name='contacts' and column_name='status'),'''active''::text','contact status defaults active');
select is((select column_default from information_schema.columns where table_schema='public' and table_name='contacts' and column_name='is_primary'),'false','contact primary flag defaults false');
select is((select count(*) from information_schema.columns where (table_schema,table_name) in(('public','contacts'),('app_private','contact_secrets')) and column_name='version' and column_default='1'),2::bigint,'both WBS 2.2 versions default to one');
select is((select count(*) from information_schema.columns where (table_schema,table_name) in(('public','contacts'),('app_private','contact_secrets')) and column_name in('created_at','updated_at') and column_default='now()'),4::bigint,'both WBS 2.2 tables timestamp creation and updates');
select is((select count(*) from pg_trigger where tgrelid in('public.contacts'::regclass,'app_private.contact_secrets'::regclass) and tgname in('contacts_touch_updated_at','contact_secrets_touch_updated_at') and not tgisinternal),2::bigint,'both WBS 2.2 tables touch updated time and version');
select is((select count(*) from pg_trigger where tgrelid in('public.contacts'::regclass,'app_private.contact_secrets'::regclass) and tgname in('contacts_protect_identity','contact_secrets_protect_identity') and not tgisinternal),2::bigint,'both WBS 2.2 tables protect identity and deletion');
select is((select count(*) from pg_trigger where tgrelid in('public.contacts'::regclass,'app_private.contact_secrets'::regclass) and tgname in('contacts_protect_truncate','contact_secrets_protect_truncate') and not tgisinternal and (tgtype & 32)=32),2::bigint,'both WBS 2.2 tables have explicit truncate protection');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and p.proname in('protect_contact_identity','protect_contact_secret_identity') and not p.prosecdef),2::bigint,'identity trigger helpers are security invoker');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and p.proname in('protect_contact_identity','protect_contact_secret_identity') and position('search_path=' in array_to_string(p.proconfig,','))>0),2::bigint,'identity trigger helpers fix an empty search path');
select is((select count(*) from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey) where c.contype='u' and c.conrelid in('public.contacts'::regclass,'app_private.contact_secrets'::regclass) and a.attname in('role_label','full_name','mobile','phone','email','wechat','other')),0::bigint,'names and channels have no automatic merge uniqueness');
select is((select count(*) from information_schema.columns where (table_schema,table_name) in(('public','contacts'),('app_private','contact_secrets')) and column_name ~* '(mask|tail|hash|digest|fingerprint)'),0::bigint,'WBS 2.2 stores no mask tail or enumerable fingerprint columns');

insert into public.departments(id,code,name,status) overriding system value values(2201,'contact-schema','Contact Schema Department','active');
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,email_change)
values('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000002201','authenticated','authenticated','contact-schema@example.test','',now(),now(),now(),'{}','{}','','','','');
insert into public.members(id,auth_user_id,primary_department_id,role,status,accepted_at) overriding system value values(2201,'00000000-0000-4000-8000-000000002201',2201,'super_admin','active',now());
insert into public.accounts(id,public_id,name,created_by_member_id,updated_by_member_id) overriding system value values(2201,'22000000-0000-4000-8000-000000000001','Synthetic Contact Account',2201,2201);
insert into public.stores(id,public_id,account_id,name,created_by_member_id,updated_by_member_id) overriding system value values(2201,'22000000-0000-4000-8000-000000000002',2201,'Synthetic Contact Store',2201,2201);
insert into public.contacts(id,public_id,store_id,role_label,is_primary,created_by_member_id,updated_by_member_id) overriding system value values(2201,'22000000-0000-4000-8000-000000000003',2201,'Operations',true,2201,2201);
insert into app_private.contact_secrets(contact_id,full_name,mobile,phone,email,wechat,other,created_by_member_id,updated_by_member_id)
values(2201,'Synthetic Person','00000000000','555-0100','contact-person@example.test','synthetic_wechat','Synthetic alternate channel',2201,2201);
insert into public.contacts(id,public_id,store_id,role_label,is_primary,status,status_reason,created_by_member_id,updated_by_member_id) overriding system value
values(2202,'22000000-0000-4000-8000-000000000004',2201,'Former Primary',true,'inactive','Synthetic inactive primary',2201,2201);
insert into public.contacts(id,public_id,store_id,role_label,is_primary,created_by_member_id,updated_by_member_id) overriding system value
values(2203,'22000000-0000-4000-8000-000000000005',2201,'Secondary Contact',false,2201,2201);

create temporary table wbs_2_2_constraint_probe (
  probe text primary key,
  sqlstate text not null
);
do $$
begin
  begin
    insert into public.contacts(store_id,role_label,is_primary,created_by_member_id,updated_by_member_id)
    values(2201,'Duplicate Active Primary',true,2201,2201);
  exception when others then
    insert into wbs_2_2_constraint_probe values('duplicate_primary',sqlstate);
  end;
end;
$$;

select is((select store_id from public.contacts where id=2201),2201::bigint,'contact belongs to exactly one store');
select is((select role_label from public.contacts where id=2201),'Operations','contact preserves its non-identifying role label');
select is((select count(*) from public.contacts where store_id=2201 and is_primary and status='active'),1::bigint,'one active primary contact is accepted per store');
select is((select count(*) from public.contacts where store_id=2201 and is_primary and status='inactive'),1::bigint,'inactive historical primary contact remains representable');
select is((select count(*) from public.contacts where store_id=2201 and not is_primary and status='active'),1::bigint,'multiple active non-primary contacts remain allowed');
select is((select sqlstate from wbs_2_2_constraint_probe where probe='duplicate_primary'),'23505','second active primary contact is rejected atomically');
select throws_ok($$insert into public.contacts(store_id,role_label,created_by_member_id,updated_by_member_id) values(2201,'   ',2201,2201)$$,'23514','new row for relation "contacts" violates check constraint "contacts_role_label_check"','blank role label is rejected');
select throws_ok($$insert into public.contacts(store_id,role_label,created_by_member_id,updated_by_member_id) values(2201,E'Bad\nRole',2201,2201)$$,'23514','new row for relation "contacts" violates check constraint "contacts_role_label_check"','control characters in role label are rejected');
select throws_ok($$insert into public.contacts(store_id,role_label,status,created_by_member_id,updated_by_member_id) values(2201,'Inactive','inactive',2201,2201)$$,'23514','new row for relation "contacts" violates check constraint "contacts_status_state_check"','inactive contact requires a reason');
select throws_ok($$insert into public.contacts(store_id,role_label,status,status_reason,created_by_member_id,updated_by_member_id) values(2201,'Active','active','stale reason',2201,2201)$$,'23514','new row for relation "contacts" violates check constraint "contacts_status_state_check"','active contact cannot carry a stale reason');
select throws_ok($$insert into public.contacts(store_id,role_label,version,created_by_member_id,updated_by_member_id) values(2201,'Bad version',0,2201,2201)$$,'23514','new row for relation "contacts" violates check constraint "contacts_version_check"','contact version must be positive');
select throws_ok($$update app_private.contact_secrets set full_name='  ' where contact_id=2201$$,'23514','new row for relation "contact_secrets" violates check constraint "contact_secrets_full_name_check"','blank private name is rejected');
select throws_ok($$update app_private.contact_secrets set mobile='  ' where contact_id=2201$$,'23514','new row for relation "contact_secrets" violates check constraint "contact_secrets_mobile_check"','blank mobile is rejected');
select throws_ok($$update app_private.contact_secrets set email=E'bad\n@example.test' where contact_id=2201$$,'23514','new row for relation "contact_secrets" violates check constraint "contact_secrets_email_check"','control characters in email are rejected');
select throws_ok($$insert into app_private.contact_secrets(contact_id,version,created_by_member_id,updated_by_member_id) values(2203,0,2201,2201)$$,'23514','new row for relation "contact_secrets" violates check constraint "contact_secrets_version_check"','secret version must be positive');
select throws_ok($$delete from public.contacts where id=2201$$,'23503','CONTACT_DELETE_FORBIDDEN','contact deletion is blocked');
select throws_ok($$update public.contacts set public_id=gen_random_uuid() where id=2201$$,'23514','CONTACT_IDENTITY_IMMUTABLE','contact public identity is immutable');
select throws_ok($$update public.contacts set store_id=999999 where id=2201$$,'23514','CONTACT_IDENTITY_IMMUTABLE','contact cannot move between stores');
select throws_ok($$update public.contacts set created_by_member_id=999999 where id=2201$$,'23514','CONTACT_IDENTITY_IMMUTABLE','contact creator is immutable');
update public.contacts set role_label='Updated Operations',updated_by_member_id=2201 where id=2201;
select is((select version from public.contacts where id=2201),2::bigint,'contact update increments version');
select throws_ok($$delete from app_private.contact_secrets where contact_id=2201$$,'23503','CONTACT_SECRET_DELETE_FORBIDDEN','contact secret deletion is blocked');
select throws_ok($$update app_private.contact_secrets set contact_id=999999 where contact_id=2201$$,'23514','CONTACT_SECRET_IDENTITY_IMMUTABLE','secret cannot move between contacts');
select throws_ok($$update app_private.contact_secrets set created_by_member_id=999999 where contact_id=2201$$,'23514','CONTACT_SECRET_IDENTITY_IMMUTABLE','secret creator is immutable');
update app_private.contact_secrets set mobile='00000000001',updated_by_member_id=2201 where contact_id=2201;
select is((select version from app_private.contact_secrets where contact_id=2201),2::bigint,'secret update increments version');

do $$
begin
  begin
    truncate table public.contacts, app_private.contact_secrets;
  exception when others then
    insert into wbs_2_2_constraint_probe values('contacts_truncate',sqlstate);
  end;
  begin
    truncate table app_private.contact_secrets;
  exception when others then
    insert into wbs_2_2_constraint_probe values('contact_secrets_truncate',sqlstate);
  end;
end;
$$;
select is((select sqlstate from wbs_2_2_constraint_probe where probe='contacts_truncate'),'23503','contacts truncate is blocked explicitly');
select is((select sqlstate from wbs_2_2_constraint_probe where probe='contact_secrets_truncate'),'23503','contact secrets truncate is blocked explicitly');

select * from finish();
rollback;
