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
declare
 b uuid:=gen_random_uuid(); slug text:='recipe-test-'||replace(gen_random_uuid()::text,'-',''); host uuid:=gen_random_uuid(); loc uuid:=gen_random_uuid(); reg uuid:=gen_random_uuid(); cash uuid:=gen_random_uuid(); staff uuid:=gen_random_uuid(); session uuid:=gen_random_uuid();
 milk uuid; coffee uuid; cinnamon uuid; almond uuid; bread uuid; variant uuid; product uuid; group_id uuid:=gen_random_uuid(); shot uuid:=gen_random_uuid(); replace_milk uuid:=gen_random_uuid(); remove_cinnamon uuid:=gen_random_uuid();
 recipe jsonb; r jsonb; payment_rows jsonb; metrics jsonb; order_a jsonb; order_b jsonb; order_c jsonb; order_d jsonb; order_extra jsonb; order_almond jsonb; order_remove jsonb; before_stock numeric; key uuid; sale uuid; count_before integer; physical numeric; presentation uuid;
 other_b uuid:=gen_random_uuid(); other_slug text:='recipe-other-'||replace(gen_random_uuid()::text,'-',''); other_p uuid:=gen_random_uuid(); other_v uuid:=gen_random_uuid(); second_loc uuid:=gen_random_uuid();
 second_reg uuid:=gen_random_uuid(); second_cash uuid:=gen_random_uuid(); second_order jsonb; location_a_stock jsonb; draft_version uuid:=gen_random_uuid();
 allocation_order jsonb; allocation_payload jsonb; committed_before timestamptz; direct_product uuid:=gen_random_uuid(); direct_variant uuid:=gen_random_uuid(); draft_check uuid;
begin
 insert into auth.users(id) values(host);
 insert into public.brands(id,slug,name) values(b,slug,'Recipe fixture'),(other_b,other_slug,'Foreign recipe fixture');
 insert into public.pos_business_profiles(brand_id,brand_slug,profile_code) values(b::text,slug,'coffee_shop'),(other_b::text,other_slug,'restaurant');
 insert into public.pos_locations(id,brand_id,brand_slug,name,code,currency,prices_include_tax) values(loc,b::text,slug,'Recipe location','REC','MXN',false),(second_loc,b::text,slug,'Second','SECOND','MXN',false);
 insert into public.pos_registers(id,brand_id,brand_slug,location_id,name,code) values(reg,b::text,slug,loc,'Recipe register','REC');
 insert into public.pos_cash_sessions(id,brand_id,brand_slug,location_id,register_id,opened_by,opening_amount) values(cash,b::text,slug,loc,reg,host,0);
 insert into public.pos_staff(id,brand_id,brand_slug,location_id,name,role,pin_hash) values(staff,b::text,slug,loc,'Recipe admin','ADMIN','synthetic-not-a-login');
 insert into public.pos_staff_sessions(id,token_hash,host_user_id,staff_id,brand_id,brand_slug,location_id,expires_at) values(session,repeat('f',64),host,staff,b::text,slug,loc,now()+interval '1 hour');
 insert into recipe_context values(b,slug,host,loc,reg,cash,staff,session);

 perform pg_temp.recipe_assert(public.pos_food_convert_quantity_v1(1,'l','ml')=1000,'1 L = 1000 ml');
 perform pg_temp.recipe_assert(public.pos_food_convert_quantity_v1(1,'kg','g')=1000,'1 kg = 1000 g');
 perform pg_temp.recipe_assert(public.pos_food_convert_quantity_v1(12,'piece','piece')=12,'12 piece package content');
 milk:=pg_temp.recipe_ingredient('Leche entera','ml',3000,1,'l',28);
 coffee:=pg_temp.recipe_ingredient('Café','g',500,1,'kg',380);
 cinnamon:=pg_temp.recipe_ingredient('Canela','g',30,100,'g',40);
 almond:=pg_temp.recipe_ingredient('Leche almendra','ml',1000,1,'l',40,'base');
 bread:=pg_temp.recipe_ingredient('Pan','piece',0,12,'piece',60);
 perform pg_temp.recipe_assert((select cost=0.028 from public.pos_product_variants where id=milk),'Milk base unit cost .028');
 perform pg_temp.recipe_assert((select cost=0.38 from public.pos_product_variants where id=coffee),'Coffee base unit cost .38');
 perform pg_temp.recipe_assert((select conversion_factor=12 from public.pos_variant_purchase_presentations where variant_id=bread),'Count package uses existing presentations');
 select id into presentation from public.pos_variant_purchase_presentations where variant_id=bread;
 key:=gen_random_uuid();
 r:=pg_temp.recipe_admin('receive',jsonb_build_object('id',bread,'presentation_id',presentation,'quantity',2,'request_key',key));
 perform pg_temp.recipe_admin('receive',jsonb_build_object('id',bread,'presentation_id',presentation,'quantity',2,'request_key',key));
 perform pg_temp.recipe_assert((select quantity=24 from public.pos_inventory where variant_id=bread and location_id=loc),'Two 12-piece packages receive once on retry');
 perform pg_temp.recipe_assert((select cost=5 from public.pos_product_variants where id=bread),'Reception calculates cost per piece');
 perform pg_temp.recipe_reject('ingredient_save',jsonb_build_object('name','Bad','unit_code','g','category','food','presentations',jsonb_build_array(jsonb_build_object('name','Bad','content',1,'unit_code','ml','cost',1))),'POS_FOOD_RECIPE_UNIT');
 perform pg_temp.recipe_reject('ingredient_save',jsonb_build_object('name','Precision','unit_code','g','category','food','initial_quantity',0.0001,'presentations','[]'::jsonb),'POS_FOOD_RECIPE_PRECISION');

 r:=pg_temp.recipe_admin('product_save',jsonb_build_object('name','Capuchino','price',60,'tax_rate',0,'active',true)); variant:=(r->>'id')::uuid;
 select product_id into product from public.pos_product_variants where id=variant;
 recipe:=jsonb_build_array(jsonb_build_object('ingredient_variant_id',coffee,'quantity',18,'unit_code','g'),jsonb_build_object('ingredient_variant_id',milk,'quantity',220,'unit_code','ml'),jsonb_build_object('ingredient_variant_id',cinnamon,'quantity',2,'unit_code','g'));
 perform pg_temp.recipe_admin('recipe_publish',jsonb_build_object('id',variant,'components',recipe));
 metrics:=public.pos_food_recipe_metrics_v1(slug,loc,variant);
 perform pg_temp.recipe_assert((metrics->>'unit_cost')::numeric=13.8,'Capuchino recipe cost 13.80');
 perform pg_temp.recipe_assert((select (value->>'subtotal')::numeric=6.16 from jsonb_array_elements(metrics->'components') where (value->>'ingredient_variant_id')::uuid=milk),'Milk component 6.16');
 perform pg_temp.recipe_assert((select (value->>'subtotal')::numeric=6.84 from jsonb_array_elements(metrics->'components') where (value->>'ingredient_variant_id')::uuid=coffee),'Coffee component 6.84');
 perform pg_temp.recipe_assert((select (value->>'subtotal')::numeric=.8 from jsonb_array_elements(metrics->'components') where (value->>'ingredient_variant_id')::uuid=cinnamon),'Cinnamon component .80');
 perform pg_temp.recipe_assert((metrics->>'gross_profit')::numeric=46.2 and (metrics->>'gross_margin')::numeric=.77,'Gross profit 46.20 / margin 77%');
 perform pg_temp.recipe_assert((metrics->>'availability')::numeric=13 and metrics->>'limiting_ingredient'='Leche entera','Yield 13 / limiting milk');
 perform pg_temp.recipe_assert((select (value->>'possible')::numeric=27 from jsonb_array_elements(metrics->'components') where (value->>'ingredient_variant_id')::uuid=coffee),'Coffee yield 27');
 perform pg_temp.recipe_assert((select (value->>'possible')::numeric=15 from jsonb_array_elements(metrics->'components') where (value->>'ingredient_variant_id')::uuid=cinnamon),'Cinnamon yield 15');
 perform pg_temp.recipe_assert((metrics->>'limiting_remaining')::numeric=140,'Milk remaining after 13 is 140 ml');

 insert into public.pos_food_modifier_groups(id,brand_slug,name,selection_mode,max_selections) values(group_id,slug,'Extras','multiple',3);
 insert into public.pos_food_modifier_options(id,brand_slug,group_id,name,price_delta,type) values(shot,slug,group_id,'Shot extra',10,'add'),(replace_milk,slug,group_id,'Almendra',5,'choice'),(remove_cinnamon,slug,group_id,'Sin canela',0,'remove');
 insert into public.pos_food_product_modifier_groups(brand_slug,product_id,group_id) values(slug,product,group_id);
 perform pg_temp.recipe_admin('effect_save',jsonb_build_object('product_id',product,'option_id',shot,'effect','ADD','ingredient_variant_id',coffee,'quantity',18,'unit_code','g'));
 perform pg_temp.recipe_admin('effect_save',jsonb_build_object('product_id',product,'option_id',replace_milk,'effect','REPLACE','source_variant_id',milk,'ingredient_variant_id',almond,'quantity',220,'unit_code','ml'));
 perform pg_temp.recipe_admin('effect_save',jsonb_build_object('product_id',product,'option_id',remove_cinnamon,'effect','REMOVE','source_variant_id',cinnamon));
 r:=public.pos_food_effective_recipe_v1(slug,variant,public.pos_food_resolve_modifiers_v1(slug,product,jsonb_build_array(shot)));
 perform pg_temp.recipe_assert((select (value->>'base_quantity')::numeric=36 from jsonb_array_elements(r->'components') where (value->>'ingredient_variant_id')::uuid=coffee) and (r->>'unit_cost')::numeric=20.64,'Extra shot 36 g / cost 20.64');
 r:=public.pos_food_effective_recipe_v1(slug,variant,public.pos_food_resolve_modifiers_v1(slug,product,jsonb_build_array(replace_milk)));
 perform pg_temp.recipe_assert(not exists(select 1 from jsonb_array_elements(r->'components') where (value->>'ingredient_variant_id')::uuid=milk) and (r->>'unit_cost')::numeric=16.44,'Almond replaces milk / cost 16.44');
 r:=public.pos_food_effective_recipe_v1(slug,variant,public.pos_food_resolve_modifiers_v1(slug,product,jsonb_build_array(remove_cinnamon)));
 perform pg_temp.recipe_assert(not exists(select 1 from jsonb_array_elements(r->'components') where (value->>'ingredient_variant_id')::uuid=cinnamon) and (r->>'unit_cost')::numeric=13,'Remove cinnamon / cost 13');

 perform public.pos_adjust_inventory(slug,loc,milk,1000,'adjustment','Fixture reset',host,true);
 order_a:=pg_temp.recipe_order(variant);
 perform pg_temp.recipe_assert((select quantity=1000 from public.pos_inventory where variant_id=milk and location_id=loc),'SEND does not consume milk');
 perform pg_temp.recipe_assert((select count(*)=0 from public.pos_food_sale_consumptions where brand_slug=slug),'No consumption before final');
 -- Recipe and rule changes after SEND must not rewrite the effective recipe.
 recipe:=jsonb_set(recipe,'{0,quantity}','20');
 perform pg_temp.recipe_admin('recipe_publish',jsonb_build_object('id',variant,'components',recipe));
 perform pg_temp.recipe_pay((order_a->>'check')::uuid,20,gen_random_uuid());
 perform pg_temp.recipe_assert((select quantity=1000 from public.pos_inventory where variant_id=milk and location_id=loc),'Partial payment does not consume');
 key:=gen_random_uuid(); r:=pg_temp.recipe_pay((order_a->>'check')::uuid,40,key); sale:=(r->>'saleId')::uuid;
 perform pg_temp.recipe_assert((select quantity=780 from public.pos_inventory where variant_id=milk and location_id=loc),'Final payment consumes 220 ml once');
 perform pg_temp.recipe_assert((select base_quantity=18 and unit_cost=.38 from public.pos_food_sale_consumptions where sale_id=sale and ingredient_variant_id=coffee),'Sent recipe consumes historic 18 g');
 perform pg_temp.recipe_assert((select unit_cost=13.8 from public.pos_sale_items where sale_id=sale),'Canonical sale item recipe cost snapshot');
 perform pg_temp.recipe_pay((order_a->>'check')::uuid,40,key);
 perform pg_temp.recipe_assert((select quantity=780 from public.pos_inventory where variant_id=milk and location_id=loc) and (select count(*)=3 from public.pos_food_sale_consumptions where sale_id=sale),'Retry no stock/movement/consumption duplication');
 -- Direct V4 replay also returns historic state without invoking the consumption helper.
 select jsonb_agg(jsonb_build_object('food_item_id',id,'variant_id',variant_id,'quantity',quantity,'discount_amount',discount_amount)) into r from public.pos_food_items where check_id=(order_a->>'check')::uuid;
 select jsonb_agg(jsonb_build_object('method',fp.method,'amount',fp.amount,'tendered_amount',fp.amount_received,'reference',fp.reference) order by fp.created_at) into payment_rows from public.pos_food_payments fp where fp.check_id=(order_a->>'check')::uuid;
 perform public.pos_complete_sale_v4(slug,loc,reg,cash,null,r,payment_rows,'Food check '||(order_a->>'check'),host,null,(order_a->>'check')::uuid,null);
 perform pg_temp.recipe_assert((select quantity=780 from public.pos_inventory where variant_id=milk and location_id=loc),'V4 replay consumes nothing');

 order_b:=pg_temp.recipe_order(variant);
 perform pg_temp.recipe_admin('cost_set',jsonb_build_object('id',coffee,'content',1,'unit_code','kg','cost',420));
 perform pg_temp.recipe_pay((order_b->>'check')::uuid,60,gen_random_uuid());
 perform pg_temp.recipe_assert((select base_quantity=20 and unit_cost=.38 from public.pos_food_sale_consumptions where food_item_id=(order_b->>'item')::uuid and ingredient_variant_id=coffee),'New recipe 20 g but SEND cost stays .38');
 order_c:=pg_temp.recipe_order(variant);
 perform pg_temp.recipe_pay((order_c->>'check')::uuid,60,gen_random_uuid());
 perform pg_temp.recipe_assert((select base_quantity=20 and unit_cost=.42 from public.pos_food_sale_consumptions where food_item_id=(order_c->>'item')::uuid and ingredient_variant_id=coffee),'Later sale uses .42 current cost');
 perform pg_temp.recipe_assert((select unit_cost=.38 from public.pos_food_sale_consumptions where sale_id=sale and ingredient_variant_id=coffee),'Older sale retains .38');

 -- Effective modifier snapshots drive real canonical consumption, independently of price.
 perform public.pos_adjust_inventory(slug,loc,milk,3000,'adjustment','Fixture reset',host,true);
 perform public.pos_adjust_inventory(slug,loc,cinnamon,100,'adjustment','Fixture reset',host,true);
 order_extra:=pg_temp.recipe_order(variant,jsonb_build_array(shot));
 perform pg_temp.recipe_admin('effect_save',jsonb_build_object('product_id',product,'option_id',shot,'effect','ADD','ingredient_variant_id',coffee,'quantity',30,'unit_code','g'));
 perform pg_temp.recipe_pay((order_extra->>'check')::uuid,70,gen_random_uuid());
 perform pg_temp.recipe_assert((select base_quantity=38 from public.pos_food_sale_consumptions where food_item_id=(order_extra->>'item')::uuid and ingredient_variant_id=coffee),'Rule change after SEND retains 20+18 g');
 order_almond:=pg_temp.recipe_order(variant,jsonb_build_array(replace_milk));
 select quantity into before_stock from public.pos_inventory where variant_id=milk and location_id=loc;
 perform pg_temp.recipe_pay((order_almond->>'check')::uuid,65,gen_random_uuid());
 perform pg_temp.recipe_assert((select quantity=before_stock from public.pos_inventory where variant_id=milk and location_id=loc) and (select base_quantity=220 from public.pos_food_sale_consumptions where food_item_id=(order_almond->>'item')::uuid and ingredient_variant_id=almond),'Almond consumes only replacement milk');
 order_remove:=pg_temp.recipe_order(variant,jsonb_build_array(remove_cinnamon));
 select quantity into before_stock from public.pos_inventory where variant_id=cinnamon and location_id=loc;
 perform pg_temp.recipe_pay((order_remove->>'check')::uuid,60,gen_random_uuid());
 perform pg_temp.recipe_assert((select quantity=before_stock from public.pos_inventory where variant_id=cinnamon and location_id=loc),'Removed cinnamon has zero consumption');

 order_d:=pg_temp.recipe_order(variant); perform pg_temp.recipe_pay((order_d->>'check')::uuid,20,gen_random_uuid());
 perform public.pos_adjust_inventory(slug,loc,milk,100,'adjustment','Fixture insufficient',host,true);
 select count(*) into count_before from public.pos_food_sale_consumptions where brand_slug=slug;
 select quantity into before_stock from public.pos_inventory where variant_id=coffee and location_id=loc;
 begin perform pg_temp.recipe_pay((order_d->>'check')::uuid,40,gen_random_uuid()); raise exception 'FAIL expected insufficient';
 exception when others then if sqlerrm<>'POS_FOOD_STOCK_UNAVAILABLE' then raise; end if; end;
 perform pg_temp.recipe_assert((select quantity=before_stock from public.pos_inventory where variant_id=coffee and location_id=loc) and (select quantity=100 from public.pos_inventory where variant_id=milk and location_id=loc),'Insufficient final rolls back every ingredient');
 perform pg_temp.recipe_assert((select count(*)=count_before from public.pos_food_sale_consumptions where brand_slug=slug) and (select sale_id is null and status='PAYMENT_PENDING' from public.pos_food_checks where id=(order_d->>'check')::uuid),'Insufficient final leaves no sale or consumption');
 perform pg_temp.recipe_assert((select count(*)=1 and sum(amount)=20 from public.pos_food_payments where check_id=(order_d->>'check')::uuid),'Prior partial payment survives failed final');

 insert into public.pos_products(id,brand_id,brand_slug,name,product_type,inventory_mode,track_inventory,sellable,purchasable,default_unit_code) values(other_p,other_b::text,other_slug,'Foreign','ingredient','direct',true,false,true,'g');
 insert into public.pos_product_variants(id,brand_id,brand_slug,product_id,name,unit_code,variant_signature) values(other_v,other_b::text,other_slug,other_p,'Única','g','{}');
 perform pg_temp.recipe_reject('recipe_publish',jsonb_build_object('id',other_v,'components',recipe),'POS_FOOD_RECIPE_INVALID');
 perform pg_temp.recipe_reject('recipe_publish',jsonb_build_object('id',variant,'components',jsonb_build_array(jsonb_build_object('ingredient_variant_id',other_v,'quantity',1,'unit_code','g'))),'POS_FOOD_RECIPE_INGREDIENT');
 perform pg_temp.recipe_reject('effect_save',jsonb_build_object('product_id',product,'option_id',shot,'effect','ADD','ingredient_variant_id',variant,'quantity',1,'unit_code','piece'),'POS_FOOD_RECIPE_INGREDIENT');
 perform pg_temp.recipe_reject('recipe_publish',jsonb_build_object('id',variant,'components',jsonb_build_array(jsonb_build_object('ingredient_variant_id',coffee,'quantity',1,'unit_code','ml'))),'POS_FOOD_RECIPE_UNIT');
 perform pg_temp.recipe_reject('recipe_publish',jsonb_build_object('id',variant,'components',jsonb_build_array(jsonb_build_object('ingredient_variant_id',coffee,'quantity',.1,'unit_code','mg'))),'POS_FOOD_RECIPE_PRECISION');
 begin perform public.pos_food_recipes_catalog_v1(slug,host,session,second_loc); raise exception 'FAIL foreign location'; exception when others then if sqlerrm<>'POS_FOOD_FORBIDDEN' then raise; end if; end;
 perform pg_temp.recipe_assert(true,'Foreign staff location rejected');
 select quantity into physical from public.pos_inventory where variant_id=coffee and location_id=loc;
 perform pg_temp.recipe_admin('ingredient_save',jsonb_build_object('id',coffee,'name','Café','unit_code','g','category','food','waste_percent',5,'minimum_quantity',0,'active',true,'presentations','[]'::jsonb));
 perform pg_temp.recipe_assert((select quantity=physical from public.pos_inventory where variant_id=coffee and location_id=loc),'Waste settings do not destroy physical stock');
 r:=public.pos_food_recipes_catalog_v1(slug,host,session,loc);
 perform pg_temp.recipe_assert((select (value->>'usable_estimated_stock')::numeric=physical*.95 from jsonb_array_elements(r->'ingredients') where (value->>'id')::uuid=coffee),'Physical and usable stock separately represented');
 perform pg_temp.recipe_frozen(format('update public.pos_food_item_recipe_snapshots set unit_cost=0 where food_item_id=%L',(order_a->>'item')));
 perform pg_temp.recipe_frozen(format('delete from public.pos_food_item_recipe_snapshots where food_item_id=%L',(order_a->>'item')));
 perform pg_temp.recipe_frozen(format('update public.pos_food_recipe_versions set version=99 where variant_id=%L',variant));
 perform pg_temp.recipe_frozen(format('delete from public.pos_food_recipe_versions where variant_id=%L',variant));
 perform pg_temp.recipe_frozen(format('update public.pos_food_recipe_components set base_quantity=1 where recipe_version_id in (select id from public.pos_food_recipe_versions where variant_id=%L)',variant));
 perform pg_temp.recipe_frozen(format('delete from public.pos_food_recipe_components where recipe_version_id in (select id from public.pos_food_recipe_versions where variant_id=%L)',variant));
 perform pg_temp.recipe_frozen(format('update public.pos_food_sale_consumptions set total_cost=0 where sale_id=%L',sale));
 perform pg_temp.recipe_frozen(format('delete from public.pos_food_sale_consumptions where sale_id=%L',sale));
 -- Existing allowed behavior: build components before publication, then publish once.
 insert into public.pos_food_recipe_versions(id,brand_slug,variant_id,version,created_by)
 select draft_version,slug,variant,max(version)+1,staff from public.pos_food_recipe_versions where variant_id=variant;
 insert into public.pos_food_recipe_components(recipe_version_id,brand_slug,ingredient_variant_id,input_quantity,input_unit_code,base_quantity,base_unit_code)
 values(draft_version,slug,coffee,20,'g',20,'g'),(draft_version,slug,milk,220,'ml',220,'ml'),(draft_version,slug,cinnamon,2,'g',2,'g');
 update public.pos_food_recipe_versions set published_at=clock_timestamp() where id=draft_version;
 perform pg_temp.recipe_assert(true,'Unpublished component insertion and one-time publication remain allowed');
 perform pg_temp.recipe_assert(true,'Published recipe and SEND snapshot immutable');
 perform public.pos_adjust_inventory(slug,loc,milk,1000,'adjustment','Allocation fixture',host,true);
 select count(*) into count_before from public.pos_inventory_movements where brand_slug=slug;
 perform pg_temp.recipe_admin('ingredient_save',jsonb_build_object('id',milk,'name','Leche entera','unit_code','ml','category','base','waste_percent',5,'minimum_quantity',0,'active',true,'presentations','[]'::jsonb));
 r:=public.pos_food_recipes_catalog_v1(slug,host,session,loc);
 perform pg_temp.recipe_assert((select (value->>'stock')::numeric=1000 and (value->>'usable_estimated_stock')::numeric=950 from jsonb_array_elements(r->'ingredients') where (value->>'id')::uuid=milk)
 and (select count(*)=count_before from public.pos_inventory_movements where brand_slug=slug),'Milk waste 5%: physical 1000, usable 950, no movement');
 allocation_order:=pg_temp.recipe_order(variant);
 allocation_payload:=jsonb_build_object('checkId',allocation_order->>'check','cashSessionId',cash,'method','cash','amount',30,'allocations',jsonb_build_array(jsonb_build_object('foodItemId',allocation_order->>'item','quantity',.5)));
 perform public.pos_food_command_v1(slug,host,session,'pay',allocation_payload,gen_random_uuid());
 perform pg_temp.recipe_assert((select quantity=1000 from public.pos_inventory where variant_id=milk and location_id=loc)
 and (select count(*)=count_before from public.pos_inventory_movements where brand_slug=slug)
 and (select inventory_committed_at is null from public.pos_food_items where id=(allocation_order->>'item')::uuid),'Recipe partial allocation creates no inventory movement or commit');
 key:=gen_random_uuid(); perform public.pos_food_command_v1(slug,host,session,'pay',allocation_payload,key);
 select inventory_committed_at into committed_before from public.pos_food_items where id=(allocation_order->>'item')::uuid;
 perform public.pos_food_command_v1(slug,host,session,'pay',allocation_payload,key);
 perform pg_temp.recipe_assert((select quantity=780 from public.pos_inventory where variant_id=milk and location_id=loc)
 and (select count(*)=count_before+3 from public.pos_inventory_movements where brand_slug=slug)
 and (select inventory_committed_at=committed_before from public.pos_food_items where id=(allocation_order->>'item')::uuid),'Recipe final allocation and retry consume once and preserve commit timestamp');
 insert into public.pos_products(id,brand_id,brand_slug,name,product_type,inventory_mode,track_inventory,sellable,purchasable,default_unit_code)
 values(direct_product,b::text,slug,'Direct conversion fixture','physical','direct',true,true,true,'piece');
 insert into public.pos_product_variants(id,brand_id,brand_slug,product_id,name,unit_code,variant_signature,price)
 values(direct_variant,b::text,slug,direct_product,'Única','piece','{}',60);
 perform public.pos_adjust_inventory(slug,loc,direct_variant,1,'initial','Direct conversion fixture',host,true);
 perform pg_temp.recipe_reject('recipe_publish',jsonb_build_object('id',direct_variant,'components',recipe),'POS_FOOD_RECIPE_MODE_CONFLICT');
 perform public.pos_adjust_inventory(slug,loc,direct_variant,0,'adjustment','Direct fixture empty',host,true);
 perform public.pos_adjust_inventory(slug,loc,direct_variant,1,'adjustment','Permit draft creation',host,true);
 r:=public.pos_food_command_v1(slug,host,session,'table_create',jsonb_build_object('locationId',loc,'name','Pending conversion'),gen_random_uuid());
 r:=public.pos_food_command_v1(slug,host,session,'open',jsonb_build_object('tableId',r->>'tableId','guests',1),gen_random_uuid()); draft_check:=(r->>'checkId')::uuid;
 perform public.pos_food_command_v1(slug,host,session,'item_add',jsonb_build_object('checkId',draft_check,'variantId',direct_variant,'quantity',1,'modifierOptionIds','[]'::jsonb),gen_random_uuid());
 perform public.pos_adjust_inventory(slug,loc,direct_variant,0,'adjustment','Pending draft with no stock',host,true);
 perform pg_temp.recipe_reject('recipe_publish',jsonb_build_object('id',direct_variant,'components',recipe),'POS_FOOD_RECIPE_MODE_CONFLICT');
 perform pg_temp.recipe_assert((select p.product_type='ingredient' and p.inventory_mode='direct' and p.track_inventory and not p.sellable and p.purchasable from public.pos_products p join public.pos_product_variants pv on pv.product_id=p.id where pv.id=milk)
 and (select p.product_type='prepared' and p.inventory_mode='recipe' and not p.track_inventory and not p.purchasable from public.pos_products p join public.pos_product_variants pv on pv.product_id=p.id where pv.id=variant),'Ingredient/prepared product flags remain correct');
 -- Actual checkout at B must use only B balances, never sufficient stock at A.
 select jsonb_object_agg(variant_id::text,quantity) into location_a_stock from public.pos_inventory where location_id=loc and brand_slug=slug;
 insert into public.pos_registers(id,brand_id,brand_slug,location_id,name,code) values(second_reg,b::text,slug,second_loc,'Second register','SECOND');
 insert into public.pos_cash_sessions(id,brand_id,brand_slug,location_id,register_id,opened_by,opening_amount) values(second_cash,b::text,slug,second_loc,second_reg,host,0);
 update public.pos_staff set location_id=second_loc where id=staff;
 update public.pos_staff_sessions set location_id=second_loc where id=session;
 update recipe_context set location=second_loc,register=second_reg,cash=second_cash;
 perform public.pos_adjust_inventory(slug,second_loc,milk,1000,'initial','Second fixture',host,true);
 perform public.pos_adjust_inventory(slug,second_loc,coffee,100,'initial','Second fixture',host,true);
 perform public.pos_adjust_inventory(slug,second_loc,cinnamon,100,'initial','Second fixture',host,true);
 second_order:=pg_temp.recipe_order(variant);
 perform public.pos_adjust_inventory(slug,second_loc,milk,100,'adjustment','Second insufficient',host,true);
 begin perform pg_temp.recipe_pay((second_order->>'check')::uuid,60,gen_random_uuid()); raise exception 'FAIL expected B insufficiency';
 exception when others then if sqlerrm<>'POS_FOOD_STOCK_UNAVAILABLE' then raise; end if; end;
 perform pg_temp.recipe_assert((select jsonb_object_agg(variant_id::text,quantity)=location_a_stock from public.pos_inventory where location_id=loc and brand_slug=slug)
 and (select quantity=100 from public.pos_inventory where location_id=second_loc and variant_id=coffee),'B insufficiency never consumes A or partially consumes B');
 perform public.pos_adjust_inventory(slug,second_loc,milk,1000,'adjustment','Second replenish',host,true);
 perform pg_temp.recipe_pay((second_order->>'check')::uuid,60,gen_random_uuid());
 perform pg_temp.recipe_assert((select quantity=780 from public.pos_inventory where location_id=second_loc and variant_id=milk)
 and (select jsonb_object_agg(variant_id::text,quantity)=location_a_stock from public.pos_inventory where location_id=loc and brand_slug=slug),'B final consumes only B; all A balances remain unchanged');
 perform pg_temp.recipe_assert((select bool_and(location_id=second_loc) from public.pos_food_sale_consumptions where food_item_id=(second_order->>'item')::uuid),'B consumption audit carries B location');
 update public.pos_staff set location_id=loc where id=staff;
 update public.pos_staff_sessions set location_id=loc where id=session;
 update recipe_context set location=loc,register=reg,cash=(select cs.id from public.pos_cash_sessions cs where cs.register_id=reg and cs.location_id=loc);
 perform pg_temp.recipe_assert((select count(*)=0 from public.pos_inventory where variant_id=variant),'Prepared product has no duplicate finished stock');
 perform pg_temp.recipe_assert((select count(*)=1 from public.pos_sales where id=sale),'Final retry retains one canonical sale');
 -- Exercise the installed CHECK constraints independently of ownership/FK triggers.
 -- Copy a real sent recipe item, keeping every required column and other CHECKs.
 create temp table recipe_commit_constraint_probe
   (like public.pos_food_items including defaults including constraints) on commit drop;
 insert into recipe_commit_constraint_probe select * from public.pos_food_items where id=(order_a->>'item')::uuid;
 update recipe_commit_constraint_probe set inventory_committed_at=null;
 update recipe_commit_constraint_probe set track_inventory=true,inventory_mode='direct',inventory_committed_at=clock_timestamp();
 perform pg_temp.recipe_assert(true,'Direct with ticket permits commit marker');
 update recipe_commit_constraint_probe set track_inventory=false,inventory_mode='recipe',inventory_committed_at=clock_timestamp();
 perform pg_temp.recipe_assert(true,'Recipe with ticket permits commit marker without direct tracking');
 update recipe_commit_constraint_probe set inventory_committed_at=null,inventory_mode='none';
 begin update recipe_commit_constraint_probe set inventory_committed_at=clock_timestamp(); raise exception 'FAIL none permits marker';
 exception when check_violation then raise notice 'PASS None rejects commit marker'; end;
 update recipe_commit_constraint_probe set inventory_mode=null;
 begin update recipe_commit_constraint_probe set inventory_committed_at=clock_timestamp(); raise exception 'FAIL null mode permits marker';
 exception when check_violation then raise notice 'PASS Legacy null mode without tracking rejects commit marker'; end;
 update recipe_commit_constraint_probe set inventory_mode='recipe',ticket_id=null;
 begin update recipe_commit_constraint_probe set inventory_committed_at=clock_timestamp(); raise exception 'FAIL recipe without ticket';
 exception when check_violation then raise notice 'PASS Recipe without ticket rejects commit marker'; end;
 update recipe_commit_constraint_probe set track_inventory=true,inventory_mode='direct';
 begin update recipe_commit_constraint_probe set inventory_committed_at=clock_timestamp(); raise exception 'FAIL direct without ticket';
 exception when check_violation then raise notice 'PASS Direct without ticket rejects commit marker'; end;
end $$;
rollback;
