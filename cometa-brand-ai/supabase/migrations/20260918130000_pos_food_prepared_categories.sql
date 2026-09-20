-- Add canonical catalog categories to Food prepared products without introducing a parallel model.
do $migration$
declare
  definition text;
  anchor text;
  replacement text;
  occurrences integer;
begin
  select pg_get_functiondef('public.pos_food_recipes_admin_v1(text,uuid,uuid,uuid,text,jsonb)'::regprocedure) into definition;

  anchor := ' id uuid; product uuid; revision uuid; version_number integer; row jsonb; presentation_id uuid; qty numeric; content numeric; cost numeric; mode text; unit text;';
  replacement := ' id uuid; product uuid; revision uuid; category uuid; version_number integer; row jsonb; presentation_id uuid; qty numeric; content numeric; cost numeric; mode text; unit text;';
  occurrences := (length(definition) - length(replace(definition, anchor, ''))) / length(anchor);
  if occurrences <> 1 then raise exception 'FOOD_CATEGORY_ANCHOR_MISMATCH: declaration'; end if;
  definition := replace(definition, anchor, replacement);

  anchor := '  cost:=public.pos_food_purchase_cost_v1((payload->>''price'')::numeric);';
  replacement := anchor || E'\n  category:=nullif(payload->>''category_id'','''')::uuid;\n  if category is not null and not exists(select 1 from public.pos_categories where id=category and brand_slug=brand and active) then raise exception ''POS_FOOD_FORBIDDEN''; end if;';
  occurrences := (length(definition) - length(replace(definition, anchor, ''))) / length(anchor);
  if occurrences <> 1 then raise exception 'FOOD_CATEGORY_ANCHOR_MISMATCH: product cost'; end if;
  definition := replace(definition, anchor, replacement);

  -- Keep the original INSERT shape readable while adding the category column explicitly.
  anchor := '   insert into public.pos_products(id,brand_id,brand_slug,name,description,product_type,inventory_mode,track_inventory,default_unit_code,sellable,purchasable,tax_rate,created_by)';
  replacement := '   insert into public.pos_products(id,brand_id,brand_slug,name,category_id,description,product_type,inventory_mode,track_inventory,default_unit_code,sellable,purchasable,tax_rate,created_by)';
  occurrences := (length(definition) - length(replace(definition, anchor, ''))) / length(anchor);
  if occurrences <> 1 then raise exception 'FOOD_CATEGORY_ANCHOR_MISMATCH: product insert'; end if;
  definition := replace(definition, anchor, replacement);
  anchor := '   values(product,b::text,brand,btrim(payload->>''name''),payload->>''description'',''prepared'',''recipe'',false,''piece'',true,false,coalesce((payload->>''tax_rate'')::numeric,0),host);';
  replacement := '   values(product,b::text,brand,btrim(payload->>''name''),category,payload->>''description'',''prepared'',''recipe'',false,''piece'',true,false,coalesce((payload->>''tax_rate'')::numeric,0),host);';
  occurrences := (length(definition) - length(replace(definition, anchor, ''))) / length(anchor);
  if occurrences <> 1 then raise exception 'FOOD_CATEGORY_ANCHOR_MISMATCH: product values'; end if;
  definition := replace(definition, anchor, replacement);

  anchor := '   update public.pos_products set name=btrim(payload->>''name''),description=payload->>''description'',tax_rate=coalesce((payload->>''tax_rate'')::numeric,0),active=coalesce((payload->>''active'')::boolean,true) where pos_products.id=product;';
  replacement := '   update public.pos_products set name=btrim(payload->>''name''),category_id=category,description=payload->>''description'',tax_rate=coalesce((payload->>''tax_rate'')::numeric,0),active=coalesce((payload->>''active'')::boolean,true) where pos_products.id=product;';
  occurrences := (length(definition) - length(replace(definition, anchor, ''))) / length(anchor);
  if occurrences <> 1 then raise exception 'FOOD_CATEGORY_ANCHOR_MISMATCH: product update'; end if;
  definition := replace(definition, anchor, replacement);
  execute definition;

  select pg_get_functiondef('public.pos_food_recipes_catalog_v1(text,uuid,uuid,uuid)'::regprocedure) into definition;
  anchor := ' ''recipe_components'',coalesce((select jsonb_agg(to_jsonb(rc) order by rc.ingredient_variant_id)';
  replacement := ' ''category_id'',p.category_id,''category_name'',c.name,''recipe_components'',coalesce((select jsonb_agg(to_jsonb(rc) order by rc.ingredient_variant_id)';
  occurrences := (length(definition) - length(replace(definition, anchor, ''))) / length(anchor);
  if occurrences <> 1 then raise exception 'FOOD_CATEGORY_ANCHOR_MISMATCH: catalog fields'; end if;
  definition := replace(definition, anchor, replacement);
  anchor := ' from public.pos_product_variants v join public.pos_products p on p.id=v.product_id and p.brand_slug=v.brand_slug where v.brand_slug=brand and p.sellable and p.product_type in (''physical'',''prepared''))';
  replacement := ' from public.pos_product_variants v join public.pos_products p on p.id=v.product_id and p.brand_slug=v.brand_slug left join public.pos_categories c on c.id=p.category_id and c.brand_slug=brand where v.brand_slug=brand and p.sellable and p.product_type in (''physical'',''prepared''))';
  occurrences := (length(definition) - length(replace(definition, anchor, ''))) / length(anchor);
  if occurrences <> 1 then raise exception 'FOOD_CATEGORY_ANCHOR_MISMATCH: catalog join'; end if;
  definition := replace(definition, anchor, replacement);
  execute definition;
end
$migration$;
