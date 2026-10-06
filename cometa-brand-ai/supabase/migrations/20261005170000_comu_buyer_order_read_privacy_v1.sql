-- Buyer read privacy only. No state transitions, provider persistence or business writes.
begin;

-- RLS is row isolation, not a column allowlist. Remove table AND previous column grants.
do $$
declare t text; cols text;
begin
 foreach t in array array[
  'comu_orders','comu_order_suborders','comu_order_items','comu_order_item_snapshots',
  'comu_order_events','comu_fulfillment_events','comu_shipments','comu_shipment_suborders',
  'comu_shipping_webhook_events','comu_fulfillment_incidents','comu_hub_receipts',
  'comu_payment_intents','comu_payment_allocations','comu_payment_economics',
  'comu_refund_allocations','comu_shipping_quotes','comu_dispute_allocations',
  'comu_seller_fund_holds','comu_seller_liability_events'
 ] loop
  execute format('revoke select on table public.%I from public, anon, authenticated',t);
  select string_agg(quote_ident(column_name),',') into cols from information_schema.columns
   where table_schema='public' and table_name=t;
  execute format('revoke select (%s) on public.%I from public, anon, authenticated',cols,t);
 end loop;
end $$;

-- Minimal relational keys keep existing RLS dependencies usable. Every allowed row
-- still passes the existing ownership/seller policy AND the active-profile policy.
grant select(id,buyer_id,order_number,status,currency,subtotal,discount_total,shipping_total,points_total,grand_total,created_at,cancelled_at,fulfillment_status,shipping_mode)
 on public.comu_orders to authenticated;
grant select(id,order_id,seller_id,status,subtotal,discount_total,shipping_total,grand_total,created_at,fulfillment_status,fulfillment_route)
 on public.comu_order_suborders to authenticated;
grant select(id,order_id,suborder_id,seller_id,quantity,unit_price,subtotal,created_at)
 on public.comu_order_items to authenticated;
grant select(id,order_item_id,created_at) on public.comu_order_item_snapshots to authenticated;
grant select(id,order_id,suborder_id,event_type,created_at) on public.comu_order_events to authenticated;
grant select(id,order_id,suborder_id,event_type,from_status,to_status,created_at) on public.comu_fulfillment_events to authenticated;
grant select(id,master_order_id,carrier,tracking_number,status,created_at) on public.comu_shipments to authenticated;
grant select(shipment_id,suborder_id) on public.comu_shipment_suborders to authenticated;

create function public.comu_buyer_read_active_b1() returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(select 1 from public.user_profiles where user_id=auth.uid() and status='active')
$$;
revoke all on function public.comu_buyer_read_active_b1() from public,anon;
grant execute on function public.comu_buyer_read_active_b1() to authenticated;

do $$ declare t text; begin
 foreach t in array array['comu_orders','comu_order_suborders','comu_order_items','comu_order_item_snapshots',
 'comu_order_events','comu_fulfillment_events','comu_shipments','comu_shipment_suborders'] loop
  execute format('create policy comu_active_read_b1 on public.%I as restrictive for select to authenticated using (public.comu_buyer_read_active_b1())',t);
 end loop;
end $$;

-- Read-only presentation, shared by detail and server-side list filters. Never a
-- transition authority: only projects O1 states and associated shipment evidence.
create function public.comu_buyer_presentation_b1(p_order uuid) returns text
language plpgsql stable security definer set search_path=public as $$
declare commercial text; n integer; moving integer; delivered integer; ready integer; hubs integer; progressed integer; problem integer; payment text;
begin
 select status into commercial from public.comu_orders where id=p_order;
 if commercial in ('CANCELLED','EXPIRED') then return 'CANCELLED'; end if;
 select count(*),count(*) filter(where fulfillment_status in ('SHIPPED','DELIVERED')),
  count(*) filter(where fulfillment_status='DELIVERED'),count(*) filter(where fulfillment_status in ('CONSOLIDATED','READY_TO_SHIP')),
  count(*) filter(where fulfillment_route='HUB'),count(*) filter(where fulfillment_status<>'PAID'),
  count(*) filter(where fulfillment_status in ('ISSUE','CANCELLED'))
 into n,moving,delivered,ready,hubs,progressed,problem from public.comu_order_suborders where order_id=p_order;
 if problem>0 then return 'ISSUE'; end if;
 -- Legacy mixed/multiple-direct masters are not a certified multi-shipment flow.
 if n>1 and hubs<n then
  return case when moving>0 then 'PARTIALLY_IN_TRANSIT' else 'PREPARING' end;
 end if;
 if n>0 and delivered=n then return 'DELIVERED'; end if;
 if moving>0 then
  if moving<n then return 'PARTIALLY_IN_TRANSIT'; end if;
  if exists(select 1 from public.comu_shipments sh where sh.master_order_id=p_order and sh.status='OUT_FOR_DELIVERY'
    and not exists(select 1 from public.comu_order_suborders s where s.order_id=p_order and s.fulfillment_status<>'DELIVERED'
     and not exists(select 1 from public.comu_shipment_suborders ss where ss.shipment_id=sh.id and ss.suborder_id=s.id)
     and not(s.fulfillment_route='DIRECT' and n=1))) then return 'OUT_FOR_DELIVERY'; end if;
  return 'IN_TRANSIT';
 end if;
 if n>0 and ready=n then return 'READY_TO_SHIP'; end if;
 if hubs>0 and exists(select 1 from public.comu_order_suborders where order_id=p_order and fulfillment_route='HUB'
   and fulfillment_status in ('READY_FOR_HUB','HANDED_TO_HUB','HUB_RECEIVED','CONSOLIDATED','READY_TO_SHIP')) then return 'GATHERING_AT_HUB'; end if;
 if progressed>0 then return 'PREPARING'; end if;
 if public.comu_order_payment_confirmed_v1(p_order) or exists(select 1 from public.comu_order_events where order_id=p_order and event_type='ORDER_PAID') then return 'CONFIRMED'; end if;
 select status into payment from public.comu_payment_intents where order_id=p_order order by created_at desc,id desc limit 1;
 return case when payment='PROCESSING' then 'PAYMENT_PROCESSING' when payment='FAILED' then 'PAYMENT_FAILED' else 'PAYMENT_PENDING' end;
end $$;
revoke all on function public.comu_buyer_presentation_b1(uuid) from public,anon,authenticated,service_role;

-- Historical JSON is projected, never granted verbatim. The authenticated caller
-- cannot substitute a buyer/user identity or acquire access through seller membership.
create function public.comu_buyer_order_read_b1(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
 if not public.comu_buyer_read_active_b1() then raise exception 'COMU_BUYER_READ_DENIED'; end if;
 if not exists(select 1 from public.comu_orders o join public.comu_buyers b on b.id=o.buyer_id
  where o.id=p_order and b.user_id=auth.uid()) then raise exception 'COMU_ORDER_NOT_FOUND'; end if;
 select jsonb_build_object(
  'orderId',o.id,'orderNumber',o.order_number::text,'createdAt',o.created_at,'currency',o.currency,
  'commercialStatus',o.status,'fulfillmentStatus',o.fulfillment_status,'shippingMode',o.shipping_mode,
  'presentationStatus',public.comu_buyer_presentation_b1(o.id),
  'paymentState',coalesce(public.comu_order_financial_condition_v1(o.id),(select status from public.comu_payment_intents where order_id=o.id order by created_at desc,id desc limit 1),'REQUIRES_PAYMENT'),
  'paymentConfirmed',public.comu_order_payment_confirmed_v1(o.id),
  'economics',jsonb_build_object('subtotal',o.subtotal,'shipping',o.shipping_total,'discount',o.discount_total,'pointsTotal',o.points_total,'total',o.grand_total,
   'refunded',coalesce((select sum(amount_cents)/100.0 from public.comu_refunds where master_order_id=o.id and status='SUCCEEDED' and upper(currency)=upper(o.currency)),0)),
  'shippingAddress',case when o.shipping_address_snapshot is null then null else jsonb_build_object(
   'recipient',o.shipping_address_snapshot->>'recipient_name','line1',o.shipping_address_snapshot->>'line1',
   'line2',o.shipping_address_snapshot->>'line2','city',o.shipping_address_snapshot->>'city',
   'state',o.shipping_address_snapshot->>'state','postalCode',o.shipping_address_snapshot->>'postal_code',
   'country',o.shipping_address_snapshot->>'country','references',o.shipping_address_snapshot->>'references') end,
  'suborders',coalesce((select jsonb_agg(jsonb_build_object(
   'suborderId',s.id,'sellerId',s.seller_id,'sellerName',se.public_name,'sellerLogo',se.logo_url,
   'route',s.fulfillment_route,'fulfillmentStatus',s.fulfillment_status,'total',s.grand_total,
   'products',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'title',coalesce(sn.snapshot->>'listingTitle',sn.snapshot->>'productTitle'),
    'image',sn.snapshot->>'image','sellerNameSnapshot',sn.snapshot->>'sellerName','variant',sn.snapshot->>'variant',
    'sku',sn.snapshot->>'sku','attributes',coalesce((select jsonb_object_agg(a.key,a.value)
     from jsonb_each(case when jsonb_typeof(sn.snapshot->'attributes')='object' then sn.snapshot->'attributes' else '{}'::jsonb end) a
     where a.key !~* '(token|secret|password|stripe|provider|settle|admin|note|payload|reconcil|label.?url|handoff)'
      and jsonb_typeof(a.value) in ('string','number','boolean')),'{}'::jsonb),
    'quantity',i.quantity,'unitPrice',i.unit_price,'subtotal',i.subtotal) order by i.id)
    from public.comu_order_items i left join public.comu_order_item_snapshots sn on sn.order_item_id=i.id where i.suborder_id=s.id),'[]'::jsonb)
   ) order by s.id) from public.comu_order_suborders s join public.comu_sellers se on se.id=s.seller_id where s.order_id=o.id),'[]'::jsonb),
  'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'scope',case when e.suborder_id is null then 'MASTER' else 'SUBORDER' end,
    'suborderId',e.suborder_id,'type',e.event_type,'recordedAt',e.created_at) order by e.created_at,e.id) from (
    select 'order:'||id as id,suborder_id,event_type,created_at from public.comu_order_events where order_id=o.id
     and event_type in ('ORDER_CREATED','ORDER_PAID','ORDER_CANCELLED','ORDER_EXPIRED','ORDER_DELIVERED')
    union all select 'fulfillment:'||id,suborder_id,event_type,created_at from public.comu_fulfillment_events where order_id=o.id
     and event_type in ('SUBORDER_PREPARING','SUBORDER_READY_FOR_HUB','SUBORDER_HANDED_TO_HUB','SUBORDER_HUB_RECEIVED','MASTER_CONSOLIDATED','SUBORDER_READY_TO_SHIP','SUBORDER_SHIPPED','SUBORDER_DELIVERED','SUBORDER_ISSUE','INCIDENT_RECORDED')
   )e),'[]'::jsonb),
  'tracking',coalesce((select jsonb_agg(jsonb_build_object('shipmentId',sh.id,'carrier',sh.carrier,'trackingNumber',sh.tracking_number,'status',sh.status,
   'suborderIds',coalesce((select jsonb_agg(ss.suborder_id order by ss.suborder_id) from public.comu_shipment_suborders ss where ss.shipment_id=sh.id),'[]'::jsonb),
   'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'status',e.event_type,'recordedAt',e.created_at) order by e.created_at,e.id)
    from public.comu_shipping_webhook_events e where e.shipment_id=sh.id and e.processed_at is not null and e.payload->>'applied'='true'
    and e.event_type in ('CREATED','LABEL_READY','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','EXCEPTION','CANCELLED')),'[]'::jsonb),
   'publicTrackingUrl',null,'deliveryEstimate',null) order by sh.id) from public.comu_shipments sh where sh.master_order_id=o.id),'[]'::jsonb),
  'issues',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'suborderId',i.suborder_id,'createdAt',i.created_at,
    'message','Hay una incidencia en esta parte de tu pedido.') order by i.created_at,i.id)
    from public.comu_fulfillment_incidents i join public.comu_order_suborders s on s.id=i.suborder_id where i.order_id=o.id and s.fulfillment_status='ISSUE'),'[]'::jsonb),
  'deliveryEstimate',null,'deepLink','/comu/account/orders/'||o.id||'?view=detail'
 ) into result from public.comu_orders o where o.id=p_order;
 return result;
end $$;
revoke all on function public.comu_buyer_order_read_b1(uuid) from public,anon,service_role;
grant execute on function public.comu_buyer_order_read_b1(uuid) to authenticated;

-- Pagination/search/filter run inside PostgreSQL, before the bounded DTO projection.
create function public.comu_buyer_orders_read_b1(p_days integer default 90,p_filter text default 'ALL',p_search text default '',p_page integer default 1,p_size integer default 20) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb; total integer;
begin
 if not public.comu_buyer_read_active_b1() then raise exception 'COMU_BUYER_READ_DENIED'; end if;
 if p_days is null or p_days not in (30,90) or p_filter is null or p_filter not in ('ALL','PREPARING','IN_TRANSIT','DELIVERED','ISSUE','CANCELLED')
  or p_page is null or p_page<1 or p_page>10000 or p_size is null or p_size<1 or p_size>50 or p_search is null or length(p_search)>80 then raise exception 'COMU_BUYER_INPUT_INVALID'; end if;
 with filtered as materialized (
  select o.id,o.created_at from public.comu_orders o join public.comu_buyers b on b.id=o.buyer_id
  where b.user_id=auth.uid() and o.created_at>=now()-make_interval(days=>p_days)
   and (p_search='' or position(lower(regexp_replace(p_search,'^#?COMU-','','i')) in lower(o.order_number::text))>0)
   and (p_filter='ALL' or public.comu_buyer_presentation_b1(o.id)=p_filter
    or (p_filter='PREPARING' and public.comu_buyer_presentation_b1(o.id) in ('CONFIRMED','GATHERING_AT_HUB','READY_TO_SHIP'))
    or (p_filter='IN_TRANSIT' and public.comu_buyer_presentation_b1(o.id) in ('PARTIALLY_IN_TRANSIT','OUT_FOR_DELIVERY')))
 ), paged as (select * from filtered order by created_at desc,id desc offset ((p_page-1)*p_size) limit p_size)
 select (select count(*) from filtered),coalesce(jsonb_agg(public.comu_buyer_order_read_b1(id) order by created_at desc,id desc),'[]'::jsonb)
 into total,result from paged;
 return jsonb_build_object('orders',result,'pagination',jsonb_build_object('page',p_page,'pageSize',p_size,'total',total,'totalPages',ceil(total::numeric/p_size)));
end $$;
revoke all on function public.comu_buyer_orders_read_b1(integer,text,text,integer,integer) from public,anon,service_role;
grant execute on function public.comu_buyer_orders_read_b1(integer,text,text,integer,integer) to authenticated;
commit;
