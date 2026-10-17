begin;
-- Additive retail domain. Existing sales/prices/stock are not backfilled.
create table public.pos_retail_rules (
 brand_slug text primary key,
 wholesale_enabled boolean not null default false,
 minimum_pieces integer not null default 50 check(minimum_pieces between 1 and 100000),
 grouping text not null default 'product' check(grouping in ('product','variant')),
 combine_variants boolean not null default true,
 orders_enabled boolean not null default false,
 minimum_deposit numeric(14,2) not null default 500 check(minimum_deposit>0),
 validity_days integer not null default 15 check(validity_days between 1 and 365),
 retained_deposit numeric(14,2) not null default 500 check(retained_deposit>=0 and retained_deposit<=minimum_deposit),
 policy text not null default 'Al vencer se retiene el anticipo mínimo aceptado. Los abonos adicionales quedan pendientes de resolución administrativa. No hay reembolso automático.',
 updated_at timestamptz not null default now(), updated_by uuid
);
create table public.pos_factory_prices (
 id uuid primary key default gen_random_uuid(),brand_slug text not null,
 product_id uuid not null references public.pos_products(id),
 variant_id uuid references public.pos_product_variants(id),
 price numeric(14,2) not null check(price>0),updated_at timestamptz not null default now(),updated_by uuid
);
create unique index pos_factory_model_price on public.pos_factory_prices(brand_slug,product_id) where variant_id is null;
create unique index pos_factory_variant_price on public.pos_factory_prices(brand_slug,variant_id) where variant_id is not null;

create table public.pos_retail_orders (
 id uuid primary key default gen_random_uuid(),brand_slug text not null,
 folio text not null default ('N-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
 location_id uuid not null references public.pos_locations(id),customer_id uuid not null references public.pos_customers(id),
 contact text not null, state text not null default 'note' check(state in ('note','active','settled','expired','cancelled')),
 items jsonb not null default '[]', quote jsonb not null default '{}', total numeric(14,2) not null default 0,
 paid numeric(14,2) not null default 0, retained numeric(14,2) not null default 0, unresolved numeric(14,2) not null default 0,
 policy_snapshot jsonb,activated_at timestamptz,expires_at timestamptz,
 sale_id uuid references public.pos_sales(id),delivered_at timestamptz,delivered_by uuid,
 revision integer not null default 1,created_by uuid not null,staff_id uuid not null references public.pos_staff(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(brand_slug,folio),check(total>=0 and paid>=0 and retained>=0 and unresolved>=0),check(retained+unresolved<=paid)
);
create index pos_retail_order_expiry on public.pos_retail_orders(expires_at) where state='active';
create table public.pos_retail_order_events (
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.pos_retail_orders(id),brand_slug text not null,
 action text not null,request_key uuid not null,payload jsonb not null,result jsonb not null default '{}',
 host_user_id uuid,staff_id uuid,created_at timestamptz not null default now(),unique(order_id,request_key)
);
create table public.pos_retail_order_payments (
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.pos_retail_orders(id),brand_slug text not null,
 cash_session_id uuid not null references public.pos_cash_sessions(id),staff_id uuid not null,host_user_id uuid not null,
 method text not null check(method in ('cash','card','transfer')),amount numeric(14,2) not null check(amount>0),
 tendered numeric(14,2) not null,change numeric(14,2) not null,reference text,
 cash_movement_id uuid references public.pos_cash_movements(id),request_key uuid not null,created_at timestamptz not null default now(),
 unique(order_id,request_key),check(tendered>=amount and change=tendered-amount),check(method='cash' or (tendered=amount and change=0))
);
create table public.pos_retail_sale_requests (
 brand_slug text not null,request_key uuid not null,payload jsonb not null,result jsonb not null,primary key(brand_slug,request_key)
);
alter table public.pos_retail_rules enable row level security;
alter table public.pos_factory_prices enable row level security;
alter table public.pos_retail_orders enable row level security;
alter table public.pos_retail_order_events enable row level security;
alter table public.pos_retail_order_payments enable row level security;
alter table public.pos_retail_sale_requests enable row level security;
revoke all on public.pos_retail_rules,public.pos_factory_prices,public.pos_retail_orders,public.pos_retail_order_events,public.pos_retail_order_payments,public.pos_retail_sale_requests from public,anon,authenticated;
grant all on public.pos_retail_rules,public.pos_factory_prices,public.pos_retail_orders,public.pos_retail_order_events,public.pos_retail_order_payments,public.pos_retail_sale_requests to service_role;

create function public.pos_retail_quote_v1(p_brand text,p_location uuid,p_items jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare rules public.pos_retail_rules%rowtype; loc public.pos_locations%rowtype; i jsonb; v record;
 qty numeric; grouped numeric; unit_price numeric; factory numeric; discount numeric; subtotal numeric; tax numeric; amount numeric;
 lines jsonb:='[]'; total numeric:=0; sub numeric:=0; taxes numeric:=0; discounts numeric:=0;
begin
 select * into loc from pos_locations where id=p_location and brand_slug=p_brand and active;
 if not found then raise exception 'POS_LOCATION_INVALID'; end if;
 select * into rules from pos_retail_rules where brand_slug=p_brand;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 250 then raise exception 'POS_ITEMS_INVALID';end if;
 if (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct x->>'variant_id') from jsonb_array_elements(p_items) x) then raise exception 'POS_DUPLICATE_VARIANT';end if;
 for i in select value from jsonb_array_elements(p_items) loop
  qty:=(i->>'quantity')::numeric;discount:=coalesce((i->>'discount_amount')::numeric,0);
  if qty is null or qty<=0 or qty>100000 or qty<>round(qty,3) or discount<0 or discount<>round(discount,2) then raise exception 'POS_QUANTITY_OR_DISCOUNT_INVALID';end if;
  select pv.*,p.name product_name,p.tax_rate,p.track_inventory into v from pos_product_variants pv join pos_products p on p.id=pv.product_id and p.brand_slug=p_brand where pv.id=(i->>'variant_id')::uuid and pv.brand_slug=p_brand and pv.active and p.active and p.sellable;
  if not found then raise exception 'POS_PRODUCT_UNAVAILABLE';end if;
  if rules.wholesale_enabled and v.unit_code='piece' and qty<>trunc(qty) then raise exception 'POS_WHOLE_PIECES_REQUIRED';end if;
  select sum((x->>'quantity')::numeric) into grouped from jsonb_array_elements(p_items) x join pos_product_variants pv on pv.id=(x->>'variant_id')::uuid and pv.brand_slug=p_brand
   where case when rules.grouping='product' and rules.combine_variants then pv.product_id=v.product_id else pv.id=v.id end and pv.unit_code='piece';
  factory:=null;
  if rules.wholesale_enabled and v.unit_code='piece' and qty=trunc(qty) then
   select fp.price into factory from pos_factory_prices fp where fp.brand_slug=p_brand and fp.product_id=v.product_id and (fp.variant_id=v.id or fp.variant_id is null) order by (fp.variant_id is not null) desc limit 1;
  end if;
  unit_price:=case when rules.wholesale_enabled and coalesce(grouped,0)>=rules.minimum_pieces and factory is not null then least(factory,v.price) else v.price end;
  subtotal:=round(unit_price*qty,2);
  if discount>subtotal then raise exception 'POS_DISCOUNT_EXCEEDS_SUBTOTAL';end if;
  tax:=case when loc.prices_include_tax then round((subtotal-discount)-(subtotal-discount)/(1+v.tax_rate/100),2) else round((subtotal-discount)*v.tax_rate/100,2) end;
  amount:=subtotal-discount+case when loc.prices_include_tax then 0 else tax end;
  lines:=lines||jsonb_build_array(jsonb_build_object('variant_id',v.id,'product_id',v.product_id,'product_name',v.product_name,'variant_name',v.name,'sku',v.sku,'quantity',qty,'unit_price',unit_price,'regular_price',v.price,'discount_amount',discount,'tax_amount',tax,'line_total',amount,'track_inventory',v.track_inventory,'model_quantity',coalesce(grouped,0),'remaining',greatest(coalesce(rules.minimum_pieces,50)-coalesce(grouped,0),0),'factory_applied',unit_price<v.price,'factory_missing',coalesce(rules.wholesale_enabled,false) and v.unit_code='piece' and factory is null));
  total:=total+amount;sub:=sub+subtotal;taxes:=taxes+tax;discounts:=discounts+discount;
 end loop;
 return jsonb_build_object('items',lines,'total',total,'subtotal',sub,'tax_total',taxes,'discount_total',discounts,'currency',loc.currency,'wholesale_enabled',coalesce(rules.wholesale_enabled,false));
end $$;
revoke all on function public.pos_retail_quote_v1(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pos_retail_quote_v1(text,uuid,jsonb) to service_role;

-- Existing sale engine remains canonical for taxes, loyalty, stock and payments.
-- Factory reductions are supplied once; only this newly created sale's price
-- snapshot is then normalized from discount to the applied unit price.
create function public.pos_complete_retail_sale_v1(p_brand_slug text,p_location_id uuid,p_register_id uuid,p_cash_session_id uuid,p_customer_id uuid,p_items jsonb,p_payments jsonb,p_notes text,p_user_id uuid,p_reward_id uuid,p_idempotency_key uuid,p_reward_unlock_id uuid default null,p_served_by_staff_id uuid default null,p_cashier_staff_id uuid default null,p_expected_quote jsonb default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare q jsonb;r jsonb;normalized jsonb;payload jsonb;saved pos_retail_sale_requests%rowtype;saving numeric;
begin
 if p_idempotency_key is null then raise exception 'POS_IDEMPOTENCY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('retail-sale:'||p_brand_slug||p_idempotency_key,0));
 payload:=jsonb_build_object('location',p_location_id,'register',p_register_id,'session',p_cash_session_id,'customer',p_customer_id,'items',p_items,'payments',p_payments,'notes',p_notes,'reward',p_reward_id,'unlock',p_reward_unlock_id,'staff',p_cashier_staff_id);
 select * into saved from pos_retail_sale_requests where brand_slug=p_brand_slug and request_key=p_idempotency_key;
 if found then if saved.payload<>payload then raise exception 'POS_IDEMPOTENCY_CONFLICT';end if;return saved.result;end if;
 -- A retry of a sale finalized before this release must use its original
 -- fingerprint and snapshots, never today's factory rules.
 if exists(select 1 from pos_sales where brand_slug=p_brand_slug and idempotency_key=p_idempotency_key) then
  return pos_complete_sale_with_staff_v1(p_brand_slug,p_location_id,p_register_id,p_cash_session_id,p_customer_id,p_items,p_payments,p_notes,p_user_id,p_reward_id,p_idempotency_key,p_reward_unlock_id,p_served_by_staff_id,p_cashier_staff_id);
 end if;
 -- Consistent price/settings snapshot while completing the sale.
 perform 1 from pos_retail_rules where brand_slug=p_brand_slug for share;
 perform 1 from pos_product_variants where brand_slug=p_brand_slug and id in(select (x->>'variant_id')::uuid from jsonb_array_elements(p_items)x) order by id for share;
 perform 1 from pos_factory_prices where brand_slug=p_brand_slug order by id for share;
 q:=pos_retail_quote_v1(p_brand_slug,p_location_id,p_items);
 if p_expected_quote is not null and q<>p_expected_quote then raise exception 'POS_PRICES_CHANGED';end if;
 if (q->>'wholesale_enabled')::boolean and p_expected_quote is null then raise exception 'POS_QUOTE_REQUIRED';end if;
 select jsonb_agg(jsonb_build_object('variant_id',x->'variant_id','quantity',x->'quantity','discount_amount',(x->>'discount_amount')::numeric+round(((x->>'regular_price')::numeric-(x->>'unit_price')::numeric)*(x->>'quantity')::numeric,2)) order by x->>'variant_id'),sum(round(((x->>'regular_price')::numeric-(x->>'unit_price')::numeric)*(x->>'quantity')::numeric,2)) into normalized,saving from jsonb_array_elements(q->'items')x;
 r:=pos_complete_sale_with_staff_v1(p_brand_slug,p_location_id,p_register_id,p_cash_session_id,p_customer_id,normalized,p_payments,p_notes,p_user_id,p_reward_id,p_idempotency_key,p_reward_unlock_id,p_served_by_staff_id,p_cashier_staff_id);
 if saving>0 then
  update pos_sale_items si set unit_price=(x->>'unit_price')::numeric,discount_amount=si.discount_amount-round(((x->>'regular_price')::numeric-(x->>'unit_price')::numeric)*(x->>'quantity')::numeric,2) from jsonb_array_elements(q->'items')x where si.sale_id=(r->>'id')::uuid and si.brand_slug=p_brand_slug and si.variant_id=(x->>'variant_id')::uuid;
  update pos_sales set subtotal=subtotal-saving,discount_total=discount_total-saving where id=(r->>'id')::uuid and brand_slug=p_brand_slug;
  r:=r||(select jsonb_build_object('subtotal',subtotal,'discount_total',discount_total) from pos_sales where id=(r->>'id')::uuid and brand_slug=p_brand_slug);
  update pos_sale_loyalty_visit_snapshots set response_json=r where sale_id=(r->>'id')::uuid;
 end if;
 insert into pos_retail_sale_requests values(p_brand_slug,p_idempotency_key,payload,r);
 return r;
end $$;
revoke all on function public.pos_complete_retail_sale_v1(text,uuid,uuid,uuid,uuid,jsonb,jsonb,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pos_complete_retail_sale_v1(text,uuid,uuid,uuid,uuid,jsonb,jsonb,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb) to service_role;
-- Called only with an order row locked by the transaction. Inventory rows are
-- locked in stable UUID order; competing sales use the same inventory locks.
create function public.pos_retail_reserve_v1(p_brand text,p_location uuid,p_old jsonb,p_new jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare x record;inv pos_inventory%rowtype;
begin
 for x in
  select variant_id,sum(delta) delta from (
   select (j->>'variant_id')::uuid variant_id,-(j->>'quantity')::numeric delta from jsonb_array_elements(p_old)j where (j->>'track_inventory')::boolean
   union all select (j->>'variant_id')::uuid,(j->>'quantity')::numeric from jsonb_array_elements(p_new)j where (j->>'track_inventory')::boolean
  ) changes group by variant_id order by variant_id
 loop
  select * into inv from pos_inventory where brand_slug=p_brand and location_id=p_location and variant_id=x.variant_id for update;
  if not found or inv.reserved_quantity+x.delta<0 or inv.quantity-inv.reserved_quantity<x.delta then raise exception 'POS_INVENTORY_UNAVAILABLE';end if;
  update pos_inventory set reserved_quantity=reserved_quantity+x.delta where id=inv.id;
 end loop;
end $$;
revoke all on function public.pos_retail_reserve_v1(text,uuid,jsonb,jsonb) from public,anon,authenticated;

create function public.pos_retail_expire_one_v1(p_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare o pos_retail_orders%rowtype;
begin
 select * into o from pos_retail_orders where id=p_id for update;
 if not found or o.state<>'active' or o.expires_at>clock_timestamp() then return false;end if;
 perform pos_retail_reserve_v1(o.brand_slug,o.location_id,o.quote->'items','[]');
 update pos_retail_orders set state='expired',retained=least(paid,(policy_snapshot->>'retained_deposit')::numeric),unresolved=paid-least(paid,(policy_snapshot->>'retained_deposit')::numeric),revision=revision+1,updated_at=clock_timestamp() where id=o.id;
 insert into pos_retail_order_events(order_id,brand_slug,action,request_key,payload,result) values(o.id,o.brand_slug,'expire',gen_random_uuid(),'{}',jsonb_build_object('reservation_released',true,'payments_preserved',true));
 return true;
end $$;
revoke all on function public.pos_retail_expire_one_v1(uuid) from public,anon,authenticated;
create function public.pos_retail_expire_v1() returns integer
language plpgsql security definer set search_path=public as $$
declare o record;n integer:=0;
begin
 for o in select id from pos_retail_orders where state='active' and expires_at<=clock_timestamp() order by expires_at for update skip locked limit 200 loop
  if pos_retail_expire_one_v1(o.id) then n:=n+1;end if;
 end loop;return n;
end $$;
revoke all on function public.pos_retail_expire_v1() from public,anon,authenticated;
grant execute on function public.pos_retail_expire_v1() to service_role;

create function public.pos_retail_order_action_v1(p_brand text,p_actor uuid,p_staff uuid,p_id uuid,p_action text,p_request uuid,p_body jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare o pos_retail_orders%rowtype;e pos_retail_order_events%rowtype;rules pos_retail_rules%rowtype;
 q jsonb;result jsonb;cash pos_cash_sessions%rowtype;staff pos_staff%rowtype;location uuid;customer uuid;
 amount numeric;method text;tendered numeric;movement uuid;payment uuid;sale jsonb; old_items jsonb;
begin
 if p_request is null or p_id is null or p_actor is null or p_staff is null then raise exception 'POS_REQUEST_INVALID';end if;
 select * into rules from pos_retail_rules where brand_slug=p_brand for share;
 if not found or not rules.orders_enabled then raise exception 'POS_ORDERS_DISABLED';end if;
 select * into staff from pos_staff where id=p_staff and brand_slug=p_brand and active;
 if not found then raise exception 'POS_STAFF_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('retail-order:'||p_id,0));
 select * into o from pos_retail_orders where id=p_id for update;
 if found and o.brand_slug<>p_brand then raise exception 'POS_ORDER_NOT_FOUND';end if;
 if o.id is not null and staff.location_id is not null and staff.location_id<>o.location_id then raise exception 'POS_STAFF_LOCATION_FORBIDDEN';end if;
 select * into e from pos_retail_order_events where order_id=p_id and request_key=p_request;
 if found then if e.action<>p_action or e.payload<>p_body or e.host_user_id<>p_actor or e.staff_id<>p_staff then raise exception 'POS_IDEMPOTENCY_CONFLICT';end if;return e.result;end if;
 if o.state='active' and o.expires_at<=clock_timestamp() then
  perform pos_retail_expire_one_v1(o.id);return jsonb_build_object('expired',true,'id',o.id);
 end if;
 if p_action='save' then
  if o.id is not null and o.state not in ('note','active') then raise exception 'POS_ORDER_NOT_EDITABLE';end if;
  if o.id is not null and o.revision<>coalesce((p_body->>'revision')::integer,0) then raise exception 'POS_ORDER_CHANGED';end if;
  location:=coalesce(o.location_id,(p_body->>'location_id')::uuid);customer:=(p_body->>'customer_id')::uuid;
  if staff.location_id is not null and staff.location_id<>location then raise exception 'POS_STAFF_LOCATION_FORBIDDEN';end if;
  if not exists(select 1 from pos_customers where id=customer and brand_slug=p_brand) then raise exception 'POS_CUSTOMER_INVALID';end if;
  if length(btrim(coalesce(p_body->>'contact',''))) not between 3 and 200 then raise exception 'POS_CONTACT_REQUIRED';end if;
  q:=pos_retail_quote_v1(p_brand,location,p_body->'items');
  if (q->>'total')::numeric<=0 or (o.state='active' and (q->>'total')::numeric<=o.paid) then raise exception 'POS_ORDER_TOTAL_INVALID';end if;
  if o.state='active' then perform pos_retail_reserve_v1(p_brand,location,o.quote->'items',q->'items');end if;
  if o.id is null then
   insert into pos_retail_orders(id,brand_slug,location_id,customer_id,contact,items,quote,total,created_by,staff_id) values(p_id,p_brand,location,customer,btrim(p_body->>'contact'),p_body->'items',q,(q->>'total')::numeric,p_actor,p_staff) returning * into o;
  else
   update pos_retail_orders set customer_id=customer,contact=btrim(p_body->>'contact'),items=p_body->'items',quote=q,total=(q->>'total')::numeric,revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into o;
  end if;
 else
  if o.id is null then raise exception 'POS_ORDER_NOT_FOUND';end if;
  if o.revision<>coalesce((p_body->>'revision')::integer,0) then raise exception 'POS_ORDER_CHANGED';end if;
  if p_action='cancel' then
   if o.state not in ('note','active') then raise exception 'POS_ORDER_NOT_EDITABLE';end if;
   if o.state='active' then perform pos_retail_reserve_v1(p_brand,o.location_id,o.quote->'items','[]');end if;
   update pos_retail_orders set state='cancelled',unresolved=paid,revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into o;
  elsif p_action='deliver' then
   if o.state<>'settled' or o.delivered_at is not null then raise exception 'POS_DELIVERY_INVALID';end if;
   update pos_retail_orders set delivered_at=clock_timestamp(),delivered_by=p_staff,revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into o;
  elsif p_action in ('activate','pay','settle','convert') then
   if (p_action in ('activate','convert') and o.state<>'note') or (p_action in ('pay','settle') and o.state<>'active') then raise exception 'POS_ORDER_STATE_INVALID';end if;
   q:=pos_retail_quote_v1(p_brand,o.location_id,o.items);
   if p_body->'expected_quote' is null or q<>p_body->'expected_quote' then return jsonb_build_object('prices_changed',true,'quote',q,'id',o.id);end if;
   if p_action='activate' and (p_body->'accepted_policy' is distinct from to_jsonb(rules)) then return jsonb_build_object('policy_changed',true,'policy',to_jsonb(rules));end if;
   select * into cash from pos_cash_sessions where id=(p_body->>'cash_session_id')::uuid and brand_slug=p_brand and location_id=o.location_id and status='open' for update;
   if not found then raise exception 'POS_CASH_SESSION_NOT_OPEN';end if;
   -- A wait for the cash-session lock may cross the deadline.
   if o.state='active' and o.expires_at<=clock_timestamp() then perform pos_retail_expire_one_v1(o.id);return jsonb_build_object('expired',true,'id',o.id);end if;
   amount:=(p_body->>'amount')::numeric;method:=p_body->>'method';tendered:=coalesce((p_body->>'tendered')::numeric,amount);
   if amount is null or amount<=0 or amount<>round(amount,2) or method not in ('cash','card','transfer') or method is null or tendered<amount or tendered<>round(tendered,2) or (method<>'cash' and tendered<>amount) then raise exception 'POS_PAYMENT_INVALID';end if;
   if p_action='activate' and (amount<rules.minimum_deposit or amount>=(q->>'total')::numeric) then raise exception 'POS_INITIAL_DEPOSIT_INVALID';end if;
   if p_action='pay' and amount>=(q->>'total')::numeric-o.paid then raise exception 'POS_USE_SETTLEMENT';end if;
   if p_action in ('settle','convert') and amount<>(q->>'total')::numeric-o.paid then raise exception 'POS_BALANCE_CHANGED';end if;
   if p_action='activate' then
    perform pos_retail_reserve_v1(p_brand,o.location_id,'[]',q->'items');
    update pos_retail_orders set state='active',activated_at=clock_timestamp(),expires_at=clock_timestamp()+make_interval(days=>rules.validity_days),policy_snapshot=to_jsonb(rules) where id=p_id;
   elsif o.state='active' then
    perform pos_retail_reserve_v1(p_brand,o.location_id,o.quote->'items',q->'items');
   end if;
   if method='cash' then
    insert into pos_cash_movements(brand_id,brand_slug,cash_session_id,movement_type,amount,reason,created_by) values(cash.brand_id,p_brand,cash.id,'deposit',amount,'Apartado '||o.folio||' · anticipo/abono recibido',p_actor) returning id into movement;
   end if;
   insert into pos_retail_order_payments(order_id,brand_slug,cash_session_id,staff_id,host_user_id,method,amount,tendered,change,reference,cash_movement_id,request_key) values(p_id,p_brand,cash.id,p_staff,p_actor,method,amount,tendered,tendered-amount,left(p_body->>'reference',200),movement,p_request) returning id into payment;
   if p_action in ('settle','convert') then
    if o.state='active' then perform pos_retail_reserve_v1(p_brand,o.location_id,q->'items','[]');end if;
    sale:=pos_complete_retail_sale_v1(p_brand,o.location_id,cash.register_id,cash.id,o.customer_id,o.items,jsonb_build_array(jsonb_build_object('method','other','amount',(q->>'total')::numeric,'tendered_amount',(q->>'total')::numeric,'metadata',jsonb_build_object('retail_order_id',o.id,'prepaid',true),'reference','Aplicación de abonos '||o.folio)),'Liquidación de pedido '||o.folio,p_actor,null,o.id,null,null,p_staff,q);
    update pos_retail_orders set state='settled',sale_id=(sale->>'id')::uuid where id=p_id;
   end if;
   update pos_retail_orders set paid=paid+amount,total=(q->>'total')::numeric,quote=q,revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into o;
  else raise exception 'POS_ACTION_INVALID';end if;
 end if;
 result:=jsonb_build_object('order',to_jsonb(o),'payment_id',payment);
 insert into pos_retail_order_events(order_id,brand_slug,action,request_key,payload,result,host_user_id,staff_id) values(p_id,p_brand,p_action,p_request,p_body,result,p_actor,p_staff);
 return result;
end $$;
revoke all on function public.pos_retail_order_action_v1(text,uuid,uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pos_retail_order_action_v1(text,uuid,uuid,uuid,text,uuid,jsonb) to service_role;
create function public.pos_retail_rules_save_v1(p_brand text,p_actor uuid,p_body jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r pos_retail_rules%rowtype;product uuid;variant uuid;amount numeric;
begin
 insert into pos_retail_rules(brand_slug) values(p_brand) on conflict do nothing;
 select * into r from pos_retail_rules where brand_slug=p_brand for update;
 if p_body->>'action'='price' then
  product:=(p_body->>'product_id')::uuid;variant:=nullif(p_body->>'variant_id','')::uuid;amount:=(p_body->>'price')::numeric;
  if not exists(select 1 from pos_products where id=product and brand_slug=p_brand) or (variant is not null and not exists(select 1 from pos_product_variants where id=variant and product_id=product and brand_slug=p_brand)) then raise exception 'POS_PRODUCT_UNAVAILABLE';end if;
  if amount is null or amount<=0 or amount<>round(amount,2) then raise exception 'POS_PRICE_INVALID';end if;
  update pos_factory_prices set price=amount,updated_at=now(),updated_by=p_actor where brand_slug=p_brand and product_id=product and variant_id is not distinct from variant;
  if not found then insert into pos_factory_prices(brand_slug,product_id,variant_id,price,updated_by) values(p_brand,product,variant,amount,p_actor);end if;
 else
  if length(coalesce(p_body->>'policy','')) not between 10 and 1500 then raise exception 'POS_POLICY_REQUIRED';end if;
  update pos_retail_rules set wholesale_enabled=(p_body->>'wholesale_enabled')::boolean,minimum_pieces=(p_body->>'minimum_pieces')::integer,grouping=p_body->>'grouping',combine_variants=(p_body->>'combine_variants')::boolean,orders_enabled=(p_body->>'orders_enabled')::boolean,minimum_deposit=(p_body->>'minimum_deposit')::numeric,validity_days=(p_body->>'validity_days')::integer,retained_deposit=(p_body->>'retained_deposit')::numeric,policy=p_body->>'policy',updated_at=now(),updated_by=p_actor where brand_slug=p_brand returning * into r;
 end if;
 return to_jsonb(r);
end $$;
revoke all on function public.pos_retail_rules_save_v1(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pos_retail_rules_save_v1(text,uuid,jsonb) to service_role;
-- Production already has pg_cron. Local disposable schema copies may not.
-- Deployment verifies this job is installed/active before enabling orders.
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  execute $cron$select cron.schedule('pos-retail-expiry-v1','* * * * *','select public.pos_retail_expire_v1()')$cron$;
 end if;
end $$;
commit;
