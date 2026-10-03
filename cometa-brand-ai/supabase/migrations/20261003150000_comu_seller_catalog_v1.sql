begin;
-- Channel command receipts only: canonical products/variants/stock remain POS tables.
create table public.comu_catalog_commands (
 seller_id uuid not null references public.comu_sellers(id), request_id uuid not null,
 actor_id uuid not null references auth.users(id), payload jsonb not null, result jsonb not null,
 created_at timestamptz not null default now(), primary key(seller_id,request_id)
);
alter table public.comu_catalog_commands enable row level security;
revoke all on public.comu_catalog_commands from public,anon,authenticated;

create function public.comu_catalog_access_v1(p_seller uuid) returns public.comu_sellers
language plpgsql security definer set search_path=public as $$
declare s public.comu_sellers%rowtype;
begin
 if auth.uid() is null or not exists(select 1 from public.user_profiles where user_id=auth.uid() and status='active') then raise exception 'COMU_CATALOG_DENIED'; end if;
 select * into s from public.comu_sellers where id=p_seller for share;
 if s.id is null or s.status not in ('PREPARING','ACTIVE') or s.verification_status<>'VERIFIED' then raise exception 'COMU_CATALOG_DENIED'; end if;
 perform 1 from public.comu_seller_memberships where seller_id=s.id and user_id=auth.uid() and active and role in ('OWNER','ADMIN','CATALOG_MANAGER') for share;
 if not found then raise exception 'COMU_CATALOG_DENIED'; end if;
 if s.approval_origin='C1' and not exists(select 1 from public.comu_seller_applications where id=s.approval_application_id and seller_id=s.id and status='APPROVED' and decision='APPROVED' and reviewed_by is not null and reviewed_at is not null) then raise exception 'COMU_CATALOG_DENIED'; end if;
 return s;
end; $$;
revoke all on function public.comu_catalog_access_v1(uuid) from public,anon,authenticated;

create function public.comu_catalog_read_v1(p_seller uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s public.comu_sellers%rowtype;
begin
 s:=public.comu_catalog_access_v1(p_seller);
 return jsonb_build_object(
 'products',coalesce((select jsonb_agg(to_jsonb(p) order by p.name) from public.pos_products p where p.brand_slug=s.brand_slug and p.brand_id=s.brand_id),'[]'),
 'variants',coalesce((select jsonb_agg(to_jsonb(v)) from public.pos_product_variants v join public.pos_products p on p.id=v.product_id where p.brand_slug=s.brand_slug and p.brand_id=s.brand_id and v.brand_slug=s.brand_slug),'[]'),
 'inventory',coalesce((select jsonb_agg(to_jsonb(i)) from public.pos_inventory i where i.brand_slug=s.brand_slug and i.brand_id=s.brand_id),'[]'),
 'locations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from public.pos_locations where brand_slug=s.brand_slug and brand_id=s.brand_id and active),'[]'),
 'categories',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from public.pos_categories where brand_slug=s.brand_slug and brand_id=s.brand_id and active),'[]'),
 'listings',coalesce((select jsonb_agg(to_jsonb(l)) from public.comu_product_listings l where seller_id=s.id),'[]'),
 'progress',public.comu_seller_activation_check_v1(s.id));
end; $$;
revoke all on function public.comu_catalog_read_v1(uuid) from public,anon;
grant execute on function public.comu_catalog_read_v1(uuid) to authenticated;

create function public.comu_catalog_save_v1(p_seller uuid,p_request uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s public.comu_sellers%rowtype; p public.pos_products%rowtype; v public.pos_product_variants%rowtype;
 inv public.pos_inventory%rowtype; receipt public.comu_catalog_commands%rowtype;
 v_product_id uuid; v_variant_id uuid; v_location_id uuid; v_category_id uuid; v_listing_id uuid; sf uuid; created_location uuid;
 item jsonb; adjustment jsonb; amount numeric; expected numeric; price numeric; result jsonb; attrs jsonb;
begin
 s:=public.comu_catalog_access_v1(p_seller);
 if p_request is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>131072 then raise exception 'COMU_CATALOG_INVALID'; end if;
 -- Serialize channel edits per seller; inventory row locks also coordinate checkout/POS.
 perform pg_advisory_xact_lock(hashtextextended('comu-catalog:'||s.id::text,0));
 select * into receipt from public.comu_catalog_commands where seller_id=s.id and request_id=p_request;
 if found then
   if receipt.actor_id<>auth.uid() or receipt.payload<>p_payload then raise exception 'COMU_IDEMPOTENCY_CONFLICT'; end if;
   return receipt.result;
 end if;
 v_product_id:=nullif(p_payload->>'id','')::uuid;
 if v_product_id is not null then
   select * into p from public.pos_products where id=v_product_id and brand_id=s.brand_id and brand_slug=s.brand_slug for update;
   if not found then raise exception 'COMU_PRODUCT_DENIED'; end if;
   if p.product_type<>'physical' or p.inventory_mode<>'direct' then raise exception 'COMU_PRODUCT_SPECIALIZED'; end if;
   if p_payload->>'expectedUpdatedAt' is null or p.updated_at<>(p_payload->>'expectedUpdatedAt')::timestamptz then raise exception 'COMU_CATALOG_STALE'; end if;
 else v_product_id:=gen_random_uuid(); end if;
 if nullif(btrim(p_payload->>'name'),'') is null or length(p_payload->>'name')>180 or length(coalesce(p_payload->>'description',''))>1500 or length(coalesce(p_payload->>'productCode',''))>80 then raise exception 'COMU_CATALOG_INVALID'; end if;
 if jsonb_typeof(p_payload->'variants') is distinct from 'array' or jsonb_array_length(p_payload->'variants') not between 1 and 100 then raise exception 'COMU_VARIANTS_INVALID'; end if;
 v_category_id:=nullif(p_payload->>'categoryId','')::uuid;
 if v_category_id is not null and not exists(select 1 from public.pos_categories where id=v_category_id and brand_slug=s.brand_slug and brand_id=s.brand_id and active) then raise exception 'COMU_CATEGORY_DENIED'; end if;
 if v_category_id is null and nullif(btrim(p_payload->>'categoryName'),'') is not null then
   if length(p_payload->>'categoryName')>100 then raise exception 'COMU_CATALOG_INVALID'; end if;
   select id into v_category_id from public.pos_categories where brand_slug=s.brand_slug and brand_id=s.brand_id and lower(name)=lower(btrim(p_payload->>'categoryName')) and active order by id limit 1;
   if v_category_id is null then insert into public.pos_categories(brand_id,brand_slug,name,created_by) values(s.brand_id,s.brand_slug,btrim(p_payload->>'categoryName'),auth.uid()) returning id into v_category_id; end if;
 end if;
 if nullif(btrim(p_payload->>'productCode'),'') is not null and exists(select 1 from public.pos_products where brand_slug=s.brand_slug and id<>v_product_id and lower(product_code)=lower(btrim(p_payload->>'productCode'))) then raise exception 'COMU_CODE_DUPLICATED'; end if;
 if p.id is null then
   insert into public.pos_products(id,brand_id,brand_slug,name,description,category_id,product_code,created_by)
   values(v_product_id,s.brand_id,s.brand_slug,btrim(p_payload->>'name'),p_payload->>'description',v_category_id,nullif(btrim(p_payload->>'productCode'),''),auth.uid());
 else
   update public.pos_products set name=btrim(p_payload->>'name'),description=p_payload->>'description',category_id=v_category_id,product_code=nullif(btrim(p_payload->>'productCode'),''),updated_at=clock_timestamp() where id=v_product_id;
 end if;
 select id into sf from public.comu_storefronts where seller_id=s.id;
 if sf is null then raise exception 'COMU_STOREFRONT_REQUIRED'; end if;
 insert into public.comu_product_listings(seller_id,storefront_id,product_id,public_slug,status)
 values(s.id,sf,v_product_id,'product-'||v_product_id::text,'DRAFT') on conflict(seller_id,product_id) do nothing;
 select l.id into v_listing_id from public.comu_product_listings l where l.seller_id=s.id and l.product_id=v_product_id;
 for item in select value from jsonb_array_elements(p_payload->'variants') loop
   v_variant_id:=nullif(item->>'id','')::uuid;
   if v_variant_id is not null then
     select * into v from public.pos_product_variants where id=v_variant_id and pos_product_variants.product_id=v_product_id and brand_slug=s.brand_slug and brand_id=s.brand_id for update;
     if not found then raise exception 'COMU_VARIANT_DENIED'; end if;
   else v_variant_id:=gen_random_uuid(); end if;
   price:=(item->>'price')::numeric;
   attrs:=coalesce(item->'attributes','{}'::jsonb);
   if price is null or price<0 or price>999999999999.99 or price<>round(price,2) or jsonb_typeof(attrs)<>'object' or nullif(btrim(item->>'name'),'') is null or length(item->>'name')>180 or length(coalesce(item->>'sku',''))>100 then raise exception 'COMU_VARIANTS_INVALID'; end if;
   if nullif(btrim(item->>'sku'),'') is not null and exists(select 1 from public.pos_product_variants where brand_slug=s.brand_slug and id<>v_variant_id and lower(sku)=lower(btrim(item->>'sku'))) then raise exception 'COMU_SKU_DUPLICATED'; end if;
   insert into public.pos_product_variants(id,brand_id,brand_slug,product_id,name,sku,price,attributes,variant_signature,unit_code,is_default,created_by)
   values(v_variant_id,s.brand_id,s.brand_slug,v_product_id,btrim(item->>'name'),nullif(btrim(item->>'sku'),''),price,attrs,public.pos_variant_signature_v1(attrs),coalesce(p.default_unit_code,'piece'),not exists(select 1 from public.pos_product_variants where product_id=v_product_id),auth.uid())
   on conflict(id) do update set name=excluded.name,sku=excluded.sku,price=excluded.price,attributes=excluded.attributes,variant_signature=excluded.variant_signature,updated_at=clock_timestamp();
   insert into public.comu_variant_listings(listing_id,variant_id) values(v_listing_id,v_variant_id) on conflict do nothing;
   -- Omitted stock means unchanged, never an implicit zero.
   for adjustment in select value from jsonb_array_elements(coalesce(item->'stock','[]'::jsonb)) loop
     v_location_id:=nullif(adjustment->>'locationId','')::uuid;
     v_location_id:=coalesce(v_location_id,created_location);
     if v_location_id is null then
       if exists(select 1 from public.pos_locations where brand_slug=s.brand_slug) then raise exception 'COMU_LOCATION_REQUIRED'; end if;
       insert into public.pos_locations(brand_id,brand_slug,name,code,created_by) values(s.brand_id,s.brand_slug,'Almacen COMU','COMU',auth.uid()) returning id into v_location_id;
       created_location:=v_location_id;
     end if;
     if not exists(select 1 from public.pos_locations where id=v_location_id and brand_slug=s.brand_slug and brand_id=s.brand_id and active) then raise exception 'COMU_LOCATION_DENIED'; end if;
     amount:=(adjustment->>'quantity')::numeric; expected:=(adjustment->>'expectedQuantity')::numeric;
     if amount is null or expected is null or amount<0 or amount>99999999999.999 or amount<>round(amount,3) then raise exception 'COMU_STOCK_INVALID'; end if;
     insert into public.pos_inventory(brand_id,brand_slug,location_id,variant_id) values(s.brand_id,s.brand_slug,v_location_id,v_variant_id) on conflict(location_id,variant_id) do nothing;
     select * into inv from public.pos_inventory where pos_inventory.location_id=v_location_id and pos_inventory.variant_id=v_variant_id for update;
     if inv.brand_slug<>s.brand_slug or inv.brand_id<>s.brand_id then raise exception 'COMU_STOCK_DENIED'; end if;
     if inv.quantity<>expected then raise exception 'COMU_STOCK_STALE'; end if;
     if amount<inv.reserved_quantity then raise exception 'COMU_STOCK_RESERVED'; end if;
     if amount<>inv.quantity then
       update public.pos_inventory set quantity=amount,updated_at=clock_timestamp() where id=inv.id;
       insert into public.pos_inventory_movements(brand_id,brand_slug,location_id,variant_id,movement_type,quantity_delta,quantity_before,quantity_after,reference_type,reference_id,notes,created_by)
       values(s.brand_id,s.brand_slug,v_location_id,v_variant_id,'adjustment',amount-inv.quantity,inv.quantity,amount,'comu_catalog',p_request,'COMU physical stock adjustment',auth.uid());
     end if;
   end loop;
 end loop;
 update public.pos_products set has_variants=has_variants or (select count(*)>1 or bool_or(attributes<>'{}'::jsonb) from public.pos_product_variants where pos_product_variants.product_id=v_product_id),updated_at=clock_timestamp() where id=v_product_id;
 result:=jsonb_build_object('ok',true,'productId',v_product_id,'listingId',v_listing_id);
 insert into public.comu_catalog_commands(seller_id,request_id,actor_id,payload,result) values(s.id,p_request,auth.uid(),p_payload,result);
 return result;
end; $$;
revoke all on function public.comu_catalog_save_v1(uuid,uuid,jsonb) from public,anon;
grant execute on function public.comu_catalog_save_v1(uuid,uuid,jsonb) to authenticated;
-- Preserve existing media rows; new attachments cannot point at another listing's object.
create function public.comu_catalog_media_guard_v1() returns trigger
language plpgsql security definer set search_path=public as $$
declare seller uuid; prefix text;
begin
 if TG_OP='UPDATE' and row(new.listing_id,new.storage_path,new.public_url,new.variant_id) is not distinct from row(old.listing_id,old.storage_path,old.public_url,old.variant_id) then return new; end if;
 select seller_id into seller from public.comu_product_listings where id=new.listing_id;
 prefix:='comu/'||seller::text||'/'||new.listing_id::text||'/';
 if seller is null or new.storage_path not like prefix||'%' or new.storage_path ~ '(\.\.|%)'
 or new.public_url not like '%/storage/v1/object/public/comu-products/'||new.storage_path then raise exception 'COMU_MEDIA_OWNERSHIP_REQUIRED'; end if;
 if new.variant_id is not null and not exists(select 1 from public.comu_product_listings l join public.pos_product_variants v on v.product_id=l.product_id where l.id=new.listing_id and v.id=new.variant_id) then raise exception 'COMU_MEDIA_VARIANT_DENIED'; end if;
 return new;
end; $$;
revoke all on function public.comu_catalog_media_guard_v1() from public,anon,authenticated;
create trigger comu_catalog_media_guard before insert or update on public.comu_product_media for each row execute function public.comu_catalog_media_guard_v1();
-- Intentionally no grants on pos_* tables, no POS membership/entitlements.
commit;
