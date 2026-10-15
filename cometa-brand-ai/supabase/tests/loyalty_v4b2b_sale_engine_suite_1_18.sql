-- LOYALTY V4B.2B — SUITE TRANSACCIONAL 1–18
-- IMPORTANTE: termina en ROLLBACK. nextval(pos_sale_number_seq) no es transaccional y dejará huecos esperados.

BEGIN;

CREATE TEMP TABLE v4b2b_fixture AS
SELECT p.brand_id,p.brand_slug,p.id program_id,m.id member_id,m.customer_id,r.id reward_id,
  r.points_cost,r.reward_value,v.id variant_id,v.price unit_price,pr.tax_rate,pr.track_inventory,
  l.id location_id,l.prices_include_tax,rg.id register_id,cs.id cash_session_id,
  ref.sold_by user_id,
  round(CASE WHEN l.prices_include_tax THEN v.price ELSE v.price+v.price*pr.tax_rate/100 END,2) normal_total,
  round((CASE WHEN l.prices_include_tax THEN v.price ELSE v.price+v.price*pr.tax_rate/100 END)-r.reward_value,2) reward_total
FROM public.pos_loyalty_programs p
JOIN public.pos_loyalty_members m ON m.program_id=p.id AND m.brand_slug=p.brand_slug AND m.status='active'
JOIN public.pos_loyalty_rewards r ON r.program_id=p.id AND r.brand_slug=p.brand_slug AND r.active AND r.reward_type='discount_fixed' AND r.reward_value>0
JOIN public.pos_product_variants v ON v.brand_slug=p.brand_slug AND v.active
JOIN public.pos_products pr ON pr.id=v.product_id AND pr.brand_slug=p.brand_slug AND pr.active
JOIN public.pos_cash_sessions cs ON cs.brand_slug=p.brand_slug AND cs.status='open'
JOIN public.pos_registers rg ON rg.id=cs.register_id AND rg.status='available'
JOIN public.pos_locations l ON l.id=rg.location_id AND l.active
LEFT JOIN public.pos_inventory i ON i.location_id=l.id AND i.variant_id=v.id AND i.brand_slug=p.brand_slug
JOIN LATERAL (SELECT sold_by FROM public.pos_sales s WHERE s.brand_slug=p.brand_slug AND s.sold_by IS NOT NULL ORDER BY sold_at DESC LIMIT 1) ref ON true
WHERE p.brand_slug='tivana' AND p.active
  AND (NOT pr.track_inventory OR COALESCE(i.quantity-i.reserved_quantity,0)>=1)
  AND r.reward_value < CASE WHEN l.prices_include_tax THEN v.price ELSE v.price+v.price*pr.tax_rate/100 END
ORDER BY m.joined_at,m.id,r.created_at,v.id LIMIT 1;

-- PRECONDICIÓN: exactamente una fila y user_id no nulo.
SELECT * FROM v4b2b_fixture;

CREATE TEMP TABLE v4b2b_results(test_number integer PRIMARY KEY,test_name text,passed boolean,details jsonb) ON COMMIT DROP;
CREATE TEMP TABLE v4b2b_errors(test_number integer PRIMARY KEY,sqlstate text,message text) ON COMMIT DROP;
CREATE TEMP TABLE v4b2b_rpc(operation text PRIMARY KEY,response jsonb NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE v4b2b_counts(operation text PRIMARY KEY,payload jsonb NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE v4b2b_programs(kind text PRIMARY KEY,id uuid NOT NULL) ON COMMIT DROP;

-- Margen transaccional para ventas y reward por puntos; se revierte al final.
UPDATE public.pos_inventory i SET quantity=quantity+100
FROM v4b2b_fixture f WHERE i.location_id=f.location_id AND i.variant_id=f.variant_id AND f.track_inventory;
UPDATE public.pos_loyalty_members m SET points_balance=GREATEST(points_balance,(SELECT points_cost+10000 FROM v4b2b_fixture))
WHERE id=(SELECT member_id FROM v4b2b_fixture);

-- Campañas propias: qualifying, debajo del mínimo, exacta y segunda compatible.
INSERT INTO public.pos_loyalty_visit_programs(brand_id,brand_slug,loyalty_program_id,name,required_visits,minimum_sale_amount,reward_id,active,created_by)
SELECT brand_id,brand_slug,program_id,'V4B2B MAIN '||txid_current(),2,0,reward_id,true,user_id FROM v4b2b_fixture;
INSERT INTO v4b2b_programs SELECT 'main',id FROM public.pos_loyalty_visit_programs WHERE name='V4B2B MAIN '||txid_current();
INSERT INTO public.pos_loyalty_visit_programs(brand_id,brand_slug,loyalty_program_id,name,required_visits,minimum_sale_amount,reward_id,active,created_by)
SELECT brand_id,brand_slug,program_id,'V4B2B HIGH '||txid_current(),3,normal_total+1,reward_id,false,user_id FROM v4b2b_fixture;
INSERT INTO v4b2b_programs SELECT 'high',id FROM public.pos_loyalty_visit_programs WHERE name='V4B2B HIGH '||txid_current();
INSERT INTO public.pos_loyalty_visit_programs(brand_id,brand_slug,loyalty_program_id,name,required_visits,minimum_sale_amount,reward_id,active,created_by)
SELECT brand_id,brand_slug,program_id,'V4B2B EXACT '||txid_current(),3,normal_total,reward_id,false,user_id FROM v4b2b_fixture;
INSERT INTO v4b2b_programs SELECT 'exact',id FROM public.pos_loyalty_visit_programs WHERE name='V4B2B EXACT '||txid_current();
INSERT INTO public.pos_loyalty_visit_programs(brand_id,brand_slug,loyalty_program_id,name,required_visits,minimum_sale_amount,reward_id,active,created_by)
SELECT brand_id,brand_slug,program_id,'V4B2B SECOND '||txid_current(),20,0,reward_id,false,user_id FROM v4b2b_fixture;
INSERT INTO v4b2b_programs SELECT 'second',id FROM public.pos_loyalty_visit_programs WHERE name='V4B2B SECOND '||txid_current();

-- Helper pattern: every RPC call is a standalone INSERT; every assertion is a later INSERT.
-- TEST 1 — venta sin customer.
INSERT INTO v4b2b_rpc SELECT 't1',public.pos_complete_sale_v4(brand_slug,location_id,register_id,cash_session_id,NULL,
 jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',1,'discount_amount',0)),
 jsonb_build_array(jsonb_build_object('method','cash','amount',normal_total,'tendered_amount',normal_total,'metadata','{}'::jsonb)),
 'V4B2B TEST 1',user_id,NULL,'42000000-0000-4000-8000-000000000001',NULL) FROM v4b2b_fixture;
INSERT INTO v4b2b_results SELECT 1,'venta sin customer',r.response->>'reward_source' IS NULL AND r.response->>'visits_earned'='0' AND r.response->'visit_progress'='[]' AND s.sale_id IS NOT NULL,
 jsonb_build_object('response',r.response,'snapshot',to_jsonb(s)) FROM v4b2b_rpc r LEFT JOIN public.pos_sale_loyalty_visit_snapshots s ON s.sale_id=(r.response->>'id')::uuid WHERE r.operation='t1';

-- TEST 2 — member activo califica.
INSERT INTO v4b2b_rpc SELECT 't2',public.pos_complete_sale_v4(brand_slug,location_id,register_id,cash_session_id,customer_id,
 jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',1,'discount_amount',0)),jsonb_build_array(jsonb_build_object('method','cash','amount',normal_total,'tendered_amount',normal_total,'metadata','{}'::jsonb)),
 'V4B2B TEST 2',user_id,NULL,'42000000-0000-4000-8000-000000000002',NULL) FROM v4b2b_fixture;
INSERT INTO v4b2b_results SELECT 2,'member activo qualify',(r.response->>'visits_earned')::int>=1 AND count(e.id)>=1 AND s.visits_earned=(r.response->>'visits_earned')::int,
 jsonb_build_object('response',r.response,'events',count(e.id)) FROM v4b2b_rpc r JOIN public.pos_sale_loyalty_visit_snapshots s ON s.sale_id=(r.response->>'id')::uuid LEFT JOIN public.pos_loyalty_visit_events e ON e.sale_id=s.sale_id WHERE r.operation='t2' GROUP BY r.response,s.visits_earned;

-- TEST 3 — debajo del mínimo: high activa, otras inactivas.
UPDATE public.pos_loyalty_visit_programs SET active=(id=(SELECT id FROM v4b2b_programs WHERE kind='high')) WHERE id IN(SELECT id FROM v4b2b_programs);
INSERT INTO v4b2b_rpc SELECT 't3',public.pos_complete_sale_v4(brand_slug,location_id,register_id,cash_session_id,customer_id,jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',1,'discount_amount',0)),jsonb_build_array(jsonb_build_object('method','cash','amount',normal_total,'tendered_amount',normal_total,'metadata','{}'::jsonb)),'V4B2B TEST 3',user_id,NULL,'42000000-0000-4000-8000-000000000003',NULL) FROM v4b2b_fixture;
INSERT INTO v4b2b_results SELECT 3,'debajo de minimum',(response->>'visits_earned')::int=0 AND response->'visit_progress'->0->>'qualified'='false' AND NOT EXISTS(SELECT 1 FROM public.pos_loyalty_visit_events WHERE sale_id=(response->>'id')::uuid),response FROM v4b2b_rpc WHERE operation='t3';

-- TEST 4 — exactamente minimum.
UPDATE public.pos_loyalty_visit_programs SET active=(id=(SELECT id FROM v4b2b_programs WHERE kind='exact')) WHERE id IN(SELECT id FROM v4b2b_programs);
INSERT INTO v4b2b_rpc SELECT 't4',public.pos_complete_sale_v4(brand_slug,location_id,register_id,cash_session_id,customer_id,jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',1,'discount_amount',0)),jsonb_build_array(jsonb_build_object('method','cash','amount',normal_total,'tendered_amount',normal_total,'metadata','{}'::jsonb)),'V4B2B TEST 4',user_id,NULL,'42000000-0000-4000-8000-000000000004',NULL) FROM v4b2b_fixture;
INSERT INTO v4b2b_results SELECT 4,'exactamente minimum',(response->>'visits_earned')::int=1 AND response->'visit_progress'->0->>'qualified'='true',response FROM v4b2b_rpc WHERE operation='t4';

-- TEST 5 — por encima del mínimo (cantidad 2).
INSERT INTO v4b2b_rpc SELECT 't5',public.pos_complete_sale_v4(brand_slug,location_id,register_id,cash_session_id,customer_id,jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',2,'discount_amount',0)),jsonb_build_array(jsonb_build_object('method','cash','amount',normal_total*2,'tendered_amount',normal_total*2,'metadata','{}'::jsonb)),'V4B2B TEST 5',user_id,NULL,'42000000-0000-4000-8000-000000000005',NULL) FROM v4b2b_fixture;
INSERT INTO v4b2b_results SELECT 5,'por encima de minimum',(response->>'visits_earned')::int=1,response FROM v4b2b_rpc WHERE operation='t5';

-- TEST 6 — dos campañas compatibles y orden determinista.
UPDATE public.pos_loyalty_visit_programs SET active=id IN((SELECT id FROM v4b2b_programs WHERE kind='main'),(SELECT id FROM v4b2b_programs WHERE kind='second')) WHERE id IN(SELECT id FROM v4b2b_programs);
INSERT INTO v4b2b_rpc SELECT 't6',public.pos_complete_sale_v4(brand_slug,location_id,register_id,cash_session_id,customer_id,jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',1,'discount_amount',0)),jsonb_build_array(jsonb_build_object('method','cash','amount',normal_total,'tendered_amount',normal_total,'metadata','{}'::jsonb)),'V4B2B TEST 6',user_id,NULL,'42000000-0000-4000-8000-000000000006',NULL) FROM v4b2b_fixture;
INSERT INTO v4b2b_results SELECT 6,'dos campañas',(response->>'visits_earned')::int=2 AND jsonb_array_length(response->'visit_progress')=2 AND (response->'visit_progress'->0->>'visitProgramId')::uuid<(response->'visit_progress'->1->>'visitProgramId')::uuid,response FROM v4b2b_rpc WHERE operation='t6';

-- TEST 7 — replay y conteos invariantes.
INSERT INTO v4b2b_counts SELECT 't7_before',jsonb_build_object('sales',(SELECT count(*) FROM public.pos_sales),'items',(SELECT count(*) FROM public.pos_sale_items),'payments',(SELECT count(*) FROM public.pos_payments),'inventory',(SELECT count(*) FROM public.pos_inventory_movements),'points',(SELECT count(*) FROM public.pos_loyalty_transactions),'redemptions',(SELECT count(*) FROM public.pos_loyalty_redemptions),'events',(SELECT count(*) FROM public.pos_loyalty_visit_events),'unlocks',(SELECT count(*) FROM public.pos_loyalty_reward_unlocks),'snapshots',(SELECT count(*) FROM public.pos_sale_loyalty_visit_snapshots));
INSERT INTO v4b2b_rpc SELECT 't7_first',public.pos_complete_sale_v4(brand_slug,location_id,register_id,cash_session_id,customer_id,jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',1,'discount_amount',0)),jsonb_build_array(jsonb_build_object('method','cash','amount',normal_total,'tendered_amount',normal_total,'metadata','{}'::jsonb)),'V4B2B TEST 7',user_id,NULL,'42000000-0000-4000-8000-000000000007',NULL) FROM v4b2b_fixture;
INSERT INTO v4b2b_counts SELECT 't7_after_first',jsonb_build_object('sales',(SELECT count(*) FROM public.pos_sales),'items',(SELECT count(*) FROM public.pos_sale_items),'payments',(SELECT count(*) FROM public.pos_payments),'inventory',(SELECT count(*) FROM public.pos_inventory_movements),'points',(SELECT count(*) FROM public.pos_loyalty_transactions),'redemptions',(SELECT count(*) FROM public.pos_loyalty_redemptions),'events',(SELECT count(*) FROM public.pos_loyalty_visit_events),'unlocks',(SELECT count(*) FROM public.pos_loyalty_reward_unlocks),'snapshots',(SELECT count(*) FROM public.pos_sale_loyalty_visit_snapshots));
INSERT INTO v4b2b_rpc SELECT 't7_replay',public.pos_complete_sale_v4(brand_slug,location_id,register_id,cash_session_id,customer_id,jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',1,'discount_amount',0)),jsonb_build_array(jsonb_build_object('method','cash','amount',normal_total,'tendered_amount',normal_total,'metadata','{}'::jsonb)),'V4B2B TEST 7',user_id,NULL,'42000000-0000-4000-8000-000000000007',NULL) FROM v4b2b_fixture;
INSERT INTO v4b2b_counts SELECT 't7_after_replay',jsonb_build_object('sales',(SELECT count(*) FROM public.pos_sales),'items',(SELECT count(*) FROM public.pos_sale_items),'payments',(SELECT count(*) FROM public.pos_payments),'inventory',(SELECT count(*) FROM public.pos_inventory_movements),'points',(SELECT count(*) FROM public.pos_loyalty_transactions),'redemptions',(SELECT count(*) FROM public.pos_loyalty_redemptions),'events',(SELECT count(*) FROM public.pos_loyalty_visit_events),'unlocks',(SELECT count(*) FROM public.pos_loyalty_reward_unlocks),'snapshots',(SELECT count(*) FROM public.pos_sale_loyalty_visit_snapshots));
INSERT INTO v4b2b_results SELECT 7,'replay idempotente',re.response->>'id'=fi.response->>'id' AND (re.response->>'idempotent_replay')::boolean AND a.payload=b.payload AND (s.response_json->>'idempotent_replay')::boolean=false,jsonb_build_object('first',fi.response,'replay',re.response,'afterFirst',a.payload,'afterReplay',b.payload)
FROM v4b2b_rpc fi JOIN v4b2b_rpc re ON re.operation='t7_replay' JOIN v4b2b_counts a ON a.operation='t7_after_first' JOIN v4b2b_counts b ON b.operation='t7_after_replay' JOIN public.pos_sale_loyalty_visit_snapshots s ON s.sale_id=(fi.response->>'id')::uuid WHERE fi.operation='t7_first';

-- TEST 8 — misma key, payload diferente.
DO $t$ DECLARE f record; BEGIN SELECT * INTO f FROM v4b2b_fixture; BEGIN PERFORM public.pos_complete_sale_v4(f.brand_slug,f.location_id,f.register_id,f.cash_session_id,f.customer_id,jsonb_build_array(jsonb_build_object('variant_id',f.variant_id,'quantity',2,'discount_amount',0)),jsonb_build_array(jsonb_build_object('method','cash','amount',f.normal_total,'tendered_amount',f.normal_total,'metadata','{}'::jsonb)),'V4B2B TEST 7',f.user_id,NULL,'42000000-0000-4000-8000-000000000007',NULL); EXCEPTION WHEN OTHERS THEN INSERT INTO v4b2b_errors VALUES(8,SQLSTATE,SQLERRM); END; END $t$;
INSERT INTO v4b2b_results SELECT 8,'conflicto fingerprint',message ILIKE '%Conflicto de idempotencia%',jsonb_build_object('sqlstate',sqlstate,'message',message) FROM v4b2b_errors WHERE test_number=8;

-- TEST 9–11 — completar ciclo y siguiente ciclo.
UPDATE public.pos_loyalty_visit_programs SET active=id=(SELECT id FROM v4b2b_programs WHERE kind='main') WHERE id IN(SELECT id FROM v4b2b_programs);
-- main ya posee visitas de pruebas anteriores; una venta completa el siguiente límite según su progreso real.
INSERT INTO v4b2b_rpc SELECT 't9',public.pos_complete_sale_v4(brand_slug,location_id,register_id,cash_session_id,customer_id,jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',1,'discount_amount',0)),jsonb_build_array(jsonb_build_object('method','cash','amount',normal_total,'tendered_amount',normal_total,'metadata','{}'::jsonb)),'V4B2B TEST 9',user_id,NULL,'42000000-0000-4000-8000-000000000009',NULL) FROM v4b2b_fixture;
INSERT INTO v4b2b_results SELECT 9,'completar ciclo',jsonb_array_length(response->'visit_unlocks_created')>=1 AND response->'visit_progress'->0->>'currentProgress'='0',response FROM v4b2b_rpc WHERE operation='t9';
INSERT INTO v4b2b_results SELECT 10,'unlock único por ciclo',count(*)=1,jsonb_build_object('count',count(*),'cycle',u.cycle_number) FROM public.pos_loyalty_reward_unlocks u JOIN v4b2b_programs p ON p.id=u.visit_program_id AND p.kind='main' JOIN v4b2b_fixture f ON f.member_id=u.member_id WHERE u.cycle_number=(SELECT max(cycle_number) FROM public.pos_loyalty_reward_unlocks WHERE visit_program_id=p.id AND member_id=f.member_id) GROUP BY u.cycle_number;
INSERT INTO v4b2b_rpc SELECT 't11a',public.pos_complete_sale_v4(brand_slug,location_id,register_id,cash_session_id,customer_id,jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',1,'discount_amount',0)),jsonb_build_array(jsonb_build_object('method','cash','amount',normal_total,'tendered_amount',normal_total,'metadata','{}'::jsonb)),'V4B2B TEST 11A',user_id,NULL,'42000000-0000-4000-8000-000000000011',NULL) FROM v4b2b_fixture;
INSERT INTO v4b2b_rpc SELECT 't11b',public.pos_complete_sale_v4(brand_slug,location_id,register_id,cash_session_id,customer_id,jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',1,'discount_amount',0)),jsonb_build_array(jsonb_build_object('method','cash','amount',normal_total,'tendered_amount',normal_total,'metadata','{}'::jsonb)),'V4B2B TEST 11B',user_id,NULL,'42000000-0000-4000-8000-000000000012',NULL) FROM v4b2b_fixture;
INSERT INTO v4b2b_results SELECT 11,'ciclo siguiente',count(DISTINCT cycle_number)>=2,jsonb_build_object('cycles',jsonb_agg(cycle_number ORDER BY cycle_number)) FROM public.pos_loyalty_reward_unlocks u JOIN v4b2b_programs p ON p.id=u.visit_program_id AND p.kind='main' JOIN v4b2b_fixture f ON f.member_id=u.member_id;

-- Capturas antes del consumo para TEST 12–17.
CREATE TEMP TABLE v4b2b_unlock_audit AS SELECT u.id unlock_id,u.reward_value,m.points_balance points_before,m.lifetime_points lifetime_before FROM public.pos_loyalty_reward_unlocks u JOIN v4b2b_programs p ON p.id=u.visit_program_id AND p.kind='main' JOIN v4b2b_fixture f ON f.member_id=u.member_id JOIN public.pos_loyalty_members m ON m.id=f.member_id WHERE u.status='available' ORDER BY u.cycle_number LIMIT 1;
INSERT INTO v4b2b_rpc SELECT 't12',public.pos_complete_sale_v4(f.brand_slug,f.location_id,f.register_id,f.cash_session_id,f.customer_id,jsonb_build_array(jsonb_build_object('variant_id',f.variant_id,'quantity',1,'discount_amount',0)),jsonb_build_array(jsonb_build_object('method','cash','amount',round(f.normal_total-a.reward_value,2),'tendered_amount',round(f.normal_total-a.reward_value,2),'metadata','{}'::jsonb)),'V4B2B TEST 12',f.user_id,NULL,'42000000-0000-4000-8000-000000000013',a.unlock_id) FROM v4b2b_fixture f CROSS JOIN v4b2b_unlock_audit a;
INSERT INTO v4b2b_results SELECT 12,'consumir unlock',r.response->>'reward_source'='visits' AND (r.response->>'reward_unlock_id')::uuid=a.unlock_id AND (r.response->>'loyalty_discount')::numeric=a.reward_value AND (r.response->>'payment_applied')::numeric=(r.response->>'total')::numeric AND (r.response->>'change_due')::numeric=0,r.response FROM v4b2b_rpc r CROSS JOIN v4b2b_unlock_audit a WHERE operation='t12';
INSERT INTO v4b2b_results SELECT 13,'unlock no baja points',m.points_balance=a.points_before+(r.response->>'points_earned')::int,jsonb_build_object('before',a.points_before,'earned',r.response->>'points_earned','after',m.points_balance) FROM v4b2b_unlock_audit a CROSS JOIN v4b2b_fixture f JOIN public.pos_loyalty_members m ON m.id=f.member_id CROSS JOIN v4b2b_rpc r WHERE r.operation='t12';
INSERT INTO v4b2b_results SELECT 14,'unlock no baja lifetime',m.lifetime_points=a.lifetime_before+(r.response->>'points_earned')::int,jsonb_build_object('before',a.lifetime_before,'earned',r.response->>'points_earned','after',m.lifetime_points) FROM v4b2b_unlock_audit a CROSS JOIN v4b2b_fixture f JOIN public.pos_loyalty_members m ON m.id=f.member_id CROSS JOIN v4b2b_rpc r WHERE r.operation='t12';
INSERT INTO v4b2b_results SELECT 15,'sin redeem transaction',count(*)=0,jsonb_build_object('count',count(*)) FROM public.pos_loyalty_transactions t JOIN v4b2b_rpc r ON t.sale_id=(r.response->>'id')::uuid WHERE r.operation='t12' AND t.transaction_type='redeem';
INSERT INTO v4b2b_results SELECT 16,'sin point redemption',count(*)=0,jsonb_build_object('count',count(*)) FROM public.pos_loyalty_redemptions d JOIN v4b2b_rpc r ON d.sale_id=(r.response->>'id')::uuid WHERE r.operation='t12';
INSERT INTO v4b2b_results SELECT 17,'unlock redeemed',u.status='redeemed' AND u.redeemed_sale_id=(r.response->>'id')::uuid AND u.redeemed_at IS NOT NULL,to_jsonb(u) FROM public.pos_loyalty_reward_unlocks u JOIN v4b2b_unlock_audit a ON a.unlock_id=u.id CROSS JOIN v4b2b_rpc r WHERE r.operation='t12';

-- TEST 18 — reward por puntos sigue creando redeem + redemption.
INSERT INTO v4b2b_counts SELECT 't18_member_before',jsonb_build_object('points',(SELECT m.points_balance FROM public.pos_loyalty_members m WHERE m.id=f.member_id)) FROM v4b2b_fixture f;
INSERT INTO v4b2b_rpc SELECT 't18',public.pos_complete_sale_v4(brand_slug,location_id,register_id,cash_session_id,customer_id,jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',1,'discount_amount',0)),jsonb_build_array(jsonb_build_object('method','cash','amount',reward_total,'tendered_amount',reward_total,'metadata','{}'::jsonb)),'V4B2B TEST 18',user_id,reward_id,'42000000-0000-4000-8000-000000000018',NULL) FROM v4b2b_fixture;
INSERT INTO v4b2b_results SELECT 18,'point reward sigue funcionando',r.response->>'reward_source'='points' AND (r.response->>'loyalty_discount')::numeric=f.reward_value AND m.points_balance=(b.payload->>'points')::int-f.points_cost+(r.response->>'points_earned')::int AND EXISTS(SELECT 1 FROM public.pos_loyalty_transactions WHERE sale_id=(r.response->>'id')::uuid AND transaction_type='redeem') AND EXISTS(SELECT 1 FROM public.pos_loyalty_redemptions WHERE sale_id=(r.response->>'id')::uuid) AND r.response->>'reward_unlock_id' IS NULL,
 jsonb_build_object('response',r.response,'pointsBefore',b.payload->>'points','pointsAfter',m.points_balance) FROM v4b2b_rpc r CROSS JOIN v4b2b_fixture f CROSS JOIN v4b2b_counts b JOIN public.pos_loyalty_members m ON m.id=f.member_id WHERE r.operation='t18' AND b.operation='t18_member_before';

SELECT test_number,sqlstate,message FROM v4b2b_errors ORDER BY test_number;
SELECT test_number,test_name,passed,details FROM v4b2b_results ORDER BY test_number;

ROLLBACK;
