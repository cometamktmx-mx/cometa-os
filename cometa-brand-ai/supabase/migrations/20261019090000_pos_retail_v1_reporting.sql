begin;
alter table public.pos_cash_movements add column reverses_movement_id uuid references public.pos_cash_movements(id);
create unique index pos_cash_movement_reversed_once on public.pos_cash_movements(reverses_movement_id) where reverses_movement_id is not null;
-- Metadata/audit only: these events never create a second monetary entry.
create table public.pos_retail_verifications (
 id uuid primary key default gen_random_uuid(), brand_slug text not null,
 source text not null check(source in ('sale','order')), payment_id uuid not null,
 verified boolean not null, reference text not null, reason text not null,
 staff_id uuid not null references public.pos_staff(id), host_user_id uuid not null,
 request_key uuid not null, created_at timestamptz not null default clock_timestamp(),
 unique(brand_slug,request_key)
);
create table public.pos_retail_followups (
 id uuid primary key default gen_random_uuid(), brand_slug text not null,
 order_id uuid not null references public.pos_retail_orders(id), note text not null,
 responsible_id uuid not null references public.pos_staff(id), due_at timestamptz not null,
 completed_at timestamptz, completed_by uuid, created_by uuid not null,
 request_key uuid not null, created_at timestamptz not null default clock_timestamp(),
 unique(brand_slug,request_key)
);
alter table public.pos_retail_verifications enable row level security;
alter table public.pos_retail_followups enable row level security;
revoke all on public.pos_retail_verifications,public.pos_retail_followups from public,anon,authenticated;
grant all on public.pos_retail_verifications,public.pos_retail_followups to service_role;

-- Payment date is independent of sale completion and delivery. The canonical
-- prepaid sale payment is an application of money already received, not income.
create view public.pos_retail_money_v1 as
select 'sale'::text source,p.id,s.brand_slug,s.location_id,s.register_id,s.cash_session_id,
 s.cashier_staff_id staff_id,s.customer_id,s.id sale_id,null::uuid order_id,s.sale_number folio,
 'sale_receipt'::text concept,p.payment_method method,p.amount,p.created_at effective_at,
 p.reference,s.status source_status
from public.pos_payments p join public.pos_sales s on s.id=p.sale_id and s.brand_slug=p.brand_slug
where coalesce(p.metadata->>'prepaid','false')<>'true'
 and not exists(select 1 from public.pos_retail_orders o where o.sale_id=s.id and o.brand_slug=s.brand_slug)
 and not exists(select 1 from public.pos_food_payments f where f.finalized_sale_id=s.id and f.brand_slug=s.brand_slug)
union all
select 'order',p.id,p.brand_slug,o.location_id,c.register_id,p.cash_session_id,p.staff_id,
 o.customer_id,o.sale_id,o.id,o.folio,
 case e.action when 'activate' then 'initial_deposit' when 'settle' then 'settlement' when 'convert' then 'sale_receipt' else 'installment' end,
 p.method,p.amount,p.created_at,p.reference,o.state
from public.pos_retail_order_payments p join public.pos_retail_orders o on o.id=p.order_id and o.brand_slug=p.brand_slug
join public.pos_cash_sessions c on c.id=p.cash_session_id and c.brand_slug=p.brand_slug
left join public.pos_retail_order_events e on e.order_id=p.order_id and e.request_key=p.request_key and e.brand_slug=p.brand_slug
union all
select 'movement',m.id,m.brand_slug,c.location_id,c.register_id,c.id,
 m.performed_by_staff_id,null::uuid,null::uuid,null::uuid,c.id::text,
 case when m.reverses_movement_id is not null then 'manual_reversal' else 'manual_'||m.movement_type end,'cash',case when m.movement_type in ('expense','withdrawal') then -m.amount else m.amount end,
 m.created_at,m.reason,c.status
from public.pos_cash_movements m join public.pos_cash_sessions c on c.id=m.cash_session_id and c.brand_slug=m.brand_slug
where not exists(select 1 from public.pos_retail_order_payments p where p.cash_movement_id=m.id and p.brand_slug=m.brand_slug);
revoke all on public.pos_retail_money_v1 from public,anon,authenticated;
grant select on public.pos_retail_money_v1 to service_role;

create function public.pos_retail_verify_transfer_v1(p_brand text,p_actor uuid,p_staff uuid,p_source text,p_payment uuid,p_verified boolean,p_reference text,p_reason text,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare m record;old pos_retail_verifications%rowtype;r pos_retail_verifications%rowtype;
begin
 perform pos_require_retail_profile_v1(p_brand);
 if p_request is null or p_verified is null or length(btrim(p_reason)) not between 3 and 1000 or length(btrim(p_reference)) not between 1 and 200 then raise exception 'POS_REQUEST_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('verify:'||p_brand||p_request,0));
 select * into old from pos_retail_verifications where brand_slug=p_brand and request_key=p_request;
 if found then
  if old.source<>p_source or old.payment_id<>p_payment or old.verified<>p_verified or old.reference<>p_reference or old.reason<>p_reason or old.staff_id<>p_staff then raise exception 'POS_IDEMPOTENCY_CONFLICT';end if;
  return to_jsonb(old);
 end if;
 select * into m from pos_retail_money_v1 where brand_slug=p_brand and source=p_source and id=p_payment and method='transfer';
 if not found then raise exception 'POS_NOT_FOUND';end if;
 if not exists(select 1 from pos_staff where id=p_staff and brand_slug=p_brand and active and (location_id is null or location_id=m.location_id)) then raise exception 'POS_STAFF_LOCATION_FORBIDDEN';end if;
 insert into pos_retail_verifications(brand_slug,source,payment_id,verified,reference,reason,staff_id,host_user_id,request_key)
 values(p_brand,p_source,p_payment,p_verified,p_reference,p_reason,p_staff,p_actor,p_request) returning * into r;
 return to_jsonb(r);
end $$;
revoke all on function public.pos_retail_verify_transfer_v1(text,uuid,uuid,text,uuid,boolean,text,text,uuid) from public,anon,authenticated;
grant execute on function public.pos_retail_verify_transfer_v1(text,uuid,uuid,text,uuid,boolean,text,text,uuid) to service_role;

-- Future Retail cuts use the same source as the money report. Closed snapshots
-- remain untouched. The existing FOOD closing function is retained verbatim.
do $$ declare body text;anchor text;begin
 body:=pg_get_functiondef('public.pos_close_cash_session(text,uuid,numeric,uuid,text)'::regprocedure);
 anchor:='  v_expected :=';
 if strpos(body,anchor)=0 then raise exception 'RETAIL_CLOSE_ANCHOR_MISSING';end if;
 body:=replace(body,anchor,'  if exists(select 1 from pos_business_profiles where brand_slug=p_brand_slug and profile_code not in (''restaurant'',''coffee_shop'')) then
    select coalesce(sum(amount),0) into v_cash_sales from pos_retail_money_v1 where brand_slug=p_brand_slug and cash_session_id=v_session.id and method=''cash'';
    v_cash_movements:=0;
  end if;
  v_expected :=');
 execute body;
end $$;
create function public.pos_retail_report_v1(p_brand text,p_from date,p_to date,p_location uuid default null,p_staff uuid default null,p_register uuid default null,p_session uuid default null,p_method text default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare z text; start_at timestamptz;end_at timestamptz;result jsonb;
begin
 perform pos_require_retail_profile_v1(p_brand);
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'POS_REPORTS_INVALID_RANGE';end if;
 if (select count(distinct timezone) from pos_locations where brand_slug=p_brand and (p_location is null or id=p_location))>1 then raise exception 'POS_REPORTS_SELECT_LOCATION_TIMEZONE';end if;
 select min(timezone) into z from pos_locations where brand_slug=p_brand and (p_location is null or id=p_location);
 if z is null then raise exception 'POS_LOCATION_INVALID';end if;
 if (select count(distinct currency) from pos_locations where brand_slug=p_brand and (p_location is null or id=p_location))>1 then raise exception 'POS_REPORTS_SELECT_LOCATION_TIMEZONE';end if;
 start_at:=p_from::timestamp at time zone z;end_at:=(p_to+1)::timestamp at time zone z;
 with sales as (
  select s.*,coalesce((select sum((x->>'discount_amount')::numeric) from pos_retail_sale_requests r cross join lateral jsonb_array_elements(r.payload->'items') x where r.brand_slug=s.brand_slug and r.request_key=s.idempotency_key),0) manual_discount,
   exists(select 1 from pos_retail_sale_requests r where r.brand_slug=s.brand_slug and r.request_key=s.idempotency_key) discount_identified
  from pos_sales s where s.brand_slug=p_brand and s.sold_at>=start_at and s.sold_at<end_at
   and (p_location is null or s.location_id=p_location) and (p_staff is null or s.cashier_staff_id=p_staff)
   and (p_register is null or s.register_id=p_register) and (p_session is null or s.cash_session_id=p_session)
 ), money as (
  select m.*,coalesce(v.verified,false) verified,v.reference verification_reference,v.created_at verified_at,v.staff_id verified_by
  from pos_retail_money_v1 m left join lateral (select * from pos_retail_verifications v where v.brand_slug=p_brand and v.source=m.source and v.payment_id=m.id order by v.created_at desc,v.id desc limit 1) v on true
  where m.brand_slug=p_brand and m.effective_at>=start_at and m.effective_at<end_at
   and (p_location is null or m.location_id=p_location) and (p_staff is null or m.staff_id=p_staff)
   and (p_register is null or m.register_id=p_register) and (p_session is null or m.cash_session_id=p_session)
   and (p_method is null or m.method=p_method)
 ), orders as (
  select o.*,concat_ws(' ',c.first_name,c.last_name) customer_name,
   (select coalesce(sum((x->>'quantity')::numeric),0) from jsonb_array_elements(o.items)x) pieces
  from pos_retail_orders o left join pos_customers c on c.id=o.customer_id and c.brand_slug=o.brand_slug
  where o.brand_slug=p_brand and (p_location is null or o.location_id=p_location) and (p_staff is null or o.staff_id=p_staff)
 ), inventory as (
  select i.id,i.location_id,i.variant_id,v.product_id,p.name product_name,v.name variant_name,v.sku,i.quantity,i.reserved_quantity,
   i.quantity-i.reserved_quantity available,i.minimum_quantity,
   coalesce((select sum(abs(m.quantity_delta)) from pos_inventory_movements m where m.brand_slug=p_brand and m.location_id=i.location_id and m.variant_id=i.variant_id and m.created_at>=start_at and m.created_at<end_at),0) movement_quantity
  from pos_inventory i join pos_product_variants v on v.id=i.variant_id and v.brand_slug=i.brand_slug join pos_products p on p.id=v.product_id and p.brand_slug=v.brand_slug
  where i.brand_slug=p_brand and (p_location is null or i.location_id=p_location)
 ), sessions as (
  select c.*,c.opening_amount+coalesce((select sum(m.amount) from pos_retail_money_v1 m where m.brand_slug=p_brand and m.cash_session_id=c.id and m.method='cash'),0) calculated_expected,
   coalesce((select jsonb_agg(to_jsonb(m)) from pos_retail_money_v1 m where m.brand_slug=p_brand and m.cash_session_id=c.id),'[]') movements
  from pos_cash_sessions c where c.brand_slug=p_brand and (p_location is null or c.location_id=p_location)
   and (p_register is null or c.register_id=p_register) and (p_session is null or c.id=p_session)
   and (p_staff is null or c.opening_staff_id=p_staff or c.closed_by_staff_id=p_staff)
   and (c.opened_at>=start_at and c.opened_at<end_at or exists(select 1 from money m where m.cash_session_id=c.id))
 )
 select jsonb_build_object('timezone',z,'from',start_at,'to',end_at,'asOf',now(),
 'sales',coalesce((select jsonb_agg(to_jsonb(s)-'idempotency_fingerprint'-'notes') from sales s),'[]'),
 'items',coalesce((select jsonb_agg(to_jsonb(i)) from pos_sale_items i join sales s on s.id=i.sale_id and s.brand_slug=i.brand_slug),'[]'),
 'money',coalesce((select jsonb_agg(to_jsonb(m)) from money m),'[]'),
 'orders',coalesce((select jsonb_agg(to_jsonb(o)-'contact'-'created_by') from orders o),'[]'),
 'inventory',coalesce((select jsonb_agg(to_jsonb(i)) from inventory i),'[]'),
 'inventoryMovements',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'variant_id',m.variant_id,'location_id',m.location_id,'movement_type',m.movement_type,'quantity_delta',m.quantity_delta,'created_at',m.created_at,'reference_id',m.reference_id)) from pos_inventory_movements m where m.brand_slug=p_brand and (p_location is null or m.location_id=p_location) and m.created_at>=start_at and m.created_at<end_at),'[]'),
 'sessions',coalesce((select jsonb_agg(to_jsonb(c)) from sessions c),'[]'),
 'locations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'timezone',timezone,'currency',currency)) from pos_locations where brand_slug=p_brand and (p_location is null or id=p_location)),'[]'),
 'staff',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from pos_staff where brand_slug=p_brand and (p_location is null or location_id is null or location_id=p_location)),'[]'),
 'registers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from pos_registers where brand_slug=p_brand and (p_location is null or location_id=p_location)),'[]'),
 'verifications',coalesce((select jsonb_agg(to_jsonb(v)) from pos_retail_verifications v join money m on m.id=v.payment_id and m.source=v.source where v.brand_slug=p_brand),'[]')) into result;
 if octet_length(result::text)>15000000 then raise exception 'POS_REPORTS_REDUCE_RANGE';end if;
 return result;
end $$;
revoke all on function public.pos_retail_report_v1(text,date,date,uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.pos_retail_report_v1(text,date,date,uuid,uuid,uuid,uuid,text) to service_role;
alter table public.pos_retail_rules add column allow_active_content_changes boolean not null default true,
 add column ordinary_returns_allowed boolean not null default true;
update public.pos_retail_rules set ordinary_returns_allowed=false where brand_slug='magenta-fitwear';
do $$ declare body text;begin
 body:=pg_get_functiondef('public.pos_retail_order_action_v1(text,uuid,uuid,uuid,text,uuid,jsonb)'::regprocedure);
 if strpos(body,'if p_action=''save'' then')=0 then raise exception 'RETAIL_EDIT_ANCHOR_MISSING';end if;
 body:=replace(body,'if p_action=''save'' then','if p_action=''save'' then
  if o.state=''active'' and not coalesce((o.policy_snapshot->>''allow_active_content_changes'')::boolean,true) then raise exception ''POS_ORDER_NOT_EDITABLE'';end if;
  old_items:=o.items;');
 body:=replace(body,'''payment_id'',payment);','''payment_id'',payment,''before_items'',old_items);');
 execute body;
 body:=pg_get_functiondef('public.pos_retail_rules_save_v1(text,uuid,jsonb)'::regprocedure);
 if strpos(body,'set open_box=')=0 then raise exception 'RETAIL_RULES_ANCHOR_MISSING';end if;
 body:=replace(body,'set open_box=','set allow_active_content_changes=coalesce((p_body->>''allow_active_content_changes'')::boolean,r.allow_active_content_changes),ordinary_returns_allowed=coalesce((p_body->>''ordinary_returns_allowed'')::boolean,r.ordinary_returns_allowed),open_box=');
 execute body;
 body:=pg_get_functiondef('public.pos_retail_orders_list_v1(text,uuid,text,text,text,integer,integer)'::regprocedure);
 body:=replace(body,'o.folio,c.first_name,c.last_name','o.folio,c.first_name,c.last_name,c.phone,o.contact');
 body:=replace(body,'p_filter=''all'' or','p_filter=''all'' or p_filter=''soon'' and o.state=''active'' and o.expires_at<=now()+interval ''3 days'' or');
 execute body;
end $$;

create function public.pos_retail_followup_v1(p_brand text,p_actor uuid,p_staff uuid,p_order uuid,p_body jsonb,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare o pos_retail_orders%rowtype;f pos_retail_followups%rowtype;
begin
 perform pos_require_retail_profile_v1(p_brand);
 select * into o from pos_retail_orders where id=p_order and brand_slug=p_brand for update;
 if not found then raise exception 'POS_ORDER_NOT_FOUND';end if;
 if not exists(select 1 from pos_staff where id=p_staff and brand_slug=p_brand and active and (location_id is null or location_id=o.location_id)) then raise exception 'POS_STAFF_LOCATION_FORBIDDEN';end if;
 if p_body->>'action'='complete' then
  select * into f from pos_retail_followups where id=(p_body->>'id')::uuid and order_id=p_order and brand_slug=p_brand for update;
  if not found then raise exception 'POS_NOT_FOUND';end if;
  if f.completed_at is null then update pos_retail_followups set completed_at=clock_timestamp(),completed_by=p_staff where id=f.id returning * into f;end if;
 else
  select * into f from pos_retail_followups where brand_slug=p_brand and request_key=p_request;
  if found then
   if f.order_id<>p_order or f.note<>p_body->>'note' or f.responsible_id<>(p_body->>'responsible_id')::uuid or f.due_at<>(p_body->>'due_at')::timestamptz then raise exception 'POS_IDEMPOTENCY_CONFLICT';end if;
   return to_jsonb(f);
  end if;
  if p_request is null or coalesce(length(btrim(p_body->>'note')),0) not between 3 and 2000 or p_body->>'due_at' is null then raise exception 'POS_REQUEST_INVALID';end if;
  if not exists(select 1 from pos_staff where id=(p_body->>'responsible_id')::uuid and brand_slug=p_brand and active and (location_id is null or location_id=o.location_id)) then raise exception 'POS_STAFF_LOCATION_FORBIDDEN';end if;
  insert into pos_retail_followups(brand_slug,order_id,note,responsible_id,due_at,created_by,request_key)
  values(p_brand,p_order,btrim(p_body->>'note'),(p_body->>'responsible_id')::uuid,(p_body->>'due_at')::timestamptz,p_staff,p_request) returning * into f;
 end if;
 return to_jsonb(f);
end $$;
revoke all on function public.pos_retail_followup_v1(text,uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.pos_retail_followup_v1(text,uuid,uuid,uuid,jsonb,uuid) to service_role;
-- Reuse the proven serialized cash command and audit format, replacing only
-- FOOD actor/authorization resolution with the explicit Retail permissions.
do $$ declare body text;old text;begin
 body:=pg_get_functiondef('public.pos_cash_command_v2(text,uuid,uuid,text,jsonb,uuid,text)'::regprocedure);
 body:=replace(body,'pos_cash_command_v2','pos_retail_cash_command_v1');
 old:='actor:=public.pos_food_actor_v1(p_brand_slug,p_host_user_id,p_session_id);';
 if strpos(body,old)=0 then raise exception 'RETAIL_CASH_ACTOR_ANCHOR_MISSING';end if;
 body:=replace(body,old,'perform pos_require_retail_profile_v1(p_brand_slug);
 select st.* into actor from pos_staff st join pos_staff_sessions ss on ss.staff_id=st.id and ss.brand_slug=st.brand_slug
 where ss.id=p_session_id and ss.brand_slug=p_brand_slug and ss.host_user_id=p_host_user_id and ss.revoked_at is null and ss.expires_at>clock_timestamp() and st.active
 and ss.last_human_at>clock_timestamp()-interval ''3 minutes'';
 if not found or not (coalesce(actor.retail_permissions,case when actor.role=''ADMIN'' then array[''CASH'',''SETTINGS''] when actor.role in (''CASHIER'',''MANAGER'') then array[''CASH''] else array[]::text[] end) @> array[''CASH'']) then raise exception ''POS_STAFF_PERMISSION_REQUIRED'';end if;');
 -- Existing adjustment branch contains nested validation; replace exact block.
 old:=substring(body from '(?s)if adjustment and not public.pos_staff_has_any_role_v1.*?auth_id:=.*?end if;');
 if old is null then raise exception 'RETAIL_CASH_ADJUST_ANCHOR_MISSING';end if;
 body:=replace(body,old,'if adjustment then
 if not (coalesce(actor.retail_permissions,case when actor.role=''ADMIN'' then array[''SETTINGS''] else array[]::text[] end) @> array[''SETTINGS'']) then raise exception ''POS_STAFF_PERMISSION_REQUIRED'';end if;
 auth_id:=actor.id;
 end if;');
 body:=replace(body,'performed_by_staff_id,authorized_by_staff_id,request_key)','performed_by_staff_id,authorized_by_staff_id,request_key,reverses_movement_id)');
 body:=replace(body,'actor.id,auth_id,p_key) returning','actor.id,auth_id,p_key,(p_payload->>''reversesMovementId'')::uuid) returning');
 execute body;
end $$;
revoke all on function public.pos_retail_cash_command_v1(text,uuid,uuid,text,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.pos_retail_cash_command_v1(text,uuid,uuid,text,jsonb,uuid,text) to service_role;
create function public.pos_retail_cash_totals_v1(p_brand text,p_sessions uuid[]) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;begin
 perform pos_require_retail_profile_v1(p_brand);
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (
 select c.id,c.opening_amount+coalesce(sum(m.amount) filter(where m.method='cash'),0) expected,
 coalesce(sum(m.amount) filter(where m.source='sale' and m.method='cash'),0) cash_sales,
 coalesce(sum(m.amount) filter(where m.source='sale' and m.method='card'),0) card_sales,
 coalesce(sum(m.amount) filter(where m.source='sale' and m.method='transfer'),0) transfer_sales,
 coalesce(sum(m.amount) filter(where m.source='sale' and m.method='wallet'),0) wallet_sales,
 coalesce(sum(m.amount) filter(where m.source='sale' and m.method='other'),0) other_sales,
 coalesce(sum(m.amount) filter(where m.source='order' and m.method='cash'),0) order_cash,
 coalesce(sum(m.amount) filter(where m.source='order' and m.method='card'),0) order_card,
 coalesce(sum(m.amount) filter(where m.source='order' and m.method='transfer'),0) order_transfer
 from pos_cash_sessions c left join pos_retail_money_v1 m on m.cash_session_id=c.id and m.brand_slug=c.brand_slug
 where c.brand_slug=p_brand and c.id=any(p_sessions) group by c.id) x;
 return result;
end $$;
revoke all on function public.pos_retail_cash_totals_v1(text,uuid[]) from public,anon,authenticated;
grant execute on function public.pos_retail_cash_totals_v1(text,uuid[]) to service_role;
create function public.pos_retail_reverse_cash_v1(p_brand text,p_actor uuid,p_staff_session uuid,p_movement uuid,p_target_session uuid,p_reason text,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare original pos_cash_movements%rowtype;prior pos_cash_movements%rowtype;target pos_cash_sessions%rowtype;result jsonb;
begin
 perform pos_require_retail_profile_v1(p_brand);
 if length(btrim(coalesce(p_reason,''))) not between 3 and 500 or p_request is null then raise exception 'POS_REASON_REQUIRED';end if;
 select * into original from pos_cash_movements where id=p_movement and brand_slug=p_brand for update;
 if not found or original.reverses_movement_id is not null or exists(select 1 from pos_retail_order_payments where cash_movement_id=original.id) then raise exception 'POS_REVERSAL_NOT_ALLOWED';end if;
 select * into prior from pos_cash_movements where reverses_movement_id=original.id;
 if found then
  if prior.request_key<>p_request or prior.cash_session_id<>p_target_session then raise exception 'POS_ALREADY_REVERSED';end if;
  return to_jsonb(prior);
 end if;
 select * into target from pos_cash_sessions where id=p_target_session and brand_slug=p_brand for update;
 if not found or target.status<>'open' or not exists(select 1 from pos_cash_sessions c where c.id=original.cash_session_id and c.brand_slug=p_brand and c.register_id=target.register_id and c.location_id=target.location_id) then raise exception 'POS_CASH_SESSION_NOT_OPEN';end if;
 result:=pos_retail_cash_command_v1(p_brand,p_actor,p_staff_session,'movement',jsonb_build_object('sessionId',target.id,'movementType',case when original.movement_type in ('income','deposit') then 'expense' else 'income' end,'amount',original.amount,'reason','Reverso de '||original.id||': '||p_reason,'adjustment',true,'reversesMovementId',original.id),p_request);
 return result;
end $$;
revoke all on function public.pos_retail_reverse_cash_v1(text,uuid,uuid,uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.pos_retail_reverse_cash_v1(text,uuid,uuid,uuid,uuid,text,uuid) to service_role;
commit;
