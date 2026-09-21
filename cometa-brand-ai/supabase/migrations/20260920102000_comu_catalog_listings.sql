create table if not exists public.comu_product_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.comu_sellers(id) on delete cascade,
  storefront_id uuid not null references public.comu_storefronts(id) on delete cascade,
  product_id uuid not null,
  public_slug text not null,
  status text not null default 'DRAFT',
  title_override text,
  description_override text,
  public_category text,
  retail_price_override numeric(14,2),
  wholesale_enabled boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comu_product_listings_status_ck check (status in ('DRAFT','PUBLISHED','HIDDEN','SUSPENDED','REMOVED')),
  constraint comu_product_listings_price_ck check (retail_price_override is null or retail_price_override >= 0),
  constraint comu_product_listings_slug_ck check (public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint comu_product_listings_product_unique unique (seller_id, product_id),
  constraint comu_product_listings_slug_unique unique (public_slug)
);

create table if not exists public.comu_variant_listings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.comu_product_listings(id) on delete cascade,
  variant_id uuid not null,
  enabled boolean not null default true,
  price_override numeric(14,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comu_variant_listings_price_ck check (price_override is null or price_override >= 0),
  constraint comu_variant_listings_unique unique (listing_id, variant_id)
);

create index if not exists comu_product_listings_public_idx on public.comu_product_listings(status, seller_id);
create index if not exists comu_product_listings_storefront_idx on public.comu_product_listings(storefront_id, status);
create index if not exists comu_variant_listings_variant_idx on public.comu_variant_listings(variant_id, enabled);

alter table public.comu_product_listings enable row level security;
alter table public.comu_variant_listings enable row level security;

create policy comu_product_listings_public_select on public.comu_product_listings
  for select to anon, authenticated using (
    status = 'PUBLISHED' and exists (
      select 1 from public.comu_sellers s join public.comu_storefronts sf on sf.seller_id = s.id
      where s.id = comu_product_listings.seller_id and s.status = 'ACTIVE' and s.verification_status = 'VERIFIED'
        and sf.id = comu_product_listings.storefront_id and sf.status in ('PUBLISHED','ACTIVE')
    )
  );
create policy comu_product_listings_member_select on public.comu_product_listings
  for select to authenticated using (
    public.is_cometa_admin() or exists (select 1 from public.comu_seller_memberships m where m.seller_id = comu_product_listings.seller_id and m.user_id = auth.uid() and m.active)
  );
create policy comu_product_listings_member_write on public.comu_product_listings
  for all to authenticated using (
    public.is_cometa_admin() or exists (select 1 from public.comu_seller_memberships m where m.seller_id = comu_product_listings.seller_id and m.user_id = auth.uid() and m.active and m.role in ('OWNER','ADMIN','CATALOG_MANAGER'))
  ) with check (
    public.is_cometa_admin() or exists (select 1 from public.comu_seller_memberships m where m.seller_id = comu_product_listings.seller_id and m.user_id = auth.uid() and m.active and m.role in ('OWNER','ADMIN','CATALOG_MANAGER'))
  );

create policy comu_variant_listings_public_select on public.comu_variant_listings
  for select to anon, authenticated using (
    enabled and exists (select 1 from public.comu_product_listings l join public.comu_sellers s on s.id = l.seller_id join public.comu_storefronts sf on sf.id = l.storefront_id where l.id = comu_variant_listings.listing_id and l.status = 'PUBLISHED' and s.status = 'ACTIVE' and s.verification_status = 'VERIFIED' and sf.status in ('PUBLISHED','ACTIVE'))
  );
create policy comu_variant_listings_member_select on public.comu_variant_listings
  for select to authenticated using (
    public.is_cometa_admin() or exists (select 1 from public.comu_product_listings l join public.comu_seller_memberships m on m.seller_id = l.seller_id where l.id = comu_variant_listings.listing_id and m.user_id = auth.uid() and m.active)
  );
create policy comu_variant_listings_member_write on public.comu_variant_listings
  for all to authenticated using (
    public.is_cometa_admin() or exists (select 1 from public.comu_product_listings l join public.comu_seller_memberships m on m.seller_id = l.seller_id where l.id = comu_variant_listings.listing_id and m.user_id = auth.uid() and m.active and m.role in ('OWNER','ADMIN','CATALOG_MANAGER'))
  ) with check (
    public.is_cometa_admin() or exists (select 1 from public.comu_product_listings l join public.comu_seller_memberships m on m.seller_id = l.seller_id where l.id = comu_variant_listings.listing_id and m.user_id = auth.uid() and m.active and m.role in ('OWNER','ADMIN','CATALOG_MANAGER'))
  );
