-- Isolated LOCAL database only; all synthetic fixtures and test helpers roll back.
begin;
create temp table recipe_context(brand uuid,slug text,host uuid,location uuid,register uuid,cash uuid,staff uuid,session uuid) on commit drop;
create function pg_temp.recipe_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.recipe_admin(action text,payload jsonb) returns jsonb language plpgsql as $$
declare c record; begin select * into c from recipe_context; return public.pos_food_recipes_admin_v1(c.slug,c.host,c.session,c.location,action,payload); end $$;
create function pg_temp.recipe_reject(action text,payload jsonb,expected text) returns void language plpgsql as $$
begin
 begin perform pg_temp.recipe_admin(action,payload);
 exception when others then if sqlerrm=expected then raise notice 'PASS rejected: %',expected; return; else raise; end if; end;
 raise exception 'FAIL expected rejection: %',expected;
end $$;
create function pg_temp.recipe_ingredient(name text,unit text,stock numeric,content numeric,purchase_unit text,cost numeric,category text default 'food') returns uuid language plpgsql as $$
declare r jsonb; begin
 r:=pg_temp.recipe_admin('ingredient_save',jsonb_build_object('name',name,'unit_code',unit,'category',category,'initial_quantity',stock,'minimum_quantity',0,'waste_percent',0,'active',true,
 'presentations',jsonb_build_array(jsonb_build_object('name',name||' purchase','content',content,'unit_code',purchase_unit,'cost',cost,'active',true))));
 return (r->>'id')::uuid;
end $$;
create function pg_temp.recipe_order(variant uuid,options jsonb default '[]',qty integer default 1) returns jsonb language plpgsql as $$
declare c record; tbl uuid; account uuid; item uuid; ticket uuid; version integer; r jsonb;
begin
 select * into c from recipe_context;
 r:=public.pos_food_command_v1(c.slug,c.host,c.session,'table_create',jsonb_build_object('locationId',c.location,'name','Recipe '||gen_random_uuid()::text),gen_random_uuid()); tbl:=(r->>'tableId')::uuid;
 r:=public.pos_food_command_v1(c.slug,c.host,c.session,'open',jsonb_build_object('tableId',tbl,'guests',1),gen_random_uuid()); account:=(r->>'checkId')::uuid;
 r:=public.pos_food_command_v1(c.slug,c.host,c.session,'item_add',jsonb_build_object('checkId',account,'variantId',variant,'quantity',qty,'modifierOptionIds',options),gen_random_uuid()); item:=(r->>'itemId')::uuid;
 select fc.version into version from public.pos_food_checks fc where id=account;
 r:=public.pos_food_command_v1(c.slug,c.host,c.session,'send',jsonb_build_object('checkId',account,'version',version),gen_random_uuid()); ticket:=(r->>'ticketId')::uuid;
 perform public.pos_food_command_v1(c.slug,c.host,c.session,'prepare',jsonb_build_object('checkId',account,'ticketId',ticket),gen_random_uuid());
 perform public.pos_food_command_v1(c.slug,c.host,c.session,'ready',jsonb_build_object('checkId',account,'ticketId',ticket),gen_random_uuid());
 perform public.pos_food_command_v1(c.slug,c.host,c.session,'serve',jsonb_build_object('checkId',account,'ticketId',ticket),gen_random_uuid());
 select fc.version into version from public.pos_food_checks fc where id=account;
 perform public.pos_food_command_v1(c.slug,c.host,c.session,'request_payment',jsonb_build_object('checkId',account,'version',version),gen_random_uuid());
 return jsonb_build_object('check',account,'item',item);
end $$;
create function pg_temp.recipe_pay(account uuid,amount numeric,key uuid) returns jsonb language plpgsql as $$
declare c record; begin select * into c from recipe_context;
 return public.pos_food_command_v1(c.slug,c.host,c.session,'pay',jsonb_build_object('checkId',account,'cashSessionId',c.cash,'method','cash','amount',amount),key);
end $$;
create function pg_temp.recipe_frozen(statement text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when others then
  if sqlerrm<>'POS_FOOD_RECIPE_FROZEN' then raise; end if;
  raise notice 'PASS contractual immutable rejection: %',statement; return;
 end;
 raise exception 'FAIL immutable mutation allowed: %',statement;
end $$;

do $$
#variable_conflict use_variable
declare
 b uuid:=gen_random_uuid(); slug text:='canonical-'||replace(gen_random_uuid()::text,'-',''); host uuid:=gen_random_uuid(); loc uuid:=gen_random_uuid(); reg uuid:=gen_random_uuid(); cash uuid:=gen_random_uuid(); staff uuid:=gen_random_uuid(); session uuid:=gen_random_uuid();
 other_b uuid:=gen_random_uuid(); other_slug text:='foreign-'||replace(gen_random_uuid()::text,'-',''); second_loc uuid:=gen_random_uuid();
 milk uuid; almond uuid; coffee uuid; vanilla uuid; ice uuid; variant uuid; product uuid; variants uuid[]:='{}';
 group_id uuid:=gen_random_uuid(); flavor uuid:=gen_random_uuid(); replacement uuid:=gen_random_uuid(); cold uuid:=gen_random_uuid(); shot uuid:=gen_random_uuid(); conflict uuid:=gen_random_uuid();
 ids jsonb; modifiers jsonb; preview jsonb; snapshot jsonb; r jsonb; order_a jsonb; before_stock jsonb; after_send jsonb; key uuid; check_id uuid; ticket uuid; version integer; item uuid; n integer; expected_milk numeric; expected_coffee numeric; caught boolean;
begin
 insert into auth.users(id) values(host);
 insert into public.brands(id,slug,name) values(b,slug,'Recipe fixture'),(other_b,other_slug,'Foreign recipe fixture');
 insert into public.pos_business_profiles(brand_id,brand_slug,profile_code) values(b::text,slug,'coffee_shop'),(other_b::text,other_slug,'restaurant');
 insert into public.pos_locations(id,brand_id,brand_slug,name,code,currency,prices_include_tax) values(loc,b::text,slug,'Recipe location','REC','MXN',false),(second_loc,b::text,slug,'Second','SECOND','MXN',false);
 insert into public.pos_registers(id,brand_id,brand_slug,location_id,name,code) values(reg,b::text,slug,loc,'Recipe register','REC');
 insert into public.pos_cash_sessions(id,brand_id,brand_slug,location_id,register_id,opened_by,opening_amount) values(cash,b::text,slug,loc,reg,host,0);
 insert into public.pos_staff(id,brand_id,brand_slug,location_id,name,role,pin_hash) values(staff,b::text,slug,loc,'Recipe admin','ADMIN','synthetic-not-a-login');
 insert into public.pos_staff_sessions(id,token_hash,host_user_id,staff_id,brand_id,brand_slug,location_id,expires_at) values(session,encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'),host,staff,b::text,slug,loc,now()+interval '1 hour');
 insert into recipe_context values(b,slug,host,loc,reg,cash,staff,session);
 update public.pos_locations set prices_include_tax=true where id=loc;
 milk:=pg_temp.recipe_ingredient('Leche entera','ml',10000,1,'l',28);
 almond:=pg_temp.recipe_ingredient('Almendra','ml',10000,1,'l',40);
 coffee:=pg_temp.recipe_ingredient('Café','ml',10000,1,'l',100);
 vanilla:=pg_temp.recipe_ingredient('Vainilla','ml',10000,1,'l',100);
 ice:=pg_temp.recipe_ingredient('Hielo','g',10000,1,'kg',20);
 r:=pg_temp.recipe_admin('product_save',jsonb_build_object('name','Latte','price',50,'tax_rate',0,'active',true));
 variant:=(r->>'id')::uuid; select product_id into product from public.pos_product_variants where id=variant;
 variants:=array_append(variants,variant);
 for n in 2..3 loop
  variant:=gen_random_uuid();
  insert into public.pos_product_variants(id,brand_id,brand_slug,product_id,name,unit_code,is_default,variant_signature,price,created_by,attributes)
  values(variant,b::text,slug,product,case n when 2 then 'Mediano' else 'Grande' end,'piece',false,'',50,host,jsonb_build_object('food_size',n));
  variants:=array_append(variants,variant);
 end loop;
 for n in 1..3 loop
  perform pg_temp.recipe_admin('recipe_publish',jsonb_build_object('id',variants[n],'components',jsonb_build_array(
    jsonb_build_object('ingredient_variant_id',milk,'quantity',(array[180,220,280])[n],'unit_code','ml'),
    jsonb_build_object('ingredient_variant_id',coffee,'quantity',(array[60,70,90])[n],'unit_code','ml'))));
 end loop;
 insert into public.pos_food_modifier_groups(id,brand_slug,name,selection_mode,min_selections,max_selections,required) values(group_id,slug,'Fixture options','multiple',0,10,false);
 insert into public.pos_food_modifier_options(id,brand_slug,group_id,name,price_delta,type) values
 (flavor,slug,group_id,'Vainilla',5,'add'),(replacement,slug,group_id,'Almendra',8,'choice'),(cold,slug,group_id,'Frío',0,'choice'),(shot,slug,group_id,'Shot',10,'add'),(conflict,slug,group_id,'Conflicto',0,'remove');
 insert into public.pos_food_product_modifier_groups(brand_slug,product_id,group_id) values(slug,product,group_id);
 -- Existing effect_save and its fixed quantities remain valid.
 perform pg_temp.recipe_admin('effect_save',jsonb_build_object('product_id',product,'option_id',flavor,'effect','ADD','ingredient_variant_id',vanilla,'quantity',20,'unit_code','ml'));
 perform pg_temp.recipe_admin('effect_save',jsonb_build_object('product_id',product,'option_id',cold,'effect','ADD','ingredient_variant_id',ice,'quantity',120,'unit_code','g'));
 perform pg_temp.recipe_admin('effect_save',jsonb_build_object('product_id',product,'option_id',shot,'effect','ADD','ingredient_variant_id',coffee,'quantity',70,'unit_code','ml'));
 perform public.pos_food_effects_save_v2(slug,host,session,loc,product,replacement,jsonb_build_array(jsonb_build_object('effect','REPLACE','quantity_mode','source','source_variant_id',milk,'ingredient_variant_id',almond)),gen_random_uuid());
 ids:=jsonb_build_array(flavor,replacement,cold,shot);
 modifiers:=public.pos_food_resolve_modifiers_v1(slug,product,ids);
 for n in 1..3 loop
  variant:=variants[n]; expected_milk:=(array[180,220,280])[n]; expected_coffee:=(array[130,140,160])[n];
  preview:=public.pos_food_recipe_metrics_v1(slug,loc,variant,modifiers);
  perform pg_temp.recipe_assert((select (value->>'base_quantity')::numeric=expected_milk from jsonb_array_elements(preview->'components') where (value->>'ingredient_variant_id')::uuid=almond),'variant almond inherits '||expected_milk);
  perform pg_temp.recipe_assert(not exists(select 1 from jsonb_array_elements(preview->'components') where (value->>'ingredient_variant_id')::uuid=milk),'whole milk zero');
  perform pg_temp.recipe_assert((select (value->>'base_quantity')::numeric=expected_coffee from jsonb_array_elements(preview->'components') where (value->>'ingredient_variant_id')::uuid=coffee),'coffee exact '||expected_coffee);
  select jsonb_object_agg(variant_id,quantity) into before_stock from public.pos_inventory where brand_slug=slug and location_id=loc;
  order_a:=pg_temp.recipe_order(variant,ids); check_id:=(order_a->>'check')::uuid; item:=(order_a->>'item')::uuid;
  select effective_recipe into snapshot from public.pos_food_item_recipe_snapshots where food_item_id=item;
  perform pg_temp.recipe_assert(snapshot->'components'=(select jsonb_agg(value-'physical_stock'-'available_stock'-'usable_estimated_stock'-'possible'-'usable_estimated_possible'-'waste_percent') from jsonb_array_elements(preview->'components')),'preview requirements = frozen SEND requirements');
  perform pg_temp.recipe_assert((snapshot->>'unit_price')::numeric=73,'price 73 frozen');
  perform pg_temp.recipe_assert(snapshot->>'variant_id'=variant::text and snapshot ? 'base_components' and snapshot ? 'modifiers' and jsonb_array_length(snapshot->'effects')=4,'complete immutable snapshot');
  perform pg_temp.recipe_assert(not exists(select 1 from jsonb_array_elements(snapshot->'components') x
   join public.pos_inventory inv on inv.variant_id=(x->>'ingredient_variant_id')::uuid and inv.location_id=loc
   where (before_stock->>inv.variant_id::text)::numeric-inv.quantity<>(x->>'base_quantity')::numeric),'preview requirements = actual SEND stock deltas');
  perform pg_temp.recipe_assert((select count(*)=4 from public.pos_food_send_consumptions where food_item_id=item),'one immutable consumption per ingredient');
  select jsonb_object_agg(variant_id,quantity) into after_send from public.pos_inventory where brand_slug=slug and location_id=loc;
  -- Replay exact original SEND command after preparation: no extra movements.
  select request_key,payload into key,r from public.pos_food_events where pos_food_events.check_id=check_id and action='send' and result->>'checkId'=check_id::text order by created_at desc limit 1;
  perform public.pos_food_command_v1(slug,host,session,'send',r,key);
  perform pg_temp.recipe_assert(after_send=(select jsonb_object_agg(variant_id,quantity) from public.pos_inventory where brand_slug=slug and location_id=loc),'SEND retry no double consumption');
  perform pg_temp.recipe_pay(check_id,73,gen_random_uuid());
  perform pg_temp.recipe_assert(after_send=(select jsonb_object_agg(variant_id,quantity) from public.pos_inventory where brand_slug=slug and location_id=loc),'checkout never consumes SEND inventory twice');
  perform pg_temp.recipe_assert((select count(*)=4 from public.pos_food_sale_consumptions where food_item_id=item),'sale retains consumption provenance');
 end loop;
 -- Multi-effect: same option may remove some base coffee and add ice, without overwriting shot ADD.
 perform public.pos_food_effects_save_v2(slug,host,session,loc,product,cold,jsonb_build_array(
 jsonb_build_object('effect','REMOVE','source_variant_id',coffee,'quantity',10,'unit_code','ml'),
 jsonb_build_object('effect','ADD','ingredient_variant_id',ice,'quantity',120,'unit_code','g')),gen_random_uuid());
 preview:=public.pos_food_recipe_metrics_v1(slug,loc,variants[2],modifiers);
 perform pg_temp.recipe_assert((select (value->>'base_quantity')::numeric=130 from jsonb_array_elements(preview->'components') where (value->>'ingredient_variant_id')::uuid=coffee),'multi-effect REMOVE 10 + shot 70 = coffee 130');
 perform pg_temp.recipe_assert((select (value->>'base_quantity')::numeric=120 from jsonb_array_elements(preview->'components') where (value->>'ingredient_variant_id')::uuid=ice),'multi-effect ice 120');
 perform pg_temp.recipe_assert((select effective_recipe=snapshot from public.pos_food_item_recipe_snapshots where food_item_id=item),'effect edits cannot change sent snapshot');
 caught:=false;
 begin
  perform public.pos_food_effects_save_v2(slug,host,session,loc,product,cold,jsonb_build_array(jsonb_build_object('effect','REMOVE','source_variant_id',coffee),jsonb_build_object('effect','REMOVE','source_variant_id',coffee)),gen_random_uuid());
 exception when others then if sqlerrm='POS_FOOD_RECIPE_EFFECT_CONFLICT' then caught:=true; else raise; end if; end;
 perform pg_temp.recipe_assert(caught,'conflicting effects rejected atomically');
 caught:=false;
 begin perform public.pos_food_effective_recipe_v1(other_slug,variants[2],modifiers);
 exception when others then if sqlerrm='POS_FOOD_RECIPE_INVALID' then caught:=true; else raise; end if; end;
 perform pg_temp.recipe_assert(caught,'foreign brand cannot resolve recipe');
 caught:=false;
 begin perform public.pos_food_resolve_modifiers_v1(slug,product,jsonb_build_array(gen_random_uuid()));
 exception when others then if sqlerrm='POS_FOOD_MODIFIERS_INVALID' then caught:=true; else raise; end if; end;
 perform pg_temp.recipe_assert(caught,'unknown option rejected');
 -- Preview read-only; a stock change before SEND must cause the whole SEND to roll back.
 preview:=public.pos_food_recipe_metrics_v1(slug,loc,variants[2],modifiers);
 perform pg_temp.recipe_assert((preview->>'availability')::numeric>0,'preview available before stock change');
 update public.pos_inventory set quantity=0 where variant_id=almond and location_id=loc;
 preview:=public.pos_food_recipe_metrics_v1(slug,loc,variants[2],modifiers);
 perform pg_temp.recipe_assert((preview->>'availability')::numeric=0,'exhausted modifier unavailable');
 caught:=false;
 begin perform pg_temp.recipe_order(variants[2],ids);
 exception when others then if sqlerrm='POS_FOOD_STOCK_UNAVAILABLE' then caught:=true; else raise; end if; end;
 perform pg_temp.recipe_assert(caught,'SEND revalidates changed stock transactionally');
end $$;
rollback;
