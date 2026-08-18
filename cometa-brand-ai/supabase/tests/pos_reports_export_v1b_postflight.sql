WITH checks AS (
  SELECT 1 AS test_no, 'products export RPC installed' AS test_name,
    to_regprocedure('public.pos_get_reports_export_products_v1(text,timestamptz,timestamptz,uuid)') IS NOT NULL AS passed,
    '{}'::jsonb AS details
  UNION ALL
  SELECT 2, 'inventory export RPC installed',
    to_regprocedure('public.pos_get_reports_export_inventory_v1(text,timestamptz,timestamptz,uuid)') IS NOT NULL,
    '{}'::jsonb
  UNION ALL
  SELECT 3, 'products export service role only',
    has_function_privilege('service_role', 'public.pos_get_reports_export_products_v1(text,timestamptz,timestamptz,uuid)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.pos_get_reports_export_products_v1(text,timestamptz,timestamptz,uuid)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public.pos_get_reports_export_products_v1(text,timestamptz,timestamptz,uuid)', 'EXECUTE'),
    '{}'::jsonb
  UNION ALL
  SELECT 4, 'inventory export service role only',
    has_function_privilege('service_role', 'public.pos_get_reports_export_inventory_v1(text,timestamptz,timestamptz,uuid)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.pos_get_reports_export_inventory_v1(text,timestamptz,timestamptz,uuid)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public.pos_get_reports_export_inventory_v1(text,timestamptz,timestamptz,uuid)', 'EXECUTE'),
    '{}'::jsonb
), summary AS (
  SELECT bool_and(passed) AS passed,
    count(*) FILTER (WHERE passed) AS passed_count,
    count(*) FILTER (WHERE NOT passed) AS failed_count
  FROM checks
)
SELECT test_no, test_name, passed, details FROM checks
UNION ALL
SELECT 99, 'SUMMARY all_checks_passed', passed,
  jsonb_build_object('passed_count', passed_count, 'failed_count', failed_count, 'all_checks_passed', passed)
FROM summary
ORDER BY test_no;
