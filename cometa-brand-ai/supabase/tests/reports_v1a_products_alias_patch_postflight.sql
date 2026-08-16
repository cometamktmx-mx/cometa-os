-- REPORTS V1A PRODUCTS ALIAS PATCH — POST-FLIGHT
-- READ ONLY

WITH target AS (
  SELECT
    p.oid,
    p.proname,
    pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    p.prosecdef,
    p.proconfig,
    p.proacl,
    p.proowner,
    pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'pos_get_analytics_products'
), checks AS (
  SELECT
    'FUNCTION exists exactly once'::text AS check_name,
    count(*) = 1 AS passed,
    count(*)::text AS actual,
    '1'::text AS expected
  FROM target

  UNION ALL
  SELECT
    'FUNCTION signature',
    count(*) = 1,
    COALESCE(string_agg(identity_arguments, '; '), 'absent'),
    'p_brand_slug text, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_location_id uuid, p_limit integer, p_order_by text'
  FROM target
  WHERE identity_arguments = 'p_brand_slug text, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_location_id uuid, p_limit integer, p_order_by text'

  UNION ALL
  SELECT 'FUNCTION security definer',bool_and(prosecdef),string_agg(prosecdef::text,','),'true' FROM target

  UNION ALL
  SELECT 'FUNCTION search_path',bool_and('search_path=public'=ANY(COALESCE(proconfig,'{}'))),
    string_agg(COALESCE(array_to_string(proconfig,','),'null'),'; '),'search_path=public' FROM target

  UNION ALL
  SELECT 'ACL service_role execute',bool_and(has_function_privilege('service_role',oid,'EXECUTE')),
    count(*) FILTER(WHERE has_function_privilege('service_role',oid,'EXECUTE'))||' granted','1 granted' FROM target

  UNION ALL
  SELECT 'ACL browser denied',bool_and(
      NOT has_function_privilege('anon',oid,'EXECUTE')
      AND NOT has_function_privilege('authenticated',oid,'EXECUTE')
      AND NOT EXISTS(
        SELECT 1 FROM aclexplode(COALESCE(proacl,acldefault('f',proowner))) a
        WHERE a.grantee=0 AND a.privilege_type='EXECUTE'
      )
    ),
    count(*) FILTER(WHERE
      has_function_privilege('anon',oid,'EXECUTE')
      OR has_function_privilege('authenticated',oid,'EXECUTE')
      OR EXISTS(
        SELECT 1 FROM aclexplode(COALESCE(proacl,acldefault('f',proowner))) a
        WHERE a.grantee=0 AND a.privilege_type='EXECUTE'
      )
    )||' exposed','0 exposed' FROM target

  UNION ALL
  SELECT 'DEFINITION corrected outer aliases',bool_and(
      position('x."productName"' in definition)>0
      AND position('x."variantName"' in definition)>0
      AND position('x.product_name' in definition)=0
      AND position('x.variant_name' in definition)=0
    ),
    string_agg(
      'camelCase='||(position('x."productName"' in definition)>0 AND position('x."variantName"' in definition)>0)::text
      ||'/invalidSnakeCase='||(position('x.product_name' in definition)>0 OR position('x.variant_name' in definition)>0)::text,
      '; '
    ),
    'camelCase=true/invalidSnakeCase=false'
  FROM target
)
SELECT check_name,passed,actual,expected FROM checks
UNION ALL
SELECT 'SUMMARY all_checks_passed',bool_and(passed),bool_and(passed)::text,'true' FROM checks;
