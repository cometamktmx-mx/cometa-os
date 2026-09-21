create table if not exists public.comu_sellers (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null,
  brand_slug text not null,
  public_name text not null,
  slug text not null,
  status text not null default 'DRAFT',
  verification_status text not null default 'UNVERIFIED',
  verified_at timestamptz,
  activated_at timestamptz,
  description text,
  logo_url text,
  cover_url text,
  city text,
  state text,
  country text default 'MX',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comu_sellers_status_ck check (status in ('DRAFT','PENDING_VERIFICATION','VERIFIED','ACTIVE','SUSPENDED','PAUSED','CLOSED')),
  constraint comu_sellers_verification_ck check (verification_status in ('UNVERIFIED','PENDING','VERIFIED','REJECTED')),
  constraint comu_sellers_slug_ck check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint comu_sellers_public_name_ck check (btrim(public_name) <> ''),
  constraint comu_sellers_slug_unique unique (slug)
);

create index if not exists comu_sellers_public_idx on public.comu_sellers(status, verification_status);
create index if not exists comu_sellers_brand_slug_idx on public.comu_sellers(brand_slug);

create table if not exists public.comu_seller_memberships (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.comu_sellers(id) on delete cascade,
  user_id uuid not null,
  role text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comu_seller_memberships_role_ck check (role in ('OWNER','ADMIN','CATALOG_MANAGER','ORDER_MANAGER')),
  constraint comu_seller_memberships_unique unique (seller_id, user_id)
);

create index if not exists comu_seller_memberships_user_idx on public.comu_seller_memberships(user_id, active);
create index if not exists comu_seller_memberships_seller_idx on public.comu_seller_memberships(seller_id, active);

alter table public.comu_sellers enable row level security;
alter table public.comu_seller_memberships enable row level security;

create policy comu_sellers_public_active_select on public.comu_sellers
  for select to anon, authenticated using (status = 'ACTIVE' and verification_status = 'VERIFIED');
create policy comu_sellers_member_select on public.comu_sellers
  for select to authenticated using (
    exists (select 1 from public.comu_seller_memberships m where m.seller_id = comu_sellers.id and m.user_id = auth.uid() and m.active)
    or public.is_cometa_admin()
  );
create policy comu_sellers_admin_write on public.comu_sellers
  for all to authenticated using (public.is_cometa_admin()) with check (public.is_cometa_admin());

create policy comu_seller_memberships_member_select on public.comu_seller_memberships
  for select to authenticated using (user_id = auth.uid() or public.is_cometa_admin());
create policy comu_seller_memberships_admin_write on public.comu_seller_memberships
  for all to authenticated using (public.is_cometa_admin()) with check (public.is_cometa_admin());
