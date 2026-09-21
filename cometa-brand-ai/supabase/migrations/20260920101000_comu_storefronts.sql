create table if not exists public.comu_storefronts (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.comu_sellers(id) on delete cascade,
  name text not null,
  slug text not null,
  headline text,
  description text,
  logo_url text,
  cover_url text,
  status text not null default 'DRAFT',
  theme_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comu_storefronts_status_ck check (status in ('DRAFT','PUBLISHED','ACTIVE','SUSPENDED')),
  constraint comu_storefronts_slug_ck check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint comu_storefronts_theme_ck check (jsonb_typeof(theme_config) = 'object'),
  constraint comu_storefronts_seller_unique unique (seller_id),
  constraint comu_storefronts_slug_unique unique (slug)
);

alter table public.comu_storefronts enable row level security;

create policy comu_storefronts_public_select on public.comu_storefronts
  for select to anon, authenticated using (
    status in ('PUBLISHED','ACTIVE') and exists (
      select 1 from public.comu_sellers s
      where s.id = comu_storefronts.seller_id and s.status = 'ACTIVE' and s.verification_status = 'VERIFIED'
    )
  );
create policy comu_storefronts_member_select on public.comu_storefronts
  for select to authenticated using (
    exists (select 1 from public.comu_seller_memberships m where m.seller_id = comu_storefronts.seller_id and m.user_id = auth.uid() and m.active)
    or public.is_cometa_admin()
  );
create policy comu_storefronts_member_write on public.comu_storefronts
  for all to authenticated using (
    public.is_cometa_admin() or exists (select 1 from public.comu_seller_memberships m where m.seller_id = comu_storefronts.seller_id and m.user_id = auth.uid() and m.active and m.role in ('OWNER','ADMIN'))
  ) with check (
    public.is_cometa_admin() or exists (select 1 from public.comu_seller_memberships m where m.seller_id = comu_storefronts.seller_id and m.user_id = auth.uid() and m.active and m.role in ('OWNER','ADMIN'))
  );
