-- Marketplace economics persistence. Additive and local-first; all amounts are integer MXN cents.
alter table public.comu_payment_intents
  add column if not exists stripe_charge_id text,
  add column if not exists stripe_balance_transaction_id text,
  add column if not exists stripe_processing_fee_cents bigint,
  add column if not exists stripe_fee_finalized_at timestamptz,
  add column if not exists transfer_group text,
  add constraint comu_payment_intents_processing_fee_nonnegative check (stripe_processing_fee_cents is null or stripe_processing_fee_cents >= 0);
create unique index if not exists comu_payment_intents_charge_uidx on public.comu_payment_intents(stripe_charge_id) where stripe_charge_id is not null;
create unique index if not exists comu_payment_intents_balance_tx_uidx on public.comu_payment_intents(stripe_balance_transaction_id) where stripe_balance_transaction_id is not null;
create index if not exists comu_payment_intents_transfer_group_idx on public.comu_payment_intents(transfer_group) where transfer_group is not null;

create table if not exists public.comu_payment_economics (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.comu_payment_intents(id) on delete cascade,
  allocation_id uuid not null unique references public.comu_payment_allocations(id),
  seller_id uuid not null references public.comu_sellers(id),
  economic_gross_cents bigint not null check (economic_gross_cents >= 0),
  stripe_processing_fee_share_cents bigint not null default 0 check (stripe_processing_fee_share_cents >= 0),
  seller_shipping_liability_cents bigint not null default 0 check (seller_shipping_liability_cents >= 0),
  seller_discount_liability_cents bigint not null default 0 check (seller_discount_liability_cents >= 0),
  refund_liability_cents bigint not null default 0 check (refund_liability_cents >= 0),
  dispute_liability_cents bigint not null default 0 check (dispute_liability_cents >= 0),
  negative_balance_recovery_cents bigint not null default 0 check (negative_balance_recovery_cents >= 0),
  explicit_adjustment_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(payment_id, allocation_id)
);
create index if not exists comu_payment_economics_seller_idx on public.comu_payment_economics(seller_id, created_at desc);

create table if not exists public.comu_seller_liability_events (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.comu_sellers(id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'MXN' check (currency = 'MXN'),
  event_type text not null check (event_type in ('LIABILITY_CREATED','LIABILITY_RECOVERED','LIABILITY_ADJUSTED','LIABILITY_CLEARED')),
  balance_effect text not null check (balance_effect in ('INCREASE','DECREASE')),
  source_type text not null,
  source_id text not null,
  master_order_id uuid references public.comu_orders(id),
  suborder_id uuid references public.comu_order_suborders(id),
  liability_owner text not null check (liability_owner in ('SELLER','COMETA')),
  reason_code text not null,
  note text,
  actor_id uuid,
  created_at timestamptz not null default now(),
  idempotency_key text not null unique
);
create index if not exists comu_seller_liability_events_seller_idx on public.comu_seller_liability_events(seller_id, created_at desc);
create view public.comu_seller_negative_balances as
select seller_id, currency,
  greatest(0, sum(case when balance_effect = 'INCREASE' then amount_cents else -amount_cents end))::bigint as balance_due_cents
from public.comu_seller_liability_events
group by seller_id, currency;

create table if not exists public.comu_refunds (
  id uuid primary key default gen_random_uuid(),
  stripe_refund_id text unique,
  payment_id uuid not null references public.comu_payment_intents(id),
  master_order_id uuid not null references public.comu_orders(id),
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'MXN' check (currency = 'MXN'),
  status text not null default 'REQUESTED' check (status in ('REQUESTED','PROCESSING','SUCCEEDED','FAILED','CANCELLED')),
  reason text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);
create table if not exists public.comu_refund_allocations (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.comu_refunds(id) on delete cascade,
  payment_allocation_id uuid not null references public.comu_payment_allocations(id),
  seller_id uuid not null references public.comu_sellers(id),
  principal_cents bigint not null default 0 check (principal_cents >= 0),
  shipping_cents bigint not null default 0 check (shipping_cents >= 0),
  liability_owner text not null check (liability_owner in ('SELLER','COMETA')),
  status text not null default 'PENDING' check (status in ('PENDING','FINALIZED','CANCELLED')),
  unique(refund_id, payment_allocation_id)
);

create table if not exists public.comu_disputes (
  id uuid primary key default gen_random_uuid(),
  stripe_dispute_id text not null unique,
  stripe_charge_id text,
  payment_id uuid not null references public.comu_payment_intents(id),
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'MXN' check (currency = 'MXN'),
  reason text,
  status text not null default 'OPEN' check (status in ('OPEN','UNDER_REVIEW','WON','LOST','CLOSED')),
  opened_at timestamptz not null default now(),
  evidence_due_by timestamptz,
  resolved_at timestamptz,
  outcome text,
  actual_dispute_cost_cents bigint check (actual_dispute_cost_cents is null or actual_dispute_cost_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.comu_dispute_allocations (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.comu_disputes(id) on delete cascade,
  payment_allocation_id uuid not null references public.comu_payment_allocations(id),
  seller_id uuid not null references public.comu_sellers(id),
  exposed_principal_cents bigint not null default 0 check (exposed_principal_cents >= 0),
  permanent_liability_cents bigint not null default 0 check (permanent_liability_cents >= 0),
  dispute_cost_share_cents bigint not null default 0 check (dispute_cost_share_cents >= 0),
  liability_owner text not null check (liability_owner in ('SELLER','COMETA')),
  attribution_status text not null default 'ATTRIBUTION_REQUIRED' check (attribution_status in ('ATTRIBUTION_REQUIRED','SELLER','COMETA','NONE')),
  admin_actor_id uuid,
  admin_reason text,
  created_at timestamptz not null default now(),
  unique(dispute_id, payment_allocation_id)
);
alter table public.comu_seller_fund_holds add column if not exists dispute_id uuid references public.comu_disputes(id);

create table if not exists public.comu_transfer_reversals (
  id uuid primary key default gen_random_uuid(),
  stripe_transfer_reversal_id text unique,
  stripe_transfer_id text not null,
  seller_id uuid not null references public.comu_sellers(id),
  master_order_id uuid references public.comu_orders(id),
  suborder_id uuid references public.comu_order_suborders(id),
  refund_id uuid references public.comu_refunds(id),
  dispute_id uuid references public.comu_disputes(id),
  amount_cents bigint not null check (amount_cents > 0),
  reason text not null,
  status text not null default 'REQUESTED' check (status in ('REQUESTED','PROCESSING','SUCCEEDED','FAILED','CANCELLED')),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);

create table if not exists public.comu_dispute_evidence_refs (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.comu_disputes(id) on delete cascade,
  evidence_type text not null,
  source_table text not null,
  source_id text not null,
  retain_until timestamptz,
  created_at timestamptz not null default now(),
  unique(dispute_id, evidence_type, source_table, source_id)
);

create or replace function public.comu_finalize_payment_economics(
  p_payment_id uuid,
  p_stripe_charge_id text,
  p_stripe_balance_transaction_id text,
  p_processing_fee_cents bigint,
  p_transfer_group text,
  p_allocations jsonb
) returns public.comu_payment_intents
language plpgsql security definer set search_path = public as $$
declare v_payment public.comu_payment_intents%rowtype; v_sum bigint; v_row jsonb;
begin
  if p_processing_fee_cents < 0 then raise exception 'COMU_PROCESSING_FEE_INVALID'; end if;
  select * into strict v_payment from public.comu_payment_intents where id=p_payment_id for update;
  if v_payment.stripe_fee_finalized_at is not null then
    if v_payment.stripe_charge_id is distinct from p_stripe_charge_id or v_payment.stripe_processing_fee_cents is distinct from p_processing_fee_cents then raise exception 'COMU_PAYMENT_FINANCIAL_SNAPSHOT_IMMUTABLE'; end if;
    return v_payment;
  end if;
  select coalesce(sum((value->>'stripeProcessingFeeShareCents')::bigint),0) into v_sum from jsonb_array_elements(p_allocations) as value;
  if v_sum <> p_processing_fee_cents then raise exception 'COMU_PROCESSING_FEE_ALLOCATION_MISMATCH'; end if;
  for v_row in select value from jsonb_array_elements(p_allocations) loop
    if (v_row->>'stripeProcessingFeeShareCents')::bigint < 0 then raise exception 'COMU_PROCESSING_FEE_INVALID'; end if;
    insert into public.comu_payment_economics(payment_id,allocation_id,seller_id,economic_gross_cents,stripe_processing_fee_share_cents)
      select v_payment.id,a.id,a.seller_id,a.gross_amount_cents,(v_row->>'stripeProcessingFeeShareCents')::bigint
      from public.comu_payment_allocations a where a.id=(v_row->>'allocationId')::uuid and a.payment_id=v_payment.id
      on conflict(allocation_id) do update set stripe_processing_fee_share_cents=excluded.stripe_processing_fee_share_cents;
    if not found then raise exception 'COMU_PAYMENT_ALLOCATION_NOT_FOUND'; end if;
  end loop;
  update public.comu_payment_intents set stripe_charge_id=p_stripe_charge_id, stripe_balance_transaction_id=p_stripe_balance_transaction_id, stripe_processing_fee_cents=p_processing_fee_cents, stripe_fee_finalized_at=now(), transfer_group=p_transfer_group, updated_at=now() where id=v_payment.id returning * into v_payment;
  return v_payment;
end; $$;
revoke all on function public.comu_finalize_payment_economics(uuid,text,text,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.comu_finalize_payment_economics(uuid,text,text,bigint,text,jsonb) to service_role;

create or replace function public.comu_record_liability_event(
  p_seller_id uuid, p_amount_cents bigint, p_event_type text, p_balance_effect text,
  p_source_type text, p_source_id text, p_liability_owner text, p_reason_code text,
  p_idempotency_key text, p_master_order_id uuid default null, p_suborder_id uuid default null,
  p_note text default null, p_actor_id uuid default null
) returns public.comu_seller_liability_events
language plpgsql security definer set search_path = public as $$
declare v_event public.comu_seller_liability_events%rowtype;
begin
  insert into public.comu_seller_liability_events(seller_id,amount_cents,event_type,balance_effect,source_type,source_id,liability_owner,reason_code,idempotency_key,master_order_id,suborder_id,note,actor_id)
  values(p_seller_id,p_amount_cents,p_event_type,p_balance_effect,p_source_type,p_source_id,p_liability_owner,p_reason_code,p_idempotency_key,p_master_order_id,p_suborder_id,p_note,p_actor_id)
  on conflict(idempotency_key) do update set id=id returning * into v_event;
  return v_event;
end; $$;
revoke all on function public.comu_record_liability_event(uuid,bigint,text,text,text,text,text,text,text,uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.comu_record_liability_event(uuid,bigint,text,text,text,text,text,text,text,uuid,uuid,text,uuid) to service_role;

alter table public.comu_payment_economics enable row level security;
alter table public.comu_seller_liability_events enable row level security;
alter table public.comu_refunds enable row level security;
alter table public.comu_refund_allocations enable row level security;
alter table public.comu_disputes enable row level security;
alter table public.comu_dispute_allocations enable row level security;
alter table public.comu_transfer_reversals enable row level security;
alter table public.comu_dispute_evidence_refs enable row level security;
revoke all on public.comu_payment_economics,public.comu_seller_liability_events,public.comu_refunds,public.comu_refund_allocations,public.comu_disputes,public.comu_dispute_allocations,public.comu_transfer_reversals,public.comu_dispute_evidence_refs from anon,authenticated;
grant all on public.comu_payment_economics,public.comu_seller_liability_events,public.comu_refunds,public.comu_refund_allocations,public.comu_disputes,public.comu_dispute_allocations,public.comu_transfer_reversals,public.comu_dispute_evidence_refs to service_role;
grant select on public.comu_payment_economics,public.comu_seller_liability_events,public.comu_refund_allocations,public.comu_dispute_allocations to authenticated;
create policy comu_payment_economics_seller on public.comu_payment_economics for select to authenticated using (seller_id in (select seller_id from public.comu_seller_memberships where user_id=auth.uid() and active) or public.is_cometa_admin());
create policy comu_liability_events_seller on public.comu_seller_liability_events for select to authenticated using (seller_id in (select seller_id from public.comu_seller_memberships where user_id=auth.uid() and active) or public.is_cometa_admin());
create policy comu_refund_allocations_seller on public.comu_refund_allocations for select to authenticated using (seller_id in (select seller_id from public.comu_seller_memberships where user_id=auth.uid() and active) or public.is_cometa_admin());
create policy comu_dispute_allocations_seller on public.comu_dispute_allocations for select to authenticated using (seller_id in (select seller_id from public.comu_seller_memberships where user_id=auth.uid() and active) or public.is_cometa_admin());

create or replace function public.comu_marketplace_financial_append_only() returns trigger language plpgsql as $$ begin raise exception 'COMU_MARKETPLACE_FINANCIAL_APPEND_ONLY'; end; $$;
create trigger comu_liability_events_append_only before update or delete on public.comu_seller_liability_events for each row execute function public.comu_marketplace_financial_append_only();
