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
