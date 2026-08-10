begin;

select plan(42);

select is((select count(*) from information_schema.tables where table_schema='public' and table_name in ('accounts','stores')),2::bigint,'WBS 2.1 creates accounts and stores');
select is((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('accounts','stores') and c.relrowsecurity and c.relforcerowsecurity),2::bigint,'both shared archive tables enable and force RLS');
select is((select count(*) from information_schema.columns where table_schema='public' and table_name in ('accounts','stores') and column_name='department_id'),0::bigint,'global shared archive rows never embed a department owner');

select columns_are('public','accounts',array['id','public_id','name','name_normalized','status','status_reason','status_changed_at','created_by_member_id','updated_by_member_id','created_at','updated_at','version'],'accounts exposes only the frozen WBS 2.1 columns');
select columns_are('public','stores',array['id','public_id','account_id','name','name_normalized','address_text','status','status_reason','status_changed_at','created_by_member_id','updated_by_member_id','created_at','updated_at','version'],'stores exposes only the frozen WBS 2.1 columns');
select has_pk('public','accounts','accounts has a primary key');
select has_pk('public','stores','stores has a primary key');
select col_is_unique('public','accounts','public_id','account public_id is unique');
select col_is_unique('public','stores','public_id','store public_id is unique');
select has_check('public','accounts','accounts_status_check','account status is constrained');
select has_check('public','stores','stores_status_check','store status is constrained');
select has_check('public','accounts','accounts_status_state_check','account status reason state is constrained');
select has_check('public','stores','stores_status_state_check','store status reason state is constrained');
select has_check('public','accounts','accounts_version_check','account version is positive');
select has_check('public','stores','stores_version_check','store version is positive');

select ok(exists(select 1 from pg_constraint where conrelid='public.stores'::regclass and confrelid='public.accounts'::regclass and contype='f' and confdeltype='r'),'store account foreign key restricts deletion');
select is((select count(*) from pg_constraint where conrelid in ('public.accounts'::regclass,'public.stores'::regclass) and contype='f' and confrelid='public.members'::regclass),4::bigint,'both tables bind created and updated actors to members');
select is((select count(*) from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey) where c.contype='f' and c.conrelid in ('public.accounts'::regclass,'public.stores'::regclass) and not exists(select 1 from pg_index i where i.indrelid=c.conrelid and a.attnum=any(i.indkey))),0::bigint,'every WBS 2.1 foreign key column is indexed');
select is((select count(*) from pg_indexes where schemaname='public' and indexname in ('accounts_name_normalized_idx','accounts_status_updated_idx','accounts_created_by_member_id_idx','accounts_updated_by_member_id_idx','stores_account_status_idx','stores_name_normalized_idx','stores_status_updated_idx','stores_created_by_member_id_idx','stores_updated_by_member_id_idx')),9::bigint,'all frozen search and audit indexes exist');
select is((select count(*) from pg_attribute where attrelid in ('public.accounts'::regclass,'public.stores'::regclass) and attname='name_normalized' and attgenerated='s'),2::bigint,'both normalized names are stored generated columns');
select is((select count(*) from information_schema.columns where table_schema='public' and table_name in ('accounts','stores') and column_name='status' and column_default='''active''::text'),2::bigint,'both statuses default to active');
select is((select count(*) from information_schema.columns where table_schema='public' and table_name in ('accounts','stores') and column_name='version' and column_default='1'),2::bigint,'both versions default to one');
select is((select count(*) from information_schema.columns where table_schema='public' and table_name in ('accounts','stores') and column_name in ('created_at','updated_at') and column_default='now()'),4::bigint,'both tables timestamp creation and updates');
select is((select count(*) from pg_trigger where tgrelid in ('public.accounts'::regclass,'public.stores'::regclass) and tgname in ('accounts_touch_updated_at','stores_touch_updated_at') and not tgisinternal),2::bigint,'both tables increment version and touch updated_at');
select is((select count(*) from pg_trigger where tgrelid in ('public.accounts'::regclass,'public.stores'::regclass) and tgname in ('accounts_protect_identity','stores_protect_identity') and not tgisinternal),2::bigint,'both tables protect identity and deletion');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and p.proname in ('protect_account_identity','protect_store_identity') and not p.prosecdef),2::bigint,'identity trigger helpers are security invoker');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and p.proname in ('protect_account_identity','protect_store_identity') and position('search_path=' in array_to_string(p.proconfig,','))>0),2::bigint,'identity trigger helpers fix an empty search path');

insert into public.departments(id,code,name,status) overriding system value values(2101,'archive-schema','Archive Schema Department','active');
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,email_change)
values('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000002101','authenticated','authenticated','archive-schema@example.test','',now(),now(),now(),'{}','{}','','','','');
insert into public.members(id,auth_user_id,primary_department_id,role,status,accepted_at) overriding system value values(2101,'00000000-0000-4000-8000-000000002101',2101,'super_admin','active',now());
insert into public.accounts(id,public_id,name,created_by_member_id,updated_by_member_id) overriding system value values(2101,'21000000-0000-4000-8000-000000000001','  Example   Merchant  ',2101,2101);
insert into public.stores(id,public_id,account_id,name,address_text,created_by_member_id,updated_by_member_id) overriding system value values(2101,'21000000-0000-4000-8000-000000000002',2101,'  Main   Store  ','Synthetic Road 1',2101,2101);

select is((select name_normalized from public.accounts where id=2101),'example merchant','account name normalization is deterministic');
select is((select name_normalized from public.stores where id=2101),'main store','store name normalization is deterministic');
select is((select account_id from public.stores where id=2101),2101::bigint,'store belongs to the expected shared account');
select throws_ok($$insert into public.accounts(name,created_by_member_id,updated_by_member_id) values('   ',2101,2101)$$,'23514','new row for relation "accounts" violates check constraint "accounts_name_check"','blank account name is rejected');
select throws_ok($$insert into public.stores(account_id,name,created_by_member_id,updated_by_member_id) values(2101,E'Bad\nStore',2101,2101)$$,'23514','new row for relation "stores" violates check constraint "stores_name_check"','control characters in store names are rejected');
select throws_ok($$insert into public.accounts(name,status,created_by_member_id,updated_by_member_id) values('Disabled without reason','disabled',2101,2101)$$,'23514','new row for relation "accounts" violates check constraint "accounts_status_state_check"','disabled account requires a reason');
select throws_ok($$insert into public.accounts(name,status,status_reason,created_by_member_id,updated_by_member_id) values('Active with reason','active','not allowed',2101,2101)$$,'23514','new row for relation "accounts" violates check constraint "accounts_status_state_check"','active account cannot carry a stale status reason');
select throws_ok($$insert into public.stores(account_id,name,status,created_by_member_id,updated_by_member_id) values(2101,'Inactive without reason','inactive',2101,2101)$$,'23514','new row for relation "stores" violates check constraint "stores_status_state_check"','inactive store requires a reason');
select throws_ok($$insert into public.stores(account_id,name,address_text,created_by_member_id,updated_by_member_id) values(2101,'Empty address','  ',2101,2101)$$,'23514','new row for relation "stores" violates check constraint "stores_address_check"','present store address cannot be blank');
select throws_ok($$delete from public.accounts where id=2101$$,'23503','ACCOUNT_DELETE_FORBIDDEN','account deletion is blocked');
select throws_ok($$update public.accounts set public_id=gen_random_uuid() where id=2101$$,'23514','ACCOUNT_IDENTITY_IMMUTABLE','account public identity is immutable');
select throws_ok($$update public.stores set account_id=999999 where id=2101$$,'23514','STORE_IDENTITY_IMMUTABLE','store cannot be moved between accounts directly');
update public.accounts set name='Example Merchant Updated',updated_by_member_id=2101 where id=2101;
select is((select version from public.accounts where id=2101),2::bigint,'account update increments version');
select throws_ok($$update public.accounts set created_by_member_id=999999 where id=2101$$,'23514','ACCOUNT_IDENTITY_IMMUTABLE','account creator is immutable');
select throws_ok($$delete from public.stores where id=2101$$,'23503','STORE_DELETE_FORBIDDEN','store deletion is blocked');

select * from finish();
rollback;
