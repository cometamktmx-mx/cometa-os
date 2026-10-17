begin;
-- Additive search API; authorization and location are resolved by the route.
create or replace function public.pos_order_search_text_v1(value text) returns text
language sql immutable parallel safe set search_path=public as $$
 select translate(lower(normalize(coalesce(value,''),NFC)),'áéíóúüñ','aeiouun')
$$;
create or replace function public.pos_retail_orders_list_v1(p_brand text,p_location uuid,p_search text,p_filter text,p_sort text,p_page integer,p_size integer) returns jsonb
language sql stable security definer set search_path=public as $$
 with filtered as (
 select o.*,concat_ws(' ',c.first_name,c.last_name) as customer_name
 from pos_retail_orders o left join pos_customers c on c.id=o.customer_id and c.brand_slug=o.brand_slug
 where o.brand_slug=p_brand and (p_location is null or o.location_id=p_location)
 and (coalesce(p_search,'')='' or strpos(pos_order_search_text_v1(concat_ws(' ',o.folio,c.first_name,c.last_name)),pos_order_search_text_v1(p_search))>0)
 and (p_filter='all' or p_filter='notes' and o.state='note' or p_filter='active' and o.state='active' or p_filter='expired' and o.state='expired' or p_filter='finished' and o.state in ('settled','cancelled'))
 ), page as (
 select * from filtered order by case when p_sort='expiry' then expires_at end asc nulls last,updated_at desc,id desc
 limit least(greatest(p_size,1),50) offset (greatest(p_page,1)-1)*least(greatest(p_size,1),50)
 ) select jsonb_build_object('orders',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),'total',(select count(*) from filtered));
$$;
revoke all on function public.pos_retail_orders_list_v1(text,uuid,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.pos_retail_orders_list_v1(text,uuid,text,text,text,integer,integer) to service_role;
create index if not exists pos_retail_order_activity on public.pos_retail_orders(brand_slug,updated_at desc,id desc);
-- Function replacement follows below; no historical rows or payments are rewritten.

create or replace function public.pos_retail_order_action_v1(p_brand text,p_actor uuid,p_staff uuid,p_id uuid,p_action text,p_request uuid,p_body jsonb) returns jsonb
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
  if (q->>'total')::numeric<=0 then raise exception 'POS_ORDER_TOTAL_INVALID';end if;
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
   update pos_retail_orders set customer_id=customer,contact=btrim(p_body->>'contact'),items=p_body->'items',quote=q,total=(q->>'total')::numeric,unresolved=case when state='active' then greatest(paid-(q->>'total')::numeric,0) else unresolved end,revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into o;
  end if;
 else
  if o.id is null then raise exception 'POS_ORDER_NOT_FOUND';end if;
  if o.revision<>coalesce((p_body->>'revision')::integer,0) then raise exception 'POS_ORDER_CHANGED';end if;
  if p_action='cancel' then
   if length(btrim(coalesce(p_body->>'reason',''))) < 3 then raise exception 'POS_REASON_REQUIRED';end if;
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
   if amount is null or (amount<0 or amount=0 and not (p_action='settle' and o.paid>=(q->>'total')::numeric)) or amount<>round(amount,2) or method not in ('cash','card','transfer') or method is null or tendered<amount or tendered<>round(tendered,2) or (method<>'cash' and tendered<>amount) then raise exception 'POS_PAYMENT_INVALID';end if;
   if p_action='activate' and (amount<rules.minimum_deposit or amount>=(q->>'total')::numeric) then raise exception 'POS_INITIAL_DEPOSIT_INVALID';end if;
   if p_action='pay' and amount>=(q->>'total')::numeric-o.paid then raise exception 'POS_USE_SETTLEMENT';end if;
   if p_action in ('settle','convert') and amount<>greatest((q->>'total')::numeric-o.paid,0) then raise exception 'POS_BALANCE_CHANGED';end if;
   if p_action='activate' then
    perform pos_retail_reserve_v1(p_brand,o.location_id,'[]',q->'items');
    update pos_retail_orders set state='active',activated_at=clock_timestamp(),expires_at=clock_timestamp()+make_interval(days=>rules.validity_days),policy_snapshot=to_jsonb(rules) where id=p_id;
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
   update pos_retail_orders set paid=paid+amount,total=(q->>'total')::numeric,quote=q,unresolved=greatest(paid+amount-(q->>'total')::numeric,0),revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into o;
  else raise exception 'POS_ACTION_INVALID';end if;
 end if;
 result:=jsonb_build_object('order',to_jsonb(o),'payment_id',payment);
 insert into pos_retail_order_events(order_id,brand_slug,action,request_key,payload,result,host_user_id,staff_id) values(p_id,p_brand,p_action,p_request,p_body,result,p_actor,p_staff);
 return result;
end $$;
revoke all on function public.pos_retail_order_action_v1(text,uuid,uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pos_retail_order_action_v1(text,uuid,uuid,uuid,text,uuid,jsonb) to service_role;

commit;
