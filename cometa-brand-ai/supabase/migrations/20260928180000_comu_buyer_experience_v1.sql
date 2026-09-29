-- PREPARED ONLY: apply after human authorization. No Finance tables touched.
create table public.comu_buyer_favorites (
  buyer_id uuid not null references public.comu_buyers(id) on delete cascade,
  listing_id uuid not null references public.comu_product_listings(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (buyer_id, listing_id)
);
create index comu_buyer_favorites_listing_idx on public.comu_buyer_favorites(listing_id);
alter table public.comu_buyer_favorites enable row level security;
create policy comu_favorites_owner on public.comu_buyer_favorites for all to authenticated
using (exists(select 1 from public.comu_buyers b where b.id=buyer_id and b.user_id=auth.uid()))
with check (exists(select 1 from public.comu_buyers b where b.id=buyer_id and b.user_id=auth.uid()));

create table public.comu_buyer_reviews (
  id uuid primary key default gen_random_uuid(), buyer_id uuid not null references public.comu_buyers(id),
  listing_id uuid not null references public.comu_product_listings(id), order_id uuid not null references public.comu_orders(id),
  rating integer not null check(rating between 1 and 5), body text not null check(char_length(body) between 10 and 2000),
  published boolean not null default false, created_at timestamptz not null default now(),
  unique(buyer_id,listing_id,order_id)
);
create index comu_buyer_reviews_listing_idx on public.comu_buyer_reviews(listing_id,published);
alter table public.comu_buyer_reviews enable row level security;
create policy comu_reviews_read on public.comu_buyer_reviews for select to authenticated
using (published or exists(select 1 from public.comu_buyers b where b.id=buyer_id and b.user_id=auth.uid()));
-- No client INSERT/UPDATE: verified purchase + moderation is a server operation.
create table public.comu_buyer_points (
  id uuid primary key default gen_random_uuid(), buyer_id uuid not null references public.comu_buyers(id),
  review_id uuid not null unique references public.comu_buyer_reviews(id), points integer not null default 100 check(points=100),
  created_at timestamptz not null default now(), expires_at timestamptz not null default (now()+interval '12 months')
);
create index comu_buyer_points_owner_idx on public.comu_buyer_points(buyer_id,expires_at);
alter table public.comu_buyer_points enable row level security;
create policy comu_points_read on public.comu_buyer_points for select to authenticated
using (exists(select 1 from public.comu_buyers b where b.id=buyer_id and b.user_id=auth.uid()));
create function public.comu_award_verified_review_v1() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.published then
    if not exists(select 1 from public.comu_orders o join public.comu_order_items i on i.order_id=o.id
      where o.id=new.order_id and o.buyer_id=new.buyer_id and i.listing_id=new.listing_id
      and (o.status='COMPLETED' or o.fulfillment_status='DELIVERED')) then
      raise exception 'COMU_VERIFIED_PURCHASE_REQUIRED';
    end if;
    insert into public.comu_buyer_points(buyer_id,review_id) values(new.buyer_id,new.id) on conflict(review_id) do nothing;
  end if;
  return new;
end; $$;
revoke all on function public.comu_award_verified_review_v1() from public;
create trigger comu_verified_review_reward after insert or update of published on public.comu_buyer_reviews
for each row execute function public.comu_award_verified_review_v1();

create table public.comu_seller_applications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete cascade,
  contact_name text not null, business_name text not null, email text not null, phone text not null, city text not null,
  business_type text not null, status text not null default 'PENDING' check(status in ('PENDING','REVIEW','APPROVED','REJECTED')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index comu_seller_applications_status_idx on public.comu_seller_applications(status,created_at);
alter table public.comu_seller_applications enable row level security;
create policy comu_application_read on public.comu_seller_applications for select to authenticated
using(user_id=auth.uid() or public.is_cometa_admin());
create policy comu_application_insert on public.comu_seller_applications for insert to authenticated
with check(user_id=auth.uid() and status='PENDING');
create policy comu_application_admin on public.comu_seller_applications for update to authenticated
using(public.is_cometa_admin()) with check(public.is_cometa_admin());

-- Reuses checkout's canonical address table; serializes default selection.
create function public.comu_set_default_address_v1(p_address_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_buyer uuid;
begin
  select id into v_buyer from public.comu_buyers where user_id=auth.uid() for update;
  if v_buyer is null or not exists(select 1 from public.comu_buyer_addresses where id=p_address_id and buyer_id=v_buyer) then
    raise exception 'COMU_ADDRESS_NOT_FOUND';
  end if;
  update public.comu_buyer_addresses set is_default=(id=p_address_id),updated_at=now() where buyer_id=v_buyer;
end; $$;
revoke all on function public.comu_set_default_address_v1(uuid) from public;
grant execute on function public.comu_set_default_address_v1(uuid) to authenticated;
