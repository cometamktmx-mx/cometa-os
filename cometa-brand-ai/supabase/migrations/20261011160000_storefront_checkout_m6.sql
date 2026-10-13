begin;
-- Operational configuration is deliberately absent by default. It does not enable A1.
-- No client grants: a reviewed server-side configuration/provisioning step is required.
create table public.store_checkout_configuration (
 brand_id uuid primary key references public.brands(id),
 location_id uuid not null references public.pos_locations(id),
 pricing_policy text not null check(pricing_policy='RETAIL_GROSS'),
 currency text not null check(currency in ('MXN','USD','EUR')),
 stripe_account_ref text not null check(length(stripe_account_ref)>0),
 reviewed_at timestamptz not null, reviewed_by uuid not null references auth.users(id)
);
create table public.store_shipping_quotes (
 id uuid primary key default gen_random_uuid(),brand_id uuid not null references public.brands(id),
 owner_hash text not null,request_hash text not null,location_id uuid not null references public.pos_locations(id),
 currency text not null,amount_cents bigint not null check(amount_cents>=0),
 provider text not null,provider_reference text not null,verified_at timestamptz not null,expires_at timestamptz not null,
 check(expires_at>verified_at)
);
create table public.store_orders (
 id uuid primary key default gen_random_uuid(),brand_id uuid not null references public.brands(id),
 location_id uuid not null references public.pos_locations(id),owner_hash text not null,
 attempt_id uuid not null,request jsonb not null,contact jsonb not null,
 status text not null default 'PENDING' check(status in ('PENDING','PAID','CANCELLED','EXPIRED','PAYMENT_REVIEW')),
 currency text not null,subtotal_cents bigint not null,shipping_cents bigint not null,total_cents bigint not null,
 shipping_quote_id uuid not null unique references public.store_shipping_quotes(id),
 stripe_account_ref text not null,stripe_session_id text unique,payment_intent_id text unique,
 created_at timestamptz not null default now(),expires_at timestamptz not null,paid_at timestamptz,
 unique(brand_id,attempt_id),check(total_cents=subtotal_cents+shipping_cents and total_cents>0),check(owner_hash ~ '^[0-9a-f]{64}$')
);
create unique index store_one_pending_owner on public.store_orders(brand_id,owner_hash) where status='PENDING';
create table public.store_order_items (
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.store_orders(id),
 product_id uuid not null references public.pos_products(id),variant_id uuid not null references public.pos_product_variants(id),
 quantity integer not null check(quantity between 1 and 99),unit_cents bigint not null check(unit_cents>=0),
 snapshot jsonb not null,unique(order_id,variant_id)
);
create table public.store_payment_events (
 event_id text primary key,order_id uuid not null references public.store_orders(id),
 kind text not null,received_at timestamptz not null default now()
);
create table public.store_order_inventory_effects (
 order_id uuid not null references public.store_orders(id),variant_id uuid not null references public.pos_product_variants(id),
 effect text not null check(effect in ('RESERVE','RELEASE','SALE')),quantity integer not null check(quantity>0),
 created_at timestamptz not null default now(),primary key(order_id,variant_id,effect)
);
alter table public.store_checkout_configuration enable row level security;
alter table public.store_shipping_quotes enable row level security;
alter table public.store_orders enable row level security;
alter table public.store_order_items enable row level security;
alter table public.store_payment_events enable row level security;
alter table public.store_order_inventory_effects enable row level security;
revoke all on public.store_checkout_configuration,public.store_shipping_quotes,public.store_orders,public.store_order_items,public.store_payment_events,public.store_order_inventory_effects from public,anon,authenticated,service_role;
grant select on public.store_checkout_configuration,public.store_shipping_quotes,public.store_orders,public.store_order_items to service_role;
-- Quotes/configuration cannot be fabricated from a public request. No pricing/shipping admin is introduced here.

create function public.store_cart_m6(p_brand text,p_lines jsonb) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare home jsonb; c record; x jsonb; d jsonb; v jsonb; items jsonb:='[]'; subtotal bigint:=0; n integer; price bigint;
begin
 home:=brand_storefront_home_m3(p_brand);if home is null then raise exception 'STORE_UNAVAILABLE';end if;
 if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 100 then raise exception 'STORE_CART_INVALID';end if;
 if (select count(distinct line.value->>'variantId') from jsonb_array_elements(p_lines) as line(value))<>jsonb_array_length(p_lines) then raise exception 'STORE_CART_INVALID';end if;
 select cfg.*,b.id bid into c from brands b left join store_checkout_configuration cfg on cfg.brand_id=b.id where b.slug=p_brand;
 for x in select value from jsonb_array_elements(p_lines) order by value->>'variantId' loop
  if (x->>'quantity') !~ '^[0-9]+$' then raise exception 'STORE_CART_INVALID';end if;
  n:=(x->>'quantity')::integer;if n not between 1 and 99 then raise exception 'STORE_CART_INVALID';end if;
  d:=brand_storefront_product_m5(p_brand,(x->>'productId')::uuid);
  select item into v from jsonb_array_elements(d->'product'->'variants') item where item->>'id'=x->>'variantId';
  if d is null or v is null then raise exception 'STORE_PRODUCT_UNAVAILABLE';end if;
  if d->'product'->>'currency' is null or d->'product'->>'currency' not in ('MXN','USD','EUR') then raise exception 'STORE_CURRENCY_UNSUPPORTED';end if;
  if c.currency is not null and c.currency<>d->'product'->>'currency' then raise exception 'STORE_CURRENCY_UNSUPPORTED';end if;
  price:=round((v->>'price')::numeric*100);subtotal:=subtotal+price*n;
  items:=items||jsonb_build_array(jsonb_build_object('productId',x->>'productId','variantId',x->>'variantId','quantity',n,'name',d->'product'->>'name','variantName',v->>'name','unitCents',price,'totalCents',price*n,'currency',d->'product'->>'currency','available',exists(select 1 from pos_inventory i join pos_locations l on l.id=i.location_id and l.brand_slug=p_brand where i.brand_slug=p_brand and i.variant_id=(x->>'variantId')::uuid and (c.location_id is null or i.location_id=c.location_id) and i.quantity-i.reserved_quantity>=n)));
 end loop;
 return jsonb_build_object('brandId',c.bid,'items',items,'subtotalCents',subtotal,'currency',items->0->>'currency','discountCents',case when c.brand_id is not null then 0 end,'configurationReady',c.brand_id is not null,'shippingCents',null,'totalCents',null);
end $$;

create function public.store_order_create_m6(p_brand text,p_owner text,p_attempt uuid,p_lines jsonb,p_contact jsonb,p_quote uuid,p_request_hash text) returns public.store_orders
language plpgsql security definer set search_path=public as $$
declare b brands%rowtype;c store_checkout_configuration%rowtype;q store_shipping_quotes%rowtype;o store_orders%rowtype;cart jsonb;x jsonb;req jsonb;inv pos_inventory%rowtype;
begin
 if p_owner !~ '^[0-9a-f]{64}$' or p_owner is null or p_attempt is null then raise exception 'STORE_UNAUTHORIZED';end if;
 select * into b from brands where slug=p_brand for share;
 if b.id is null then raise exception 'STORE_UNAVAILABLE';end if;
 perform pg_advisory_xact_lock(hashtextextended('store:m6:owner:'||b.id||':'||p_owner,0));
 perform pg_advisory_xact_lock(hashtextextended('store:m6:key:'||b.id||':'||p_attempt,0));
 req:=jsonb_build_object('lines',(select jsonb_agg(line.value order by line.value->>'variantId') from jsonb_array_elements(p_lines) as line(value)),'contact',p_contact,'quote',p_quote);
 select * into o from store_orders where brand_id=b.id and attempt_id=p_attempt;
 if found then if o.owner_hash<>p_owner or o.request<>req then raise exception 'STORE_IDEMPOTENCY_CONFLICT';end if;return o;end if;
 if exists(select 1 from store_orders where brand_id=b.id and owner_hash=p_owner and status='PENDING') then raise exception 'STORE_PENDING_EXISTS';end if;
 select * into c from store_checkout_configuration where brand_id=b.id for share;
 if not found or not exists(select 1 from pos_locations where id=c.location_id and brand_slug=b.slug) then raise exception 'STORE_CONFIGURATION_REQUIRED';end if;
 select * into q from store_shipping_quotes where id=p_quote and brand_id=b.id and owner_hash=p_owner and request_hash=p_request_hash and location_id=c.location_id and currency=c.currency and expires_at>clock_timestamp() for update;
 if not found then raise exception 'STORE_SHIPPING_REQUIRED';end if;
 cart:=store_cart_m6(p_brand,p_lines);
 -- Lock the same POS inventory rows used by Retail/COMU, in deterministic order.
 for x in select value from jsonb_array_elements(cart->'items') order by value->>'variantId' loop
  select * into inv from pos_inventory where brand_slug=p_brand and location_id=c.location_id and variant_id=(x->>'variantId')::uuid for update;
  if not found or inv.quantity-inv.reserved_quantity<(x->>'quantity')::integer then raise exception 'STORE_STOCK_UNAVAILABLE';end if;
 end loop;
 if q.expires_at<=clock_timestamp() then raise exception 'STORE_SHIPPING_REQUIRED';end if;
 insert into store_orders(brand_id,location_id,owner_hash,attempt_id,request,contact,currency,subtotal_cents,shipping_cents,total_cents,shipping_quote_id,stripe_account_ref,expires_at)
 values(b.id,c.location_id,p_owner,p_attempt,req,p_contact,c.currency,(cart->>'subtotalCents')::bigint,q.amount_cents,(cart->>'subtotalCents')::bigint+q.amount_cents,q.id,c.stripe_account_ref,clock_timestamp()+interval '35 minutes') returning * into o;
 for x in select value from jsonb_array_elements(cart->'items') order by value->>'variantId' loop
  insert into store_order_items(order_id,product_id,variant_id,quantity,unit_cents,snapshot) values(o.id,(x->>'productId')::uuid,(x->>'variantId')::uuid,(x->>'quantity')::integer,(x->>'unitCents')::bigint,x);
  update pos_inventory set reserved_quantity=reserved_quantity+(x->>'quantity')::integer,updated_at=now() where location_id=c.location_id and variant_id=(x->>'variantId')::uuid and brand_slug=p_brand;
  insert into store_order_inventory_effects values(o.id,(x->>'variantId')::uuid,'RESERVE',(x->>'quantity')::integer,now());
 end loop;
 return o;
end $$;

-- Shared lifecycle lock: order, then POS inventory in variant order. A1 suspension does not block resolution.
create function public.store_order_resolve_m6(p_order uuid,p_action text,p_event text default null,p_session text default null,p_intent text default null,p_amount bigint default null,p_currency text default null) returns public.store_orders
language plpgsql security definer set search_path=public as $$
declare o store_orders%rowtype;i store_order_items%rowtype;inv pos_inventory%rowtype;target text;
begin
 select * into o from store_orders where id=p_order for update;
 if not found then raise exception 'STORE_ORDER_NOT_FOUND';end if;
 if p_action not in ('PAID','FAILED','EXPIRED','CANCELLED') then raise exception 'STORE_ACTION_INVALID';end if;
 if p_event is not null and exists(select 1 from store_payment_events where event_id=p_event) then return o;end if;
 if p_action='PAID' then
  if p_event is null or p_intent is null or p_session is distinct from o.stripe_session_id or p_amount is distinct from o.total_cents or upper(p_currency) is distinct from o.currency then raise exception 'STORE_PAYMENT_MISMATCH';end if;
 end if;
 if o.status='PAID' or o.status='PAYMENT_REVIEW' then return o;end if;
 -- A payment can wait behind Retail/COMU inventory locks until its deadline passes.
 -- Acquire every item lock before deciding whether the payment can consume stock.
 if o.status='PENDING' then
  perform invrow.id from pos_inventory invrow join store_order_items item on item.variant_id=invrow.variant_id
   where item.order_id=o.id and invrow.location_id=o.location_id
   order by item.variant_id for update of invrow;
 end if;
 if p_action='PAID' and (o.status<>'PENDING' or o.expires_at<=clock_timestamp()) then target:='PAYMENT_REVIEW';
 elsif p_action='PAID' then target:='PAID';
 elsif p_action='FAILED' then target:='CANCELLED';
 else target:=p_action;end if;
 if o.status='PENDING' then
  for i in select * from store_order_items where order_id=o.id order by variant_id loop
   select * into inv from pos_inventory where location_id=o.location_id and variant_id=i.variant_id for update;
   if not found or inv.reserved_quantity<i.quantity then raise exception 'STORE_INVENTORY_INVARIANT';end if;
   update pos_inventory set reserved_quantity=reserved_quantity-i.quantity,quantity=quantity-case when target='PAID' then i.quantity else 0 end,updated_at=now() where id=inv.id;
   insert into store_order_inventory_effects values(o.id,i.variant_id,case when target='PAID' then 'SALE' else 'RELEASE' end,i.quantity,now());
   if target='PAID' then
    insert into pos_inventory_movements(brand_id,brand_slug,location_id,variant_id,movement_type,quantity_delta,quantity_before,quantity_after,reference_type,reference_id,notes,created_by)
    values(inv.brand_id,inv.brand_slug,inv.location_id,inv.variant_id,'sale',-i.quantity,inv.quantity,inv.quantity-i.quantity,'store_order_item',i.id,'Online store',null);
   end if;
  end loop;
 elsif target<>'PAYMENT_REVIEW' then return o;end if;
 update store_orders set status=target,payment_intent_id=case when p_action='PAID' then p_intent else payment_intent_id end,paid_at=case when target='PAID' then now() else paid_at end where id=o.id returning * into o;
 if p_event is not null then insert into store_payment_events(event_id,order_id,kind) values(p_event,o.id,p_action);end if;
 return o;
end $$;

create function public.store_order_attach_session_m6(p_order uuid,p_session text) returns public.store_orders
language plpgsql security definer set search_path=public as $$
declare o store_orders%rowtype;
begin
 select * into o from store_orders where id=p_order for update;
 if not found or o.status<>'PENDING' or o.expires_at<=clock_timestamp() then raise exception 'STORE_ORDER_NOT_PENDING';end if;
 if o.stripe_session_id is not null and o.stripe_session_id<>p_session then raise exception 'STORE_SESSION_CONFLICT';end if;
 update store_orders set stripe_session_id=p_session where id=p_order returning * into o;return o;
end $$;
create function public.store_orders_expire_m6(p_brand text) returns integer language plpgsql security definer set search_path=public as $$
declare x record;n integer:=0;
begin
 for x in select id from store_orders where brand_id=(select id from brands where slug=p_brand) and status='PENDING' and expires_at<=clock_timestamp() order by id for update skip locked limit 100 loop
  perform store_order_resolve_m6(x.id,'EXPIRED');n:=n+1;
 end loop;return n;
end $$;
revoke all on function public.store_cart_m6(text,jsonb), public.store_order_create_m6(text,text,uuid,jsonb,jsonb,uuid,text), public.store_order_resolve_m6(uuid,text,text,text,text,bigint,text),public.store_order_attach_session_m6(uuid,text), public.store_orders_expire_m6(text) from public,anon,authenticated;
grant execute on function public.store_cart_m6(text,jsonb), public.store_order_create_m6(text,text,uuid,jsonb,jsonb,uuid,text), public.store_order_resolve_m6(uuid,text,text,text,text,bigint,text),public.store_order_attach_session_m6(uuid,text), public.store_orders_expire_m6(text) to service_role;
create function public.store_brand_context_m6(p_brand text) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('brandId',id,'appearance',brand_storefront_home_m3(p_brand)->'appearance') from brands where slug=p_brand and brand_storefront_home_m3(p_brand) is not null;
$$;
revoke all on function public.store_brand_context_m6(text) from public;
grant execute on function public.store_brand_context_m6(text) to anon,authenticated,service_role;
commit;
