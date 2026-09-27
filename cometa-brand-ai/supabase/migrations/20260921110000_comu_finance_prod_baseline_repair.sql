-- COMU Finance Production baseline repair.
-- Forward-only repair for history-marked M1-M6 whose schema effects are absent.
-- This migration intentionally aborts on partial or incompatible drift.
do $guard$
declare
  t text;
  c text;
begin
  foreach t in array ARRAY['comu_orders','comu_order_suborders','comu_seller_payment_accounts','comu_payment_allocations','comu_seller_ledger_entries','comu_payment_intents','comu_sellers'] loop
    if to_regclass('public.' || t) is null then
      raise exception 'COMU_FINANCE_REPAIR_BASE_TABLE_MISSING:%', t;
    end if;
  end loop;
  if to_regclass('public.comu_financial_settings') is not null
     or to_regclass('public.comu_seller_fund_holds') is not null
     or to_regclass('public.comu_financial_events') is not null
     or to_regclass('public.comu_seller_settlements') is not null
     or to_regclass('public.comu_seller_settlement_items') is not null
     or to_regclass('public.comu_connect_webhook_events') is not null then
    raise exception 'COMU_FINANCE_REPAIR_TARGET_ALREADY_PRESENT';
  end if;
  foreach c in array ARRAY[
    'platform_fee_bps','guarantee_days','account_type','transfers_enabled','requirements_due',
    'financial_suspended','account_request_key','account_request_started_at','delivered_at',
    'guarantee_expires_at','settlement_id'
  ] loop
    if exists (
      select 1 from information_schema.columns
       where table_schema='public' and column_name=c and table_name in
       ('comu_orders','comu_order_suborders','comu_seller_payment_accounts','comu_seller_ledger_entries')
    ) then
      raise exception 'COMU_FINANCE_REPAIR_COLUMN_CONFLICT:%', c;
    end if;
  end loop;
  if (select count(*) from pg_constraint where conname in (
    'comu_seller_payment_accounts_onboarding_status_check',
    'comu_payment_allocations_status_check',
    'comu_seller_ledger_entries_entry_type_check'
  ) and conrelid <> 0) <> 3 then
    raise exception 'COMU_FINANCE_REPAIR_BASE_CONSTRAINTS_MISSING';
  end if;
  if exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname = any(array[
    'comu_snapshot_financial_settings','comu_allocation_fee_snapshot','comu_stamp_delivery_guarantee',
    'comu_admin_deliver_suborder','comu_set_fund_hold','comu_release_eligible_seller_funds',
    'comu_create_daily_settlements','comu_claim_transfer','comu_finish_transfer','comu_fail_transfer',
    'comu_financial_append_only','comu_check_allocation_total','comu_allocation_immutable'
  ])) then
    raise exception 'COMU_FINANCE_REPAIR_FUNCTION_CONFLICT';
  end if;
  if exists (select 1 from pg_trigger where tgname = any(array[
    'comu_order_financial_snapshot','comu_allocation_fee_snapshot','comu_suborder_guarantee',
    'comu_ledger_append_only','comu_financial_events_append_only','comu_allocation_total',
    'comu_allocation_immutable'
  ])) then
    raise exception 'COMU_FINANCE_REPAIR_TRIGGER_CONFLICT';
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and policyname = any(array[
    'comu_financial_settings_admin','comu_holds_seller','comu_financial_events_admin',
    'comu_settlements_seller','comu_settlement_items_seller'
  ])) then
    raise exception 'COMU_FINANCE_REPAIR_POLICY_CONFLICT';
  end if;
end;
$guard$;
-- Day 4: configuration and immutable per-order financial snapshots.
create table public.comu_financial_settings (
  id boolean primary key default true check (id),
  currency text not null default 'MXN' check (currency = 'MXN'),
  platform_fee_bps integer not null default 0 check (platform_fee_bps between 0 and 10000),
  guarantee_days integer not null default 4 check (guarantee_days between 0 and 90),
  settlement_frequency text not null default 'DAILY' check (settlement_frequency = 'DAILY'),
  connect_account_type text not null default 'express' check (connect_account_type = 'express'),
  updated_at timestamptz not null default now()
);
insert into public.comu_financial_settings(id) values(true);

alter table public.comu_orders add column platform_fee_bps integer not null default 0 check (platform_fee_bps between 0 and 10000);
alter table public.comu_orders add column guarantee_days integer not null default 4 check (guarantee_days between 0 and 90);
create function public.comu_snapshot_financial_settings() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    select platform_fee_bps, guarantee_days into new.platform_fee_bps, new.guarantee_days from public.comu_financial_settings where id;
  elsif (new.platform_fee_bps,new.guarantee_days) is distinct from (old.platform_fee_bps,old.guarantee_days) then
    raise exception 'COMU_FINANCIAL_SNAPSHOT_IMMUTABLE';
  end if;
  return new;
end; $$;
create trigger comu_order_financial_snapshot before insert or update on public.comu_orders for each row execute function public.comu_snapshot_financial_settings();

alter table public.comu_seller_payment_accounts add column account_type text not null default 'express' check (account_type = 'express');
alter table public.comu_seller_payment_accounts add column transfers_enabled boolean not null default false;
alter table public.comu_seller_payment_accounts add column requirements_due jsonb not null default '[]';
alter table public.comu_seller_payment_accounts add column financial_suspended boolean not null default false;
alter table public.comu_seller_payment_accounts add column account_request_key uuid not null default gen_random_uuid();
alter table public.comu_seller_payment_accounts add column account_request_started_at timestamptz;
alter table public.comu_seller_payment_accounts drop constraint comu_seller_payment_accounts_onboarding_status_check;
alter table public.comu_seller_payment_accounts add constraint comu_seller_payment_accounts_onboarding_status_check check (onboarding_status in ('NOT_STARTED','PENDING','REVIEW','COMPLETE','RESTRICTED'));

create function public.comu_allocation_fee_snapshot() returns trigger
language plpgsql set search_path = public as $$
declare v_bps integer;
begin
  select platform_fee_bps into strict v_bps from public.comu_orders where id=new.order_id;
  -- Floor to integer cents; all calculations happen in PostgreSQL integer arithmetic.
  new.platform_fee_cents := (new.gross_amount_cents * v_bps) / 10000;
  new.seller_net_amount_cents := new.gross_amount_cents - new.platform_fee_cents;
  return new;
end; $$;
create trigger comu_allocation_fee_snapshot before insert on public.comu_payment_allocations for each row execute function public.comu_allocation_fee_snapshot();
alter table public.comu_payment_allocations add constraint comu_allocation_conservation check (gross_amount_cents = platform_fee_cents + seller_net_amount_cents);


alter table public.comu_order_suborders add column delivered_at timestamptz;
alter table public.comu_order_suborders add column guarantee_expires_at timestamptz;

create function public.comu_stamp_delivery_guarantee() returns trigger
language plpgsql set search_path = public as $$
declare v_days integer;
begin
  if old.delivered_at is not null and (new.delivered_at,new.guarantee_expires_at) is distinct from (old.delivered_at,old.guarantee_expires_at) then
    raise exception 'COMU_DELIVERY_SNAPSHOT_IMMUTABLE';
  end if;
  if new.status = 'DELIVERED' and old.delivered_at is null then
    select guarantee_days into strict v_days from public.comu_orders where id=new.order_id;
    new.delivered_at := now();
    new.guarantee_expires_at := new.delivered_at + make_interval(days => v_days);
  end if;
  return new;
end; $$;
create trigger comu_suborder_guarantee before update on public.comu_order_suborders for each row execute function public.comu_stamp_delivery_guarantee();

-- Only the service role may execute; the application requires a COMETA admin and test mode.
create function public.comu_admin_deliver_suborder(p_suborder_id uuid, p_actor_id uuid) returns public.comu_order_suborders
language plpgsql security definer set search_path = public as $$
declare v_sub public.comu_order_suborders%rowtype;
begin
  select * into strict v_sub from public.comu_order_suborders where id=p_suborder_id for update;
  if not exists(select 1 from public.comu_payment_intents where order_id=v_sub.order_id and status='SUCCEEDED') then raise exception 'COMU_PAYMENT_NOT_SUCCEEDED'; end if;
  if v_sub.status = 'DELIVERED' then return v_sub; end if;
  if v_sub.status <> 'PREPARING' then raise exception 'COMU_DELIVERY_NOT_ALLOWED'; end if;
  update public.comu_order_suborders set status='DELIVERED',updated_at=now() where id=p_suborder_id returning * into v_sub;
  insert into public.comu_order_events(order_id,suborder_id,event_type,actor_type,actor_id,payload)
  values(v_sub.order_id,v_sub.id,'DELIVERED','COMETA_ADMIN',p_actor_id,jsonb_build_object('guarantee_expires_at',v_sub.guarantee_expires_at));
  return v_sub;
end; $$;
revoke all on function public.comu_admin_deliver_suborder(uuid,uuid) from public,anon,authenticated;
grant execute on function public.comu_admin_deliver_suborder(uuid,uuid) to service_role;


create table public.comu_seller_fund_holds (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.comu_sellers(id),
  suborder_id uuid not null references public.comu_order_suborders(id),
  allocation_id uuid not null references public.comu_payment_allocations(id),
  reason text not null check (length(btrim(reason)) between 1 and 240),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','RELEASED')),
  created_at timestamptz not null default now(),
  released_at timestamptz,
  created_by uuid not null,
  released_by uuid
);
create unique index comu_one_active_fund_hold on public.comu_seller_fund_holds(allocation_id) where status='ACTIVE';
create table public.comu_financial_events (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.comu_sellers(id),
  allocation_id uuid references public.comu_payment_allocations(id),
  settlement_id uuid,
  event_type text not null,
  actor_id uuid,
  idempotency_key text not null unique,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create function public.comu_set_fund_hold(p_allocation_id uuid, p_release boolean, p_reason text, p_actor_id uuid) returns public.comu_seller_fund_holds
language plpgsql security definer set search_path=public as $$
declare a public.comu_payment_allocations%rowtype; h public.comu_seller_fund_holds%rowtype;
begin
  select * into strict a from public.comu_payment_allocations where id=p_allocation_id for update;
  select * into h from public.comu_seller_fund_holds where allocation_id=a.id and status='ACTIVE' for update;
  if p_release then
    if not found then return null; end if;
    update public.comu_seller_fund_holds set status='RELEASED',released_at=now(),released_by=p_actor_id where id=h.id returning * into h;
  else
    if found then return h; end if;
    if a.status not in ('HELD','AVAILABLE') then raise exception 'COMU_FUNDS_ALREADY_COMMITTED'; end if;
    insert into public.comu_seller_fund_holds(seller_id,suborder_id,allocation_id,reason,created_by)
    values(a.seller_id,a.suborder_id,a.id,p_reason,p_actor_id) returning * into h;
  end if;
  insert into public.comu_financial_events(seller_id,allocation_id,event_type,actor_id,idempotency_key,payload)
  values(a.seller_id,a.id,case when p_release then 'HOLD_RELEASED' else 'HOLD_CREATED' end,p_actor_id,h.id::text||':'||h.status,jsonb_build_object('hold_id',h.id));
  return h;
end; $$;
revoke all on function public.comu_set_fund_hold(uuid,boolean,text,uuid) from public,anon,authenticated;
grant execute on function public.comu_set_fund_hold(uuid,boolean,text,uuid) to service_role;


create table public.comu_seller_settlements (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.comu_sellers(id),
  settlement_day date not null,
  currency text not null check (currency='MXN'),
  amount_cents bigint not null check (amount_cents > 0),
  stripe_account_id text not null,
  stripe_transfer_id text unique,
  status text not null default 'PENDING' check (status in ('PENDING','PROCESSING','TRANSFERRED','FAILED','CANCELLED')),
  idempotency_key uuid not null default gen_random_uuid() unique,
  first_attempt_at timestamptz,
  attempt_count integer not null default 0,
  retryable boolean not null default true,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(seller_id,settlement_day,currency)
);
create table public.comu_seller_settlement_items (
  settlement_id uuid not null references public.comu_seller_settlements(id),
  allocation_id uuid not null unique references public.comu_payment_allocations(id),
  seller_id uuid not null references public.comu_sellers(id),
  amount_cents bigint not null check (amount_cents >= 0),
  primary key(settlement_id,allocation_id)
);
alter table public.comu_financial_events add foreign key(settlement_id) references public.comu_seller_settlements(id);
alter table public.comu_payment_allocations drop constraint comu_payment_allocations_status_check;
alter table public.comu_payment_allocations add constraint comu_payment_allocations_status_check check(status in ('HELD','AVAILABLE','PENDING_TRANSFER','TRANSFERRED','REVERSED','REFUNDED'));
alter table public.comu_seller_ledger_entries drop constraint comu_seller_ledger_entries_entry_type_check;
alter table public.comu_seller_ledger_entries add constraint comu_seller_ledger_entries_entry_type_check check(entry_type in ('SALE_HELD','SALE_AVAILABLE','SALE_REVERSED','REFUND','PAYOUT','TRANSFER'));
alter table public.comu_seller_ledger_entries add column settlement_id uuid references public.comu_seller_settlements(id);
create table public.comu_connect_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  status text not null default 'RECEIVED' check(status in ('RECEIVED','PROCESSED')),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);


create function public.comu_release_eligible_seller_funds(p_seller_id uuid) returns integer
language plpgsql security definer set search_path=public as $$
declare a public.comu_payment_allocations%rowtype; n integer:=0;
begin
  for a in select * from public.comu_payment_allocations where seller_id=p_seller_id and status='HELD' order by id for update loop
    if exists(select 1 from public.comu_payment_intents p join public.comu_order_suborders s on s.order_id=p.order_id
      where p.id=a.payment_id and p.status='SUCCEEDED' and s.id=a.suborder_id and s.status='DELIVERED' and s.guarantee_expires_at<=now())
      and not exists(select 1 from public.comu_seller_fund_holds where allocation_id=a.id and status='ACTIVE') then
      insert into public.comu_seller_ledger_entries(seller_id,payment_id,allocation_id,entry_type,amount_cents,currency)
        select a.seller_id,a.payment_id,a.id,'SALE_AVAILABLE',a.seller_net_amount_cents,currency from public.comu_payment_intents where id=a.payment_id
        on conflict(allocation_id,entry_type) do nothing;
      update public.comu_payment_allocations set status='AVAILABLE' where id=a.id;
      insert into public.comu_financial_events(seller_id,allocation_id,event_type,idempotency_key) values(a.seller_id,a.id,'SALE_AVAILABLE',a.id::text||':available') on conflict do nothing;
      n:=n+1;
    end if;
  end loop;
  return n;
end; $$;

create function public.comu_create_daily_settlements(p_seller_id uuid) returns public.comu_seller_settlements
language plpgsql security definer set search_path=public as $$
declare account public.comu_seller_payment_accounts%rowtype; s public.comu_seller_settlements%rowtype; ids uuid[]; total bigint; day date:=(now() at time zone 'America/Mexico_City')::date;
begin
  -- Account lock serializes daily creation for a seller; allocation locks serialize holds/releases.
  select * into strict account from public.comu_seller_payment_accounts where seller_id=p_seller_id for update;
  select * into s from public.comu_seller_settlements where seller_id=p_seller_id and settlement_day=day and currency='MXN';
  if found then return s; end if;
  if account.onboarding_status<>'COMPLETE' or not account.transfers_enabled or account.financial_suspended or account.stripe_account_id is null
    or not exists(select 1 from public.comu_sellers where id=p_seller_id and status='ACTIVE') then raise exception 'COMU_SELLER_NOT_SETTLEABLE'; end if;
  select array_agg(id),sum(seller_net_amount_cents) into ids,total from (
    select a.id,a.seller_net_amount_cents from public.comu_payment_allocations a
    join public.comu_payment_intents p on p.id=a.payment_id
    where a.seller_id=p_seller_id and a.status='AVAILABLE' and p.status='SUCCEEDED' and p.currency='MXN'
    and not exists(select 1 from public.comu_seller_fund_holds h where h.allocation_id=a.id and h.status='ACTIVE')
    order by a.id for update of a) eligible;
  if coalesce(total,0)<=0 then return null; end if;
  -- Recheck after acquiring locks in case a hold committed while we waited.
  if exists(select 1 from public.comu_seller_fund_holds where allocation_id=any(ids) and status='ACTIVE') then raise exception 'COMU_FUNDS_FROZEN'; end if;
  insert into public.comu_seller_settlements(seller_id,settlement_day,currency,amount_cents,stripe_account_id)
    values(p_seller_id,day,'MXN',total,account.stripe_account_id) returning * into s;
  insert into public.comu_seller_settlement_items(settlement_id,allocation_id,seller_id,amount_cents)
    select s.id,id,seller_id,seller_net_amount_cents from public.comu_payment_allocations where id=any(ids);
  update public.comu_payment_allocations set status='PENDING_TRANSFER' where id=any(ids);
  insert into public.comu_financial_events(seller_id,settlement_id,event_type,idempotency_key) values(p_seller_id,s.id,'SETTLEMENT_CREATED',s.id::text||':created');
  return s;
end; $$;

create function public.comu_claim_transfer(p_settlement_id uuid) returns public.comu_seller_settlements
language plpgsql security definer set search_path=public as $$
declare s public.comu_seller_settlements%rowtype;
begin
  select * into strict s from public.comu_seller_settlements where id=p_settlement_id for update;
  if s.status='TRANSFERRED' then return s; end if;
  if s.status='CANCELLED' or not s.retryable then raise exception 'COMU_SETTLEMENT_NOT_RETRYABLE'; end if;
  -- Stripe retains idempotency keys at least 24 hours. Never blindly retry past that window.
  if s.first_attempt_at < now()-interval '23 hours' then raise exception 'COMU_TRANSFER_RECONCILIATION_REQUIRED'; end if;
  if s.status='PROCESSING' and s.updated_at>now()-interval '2 minutes' then raise exception 'COMU_TRANSFER_IN_PROGRESS'; end if;
  if not exists(select 1 from public.comu_seller_payment_accounts a join public.comu_sellers seller on seller.id=a.seller_id
    where a.seller_id=s.seller_id and a.stripe_account_id=s.stripe_account_id and a.onboarding_status='COMPLETE' and a.transfers_enabled and not a.financial_suspended and seller.status='ACTIVE') then raise exception 'COMU_SELLER_NOT_SETTLEABLE'; end if;
  if exists(select 1 from public.comu_seller_settlement_items i join public.comu_payment_allocations a on a.id=i.allocation_id
    join public.comu_payment_intents p on p.id=a.payment_id where i.settlement_id=s.id and (a.status<>'PENDING_TRANSFER' or p.status<>'SUCCEEDED')) then raise exception 'COMU_SETTLEMENT_FUNDS_CHANGED'; end if;
  if exists(select 1 from public.comu_seller_settlement_items i join public.comu_seller_fund_holds h on h.allocation_id=i.allocation_id where i.settlement_id=s.id and h.status='ACTIVE') then raise exception 'COMU_FUNDS_FROZEN'; end if;
  update public.comu_seller_settlements set status='PROCESSING',first_attempt_at=coalesce(first_attempt_at,now()),attempt_count=attempt_count+1,updated_at=now() where id=s.id returning * into s;
  insert into public.comu_financial_events(seller_id,settlement_id,event_type,idempotency_key) values(s.seller_id,s.id,'TRANSFER_CREATED',s.id::text||':attempt:'||s.attempt_count);
  return s;
end; $$;

create function public.comu_finish_transfer(p_settlement_id uuid,p_transfer_id text,p_amount_cents bigint,p_currency text,p_destination text) returns public.comu_seller_settlements
language plpgsql security definer set search_path=public as $$
declare s public.comu_seller_settlements%rowtype;
begin
  select * into strict s from public.comu_seller_settlements where id=p_settlement_id for update;
  if p_amount_cents<>s.amount_cents or upper(p_currency)<>s.currency or p_destination<>s.stripe_account_id or p_transfer_id is null then raise exception 'COMU_TRANSFER_MISMATCH'; end if;
  if s.status='TRANSFERRED' then
    if s.stripe_transfer_id<>p_transfer_id then raise exception 'COMU_TRANSFER_MISMATCH'; end if;
    return s;
  end if;
  if s.status not in ('PROCESSING','FAILED') then raise exception 'COMU_TRANSFER_NOT_STARTED'; end if;
  insert into public.comu_seller_ledger_entries(seller_id,payment_id,allocation_id,settlement_id,entry_type,amount_cents,currency)
    select a.seller_id,a.payment_id,a.id,s.id,'TRANSFER',i.amount_cents,s.currency from public.comu_seller_settlement_items i join public.comu_payment_allocations a on a.id=i.allocation_id where i.settlement_id=s.id
    on conflict(allocation_id,entry_type) do nothing;
  update public.comu_payment_allocations set status='TRANSFERRED' where id in (select allocation_id from public.comu_seller_settlement_items where settlement_id=s.id);
  update public.comu_seller_settlements set status='TRANSFERRED',stripe_transfer_id=p_transfer_id,last_error=null,retryable=false,updated_at=now() where id=s.id returning * into s;
  insert into public.comu_financial_events(seller_id,settlement_id,event_type,idempotency_key) values(s.seller_id,s.id,'TRANSFER_SUCCEEDED',s.id::text||':succeeded') on conflict do nothing;
  return s;
end; $$;

create function public.comu_fail_transfer(p_settlement_id uuid,p_reason text,p_retryable boolean) returns void
language plpgsql security definer set search_path=public as $$
declare s public.comu_seller_settlements%rowtype;
begin
  select * into strict s from public.comu_seller_settlements where id=p_settlement_id for update;
  if s.status='TRANSFERRED' then return; end if;
  update public.comu_seller_settlements set status='FAILED',last_error=left(p_reason,100),retryable=p_retryable,updated_at=now() where id=s.id;
  insert into public.comu_financial_events(seller_id,settlement_id,event_type,idempotency_key,payload) values(s.seller_id,s.id,'TRANSFER_FAILED',s.id::text||':failed:'||s.attempt_count,jsonb_build_object('reason',left(p_reason,100))) on conflict do nothing;
end; $$;

revoke all on function public.comu_release_eligible_seller_funds(uuid),public.comu_create_daily_settlements(uuid),public.comu_claim_transfer(uuid),public.comu_finish_transfer(uuid,text,bigint,text,text),public.comu_fail_transfer(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.comu_release_eligible_seller_funds(uuid),public.comu_create_daily_settlements(uuid),public.comu_claim_transfer(uuid),public.comu_finish_transfer(uuid,text,bigint,text,text),public.comu_fail_transfer(uuid,text,boolean) to service_role;


create function public.comu_financial_append_only() returns trigger language plpgsql as $$
begin raise exception 'COMU_FINANCIAL_APPEND_ONLY'; end; $$;
create trigger comu_ledger_append_only before update or delete on public.comu_seller_ledger_entries for each row execute function public.comu_financial_append_only();
create trigger comu_financial_events_append_only before update or delete on public.comu_financial_events for each row execute function public.comu_financial_append_only();

create function public.comu_check_allocation_total() returns trigger
language plpgsql set search_path=public as $$
declare expected bigint; actual bigint;
begin
  select amount_cents into strict expected from public.comu_payment_intents where id=new.payment_id;
  select sum(gross_amount_cents) into actual from public.comu_payment_allocations where payment_id=new.payment_id;
  if actual is distinct from expected then raise exception 'COMU_ALLOCATION_TOTAL_MISMATCH'; end if;
  return null;
end; $$;
create constraint trigger comu_allocation_total after insert on public.comu_payment_allocations deferrable initially deferred for each row execute function public.comu_check_allocation_total();
create function public.comu_allocation_immutable() returns trigger language plpgsql as $$
begin
  if (new.payment_id,new.order_id,new.suborder_id,new.seller_id,new.gross_amount_cents,new.platform_fee_cents,new.seller_net_amount_cents)
    is distinct from (old.payment_id,old.order_id,old.suborder_id,old.seller_id,old.gross_amount_cents,old.platform_fee_cents,old.seller_net_amount_cents) then raise exception 'COMU_ALLOCATION_IMMUTABLE'; end if;
  return new;
end; $$;
create trigger comu_allocation_immutable before update on public.comu_payment_allocations for each row execute function public.comu_allocation_immutable();

alter table public.comu_financial_settings enable row level security;
alter table public.comu_seller_fund_holds enable row level security;
alter table public.comu_financial_events enable row level security;
alter table public.comu_seller_settlements enable row level security;
alter table public.comu_seller_settlement_items enable row level security;
alter table public.comu_connect_webhook_events enable row level security;
revoke all on public.comu_financial_settings,public.comu_seller_fund_holds,public.comu_financial_events,public.comu_seller_settlements,public.comu_seller_settlement_items,public.comu_connect_webhook_events from anon,authenticated;
grant all on public.comu_financial_settings,public.comu_seller_fund_holds,public.comu_financial_events,public.comu_seller_settlements,public.comu_seller_settlement_items,public.comu_connect_webhook_events to service_role;
grant select on public.comu_financial_settings,public.comu_seller_fund_holds,public.comu_financial_events,public.comu_seller_settlement_items to authenticated;
grant select(id,seller_id,settlement_day,currency,amount_cents,status,retryable,created_at,updated_at) on public.comu_seller_settlements to authenticated;
create policy comu_financial_settings_admin on public.comu_financial_settings for select to authenticated using (public.is_cometa_admin());
create policy comu_holds_seller on public.comu_seller_fund_holds for select to authenticated using (public.is_cometa_admin() or exists(select 1 from public.comu_seller_memberships m where m.seller_id=comu_seller_fund_holds.seller_id and m.user_id=auth.uid() and m.active));
create policy comu_financial_events_admin on public.comu_financial_events for select to authenticated using (public.is_cometa_admin());
create policy comu_settlements_seller on public.comu_seller_settlements for select to authenticated using (public.is_cometa_admin() or exists(select 1 from public.comu_seller_memberships m where m.seller_id=comu_seller_settlements.seller_id and m.user_id=auth.uid() and m.active));
create policy comu_settlement_items_seller on public.comu_seller_settlement_items for select to authenticated using (public.is_cometa_admin() or exists(select 1 from public.comu_seller_memberships m where m.seller_id=comu_seller_settlement_items.seller_id and m.user_id=auth.uid() and m.active));

-- Connected-account IDs and durable request keys are server-only.
revoke select on public.comu_seller_payment_accounts from authenticated;
grant select(id,seller_id,account_type,onboarding_status,details_submitted,charges_enabled,payouts_enabled,transfers_enabled,requirements_due,financial_suspended,created_at,updated_at) on public.comu_seller_payment_accounts to authenticated;
