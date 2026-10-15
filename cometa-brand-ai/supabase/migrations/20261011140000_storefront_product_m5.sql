begin;
-- Read-only public projection. Gates reuse M3, hence A1/M1/M2, not a parallel catalog.
create function public.brand_storefront_product_m5(p_brand_slug text,p_product uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare home jsonb; card jsonb; doc jsonb; variants jsonb; related jsonb; brand uuid;
begin
 home:=public.brand_storefront_home_m3(p_brand_slug);
 if home is null then return null; end if;
 card:=public.brand_storefront_cards_m3(p_brand_slug,array[p_product])->0;
 if card is null then return null; end if;
 select b.id,w.published into brand,doc from brands b join pos_product_web_content w on w.brand_id=b.id where b.slug=p_brand_slug and w.product_id=p_product;
 select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'price',v.price,
 'options',(select coalesce(jsonb_object_agg(key,value #>> '{}'),'{}') from jsonb_each(v.attributes) where jsonb_typeof(value) in ('string','number') and length(key)<=80 and length(value::text)<=160),
 'available',exists(select 1 from pos_inventory i join pos_locations l on l.id=i.location_id and l.brand_slug=p_brand_slug where i.variant_id=v.id and i.brand_slug=p_brand_slug and i.quantity-i.reserved_quantity>=1)) order by v.name,v.id),'[]') into variants
 from pos_product_variants v where v.product_id=p_product and v.brand_slug=p_brand_slug and v.active;
 related:=public.brand_storefront_cards_m3(p_brand_slug,array(select value::uuid from jsonb_array_elements_text(doc->'relatedIds') where value<>p_product::text));
 -- Disabled editorial content and stale variant references do not cross the public boundary.
 doc:=jsonb_build_object(
 'colors',(select coalesce(jsonb_agg(c || jsonb_build_object('variantIds',(select jsonb_agg(v->>'id') from jsonb_array_elements(variants) v where c->'variantIds' ? (v->>'id')))),'[]') from jsonb_array_elements(doc->'colors') c where exists(select 1 from jsonb_array_elements(variants) v where c->'variantIds' ? (v->>'id'))),
 'benefits',(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(doc->'benefits') x where (x->>'enabled')::boolean),
 'details',(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(doc->'details') x where (x->>'enabled')::boolean),
 'guide',doc->'guide','wholesale',case when (doc->'wholesale'->>'enabled')::boolean then doc->'wholesale' else '{"enabled":false,"title":"","content":""}'::jsonb end,
 'relatedIds',(select coalesce(jsonb_agg(x->>'id'),'[]') from jsonb_array_elements(related) x));
 return jsonb_build_object('appearance',home->'appearance','product',jsonb_build_object('id',p_product,'brandId',brand,'name',card->'name','currency',card->'currency','content',doc,'variants',variants,'related',related));
end $$;
revoke all on function public.brand_storefront_product_m5(text,uuid) from public;
grant execute on function public.brand_storefront_product_m5(text,uuid) to anon,authenticated,service_role;

-- Quantity is feasible in ONE existing inventory location, never a sum across branches.
-- This checks a bag intent only; no hold, price guarantee, checkout or inventory write.
create function public.brand_storefront_bag_validate_m5(p_brand_slug text,p_product uuid,p_variant uuid,p_quantity integer) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare d jsonb; v jsonb;
begin
 if p_quantity is null or p_quantity<1 or p_quantity>99 then return null; end if;
 d:=public.brand_storefront_product_m5(p_brand_slug,p_product);
 if d is null or d->'product'->>'currency' is null then return null; end if;
 select x into v from jsonb_array_elements(d->'product'->'variants') x where x->>'id'=p_variant::text;
 if v is null or not exists(select 1 from pos_inventory i join pos_locations l on l.id=i.location_id and l.brand_slug=p_brand_slug where i.variant_id=p_variant and i.brand_slug=p_brand_slug and i.quantity-i.reserved_quantity>=p_quantity) then return null; end if;
 return jsonb_build_object('brandId',d->'product'->'brandId','productId',p_product,'variantId',p_variant,'quantity',p_quantity,'price',v->'price','currency',d->'product'->'currency');
end $$;
revoke all on function public.brand_storefront_bag_validate_m5(text,uuid,uuid,integer) from public;
grant execute on function public.brand_storefront_bag_validate_m5(text,uuid,uuid,integer) to anon,authenticated,service_role;

create function public.brand_storefront_product_config_m5() returns trigger language plpgsql set search_path=public as $$
declare d jsonb; c jsonb;
begin
 foreach d in array array[new.draft,new.published] loop
  if d is null or not d ? 'product' then continue; end if;
  c:=d->'product';
  if jsonb_typeof(c) is distinct from 'object' or jsonb_typeof(c->'blocks') is distinct from 'array' then raise exception 'PRODUCT_APPEARANCE_INVALID'; end if;
  if jsonb_array_length(c->'blocks')<>9 or (select count(distinct x->>'kind') from jsonb_array_elements(c->'blocks') x)<>9
   or exists(select 1 from jsonb_array_elements(c->'blocks') x where x->>'kind' not in ('heading','price','selection','guide','benefits','buy','details','wholesale','related') or jsonb_typeof(x->'enabled') is distinct from 'boolean')
   or coalesce(c->>'gap','') !~ '^[0-9]+$' or (c->>'gap')::integer not between 8 and 48
   or coalesce(c->>'gallery','') not in ('compact','grid') or coalesce(c->>'fit','') not in ('cover','contain') or jsonb_typeof(c->'sticky') is distinct from 'boolean'
   or exists(select 1 from unnest(array['buyText','guideText','relatedText']) k where jsonb_typeof(c->k) is distinct from 'string' or length(trim(c->>k)) not between 1 and 80)
  then raise exception 'PRODUCT_APPEARANCE_INVALID'; end if;
 end loop;
 return new;
end $$;
create trigger brand_storefront_product_config_m5 before insert or update on public.brand_storefront_appearance for each row execute function public.brand_storefront_product_config_m5();
revoke all on function public.brand_storefront_product_config_m5() from public,anon,authenticated;
commit;
