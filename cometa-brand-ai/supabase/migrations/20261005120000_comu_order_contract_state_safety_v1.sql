begin;

-- O1: existing states remain separate. No historical rewrites or inventory writes.
create or replace function public.comu_order_actor_v1(p_seller uuid) returns text
language plpgsql security definer set search_path=public as $$
declare r text; s public.comu_sellers%rowtype;
begin
 if auth.uid() is null or not exists(select 1 from public.user_profiles where user_id=auth.uid() and status='active') then raise exception 'COMU_UNAUTHORIZED'; end if;
 if public.is_cometa_admin() then return 'COMETA_ADMIN'; end if;
 select role into r from public.comu_seller_memberships where seller_id=p_seller and user_id=auth.uid() and active;
 if r is null or r not in ('OWNER','ADMIN','ORDER_MANAGER') then raise exception 'COMU_SELLER_ACCESS_DENIED'; end if;
 select * into s from public.comu_sellers where id=p_seller;
 if not found then raise exception 'COMU_SELLER_ACCESS_DENIED'; end if;
 if s.approval_origin='C1' then
  if s.verification_status<>'VERIFIED' or s.status not in ('PREPARING','ACTIVE') or not exists(select 1 from public.comu_seller_applications where id=s.approval_application_id and seller_id=s.id and brand_id::text=s.brand_id::text and status='APPROVED' and decision='APPROVED' and reviewed_by is not null and reviewed_at is not null) then raise exception 'COMU_SELLER_ACCESS_DENIED'; end if;
 elsif s.approval_origin='LEGACY' then
  if s.status not in ('VERIFIED','ACTIVE') or s.verification_status<>'VERIFIED' then raise exception 'COMU_SELLER_ACCESS_DENIED'; end if;
 else raise exception 'COMU_SELLER_ACCESS_DENIED'; end if;
 return r;
end $$;

-- Financial exceptions remain distinct from an unpaid order. Read-only projection.
create or replace function public.comu_order_financial_condition_v1(p_order uuid) returns text
language sql stable security definer set search_path=public as $$
 select case
 when exists(select 1 from public.comu_disputes d join public.comu_payment_intents p on p.id=d.payment_id where p.order_id=p_order and d.status in ('OPEN','UNDER_REVIEW','LOST')) then 'DISPUTED'
 when coalesce((select sum(r.amount_cents) from public.comu_refunds r where r.master_order_id=p_order and r.status='SUCCEEDED'),0)>0 then
  case when (select sum(r.amount_cents) from public.comu_refunds r where r.master_order_id=p_order and r.status='SUCCEEDED') >= (select round(grand_total*100) from public.comu_orders where id=p_order) then 'REFUNDED' else 'PARTIALLY_REFUNDED' end
 when exists(select 1 from public.comu_refunds where master_order_id=p_order and status in ('REQUESTED','PROCESSING')) then 'REVIEW'
 else null end
$$;

create or replace function public.comu_order_payment_confirmed_v1(p_order uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select coalesce((select o.status='PAID' and p.status='SUCCEEDED' and p.buyer_id=o.buyer_id
   and p.amount_cents=round(o.grand_total*100)::bigint and upper(p.currency)=upper(o.currency)
   and public.comu_order_financial_condition_v1(o.id) is null
   from public.comu_orders o join lateral (select * from public.comu_payment_intents where order_id=o.id order by created_at desc,id desc limit 1) p on true
   where o.id=p_order),false)
$$;

create or replace function public.comu_refresh_order_fulfillment_v1(p_order uuid) returns void
language sql security definer set search_path=public as $$
 update public.comu_orders o set fulfillment_status=case
  when exists(select 1 from public.comu_order_suborders s where s.order_id=o.id and s.fulfillment_status in ('ISSUE','CANCELLED')) then 'ISSUE'
  when not exists(select 1 from public.comu_order_suborders s where s.order_id=o.id and s.fulfillment_status<>'DELIVERED') then 'DELIVERED'
  when exists(select 1 from public.comu_order_suborders s where s.order_id=o.id and s.fulfillment_status in ('SHIPPED','DELIVERED')) then 'SHIPPED'
  when not exists(select 1 from public.comu_order_suborders s where s.order_id=o.id and s.fulfillment_status not in ('CONSOLIDATED','READY_TO_SHIP')) then 'READY_TO_SHIP'
  when not exists(select 1 from public.comu_order_suborders s where s.order_id=o.id and s.fulfillment_status<>'HUB_RECEIVED') then 'READY_FOR_CONSOLIDATION'
  else 'WAITING_FOR_SELLERS' end,fulfillment_updated_at=now() where o.id=p_order
$$;

create or replace function public.comu_transition_suborder_fulfillment_v1(p_suborder_id uuid,p_to_status text,p_actor_type text,p_note text default null)
returns public.comu_order_suborders language plpgsql security definer set search_path=public as $$
declare so public.comu_order_suborders%rowtype; oid uuid; r text; allowed boolean; old_state text;
begin
 select order_id into oid from public.comu_order_suborders where id=p_suborder_id;
 if oid is null then raise exception 'COMU_SUBORDER_NOT_FOUND'; end if;
 perform 1 from public.comu_orders where id=oid for update;
 select * into so from public.comu_order_suborders where id=p_suborder_id for update;
 r:=public.comu_order_actor_v1(so.seller_id);
 if p_actor_type is null or p_actor_type not in ('SELLER','HUB','ADMIN') then raise exception 'COMU_ACTOR_INVALID'; end if;
 if p_actor_type in ('HUB','ADMIN') and r<>'COMETA_ADMIN' then raise exception 'COMU_HUB_ACCESS_DENIED'; end if;
 if p_actor_type='SELLER' and ((so.fulfillment_route='HUB' and p_to_status not in ('PREPARING','READY_FOR_HUB','HANDED_TO_HUB')) or (so.fulfillment_route='DIRECT' and p_to_status not in ('PREPARING','READY_TO_SHIP','SHIPPED'))) then raise exception 'COMU_SELLER_FULFILLMENT_FORBIDDEN'; end if;
 if p_actor_type='HUB' and p_to_status<>'HUB_RECEIVED' then raise exception 'COMU_HUB_FULFILLMENT_FORBIDDEN'; end if;
 -- Authorization is always checked, including retries. A historical retry is not a new operation.
 if so.fulfillment_status=p_to_status then return so; end if;
 perform 1 from public.comu_payment_intents where order_id=oid order by created_at desc,id desc for update;
 if not public.comu_order_payment_confirmed_v1(oid) then raise exception 'COMU_ORDER_PAYMENT_NOT_CONFIRMED'; end if;
 allowed:=case when so.fulfillment_route='DIRECT' then (so.fulfillment_status,p_to_status) in
  (('PAID','PREPARING'),('PREPARING','READY_TO_SHIP'),('READY_TO_SHIP','SHIPPED'),('SHIPPED','DELIVERED'))
 else (so.fulfillment_status,p_to_status) in (('PAID','PREPARING'),('PREPARING','READY_FOR_HUB'),('READY_FOR_HUB','HANDED_TO_HUB'),('HANDED_TO_HUB','HUB_RECEIVED'),('HUB_RECEIVED','CONSOLIDATED'),('CONSOLIDATED','READY_TO_SHIP'),('READY_TO_SHIP','SHIPPED'),('SHIPPED','DELIVERED')) end;
 if not coalesce(allowed,false) then raise exception 'COMU_FULFILLMENT_TRANSITION_INVALID'; end if;
 if p_to_status='SHIPPED' and not exists(select 1 from public.comu_shipments sh where sh.master_order_id=oid and sh.provider_shipment_id is not null and sh.status in ('READY_TO_SHIP','LABEL_READY','SHIPPED','IN_TRANSIT','OUT_FOR_DELIVERY') and (exists(select 1 from public.comu_shipment_suborders ss where ss.shipment_id=sh.id and ss.suborder_id=so.id) or (so.fulfillment_route='DIRECT' and (select count(*) from public.comu_order_suborders where order_id=oid)=1))) then raise exception 'COMU_SHIPMENT_NOT_PREPARED'; end if;
 old_state:=so.fulfillment_status;
 update public.comu_order_suborders set fulfillment_status=p_to_status,
  status=case when p_to_status='HUB_RECEIVED' then 'AT_HUB' when p_to_status in ('SHIPPED','DELIVERED') then p_to_status else status end,
  deadline_at=case when p_to_status='PREPARING' then public.comu_fulfillment_deadline_v1((select created_at from public.comu_orders where id=oid)) else deadline_at end,
  hub_handoff_token=case when p_to_status='READY_FOR_HUB' then encode(extensions.gen_random_bytes(18),'hex') else hub_handoff_token end,updated_at=now()
 where id=so.id returning * into so;
 insert into public.comu_fulfillment_events(order_id,suborder_id,event_type,from_status,to_status,actor_type,actor_id,note)
 values(oid,so.id,'SUBORDER_'||p_to_status,old_state,p_to_status,p_actor_type,auth.uid(),left(p_note,2000)) on conflict(suborder_id,event_type,to_status) do nothing;
 if p_to_status='HUB_RECEIVED' then
  insert into public.comu_hub_receipts(suborder_id,receipt_token,received_by,expected_items,received_items)
  select so.id,so.hub_handoff_token,auth.uid(),coalesce(sum(quantity),0),coalesce(sum(quantity),0) from public.comu_order_items where suborder_id=so.id on conflict(suborder_id) do nothing;
 end if;
 perform public.comu_refresh_order_fulfillment_v1(oid);
 return so;
end $$;

alter table public.comu_fulfillment_incidents add column if not exists request_id uuid;
create unique index if not exists comu_incident_request_o1 on public.comu_fulfillment_incidents(suborder_id,request_id) where request_id is not null;
create or replace function public.comu_record_fulfillment_incident_v1(p_suborder uuid,p_type text,p_request uuid,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare so public.comu_order_suborders%rowtype; result public.comu_fulfillment_incidents%rowtype; oid uuid;
begin
 if auth.uid() is null or not public.comu_c1_is_admin() then raise exception 'COMU_HUB_ACCESS_DENIED'; end if;
 if p_type is null or p_type not in ('INCOMPLETE_PACKAGE','WRONG_PRODUCT','DAMAGED_PACKAGE','OTHER') or p_request is null then raise exception 'COMU_INCIDENT_INPUT_INVALID'; end if;
 select order_id into oid from public.comu_order_suborders where id=p_suborder;
 perform 1 from public.comu_orders where id=oid for update;
 select * into so from public.comu_order_suborders where id=p_suborder for update;
 if not found then raise exception 'COMU_SUBORDER_NOT_FOUND'; end if;
 select * into result from public.comu_fulfillment_incidents where suborder_id=p_suborder and request_id=p_request;
 if found then
  if result.incident_type<>p_type or result.note is distinct from left(p_note,2000) then raise exception 'COMU_IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('id',result.id,'suborderId',p_suborder); end if;
 insert into public.comu_fulfillment_incidents(order_id,suborder_id,seller_id,incident_type,note,actor_id,request_id)
 values(oid,so.id,so.seller_id,p_type,left(p_note,2000),auth.uid(),p_request) returning * into result;
 -- Never undo confirmed delivery or a cancelled suborder to represent an incident.
 if so.fulfillment_status not in ('DELIVERED','CANCELLED') then
  update public.comu_order_suborders set fulfillment_status='ISSUE',updated_at=now() where id=so.id;
 end if;
 insert into public.comu_fulfillment_events(order_id,suborder_id,event_type,from_status,to_status,actor_type,actor_id,payload)
 values(oid,so.id,'INCIDENT_RECORDED',so.fulfillment_status,null,'ADMIN',auth.uid(),jsonb_build_object('incidentId',result.id));
 perform public.comu_refresh_order_fulfillment_v1(oid);
 return jsonb_build_object('id',result.id,'suborderId',so.id);
end $$;

create or replace function public.comu_process_tracking_event_v1(p_provider text,p_event text,p_shipment text,p_status text,p_tracking text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare sh public.comu_shipments%rowtype; e public.comu_shipping_webhook_events%rowtype; so record; oid uuid; target text; applied boolean:=false; current_rank integer; new_rank integer;
begin
 if p_provider<>'SKYDROPX' or p_event is null or length(p_event)>200 or p_shipment is null or p_status is null or p_status not in ('CREATED','LABEL_READY','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','EXCEPTION','CANCELLED','UNKNOWN') then raise exception 'COMU_TRACKING_INVALID'; end if;
 select master_order_id into oid from public.comu_shipments where provider=p_provider and provider_shipment_id=p_shipment;
 if oid is null then raise exception 'COMU_SHIPMENT_NOT_FOUND'; end if;
 perform 1 from public.comu_orders where id=oid for update;
 select * into sh from public.comu_shipments where master_order_id=oid for update;
 insert into public.comu_shipping_webhook_events(provider,provider_event_id,shipment_id,event_type,payload)
 values(p_provider,p_event,sh.id,p_status,jsonb_build_object('providerShipmentId',p_shipment,'status',p_status,'trackingNumber',left(p_tracking,200))) on conflict(provider,provider_event_id) do nothing;
 select * into e from public.comu_shipping_webhook_events where provider=p_provider and provider_event_id=p_event for update;
 if e.shipment_id is distinct from sh.id or e.event_type<>p_status then raise exception 'COMU_IDEMPOTENCY_CONFLICT'; end if;
 if e.processed_at is not null then return jsonb_build_object('duplicate',true,'applied',false); end if;
 current_rank:=case sh.status when 'CREATED' then 0 when 'READY_TO_SHIP' then 1 when 'LABEL_READY' then 1 when 'SHIPPED' then 2 when 'IN_TRANSIT' then 2 when 'OUT_FOR_DELIVERY' then 3 when 'DELIVERED' then 4 else 0 end;
 new_rank:=case p_status when 'CREATED' then 0 when 'LABEL_READY' then 1 when 'IN_TRANSIT' then 2 when 'OUT_FOR_DELIVERY' then 3 when 'DELIVERED' then 4 else -1 end;
 if p_status<>'UNKNOWN' and sh.status<>'DELIVERED' and ((new_rank>=current_rank and sh.status not in ('CANCELLED','EXCEPTION')) or p_status in ('EXCEPTION','CANCELLED') or (sh.status='EXCEPTION' and p_status='DELIVERED')) then
  update public.comu_shipments set status=p_status,tracking_number=coalesce(left(p_tracking,200),tracking_number),updated_at=now() where id=sh.id; applied:=true;
  for so in select s.* from public.comu_order_suborders s where s.order_id=oid and (exists(select 1 from public.comu_shipment_suborders ss where ss.shipment_id=sh.id and ss.suborder_id=s.id) or (s.fulfillment_route='DIRECT' and (select count(*) from public.comu_order_suborders where order_id=oid)=1)) order by s.id for update loop
   target:=case when p_status in ('IN_TRANSIT','OUT_FOR_DELIVERY') and so.fulfillment_status in ('READY_TO_SHIP','SHIPPED') then 'SHIPPED'
    when p_status='DELIVERED' and so.fulfillment_status in ('READY_TO_SHIP','SHIPPED','ISSUE') then 'DELIVERED'
    when p_status in ('EXCEPTION','CANCELLED') and so.fulfillment_status not in ('DELIVERED','CANCELLED') then 'ISSUE' else null end;
   if target is not null and target<>so.fulfillment_status then
    update public.comu_order_suborders set fulfillment_status=target,status=case when target in ('SHIPPED','DELIVERED') then target else status end,updated_at=now() where id=so.id;
    insert into public.comu_fulfillment_events(order_id,suborder_id,event_type,from_status,to_status,actor_type)
    values(oid,so.id,'SUBORDER_'||target,so.fulfillment_status,target,'SHIPPING') on conflict do nothing;
   end if;
  end loop;
  perform public.comu_refresh_order_fulfillment_v1(oid);
 end if;
 update public.comu_shipping_webhook_events set processed_at=now(),payload=payload||jsonb_build_object('applied',applied) where id=e.id;
 return jsonb_build_object('duplicate',false,'applied',applied);
end $$;

-- Internal helpers are not a second externally callable mutation boundary.
revoke all on function public.comu_order_actor_v1(uuid),public.comu_order_financial_condition_v1(uuid),public.comu_order_payment_confirmed_v1(uuid),public.comu_refresh_order_fulfillment_v1(uuid) from public,anon,authenticated,service_role;
revoke all on function public.comu_transition_suborder_fulfillment_v1(uuid,text,text,text),public.comu_record_fulfillment_incident_v1(uuid,text,uuid,text),public.comu_process_tracking_event_v1(text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.comu_transition_suborder_fulfillment_v1(uuid,text,text,text),public.comu_record_fulfillment_incident_v1(uuid,text,uuid,text) to authenticated;
grant execute on function public.comu_process_tracking_event_v1(text,text,text,text,text) to service_role;

create index if not exists comu_suborders_seller_page_o1 on public.comu_order_suborders(seller_id,created_at desc,id desc);

create or replace function public.comu_seller_order_detail_o1(p_id uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
 'masterOrderId',o.id,'suborderId',s.id,'orderNumber',o.order_number,'createdAt',s.created_at,
 'recipientName',coalesce(nullif(o.shipping_address_snapshot->>'recipient_name',''),nullif(o.shipping_address_snapshot->>'name',''),nullif(o.shipping_address_snapshot->>'full_name','')),
 'total',s.grand_total,'currency',o.currency,'commercialState',o.status,'fulfillmentState',s.fulfillment_status,
 'shippingMode',o.shipping_mode,'route',s.fulfillment_route,'deadlineAt',s.deadline_at,
 'paymentState',p.status,'paymentConfirmed',public.comu_order_payment_confirmed_v1(o.id),
 'financialCondition',public.comu_order_financial_condition_v1(o.id),
 'shipmentPrepared',exists(select 1 from public.comu_shipments sh where sh.master_order_id=o.id and sh.provider_shipment_id is not null and sh.status in ('READY_TO_SHIP','LABEL_READY','SHIPPED','IN_TRANSIT','OUT_FOR_DELIVERY') and (exists(select 1 from public.comu_shipment_suborders ss where ss.shipment_id=sh.id and ss.suborder_id=s.id) or (s.fulfillment_route='DIRECT' and (select count(*) from public.comu_order_suborders where order_id=o.id)=1))),
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'title',coalesce(sn.snapshot->>'listingTitle',sn.snapshot->>'productTitle'),'image',sn.snapshot->>'image','variant',sn.snapshot->>'variant','sku',sn.snapshot->>'sku','attributes',sn.snapshot->'attributes','quantity',i.quantity,'unitPrice',i.unit_price,'total',i.subtotal) order by i.id) from public.comu_order_items i left join public.comu_order_item_snapshots sn on sn.order_item_id=i.id where i.suborder_id=s.id),'[]'::jsonb),
 'timeline',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'type',t.kind,'at',t.at) order by t.at,t.id) from (
  select 'order:'||e.id id,e.event_type kind,e.created_at at from public.comu_order_events e where e.order_id=o.id and (e.suborder_id is null or e.suborder_id=s.id) and e.event_type in ('ORDER_CREATED','ORDER_PAID','ORDER_CANCELLED','ORDER_EXPIRED','DELIVERED')
  union all select 'fulfillment:'||e.id,e.event_type,e.created_at from public.comu_fulfillment_events e where e.suborder_id=s.id
  union all select 'shipping:'||e.id,'SHIPMENT_'||e.event_type,e.created_at from public.comu_shipping_webhook_events e join public.comu_shipments sh on sh.id=e.shipment_id where sh.master_order_id=o.id and e.processed_at is not null and e.payload->>'applied'='true' and (exists(select 1 from public.comu_shipment_suborders ss where ss.shipment_id=sh.id and ss.suborder_id=s.id) or (s.fulfillment_route='DIRECT' and (select count(*) from public.comu_order_suborders where order_id=o.id)=1))
 ) t),'[]'::jsonb),
 'tracking',coalesce((select jsonb_agg(jsonb_build_object('status',sh.status,'carrier',sh.carrier,'trackingNumber',sh.tracking_number)) from public.comu_shipments sh where sh.master_order_id=o.id and (exists(select 1 from public.comu_shipment_suborders ss where ss.shipment_id=sh.id and ss.suborder_id=s.id) or (s.fulfillment_route='DIRECT' and (select count(*) from public.comu_order_suborders where order_id=o.id)=1))),'[]'::jsonb),
 'incidents',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'type',i.incident_type,'createdAt',i.created_at) order by i.created_at,i.id) from public.comu_fulfillment_incidents i where i.suborder_id=s.id),'[]'::jsonb)
 ) from public.comu_order_suborders s join public.comu_orders o on o.id=s.order_id
 left join lateral(select pi.status from public.comu_payment_intents pi where pi.order_id=o.id order by pi.created_at desc,pi.id desc limit 1)p on true where s.id=p_id
$$;

create or replace function public.comu_seller_orders_read_o1(p_seller uuid,p_selected uuid default null,p_days integer default 30,p_state text default 'ALL',p_search text default '',p_page integer default 1,p_size integer default 20) returns jsonb
language plpgsql security definer set search_path=public as $$
declare total bigint; result jsonb; selected jsonb;
begin
 perform public.comu_order_actor_v1(p_seller);
 if p_days is null or p_days not in (30,90) or p_page is null or p_page<1 or p_page>100000 or p_size is null or p_size<1 or p_size>50 or p_search is null or length(p_search)>120 or p_state is null or p_state not in ('ALL','PAID','PREPARING','READY','READY_FOR_HUB','HANDED_TO_HUB','HUB_RECEIVED','CONSOLIDATED','READY_TO_SHIP','SHIPPED','DELIVERED','CANCELLED','ISSUE') then raise exception 'COMU_ORDER_QUERY_INVALID'; end if;
 if p_selected is not null then
  if not exists(select 1 from public.comu_order_suborders where id=p_selected and seller_id=p_seller) then raise exception 'COMU_ORDER_NOT_FOUND'; end if;
  selected:=public.comu_seller_order_detail_o1(p_selected);
 end if;
 with filtered as (
  select s.id,s.created_at from public.comu_order_suborders s join public.comu_orders o on o.id=s.order_id
  where s.seller_id=p_seller and s.created_at>=now()-make_interval(days=>p_days)
   and (p_state='ALL' or (p_state='READY' and s.fulfillment_status in ('READY_FOR_HUB','HANDED_TO_HUB','HUB_RECEIVED','CONSOLIDATED','READY_TO_SHIP')) or (s.fulfillment_status=p_state and (p_state<>'PAID' or public.comu_order_payment_confirmed_v1(o.id))))
   and (p_search='' or position(lower(p_search) in lower(o.order_number::text))>0 or exists(select 1 from public.comu_order_items i join public.comu_order_item_snapshots sn on sn.order_item_id=i.id where i.suborder_id=s.id and position(lower(p_search) in lower(concat_ws(' ',sn.snapshot->>'listingTitle',sn.snapshot->>'productTitle',sn.snapshot->>'sku')))>0))
 ), paged as(select * from filtered order by created_at desc,id desc offset ((p_page-1)*p_size) limit p_size)
 select (select count(*) from filtered),coalesce(jsonb_agg(public.comu_seller_order_detail_o1(id) order by created_at desc,id desc),'[]'::jsonb) into total,result from paged;
 return jsonb_build_object('orders',result,'selected',selected,'pagination',jsonb_build_object('page',p_page,'pageSize',p_size,'total',total,'totalPages',ceil(total::numeric/p_size)));
end $$;
revoke all on function public.comu_seller_order_detail_o1(uuid),public.comu_seller_orders_read_o1(uuid,uuid,integer,text,text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.comu_seller_orders_read_o1(uuid,uuid,integer,text,text,integer,integer) to authenticated;
commit;
