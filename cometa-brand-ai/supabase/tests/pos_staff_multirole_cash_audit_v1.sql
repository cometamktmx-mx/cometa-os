-- Local disposable database only. Behavioral Split & Payments V1 tests.
begin;

-- Test-only fixture; the production repository has no verified canonical row.
insert into public.pos_units(code,name,symbol,unit_type)
values('piece','Piece','pc','count')
on conflict (code) do nothing;

create temp table split_context(
  brand uuid, slug text, location uuid, register uuid, cash uuid, host uuid,
  cashier uuid, cashier_session uuid, admin uuid, admin_session uuid
) on commit drop;

create or replace function pg_temp.split_assert(condition boolean, label text) returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception 'FAIL: %',label; end if;
  raise notice 'PASS: %',label;
end $$;

-- Main certification is appended after fixture function definitions.

create or replace function pg_temp.split_reject(payload jsonb, key uuid, expected text) returns void language plpgsql as $$
declare c record;
begin
  select * into c from split_context limit 1;
  begin
    perform public.pos_food_payment_command_v1(c.slug,c.host,c.cashier_session,payload,key);
    raise exception 'FAIL expected rejection: %',expected;
  exception when others then
    if sqlerrm=expected then raise notice 'PASS rejected: %',expected; else raise; end if;
  end;
end $$;

create or replace function pg_temp.split_make_case(case_total numeric, quantity numeric default 1, tracked boolean default false) returns jsonb language plpgsql as $$
declare c record; product uuid:=gen_random_uuid(); variant uuid:=gen_random_uuid(); inventory uuid:=gen_random_uuid(); tbl uuid:=gen_random_uuid(); account uuid:=gen_random_uuid(); ticket uuid:=gen_random_uuid(); item uuid:=gen_random_uuid(); now_at timestamptz:=clock_timestamp();
begin
  select * into c from split_context limit 1;
  insert into public.pos_products(id,brand_id,brand_slug,name,track_inventory,inventory_mode,tax_rate) values(product,c.brand::text,c.slug,'Split product',tracked,case when tracked then 'direct' else 'none' end,0);
  insert into public.pos_product_variants(id,brand_id,brand_slug,product_id,name,price,variant_signature) values(variant,c.brand::text,c.slug,product,'Regular',round(case_total/quantity,2),'{}');
  if tracked then insert into public.pos_inventory(id,brand_id,brand_slug,location_id,variant_id,quantity) values(inventory,c.brand::text,c.slug,c.location,variant,10); end if;
  insert into public.pos_food_tables(id,brand_id,brand_slug,location_id,name) values(tbl,c.brand,c.slug,c.location,'Split '||replace(tbl::text,'-',''));
  insert into public.pos_food_checks(id,brand_id,brand_slug,location_id,table_id,status,guests,currency,prices_include_tax,opened_by,payment_requested_at,payment_requested_by)
    values(account,c.brand,c.slug,c.location,tbl,'PAYMENT_PENDING',1,'MXN',false,c.admin,now_at,c.admin);
  insert into public.pos_food_tickets(id,brand_slug,brand_id,check_id,sequence,status,sent_at,sent_by,preparing_at,preparing_by,ready_at,ready_by,served_at,served_by)
    values(ticket,c.slug,c.brand,account,1,'READY',now_at,c.admin,now_at,c.admin,now_at,c.admin,now_at,c.admin);
  insert into public.pos_food_items(id,brand_slug,check_id,brand_id,ticket_id,variant_id,product_id,unit_code,unit_cost,track_inventory,product_name,variant_name,quantity,unit_price,tax_rate,subtotal,tax_amount,line_total,configuration,created_by,updated_by)
    values(item,c.slug,account,c.brand,ticket,variant,product,'piece',0,tracked,'Split product','Regular',quantity,round(case_total/quantity,2),0,case_total,0,case_total,jsonb_build_object('modifiers','[]'::jsonb),c.admin,c.admin);
  return jsonb_build_object('check',account,'item',item,'variant',variant,'table',tbl,'inventory',inventory);
end $$;

create or replace function pg_temp.split_make_multi_case() returns jsonb language plpgsql as $$
declare c record; p1 uuid:=gen_random_uuid(); p2 uuid:=gen_random_uuid(); p3 uuid:=gen_random_uuid(); v1 uuid:=gen_random_uuid(); v2 uuid:=gen_random_uuid(); v3 uuid:=gen_random_uuid(); i1 uuid:=gen_random_uuid(); i2 uuid:=gen_random_uuid(); i3 uuid:=gen_random_uuid(); tbl uuid:=gen_random_uuid(); account uuid:=gen_random_uuid(); ticket uuid:=gen_random_uuid(); now_at timestamptz:=clock_timestamp();
begin
  select * into c from split_context limit 1;
  insert into public.pos_products(id,brand_id,brand_slug,name,track_inventory,inventory_mode,tax_rate) values
    (p1,c.brand::text,c.slug,'Capuchino',false,'none',0),(p2,c.brand::text,c.slug,'Croissant',false,'none',0),(p3,c.brand::text,c.slug,'Latte',false,'none',0);
  insert into public.pos_product_variants(id,brand_id,brand_slug,product_id,name,price,variant_signature) values
    (v1,c.brand::text,c.slug,p1,'Regular',85,'{}'),(v2,c.brand::text,c.slug,p2,'Regular',55,'{}'),(v3,c.brand::text,c.slug,p3,'Regular',60,'{}');
  insert into public.pos_food_tables(id,brand_id,brand_slug,location_id,name) values(tbl,c.brand,c.slug,c.location,'Multi split');
  insert into public.pos_food_checks(id,brand_id,brand_slug,location_id,table_id,status,guests,currency,prices_include_tax,opened_by,payment_requested_at,payment_requested_by) values(account,c.brand,c.slug,c.location,tbl,'PAYMENT_PENDING',1,'MXN',false,c.admin,now_at,c.admin);
  insert into public.pos_food_tickets(id,brand_slug,brand_id,check_id,sequence,status,sent_at,sent_by,preparing_at,preparing_by,ready_at,ready_by,served_at,served_by) values(ticket,c.slug,c.brand,account,1,'READY',now_at,c.admin,now_at,c.admin,now_at,c.admin,now_at,c.admin);
  insert into public.pos_food_items(id,brand_slug,check_id,brand_id,ticket_id,variant_id,product_id,unit_code,unit_cost,track_inventory,product_name,variant_name,quantity,unit_price,tax_rate,subtotal,tax_amount,line_total,configuration,created_by,updated_by) values
    (i1,c.slug,account,c.brand,ticket,v1,p1,'piece',0,false,'Capuchino','Regular',1,85,0,85,0,85,jsonb_build_object('modifiers','[]'::jsonb),c.admin,c.admin),
    (i2,c.slug,account,c.brand,ticket,v2,p2,'piece',0,false,'Croissant','Regular',1,55,0,55,0,55,jsonb_build_object('modifiers','[]'::jsonb),c.admin,c.admin),
    (i3,c.slug,account,c.brand,ticket,v3,p3,'piece',0,false,'Latte','Regular',1,60,0,60,0,60,jsonb_build_object('modifiers','[]'::jsonb),c.admin,c.admin);
  return jsonb_build_object('check',account,'item1',i1,'item2',i2,'item3',i3);
end $$;


do $$
declare
  host uuid:=gen_random_uuid(); brand uuid:=gen_random_uuid(); slug text:='roles-'||gen_random_uuid()::text;
  location uuid:=gen_random_uuid(); register uuid:=gen_random_uuid(); register2 uuid:=gen_random_uuid();
  admin uuid:=gen_random_uuid(); admin_session uuid:=gen_random_uuid(); cashier uuid:=gen_random_uuid(); cashier_session uuid:=gen_random_uuid();
  maria uuid:=gen_random_uuid(); maria_session uuid:=gen_random_uuid(); kitchen uuid:=gen_random_uuid(); kitchen_session uuid:=gen_random_uuid();
  cash uuid; cash2 uuid; result jsonb; initial jsonb; account jsonb; payment_key uuid:=gen_random_uuid();
  open_key uuid:=gen_random_uuid(); close_key uuid:=gen_random_uuid(); movement_key uuid:=gen_random_uuid(); adjustment_key uuid:=gen_random_uuid();
  payload jsonb; count_before integer; old_expected numeric; auth uuid:=gen_random_uuid(); history jsonb; missing uuid:=gen_random_uuid();
begin
  insert into auth.users(id) values(host);
  insert into public.brands(id,slug,name) values(brand,slug,'Multi-role local fixture');
  insert into public.pos_business_profiles(brand_id,brand_slug,profile_code) values(brand::text,slug,'restaurant');
  insert into public.pos_locations(id,brand_id,brand_slug,name,code,currency,prices_include_tax) values(location,brand::text,slug,'Centro','CENTRO','MXN',false);
  insert into public.pos_registers(id,brand_id,brand_slug,location_id,name,code) values(register,brand::text,slug,location,'Caja 1','C1'),(register2,brand::text,slug,location,'Caja 2','C2');
  insert into public.pos_staff(id,brand_id,brand_slug,location_id,name,role,pin_hash) values
  (admin,brand::text,slug,location,'Due?o','ADMIN','test'),(cashier,brand::text,slug,location,'Juan','WAITER','test'),(maria,brand::text,slug,location,'Mar?a','CASHIER','test'),(kitchen,brand::text,slug,location,'Cocina','KITCHEN','test');
  insert into public.pos_staff_sessions(id,token_hash,host_user_id,staff_id,brand_id,brand_slug,location_id,expires_at) values
  (admin_session,encode(extensions.digest(admin::text,'sha256'),'hex'),host,admin,brand::text,slug,location,now()+interval '1 hour'),
  (cashier_session,encode(extensions.digest(cashier::text,'sha256'),'hex'),host,cashier,brand::text,slug,location,now()+interval '1 hour'),
  (maria_session,encode(extensions.digest(maria::text,'sha256'),'hex'),host,maria,brand::text,slug,location,now()+interval '1 hour'),
  (kitchen_session,encode(extensions.digest(kitchen::text,'sha256'),'hex'),host,kitchen,brand::text,slug,location,now()+interval '1 hour');
  perform pg_temp.split_assert(public.pos_staff_has_any_role_v1(cashier,slug,array['WAITER']) and not public.pos_staff_has_any_role_v1(cashier,slug,array['CASHIER','KITCHEN']),'A WAITER only');
  perform pg_temp.split_assert(public.pos_staff_has_any_role_v1(kitchen,slug,array['KITCHEN']) and not public.pos_staff_has_any_role_v1(kitchen,slug,array['CASHIER','WAITER']),'B KITCHEN only');
  perform pg_temp.split_assert(public.pos_staff_has_any_role_v1(maria,slug,array['CASHIER']) and not public.pos_staff_has_any_role_v1(maria,slug,array['KITCHEN','WAITER']),'C CASHIER only');
  perform public.pos_staff_save_v2(slug,host,admin_session,cashier,'{}',array['WAITER','KITCHEN','CASHIER']);
  perform pg_temp.split_assert((select count(*)=3 from public.pos_staff_roles where staff_id=cashier and active),'D three roles one identity');
  perform pg_temp.split_assert(not public.pos_staff_has_any_role_v1(cashier,slug,array['ADMIN','MANAGER']),'E no implicit admin');
  perform pg_temp.split_assert((select count(*)=1 and bool_and(revoked_at is null) from public.pos_staff_sessions where staff_id=cashier),'F same PIN session after role assignment');
  payload:=jsonb_build_object('registerId',register,'openingAmount',1000);
  initial:=public.pos_cash_command_v2(slug,host,cashier_session,'open',payload,open_key); cash:=(initial->>'id')::uuid;
  result:=public.pos_cash_command_v2(slug,host,cashier_session,'open',payload,open_key);
  perform pg_temp.split_assert(result=initial and result->>'opening_staff_id'=cashier::text,'G opener and opening retry');
  result:=public.pos_cash_command_v2(slug,host,maria_session,'open',jsonb_build_object('registerId',register2,'openingAmount',0),gen_random_uuid()); cash2:=(result->>'id')::uuid;
  insert into split_context values(brand,slug,location,register,cash,host,cashier,cashier_session,admin,admin_session);
  account:=pg_temp.split_make_case(250);
  payload:=jsonb_build_object('checkId',account->>'check','cashSessionId',cash,'method','cash','amount',100,'amountReceived',100);
  initial:=public.pos_food_payment_command_v1(slug,host,cashier_session,payload,payment_key);
  perform public.pos_food_payment_command_v1(slug,host,cashier_session,payload,payment_key);
  perform pg_temp.split_assert((select cashier_staff_id=cashier and cash_session_id=cash from public.pos_food_payments where request_key=payment_key),'H collector and original session');
  perform pg_temp.split_assert((select cash_sales=100 and expected_cash=1100 from public.pos_get_cash_session_summaries_v1(slug,array[cash],true)),'S pending partial counts before consolidation');
  payload:=jsonb_build_object('sessionId',cash,'movementType','withdrawal','amount',50,'reason','Pago proveedor','adjustment',false);
  perform public.pos_cash_command_v2(slug,host,cashier_session,'movement',payload,movement_key);
  perform public.pos_cash_command_v2(slug,host,cashier_session,'movement',payload,movement_key);
  perform pg_temp.split_assert((select count(*)=1 and bool_and(performed_by_staff_id=cashier and reason='Pago proveedor' and cash_session_id=cash) from public.pos_cash_movements where request_key=movement_key),'K cash out actor/reason/session + retry');
  insert into public.pos_staff_authorizations(id,token_hash,brand_id,brand_slug,location_id,requested_by_staff_id,authorized_by_staff_id,host_user_id,action,entity_type,entity_id,expires_at)
  values(auth,repeat('c',64),brand::text,slug,location,cashier,admin,host,'CASH_ADJUSTMENT','cash_session',cash,now()+interval '1 minute');
  payload:=jsonb_build_object('sessionId',cash,'movementType','income','amount',10,'reason','Correcci?n autorizada','adjustment',true);
  perform public.pos_cash_command_v2(slug,host,cashier_session,'movement',payload,adjustment_key,repeat('c',64));
  perform public.pos_cash_command_v2(slug,host,cashier_session,'movement',payload,adjustment_key,repeat('c',64));
  perform pg_temp.split_assert((select performed_by_staff_id=cashier and authorized_by_staff_id=admin and performed_by_staff_id<>authorized_by_staff_id from public.pos_cash_movements where request_key=adjustment_key),'N performed_by differs from authorized_by');
  perform pg_temp.split_assert((select consumed_at is not null from public.pos_staff_authorizations where id=auth),'N authorization consumed transactionally');
  payload:=jsonb_build_object('sessionId',cash,'countedCash',1040,'notes','Faltante de veinte');
  initial:=public.pos_cash_command_v2(slug,host,cashier_session,'close',payload,close_key);
  result:=public.pos_cash_command_v2(slug,host,cashier_session,'close',payload,close_key);
  perform pg_temp.split_assert(result=initial and result->>'closed_by_staff_id'=cashier::text and (result->>'expected_cash')::numeric=1060 and (result->>'difference')::numeric=-20,'L closure actor / S own partial + movements + opening');
  perform pg_temp.split_assert((select count(*)=1 and min(amount)=-20 from public.pos_staff_audit_events where request_key=close_key and action='CASH_DIFFERENCE'),'M difference audited once');
  perform public.pos_food_payment_command_v1(slug,host,maria_session,jsonb_build_object('checkId',account->>'check','cashSessionId',cash2,'method','card','amount',150,'reference','CARD150'),gen_random_uuid());
  perform pg_temp.split_assert((select count(distinct cashier_staff_id)=2 and count(distinct cash_session_id)=2 and sum(amount)=250 from public.pos_food_payments where check_id=(account->>'check')::uuid),'I/J two collectors and two original cash sessions');
  perform pg_temp.split_assert((select expected_cash=1060 and difference=-20 from public.pos_cash_sessions where id=cash),'S finalization does not change closed cash 1');
  perform pg_temp.split_assert((select cash_sales=0 and card_sales=150 and expected_cash=0 from public.pos_get_cash_session_summaries_v1(slug,array[cash2],true)),'S cash 2 contains only its card receipt');
  perform pg_temp.split_assert((select cashier_staff_id=maria and served_by_staff_id=admin from public.pos_sales where id=(select sale_id from public.pos_food_checks where id=(account->>'check')::uuid)),'H final cashier differs from original collectors');
  result:=public.pos_cash_command_v2(slug,host,maria_session,'close',jsonb_build_object('sessionId',cash2,'countedCash',0),gen_random_uuid());
  perform pg_temp.split_assert((result->>'difference')::numeric=0,'S cash 2 closes balanced');
  update public.pos_staff_roles set active=false where staff_id=cashier and role='WAITER';
  perform pg_temp.split_assert(not public.pos_staff_has_any_role_v1(cashier,slug,array['WAITER']) and public.pos_staff_has_any_role_v1(cashier,slug,array['CASHIER']) and (select role='WAITER' from public.pos_staff where id=cashier),'P inactive historical role stays revoked with existing session');
  begin perform public.pos_food_command_v1(slug,host,cashier_session,'open',jsonb_build_object('tableId',account->>'table','guests',1),gen_random_uuid()); raise exception 'FAIL P revoked role allowed'; exception when others then if sqlerrm='FAIL P revoked role allowed' or sqlerrm not like '%POS_FOOD_FORBIDDEN%' then raise; end if; end;
  perform pg_temp.split_assert(not public.pos_staff_has_any_role_v1(cashier,'other-brand',array['CASHIER']),'O cross-brand role rejected');
  begin insert into public.pos_staff_roles(staff_id,brand_slug,role) values(cashier,'other-brand','ADMIN'); raise exception 'FAIL O cross-brand assignment'; exception when foreign_key_violation then null; end;
  history:=public.pos_cash_history_v1(slug,host,admin_session,cash);
  perform pg_temp.split_assert(exists(select 1 from jsonb_array_elements(history) e where e->>'actor_name'='Juan' and e->>'action'='PARTIAL_PAYMENT_COLLECTED'),'history real collector visible');
  perform pg_temp.split_assert((select count(*)=1 from public.pos_staff_audit_events where request_key=open_key and action='CASH_SESSION_OPEN') and (select count(*)=1 from public.pos_food_events where request_key=payment_key),'R sensitive audit retries exactly once');
  update public.pos_business_profiles set profile_code='retail' where brand_slug=slug;
  perform pg_temp.split_assert(public.pos_staff_has_any_role_v1(cashier,slug,array['WAITER']) and not public.pos_staff_has_any_role_v1(cashier,slug,array['CASHIER']),'Q Retail still uses historical role');
end $$;
rollback;
