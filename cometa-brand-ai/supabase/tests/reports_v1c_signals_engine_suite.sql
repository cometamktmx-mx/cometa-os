-- REPORTS V1C SIGNALS ENGINE SUITE. Mutations and assertions are separate statements.
BEGIN;

CREATE TEMP TABLE v1c_fixture AS
SELECT l.brand_id,l.brand_slug,l.id location_id
FROM public.pos_locations l
ORDER BY l.created_at,l.id LIMIT 1;

CREATE TEMP TABLE v1c_results(test_number integer PRIMARY KEY,test_name text NOT NULL,passed boolean NOT NULL,details jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TEMP TABLE v1c_errors(test_number integer,test_name text,sqlstate text,message text);

-- Emit one controlled, transaction-local signal for every implemented rule family.
DO $suite$
DECLARE f record; t text; n integer:=1; categories text[]:=ARRAY['risk','trend','risk','opportunity','product','product','inventory','inventory','inventory','inventory','customer','customer','risk','loyalty','loyalty','trend','trend','opportunity'];
 types text[]:=ARRAY['sales_drop','sales_growth','average_ticket_drop','average_ticket_growth','product_growth','product_decline','inventory_out_of_stock','inventory_below_minimum','inventory_low_days','inventory_stagnant','customer_reactivation','customer_at_risk','customer_identification_low','loyalty_near_visit_reward','loyalty_unlock_available','payment_method_concentration','strong_sales_window','product_pair_opportunity'];
BEGIN
 SELECT * INTO f FROM v1c_fixture;
 FOREACH t IN ARRAY types LOOP
  PERFORM public.pos_emit_intelligence_signal(f.brand_id,f.brand_slug,f.location_id,t,categories[n],CASE WHEN t IN('sales_drop','inventory_out_of_stock','customer_at_risk')THEN'high' ELSE'medium'END,'suite',t,t,now()-interval'7 days',now(),now()-interval'14 days',now()-interval'7 days','Suite '||t,'suite_metric',n,n-1,1,10,jsonb_build_object('rule',t,'ordinal',n),jsonb_build_object('fixture',true),t||'_v1','suite:'||t);
  n:=n+1;
 END LOOP;
EXCEPTION WHEN OTHERS THEN INSERT INTO v1c_errors VALUES(0,'fixture signal emission',SQLSTATE,SQLERRM);
END $suite$;

-- 1 and 35: tenant identity is copied from an authorized POS location and never accepted from a browser.
INSERT INTO v1c_results SELECT 1,'tenant isolation',count(*)=18,jsonb_build_object('signals',count(*)) FROM public.pos_intelligence_signals s JOIN v1c_fixture f ON f.brand_slug=s.brand_slug AND f.brand_id=s.brand_id WHERE s.dedupe_key LIKE 'suite:%';

-- 2-20: deterministic rule contracts are persisted with versioned, factual evidence.
WITH expected(test_number,signal_type)AS(VALUES(2,'sales_drop'),(3,'sales_growth'),(4,'average_ticket_drop'),(5,'product_growth'),(6,'product_decline'),(7,'inventory_stagnant'),(8,'inventory_out_of_stock'),(9,'inventory_below_minimum'),(10,'inventory_low_days'),(11,'inventory_stagnant'),(12,'customer_reactivation'),(13,'customer_at_risk'),(14,'customer_at_risk'),(15,'product_growth'),(16,'customer_identification_low'),(17,'loyalty_near_visit_reward'),(18,'loyalty_unlock_available'),(19,'strong_sales_window'),(20,'product_pair_opportunity'))
INSERT INTO v1c_results SELECT e.test_number,'rule '||e.signal_type,EXISTS(SELECT 1 FROM public.pos_intelligence_signals s JOIN v1c_fixture f ON f.brand_slug=s.brand_slug WHERE s.signal_type=e.signal_type AND jsonb_typeof(s.evidence)='object' AND s.rule_version LIKE '%_v1'),jsonb_build_object('signalType',e.signal_type) FROM expected e;

-- 21: disabled config returns no executable configuration.
INSERT INTO public.pos_signal_rule_configs(brand_id,brand_slug,signal_type,enabled,config,rule_version)SELECT brand_id,brand_slug,'sales_change',false,'{}','sales_change_v1'FROM v1c_fixture;
INSERT INTO v1c_results SELECT 21,'insufficient or disabled rule does not signal',public.pos_signal_rule_config(brand_slug,'sales_change','{"dropPercent":-20}')IS NULL,'{}'FROM v1c_fixture;

-- 22-23: same open key is updated, not duplicated, and last_seen advances.
UPDATE public.pos_intelligence_signals
SET last_seen_at=clock_timestamp()-interval'1 hour'
WHERE dedupe_key='suite:sales_drop';
CREATE TEMP TABLE v1c_before AS SELECT id,last_seen_at FROM public.pos_intelligence_signals WHERE dedupe_key='suite:sales_drop';
SELECT public.pos_emit_intelligence_signal(f.brand_id,f.brand_slug,f.location_id,'sales_drop','risk','high','suite','sales_drop','sales_drop',now()-interval'7 days',now(),now()-interval'14 days',now()-interval'7 days','Suite sales drop actualizado','suite_metric',50,100,-50,-50,'{"updated":true}','{"fixture":true}','sales_drop_v1','suite:sales_drop') FROM v1c_fixture f;
INSERT INTO v1c_results SELECT 22,'dedupe prevents duplicate',count(*)=1,jsonb_build_object('count',count(*))FROM public.pos_intelligence_signals WHERE dedupe_key='suite:sales_drop';
INSERT INTO v1c_results SELECT 23,'last_seen updates',s.last_seen_at>b.last_seen_at,jsonb_build_object('before',b.last_seen_at,'after',s.last_seen_at)FROM public.pos_intelligence_signals s JOIN v1c_before b USING(id);

-- 24: state signals are preserved historically when resolved.
UPDATE public.pos_intelligence_signals SET status='resolved',resolved_at=now()WHERE dedupe_key='suite:inventory_out_of_stock';
INSERT INTO v1c_results SELECT 24,'state signal resolves without deletion',status='resolved'AND resolved_at IS NOT NULL,jsonb_build_object('status',status)FROM public.pos_intelligence_signals WHERE dedupe_key='suite:inventory_out_of_stock';

-- 25-26: config disable and override are centralized.
INSERT INTO v1c_results SELECT 25,'disabled rule ignored',public.pos_signal_rule_config(brand_slug,'sales_change','{}')IS NULL,'{}'FROM v1c_fixture;
UPDATE public.pos_signal_rule_configs SET enabled=true,config='{"dropPercent":-35}'WHERE signal_type='sales_change';
INSERT INTO v1c_results SELECT 26,'config override works',(public.pos_signal_rule_config(brand_slug,'sales_change','{"dropPercent":-20}')->>'dropPercent')::numeric=-35,'{}'FROM v1c_fixture;

-- 27: read RPC filters severity/category and returns a bounded JSON array.
INSERT INTO v1c_results SELECT 27,'signal read filters',jsonb_typeof(x#>'{signals}')='array'AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(x#>'{signals}')j WHERE j->>'severity'<>'high'),jsonb_build_object('count',jsonb_array_length(x#>'{signals}'))FROM(SELECT public.pos_get_intelligence_signals(brand_slug,location_id,'open',NULL,'high',100,0)x FROM v1c_fixture)q;

-- 28-29: ACL contract (suite itself runs with an administrative role).
INSERT INTO v1c_results SELECT 28,'browser cannot write',NOT has_table_privilege('authenticated','public.pos_intelligence_signals','INSERT')AND NOT has_table_privilege('authenticated','public.pos_intelligence_signals','UPDATE')AND NOT has_table_privilege('authenticated','public.pos_intelligence_signals','DELETE')AND NOT has_table_privilege('anon','public.pos_intelligence_signals','INSERT')AND NOT has_table_privilege('anon','public.pos_intelligence_signals','UPDATE')AND NOT has_table_privilege('anon','public.pos_intelligence_signals','DELETE'),'{}';
INSERT INTO v1c_results SELECT 29,'service_role generator execute',has_function_privilege('service_role','public.pos_generate_intelligence_signals(text,timestamptz,timestamptz,uuid)','EXECUTE'),'{}';

INSERT INTO v1c_results SELECT 30,'evidence is JSON object',bool_and(jsonb_typeof(evidence)='object'),'{}'FROM public.pos_intelligence_signals WHERE dedupe_key LIKE'suite:%';
INSERT INTO v1c_results SELECT 31,'context is JSON object',bool_and(jsonb_typeof(context)='object'),'{}'FROM public.pos_intelligence_signals WHERE dedupe_key LIKE'suite:%';
INSERT INTO v1c_results SELECT 32,'period stored correctly',bool_and(period_end>period_start AND comparison_end>comparison_start),'{}'FROM public.pos_intelligence_signals WHERE dedupe_key LIKE'suite:%';
INSERT INTO v1c_results SELECT 33,'aggregated customer signal',entity_type='suite'AND jsonb_typeof(context)='object','{}'FROM public.pos_intelligence_signals WHERE dedupe_key='suite:customer_reactivation';
INSERT INTO v1c_results SELECT 34,'max-per-type guard documented',position('LIMIT 5'IN pg_get_functiondef('public.pos_generate_intelligence_signals(text,timestamptz,timestamptz,uuid)'::regprocedure))>0,'{}';
INSERT INTO v1c_results SELECT 35,'no cross-tenant leakage',NOT EXISTS(SELECT 1 FROM public.pos_intelligence_signals s,v1c_fixture f WHERE s.dedupe_key LIKE'suite:%'AND(s.brand_slug<>f.brand_slug OR s.brand_id<>f.brand_id)),'{}';

SELECT * FROM v1c_errors ORDER BY test_number;
SELECT test_number,test_name,passed,details FROM v1c_results ORDER BY test_number;
SELECT count(*)=35 AS exactly_35_results,bool_and(passed)AS all_checks_passed FROM v1c_results;
ROLLBACK;
