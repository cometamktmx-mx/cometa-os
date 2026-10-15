create table if not exists public.comu_inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid references public.comu_buyers(id),
  session_key text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','COMMITTED','RELEASED','EXPIRED','CANCELLED')),
  expires_at timestamptz not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  committed_at timestamptz,
  released_at timestamptz,
  cancelled_at timestamptz
);

create table if not exists public.comu_inventory_reservation_items (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.comu_inventory_reservations(id) on delete cascade,
  seller_id uuid not null references public.comu_sellers(id),
  listing_id uuid not null references public.comu_product_listings(id),
  variant_listing_id uuid not null references public.comu_variant_listings(id),
  variant_id uuid not null,
  location_id uuid not null,
  quantity numeric(14,3) not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create index if not exists comu_reservations_status_expiry_idx on public.comu_inventory_reservations(status, expires_at);
create index if not exists comu_reservation_items_variant_location_idx on public.comu_inventory_reservation_items(variant_id, location_id);

alter table public.comu_inventory_reservations enable row level security;
alter table public.comu_inventory_reservation_items enable row level security;
create policy comu_reservations_buyer on public.comu_inventory_reservations for all to authenticated using (buyer_id is not distinct from (select id from public.comu_buyers where user_id = auth.uid()) or public.is_cometa_admin()) with check (buyer_id is not distinct from (select id from public.comu_buyers where user_id = auth.uid()) or public.is_cometa_admin());
create policy comu_reservation_items_buyer on public.comu_inventory_reservation_items for select to authenticated using (exists (select 1 from public.comu_inventory_reservations r where r.id = reservation_id and (r.buyer_id is not distinct from (select id from public.comu_buyers where user_id = auth.uid()) or public.is_cometa_admin())));

create or replace function public.comu_expire_inventory_reservations() returns integer
language plpgsql security definer set search_path = public as $$
declare v_count integer; v_reservation record; v_item record;
begin
  for v_reservation in select id from public.comu_inventory_reservations where status in ('ACTIVE','COMMITTED') and expires_at <= now() for update
  loop
    for v_item in select variant_id, location_id, quantity from public.comu_inventory_reservation_items where reservation_id = v_reservation.id loop
      update public.pos_inventory set reserved_quantity = greatest(0, reserved_quantity - v_item.quantity), updated_at = now() where variant_id = v_item.variant_id and location_id = v_item.location_id;
    end loop;
    update public.comu_inventory_reservations set status = 'EXPIRED', released_at = now(), updated_at = now() where id = v_reservation.id;
  end loop;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

create or replace function public.comu_reserve_inventory(
  p_buyer_id uuid,
  p_session_key text,
  p_idempotency_key text,
  p_items jsonb
) returns public.comu_inventory_reservations
language plpgsql security definer set search_path = public as $$
declare
  v_existing public.comu_inventory_reservations%rowtype;
  v_reservation public.comu_inventory_reservations%rowtype;
  v_item jsonb;
  v_inventory public.pos_inventory%rowtype;
  v_requested numeric;
begin
  if auth.uid() is not null and (p_buyer_id is null or p_buyer_id <> (select id from public.comu_buyers where user_id = auth.uid())) then raise exception 'COMU_UNAUTHORIZED'; end if;
  select * into v_existing from public.comu_inventory_reservations where idempotency_key = p_idempotency_key;
  if found then return v_existing; end if;
  perform public.comu_expire_inventory_reservations();
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'COMU_RESERVATION_ITEMS_REQUIRED'; end if;
  insert into public.comu_inventory_reservations(buyer_id, session_key, idempotency_key, expires_at)
  values (p_buyer_id, p_session_key, p_idempotency_key, now() + interval '15 minutes') returning * into v_reservation;
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_requested := (v_item->>'quantity')::numeric;
    if v_requested <= 0 then raise exception 'COMU_INVALID_QUANTITY'; end if;
    perform 1 from public.comu_product_listings l join public.comu_variant_listings vl on vl.listing_id = l.id join public.comu_sellers s on s.id = l.seller_id join public.comu_storefronts sf on sf.id = l.storefront_id where l.id = (v_item->>'listing_id')::uuid and vl.id = (v_item->>'variant_listing_id')::uuid and vl.variant_id = (v_item->>'variant_id')::uuid and vl.enabled and l.status = 'PUBLISHED' and s.id = (v_item->>'seller_id')::uuid and s.status = 'ACTIVE' and s.verification_status = 'VERIFIED' and sf.status in ('PUBLISHED','ACTIVE');
    if not found then raise exception 'COMU_LISTING_UNAVAILABLE'; end if;
    select * into v_inventory from public.pos_inventory where variant_id = (v_item->>'variant_id')::uuid and location_id = (v_item->>'location_id')::uuid for update;
    if not found then raise exception 'COMU_INSUFFICIENT_STOCK'; end if;
    if v_inventory.quantity - v_inventory.reserved_quantity < v_requested then raise exception 'COMU_INSUFFICIENT_STOCK'; end if;
    insert into public.comu_inventory_reservation_items(reservation_id,seller_id,listing_id,variant_listing_id,variant_id,location_id,quantity)
    values (v_reservation.id,(v_item->>'seller_id')::uuid,(v_item->>'listing_id')::uuid,(v_item->>'variant_listing_id')::uuid,v_inventory.variant_id,v_inventory.location_id,v_requested);
    update public.pos_inventory set reserved_quantity = reserved_quantity + v_requested, updated_at = now() where id = v_inventory.id;
  end loop;
  return v_reservation;
exception when others then
  if v_reservation.id is not null then delete from public.comu_inventory_reservations where id = v_reservation.id; end if;
  raise;
end; $$;

create or replace function public.comu_release_inventory_reservation(p_reservation_id uuid, p_status text default 'RELEASED') returns public.comu_inventory_reservations
language plpgsql security definer set search_path = public as $$
declare v_reservation public.comu_inventory_reservations%rowtype;
  v_item record;
begin
  select * into v_reservation from public.comu_inventory_reservations where id = p_reservation_id for update;
  if not found then raise exception 'COMU_RESERVATION_NOT_FOUND'; end if;
  if auth.uid() is not null and v_reservation.buyer_id is distinct from (select id from public.comu_buyers where user_id = auth.uid()) and not public.is_cometa_admin() then raise exception 'COMU_RESERVATION_NOT_FOUND'; end if;
  if p_status not in ('RELEASED','CANCELLED') then raise exception 'COMU_RESERVATION_STATUS_INVALID'; end if;
  if v_reservation.status in ('RELEASED','CANCELLED','EXPIRED') then return v_reservation; end if;
  for v_item in select variant_id, location_id, quantity from public.comu_inventory_reservation_items where reservation_id = p_reservation_id loop
    update public.pos_inventory set reserved_quantity = greatest(0, reserved_quantity - v_item.quantity), updated_at = now() where variant_id = v_item.variant_id and location_id = v_item.location_id;
  end loop;
  update public.comu_inventory_reservations set status = p_status, released_at = now(), cancelled_at = case when p_status = 'CANCELLED' then now() else cancelled_at end, updated_at = now() where id = p_reservation_id returning * into v_reservation;
  return v_reservation;
end; $$;

revoke all on function public.comu_reserve_inventory(uuid,text,text,jsonb) from public;
grant execute on function public.comu_reserve_inventory(uuid,text,text,jsonb) to authenticated;
revoke all on function public.comu_release_inventory_reservation(uuid,text) from public;
grant execute on function public.comu_release_inventory_reservation(uuid,text) to authenticated;
