-- COMU + POS Retail shared inventory core.
-- Reservations remain in pos_inventory.reserved_quantity until payment.
-- Payment commits decrement physical and reserved quantities atomically.

do $$
begin
  if exists (
    select 1 from public.pos_inventory
    where quantity < 0 or reserved_quantity < 0 or reserved_quantity > quantity
  ) then
    raise exception 'COMU_INVENTORY_LEGACY_INVARIANT_VIOLATION';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='pos_inventory_reserved_le_quantity_check' and conrelid='public.pos_inventory'::regclass) then
    alter table public.pos_inventory add constraint pos_inventory_reserved_le_quantity_check check (reserved_quantity <= quantity);
  end if;
end $$;

alter table public.pos_inventory_movements
  drop constraint if exists pos_inventory_movements_movement_type_check;
alter table public.pos_inventory_movements
  add constraint pos_inventory_movements_movement_type_check check (
    movement_type in ('initial','receipt','sale','return','adjustment','transfer_in','transfer_out','loss','comu_sale','comu_restock')
  );

create table if not exists public.comu_inventory_commit_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.comu_orders(id) on delete cascade,
  order_item_id uuid not null unique references public.comu_order_items(id) on delete cascade,
  reservation_id uuid not null references public.comu_inventory_reservations(id),
  seller_id uuid not null references public.comu_sellers(id),
  variant_id uuid not null references public.pos_product_variants(id),
  location_id uuid not null references public.pos_locations(id),
  quantity numeric(14,3) not null check (quantity > 0),
  committed_at timestamptz not null default now()
);
create index if not exists comu_inventory_commit_order_idx on public.comu_inventory_commit_items(order_id);
create index if not exists comu_inventory_commit_variant_idx on public.comu_inventory_commit_items(variant_id, location_id);

create table if not exists public.comu_inventory_restock_items (
  id uuid primary key default gen_random_uuid(),
  commit_item_id uuid not null unique references public.comu_inventory_commit_items(id) on delete cascade,
  order_id uuid not null references public.comu_orders(id) on delete cascade,
  quantity numeric(14,3) not null check (quantity > 0),
  created_at timestamptz not null default now()
);

alter table public.comu_inventory_commit_items enable row level security;
drop policy if exists comu_inventory_commit_buyer_seller on public.comu_inventory_commit_items;
create policy comu_inventory_commit_buyer_seller on public.comu_inventory_commit_items
  for select to authenticated using (
    exists (select 1 from public.comu_orders o join public.comu_buyers b on b.id=o.buyer_id where o.id=order_id and (b.user_id=auth.uid() or public.is_cometa_admin()))
    or exists (select 1 from public.comu_seller_memberships m where m.seller_id=comu_inventory_commit_items.seller_id and m.user_id=auth.uid() and m.active)
  );

create or replace function public.comu_validate_listing_integrity_v1()
returns trigger language plpgsql security definer set search_path=public as $$
declare seller public.comu_sellers%rowtype; storefront public.comu_storefronts%rowtype; product public.pos_products%rowtype;
begin
  select * into seller from public.comu_sellers where id=new.seller_id;
  select * into storefront from public.comu_storefronts where id=new.storefront_id;
  select * into product from public.pos_products where id=new.product_id;
  if not found or seller.id is null or storefront.id is null then raise exception 'COMU_LISTING_REFERENCE_INVALID'; end if;
  if storefront.seller_id is distinct from seller.id then raise exception 'COMU_LISTING_STOREFRONT_MISMATCH'; end if;
  if product.brand_id is distinct from seller.brand_id or product.brand_slug is distinct from seller.brand_slug then raise exception 'COMU_PRODUCT_BRAND_MISMATCH'; end if;
  return new;
end $$;
drop trigger if exists comu_listing_integrity_v1 on public.comu_product_listings;
create trigger comu_listing_integrity_v1 before insert or update on public.comu_product_listings
for each row execute function public.comu_validate_listing_integrity_v1();

create or replace function public.comu_validate_variant_listing_integrity_v1()
returns trigger language plpgsql security definer set search_path=public as $$
declare listing public.comu_product_listings%rowtype; variant public.pos_product_variants%rowtype;
begin
  select * into listing from public.comu_product_listings where id=new.listing_id;
  select * into variant from public.pos_product_variants where id=new.variant_id;
  if listing.id is null or variant.id is null then raise exception 'COMU_VARIANT_LISTING_REFERENCE_INVALID'; end if;
  if variant.product_id is distinct from listing.product_id or variant.brand_slug is distinct from (select brand_slug from public.comu_sellers where id=listing.seller_id) then raise exception 'COMU_VARIANT_PRODUCT_MISMATCH'; end if;
  return new;
end $$;
drop trigger if exists comu_variant_listing_integrity_v1 on public.comu_variant_listings;
create trigger comu_variant_listing_integrity_v1 before insert or update on public.comu_variant_listings
for each row execute function public.comu_validate_variant_listing_integrity_v1();

create or replace function public.comu_validate_order_item_integrity_v1()
returns trigger language plpgsql security definer set search_path=public as $$
declare listing public.comu_product_listings%rowtype; variant_listing public.comu_variant_listings%rowtype; variant public.pos_product_variants%rowtype; suborder_seller uuid;
begin
  select * into listing from public.comu_product_listings where id=new.listing_id;
  select * into variant_listing from public.comu_variant_listings where id=new.variant_listing_id;
  select * into variant from public.pos_product_variants where id=new.variant_id;
  select seller_id into suborder_seller from public.comu_order_suborders where id=new.suborder_id and order_id=new.order_id;
  if listing.id is null or variant_listing.id is null or variant.id is null or suborder_seller is null then raise exception 'COMU_ORDER_ITEM_REFERENCE_INVALID'; end if;
  if variant_listing.listing_id is distinct from listing.id or variant_listing.variant_id is distinct from variant.id or variant.product_id is distinct from listing.product_id then raise exception 'COMU_ORDER_ITEM_VARIANT_MISMATCH'; end if;
  if new.seller_id is distinct from listing.seller_id or suborder_seller is distinct from new.seller_id then raise exception 'COMU_ORDER_ITEM_SELLER_MISMATCH'; end if;
  return new;
end $$;
drop trigger if exists comu_order_item_integrity_v1 on public.comu_order_items;
create trigger comu_order_item_integrity_v1 before insert or update on public.comu_order_items
for each row execute function public.comu_validate_order_item_integrity_v1();

create or replace function public.comu_validate_order_snapshot_integrity_v1()
returns trigger language plpgsql security definer set search_path=public as $$
declare item public.comu_order_items%rowtype; seller_slug text; variant_name text;
begin
  select * into item from public.comu_order_items where id=new.order_item_id;
  select slug into seller_slug from public.comu_sellers where id=item.seller_id;
  select name into variant_name from public.pos_product_variants where id=item.variant_id;
  if item.id is null or seller_slug is null then raise exception 'COMU_ORDER_SNAPSHOT_REFERENCE_INVALID'; end if;
  if new.snapshot ? 'sellerSlug' and new.snapshot->>'sellerSlug' is distinct from seller_slug then raise exception 'COMU_ORDER_SNAPSHOT_SELLER_MISMATCH'; end if;
  if new.snapshot ? 'variant' and new.snapshot->>'variant' is distinct from variant_name then raise exception 'COMU_ORDER_SNAPSHOT_VARIANT_MISMATCH'; end if;
  return new;
end $$;
drop trigger if exists comu_order_snapshot_integrity_v1 on public.comu_order_item_snapshots;
create trigger comu_order_snapshot_integrity_v1 before insert or update on public.comu_order_item_snapshots
for each row execute function public.comu_validate_order_snapshot_integrity_v1();

create or replace function public.comu_validate_reservation_item_integrity_v1()
returns trigger language plpgsql security definer set search_path=public as $$
declare listing public.comu_product_listings%rowtype; variant_listing public.comu_variant_listings%rowtype; variant public.pos_product_variants%rowtype; seller public.comu_sellers%rowtype; inv public.pos_inventory%rowtype;
begin
  select * into listing from public.comu_product_listings where id=new.listing_id;
  select * into variant_listing from public.comu_variant_listings where id=new.variant_listing_id;
  select * into variant from public.pos_product_variants where id=new.variant_id;
  select * into seller from public.comu_sellers where id=new.seller_id;
  select * into inv from public.pos_inventory where variant_id=new.variant_id and location_id=new.location_id and brand_slug=seller.brand_slug;
  if listing.id is null or variant_listing.id is null or variant.id is null or seller.id is null or inv.id is null then raise exception 'COMU_RESERVATION_REFERENCE_INVALID'; end if;
  if listing.seller_id is distinct from seller.id or variant_listing.listing_id is distinct from listing.id or variant_listing.variant_id is distinct from variant.id or variant.product_id is distinct from listing.product_id or variant.brand_slug is distinct from seller.brand_slug then raise exception 'COMU_RESERVATION_CROSS_BRAND'; end if;
  return new;
end $$;
drop trigger if exists comu_reservation_item_integrity_v1 on public.comu_inventory_reservation_items;
create trigger comu_reservation_item_integrity_v1 before insert or update on public.comu_inventory_reservation_items
for each row execute function public.comu_validate_reservation_item_integrity_v1();

create or replace function public.comu_commit_paid_order_inventory_v1(p_order_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare o public.comu_orders%rowtype; ri record; oi public.comu_order_items%rowtype; inv public.pos_inventory%rowtype; committed integer:=0;
begin
  select * into o from public.comu_orders where id=p_order_id for update;
  if o.id is null then raise exception 'COMU_ORDER_NOT_FOUND'; end if;
  if o.status <> 'PAID' and not exists(select 1 from public.comu_inventory_commit_items where order_id=o.id) then raise exception 'COMU_ORDER_NOT_PAID'; end if;
  for ri in select * from public.comu_inventory_reservation_items where reservation_id=o.reservation_id order by id for update loop
    select * into oi from public.comu_order_items where order_id=o.id and seller_id=ri.seller_id and listing_id=ri.listing_id and variant_listing_id=ri.variant_listing_id and variant_id=ri.variant_id and quantity=ri.quantity limit 1;
    if oi.id is null then raise exception 'COMU_INVENTORY_COMMIT_ITEM_MISMATCH'; end if;
    if exists(select 1 from public.comu_inventory_commit_items where order_item_id=oi.id) then continue; end if;
    select * into inv from public.pos_inventory where variant_id=ri.variant_id and location_id=ri.location_id and brand_slug=(select brand_slug from public.comu_sellers where id=ri.seller_id) for update;
    if inv.id is null or inv.quantity < ri.quantity or inv.reserved_quantity < ri.quantity then raise exception 'COMU_INVENTORY_COMMIT_INSUFFICIENT'; end if;
    update public.pos_inventory set quantity=quantity-ri.quantity, reserved_quantity=reserved_quantity-ri.quantity, updated_at=now() where id=inv.id;
    insert into public.pos_inventory_movements(brand_id,brand_slug,location_id,variant_id,movement_type,quantity_delta,quantity_before,quantity_after,reference_type,reference_id,notes,created_by)
      values(inv.brand_id,inv.brand_slug,inv.location_id,inv.variant_id,'comu_sale',-ri.quantity,inv.quantity,inv.quantity-ri.quantity,'comu_order_item',oi.id,'COMU order '||o.order_number,null);
    insert into public.comu_inventory_commit_items(order_id,order_item_id,reservation_id,seller_id,variant_id,location_id,quantity)
      values(o.id,oi.id,o.reservation_id,ri.seller_id,ri.variant_id,ri.location_id,ri.quantity);
    committed:=committed+1;
  end loop;
  return committed;
end $$;

create or replace function public.comu_commit_paid_order_trigger_v1()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='PAID' and old.status is distinct from new.status then perform public.comu_commit_paid_order_inventory_v1(new.id); end if;
  return new;
end $$;
drop trigger if exists comu_commit_paid_order_inventory_v1 on public.comu_orders;
create trigger comu_commit_paid_order_inventory_v1 after update of status on public.comu_orders
for each row execute function public.comu_commit_paid_order_trigger_v1();

create or replace function public.comu_expire_inventory_reservations() returns integer
language plpgsql security definer set search_path=public as $$
declare v_count integer:=0; v_reservation record; v_item record; v_order public.comu_orders%rowtype;
begin
  for v_reservation in select id from public.comu_inventory_reservations where status='ACTIVE' and expires_at<=now() for update loop
    for v_item in select variant_id,location_id,quantity from public.comu_inventory_reservation_items where reservation_id=v_reservation.id loop
      update public.pos_inventory set reserved_quantity=reserved_quantity-v_item.quantity,updated_at=now() where variant_id=v_item.variant_id and location_id=v_item.location_id;
    end loop;
    update public.comu_inventory_reservations set status='EXPIRED',released_at=now(),updated_at=now() where id=v_reservation.id;
    v_count:=v_count+1;
    insert into public.comu_order_events(order_id,event_type,actor_type,payload) values(null,'RESERVATION_EXPIRED','SYSTEM',jsonb_build_object('reservationId',v_reservation.id));
    update public.comu_orders set status='EXPIRED',updated_at=now() where reservation_id=v_reservation.id and status='PAYMENT_PENDING' returning * into v_order;
    if v_order.id is not null then
      update public.comu_order_suborders set status='CANCELLED',cancelled_at=now(),updated_at=now() where order_id=v_order.id and status='PREPARING';
      insert into public.comu_order_events(order_id,event_type,actor_type,payload) values(v_order.id,'ORDER_EXPIRED','SYSTEM',jsonb_build_object('reservationId',v_reservation.id));
    end if;
  end loop;
  return v_count;
end $$;

create or replace function public.comu_release_inventory_reservation(p_reservation_id uuid,p_status text default 'RELEASED') returns public.comu_inventory_reservations
language plpgsql security definer set search_path=public as $$
declare v_reservation public.comu_inventory_reservations%rowtype; v_item record;
begin
  select * into v_reservation from public.comu_inventory_reservations where id=p_reservation_id for update;
  if not found then raise exception 'COMU_RESERVATION_NOT_FOUND'; end if;
  if auth.uid() is not null and v_reservation.buyer_id is distinct from (select id from public.comu_buyers where user_id=auth.uid()) and not public.is_cometa_admin() then raise exception 'COMU_RESERVATION_NOT_FOUND'; end if;
  if p_status not in ('RELEASED','CANCELLED') then raise exception 'COMU_RESERVATION_STATUS_INVALID'; end if;
  if v_reservation.status='COMMITTED' then raise exception 'COMU_RESERVATION_ALREADY_COMMITTED'; end if;
  if v_reservation.status in ('RELEASED','CANCELLED','EXPIRED') then return v_reservation; end if;
  for v_item in select variant_id,location_id,quantity from public.comu_inventory_reservation_items where reservation_id=p_reservation_id loop
    update public.pos_inventory set reserved_quantity=reserved_quantity-v_item.quantity,updated_at=now() where variant_id=v_item.variant_id and location_id=v_item.location_id;
  end loop;
  update public.comu_inventory_reservations set status=p_status,released_at=now(),cancelled_at=case when p_status='CANCELLED' then now() else cancelled_at end,updated_at=now() where id=p_reservation_id returning * into v_reservation;
  return v_reservation;
end $$;

create or replace function public.comu_restock_paid_order_v1(p_order_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare o public.comu_orders%rowtype; c record; inv public.pos_inventory%rowtype; n integer:=0;
begin
  select * into o from public.comu_orders where id=p_order_id for update;
  if o.id is null then raise exception 'COMU_ORDER_NOT_FOUND'; end if;
  if o.status not in ('PAID','CANCELLED','PARTIALLY_FULFILLED','COMPLETED','PARTIALLY_REFUNDED','REFUNDED') then raise exception 'COMU_ORDER_NOT_RESTOCKABLE'; end if;
  for c in select * from public.comu_inventory_commit_items where order_id=o.id order by id for update loop
    if exists(select 1 from public.comu_inventory_restock_items where commit_item_id=c.id) then continue; end if;
    select * into inv from public.pos_inventory where variant_id=c.variant_id and location_id=c.location_id for update;
    if inv.id is null then raise exception 'COMU_RESTOCK_INVENTORY_NOT_FOUND'; end if;
    update public.pos_inventory set quantity=quantity+c.quantity, updated_at=now() where id=inv.id;
    insert into public.pos_inventory_movements(brand_id,brand_slug,location_id,variant_id,movement_type,quantity_delta,quantity_before,quantity_after,reference_type,reference_id,notes,created_by)
      values(inv.brand_id,inv.brand_slug,inv.location_id,inv.variant_id,'comu_restock',c.quantity,inv.quantity,inv.quantity+c.quantity,'comu_order_restock',c.order_item_id,'COMU restock order '||o.order_number,null);
    insert into public.comu_inventory_restock_items(commit_item_id,order_id,quantity) values(c.id,o.id,c.quantity);
    n:=n+1;
  end loop;
  update public.comu_orders set status='CANCELLED',cancelled_at=coalesce(cancelled_at,now()),updated_at=now() where id=o.id and status<>'CANCELLED';
  update public.comu_order_suborders set status='CANCELLED',cancelled_at=coalesce(cancelled_at,now()),updated_at=now() where order_id=o.id and status not in ('CANCELLED','COMPLETED');
  insert into public.comu_order_events(order_id,event_type,actor_type,payload) values(o.id,'ORDER_CANCELLED','BUYER',jsonb_build_object('restockedItems',n));
  return n;
end $$;

revoke all on function public.comu_commit_paid_order_inventory_v1(uuid), public.comu_restock_paid_order_v1(uuid) from public;
grant execute on function public.comu_commit_paid_order_inventory_v1(uuid), public.comu_restock_paid_order_v1(uuid) to service_role;
