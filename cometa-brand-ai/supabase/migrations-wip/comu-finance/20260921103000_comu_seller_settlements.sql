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
