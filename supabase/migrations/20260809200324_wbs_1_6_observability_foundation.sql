-- WBS 1.6: secure-by-default public schema, immutable ledgers, transactional
-- domain events/outbox, shared trace envelopes, safe errors, and metrics.

create extension if not exists pgcrypto with schema extensions;

create table public.domain_event_definitions (
  event_type text not null,
  schema_version integer not null,
  payload_schema jsonb not null,
  schema_fingerprint text not null,
  registered_at timestamptz not null default now(),
  registered_by text not null default 'migration',
  constraint domain_event_definitions_pkey primary key (event_type, schema_version),
  constraint domain_event_definitions_event_type_check
    check (event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,7}$'),
  constraint domain_event_definitions_schema_version_check check (schema_version > 0),
  constraint domain_event_definitions_payload_schema_check check (jsonb_typeof(payload_schema) = 'object'),
  constraint domain_event_definitions_schema_fingerprint_check check (schema_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint domain_event_definitions_schema_fingerprint_matches_check check (
    schema_fingerprint = encode(extensions.digest(convert_to(payload_schema::text, 'UTF8'), 'sha256'), 'hex')
  ),
  constraint domain_event_definitions_registered_by_check check (length(btrim(registered_by)) between 1 and 100)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  request_id uuid not null,
  correlation_id uuid not null,
  actor_auth_user_id uuid,
  actor_member_id bigint,
  actor_department_id bigint,
  source text not null,
  action text not null,
  outcome text not null,
  reason_code text,
  target_type text,
  target_id text,
  event_id uuid,
  safe_data jsonb not null default '{}'::jsonb,
  constraint audit_log_source_check check (source ~ '^[a-z][a-z0-9_.-]{0,99}$'),
  constraint audit_log_action_check check (action ~ '^[a-z][a-z0-9_.-]{0,99}$'),
  constraint audit_log_outcome_check check (outcome in ('success', 'denied', 'failure')),
  constraint audit_log_reason_code_check check (reason_code is null or reason_code ~ '^[A-Z][A-Z0-9_]{0,99}$'),
  constraint audit_log_target_check check (
    (target_type is null and target_id is null)
    or (target_type ~ '^[a-z][a-z0-9_.-]{0,99}$' and length(target_id) between 1 and 200)
  ),
  constraint audit_log_safe_data_check check (jsonb_typeof(safe_data) = 'object')
);

create table public.domain_events (
  id bigint generated always as identity primary key,
  event_id uuid not null default gen_random_uuid(),
  event_type text not null,
  schema_version integer not null,
  occurred_at timestamptz not null default now(),
  request_id uuid not null,
  correlation_id uuid not null,
  causation_event_id uuid,
  actor_auth_user_id uuid,
  actor_member_id bigint,
  actor_department_id bigint,
  aggregate_type text not null,
  aggregate_id text not null,
  aggregate_sequence bigint not null,
  producer text not null,
  idempotency_key uuid not null,
  content_hash text not null,
  payload jsonb not null,
  constraint domain_events_event_id_key unique (event_id),
  constraint domain_events_event_envelope_key unique (event_id, event_type, schema_version, correlation_id),
  constraint domain_events_event_correlation_key unique (event_id, correlation_id),
  constraint domain_events_definition_fkey foreign key (event_type, schema_version)
    references public.domain_event_definitions (event_type, schema_version),
  constraint domain_events_causation_fkey foreign key (causation_event_id, correlation_id)
    references public.domain_events (event_id, correlation_id),
  constraint domain_events_stream_key unique (aggregate_type, aggregate_id, aggregate_sequence),
  constraint domain_events_idempotency_key unique (producer, idempotency_key),
  constraint domain_events_schema_version_check check (schema_version > 0),
  constraint domain_events_aggregate_type_check check (aggregate_type ~ '^[a-z][a-z0-9_.-]{0,99}$'),
  constraint domain_events_aggregate_id_check check (length(aggregate_id) between 1 and 200),
  constraint domain_events_aggregate_sequence_check check (aggregate_sequence > 0),
  constraint domain_events_producer_check check (producer ~ '^[a-z][a-z0-9_.-]{0,99}$'),
  constraint domain_events_content_hash_check check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint domain_events_payload_check check (jsonb_typeof(payload) = 'object')
);

alter table public.audit_log
  add constraint audit_log_event_fkey foreign key (event_id)
  references public.domain_events (event_id);

create table public.event_outbox (
  id bigint generated always as identity primary key,
  event_id uuid not null,
  event_type text not null,
  schema_version integer not null,
  correlation_id uuid not null,
  status text not null default 'pending',
  available_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  max_attempts integer not null default 8,
  leased_at timestamptz,
  lease_expires_at timestamptz,
  lease_owner text,
  lease_token uuid,
  published_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_outbox_event_id_key unique (event_id),
  constraint event_outbox_event_fkey foreign key (event_id)
    references public.domain_events (event_id),
  constraint event_outbox_event_envelope_fkey foreign key (event_id, event_type, schema_version, correlation_id)
    references public.domain_events (event_id, event_type, schema_version, correlation_id),
  constraint event_outbox_status_check check (status in ('pending', 'leased', 'retry_wait', 'published', 'dead_letter')),
  constraint event_outbox_attempt_count_check check (attempt_count >= 0 and attempt_count <= max_attempts),
  constraint event_outbox_max_attempts_check check (max_attempts between 1 and 100),
  constraint event_outbox_last_error_code_check check (
    last_error_code is null or last_error_code ~ '^[A-Z][A-Z0-9_]{0,99}$'
  ),
  constraint event_outbox_state_shape_check check (
    (status = 'pending' and leased_at is null and lease_expires_at is null and lease_owner is null and lease_token is null and published_at is null)
    or (status = 'leased' and leased_at is not null and lease_expires_at > leased_at and lease_owner is not null and lease_token is not null and published_at is null)
    or (status = 'retry_wait' and leased_at is null and lease_expires_at is null and lease_owner is null and lease_token is null and published_at is null)
    or (status = 'published' and leased_at is null and lease_expires_at is null and lease_owner is null and lease_token is null and published_at is not null)
    or (status = 'dead_letter' and leased_at is null and lease_expires_at is null and lease_owner is null and lease_token is null and published_at is null and last_error_code is not null)
  )
);

create table public.operational_errors (
  id bigint generated always as identity primary key,
  error_id uuid not null default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  request_id uuid not null,
  correlation_id uuid not null,
  component text not null,
  operation text not null,
  error_code text not null,
  error_class text not null,
  severity text not null,
  retryable boolean not null default false,
  event_id uuid,
  outbox_id bigint,
  safe_context jsonb not null default '{}'::jsonb,
  constraint operational_errors_error_id_key unique (error_id),
  constraint operational_errors_event_fkey foreign key (event_id)
    references public.domain_events (event_id),
  constraint operational_errors_outbox_fkey foreign key (outbox_id)
    references public.event_outbox (id),
  constraint operational_errors_component_check check (component ~ '^[a-z][a-z0-9_.-]{0,99}$'),
  constraint operational_errors_operation_check check (operation ~ '^[a-z][a-z0-9_.-]{0,99}$'),
  constraint operational_errors_error_code_check check (error_code ~ '^[A-Z][A-Z0-9_]{0,99}$'),
  constraint operational_errors_error_class_check check (error_class in ('validation', 'authorization', 'conflict', 'dependency', 'internal')),
  constraint operational_errors_severity_check check (severity in ('warning', 'error', 'critical')),
  constraint operational_errors_safe_context_check check (jsonb_typeof(safe_context) = 'object')
);

create table app_private.aggregate_event_sequences (
  aggregate_type text not null,
  aggregate_id text not null,
  last_sequence bigint not null,
  updated_at timestamptz not null default now(),
  primary key (aggregate_type, aggregate_id),
  constraint aggregate_event_sequences_last_sequence_check check (last_sequence > 0)
);

alter table app_private.aggregate_event_sequences enable row level security;
alter table app_private.aggregate_event_sequences force row level security;

create index audit_log_request_idx on public.audit_log (request_id);
create index audit_log_correlation_time_idx on public.audit_log (correlation_id, occurred_at desc);
create index audit_log_target_time_idx on public.audit_log (target_type, target_id, occurred_at desc)
  where target_type is not null;
create index audit_log_event_idx on public.audit_log (event_id) where event_id is not null;
create index domain_events_definition_idx on public.domain_events (event_type, schema_version);
create index domain_events_correlation_time_idx on public.domain_events (correlation_id, occurred_at desc);
create index domain_events_causation_idx on public.domain_events (causation_event_id)
  where causation_event_id is not null;
create index event_outbox_ready_idx on public.event_outbox (available_at, id)
  where status in ('pending', 'retry_wait');
create index event_outbox_expired_lease_idx on public.event_outbox (lease_expires_at, id)
  where status = 'leased';
create index event_outbox_dead_letter_idx on public.event_outbox (updated_at desc, id)
where status = 'dead_letter';
create index event_outbox_envelope_lookup_idx on public.event_outbox (event_type, schema_version, correlation_id);
create index operational_errors_request_idx on public.operational_errors (request_id);
create index operational_errors_correlation_time_idx on public.operational_errors (correlation_id, occurred_at desc);
create index operational_errors_event_idx on public.operational_errors (event_id) where event_id is not null;
create index operational_errors_outbox_idx on public.operational_errors (outbox_id) where outbox_id is not null;

alter table public.domain_event_definitions enable row level security;
alter table public.domain_event_definitions force row level security;
alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;
alter table public.domain_events enable row level security;
alter table public.domain_events force row level security;
alter table public.event_outbox enable row level security;
alter table public.event_outbox force row level security;
alter table public.operational_errors enable row level security;
alter table public.operational_errors force row level security;

create or replace function app_private.reject_ledger_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'immutable ledger does not allow %', tg_op using errcode = 'CW405';
end;
$$;

create trigger domain_event_definitions_append_only
before update or delete or truncate on public.domain_event_definitions
for each statement execute function app_private.reject_ledger_mutation();
create trigger audit_log_append_only
before update or delete or truncate on public.audit_log
for each statement execute function app_private.reject_ledger_mutation();
create trigger domain_events_append_only
before update or delete or truncate on public.domain_events
for each statement execute function app_private.reject_ledger_mutation();
create trigger operational_errors_append_only
before update or delete or truncate on public.operational_errors
for each statement execute function app_private.reject_ledger_mutation();

create or replace function app_private.protect_event_outbox()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'event outbox does not allow %', tg_op using errcode = 'CW405';
  end if;

  if new.id is distinct from old.id
    or new.event_id is distinct from old.event_id
    or new.event_type is distinct from old.event_type
    or new.schema_version is distinct from old.schema_version
    or new.correlation_id is distinct from old.correlation_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'event outbox envelope is immutable' using errcode = 'CW405';
  end if;
  return new;
end;
$$;

create trigger event_outbox_protect_rows
before update or delete on public.event_outbox
for each row execute function app_private.protect_event_outbox();
create trigger event_outbox_protect_truncate
before truncate on public.event_outbox
for each statement execute function app_private.protect_event_outbox();

create or replace function app_private.assert_safe_json(
  p_value jsonb,
  p_label text,
  p_max_bytes integer
)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_sensitive_key text;
  v_sensitive_value text;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    raise exception '% must be a JSON object', p_label using errcode = 'CW422';
  end if;
  if octet_length(convert_to(p_value::text, 'UTF8')) > p_max_bytes then
    raise exception '% exceeds safe size limit', p_label using errcode = 'CW413';
  end if;

  with recursive walk(key_name, value) as (
    select null::text, p_value
    union all
    select child.key_name, child.value
    from walk as parent
    cross join lateral (
      select entry.key as key_name, entry.value
      from jsonb_each(case when jsonb_typeof(parent.value) = 'object' then parent.value else '{}'::jsonb end) as entry
      union all
      select null::text, element.value
      from jsonb_array_elements(case when jsonb_typeof(parent.value) = 'array' then parent.value else '[]'::jsonb end) as element
    ) as child
  )
  select key_name into v_sensitive_key
  from walk
  where key_name is not null
    and lower(regexp_replace(key_name, '[^a-zA-Z0-9]', '', 'g')) ~
      '(password|passwd|secret|token|authorization|cookie|jwt|sessionid|apikey|accesskey|privatekey|credential|email|phone|mobile|contact|idcard|idnumber|identitycard|licenseimage|bankaccount|documenturl|documentpath|storagepath|invitationurl|sqlerrm|stacktrace|exceptionmessage|rawerror|errordetail)'
  limit 1;

  if v_sensitive_key is not null then
    raise exception '% contains forbidden sensitive key', p_label using errcode = 'CW422';
  end if;

  with recursive walk(value) as (
    select p_value
    union all
    select child.value
    from walk as parent
    cross join lateral (
      select entry.value
      from jsonb_each(case when jsonb_typeof(parent.value) = 'object' then parent.value else '{}'::jsonb end) as entry
      union all
      select element.value
      from jsonb_array_elements(case when jsonb_typeof(parent.value) = 'array' then parent.value else '[]'::jsonb end) as element
    ) as child
  )
  select trim(both '"' from value::text) into v_sensitive_value
  from walk
  where jsonb_typeof(value) = 'string'
    and (
      exists (
        select 1
        from regexp_matches(
          value #>> '{}',
          '[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}',
          'gi'
        ) as email_match
        where email_match[1] !~* '@example\.test$'
      )
      or value::text ~* 'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+'
      or value::text ~* '(sb_secret|service_role)'
      or value::text ~ '(^|[^0-9])1[3-9][0-9]{9}([^0-9]|$)'
      or value::text ~* '(^|[^0-9])[1-9][0-9]{5}(18|19|20)[0-9]{2}(0[1-9]|1[0-2])([0-2][1-9]|3[01])[0-9]{3}[0-9X]([^0-9X]|$)'
      or value::text ~* '/(documents|credentials|identity|licenses|certificates)/[^" ]+\.(jpg|jpeg|png|pdf)'
    )
  limit 1;

  if v_sensitive_value is not null then
    raise exception '% contains forbidden sensitive value', p_label using errcode = 'CW422';
  end if;
end;
$$;

create or replace function app_private.new_trace_context(p_correlation_id uuid default null)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_request_id uuid;
  v_correlation_id uuid;
  v_existing_request text := nullif(current_setting('app.request_id', true), '');
  v_existing_correlation text := nullif(current_setting('app.correlation_id', true), '');
begin
  if v_existing_request ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_request_id := v_existing_request::uuid;
  else
    v_request_id := gen_random_uuid();
    perform set_config('app.request_id', v_request_id::text, true);
  end if;

  if v_existing_correlation ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_correlation_id := v_existing_correlation::uuid;
  else
    v_correlation_id := coalesce(p_correlation_id, v_request_id);
    perform set_config('app.correlation_id', v_correlation_id::text, true);
  end if;

  return jsonb_build_object('request_id', v_request_id, 'correlation_id', v_correlation_id);
end;
$$;

create or replace function app_private.rpc_success(
  p_data jsonb,
  p_request_id uuid,
  p_correlation_id uuid
)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'data', coalesce(p_data, '{}'::jsonb),
    'request_id', p_request_id,
    'correlation_id', p_correlation_id
  );
$$;

create or replace function app_private.rpc_success(p_data jsonb)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select app_private.rpc_success(
    p_data,
    (trace.value ->> 'request_id')::uuid,
    (trace.value ->> 'correlation_id')::uuid
  )
  from (select app_private.new_trace_context(null) as value) as trace;
$$;

create or replace function app_private.rpc_error(
  p_code text,
  p_safe_params jsonb,
  p_request_id uuid,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_code is null or p_code !~ '^[A-Z][A-Z0-9_]{0,99}$' then
    raise exception 'error code is invalid' using errcode = 'CW422';
  end if;
  perform app_private.assert_safe_json(coalesce(p_safe_params, '{}'::jsonb), 'safe_params', 4096);
  return jsonb_build_object(
    'ok', false,
    'request_id', p_request_id,
    'correlation_id', p_correlation_id,
    'error', jsonb_build_object(
      'code', p_code,
      'message_key', 'crm.error.' || lower(p_code),
      'safe_params', coalesce(p_safe_params, '{}'::jsonb),
      'request_id', p_request_id,
      'correlation_id', p_correlation_id
    )
  );
end;
$$;

create or replace function app_private.rpc_error(
  p_code text,
  p_safe_params jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select app_private.rpc_error(
    p_code,
    p_safe_params,
    (trace.value ->> 'request_id')::uuid,
    (trace.value ->> 'correlation_id')::uuid
  )
  from (select app_private.new_trace_context(null) as value) as trace;
$$;

create or replace function app_private.write_audit_log(
  p_source text,
  p_action text,
  p_outcome text,
  p_actor_member_id bigint default null,
  p_reason_code text default null,
  p_target_type text default null,
  p_target_id text default null,
  p_event_id uuid default null,
  p_safe_data jsonb default '{}'::jsonb,
  p_correlation_id uuid default null,
  p_trace jsonb default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_trace jsonb;
  v_request_id uuid;
  v_correlation_id uuid;
  v_actor_auth_user_id uuid;
  v_actor_department_id bigint;
begin
  v_trace := coalesce(p_trace, app_private.new_trace_context(p_correlation_id));
  v_request_id := (v_trace ->> 'request_id')::uuid;
  v_correlation_id := (v_trace ->> 'correlation_id')::uuid;
  if v_request_id is null or v_correlation_id is null then
    raise exception 'trace context is invalid' using errcode = 'CW422';
  end if;
  if p_actor_member_id is not null then
    select auth_user_id, primary_department_id
      into v_actor_auth_user_id, v_actor_department_id
    from public.members where id = p_actor_member_id;
    if not found then
      raise exception 'actor member does not exist' using errcode = 'CW422';
    end if;
  end if;
  perform app_private.assert_safe_json(coalesce(p_safe_data, '{}'::jsonb), 'safe_data', 8192);
  insert into public.audit_log (
    request_id, correlation_id, actor_auth_user_id, actor_member_id,
    actor_department_id, source, action, outcome, reason_code,
    target_type, target_id, event_id, safe_data
  ) values (
    v_request_id, v_correlation_id, v_actor_auth_user_id, p_actor_member_id,
    v_actor_department_id, p_source, p_action, p_outcome, p_reason_code,
    p_target_type, p_target_id, p_event_id, coalesce(p_safe_data, '{}'::jsonb)
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function app_private.record_operational_error(
  p_component text,
  p_operation text,
  p_error_code text,
  p_error_class text,
  p_severity text,
  p_retryable boolean default false,
  p_event_id uuid default null,
  p_outbox_id bigint default null,
  p_safe_context jsonb default '{}'::jsonb,
  p_correlation_id uuid default null,
  p_trace jsonb default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_error_id uuid;
  v_trace jsonb;
  v_request_id uuid;
  v_correlation_id uuid;
begin
  v_trace := coalesce(p_trace, app_private.new_trace_context(p_correlation_id));
  v_request_id := (v_trace ->> 'request_id')::uuid;
  v_correlation_id := (v_trace ->> 'correlation_id')::uuid;
  if v_request_id is null or v_correlation_id is null then
    raise exception 'trace context is invalid' using errcode = 'CW422';
  end if;
  perform app_private.assert_safe_json(coalesce(p_safe_context, '{}'::jsonb), 'safe_context', 8192);
  insert into public.operational_errors (
    request_id, correlation_id, component, operation, error_code,
    error_class, severity, retryable, event_id, outbox_id, safe_context
  ) values (
    v_request_id, v_correlation_id, p_component, p_operation, p_error_code,
    p_error_class, p_severity, p_retryable, p_event_id, p_outbox_id,
    coalesce(p_safe_context, '{}'::jsonb)
  ) returning error_id into v_error_id;
  return v_error_id;
end;
$$;

create or replace function app_private.emit_domain_event(
  p_event_type text,
  p_schema_version integer,
  p_aggregate_type text,
  p_aggregate_id text,
  p_producer text,
  p_idempotency_key uuid,
  p_payload jsonb default '{}'::jsonb,
  p_causation_event_id uuid default null,
  p_actor_member_id bigint default null,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_content_hash text;
  v_existing public.domain_events%rowtype;
  v_causation_correlation uuid;
  v_sequence bigint;
  v_event_id uuid := gen_random_uuid();
  v_trace jsonb;
  v_request_id uuid;
  v_correlation_id uuid;
  v_actor_auth_user_id uuid;
  v_actor_department_id bigint;
begin
  if p_idempotency_key is null then
    raise exception 'idempotency identifier is required' using errcode = 'CW422';
  end if;
  v_trace := app_private.new_trace_context(p_correlation_id);
  v_request_id := (v_trace ->> 'request_id')::uuid;
  v_correlation_id := (v_trace ->> 'correlation_id')::uuid;
  if p_actor_member_id is not null then
    select auth_user_id, primary_department_id
      into v_actor_auth_user_id, v_actor_department_id
    from public.members where id = p_actor_member_id;
    if not found then
      raise exception 'actor member does not exist' using errcode = 'CW422';
    end if;
  end if;
  if not exists (
    select 1 from public.domain_event_definitions
    where event_type = p_event_type and schema_version = p_schema_version
  ) then
    raise exception 'domain event definition is not registered' using errcode = 'CW422';
  end if;
  perform app_private.assert_safe_json(p_payload, 'payload', 16384);

  v_content_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'event_type', p_event_type,
    'schema_version', p_schema_version,
    'aggregate_type', p_aggregate_type,
    'aggregate_id', p_aggregate_id,
    'actor_auth_user_id', v_actor_auth_user_id,
    'actor_member_id', p_actor_member_id,
    'actor_department_id', v_actor_department_id,
    'causation_event_id', p_causation_event_id,
    'payload', p_payload
  )::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(p_producer || ':' || p_idempotency_key::text, 0));
  select * into v_existing
  from public.domain_events
  where producer = p_producer and idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_existing.content_hash <> v_content_hash then
      raise exception 'idempotency key was already used for different content' using errcode = 'CW409';
    end if;
    perform app_private.write_audit_log(
      p_producer, 'event.replay', 'success', p_actor_member_id, null,
      p_aggregate_type, p_aggregate_id, v_existing.event_id,
      jsonb_build_object(
        'event_type', p_event_type,
        'schema_version', p_schema_version,
        'replayed', true
      ),
      v_correlation_id, v_trace
    );
    return app_private.rpc_success(jsonb_build_object(
      'event_id', v_existing.event_id,
      'aggregate_sequence', v_existing.aggregate_sequence,
      'replayed', true
    ), v_request_id, v_correlation_id);
  end if;

  if p_causation_event_id is not null then
    select correlation_id into v_causation_correlation
    from public.domain_events where event_id = p_causation_event_id;
    if not found then
      raise exception 'causation event does not exist' using errcode = 'CW422';
    end if;
    if v_causation_correlation <> v_correlation_id then
      raise exception 'causation event correlation does not match' using errcode = 'CW422';
    end if;
  end if;

  insert into app_private.aggregate_event_sequences (
    aggregate_type, aggregate_id, last_sequence
  ) values (
    p_aggregate_type, p_aggregate_id, 1
  )
  on conflict (aggregate_type, aggregate_id) do update
    set last_sequence = app_private.aggregate_event_sequences.last_sequence + 1,
        updated_at = now()
  returning last_sequence into v_sequence;

  insert into public.domain_events (
    event_id, event_type, schema_version, request_id, correlation_id,
    causation_event_id, actor_auth_user_id, actor_member_id,
    actor_department_id, aggregate_type, aggregate_id, aggregate_sequence,
    producer, idempotency_key, content_hash, payload
  ) values (
    v_event_id, p_event_type, p_schema_version, v_request_id, v_correlation_id,
    p_causation_event_id, v_actor_auth_user_id, p_actor_member_id,
    v_actor_department_id, p_aggregate_type, p_aggregate_id, v_sequence,
    p_producer, p_idempotency_key, v_content_hash, p_payload
  );

  insert into public.event_outbox (
    event_id, event_type, schema_version, correlation_id
  ) values (
    v_event_id, p_event_type, p_schema_version, v_correlation_id
  );

  perform app_private.write_audit_log(
    p_producer, 'event.emit', 'success', p_actor_member_id, null,
    p_aggregate_type, p_aggregate_id, v_event_id,
    jsonb_build_object('event_type', p_event_type, 'schema_version', p_schema_version),
    v_correlation_id, v_trace
  );

  return app_private.rpc_success(jsonb_build_object(
    'event_id', v_event_id,
    'aggregate_sequence', v_sequence,
    'replayed', false
  ), v_request_id, v_correlation_id);
end;
$$;

create or replace function app_private.get_observability_snapshot(
  p_window_seconds integer,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_trace jsonb;
  v_actor_id bigint;
  v_any_actor_id bigint;
  v_role text;
  v_since timestamptz;
  v_data jsonb;
begin
  v_trace := app_private.new_trace_context(p_correlation_id);
  v_any_actor_id := app_private.current_member_id_any_status();
  v_actor_id := app_private.current_member_id();
  if v_actor_id is null then
    perform app_private.write_audit_log(
      'observability', 'metrics.snapshot', 'denied', v_any_actor_id, 'MEMBERSHIP_INACTIVE',
      'metrics', 'observability_snapshot', null, '{}'::jsonb,
      (v_trace ->> 'correlation_id')::uuid, v_trace
    );
    return app_private.rpc_error('MEMBERSHIP_INACTIVE', '{}'::jsonb, (v_trace ->> 'request_id')::uuid, (v_trace ->> 'correlation_id')::uuid);
  end if;
  select role into v_role from public.members where id = v_actor_id;
  if v_role <> 'super_admin' then
    perform app_private.write_audit_log(
      'observability', 'metrics.snapshot', 'denied', v_actor_id, 'FORBIDDEN',
      'metrics', 'observability_snapshot', null, '{}'::jsonb,
      (v_trace ->> 'correlation_id')::uuid, v_trace
    );
    return app_private.rpc_error('FORBIDDEN', '{}'::jsonb, (v_trace ->> 'request_id')::uuid, (v_trace ->> 'correlation_id')::uuid);
  end if;

  if p_window_seconds is null or p_window_seconds not between 60 and 86400 then
    perform app_private.write_audit_log(
      'observability', 'metrics.snapshot', 'denied', v_actor_id, 'WINDOW_INVALID',
      'metrics', 'observability_snapshot', null,
      jsonb_build_object('window_seconds', p_window_seconds),
      (v_trace ->> 'correlation_id')::uuid, v_trace
    );
    return app_private.rpc_error('WINDOW_INVALID', '{}'::jsonb, (v_trace ->> 'request_id')::uuid, (v_trace ->> 'correlation_id')::uuid);
  end if;

  v_since := now() - make_interval(secs => p_window_seconds);
  select jsonb_build_object(
    'schema_version', 1,
    'generated_at', now(),
    'window_seconds', p_window_seconds,
    'domain_events_total', (select count(*) from public.domain_events),
    'domain_events_in_window', (select count(*) from public.domain_events where occurred_at >= v_since),
    'audit_log_total', (select count(*) from public.audit_log),
    'audit_denials_in_window', (select count(*) from public.audit_log where occurred_at >= v_since and outcome = 'denied'),
    'operational_errors_total', (select count(*) from public.operational_errors),
    'operational_errors_in_window', (select count(*) from public.operational_errors where occurred_at >= v_since),
    'outbox_pending_total', (select count(*) from public.event_outbox where status in ('pending', 'retry_wait')),
    'outbox_dead_letter_total', (select count(*) from public.event_outbox where status = 'dead_letter'),
    'oldest_outbox_age_seconds', (
      select coalesce(floor(extract(epoch from now() - min(created_at)))::bigint, 0)
      from public.event_outbox where status in ('pending', 'retry_wait')
    )
  ) into v_data;
  perform app_private.write_audit_log(
    'observability', 'metrics.snapshot', 'success', v_actor_id, null,
    'metrics', 'observability_snapshot', null,
    jsonb_build_object('window_seconds', p_window_seconds),
    (v_trace ->> 'correlation_id')::uuid, v_trace
  );
  return app_private.rpc_success(v_data, (v_trace ->> 'request_id')::uuid, (v_trace ->> 'correlation_id')::uuid);
end;
$$;

create or replace function public.get_observability_snapshot(
  p_window_seconds integer default 300,
  p_correlation_id uuid default null
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select app_private.get_observability_snapshot(p_window_seconds, p_correlation_id);
$$;

create or replace function app_private.secure_new_public_tables()
returns event_trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table record;
begin
  for v_table in
    select distinct n.nspname, c.relname
    from pg_event_trigger_ddl_commands() as command
    join pg_class as c on c.oid = command.objid
    join pg_namespace as n on n.oid = c.relnamespace
    where command.command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    execute format('alter table %I.%I enable row level security', v_table.nspname, v_table.relname);
    execute format('alter table %I.%I force row level security', v_table.nspname, v_table.relname);
    execute format('revoke all on table %I.%I from public, anon, authenticated, service_role', v_table.nspname, v_table.relname);
  end loop;
end;
$$;

create event trigger canwin_secure_new_public_tables
on ddl_command_end
when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
execute function app_private.secure_new_public_tables();

alter default privileges in schema public revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated, service_role;

revoke all on table public.domain_event_definitions from public, anon, authenticated, service_role;
revoke all on table public.audit_log from public, anon, authenticated, service_role;
revoke all on table public.domain_events from public, anon, authenticated, service_role;
revoke all on table public.event_outbox from public, anon, authenticated, service_role;
revoke all on table public.operational_errors from public, anon, authenticated, service_role;
revoke all on table app_private.aggregate_event_sequences from public, anon, authenticated, service_role;

grant select on table public.domain_event_definitions to service_role;
grant select on table public.audit_log to service_role;
grant select on table public.domain_events to service_role;
grant select on table public.event_outbox to service_role;
grant select on table public.operational_errors to service_role;
revoke all on sequence public.audit_log_id_seq from public, anon, authenticated, service_role;
revoke all on sequence public.domain_events_id_seq from public, anon, authenticated, service_role;
revoke all on sequence public.event_outbox_id_seq from public, anon, authenticated, service_role;
revoke all on sequence public.operational_errors_id_seq from public, anon, authenticated, service_role;

revoke execute on function app_private.reject_ledger_mutation() from public, anon, authenticated, service_role;
revoke execute on function app_private.protect_event_outbox() from public, anon, authenticated, service_role;
revoke execute on function app_private.assert_safe_json(jsonb, text, integer) from public, anon, authenticated, service_role;
revoke execute on function app_private.new_trace_context(uuid) from public, anon, authenticated, service_role;
revoke execute on function app_private.rpc_success(jsonb, uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function app_private.rpc_success(jsonb) from public, anon, authenticated, service_role;
revoke execute on function app_private.rpc_error(text, jsonb, uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function app_private.rpc_error(text, jsonb) from public, anon, authenticated, service_role;
revoke execute on function app_private.write_audit_log(text, text, text, bigint, text, text, text, uuid, jsonb, uuid, jsonb) from public, anon, authenticated, service_role;
revoke execute on function app_private.record_operational_error(text, text, text, text, text, boolean, uuid, bigint, jsonb, uuid, jsonb) from public, anon, authenticated, service_role;
revoke execute on function app_private.emit_domain_event(text, integer, text, text, text, uuid, jsonb, uuid, bigint, uuid) from public, anon, authenticated, service_role;
revoke execute on function app_private.secure_new_public_tables() from public, anon, authenticated, service_role;
revoke execute on function app_private.get_observability_snapshot(integer, uuid) from public, anon, service_role;
grant execute on function app_private.get_observability_snapshot(integer, uuid) to authenticated;

revoke execute on function public.get_observability_snapshot(integer, uuid) from public, anon, service_role;
grant execute on function public.get_observability_snapshot(integer, uuid) to authenticated;

comment on table public.domain_events is 'Immutable domain-event ledger; event and outbox rows are committed atomically.';
comment on table public.event_outbox is 'Delivery state envelope. WBS 1.6 writes pending only; claim, lease, settle, and retry RPCs are deferred to WBS 6.1/6.3.';
comment on function app_private.new_trace_context(uuid) is 'Returns only DB-generated request_id and caller-supplied-or-generated correlation_id. Correlation is tracing context, never authority.';
comment on function app_private.write_audit_log(text, text, text, bigint, text, text, text, uuid, jsonb, uuid, jsonb) is 'Private append-only audit writer. It creates a trace unless an internal caller supplies a trace created by new_trace_context; request_id is never a public parameter.';
comment on function app_private.record_operational_error(text, text, text, text, text, boolean, uuid, bigint, jsonb, uuid, jsonb) is 'Private safe operational-error writer. It creates a trace unless an internal caller supplies a trace created by new_trace_context; raw exception text is not accepted.';
comment on function app_private.emit_domain_event(text, integer, text, text, text, uuid, jsonb, uuid, bigint, uuid) is 'Private atomic event, pending outbox, and success-audit writer. It owns one transaction trace and enforces aggregate sequencing plus content-bound idempotency.';
comment on function public.get_observability_snapshot(integer, uuid) is 'Aggregated allow-listed observability metrics for a live active super_admin only.';
