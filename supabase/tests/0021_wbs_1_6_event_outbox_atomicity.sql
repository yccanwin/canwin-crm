begin;

select plan(41);

insert into public.domain_event_definitions (
  event_type, schema_version, payload_schema, schema_fingerprint, registered_by
) values (
  'test.order.changed', 1, '{"type":"object"}',
  encode(extensions.digest(convert_to('{"type":"object"}'::jsonb::text, 'UTF8'), 'sha256'), 'hex'),
  'pgTAP'
);

create temporary table wbs_1_6_event_results (label text primary key, result jsonb);
insert into wbs_1_6_event_results values (
  'first',
  app_private.emit_domain_event(
    'test.order.changed', 1, 'order', 'order-1', 'test-suite',
    '21000000-0000-4000-8000-000000000001', '{"change":"created"}',
    null, null, '22000000-0000-4000-8000-000000000001'
  )
);

select ok((select (result ->> 'ok')::boolean from wbs_1_6_event_results where label = 'first'), 'first event emission succeeds');
select is((select result #>> '{data,replayed}' from wbs_1_6_event_results where label = 'first'), 'false', 'first emission is not a replay');
select ok((select (result ->> 'request_id')::uuid is not null from wbs_1_6_event_results where label = 'first'), 'event writer generates request_id in the database');
select is((select (result ->> 'correlation_id')::uuid from wbs_1_6_event_results where label = 'first'), '22000000-0000-4000-8000-000000000001'::uuid, 'caller correlation is preserved as trace only');
select is((select count(*) from public.domain_events where producer = 'test-suite'), 1::bigint, 'first emission inserts one event');
select is((select count(*) from public.event_outbox o join public.domain_events e using (event_id) where e.producer = 'test-suite'), 1::bigint, 'first emission inserts one outbox envelope');
select is((select count(*) from public.audit_log where source = 'test-suite' and action = 'event.emit'), 1::bigint, 'first emission inserts one success audit');
select is((select aggregate_sequence from public.domain_events where producer = 'test-suite'), 1::bigint, 'first aggregate sequence is one');
select is((select correlation_id from public.domain_events where producer = 'test-suite'), '22000000-0000-4000-8000-000000000001'::uuid, 'event stores shared correlation');
select is((select o.status from public.event_outbox o join public.domain_events e using (event_id) where e.producer = 'test-suite'), 'pending', 'WBS 1.6 creates pending outbox only');
select is((select o.correlation_id from public.event_outbox o join public.domain_events e using (event_id) where e.producer = 'test-suite'), '22000000-0000-4000-8000-000000000001'::uuid, 'outbox shares event correlation');
select ok((select a.request_id = e.request_id from public.audit_log a join public.domain_events e using (event_id) where e.producer = 'test-suite'), 'success audit shares event request_id');
select ok((select a.correlation_id = e.correlation_id from public.audit_log a join public.domain_events e using (event_id) where e.producer = 'test-suite'), 'success audit shares event correlation_id');
select ok((select a.event_id = e.event_id from public.audit_log a join public.domain_events e using (event_id) where e.producer = 'test-suite'), 'success audit links the emitted event');

insert into wbs_1_6_event_results values (
  'replay',
  app_private.emit_domain_event(
    'test.order.changed', 1, 'order', 'order-1', 'test-suite',
    '21000000-0000-4000-8000-000000000001', '{"change":"created"}',
    null, null, '22000000-0000-4000-8000-000000000099'
  )
);
select ok((select (result ->> 'ok')::boolean from wbs_1_6_event_results where label = 'replay'), 'identical idempotent replay succeeds');
select is((select result #>> '{data,replayed}' from wbs_1_6_event_results where label = 'replay'), 'true', 'identical idempotent replay is identified');
select is(
  (select result #>> '{data,event_id}' from wbs_1_6_event_results where label = 'replay'),
  (select result #>> '{data,event_id}' from wbs_1_6_event_results where label = 'first'),
  'idempotent replay returns the original event'
);
select is((select count(*) from public.domain_events where producer = 'test-suite'), 1::bigint, 'replay does not duplicate event');
select is((select count(*) from public.event_outbox o join public.domain_events e using (event_id) where e.producer = 'test-suite'), 1::bigint, 'replay does not duplicate outbox');
select is((select count(*) from public.audit_log where source = 'test-suite'), 2::bigint, 'replay appends an audit without duplicating event state');
select is((select last_sequence from app_private.aggregate_event_sequences where aggregate_type = 'order' and aggregate_id = 'order-1'), 1::bigint, 'replay does not consume aggregate sequence');

insert into wbs_1_6_event_results values (
  'second', app_private.emit_domain_event(
    'test.order.changed', 1, 'order', 'order-1', 'test-suite',
    '21000000-0000-4000-8000-000000000002', '{"change":"updated"}'
  )
);
select is((select (result #>> '{data,aggregate_sequence}')::bigint from wbs_1_6_event_results where label = 'second'), 2::bigint, 'next event receives sequence two');
select is((select last_sequence from app_private.aggregate_event_sequences where aggregate_type = 'order' and aggregate_id = 'order-1'), 2::bigint, 'private stream state advances atomically');

insert into wbs_1_6_event_results values (
  'other_aggregate', app_private.emit_domain_event(
    'test.order.changed', 1, 'order', 'order-2', 'test-suite',
    '21000000-0000-4000-8000-000000000003', '{"change":"created"}'
  )
);
select is((select (result #>> '{data,aggregate_sequence}')::bigint from wbs_1_6_event_results where label = 'other_aggregate'), 1::bigint, 'different aggregate owns an independent sequence');

create temporary table wbs_1_6_event_errors (label text primary key, sqlstate text);
do $$
begin
  begin
    perform app_private.emit_domain_event('test.order.changed',1,'order','order-1','test-suite','21000000-0000-4000-8000-000000000001','{"change":"different"}');
  exception when others then insert into wbs_1_6_event_errors values ('conflict', sqlstate); end;
  begin
    perform app_private.emit_domain_event('test.unknown.event',1,'order','order-3','test-suite','21000000-0000-4000-8000-000000000004','{}');
  exception when others then insert into wbs_1_6_event_errors values ('unknown', sqlstate); end;
  begin
    perform app_private.emit_domain_event('test.order.changed',1,'order','order-3','test-suite','21000000-0000-4000-8000-000000000005','{"nested":{"access_token":"synthetic"}}');
  exception when others then insert into wbs_1_6_event_errors values ('sensitive_object', sqlstate); end;
  begin
    perform app_private.emit_domain_event('test.order.changed',1,'order','order-3','test-suite','21000000-0000-4000-8000-000000000006','{"items":[{"password":"synthetic"}]}');
  exception when others then insert into wbs_1_6_event_errors values ('sensitive_array', sqlstate); end;
  begin
    perform app_private.emit_domain_event('test.order.changed',1,'order','order-3','test-suite','21000000-0000-4000-8000-000000000007',jsonb_build_object('data',repeat('x',17000)));
  exception when others then insert into wbs_1_6_event_errors values ('oversize', sqlstate); end;
end;
$$;
select is((select sqlstate from wbs_1_6_event_errors where label = 'conflict'), 'CW409', 'same idempotency key with different content is a stable conflict');
select is((select count(*) from public.domain_events where producer = 'test-suite'), 3::bigint, 'conflict creates no partial event');
select is((select sqlstate from wbs_1_6_event_errors where label = 'unknown'), 'CW422', 'unregistered event definition is rejected');
select is((select sqlstate from wbs_1_6_event_errors where label = 'sensitive_object'), 'CW422', 'nested sensitive object key is rejected');
select is((select sqlstate from wbs_1_6_event_errors where label = 'sensitive_array'), 'CW422', 'sensitive key inside array is rejected');
select is((select sqlstate from wbs_1_6_event_errors where label = 'oversize'), 'CW413', 'oversized event payload is rejected');

insert into wbs_1_6_event_results values (
  'caused', app_private.emit_domain_event(
    'test.order.changed', 1, 'order', 'order-1', 'test-suite',
    '21000000-0000-4000-8000-000000000008', '{"change":"caused"}',
    (select (result #>> '{data,event_id}')::uuid from wbs_1_6_event_results where label = 'first'),
    null, '22000000-0000-4000-8000-000000000001'
  )
);
select ok((select (result ->> 'ok')::boolean from wbs_1_6_event_results where label = 'caused'), 'causation succeeds inside the same correlation');
select is(
  (select causation_event_id from public.domain_events where idempotency_key = '21000000-0000-4000-8000-000000000008'),
  (select (result #>> '{data,event_id}')::uuid from wbs_1_6_event_results where label = 'first'),
  'causation link is stored'
);
do $$
begin
  begin
    perform set_config('app.request_id', '', true);
    perform set_config('app.correlation_id', '', true);
    perform app_private.emit_domain_event(
      'test.order.changed',1,'order','order-1','test-suite','21000000-0000-4000-8000-000000000009','{}',
      (select (result #>> '{data,event_id}')::uuid from wbs_1_6_event_results where label = 'first'),null,
      '22000000-0000-4000-8000-000000000002'
    );
  exception when others then insert into wbs_1_6_event_errors values ('causation_correlation', sqlstate); end;
  begin
    perform set_config('app.request_id', '', true);
    perform set_config('app.correlation_id', '', true);
    perform app_private.emit_domain_event(
      'test.order.changed',1,'order','order-1','test-suite','21000000-0000-4000-8000-000000000010','{}',
      '23000000-0000-4000-8000-000000000001'
    );
  exception when others then insert into wbs_1_6_event_errors values ('causation_missing', sqlstate); end;
end;
$$;
select is((select sqlstate from wbs_1_6_event_errors where label = 'causation_correlation'), 'CW422', 'causation cannot cross correlation boundaries');
select is((select sqlstate from wbs_1_6_event_errors where label = 'causation_missing'), 'CW422', 'causation must reference an existing event');

do $$
declare v_result jsonb;
begin
  begin
    v_result := app_private.emit_domain_event(
      'test.order.changed',1,'order','rollback-order','rollback-probe',
      '21000000-0000-4000-8000-000000000011','{"change":"rollback"}'
    );
    if not (v_result ->> 'ok')::boolean then raise exception 'unexpected envelope'; end if;
    raise exception 'controlled rollback' using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
  end;
end;
$$;
select is((select count(*) from public.domain_events where producer = 'rollback-probe'), 0::bigint, 'business rollback removes event');
select is((select count(*) from public.event_outbox o join public.domain_events e using(event_id) where e.producer = 'rollback-probe'), 0::bigint, 'business rollback removes outbox');
select is((select count(*) from public.audit_log where source = 'rollback-probe'), 0::bigint, 'business rollback removes success audit');
select is((select count(*) from app_private.aggregate_event_sequences where aggregate_id = 'rollback-order'), 0::bigint, 'business rollback restores aggregate sequence state');

do $$
declare v_event uuid := (select (result #>> '{data,event_id}')::uuid from wbs_1_6_event_results where label = 'first');
begin
  begin update public.domain_events set payload = payload where event_id = v_event; exception when others then insert into wbs_1_6_event_errors values ('event_update', sqlstate); end;
  begin update public.event_outbox set event_type = 'test.changed.illegal' where event_id = v_event; exception when others then insert into wbs_1_6_event_errors values ('outbox_envelope', sqlstate); end;
  begin delete from public.event_outbox where event_id = v_event; exception when others then insert into wbs_1_6_event_errors values ('outbox_delete', sqlstate); end;
end;
$$;
select is((select sqlstate from wbs_1_6_event_errors where label = 'event_update'), 'CW405', 'domain event rejects UPDATE');
select is((select sqlstate from wbs_1_6_event_errors where label = 'outbox_envelope'), 'CW405', 'outbox immutable envelope rejects UPDATE');
select is((select sqlstate from wbs_1_6_event_errors where label = 'outbox_delete'), 'CW405', 'outbox rejects DELETE');

select * from finish();
rollback;
