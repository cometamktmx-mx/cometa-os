begin;
-- Extend the existing appearance document; no catalog/inventory duplication.
create function public.brand_storefront_catalog_validate_m4() returns trigger
language plpgsql security definer set search_path=public as $$
declare doc jsonb; cfg jsonb; slug text; path text;
begin
 select b.slug into slug from brands b where b.id=new.brand_id;
 foreach doc in array array[new.draft,new.published] loop
  cfg:=doc->'catalog'; if cfg is null then continue; end if;
  if jsonb_typeof(cfg)<>'object' or cfg->>'columns' not in ('2','3','4','5') or cfg->>'perPage' not in ('8','12','16','24','32','48')
   or cfg->>'sort' not in ('newest','price_asc','price_desc','name') or cfg->>'ratio' not in ('portrait','square','tall') then raise exception 'APPEARANCE_CATALOG_INVALID'; end if;
  path:=cfg->>'banner';
  if coalesce(path,'')<>'' then
   if path not like slug||'/web/%' or path ~ '(^|/)\.\.?(/|$)' then raise exception 'APPEARANCE_MEDIA_INVALID'; end if;
   perform 1 from storage.objects where bucket_id='pos-products' and name=path for share;
   if not found then raise exception 'APPEARANCE_MEDIA_INVALID'; end if;
  end if;
 end loop;
 return new;
end $$;
revoke all on function public.brand_storefront_catalog_validate_m4() from public,anon,authenticated,service_role;
create trigger brand_storefront_catalog_validate_m4 before insert or update on public.brand_storefront_appearance
for each row execute function public.brand_storefront_catalog_validate_m4();

create function public.brand_storefront_catalog_m4(p_brand_slug text,p_query jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare home jsonb; cfg jsonb; ids uuid[]; eligible jsonb; result jsonb; page_number integer; per_page integer; sort_order text;
 search_text text; category text; filter_color text; filter_size text; price_min numeric; price_max numeric; only_available boolean;
begin
 home:=brand_storefront_home_m3(p_brand_slug);
 if home is null then return null; end if;
 if p_query is null or jsonb_typeof(p_query)<>'object' or octet_length(p_query::text)>4000 then raise exception 'CATALOG_QUERY_INVALID'; end if;
 cfg:=home->'appearance'->'catalog';
 per_page:=coalesce((cfg->>'perPage')::integer,24); if per_page not in (8,12,16,24,32,48) then per_page:=24; end if;
 page_number:=greatest(1,least(100000,coalesce((p_query->>'page')::integer,1)));
 sort_order:=coalesce(nullif(p_query->>'sort',''),cfg->>'sort','newest');
 if sort_order not in ('newest','price_asc','price_desc','name') then raise exception 'CATALOG_QUERY_INVALID'; end if;
 search_text:=left(btrim(coalesce(p_query->>'q','')),150); category:=coalesce(p_query->>'category','');
 filter_color:=left(coalesce(p_query->>'color',''),100); filter_size:=left(coalesce(p_query->>'size',''),100);
 price_min:=nullif(p_query->>'min','')::numeric; price_max:=nullif(p_query->>'max','')::numeric;
 only_available:=coalesce((p_query->>'available')::boolean,false);
 select array_agg(id) into ids from pos_products where brand_slug=p_brand_slug;
 -- The existing M3 projection is the eligibility authority, including A1/M1/M2.
 eligible:=brand_storefront_cards_m3(p_brand_slug,coalesce(ids,'{}'));
 with base as materialized (
  select p.id,p.name,p.created_at,p.category_id,c.name category_name,e->>'currency' currency,w.published,
  coalesce((select string_agg((d->>'title')||' '||(d->>'content'),' ') from jsonb_array_elements(w.published->'details') d where d->>'enabled'='true'),'') description
  from jsonb_array_elements(eligible) e join pos_products p on p.id=(e->>'id')::uuid and p.brand_slug=p_brand_slug
  join pos_product_web_content w on w.product_id=p.id
  left join pos_categories c on c.id=p.category_id and c.brand_slug=p_brand_slug and c.active
 ), variants as materialized (
  select b.id product_id,v.id,v.price,coalesce(nullif(v.attributes->>'size',''),v.attributes->>'talla','') size,
   col.value color,coalesce(col.value->>'name','') color_name,
   exists(select 1 from pos_inventory i where i.variant_id=v.id and i.brand_slug=p_brand_slug and i.quantity-i.reserved_quantity>0) available
  from base b join pos_product_variants v on v.product_id=b.id and v.brand_slug=p_brand_slug and v.active
  left join lateral jsonb_array_elements(b.published->'colors') col on col.value->'variantIds' ? v.id::text
 ), matched as materialized (
  select b.*, (select min(v.price) from variants v where v.product_id=b.id) min_price,
   (select max(v.price) from variants v where v.product_id=b.id) max_price,
   exists(select 1 from variants v where v.product_id=b.id and v.available) available
  from base b where (search_text='' or strpos(lower(b.name||' '||b.description),lower(search_text))>0)
   and (category='' or (b.category_name is not null and b.category_id::text=category))
   and exists(select 1 from variants v where v.product_id=b.id
    and (filter_color='' or lower(v.color_name)=lower(filter_color))
    and (filter_size='' or lower(v.size)=lower(filter_size))
    and (price_min is null or (b.currency is not null and v.price>=price_min))
    and (price_max is null or (b.currency is not null and v.price<=price_max))
    and (not only_available or v.available))
 ), ranked as (
  select m.*,row_number() over(order by
   case when sort_order='price_asc' and currency is not null then min_price end asc nulls last,
   case when sort_order='price_desc' and currency is not null then min_price end desc nulls last,
   case when sort_order='name' then lower(name) end asc,
   case when sort_order='newest' then created_at end desc,id) rank
  from matched m
 ), cards as (
  select rank,jsonb_build_object('id',b.id,'name',b.name,'min',b.min_price,'max',b.max_price,'currency',b.currency,'available',b.available,
   'colors',coalesce((select jsonb_agg(x.doc order by x.ordinal) from (
    select col.ordinality ordinal,jsonb_build_object('id',col.value->>'id','name',col.value->>'name','hex',col.value->>'hex','swatch',col.value->>'swatchPath',
     'photos',col.value->'photos','min',min(v.price),'max',max(v.price),'available',bool_or(v.available)) doc
    from jsonb_array_elements(b.published->'colors') with ordinality col
    join variants v on v.product_id=b.id and col.value->'variantIds' ? v.id::text
    group by col.ordinality,col.value
   ) x),'[]'::jsonb)) card
  from ranked b where rank>(page_number-1)*per_page and rank<=page_number*per_page
 )
 select jsonb_build_object('appearance',home->'appearance','products',coalesce((select jsonb_agg(card order by rank) from cards),'[]'::jsonb),
  'total',(select count(*) from matched),'page',page_number,'perPage',per_page,
  'categories',coalesce((select jsonb_agg(jsonb_build_object('value',category_id,'label',category_name,'count',n) order by category_name) from (select category_id,category_name,count(*) n from base where category_name is not null group by category_id,category_name) c),'[]'::jsonb),
  'colors',coalesce((select jsonb_agg(jsonb_build_object('value',name,'label',name,'count',n) order by name) from (select color_name name,count(distinct product_id) n from variants where color_name<>'' group by color_name) c),'[]'::jsonb),
  'sizes',coalesce((select jsonb_agg(jsonb_build_object('value',name,'label',name,'count',n) order by name) from (select size name,count(distinct product_id) n from variants where size<>'' group by size) c),'[]'::jsonb)
 ) into result;
 return result;
end $$;
revoke all on function public.brand_storefront_catalog_m4(text,jsonb) from public;
grant execute on function public.brand_storefront_catalog_m4(text,jsonb) to anon,authenticated,service_role;
commit;
