-- COMU Day 2.5 correction: reservation lifecycle events and PAYMENT_PENDING expiry.
-- Reservation events exist before an order exists, so order_id is intentionally nullable.
alter table if exists public.comu_order_events
  alter column order_id drop not null;

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
    if not found or v_inventory.quantity - v_inventory.reserved_quantity < v_requested then raise exception 'COMU_INSUFFICIENT_STOCK'; end if;
    insert into public.comu_inventory_reservation_items(reservation_id,seller_id,listing_id,variant_listing_id,variant_id,location_id,quantity)
    values (v_reservation.id,(v_item->>'seller_id')::uuid,(v_item->>'listing_id')::uuid,(v_item->>'variant_listing_id')::uuid,v_inventory.variant_id,v_inventory.location_id,v_requested);
    update public.pos_inventory set reserved_quantity = reserved_quantity + v_requested, updated_at = now() where id = v_inventory.id;
  end loop;
  insert into public.comu_order_events(order_id,event_type,actor_type,actor_id,payload)
  values (null,'RESERVATION_CREATED','BUYER',auth.uid(),jsonb_build_object('reservationId',v_reservation.id,'idempotencyKey',p_idempotency_key));
  return v_reservation;
exception when others then
  if v_reservation.id is not null then delete from public.comu_inventory_reservations where id = v_reservation.id; end if;
  raise;
end; $$;

create or replace function public.comu_expire_inventory_reservations() returns integer
language plpgsql security definer set search_path = public as $$
declare v_count integer := 0; v_reservation record; v_item record; v_order public.comu_orders%rowtype;
begin
  for v_reservation in select id from public.comu_inventory_reservations where status in ('ACTIVE','COMMITTED') and expires_at <= now() for update
  loop
    for v_item in select variant_id, location_id, quantity from public.comu_inventory_reservation_items where reservation_id = v_reservation.id loop
      update public.pos_inventory set reserved_quantity = greatest(0, reserved_quantity - v_item.quantity), updated_at = now() where variant_id = v_item.variant_id and location_id = v_item.location_id;
    end loop;
    update public.comu_inventory_reservations set status = 'EXPIRED', released_at = now(), updated_at = now() where id = v_reservation.id;
    v_count := v_count + 1;
    insert into public.comu_order_events(order_id,event_type,actor_type,payload)
    values (null,'RESERVATION_EXPIRED','SYSTEM',jsonb_build_object('reservationId',v_reservation.id));
    update public.comu_orders set status='EXPIRED', updated_at=now() where reservation_id=v_reservation.id and status='PAYMENT_PENDING' returning * into v_order;
    if v_order.id is not null then
      update public.comu_order_suborders set status='CANCELLED', cancelled_at=now(), updated_at=now() where order_id=v_order.id and status='PREPARING';
      insert into public.comu_order_events(order_id,event_type,actor_type,payload)
      values (v_order.id,'ORDER_EXPIRED','SYSTEM',jsonb_build_object('reservationId',v_reservation.id));
    end if;
  end loop;
  return v_count;
end; $$;

revoke all on function public.comu_reserve_inventory(uuid,text,text,jsonb) from public;
grant execute on function public.comu_reserve_inventory(uuid,text,text,jsonb) to authenticated;
revoke all on function public.comu_expire_inventory_reservations() from public;
grant execute on function public.comu_expire_inventory_reservations() to authenticated;
