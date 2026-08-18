BEGIN;

CREATE TEMP TABLE reports_export_v1b_results (
  test_no integer,
  test_name text,
  passed boolean,
  details jsonb
) ON COMMIT DROP;

DO $$
DECLARE
  products_definition text;
  inventory_definition text;
BEGIN
  SELECT pg_get_functiondef('public.pos_get_reports_export_products_v1(text,timestamptz,timestamptz,uuid)'::regprocedure)
    INTO products_definition;
  SELECT pg_get_functiondef('public.pos_get_reports_export_inventory_v1(text,timestamptz,timestamptz,uuid)'::regprocedure)
    INTO inventory_definition;

  INSERT INTO reports_export_v1b_results VALUES
    (1, 'products export uses completed sales only', products_definition LIKE '%s.status = ''completed''%', '{}'::jsonb),
    (2, 'products export uses historical unit cost', products_definition LIKE '%i.unit_cost * i.quantity%', '{}'::jsonb),
    (3, 'products export uses current inventory authority', products_definition LIKE '%public.pos_inventory%', '{}'::jsonb),
    (4, 'products export scopes brand and location', products_definition LIKE '%s.brand_slug = p_brand_slug%' AND products_definition LIKE '%p_location_id%', '{}'::jsonb),
    (5, 'products export declares current metadata', products_definition LIKE '%currentAttributes%' AND products_definition LIKE '%productCode%', '{}'::jsonb),
    (6, 'inventory export uses inventory authority', inventory_definition LIKE '%public.pos_inventory%', '{}'::jsonb),
    (7, 'inventory export supports location scope', inventory_definition LIKE '%p_location_id%', '{}'::jsonb),
    (8, 'inventory export has no visual limit', inventory_definition NOT LIKE '%LIMIT p_%', '{}'::jsonb),
    (9, 'inventory export exposes current estimated value', inventory_definition LIKE '%estimated_inventory_value%', '{}'::jsonb);
END
$$;

INSERT INTO reports_export_v1b_results
SELECT 10, 'export functions are security definer',
  bool_and(p.prosecdef),
  jsonb_build_object('functions', count(*))
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('pos_get_reports_export_products_v1', 'pos_get_reports_export_inventory_v1');

INSERT INTO reports_export_v1b_results
SELECT 11, 'business report data remains tenant scoped',
  NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('pos_get_reports_export_products_v1', 'pos_get_reports_export_inventory_v1')
      AND pg_get_functiondef(p.oid) NOT LIKE '%p_brand_slug%'
  ), '{}'::jsonb;

INSERT INTO reports_export_v1b_results
SELECT 99, 'SUMMARY all_checks_passed', bool_and(passed),
  jsonb_build_object(
    'passed_count', count(*) FILTER (WHERE passed),
    'failed_count', count(*) FILTER (WHERE NOT passed),
    'all_checks_passed', bool_and(passed)
  )
FROM reports_export_v1b_results;

SELECT test_no, test_name, passed, details
FROM reports_export_v1b_results
ORDER BY test_no;

ROLLBACK;
