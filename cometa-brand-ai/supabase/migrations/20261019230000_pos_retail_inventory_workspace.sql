begin;
-- Additive Retail workspace. Existing stock and historical movements are untouched.
create table public.pos_retail_inventory_batches (
 id uuid primary key, brand_slug text not null, location_id uuid not null references public.pos_locations(id),
 action text not null check(action in ('receive','count','out','return','dispose')),
 payload jsonb not null, result jsonb not null, staff_id uuid not null references public.pos_staff(id),
 host_user_id uuid not null, created_at timestamptz not null default clock_timestamp()
);
create table public.pos_retail_stock_outs (
 id uuid primary key, brand_slug text not null, location_id uuid not null references public.pos_locations(id),
 folio text not null default ('ST-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
 responsible text not null, reason text not null, expected_at timestamptz not null,
 staff_id uuid not null references public.pos_staff(id), created_at timestamptz not null default clock_timestamp(),
 unique(brand_slug,folio)
);
create table public.pos_retail_stock_out_items (
 out_id uuid not null references public.pos_retail_stock_outs(id), variant_id uuid not null references public.pos_product_variants(id),
 sent numeric(14,3) not null check(sent>0), returned numeric(14,3) not null default 0 check(returned>=0),
 disposed numeric(14,3) not null default 0 check(disposed>=0), primary key(out_id,variant_id), check(returned+disposed<=sent)
);
alter table public.pos_retail_inventory_batches enable row level security;
alter table public.pos_retail_stock_outs enable row level security;
alter table public.pos_retail_stock_out_items enable row level security;
revoke all on public.pos_retail_inventory_batches,public.pos_retail_stock_outs,public.pos_retail_stock_out_items from public,anon,authenticated;
grant all on public.pos_retail_inventory_batches,public.pos_retail_stock_outs,public.pos_retail_stock_out_items to service_role;
create index pos_retail_stock_out_location on public.pos_retail_stock_outs(brand_slug,location_id,created_at desc);
create index pos_retail_inventory_batch_location on public.pos_retail_inventory_batches(brand_slug,location_id,created_at desc);

create function public.pos_retail_inventory_batch_v1(p_brand text,p_actor uuid,p_session uuid,p_request uuid,p_location uuid,p_action text,p_body jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare st pos_staff%rowtype; loc pos_locations%rowtype; saved pos_retail_inventory_batches%rowtype;
 line jsonb; v record; stock pos_inventory%rowtype; version text; qty numeric; delta numeric; outrow pos_retail_stock_outs%rowtype;
 outitem pos_retail_stock_out_items%rowtype; receipt jsonb; receiptitems jsonb:='[]'; result jsonb; changes jsonb:='[]';
begin
 if not exists(select 1 from pos_business_profiles where brand_slug=p_brand and profile_code not in ('restaurant','coffee_shop')) then raise exception 'POS_RETAIL_REQUIRED';end if;
 select s.* into st from pos_staff s join pos_staff_sessions sess on sess.staff_id=s.id and sess.brand_slug=s.brand_slug
 where sess.id=p_session and sess.brand_slug=p_brand and sess.host_user_id=p_actor and sess.revoked_at is null
 and (sess.location_id is null or sess.location_id=p_location)
 and sess.expires_at>clock_timestamp() and s.active
 and (s.retail_permissions @> array['INVENTORY'] or (s.retail_permissions is null and s.role='ADMIN'))
 and (s.role<>'ADMIN' or sess.last_human_at>clock_timestamp()-interval '3 minutes');
 if not found then raise exception 'POS_STAFF_PERMISSION_REQUIRED';end if;
 select * into loc from pos_locations where id=p_location and brand_slug=p_brand and active;
 if not found or (st.location_id is not null and st.location_id<>p_location) then raise exception 'POS_LOCATION_INVALID';end if;
 if p_request is null or p_action not in ('receive','count','out','return','dispose') then raise exception 'POS_REQUEST_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('retail-inventory:'||p_request,0));
 select * into saved from pos_retail_inventory_batches where id=p_request;
 if found then
  if saved.brand_slug<>p_brand or saved.location_id<>p_location or saved.action<>p_action or saved.payload<>p_body or saved.host_user_id<>p_actor or saved.staff_id<>st.id then raise exception 'POS_IDEMPOTENCY_CONFLICT';end if;
  return saved.result;
 end if;
 if jsonb_typeof(p_body->'items') is distinct from 'array' or jsonb_array_length(p_body->'items') not between 1 and 1000 then raise exception 'POS_ITEMS_INVALID';end if;
 if (select count(*) from jsonb_array_elements(p_body->'items'))<>(select count(distinct x->>'variant_id') from jsonb_array_elements(p_body->'items') x) then raise exception 'POS_DUPLICATE_VARIANT';end if;
 if p_action in ('count','out','dispose') and length(btrim(coalesce(p_body->>'reason',''))) not between 3 and 1000 then raise exception 'POS_REASON_REQUIRED';end if;
 if p_action='dispose' and not (coalesce(st.retail_permissions @> array['SETTINGS'],st.role='ADMIN')) then raise exception 'POS_STAFF_PERMISSION_REQUIRED';end if;
 if p_action='out' then
  if length(btrim(coalesce(p_body->>'responsible',''))) not between 2 and 200 or (p_body->>'expected_at')::timestamptz is null or (p_body->>'expected_at')::timestamptz<=clock_timestamp() then raise exception 'POS_OUT_DETAILS_REQUIRED';end if;
  insert into pos_retail_stock_outs(id,brand_slug,location_id,responsible,reason,expected_at,staff_id)
  values(p_request,p_brand,p_location,btrim(p_body->>'responsible'),p_body->>'reason',(p_body->>'expected_at')::timestamptz,st.id) returning * into outrow;
 elsif p_action in ('return','dispose') then
  select * into outrow from pos_retail_stock_outs where id=(p_body->>'out_id')::uuid and brand_slug=p_brand and location_id=p_location for update;
  if not found then raise exception 'POS_OUT_NOT_FOUND';end if;
 end if;
 -- Stable lock order across all batch operations; sales/reservations use these same stock rows.
 for line in select value from jsonb_array_elements(p_body->'items') order by value->>'variant_id' loop
  qty:=(line->>'quantity')::numeric;
  if qty is null or qty<0 or qty>1000000 or qty<>round(qty,3) or (p_action<>'count' and qty=0) then raise exception 'POS_QUANTITY_INVALID';end if;
  select pv.*,p.track_inventory,p.inventory_mode into v from pos_product_variants pv join pos_products p on p.id=pv.product_id and p.brand_slug=p_brand
  where pv.id=(line->>'variant_id')::uuid and pv.brand_slug=p_brand and (pv.active or p_action in ('return','dispose')) and (p.active or p_action in ('return','dispose'));
  if not found or not v.track_inventory or v.inventory_mode<>'direct' then raise exception 'POS_PRODUCT_UNAVAILABLE';end if;
  if v.unit_code='piece' and qty<>trunc(qty) then raise exception 'POS_WHOLE_PIECES_REQUIRED';end if;
  -- Missing rows also carry an explicit snapshot token; inserting is part of this transaction.
  select i.*,i.xmin::text as version into v from pos_inventory i where i.brand_slug=p_brand and i.location_id=p_location and i.variant_id=(line->>'variant_id')::uuid for update;
  version:=case when found then v.version else 'missing' end;
  if p_action='count' and (line->>'version') is distinct from version then raise exception 'POS_INVENTORY_CHANGED';end if;
  insert into pos_inventory(brand_id,brand_slug,location_id,variant_id,quantity)
  values(loc.brand_id,p_brand,p_location,(line->>'variant_id')::uuid,0) on conflict(location_id,variant_id) do nothing;
  select * into stock from pos_inventory where brand_slug=p_brand and location_id=p_location and variant_id=(line->>'variant_id')::uuid for update;
  if p_action='count' and version='missing' and not exists(select 1 from pos_inventory i where i.id=stock.id and i.xmin::text=pg_current_xact_id()::text) then raise exception 'POS_INVENTORY_CHANGED';end if;
  if p_action='count' and qty<stock.reserved_quantity then raise exception 'POS_COUNT_BELOW_RESERVED';end if;
  if p_action='out' and qty>stock.quantity-stock.reserved_quantity then raise exception 'POS_INVENTORY_UNAVAILABLE';end if;
  if p_action in ('return','dispose') then
   select * into outitem from pos_retail_stock_out_items where out_id=outrow.id and variant_id=stock.variant_id for update;
   if not found or qty>outitem.sent-outitem.returned-outitem.disposed then raise exception 'POS_RETURN_EXCEEDS_PENDING';end if;
   update pos_retail_stock_out_items set returned=returned+case when p_action='return' then qty else 0 end,disposed=disposed+case when p_action='dispose' then qty else 0 end where out_id=outrow.id and variant_id=stock.variant_id;
  end if;
  delta:=case p_action when 'count' then qty-stock.quantity when 'out' then -qty when 'dispose' then 0 else qty end;
  if p_action='receive' then
   receiptitems:=receiptitems||jsonb_build_array(jsonb_build_object('variant_id',stock.variant_id,'quantity_mode','direct','input_quantity',qty,'input_unit_code',(select unit_code from pos_product_variants where id=stock.variant_id),'conversion_factor',1,'total_cost',line->'total_cost'));
  elsif p_action='dispose' then
   -- Already outside: disposal must NOT subtract store stock again. Audit the ownership loss explicitly.
   insert into pos_inventory_movements(brand_id,brand_slug,location_id,variant_id,movement_type,quantity_delta,quantity_before,quantity_after,reference_type,reference_id,notes,created_by)
   values(loc.brand_id,p_brand,p_location,stock.variant_id,'loss',0,stock.quantity,stock.quantity,'retail_out_disposal',p_request,p_body->>'reason',p_actor);
  else
   perform pos_adjust_inventory(p_brand,p_location,stock.variant_id,delta,case p_action when 'out' then 'transfer_out' when 'return' then 'transfer_in' else 'adjustment' end,
    coalesce(p_body->>'reason','')||' [lote '||p_request||']',p_actor,false);
  end if;
  if p_action='out' then insert into pos_retail_stock_out_items(out_id,variant_id,sent) values(outrow.id,stock.variant_id,qty);end if;
  changes:=changes||jsonb_build_array(jsonb_build_object('variant_id',stock.variant_id,'before',stock.quantity,'quantity',qty,'delta',delta,'after',stock.quantity+delta,'reserved',stock.reserved_quantity));
 end loop;
 if p_action='receive' then
  receipt:=pos_complete_inventory_receipt_v2(loc.brand_id,p_brand,p_location,p_body->>'supplier',p_body->>'reference',p_body->>'reason',receiptitems,p_actor,p_request);
  -- Legacy receipt core treats missing cost as 0 for arithmetic, but never overwrites prior variant costs.
  -- Preserve unknown-vs-zero explicitly without rewriting historical receipt data or FOOD behavior.
  update pos_inventory_receipts set metadata=metadata||jsonb_build_object('retail_cost_inputs',p_body->'items','staff_id',st.id) where id=(receipt#>>'{receipt,id}')::uuid;
 end if;
 result:=jsonb_build_object('id',p_request,'action',p_action,'changes',changes,'out',case when outrow.id is null then null else to_jsonb(outrow) end,'receipt',receipt);
 insert into pos_retail_inventory_batches(id,brand_slug,location_id,action,payload,result,staff_id,host_user_id)
 values(p_request,p_brand,p_location,p_action,p_body,result,st.id,p_actor);
 return result;
end $$;
revoke all on function public.pos_retail_inventory_batch_v1(text,uuid,uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.pos_retail_inventory_batch_v1(text,uuid,uuid,uuid,uuid,text,jsonb) to service_role;

create function public.pos_retail_inventory_catalog_v1(p_brand text,p_location uuid,p_search text default '',p_category uuid default null,p_filter text default 'all',p_page integer default 1,p_product uuid default null)
returns jsonb language sql stable security definer set search_path=public as $$
 with outside as (
  select oi.variant_id,sum(oi.sent-oi.returned-oi.disposed) quantity from pos_retail_stock_out_items oi join pos_retail_stock_outs o on o.id=oi.out_id
  where o.brand_slug=p_brand and o.location_id=p_location group by oi.variant_id
 ), variants as (
  select v.product_id,v.id,v.name,v.sku,v.barcode,v.attributes,v.unit_code,v.image_url,
   coalesce(i.quantity,0) quantity,coalesce(i.reserved_quantity,0) reserved,coalesce(i.quantity-i.reserved_quantity,0) available,
   coalesce(o.quantity,0) outside,coalesce(i.xmin::text,'missing') version
  from pos_product_variants v left join pos_inventory i on i.variant_id=v.id and i.location_id=p_location and i.brand_slug=p_brand
  left join outside o on o.variant_id=v.id where v.brand_slug=p_brand and v.active
 ), models as (
  select p.id,p.name,p.product_code,p.image_url,p.category_id,
   jsonb_agg(to_jsonb(v)-'product_id' order by v.name,v.id) variants,
   sum(v.quantity) quantity,sum(v.reserved) reserved,sum(v.available) available,sum(v.outside) outside
  from pos_products p join variants v on v.product_id=p.id
  where p.brand_slug=p_brand and p.active and p.track_inventory and p.inventory_mode='direct'
  group by p.id
 ), filtered as (
  select * from models m where (p_product is null or m.id=p_product) and (p_category is null or m.category_id=p_category)
  and (p_search='' or m.name ilike '%'||p_search||'%' or m.product_code ilike '%'||p_search||'%'
   or exists(select 1 from variants v where v.product_id=m.id and (v.sku ilike '%'||p_search||'%' or v.barcode ilike '%'||p_search||'%')))
  and (p_filter='all' or (p_filter='available' and m.available>0) or (p_filter='empty' and m.available<=0) or (p_filter='reserved' and m.reserved>0) or (p_filter='outside' and m.outside>0))
 ) select jsonb_build_object('models',coalesce((select jsonb_agg(to_jsonb(m)) from (select * from filtered order by name,id limit 25 offset (greatest(p_page,1)-1)*25) m),'[]'::jsonb),
 'total',(select count(*) from filtered),'totals',(select jsonb_build_object('quantity',coalesce(sum(quantity),0),'reserved',coalesce(sum(reserved_quantity),0),'available',coalesce(sum(quantity-reserved_quantity),0),'outside',(select coalesce(sum(quantity),0) from outside)) from pos_inventory where brand_slug=p_brand and location_id=p_location));
$$;
revoke all on function public.pos_retail_inventory_catalog_v1(text,uuid,text,uuid,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.pos_retail_inventory_catalog_v1(text,uuid,text,uuid,text,integer,uuid) to service_role;
create function public.pos_retail_stock_out_list_v1(p_brand text,p_location uuid,p_search text default '',p_page integer default 1)
returns jsonb language sql stable security definer set search_path=public as $$
 with filtered as (
 select o.* from pos_retail_stock_outs o where o.brand_slug=p_brand and o.location_id=p_location
 and (p_search='' or o.folio ilike '%'||p_search||'%' or o.responsible ilike '%'||p_search||'%' or o.reason ilike '%'||p_search||'%'
 or exists(select 1 from pos_retail_stock_out_items oi join pos_product_variants v on v.id=oi.variant_id join pos_products p on p.id=v.product_id where oi.out_id=o.id and (p.name ilike '%'||p_search||'%' or v.sku ilike '%'||p_search||'%')))
 ), paged as (select * from filtered order by created_at desc,id limit 25 offset (greatest(p_page,1)-1)*25)
 select jsonb_build_object('total',(select count(*) from filtered),'outs',coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object('items',
 (select jsonb_agg(to_jsonb(oi)||jsonb_build_object('variant',jsonb_build_object('name',v.name,'sku',v.sku,'attributes',v.attributes,'product',jsonb_build_object('id',p.id,'name',p.name,'image_url',p.image_url)))) from pos_retail_stock_out_items oi join pos_product_variants v on v.id=oi.variant_id join pos_products p on p.id=v.product_id where oi.out_id=o.id))) from paged o),'[]'::jsonb));
$$;
revoke all on function public.pos_retail_stock_out_list_v1(text,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.pos_retail_stock_out_list_v1(text,uuid,text,integer) to service_role;
-- Extend only the Retail report, preserving its financial queries and existing fields.
do $patch$
declare definition text; needle text:='i.quantity-i.reserved_quantity available,i.minimum_quantity,';
begin
 select pg_get_functiondef('public.pos_retail_report_v1(text,date,date,uuid,uuid,uuid,uuid,text)'::regprocedure) into definition;
 if position(needle in definition)=0 then raise exception 'Retail inventory report contract changed';end if;
 definition:=replace(definition,needle,needle||E'\n   coalesce((select sum(oi.sent-oi.returned-oi.disposed) from pos_retail_stock_out_items oi join pos_retail_stock_outs o on o.id=oi.out_id where o.brand_slug=p_brand and o.location_id=i.location_id and oi.variant_id=i.variant_id),0) outside,');
 execute definition;
end $patch$;
commit;
