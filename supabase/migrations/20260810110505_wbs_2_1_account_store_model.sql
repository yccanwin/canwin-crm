create table public.accounts (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  name text not null,
  name_normalized text generated always as (
    lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g'))
  ) stored,
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
  constraint accounts_public_id_unique unique (public_id),
  constraint accounts_name_check check (
    char_length(btrim(name)) between 1 and 200
    and name !~ '[[:cntrl:]]'
  ),
  constraint accounts_status_check check (
    status in ('active', 'suspected_closed', 'disabled')
  ),
  constraint accounts_status_state_check check (
    (status = 'active' and status_reason is null)
    or
    (
      status in ('suspected_closed', 'disabled')
      and char_length(btrim(status_reason)) between 1 and 500
      and status_reason !~ '[[:cntrl:]]'
    )
  ),
  constraint accounts_version_check check (version > 0)
);

create table public.stores (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  account_id bigint not null
    references public.accounts(id) on delete restrict,
  name text not null,
  name_normalized text generated always as (
    lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g'))
  ) stored,
  address_text text,
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
  constraint stores_public_id_unique unique (public_id),
  constraint stores_name_check check (
    char_length(btrim(name)) between 1 and 200
    and name !~ '[[:cntrl:]]'
  ),
  constraint stores_address_check check (
    address_text is null
    or (
      char_length(btrim(address_text)) between 1 and 500
      and address_text !~ '[[:cntrl:]]'
    )
  ),
  constraint stores_status_check check (
    status in ('active', 'inactive')
  ),
  constraint stores_status_state_check check (
    (status = 'active' and status_reason is null)
    or
    (
      status = 'inactive'
      and char_length(btrim(status_reason)) between 1 and 500
      and status_reason !~ '[[:cntrl:]]'
    )
  ),
  constraint stores_version_check check (version > 0)
);

create index accounts_name_normalized_idx
  on public.accounts (name_normalized, id);

create index accounts_status_updated_idx
  on public.accounts (status, updated_at desc, id);

create index accounts_created_by_member_id_idx
  on public.accounts (created_by_member_id);

create index accounts_updated_by_member_id_idx
  on public.accounts (updated_by_member_id);

create index stores_account_status_idx
  on public.stores (account_id, status, id);

create index stores_name_normalized_idx
  on public.stores (name_normalized, id);

create index stores_status_updated_idx
  on public.stores (status, updated_at desc, id);

create index stores_created_by_member_id_idx
  on public.stores (created_by_member_id);

create index stores_updated_by_member_id_idx
  on public.stores (updated_by_member_id);

create or replace function app_private.protect_account_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '23503', message = 'ACCOUNT_DELETE_FORBIDDEN';
  end if;

  if new.id is distinct from old.id
    or new.public_id is distinct from old.public_id
    or new.created_by_member_id is distinct from old.created_by_member_id
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode = '23514', message = 'ACCOUNT_IDENTITY_IMMUTABLE';
  end if;

  return new;
end;
$$;

create or replace function app_private.protect_store_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '23503', message = 'STORE_DELETE_FORBIDDEN';
  end if;

  if new.id is distinct from old.id
    or new.public_id is distinct from old.public_id
    or new.account_id is distinct from old.account_id
    or new.created_by_member_id is distinct from old.created_by_member_id
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode = '23514', message = 'STORE_IDENTITY_IMMUTABLE';
  end if;

  return new;
end;
$$;

create trigger accounts_protect_identity
before update or delete on public.accounts
for each row execute function app_private.protect_account_identity();

create trigger accounts_touch_updated_at
before update on public.accounts
for each row execute function app_private.touch_updated_at();

create trigger stores_protect_identity
before update or delete on public.stores
for each row execute function app_private.protect_store_identity();

create trigger stores_touch_updated_at
before update on public.stores
for each row execute function app_private.touch_updated_at();

alter table public.accounts enable row level security;
alter table public.accounts force row level security;
alter table public.stores enable row level security;
alter table public.stores force row level security;

create policy accounts_shared_archive_select
on public.accounts
for select
to authenticated
using ((select app_private.current_member_id()) is not null);

create policy stores_shared_archive_select
on public.stores
for select
to authenticated
using ((select app_private.current_member_id()) is not null);

revoke all on table public.accounts from public, anon, authenticated, service_role;
revoke all on table public.stores from public, anon, authenticated, service_role;
revoke all on sequence public.accounts_id_seq from public, anon, authenticated, service_role;
revoke all on sequence public.stores_id_seq from public, anon, authenticated, service_role;

grant select on table public.accounts to authenticated, service_role;
grant select on table public.stores to authenticated, service_role;

revoke execute on function app_private.protect_account_identity() from public, anon, authenticated, service_role;
revoke execute on function app_private.protect_store_identity() from public, anon, authenticated, service_role;

comment on table public.accounts is
  'WBS 2.1 global shared customer/account archive. Department ownership belongs to later relationship tables, never this row.';
comment on table public.stores is
  'WBS 2.1 global shared store archive. One store belongs to one account and may later have independent relationships with many departments.';
comment on column public.accounts.public_id is 'Stable non-sequential identifier for future external contracts.';
comment on column public.stores.public_id is 'Stable non-sequential identifier for future external contracts.';
