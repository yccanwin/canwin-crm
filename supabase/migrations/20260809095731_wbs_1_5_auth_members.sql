create schema if not exists app_private;

revoke all on schema app_private from public;

create table public.departments (
  id bigint generated always as identity primary key,
  code text not null unique,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint departments_code_format_check
    check (code ~ '^[a-z][a-z0-9_-]{1,62}$'),
  constraint departments_name_check
    check (char_length(btrim(name)) between 1 and 100),
  constraint departments_status_check
    check (status in ('active', 'inactive')),
  constraint departments_version_check
    check (version > 0)
);

create table public.members (
  id bigint generated always as identity primary key,
  auth_user_id uuid not null unique
    references auth.users(id) on delete restrict,
  primary_department_id bigint not null
    references public.departments(id) on delete restrict,
  role text not null,
  status text not null default 'active',
  accepted_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz,
  disabled_by_member_id bigint
    references public.members(id) on delete restrict,
  disabled_reason text,
  version bigint not null default 1,
  constraint members_role_check
    check (role in ('super_admin', 'department_manager', 'sales')),
  constraint members_status_check
    check (status in ('active', 'restricted', 'disabled')),
  constraint members_disabled_state_check check (
    (
      status = 'disabled'
      and disabled_at is not null
      and disabled_by_member_id is not null
      and char_length(btrim(disabled_reason)) between 1 and 500
    )
    or
    (
      status <> 'disabled'
      and disabled_at is null
      and disabled_by_member_id is null
      and disabled_reason is null
    )
  ),
  constraint members_version_check
    check (version > 0)
);

create table public.member_profiles (
  member_id bigint primary key
    references public.members(id) on delete restrict,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint member_profiles_display_name_check check (
    char_length(btrim(display_name)) between 1 and 80
    and display_name !~ '[[:cntrl:]]'
  ),
  constraint member_profiles_version_check
    check (version > 0)
);

create table public.member_invitations (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null,
  display_name text not null,
  department_id bigint not null
    references public.departments(id) on delete restrict,
  target_role text not null,
  status text not null default 'pending_delivery',
  invited_auth_user_id uuid
    references auth.users(id) on delete set null,
  created_by_member_id bigint not null
    references public.members(id) on delete restrict,
  accepted_by_member_id bigint
    references public.members(id) on delete restrict,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  sent_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  delivery_attempts integer not null default 0,
  last_delivery_error_code text,
  version bigint not null default 1,
  constraint member_invitations_email_normalized_check check (
    email_normalized = lower(btrim(email_normalized))
    and char_length(email_normalized) between 3 and 320
    and position('@' in email_normalized) > 1
  ),
  constraint member_invitations_display_name_check check (
    char_length(btrim(display_name)) between 1 and 80
    and display_name !~ '[[:cntrl:]]'
  ),
  constraint member_invitations_target_role_check
    check (target_role in ('department_manager', 'sales')),
  constraint member_invitations_status_check check (
    status in (
      'pending_delivery',
      'sent',
      'accepted',
      'delivery_failed',
      'revoked',
      'expired'
    )
  ),
  constraint member_invitations_expiry_check
    check (expires_at > created_at),
  constraint member_invitations_delivery_attempts_check
    check (delivery_attempts >= 0),
  constraint member_invitations_accepted_state_check check (
    (status = 'accepted' and accepted_by_member_id is not null and accepted_at is not null)
    or
    (status <> 'accepted' and accepted_by_member_id is null and accepted_at is null)
  ),
  constraint member_invitations_revoked_state_check check (
    (status = 'revoked' and revoked_at is not null and char_length(btrim(revoked_reason)) between 1 and 500)
    or
    (status <> 'revoked' and revoked_at is null and revoked_reason is null)
  ),
  constraint member_invitations_version_check
    check (version > 0),
  unique (created_by_member_id, idempotency_key)
);

create index members_primary_department_status_role_idx
  on public.members (primary_department_id, status, role, id);

create index members_active_department_idx
  on public.members (primary_department_id, id)
  where status = 'active';

create index members_disabled_by_member_id_idx
  on public.members (disabled_by_member_id)
  where disabled_by_member_id is not null;

create index member_invitations_department_status_created_idx
  on public.member_invitations (department_id, status, created_at desc);

create index member_invitations_created_by_member_id_idx
  on public.member_invitations (created_by_member_id);

create index member_invitations_accepted_by_member_id_idx
  on public.member_invitations (accepted_by_member_id)
  where accepted_by_member_id is not null;

create index member_invitations_invited_auth_user_id_idx
  on public.member_invitations (invited_auth_user_id)
  where invited_auth_user_id is not null;

create unique index member_invitations_one_open_email_idx
  on public.member_invitations (email_normalized)
  where status in ('pending_delivery', 'sent');

create unique index member_invitations_one_sent_auth_user_idx
  on public.member_invitations (invited_auth_user_id)
  where invited_auth_user_id is not null and status = 'sent';

create or replace function app_private.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

create trigger departments_touch_updated_at
before update on public.departments
for each row execute function app_private.touch_updated_at();

create trigger members_touch_updated_at
before update on public.members
for each row execute function app_private.touch_updated_at();

create trigger member_profiles_touch_updated_at
before update on public.member_profiles
for each row execute function app_private.touch_updated_at();

create trigger member_invitations_touch_updated_at
before update on public.member_invitations
for each row execute function app_private.touch_updated_at();

create or replace function app_private.protect_member_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '23503', message = 'MEMBER_DELETE_FORBIDDEN';
  end if;

  if new.auth_user_id is distinct from old.auth_user_id then
    raise exception using errcode = '23514', message = 'MEMBER_AUTH_IDENTITY_IMMUTABLE';
  end if;

  if new.primary_department_id is distinct from old.primary_department_id then
    raise exception using errcode = '23514', message = 'MEMBER_PRIMARY_DEPARTMENT_IMMUTABLE';
  end if;

  return new;
end;
$$;

create trigger members_protect_identity
before update or delete on public.members
for each row execute function app_private.protect_member_identity();

alter table public.departments enable row level security;
alter table public.departments force row level security;
alter table public.members enable row level security;
alter table public.members force row level security;
alter table public.member_profiles enable row level security;
alter table public.member_profiles force row level security;
alter table public.member_invitations enable row level security;
alter table public.member_invitations force row level security;

create or replace function app_private.rpc_success(p_data jsonb)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'data', coalesce(p_data, '{}'::jsonb),
    'request_id', gen_random_uuid()
  );
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
  select jsonb_build_object(
    'ok', false,
    'error', jsonb_build_object(
      'code', p_code,
      'message_key', 'crm.error.' || lower(p_code),
      'safe_params', coalesce(p_safe_params, '{}'::jsonb),
      'request_id', gen_random_uuid()
    )
  );
$$;

create or replace function app_private.current_session_is_valid()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from auth.sessions as s
      where s.user_id = (select auth.uid())
        and s.id = case
          when coalesce(auth.jwt() ->> 'session_id', '')
            ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (auth.jwt() ->> 'session_id')::uuid
          else null
        end
    );
$$;

create or replace function app_private.current_member_id_any_status()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
  from public.members as m
  where m.auth_user_id = (select auth.uid())
    and (select app_private.current_session_is_valid())
  limit 1;
$$;

create or replace function app_private.current_member_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
  from public.members as m
  join public.departments as d
    on d.id = m.primary_department_id
   and d.status = 'active'
  where m.auth_user_id = (select auth.uid())
    and m.status = 'active'
    and (select app_private.current_session_is_valid())
  limit 1;
$$;

create or replace function app_private.can_view_department(p_department_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.members as actor
    where actor.id = (select app_private.current_member_id())
      and (
        actor.role = 'super_admin'
        or actor.primary_department_id = p_department_id
      )
  );
$$;

create or replace function app_private.can_view_member(p_member_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.members as actor
    join public.members as target on target.id = p_member_id
    where actor.id = (select app_private.current_member_id())
      and (
        actor.id = target.id
        or actor.role = 'super_admin'
        or (
          actor.role = 'department_manager'
          and actor.primary_department_id = target.primary_department_id
        )
      )
  );
$$;

create or replace function app_private.can_view_invitation(p_department_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.members as actor
    where actor.id = (select app_private.current_member_id())
      and (
        actor.role = 'super_admin'
        or (
          actor.role = 'department_manager'
          and actor.primary_department_id = p_department_id
        )
      )
  );
$$;

create or replace function app_private.member_has_open_responsibilities(p_member_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select false
  where p_member_id is not null;
$$;

comment on function app_private.member_has_open_responsibilities(bigint) is
  'WBS 1.5 extension contract: replace in the same migration that introduces the first opportunity or customer ownership table before member disabling is enabled.';

create policy departments_select_authorized
on public.departments
for select
to authenticated
using ((select app_private.can_view_department(id)));

create policy members_select_authorized
on public.members
for select
to authenticated
using ((select app_private.can_view_member(id)));

create policy member_profiles_select_authorized
on public.member_profiles
for select
to authenticated
using ((select app_private.can_view_member(member_id)));

create policy member_invitations_select_authorized
on public.member_invitations
for select
to authenticated
using ((select app_private.can_view_invitation(department_id)));

create or replace function app_private.prepare_member_invitation(
  p_email text,
  p_display_name text,
  p_department_id bigint,
  p_target_role text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor public.members%rowtype;
  v_department public.departments%rowtype;
  v_existing public.member_invitations%rowtype;
  v_invitation_id uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_display_name text := btrim(coalesce(p_display_name, ''));
begin
  select actor.*
  into v_actor
  from public.members as actor
  where actor.id = (select app_private.current_member_id());

  if not found then
    return app_private.rpc_error('MEMBERSHIP_INACTIVE');
  end if;

  if p_idempotency_key is null then
    return app_private.rpc_error('IDEMPOTENCY_KEY_REQUIRED');
  end if;

  if char_length(v_email) not between 3 and 320 or position('@' in v_email) <= 1 then
    return app_private.rpc_error('INVITATION_EMAIL_INVALID');
  end if;

  if char_length(v_display_name) not between 1 and 80 or v_display_name ~ '[[:cntrl:]]' then
    return app_private.rpc_error('DISPLAY_NAME_INVALID');
  end if;

  if p_target_role not in ('department_manager', 'sales') then
    return app_private.rpc_error('ROLE_NOT_ASSIGNABLE');
  end if;

  select d.*
  into v_department
  from public.departments as d
  where d.id = p_department_id;

  if not found or v_department.status <> 'active' then
    return app_private.rpc_error('DEPARTMENT_INACTIVE');
  end if;

  if not (
    v_actor.role = 'super_admin'
    or (
      v_actor.role = 'department_manager'
      and v_actor.primary_department_id = p_department_id
      and p_target_role = 'sales'
    )
  ) then
    return app_private.rpc_error('FORBIDDEN');
  end if;

  select invitation.*
  into v_existing
  from public.member_invitations as invitation
  where invitation.created_by_member_id = v_actor.id
    and invitation.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.email_normalized = v_email
      and v_existing.display_name = v_display_name
      and v_existing.department_id = p_department_id
      and v_existing.target_role = p_target_role
    then
      return app_private.rpc_success(jsonb_build_object(
        'invitation_id', v_existing.id,
        'status', v_existing.status
      ));
    end if;

    return app_private.rpc_error('IDEMPOTENCY_CONFLICT');
  end if;

  update public.member_invitations
  set status = 'expired',
      last_delivery_error_code = null
  where email_normalized = v_email
    and status in ('pending_delivery', 'sent')
    and expires_at <= now();

  insert into public.member_invitations (
    email_normalized,
    display_name,
    department_id,
    target_role,
    status,
    created_by_member_id,
    idempotency_key,
    expires_at
  ) values (
    v_email,
    v_display_name,
    p_department_id,
    p_target_role,
    'pending_delivery',
    v_actor.id,
    p_idempotency_key,
    now() + interval '7 days'
  )
  returning id into v_invitation_id;

  return app_private.rpc_success(jsonb_build_object(
    'invitation_id', v_invitation_id,
    'status', 'pending_delivery'
  ));
exception
  when unique_violation then
    return app_private.rpc_error('INVITATION_ALREADY_PENDING');
  when others then
    return app_private.rpc_error('INTERNAL_ERROR');
end;
$$;

create or replace function app_private.complete_member_invitation_delivery(
  p_invitation_id uuid,
  p_invited_auth_user_id uuid,
  p_delivered boolean,
  p_error_code text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_invitation public.member_invitations%rowtype;
  v_auth_email text;
begin
  select invitation.*
  into v_invitation
  from public.member_invitations as invitation
  where invitation.id = p_invitation_id
  for update;

  if not found then
    return app_private.rpc_error('INVITATION_NOT_FOUND');
  end if;

  if v_invitation.status = 'accepted' then
    return app_private.rpc_success(jsonb_build_object(
      'invitation_id', v_invitation.id,
      'status', v_invitation.status
    ));
  end if;

  if v_invitation.status = 'sent'
    and p_delivered
    and v_invitation.invited_auth_user_id = p_invited_auth_user_id
  then
    return app_private.rpc_success(jsonb_build_object(
      'invitation_id', v_invitation.id,
      'status', v_invitation.status
    ));
  end if;

  if v_invitation.status not in ('pending_delivery', 'delivery_failed') then
    return app_private.rpc_error('INVITATION_NOT_ACTIVE');
  end if;

  if v_invitation.expires_at <= now() then
    update public.member_invitations
    set status = 'expired'
    where id = v_invitation.id;
    return app_private.rpc_error('INVITATION_EXPIRED');
  end if;

  if not p_delivered then
    update public.member_invitations
    set status = 'delivery_failed',
        delivery_attempts = delivery_attempts + 1,
        last_delivery_error_code = left(coalesce(nullif(btrim(p_error_code), ''), 'DELIVERY_FAILED'), 100)
    where id = v_invitation.id;

    return app_private.rpc_success(jsonb_build_object(
      'invitation_id', v_invitation.id,
      'status', 'delivery_failed'
    ));
  end if;

  if p_invited_auth_user_id is null then
    return app_private.rpc_error('INVITED_AUTH_USER_REQUIRED');
  end if;

  select lower(btrim(u.email))
  into v_auth_email
  from auth.users as u
  where u.id = p_invited_auth_user_id;

  if not found or v_auth_email is distinct from v_invitation.email_normalized then
    return app_private.rpc_error('INVITATION_EMAIL_MISMATCH');
  end if;

  if exists (
    select 1
    from public.members as m
    where m.auth_user_id = p_invited_auth_user_id
  ) then
    return app_private.rpc_error('MEMBERSHIP_ALREADY_EXISTS');
  end if;

  update public.member_invitations
  set status = 'sent',
      invited_auth_user_id = p_invited_auth_user_id,
      sent_at = now(),
      delivery_attempts = delivery_attempts + 1,
      last_delivery_error_code = null
  where id = v_invitation.id;

  return app_private.rpc_success(jsonb_build_object(
    'invitation_id', v_invitation.id,
    'status', 'sent'
  ));
exception
  when unique_violation then
    return app_private.rpc_error('INVITATION_ALREADY_PENDING');
  when others then
    return app_private.rpc_error('INTERNAL_ERROR');
end;
$$;

create or replace function app_private.get_my_auth_context()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_member public.members%rowtype;
  v_department public.departments%rowtype;
  v_display_name text;
  v_block_reason text;
  v_can_access_crm boolean := false;
  v_can_invite_member boolean := false;
  v_can_invite_sales boolean := false;
  v_can_invite_department_manager boolean := false;
begin
  if v_user_id is null then
    return app_private.rpc_error('AUTH_REQUIRED');
  end if;

  if not (select app_private.current_session_is_valid()) then
    return app_private.rpc_error('SESSION_INVALID');
  end if;

  select m.*
  into v_member
  from public.members as m
  where m.auth_user_id = v_user_id;

  if not found then
    return app_private.rpc_success(jsonb_build_object(
      'schema_version', 1,
      'server_now', now(),
      'auth_user_id', v_user_id,
      'member', null,
      'primary_department', null,
      'capabilities', jsonb_build_object(
        'can_access_crm', jsonb_build_object('allowed', false, 'reason_code', 'INVITATION_REQUIRED'),
        'can_invite_member', jsonb_build_object('allowed', false, 'reason_code', 'INVITATION_REQUIRED'),
        'can_invite_sales', jsonb_build_object('allowed', false, 'reason_code', 'INVITATION_REQUIRED'),
        'can_invite_department_manager', jsonb_build_object('allowed', false, 'reason_code', 'INVITATION_REQUIRED')
      )
    ));
  end if;

  select p.display_name
  into v_display_name
  from public.member_profiles as p
  where p.member_id = v_member.id;

  select d.*
  into v_department
  from public.departments as d
  where d.id = v_member.primary_department_id;

  if v_member.status <> 'active' then
    v_block_reason := case
      when v_member.status = 'restricted' then 'MEMBERSHIP_RESTRICTED'
      else 'MEMBERSHIP_DISABLED'
    end;
  elsif not found or v_department.status <> 'active' then
    v_block_reason := 'DEPARTMENT_INACTIVE';
  else
    v_can_access_crm := true;
    v_can_invite_sales := v_member.role in ('department_manager', 'super_admin');
    v_can_invite_department_manager := v_member.role = 'super_admin';
    v_can_invite_member := v_can_invite_sales or v_can_invite_department_manager;
  end if;

  return app_private.rpc_success(jsonb_build_object(
    'schema_version', 1,
    'server_now', now(),
    'auth_user_id', v_user_id,
    'member', jsonb_build_object(
      'id', v_member.id::text,
      'display_name', v_display_name,
      'status', v_member.status,
      'role', v_member.role
    ),
    'primary_department', jsonb_build_object(
      'id', v_department.id::text,
      'name', v_department.name,
      'status', v_department.status
    ),
    'capabilities', jsonb_build_object(
      'can_access_crm', jsonb_build_object(
        'allowed', v_can_access_crm,
        'reason_code', case when v_can_access_crm then null else v_block_reason end
      ),
      'can_invite_member', jsonb_build_object(
        'allowed', v_can_invite_member,
        'reason_code', case when v_can_invite_member then null when v_block_reason is not null then v_block_reason else 'FORBIDDEN' end
      ),
      'can_invite_sales', jsonb_build_object(
        'allowed', v_can_invite_sales,
        'reason_code', case when v_can_invite_sales then null when v_block_reason is not null then v_block_reason else 'FORBIDDEN' end
      ),
      'can_invite_department_manager', jsonb_build_object(
        'allowed', v_can_invite_department_manager,
        'reason_code', case when v_can_invite_department_manager then null when v_block_reason is not null then v_block_reason else 'FORBIDDEN' end
      )
    )
  ));
end;
$$;

create or replace function app_private.accept_my_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_user_email text;
  v_email_confirmed_at timestamptz;
  v_invitation public.member_invitations%rowtype;
  v_existing_member_id bigint;
  v_member_id bigint;
begin
  if v_user_id is null then
    return app_private.rpc_error('AUTH_REQUIRED');
  end if;

  if not (select app_private.current_session_is_valid()) then
    return app_private.rpc_error('SESSION_INVALID');
  end if;

  select lower(btrim(u.email)), u.email_confirmed_at
  into v_user_email, v_email_confirmed_at
  from auth.users as u
  where u.id = v_user_id;

  if not found then
    return app_private.rpc_error('AUTH_REQUIRED');
  end if;

  if v_email_confirmed_at is null then
    return app_private.rpc_error('EMAIL_UNVERIFIED');
  end if;

  select invitation.*
  into v_invitation
  from public.member_invitations as invitation
  where invitation.id = p_invitation_id
  for update;

  if not found then
    return app_private.rpc_error('INVITATION_NOT_FOUND');
  end if;

  if v_invitation.status = 'accepted' then
    select m.id
    into v_existing_member_id
    from public.members as m
    where m.id = v_invitation.accepted_by_member_id
      and m.auth_user_id = v_user_id;

    if found then
      return app_private.rpc_success(jsonb_build_object(
        'invitation_id', v_invitation.id,
        'member_id', v_existing_member_id,
        'status', 'active'
      ));
    end if;

    return app_private.rpc_error('INVITATION_ALREADY_USED');
  end if;

  if v_invitation.status <> 'sent' then
    return app_private.rpc_error('INVITATION_NOT_ACTIVE');
  end if;

  if v_invitation.expires_at <= now() then
    return app_private.rpc_error('INVITATION_EXPIRED');
  end if;

  if v_invitation.invited_auth_user_id is distinct from v_user_id then
    return app_private.rpc_error('INVITATION_USER_MISMATCH');
  end if;

  if v_invitation.email_normalized is distinct from v_user_email then
    return app_private.rpc_error('INVITATION_EMAIL_MISMATCH');
  end if;

  if not exists (
    select 1
    from public.departments as d
    where d.id = v_invitation.department_id
      and d.status = 'active'
  ) then
    return app_private.rpc_error('DEPARTMENT_INACTIVE');
  end if;

  select m.id
  into v_existing_member_id
  from public.members as m
  where m.auth_user_id = v_user_id;

  if found then
    return app_private.rpc_error('MEMBERSHIP_ALREADY_EXISTS');
  end if;

  insert into public.members (
    auth_user_id,
    primary_department_id,
    role,
    status,
    accepted_at
  ) values (
    v_user_id,
    v_invitation.department_id,
    v_invitation.target_role,
    'active',
    now()
  )
  returning id into v_member_id;

  insert into public.member_profiles (member_id, display_name)
  values (v_member_id, v_invitation.display_name);

  update public.member_invitations
  set status = 'accepted',
      accepted_by_member_id = v_member_id,
      accepted_at = now()
  where id = v_invitation.id;

  return app_private.rpc_success(jsonb_build_object(
    'invitation_id', v_invitation.id,
    'member_id', v_member_id,
    'primary_department_id', v_invitation.department_id,
    'role', v_invitation.target_role,
    'status', 'active'
  ));
exception
  when unique_violation then
    return app_private.rpc_error('MEMBERSHIP_ALREADY_EXISTS');
  when others then
    return app_private.rpc_error('INTERNAL_ERROR');
end;
$$;

create or replace function public.prepare_member_invitation(
  p_email text,
  p_display_name text,
  p_department_id bigint,
  p_target_role text,
  p_idempotency_key uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select app_private.prepare_member_invitation(
    p_email,
    p_display_name,
    p_department_id,
    p_target_role,
    p_idempotency_key
  );
$$;

create or replace function public.complete_member_invitation_delivery(
  p_invitation_id uuid,
  p_invited_auth_user_id uuid,
  p_delivered boolean,
  p_error_code text default null
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select app_private.complete_member_invitation_delivery(
    p_invitation_id,
    p_invited_auth_user_id,
    p_delivered,
    p_error_code
  );
$$;

create or replace function public.get_my_auth_context()
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select app_private.get_my_auth_context();
$$;

create or replace function public.accept_my_invitation(p_invitation_id uuid)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select app_private.accept_my_invitation(p_invitation_id);
$$;

revoke all on table public.departments from public, anon, authenticated;
revoke all on table public.members from public, anon, authenticated;
revoke all on table public.member_profiles from public, anon, authenticated;
revoke all on table public.member_invitations from public, anon, authenticated;

grant select on table public.departments to authenticated;
grant select on table public.members to authenticated;
grant select on table public.member_profiles to authenticated;
grant select on table public.member_invitations to authenticated;

grant select, insert, update on table public.departments to service_role;
grant select, insert, update on table public.members to service_role;
grant select, insert, update on table public.member_profiles to service_role;
grant select, update on table public.member_invitations to service_role;
grant usage, select on sequence public.departments_id_seq to service_role;
grant usage, select on sequence public.members_id_seq to service_role;

revoke execute on all functions in schema app_private from public, anon, authenticated;
revoke execute on function public.prepare_member_invitation(text, text, bigint, text, uuid) from public, anon;
revoke execute on function public.complete_member_invitation_delivery(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke execute on function public.get_my_auth_context() from public, anon;
revoke execute on function public.accept_my_invitation(uuid) from public, anon;

grant usage on schema app_private to authenticated, service_role;

grant execute on function app_private.current_session_is_valid() to authenticated;
grant execute on function app_private.current_member_id_any_status() to authenticated;
grant execute on function app_private.current_member_id() to authenticated;
grant execute on function app_private.can_view_department(bigint) to authenticated;
grant execute on function app_private.can_view_member(bigint) to authenticated;
grant execute on function app_private.can_view_invitation(bigint) to authenticated;
grant execute on function app_private.prepare_member_invitation(text, text, bigint, text, uuid) to authenticated;
grant execute on function app_private.get_my_auth_context() to authenticated;
grant execute on function app_private.accept_my_invitation(uuid) to authenticated;
grant execute on function app_private.complete_member_invitation_delivery(uuid, uuid, boolean, text) to service_role;

grant execute on function public.prepare_member_invitation(text, text, bigint, text, uuid) to authenticated;
grant execute on function public.get_my_auth_context() to authenticated;
grant execute on function public.accept_my_invitation(uuid) to authenticated;
grant execute on function public.complete_member_invitation_delivery(uuid, uuid, boolean, text) to service_role;
