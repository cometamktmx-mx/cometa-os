-- LOYALTY V4B.2C — SUITE TRANSACCIONAL 19–36
-- Termina en ROLLBACK. pos_sale_number_seq puede dejar huecos: es esperado.
BEGIN;

CREATE TEMP TABLE v4b2c_fixture AS
SELECT p.brand_id,p.brand_slug,p.id program_id,m.id member_id,m.customer_id,r.id reward_id,r.points_cost,r.reward_value,
 v.id variant_id,v.price unit_price,pr.tax_rate,pr.track_inventory,l.id location_id,l.prices_include_tax,
 rg.id register_id,cs.id cash_session_id,ref.sold_by user_id,
 round(CASE WHEN l.prices_include_tax THEN v.price ELSE v.price+v.price*pr.tax_rate/100 END,2) normal_total,
 round((CASE WHEN l.prices_include_tax THEN v.price ELSE v.price+v.price*pr.tax_rate/100 END)-r.reward_value,2) reward_total,
 p.points_per_currency
FROM public.pos_loyalty_programs p
JOIN public.pos_loyalty_members m ON m.program_id=p.id AND m.brand_slug=p.brand_slug AND m.status='active'
JOIN public.pos_loyalty_rewards r ON r.program_id=p.id AND r.brand_slug=p.brand_slug AND r.active AND r.reward_type='discount_fixed' AND r.reward_value>0
JOIN public.pos_product_variants v ON v.brand_slug=p.brand_slug AND v.active
JOIN public.pos_products pr ON pr.id=v.product_id AND pr.brand_slug=p.brand_slug AND pr.active
JOIN public.pos_cash_sessions cs ON cs.brand_slug=p.brand_slug AND cs.status='open'
JOIN public.pos_registers rg ON rg.id=cs.register_id AND rg.status='available'
JOIN public.pos_locations l ON l.id=rg.location_id AND l.active
LEFT JOIN public.pos_inventory i ON i.location_id=l.id AND i.variant_id=v.id AND i.brand_slug=p.brand_slug
JOIN LATERAL(SELECT sold_by FROM public.pos_sales s WHERE s.brand_slug=p.brand_slug AND s.sold_by IS NOT NULL ORDER BY sold_at DESC LIMIT 1) ref ON true
WHERE p.brand_slug='tivana' AND p.active AND (NOT pr.track_inventory OR COALESCE(i.quantity-i.reserved_quantity,0)>=1)
AND r.reward_value<CASE WHEN l.prices_include_tax THEN v.price ELSE v.price+v.price*pr.tax_rate/100 END
ORDER BY m.joined_at,m.id,r.created_at,v.id LIMIT 1;

-- PRECONDICIÓN: exactamente una fila.
SELECT * FROM v4b2c_fixture;

CREATE TEMP TABLE v4b2c_results(test_number integer PRIMARY KEY,test_name text,passed boolean,details jsonb) ON COMMIT DROP;
CREATE TEMP TABLE v4b2c_errors(test_number integer PRIMARY KEY,sqlstate text,message text) ON COMMIT DROP;
CREATE TEMP TABLE v4b2c_rpc(operation text PRIMARY KEY,response jsonb NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE v4b2c_ids(name text PRIMARY KEY,id uuid NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE v4b2c_audit(name text PRIMARY KEY,payload jsonb NOT NULL) ON COMMIT DROP;

UPDATE public.pos_inventory i SET quantity=quantity+100 FROM v4b2c_fixture f
WHERE i.location_id=f.location_id AND i.variant_id=f.variant_id AND f.track_inventory;
UPDATE public.pos_loyalty_members m SET points_balance=GREATEST(points_balance,(SELECT points_cost+10000 FROM v4b2c_fixture))
WHERE id=(SELECT member_id FROM v4b2c_fixture);

-- Campaña de fixture required=1: toda venta qualifying crea un ciclo/unlock.
INSERT INTO public.pos_loyalty_visit_programs(brand_id,brand_slug,loyalty_program_id,name,required_visits,minimum_sale_amount,reward_id,active,created_by)
SELECT brand_id,brand_slug,program_id,'V4B2C MAIN '||txid_current(),1,0,reward_id,true,user_id FROM v4b2c_fixture;
INSERT INTO v4b2c_ids SELECT 'campaign',id FROM public.pos_loyalty_visit_programs WHERE name='V4B2C MAIN '||txid_current();

-- TEST 19 — point reward crea redeem y redemption.
INSERT INTO v4b2c_audit SELECT 't19_before',jsonb_build_object('points',m.points_balance) FROM public.pos_loyalty_members m JOIN v4b2c_fixture f ON f.member_id=m.id;
INSERT INTO v4b2c_rpc SELECT 't19',public.pos_complete_sale_v4(brand_slug,location_id,register_id,cash_session_id,customer_id,
 jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',1,'discount_amount',0)),jsonb_build_array(jsonb_build_object('method','cash','amount',reward_total,'tendered_amount',reward_total,'metadata','{}'::jsonb)),
 'V4B2C TEST 19',user_id,reward_id,'43000000-0000-4000-8000-000000000019',NULL) FROM v4b2c_fixture;
INSERT INTO v4b2c_results SELECT 19,'point reward crea redeem',r.response->>'reward_source'='points'
 AND EXISTS(SELECT 1 FROM public.pos_loyalty_transactions t WHERE t.sale_id=(r.response->>'id')::uuid AND t.transaction_type='redeem')
 AND EXISTS(SELECT 1 FROM public.pos_loyalty_redemptions d WHERE d.sale_id=(r.response->>'id')::uuid)
 AND m.points_balance=(a.payload->>'points')::int-f.points_cost+(r.response->>'points_earned')::int,
 jsonb_build_object('response',r.response,'before',a.payload,'after',m.points_balance)
FROM v4b2c_rpc r CROSS JOIN v4b2c_fixture f CROSS JOIN v4b2c_audit a JOIN public.pos_loyalty_members m ON m.id=f.member_id WHERE r.operation='t19' AND a.name='t19_before';

-- Unlock available propio para tests de error y consumo.
INSERT INTO public.pos_loyalty_reward_unlocks(brand_id,brand_slug,visit_program_id,member_id,reward_id,cycle_number,source_sale_id,status,reward_name,reward_type,reward_value,required_visits_snapshot,minimum_sale_amount_snapshot)
SELECT f.brand_id,f.brand_slug,c.id,f.member_id,f.reward_id,900,(r.response->>'id')::uuid,'available','V4B2C UNLOCK','discount_fixed',f.reward_value,1,0
FROM v4b2c_fixture f JOIN v4b2c_ids c ON c.name='campaign' JOIN v4b2c_rpc r ON r.operation='t19';
INSERT INTO v4b2c_ids SELECT 'unlock',id FROM public.pos_loyalty_reward_unlocks WHERE cycle_number=900 AND visit_program_id=(SELECT id FROM v4b2c_ids WHERE name='campaign');

-- TEST 20 — exclusión mutua, sin nueva venta.
INSERT INTO v4b2c_audit SELECT 't20_sales',jsonb_build_object('count',count(*)) FROM public.pos_sales;
DO $t$ DECLARE f record;u uuid;BEGIN SELECT * INTO f FROM v4b2c_fixture;SELECT id INTO u FROM v4b2c_ids WHERE name='unlock';BEGIN PERFORM public.pos_complete_sale_v4(f.brand_slug,f.location_id,f.register_id,f.cash_session_id,f.customer_id,jsonb_build_array(jsonb_build_object('variant_id',f.variant_id,'quantity',1,'discount_amount',0)),jsonb_build_array(jsonb_build_object('method','cash','amount',f.reward_total,'tendered_amount',f.reward_total,'metadata','{}'::jsonb)),'V4B2C TEST 20',f.user_id,f.reward_id,'43000000-0000-4000-8000-000000000020',u);EXCEPTION WHEN OTHERS THEN INSERT INTO v4b2c_errors VALUES(20,SQLSTATE,SQLERRM);END;END $t$;
INSERT INTO v4b2c_results SELECT 20,'mutual exclusion',e.message ILIKE '%Sólo puede aplicarse una recompensa%' AND (SELECT count(*) FROM public.pos_sales)=(a.payload->>'count')::int,jsonb_build_object('error',to_jsonb(e),'salesBefore',a.payload) FROM v4b2c_errors e CROSS JOIN v4b2c_audit a WHERE e.test_number=20 AND a.name='t20_sales';

-- TEST 21 — unlock cross tenant: el contexto POS sigue siendo válido, pero el unlock no pertenece a la marca.
UPDATE public.pos_loyalty_reward_unlocks u SET brand_slug='otra-marca-v4b2c' FROM v4b2c_ids i WHERE i.name='unlock' AND u.id=i.id;
DO $t$ DECLARE f record;u uuid;BEGIN SELECT * INTO f FROM v4b2c_fixture;SELECT id INTO u FROM v4b2c_ids WHERE name='unlock';BEGIN PERFORM public.pos_complete_sale_v4(f.brand_slug,f.location_id,f.register_id,f.cash_session_id,f.customer_id,jsonb_build_array(jsonb_build_object('variant_id',f.variant_id,'quantity',1,'discount_amount',0)),jsonb_build_array(jsonb_build_object('method','cash','amount',f.reward_total,'tendered_amount',f.reward_total,'metadata','{}'::jsonb)),'V4B2C TEST 21',f.user_id,NULL,'43000000-0000-4000-8000-000000000021',u);EXCEPTION WHEN OTHERS THEN INSERT INTO v4b2c_errors VALUES(21,SQLSTATE,SQLERRM);END;END $t$;
INSERT INTO v4b2c_results SELECT 21,'unlock cross tenant rechazado',e.message IS NOT NULL AND u.status='available' AND u.redeemed_sale_id IS NULL,jsonb_build_object('error',to_jsonb(e),'unlock',to_jsonb(u)) FROM v4b2c_errors e CROSS JOIN public.pos_loyalty_reward_unlocks u JOIN v4b2c_ids i ON i.id=u.id AND i.name='unlock' WHERE e.test_number=21;
UPDATE public.pos_loyalty_reward_unlocks u SET brand_slug=f.brand_slug FROM v4b2c_ids i CROSS JOIN v4b2c_fixture f WHERE i.name='unlock' AND u.id=i.id;

-- TEST 22 — otro member/customer creado dentro de la transacción.
INSERT INTO public.pos_customers(brand_id,brand_slug,first_name,last_name,email,marketing_consent,wallet_consent,tags,active,created_by)
SELECT brand_id,brand_slug,'V4B2C','OTHER MEMBER','v4b2c-'||txid_current()||'@example.invalid',false,false,'[]'::jsonb,true,user_id FROM v4b2c_fixture;
INSERT INTO v4b2c_ids
SELECT 'otherCustomer',id FROM public.pos_customers WHERE email='v4b2c-'||txid_current()||'@example.invalid';
INSERT INTO v4b2c_ids
SELECT 'otherMember',m.id
FROM v4b2c_fixture f
JOIN v4b2c_ids c ON c.name='otherCustomer'
CROSS JOIN LATERAL public.pos_register_loyalty_member_v2(f.brand_slug,c.id,f.user_id) m;
CREATE TEMP TABLE v4b2c_other_member AS
SELECT m.id,m.customer_id FROM public.pos_loyalty_members m JOIN v4b2c_ids i ON i.id=m.id AND i.name='otherMember';
DO $t$ DECLARE f record;o record;u uuid;BEGIN SELECT * INTO f FROM v4b2c_fixture;SELECT * INTO o FROM v4b2c_other_member;SELECT id INTO u FROM v4b2c_ids WHERE name='unlock';IF o.id IS NULL THEN RAISE EXCEPTION 'PRECONDICIÓN TEST 22: falta segundo member activo.';END IF;BEGIN PERFORM public.pos_complete_sale_v4(f.brand_slug,f.location_id,f.register_id,f.cash_session_id,o.customer_id,jsonb_build_array(jsonb_build_object('variant_id',f.variant_id,'quantity',1,'discount_amount',0)),jsonb_build_array(jsonb_build_object('method','cash','amount',f.reward_total,'tendered_amount',f.reward_total,'metadata','{}'::jsonb)),'V4B2C TEST 22',f.user_id,NULL,'43000000-0000-4000-8000-000000000022',u);EXCEPTION WHEN OTHERS THEN INSERT INTO v4b2c_errors VALUES(22,SQLSTATE,SQLERRM);END;END $t$;
INSERT INTO v4b2c_results SELECT 22,'unlock otro member rechazado',e.message ILIKE '%otro cliente%' AND u.status='available',jsonb_build_object('error',to_jsonb(e)) FROM v4b2c_errors e CROSS JOIN public.pos_loyalty_reward_unlocks u JOIN v4b2c_ids i ON i.id=u.id AND i.name='unlock' WHERE e.test_number=22;

-- TEST 23 — unlock ya redeemed conserva venta original.
UPDATE public.pos_loyalty_reward_unlocks u SET status='redeemed',redeemed_sale_id=(SELECT (response->>'id')::uuid FROM v4b2c_rpc WHERE operation='t19'),redeemed_at=now() FROM v4b2c_ids i WHERE i.name='unlock' AND u.id=i.id;
INSERT INTO v4b2c_audit SELECT 't23_original',jsonb_build_object('saleId',redeemed_sale_id) FROM public.pos_loyalty_reward_unlocks u JOIN v4b2c_ids i ON i.id=u.id AND i.name='unlock';
DO $t$ DECLARE f record;u uuid;BEGIN SELECT * INTO f FROM v4b2c_fixture;SELECT id INTO u FROM v4b2c_ids WHERE name='unlock';BEGIN PERFORM public.pos_complete_sale_v4(f.brand_slug,f.location_id,f.register_id,f.cash_session_id,f.customer_id,jsonb_build_array(jsonb_build_object('variant_id',f.variant_id,'quantity',1,'discount_amount',0)),jsonb_build_array(jsonb_build_object('method','cash','amount',f.reward_total,'tendered_amount',f.reward_total,'metadata','{}'::jsonb)),'V4B2C TEST 23',f.user_id,NULL,'43000000-0000-4000-8000-000000000023',u);EXCEPTION WHEN OTHERS THEN INSERT INTO v4b2c_errors VALUES(23,SQLSTATE,SQLERRM);END;END $t$;
INSERT INTO v4b2c_results SELECT 23,'unlock redeemed rechazado',e.message ILIKE '%ya no está disponible%' AND u.redeemed_sale_id=(a.payload->>'saleId')::uuid,jsonb_build_object('error',to_jsonb(e),'unlock',to_jsonb(u)) FROM v4b2c_errors e CROSS JOIN v4b2c_audit a CROSS JOIN public.pos_loyalty_reward_unlocks u JOIN v4b2c_ids i ON i.id=u.id AND i.name='unlock' WHERE e.test_number=23 AND a.name='t23_original';

-- TEST 24–25 — campaign inactive/fuera de vigencia.
UPDATE public.pos_loyalty_visit_programs SET active=false WHERE id=(SELECT id FROM v4b2c_ids WHERE name='campaign');
INSERT INTO v4b2c_rpc SELECT 't24',public.pos_complete_sale_v4(brand_slug,location_id,register_id,cash_session_id,customer_id,jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',1,'discount_amount',0)),jsonb_build_array(jsonb_build_object('method','cash','amount',normal_total,'tendered_amount',normal_total,'metadata','{}'::jsonb)),'V4B2C TEST 24',user_id,NULL,'43000000-0000-4000-8000-000000000024',NULL) FROM v4b2c_fixture;
INSERT INTO v4b2c_results SELECT 24,'campaign inactive',NOT EXISTS(SELECT 1 FROM public.pos_loyalty_visit_events e JOIN v4b2c_ids i ON i.id=e.visit_program_id AND i.name='campaign' WHERE e.sale_id=(r.response->>'id')::uuid) AND NOT EXISTS(SELECT 1 FROM public.pos_loyalty_reward_unlocks u JOIN v4b2c_ids i ON i.id=u.visit_program_id AND i.name='campaign' WHERE u.source_sale_id=(r.response->>'id')::uuid),r.response FROM v4b2c_rpc r WHERE operation='t24';
UPDATE public.pos_loyalty_visit_programs SET active=true,starts_at=now()+interval '1 day' WHERE id=(SELECT id FROM v4b2c_ids WHERE name='campaign');
INSERT INTO v4b2c_rpc SELECT 't25',public.pos_complete_sale_v4(brand_slug,location_id,register_id,cash_session_id,customer_id,jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',1,'discount_amount',0)),jsonb_build_array(jsonb_build_object('method','cash','amount',normal_total,'tendered_amount',normal_total,'metadata','{}'::jsonb)),'V4B2C TEST 25',user_id,NULL,'43000000-0000-4000-8000-000000000025',NULL) FROM v4b2c_fixture;
INSERT INTO v4b2c_results SELECT 25,'campaign fuera de vigencia',NOT EXISTS(SELECT 1 FROM public.pos_loyalty_visit_events e JOIN v4b2c_ids i ON i.id=e.visit_program_id AND i.name='campaign' WHERE e.sale_id=(r.response->>'id')::uuid) AND NOT EXISTS(SELECT 1 FROM public.pos_loyalty_reward_unlocks u JOIN v4b2c_ids i ON i.id=u.visit_program_id AND i.name='campaign' WHERE u.source_sale_id=(r.response->>'id')::uuid),r.response FROM v4b2c_rpc r WHERE operation='t25';

-- TEST 26 — earn después de point reward.
INSERT INTO v4b2c_results SELECT 26,'earn sobre total point reward',(r.response->>'base_points')::int=floor((r.response->>'total')::numeric*f.points_per_currency) AND (r.response->>'points_earned')::int=floor((r.response->>'base_points')::numeric*(r.response->>'tier_multiplier')::numeric),r.response FROM v4b2c_rpc r CROSS JOIN v4b2c_fixture f WHERE r.operation='t19';

-- Nuevo unlock available para TEST 27.
UPDATE public.pos_loyalty_visit_programs SET active=false,starts_at=NULL WHERE id=(SELECT id FROM v4b2c_ids WHERE name='campaign');
INSERT INTO public.pos_loyalty_reward_unlocks(brand_id,brand_slug,visit_program_id,member_id,reward_id,cycle_number,source_sale_id,status,reward_name,reward_type,reward_value,required_visits_snapshot,minimum_sale_amount_snapshot)
SELECT f.brand_id,f.brand_slug,c.id,f.member_id,f.reward_id,901,(r.response->>'id')::uuid,'available','V4B2C UNLOCK 27','discount_fixed',f.reward_value,1,0 FROM v4b2c_fixture f JOIN v4b2c_ids c ON c.name='campaign' JOIN v4b2c_rpc r ON r.operation='t24';
INSERT INTO v4b2c_ids SELECT 'unlock27',id FROM public.pos_loyalty_reward_unlocks WHERE cycle_number=901 AND visit_program_id=(SELECT id FROM v4b2c_ids WHERE name='campaign');
INSERT INTO v4b2c_rpc SELECT 't27',public.pos_complete_sale_v4(f.brand_slug,f.location_id,f.register_id,f.cash_session_id,f.customer_id,jsonb_build_array(jsonb_build_object('variant_id',f.variant_id,'quantity',1,'discount_amount',0)),jsonb_build_array(jsonb_build_object('method','cash','amount',f.reward_total,'tendered_amount',f.reward_total,'metadata','{}'::jsonb)),'V4B2C TEST 27',f.user_id,NULL,'43000000-0000-4000-8000-000000000027',u.id) FROM v4b2c_fixture f JOIN v4b2c_ids u ON u.name='unlock27';
INSERT INTO v4b2c_results SELECT 27,'earn sobre total visit unlock',(r.response->>'base_points')::int=floor((r.response->>'total')::numeric*f.points_per_currency) AND (r.response->>'points_earned')::int=floor((r.response->>'base_points')::numeric*(r.response->>'tier_multiplier')::numeric),r.response FROM v4b2c_rpc r CROSS JOIN v4b2c_fixture f WHERE r.operation='t27';

-- TEST 28–29 — tier multiplier y promoción, por encima de todo threshold preexistente.
INSERT INTO public.pos_loyalty_tiers(brand_id,brand_slug,program_id,name,minimum_lifetime_points,points_multiplier,sort_order,active)
SELECT f.brand_id,f.brand_slug,f.program_id,'V4B2C TIER A '||txid_current(),COALESCE(max(t.minimum_lifetime_points),0)+100000,1.2500,500000,true
FROM v4b2c_fixture f LEFT JOIN public.pos_loyalty_tiers t ON t.program_id=f.program_id
GROUP BY f.brand_id,f.brand_slug,f.program_id;
INSERT INTO v4b2c_ids SELECT 'tierA',id FROM public.pos_loyalty_tiers WHERE name='V4B2C TIER A '||txid_current();
UPDATE public.pos_loyalty_members m SET lifetime_points=t.minimum_lifetime_points,points_balance=GREATEST(m.points_balance,t.minimum_lifetime_points),tier_id=t.id
FROM public.pos_loyalty_tiers t JOIN v4b2c_ids i ON i.id=t.id AND i.name='tierA' WHERE m.id=(SELECT member_id FROM v4b2c_fixture);
INSERT INTO v4b2c_rpc SELECT 't28',public.pos_complete_sale_v4(brand_slug,location_id,register_id,cash_session_id,customer_id,jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',1,'discount_amount',0)),jsonb_build_array(jsonb_build_object('method','cash','amount',normal_total,'tendered_amount',normal_total,'metadata','{}'::jsonb)),'V4B2C TEST 28',user_id,NULL,'43000000-0000-4000-8000-000000000028',NULL) FROM v4b2c_fixture;
INSERT INTO v4b2c_results SELECT 28,'tier multiplier',(response->>'tier_multiplier')::numeric=1.25 AND (response->>'points_earned')::int=floor((response->>'base_points')::numeric*1.25) AND s.tier_multiplier=1.25,response FROM v4b2c_rpc r JOIN public.pos_sale_loyalty_tier_snapshots s ON s.sale_id=(r.response->>'id')::uuid WHERE operation='t28';
INSERT INTO public.pos_loyalty_tiers(brand_id,brand_slug,program_id,name,minimum_lifetime_points,points_multiplier,sort_order,active)
SELECT f.brand_id,f.brand_slug,f.program_id,'V4B2C TIER B '||txid_current(),a.minimum_lifetime_points+floor(f.normal_total*f.points_per_currency*1.25)::int+1,1.5000,600000,true
FROM v4b2c_fixture f JOIN public.pos_loyalty_tiers a ON a.id=(SELECT id FROM v4b2c_ids WHERE name='tierA');
INSERT INTO v4b2c_ids SELECT 'tierB',id FROM public.pos_loyalty_tiers WHERE name='V4B2C TIER B '||txid_current();
UPDATE public.pos_loyalty_members m SET lifetime_points=t.minimum_lifetime_points-1,tier_id=(SELECT id FROM v4b2c_ids WHERE name='tierA') FROM public.pos_loyalty_tiers t JOIN v4b2c_ids i ON i.id=t.id AND i.name='tierB' WHERE m.id=(SELECT member_id FROM v4b2c_fixture);
INSERT INTO v4b2c_rpc SELECT 't29',public.pos_complete_sale_v4(brand_slug,location_id,register_id,cash_session_id,customer_id,jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',1,'discount_amount',0)),jsonb_build_array(jsonb_build_object('method','cash','amount',normal_total,'tendered_amount',normal_total,'metadata','{}'::jsonb)),'V4B2C TEST 29',user_id,NULL,'43000000-0000-4000-8000-000000000029',NULL) FROM v4b2c_fixture;
INSERT INTO v4b2c_rpc SELECT 't29_next',public.pos_complete_sale_v4(brand_slug,location_id,register_id,cash_session_id,customer_id,jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',1,'discount_amount',0)),jsonb_build_array(jsonb_build_object('method','cash','amount',normal_total,'tendered_amount',normal_total,'metadata','{}'::jsonb)),'V4B2C TEST 29 NEXT',user_id,NULL,'43000000-0000-4000-8000-000000000129',NULL) FROM v4b2c_fixture;
INSERT INTO v4b2c_results SELECT 29,'tier promotion',(p.response->'tier_before'->>'id')::uuid=(SELECT id FROM v4b2c_ids WHERE name='tierA') AND (p.response->>'tier_multiplier')::numeric=1.25 AND (p.response->'tier_after'->>'id')::uuid=(SELECT id FROM v4b2c_ids WHERE name='tierB') AND (p.response->>'tier_promoted')::boolean AND (n.response->'tier_before'->>'id')::uuid=(SELECT id FROM v4b2c_ids WHERE name='tierB') AND (n.response->>'tier_multiplier')::numeric=1.50,jsonb_build_object('promotionSale',p.response,'nextSale',n.response) FROM v4b2c_rpc p JOIN v4b2c_rpc n ON n.operation='t29_next' WHERE p.operation='t29';

-- TEST 30 — snapshot estructurado coincide con response_json.
INSERT INTO v4b2c_results SELECT 30,'visit snapshot exacto',s.reward_source IS NOT DISTINCT FROM r.response->>'reward_source' AND s.reward_id IS NOT DISTINCT FROM NULLIF(r.response->>'reward_id','')::uuid AND s.reward_unlock_id IS NOT DISTINCT FROM NULLIF(r.response->>'reward_unlock_id','')::uuid AND s.reward_discount_applied=(r.response->>'loyalty_discount')::numeric AND s.visits_earned=(r.response->>'visits_earned')::int AND s.visit_progress=r.response->'visit_progress' AND s.visit_unlocks_created=r.response->'visit_unlocks_created' AND (s.response_json->>'idempotent_replay')::boolean=false,jsonb_build_object('snapshot',to_jsonb(s),'response',r.response) FROM v4b2c_rpc r JOIN public.pos_sale_loyalty_visit_snapshots s ON s.sale_id=(r.response->>'id')::uuid WHERE r.operation='t27';

-- TEST 31 — replay desde snapshot pese a cambiar estado vivo.
INSERT INTO v4b2c_rpc SELECT 't31_first',public.pos_complete_sale_v4(brand_slug,location_id,register_id,cash_session_id,customer_id,jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',1,'discount_amount',0)),jsonb_build_array(jsonb_build_object('method','cash','amount',normal_total,'tendered_amount',normal_total,'metadata','{}'::jsonb)),'V4B2C TEST 31',user_id,NULL,'43000000-0000-4000-8000-000000000031',NULL) FROM v4b2c_fixture;
UPDATE public.pos_loyalty_members SET points_balance=points_balance+777 WHERE id=(SELECT member_id FROM v4b2c_fixture);
UPDATE public.pos_loyalty_visit_programs SET name=name||' CAMBIADO',active=false WHERE id=(SELECT id FROM v4b2c_ids WHERE name='campaign');
INSERT INTO v4b2c_rpc SELECT 't31_replay',public.pos_complete_sale_v4(brand_slug,location_id,register_id,cash_session_id,customer_id,jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',1,'discount_amount',0)),jsonb_build_array(jsonb_build_object('method','cash','amount',normal_total,'tendered_amount',normal_total,'metadata','{}'::jsonb)),'V4B2C TEST 31',user_id,NULL,'43000000-0000-4000-8000-000000000031',NULL) FROM v4b2c_fixture;
INSERT INTO v4b2c_results SELECT 31,'replay desde response_json',(re.response-'idempotent_replay')=(fi.response-'idempotent_replay') AND (re.response->>'idempotent_replay')::boolean AND (s.response_json->>'idempotent_replay')::boolean=false,jsonb_build_object('first',fi.response,'replay',re.response) FROM v4b2c_rpc fi JOIN v4b2c_rpc re ON re.operation='t31_replay' JOIN public.pos_sale_loyalty_visit_snapshots s ON s.sale_id=(fi.response->>'id')::uuid WHERE fi.operation='t31_first';

-- TEST 32–36 — una venta qualifying que completa ciclo y su replay.
UPDATE public.pos_loyalty_visit_programs SET active=true,starts_at=NULL,ends_at=NULL WHERE id=(SELECT id FROM v4b2c_ids WHERE name='campaign');
INSERT INTO v4b2c_audit SELECT 't32_inventory',jsonb_build_object('quantity',i.quantity) FROM public.pos_inventory i JOIN v4b2c_fixture f ON i.location_id=f.location_id AND i.variant_id=f.variant_id WHERE f.track_inventory;
INSERT INTO v4b2c_rpc SELECT 't32_first',public.pos_complete_sale_v4(brand_slug,location_id,register_id,cash_session_id,customer_id,jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',1,'discount_amount',0)),jsonb_build_array(jsonb_build_object('method','cash','amount',normal_total,'tendered_amount',normal_total,'metadata','{}'::jsonb)),'V4B2C TEST 32',user_id,NULL,'43000000-0000-4000-8000-000000000032',NULL) FROM v4b2c_fixture;
INSERT INTO v4b2c_rpc SELECT 't32_replay',public.pos_complete_sale_v4(brand_slug,location_id,register_id,cash_session_id,customer_id,jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',1,'discount_amount',0)),jsonb_build_array(jsonb_build_object('method','cash','amount',normal_total,'tendered_amount',normal_total,'metadata','{}'::jsonb)),'V4B2C TEST 32',user_id,NULL,'43000000-0000-4000-8000-000000000032',NULL) FROM v4b2c_fixture;
INSERT INTO v4b2c_results SELECT 32,'inventory una vez',count(m.id)=CASE WHEN f.track_inventory THEN 1 ELSE 0 END AND (NOT f.track_inventory OR i.quantity=(a.payload->>'quantity')::numeric-1),jsonb_build_object('movements',count(m.id),'quantity',i.quantity) FROM v4b2c_fixture f JOIN v4b2c_rpc r ON r.operation='t32_first' LEFT JOIN public.pos_inventory_movements m ON m.reference_id=(r.response->>'id')::uuid LEFT JOIN public.pos_inventory i ON i.location_id=f.location_id AND i.variant_id=f.variant_id LEFT JOIN v4b2c_audit a ON a.name='t32_inventory' GROUP BY f.track_inventory,i.quantity,a.payload;
INSERT INTO v4b2c_results SELECT 33,'payments una vez',count(*)=1 AND sum(p.amount)=(r.response->>'payment_applied')::numeric,jsonb_build_object('count',count(*),'total',sum(p.amount)) FROM v4b2c_rpc r JOIN public.pos_payments p ON p.sale_id=(r.response->>'id')::uuid WHERE r.operation='t32_first' GROUP BY r.response;
INSERT INTO v4b2c_results SELECT 34,'points ledger una vez',count(*) FILTER(WHERE transaction_type='earn')<=1 AND count(*) FILTER(WHERE transaction_type='redeem')=0,jsonb_build_object('earn',count(*) FILTER(WHERE transaction_type='earn'),'redeem',count(*) FILTER(WHERE transaction_type='redeem')) FROM v4b2c_rpc r LEFT JOIN public.pos_loyalty_transactions t ON t.sale_id=(r.response->>'id')::uuid WHERE r.operation='t32_first';
INSERT INTO v4b2c_results SELECT 35,'visit event una vez',count(*) FILTER(WHERE e.event_type='qualify')=1 AND count(*) FILTER(WHERE e.event_type='reverse')=0,jsonb_build_object('qualify',count(*) FILTER(WHERE e.event_type='qualify'),'reverse',count(*) FILTER(WHERE e.event_type='reverse')) FROM v4b2c_rpc r JOIN v4b2c_ids c ON c.name='campaign' LEFT JOIN public.pos_loyalty_visit_events e ON e.sale_id=(r.response->>'id')::uuid AND e.visit_program_id=c.id WHERE r.operation='t32_first';
INSERT INTO v4b2c_results SELECT 36,'unlock una vez',count(u.id)=1,jsonb_build_object('count',count(u.id),'cycles',COALESCE(jsonb_agg(u.cycle_number) FILTER(WHERE u.id IS NOT NULL),'[]'::jsonb)) FROM v4b2c_rpc r JOIN v4b2c_ids c ON c.name='campaign' LEFT JOIN public.pos_loyalty_reward_unlocks u ON u.source_sale_id=(r.response->>'id')::uuid AND u.visit_program_id=c.id WHERE r.operation='t32_first';

SELECT * FROM v4b2c_errors ORDER BY test_number;
SELECT test_number,test_name,passed,details FROM v4b2c_results ORDER BY test_number;
ROLLBACK;
