create table if not exists public.comu_buyers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  display_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comu_buyer_addresses (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.comu_buyers(id) on delete cascade,
  label text not null,
  recipient_name text not null,
  phone text not null,
  line1 text not null,
  line2 text,
  city text not null,
  state text not null,
  postal_code text not null,
  country text not null default 'MX',
  "references" text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comu_carts (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null unique references public.comu_buyers(id) on delete cascade,
  mode text not null default 'RETAIL' check (mode in ('RETAIL','WHOLESALE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comu_cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.comu_carts(id) on delete cascade,
  seller_id uuid not null references public.comu_sellers(id),
  listing_id uuid not null references public.comu_product_listings(id),
  variant_listing_id uuid not null references public.comu_variant_listings(id),
  quantity numeric(14,3) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, variant_listing_id)
);

create index if not exists comu_addresses_buyer_idx on public.comu_buyer_addresses(buyer_id, is_default);
create index if not exists comu_cart_items_cart_idx on public.comu_cart_items(cart_id);

alter table public.comu_buyers enable row level security;
alter table public.comu_buyer_addresses enable row level security;
alter table public.comu_carts enable row level security;
alter table public.comu_cart_items enable row level security;

create policy comu_buyers_self on public.comu_buyers for all to authenticated using (user_id = auth.uid() or public.is_cometa_admin()) with check (user_id = auth.uid() or public.is_cometa_admin());
create policy comu_addresses_self on public.comu_buyer_addresses for all to authenticated using (exists (select 1 from public.comu_buyers b where b.id = buyer_id and (b.user_id = auth.uid() or public.is_cometa_admin()))) with check (exists (select 1 from public.comu_buyers b where b.id = buyer_id and (b.user_id = auth.uid() or public.is_cometa_admin())));
create policy comu_carts_self on public.comu_carts for all to authenticated using (exists (select 1 from public.comu_buyers b where b.id = buyer_id and (b.user_id = auth.uid() or public.is_cometa_admin()))) with check (exists (select 1 from public.comu_buyers b where b.id = buyer_id and (b.user_id = auth.uid() or public.is_cometa_admin())));
create policy comu_cart_items_self on public.comu_cart_items for all to authenticated using (exists (select 1 from public.comu_carts c join public.comu_buyers b on b.id = c.buyer_id where c.id = cart_id and (b.user_id = auth.uid() or public.is_cometa_admin()))) with check (exists (select 1 from public.comu_carts c join public.comu_buyers b on b.id = c.buyer_id where c.id = cart_id and (b.user_id = auth.uid() or public.is_cometa_admin())));
