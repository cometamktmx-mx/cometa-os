create table if not exists public.comu_payment_intents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.comu_orders(id),
  buyer_id uuid not null references public.comu_buyers(id),
  stripe_payment_intent_id text unique,
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null default 'MXN' check (currency = upper(currency)),
  status text not null default 'REQUIRES_PAYMENT' check (status in ('REQUIRES_PAYMENT','PROCESSING','SUCCEEDED','FAILED','CANCELLED','PARTIALLY_REFUNDED','REFUNDED','DISPUTED','PAYMENT_RECEIVED_AFTER_EXPIRY')),
  idempotency_key text not null unique,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comu_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.comu_payment_intents(id) on delete cascade,
  stripe_event_id text,
  type text not null,
  status text not null,
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(payment_id, type, stripe_event_id)
);

create table if not exists public.comu_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.comu_payment_intents(id) on delete cascade,
  order_id uuid not null references public.comu_orders(id) on delete cascade,
  suborder_id uuid not null references public.comu_order_suborders(id) on delete cascade,
  seller_id uuid not null references public.comu_sellers(id),
  gross_amount_cents bigint not null check (gross_amount_cents >= 0),
  platform_fee_cents bigint not null default 0 check (platform_fee_cents >= 0),
  seller_net_amount_cents bigint not null check (seller_net_amount_cents >= 0),
  status text not null default 'HELD' check (status in ('HELD','AVAILABLE','REVERSED','REFUNDED')),
  created_at timestamptz not null default now(),
  unique(payment_id, suborder_id)
);

create index if not exists comu_payment_intents_order_idx on public.comu_payment_intents(order_id, created_at desc);
create index if not exists comu_payment_allocations_seller_idx on public.comu_payment_allocations(seller_id, created_at desc);

alter table public.comu_payment_intents enable row level security;
alter table public.comu_payment_transactions enable row level security;
alter table public.comu_payment_allocations enable row level security;

create policy comu_payment_intents_buyer on public.comu_payment_intents for select to authenticated using (buyer_id in (select id from public.comu_buyers where user_id=auth.uid()) or public.is_cometa_admin());
create policy comu_payment_allocations_seller on public.comu_payment_allocations for select to authenticated using (seller_id in (select seller_id from public.comu_seller_memberships where user_id=auth.uid() and active) or public.is_cometa_admin());
create policy comu_payment_transactions_admin on public.comu_payment_transactions for select to authenticated using (public.is_cometa_admin());

revoke all on public.comu_payment_intents, public.comu_payment_transactions, public.comu_payment_allocations from anon, authenticated;
grant select on public.comu_payment_intents, public.comu_payment_allocations to authenticated;
grant select on public.comu_payment_transactions to authenticated;
