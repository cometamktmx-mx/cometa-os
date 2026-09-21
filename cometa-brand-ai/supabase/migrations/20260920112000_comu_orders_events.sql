create table if not exists public.comu_orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  buyer_id uuid not null references public.comu_buyers(id),
  status text not null default 'PAYMENT_PENDING' check (status in ('PAYMENT_PENDING','PAID','PARTIALLY_FULFILLED','COMPLETED','CANCELLED','EXPIRED','PARTIALLY_REFUNDED','REFUNDED','DISPUTED')),
  currency text not null default 'MXN',
  subtotal numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0,
  shipping_total numeric(14,2) not null default 0,
  points_total numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  reservation_id uuid not null references public.comu_inventory_reservations(id),
  shipping_address_snapshot jsonb,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz
);

create table if not exists public.comu_order_suborders (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.comu_orders(id) on delete cascade,
  seller_id uuid not null references public.comu_sellers(id),
  status text not null default 'PREPARING' check (status in ('PREPARING','CANCELLED','AT_HUB','CONSOLIDATING','READY_FOR_CARRIER','SHIPPED','DELIVERED','GUARANTEE_WINDOW','COMPLETED')),
  subtotal numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0,
  shipping_total numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  unique(order_id, seller_id)
);

create table if not exists public.comu_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.comu_orders(id) on delete cascade,
  suborder_id uuid not null references public.comu_order_suborders(id) on delete cascade,
  seller_id uuid not null references public.comu_sellers(id),
  listing_id uuid not null,
  variant_listing_id uuid not null,
  product_id uuid not null,
  variant_id uuid not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  subtotal numeric(14,2) not null check (subtotal >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.comu_order_item_snapshots (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null unique references public.comu_order_items(id) on delete cascade,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.comu_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.comu_orders(id) on delete cascade,
  suborder_id uuid references public.comu_order_suborders(id),
  event_type text not null,
  actor_type text not null,
  actor_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists comu_orders_buyer_idx on public.comu_orders(buyer_id, created_at desc);
create index if not exists comu_suborders_seller_idx on public.comu_order_suborders(seller_id, created_at desc);
create index if not exists comu_order_items_order_idx on public.comu_order_items(order_id);
create index if not exists comu_order_events_order_idx on public.comu_order_events(order_id, created_at);

alter table public.comu_orders enable row level security;
alter table public.comu_order_suborders enable row level security;
alter table public.comu_order_items enable row level security;
alter table public.comu_order_item_snapshots enable row level security;
alter table public.comu_order_events enable row level security;

create policy comu_orders_buyer on public.comu_orders for select to authenticated using (exists (select 1 from public.comu_buyers b where b.id = buyer_id and (b.user_id = auth.uid() or public.is_cometa_admin())));
create policy comu_suborders_buyer_seller on public.comu_order_suborders for select to authenticated using (exists (select 1 from public.comu_orders o join public.comu_buyers b on b.id=o.buyer_id where o.id=order_id and (b.user_id=auth.uid() or public.is_cometa_admin())) or exists (select 1 from public.comu_seller_memberships m where m.seller_id = comu_order_suborders.seller_id and m.user_id=auth.uid() and m.active) );
create policy comu_order_items_buyer_seller on public.comu_order_items for select to authenticated using (exists (select 1 from public.comu_order_suborders so where so.id=suborder_id and (exists (select 1 from public.comu_seller_memberships m where m.seller_id=so.seller_id and m.user_id=auth.uid() and m.active) or public.is_cometa_admin())) or exists (select 1 from public.comu_orders o join public.comu_buyers b on b.id=o.buyer_id where o.id=order_id and (b.user_id=auth.uid() or public.is_cometa_admin())));
create policy comu_snapshots_buyer_seller on public.comu_order_item_snapshots for select to authenticated using (exists (select 1 from public.comu_order_items i where i.id=order_item_id and (exists (select 1 from public.comu_seller_memberships m where m.seller_id=i.seller_id and m.user_id=auth.uid() and m.active) or exists (select 1 from public.comu_orders o join public.comu_buyers b on b.id=o.buyer_id where o.id=i.order_id and (b.user_id=auth.uid() or public.is_cometa_admin())))));
create policy comu_events_buyer_seller on public.comu_order_events for select to authenticated using (exists (select 1 from public.comu_orders o join public.comu_buyers b on b.id=o.buyer_id where o.id=order_id and (b.user_id=auth.uid() or public.is_cometa_admin())) or exists (select 1 from public.comu_order_suborders so join public.comu_seller_memberships m on m.seller_id=so.seller_id where so.id=suborder_id and m.user_id=auth.uid() and m.active));

create or replace function public.comu_create_order_from_reservation(p_reservation_id uuid, p_idempotency_key text, p_shipping_address_snapshot jsonb, p_currency text default 'MXN') returns public.comu_orders
language plpgsql security definer set search_path = public as $$
declare v_res public.comu_inventory_reservations%rowtype; v_order public.comu_orders%rowtype; v_item record; v_suborder public.comu_order_suborders%rowtype; v_subtotal numeric := 0; v_price numeric; v_order_item public.comu_order_items%rowtype; v_suborder_ids jsonb := '{}'::jsonb;
begin
  select * into v_order from public.comu_orders where idempotency_key=p_idempotency_key;
  if found then return v_order; end if;
  select * into v_res from public.comu_inventory_reservations where id=p_reservation_id for update;
  if not found or (auth.uid() is not null and v_res.buyer_id is distinct from (select id from public.comu_buyers where user_id=auth.uid())) then raise exception 'COMU_RESERVATION_NOT_FOUND'; end if;
  if v_res.status <> 'ACTIVE' or v_res.expires_at <= now() then raise exception 'COMU_RESERVATION_EXPIRED'; end if;
  insert into public.comu_orders(buyer_id,status,currency,reservation_id,shipping_address_snapshot,idempotency_key)
  values(v_res.buyer_id,'PAYMENT_PENDING',p_currency,p_reservation_id,p_shipping_address_snapshot,p_idempotency_key) returning * into v_order;
  for v_item in select ri.*, l.product_id, l.title_override, l.description_override, l.public_slug, s.public_name seller_name, s.slug seller_slug, sf.name storefront_name, p.name product_name, p.description product_description, p.image_url product_image, v.name variant_name, v.sku variant_sku, v.attributes variant_attributes, coalesce(vl.price_override, l.retail_price_override, v.price, 0) effective_price from public.comu_inventory_reservation_items ri join public.comu_product_listings l on l.id=ri.listing_id join public.comu_variant_listings vl on vl.id=ri.variant_listing_id join public.comu_sellers s on s.id=ri.seller_id join public.comu_storefronts sf on sf.id=l.storefront_id join public.pos_products p on p.id=l.product_id join public.pos_product_variants v on v.id=ri.variant_id where ri.reservation_id=p_reservation_id
  loop
    v_price := v_item.effective_price; v_subtotal := round(v_price * v_item.quantity, 2);
    if not (v_suborder_ids ? v_item.seller_id::text) then
      insert into public.comu_order_suborders(order_id,seller_id) values(v_order.id,v_item.seller_id) returning * into v_suborder;
      v_suborder_ids := v_suborder_ids || jsonb_build_object(v_item.seller_id::text,v_suborder.id::text);
    else select * into v_suborder from public.comu_order_suborders where order_id=v_order.id and seller_id=v_item.seller_id; end if;
    insert into public.comu_order_items(order_id,suborder_id,seller_id,listing_id,variant_listing_id,product_id,variant_id,quantity,unit_price,subtotal) values(v_order.id,v_suborder.id,v_item.seller_id,v_item.listing_id,v_item.variant_listing_id,v_item.product_id,v_item.variant_id,v_item.quantity,v_price,v_subtotal) returning * into v_order_item;
    insert into public.comu_order_item_snapshots(order_item_id,snapshot) values(v_order_item.id,jsonb_build_object('productTitle',v_item.product_name,'listingTitle',coalesce(v_item.title_override,v_item.product_name),'description',coalesce(v_item.description_override,v_item.product_description),'sellerName',v_item.seller_name,'sellerSlug',v_item.seller_slug,'storefront',v_item.storefront_name,'sku',v_item.variant_sku,'variant',v_item.variant_name,'attributes',v_item.variant_attributes,'image',v_item.product_image,'price',v_price,'quantity',v_item.quantity,'mode','RETAIL','productSlug',v_item.public_slug));
    update public.comu_order_suborders set subtotal=subtotal+v_subtotal,grand_total=grand_total+v_subtotal,updated_at=now() where id=v_suborder.id;
    v_subtotal := 0;
  end loop;
  select coalesce(sum(subtotal),0) into v_subtotal from public.comu_order_suborders where order_id=v_order.id;
  update public.comu_orders set subtotal=v_subtotal,grand_total=v_subtotal,updated_at=now() where id=v_order.id returning * into v_order;
  update public.comu_inventory_reservations set status='COMMITTED',committed_at=now(),updated_at=now() where id=p_reservation_id;
  insert into public.comu_order_events(order_id,event_type,actor_type,actor_id,payload) values(v_order.id,'ORDER_CREATED','BUYER',auth.uid(),jsonb_build_object('reservationId',p_reservation_id)),(v_order.id,'RESERVATION_COMMITTED','BUYER',auth.uid(),'{}'::jsonb);
  return v_order;
exception when others then
  if v_order.id is not null then delete from public.comu_orders where id=v_order.id; end if;
  raise;
end; $$;

create or replace function public.comu_cancel_order(p_order_id uuid) returns public.comu_orders
language plpgsql security definer set search_path = public as $$
declare v_order public.comu_orders%rowtype;
begin
  select o.* into v_order from public.comu_orders o join public.comu_buyers b on b.id=o.buyer_id where o.id=p_order_id and (auth.uid() is null or b.user_id=auth.uid() or public.is_cometa_admin()) for update;
  if not found then raise exception 'COMU_ORDER_NOT_FOUND'; end if;
  if v_order.status = 'CANCELLED' then return v_order; end if;
  if v_order.status <> 'PAYMENT_PENDING' then raise exception 'COMU_ORDER_NOT_CANCELLABLE'; end if;
  update public.comu_orders set status='CANCELLED',cancelled_at=now(),updated_at=now() where id=p_order_id returning * into v_order;
  perform public.comu_release_inventory_reservation(v_order.reservation_id,'CANCELLED');
  update public.comu_order_suborders set status='CANCELLED',cancelled_at=now(),updated_at=now() where order_id=p_order_id;
  insert into public.comu_order_events(order_id,event_type,actor_type,actor_id) values(p_order_id,'ORDER_CANCELLED','BUYER',auth.uid());
  return v_order;
end; $$;

revoke all on function public.comu_create_order_from_reservation(uuid,text,jsonb,text) from public;
grant execute on function public.comu_create_order_from_reservation(uuid,text,jsonb,text) to authenticated;
revoke all on function public.comu_cancel_order(uuid) from public;
grant execute on function public.comu_cancel_order(uuid) to authenticated;
