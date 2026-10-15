-- COMU Wholesale Core V1: additive policy, tier and corrida primitives.
create table if not exists public.comu_storefront_wholesale_policies (
  id uuid primary key default gen_random_uuid(),
  storefront_id uuid not null unique references public.comu_storefronts(id) on delete cascade,
  enabled boolean not null default false,
  minimum_quantity numeric(14,3) not null default 6 check (minimum_quantity > 0),
  allow_product_mix boolean not null default false,
  allow_variant_mix boolean not null default true,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comu_wholesale_tiers (
  id uuid primary key default gen_random_uuid(),
  storefront_id uuid not null references public.comu_storefronts(id) on delete cascade,
  product_id uuid references public.pos_products(id) on delete cascade,
  min_quantity numeric(14,3) not null check (min_quantity > 0),
  pricing_mode text not null check (pricing_mode in ('UNIT_PRICE','AMOUNT_OFF','PERCENT_OFF')),
  value numeric(14,2) not null check (value >= 0 and (pricing_mode <> 'PERCENT_OFF' or value <= 100)),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storefront_id, product_id, min_quantity)
);

create table if not exists public.comu_product_wholesale_overrides (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null unique references public.comu_product_listings(id) on delete cascade,
  mode text not null default 'STORE' check (mode in ('STORE','CUSTOM','DISABLED')),
  allow_product_mix boolean,
  allow_variant_mix boolean,
  corrida_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comu_product_runs (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null unique references public.comu_product_listings(id) on delete cascade,
  name text not null default 'Corrida',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comu_product_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.comu_product_runs(id) on delete cascade,
  variant_listing_id uuid not null references public.comu_variant_listings(id) on delete cascade,
  variant_id uuid not null references public.pos_product_variants(id),
  quantity_per_run numeric(14,3) not null check (quantity_per_run > 0),
  unique (run_id, variant_id)
);

alter table public.comu_cart_items add column if not exists purchase_mode text not null default 'PIECES' check (purchase_mode in ('PIECES','RUN'));
alter table public.comu_cart_items add column if not exists run_id uuid references public.comu_product_runs(id);
alter table public.comu_cart_items add column if not exists run_count numeric(14,3) not null default 1 check (run_count > 0);
alter table public.comu_inventory_reservation_items add column if not exists pricing_snapshot jsonb;
alter table public.comu_product_wholesale_overrides add column if not exists allow_pieces boolean not null default true;
alter table public.comu_product_wholesale_overrides add column if not exists allow_run boolean not null default false;

create index if not exists comu_wholesale_tiers_lookup_idx on public.comu_wholesale_tiers(storefront_id, product_id, active, min_quantity desc);
create index if not exists comu_run_items_run_idx on public.comu_product_run_items(run_id);

create or replace function public.comu_validate_wholesale_tier_v1() returns trigger language plpgsql security definer set search_path=public as $$
declare sf public.comu_storefronts%rowtype; seller public.comu_sellers%rowtype; product public.pos_products%rowtype;
begin
  if new.product_id is null then return new; end if;
  select * into sf from public.comu_storefronts where id=new.storefront_id;
  select * into seller from public.comu_sellers where id=sf.seller_id;
  select * into product from public.pos_products where id=new.product_id;
  if not found or product.brand_id::text is distinct from seller.brand_id::text then raise exception 'COMU_WHOLESALE_BRAND_MISMATCH'; end if;
  return new;
end; $$;
drop trigger if exists comu_wholesale_tier_integrity_v1 on public.comu_wholesale_tiers;
create trigger comu_wholesale_tier_integrity_v1 before insert or update on public.comu_wholesale_tiers for each row execute function public.comu_validate_wholesale_tier_v1();

alter table public.comu_storefront_wholesale_policies enable row level security;
alter table public.comu_wholesale_tiers enable row level security;
alter table public.comu_product_wholesale_overrides enable row level security;
alter table public.comu_product_runs enable row level security;
alter table public.comu_product_run_items enable row level security;

drop policy if exists comu_wholesale_policy_member on public.comu_storefront_wholesale_policies;
create policy comu_wholesale_policy_member on public.comu_storefront_wholesale_policies for all to authenticated using (public.is_cometa_admin() or exists (select 1 from public.comu_storefronts sf join public.comu_sellers s on s.id=sf.seller_id join public.comu_seller_memberships m on m.seller_id=s.id where sf.id=storefront_id and m.user_id=auth.uid() and m.active and m.role in ('OWNER','ADMIN','CATALOG_MANAGER'))) with check (public.is_cometa_admin() or exists (select 1 from public.comu_storefronts sf join public.comu_sellers s on s.id=sf.seller_id join public.comu_seller_memberships m on m.seller_id=s.id where sf.id=storefront_id and m.user_id=auth.uid() and m.active and m.role in ('OWNER','ADMIN','CATALOG_MANAGER')));
drop policy if exists comu_wholesale_tiers_member on public.comu_wholesale_tiers;
create policy comu_wholesale_tiers_member on public.comu_wholesale_tiers for all to authenticated using (public.is_cometa_admin() or exists (select 1 from public.comu_storefronts sf join public.comu_sellers s on s.id=sf.seller_id join public.comu_seller_memberships m on m.seller_id=s.id where sf.id=storefront_id and m.user_id=auth.uid() and m.active and m.role in ('OWNER','ADMIN','CATALOG_MANAGER'))) with check (public.is_cometa_admin() or exists (select 1 from public.comu_storefronts sf join public.comu_sellers s on s.id=sf.seller_id join public.comu_seller_memberships m on m.seller_id=s.id where sf.id=storefront_id and m.user_id=auth.uid() and m.active and m.role in ('OWNER','ADMIN','CATALOG_MANAGER')));

-- Validate corrida composition cannot cross listing/product/brand boundaries.
create or replace function public.comu_validate_run_item_v1() returns trigger language plpgsql security definer set search_path=public as $$
declare r public.comu_product_runs%rowtype; vl public.comu_variant_listings%rowtype; l public.comu_product_listings%rowtype; v public.pos_product_variants%rowtype;
begin
  select * into r from public.comu_product_runs where id=new.run_id;
  select * into vl from public.comu_variant_listings where id=new.variant_listing_id;
  select * into l from public.comu_product_listings where id=r.listing_id;
  select * into v from public.pos_product_variants where id=new.variant_id;
  if not found or vl.listing_id is distinct from r.listing_id or vl.variant_id is distinct from new.variant_id or v.product_id is distinct from l.product_id then raise exception 'COMU_RUN_INTEGRITY'; end if;
  return new;
end; $$;
drop trigger if exists comu_run_item_integrity_v1 on public.comu_product_run_items;
create trigger comu_run_item_integrity_v1 before insert or update on public.comu_product_run_items for each row execute function public.comu_validate_run_item_v1();

-- Preserve pricing at reservation time and make order creation use that snapshot.
create or replace function public.comu_reserve_inventory(p_buyer_id uuid,p_session_key text,p_idempotency_key text,p_items jsonb) returns public.comu_inventory_reservations language plpgsql security definer set search_path=public as $$
declare v_existing public.comu_inventory_reservations%rowtype; v_reservation public.comu_inventory_reservations%rowtype; v_item jsonb; v_inventory public.pos_inventory%rowtype; v_requested numeric;
begin
  if auth.uid() is not null and (p_buyer_id is null or p_buyer_id <> (select id from public.comu_buyers where user_id=auth.uid())) then raise exception 'COMU_UNAUTHORIZED'; end if;
  select * into v_existing from public.comu_inventory_reservations where idempotency_key=p_idempotency_key; if found then return v_existing; end if;
  perform public.comu_expire_inventory_reservations();
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'COMU_RESERVATION_ITEMS_REQUIRED'; end if;
  insert into public.comu_inventory_reservations(buyer_id,session_key,idempotency_key,expires_at) values(p_buyer_id,p_session_key,p_idempotency_key,now()+interval '15 minutes') returning * into v_reservation;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_requested := (v_item->>'quantity')::numeric; if v_requested <= 0 then raise exception 'COMU_INVALID_QUANTITY'; end if;
    perform 1 from public.comu_product_listings l join public.comu_variant_listings vl on vl.listing_id=l.id join public.comu_sellers s on s.id=l.seller_id join public.comu_storefronts sf on sf.id=l.storefront_id where l.id=(v_item->>'listing_id')::uuid and vl.id=(v_item->>'variant_listing_id')::uuid and vl.variant_id=(v_item->>'variant_id')::uuid and vl.enabled and l.status='PUBLISHED' and s.id=(v_item->>'seller_id')::uuid and s.status='ACTIVE' and s.verification_status='VERIFIED' and sf.status in ('PUBLISHED','ACTIVE');
    if not found then raise exception 'COMU_LISTING_UNAVAILABLE'; end if;
    select * into v_inventory from public.pos_inventory where variant_id=(v_item->>'variant_id')::uuid and location_id=(v_item->>'location_id')::uuid for update;
    if not found or v_inventory.quantity-v_inventory.reserved_quantity < v_requested then raise exception 'COMU_INSUFFICIENT_STOCK'; end if;
    insert into public.comu_inventory_reservation_items(reservation_id,seller_id,listing_id,variant_listing_id,variant_id,location_id,quantity,pricing_snapshot) values(v_reservation.id,(v_item->>'seller_id')::uuid,(v_item->>'listing_id')::uuid,(v_item->>'variant_listing_id')::uuid,v_inventory.variant_id,v_inventory.location_id,v_requested,nullif(v_item->'pricing_snapshot','null'));
    update public.pos_inventory set reserved_quantity=reserved_quantity+v_requested,updated_at=now() where id=v_inventory.id;
  end loop; return v_reservation;
exception when others then if v_reservation.id is not null then delete from public.comu_inventory_reservations where id=v_reservation.id; end if; raise; end; $$;

revoke all on function public.comu_reserve_inventory(uuid,text,text,jsonb) from public;
grant execute on function public.comu_reserve_inventory(uuid,text,text,jsonb) to authenticated;

create or replace function public.comu_create_order_from_reservation(p_reservation_id uuid, p_idempotency_key text, p_shipping_address_snapshot jsonb, p_currency text default 'MXN') returns public.comu_orders
language plpgsql security definer set search_path=public as $$
declare v_res public.comu_inventory_reservations%rowtype; v_order public.comu_orders%rowtype; v_item record; v_suborder public.comu_order_suborders%rowtype; v_subtotal numeric:=0; v_price numeric; v_order_item public.comu_order_items%rowtype; v_suborder_ids jsonb:='{}'::jsonb;
begin
  select * into v_order from public.comu_orders where idempotency_key=p_idempotency_key; if found then return v_order; end if;
  select * into v_res from public.comu_inventory_reservations where id=p_reservation_id for update;
  if not found or (auth.uid() is not null and v_res.buyer_id is distinct from (select id from public.comu_buyers where user_id=auth.uid())) then raise exception 'COMU_RESERVATION_NOT_FOUND'; end if;
  if v_res.status <> 'ACTIVE' or v_res.expires_at <= now() then raise exception 'COMU_RESERVATION_EXPIRED'; end if;
  insert into public.comu_orders(buyer_id,status,currency,reservation_id,shipping_address_snapshot,idempotency_key) values(v_res.buyer_id,'PAYMENT_PENDING',p_currency,p_reservation_id,p_shipping_address_snapshot,p_idempotency_key) returning * into v_order;
  for v_item in select ri.*,l.product_id,l.title_override,l.description_override,l.public_slug,s.public_name seller_name,s.slug seller_slug,sf.name storefront_name,p.name product_name,p.description product_description,p.image_url product_image,v.name variant_name,v.sku variant_sku,v.attributes variant_attributes,coalesce((ri.pricing_snapshot->>'finalUnitPrice')::numeric,vl.price_override,l.retail_price_override,v.price,0) effective_price from public.comu_inventory_reservation_items ri join public.comu_product_listings l on l.id=ri.listing_id join public.comu_variant_listings vl on vl.id=ri.variant_listing_id join public.comu_sellers s on s.id=ri.seller_id join public.comu_storefronts sf on sf.id=l.storefront_id join public.pos_products p on p.id=l.product_id join public.pos_product_variants v on v.id=ri.variant_id where ri.reservation_id=p_reservation_id loop
    v_price:=v_item.effective_price; v_subtotal:=round(v_price*v_item.quantity,2);
    if not (v_suborder_ids ? v_item.seller_id::text) then insert into public.comu_order_suborders(order_id,seller_id) values(v_order.id,v_item.seller_id) returning * into v_suborder; v_suborder_ids:=v_suborder_ids||jsonb_build_object(v_item.seller_id::text,v_suborder.id::text); else select * into v_suborder from public.comu_order_suborders where order_id=v_order.id and seller_id=v_item.seller_id; end if;
    insert into public.comu_order_items(order_id,suborder_id,seller_id,listing_id,variant_listing_id,product_id,variant_id,quantity,unit_price,subtotal) values(v_order.id,v_suborder.id,v_item.seller_id,v_item.listing_id,v_item.variant_listing_id,v_item.product_id,v_item.variant_id,v_item.quantity,v_price,v_subtotal) returning * into v_order_item;
    insert into public.comu_order_item_snapshots(order_item_id,snapshot) values(v_order_item.id,jsonb_build_object('productTitle',v_item.product_name,'listingTitle',coalesce(v_item.title_override,v_item.product_name),'description',coalesce(v_item.description_override,v_item.product_description),'sellerName',v_item.seller_name,'sellerSlug',v_item.seller_slug,'storefront',v_item.storefront_name,'sku',v_item.variant_sku,'variant',v_item.variant_name,'attributes',v_item.variant_attributes,'image',v_item.product_image,'price',v_price,'quantity',v_item.quantity,'mode',coalesce(v_item.pricing_snapshot->>'mode','RETAIL'),'pricing',v_item.pricing_snapshot,'productSlug',v_item.public_slug));
    update public.comu_order_suborders set subtotal=subtotal+v_subtotal,grand_total=grand_total+v_subtotal,updated_at=now() where id=v_suborder.id; v_subtotal:=0;
  end loop;
  select coalesce(sum(subtotal),0) into v_subtotal from public.comu_order_suborders where order_id=v_order.id;
  update public.comu_orders set subtotal=v_subtotal,grand_total=v_subtotal,updated_at=now() where id=v_order.id returning * into v_order;
  update public.comu_inventory_reservations set status='COMMITTED',committed_at=now(),updated_at=now() where id=p_reservation_id;
  insert into public.comu_order_events(order_id,event_type,actor_type,actor_id,payload) values(v_order.id,'ORDER_CREATED','BUYER',auth.uid(),jsonb_build_object('reservationId',p_reservation_id)),(v_order.id,'RESERVATION_COMMITTED','BUYER',auth.uid(),'{}'::jsonb);
  return v_order;
exception when others then if v_order.id is not null then delete from public.comu_orders where id=v_order.id; end if; raise; end; $$;
revoke all on function public.comu_create_order_from_reservation(uuid,text,jsonb,text) from public;
grant execute on function public.comu_create_order_from_reservation(uuid,text,jsonb,text) to authenticated;
