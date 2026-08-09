begin;

select plan(43);

create temporary table wbs_1_6_trace_results (label text primary key, value jsonb);
insert into wbs_1_6_trace_results values
  ('first', app_private.new_trace_context('26000000-0000-4000-8000-000000000001')),
  ('second', app_private.new_trace_context('26000000-0000-4000-8000-000000000001'));

select is((select jsonb_typeof(value) from wbs_1_6_trace_results where label = 'first'), 'object', 'trace context is a JSON object');
select is((select count(*) from jsonb_object_keys((select value from wbs_1_6_trace_results where label = 'first'))), 2::bigint, 'trace context contains exactly two keys');
select ok((select (value ->> 'request_id')::uuid is not null from wbs_1_6_trace_results where label = 'first'), 'request_id is DB generated');
select is((select (value ->> 'correlation_id')::uuid from wbs_1_6_trace_results where label = 'first'), '26000000-0000-4000-8000-000000000001'::uuid, 'supplied correlation is preserved');
select is(
  (select value ->> 'request_id' from wbs_1_6_trace_results where label = 'first'),
  (select value ->> 'request_id' from wbs_1_6_trace_results where label = 'second'),
  'trace helper reuses request_id inside one transaction'
);

select is(
  app_private.rpc_success('{}', '26000000-0000-4000-8000-000000000002', '26000000-0000-4000-8000-000000000003') ->> 'request_id',
  '26000000-0000-4000-8000-000000000002', 'explicit success envelope reuses request_id'
);
select is(
  app_private.rpc_success('{}', '26000000-0000-4000-8000-000000000002', '26000000-0000-4000-8000-000000000003') ->> 'correlation_id',
  '26000000-0000-4000-8000-000000000003', 'explicit success envelope reuses correlation_id'
);
select ok((app_private.rpc_success('{}') ->> 'correlation_id')::uuid is not null, 'legacy success helper remains backward compatible');
select is(
  app_private.rpc_error('SYNTHETIC_ERROR','{}','26000000-0000-4000-8000-000000000004','26000000-0000-4000-8000-000000000005') #>> '{error,request_id}',
  '26000000-0000-4000-8000-000000000004', 'explicit error envelope reuses request_id'
);
select is(
  app_private.rpc_error('SYNTHETIC_ERROR','{}','26000000-0000-4000-8000-000000000004','26000000-0000-4000-8000-000000000005') #>> '{error,correlation_id}',
  '26000000-0000-4000-8000-000000000005', 'explicit error envelope reuses correlation_id'
);
select is(
  app_private.rpc_error('SYNTHETIC_ERROR','{}','26000000-0000-4000-8000-000000000004','26000000-0000-4000-8000-000000000005') ->> 'request_id',
  '26000000-0000-4000-8000-000000000004', 'error envelope repeats request_id at the root'
);
select is(
  app_private.rpc_error('SYNTHETIC_ERROR','{}','26000000-0000-4000-8000-000000000004','26000000-0000-4000-8000-000000000005') ->> 'correlation_id',
  '26000000-0000-4000-8000-000000000005', 'error envelope repeats correlation_id at the root'
);

create temporary table wbs_1_6_safe_errors (label text primary key, sqlstate text);
do $$
begin
  begin perform app_private.rpc_error('SYNTHETIC_ERROR','{"nested":{"refresh_token":"synthetic"}}');
  exception when others then insert into wbs_1_6_safe_errors values ('safe_params', sqlstate); end;
  begin perform app_private.rpc_error('SYNTHETIC_ERROR','{"note":"person@corp.invalid"}');
  exception when others then insert into wbs_1_6_safe_errors values ('email_value', sqlstate); end;
  begin perform app_private.rpc_error('SYNTHETIC_ERROR','{"note":"person@corp.invalid synthetic@example.test"}');
  exception when others then insert into wbs_1_6_safe_errors values ('mixed_email_value', sqlstate); end;
  begin perform app_private.rpc_error('SYNTHETIC_ERROR','{"note":"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzeW50aGV0aWMifQ.signature"}');
  exception when others then insert into wbs_1_6_safe_errors values ('jwt_value', sqlstate); end;
  begin perform app_private.rpc_error('SYNTHETIC_ERROR','{"note":"/documents/company/license.pdf"}');
  exception when others then insert into wbs_1_6_safe_errors values ('storage_value', sqlstate); end;
end;
$$;
select is((select sqlstate from wbs_1_6_safe_errors where label = 'safe_params'), 'CW422', 'error safe_params recursively reject sensitive keys');
select is((select sqlstate from wbs_1_6_safe_errors where label = 'email_value'), 'CW422', 'safe JSON rejects non-example email values');
select is((select sqlstate from wbs_1_6_safe_errors where label = 'mixed_email_value'), 'CW422', 'safe JSON rejects a non-example email even when mixed with an example.test address');
select is((select sqlstate from wbs_1_6_safe_errors where label = 'jwt_value'), 'CW422', 'safe JSON rejects JWT-shaped values');
select is((select sqlstate from wbs_1_6_safe_errors where label = 'storage_value'), 'CW422', 'safe JSON rejects document storage paths');

insert into public.departments (id, code, name, status) overriding system value values
  (1601, 'obs-a', 'Observability A', 'active'),
  (1602, 'obs-b', 'Observability B', 'active');
insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,
  raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,email_change
)
select '00000000-0000-0000-0000-000000000000', user_id, 'authenticated', 'authenticated', email, '',
  now(),now(),now(),'{}','{}','','','',''
from (values
  ('00000000-0000-4000-8000-000000001601'::uuid,'obs-super@example.test'),
  ('00000000-0000-4000-8000-000000001602'::uuid,'obs-manager@example.test'),
  ('00000000-0000-4000-8000-000000001603'::uuid,'obs-sales@example.test'),
  ('00000000-0000-4000-8000-000000001604'::uuid,'obs-disabled@example.test'),
  ('00000000-0000-4000-8000-000000001605'::uuid,'obs-inactive-dept@example.test')
) as fixture(user_id,email);
insert into auth.sessions (id,user_id,created_at,updated_at) values
  ('27000000-0000-4000-8000-000000001601','00000000-0000-4000-8000-000000001601',now(),now()),
  ('27000000-0000-4000-8000-000000001602','00000000-0000-4000-8000-000000001602',now(),now()),
  ('27000000-0000-4000-8000-000000001603','00000000-0000-4000-8000-000000001603',now(),now()),
  ('27000000-0000-4000-8000-000000001604','00000000-0000-4000-8000-000000001604',now(),now()),
  ('27000000-0000-4000-8000-000000001605','00000000-0000-4000-8000-000000001605',now(),now());
insert into public.members (id,auth_user_id,primary_department_id,role,status,accepted_at)
overriding system value values
  (1601,'00000000-0000-4000-8000-000000001601',1601,'super_admin','active',now()),
  (1602,'00000000-0000-4000-8000-000000001602',1601,'department_manager','active',now()),
  (1603,'00000000-0000-4000-8000-000000001603',1601,'sales','active',now()),
  (1604,'00000000-0000-4000-8000-000000001604',1601,'sales','active',now()),
  (1605,'00000000-0000-4000-8000-000000001605',1602,'sales','active',now());
insert into public.member_profiles(member_id,display_name) values
  (1601,'Observability Super'),(1602,'Observability Manager'),(1603,'Observability Sales'),
  (1604,'Observability Disabled'),(1605,'Observability Inactive Department');

set local role service_role;
update public.members
set status='disabled', disabled_at=now(), disabled_by_member_id=1601,
    disabled_reason='Synthetic WBS 1.6 stale JWT fixture'
where id=1604;
reset role;

select set_config('app.request_id', '', true);
select set_config('app.correlation_id', '', true);
select ok(
  app_private.write_audit_log(
    'observability','access.check','denied',1603,'SYNTHETIC_DENIAL','metrics','snapshot',null,
    '{"phase":"synthetic"}','26000000-0000-4000-8000-000000000006'
  ) > 0,
  'private audit writer appends a row'
);
select is((select correlation_id from public.audit_log where source = 'observability' and action = 'access.check'), '26000000-0000-4000-8000-000000000006'::uuid, 'audit writer preserves correlation');
select is((select actor_auth_user_id from public.audit_log where source = 'observability' and action = 'access.check'), '00000000-0000-4000-8000-000000001603'::uuid, 'audit actor auth ID is derived from live member row');
select is((select actor_department_id from public.audit_log where source = 'observability' and action = 'access.check'), 1601::bigint, 'audit actor department is snapshotted');
do $$
begin
  begin
    perform app_private.write_audit_log('observability','unsafe','failure',1603,null,null,null,null,'{"profile":{"email":"synthetic@example.test"}}');
  exception when others then insert into wbs_1_6_safe_errors values ('audit_sensitive', sqlstate); end;
  begin
    perform app_private.write_audit_log('observability','missing_actor','failure',999999,null,null,null,null,'{}');
  exception when others then insert into wbs_1_6_safe_errors values ('audit_missing_actor', sqlstate); end;
end;
$$;
select is((select sqlstate from wbs_1_6_safe_errors where label = 'audit_sensitive'), 'CW422', 'audit safe_data rejects sensitive keys');
select is((select sqlstate from wbs_1_6_safe_errors where label = 'audit_missing_actor'), 'CW422', 'audit writer rejects a nonexistent actor member');

create temporary table wbs_1_6_error_results (error_id uuid);
select set_config('app.request_id', '', true);
select set_config('app.correlation_id', '', true);
insert into wbs_1_6_error_results values (
  app_private.record_operational_error(
    'edge.invite','delivery','DEPENDENCY_TIMEOUT','dependency','error',true,null,null,
    '{"phase":"synthetic"}','26000000-0000-4000-8000-000000000007'
  )
);
select ok((select error_id is not null from wbs_1_6_error_results), 'operational error writer returns opaque error UUID');
select is((select error_code from public.operational_errors where error_id = (select error_id from wbs_1_6_error_results)), 'DEPENDENCY_TIMEOUT', 'operational error stores allow-listed code');
select is((select correlation_id from public.operational_errors where error_id = (select error_id from wbs_1_6_error_results)), '26000000-0000-4000-8000-000000000007'::uuid, 'operational error preserves correlation');
select ok(
  not exists (select 1 from information_schema.columns where table_schema='public' and table_name='operational_errors'
              and column_name in ('sqlerrm','stack','stack_trace','raw_error','exception_message')),
  'operational error schema has no raw SQL or stack field'
);
do $$
begin
  begin
    perform app_private.record_operational_error('edge.invite','delivery','UNSAFE','internal','error',false,null,null,'{"authorization":"synthetic"}');
  exception when others then insert into wbs_1_6_safe_errors values ('error_sensitive', sqlstate); end;
end;
$$;
select is((select sqlstate from wbs_1_6_safe_errors where label = 'error_sensitive'), 'CW422', 'operational safe_context rejects sensitive keys');

select set_config('app.request_id', '', true);
select set_config('app.correlation_id', '', true);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000001601","role":"authenticated","session_id":"27000000-0000-4000-8000-000000001601"}',true);
select ok((public.get_observability_snapshot(300,'26000000-0000-4000-8000-000000000008')->>'ok')::boolean, 'live active super_admin may read aggregate metrics');
select is(public.get_observability_snapshot(300,'26000000-0000-4000-8000-000000000008')->>'correlation_id', '26000000-0000-4000-8000-000000000008', 'metrics envelope preserves correlation');
select is((select count(*) from jsonb_object_keys(public.get_observability_snapshot(300)->'data')), 12::bigint, 'metrics data has a fixed twelve-field allow-list');
select ok(
  not (public.get_observability_snapshot(300)->'data' ?| array['payload','safe_data','safe_context','actor_member_id','idempotency_key','sqlerrm']),
  'metrics contains no detail, actor, idempotency, payload, or SQL fields'
);
select ok((public.get_observability_snapshot(300)#>>'{data,audit_denials_in_window}')::bigint >= 1, 'metrics reports aggregate denial count');
select is(public.get_observability_snapshot(10)#>>'{error,code}', 'WINDOW_INVALID', 'metrics rejects unsafe aggregation window');
reset role;

select set_config('app.request_id', '', true);
select set_config('app.correlation_id', '', true);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000001603","role":"authenticated","session_id":"27000000-0000-4000-8000-000000001603"}',true);
select is(public.get_observability_snapshot()#>>'{error,code}', 'FORBIDDEN', 'sales cannot read observability metrics');
reset role;
select ok(
  (select count(*) from public.audit_log where source='observability' and action='metrics.snapshot' and outcome='success') >= 1,
  'successful metrics access is audited'
);
select ok(
  (select count(*) from public.audit_log where source='observability' and action='metrics.snapshot' and outcome='denied') >= 1,
  'denied metrics access is audited'
);
select set_config('app.request_id', '', true);
select set_config('app.correlation_id', '', true);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000001602","role":"authenticated","session_id":"27000000-0000-4000-8000-000000001602"}',true);
select is(public.get_observability_snapshot()#>>'{error,code}', 'FORBIDDEN', 'department manager cannot read observability metrics');
reset role;
select set_config('app.request_id', '', true);
select set_config('app.correlation_id', '', true);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000001604","role":"authenticated","session_id":"27000000-0000-4000-8000-000000001604"}',true);
select is(public.get_observability_snapshot()#>>'{error,code}', 'MEMBERSHIP_INACTIVE', 'disabled member old JWT cannot read metrics');
reset role;

set local role service_role;
update public.departments set status = 'inactive' where id = 1602;
reset role;
select set_config('app.request_id', '', true);
select set_config('app.correlation_id', '', true);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000001605","role":"authenticated","session_id":"27000000-0000-4000-8000-000000001605"}',true);
select is(public.get_observability_snapshot()#>>'{error,code}', 'MEMBERSHIP_INACTIVE', 'inactive primary department old JWT cannot read metrics');
reset role;

set local role service_role;
update public.members set role = 'sales' where id = 1601;
reset role;
select set_config('app.request_id', '', true);
select set_config('app.correlation_id', '', true);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000001601","role":"authenticated","session_id":"27000000-0000-4000-8000-000000001601","user_metadata":{"role":"super_admin"}}',true);
select is(public.get_observability_snapshot()#>>'{error,code}', 'FORBIDDEN', 'live role downgrade defeats stale or forged super_admin JWT claims');
reset role;

select ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','app_private') and p.prokind in ('f','p')
      and (lower(coalesce(p.prosrc,'')) like '%user_metadata%' or lower(coalesce(p.prosrc,'')) like '%raw_user_meta_data%')
  ), 'observability authorization never trusts user-editable metadata'
);
select is(
  (select count(*) from (values ('anon'),('service_role')) as roles(role_name)
   where has_function_privilege(role_name,'app_private.get_observability_snapshot(integer,uuid)','EXECUTE')),
  0::bigint, 'only authenticated receives private metrics implementation execute'
);

select * from finish();
rollback;
