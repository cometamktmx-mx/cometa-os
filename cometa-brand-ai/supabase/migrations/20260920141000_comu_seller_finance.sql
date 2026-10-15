create table if not exists public.comu_seller_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null unique references public.comu_sellers(id) on delete cascade,
  stripe_account_id text unique,
  onboarding_status text not null default 'NOT_STARTED' check (onboarding_status in ('NOT_STARTED','PENDING','COMPLETE','RESTRICTED')),
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comu_seller_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.comu_sellers(id) on delete cascade,
  payment_id uuid references public.comu_payment_intents(id),
  allocation_id uuid references public.comu_payment_allocations(id),
  entry_type text not null check (entry_type in ('SALE_HELD','SALE_AVAILABLE','SALE_REVERSED','REFUND','PAYOUT')),
  amount_cents bigint not null,
  currency text not null default 'MXN',
  created_at timestamptz not null default now(),
  unique(allocation_id, entry_type)
);

alter table public.comu_seller_payment_accounts enable row level security;
alter table public.comu_seller_ledger_entries enable row level security;
create policy comu_seller_payment_accounts_member on public.comu_seller_payment_accounts for select to authenticated using (seller_id in (select seller_id from public.comu_seller_memberships where user_id=auth.uid() and active) or public.is_cometa_admin());
create policy comu_seller_ledger_member on public.comu_seller_ledger_entries for select to authenticated using (seller_id in (select seller_id from public.comu_seller_memberships where user_id=auth.uid() and active) or public.is_cometa_admin());
revoke all on public.comu_seller_payment_accounts, public.comu_seller_ledger_entries from anon, authenticated;
grant select on public.comu_seller_payment_accounts, public.comu_seller_ledger_entries to authenticated;
