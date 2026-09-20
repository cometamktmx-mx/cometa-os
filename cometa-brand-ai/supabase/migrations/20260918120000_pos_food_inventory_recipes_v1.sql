-- Food Inventory & Recipes V1. Existing variant/location inventory is the only stock ledger.
begin;
update public.pos_capability_catalog set launch_status='live' where code in ('ingredients','recipes');

insert into public.pos_units(code,name,symbol,unit_type,decimal_precision,sort_order)
values ('mg','Miligramo','mg','weight',3,31),('g','Gramo','g','weight',3,32),
 ('kg','Kilogramo','kg','weight',3,33),('ml','Mililitro','ml','volume',3,41),
 ('l','Litro','L','volume',3,42),('piece','Pieza','pza','count',0,10)
on conflict(code) do nothing;
update public.pos_units set symbol='L' where code='l' and unit_type='volume';
-- Abort rather than silently redefine an incompatible existing unit.
do $$ begin
 if exists(select 1 from (values ('mg','weight'),('g','weight'),('kg','weight'),('ml','volume'),('l','volume'),('piece','count')) v(code,dimension)
 join public.pos_units u using(code) where u.unit_type<>v.dimension or not u.active) then raise exception 'FOOD_UNIT_SEED_CONFLICT'; end if;
end $$;
insert into public.pos_unit_conversions(from_unit_code,to_unit_code,multiplier)
values ('mg','g',0.001),('g','mg',1000),('g','kg',0.001),('kg','g',1000),
 ('mg','kg',0.000001),('kg','mg',1000000),('l','ml',1000),('ml','l',0.001)
on conflict(from_unit_code,to_unit_code) do nothing;
do $$ begin
 if exists(select 1 from (values ('mg','g',0.001::numeric),('g','mg',1000),('g','kg',0.001),('kg','g',1000),
 ('mg','kg',0.000001),('kg','mg',1000000),('l','ml',1000),('ml','l',0.001)) v(a,b,f)
 join public.pos_unit_conversions c on c.from_unit_code=v.a and c.to_unit_code=v.b where c.multiplier<>v.f or not c.active) then raise exception 'FOOD_CONVERSION_SEED_CONFLICT'; end if;
end $$;

alter table public.pos_variant_purchase_presentations add column configured_cost numeric(18,2) null check(configured_cost>=0), add column supplier_name text null;
alter table public.pos_food_items add column inventory_mode text null check(inventory_mode in ('direct','none','recipe'));
-- Existing Modifiers writes FOOD_MODIFIERS_CONFIG. Preserve the installed audit
-- vocabulary while admitting both Food configuration actions in this new migration.
do $$ declare expression text; begin
 select pg_get_expr(conbin,conrelid) into expression from pg_constraint
 where conrelid='public.pos_staff_audit_events'::regclass and conname='pos_staff_audit_events_action_check' and contype='c';
 if expression is null then raise exception 'FOOD_AUDIT_ACTION_CONSTRAINT_MISSING'; end if;
 alter table public.pos_staff_audit_events drop constraint pos_staff_audit_events_action_check;
 execute format('alter table public.pos_staff_audit_events add constraint pos_staff_audit_events_action_check check ((%s) or action in (''FOOD_RECIPES_CONFIG'',''FOOD_MODIFIERS_CONFIG''))',expression);
end $$;

create table public.pos_food_ingredient_settings (
 ingredient_variant_id uuid primary key, brand_slug text not null,
 category text not null check(category in ('food','base','packaging','consumable')),
 waste_percent numeric(7,4) not null default 0 check(waste_percent>=0 and waste_percent<100),
 supplier_name text null, updated_at timestamptz not null default now(),
 foreign key(ingredient_variant_id,brand_slug) references public.pos_product_variants(id,brand_slug) on delete restrict
);
create table public.pos_food_recipe_versions (
 id uuid primary key default gen_random_uuid(), brand_slug text not null,
 variant_id uuid not null, version integer not null check(version>0),
 created_by uuid not null, created_at timestamptz not null default now(), published_at timestamptz null,
 unique(id,brand_slug), unique(variant_id,version),
 foreign key(variant_id,brand_slug) references public.pos_product_variants(id,brand_slug) on delete restrict,
 foreign key(created_by,brand_slug) references public.pos_staff(id,brand_slug) on delete restrict
);
create table public.pos_food_recipe_components (
 recipe_version_id uuid not null, brand_slug text not null, ingredient_variant_id uuid not null,
 input_quantity numeric not null check(input_quantity>0), input_unit_code text not null references public.pos_units(code),
 base_quantity numeric(14,3) not null check(base_quantity>0), base_unit_code text not null references public.pos_units(code),
 primary key(recipe_version_id,ingredient_variant_id),
 foreign key(recipe_version_id,brand_slug) references public.pos_food_recipe_versions(id,brand_slug) on delete restrict,
 foreign key(ingredient_variant_id,brand_slug) references public.pos_product_variants(id,brand_slug) on delete restrict
);
create table public.pos_food_modifier_recipe_effects (
 id uuid primary key default gen_random_uuid(), brand_slug text not null, product_id uuid not null, option_id uuid not null,
 effect text not null check(effect in ('ADD','REMOVE','REPLACE')),
 source_variant_id uuid null, ingredient_variant_id uuid null,
 input_quantity numeric null check(input_quantity>0), input_unit_code text null references public.pos_units(code),
 base_quantity numeric(14,3) null check(base_quantity>0), base_unit_code text null references public.pos_units(code),
 unique(product_id,option_id),
 foreign key(product_id,brand_slug) references public.pos_products(id,brand_slug) on delete restrict,
 foreign key(option_id,brand_slug) references public.pos_food_modifier_options(id,brand_slug) on delete restrict,
 foreign key(source_variant_id,brand_slug) references public.pos_product_variants(id,brand_slug) on delete restrict,
 foreign key(ingredient_variant_id,brand_slug) references public.pos_product_variants(id,brand_slug) on delete restrict,
 check((effect='ADD' and source_variant_id is null and ingredient_variant_id is not null and base_quantity is not null)
 or (effect='REMOVE' and source_variant_id is not null and ingredient_variant_id is null)
 or (effect='REPLACE' and source_variant_id is not null and ingredient_variant_id is not null and source_variant_id<>ingredient_variant_id and base_quantity is not null))
);
create table public.pos_food_item_recipe_snapshots (
 food_item_id uuid primary key, brand_slug text not null, check_id uuid not null, location_id uuid not null,
 recipe_version_id uuid not null, components jsonb not null check(jsonb_typeof(components)='array'),
 effects jsonb not null check(jsonb_typeof(effects)='array'), unit_cost numeric(18,6) not null check(unit_cost>=0),
 proof text not null, created_at timestamptz not null default now(),
 unique(food_item_id,brand_slug),
 foreign key(food_item_id,brand_slug,check_id) references public.pos_food_items(id,brand_slug,check_id) on delete restrict,
 foreign key(check_id,brand_slug,location_id) references public.pos_food_checks(id,brand_slug,location_id) on delete restrict,
 foreign key(recipe_version_id,brand_slug) references public.pos_food_recipe_versions(id,brand_slug) on delete restrict
);
create unique index pos_food_recipe_sales_location_identity on public.pos_sales(id,brand_slug,location_id);
create unique index pos_food_recipe_movements_identity on public.pos_inventory_movements(id,brand_slug,location_id,variant_id);
create table public.pos_food_sale_consumptions (
 id uuid primary key default gen_random_uuid(), brand_slug text not null, location_id uuid not null,
 sale_id uuid not null references public.pos_sales(id) on delete restrict,
 food_item_id uuid not null, ingredient_variant_id uuid not null,
 base_quantity numeric(14,3) not null check(base_quantity>0), base_unit_code text not null references public.pos_units(code),
 unit_cost numeric(18,6) not null check(unit_cost>=0), total_cost numeric(24,6) not null check(total_cost>=0),
 movement_id uuid not null references public.pos_inventory_movements(id) on delete restrict,
 created_at timestamptz not null default now(), unique(sale_id,food_item_id,ingredient_variant_id),
 foreign key(sale_id,brand_slug) references public.pos_sales(id,brand_slug) on delete restrict,
 foreign key(sale_id,brand_slug,location_id) references public.pos_sales(id,brand_slug,location_id) on delete restrict,
 foreign key(movement_id,brand_slug,location_id,ingredient_variant_id) references public.pos_inventory_movements(id,brand_slug,location_id,variant_id) on delete restrict,
 foreign key(location_id,brand_slug) references public.pos_locations(id,brand_slug) on delete restrict,
 foreign key(food_item_id,brand_slug) references public.pos_food_item_recipe_snapshots(food_item_id,brand_slug) on delete restrict,
 foreign key(ingredient_variant_id,brand_slug) references public.pos_product_variants(id,brand_slug) on delete restrict
);
create index pos_food_sale_consumptions_sale on public.pos_food_sale_consumptions(brand_slug,sale_id);
create index pos_food_recipes_current on public.pos_food_recipe_versions(brand_slug,variant_id,version desc) where published_at is not null;

create function public.pos_food_exact_quantity_v1(q numeric) returns numeric language plpgsql immutable as $$
begin
 if q is null or q::text in ('NaN','Infinity','-Infinity') or q<0 or q>=100000000000 or q<>trunc(q,3) then raise exception 'POS_FOOD_RECIPE_PRECISION'; end if;
 return q;
end $$;
create function public.pos_food_purchase_cost_v1(c numeric) returns numeric language plpgsql immutable as $$
begin
 if c is null or c::text in ('NaN','Infinity','-Infinity') or c<0 or c>=1000000000000 or c<>round(c,2) then raise exception 'POS_FOOD_INVALID'; end if;
 return c;
end $$;
create function public.pos_food_convert_quantity_v1(q numeric, source text, destination text) returns numeric
language plpgsql stable security definer set search_path=public as $$
declare a public.pos_units%rowtype; b public.pos_units%rowtype; factor numeric;
begin
 select * into a from public.pos_units where code=source and active;
 if not found then raise exception 'POS_FOOD_RECIPE_UNIT'; end if;
 select * into b from public.pos_units where code=destination and active;
 if not found or a.unit_type<>b.unit_type or a.unit_type not in ('weight','volume','count') then raise exception 'POS_FOOD_RECIPE_UNIT'; end if;
 if q is null or q<=0 then raise exception 'POS_FOOD_INVALID'; end if;
 if source=destination then factor:=1; else
 select multiplier into factor from public.pos_unit_conversions where from_unit_code=source and to_unit_code=destination and active;
 if not found then raise exception 'POS_FOOD_RECIPE_UNIT'; end if; end if;
 q:=public.pos_food_exact_quantity_v1(q*factor);
 if q<=0 or (b.unit_type='count' and q<>trunc(q)) then raise exception 'POS_FOOD_RECIPE_PRECISION'; end if;
 return q;
end $$;
create function public.pos_food_ingredient_v1(brand text, variant uuid) returns public.pos_product_variants
language plpgsql security definer set search_path=public as $$
declare v public.pos_product_variants%rowtype;
begin
 select pv.* into v from public.pos_product_variants pv join public.pos_products p on p.id=pv.product_id and p.brand_slug=pv.brand_slug
 where pv.id=variant and pv.brand_slug=brand and pv.active and p.active and p.product_type='ingredient' and p.inventory_mode='direct' and p.track_inventory and not p.sellable and p.purchasable for share of pv,p;
 if not found then raise exception 'POS_FOOD_RECIPE_INGREDIENT'; end if;
 return v;
end $$;
create function public.pos_food_receipt_quantity_guard_v1(brand text, variant uuid, presentation uuid, mode text, input_unit text, base_unit text, factor numeric, input_quantity numeric, purchase_cost numeric) returns void
language plpgsql security definer set search_path=public as $$
declare v public.pos_product_variants%rowtype; expected numeric; q numeric;
begin
 v:=public.pos_food_ingredient_v1(brand,variant);
 if base_unit<>v.unit_code then raise exception 'POS_FOOD_RECIPE_UNIT'; end if;
 q:=public.pos_food_exact_quantity_v1(input_quantity);
 if q<=0 then raise exception 'POS_FOOD_INVALID'; end if;
 perform public.pos_food_purchase_cost_v1(purchase_cost);
 if mode='fixed_package' then
  if presentation is null or input_unit<>'piece' or q<>trunc(q) then raise exception 'POS_FOOD_RECIPE_UNIT'; end if;
  perform public.pos_food_exact_quantity_v1(factor);
 else
  perform public.pos_food_convert_quantity_v1(q,input_unit,base_unit);
  if input_unit=base_unit then expected:=1; else select multiplier into expected from public.pos_unit_conversions where from_unit_code=input_unit and to_unit_code=base_unit and active; end if;
  if factor is distinct from expected then raise exception 'POS_FOOD_RECIPE_UNIT'; end if;
 end if;
 q:=public.pos_food_exact_quantity_v1(q*factor);
 if q<=0 or (v.unit_code='piece' and q<>trunc(q)) then raise exception 'POS_FOOD_RECIPE_PRECISION'; end if;
end $$;
create function public.pos_food_presentation_guard_v1() returns trigger language plpgsql set search_path=public as $$
begin
 if exists(select 1 from public.pos_products p join public.pos_product_variants v on v.product_id=p.id and v.brand_slug=p.brand_slug where v.id=new.variant_id and v.brand_slug=new.brand_slug and p.product_type='ingredient') then
  perform public.pos_food_receipt_quantity_guard_v1(new.brand_slug,new.variant_id,new.id,new.quantity_mode,new.input_unit_code,new.base_unit_code,new.conversion_factor,new.default_input_quantity,coalesce(new.configured_cost,0));
 end if;
 return new;
end $$;
create trigger pos_food_ingredient_presentation_guard before insert or update on public.pos_variant_purchase_presentations for each row execute function public.pos_food_presentation_guard_v1();
create function public.pos_food_recipe_immutable_v1() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_table_name='pos_food_recipe_components' then
   if tg_op<>'INSERT' or exists(select 1 from public.pos_food_recipe_versions where id=new.recipe_version_id and published_at is not null) then raise exception 'POS_FOOD_RECIPE_FROZEN'; end if;
   return new;
 end if;
 if tg_table_name='pos_food_recipe_versions' and tg_op='UPDATE' and old.published_at is null and new.published_at is not null
 and (to_jsonb(old)-'published_at')=(to_jsonb(new)-'published_at') then return new; end if;
 raise exception 'POS_FOOD_RECIPE_FROZEN';
end $$;
create trigger pos_food_recipe_versions_immutable before update or delete on public.pos_food_recipe_versions for each row execute function public.pos_food_recipe_immutable_v1();
create trigger pos_food_recipe_components_immutable before insert or update or delete on public.pos_food_recipe_components for each row execute function public.pos_food_recipe_immutable_v1();
create trigger pos_food_recipe_snapshots_immutable before update or delete on public.pos_food_item_recipe_snapshots for each row execute function public.pos_food_recipe_immutable_v1();
create trigger pos_food_consumptions_immutable before update or delete on public.pos_food_sale_consumptions for each row execute function public.pos_food_recipe_immutable_v1();

-- Quantities and costs are resolved here, never accepted as a checkout override.
create function public.pos_food_effective_recipe_v1(brand text, variant uuid, modifiers jsonb default '[]') returns jsonb
language plpgsql security definer set search_path=public as $$
declare recipe public.pos_food_recipe_versions%rowtype; product uuid; component record; effect_row record;
 quantities jsonb:='{}'; additions jsonb:='{}'; original jsonb; touched uuid[]:='{}'; effects jsonb:='[]'; result jsonb:='[]'; q numeric; v public.pos_product_variants%rowtype; total numeric:=0;
begin
 select pv.product_id into product from public.pos_product_variants pv join public.pos_products p on p.id=pv.product_id and p.brand_slug=pv.brand_slug
 where pv.id=variant and pv.brand_slug=brand and pv.active and p.active and p.product_type='prepared' and p.inventory_mode='recipe' and p.sellable for share of pv,p;
 if not found then raise exception 'POS_FOOD_RECIPE_INVALID'; end if;
 select * into recipe from public.pos_food_recipe_versions where variant_id=variant and brand_slug=brand and published_at is not null order by version desc limit 1;
 if not found then raise exception 'POS_FOOD_RECIPE_REQUIRED'; end if;
 for component in select * from public.pos_food_recipe_components where recipe_version_id=recipe.id order by ingredient_variant_id loop
  v:=public.pos_food_ingredient_v1(brand,component.ingredient_variant_id);
  if v.unit_code<>component.base_unit_code then raise exception 'POS_FOOD_RECIPE_UNIT'; end if;
  quantities:=quantities||jsonb_build_object(v.id::text,component.base_quantity);
 end loop;
 original:=quantities;
 -- Rules operate on the base recipe. Two removals/replacements of one source are ambiguous.
 for effect_row in select e.* from public.pos_food_modifier_recipe_effects e
 join public.pos_food_modifier_options o on o.id=e.option_id and o.brand_slug=e.brand_slug
 join public.pos_food_product_modifier_groups a on a.product_id=e.product_id and a.group_id=o.group_id and a.brand_slug=e.brand_slug
 where e.brand_slug=brand and e.product_id=product and e.option_id in (select (value->>'option_id')::uuid from jsonb_array_elements(modifiers))
 order by case when e.effect='ADD' then 1 else 0 end,e.id for share of e,a loop
  if effect_row.effect<>'ADD' then
   if not (original ? effect_row.source_variant_id::text) or effect_row.source_variant_id=any(touched) then raise exception 'POS_FOOD_RECIPE_EFFECT_CONFLICT'; end if;
   touched:=array_append(touched,effect_row.source_variant_id);
   q:=(original->>effect_row.source_variant_id::text)::numeric;
   if effect_row.effect='REMOVE' and effect_row.base_quantity is not null then
    if effect_row.base_quantity>q then raise exception 'POS_FOOD_RECIPE_EFFECT_CONFLICT'; end if;
    q:=q-effect_row.base_quantity;
   else q:=0; end if;
   quantities:=quantities||jsonb_build_object(effect_row.source_variant_id::text,q);
  end if;
  if effect_row.effect in ('ADD','REPLACE') then
   v:=public.pos_food_ingredient_v1(brand,effect_row.ingredient_variant_id);
   if v.unit_code<>effect_row.base_unit_code then raise exception 'POS_FOOD_RECIPE_UNIT'; end if;
   additions:=additions||jsonb_build_object(v.id::text,coalesce((additions->>v.id::text)::numeric,0)+effect_row.base_quantity);
  end if;
  effects:=effects||jsonb_build_array(to_jsonb(effect_row));
 end loop;
 for component in select key,value from jsonb_each_text(additions) order by key loop
  quantities:=quantities||jsonb_build_object(component.key,coalesce((quantities->>component.key)::numeric,0)+component.value::numeric);
 end loop;
 for component in select key,value from jsonb_each_text(quantities) order by key loop
  q:=public.pos_food_exact_quantity_v1(component.value::numeric);
  if q>0 then
   v:=public.pos_food_ingredient_v1(brand,component.key::uuid);
   total:=total+q*v.cost;
   result:=result||jsonb_build_array(jsonb_build_object('ingredient_variant_id',v.id,'name',(select name from public.pos_products where id=v.product_id),
    'base_quantity',q,'base_unit_code',v.unit_code,'unit_cost',v.cost,'subtotal',q*v.cost));
  end if;
 end loop;
 return jsonb_build_object('recipe_version_id',recipe.id,'version',recipe.version,'components',result,'effects',effects,'unit_cost',round(total,6));
end $$;

create function public.pos_food_recipe_metrics_v1(brand text, location uuid, variant uuid, modifiers jsonb default '[]') returns jsonb
language plpgsql security definer set search_path=public as $$
declare recipe jsonb; c jsonb; stock public.pos_inventory%rowtype; waste numeric; available numeric; usable numeric; possible numeric; estimated numeric;
 rows jsonb:='[]'; minimum numeric:=null; usable_min numeric:=null; limiting text; remaining numeric; price numeric;
begin
 if not exists(select 1 from public.pos_locations where id=location and brand_slug=brand and active) then raise exception 'POS_FOOD_FORBIDDEN'; end if;
 recipe:=public.pos_food_effective_recipe_v1(brand,variant,modifiers);
 select pv.price into price from public.pos_product_variants pv where id=variant and brand_slug=brand;
 for c in select value from jsonb_array_elements(recipe->'components') loop
  select * into stock from public.pos_inventory where variant_id=(c->>'ingredient_variant_id')::uuid and location_id=location and brand_slug=brand;
  select coalesce(waste_percent,0) into waste from public.pos_food_ingredient_settings where ingredient_variant_id=(c->>'ingredient_variant_id')::uuid and brand_slug=brand;
  waste:=coalesce(waste,0); available:=greatest(0,coalesce(stock.quantity,0)-coalesce(stock.reserved_quantity,0)); usable:=available*(1-waste/100);
  possible:=floor(available/(c->>'base_quantity')::numeric); estimated:=floor(usable/(c->>'base_quantity')::numeric);
  rows:=rows||jsonb_build_array(c||jsonb_build_object('physical_stock',coalesce(stock.quantity,0),'available_stock',available,'usable_estimated_stock',usable,'possible',possible,'usable_estimated_possible',estimated,'waste_percent',waste));
  if minimum is null or possible<minimum then minimum:=possible; limiting:=c->>'name'; remaining:=available-possible*(c->>'base_quantity')::numeric; end if;
  if usable_min is null or estimated<usable_min then usable_min:=estimated; end if;
 end loop;
 return recipe||jsonb_build_object('components',rows,'price',price,'gross_profit',price-(recipe->>'unit_cost')::numeric,
 'gross_margin',case when price>0 then (price-(recipe->>'unit_cost')::numeric)/price else null end,
 'availability',minimum,'usable_estimated_availability',usable_min,'limiting_ingredient',limiting,'limiting_remaining',remaining);
end $$;

create function public.pos_food_snapshot_recipe_round_v1(brand text, account uuid) returns void
language plpgsql security definer set search_path=public as $$
declare i public.pos_food_items%rowtype; c public.pos_food_checks%rowtype; r jsonb; proof text;
begin
 select * into c from public.pos_food_checks where id=account and brand_slug=brand for update;
 if not found or c.status<>'OPEN' then raise exception 'POS_FOOD_CONFLICT'; end if;
 for i in select * from public.pos_food_items where check_id=account and brand_slug=brand and ticket_id is null and voided_at is null and inventory_mode='recipe' order by id for update loop
  -- Revalidate applicability without rewriting the existing modifier price snapshot.
  perform public.pos_food_resolve_modifiers_v1(brand,i.product_id,coalesce((select jsonb_agg(value->'option_id') from jsonb_array_elements(i.configuration->'modifiers')),'[]'::jsonb));
  r:=public.pos_food_effective_recipe_v1(brand,i.variant_id,i.configuration->'modifiers');
  proof:=encode(sha256(convert_to(jsonb_build_object('item',i.id,'quantity',i.quantity,'check',account,'location',c.location_id,'recipe',r)::text,'UTF8')),'hex');
  insert into public.pos_food_item_recipe_snapshots(food_item_id,brand_slug,check_id,location_id,recipe_version_id,components,effects,unit_cost,proof)
  values(i.id,brand,account,c.location_id,(r->>'recipe_version_id')::uuid,r->'components',r->'effects',(r->>'unit_cost')::numeric,proof);
 end loop;
 -- Availability only. Sending never reserves or consumes stock.
 if exists(select 1 from public.pos_food_item_recipe_snapshots s join public.pos_food_items fi on fi.id=s.food_item_id
 cross join lateral jsonb_array_elements(s.components) x
 left join public.pos_inventory inv on inv.brand_slug=brand and inv.location_id=c.location_id and inv.variant_id=(x->>'ingredient_variant_id')::uuid
 where s.check_id=account and s.brand_slug=brand and fi.ticket_id is null and fi.voided_at is null
 group by x->>'ingredient_variant_id',inv.quantity,inv.reserved_quantity
 having coalesce(inv.quantity-inv.reserved_quantity,0)<sum((x->>'base_quantity')::numeric*fi.quantity)) then raise exception 'POS_FOOD_STOCK_UNAVAILABLE'; end if;
end $$;

create function public.pos_food_recipe_availability_v1(brand text, location uuid, variant uuid) returns numeric
language plpgsql security definer set search_path=public as $$
begin
 return (public.pos_food_recipe_metrics_v1(brand,location,variant)->>'availability')::numeric;
exception when others then
 -- Invalid/inactive recipe definitions are unavailable; database failures remain failures.
 if sqlerrm in ('POS_FOOD_RECIPE_REQUIRED','POS_FOOD_RECIPE_INGREDIENT','POS_FOOD_RECIPE_UNIT','POS_FOOD_RECIPE_INVALID') then return 0; end if;
 raise;
end $$;

create function public.pos_food_item_inventory_mode_v1() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='INSERT' then
  select inventory_mode into new.inventory_mode from public.pos_products where id=new.product_id and brand_slug=new.brand_slug;
 elsif new.inventory_mode is distinct from old.inventory_mode or ((old.ticket_id is not null or exists(select 1 from public.pos_food_item_recipe_snapshots where food_item_id=old.id)) and (new.quantity<>old.quantity or new.variant_id<>old.variant_id or new.product_id<>old.product_id)) then raise exception 'POS_FOOD_RECIPE_FROZEN'; end if;
 return new;
end $$;
create trigger pos_food_item_inventory_mode before insert or update on public.pos_food_items for each row execute function public.pos_food_item_inventory_mode_v1();

create function public.pos_food_recipe_checkout_line_v1(brand text, item uuid, variant uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare i public.pos_food_items%rowtype; s public.pos_food_item_recipe_snapshots%rowtype; mode text;
begin
 select inventory_mode into mode from public.pos_products p join public.pos_product_variants v on v.product_id=p.id and v.brand_slug=p.brand_slug where v.id=variant and v.brand_slug=brand;
 if item is null then
  if mode='recipe' then raise exception 'POS_FOOD_CHECKOUT_INVALID'; end if;
  return '{}';
 end if;
 select * into i from public.pos_food_items where id=item and brand_slug=brand and variant_id=variant;
 if not found then raise exception 'POS_FOOD_CHECKOUT_INVALID'; end if;
 if i.inventory_mode='recipe' then
  select * into s from public.pos_food_item_recipe_snapshots where food_item_id=item and brand_slug=brand;
  if not found then raise exception 'POS_FOOD_RECIPE_REQUIRED'; end if;
  return jsonb_build_object('recipe_mode',true,'unit_cost',s.unit_cost,'recipe_proof',s.proof);
 end if;
 if mode='recipe' and not exists(select 1 from public.pos_food_checks where id=i.check_id and brand_slug=brand and status='CLOSED') then raise exception 'POS_FOOD_CHECKOUT_INVALID'; end if;
 return '{}';
end $$;

create function public.pos_food_consume_sale_recipes_v1(brand text, location uuid, account uuid, sale uuid) returns void
language plpgsql security definer set search_path=public as $$
#variable_conflict use_variable
declare demand record; line record; inv public.pos_inventory%rowtype; movement uuid; quantity numeric;
begin
 if not exists(select 1 from public.pos_sales where id=sale and brand_slug=brand and location_id=location and idempotency_key=account)
 or not exists(select 1 from public.pos_food_checks where id=account and brand_slug=brand and location_id=location and status='PAYMENT_PENDING') then raise exception 'POS_FOOD_CHECKOUT_INVALID'; end if;
 if exists(select 1 from public.pos_food_sale_consumptions where sale_id=sale) then raise exception 'POS_FOOD_CONFLICT'; end if;
 -- Prelock recipe and direct stock in one deterministic order before the shared direct engine.
 for demand in
  select variant_id from (
   select (x->>'ingredient_variant_id')::uuid variant_id from public.pos_food_item_recipe_snapshots s join public.pos_food_items i on i.id=s.food_item_id
    cross join lateral jsonb_array_elements(s.components) x where s.check_id=account and s.brand_slug=brand and i.voided_at is null
   union select variant_id from public.pos_food_items where check_id=account and brand_slug=brand and voided_at is null and track_inventory
  ) stocks order by variant_id
 loop
  perform 1 from public.pos_inventory where brand_slug=brand and location_id=location and variant_id=demand.variant_id for update;
 end loop;
 for demand in
  select (x->>'ingredient_variant_id')::uuid variant_id,sum((x->>'base_quantity')::numeric*i.quantity) quantity
  from public.pos_food_item_recipe_snapshots s join public.pos_food_items i on i.id=s.food_item_id cross join lateral jsonb_array_elements(s.components) x
  where s.check_id=account and s.brand_slug=brand and s.location_id=location and i.voided_at is null group by x->>'ingredient_variant_id' order by x->>'ingredient_variant_id'
 loop
  quantity:=public.pos_food_exact_quantity_v1(demand.quantity);
  select * into inv from public.pos_inventory where brand_slug=brand and location_id=location and variant_id=demand.variant_id for update;
  if not found or inv.quantity-inv.reserved_quantity<quantity then raise exception 'POS_FOOD_STOCK_UNAVAILABLE'; end if;
  update public.pos_inventory set quantity=pos_inventory.quantity-quantity where id=inv.id;
  insert into public.pos_inventory_movements(brand_id,brand_slug,location_id,variant_id,movement_type,quantity_delta,quantity_before,quantity_after,reference_type,reference_id,notes,created_by)
  values(inv.brand_id,brand,location,demand.variant_id,'sale',-quantity,inv.quantity,inv.quantity-quantity,'sale',sale,'Food recipe consumption',(select sold_by from public.pos_sales where id=sale)) returning id into movement;
  for line in select i.id item_id,x from public.pos_food_item_recipe_snapshots s join public.pos_food_items i on i.id=s.food_item_id cross join lateral jsonb_array_elements(s.components) x
   where s.check_id=account and s.brand_slug=brand and i.voided_at is null and (x->>'ingredient_variant_id')::uuid=demand.variant_id loop
   insert into public.pos_food_sale_consumptions(brand_slug,location_id,sale_id,food_item_id,ingredient_variant_id,base_quantity,base_unit_code,unit_cost,total_cost,movement_id)
   select brand,location,sale,line.item_id,demand.variant_id,(line.x->>'base_quantity')::numeric*i.quantity,line.x->>'base_unit_code',
    (line.x->>'unit_cost')::numeric,(line.x->>'base_quantity')::numeric*i.quantity*(line.x->>'unit_cost')::numeric,movement from public.pos_food_items i where id=line.item_id;
  end loop;
 end loop;
 update public.pos_food_items set inventory_committed_at=clock_timestamp() where check_id=account and brand_slug=brand and inventory_mode='recipe' and voided_at is null;
end $$;

-- Administrative commands require the same protected Food actor as operations.
create function public.pos_food_recipes_admin_v1(brand text, host uuid, session uuid, location uuid, action text, payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
#variable_conflict use_variable
declare actor public.pos_staff%rowtype; b uuid; v public.pos_product_variants%rowtype; src public.pos_product_variants%rowtype;
 id uuid; product uuid; revision uuid; version_number integer; row jsonb; presentation_id uuid; qty numeric; content numeric; cost numeric; mode text; unit text;
 result jsonb; effect text; source_id uuid; target_id uuid; option_id uuid;
 command_key uuid; prior public.pos_staff_audit_events%rowtype;
begin
 actor:=public.pos_food_actor_v1(brand,host,session);
 if actor.role<>'ADMIN' or (actor.location_id is not null and actor.location_id<>location)
 or not exists(select 1 from public.pos_locations where brand_slug=brand and pos_locations.id=location and active) then raise exception 'POS_FOOD_FORBIDDEN'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' then raise exception 'POS_FOOD_INVALID'; end if;
 command_key:=coalesce(nullif(payload->>'command_key','')::uuid,gen_random_uuid());
 perform pg_advisory_xact_lock(hashtextextended(brand||':food-recipes:'||command_key::text,0));
 select * into prior from public.pos_staff_audit_events where pos_staff_audit_events.id=command_key and brand_slug=brand;
 if found then
  if prior.action is distinct from 'FOOD_RECIPES_CONFIG' or prior.actor_staff_id is distinct from actor.id or prior.host_user_id is distinct from host or prior.location_id is distinct from location
   or (prior.metadata->>'command_action') is distinct from action or (prior.metadata->'payload') is distinct from payload then raise exception 'POS_FOOD_CONFLICT'; end if;
  return prior.metadata->'result';
 end if;
 select brands.id into b from public.brands where slug=brand;
 if action='ingredient_save' then
  id:=nullif(payload->>'id','')::uuid; unit:=payload->>'unit_code';
  if unit not in ('g','ml','piece') or unit is null or length(btrim(payload->>'name')) not between 1 and 180 then raise exception 'POS_FOOD_INVALID'; end if;
  if id is null then
   product:=gen_random_uuid(); id:=gen_random_uuid();
   insert into public.pos_products(id,brand_id,brand_slug,name,product_type,inventory_mode,track_inventory,default_unit_code,sellable,purchasable,created_by)
   values(product,b::text,brand,btrim(payload->>'name'),'ingredient','direct',true,unit,false,true,host);
   insert into public.pos_product_variants(id,brand_id,brand_slug,product_id,name,unit_code,is_default,variant_signature,created_by)
   values(id,b::text,brand,product,'Única',unit,true,'{}',host);
   qty:=public.pos_food_exact_quantity_v1(coalesce((payload->>'initial_quantity')::numeric,0));
   if unit='piece' and qty<>trunc(qty) then raise exception 'POS_FOOD_RECIPE_PRECISION'; end if;
   perform public.pos_adjust_inventory(brand,location,id,qty,'initial','Food ingredient initial stock',host,true);
  else
   v:=public.pos_food_ingredient_v1(brand,id);
   if unit<>v.unit_code then raise exception 'POS_FOOD_RECIPE_UNIT'; end if;
   product:=v.product_id;
  end if;
  insert into public.pos_food_ingredient_settings(ingredient_variant_id,brand_slug,category,waste_percent,supplier_name)
  values(id,brand,payload->>'category',coalesce((payload->>'waste_percent')::numeric,0),nullif(btrim(payload->>'supplier_name'),''))
  on conflict(ingredient_variant_id) do update set category=excluded.category,waste_percent=excluded.waste_percent,supplier_name=excluded.supplier_name,updated_at=now();
  qty:=public.pos_food_exact_quantity_v1(coalesce((payload->>'minimum_quantity')::numeric,0));
  if unit='piece' and qty<>trunc(qty) then raise exception 'POS_FOOD_RECIPE_PRECISION'; end if;
  insert into public.pos_inventory(brand_id,brand_slug,location_id,variant_id,minimum_quantity) values(b::text,brand,location,id,qty)
  on conflict(location_id,variant_id) do update set minimum_quantity=excluded.minimum_quantity;
  if jsonb_typeof(payload->'presentations') is distinct from 'array' or jsonb_array_length(payload->'presentations')>30 then raise exception 'POS_FOOD_INVALID'; end if;
  for row in select value from jsonb_array_elements(payload->'presentations') loop
   content:=public.pos_food_convert_quantity_v1((row->>'content')::numeric,row->>'unit_code',unit);
   cost:=public.pos_food_purchase_cost_v1((row->>'cost')::numeric);
   if cost is null or cost<0 or cost<>round(cost,2) or length(btrim(row->>'name')) not between 1 and 180 then raise exception 'POS_FOOD_INVALID'; end if;
   presentation_id:=coalesce(nullif(row->>'id','')::uuid,gen_random_uuid());
   if exists(select 1 from public.pos_variant_purchase_presentations p where p.id=presentation_id and (p.brand_slug<>brand or p.variant_id<>id)) then raise exception 'POS_FOOD_FORBIDDEN'; end if;
   -- A fixed package is a count of containers with explicitly configured base content.
   insert into public.pos_variant_purchase_presentations(id,brand_id,brand_slug,variant_id,name,quantity_mode,input_unit_code,base_unit_code,conversion_factor,configured_cost,supplier_name,active)
   values(presentation_id,b::text,brand,id,btrim(row->>'name'),'fixed_package','piece',unit,content,cost,nullif(btrim(row->>'supplier_name'),''),coalesce((row->>'active')::boolean,true))
   on conflict on constraint pos_variant_purchase_presentations_pkey do update set name=excluded.name,conversion_factor=excluded.conversion_factor,configured_cost=excluded.configured_cost,supplier_name=excluded.supplier_name,active=excluded.active;
  end loop;
  -- Only initial creation derives current unit cost from the first purchase presentation.
  if nullif(payload->>'id','') is null and jsonb_array_length(payload->'presentations')>0 then
   row:=payload->'presentations'->0;
   content:=public.pos_food_convert_quantity_v1((row->>'content')::numeric,row->>'unit_code',unit);
   update public.pos_product_variants set cost=round((row->>'cost')::numeric/content,6) where pos_product_variants.id=id;
  end if;
  update public.pos_products set name=btrim(payload->>'name'),active=coalesce((payload->>'active')::boolean,true) where pos_products.id=product;
 elsif action='ingredient_status' then
  id:=(payload->>'id')::uuid;
  select pv.* into v from public.pos_product_variants pv join public.pos_products p on p.id=pv.product_id and p.brand_slug=pv.brand_slug where pv.id=id and pv.brand_slug=brand and p.product_type='ingredient' for update of pv,p;
  if not found or jsonb_typeof(payload->'active') is distinct from 'boolean' then raise exception 'POS_FOOD_FORBIDDEN'; end if;
  update public.pos_products set active=(payload->>'active')::boolean where pos_products.id=v.product_id;
 elsif action='adjust' then
  id:=(payload->>'id')::uuid; v:=public.pos_food_ingredient_v1(brand,id);
  qty:=(payload->>'quantity')::numeric;
  perform public.pos_food_exact_quantity_v1(abs(qty));
  if qty is null or qty=0 or (v.unit_code='piece' and qty<>trunc(qty)) then raise exception 'POS_FOOD_INVALID'; end if;
  perform public.pos_adjust_inventory(brand,location,id,qty,'adjustment',nullif(btrim(payload->>'notes'),''),host,false);
 elsif action='cost_set' then
  id:=(payload->>'id')::uuid; v:=public.pos_food_ingredient_v1(brand,id);
  content:=public.pos_food_convert_quantity_v1((payload->>'content')::numeric,payload->>'unit_code',v.unit_code);
  cost:=public.pos_food_purchase_cost_v1((payload->>'cost')::numeric);
  if cost is null or cost<0 or cost<>round(cost,2) then raise exception 'POS_FOOD_INVALID'; end if;
  update public.pos_product_variants set cost=round(cost/content,6) where pos_product_variants.id=id;
 elsif action='receive' then
  id:=(payload->>'id')::uuid; v:=public.pos_food_ingredient_v1(brand,id);
  presentation_id:=(payload->>'presentation_id')::uuid;
  select to_jsonb(p) into row from public.pos_variant_purchase_presentations p where p.id=presentation_id and p.variant_id=id and p.brand_slug=brand and p.active for share;
  if not found then raise exception 'POS_FOOD_FORBIDDEN'; end if;
  qty:=(payload->>'quantity')::numeric;
  if qty is null or qty<=0 or qty<>trunc(qty) then raise exception 'POS_FOOD_INVALID'; end if;
  perform public.pos_food_exact_quantity_v1(qty*(row->>'conversion_factor')::numeric);
  if (row->>'configured_cost') is null then raise exception 'POS_FOOD_INVALID'; end if;
  result:=public.pos_complete_inventory_receipt_v2(b::text,brand,location,row->>'supplier_name',null,payload->>'notes',
   jsonb_build_array(jsonb_build_object('variant_id',id,'purchase_presentation_id',presentation_id,'input_quantity',qty,'total_cost',qty*(row->>'configured_cost')::numeric)),host,(payload->>'request_key')::uuid);
 elsif action='product_save' then
  id:=nullif(payload->>'id','')::uuid;
  cost:=public.pos_food_purchase_cost_v1((payload->>'price')::numeric);
  if cost is null or cost<0 or cost<>round(cost,2) or length(btrim(payload->>'name')) not between 1 and 180 then raise exception 'POS_FOOD_INVALID'; end if;
  if id is null then
   product:=gen_random_uuid(); id:=gen_random_uuid();
   insert into public.pos_products(id,brand_id,brand_slug,name,description,product_type,inventory_mode,track_inventory,default_unit_code,sellable,purchasable,tax_rate,created_by)
   values(product,b::text,brand,btrim(payload->>'name'),payload->>'description','prepared','recipe',false,'piece',true,false,coalesce((payload->>'tax_rate')::numeric,0),host);
   insert into public.pos_product_variants(id,brand_id,brand_slug,product_id,name,unit_code,is_default,variant_signature,price,created_by)
   values(id,b::text,brand,product,'Única','piece',true,'{}',cost,host);
  else
   select pv.* into v from public.pos_product_variants pv join public.pos_products p on p.id=pv.product_id and p.brand_slug=pv.brand_slug
   where pv.id=id and pv.brand_slug=brand and p.product_type='prepared' and p.inventory_mode='recipe' for update of pv,p;
   if not found then raise exception 'POS_FOOD_FORBIDDEN'; end if;
   product:=v.product_id;
   update public.pos_products set name=btrim(payload->>'name'),description=payload->>'description',tax_rate=coalesce((payload->>'tax_rate')::numeric,0),active=coalesce((payload->>'active')::boolean,true) where pos_products.id=product;
   update public.pos_product_variants set price=cost where pos_product_variants.id=id;
  end if;
 elsif action='recipe_publish' then
  id:=(payload->>'id')::uuid;
  select pv.* into v from public.pos_product_variants pv join public.pos_products p on p.id=pv.product_id and p.brand_slug=pv.brand_slug
  where pv.id=id and pv.brand_slug=brand and p.active and pv.active and p.sellable and p.product_type in ('physical','prepared') and p.inventory_mode in ('none','direct','recipe') for update of pv,p;
  if not found then raise exception 'POS_FOOD_RECIPE_INVALID'; end if;
  if exists(select 1 from public.pos_product_variants where product_id=v.product_id and unit_code<>'piece') then raise exception 'POS_FOOD_RECIPE_UNIT'; end if;
  select inventory_mode into mode from public.pos_products where pos_products.id=v.product_id;
  if mode<>'recipe' then
   if exists(select 1 from public.pos_inventory inv join public.pos_product_variants pv on pv.id=inv.variant_id where pv.product_id=v.product_id and (inv.quantity<>0 or inv.reserved_quantity<>0))
   or exists(select 1 from public.pos_food_items i join public.pos_food_checks c on c.id=i.check_id where i.product_id=v.product_id and i.voided_at is null and c.status<>'CLOSED') then raise exception 'POS_FOOD_RECIPE_MODE_CONFLICT'; end if;
   update public.pos_products set product_type='prepared',inventory_mode='recipe',track_inventory=false,purchasable=false where pos_products.id=v.product_id;
  end if;
  if jsonb_typeof(payload->'components') is distinct from 'array' or jsonb_array_length(payload->'components') not between 1 and 100 then raise exception 'POS_FOOD_RECIPE_INVALID'; end if;
  select coalesce(max(version),0)+1 into version_number from public.pos_food_recipe_versions where variant_id=id;
  insert into public.pos_food_recipe_versions(brand_slug,variant_id,version,created_by) values(brand,id,version_number,actor.id) returning pos_food_recipe_versions.id into revision;
  for row in select value from jsonb_array_elements(payload->'components') loop
   src:=public.pos_food_ingredient_v1(brand,(row->>'ingredient_variant_id')::uuid);
   qty:=public.pos_food_convert_quantity_v1((row->>'quantity')::numeric,row->>'unit_code',src.unit_code);
   insert into public.pos_food_recipe_components(recipe_version_id,brand_slug,ingredient_variant_id,input_quantity,input_unit_code,base_quantity,base_unit_code)
   values(revision,brand,src.id,(row->>'quantity')::numeric,row->>'unit_code',qty,src.unit_code);
  end loop;
  update public.pos_food_recipe_versions set published_at=clock_timestamp() where pos_food_recipe_versions.id=revision;
  result:=jsonb_build_object('id',id,'recipe_version_id',revision,'version',version_number);
 elsif action='effect_save' then
  product:=(payload->>'product_id')::uuid; option_id:=(payload->>'option_id')::uuid; effect:=payload->>'effect';
  if effect is null or effect not in ('NONE','ADD','REMOVE','REPLACE') then raise exception 'POS_FOOD_INVALID'; end if;
  if not exists(select 1 from public.pos_products where pos_products.id=product and brand_slug=brand and inventory_mode='recipe')
  or not exists(select 1 from public.pos_food_modifier_options o join public.pos_food_product_modifier_groups a on a.group_id=o.group_id and a.brand_slug=o.brand_slug where o.id=option_id and o.brand_slug=brand and a.product_id=product) then raise exception 'POS_FOOD_FORBIDDEN'; end if;
  delete from public.pos_food_modifier_recipe_effects where product_id=product and pos_food_modifier_recipe_effects.option_id=option_id and brand_slug=brand;
  if effect<>'NONE' then
   if effect not in ('ADD','REMOVE','REPLACE') or effect is null then raise exception 'POS_FOOD_INVALID'; end if;
   source_id:=null; target_id:=null; qty:=null; unit:=null;
   if effect in ('REMOVE','REPLACE') then
    source_id:=(payload->>'source_variant_id')::uuid; v:=public.pos_food_ingredient_v1(brand,source_id); src:=v;
    if not exists(select 1 from public.pos_food_recipe_components rc join public.pos_food_recipe_versions r on r.id=rc.recipe_version_id join public.pos_product_variants pv on pv.id=r.variant_id
    where pv.product_id=product and r.brand_slug=brand and rc.ingredient_variant_id=source_id and r.published_at is not null and r.version=(select max(version) from public.pos_food_recipe_versions where variant_id=r.variant_id and published_at is not null)) then raise exception 'POS_FOOD_RECIPE_EFFECT_CONFLICT'; end if;
   end if;
   if effect in ('ADD','REPLACE') then
    target_id:=(payload->>'ingredient_variant_id')::uuid; src:=public.pos_food_ingredient_v1(brand,target_id);
    if effect='REPLACE' and (select unit_type from public.pos_units where code=v.unit_code)<>(select unit_type from public.pos_units where code=src.unit_code) then raise exception 'POS_FOOD_RECIPE_UNIT'; end if;
    qty:=public.pos_food_convert_quantity_v1((payload->>'quantity')::numeric,payload->>'unit_code',src.unit_code); unit:=src.unit_code;
   elsif nullif(payload->>'quantity','') is not null then
    qty:=public.pos_food_convert_quantity_v1((payload->>'quantity')::numeric,payload->>'unit_code',src.unit_code); unit:=src.unit_code;
   end if;
   insert into public.pos_food_modifier_recipe_effects(brand_slug,product_id,option_id,effect,source_variant_id,ingredient_variant_id,input_quantity,input_unit_code,base_quantity,base_unit_code)
   values(brand,product,option_id,effect,source_id,target_id,nullif(payload->>'quantity','')::numeric,payload->>'unit_code',qty,unit);
  end if;
  id:=option_id;
 else raise exception 'POS_FOOD_INVALID'; end if;
 result:=coalesce(result,jsonb_build_object('id',id));
 insert into public.pos_staff_audit_events(id,brand_id,brand_slug,location_id,actor_staff_id,host_user_id,action,entity_type,entity_id,metadata)
 values(command_key,b::text,brand,location,actor.id,host,'FOOD_RECIPES_CONFIG','food_recipes',id,jsonb_build_object('command_action',action,'payload',payload,'result',result));
 return result;
exception when check_violation or not_null_violation or unique_violation or invalid_text_representation or numeric_value_out_of_range then raise exception 'POS_FOOD_INVALID';
end $$;

create function public.pos_food_recipes_catalog_v1(brand text, host uuid, session uuid, location uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare actor public.pos_staff%rowtype;
begin
 actor:=public.pos_food_actor_v1(brand,host,session);
 if actor.role<>'ADMIN' or (actor.location_id is not null and actor.location_id<>location)
 or not exists(select 1 from public.pos_locations where id=location and brand_slug=brand and active) then raise exception 'POS_FOOD_FORBIDDEN'; end if;
 return jsonb_build_object('ingredients',coalesce((select jsonb_agg(jsonb_build_object(
  'id',v.id,'product_id',p.id,'name',p.name,'unit_code',v.unit_code,'unit_cost',v.cost,'active',p.active and v.active,
  'category',coalesce(s.category,'food'),'waste_percent',coalesce(s.waste_percent,0),'supplier_name',s.supplier_name,
  'stock',coalesce(inv.quantity,0),'reserved_stock',coalesce(inv.reserved_quantity,0),'minimum_stock',coalesce(inv.minimum_quantity,0),
  'usable_estimated_stock',coalesce(inv.quantity,0)*(1-coalesce(s.waste_percent,0)/100),
  'presentations',coalesce((select jsonb_agg(to_jsonb(pp) order by pp.created_at,pp.id) from public.pos_variant_purchase_presentations pp where pp.variant_id=v.id and pp.brand_slug=brand),'[]')) order by p.name,v.id)
 from public.pos_product_variants v join public.pos_products p on p.id=v.product_id and p.brand_slug=v.brand_slug
 left join public.pos_food_ingredient_settings s on s.ingredient_variant_id=v.id and s.brand_slug=v.brand_slug
 left join public.pos_inventory inv on inv.variant_id=v.id and inv.brand_slug=v.brand_slug and inv.location_id=location
 where v.brand_slug=brand and p.product_type='ingredient'),'[]'),
 'products',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'product_id',p.id,'name',p.name,'variant_name',v.name,'price',v.price,'description',p.description,'tax_rate',p.tax_rate,'active',p.active and v.active,'inventory_mode',p.inventory_mode,
 'recipe_components',coalesce((select jsonb_agg(to_jsonb(rc) order by rc.ingredient_variant_id) from public.pos_food_recipe_components rc where rc.recipe_version_id=(select id from public.pos_food_recipe_versions where variant_id=v.id and published_at is not null order by version desc limit 1)),'[]'),
 'recipe',case when p.inventory_mode='recipe' and p.active and v.active and exists(select 1 from public.pos_food_recipe_versions r where r.variant_id=v.id and r.published_at is not null)
 and not exists(select 1 from public.pos_food_recipe_components rc join public.pos_food_recipe_versions r on r.id=rc.recipe_version_id join public.pos_product_variants iv on iv.id=rc.ingredient_variant_id join public.pos_products ip on ip.id=iv.product_id
 where r.id=(select id from public.pos_food_recipe_versions where variant_id=v.id and published_at is not null order by version desc limit 1) and (not iv.active or not ip.active))
 then public.pos_food_recipe_metrics_v1(brand,location,v.id) else null end) order by p.name,v.id)
 from public.pos_product_variants v join public.pos_products p on p.id=v.product_id and p.brand_slug=v.brand_slug where v.brand_slug=brand and p.sellable and p.product_type in ('physical','prepared')),'[]'),
 'effects',coalesce((select jsonb_agg(to_jsonb(e)) from public.pos_food_modifier_recipe_effects e where brand_slug=brand),'[]'),
 'units',coalesce((select jsonb_agg(to_jsonb(u) order by sort_order) from public.pos_units u where code in ('mg','g','kg','ml','l','piece') and active),'[]'),
 'movements',coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at desc) from (select im.* from public.pos_inventory_movements im join public.pos_food_ingredient_settings s on s.ingredient_variant_id=im.variant_id and s.brand_slug=im.brand_slug where im.brand_slug=brand and im.location_id=location order by im.created_at desc limit 100) m),'[]'));
end $$;

-- Protect the meaning of stock and snapshots from edits through generic catalog APIs.
create function public.pos_food_inventory_domain_guard_v1() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_table_name='pos_products' then
  if tg_op='UPDATE' and old.product_type in ('ingredient','prepared') and (new.product_type<>old.product_type or new.inventory_mode<>old.inventory_mode or new.default_unit_code<>old.default_unit_code) then raise exception 'POS_FOOD_RECIPE_MODE_CONFLICT'; end if;
  if new.product_type='ingredient' and (new.inventory_mode<>'direct' or not new.track_inventory or new.sellable or not new.purchasable) then raise exception 'POS_FOOD_RECIPE_INVALID'; end if;
  if new.product_type='prepared' and (new.inventory_mode<>'recipe' or new.track_inventory or new.purchasable or new.default_unit_code<>'piece') then raise exception 'POS_FOOD_RECIPE_INVALID'; end if;
  if tg_op='UPDATE' and new.product_type='prepared' then
   if exists(select 1 from public.pos_product_variants where product_id=new.id and unit_code<>'piece') then raise exception 'POS_FOOD_RECIPE_UNIT'; end if;
   if old.inventory_mode<>'recipe' and (exists(select 1 from public.pos_inventory inv join public.pos_product_variants v on v.id=inv.variant_id where v.product_id=new.id and (inv.quantity<>0 or inv.reserved_quantity<>0))
    or exists(select 1 from public.pos_food_items i join public.pos_food_checks c on c.id=i.check_id where i.product_id=new.id and i.voided_at is null and c.status<>'CLOSED')) then raise exception 'POS_FOOD_RECIPE_MODE_CONFLICT'; end if;
  end if;
 else
  if tg_op='UPDATE' and new.unit_code<>old.unit_code and exists(select 1 from public.pos_products where id=old.product_id and product_type in ('ingredient','prepared')) then raise exception 'POS_FOOD_RECIPE_UNIT'; end if;
  if exists(select 1 from public.pos_products where id=new.product_id and brand_slug=new.brand_slug and
   ((product_type='ingredient' and default_unit_code<>new.unit_code) or (product_type='prepared' and new.unit_code<>'piece'))) then raise exception 'POS_FOOD_RECIPE_UNIT'; end if;
 end if;
 return new;
end $$;
create trigger pos_food_inventory_product_guard before insert or update on public.pos_products for each row execute function public.pos_food_inventory_domain_guard_v1();
create trigger pos_food_inventory_variant_guard before insert or update on public.pos_product_variants for each row execute function public.pos_food_inventory_domain_guard_v1();

-- Exact, guarded Food extensions. An unfamiliar installed body aborts atomically.
create function pg_temp.food_recipe_patch(source text,anchor text,replacement text,expected integer default 1) returns text language plpgsql as $$
begin
 source:=replace(source,E'\r\n',E'\n');
 if (length(source)-length(replace(source,anchor,'')))/length(anchor)<>expected then raise exception 'FOOD_RECIPES_ANCHOR_MISMATCH: %',anchor; end if;
 return replace(source,anchor,replacement);
end $$;
do $patch$
declare definition text;
begin
 select pg_get_functiondef('public.pos_complete_inventory_receipt_v1(text,text,uuid,text,text,text,jsonb,uuid)'::regprocedure) into definition;
 definition:=pg_temp.food_recipe_patch(definition,'    begin
      v_input_quantity :=',
 '    if v_product.product_type=''ingredient'' then
      perform public.pos_food_receipt_quantity_guard_v1(p_brand_slug,v_variant.id,v_presentation_id,v_quantity_mode,v_input_unit_code,v_base_unit_code,v_conversion_factor,
        (v_item_json->>''input_quantity'')::numeric,coalesce(nullif(v_item_json->>''total_cost'','''')::numeric,0));
    end if;
    begin
      v_input_quantity :=');
 execute definition;
 select pg_get_functiondef('public.pos_adjust_inventory(text,uuid,uuid,numeric,text,text,uuid,boolean)'::regprocedure) into definition;
 definition:=pg_temp.food_recipe_patch(definition,'  v_before := v_inventory.quantity;',
 '  if exists(select 1 from public.pos_products where id=v_variant.product_id and brand_slug=p_brand_slug and product_type=''ingredient'') then
    perform public.pos_food_exact_quantity_v1(abs(p_quantity));
    if v_variant.unit_code=''piece'' and p_quantity<>trunc(p_quantity) then raise exception ''POS_FOOD_RECIPE_PRECISION''; end if;
  end if;
  v_before := v_inventory.quantity;');
 execute definition;
 select pg_get_functiondef('public.pos_food_command_legacy_v1(text,uuid,uuid,text,jsonb,uuid)'::regprocedure) into definition;
 definition:=pg_temp.food_recipe_patch(definition,'p.inventory_mode in (''direct'',''none'')','p.inventory_mode in (''direct'',''none'',''recipe'')');
 definition:=pg_temp.food_recipe_patch(definition,'    select coalesce(max(sequence),0)+1 into v_sequence',
 '    perform public.pos_food_snapshot_recipe_round_v1(p_brand_slug,v_check.id);
    select coalesce(max(sequence),0)+1 into v_sequence');
 execute definition;
 select pg_get_functiondef('public.pos_food_snapshot_legacy_v1(text,uuid,uuid,uuid)'::regprocedure) into definition;
 definition:=pg_temp.food_recipe_patch(definition,'p.inventory_mode in (''direct'',''none'')','p.inventory_mode in (''direct'',''none'',''recipe'')');
 definition:=pg_temp.food_recipe_patch(definition,'case when p.track_inventory then greatest(coalesce(inv.quantity-inv.reserved_quantity,0),0) else null end available',
 'case when p.inventory_mode=''recipe'' then public.pos_food_recipe_availability_v1(p_brand_slug,v_location.id,v.id) when p.track_inventory then greatest(coalesce(inv.quantity-inv.reserved_quantity,0),0) else null end available');
 execute definition;
 select pg_get_functiondef('public.pos_food_checkout_context_v1(text,uuid,uuid,uuid,uuid,uuid,jsonb)'::regprocedure) into definition;
 definition:=pg_temp.food_recipe_patch(definition,'jsonb_build_object(''unit_price'',price,''proof'',proof)',
 'jsonb_build_object(''unit_price'',price,''proof'',proof)||public.pos_food_recipe_checkout_line_v1(p_brand_slug,i.id,i.variant_id)');
 execute definition;
 select pg_get_functiondef('public.pos_complete_sale_v4(text,uuid,uuid,uuid,uuid,jsonb,jsonb,text,uuid,uuid,uuid,uuid)'::regprocedure) into definition;
 definition:=pg_temp.food_recipe_patch(definition,'''food_proof'',v_food_context->(item.value->>''food_item_id'')->>''proof'')',
 '''food_proof'',v_food_context->(item.value->>''food_item_id'')->>''proof'') || CASE WHEN v_food_context->(item.value->>''food_item_id'') ? ''recipe_proof'' THEN jsonb_build_object(''recipe_proof'',v_food_context->(item.value->>''food_item_id'')->>''recipe_proof'') ELSE ''{}''::jsonb END');
 definition:=pg_temp.food_recipe_patch(definition,'  INTO v_sale;

  IF v_reward_source IS NOT NULL THEN',
 '  INTO v_sale;

  IF v_food_context IS NOT NULL THEN
    PERFORM public.pos_food_consume_sale_recipes_v1(p_brand_slug,p_location_id,p_idempotency_key,v_sale.id);
  END IF;
  IF v_reward_source IS NOT NULL THEN');
 -- Both shared item passes retain Retail behavior. Recipe overrides come exclusively from validated Food context.
 definition:=pg_temp.food_recipe_patch(definition,'product.track_inventory,','product.track_inventory, product.inventory_mode,',2);
 definition:=pg_temp.food_recipe_patch(definition,'v_variant.price:=(v_food_context->(v_item->>''food_item_id'')->>''unit_price'')::numeric;',
 'v_variant.price:=(v_food_context->(v_item->>''food_item_id'')->>''unit_price'')::numeric;
    IF coalesce((v_food_context->(v_item->>''food_item_id'')->>''recipe_mode'')::boolean,false) THEN
      v_variant.track_inventory:=false;
      v_variant.cost:=(v_food_context->(v_item->>''food_item_id'')->>''unit_cost'')::numeric;
    END IF;',2);
 -- Recipe products cannot enter through the generic sale endpoint, which has no SEND provenance.
 definition:=pg_temp.food_recipe_patch(definition,'    v_line_subtotal :=',
 '    IF v_food_context IS NULL AND v_variant.inventory_mode=''recipe'' THEN RAISE EXCEPTION ''POS_FOOD_CHECKOUT_INVALID''; END IF;
    v_line_subtotal :=',2);
 execute definition;
end $patch$;

do $$ declare name text; signature regprocedure; begin
 foreach name in array array['pos_food_ingredient_settings','pos_food_recipe_versions','pos_food_recipe_components','pos_food_modifier_recipe_effects','pos_food_item_recipe_snapshots','pos_food_sale_consumptions'] loop
  execute format('alter table public.%I enable row level security',name);
  execute format('revoke all on public.%I from public,anon,authenticated',name);
  execute format('grant all on public.%I to service_role',name);
 end loop;
 for signature in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (
 'pos_food_exact_quantity_v1','pos_food_purchase_cost_v1','pos_food_convert_quantity_v1','pos_food_ingredient_v1','pos_food_receipt_quantity_guard_v1','pos_food_presentation_guard_v1','pos_food_recipe_immutable_v1','pos_food_effective_recipe_v1','pos_food_recipe_metrics_v1',
 'pos_food_snapshot_recipe_round_v1','pos_food_recipe_availability_v1','pos_food_item_inventory_mode_v1','pos_food_recipe_checkout_line_v1','pos_food_consume_sale_recipes_v1','pos_food_recipes_admin_v1','pos_food_recipes_catalog_v1','pos_food_inventory_domain_guard_v1') loop
 execute format('revoke all on function %s from public,anon,authenticated',signature);
 end loop;
end $$;
grant execute on function public.pos_food_recipes_admin_v1(text,uuid,uuid,uuid,text,jsonb),public.pos_food_recipes_catalog_v1(text,uuid,uuid,uuid) to service_role;
commit;
