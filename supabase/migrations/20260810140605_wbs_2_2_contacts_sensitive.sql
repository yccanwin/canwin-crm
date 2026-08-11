-- WBS 2.2: non-identifying shared contact structure, isolated contact secrets,
-- live capability checks, and audited super-admin-only plaintext access.

create table public.contacts (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  store_id bigint not null
    references public.stores(id) on delete restrict,
  role_label text not null,
  is_primary boolean not null default false,
  status text not null default 'active',
  status_reason text,
  status_changed_at timestamptz not null default now(),
  created_by_member_id bigint not null
    references public.members(id) on delete restrict,
  updated_by_member_id bigint not null
    references public.members(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint contacts_public_id_unique unique (public_id),
  constraint contacts_role_label_check check (
    char_length(btrim(role_label)) between 1 and 100
    and role_label !~ '[[:cntrl:]]'
  ),
  constraint contacts_status_check check (
    status in ('active', 'inactive')
  ),
  constraint contacts_status_state_check check (
    (status = 'active' and status_reason is null)
    or
    (
      status = 'inactive'
      and status_reason is not null
      and char_length(btrim(status_reason)) between 1 and 500
      and status_reason !~ '[[:cntrl:]]'
    )
  ),
  constraint contacts_version_check check (version > 0)
);

create table app_private.contact_secrets (
  contact_id bigint primary key
    references public.contacts(id) on delete restrict,
  full_name text,
  mobile text,
  phone text,
  email text,
  wechat text,
  other text,
  created_by_member_id bigint not null
    references public.members(id) on delete restrict,
  updated_by_member_id bigint not null
    references public.members(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint contact_secrets_full_name_check check (
    full_name is null
    or (
      char_length(btrim(full_name)) between 1 and 200
      and full_name !~ '[[:cntrl:]]'
    )
  ),
  constraint contact_secrets_mobile_check check (
    mobile is null
    or (
      char_length(btrim(mobile)) between 1 and 50
      and mobile !~ '[[:cntrl:]]'
    )
  ),
  constraint contact_secrets_phone_check check (
    phone is null
    or (
      char_length(btrim(phone)) between 1 and 50
      and phone !~ '[[:cntrl:]]'
    )
  ),
  constraint contact_secrets_email_check check (
    email is null
    or (
      char_length(btrim(email)) between 3 and 320
      and email !~ '[[:cntrl:]]'
    )
  ),
  constraint contact_secrets_wechat_check check (
    wechat is null
    or (
      char_length(btrim(wechat)) between 1 and 100
      and wechat !~ '[[:cntrl:]]'
    )
  ),
  constraint contact_secrets_other_check check (
    other is null
    or (
      char_length(btrim(other)) between 1 and 500
      and other !~ '[[:cntrl:]]'
    )
  ),
  constraint contact_secrets_version_check check (version > 0)
);

create index contacts_store_status_idx
  on public.contacts (store_id, status, id);

create unique index contacts_one_active_primary_per_store_idx
  on public.contacts (store_id)
  where is_primary and status = 'active';

create index contacts_status_updated_idx
  on public.contacts (status, updated_at desc, id);

create index contacts_created_by_member_id_idx
  on public.contacts (created_by_member_id);

create index contacts_updated_by_member_id_idx
  on public.contacts (updated_by_member_id);

create index contact_secrets_created_by_member_id_idx
  on app_private.contact_secrets (created_by_member_id);

create index contact_secrets_updated_by_member_id_idx
  on app_private.contact_secrets (updated_by_member_id);

create or replace function app_private.protect_contact_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception using errcode = '23503', message = 'CONTACT_TRUNCATE_FORBIDDEN';
  elsif tg_op = 'DELETE' then
    raise exception using errcode = '23503', message = 'CONTACT_DELETE_FORBIDDEN';
  end if;

  if new.id is distinct from old.id
    or new.public_id is distinct from old.public_id
    or new.store_id is distinct from old.store_id
    or new.created_by_member_id is distinct from old.created_by_member_id
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode = '23514', message = 'CONTACT_IDENTITY_IMMUTABLE';
  end if;

  return new;
end;
$$;

create or replace function app_private.protect_contact_secret_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception using errcode = '23503', message = 'CONTACT_SECRET_TRUNCATE_FORBIDDEN';
  elsif tg_op = 'DELETE' then
    raise exception using errcode = '23503', message = 'CONTACT_SECRET_DELETE_FORBIDDEN';
  end if;

  if new.contact_id is distinct from old.contact_id
    or new.created_by_member_id is distinct from old.created_by_member_id
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode = '23514', message = 'CONTACT_SECRET_IDENTITY_IMMUTABLE';
  end if;

  return new;
end;
$$;

create trigger contacts_protect_identity
before update or delete on public.contacts
for each row execute function app_private.protect_contact_identity();

create trigger contacts_touch_updated_at
before update on public.contacts
for each row execute function app_private.touch_updated_at();

create trigger contacts_protect_truncate
before truncate on public.contacts
for each statement execute function app_private.protect_contact_identity();

create trigger contact_secrets_protect_identity
before update or delete on app_private.contact_secrets
for each row execute function app_private.protect_contact_secret_identity();

create trigger contact_secrets_touch_updated_at
before update on app_private.contact_secrets
for each row execute function app_private.touch_updated_at();

create trigger contact_secrets_protect_truncate
before truncate on app_private.contact_secrets
for each statement execute function app_private.protect_contact_secret_identity();

alter table public.contacts enable row level security;
alter table public.contacts force row level security;
alter table app_private.contact_secrets enable row level security;
alter table app_private.contact_secrets force row level security;

create policy contacts_shared_archive_select
on public.contacts
for select
to authenticated
using ((select app_private.current_member_id()) is not null);

create or replace function app_private.contact_access_capability(
  p_contact_public_id uuid
)
returns table (
  allowed boolean,
  reason_code text,
  actor_member_id bigint,
  contact_id bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_any_member_id bigint;
  v_actor_member_id bigint;
  v_actor_role text;
  v_member_status text;
  v_department_status text;
  v_contact_id bigint;
begin
  if (select auth.uid()) is null then
    return query select false, 'AUTH_REQUIRED'::text, null::bigint, null::bigint;
    return;
  end if;

  if not (select app_private.current_session_is_valid()) then
    return query select false, 'SESSION_INVALID'::text, null::bigint, null::bigint;
    return;
  end if;

  v_any_member_id := app_private.current_member_id_any_status();
  if v_any_member_id is null then
    return query select false, 'MEMBERSHIP_INACTIVE'::text, null::bigint, null::bigint;
    return;
  end if;

  select m.status, d.status
    into v_member_status, v_department_status
  from public.members as m
  join public.departments as d on d.id = m.primary_department_id
  where m.id = v_any_member_id;

  if v_member_status <> 'active' then
    return query select false, 'MEMBERSHIP_INACTIVE'::text,
      v_any_member_id, null::bigint;
    return;
  end if;

  if v_department_status <> 'active' then
    return query select false, 'DEPARTMENT_INACTIVE'::text,
      v_any_member_id, null::bigint;
    return;
  end if;

  v_actor_member_id := app_private.current_member_id();
  if v_actor_member_id is null then
    return query select false, 'MEMBERSHIP_INACTIVE'::text,
      v_any_member_id, null::bigint;
    return;
  end if;

  select c.id
    into v_contact_id
  from public.contacts as c
  join public.stores as s
    on s.id = c.store_id
   and s.status = 'active'
  join public.accounts as a
    on a.id = s.account_id
   and a.status = 'active'
  where c.public_id = p_contact_public_id
    and c.status = 'active';

  if not found then
    return query select false, 'CONTACT_UNAVAILABLE'::text,
      v_actor_member_id, null::bigint;
    return;
  end if;

  select m.role
    into v_actor_role
  from public.members as m
  where m.id = v_actor_member_id;

  if v_actor_role = 'super_admin' then
    return query select true, 'ALLOWED'::text, v_actor_member_id, v_contact_id;
  else
    return query select false, 'NOT_CLAIMED'::text, v_actor_member_id, v_contact_id;
  end if;
end;
$$;

create or replace function app_private.read_contact_secret(
  p_contact_public_id uuid,
  p_reason text default null,
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
  v_request_id uuid;
  v_correlation_id uuid;
  v_allowed boolean;
  v_reason_code text;
  v_actor_member_id bigint;
  v_contact_id bigint;
  v_full_name text;
  v_channels jsonb;
begin
  v_trace := app_private.new_trace_context(p_correlation_id);
  v_request_id := (v_trace ->> 'request_id')::uuid;
  v_correlation_id := (v_trace ->> 'correlation_id')::uuid;

  select capability.allowed, capability.reason_code,
         capability.actor_member_id, capability.contact_id
    into v_allowed, v_reason_code, v_actor_member_id, v_contact_id
  from app_private.contact_access_capability(p_contact_public_id) as capability;

  v_allowed := coalesce(v_allowed, false);
  v_reason_code := coalesce(v_reason_code, 'CONTACT_UNAVAILABLE');

  if v_allowed and p_reason is null then
    v_allowed := false;
    v_reason_code := 'REASON_REQUIRED';
  elsif v_allowed and (
    char_length(btrim(p_reason)) not between 1 and 500
    or p_reason ~ '[[:cntrl:]]'
  ) then
    v_allowed := false;
    v_reason_code := 'REASON_INVALID';
  end if;

  if not coalesce(v_allowed, false) then
    perform app_private.write_audit_log(
      'contacts', 'secret.read', 'denied', v_actor_member_id,
      v_reason_code,
      case when p_contact_public_id is null then null else 'contact' end,
      p_contact_public_id::text, null, '{}'::jsonb,
      v_correlation_id, v_trace
    );
    return app_private.rpc_success(
      jsonb_build_object(
        'contact_access', jsonb_build_object(
          'allowed', false,
          'reason_code', v_reason_code
        )
      ),
      v_request_id,
      v_correlation_id
    );
  end if;

  select secrets.full_name,
         coalesce(
           jsonb_agg(
             jsonb_build_object('type', channels.channel_type, 'value', channels.value)
             order by channels.ordinal
           ) filter (where channels.value is not null),
           '[]'::jsonb
         )
    into v_full_name, v_channels
  from public.contacts as c
  left join app_private.contact_secrets as secrets
    on secrets.contact_id = c.id
  cross join lateral (
    values
      (1, 'mobile'::text, secrets.mobile),
      (2, 'phone'::text, secrets.phone),
      (3, 'email'::text, secrets.email),
      (4, 'wechat'::text, secrets.wechat),
      (5, 'other'::text, secrets.other)
  ) as channels(ordinal, channel_type, value)
  where c.id = v_contact_id
  group by secrets.full_name;

  perform app_private.write_audit_log(
    'contacts', 'secret.read', 'success', v_actor_member_id, null,
    'contact', p_contact_public_id::text, null,
    jsonb_build_object('channel_count', jsonb_array_length(v_channels)),
    v_correlation_id, v_trace
  );

  return app_private.rpc_success(
    jsonb_build_object(
      'contact_access', jsonb_build_object(
        'allowed', true,
        'full_name', v_full_name,
        'channels', v_channels
      )
    ),
    v_request_id,
    v_correlation_id
  );
end;
$$;

create or replace function public.read_contact_secret(
  p_contact_public_id uuid,
  p_reason text default null,
  p_correlation_id uuid default null
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select app_private.read_contact_secret(
    p_contact_public_id,
    p_reason,
    p_correlation_id
  );
$$;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'app_private'
      and tablename = 'contact_secrets'
  ) then
    execute 'alter publication supabase_realtime drop table app_private.contact_secrets';
  end if;
end;
$$;

revoke all on table public.contacts from public, anon, authenticated, service_role;
revoke all on table app_private.contact_secrets from public, anon, authenticated, service_role;
revoke all on sequence public.contacts_id_seq from public, anon, authenticated, service_role;

grant select on table public.contacts to authenticated, service_role;

revoke execute on function app_private.protect_contact_identity()
  from public, anon, authenticated, service_role;
revoke execute on function app_private.protect_contact_secret_identity()
  from public, anon, authenticated, service_role;
revoke execute on function app_private.contact_access_capability(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function app_private.read_contact_secret(uuid, text, uuid)
  from public, anon, service_role;
grant execute on function app_private.read_contact_secret(uuid, text, uuid)
  to authenticated;

revoke execute on function public.read_contact_secret(uuid, text, uuid)
  from public, anon, service_role;
grant execute on function public.read_contact_secret(uuid, text, uuid)
  to authenticated;

comment on table public.contacts is
  'WBS 2.2 non-identifying shared contact structure. Identity and channels are isolated in app_private.contact_secrets.';
comment on table app_private.contact_secrets is
  'WBS 2.2 plaintext contact identity and channels. No direct Data API, Realtime, service-role, or ordinary-role access.';
comment on function app_private.contact_access_capability(uuid) is
  'Private stable capability extension point. WBS 2.2 allows only a live active super_admin; WBS 4.2 will add claimed-opportunity authorization.';
comment on function public.read_contact_secret(uuid, text, uuid) is
  'Audited contact-secret read RPC. Denied responses omit all sensitive keys and values.';
