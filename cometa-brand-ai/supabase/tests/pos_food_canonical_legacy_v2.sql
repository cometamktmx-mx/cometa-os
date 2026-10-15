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
create table food_integration_test.legacy_food(context jsonb not null);

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

 milk:=pg_temp.recipe_ingredient('Legacy milk','ml',3000,1,'l',28);
 almond:=pg_temp.recipe_ingredient('Legacy almond','ml',3000,1,'l',40);
 r:=pg_temp.recipe_admin('product_save',jsonb_build_object('name','Legacy Latte','price',50,'tax_rate',0,'active',true)); variant:=(r->>'id')::uuid;
 select product_id into product from public.pos_product_variants where id=variant;
 perform pg_temp.recipe_admin('recipe_publish',jsonb_build_object('id',variant,'components',jsonb_build_array(jsonb_build_object('ingredient_variant_id',milk,'quantity',220,'unit_code','ml'))));
 insert into public.pos_food_modifier_groups(id,brand_slug,name) values(group_id,slug,'Milk');
 insert into public.pos_food_modifier_options(id,brand_slug,group_id,name) values(replacement,slug,group_id,'Legacy almond');
 insert into public.pos_food_product_modifier_groups(brand_slug,product_id,group_id) values(slug,product,group_id);
 perform pg_temp.recipe_admin('effect_save',jsonb_build_object('product_id',product,'option_id',replacement,'effect','REPLACE','source_variant_id',milk,'ingredient_variant_id',almond,'quantity',220,'unit_code','ml'));
 order_a:=pg_temp.recipe_order(variant,jsonb_build_array(replacement));
 perform pg_temp.recipe_assert((select quantity=3000 from public.pos_inventory where variant_id=almond and location_id=loc),'legacy SEND does not consume before migration');
 insert into food_integration_test.legacy_food values(jsonb_build_object('slug',slug,'host',host,'session',session,'location',loc,'cash',cash,'check',order_a->>'check','item',order_a->>'item','almond',almond,'option',replacement));
end $$;
commit;
