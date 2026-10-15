create table if not exists public.comu_product_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.comu_product_listings(id) on delete cascade,
  variant_id uuid,
  storage_path text not null,
  public_url text not null,
  media_type text not null default 'image',
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  constraint comu_product_media_type_ck check (media_type = 'image')
);

create index if not exists comu_product_media_listing_idx on public.comu_product_media(listing_id, sort_order);
alter table public.comu_product_media enable row level security;

create policy comu_product_media_public_select on public.comu_product_media
  for select to anon, authenticated using (exists (select 1 from public.comu_product_listings l join public.comu_sellers s on s.id = l.seller_id join public.comu_storefronts sf on sf.id = l.storefront_id where l.id = comu_product_media.listing_id and l.status = 'PUBLISHED' and s.status = 'ACTIVE' and s.verification_status = 'VERIFIED' and sf.status in ('PUBLISHED','ACTIVE')));
create policy comu_product_media_member_select on public.comu_product_media
  for select to authenticated using (public.is_cometa_admin() or exists (select 1 from public.comu_product_listings l join public.comu_seller_memberships m on m.seller_id = l.seller_id where l.id = comu_product_media.listing_id and m.user_id = auth.uid() and m.active));
create policy comu_product_media_member_write on public.comu_product_media
  for all to authenticated using (public.is_cometa_admin() or exists (select 1 from public.comu_product_listings l join public.comu_seller_memberships m on m.seller_id = l.seller_id where l.id = comu_product_media.listing_id and m.user_id = auth.uid() and m.active and m.role in ('OWNER','ADMIN','CATALOG_MANAGER'))) with check (public.is_cometa_admin() or exists (select 1 from public.comu_product_listings l join public.comu_seller_memberships m on m.seller_id = l.seller_id where l.id = comu_product_media.listing_id and m.user_id = auth.uid() and m.active and m.role in ('OWNER','ADMIN','CATALOG_MANAGER')));
