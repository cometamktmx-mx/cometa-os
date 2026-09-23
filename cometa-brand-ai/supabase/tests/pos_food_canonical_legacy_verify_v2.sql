begin;
do $$
declare c jsonb; result jsonb; key uuid:=gen_random_uuid(); before_count integer;
begin
 select context into strict c from food_integration_test.legacy_food;
 if not exists(select 1 from public.pos_food_modifier_recipe_effects where option_id=(c->>'option')::uuid and quantity_mode='fixed' and base_quantity=220 and effect_order=0) then raise exception 'FAIL legacy effect changed'; end if;
 if not exists(select 1 from public.pos_food_item_recipe_snapshots where food_item_id=(c->>'item')::uuid and effective_recipe is null) then raise exception 'FAIL legacy snapshot rewritten'; end if;
 result:=public.pos_food_command_v1(c->>'slug',(c->>'host')::uuid,(c->>'session')::uuid,'pay',jsonb_build_object('checkId',c->>'check','cashSessionId',c->>'cash','method','cash','amount',50),key);
 perform public.pos_food_command_v1(c->>'slug',(c->>'host')::uuid,(c->>'session')::uuid,'pay',jsonb_build_object('checkId',c->>'check','cashSessionId',c->>'cash','method','cash','amount',50),key);
 if not exists(select 1 from public.pos_inventory where variant_id=(c->>'almond')::uuid and location_id=(c->>'location')::uuid and quantity=2780) then raise exception 'FAIL legacy payment consumption'; end if;
 if (select count(*) from public.pos_food_sale_consumptions where food_item_id=(c->>'item')::uuid)<>1 then raise exception 'FAIL legacy duplicate consumption'; end if;
 raise notice 'PASS legacy fixed effects unchanged; old snapshot retained; legacy checkout consumes exactly once after migration';
end $$;
rollback;
