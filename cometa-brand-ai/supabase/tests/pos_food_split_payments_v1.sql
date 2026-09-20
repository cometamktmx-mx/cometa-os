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
  host uuid:=gen_random_uuid(); brand uuid:=gen_random_uuid();
  slug text:='split-test-'||replace(gen_random_uuid()::text,'-','');
  location uuid:=gen_random_uuid(); register uuid:=gen_random_uuid(); cash uuid:=gen_random_uuid();
  cashier uuid:=gen_random_uuid(); admin uuid:=gen_random_uuid(); cashier_session uuid:=gen_random_uuid(); admin_session uuid:=gen_random_uuid();
  result jsonb; first jsonb; snap jsonb; payment_id uuid; i integer; part numeric; total_parts numeric:=0;
  case_b jsonb; case_c jsonb; case_f jsonb; case_g jsonb; case_h jsonb; case_i jsonb; case_j jsonb; case_m jsonb; case_p jsonb; case_q jsonb; case_d jsonb; case_s jsonb; resume_case jsonb; cross_a jsonb; cross_b jsonb;
  retry_key uuid;
  other_brand uuid:=gen_random_uuid(); other_location uuid:=gen_random_uuid(); other_admin uuid:=gen_random_uuid(); other_product uuid:=gen_random_uuid(); other_variant uuid:=gen_random_uuid(); other_table uuid:=gen_random_uuid(); other_check uuid:=gen_random_uuid(); other_ticket uuid:=gen_random_uuid(); other_item uuid:=gen_random_uuid();
begin
  insert into auth.users(id) values(host);
  insert into public.brands(id,slug,name) values(brand,slug,'Split fixture');
  insert into public.pos_business_profiles(brand_id,brand_slug,profile_code) values(brand::text,slug,'restaurant');
  insert into public.pos_locations(id,brand_id,brand_slug,name,code,currency,prices_include_tax) values(location,brand::text,slug,'Split location','SPLIT','MXN',false);
  insert into public.pos_registers(id,brand_id,brand_slug,location_id,name,code) values(register,brand::text,slug,location,'Split register','SPLIT');
  insert into public.pos_cash_sessions(id,brand_id,brand_slug,location_id,register_id,opened_by,opening_amount) values(cash,brand::text,slug,location,register,host,0);
  insert into public.pos_staff(id,brand_id,brand_slug,location_id,name,role,pin_hash) values
    (admin,brand::text,slug,location,'Split admin','ADMIN','synthetic-not-a-login'),(cashier,brand::text,slug,location,'Split cashier','CASHIER','synthetic-not-a-login');
  insert into public.pos_staff_sessions(id,token_hash,host_user_id,staff_id,brand_id,brand_slug,location_id,expires_at) values
    (cashier_session,repeat('a',64),host,cashier,brand::text,slug,location,now()+interval '1 hour'),
    (admin_session,repeat('b',64),host,admin,brand::text,slug,location,now()+interval '1 hour');
  insert into split_context values(brand,slug,location,register,cash,host,cashier,cashier_session,admin,admin_session);

  -- B/D/P: two partials, cash ledger and remaining balance.
  case_b:=pg_temp.split_make_case(300);
  perform public.pos_food_payment_command_v1(slug,host,cashier_session,jsonb_build_object('checkId',case_b->>'check','cashSessionId',cash,'method','cash','amount',100,'amountReceived',100),gen_random_uuid());
  perform pg_temp.split_assert((select count(*)=1 and sum(amount)=100 from public.pos_food_payments where check_id=(case_b->>'check')::uuid),'B first partial ledger');
  perform pg_temp.split_assert((select status='PAYMENT_PENDING' and sale_id is null and closed_at is null from public.pos_food_checks where id=(case_b->>'check')::uuid),'D partial keeps check open');
  perform pg_temp.split_assert((select count(*)=0 from public.pos_sales where id in (select sale_id from public.pos_food_checks where id=(case_b->>'check')::uuid)),'D partial has no sale');
  perform pg_temp.split_assert((select amount=100 and amount_received=100 and change_amount=0 from public.pos_food_payments where check_id=(case_b->>'check')::uuid),'P exact cash persisted');
  perform public.pos_food_payment_command_v1(slug,host,cashier_session,jsonb_build_object('checkId',case_b->>'check','cashSessionId',cash,'method','card','amount',200,'reference','CARD-200'),gen_random_uuid());
  perform pg_temp.split_assert((select count(*)=2 and sum(amount)=300 from public.pos_food_payments where check_id=(case_b->>'check')::uuid),'B two partials total');
  perform pg_temp.split_assert((select status='CLOSED' and sale_id is not null from public.pos_food_checks where id=(case_b->>'check')::uuid),'B final closes');
  perform pg_temp.split_assert((select count(*)=1 from public.pos_sales where id=(select sale_id from public.pos_food_checks where id=(case_b->>'check')::uuid)),'B one canonical sale');
  perform pg_temp.split_assert((select count(*)=2 from public.pos_payments where sale_id=(select sale_id from public.pos_food_checks where id=(case_b->>'check')::uuid)),'B canonical payments');

  -- C: three methods, closing only on the third payment.
  case_c:=pg_temp.split_make_case(300);
  perform public.pos_food_payment_command_v1(slug,host,cashier_session,jsonb_build_object('checkId',case_c->>'check','cashSessionId',cash,'method','cash','amount',100,'amountReceived',100),gen_random_uuid());
  perform public.pos_food_payment_command_v1(slug,host,cashier_session,jsonb_build_object('checkId',case_c->>'check','cashSessionId',cash,'method','card','amount',150,'reference','CARD-150'),gen_random_uuid());
  perform pg_temp.split_assert((select status='PAYMENT_PENDING' and sale_id is null from public.pos_food_checks where id=(case_c->>'check')::uuid),'C remains pending after two');
  perform public.pos_food_payment_command_v1(slug,host,cashier_session,jsonb_build_object('checkId',case_c->>'check','cashSessionId',cash,'method','other','amount',50,'reference','VALE-50'),gen_random_uuid());
  perform pg_temp.split_assert((select count(*)=3 and count(*) filter(where method='other')=1 and max(reference)='VALE-50' from public.pos_food_payments where check_id=(case_c->>'check')::uuid),'C methods preserved');
  perform pg_temp.split_assert((select count(*)=1 from public.pos_sales where id=(select sale_id from public.pos_food_checks where id=(case_c->>'check')::uuid)) and (select count(*)=3 from public.pos_payments where sale_id=(select sale_id from public.pos_food_checks where id=(case_c->>'check')::uuid)),'C one sale and three canonical payments');

  -- F/G/H: exact-cent divisions.
  case_f:=pg_temp.split_make_case(200);
  perform public.pos_food_payment_command_v1(slug,host,cashier_session,jsonb_build_object('checkId',case_f->>'check','cashSessionId',cash,'method','cash','amount',100,'amountReceived',100),gen_random_uuid());
  perform public.pos_food_payment_command_v1(slug,host,cashier_session,jsonb_build_object('checkId',case_f->>'check','cashSessionId',cash,'method','cash','amount',100,'amountReceived',100),gen_random_uuid());
  perform pg_temp.split_assert((select status='CLOSED' from public.pos_food_checks where id=(case_f->>'check')::uuid),'F equal two closes');
  case_g:=pg_temp.split_make_case(100);
  foreach part in array array[33.34::numeric,33.33::numeric,33.33::numeric] loop
    perform public.pos_food_payment_command_v1(slug,host,cashier_session,jsonb_build_object('checkId',case_g->>'check','cashSessionId',cash,'method','other','amount',part,'reference','G-'||part::text),gen_random_uuid()); total_parts:=total_parts+part;
  end loop;
  perform pg_temp.split_assert(total_parts=100 and (select status='CLOSED' from public.pos_food_checks where id=(case_g->>'check')::uuid),'G exact cents'); total_parts:=0;
  case_h:=pg_temp.split_make_case(100);
  for i in 1..7 loop part:=case when i<=4 then 14.29 else 14.28 end; perform public.pos_food_payment_command_v1(slug,host,cashier_session,jsonb_build_object('checkId',case_h->>'check','cashSessionId',cash,'method','other','amount',part,'reference','H-'||i),gen_random_uuid()); total_parts:=total_parts+part; end loop;
  perform pg_temp.split_assert(total_parts=100 and (select count(*)=7 from public.pos_food_payments where check_id=(case_h->>'check')::uuid) and (select status='CLOSED' from public.pos_food_checks where id=(case_h->>'check')::uuid),'H custom seven parts'); total_parts:=0;

  -- J/L: pay one of two units, reject over-allocation, then pay the last unit.
  case_i:=pg_temp.split_make_multi_case();
  perform public.pos_food_payment_command_v1(slug,host,cashier_session,jsonb_build_object('checkId',case_i->>'check','cashSessionId',cash,'method','cash','amount',85,'amountReceived',85,'allocations',jsonb_build_array(jsonb_build_object('foodItemId',case_i->>'item1','quantity',1))),gen_random_uuid());
  perform pg_temp.split_assert((select amount=85 from public.pos_food_payments where check_id=(case_i->>'check')::uuid) and (select amount=85 from public.pos_food_payment_allocations where check_id=(case_i->>'check')::uuid and food_item_id=(case_i->>'item1')::uuid),'I Capuchino allocation');
  perform pg_temp.split_assert((select status='PAYMENT_PENDING' and sale_id is null from public.pos_food_checks where id=(case_i->>'check')::uuid),'I other items remain pending');
  perform public.pos_food_payment_command_v1(slug,host,cashier_session,jsonb_build_object('checkId',case_i->>'check','cashSessionId',cash,'method','other','amount',115,'reference','I-REST'),gen_random_uuid());
  perform pg_temp.split_assert((select status='CLOSED' and sale_id is not null from public.pos_food_checks where id=(case_i->>'check')::uuid),'I remaining items close');

  case_j:=pg_temp.split_make_case(200,2);
  perform public.pos_food_payment_command_v1(slug,host,cashier_session,jsonb_build_object('checkId',case_j->>'check','cashSessionId',cash,'method','cash','amount',100,'amountReceived',100,'allocations',jsonb_build_array(jsonb_build_object('foodItemId',case_j->>'item','quantity',1))),gen_random_uuid());
  perform pg_temp.split_assert((select sum(quantity)=1 from public.pos_food_payment_allocations where food_item_id=(case_j->>'item')::uuid),'J one unit allocated');
  perform pg_temp.split_reject(jsonb_build_object('checkId',case_j->>'check','cashSessionId',cash,'method','cash','amount',100,'amountReceived',100,'allocations',jsonb_build_array(jsonb_build_object('foodItemId',case_j->>'item','quantity',2))),gen_random_uuid(),'POS_FOOD_ALLOCATION_EXCEEDS_ITEM');
  perform public.pos_food_payment_command_v1(slug,host,cashier_session,jsonb_build_object('checkId',case_j->>'check','cashSessionId',cash,'method','cash','amount',100,'amountReceived',100,'allocations',jsonb_build_array(jsonb_build_object('foodItemId',case_j->>'item','quantity',1))),gen_random_uuid());
  perform pg_temp.split_assert((select status='CLOSED' from public.pos_food_checks where id=(case_j->>'check')::uuid),'J second unit closes');

  -- M/P/Q/N: amount validation, cash change, card reference and partial retry.
  case_m:=pg_temp.split_make_case(50);
  perform pg_temp.split_reject(jsonb_build_object('checkId',case_m->>'check','cashSessionId',cash,'method','cash','amount',60,'amountReceived',60),gen_random_uuid(),'POS_FOOD_PAYMENT_EXCEEDS_BALANCE');
  perform pg_temp.split_assert((select count(*)=0 from public.pos_food_payments where check_id=(case_m->>'check')::uuid),'M rejects without ledger row');
  case_p:=pg_temp.split_make_case(200);
  perform public.pos_food_payment_command_v1(slug,host,cashier_session,jsonb_build_object('checkId',case_p->>'check','cashSessionId',cash,'method','cash','amount',80,'amountReceived',100),gen_random_uuid());
  perform pg_temp.split_assert((select amount=80 and amount_received=100 and change_amount=20 from public.pos_food_payments where check_id=(case_p->>'check')::uuid),'P partial change');
  case_q:=pg_temp.split_make_case(100);
  perform pg_temp.split_reject(jsonb_build_object('checkId',case_q->>'check','cashSessionId',cash,'method','card','amount',100),gen_random_uuid(),'POS_FOOD_PAYMENT_REFERENCE_REQUIRED');
  perform public.pos_food_payment_command_v1(slug,host,cashier_session,jsonb_build_object('checkId',case_q->>'check','cashSessionId',cash,'method','card','amount',100,'reference','AUTH-100'),gen_random_uuid());
  perform pg_temp.split_assert((select reference='AUTH-100' from public.pos_food_payments where check_id=(case_q->>'check')::uuid),'Q card reference');
  case_d:=pg_temp.split_make_case(100);
  retry_key:=gen_random_uuid();
  first:=public.pos_food_payment_command_v1(slug,host,cashier_session,jsonb_build_object('checkId',case_d->>'check','cashSessionId',cash,'method','other','amount',40,'reference','RETRY'),retry_key);
  result:=public.pos_food_payment_command_v1(slug,host,cashier_session,jsonb_build_object('checkId',case_d->>'check','cashSessionId',cash,'method','other','amount',40,'reference','RETRY'),retry_key);
  perform pg_temp.split_assert((select count(*)=1 from public.pos_food_payments where check_id=(case_d->>'check')::uuid) and result->>'paymentId'=first->>'paymentId','N retry partial is idempotent');

  -- S: partial payments never move tracked stock; final payment moves it once.
  case_s:=pg_temp.split_make_case(100,1,true);
  perform public.pos_food_payment_command_v1(slug,host,cashier_session,jsonb_build_object('checkId',case_s->>'check','cashSessionId',cash,'method','other','amount',40,'reference','S-1'),gen_random_uuid());
  perform pg_temp.split_assert((select quantity=10 from public.pos_inventory where id=(case_s->>'inventory')::uuid) and (select inventory_committed_at is null from public.pos_food_items where id=(case_s->>'item')::uuid),'S partial one leaves stock');
  perform public.pos_food_payment_command_v1(slug,host,cashier_session,jsonb_build_object('checkId',case_s->>'check','cashSessionId',cash,'method','other','amount',30,'reference','S-2'),gen_random_uuid());
  perform pg_temp.split_assert((select quantity=10 from public.pos_inventory where id=(case_s->>'inventory')::uuid),'S partial two leaves stock');
  retry_key:=gen_random_uuid();
  perform public.pos_food_payment_command_v1(slug,host,cashier_session,jsonb_build_object('checkId',case_s->>'check','cashSessionId',cash,'method','other','amount',30,'reference','S-3'),retry_key);
  perform pg_temp.split_assert((select quantity=9 from public.pos_inventory where id=(case_s->>'inventory')::uuid) and (select inventory_committed_at is not null from public.pos_food_items where id=(case_s->>'item')::uuid),'S final moves stock once');
  perform public.pos_food_payment_command_v1(slug,host,cashier_session,jsonb_build_object('checkId',case_s->>'check','cashSessionId',cash,'method','other','amount',30,'reference','S-3'),retry_key);
  perform pg_temp.split_assert((select quantity=9 from public.pos_inventory where id=(case_s->>'inventory')::uuid),'S final retry no second movement');

  -- Resume and snapshot behavior.
  resume_case:=pg_temp.split_make_case(100);
  perform public.pos_food_command_v1(slug,host,admin_session,'resume',jsonb_build_object('checkId',resume_case->>'check','version',0),gen_random_uuid());
  perform pg_temp.split_assert((select status='OPEN' from public.pos_food_checks where id=(resume_case->>'check')::uuid),'resume without payments allowed');
  case_m:=pg_temp.split_make_case(100);
  perform public.pos_food_payment_command_v1(slug,host,cashier_session,jsonb_build_object('checkId',case_m->>'check','cashSessionId',cash,'method','other','amount',40,'reference','BLOCK'),gen_random_uuid());
  begin perform public.pos_food_command_v1(slug,host,admin_session,'resume',jsonb_build_object('checkId',case_m->>'check','version',1),gen_random_uuid()); raise exception 'FAIL resume with payment'; exception when others then if sqlerrm<>'POS_FOOD_RESUME_BLOCKED_PAYMENTS' then raise; end if; raise notice 'PASS: resume blocked after partial payment'; end;
  snap:=public.pos_food_snapshot_v1(slug,host,admin_session,location);
  perform pg_temp.split_assert(snap ? 'payments' and snap ? 'payment_allocations' and snap ? 'payment_item_status','snapshot exposes split ledger and item status');
  perform pg_temp.split_assert(jsonb_array_length(snap->'payments')>0 and jsonb_array_length(snap->'payment_item_status')>0,'snapshot returns payment and item quantities; paid/remaining derive from sums');
  perform pg_temp.split_assert((select bool_and(cashier_staff_id=cashier) from public.pos_food_payments where check_id=(case_b->>'check')::uuid),'payment staff attribution');
  perform pg_temp.split_assert((select cashier_staff_id=cashier from public.pos_sales where id=(select sale_id from public.pos_food_checks where id=(case_b->>'check')::uuid)),'canonical sale staff attribution');

  -- U/V: direct DB constraints reject mismatched identities.
  cross_a:=pg_temp.split_make_case(100); cross_b:=pg_temp.split_make_case(100);
  insert into public.brands(id,slug,name) values(other_brand,'split-other','Split other');
  insert into public.pos_business_profiles(brand_id,brand_slug,profile_code) values(other_brand::text,'split-other','restaurant');
  insert into public.pos_locations(id,brand_id,brand_slug,name,code,currency,prices_include_tax) values(other_location,other_brand::text,'split-other','Other split','OTHER','MXN',false);
  insert into public.pos_staff(id,brand_id,brand_slug,location_id,name,role,pin_hash) values(other_admin,other_brand::text,'split-other',other_location,'Other admin','ADMIN','synthetic-not-a-login');
  insert into public.pos_products(id,brand_id,brand_slug,name,track_inventory,inventory_mode,tax_rate) values(other_product,other_brand::text,'split-other','Other product',false,'none',0);
  insert into public.pos_product_variants(id,brand_id,brand_slug,product_id,name,price,variant_signature) values(other_variant,other_brand::text,'split-other',other_product,'Regular',100,'{}');
  insert into public.pos_food_tables(id,brand_id,brand_slug,location_id,name) values(other_table,other_brand,'split-other',other_location,'Other table');
  insert into public.pos_food_checks(id,brand_id,brand_slug,location_id,table_id,status,guests,currency,prices_include_tax,opened_by,payment_requested_at,payment_requested_by) values(other_check,other_brand,'split-other',other_location,other_table,'PAYMENT_PENDING',1,'MXN',false,other_admin,now(),other_admin);
  insert into public.pos_food_tickets(id,brand_slug,brand_id,check_id,sequence,status,sent_at,sent_by,preparing_at,preparing_by,ready_at,ready_by,served_at,served_by) values(other_ticket,'split-other',other_brand,other_check,1,'READY',now(),other_admin,now(),other_admin,now(),other_admin,now(),other_admin);
  insert into public.pos_food_items(id,brand_slug,check_id,brand_id,ticket_id,variant_id,product_id,unit_code,unit_cost,track_inventory,product_name,variant_name,quantity,unit_price,tax_rate,subtotal,tax_amount,line_total,configuration,created_by,updated_by) values(other_item,'split-other',other_check,other_brand,other_ticket,other_variant,other_product,'piece',0,false,'Other product','Regular',1,100,0,100,0,100,jsonb_build_object('modifiers','[]'::jsonb),other_admin,other_admin);
  insert into public.pos_food_payments(brand_id,brand_slug,location_id,check_id,cashier_staff_id,cash_session_id,method,amount,amount_received,change_amount,request_key) values(brand,slug,location,(cross_a->>'check')::uuid,cashier,cash,'other',1,1,0,gen_random_uuid()) returning id into payment_id;
  begin insert into public.pos_food_payment_allocations(brand_id,brand_slug,location_id,check_id,payment_id,food_item_id,quantity,amount) values(brand,slug,location,(cross_a->>'check')::uuid,payment_id,(cross_b->>'item')::uuid,1,1); raise exception 'FAIL cross-check allocation'; exception when foreign_key_violation then raise notice 'PASS: V cross-check FK rejection'; end;
  begin insert into public.pos_food_payment_allocations(brand_id,brand_slug,location_id,check_id,payment_id,food_item_id,quantity,amount) values(brand,slug,location,(cross_a->>'check')::uuid,payment_id,other_item,1,1); raise exception 'FAIL cross-brand allocation'; exception when foreign_key_violation then raise notice 'PASS: U cross-brand FK rejection'; end;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='pos_food_payment_allocations_payment_identity_fkey') then raise exception 'Allocation payment identity FK missing'; end if;
  if not exists (select 1 from pg_constraint where conname='pos_food_payment_allocations_item_identity_fkey') then raise exception 'Allocation item identity FK missing'; end if;
  raise notice 'PASS Split & Payments V1 behavioral suite';
end $$;

rollback;
