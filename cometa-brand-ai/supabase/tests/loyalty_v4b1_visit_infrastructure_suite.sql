-- LOYALTY V4B.1 TRANSACTIONAL SUITE
-- IMPORTANTE: termina en ROLLBACK. Las mutaciones y verificaciones usan sentencias separadas.

BEGIN;

CREATE TEMP TABLE v4b1_fixture AS
SELECT p.brand_id,p.brand_slug,p.id program_id,r.id reward_id,m.id member_id,s.id sale_id,
  (SELECT id FROM public.pos_loyalty_rewards x WHERE x.program_id=p.id AND x.id<>r.id ORDER BY x.created_at LIMIT 1) alternate_reward_id
FROM public.pos_loyalty_programs p
JOIN LATERAL (SELECT * FROM public.pos_loyalty_rewards r WHERE r.program_id=p.id AND r.brand_slug=p.brand_slug AND r.active AND r.reward_type='discount_fixed' ORDER BY r.created_at LIMIT 1) r ON true
JOIN LATERAL (SELECT * FROM public.pos_loyalty_members m WHERE m.program_id=p.id AND m.brand_slug=p.brand_slug ORDER BY m.joined_at, m.id LIMIT 1) m ON true
JOIN LATERAL (SELECT * FROM public.pos_sales s WHERE s.brand_slug=p.brand_slug AND s.customer_id=m.customer_id ORDER BY s.sold_at DESC LIMIT 1) s ON true
WHERE p.active ORDER BY p.created_at LIMIT 1;

-- PRECONDICIÓN: debe devolver exactamente una fila. La suite no inventa marcas ni IDs.
SELECT * FROM v4b1_fixture;

CREATE TEMP TABLE v4b1_results(test_number integer PRIMARY KEY,test_name text,passed boolean,details jsonb) ON COMMIT DROP;
CREATE TEMP TABLE v4b1_rpc(operation text PRIMARY KEY,response jsonb) ON COMMIT DROP;
CREATE TEMP TABLE v4b1_errors(test_number integer PRIMARY KEY,sqlstate text,message text) ON COMMIT DROP;

-- TEST 1: crear campaña válida.
INSERT INTO v4b1_rpc SELECT 'create',public.pos_create_loyalty_visit_program(f.brand_slug,'V4B1 VISITS '||txid_current(),3,10,f.reward_id,true,NULL,NULL,NULL) FROM v4b1_fixture f;
INSERT INTO v4b1_results SELECT 1,'crear campaña válida',count(*)=1,jsonb_build_object('response',r.response) FROM v4b1_rpc r WHERE operation='create' GROUP BY r.response;

-- TEST 2-7: validaciones de reward, números, fechas y nombre duplicado.
DO $test$ DECLARE f record; BEGIN SELECT * INTO f FROM v4b1_fixture;
 BEGIN PERFORM public.pos_create_loyalty_visit_program(f.brand_slug,'CROSS',2,0,(SELECT id FROM public.pos_loyalty_rewards WHERE brand_slug<>f.brand_slug LIMIT 1),true,NULL,NULL,NULL); EXCEPTION WHEN OTHERS THEN INSERT INTO v4b1_errors VALUES(2,SQLSTATE,SQLERRM); END;
 BEGIN PERFORM public.pos_create_loyalty_visit_program(f.brand_slug,'TYPE',2,0,(SELECT id FROM public.pos_loyalty_rewards WHERE program_id=f.program_id AND reward_type<>'discount_fixed' LIMIT 1),true,NULL,NULL,NULL); EXCEPTION WHEN OTHERS THEN INSERT INTO v4b1_errors VALUES(3,SQLSTATE,SQLERRM); END;
 BEGIN PERFORM public.pos_create_loyalty_visit_program(f.brand_slug,'ZERO',0,0,f.reward_id,true,NULL,NULL,NULL); EXCEPTION WHEN OTHERS THEN INSERT INTO v4b1_errors VALUES(4,SQLSTATE,SQLERRM); END;
 BEGIN PERFORM public.pos_create_loyalty_visit_program(f.brand_slug,'NEG',2,-1,f.reward_id,true,NULL,NULL,NULL); EXCEPTION WHEN OTHERS THEN INSERT INTO v4b1_errors VALUES(5,SQLSTATE,SQLERRM); END;
 BEGIN PERFORM public.pos_create_loyalty_visit_program(f.brand_slug,'DATE',2,0,f.reward_id,true,now(),now()-interval '1 day',NULL); EXCEPTION WHEN OTHERS THEN INSERT INTO v4b1_errors VALUES(6,SQLSTATE,SQLERRM); END;
 BEGIN PERFORM public.pos_create_loyalty_visit_program(f.brand_slug,(SELECT name FROM public.pos_loyalty_visit_programs WHERE id=(SELECT (response->>'id')::uuid FROM v4b1_rpc WHERE operation='create')),2,0,f.reward_id,true,NULL,NULL,NULL); EXCEPTION WHEN OTHERS THEN INSERT INTO v4b1_errors VALUES(7,SQLSTATE,SQLERRM); END;
END $test$;
INSERT INTO v4b1_results SELECT n,CASE n
  WHEN 2 THEN 'reward otra marca rechazado' WHEN 3 THEN 'reward tipo inválido rechazado'
  WHEN 4 THEN 'required_visits cero rechazado' WHEN 5 THEN 'minimum negativo rechazado'
  WHEN 6 THEN 'fechas inválidas rechazadas' ELSE 'nombre duplicado rechazado' END,
  EXISTS(SELECT 1 FROM v4b1_errors e WHERE e.test_number=n),
  COALESCE((SELECT jsonb_build_object('sqlstate',e.sqlstate,'message',e.message) FROM v4b1_errors e WHERE e.test_number=n),'{}')
FROM generate_series(2,7) n;

-- TEST 8: antes de eventos se permite cambiar la mecánica.
INSERT INTO v4b1_rpc SELECT 'update_before',public.pos_update_loyalty_visit_program(f.brand_slug,(c.response->>'id')::uuid,'V4B1 UPDATED '||txid_current(),4,20,f.reward_id,true,NULL,NULL)
FROM v4b1_fixture f CROSS JOIN v4b1_rpc c WHERE c.operation='create';
INSERT INTO v4b1_results SELECT 8,'update antes de eventos',response->>'requiredVisits'='4' AND response->>'minimumSaleAmount'='20.00',response FROM v4b1_rpc WHERE operation='update_before';

-- TEST 9: qualify de prueba, en sentencia propia.
INSERT INTO public.pos_loyalty_visit_events(brand_id,brand_slug,visit_program_id,member_id,sale_id,event_type,cycle_number,required_visits_snapshot,minimum_sale_amount_snapshot,reward_id_snapshot)
SELECT f.brand_id,f.brand_slug,(c.response->>'id')::uuid,f.member_id,f.sale_id,'qualify',1,4,20,f.reward_id FROM v4b1_fixture f CROSS JOIN v4b1_rpc c WHERE c.operation='create';
INSERT INTO v4b1_results SELECT 9,'crear qualify de prueba',count(*)=1,jsonb_build_object('events',count(*)) FROM public.pos_loyalty_visit_events e JOIN v4b1_rpc c ON e.visit_program_id=(c.response->>'id')::uuid WHERE c.operation='create';

-- TEST 10-12: mecánica congelada después del primer evento.
DO $test$ DECLARE f record; v uuid; n text; BEGIN SELECT * INTO f FROM v4b1_fixture; SELECT (response->>'id')::uuid,response->>'name' INTO v,n FROM v4b1_rpc WHERE operation='update_before';
 BEGIN PERFORM public.pos_update_loyalty_visit_program(f.brand_slug,v,n,5,20,f.reward_id,true,NULL,NULL); EXCEPTION WHEN OTHERS THEN INSERT INTO v4b1_errors VALUES(10,SQLSTATE,SQLERRM); END;
 BEGIN PERFORM public.pos_update_loyalty_visit_program(f.brand_slug,v,n,4,21,f.reward_id,true,NULL,NULL); EXCEPTION WHEN OTHERS THEN INSERT INTO v4b1_errors VALUES(11,SQLSTATE,SQLERRM); END;
 BEGIN PERFORM public.pos_update_loyalty_visit_program(f.brand_slug,v,n,4,20,COALESCE(f.alternate_reward_id,gen_random_uuid()),true,NULL,NULL); EXCEPTION WHEN OTHERS THEN INSERT INTO v4b1_errors VALUES(12,SQLSTATE,SQLERRM); END;
END $test$;
INSERT INTO v4b1_results SELECT n,CASE n WHEN 10 THEN 'required congelado' WHEN 11 THEN 'minimum congelado' ELSE 'reward congelada' END,
EXISTS(SELECT 1 FROM v4b1_errors e WHERE e.test_number=n),COALESCE((SELECT jsonb_build_object('message',message) FROM v4b1_errors e WHERE e.test_number=n),'{}') FROM generate_series(10,12)n;

-- TEST 13-14: nombre y active siguen editables.
INSERT INTO v4b1_rpc SELECT 'rename',public.pos_update_loyalty_visit_program(f.brand_slug,(c.response->>'id')::uuid,'V4B1 RENAMED '||txid_current(),4,20,f.reward_id,true,NULL,NULL) FROM v4b1_fixture f CROSS JOIN v4b1_rpc c WHERE c.operation='create';
INSERT INTO v4b1_rpc SELECT 'inactive',public.pos_set_loyalty_visit_program_active(f.brand_slug,(c.response->>'id')::uuid,false) FROM v4b1_fixture f CROSS JOIN v4b1_rpc c WHERE c.operation='create';
INSERT INTO v4b1_results SELECT 13,'nombre editable',response->>'name' LIKE 'V4B1 RENAMED%',response FROM v4b1_rpc WHERE operation='rename';
INSERT INTO v4b1_results SELECT 14,'active editable',(response->>'active')::boolean=false,response FROM v4b1_rpc WHERE operation='inactive';

-- TEST 15-17: progreso 1/N y N/N/ciclo. Cada insert y lectura es independiente.
INSERT INTO v4b1_rpc SELECT 'progress_one',public.pos_get_loyalty_visit_progress(f.brand_slug,(c.response->>'id')::uuid,f.member_id) FROM v4b1_fixture f CROSS JOIN v4b1_rpc c WHERE c.operation='create';
INSERT INTO v4b1_results SELECT 15,'progress 1/N',response->>'completedVisits'='1' AND response->>'currentProgress'='1',response FROM v4b1_rpc WHERE operation='progress_one';
-- Se reutilizan ventas adicionales reales del mismo miembro sólo dentro del rollback.
INSERT INTO public.pos_loyalty_visit_events(brand_id,brand_slug,visit_program_id,member_id,sale_id,event_type,cycle_number,required_visits_snapshot,minimum_sale_amount_snapshot,reward_id_snapshot)
SELECT f.brand_id,f.brand_slug,(c.response->>'id')::uuid,f.member_id,s.id,'qualify',1,4,20,f.reward_id FROM v4b1_fixture f CROSS JOIN v4b1_rpc c JOIN LATERAL (SELECT id FROM public.pos_sales WHERE brand_slug=f.brand_slug AND customer_id=(SELECT customer_id FROM public.pos_loyalty_members WHERE id=f.member_id) AND id<>f.sale_id ORDER BY sold_at LIMIT 3) s ON true WHERE c.operation='create' ON CONFLICT DO NOTHING;
INSERT INTO v4b1_rpc SELECT 'progress_cycle',public.pos_get_loyalty_visit_progress(f.brand_slug,(c.response->>'id')::uuid,f.member_id) FROM v4b1_fixture f CROSS JOIN v4b1_rpc c WHERE c.operation='create';
INSERT INTO v4b1_results SELECT 16,'progress N/N',response->>'completedVisits'='4' AND response->>'currentProgress'='0',response FROM v4b1_rpc WHERE operation='progress_cycle';
INSERT INTO v4b1_results SELECT 17,'cycle correcto',response->>'cyclesCompleted'='1',response FROM v4b1_rpc WHERE operation='progress_cycle';

-- TEST 18: unique qualify por programa/venta.
DO $test$ DECLARE f record; v uuid; BEGIN SELECT * INTO f FROM v4b1_fixture; SELECT (response->>'id')::uuid INTO v FROM v4b1_rpc WHERE operation='create';
 BEGIN INSERT INTO public.pos_loyalty_visit_events(brand_id,brand_slug,visit_program_id,member_id,sale_id,event_type,cycle_number,required_visits_snapshot,minimum_sale_amount_snapshot,reward_id_snapshot) VALUES(f.brand_id,f.brand_slug,v,f.member_id,f.sale_id,'qualify',1,4,20,f.reward_id); EXCEPTION WHEN unique_violation THEN INSERT INTO v4b1_errors VALUES(18,SQLSTATE,SQLERRM); END;
END $test$;
INSERT INTO v4b1_results SELECT 18,'unique qualify',EXISTS(SELECT 1 FROM v4b1_errors WHERE test_number=18),COALESCE((SELECT jsonb_build_object('message',message) FROM v4b1_errors WHERE test_number=18),'{}');

-- TEST 19-20: unlock único y helper available.
INSERT INTO public.pos_loyalty_reward_unlocks(brand_id,brand_slug,visit_program_id,member_id,reward_id,cycle_number,source_sale_id,reward_name,reward_type,reward_value,required_visits_snapshot,minimum_sale_amount_snapshot)
SELECT f.brand_id,f.brand_slug,(c.response->>'id')::uuid,f.member_id,f.reward_id,1,f.sale_id,'V4B1 TEST REWARD','discount_fixed',10,4,20 FROM v4b1_fixture f CROSS JOIN v4b1_rpc c WHERE c.operation='create';
DO $test$ DECLARE f record; v uuid; BEGIN SELECT * INTO f FROM v4b1_fixture; SELECT (response->>'id')::uuid INTO v FROM v4b1_rpc WHERE operation='create';
 BEGIN INSERT INTO public.pos_loyalty_reward_unlocks(brand_id,brand_slug,visit_program_id,member_id,reward_id,cycle_number,source_sale_id,reward_name,reward_type,reward_value,required_visits_snapshot,minimum_sale_amount_snapshot) VALUES(f.brand_id,f.brand_slug,v,f.member_id,f.reward_id,1,f.sale_id,'DUP','discount_fixed',10,4,20); EXCEPTION WHEN unique_violation THEN INSERT INTO v4b1_errors VALUES(19,SQLSTATE,SQLERRM); END;
END $test$;
INSERT INTO v4b1_results SELECT 19,'unlock unique por ciclo',EXISTS(SELECT 1 FROM v4b1_errors WHERE test_number=19),COALESCE((SELECT jsonb_build_object('message',message) FROM v4b1_errors WHERE test_number=19),'{}');
INSERT INTO v4b1_results SELECT 20,'available unlock helper',count(*)=1,jsonb_build_object('count',count(*)) FROM v4b1_fixture f CROSS JOIN LATERAL public.pos_get_available_loyalty_reward_unlocks(f.brand_slug,f.member_id);

-- TEST 21: cross-tenant rechazado y fila permanece intacta.
DO $test$ DECLARE v uuid; BEGIN SELECT (response->>'id')::uuid INTO v FROM v4b1_rpc WHERE operation='create';
 BEGIN PERFORM public.pos_set_loyalty_visit_program_active('brand-inexistente-v4b1',v,true); EXCEPTION WHEN OTHERS THEN INSERT INTO v4b1_errors VALUES(21,SQLSTATE,SQLERRM); END;
END $test$;
INSERT INTO v4b1_results SELECT 21,'cross-tenant rechazado',EXISTS(SELECT 1 FROM v4b1_errors WHERE test_number=21) AND p.active=false,
jsonb_build_object('error',(SELECT message FROM v4b1_errors WHERE test_number=21),'activeUnchanged',p.active=false)
FROM public.pos_loyalty_visit_programs p JOIN v4b1_rpc c ON p.id=(c.response->>'id')::uuid WHERE c.operation='create';

SELECT test_number,test_name,passed,details FROM v4b1_results ORDER BY test_number;
SELECT * FROM v4b1_errors ORDER BY test_number;

ROLLBACK;
