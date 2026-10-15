WITH checks AS (
  SELECT 1 AS test_no, 'operational products RPC exists' AS test_name,
    EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'pos_get_operational_report_products_v1'
    ) AS passed,
    jsonb_build_object('rpc', 'pos_get_operational_report_products_v1') AS details
  UNION ALL
  SELECT 2, 'operational products RPC is SECURITY DEFINER with public search_path',
    EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'pos_get_operational_report_products_v1'
        AND p.prosecdef
        AND p.proconfig @> ARRAY['search_path=public']
    ),
    jsonb_build_object('security', 'SECURITY DEFINER', 'search_path', 'public')
  UNION ALL
  SELECT 3, 'operational products RPC is not browser executable',
    NOT has_function_privilege('anon', 'public.pos_get_operational_report_products_v1(text,timestamptz,timestamptz,uuid,integer)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.pos_get_operational_report_products_v1(text,timestamptz,timestamptz,uuid,integer)', 'EXECUTE'),
    jsonb_build_object('anon_execute', has_function_privilege('anon', 'public.pos_get_operational_report_products_v1(text,timestamptz,timestamptz,uuid,integer)', 'EXECUTE'), 'authenticated_execute', has_function_privilege('authenticated', 'public.pos_get_operational_report_products_v1(text,timestamptz,timestamptz,uuid,integer)', 'EXECUTE'))
  UNION ALL
  SELECT 4, 'RPC definition uses completed sales, snapshot cost, product grouping and inventory authority',
    position('s.status = ''completed''' IN pg_get_functiondef(p.oid)) > 0
    AND position('i.unit_cost * i.quantity' IN pg_get_functiondef(p.oid)) > 0
    AND position('GROUP BY i.product_id, i.variant_id' IN pg_get_functiondef(p.oid)) > 0
    AND position('public.pos_inventory' IN pg_get_functiondef(p.oid)) > 0,
    jsonb_build_object('requirements', jsonb_build_array('completed', 'unit_cost snapshot', 'product_id grouping', 'pos_inventory'))
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'pos_get_operational_report_products_v1'
  LIMIT 1
)
SELECT test_no, test_name, passed, details FROM checks ORDER BY test_no;
