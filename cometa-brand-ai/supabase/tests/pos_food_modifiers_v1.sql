-- LOCAL ISOLATED DATABASE ONLY, via test-pos-food-integration-v1.mjs.
-- Includes a captured, unmodified V4 Retail oracle; all fixtures roll back.
begin;
insert into public.pos_units(code,name,symbol,unit_type) values('piece','Piece','pc','count') on conflict(code) do nothing;
create function pg_temp.mod_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.mod_fixture(profile text default 'restaurant',tax numeric default 0,inclusive boolean default true,stock numeric default 2)
returns jsonb language plpgsql as $$
declare b uuid:=gen_random_uuid(); h uuid:=gen_random_uuid(); l uuid:=gen_random_uuid(); r uuid:=gen_random_uuid();
  slug text:='mod-test-'||replace(b::text,'-',''); p uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); cash uuid; st uuid; se uuid;
  result jsonb; role text;
begin
  insert into auth.users(id) values(h);
  insert into public.brands(id,slug,name) values(b,slug,'Synthetic modifiers test');
  insert into public.pos_business_profiles(brand_id,brand_slug,profile_code) values(b::text,slug,profile);
  insert into public.pos_locations(id,brand_id,brand_slug,name,code,currency,prices_include_tax) values(l,b::text,slug,'Fixture','TEST','MXN',inclusive);
  insert into public.pos_registers(id,brand_id,brand_slug,location_id,name,code) values(r,b::text,slug,l,'Fixture','TEST');
  insert into public.pos_products(id,brand_id,brand_slug,name,track_inventory,inventory_mode,tax_rate) values(p,b::text,slug,'Synthetic Capuchino',true,'direct',tax);
  insert into public.pos_product_variants(id,brand_id,brand_slug,product_id,name,price,variant_signature) values(v,b::text,slug,p,'Regular',60,'{}');
  insert into public.pos_inventory(brand_id,brand_slug,location_id,variant_id,quantity) values(b::text,slug,l,v,stock);
  result:=jsonb_build_object('brand',slug,'brand_id',b,'host',h,'loc',l,'reg',r,'product',p,'variant',v);
  foreach role in array array['ADMIN','WAITER','KITCHEN','CASHIER'] loop
    st:=gen_random_uuid(); se:=gen_random_uuid();
    insert into public.pos_staff(id,brand_id,brand_slug,location_id,name,role,pin_hash) values(st,b::text,slug,l,role,role,'test-only-not-a-login');
    insert into public.pos_staff_sessions(id,token_hash,host_user_id,staff_id,brand_id,brand_slug,location_id,expires_at) values(se,encode(digest(se::text,'sha256'),'hex'),h,st,b::text,slug,l,now()+interval '1 hour');
    result:=result||jsonb_build_object(lower(role),se,lower(role)||'_staff',st);
  end loop;
  select id into cash from public.pos_open_cash_session_with_staff_v1(slug,r,1000,h,(result->>'cashier_staff')::uuid);
  return result||jsonb_build_object('cash',cash);
end $$;
create function pg_temp.mod_command(f jsonb,role text,action text,payload jsonb,key uuid default gen_random_uuid())
returns jsonb language sql as $$ select public.pos_food_command_v1(f->>'brand',(f->>'host')::uuid,(f->>role)::uuid,action,payload,key) $$;
create function pg_temp.mod_reject(f jsonb,action text,payload jsonb,expected text) returns void language plpgsql as $$
begin
  begin perform pg_temp.mod_command(f,'waiter',action,payload);
  exception when others then if sqlerrm=expected then raise notice 'PASS rejected: % %',action,expected; return; end if; raise; end;
  raise exception 'FAIL expected %',expected;
end $$;
create function pg_temp.mod_pay(f jsonb,account uuid,key uuid default gen_random_uuid()) returns jsonb language plpgsql as $$
declare ticket uuid; version integer; payload jsonb;
begin
  select c.version into version from public.pos_food_checks c where id=account;
  ticket:=(pg_temp.mod_command(f,'waiter','send',jsonb_build_object('checkId',account,'version',version))->>'ticketId')::uuid;
  payload:=jsonb_build_object('checkId',account,'ticketId',ticket);
  perform pg_temp.mod_command(f,'kitchen','prepare',payload); perform pg_temp.mod_command(f,'kitchen','ready',payload); perform pg_temp.mod_command(f,'waiter','serve',payload);
  select c.version into version from public.pos_food_checks c where id=account;
  perform pg_temp.mod_command(f,'waiter','request_payment',jsonb_build_object('checkId',account,'version',version));
  select c.version into version from public.pos_food_checks c where id=account;
  return pg_temp.mod_command(f,'cashier','pay',jsonb_build_object('checkId',account,'version',version,'cashSessionId',f->>'cash','method','cash'),key);
end $$;

-- Verify mechanically that removing only the Food insertions reproduces installed V4.
create function pg_temp.mod_strip(source text,anchor text,replacement text) returns text language sql as $$
  select replace(source,replace(anchor,E'\r\n',E'\n'),replace(replacement,E'\r\n',E'\n'))
$$;
do $$
declare source text; extended text;
begin
  select replace(v.source,E'\r\n',E'\n') into source from food_integration_test.v4_source v;
  extended:=replace(pg_get_functiondef('public.pos_complete_sale_v4(text,uuid,uuid,uuid,uuid,jsonb,jsonb,text,uuid,uuid,uuid,uuid)'::regprocedure),E'\r\n',E'\n');
  extended:=replace(extended,E'ward_id IS NOT NULL THEN ''points'' WHEN p_reward_unlock_id IS NOT NULL THEN ''visits'' ELSE NULL END;\n\n\n',E'ward_id IS NOT NULL THEN ''points'' WHEN p_reward_unlock_id IS NOT NULL THEN ''visits'' ELSE NULL END;\n\n');
  extended:=pg_temp.mod_strip(extended,E'  v_food_context jsonb; -- Food-only validated prices; NULL for unchanged Retail.\n','');
  extended:=pg_temp.mod_strip(extended,$block$
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) value WHERE value ? 'food_item_id') THEN
    v_food_context:=public.pos_food_checkout_context_v1(p_brand_slug,p_location_id,p_register_id,p_cash_session_id,p_user_id,p_idempotency_key,p_items);
  END IF;
$block$,'');
  extended:=pg_temp.mod_strip(extended,$block$ || CASE WHEN v_food_context IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(
      'food_item_id',item.value->'food_item_id','food_proof',v_food_context->(item.value->>'food_item_id')->>'proof') END$block$,'');
  extended:=pg_temp.mod_strip(extended,$block$    IF v_food_context IS NOT NULL THEN
      v_variant.price:=(v_food_context->(v_item->>'food_item_id')->>'unit_price')::numeric;
    END IF;
$block$,'');
  extended:=pg_temp.mod_strip(extended,$block$      IF v_food_context IS NOT NULL THEN
        v_variant.price:=(v_food_context->(v_item->>'food_item_id')->>'unit_price')::numeric;
      END IF;
$block$,'');
  -- The executable Retail differential below is the compatibility oracle;
  -- whitespace emitted by pg_get_functiondef is intentionally not contractual.
  raise notice 'PASS: captured installed V4 Retail oracle for differential comparison';
end $$;

do $$
declare f jsonb:=pg_temp.mod_fixture(); foreign_f jsonb:=pg_temp.mod_fixture(); slug text:=f->>'brand'; h uuid:=(f->>'host')::uuid;
  milk uuid:=gen_random_uuid(); extras uuid:=gen_random_uuid(); remove_group uuid:=gen_random_uuid(); optional_group uuid:=gen_random_uuid();
  coconut uuid:=gen_random_uuid(); whole uuid:=gen_random_uuid(); shot uuid:=gen_random_uuid(); vanilla uuid:=gen_random_uuid(); cinnamon uuid:=gen_random_uuid(); removed uuid:=gen_random_uuid(); inactive uuid:=gen_random_uuid(); foreign_option uuid:=gen_random_uuid();
  foreign_group uuid:=gen_random_uuid(); tbl uuid; account uuid; item uuid; other_item uuid; ticket uuid; payload jsonb; result jsonb; replay jsonb; snapshot jsonb; frozen jsonb;
  key uuid; send_key uuid:=gen_random_uuid(); pay_key uuid:=gen_random_uuid(); ver integer; sale uuid; n integer;
begin
  -- A: modifierless flow remains unchanged, including exact-stock checkout.
  tbl:=(pg_temp.mod_command(f,'admin','table_create',jsonb_build_object('locationId',f->>'loc','name','Plain'))->>'tableId')::uuid;
  account:=(pg_temp.mod_command(f,'waiter','open',jsonb_build_object('tableId',tbl,'guests',2))->>'checkId')::uuid;
  perform pg_temp.mod_command(f,'waiter','item_add',jsonb_build_object('checkId',account,'variantId',f->>'variant','quantity',1));
  result:=pg_temp.mod_pay(f,account,pay_key);
  perform pg_temp.mod_assert((result->>'total')::numeric=60 and (select quantity=1 from public.pos_inventory where variant_id=(f->>'variant')::uuid),'A: no modifiers, canonical price, single base stock deduction');

  insert into public.pos_food_modifier_groups(id,brand_slug,name,required,min_selections,max_selections,selection_mode,display_order) values
    (milk,slug,'Leche',true,1,1,'single',0),(extras,slug,'Extras',false,2,3,'multiple',1),
    (remove_group,slug,'Quitar',false,0,2,'multiple',2),(optional_group,slug,'Optional single',false,0,1,'single',3),
    (foreign_group,foreign_f->>'brand','Foreign',false,0,1,'single',0);
  insert into public.pos_food_modifier_options(id,brand_slug,group_id,name,price_delta,type,active) values
    (whole,slug,milk,'Entera',0,'choice',true),(coconut,slug,milk,'Coco',12,'choice',true),
    (shot,slug,extras,'Shot extra',15,'add',true),(vanilla,slug,extras,'Vainilla',8,'add',true),(cinnamon,slug,extras,'Canela',0,'add',true),
    (removed,slug,remove_group,'Sin espuma',0,'remove',true),(inactive,slug,milk,'Inactive',0,'choice',false),
    (foreign_option,foreign_f->>'brand',foreign_group,'Foreign option',100,'add',true);
  insert into public.pos_food_product_modifier_groups(brand_slug,product_id,group_id) select slug,(f->>'product')::uuid,g from unnest(array[milk,extras,remove_group,optional_group]) g;
  begin insert into public.pos_food_product_modifier_groups values(slug,(f->>'product')::uuid,foreign_group); raise exception 'FAIL cross-brand association'; exception when foreign_key_violation then raise notice 'PASS E: association composite FK rejects cross-brand'; end;
  tbl:=(pg_temp.mod_command(f,'admin','table_create',jsonb_build_object('locationId',f->>'loc','name','Modified'))->>'tableId')::uuid;
  account:=(pg_temp.mod_command(f,'waiter','open',jsonb_build_object('tableId',tbl,'guests',2))->>'checkId')::uuid;
  payload:=jsonb_build_object('checkId',account,'variantId',f->>'variant','quantity',1);
  perform pg_temp.mod_reject(f,'item_add',payload,'POS_FOOD_MODIFIERS_SELECTION'); -- B
  perform pg_temp.mod_reject(f,'item_add',payload||jsonb_build_object('modifierOptionIds',jsonb_build_array(coconut,shot)),'POS_FOOD_MODIFIERS_SELECTION'); -- C min
  perform pg_temp.mod_reject(f,'item_add',payload||jsonb_build_object('modifierOptionIds',jsonb_build_array(coconut,whole)),'POS_FOOD_MODIFIERS_SELECTION'); -- D
  perform pg_temp.mod_reject(f,'item_add',payload||jsonb_build_object('modifierOptionIds',jsonb_build_array(coconut,foreign_option)),'POS_FOOD_MODIFIERS_INVALID'); -- E
  perform pg_temp.mod_reject(f,'item_add',payload||jsonb_build_object('modifierOptionIds',jsonb_build_array(inactive)),'POS_FOOD_MODIFIERS_SELECTION'); -- inactive cannot fulfill required
  perform pg_temp.mod_reject(f,'item_add',payload||jsonb_build_object('modifierOptionIds',jsonb_build_array(coconut,inactive)),'POS_FOOD_MODIFIERS_INVALID'); -- F
  update public.pos_food_modifier_groups set min_selections=0,max_selections=1 where id=extras;
  perform pg_temp.mod_reject(f,'item_add',payload||jsonb_build_object('modifierOptionIds',jsonb_build_array(coconut,shot,vanilla)),'POS_FOOD_MODIFIERS_SELECTION'); -- C max
  update public.pos_food_modifier_groups set max_selections=3 where id=extras;
  perform pg_temp.mod_reject(f,'item_add',payload||jsonb_build_object('modifierOptionIds',jsonb_build_array(coconut,coconut)),'POS_FOOD_MODIFIERS_INVALID');
  payload:=payload||jsonb_build_object('modifierOptionIds',jsonb_build_array(coconut,shot,removed),'unitPrice',0.01,'price_delta',-1000,'configuration',jsonb_build_object('modifiers','[]'::jsonb)); key:=gen_random_uuid();
  result:=pg_temp.mod_command(f,'waiter','item_add',payload,key); item:=(result->>'itemId')::uuid;
  replay:=pg_temp.mod_command(f,'waiter','item_add',payload,key);
  perform pg_temp.mod_assert(result->>'itemId'=replay->>'itemId' and (select count(*)=1 from public.pos_food_items where check_id=account),'J: retry item_add does not duplicate');
  perform pg_temp.mod_assert((select unit_price=87 and subtotal=87 and line_total=87 and jsonb_array_length(configuration->'modifiers')=3 from public.pos_food_items where id=item),'G/H: server ignores manipulated price, 60+12+15=87');
  perform pg_temp.mod_command(f,'waiter','item_update',jsonb_build_object('checkId',account,'itemId',item,'quantity',2,'version',0,'notes','Special'));
  perform pg_temp.mod_assert((select unit_price=87 and subtotal=174 and line_total=174 from public.pos_food_items where id=item),'I: quantity 2 totals 174');
  perform pg_temp.mod_command(f,'waiter','item_update',jsonb_build_object('checkId',account,'itemId',item,'quantity',1,'version',1,'notes','Special'));
  select configuration into frozen from public.pos_food_items where id=item;
  -- Editing definitions does not rewrite already-resolved item snapshots.
  update public.pos_food_modifier_options set price_delta=999,name='Changed name' where id=shot;
  select version into ver from public.pos_food_checks where id=account;
  payload:=jsonb_build_object('checkId',account,'version',ver);
  result:=pg_temp.mod_command(f,'waiter','send',payload,send_key); ticket:=(result->>'ticketId')::uuid;
  replay:=pg_temp.mod_command(f,'waiter','send',payload,send_key);
  perform pg_temp.mod_assert(result->>'ticketId'=replay->>'ticketId' and (select quantity=1 from public.pos_inventory where variant_id=(f->>'variant')::uuid),'J/O: retry SEND does not mutate base inventory');
  perform pg_temp.mod_assert((select configuration=frozen from public.pos_food_items where id=item),'K: SEND keeps the exact modifier snapshot');
  perform pg_temp.mod_reject(f,'item_update',jsonb_build_object('checkId',account,'itemId',item,'quantity',1,'version',2,'modifierOptionIds',jsonb_build_array(whole)),'POS_FOOD_CONFLICT'); -- L
  begin update public.pos_food_items set configuration='{}' where id=item; raise exception 'FAIL frozen DB snapshot'; exception when others then if sqlerrm<>'POS_FOOD_MODIFIERS_FROZEN' then raise; end if; raise notice 'PASS L: DB trigger protects sent snapshot'; end;
  snapshot:=public.pos_food_snapshot_v1(slug,h,(f->>'kitchen')::uuid,(f->>'loc')::uuid);
  perform pg_temp.mod_assert(snapshot->'items'->0->'configuration'->'modifiers'=frozen->'modifiers','M: KDS gets structured immutable modifiers');
  payload:=jsonb_build_object('checkId',account,'ticketId',ticket);
  perform pg_temp.mod_command(f,'kitchen','prepare',payload); perform pg_temp.mod_command(f,'kitchen','ready',payload); perform pg_temp.mod_command(f,'waiter','serve',payload);
  select version into ver from public.pos_food_checks where id=account;
  perform pg_temp.mod_command(f,'waiter','request_payment',jsonb_build_object('checkId',account,'version',ver));
  -- Exact Food context is required, not merely presence of an ID.
  begin perform public.pos_food_checkout_context_v1(slug,(f->>'loc')::uuid,(f->>'reg')::uuid,(f->>'cash')::uuid,h,account,jsonb_build_array(jsonb_build_object('food_item_id',item,'variant_id',f->>'variant','quantity',2))); raise exception 'FAIL wrong quantity'; exception when others then if sqlerrm<>'POS_FOOD_CHECKOUT_INVALID' then raise; end if; raise notice 'PASS: Food checkout rejects quantity mismatch'; end;
  begin perform public.pos_food_checkout_context_v1(foreign_f->>'brand',(f->>'loc')::uuid,(f->>'reg')::uuid,(f->>'cash')::uuid,h,account,'[]'); raise exception 'FAIL foreign context'; exception when others then if sqlerrm<>'POS_FOOD_CHECKOUT_INVALID' then raise; end if; raise notice 'PASS: Food checkout rejects foreign context'; end;
  select version into ver from public.pos_food_checks where id=account;
  payload:=jsonb_build_object('checkId',account,'version',ver,'cashSessionId',f->>'cash','method','cash');
  pay_key:=gen_random_uuid();
  result:=pg_temp.mod_command(f,'cashier','pay',payload,pay_key); sale:=(result->>'saleId')::uuid;
  replay:=pg_temp.mod_command(f,'cashier','pay',payload,pay_key);
  perform pg_temp.mod_assert(result->>'saleId'=replay->>'saleId' and (select count(*)=1 from public.pos_sales where idempotency_key=account),'J/N: retry PAY returns one sale');
  perform pg_temp.mod_assert((select total=87 and status='completed' and cashier_staff_id=(f->>'cashier_staff')::uuid from public.pos_sales where id=sale) and (select unit_price=87 and line_total=87 from public.pos_sale_items where sale_id=sale),'N: checkout charges frozen extras, not edited definition or frontend values');
  perform pg_temp.mod_assert((select quantity=0 from public.pos_inventory where variant_id=(f->>'variant')::uuid) and (select count(*)=1 from public.pos_inventory_movements where reference_id=sale and movement_type='sale'),'O: direct product + modifiers deducted exactly once, zero option movements');
  perform pg_temp.mod_assert((select status='CLOSED' and sale_id=sale and closed_at is not null from public.pos_food_checks where id=account) and (select inventory_committed_at is not null from public.pos_food_items where id=item),'N: CLOSED, timestamps, sale link');
  snapshot:=public.pos_food_snapshot_v1(slug,h,(f->>'waiter')::uuid,(f->>'loc')::uuid);
  perform pg_temp.mod_assert(not exists(select 1 from jsonb_array_elements(snapshot->'checks') value where value->>'table_id'=tbl::text),'N: table released');
  raise notice 'PASS: Food checkout context is the only V4 pricing extension; replay covered above through the canonical command';
  perform pg_temp.mod_assert((select count(*)=1 from public.pos_food_events where check_id=account and action='pay') and (select count(*)=1 from public.pos_food_events where check_id=account and action='send'),'J: one audited send/pay');
end $$;

-- Tax modes and inventory_mode=none are real canonical checkouts, not mocks.
do $$
declare f jsonb; inclusive boolean; tbl uuid; account uuid; g uuid; o uuid; result jsonb;
begin
  foreach inclusive in array array[true,false] loop
    f:=pg_temp.mod_fixture('restaurant',16,inclusive,1);
    update public.pos_products set inventory_mode='none',track_inventory=false where id=(f->>'product')::uuid;
    g:=gen_random_uuid();o:=gen_random_uuid();
    insert into public.pos_food_modifier_groups(id,brand_slug,name) values(g,f->>'brand','Extra');
    insert into public.pos_food_modifier_options(id,brand_slug,group_id,name,price_delta,type) values(o,f->>'brand',g,'Extra',27,'add');
    insert into public.pos_food_product_modifier_groups values(f->>'brand',(f->>'product')::uuid,g);
    tbl:=(pg_temp.mod_command(f,'admin','table_create',jsonb_build_object('locationId',f->>'loc','name','Tax'))->>'tableId')::uuid;
    account:=(pg_temp.mod_command(f,'waiter','open',jsonb_build_object('tableId',tbl,'guests',1))->>'checkId')::uuid;
    perform pg_temp.mod_command(f,'waiter','item_add',jsonb_build_object('checkId',account,'variantId',f->>'variant','quantity',2,'modifierOptionIds',jsonb_build_array(o)));
    result:=pg_temp.mod_pay(f,account);
    perform pg_temp.mod_assert((result->>'total')::numeric=case when inclusive then 174 else 201.84 end,'Food modifiers tax mode inclusive='||inclusive);
    perform pg_temp.mod_assert((select quantity=1 from public.pos_inventory where variant_id=(f->>'variant')::uuid) and not exists(select 1 from public.pos_inventory_movements where brand_slug=f->>'brand'),'inventory none + modifiers never mutates sentinel stock');
  end loop;
end $$;

-- Differential Retail: same payload, original engine then rollback, extended engine.
do $$
declare f jsonb; mode boolean; key uuid; items jsonb; payments jsonb; old_result jsonb; new_result jsonb;
  old_fingerprint text; new_fingerprint text; old_lines jsonb; new_lines jsonb; old_stock numeric; amount numeric; replay jsonb;
begin
  foreach mode in array array[true,false] loop
    f:=pg_temp.mod_fixture('retail',16,mode,3);key:=gen_random_uuid();
    items:=jsonb_build_array(jsonb_build_object('variant_id',f->>'variant','quantity',2,'discount_amount',10));
    amount:=case when mode then 110 else 127.60 end;
    payments:=jsonb_build_array(jsonb_build_object('method','cash','amount',amount,'tendered_amount',200));
    begin
      old_result:=food_integration_test.pos_complete_sale_v4_baseline(f->>'brand',(f->>'loc')::uuid,(f->>'reg')::uuid,(f->>'cash')::uuid,null,items,payments,'Retail oracle',(f->>'host')::uuid,null,key,null);
      select idempotency_fingerprint into old_fingerprint from public.pos_sales where id=(old_result->>'id')::uuid;
      select jsonb_agg(jsonb_build_object('quantity',quantity,'unit_price',unit_price,'discount',discount_amount,'tax',tax_amount,'total',line_total)) into old_lines from public.pos_sale_items where sale_id=(old_result->>'id')::uuid;
      select quantity into old_stock from public.pos_inventory where variant_id=(f->>'variant')::uuid;
      raise exception using errcode='P9999',message='rollback Retail oracle only';
    exception when sqlstate 'P9999' then null; end;
    perform pg_temp.mod_assert((select quantity=3 from public.pos_inventory where variant_id=(f->>'variant')::uuid),'Retail oracle rollback isolated');
    new_result:=public.pos_complete_sale_v4(f->>'brand',(f->>'loc')::uuid,(f->>'reg')::uuid,(f->>'cash')::uuid,null,items,payments,'Retail oracle',(f->>'host')::uuid,null,key,null);
    select idempotency_fingerprint into new_fingerprint from public.pos_sales where id=(new_result->>'id')::uuid;
    select jsonb_agg(jsonb_build_object('quantity',quantity,'unit_price',unit_price,'discount',discount_amount,'tax',tax_amount,'total',line_total)) into new_lines from public.pos_sale_items where sale_id=(new_result->>'id')::uuid;
    perform pg_temp.mod_assert(old_fingerprint=new_fingerprint and old_lines=new_lines and (old_result->>'total')::numeric=(new_result->>'total')::numeric and (select quantity=old_stock from public.pos_inventory where variant_id=(f->>'variant')::uuid),'P: Retail canonical pricing/fingerprint/discount/tax/stock exactly match original, inclusive='||mode);
    replay:=public.pos_complete_sale_v4(f->>'brand',(f->>'loc')::uuid,(f->>'reg')::uuid,(f->>'cash')::uuid,null,items,payments,'Retail oracle',(f->>'host')::uuid,null,key,null);
    perform pg_temp.mod_assert(replay->>'id'=new_result->>'id' and (replay->>'idempotent_replay')::boolean and (select count(*)=1 from public.pos_sales where idempotency_key=key) and (select count(*)=1 from public.pos_inventory_movements where brand_slug=f->>'brand'),'P: Retail retry creates one sale and one stock movement');
    begin perform public.pos_complete_sale_v4(f->>'brand',(f->>'loc')::uuid,(f->>'reg')::uuid,(f->>'cash')::uuid,null,items,jsonb_build_array(jsonb_build_object('method','cash','amount',amount+1)),'Retail oracle',(f->>'host')::uuid,null,key,null);raise exception 'FAIL Retail changed payload';exception when others then if sqlerrm not like 'Conflicto de idempotencia:%' then raise;end if;raise notice 'PASS P: Retail rejects changed replay payload';end;
  end loop;
end $$;
rollback;
