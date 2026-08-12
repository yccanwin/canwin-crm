-- WBS 2.3: dynamic portrait definitions, immutable manual revisions, and
-- system-derived freshness state. WBS 2.4 owns all public mutation commands;
-- WBS 5.5 owns the future private derived-value calculator.

create extension if not exists pg_trgm with schema extensions;

alter table public.departments
  add column public_id uuid not null default gen_random_uuid();
alter table public.departments
  add constraint departments_public_id_unique unique (public_id);
alter table public.members
  add column public_id uuid not null default gen_random_uuid();
alter table public.members
  add constraint members_public_id_unique unique (public_id);

create table public.portrait_field_definitions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  schema_version smallint not null default 1,
  field_key text not null,
  label text not null,
  description text,
  value_type text not null,
  source_kind text not null,
  privacy_class text not null default 'shared_non_sensitive',
  context_scope text not null default 'store_global',
  status text not null default 'active',
  is_read_only boolean not null default false,
  allow_keyword_search boolean not null default false,
  allowed_filter_operators text[] generated always as (
    case
      when value_type = 'text'
        then array['equals', 'prefix']::text[]
      when value_type = 'single_select'
        then array['equals']::text[]
      when value_type = 'multi_select'
        then array['contains_any', 'contains_all']::text[]
      when value_type = 'boolean' and source_kind = 'system_derived'
        then array['is_true', 'is_false', 'is_unknown']::text[]
      when value_type = 'boolean'
        then array['is_true', 'is_false']::text[]
      when value_type = 'number'
        then array['eq', 'gte', 'lte', 'between']::text[]
      else array[]::text[]
    end
  ) stored,
  validation_rules jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  inactive_at timestamptz,
  inactive_by_member_id bigint references public.members(id) on delete restrict,
  inactive_by_system text,
  created_by_member_id bigint references public.members(id) on delete restrict,
  created_by_system text,
  updated_by_member_id bigint references public.members(id) on delete restrict,
  updated_by_system text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint portrait_field_definitions_public_id_unique unique (public_id),
  constraint portrait_field_definitions_field_key_unique unique (field_key),
  constraint portrait_field_definitions_field_key_check check (
    field_key ~ '^[a-z][a-z0-9_]{2,63}$'
  ),
  constraint portrait_field_definitions_schema_version_check check (schema_version = 1),
  constraint portrait_field_definitions_label_check check (
    char_length(btrim(label)) between 1 and 100 and label !~ '[[:cntrl:]]'
  ),
  constraint portrait_field_definitions_description_check check (
    description is null or (
      char_length(btrim(description)) between 1 and 500
      and description !~ '[[:cntrl:]]'
    )
  ),
  constraint portrait_field_definitions_value_type_check check (
    value_type in ('text', 'single_select', 'multi_select', 'boolean', 'number')
  ),
  constraint portrait_field_definitions_source_kind_check check (
    source_kind in ('manual', 'system_derived')
  ),
  constraint portrait_field_definitions_privacy_check check (
    privacy_class = 'shared_non_sensitive'
  ),
  constraint portrait_field_definitions_context_check check (
    (source_kind = 'manual' and context_scope = 'store_global')
    or
    (source_kind = 'system_derived' and context_scope in ('store_global', 'store_department'))
  ),
  constraint portrait_field_definitions_status_check check (
    (source_kind = 'manual' and status in ('active', 'inactive'))
    or
    (source_kind = 'system_derived' and status in ('reserved', 'active', 'inactive'))
  ),
  constraint portrait_field_definitions_read_only_check check (
    is_read_only = (source_kind = 'system_derived')
  ),
  constraint portrait_field_definitions_keyword_check check (
    not allow_keyword_search
    or (
      source_kind = 'manual'
      and value_type = 'text'
      and privacy_class = 'shared_non_sensitive'
      and context_scope = 'store_global'
    )
  ),
  constraint portrait_field_definitions_rules_check check (
    jsonb_typeof(validation_rules) = 'object'
    and octet_length(validation_rules::text) <= 4096
    and validation_rules::text !~* '(mobile|phone|email|wechat|storage|signed[_ -]?url|ocr|document[_ -]?id|file[_ -]?path)'
  ),
  constraint portrait_field_definitions_sort_check check (sort_order between 0 and 1000000),
  constraint portrait_field_definitions_inactive_check check (
    (status in ('active', 'reserved') and inactive_at is null and inactive_by_member_id is null and inactive_by_system is null)
    or
    (
      status = 'inactive'
      and inactive_at is not null
      and ((inactive_by_member_id is not null)::integer + (inactive_by_system is not null)::integer) = 1
    )
  ),
  constraint portrait_field_definitions_created_actor_check check (
    ((created_by_member_id is not null)::integer + (created_by_system is not null)::integer) = 1
  ),
  constraint portrait_field_definitions_updated_actor_check check (
    ((updated_by_member_id is not null)::integer + (updated_by_system is not null)::integer) = 1
  ),
  constraint portrait_field_definitions_actor_source_check check (
    (source_kind = 'manual' and created_by_member_id is not null and updated_by_member_id is not null)
    or
    (source_kind = 'system_derived' and created_by_system is not null and updated_by_system is not null)
  ),
  constraint portrait_field_definitions_system_actor_check check (
    (created_by_system is null or created_by_system ~ '^[a-z][a-z0-9_.:-]{2,63}$')
    and (updated_by_system is null or updated_by_system ~ '^[a-z][a-z0-9_.:-]{2,63}$')
    and (inactive_by_system is null or inactive_by_system ~ '^[a-z][a-z0-9_.:-]{2,63}$')
  ),
  constraint portrait_field_definitions_version_check check (version > 0)
);

create table public.portrait_field_options (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  field_definition_id bigint not null references public.portrait_field_definitions(id) on delete restrict,
  option_key text not null,
  label text not null,
  status text not null default 'active',
  sort_order integer not null default 0,
  inactive_at timestamptz,
  inactive_by_member_id bigint references public.members(id) on delete restrict,
  created_by_member_id bigint not null references public.members(id) on delete restrict,
  updated_by_member_id bigint not null references public.members(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint portrait_field_options_public_id_unique unique (public_id),
  constraint portrait_field_options_field_key_unique unique (field_definition_id, option_key),
  constraint portrait_field_options_key_check check (option_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint portrait_field_options_label_check check (
    char_length(btrim(label)) between 1 and 100 and label !~ '[[:cntrl:]]'
  ),
  constraint portrait_field_options_status_check check (status in ('active', 'inactive')),
  constraint portrait_field_options_sort_check check (sort_order between 0 and 1000000),
  constraint portrait_field_options_inactive_check check (
    (status = 'active' and inactive_at is null and inactive_by_member_id is null)
    or
    (status = 'inactive' and inactive_at is not null and inactive_by_member_id is not null)
  ),
  constraint portrait_field_options_version_check check (version > 0)
);

create table public.store_portrait_values (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  store_id bigint not null references public.stores(id) on delete restrict,
  field_definition_id bigint not null references public.portrait_field_definitions(id) on delete restrict,
  source_kind text not null default 'manual',
  value_type text not null,
  revision bigint not null,
  status text not null default 'active',
  text_value text,
  text_search_value text generated always as (
    case when text_value is null then null
      else lower(regexp_replace(btrim(text_value), '[[:space:]]+', ' ', 'g'))
    end
  ) stored,
  single_select_option_id bigint references public.portrait_field_options(id) on delete restrict,
  boolean_value boolean,
  number_value numeric(38, 12),
  inactive_at timestamptz,
  inactive_by_member_id bigint references public.members(id) on delete restrict,
  created_by_member_id bigint not null references public.members(id) on delete restrict,
  updated_by_member_id bigint not null references public.members(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint store_portrait_values_public_id_unique unique (public_id),
  constraint store_portrait_values_revision_unique unique (store_id, field_definition_id, revision),
  constraint store_portrait_values_source_kind_check check (source_kind = 'manual'),
  constraint store_portrait_values_type_check check (
    value_type in ('text', 'single_select', 'multi_select', 'boolean', 'number')
  ),
  constraint store_portrait_values_revision_check check (revision > 0),
  constraint store_portrait_values_status_check check (status in ('active', 'inactive')),
  constraint store_portrait_values_typed_slots_check check (
    (value_type = 'text' and text_value is not null and single_select_option_id is null and boolean_value is null and number_value is null)
    or
    (value_type = 'single_select' and text_value is null and single_select_option_id is not null and boolean_value is null and number_value is null)
    or
    (value_type = 'multi_select' and text_value is null and single_select_option_id is null and boolean_value is null and number_value is null)
    or
    (value_type = 'boolean' and text_value is null and single_select_option_id is null and boolean_value is not null and number_value is null)
    or
    (value_type = 'number' and text_value is null and single_select_option_id is null and boolean_value is null and number_value is not null)
  ),
  constraint store_portrait_values_text_check check (
    text_value is null or (
      char_length(text_value) between 1 and 500
      and text_value = btrim(text_value)
      and text_value !~ '[[:cntrl:]]'
      and text_value !~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'
      and text_value !~ '(\+?[0-9][0-9 ()-]{6,}[0-9])'
    )
  ),
  constraint store_portrait_values_number_check check (
    number_value is null or abs(number_value) < 10000000000000000000000000::numeric
  ),
  constraint store_portrait_values_inactive_check check (
    (status = 'active' and inactive_at is null and inactive_by_member_id is null)
    or
    (status = 'inactive' and inactive_at is not null and inactive_by_member_id is not null)
  ),
  constraint store_portrait_values_version_check check (version > 0)
);

create table public.store_portrait_value_options (
  public_id uuid not null default gen_random_uuid(),
  value_id bigint not null references public.store_portrait_values(id) on delete restrict,
  option_id bigint not null references public.portrait_field_options(id) on delete restrict,
  created_by_member_id bigint not null references public.members(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (value_id, option_id),
  constraint store_portrait_value_options_public_id_unique unique (public_id)
);

create table public.store_derived_portrait_values (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  store_id bigint not null references public.stores(id) on delete restrict,
  field_definition_id bigint not null references public.portrait_field_definitions(id) on delete restrict,
  department_id bigint references public.departments(id) on delete restrict,
  revision bigint not null,
  freshness text not null,
  boolean_value boolean,
  calculation_version text,
  source_version text,
  computed_at timestamptz,
  source_changed_at timestamptz,
  reason_code text not null,
  created_by_system text not null,
  updated_by_system text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint store_derived_portrait_values_public_id_unique unique (public_id),
  constraint store_derived_portrait_values_revision_check check (revision > 0),
  constraint store_derived_portrait_values_freshness_check check (freshness in ('fresh', 'unknown', 'stale')),
  constraint store_derived_portrait_values_reason_check check (
    reason_code in (
      'COMPUTED', 'NOT_COMPUTED', 'SOURCE_NOT_READY', 'REQUIREMENTS_NOT_CONFIGURED',
      'SOURCE_CHANGED', 'RECOMPUTE_PENDING', 'COMPUTE_FAILED'
    )
  ),
  constraint store_derived_portrait_values_state_check check (
    (
      freshness = 'fresh'
      and boolean_value is not null
      and calculation_version is not null
      and source_version is not null
      and computed_at is not null
      and source_changed_at is not null
      and source_changed_at <= computed_at
      and reason_code = 'COMPUTED'
    )
    or
    (
      freshness = 'unknown'
      and boolean_value is null
      and computed_at is null
      and reason_code in ('NOT_COMPUTED', 'SOURCE_NOT_READY', 'REQUIREMENTS_NOT_CONFIGURED', 'COMPUTE_FAILED')
    )
    or
    (
      freshness = 'stale'
      and boolean_value is null
      and calculation_version is not null
      and source_version is not null
      and computed_at is not null
      and source_changed_at is not null
      and source_changed_at >= computed_at
      and reason_code in ('SOURCE_CHANGED', 'RECOMPUTE_PENDING', 'COMPUTE_FAILED')
    )
  ),
  constraint store_derived_portrait_values_versions_check check (
    (calculation_version is null or calculation_version ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$')
    and (source_version is null or source_version ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$')
  ),
  constraint store_derived_portrait_values_actor_check check (
    created_by_system ~ '^[a-z][a-z0-9_.:-]{2,63}$'
    and updated_by_system ~ '^[a-z][a-z0-9_.:-]{2,63}$'
  ),
  constraint store_derived_portrait_values_version_check check (version > 0)
);

create table app_private.store_derived_portrait_history (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  derived_value_id bigint not null references public.store_derived_portrait_values(id) on delete restrict,
  store_id bigint not null references public.stores(id) on delete restrict,
  field_definition_id bigint not null references public.portrait_field_definitions(id) on delete restrict,
  department_id bigint references public.departments(id) on delete restrict,
  revision bigint not null,
  freshness text not null,
  boolean_value boolean,
  calculation_version text,
  source_version text,
  computed_at timestamptz,
  source_changed_at timestamptz,
  reason_code text not null,
  recorded_by_system text not null,
  recorded_at timestamptz not null default now(),
  constraint store_derived_portrait_history_public_id_unique unique (public_id),
  constraint store_derived_portrait_history_revision_unique unique (derived_value_id, revision),
  constraint store_derived_portrait_history_revision_check check (revision > 0),
  constraint store_derived_portrait_history_freshness_check check (freshness in ('fresh', 'unknown', 'stale')),
  constraint store_derived_portrait_history_reason_check check (
    reason_code in (
      'COMPUTED', 'NOT_COMPUTED', 'SOURCE_NOT_READY', 'REQUIREMENTS_NOT_CONFIGURED',
      'SOURCE_CHANGED', 'RECOMPUTE_PENDING', 'COMPUTE_FAILED'
    )
  ),
  constraint store_derived_portrait_history_state_check check (
    (
      freshness = 'fresh' and boolean_value is not null and calculation_version is not null
      and source_version is not null and computed_at is not null and source_changed_at is not null
      and source_changed_at <= computed_at and reason_code = 'COMPUTED'
    )
    or
    (
      freshness = 'unknown' and boolean_value is null and computed_at is null
      and reason_code in ('NOT_COMPUTED', 'SOURCE_NOT_READY', 'REQUIREMENTS_NOT_CONFIGURED', 'COMPUTE_FAILED')
    )
    or
    (
      freshness = 'stale' and boolean_value is null and calculation_version is not null
      and source_version is not null and computed_at is not null and source_changed_at is not null
      and source_changed_at >= computed_at
      and reason_code in ('SOURCE_CHANGED', 'RECOMPUTE_PENDING', 'COMPUTE_FAILED')
    )
  ),
  constraint store_derived_portrait_history_versions_check check (
    (calculation_version is null or calculation_version ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$')
    and (source_version is null or source_version ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$')
  ),
  constraint store_derived_portrait_history_actor_check check (
    recorded_by_system ~ '^[a-z][a-z0-9_.:-]{2,63}$'
  )
);

create index portrait_field_definitions_status_sort_idx
  on public.portrait_field_definitions (status, sort_order, public_id);
create index portrait_field_definitions_type_source_idx
  on public.portrait_field_definitions (value_type, source_kind, status, public_id);
create index portrait_field_definitions_created_member_idx
  on public.portrait_field_definitions (created_by_member_id) where created_by_member_id is not null;
create index portrait_field_definitions_updated_member_idx
  on public.portrait_field_definitions (updated_by_member_id) where updated_by_member_id is not null;
create index portrait_field_definitions_inactive_member_idx
  on public.portrait_field_definitions (inactive_by_member_id) where inactive_by_member_id is not null;

create index portrait_field_options_field_sort_idx
  on public.portrait_field_options (field_definition_id, status, sort_order, public_id);
create index portrait_field_options_created_member_idx on public.portrait_field_options (created_by_member_id);
create index portrait_field_options_updated_member_idx on public.portrait_field_options (updated_by_member_id);
create index portrait_field_options_inactive_member_idx
  on public.portrait_field_options (inactive_by_member_id) where inactive_by_member_id is not null;

create unique index store_portrait_values_one_active_idx
  on public.store_portrait_values (store_id, field_definition_id)
  where status = 'active';
create index store_portrait_values_store_status_idx
  on public.store_portrait_values (store_id, status, field_definition_id, revision desc);
create index store_portrait_values_field_status_idx
  on public.store_portrait_values (field_definition_id, status, store_id);
create index store_portrait_values_single_option_idx
  on public.store_portrait_values (single_select_option_id) where single_select_option_id is not null;
create index store_portrait_values_created_member_idx on public.store_portrait_values (created_by_member_id);
create index store_portrait_values_updated_member_idx on public.store_portrait_values (updated_by_member_id);
create index store_portrait_values_inactive_member_idx
  on public.store_portrait_values (inactive_by_member_id) where inactive_by_member_id is not null;
create index store_portrait_values_text_trgm_idx
  on public.store_portrait_values using gin (text_search_value extensions.gin_trgm_ops)
  where status = 'active' and source_kind = 'manual' and value_type = 'text';

create index store_portrait_value_options_option_value_idx
  on public.store_portrait_value_options (option_id, value_id);
create index store_portrait_value_options_created_member_idx
  on public.store_portrait_value_options (created_by_member_id);

create unique index store_derived_portrait_values_global_unique_idx
  on public.store_derived_portrait_values (store_id, field_definition_id)
  where department_id is null;
create unique index store_derived_portrait_values_department_unique_idx
  on public.store_derived_portrait_values (store_id, field_definition_id, department_id)
  where department_id is not null;
create index store_derived_portrait_values_field_freshness_idx
  on public.store_derived_portrait_values (field_definition_id, freshness, store_id, department_id);
create index store_derived_portrait_values_department_freshness_idx
  on public.store_derived_portrait_values (department_id, freshness, store_id)
  where department_id is not null;

create index store_derived_portrait_history_current_timeline_idx
  on app_private.store_derived_portrait_history (derived_value_id, revision desc, recorded_at desc);
create index store_derived_portrait_history_store_field_idx
  on app_private.store_derived_portrait_history (store_id, field_definition_id, department_id, recorded_at desc);
create index store_derived_portrait_history_department_idx
  on app_private.store_derived_portrait_history (department_id, recorded_at desc)
  where department_id is not null;

create or replace function app_private.portrait_current_department_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select m.primary_department_id
  from public.members as m
  join public.departments as d on d.id = m.primary_department_id and d.status = 'active'
  where m.id = (select app_private.current_member_id())
    and m.status = 'active'
  limit 1;
$$;

create or replace function app_private.protect_portrait_definition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '23503', message = 'PORTRAIT_DEFINITION_DELETE_FORBIDDEN';
  end if;
  if new.id is distinct from old.id
    or new.public_id is distinct from old.public_id
    or new.schema_version is distinct from old.schema_version
    or new.field_key is distinct from old.field_key
    or new.value_type is distinct from old.value_type
    or new.source_kind is distinct from old.source_kind
    or new.privacy_class is distinct from old.privacy_class
    or new.context_scope is distinct from old.context_scope
    or new.created_by_member_id is distinct from old.created_by_member_id
    or new.created_by_system is distinct from old.created_by_system
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode = '23514', message = 'PORTRAIT_DEFINITION_IDENTITY_IMMUTABLE';
  end if;
  if old.source_kind = 'system_derived' and new.status is distinct from old.status then
    raise exception using errcode = '23514', message = 'SYSTEM_DERIVED_DEFINITION_LIFECYCLE_RESERVED';
  end if;
  if old.source_kind = 'manual'
    and new.status is distinct from old.status
    and not (old.status = 'active' and new.status = 'inactive'
      or old.status = 'inactive' and new.status = 'active')
  then
    raise exception using errcode = '23514', message = 'PORTRAIT_DEFINITION_STATUS_TRANSITION_INVALID';
  end if;
  if old.source_kind = 'system_derived'
    and (new.label is distinct from old.label
      or new.description is distinct from old.description
      or new.is_read_only is distinct from old.is_read_only
      or new.allow_keyword_search is distinct from old.allow_keyword_search
      or new.validation_rules is distinct from old.validation_rules
      or new.sort_order is distinct from old.sort_order)
  then
    raise exception using errcode = '23514', message = 'SYSTEM_DERIVED_DEFINITION_RESERVED';
  end if;
  return new;
end;
$$;

create or replace function app_private.validate_portrait_option()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_type text;
  v_source text;
  v_status text;
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '23503', message = 'PORTRAIT_OPTION_DELETE_FORBIDDEN';
  end if;
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.public_id is distinct from old.public_id
    or new.field_definition_id is distinct from old.field_definition_id
    or new.option_key is distinct from old.option_key
    or new.created_by_member_id is distinct from old.created_by_member_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception using errcode = '23514', message = 'PORTRAIT_OPTION_IDENTITY_IMMUTABLE';
  end if;
  select d.value_type, d.source_kind, d.status into v_type, v_source, v_status
  from public.portrait_field_definitions as d where d.id = new.field_definition_id;
  if v_source <> 'manual' or v_type not in ('single_select', 'multi_select') then
    raise exception using errcode = '23514', message = 'PORTRAIT_OPTION_FIELD_INVALID';
  end if;
  if (tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.status = 'active' and old.status = 'inactive'))
    and v_status <> 'active'
  then
    raise exception using errcode = '23514', message = 'PORTRAIT_OPTION_FIELD_INACTIVE';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status
    and not (old.status = 'active' and new.status = 'inactive'
      or old.status = 'inactive' and new.status = 'active')
  then
    raise exception using errcode = '23514', message = 'PORTRAIT_OPTION_STATUS_TRANSITION_INVALID';
  end if;
  return new;
end;
$$;

create or replace function app_private.validate_store_portrait_value()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_type text;
  v_source text;
  v_field_status text;
  v_option_field bigint;
  v_option_status text;
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '23503', message = 'PORTRAIT_VALUE_DELETE_FORBIDDEN';
  end if;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.public_id is distinct from old.public_id
      or new.store_id is distinct from old.store_id
      or new.field_definition_id is distinct from old.field_definition_id
      or new.source_kind is distinct from old.source_kind
      or new.value_type is distinct from old.value_type
      or new.revision is distinct from old.revision
      or new.text_value is distinct from old.text_value
      or new.single_select_option_id is distinct from old.single_select_option_id
      or new.boolean_value is distinct from old.boolean_value
      or new.number_value is distinct from old.number_value
      or new.created_by_member_id is distinct from old.created_by_member_id
      or new.created_at is distinct from old.created_at
    then
      raise exception using errcode = '23514', message = 'PORTRAIT_VALUE_REVISION_IMMUTABLE';
    end if;
    if not (old.status = 'active' and new.status = 'inactive') then
      raise exception using errcode = '23514', message = 'PORTRAIT_VALUE_ONLY_DEACTIVATION_ALLOWED';
    end if;
  end if;
  select d.value_type, d.source_kind, d.status into v_type, v_source, v_field_status
  from public.portrait_field_definitions as d where d.id = new.field_definition_id;
  if v_source <> 'manual' or v_field_status <> 'active' or v_type <> new.value_type then
    raise exception using errcode = '23514', message = 'PORTRAIT_VALUE_FIELD_INVALID';
  end if;
  if tg_op = 'INSERT' and new.status <> 'active' then
    raise exception using errcode = '23514', message = 'PORTRAIT_VALUE_NEW_REVISION_MUST_BE_ACTIVE';
  end if;
  if new.value_type = 'single_select' then
    select o.field_definition_id, o.status into v_option_field, v_option_status
    from public.portrait_field_options as o where o.id = new.single_select_option_id;
    if v_option_field is distinct from new.field_definition_id or v_option_status <> 'active' then
      raise exception using errcode = '23514', message = 'PORTRAIT_SINGLE_OPTION_INVALID';
    end if;
  end if;
  return new;
end;
$$;

create or replace function app_private.validate_store_portrait_value_option()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_value_field bigint;
  v_value_type text;
  v_value_status text;
  v_option_field bigint;
  v_option_status text;
  v_field_status text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception using errcode = '23514', message = 'PORTRAIT_VALUE_OPTION_IMMUTABLE';
  end if;
  select v.field_definition_id, v.value_type, v.status
    into v_value_field, v_value_type, v_value_status
  from public.store_portrait_values as v where v.id = new.value_id;
  select o.field_definition_id, o.status into v_option_field, v_option_status
  from public.portrait_field_options as o where o.id = new.option_id;
  select d.status into v_field_status from public.portrait_field_definitions as d where d.id = v_value_field;
  if v_value_type <> 'multi_select' or v_value_status <> 'active'
    or v_option_field is distinct from v_value_field or v_option_status <> 'active'
    or v_field_status <> 'active'
  then
    raise exception using errcode = '23514', message = 'PORTRAIT_MULTI_OPTION_INVALID';
  end if;
  if (select count(*) from public.store_portrait_value_options as link where link.value_id = new.value_id) >= 50 then
    raise exception using errcode = '23514', message = 'PORTRAIT_MULTI_OPTION_LIMIT_EXCEEDED';
  end if;
  return new;
end;
$$;

create or replace function app_private.require_portrait_multi_options()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.value_type = 'multi_select' and new.status = 'active'
    and not exists (
      select 1 from public.store_portrait_value_options as link where link.value_id = new.id
    )
  then
    raise exception using errcode = '23514', message = 'PORTRAIT_MULTI_OPTION_REQUIRED';
  end if;
  return null;
end;
$$;

create or replace function app_private.validate_derived_portrait_value()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source text;
  v_type text;
  v_scope text;
  v_status text;
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '23503', message = 'DERIVED_PORTRAIT_DELETE_FORBIDDEN';
  end if;
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.public_id is distinct from old.public_id
    or new.store_id is distinct from old.store_id
    or new.field_definition_id is distinct from old.field_definition_id
    or new.department_id is distinct from old.department_id
    or new.created_by_system is distinct from old.created_by_system
    or new.created_at is distinct from old.created_at
  ) then
    raise exception using errcode = '23514', message = 'DERIVED_PORTRAIT_IDENTITY_IMMUTABLE';
  end if;
  select d.source_kind, d.value_type, d.context_scope, d.status
    into v_source, v_type, v_scope, v_status
  from public.portrait_field_definitions as d where d.id = new.field_definition_id;
  if v_source <> 'system_derived' or v_type <> 'boolean' or v_status <> 'active' then
    raise exception using errcode = '23514', message = 'DERIVED_PORTRAIT_FIELD_INVALID';
  end if;
  if (v_scope = 'store_global' and new.department_id is not null)
    or (v_scope = 'store_department' and new.department_id is null)
  then
    raise exception using errcode = '23514', message = 'DERIVED_PORTRAIT_CONTEXT_INVALID';
  end if;
  return new;
end;
$$;

create or replace function app_private.validate_derived_portrait_history()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_store bigint;
  v_field bigint;
  v_department bigint;
begin
  select v.store_id, v.field_definition_id, v.department_id
    into v_store, v_field, v_department
  from public.store_derived_portrait_values as v where v.id = new.derived_value_id;
  if v_store is distinct from new.store_id
    or v_field is distinct from new.field_definition_id
    or v_department is distinct from new.department_id
  then
    raise exception using errcode = '23514', message = 'DERIVED_PORTRAIT_HISTORY_IDENTITY_INVALID';
  end if;
  return new;
end;
$$;

create or replace function app_private.reject_portrait_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using errcode = '23514', message = 'PORTRAIT_APPEND_ONLY';
end;
$$;

create trigger portrait_field_definitions_guard
before update or delete on public.portrait_field_definitions
for each row execute function app_private.protect_portrait_definition();
create trigger portrait_field_definitions_touch
before update on public.portrait_field_definitions
for each row execute function app_private.touch_updated_at();
create trigger portrait_field_definitions_no_truncate
before truncate on public.portrait_field_definitions
for each statement execute function app_private.reject_portrait_mutation();

create trigger portrait_field_options_guard
before insert or update or delete on public.portrait_field_options
for each row execute function app_private.validate_portrait_option();
create trigger portrait_field_options_touch
before update on public.portrait_field_options
for each row execute function app_private.touch_updated_at();
create trigger portrait_field_options_no_truncate
before truncate on public.portrait_field_options
for each statement execute function app_private.reject_portrait_mutation();

create trigger store_portrait_values_guard
before insert or update or delete on public.store_portrait_values
for each row execute function app_private.validate_store_portrait_value();
create trigger store_portrait_values_touch
before update on public.store_portrait_values
for each row execute function app_private.touch_updated_at();
create trigger store_portrait_values_no_truncate
before truncate on public.store_portrait_values
for each statement execute function app_private.reject_portrait_mutation();
create constraint trigger store_portrait_values_multi_complete
after insert or update on public.store_portrait_values
deferrable initially deferred
for each row execute function app_private.require_portrait_multi_options();

create trigger store_portrait_value_options_guard
before insert or update or delete on public.store_portrait_value_options
for each row execute function app_private.validate_store_portrait_value_option();
create trigger store_portrait_value_options_no_truncate
before truncate on public.store_portrait_value_options
for each statement execute function app_private.reject_portrait_mutation();

create trigger store_derived_portrait_values_guard
before insert or update or delete on public.store_derived_portrait_values
for each row execute function app_private.validate_derived_portrait_value();
create trigger store_derived_portrait_values_touch
before update on public.store_derived_portrait_values
for each row execute function app_private.touch_updated_at();
create trigger store_derived_portrait_values_no_truncate
before truncate on public.store_derived_portrait_values
for each statement execute function app_private.reject_portrait_mutation();

create trigger store_derived_portrait_history_validate
before insert on app_private.store_derived_portrait_history
for each row execute function app_private.validate_derived_portrait_history();
create trigger store_derived_portrait_history_append_only
before update or delete or truncate on app_private.store_derived_portrait_history
for each statement execute function app_private.reject_portrait_mutation();

insert into public.portrait_field_definitions (
  public_id, field_key, label, description, value_type, source_kind, privacy_class,
  context_scope, status, is_read_only, allow_keyword_search, validation_rules,
  sort_order, created_by_system, updated_by_system
) values
  (
    '23000000-0000-4000-8000-000000000001', 'has_legal_person_id', '法人身份证状态',
    '系统保留定义；权威规则由 WBS 5.5 激活。', 'boolean', 'system_derived',
    'shared_non_sensitive', 'store_global', 'reserved', true, false,
    '{"read_only":true,"unknown_when_absent":true}'::jsonb, 900001,
    'system:wbs_2_3_migration', 'system:wbs_2_3_migration'
  ),
  (
    '23000000-0000-4000-8000-000000000002', 'has_business_license', '营业执照状态',
    '系统保留定义；权威规则由 WBS 5.5 激活。', 'boolean', 'system_derived',
    'shared_non_sensitive', 'store_global', 'reserved', true, false,
    '{"read_only":true,"unknown_when_absent":true}'::jsonb, 900002,
    'system:wbs_2_3_migration', 'system:wbs_2_3_migration'
  ),
  (
    '23000000-0000-4000-8000-000000000003', 'documents_complete', '证件齐全状态',
    '系统保留定义；仅当前主营部门上下文可读，权威规则由 WBS 5.5 激活。',
    'boolean', 'system_derived', 'shared_non_sensitive', 'store_department',
    'reserved', true, false, '{"read_only":true,"unknown_when_absent":true}'::jsonb,
    900003, 'system:wbs_2_3_migration', 'system:wbs_2_3_migration'
  );

alter table public.portrait_field_definitions enable row level security;
alter table public.portrait_field_definitions force row level security;
alter table public.portrait_field_options enable row level security;
alter table public.portrait_field_options force row level security;
alter table public.store_portrait_values enable row level security;
alter table public.store_portrait_values force row level security;
alter table public.store_portrait_value_options enable row level security;
alter table public.store_portrait_value_options force row level security;
alter table public.store_derived_portrait_values enable row level security;
alter table public.store_derived_portrait_values force row level security;
alter table app_private.store_derived_portrait_history enable row level security;
alter table app_private.store_derived_portrait_history force row level security;

create policy portrait_field_definitions_live_member_select
on public.portrait_field_definitions for select to authenticated
using ((select app_private.current_member_id()) is not null);
create policy portrait_field_options_live_member_select
on public.portrait_field_options for select to authenticated
using ((select app_private.current_member_id()) is not null);
create policy store_portrait_values_live_member_select
on public.store_portrait_values for select to authenticated
using ((select app_private.current_member_id()) is not null);
create policy store_portrait_value_options_live_member_select
on public.store_portrait_value_options for select to authenticated
using ((select app_private.current_member_id()) is not null);
create policy store_derived_portrait_values_context_select
on public.store_derived_portrait_values for select to authenticated
using (
  (select app_private.current_member_id()) is not null
  and (
    department_id is null
    or department_id = (select app_private.portrait_current_department_id())
  )
);

create or replace function public.read_portrait_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if (select app_private.current_member_id()) is null then
    raise exception using errcode = '42501', message = 'SESSION_INVALID';
  end if;

  select jsonb_build_object(
    'schema_version', 1,
    'fields', coalesce(jsonb_agg(projected.field order by projected.sort_order, projected.public_id), '[]'::jsonb)
  )
  into v_result
  from (
    select
      d.sort_order,
      d.public_id,
      jsonb_build_object(
        'schema_version', 1,
        'public_id', d.public_id,
        'field_key', d.field_key,
        'label', d.label,
        'description', d.description,
        'value_type', d.value_type,
        'source_kind', d.source_kind,
        'privacy_level', 'shared_non_sensitive',
        'context_scope', d.context_scope,
        'status', d.status,
        'sort_order', d.sort_order,
        'constraints', case d.value_type
          when 'text' then jsonb_build_object('min_length', 1, 'max_length', 500)
          when 'multi_select' then jsonb_build_object('min_selections', 1, 'max_selections', 50)
          when 'number' then jsonb_build_object('maximum_scale', 12)
          else '{}'::jsonb
        end,
        'allow_keyword_search', d.allow_keyword_search and d.status = 'active',
        'allowed_filter_operators', to_jsonb(d.allowed_filter_operators),
        'capabilities', jsonb_build_object('can_set', false, 'can_clear', false),
        'options', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'public_id', o.public_id,
              'option_key', o.option_key,
              'label', o.label,
              'status', o.status,
              'sort_order', o.sort_order
            ) order by o.sort_order, o.public_id
          )
          from public.portrait_field_options as o
          where o.field_definition_id = d.id
        ), '[]'::jsonb)
      ) as field
    from public.portrait_field_definitions as d
    where d.source_kind = 'manual'
      or d.field_key in ('has_legal_person_id', 'has_business_license', 'documents_complete')
  ) as projected;

  return v_result;
end;
$$;

create or replace function public.read_store_derived_portraits(p_store_public_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member_id bigint;
  v_department_id bigint;
  v_context_version bigint;
  v_result jsonb;
begin
  v_member_id := app_private.current_member_id();
  if v_member_id is null then
    raise exception using errcode = '42501', message = 'SESSION_INVALID';
  end if;
  if p_store_public_id is null then
    raise exception using errcode = '22023', message = 'STORE_PUBLIC_ID_REQUIRED';
  end if;

  v_department_id := app_private.portrait_current_department_id();

  select least(
    9007199254740991::bigint,
    greatest(1::bigint, member.version + department.version + store.version
      + coalesce((select sum(d.version) from public.portrait_field_definitions as d), 0)
      + coalesce((select sum(v.version) from public.store_derived_portrait_values as v where v.store_id = store.id), 0))
  )
  into v_context_version
  from public.members as member
  join public.departments as department on department.id = member.primary_department_id and department.status = 'active'
  join public.stores as store on store.public_id = p_store_public_id
  where member.id = v_member_id;

  if v_context_version is null then
    raise exception using errcode = 'P0002', message = 'STORE_NOT_FOUND';
  end if;

  select jsonb_build_object(
    'schema_version', 1,
    'context', jsonb_build_object(
      'auth_user_public_id', member.auth_user_id,
      'member_public_id', member.public_id,
      'primary_department_public_id', department.public_id,
      'store_public_id', store.public_id,
      'context_version', v_context_version
    ),
    'values', coalesce(jsonb_agg(projected.value order by projected.sort_order, projected.public_id), '[]'::jsonb)
  )
  into v_result
  from public.members as member
  join public.departments as department on department.id = member.primary_department_id and department.status = 'active'
  join public.stores as store on store.public_id = p_store_public_id
  left join lateral (
    select
      d.sort_order,
      d.public_id,
      jsonb_build_object(
        'schema_version', 1,
        'field_public_id', d.public_id,
        'store_public_id', store.public_id,
        'department_public_id', case when d.context_scope = 'store_department' then department.public_id else null end,
        'context_version', v_context_version,
        'freshness', coalesce(v.freshness, 'unknown'),
        'value', case when v.freshness = 'fresh' then v.boolean_value else null end,
        'calculation_version', v.calculation_version,
        'source_version', v.source_version,
        'computed_at', case when v.computed_at is null then null else to_char(v.computed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
        'source_changed_at', case when v.source_changed_at is null then null else to_char(v.source_changed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
        'reason_code', case when v.freshness = 'fresh' then null else coalesce(v.reason_code, 'NOT_COMPUTED') end
      ) as value
    from public.portrait_field_definitions as d
    left join public.store_derived_portrait_values as v
      on v.store_id = store.id
     and v.field_definition_id = d.id
     and ((d.context_scope = 'store_global' and v.department_id is null)
       or (d.context_scope = 'store_department' and v.department_id = v_department_id))
    where d.source_kind = 'system_derived'
      and d.field_key in ('has_legal_person_id', 'has_business_license', 'documents_complete')
  ) as projected on true
  where member.id = v_member_id
  group by member.auth_user_id, member.public_id, department.public_id, store.public_id;

  return v_result;
end;
$$;

revoke all on table public.portrait_field_definitions from public, anon, authenticated, service_role;
revoke all on table public.portrait_field_options from public, anon, authenticated, service_role;
revoke all on table public.store_portrait_values from public, anon, authenticated, service_role;
revoke all on table public.store_portrait_value_options from public, anon, authenticated, service_role;
revoke all on table public.store_derived_portrait_values from public, anon, authenticated, service_role;
revoke all on table app_private.store_derived_portrait_history from public, anon, authenticated, service_role;

revoke all on sequence public.portrait_field_definitions_id_seq from public, anon, authenticated, service_role;
revoke all on sequence public.portrait_field_options_id_seq from public, anon, authenticated, service_role;
revoke all on sequence public.store_portrait_values_id_seq from public, anon, authenticated, service_role;
revoke all on sequence public.store_derived_portrait_values_id_seq from public, anon, authenticated, service_role;
revoke all on sequence app_private.store_derived_portrait_history_id_seq from public, anon, authenticated, service_role;

revoke all on function app_private.portrait_current_department_id() from public, anon, authenticated, service_role;
grant execute on function app_private.portrait_current_department_id() to authenticated;
revoke all on function app_private.protect_portrait_definition() from public, anon, authenticated, service_role;
revoke all on function app_private.validate_portrait_option() from public, anon, authenticated, service_role;
revoke all on function app_private.validate_store_portrait_value() from public, anon, authenticated, service_role;
revoke all on function app_private.validate_store_portrait_value_option() from public, anon, authenticated, service_role;
revoke all on function app_private.require_portrait_multi_options() from public, anon, authenticated, service_role;
revoke all on function app_private.validate_derived_portrait_value() from public, anon, authenticated, service_role;
revoke all on function app_private.validate_derived_portrait_history() from public, anon, authenticated, service_role;
revoke all on function app_private.reject_portrait_mutation() from public, anon, authenticated, service_role;
revoke all on function public.read_portrait_catalog() from public, anon, authenticated, service_role;
revoke all on function public.read_store_derived_portraits(uuid) from public, anon, authenticated, service_role;
grant execute on function public.read_portrait_catalog() to authenticated;
grant execute on function public.read_store_derived_portraits(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'portrait_field_definitions') then
      alter publication supabase_realtime drop table public.portrait_field_definitions;
    end if;
    if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'portrait_field_options') then
      alter publication supabase_realtime drop table public.portrait_field_options;
    end if;
    if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'store_portrait_values') then
      alter publication supabase_realtime drop table public.store_portrait_values;
    end if;
    if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'store_portrait_value_options') then
      alter publication supabase_realtime drop table public.store_portrait_value_options;
    end if;
    if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'store_derived_portrait_values') then
      alter publication supabase_realtime drop table public.store_derived_portrait_values;
    end if;
    if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'app_private' and tablename = 'store_derived_portrait_history') then
      alter publication supabase_realtime drop table app_private.store_derived_portrait_history;
    end if;
  end if;
end;
$$;

comment on table public.portrait_field_definitions is 'WBS 2.3 shared safe portrait schema; reserved system-derived definitions remain unknown until WBS 5.5.';
comment on table public.store_portrait_values is 'Immutable manual portrait revisions. WBS 2.4 commands deactivate old revisions and insert replacements.';
comment on table public.store_derived_portrait_values is 'Safe current system-derived boolean freshness; no document/contact identifiers or values.';
comment on table app_private.store_derived_portrait_history is 'Private append-only derived portrait history; future writes only through the WBS 5.5 calculator.';
