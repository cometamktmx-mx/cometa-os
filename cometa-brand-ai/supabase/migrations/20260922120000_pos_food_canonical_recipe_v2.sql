-- LOCAL certification first. No existing rows are removed or rewritten.
-- Rollback: stop new Food sends/configuration, retain snapshots and send ledger,
-- restore the previous function bodies ONLY after settling/reconciling V2 tickets.
-- Never remove the ledger or restore checkout consumption while V2 tickets remain.
begin;

alter table public.pos_food_modifier_recipe_effects
 add column quantity_mode text not null default 'fixed' check(quantity_mode in ('fixed','source')),
 add column effect_order integer not null default 0 check(effect_order between 0 and 99);
alter table public.pos_food_modifier_recipe_effects drop constraint pos_food_modifier_recipe_effects_product_id_option_id_key;
alter table public.pos_food_modifier_recipe_effects add constraint pos_food_effect_option_order_key unique(product_id,option_id,effect_order);
-- Preserve all legacy fixed effects; source mode is explicit, REPLACE-only.
do $$ declare constraint_name text; begin
 select conname into strict constraint_name from pg_constraint
 where conrelid='public.pos_food_modifier_recipe_effects'::regclass and contype='c'
 and pg_get_constraintdef(oid) like '%source_variant_id <> ingredient_variant_id%';
 execute format('alter table public.pos_food_modifier_recipe_effects drop constraint %I',constraint_name);
end $$;
alter table public.pos_food_modifier_recipe_effects add constraint pos_food_effect_shape_v2 check (
 (quantity_mode='fixed' and ((effect='ADD' and source_variant_id is null and ingredient_variant_id is not null and base_quantity is not null)
 or (effect='REMOVE' and source_variant_id is not null and ingredient_variant_id is null)
 or (effect='REPLACE' and source_variant_id is not null and ingredient_variant_id is not null and source_variant_id<>ingredient_variant_id and base_quantity is not null)))
 or (quantity_mode='source' and effect='REPLACE' and source_variant_id is not null and ingredient_variant_id is not null
 and source_variant_id<>ingredient_variant_id and base_quantity is null and input_quantity is null and input_unit_code is null and base_unit_code is null)
);

alter table public.pos_food_item_recipe_snapshots add column effective_recipe jsonb null;

create table public.pos_food_send_consumptions (
 food_item_id uuid not null, brand_slug text not null, location_id uuid not null, ingredient_variant_id uuid not null,
 base_quantity numeric(14,3) not null check(base_quantity>0), base_unit_code text not null references public.pos_units(code),
 unit_cost numeric(18,6) not null check(unit_cost>=0), total_cost numeric(24,6) not null check(total_cost>=0),
 movement_id uuid not null, created_at timestamptz not null default now(),
 primary key(food_item_id,ingredient_variant_id),
 foreign key(food_item_id,brand_slug) references public.pos_food_item_recipe_snapshots(food_item_id,brand_slug),
 foreign key(movement_id,brand_slug,location_id,ingredient_variant_id) references public.pos_inventory_movements(id,brand_slug,location_id,variant_id),
 foreign key(ingredient_variant_id,brand_slug) references public.pos_product_variants(id,brand_slug),
 foreign key(location_id,brand_slug) references public.pos_locations(id,brand_slug)
);
alter table public.pos_food_send_consumptions enable row level security;
revoke all on public.pos_food_send_consumptions from public,anon,authenticated;
grant all on public.pos_food_send_consumptions to service_role;
create trigger pos_food_send_consumptions_immutable before update or delete on public.pos_food_send_consumptions
 for each row execute function public.pos_food_recipe_immutable_v1();

create or replace function public.pos_food_effective_recipe_v1(brand text, variant uuid, modifiers jsonb default '[]') returns jsonb
language plpgsql security definer set search_path=public as $$
declare recipe public.pos_food_recipe_versions%rowtype; product uuid; component record; effect_row record;
 quantities jsonb:='{}'; additions jsonb:='{}'; original jsonb; touched uuid[]:='{}'; effects jsonb:='[]'; result jsonb:='[]';
 q numeric; added numeric; v public.pos_product_variants%rowtype; src public.pos_product_variants%rowtype; total numeric:=0; ids jsonb;
begin
 select pv.product_id into product from public.pos_product_variants pv join public.pos_products p on p.id=pv.product_id and p.brand_slug=pv.brand_slug
 where pv.id=variant and pv.brand_slug=brand and pv.active and p.active and p.product_type='prepared' and p.inventory_mode='recipe' and p.sellable for share of pv,p;
 if not found then raise exception 'POS_FOOD_RECIPE_INVALID'; end if;
 if modifiers is null or jsonb_typeof(modifiers)<>'array' then raise exception 'POS_FOOD_MODIFIERS_INVALID'; end if;
 select coalesce(jsonb_agg(value->'option_id'),'[]') into ids from jsonb_array_elements(modifiers);
 -- Base availability intentionally accepts [] even when commercial groups are required.
 -- Both preview and SEND validate the complete selection before calling this resolver.
 if jsonb_array_length(modifiers)>0 then perform public.pos_food_resolve_modifiers_v1(brand,product,ids); end if;
 select * into recipe from public.pos_food_recipe_versions where variant_id=variant and brand_slug=brand and published_at is not null order by version desc limit 1;
 if not found then raise exception 'POS_FOOD_RECIPE_REQUIRED'; end if;
 for component in select * from public.pos_food_recipe_components where recipe_version_id=recipe.id order by ingredient_variant_id loop
  v:=public.pos_food_ingredient_v1(brand,component.ingredient_variant_id);
  if v.unit_code<>component.base_unit_code then raise exception 'POS_FOOD_RECIPE_UNIT'; end if;
  quantities:=quantities||jsonb_build_object(v.id::text,component.base_quantity);
 end loop;
 original:=quantities;
 -- Source operations refer to the original selected variant. A source may be touched once.
 -- ADD is accumulated separately, so input order cannot erase an extra shot or double it.
 for effect_row in select e.* from public.pos_food_modifier_recipe_effects e
 join public.pos_food_modifier_options o on o.id=e.option_id and o.brand_slug=e.brand_slug
 join public.pos_food_product_modifier_groups a on a.product_id=e.product_id and a.group_id=o.group_id and a.brand_slug=e.brand_slug
 where e.brand_slug=brand and e.product_id=product and e.option_id in (select (value->>'option_id')::uuid from jsonb_array_elements(modifiers))
 order by case when e.effect='ADD' then 1 else 0 end,e.option_id,e.effect_order,e.id for share of e,a loop
  added:=effect_row.base_quantity;
  if effect_row.effect<>'ADD' then
   if not (original ? effect_row.source_variant_id::text) or effect_row.source_variant_id=any(touched) then raise exception 'POS_FOOD_RECIPE_EFFECT_CONFLICT'; end if;
   touched:=array_append(touched,effect_row.source_variant_id);
   q:=(original->>effect_row.source_variant_id::text)::numeric;
   if effect_row.quantity_mode='source' then
    src:=public.pos_food_ingredient_v1(brand,effect_row.source_variant_id);
    v:=public.pos_food_ingredient_v1(brand,effect_row.ingredient_variant_id);
    added:=public.pos_food_convert_quantity_v1(q,src.unit_code,v.unit_code);
   end if;
   if effect_row.effect='REMOVE' and effect_row.base_quantity is not null then
    if effect_row.base_quantity>q then raise exception 'POS_FOOD_RECIPE_EFFECT_CONFLICT'; end if;
    q:=q-effect_row.base_quantity;
   else q:=0; end if;
   quantities:=quantities||jsonb_build_object(effect_row.source_variant_id::text,q);
  end if;
  if effect_row.effect in ('ADD','REPLACE') then
   v:=public.pos_food_ingredient_v1(brand,effect_row.ingredient_variant_id);
   if effect_row.quantity_mode='fixed' and v.unit_code<>effect_row.base_unit_code then raise exception 'POS_FOOD_RECIPE_UNIT'; end if;
   additions:=additions||jsonb_build_object(v.id::text,coalesce((additions->>v.id::text)::numeric,0)+added);
  end if;
  effects:=effects||jsonb_build_array(to_jsonb(effect_row)||jsonb_build_object('resolved_base_quantity',added));
 end loop;
 for component in select key,value from jsonb_each_text(additions) order by key loop
  quantities:=quantities||jsonb_build_object(component.key,coalesce((quantities->>component.key)::numeric,0)+component.value::numeric);
 end loop;
 for component in select key,value from jsonb_each_text(quantities) order by key loop
  q:=public.pos_food_exact_quantity_v1(component.value::numeric);
  if q>0 then
   v:=public.pos_food_ingredient_v1(brand,component.key::uuid); total:=total+q*v.cost;
   result:=result||jsonb_build_array(jsonb_build_object('ingredient_variant_id',v.id,'name',(select name from public.pos_products where id=v.product_id),
    'base_quantity',q,'base_unit_code',v.unit_code,'unit_cost',v.cost,'subtotal',q*v.cost));
  end if;
 end loop;
 return jsonb_build_object('variant_id',variant,'recipe_version_id',recipe.id,'version',recipe.version,'base_components',original,
 'modifiers',modifiers,'components',result,'effects',effects,'unit_cost',round(total,6));
end $$;

-- Freeze once; consume only these components, never resolve again at checkout.
create or replace function public.pos_food_snapshot_recipe_round_v1(brand text, account uuid) returns void
language plpgsql security definer set search_path=public as $$
declare i public.pos_food_items%rowtype; c public.pos_food_checks%rowtype; r jsonb; proof text;
begin
 select * into c from public.pos_food_checks where id=account and brand_slug=brand for update;
 if not found or c.status<>'OPEN' then raise exception 'POS_FOOD_CONFLICT'; end if;
 for i in select * from public.pos_food_items where check_id=account and brand_slug=brand and ticket_id is null and voided_at is null and inventory_mode='recipe' order by id for update loop
  perform public.pos_food_resolve_modifiers_v1(brand,i.product_id,coalesce((select jsonb_agg(value->'option_id') from jsonb_array_elements(i.configuration->'modifiers')),'[]'::jsonb));
  r:=public.pos_food_effective_recipe_v1(brand,i.variant_id,i.configuration->'modifiers');
  r:=r||jsonb_build_object('unit_price',i.unit_price,'tax_rate',i.tax_rate,'line_total',i.line_total,'quantity',i.quantity);
  proof:=encode(sha256(convert_to(jsonb_build_object('item',i.id,'quantity',i.quantity,'check',account,'location',c.location_id,'recipe',r)::text,'UTF8')),'hex');
  insert into public.pos_food_item_recipe_snapshots(food_item_id,brand_slug,check_id,location_id,recipe_version_id,components,effects,unit_cost,proof,effective_recipe)
  values(i.id,brand,account,c.location_id,(r->>'recipe_version_id')::uuid,r->'components',r->'effects',(r->>'unit_cost')::numeric,proof,r);
 end loop;
end $$;

create function public.pos_food_consume_sent_recipes_v2(brand text, account uuid, ticket uuid, host uuid) returns void
language plpgsql security definer set search_path=public as $$
declare c public.pos_food_checks%rowtype; inv public.pos_inventory%rowtype; demand record; line record; movement uuid;
begin
 select * into c from public.pos_food_checks where id=account and brand_slug=brand for update;
 if not found or not exists(select 1 from public.pos_food_tickets where id=ticket and check_id=account and brand_slug=brand) then raise exception 'POS_FOOD_FORBIDDEN'; end if;
 -- Same ordering as checkout. Account lock + command key + immutable ledger ensure retries cannot consume twice.
 for demand in select (x->>'ingredient_variant_id')::uuid variant_id,sum((x->>'base_quantity')::numeric*i.quantity) quantity
 from public.pos_food_item_recipe_snapshots s join public.pos_food_items i on i.id=s.food_item_id
 cross join lateral jsonb_array_elements(s.components) x
 where s.brand_slug=brand and s.check_id=account and i.ticket_id=ticket and i.voided_at is null and i.inventory_committed_at is null
 group by x->>'ingredient_variant_id' order by x->>'ingredient_variant_id' loop
  select * into inv from public.pos_inventory where brand_slug=brand and location_id=c.location_id and variant_id=demand.variant_id for update;
  if not found or inv.quantity-inv.reserved_quantity<demand.quantity then raise exception 'POS_FOOD_STOCK_UNAVAILABLE'; end if;
  update public.pos_inventory set quantity=pos_inventory.quantity-demand.quantity where id=inv.id;
  insert into public.pos_inventory_movements(brand_id,brand_slug,location_id,variant_id,movement_type,quantity_delta,quantity_before,quantity_after,reference_type,reference_id,notes,created_by)
  values(inv.brand_id,brand,c.location_id,demand.variant_id,'sale',-demand.quantity,inv.quantity,inv.quantity-demand.quantity,'food_send',ticket,'Food preparation consumption',host) returning id into movement;
  for line in select i.id item_id,i.quantity,x from public.pos_food_item_recipe_snapshots s join public.pos_food_items i on i.id=s.food_item_id
   cross join lateral jsonb_array_elements(s.components) x
   where s.brand_slug=brand and s.check_id=account and i.ticket_id=ticket and i.voided_at is null and i.inventory_committed_at is null and (x->>'ingredient_variant_id')::uuid=demand.variant_id loop
   insert into public.pos_food_send_consumptions(food_item_id,brand_slug,location_id,ingredient_variant_id,base_quantity,base_unit_code,unit_cost,total_cost,movement_id)
   values(line.item_id,brand,c.location_id,demand.variant_id,(line.x->>'base_quantity')::numeric*line.quantity,line.x->>'base_unit_code',
    (line.x->>'unit_cost')::numeric,(line.x->>'base_quantity')::numeric*line.quantity*(line.x->>'unit_cost')::numeric,movement);
  end loop;
 end loop;
 update public.pos_food_items set inventory_committed_at=clock_timestamp()
 where brand_slug=brand and check_id=account and ticket_id=ticket and inventory_mode='recipe' and voided_at is null and inventory_committed_at is null;
end $$;

-- Patch only the guarded Food SEND branch. The Retail sale body is unchanged.
do $$ declare source text; anchor text; begin
 source:=pg_get_functiondef('public.pos_food_command_legacy_v1(text,uuid,uuid,text,jsonb,uuid)'::regprocedure);
 anchor:='    v_result:=jsonb_build_object(''checkId'',v_check.id,''ticketId'',v_id);';
 if (length(source)-length(replace(source,anchor,'')))/length(anchor)<>1 then raise exception 'FOOD_SEND_PATCH_ANCHOR'; end if;
 execute replace(source,anchor,'    perform public.pos_food_consume_sent_recipes_v2(p_brand_slug,v_check.id,v_id,p_host_user_id);'||chr(10)||anchor);
 -- Legacy tickets without SEND ledger still consume at checkout.
 source:=pg_get_functiondef('public.pos_food_consume_sale_recipes_v1(text,uuid,uuid,uuid)'::regprocedure);
 anchor:='and i.voided_at is null';
 if (length(source)-length(replace(source,anchor,'')))/length(anchor)<>3 then raise exception 'FOOD_CHECKOUT_PATCH_ANCHOR'; end if;
 source:=replace(source,anchor,anchor||' and not exists(select 1 from public.pos_food_send_consumptions sent where sent.food_item_id=i.id)');
 anchor:=' update public.pos_food_items set inventory_committed_at=clock_timestamp()';
 if position(anchor in source)=0 then raise exception 'FOOD_CHECKOUT_LEDGER_ANCHOR'; end if;
 source:=replace(source,anchor,' insert into public.pos_food_sale_consumptions(brand_slug,location_id,sale_id,food_item_id,ingredient_variant_id,base_quantity,base_unit_code,unit_cost,total_cost,movement_id)
 select sent.brand_slug,sent.location_id,sale,sent.food_item_id,sent.ingredient_variant_id,sent.base_quantity,sent.base_unit_code,sent.unit_cost,sent.total_cost,sent.movement_id
 from public.pos_food_send_consumptions sent join public.pos_food_items i on i.id=sent.food_item_id
 where sent.brand_slug=brand and sent.location_id=location and i.check_id=account and i.voided_at is null;
'||anchor);
 source:=replace(source,'and inventory_mode=''recipe'' and voided_at is null;', 'and inventory_mode=''recipe'' and voided_at is null and inventory_committed_at is null;');
 execute source;
end $$;

revoke all on function public.pos_food_consume_sent_recipes_v2(text,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.pos_food_consume_sent_recipes_v2(text,uuid,uuid,uuid) to service_role;

-- Atomic replacement of an option's complete effect list. Old effect_save remains supported.
create function public.pos_food_effects_save_v2(brand text, host uuid, session uuid, location uuid, product uuid, option_id uuid, effects jsonb, command_key uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
#variable_conflict use_variable
declare actor public.pos_staff%rowtype; row jsonb; n integer:=0; src public.pos_product_variants%rowtype; target public.pos_product_variants%rowtype;
 source_id uuid; target_id uuid; qty numeric; unit text; mode text; kind text; result jsonb; previous public.pos_staff_audit_events%rowtype; payload jsonb;
begin
 actor:=public.pos_food_actor_v1(brand,host,session);
 if actor.role<>'ADMIN' or (actor.location_id is not null and actor.location_id<>location)
 or not exists(select 1 from public.pos_locations where brand_slug=brand and id=location and active) then raise exception 'POS_FOOD_FORBIDDEN'; end if;
 payload:=jsonb_build_object('product',product,'option',option_id,'effects',effects);
 if command_key is null or effects is null or jsonb_typeof(effects)<>'array' or jsonb_array_length(effects)>20 then raise exception 'POS_FOOD_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended(command_key::text,0));
 select * into previous from public.pos_staff_audit_events where id=command_key;
 if found then
  if previous.brand_slug<>brand or previous.actor_staff_id<>actor.id or previous.host_user_id<>host or previous.location_id<>location or previous.metadata->>'command_action' is distinct from 'effects_save' or previous.metadata->'payload' is distinct from payload then raise exception 'POS_FOOD_CONFLICT'; end if;
  return previous.metadata->'result';
 end if;
 perform 1 from public.pos_products where id=product and brand_slug=brand and inventory_mode='recipe' for update;
 if not found or not exists(select 1 from public.pos_food_modifier_options o join public.pos_food_product_modifier_groups a on a.group_id=o.group_id and a.brand_slug=o.brand_slug where o.id=option_id and o.brand_slug=brand and a.product_id=product) then raise exception 'POS_FOOD_FORBIDDEN'; end if;
 delete from public.pos_food_modifier_recipe_effects where product_id=product and pos_food_modifier_recipe_effects.option_id=option_id and brand_slug=brand;
 for row in select value from jsonb_array_elements(effects) loop
  kind:=row->>'effect'; mode:=coalesce(row->>'quantity_mode','fixed'); source_id:=(row->>'source_variant_id')::uuid; target_id:=(row->>'ingredient_variant_id')::uuid; qty:=null; unit:=null;
  if kind not in ('ADD','REMOVE','REPLACE') or kind is null or mode not in ('fixed','source') or (mode='source' and kind<>'REPLACE') then raise exception 'POS_FOOD_INVALID'; end if;
  if kind in ('REPLACE','REMOVE') then src:=public.pos_food_ingredient_v1(brand,source_id); end if;
  if kind in ('REPLACE','ADD') then target:=public.pos_food_ingredient_v1(brand,target_id); unit:=target.unit_code; else unit:=src.unit_code; end if;
  if mode='source' then
   perform public.pos_food_convert_quantity_v1(1,src.unit_code,target.unit_code); unit:=null;
  elsif kind in ('ADD','REPLACE') or row->>'quantity' is not null then
   qty:=public.pos_food_convert_quantity_v1((row->>'quantity')::numeric,row->>'unit_code',unit);
   if qty is null or qty<=0 then raise exception 'POS_FOOD_INVALID'; end if;
  else unit:=null; end if;
  insert into public.pos_food_modifier_recipe_effects(brand_slug,product_id,option_id,effect,source_variant_id,ingredient_variant_id,input_quantity,input_unit_code,base_quantity,base_unit_code,quantity_mode,effect_order)
  values(brand,product,option_id,kind,source_id,target_id,case when mode='fixed' then (row->>'quantity')::numeric end,case when mode='fixed' then row->>'unit_code' end,qty,unit,mode,n);
  n:=n+1;
 end loop;
 if exists(select 1 from public.pos_food_modifier_recipe_effects where brand_slug=brand and product_id=product and pos_food_modifier_recipe_effects.option_id=option_id and effect<>'ADD' group by source_variant_id having count(*)>1) then raise exception 'POS_FOOD_RECIPE_EFFECT_CONFLICT'; end if;
 result:=jsonb_build_object('id',option_id);
 insert into public.pos_staff_audit_events(id,brand_id,brand_slug,location_id,actor_staff_id,host_user_id,action,entity_type,entity_id,metadata)
 values(command_key,actor.brand_id,brand,location,actor.id,host,'FOOD_RECIPES_CONFIG','food_recipes',option_id,jsonb_build_object('command_action','effects_save','payload',payload,'result',result));
 return result;
end $$;
revoke all on function public.pos_food_effects_save_v2(text,uuid,uuid,uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.pos_food_effects_save_v2(text,uuid,uuid,uuid,uuid,uuid,jsonb,uuid) to service_role;
commit;
