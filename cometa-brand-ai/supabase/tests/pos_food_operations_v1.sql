-- LOCAL DISPOSABLE DATABASE ONLY. Requires baseline, canonical catalog, staff and Food migrations.
-- Creates isolated synthetic fixtures; every data/schema write is rolled back.
-- Does not use existing tenant data, credentials, messages or external services.
-- Execute with psql -v ON_ERROR_STOP=1 -f supabase/tests/pos_food_operations_v1.sql.
begin;

-- Test-only fixture.
-- The production schema references unit code 'piece' as a default,
-- but the repository currently contains no verified canonical seed row.
insert into public.pos_units(code, name, symbol, unit_type)
values ('piece', 'Piece', 'pc', 'count')
on conflict (code) do nothing;

create function pg_temp.food_assert(condition boolean, label text) returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception 'FAIL: %',label; end if;
  raise notice 'PASS: %',label;
end $$;

create function pg_temp.food_reject(brand text,host uuid,session uuid,action text,payload jsonb,expected text)
returns void language plpgsql as $$
begin
  begin
    perform public.pos_food_command_v1(brand,host,session,action,payload,gen_random_uuid());
  exception when others then
    if sqlerrm=expected then raise notice 'PASS rejected: % (%)',action,expected; return; end if;
    raise;
  end;
  raise exception 'FAIL expected rejection: % (%)',action,expected;
end $$;

do $$
declare
  b uuid:=gen_random_uuid(); other_b uuid:=gen_random_uuid(); host uuid:=gen_random_uuid();
  slug text:='food-test-'||replace(gen_random_uuid()::text,'-',''); other_slug text:='food-test-'||replace(gen_random_uuid()::text,'-','');
  loc uuid:=gen_random_uuid(); other_loc uuid:=gen_random_uuid(); second_loc uuid:=gen_random_uuid(); reg uuid:=gen_random_uuid(); cash uuid:=gen_random_uuid();
  admin_id uuid:=gen_random_uuid(); waiter_id uuid:=gen_random_uuid(); kitchen_id uuid:=gen_random_uuid(); cashier_staff uuid:=gen_random_uuid(); waiter_two uuid:=gen_random_uuid();
  admin_session uuid:=gen_random_uuid(); waiter_session uuid:=gen_random_uuid(); kitchen_session uuid:=gen_random_uuid(); cashier_session uuid:=gen_random_uuid(); waiter_two_session uuid:=gen_random_uuid();
  foreign_staff uuid:=gen_random_uuid(); foreign_session uuid:=gen_random_uuid();
  product uuid:=gen_random_uuid(); variant uuid:=gen_random_uuid(); foreign_product uuid:=gen_random_uuid(); foreign_variant uuid:=gen_random_uuid();
  sandwich_product uuid:=gen_random_uuid(); sandwich_variant uuid:=gen_random_uuid(); cheesecake_product uuid:=gen_random_uuid(); cheesecake_variant uuid:=gen_random_uuid();
  tbl uuid; foreign_table uuid; account uuid; item_one uuid; item_two uuid; ticket_one uuid; ticket_two uuid;
  result jsonb; replay jsonb; snap jsonb; payload jsonb; request_key uuid; sale uuid;
  version integer; tickets_before integer; count_before integer; cash_before numeric;
  stock_case integer; initial_stock integer; stock_product uuid; stock_variant uuid; stock_inventory uuid;
  stock_table uuid; stock_account uuid; stock_ticket uuid; send_key uuid; pay_key uuid;
  sales_before integer; retail_key uuid;
begin
  insert into auth.users(id) values(host);
  insert into public.brands(id,slug,name) values(b,slug,'Food fixture'),(other_b,other_slug,'Other Food fixture');
  insert into public.pos_business_profiles(brand_id,brand_slug,profile_code) values(b::text,slug,'restaurant'),(other_b::text,other_slug,'coffee_shop');
  insert into public.pos_locations(id,brand_id,brand_slug,name,code,currency,prices_include_tax)
    values(loc,b::text,slug,'Test room','TEST','MXN',false),(second_loc,b::text,slug,'Second room','SECOND','MXN',true),(other_loc,other_b::text,other_slug,'Other room','TEST','MXN',true);
  insert into public.pos_registers(id,brand_id,brand_slug,location_id,name,code) values(reg,b::text,slug,loc,'Test register','TEST');
  insert into public.pos_cash_sessions(id,brand_id,brand_slug,location_id,register_id,opened_by,opening_amount) values(cash,b::text,slug,loc,reg,host,0);
  insert into public.pos_staff(id,brand_id,brand_slug,location_id,name,role,pin_hash) values
    (admin_id,b::text,slug,loc,'Admin','ADMIN','synthetic-not-a-login'),
    (waiter_id,b::text,slug,loc,'Opening waiter','WAITER','synthetic-not-a-login'),
    (kitchen_id,b::text,slug,loc,'Cook','KITCHEN','synthetic-not-a-login'),
    (cashier_staff,b::text,slug,loc,'Cashier','CASHIER','synthetic-not-a-login'),
    (waiter_two,b::text,slug,loc,'Delivery waiter','WAITER','synthetic-not-a-login'),
    (foreign_staff,other_b::text,other_slug,other_loc,'Other admin','ADMIN','synthetic-not-a-login');
  insert into public.pos_staff_sessions(id,token_hash,host_user_id,staff_id,brand_id,brand_slug,location_id,expires_at)
    select se,replace(se::text,'-','')||replace(se::text,'-',''),host,st,b::text,slug,loc,now()+interval '1 hour'
    from (values(admin_session,admin_id),(waiter_session,waiter_id),(kitchen_session,kitchen_id),(cashier_session,cashier_staff),(waiter_two_session,waiter_two)) f(se,st);
  insert into public.pos_staff_sessions(id,token_hash,host_user_id,staff_id,brand_id,brand_slug,location_id,expires_at)
    values(foreign_session,replace(foreign_session::text,'-','')||replace(foreign_session::text,'-',''),host,foreign_staff,other_b::text,other_slug,other_loc,now()+interval '1 hour');
  insert into public.pos_products(id,brand_id,brand_slug,name,track_inventory,inventory_mode,tax_rate)
    values(product,b::text,slug,'Cappuccino',false,'none',16),(foreign_product,other_b::text,other_slug,'Foreign coffee',false,'none',0),
    (sandwich_product,b::text,slug,'Sandwich',false,'none',16),(cheesecake_product,b::text,slug,'Cheesecake',false,'none',16);
  insert into public.pos_product_variants(id,brand_id,brand_slug,product_id,name,price,variant_signature)
    values(variant,b::text,slug,product,'Regular',50,'{}'),(foreign_variant,other_b::text,other_slug,foreign_product,'Regular',50,'{}'),
    (sandwich_variant,b::text,slug,sandwich_product,'Regular',80,'{}'),(cheesecake_variant,b::text,slug,cheesecake_product,'Regular',70,'{}');

  request_key:=gen_random_uuid(); payload:=jsonb_build_object('locationId',loc,'name','Mesa 4');
  result:=public.pos_food_command_v1(slug,host,admin_session,'table_create',payload,request_key);
  tbl:=(result->>'tableId')::uuid;
  replay:=public.pos_food_command_v1(slug,host,admin_session,'table_create',payload,request_key);
  perform pg_temp.food_assert(result->>'tableId'=replay->>'tableId','table creation retry is idempotent');
  perform pg_temp.food_reject(slug,host,admin_session,'table_create',payload,'POS_FOOD_DUPLICATE_TABLE');
  perform pg_temp.food_reject(slug,host,waiter_session,'table_create',payload,'POS_FOOD_FORBIDDEN');
  perform pg_temp.food_reject(slug,host,admin_session,'table_create',jsonb_build_object('locationId',second_loc,'name','Forbidden'),'POS_FOOD_FORBIDDEN');

  result:=public.pos_food_command_v1(other_slug,host,foreign_session,'table_create',jsonb_build_object('locationId',other_loc,'name','Other table'),gen_random_uuid());
  foreign_table:=(result->>'tableId')::uuid;
  perform pg_temp.food_reject(slug,host,waiter_session,'open',jsonb_build_object('tableId',foreign_table,'guests',2),'POS_FOOD_NOT_FOUND');
  perform pg_temp.food_reject(other_slug,host,waiter_session,'open',jsonb_build_object('tableId',foreign_table,'guests',2),'POS_FOOD_SESSION_REQUIRED');
  perform pg_temp.food_reject(slug,gen_random_uuid(),waiter_session,'open',jsonb_build_object('tableId',tbl,'guests',2),'POS_FOOD_SESSION_REQUIRED');

  payload:=jsonb_build_object('tableId',tbl,'guests',2,'customerName','Fixture guest'); request_key:=gen_random_uuid();
  result:=public.pos_food_command_v1(slug,host,waiter_session,'open',payload,request_key); account:=(result->>'checkId')::uuid;
  replay:=public.pos_food_command_v1(slug,host,waiter_session,'open',payload,request_key);
  perform pg_temp.food_assert(result->>'checkId'=replay->>'checkId','opening retry returns original account');
  perform pg_temp.food_assert((select opened_by=waiter_id and guests=2 and opened_at is not null and location_id=loc and brand_slug=slug from public.pos_food_checks where id=account),'account source identity and open timestamp');
  perform pg_temp.food_reject(slug,host,admin_session,'open',payload,'POS_FOOD_TABLE_OCCUPIED');
  perform pg_temp.food_reject(slug,host,waiter_session,'item_add',jsonb_build_object('checkId',account,'variantId',foreign_variant,'quantity',1),'POS_FOOD_CATALOG_UNAVAILABLE');
  perform pg_temp.food_reject(other_slug,host,foreign_session,'item_add',jsonb_build_object('checkId',account,'variantId',foreign_variant,'quantity',1),'POS_FOOD_NOT_FOUND');

  payload:=jsonb_build_object('checkId',account,'variantId',variant,'quantity',2,'notes','Sin hielo'); request_key:=gen_random_uuid();
  result:=public.pos_food_command_v1(slug,host,waiter_session,'item_add',payload,request_key); item_one:=(result->>'itemId')::uuid;
  perform public.pos_food_command_v1(slug,host,waiter_session,'item_add',payload,request_key);
  perform pg_temp.food_assert((select count(*)=1 from public.pos_food_items where check_id=account),'add item retry does not duplicate quantity');
  perform pg_temp.food_assert((select quantity=2 and unit_price=50 and subtotal=100 and tax_amount=16 and line_total=116 and created_by=waiter_id from public.pos_food_items where id=item_one),'canonical price and tax snapshot with physical creator');
  perform public.pos_food_command_v1(slug,host,waiter_session,'item_add',jsonb_build_object('checkId',account,'variantId',sandwich_variant,'quantity',1,'notes','Sin cebolla'),gen_random_uuid());
  select c.version into version from public.pos_food_checks c where id=account;
  perform pg_temp.food_reject(slug,host,waiter_session,'request_payment',jsonb_build_object('checkId',account,'version',version),'POS_FOOD_SERVICE_INCOMPLETE');
  payload:=jsonb_build_object('checkId',account,'version',version); request_key:=gen_random_uuid();
  result:=public.pos_food_command_v1(slug,host,waiter_session,'send',payload,request_key); ticket_one:=(result->>'ticketId')::uuid;
  replay:=public.pos_food_command_v1(slug,host,waiter_session,'send',payload,request_key);
  perform pg_temp.food_assert(result->>'ticketId'=replay->>'ticketId','double Send is same ticket');
  perform pg_temp.food_reject(slug,host,waiter_session,'send',payload,'POS_FOOD_CONFLICT');
  select c.version into version from public.pos_food_checks c where id=account;
  perform pg_temp.food_reject(slug,host,waiter_session,'send',jsonb_build_object('checkId',account,'version',version),'POS_FOOD_DRAFT_REQUIRED');
  perform pg_temp.food_reject(slug,host,waiter_session,'item_update',jsonb_build_object('checkId',account,'itemId',item_one,'version',1,'quantity',3),'POS_FOOD_CONFLICT');

  payload:=jsonb_build_object('checkId',account,'ticketId',ticket_one);
  perform pg_temp.food_reject(slug,host,waiter_session,'prepare',payload,'POS_FOOD_FORBIDDEN');
  perform pg_temp.food_reject(slug,host,kitchen_session,'ready',payload,'POS_FOOD_CONFLICT');
  perform public.pos_food_command_v1(slug,host,kitchen_session,'prepare',payload,gen_random_uuid());
  perform public.pos_food_command_v1(slug,host,kitchen_session,'ready',payload,gen_random_uuid());
  perform pg_temp.food_assert((select status='READY' and preparing_by=kitchen_id and ready_by=kitchen_id and preparing_at>=sent_at and ready_at>=preparing_at from public.pos_food_tickets where id=ticket_one),'KDS pending to preparing to ready with actors/times');
  perform pg_temp.food_reject(slug,host,kitchen_session,'serve',payload,'POS_FOOD_FORBIDDEN');
  perform public.pos_food_command_v1(slug,host,waiter_two_session,'serve',payload,gen_random_uuid());
  perform pg_temp.food_assert((select served_by=waiter_two and served_by<>sent_by and served_at>=ready_at from public.pos_food_tickets where id=ticket_one),'actual delivery operator differs from opening waiter');

  result:=public.pos_food_command_v1(slug,host,waiter_session,'item_add',jsonb_build_object('checkId',account,'variantId',cheesecake_variant,'quantity',1,'notes','Segundo envío'),gen_random_uuid());
  item_two:=(result->>'itemId')::uuid;
  -- Notes/quantity edits remain in audit; stale edits cannot overwrite another terminal.
  perform public.pos_food_command_v1(slug,host,waiter_two_session,'item_update',jsonb_build_object('checkId',account,'itemId',item_two,'version',0,'quantity',1,'notes','Leche deslactosada'),gen_random_uuid());
  perform pg_temp.food_reject(slug,host,waiter_session,'item_update',jsonb_build_object('checkId',account,'itemId',item_two,'version',0,'quantity',2),'POS_FOOD_CONFLICT');
  select c.version into version from public.pos_food_checks c where id=account;
  result:=public.pos_food_command_v1(slug,host,waiter_session,'send',jsonb_build_object('checkId',account,'version',version),gen_random_uuid()); ticket_two:=(result->>'ticketId')::uuid;
  perform pg_temp.food_assert(ticket_one<>ticket_two and (select count(*)=2 from public.pos_food_tickets where check_id=account),'second round creates separate ticket');
  perform pg_temp.food_assert((select ticket_id=ticket_one from public.pos_food_items where id=item_one) and (select ticket_id=ticket_two from public.pos_food_items where id=item_two),'second send never reassigns first round');
  payload:=jsonb_build_object('checkId',account,'ticketId',ticket_two);
  perform public.pos_food_command_v1(slug,host,kitchen_session,'prepare',payload,gen_random_uuid());
  perform public.pos_food_command_v1(slug,host,kitchen_session,'ready',payload,gen_random_uuid());
  perform public.pos_food_command_v1(slug,host,waiter_two_session,'serve',payload,gen_random_uuid());

  select c.version into version from public.pos_food_checks c where id=account;
  perform public.pos_food_command_v1(slug,host,waiter_session,'request_payment',jsonb_build_object('checkId',account,'version',version),gen_random_uuid());
  perform pg_temp.food_reject(slug,host,waiter_session,'item_add',jsonb_build_object('checkId',account,'variantId',variant,'quantity',1),'POS_FOOD_CONFLICT');
  select c.version into version from public.pos_food_checks c where id=account;
  payload:=jsonb_build_object('checkId',account,'version',version,'cashSessionId',cash,'method','cash');
  perform pg_temp.food_reject(slug,host,kitchen_session,'pay',payload,'POS_FOOD_FORBIDDEN');
  perform pg_temp.food_reject(slug,host,waiter_session,'pay',payload,'POS_FOOD_FORBIDDEN');
  update public.pos_product_variants set price=60 where id=variant;
  -- V4 recalculates the current catalog price; Food supplies the original total.
  -- This is the existing canonical payment contract, not a frozen-price promise.
  perform pg_temp.food_reject(slug,host,cashier_session,'pay',payload,'Los pagos aplicados no cubren el total de la venta.');
  perform pg_temp.food_assert((select status='PAYMENT_PENDING' and sale_id is null from public.pos_food_checks where id=account),'failed payment preserves open check and table');
  update public.pos_product_variants set price=50 where id=variant;
  request_key:=gen_random_uuid();
  result:=public.pos_food_command_v1(slug,host,cashier_session,'pay',payload,request_key); sale:=(result->>'saleId')::uuid;
  replay:=public.pos_food_command_v1(slug,host,cashier_session,'pay',payload,request_key);
  perform pg_temp.food_assert(result->>'saleId'=replay->>'saleId','double payment same request returns same sale');
  perform pg_temp.food_reject(slug,host,cashier_session,'pay',payload,'POS_FOOD_CONFLICT');
  perform pg_temp.food_assert((select status='CLOSED' and sale_id=sale and closed_by=cashier_staff and cashier_id=cashier_staff and closed_at is not null from public.pos_food_checks where id=account),'payment closes check with cashier audit');
  perform pg_temp.food_assert((select count(*)=1 and sum(amount)=290 from public.pos_payments where sale_id=sale),'canonical payment includes both rounds exactly once');
  perform pg_temp.food_assert((select cashier_staff_id=cashier_staff and total=290 from public.pos_sales where id=sale),'canonical sale traces cashier and reconciles tax total');
  perform pg_temp.food_assert((select count(*)=2 from public.pos_food_tickets where check_id=account) and (select count(*)=3 from public.pos_food_items where check_id=account),'service history survives checkout');
  perform pg_temp.food_assert((select count(*)=1 from public.pos_food_events where check_id=account and action='pay'),'payment audit is idempotent');
  snap:=public.pos_food_snapshot_v1(slug,host,admin_session,loc);
  perform pg_temp.food_assert(jsonb_array_length(snap->'checks')=0 and jsonb_array_length(snap->'tables')=1,'closed table is available in operational snapshot');
  perform public.pos_food_command_v1(slug,host,waiter_session,'open',jsonb_build_object('tableId',tbl,'guests',2),gen_random_uuid());
  perform pg_temp.food_assert((select count(*)=2 from public.pos_food_checks where table_id=tbl),'freed table accepts a new account, old account retained');
  snap:=public.pos_food_snapshot_v1(other_slug,host,foreign_session,other_loc);
  perform pg_temp.food_assert(jsonb_array_length(snap->'checks')=0 and jsonb_array_length(snap->'tables')=1,'coffee shop snapshot never includes other brand');

  -- Real RPC lifecycle: direct stock 1/2 and none with a sentinel inventory row.
  -- Every scenario retries SEND and PAY using exactly the original request key.
  for stock_case in 1..3 loop
    initial_stock:=case stock_case when 1 then 1 when 2 then 2 else 7 end;
    stock_product:=gen_random_uuid(); stock_variant:=gen_random_uuid(); stock_inventory:=gen_random_uuid();
    insert into public.pos_products(id,brand_id,brand_slug,name,track_inventory,inventory_mode,tax_rate)
      values(stock_product,b::text,slug,'Inventory case '||stock_case,stock_case<>3,case when stock_case=3 then 'none' else 'direct' end,0);
    insert into public.pos_product_variants(id,brand_id,brand_slug,product_id,name,price,variant_signature)
      values(stock_variant,b::text,slug,stock_product,'Regular',10,'{}');
    insert into public.pos_inventory(id,brand_id,brand_slug,location_id,variant_id,quantity)
      values(stock_inventory,b::text,slug,loc,stock_variant,initial_stock);
    result:=public.pos_food_command_v1(slug,host,admin_session,'table_create',jsonb_build_object('locationId',loc,'name','Stock case '||stock_case),gen_random_uuid());
    stock_table:=(result->>'tableId')::uuid;
    result:=public.pos_food_command_v1(slug,host,waiter_session,'open',jsonb_build_object('tableId',stock_table,'guests',1),gen_random_uuid());
    stock_account:=(result->>'checkId')::uuid;
    perform public.pos_food_command_v1(slug,host,waiter_session,'item_add',jsonb_build_object('checkId',stock_account,'variantId',stock_variant,'quantity',1),gen_random_uuid());
    select c.version into version from public.pos_food_checks c where id=stock_account;
    payload:=jsonb_build_object('checkId',stock_account,'version',version); send_key:=gen_random_uuid();
    result:=public.pos_food_command_v1(slug,host,waiter_session,'send',payload,send_key);
    stock_ticket:=(result->>'ticketId')::uuid;
    replay:=public.pos_food_command_v1(slug,host,waiter_session,'send',payload,send_key);
    perform pg_temp.food_assert(result->>'ticketId'=replay->>'ticketId' and (replay->>'replayed')::boolean,'CASE 3 SEND replay returns same ticket, stock case '||stock_case);
    perform pg_temp.food_assert((select quantity=initial_stock from public.pos_inventory where id=stock_inventory)
      and not exists(select 1 from public.pos_inventory_movements where variant_id=stock_variant)
      and not exists(select 1 from public.pos_food_items where check_id=stock_account and inventory_committed_at is not null),
      'CASE 3 SEND and retry never consume or commit stock, stock case '||stock_case);
    perform pg_temp.food_assert((select count(*)=1 from public.pos_food_tickets where check_id=stock_account)
      and (select count(*)=1 from public.pos_food_events where check_id=stock_account and action='send'),
      'CASE 3 SEND retry creates one ticket and audit event, stock case '||stock_case);
    payload:=jsonb_build_object('checkId',stock_account,'ticketId',stock_ticket);
    perform public.pos_food_command_v1(slug,host,kitchen_session,'prepare',payload,gen_random_uuid());
    perform public.pos_food_command_v1(slug,host,kitchen_session,'ready',payload,gen_random_uuid());
    perform public.pos_food_command_v1(slug,host,waiter_session,'serve',payload,gen_random_uuid());
    perform pg_temp.food_assert((select quantity=initial_stock from public.pos_inventory where id=stock_inventory),'served but unpaid stock remains unchanged, stock case '||stock_case);
    select c.version into version from public.pos_food_checks c where id=stock_account;
    perform public.pos_food_command_v1(slug,host,waiter_session,'request_payment',jsonb_build_object('checkId',stock_account,'version',version),gen_random_uuid());
    select c.version into version from public.pos_food_checks c where id=stock_account;
    payload:=jsonb_build_object('checkId',stock_account,'version',version,'cashSessionId',cash,'method','cash'); pay_key:=gen_random_uuid();
    select count(*) into sales_before from public.pos_sales where brand_slug=slug;
    result:=public.pos_food_command_v1(slug,host,cashier_session,'pay',payload,pay_key); sale:=(result->>'saleId')::uuid;
    replay:=public.pos_food_command_v1(slug,host,cashier_session,'pay',payload,pay_key);
    perform pg_temp.food_reject(slug,host,cashier_session,'pay',payload,'POS_FOOD_CONFLICT');
    perform pg_temp.food_assert(result->>'saleId'=replay->>'saleId' and (replay->>'replayed')::boolean
      and (select count(*)=sales_before+1 from public.pos_sales where brand_slug=slug),
      'CASE 4 PAY retries produce exactly one sale, stock case '||stock_case);
    perform pg_temp.food_assert((select quantity=initial_stock-case when stock_case=3 then 0 else 1 end from public.pos_inventory where id=stock_inventory),
      case stock_case when 1 then 'CASE 1 stock 1 -> 0' when 2 then 'CASE 2 stock 2 -> 1' else 'CASE 5 none inventory unchanged' end);
    perform pg_temp.food_assert((select status='CLOSED' and sale_id=sale and cashier_id=cashier_staff from public.pos_food_checks where id=stock_account)
      and (select total=10 and cashier_staff_id=cashier_staff from public.pos_sales where id=sale)
      and (select count(*)=1 and sum(amount)=10 from public.pos_payments where sale_id=sale),
      'completed sale, payment and closed account, stock case '||stock_case);
    snap:=public.pos_food_snapshot_v1(slug,host,admin_session,loc);
    perform pg_temp.food_assert(not exists(select 1 from jsonb_array_elements(snap->'checks') c where (c->>'table_id')::uuid=stock_table)
      and exists(select 1 from jsonb_array_elements(snap->'tables') t where (t->>'id')::uuid=stock_table),
      'table released after checkout, stock case '||stock_case);
    perform pg_temp.food_assert((select count(*)=1 from public.pos_food_events where check_id=stock_account and action='pay')
      and (select count(*)=1 from public.pos_staff_audit_events where entity_id=sale and action='SALE_CHARGE'),
      'CASE 4 checkout replay preserves one Food and staff audit event, stock case '||stock_case);
    if stock_case=3 then
      perform pg_temp.food_assert(not exists(select 1 from public.pos_inventory_movements where variant_id=stock_variant)
        and not exists(select 1 from public.pos_food_items where check_id=stock_account and inventory_committed_at is not null),
        'CASE 5 none has no stock movement or commitment timestamp');
    else
      perform pg_temp.food_assert((select count(*)=1 and sum(quantity_delta)=-1 and min(quantity_before)=initial_stock and min(quantity_after)=initial_stock-1
        from public.pos_inventory_movements where variant_id=stock_variant and reference_type='sale' and reference_id=sale)
        and (select count(*)=1 from public.pos_inventory_movements where variant_id=stock_variant)
        and (select count(*)=1 from public.pos_food_items where check_id=stock_account and inventory_committed_at is not null),
        'CASE 4 exactly one canonical stock movement and checkout timestamp, stock case '||stock_case);
    end if;
    if stock_case=2 then
      -- Compatibility regression: the untouched Retail V4 path still consumes once.
      retail_key:=gen_random_uuid();
      payload:=jsonb_build_array(jsonb_build_object('variant_id',stock_variant,'quantity',1,'discount_amount',0));
      result:=public.pos_complete_sale_v4(slug,loc,reg,cash,null,payload,jsonb_build_array(jsonb_build_object('method','cash','amount',10,'tendered_amount',10)),null,host,null,retail_key,null);
      replay:=public.pos_complete_sale_v4(slug,loc,reg,cash,null,payload,jsonb_build_array(jsonb_build_object('method','cash','amount',10,'tendered_amount',10)),null,host,null,retail_key,null);
      perform pg_temp.food_assert(result->>'id'=replay->>'id' and (select quantity=0 from public.pos_inventory where id=stock_inventory)
        and (select count(*)=2 and sum(quantity_delta)=-2 from public.pos_inventory_movements where variant_id=stock_variant),
        'Retail V4 and its replay still consume exactly once');
    end if;
  end loop;
  update public.pos_business_profiles set profile_code='retail' where brand_slug=other_slug;
  perform pg_temp.food_reject(other_slug,host,foreign_session,'open',jsonb_build_object('tableId',foreign_table,'guests',2),'POS_FOOD_FORBIDDEN');
  update public.pos_staff_sessions set revoked_at=now() where id=waiter_session;
  perform pg_temp.food_reject(slug,host,waiter_session,'open',jsonb_build_object('tableId',tbl,'guests',2),'POS_FOOD_SESSION_REQUIRED');
  raise notice 'PASS Food Operations V1 integration suite';
end $$;
rollback;
