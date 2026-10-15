begin;
-- V3A: replace only scoped C2 functions. No legacy data rewrite or grants on POS tables.
create or replace function public.comu_catalog_read_v1(p_seller uuid) returns jsonb
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
 'attributeDefinitions',coalesce((select jsonb_agg(to_jsonb(d) order by d.sort_order,d.code) from public.pos_product_attribute_definitions d where d.brand_slug=s.brand_slug and d.brand_id=s.brand_id and d.active),'[]'),
 'variantContract',jsonb_build_object('version',1,'skuMaxLength',80,'maxVariants',100),
 'progress',public.comu_seller_activation_check_v1(s.id));
end; $$;
revoke all on function public.comu_catalog_read_v1(uuid) from public,anon;
grant execute on function public.comu_catalog_read_v1(uuid) to authenticated;


create or replace function public.comu_catalog_save_v1(p_seller uuid,p_request uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s public.comu_sellers%rowtype; p public.pos_products%rowtype; v public.pos_product_variants%rowtype;
 inv public.pos_inventory%rowtype; receipt public.comu_catalog_commands%rowtype;
 v_product_id uuid; v_variant_id uuid; v_location_id uuid; v_category_id uuid; v_listing_id uuid; sf uuid; created_location uuid;
 item jsonb; adjustment jsonb; code_value text; sku_value text; attr record; variant_active boolean; amount numeric; expected numeric; price numeric; result jsonb; attrs jsonb;
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
 code_value:=nullif(btrim(p_payload->>'productCode'),'');
 if p.id is not null and not (p_payload ? 'productCode') then code_value:=p.product_code;
 elsif p.id is null or (p_payload->>'productCode') is distinct from p.product_code then
   code_value:=upper(code_value);
   if code_value is not null and code_value !~ '^[A-Z0-9][A-Z0-9_-]{0,63}$' then raise exception 'COMU_PRODUCT_CODE_INVALID'; end if;
 else code_value:=p.product_code; end if;
 if nullif(btrim(p_payload->>'name'),'') is null or length(p_payload->>'name')>180 or length(coalesce(p_payload->>'description',''))>1500 then raise exception 'COMU_CATALOG_INVALID'; end if;
 if jsonb_typeof(p_payload->'variants') is distinct from 'array' or jsonb_array_length(p_payload->'variants') not between 1 and 100 then raise exception 'COMU_VARIANTS_INVALID'; end if;
 v_category_id:=nullif(p_payload->>'categoryId','')::uuid;
 if v_category_id is not null and not exists(select 1 from public.pos_categories where id=v_category_id and brand_slug=s.brand_slug and brand_id=s.brand_id and active) then raise exception 'COMU_CATEGORY_DENIED'; end if;
 if v_category_id is null and nullif(btrim(p_payload->>'categoryName'),'') is not null then
   if length(p_payload->>'categoryName')>100 then raise exception 'COMU_CATALOG_INVALID'; end if;
   select id into v_category_id from public.pos_categories where brand_slug=s.brand_slug and brand_id=s.brand_id and lower(name)=lower(btrim(p_payload->>'categoryName')) and active order by id limit 1;
   if v_category_id is null then insert into public.pos_categories(brand_id,brand_slug,name,created_by) values(s.brand_id,s.brand_slug,btrim(p_payload->>'categoryName'),auth.uid()) returning id into v_category_id; end if;
 end if;
 if code_value is not null and exists(select 1 from public.pos_products where brand_slug=s.brand_slug and id<>v_product_id and lower(btrim(product_code))=lower(btrim(code_value))) then raise exception 'COMU_CODE_DUPLICATED'; end if;
 if p.id is null then
   insert into public.pos_products(id,brand_id,brand_slug,name,description,category_id,product_code,created_by)
   values(v_product_id,s.brand_id,s.brand_slug,btrim(p_payload->>'name'),p_payload->>'description',v_category_id,code_value,auth.uid());
 else
   update public.pos_products set name=btrim(p_payload->>'name'),description=p_payload->>'description',category_id=v_category_id,product_code=code_value,updated_at=clock_timestamp() where id=v_product_id;
 end if;
 select id into sf from public.comu_storefronts where seller_id=s.id;
 if sf is null then raise exception 'COMU_STOREFRONT_REQUIRED'; end if;
 insert into public.comu_product_listings(seller_id,storefront_id,product_id,public_slug,status)
 values(s.id,sf,v_product_id,'product-'||v_product_id::text,'DRAFT') on conflict(seller_id,product_id) do nothing;
 select l.id into v_listing_id from public.comu_product_listings l where l.seller_id=s.id and l.product_id=v_product_id;
 for item in select value from jsonb_array_elements(p_payload->'variants') loop
   v:=null;
   v_variant_id:=nullif(item->>'id','')::uuid;
   if v_variant_id is not null then
     select * into v from public.pos_product_variants where id=v_variant_id and pos_product_variants.product_id=v_product_id and brand_slug=s.brand_slug and brand_id=s.brand_id for update;
     if not found then raise exception 'COMU_VARIANT_DENIED'; end if;
   else v_variant_id:=gen_random_uuid(); end if;
   price:=(item->>'price')::numeric;
   attrs:=coalesce(item->'attributes',v.attributes,'{}'::jsonb);
   if price is null or price<0 or price>999999999999.99 or price<>round(price,2) or jsonb_typeof(attrs)<>'object' or nullif(btrim(item->>'name'),'') is null or length(item->>'name')>180 then raise exception 'COMU_VARIANTS_INVALID'; end if;
   -- Validate only new/changed values: legacy identifiers/attributes remain byte-for-byte unchanged.
   if v.id is not null and (not (item ? 'sku') or (item->>'sku') is not distinct from v.sku) then sku_value:=v.sku;
   else
     if length(coalesce(item->>'sku',''))>80 then raise exception 'COMU_SKU_MAX_80'; end if;
     sku_value:=nullif(btrim(item->>'sku'),'');
   end if;
   perform public.pos_normalize_variant_attributes_v1(attrs);
   for attr in select key,value from jsonb_each(attrs) loop
     if v.id is null or not (v.attributes ? attr.key) or attr.value is distinct from v.attributes->attr.key then
       if not exists(select 1 from public.pos_product_attribute_definitions d where d.brand_id=s.brand_id and d.brand_slug=s.brand_slug and d.active and d.code=attr.key) then raise exception 'COMU_ATTRIBUTE_UNDEFINED'; end if;
       -- POS persists textual controls; preserve legacy non-text values only when unchanged.
       if jsonb_typeof(attr.value)<>'string' then raise exception 'COMU_ATTRIBUTE_TEXT_REQUIRED'; end if;
       if btrim(attr.value #>> '{}')='' then raise exception 'COMU_ATTRIBUTE_EMPTY'; end if;
     end if;
   end loop;
   if (v.id is null or attrs is distinct from v.attributes) and exists(
     select 1 from public.pos_product_attribute_definitions d
     where d.brand_id=s.brand_id and d.brand_slug=s.brand_slug and d.active and d.required
       and (not (attrs ? d.code) or jsonb_typeof(attrs->d.code)<>'string' or btrim(attrs->>d.code)='')
   ) then raise exception 'COMU_ATTRIBUTE_REQUIRED'; end if;
   if item ? 'active' and jsonb_typeof(item->'active')<>'boolean' then raise exception 'COMU_VARIANT_ACTIVE_INVALID'; end if;
   variant_active:=coalesce((item->>'active')::boolean,v.active,true);
   if sku_value is not null and exists(select 1 from public.pos_product_variants where brand_slug=s.brand_slug and id<>v_variant_id and lower(btrim(sku))=lower(btrim(sku_value))) then raise exception 'COMU_SKU_DUPLICATED'; end if;
   insert into public.pos_product_variants(id,brand_id,brand_slug,product_id,name,sku,price,attributes,variant_signature,unit_code,is_default,active,created_by)
   values(v_variant_id,s.brand_id,s.brand_slug,v_product_id,btrim(item->>'name'),sku_value,price,attrs,public.pos_variant_signature_v1(attrs),coalesce(p.default_unit_code,'piece'),not exists(select 1 from public.pos_product_variants where product_id=v_product_id),variant_active,auth.uid())
   on conflict(id) do update set active=excluded.active,name=excluded.name,sku=excluded.sku,price=excluded.price,attributes=excluded.attributes,variant_signature=excluded.variant_signature,updated_at=clock_timestamp();
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

commit;
