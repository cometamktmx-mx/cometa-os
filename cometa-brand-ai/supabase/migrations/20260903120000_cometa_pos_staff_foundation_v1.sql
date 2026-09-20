begin;

create table public.pos_staff (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null,
  brand_slug text not null references public.brands(slug) on update cascade on delete restrict,
  location_id uuid null references public.pos_locations(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  role text not null check (role in ('ADMIN','MANAGER','CASHIER','WAITER','KITCHEN')),
  pin_hash text not null,
  active boolean not null default true,
  failed_pin_attempts integer not null default 0 check (failed_pin_attempts >= 0),
  locked_until timestamptz null,
  pin_changed_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, brand_slug)
);

create index pos_staff_brand_active_idx on public.pos_staff(brand_slug, active, name);
create index pos_staff_location_active_idx on public.pos_staff(location_id, active) where location_id is not null;

create table public.pos_staff_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  staff_id uuid not null references public.pos_staff(id) on delete cascade,
  brand_id text not null,
  brand_slug text not null references public.brands(slug) on update cascade on delete restrict,
  location_id uuid null references public.pos_locations(id) on delete restrict,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz null
);

create index pos_staff_sessions_lookup_idx on public.pos_staff_sessions(token_hash, host_user_id, brand_slug) where revoked_at is null;
create index pos_staff_sessions_staff_idx on public.pos_staff_sessions(staff_id, expires_at desc);

create table public.pos_staff_authorizations (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  brand_id text not null,
  brand_slug text not null references public.brands(slug) on update cascade on delete restrict,
  location_id uuid null references public.pos_locations(id) on delete restrict,
  requested_by_staff_id uuid not null references public.pos_staff(id) on delete restrict,
  authorized_by_staff_id uuid not null references public.pos_staff(id) on delete restrict,
  host_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('VOID_ITEM','VOID_ORDER','APPLY_DISCOUNT','REOPEN_ORDER','CASH_ADJUSTMENT')),
  entity_type text null,
  entity_id uuid null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  constraint pos_staff_authorization_distinct_staff check (requested_by_staff_id <> authorized_by_staff_id)
);

create index pos_staff_authorizations_token_idx on public.pos_staff_authorizations(token_hash, expires_at) where consumed_at is null;

create table public.pos_staff_audit_events (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null,
  brand_slug text not null references public.brands(slug) on update cascade on delete restrict,
  location_id uuid null references public.pos_locations(id) on delete restrict,
  actor_staff_id uuid null references public.pos_staff(id) on delete set null,
  authorized_by_staff_id uuid null references public.pos_staff(id) on delete set null,
  host_user_id uuid null references auth.users(id) on delete set null,
  action text not null check (action in (
    'STAFF_LOGIN','STAFF_LOGOUT','STAFF_LOCK','STAFF_SWITCH','STAFF_CREATE','STAFF_UPDATE','STAFF_PIN_RESET',
    'SALE_CREATE','SALE_CHARGE','CASH_SESSION_OPEN','CASH_SESSION_CLOSE','SUPERVISOR_AUTHORIZE',
    'TABLE_OPEN','ITEM_ADD','ITEM_VOID','ORDER_SEND','ORDER_REOPEN','DISCOUNT_APPLY'
  )),
  entity_type text null,
  entity_id uuid null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index pos_staff_audit_brand_created_idx on public.pos_staff_audit_events(brand_slug, created_at desc);
create index pos_staff_audit_actor_created_idx on public.pos_staff_audit_events(actor_staff_id, created_at desc) where actor_staff_id is not null;

alter table public.pos_sales add column served_by_staff_id uuid null references public.pos_staff(id) on delete set null;
alter table public.pos_sales add column cashier_staff_id uuid null references public.pos_staff(id) on delete set null;
create index pos_sales_served_by_staff_idx on public.pos_sales(served_by_staff_id, sold_at desc) where served_by_staff_id is not null;
create index pos_sales_cashier_staff_idx on public.pos_sales(cashier_staff_id, sold_at desc) where cashier_staff_id is not null;

create or replace function public.pos_staff_set_updated_at_v1() returns trigger
language plpgsql set search_path = public as $$ begin new.updated_at = now(); return new; end $$;
create trigger pos_staff_set_updated_at before update on public.pos_staff for each row execute function public.pos_staff_set_updated_at_v1();

alter table public.pos_staff enable row level security;
alter table public.pos_staff_sessions enable row level security;
alter table public.pos_staff_authorizations enable row level security;
alter table public.pos_staff_audit_events enable row level security;
revoke all on public.pos_staff, public.pos_staff_sessions, public.pos_staff_authorizations, public.pos_staff_audit_events from anon, authenticated;
grant all on public.pos_staff, public.pos_staff_sessions, public.pos_staff_authorizations, public.pos_staff_audit_events to service_role;

create or replace function public.pos_complete_sale_with_staff_v1(
  p_brand_slug text, p_location_id uuid, p_register_id uuid, p_cash_session_id uuid,
  p_customer_id uuid, p_items jsonb, p_payments jsonb, p_notes text, p_user_id uuid,
  p_reward_id uuid, p_idempotency_key uuid, p_reward_unlock_id uuid default null,
  p_served_by_staff_id uuid default null, p_cashier_staff_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb; v_sale_id uuid; v_cashier public.pos_staff%rowtype; v_server public.pos_staff%rowtype;
begin
  if p_cashier_staff_id is not null then
    select * into v_cashier from public.pos_staff where id=p_cashier_staff_id and brand_slug=p_brand_slug and active=true;
    if not found or v_cashier.role not in ('CASHIER','MANAGER','ADMIN') then raise exception 'POS_STAFF_CASHIER_INVALID'; end if;
    if v_cashier.location_id is not null and v_cashier.location_id <> p_location_id then raise exception 'POS_STAFF_LOCATION_FORBIDDEN'; end if;
  end if;
  if p_served_by_staff_id is not null then
    select * into v_server from public.pos_staff where id=p_served_by_staff_id and brand_slug=p_brand_slug and active=true;
    if not found then raise exception 'POS_STAFF_SERVER_INVALID'; end if;
    if v_server.location_id is not null and v_server.location_id <> p_location_id then raise exception 'POS_STAFF_LOCATION_FORBIDDEN'; end if;
  end if;
  v_result := public.pos_complete_sale_v4(p_brand_slug,p_location_id,p_register_id,p_cash_session_id,p_customer_id,p_items,p_payments,p_notes,p_user_id,p_reward_id,p_idempotency_key,p_reward_unlock_id);
  v_sale_id := (v_result->>'id')::uuid;
  update public.pos_sales set
    served_by_staff_id=coalesce(served_by_staff_id,p_served_by_staff_id),
    cashier_staff_id=coalesce(cashier_staff_id,p_cashier_staff_id)
  where id=v_sale_id and brand_slug=p_brand_slug;
  if p_cashier_staff_id is not null then
    insert into public.pos_staff_audit_events(brand_id,brand_slug,location_id,actor_staff_id,host_user_id,action,entity_type,entity_id)
    select brand_id,brand_slug,p_location_id,p_cashier_staff_id,p_user_id,'SALE_CHARGE','sale',id from public.pos_sales where id=v_sale_id;
  end if;
  return v_result;
end $$;
revoke all on function public.pos_complete_sale_with_staff_v1(text,uuid,uuid,uuid,uuid,jsonb,jsonb,text,uuid,uuid,uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.pos_complete_sale_with_staff_v1(text,uuid,uuid,uuid,uuid,jsonb,jsonb,text,uuid,uuid,uuid,uuid,uuid,uuid) to service_role;

create or replace function public.pos_open_cash_session_with_staff_v1(p_brand_slug text, p_register_id uuid, p_opening_amount numeric, p_user_id uuid, p_staff_id uuid)
returns setof public.pos_cash_sessions language plpgsql security definer set search_path = public as $$
declare v_session public.pos_cash_sessions%rowtype; v_staff public.pos_staff%rowtype;
begin
  select * into v_staff from public.pos_staff where id=p_staff_id and brand_slug=p_brand_slug and active=true and role in ('CASHIER','MANAGER','ADMIN');
  if not found then raise exception 'POS_STAFF_CASHIER_INVALID'; end if;
  select * into v_session from public.pos_open_cash_session(p_brand_slug,p_register_id,p_opening_amount,p_user_id);
  if v_staff.location_id is not null and v_staff.location_id <> v_session.location_id then raise exception 'POS_STAFF_LOCATION_FORBIDDEN'; end if;
  insert into public.pos_staff_audit_events(brand_id,brand_slug,location_id,actor_staff_id,host_user_id,action,entity_type,entity_id)
  values(v_session.brand_id,v_session.brand_slug,v_session.location_id,p_staff_id,p_user_id,'CASH_SESSION_OPEN','cash_session',v_session.id);
  return next v_session;
end $$;

create or replace function public.pos_close_cash_session_with_staff_v1(p_brand_slug text, p_session_id uuid, p_counted_cash numeric, p_user_id uuid, p_notes text, p_staff_id uuid)
returns setof public.pos_cash_sessions language plpgsql security definer set search_path = public as $$
declare v_session public.pos_cash_sessions%rowtype; v_staff public.pos_staff%rowtype;
begin
  select * into v_staff from public.pos_staff where id=p_staff_id and brand_slug=p_brand_slug and active=true and role in ('CASHIER','MANAGER','ADMIN');
  if not found then raise exception 'POS_STAFF_CASHIER_INVALID'; end if;
  select * into v_session from public.pos_cash_sessions where id=p_session_id and brand_slug=p_brand_slug;
  if not found then raise exception 'POS_CASH_SESSION_NOT_FOUND'; end if;
  if v_staff.location_id is not null and v_staff.location_id <> v_session.location_id then raise exception 'POS_STAFF_LOCATION_FORBIDDEN'; end if;
  select * into v_session from public.pos_close_cash_session(p_brand_slug,p_session_id,p_counted_cash,p_user_id,p_notes);
  insert into public.pos_staff_audit_events(brand_id,brand_slug,location_id,actor_staff_id,host_user_id,action,entity_type,entity_id)
  values(v_session.brand_id,v_session.brand_slug,v_session.location_id,p_staff_id,p_user_id,'CASH_SESSION_CLOSE','cash_session',v_session.id);
  return next v_session;
end $$;

revoke all on function public.pos_open_cash_session_with_staff_v1(text,uuid,numeric,uuid,uuid) from public,anon,authenticated;
revoke all on function public.pos_close_cash_session_with_staff_v1(text,uuid,numeric,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.pos_open_cash_session_with_staff_v1(text,uuid,numeric,uuid,uuid) to service_role;
grant execute on function public.pos_close_cash_session_with_staff_v1(text,uuid,numeric,uuid,text,uuid) to service_role;

commit;
