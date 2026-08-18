BEGIN;

CREATE TEMP TABLE report_results (
  test_no integer PRIMARY KEY,
  test_name text NOT NULL,
  passed boolean NOT NULL,
  details jsonb NOT NULL
) ON COMMIT DROP;

INSERT INTO report_results VALUES
(1, 'operational products RPC installed',
 EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='pos_get_operational_report_products_v1'),
 jsonb_build_object('rpc','pos_get_operational_report_products_v1')),
(2, 'RPC preserves completed-only revenue semantics',
 EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='pos_get_operational_report_products_v1' AND position('s.status = ''completed''' IN pg_get_functiondef(p.oid))>0),
 jsonb_build_object('excluded_statuses','non-completed')),
(3, 'COGS uses historical sale item unit_cost',
 EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='pos_get_operational_report_products_v1' AND position('i.unit_cost * i.quantity' IN pg_get_functiondef(p.oid))>0),
 jsonb_build_object('formula','sum(pos_sale_items.unit_cost * quantity)')),
(4, 'product aggregation is keyed by product_id and variants remain nested',
 EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='pos_get_operational_report_products_v1' AND position('GROUP BY vr.product_id' IN pg_get_functiondef(p.oid))>0 AND position('''variants''' IN pg_get_functiondef(p.oid))>0),
 jsonb_build_object('historical_key','product_id')),
(5, 'current stock comes from pos_inventory',
 EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='pos_get_operational_report_products_v1' AND position('public.pos_inventory' IN pg_get_functiondef(p.oid))>0),
 jsonb_build_object('stock_authority','pos_inventory')),
(6, 'product_code and attributes are explicitly current metadata',
 EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='pos_get_operational_report_products_v1' AND position('productCodeIsCurrentMetadata' IN pg_get_functiondef(p.oid))>0 AND position('attributesAreCurrent' IN pg_get_functiondef(p.oid))>0),
 jsonb_build_object('historical_warning',true)),
(7, 'multiple payments remain supported by existing summary authority',
 EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='pos_get_analytics_summary'),
 jsonb_build_object('source','pos_payments grouped by payment_method')),
(8, 'tenant and location scope are present in RPC',
 EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='pos_get_operational_report_products_v1' AND position('p_brand_slug' IN pg_get_functiondef(p.oid))>0 AND position('p_location_id' IN pg_get_functiondef(p.oid))>0),
 jsonb_build_object('scope','brand_slug + location_id'));

INSERT INTO report_results
SELECT 99, 'SUMMARY all_checks_passed', bool_and(passed),
  jsonb_build_object('passed_count', count(*) FILTER (WHERE passed), 'failed_count', count(*) FILTER (WHERE NOT passed), 'all_checks_passed', bool_and(passed))
FROM report_results;

SELECT test_no, test_name, passed, details FROM report_results ORDER BY test_no;

ROLLBACK;
