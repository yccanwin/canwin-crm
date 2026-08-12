begin;

select plan(70);

select has_table('public','portrait_field_definitions','definitions table exists');
select has_table('public','portrait_field_options','options table exists');
select has_table('public','store_portrait_values','manual revisions table exists');
select has_table('public','store_portrait_value_options','multi-select links table exists');
select has_table('public','store_derived_portrait_values','derived current table exists');
select has_table('app_private','store_derived_portrait_history','derived private history exists');
select has_pk('public','portrait_field_definitions','definitions has PK');
select has_pk('public','portrait_field_options','options has PK');
select has_pk('public','store_portrait_values','manual values has PK');
select has_pk('public','store_portrait_value_options','multi links has composite PK');
select has_pk('public','store_derived_portrait_values','derived current has PK');
select has_pk('app_private','store_derived_portrait_history','derived history has PK');
select col_is_unique('public','portrait_field_definitions','public_id','definition public id unique');
select col_is_unique('public','portrait_field_definitions','field_key','field key unique');
select col_is_unique('public','portrait_field_options','public_id','option public id unique');
select col_is_unique('public','store_portrait_values','public_id','value public id unique');
select col_is_unique('public','store_derived_portrait_values','public_id','derived public id unique');
select has_column('public','departments','public_id','department context has a public UUID');
select col_is_unique('public','departments','public_id','department public UUID is unique');
select is((select count(*) from pg_extension where extname='pg_trgm'),1::bigint,'pg_trgm installed');
select is((select extversion is not null from pg_extension where extname='pg_trgm'),true,'pg_trgm uses server default version');
select is((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where (n.nspname,c.relname) in (('public','portrait_field_definitions'),('public','portrait_field_options'),('public','store_portrait_values'),('public','store_portrait_value_options'),('public','store_derived_portrait_values'),('app_private','store_derived_portrait_history')) and c.relrowsecurity and c.relforcerowsecurity),6::bigint,'all six tables enable and force RLS');
select is((select count(*) from information_schema.columns where table_schema='public' and table_name='portrait_field_definitions' and column_name in('schema_version','public_id','field_key','value_type','source_kind','privacy_class','context_scope','status','allow_keyword_search','allowed_filter_operators','sort_order','created_at','updated_at','version')),14::bigint,'definition contract columns exist');
select is((select count(*) from information_schema.columns where table_schema='public' and table_name='portrait_field_options' and column_name in('public_id','field_definition_id','option_key','label','status','sort_order','created_at','updated_at','version')),9::bigint,'option contract columns exist');
select is((select count(*) from information_schema.columns where table_schema='public' and table_name='store_portrait_values' and column_name in('public_id','store_id','field_definition_id','value_type','revision','status','text_value','text_search_value','single_select_option_id','boolean_value','number_value','created_at','updated_at','version')),14::bigint,'typed revision columns exist');
select is((select count(*) from information_schema.columns where table_schema='public' and table_name='store_derived_portrait_values' and column_name in('store_id','field_definition_id','department_id','freshness','boolean_value','calculation_version','source_version','computed_at','source_changed_at','reason_code','version')),11::bigint,'derived freshness columns exist');
select is((select count(*) from information_schema.columns where table_schema='app_private' and table_name='store_derived_portrait_history' and column_name in('derived_value_id','store_id','field_definition_id','department_id','revision','freshness','boolean_value','reason_code','recorded_at')),9::bigint,'history envelope columns exist');
select is((select count(*) from information_schema.columns where table_name in('portrait_field_definitions','portrait_field_options','store_portrait_values','store_portrait_value_options','store_derived_portrait_values','store_derived_portrait_history') and column_name ~* '(contact|mobile|phone|email|wechat|document_id|storage|ocr|owner|opportunity|claim|follow)'),0::bigint,'portrait schema contains no forbidden domain or sensitive columns');
select is((select count(*) from pg_constraint where conrelid in('public.portrait_field_options'::regclass,'public.store_portrait_values'::regclass,'public.store_portrait_value_options'::regclass,'public.store_derived_portrait_values'::regclass,'app_private.store_derived_portrait_history'::regclass) and contype='f' and confdeltype<>'r'),0::bigint,'all portrait foreign keys restrict deletion');
select is((select count(*) from pg_constraint where conrelid='public.portrait_field_definitions'::regclass and contype='f' and confrelid='public.members'::regclass),3::bigint,'definition audit member references exist');
select is((select count(*) from pg_constraint where conrelid='public.portrait_field_options'::regclass and contype='f' and confrelid='public.members'::regclass),3::bigint,'option audit member references exist');
select is((select count(*) from pg_constraint where conrelid='public.store_portrait_values'::regclass and contype='f' and confrelid='public.members'::regclass),3::bigint,'value audit member references exist');
select is((select count(*) from pg_constraint where conrelid='public.store_portrait_value_options'::regclass and contype='f' and confrelid='public.members'::regclass),1::bigint,'multi link creator reference exists');
select ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='portrait_field_definitions_status_sort_idx'),'definition stable sort index exists');
select ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='portrait_field_definitions_type_source_idx'),'definition type filter index exists');
select ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='portrait_field_options_field_sort_idx'),'option stable sort index exists');
select ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='store_portrait_values_one_active_idx'),'one active revision index exists');
select ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='store_portrait_values_store_status_idx'),'store field lookup index exists');
select ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='store_portrait_values_field_status_idx'),'field reverse lookup index exists');
select ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='store_portrait_values_single_option_idx'),'single option FK index exists');
select ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='store_portrait_value_options_option_value_idx'),'multi option reverse index exists');
select ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='store_derived_portrait_values_global_unique_idx'),'derived global uniqueness exists');
select ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='store_derived_portrait_values_department_unique_idx'),'derived department uniqueness exists');
select ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='store_derived_portrait_values_field_freshness_idx'),'derived freshness filter index exists');
select ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='store_derived_portrait_values_department_freshness_idx'),'derived department filter index exists');
select ok(exists(select 1 from pg_indexes where schemaname='app_private' and indexname='store_derived_portrait_history_current_timeline_idx'),'history current timeline index exists');
select ok(exists(select 1 from pg_indexes where schemaname='app_private' and indexname='store_derived_portrait_history_store_field_idx'),'history store timeline index exists');
select ok(exists(
  select 1
  from pg_index i
  join pg_class idx on idx.oid=i.indexrelid
  join pg_class tbl on tbl.oid=i.indrelid
  join pg_namespace tbl_ns on tbl_ns.oid=tbl.relnamespace
  join pg_am am on am.oid=idx.relam
  join pg_attribute attr on attr.attrelid=tbl.oid and attr.attnum=i.indkey[0]
  join pg_opclass opc on opc.oid=i.indclass[0]
  join pg_namespace opc_ns on opc_ns.oid=opc.opcnamespace
  where tbl_ns.nspname='public'
    and tbl.relname='store_portrait_values'
    and idx.relname='store_portrait_values_text_trgm_idx'
    and am.amname='gin'
    and attr.attname='text_search_value'
    and opc_ns.nspname='extensions'
    and opc.opcname='gin_trgm_ops'
    and i.indpred is not null
    and pg_get_expr(i.indpred,i.indrelid) like '%status%active%'
    and pg_get_expr(i.indpred,i.indrelid) like '%source_kind%manual%'
    and pg_get_expr(i.indpred,i.indrelid) like '%value_type%text%'
),'trigram index covers active manual text rows without cross-table predicate');
select is((select count(*) from pg_trigger where tgrelid in('public.portrait_field_definitions'::regclass,'public.portrait_field_options'::regclass,'public.store_portrait_values'::regclass,'public.store_portrait_value_options'::regclass,'public.store_derived_portrait_values'::regclass,'app_private.store_derived_portrait_history'::regclass) and not tgisinternal),17::bigint,'all lifecycle and append-only triggers exist');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and p.proname in('protect_portrait_definition','validate_portrait_option','validate_store_portrait_value','validate_store_portrait_value_option','require_portrait_multi_options','validate_derived_portrait_value','validate_derived_portrait_history','reject_portrait_mutation') and not p.prosecdef),8::bigint,'all trigger helpers are security invoker');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and p.proname in('protect_portrait_definition','validate_portrait_option','validate_store_portrait_value','validate_store_portrait_value_option','require_portrait_multi_options','validate_derived_portrait_value','validate_derived_portrait_history','reject_portrait_mutation','portrait_current_department_id') and position('search_path=' in array_to_string(p.proconfig,','))>0),9::bigint,'all private helpers fix empty search path');
select ok((select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and p.proname='portrait_current_department_id'),'department authority helper is security definer');
select has_function('public','read_portrait_catalog',array[]::text[],'catalog wire projection exists');
select has_function('public','read_store_derived_portraits',array['uuid'],'derived wire projection exists');
select ok((select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='read_portrait_catalog'),'catalog projection is a guarded security definer');
select ok((select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='read_store_derived_portraits'),'derived projection is a guarded security definer');
select ok((select position('search_path=' in array_to_string(p.proconfig,','))>0 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='read_portrait_catalog'),'catalog projection fixes empty search path');
select ok((select position('search_path=' in array_to_string(p.proconfig,','))>0 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='read_store_derived_portraits'),'derived projection fixes empty search path');
select is((select count(*) from pg_policies where schemaname='public' and tablename in('portrait_field_definitions','portrait_field_options','store_portrait_values','store_portrait_value_options','store_derived_portrait_values') and cmd='SELECT' and roles='{authenticated}'),5::bigint,'five public tables expose only authenticated select policies');
select is((select count(*) from pg_policies where schemaname='public' and tablename in('portrait_field_definitions','portrait_field_options','store_portrait_values','store_portrait_value_options','store_derived_portrait_values') and cmd<>'SELECT'),0::bigint,'no public portrait write policy exists');
select is((select count(*) from pg_policies where schemaname='app_private' and tablename='store_derived_portrait_history'),0::bigint,'private history has no policy');
select is((select count(*) from information_schema.role_table_grants where table_schema='public' and table_name in('portrait_field_definitions','portrait_field_options','store_portrait_values','store_portrait_value_options','store_derived_portrait_values') and grantee='authenticated' and privilege_type='SELECT'),0::bigint,'authenticated cannot bypass wire projections with raw SELECT');
select is((select count(*) from information_schema.role_table_grants where table_name in('portrait_field_definitions','portrait_field_options','store_portrait_values','store_portrait_value_options','store_derived_portrait_values','store_derived_portrait_history') and grantee='authenticated' and privilege_type<>'SELECT'),0::bigint,'authenticated has no portrait write grant');
select is((select count(*) from information_schema.role_table_grants where table_name in('portrait_field_definitions','portrait_field_options','store_portrait_values','store_portrait_value_options','store_derived_portrait_values','store_derived_portrait_history') and grantee='service_role'),0::bigint,'service role has no portrait table grant');
select is((select count(*) from information_schema.role_usage_grants where object_name in('portrait_field_definitions_id_seq','portrait_field_options_id_seq','store_portrait_values_id_seq','store_derived_portrait_values_id_seq','store_derived_portrait_history_id_seq') and grantee in('anon','authenticated','service_role')),0::bigint,'Data API roles have no portrait sequence usage');
select is((select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename in('portrait_field_definitions','portrait_field_options','store_portrait_values','store_portrait_value_options','store_derived_portrait_values','store_derived_portrait_history')),0::bigint,'portrait tables are excluded from Realtime');
select is((select count(*) from public.portrait_field_definitions where source_kind='system_derived' and status='reserved'),3::bigint,'three reserved definitions exist');
select is((select count(*) from public.store_derived_portrait_values),0::bigint,'migration inserts no derived current value');
select is((select count(*) from app_private.store_derived_portrait_history),0::bigint,'migration inserts no derived history');
select is((select count(*) from public.portrait_field_definitions where source_kind='system_derived' and (value_type<>'boolean' or privacy_class<>'shared_non_sensitive' or not is_read_only or allow_keyword_search)),0::bigint,'reserved definitions have frozen safe attributes');

select * from finish();
rollback;
