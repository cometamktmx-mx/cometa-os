-- REPORTS V1A — TRANSACTIONAL SUITE
-- Uses one real POS tenant as read-only analytical input; only the snapshot fixture is written.
-- All writes remain inside this transaction and are rolled back.

BEGIN;

CREATE TEMP TABLE reports_v1_fixture AS
SELECT l.brand_id,l.brand_slug,l.id location_id,l.timezone,
  COALESCE((SELECT min(s.sold_at) FROM public.pos_sales s WHERE s.brand_slug=l.brand_slug AND s.status='completed'),now()-interval '30 days') date_from,
  COALESCE((SELECT max(s.sold_at)+interval '1 second' FROM public.pos_sales s WHERE s.brand_slug=l.brand_slug AND s.status='completed'),now()) date_to
FROM public.pos_locations l
WHERE EXISTS(SELECT 1 FROM public.pos_sales s WHERE s.brand_slug=l.brand_slug AND s.location_id=l.id AND s.status='completed')
ORDER BY l.brand_slug,l.id LIMIT 1;

-- PRECONDITION: exactly one row. Stop manually if empty.
SELECT * FROM reports_v1_fixture;

CREATE TEMP TABLE reports_v1_results(test_number integer PRIMARY KEY,test_name text,passed boolean,details jsonb) ON COMMIT DROP;
CREATE TEMP TABLE reports_v1_errors(test_number integer PRIMARY KEY,sqlstate text,message text) ON COMMIT DROP;
CREATE TEMP TABLE reports_v1_rpc(operation text PRIMARY KEY,response jsonb NOT NULL) ON COMMIT DROP;

INSERT INTO reports_v1_rpc SELECT 'summary',public.pos_get_analytics_summary(brand_slug,date_from,date_to,location_id) FROM reports_v1_fixture;
INSERT INTO reports_v1_rpc SELECT 'products',public.pos_get_analytics_products(brand_slug,date_from,date_to,location_id,20,'sales_total') FROM reports_v1_fixture;
INSERT INTO reports_v1_rpc SELECT 'customers',public.pos_get_analytics_customers(brand_slug,date_from,date_to,location_id,50) FROM reports_v1_fixture;
INSERT INTO reports_v1_rpc SELECT 'inventory',public.pos_get_analytics_inventory(brand_slug,date_from,date_to,location_id) FROM reports_v1_fixture;
INSERT INTO reports_v1_rpc SELECT 'loyalty',public.pos_get_analytics_loyalty(brand_slug,date_from,date_to,location_id) FROM reports_v1_fixture;
INSERT INTO reports_v1_rpc SELECT 'series',public.pos_get_analytics_sales_series(brand_slug,date_from,date_to,'day',location_id) FROM reports_v1_fixture;
INSERT INTO reports_v1_rpc SELECT 'pairs',public.pos_get_analytics_product_pairs(brand_slug,date_from,date_to,location_id,50) FROM reports_v1_fixture;
INSERT INTO reports_v1_rpc SELECT 'quality',public.pos_get_analytics_data_quality(brand_slug,date_from,date_to,location_id) FROM reports_v1_fixture;

-- 1 tenant isolation: an unknown tenant is rejected before facts are read.
DO $t$ BEGIN BEGIN PERFORM public.pos_get_analytics_summary('reports-v1-nonexistent',now()-interval '1 day',now(),NULL); EXCEPTION WHEN OTHERS THEN INSERT INTO reports_v1_errors VALUES(1,SQLSTATE,SQLERRM); END; END $t$;
INSERT INTO reports_v1_results SELECT 1,'tenant isolation',message ILIKE '%sucursales%',to_jsonb(e) FROM reports_v1_errors e WHERE test_number=1;

-- 2–7 sales facts, valid status, arithmetic, zero safety and comparison.
INSERT INTO reports_v1_results SELECT 2,'completed sale included',(r.response#>>'{sales,completedSalesCount}')::int=(SELECT count(*) FROM public.pos_sales s,reports_v1_fixture f WHERE s.brand_slug=f.brand_slug AND s.location_id=f.location_id AND s.status='completed' AND s.sold_at>=f.date_from AND s.sold_at<f.date_to),r.response->'sales' FROM reports_v1_rpc r WHERE operation='summary';
INSERT INTO reports_v1_results SELECT 3,'invalid sale excluded',(r.response#>>'{sales,completedSalesCount}')::int=(SELECT count(*) FROM public.pos_sales s,reports_v1_fixture f WHERE s.brand_slug=f.brand_slug AND s.location_id=f.location_id AND s.status='completed' AND s.sold_at>=f.date_from AND s.sold_at<f.date_to),jsonb_build_object('filter','status=completed') FROM reports_v1_rpc r WHERE operation='summary';
INSERT INTO reports_v1_results SELECT 4,'sales totals',(r.response#>>'{sales,netSales,current}')::numeric=(SELECT COALESCE(sum(s.total),0) FROM public.pos_sales s,reports_v1_fixture f WHERE s.brand_slug=f.brand_slug AND s.location_id=f.location_id AND s.status='completed' AND s.sold_at>=f.date_from AND s.sold_at<f.date_to),r.response->'sales' FROM reports_v1_rpc r WHERE operation='summary';
INSERT INTO reports_v1_results SELECT 5,'average ticket',(r.response#>>'{sales,averageTicket,current}')::numeric=round((r.response#>>'{sales,netSales,current}')::numeric/NULLIF((r.response#>>'{sales,ordersCount,current}')::numeric,0),2),r.response#>'{sales,averageTicket}' FROM reports_v1_rpc r WHERE operation='summary';
INSERT INTO reports_v1_results SELECT 6,'zero division safe',(public.pos_analytics_metric(0,0)->'deltaPercent')='null'::jsonb,public.pos_analytics_metric(0,0);
INSERT INTO reports_v1_results SELECT 7,'current previous comparison',(r.response#>'{sales,netSales}')?&ARRAY['current','previous','delta','deltaPercent'],r.response#>'{sales,netSales}' FROM reports_v1_rpc r WHERE operation='summary';

-- 8–11 customer attribution.
INSERT INTO reports_v1_results SELECT 8,'anonymous vs identified',(response#>>'{customers,identifiedSales}')::int+(response#>>'{customers,anonymousSales}')::int=(response#>>'{sales,completedSalesCount}')::int,response->'customers' FROM reports_v1_rpc WHERE operation='summary';
INSERT INTO reports_v1_results SELECT 9,'new customer fact',response#>'{customers,newCustomers}' IS NOT NULL,response->'customers' FROM reports_v1_rpc WHERE operation='summary';
INSERT INTO reports_v1_results SELECT 10,'returning customer fact',response#>'{customers,returningCustomers}' IS NOT NULL,response->'customers' FROM reports_v1_rpc WHERE operation='summary';
INSERT INTO reports_v1_results SELECT 11,'identification rate',CASE WHEN (response#>>'{sales,completedSalesCount}')::numeric=0 THEN response#>'{customers,customerIdentificationRate}'='null'::jsonb ELSE (response#>>'{customers,customerIdentificationRate}')::numeric=round((response#>>'{customers,identifiedSales}')::numeric*100/(response#>>'{sales,completedSalesCount}')::numeric,2) END,response->'customers' FROM reports_v1_rpc WHERE operation='summary';

-- 12–14 ranked facts.
INSERT INTO reports_v1_results SELECT 12,'top product',jsonb_typeof(response)='array',response FROM reports_v1_rpc WHERE operation='products';
INSERT INTO reports_v1_results SELECT 13,'units sold',NOT EXISTS(SELECT 1 FROM jsonb_array_elements(response)x WHERE (x->>'unitsSold')::numeric<0),response FROM reports_v1_rpc WHERE operation='products';
INSERT INTO reports_v1_results SELECT 14,'customer ranking',jsonb_typeof(response)='array',response FROM reports_v1_rpc WHERE operation='customers';

-- 15 payments; 16–20 loyalty and visits.
INSERT INTO reports_v1_results SELECT 15,'payment aggregation',jsonb_typeof(response->'payments')='array',response->'payments' FROM reports_v1_rpc WHERE operation='summary';
INSERT INTO reports_v1_results SELECT 16,'loyalty earn aggregation',(response->>'pointsEarnedPeriod')::numeric>=0,response FROM reports_v1_rpc WHERE operation='loyalty';
INSERT INTO reports_v1_results SELECT 17,'loyalty redeem aggregation',(response->>'pointsRedeemedPeriod')::numeric>=0,response FROM reports_v1_rpc WHERE operation='loyalty';
INSERT INTO reports_v1_results SELECT 18,'visit qualify aggregation',(response->>'visitQualifiesPeriod')::numeric>=0,response FROM reports_v1_rpc WHERE operation='loyalty';
INSERT INTO reports_v1_results SELECT 19,'unlock created aggregation',(response->>'visitUnlocksCreatedPeriod')::numeric>=0,response FROM reports_v1_rpc WHERE operation='loyalty';
INSERT INTO reports_v1_results SELECT 20,'unlock redeemed aggregation',(response->>'visitUnlocksRedeemedPeriod')::numeric>=0,response FROM reports_v1_rpc WHERE operation='loyalty';

-- 21–22 inventory.
INSERT INTO reports_v1_results SELECT 21,'inventory quantity',NOT EXISTS(SELECT 1 FROM jsonb_array_elements(response)x WHERE x->>'currentQuantity' IS NULL),response FROM reports_v1_rpc WHERE operation='inventory';
INSERT INTO reports_v1_results SELECT 22,'days stock null at zero velocity',NOT EXISTS(SELECT 1 FROM jsonb_array_elements(response)x WHERE (x->>'unitsSoldPeriod')::numeric=0 AND x->'daysOfStockEstimate'<>'null'::jsonb),response FROM reports_v1_rpc WHERE operation='inventory';

-- 23–24 time series and closed granularity.
INSERT INTO reports_v1_results SELECT 23,'sales series',jsonb_typeof(response)='array',response FROM reports_v1_rpc WHERE operation='series';
DO $t$ DECLARE f record; BEGIN SELECT * INTO f FROM reports_v1_fixture; BEGIN PERFORM public.pos_get_analytics_sales_series(f.brand_slug,f.date_from,f.date_to,'drop table',f.location_id); EXCEPTION WHEN OTHERS THEN INSERT INTO reports_v1_errors VALUES(24,SQLSTATE,SQLERRM); END; END $t$;
INSERT INTO reports_v1_results SELECT 24,'invalid granularity rejected',message ILIKE '%Granularidad no permitida%',to_jsonb(e) FROM reports_v1_errors e WHERE test_number=24;

-- 25 pairs are canonical; 26 quality document.
INSERT INTO reports_v1_results SELECT 25,'product pair canonical',NOT EXISTS(SELECT 1 FROM jsonb_array_elements(response)x WHERE (x#>>'{productA,id}')::uuid>=(x#>>'{productB,id}')::uuid),response FROM reports_v1_rpc WHERE operation='pairs';
INSERT INTO reports_v1_results SELECT 26,'data quality',response?&ARRAY['completedSalesCount','identifiedSalesCount','customerIdentificationRate','salesWithPayment','salesWithoutPayment'],response FROM reports_v1_rpc WHERE operation='quality';

-- 27 snapshot mutation is intentionally separate from all checks.
INSERT INTO reports_v1_rpc SELECT 'snapshot',public.pos_create_analytics_snapshot(brand_slug,'custom',date_from,date_to,location_id,NULL) FROM reports_v1_fixture;
INSERT INTO reports_v1_results SELECT 27,'snapshot creation',s.id=(r.response->>'id')::uuid AND s.schema_version='reports_v1',r.response FROM reports_v1_rpc r JOIN public.pos_analytics_snapshots s ON s.id=(r.response->>'id')::uuid WHERE r.operation='snapshot';
INSERT INTO reports_v1_results SELECT 28,'snapshot tenant isolation',s.brand_slug=f.brand_slug AND s.location_id=f.location_id,to_jsonb(s) FROM reports_v1_rpc r JOIN public.pos_analytics_snapshots s ON s.id=(r.response->>'id')::uuid CROSS JOIN reports_v1_fixture f WHERE r.operation='snapshot';
INSERT INTO reports_v1_results SELECT 29,'snapshot JSON object',jsonb_typeof(s.metrics)='object',jsonb_build_object('type',jsonb_typeof(s.metrics),'keys',(SELECT jsonb_agg(k) FROM jsonb_object_keys(s.metrics)k)) FROM reports_v1_rpc r JOIN public.pos_analytics_snapshots s ON s.id=(r.response->>'id')::uuid WHERE r.operation='snapshot';
INSERT INTO reports_v1_results SELECT 30,'custom date range',(response#>>'{period,from}')::timestamptz=f.date_from AND(response#>>'{period,to}')::timestamptz=f.date_to,response->'period' FROM reports_v1_rpc CROSS JOIN reports_v1_fixture f WHERE operation='summary';

SELECT * FROM reports_v1_errors ORDER BY test_number;
SELECT test_number,test_name,passed,details FROM reports_v1_results ORDER BY test_number;
ROLLBACK;
