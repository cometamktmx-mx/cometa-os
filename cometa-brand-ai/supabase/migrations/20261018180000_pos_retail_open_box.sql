begin;
-- Opt-in per business. Accepted policies remain unchanged; active Magenta boxes adopt the authorized open-box balance classification.
alter table public.pos_retail_rules add column open_box boolean not null default false;
alter table public.pos_retail_orders add column open_box boolean not null default false,
 add column amount_due numeric(14,2) generated always as (greatest(total-paid,0)) stored,
 add column available_balance numeric(14,2) generated always as (greatest(paid-total,0)) stored;

create or replace function public.pos_require_retail_profile_v1(p_brand text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from pos_business_profiles where brand_slug=p_brand and nullif(btrim(profile_code),'') is not null and profile_code not in ('restaurant','coffee_shop')) then raise exception 'POS_RETAIL_REQUIRED';end if;
end $$;
revoke all on function public.pos_require_retail_profile_v1(text) from public,anon,authenticated;
grant execute on function public.pos_require_retail_profile_v1(text) to service_role;

create or replace function public.pos_retail_order_quote_v1(p_brand text,p_location uuid,p_items jsonb,p_allow_empty boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare loc pos_locations%rowtype;r pos_retail_rules%rowtype;
begin
 perform pos_require_retail_profile_v1(p_brand);
 if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'POS_ITEMS_INVALID';end if;
 if jsonb_array_length(p_items)>0 then
  if exists(select 1 from jsonb_array_elements(p_items) x join pos_product_variants v on v.id=(x->>'variant_id')::uuid and v.brand_slug=p_brand where v.unit_code='piece' and (x->>'quantity')::numeric<>trunc((x->>'quantity')::numeric)) then raise exception 'POS_WHOLE_PIECES_REQUIRED';end if;
  return pos_retail_quote_v1(p_brand,p_location,p_items);
 end if;
 select * into r from pos_retail_rules where brand_slug=p_brand;
 if not p_allow_empty or not r.orders_enabled then raise exception 'POS_ITEMS_INVALID';end if;
 select * into loc from pos_locations where id=p_location and brand_slug=p_brand and active;
 if not found then raise exception 'POS_LOCATION_INVALID';end if;
 return jsonb_build_object('items','[]'::jsonb,'total',0,'subtotal',0,'tax_total',0,'discount_total',0,'currency',loc.currency,'pricing_mode',r.pricing_mode,'wholesale_enabled',r.wholesale_enabled);
end $$;
revoke all on function public.pos_retail_order_quote_v1(text,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.pos_retail_order_quote_v1(text,uuid,jsonb,boolean) to service_role;

-- Only the authorized business opts into open boxes. No global money/term changes.
update public.pos_retail_rules set open_box=true where brand_slug='magenta-fitwear'
 and exists(select 1 from public.pos_business_profiles where brand_slug='magenta-fitwear' and profile_code not in ('restaurant','coffee_shop'));
-- Correct the active Magenta boxes too, without changing dates or accepted terms.
-- Stop if the legacy unresolved amount has another meaning; never repair blindly.
do $$ begin
 if exists(select 1 from pos_retail_orders where brand_slug='magenta-fitwear' and state='active' and unresolved<>greatest(paid-total,0)) then raise exception 'POS_OPEN_BOX_BALANCE_CONFLICT';end if;
 update pos_retail_orders set open_box=true,unresolved=0 where brand_slug='magenta-fitwear' and state='active'
 and exists(select 1 from pos_retail_rules where brand_slug='magenta-fitwear' and open_box);
end $$;

create or replace function public.pos_retail_order_action_v1(p_brand text,p_actor uuid,p_staff uuid,p_id uuid,p_action text,p_request uuid,p_body jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare o pos_retail_orders%rowtype;e pos_retail_order_events%rowtype;rules pos_retail_rules%rowtype;
 q jsonb;result jsonb;cash pos_cash_sessions%rowtype;staff pos_staff%rowtype;location uuid;customer uuid;
 amount numeric;method text;tendered numeric;movement uuid;payment uuid;sale jsonb; old_items jsonb;
begin
 if p_request is null or p_id is null or p_actor is null or p_staff is null then raise exception 'POS_REQUEST_INVALID';end if;
 perform public.pos_require_retail_profile_v1(p_brand);
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
  q:=pos_retail_order_quote_v1(p_brand,location,p_body->'items',case when o.state='active' then o.open_box else rules.open_box end);
  if o.state is distinct from 'active' and exists(select 1 from jsonb_array_elements(q->'items') x left join pos_inventory i on i.variant_id=(x->>'variant_id')::uuid and i.location_id=location and i.brand_slug=p_brand where (x->>'track_inventory')::boolean and (x->>'quantity')::numeric>coalesce(i.quantity-i.reserved_quantity,0)) then raise exception 'POS_INVENTORY_UNAVAILABLE';end if;
  if (q->>'total')::numeric<=0 and not (case when o.state='active' then o.open_box else rules.open_box end) then raise exception 'POS_ORDER_TOTAL_INVALID';end if;
  if o.state='active' then
   perform pos_retail_reserve_v1(p_brand,location,o.quote->'items',q->'items');
   if o.expires_at<=clock_timestamp() then
    perform pos_retail_reserve_v1(p_brand,location,q->'items',o.quote->'items');
    perform pos_retail_expire_one_v1(o.id);return jsonb_build_object('expired',true,'id',o.id);
   end if;
  end if;
  if o.id is null then
   insert into pos_retail_orders(id,brand_slug,location_id,customer_id,contact,items,quote,total,created_by,staff_id) values(p_id,p_brand,location,customer,btrim(p_body->>'contact'),p_body->'items',q,(q->>'total')::numeric,p_actor,p_staff) returning * into o;
  else
   update pos_retail_orders set customer_id=customer,contact=btrim(p_body->>'contact'),items=p_body->'items',quote=q,total=(q->>'total')::numeric,unresolved=case when state='active' and open_box then 0 when state='active' then greatest(paid-(q->>'total')::numeric,0) else unresolved end,revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into o;
  end if;
 else
  if o.id is null then raise exception 'POS_ORDER_NOT_FOUND';end if;
  if o.revision<>coalesce((p_body->>'revision')::integer,0) then raise exception 'POS_ORDER_CHANGED';end if;
  if p_action='cancel' then
   if o.open_box and o.paid>0 and (coalesce(p_body->>'balance_resolution','')<>'pending' or length(btrim(coalesce(p_body->>'resolution_reason','')))<3) then raise exception 'POS_BALANCE_RESOLUTION_REQUIRED';end if;
   if length(btrim(coalesce(p_body->>'reason',''))) < 3 then raise exception 'POS_REASON_REQUIRED';end if;
   if o.state not in ('note','active') then raise exception 'POS_ORDER_NOT_EDITABLE';end if;
   if o.state='active' then perform pos_retail_reserve_v1(p_brand,o.location_id,o.quote->'items','[]');end if;
   update pos_retail_orders set state='cancelled',unresolved=paid,revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into o;
  elsif p_action='deliver' then
   if o.state<>'settled' or o.delivered_at is not null then raise exception 'POS_DELIVERY_INVALID';end if;
   update pos_retail_orders set delivered_at=clock_timestamp(),delivered_by=p_staff,revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into o;
  elsif p_action in ('activate','pay','settle','convert') then
   if (p_action in ('activate','convert') and o.state<>'note') or (p_action in ('pay','settle') and o.state<>'active') then raise exception 'POS_ORDER_STATE_INVALID';end if;
   q:=pos_retail_order_quote_v1(p_brand,o.location_id,o.items,case when o.state='active' then o.open_box else rules.open_box end);
   if p_body->'expected_quote' is null or q<>p_body->'expected_quote' then return jsonb_build_object('prices_changed',true,'quote',q,'id',o.id);end if;
   if p_action='activate' and (p_body->'accepted_policy' is distinct from to_jsonb(rules)) then return jsonb_build_object('policy_changed',true,'policy',to_jsonb(rules));end if;
   select * into cash from pos_cash_sessions where id=(p_body->>'cash_session_id')::uuid and brand_slug=p_brand and location_id=o.location_id and status='open' for update;
   if not found then raise exception 'POS_CASH_SESSION_NOT_OPEN';end if;
   -- A wait for the cash-session lock may cross the deadline.
   if o.state='active' and o.expires_at<=clock_timestamp() then perform pos_retail_expire_one_v1(o.id);return jsonb_build_object('expired',true,'id',o.id);end if;
   amount:=(p_body->>'amount')::numeric;method:=p_body->>'method';tendered:=coalesce((p_body->>'tendered')::numeric,amount);
   if amount is null or (amount<0 or amount=0 and not (p_action='settle' and o.paid>=(q->>'total')::numeric)) or amount<>round(amount,2) or method not in ('cash','card','transfer') or method is null or tendered<amount or tendered<>round(tendered,2) or (method<>'cash' and tendered<>amount) then raise exception 'POS_PAYMENT_INVALID';end if;
   if p_action='activate' and (amount<rules.minimum_deposit or not rules.open_box and amount>=(q->>'total')::numeric) then raise exception 'POS_INITIAL_DEPOSIT_INVALID';end if;
   if p_action='pay' and not o.open_box and amount>=(q->>'total')::numeric-o.paid then raise exception 'POS_USE_SETTLEMENT';end if;
   if p_action in ('settle','convert') and amount<>greatest((q->>'total')::numeric-o.paid,0) then raise exception 'POS_BALANCE_CHANGED';end if;
   if p_action in ('settle','convert') and (q->>'total')::numeric<=0 then raise exception 'POS_ORDER_TOTAL_INVALID';end if;
   if p_action='settle' and o.open_box and o.paid>(q->>'total')::numeric and (coalesce(p_body->>'balance_resolution','')<>'pending' or length(btrim(coalesce(p_body->>'resolution_reason','')))<3) then raise exception 'POS_BALANCE_RESOLUTION_REQUIRED';end if;
   if p_action='activate' then
    perform pos_retail_reserve_v1(p_brand,o.location_id,'[]',q->'items');
    update pos_retail_orders set state='active',open_box=rules.open_box,activated_at=clock_timestamp(),expires_at=clock_timestamp()+make_interval(days=>rules.validity_days),policy_snapshot=to_jsonb(rules) where id=p_id;
   elsif o.state='active' then
    perform pos_retail_reserve_v1(p_brand,o.location_id,o.quote->'items',q->'items');
   end if;
   if o.state='active' and o.expires_at<=clock_timestamp() then
    perform pos_retail_reserve_v1(p_brand,o.location_id,q->'items',o.quote->'items');
    perform pos_retail_expire_one_v1(o.id);return jsonb_build_object('expired',true,'id',o.id);
   end if;
   if amount>0 then
   if method='cash' then
    insert into pos_cash_movements(brand_id,brand_slug,cash_session_id,movement_type,amount,reason,created_by) values(cash.brand_id,p_brand,cash.id,'deposit',amount,'Apartado '||o.folio||' · anticipo/abono recibido',p_actor) returning id into movement;
   end if;
   insert into pos_retail_order_payments(order_id,brand_slug,cash_session_id,staff_id,host_user_id,method,amount,tendered,change,reference,cash_movement_id,request_key) values(p_id,p_brand,cash.id,p_staff,p_actor,method,amount,tendered,tendered-amount,left(p_body->>'reference',200),movement,p_request) returning id into payment;
   end if; -- no payment or cash movement for a zero-balance settlement
   if p_action in ('settle','convert') then
    if o.state='active' then perform pos_retail_reserve_v1(p_brand,o.location_id,q->'items','[]');end if;
    sale:=pos_complete_retail_sale_v1(p_brand,o.location_id,cash.register_id,cash.id,o.customer_id,o.items,jsonb_build_array(jsonb_build_object('method','other','amount',(q->>'total')::numeric,'tendered_amount',(q->>'total')::numeric,'metadata',jsonb_build_object('retail_order_id',o.id,'prepaid',true),'reference','Aplicación de abonos '||o.folio)),'Liquidación de pedido '||o.folio,p_actor,null,o.id,null,null,p_staff,q);
    update pos_retail_orders set state='settled',sale_id=(sale->>'id')::uuid where id=p_id;
   end if;
   update pos_retail_orders set paid=paid+amount,total=(q->>'total')::numeric,quote=q,unresolved=case when state='active' and open_box then 0 else greatest(paid+amount-(q->>'total')::numeric,0) end,revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into o;
  else raise exception 'POS_ACTION_INVALID';end if;
 end if;
 result:=jsonb_build_object('order',to_jsonb(o),'payment_id',payment);
 insert into pos_retail_order_events(order_id,brand_slug,action,request_key,payload,result,host_user_id,staff_id) values(p_id,p_brand,p_action,p_request,p_body,result,p_actor,p_staff);
 return result;
end $$;
revoke all on function public.pos_retail_order_action_v1(text,uuid,uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pos_retail_order_action_v1(text,uuid,uuid,uuid,text,uuid,jsonb) to service_role;

create or replace function public.pos_retail_rules_save_v1(p_brand text,p_actor uuid,p_body jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r pos_retail_rules%rowtype;product uuid;variant uuid;amount numeric;
begin
 perform public.pos_require_retail_profile_v1(p_brand);
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
  update pos_retail_rules set open_box=coalesce((p_body->>'open_box')::boolean,r.open_box),pricing_mode=coalesce(p_body->>'pricing_mode',r.pricing_mode),per_piece_discount=coalesce((p_body->>'per_piece_discount')::numeric,r.per_piece_discount),wholesale_enabled=(p_body->>'wholesale_enabled')::boolean,minimum_pieces=(p_body->>'minimum_pieces')::integer,grouping=p_body->>'grouping',combine_variants=(p_body->>'combine_variants')::boolean,orders_enabled=(p_body->>'orders_enabled')::boolean,minimum_deposit=(p_body->>'minimum_deposit')::numeric,validity_days=(p_body->>'validity_days')::integer,retained_deposit=(p_body->>'retained_deposit')::numeric,policy=p_body->>'policy',updated_at=now(),updated_by=p_actor where brand_slug=p_brand returning * into r;
 end if;
 return to_jsonb(r);
end $$;
commit;
