begin;

select plan(47);

select is(
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in (
    'domain_event_definitions', 'audit_log', 'domain_events', 'event_outbox', 'operational_errors'
  )), 5::bigint, 'WBS 1.6 creates five public observability foundation tables'
);
select ok(to_regclass('app_private.aggregate_event_sequences') is not null, 'aggregate sequence state stays private');
select ok((select relrowsecurity from pg_class where oid='app_private.aggregate_event_sequences'::regclass), 'private aggregate sequence state enables RLS');
select ok((select relforcerowsecurity from pg_class where oid='app_private.aggregate_event_sequences'::regclass), 'private aggregate sequence state forces RLS');
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in (
     'domain_event_definitions', 'audit_log', 'domain_events', 'event_outbox', 'operational_errors'
   ) and c.relrowsecurity and c.relforcerowsecurity),
  5::bigint, 'all five public tables enable and force RLS'
);
select is(
  (select count(*) from pg_policy where polrelid in (
    'public.domain_event_definitions'::regclass, 'public.audit_log'::regclass,
    'public.domain_events'::regclass, 'public.event_outbox'::regclass,
    'public.operational_errors'::regclass
  )), 0::bigint, 'ledger tables expose no row policy'
);
select is(
  (select count(*) from information_schema.role_table_grants where table_schema = 'public'
   and table_name in ('domain_event_definitions','audit_log','domain_events','event_outbox','operational_errors')
   and grantee = 'anon'), 0::bigint, 'anon has no ledger table grants'
);
select is(
  (select count(*) from information_schema.role_table_grants where table_schema = 'public'
   and table_name in ('domain_event_definitions','audit_log','domain_events','event_outbox','operational_errors')
   and grantee = 'authenticated'), 0::bigint, 'authenticated has no ledger table grants'
);
select is(
  (select count(*) from information_schema.role_table_grants where table_schema = 'public'
   and table_name in ('domain_event_definitions','audit_log','domain_events','event_outbox','operational_errors')
   and grantee = 'service_role' and privilege_type = 'SELECT'),
  5::bigint, 'service_role receives SELECT on each ledger table'
);
select is(
  (select count(*) from information_schema.role_table_grants where table_schema = 'public'
   and table_name in ('domain_event_definitions','audit_log','domain_events','event_outbox','operational_errors')
   and grantee = 'service_role' and privilege_type <> 'SELECT'),
  0::bigint, 'service_role receives no ledger table writes'
);
select ok(
  not has_table_privilege('service_role', 'app_private.aggregate_event_sequences', 'SELECT,INSERT,UPDATE,DELETE'),
  'service_role cannot access private aggregate sequence state'
);
select is(
  (select count(*) from pg_trigger where tgrelid in (
    'public.domain_event_definitions'::regclass, 'public.audit_log'::regclass,
    'public.domain_events'::regclass, 'public.operational_errors'::regclass
  ) and not tgisinternal and tgname like '%append_only'),
  4::bigint, 'four append-only tables have immutable statement triggers'
);
select is(
  (select count(*) from pg_trigger where tgrelid = 'public.event_outbox'::regclass
   and not tgisinternal and tgname like 'event_outbox_protect_%'),
  2::bigint, 'outbox protects row envelopes and truncate separately'
);
select ok(
  exists (select 1 from pg_event_trigger where evtname = 'canwin_secure_new_public_tables' and evtenabled = 'O'),
  'secure public table DDL event trigger is enabled'
);

create table public.wbs_1_6_future_table_probe (id bigint primary key);
select ok((select relrowsecurity from pg_class where oid = 'public.wbs_1_6_future_table_probe'::regclass), 'future public table automatically enables RLS');
select ok((select relforcerowsecurity from pg_class where oid = 'public.wbs_1_6_future_table_probe'::regclass), 'future public table automatically forces RLS');
select is(
  (select count(*) from information_schema.role_table_grants where table_schema = 'public'
   and table_name = 'wbs_1_6_future_table_probe' and grantee in ('anon','authenticated','service_role')),
  0::bigint, 'future public table receives no API-role grants'
);

create table public.wbs_1_6_ctas_probe as select 1::bigint as id;
select ok((select relrowsecurity from pg_class where oid = 'public.wbs_1_6_ctas_probe'::regclass), 'CREATE TABLE AS automatically enables RLS');
select ok((select relforcerowsecurity from pg_class where oid = 'public.wbs_1_6_ctas_probe'::regclass), 'CREATE TABLE AS automatically forces RLS');
select is(
  (select count(*) from information_schema.role_table_grants where table_schema = 'public'
   and table_name = 'wbs_1_6_ctas_probe' and grantee in ('anon','authenticated','service_role')),
  0::bigint, 'CREATE TABLE AS receives no API-role grants'
);

select 1::bigint as id into public.wbs_1_6_select_into_probe;
select ok((select relrowsecurity from pg_class where oid = 'public.wbs_1_6_select_into_probe'::regclass), 'SELECT INTO automatically enables RLS');
select ok((select relforcerowsecurity from pg_class where oid = 'public.wbs_1_6_select_into_probe'::regclass), 'SELECT INTO automatically forces RLS');
select is(
  (select count(*) from information_schema.role_table_grants where table_schema = 'public'
   and table_name = 'wbs_1_6_select_into_probe' and grantee in ('anon','authenticated','service_role')),
  0::bigint, 'SELECT INTO receives no API-role grants'
);

select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.domain_event_definitions'::regclass
          and conname = 'domain_event_definitions_pkey'),
  'event definitions are version-keyed'
);
select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.domain_event_definitions'::regclass
          and conname = 'domain_event_definitions_schema_fingerprint_matches_check'),
  'definition fingerprint is constrained to canonical schema JSON hash'
);
select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.domain_events'::regclass
          and conname = 'domain_events_stream_key' and contype = 'u'),
  'aggregate sequence is unique inside each stream'
);
select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.domain_events'::regclass
          and conname = 'domain_events_idempotency_key' and contype = 'u'),
  'producer idempotency key is unique'
);
select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.event_outbox'::regclass
          and conname = 'event_outbox_event_id_key' and contype = 'u'),
  'each event has at most one outbox envelope'
);
select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.event_outbox'::regclass
          and conname = 'event_outbox_event_envelope_fkey' and cardinality(conkey) = 4),
  'outbox event type, version, and correlation are DB-bound to its event'
);
select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.domain_events'::regclass
          and conname = 'domain_events_causation_fkey' and cardinality(conkey) = 2),
  'causation and correlation consistency is DB-enforced'
);
select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.event_outbox'::regclass
          and conname = 'event_outbox_state_shape_check'),
  'outbox has a strict state-shape constraint'
);
select is(
  (select column_default from information_schema.columns where table_schema='public' and table_name='event_outbox' and column_name='max_attempts'),
  '8', 'outbox retry ceiling defaults to eight'
);
select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'event_outbox_ready_idx'
          and indexdef like '%WHERE (status = ANY%'),
  'outbox ready queue uses a partial index'
);
select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'domain_events_causation_idx'),
  'causation lookup is indexed'
);
select is(
  (select count(*)
   from pg_constraint c
   where c.contype = 'f' and c.connamespace = 'public'::regnamespace
     and c.conrelid in ('public.audit_log'::regclass,'public.domain_events'::regclass,
       'public.event_outbox'::regclass,'public.operational_errors'::regclass)
     and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and c.conkey[1] = any(i.indkey))),
  0::bigint, 'every WBS 1.6 foreign-key column is indexed'
);
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app_private' and p.proname in (
     'write_audit_log','record_operational_error','emit_domain_event','get_observability_snapshot'
   ) and p.prosecdef),
  4::bigint, 'private writers and metrics implementation are security definer'
);
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app_private' and p.proname in (
     'write_audit_log','record_operational_error','emit_domain_event','get_observability_snapshot'
   ) and position('search_path=' in array_to_string(p.proconfig, ',')) = 0),
  0::bigint, 'every privileged WBS 1.6 function fixes search_path'
);
select ok(
  not (select prosecdef from pg_proc where oid = 'public.get_observability_snapshot(integer,uuid)'::regprocedure),
  'public metrics wrapper is security invoker'
);
select ok(has_function_privilege('authenticated','public.get_observability_snapshot(integer,uuid)','EXECUTE'), 'authenticated may enter guarded metrics RPC');
select ok(not has_function_privilege('anon','public.get_observability_snapshot(integer,uuid)','EXECUTE'), 'anon cannot call metrics RPC');
select ok(not has_function_privilege('service_role','public.get_observability_snapshot(integer,uuid)','EXECUTE'), 'service_role cannot bypass metrics actor check');
select is(
  (select count(*) from (values ('anon'),('authenticated'),('service_role')) as roles(role_name)
   where has_function_privilege(role_name, 'app_private.emit_domain_event(text,integer,text,text,text,uuid,jsonb,uuid,bigint,uuid)', 'EXECUTE')),
  0::bigint, 'no API role can execute the private event writer'
);
select is(
  (select count(*) from (values
    ('public.audit_log_id_seq'),('public.domain_events_id_seq'),
    ('public.event_outbox_id_seq'),('public.operational_errors_id_seq')
  ) as sequences(sequence_name)
   where has_sequence_privilege('service_role', sequence_name, 'USAGE')
      or has_sequence_privilege('service_role', sequence_name, 'SELECT')),
  0::bigint, 'service_role receives no identity-sequence privilege'
);

create temporary table wbs_1_6_mutation_probe (label text primary key, sqlstate text);
do $$
begin
  begin update public.domain_event_definitions set registered_by = registered_by; exception when others then insert into wbs_1_6_mutation_probe values ('definitions_update', sqlstate); end;
  begin truncate public.audit_log; exception when others then insert into wbs_1_6_mutation_probe values ('audit_truncate', sqlstate); end;
  begin delete from public.domain_events; exception when others then insert into wbs_1_6_mutation_probe values ('events_delete', sqlstate); end;
  begin update public.operational_errors set severity = severity; exception when others then insert into wbs_1_6_mutation_probe values ('errors_update', sqlstate); end;
end;
$$;
select is((select sqlstate from wbs_1_6_mutation_probe where label = 'definitions_update'), 'CW405', 'event definitions reject UPDATE even without matching rows');
select is((select sqlstate from wbs_1_6_mutation_probe where label = 'audit_truncate'), 'CW405', 'audit ledger rejects TRUNCATE');
select is((select sqlstate from wbs_1_6_mutation_probe where label = 'events_delete'), 'CW405', 'domain-event ledger rejects DELETE even without matching rows');
select is((select sqlstate from wbs_1_6_mutation_probe where label = 'errors_update'), 'CW405', 'operational-error ledger rejects UPDATE even without matching rows');

select * from finish();
rollback;
