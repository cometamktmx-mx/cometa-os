-- REPORTS V1C SIGNALS READ ALIAS PATCH — READ ONLY
WITH target AS (
  SELECT
    p.oid,
    p.prosecdef,
    p.proconfig,
    p.proacl,
    p.proowner,
    pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    pg_get_functiondef(p.oid) AS definition
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'pos_get_intelligence_signals'
), checks AS (
  SELECT
    'FUNCTION exists exactly once' AS check_name,
    count(*) = 1 AS passed,
    count(*)::text AS actual,
    '1' AS expected
  FROM target

  UNION ALL
  SELECT
    'FUNCTION signature',
    count(*) = 1 AND bool_and(
      identity_arguments =
      'p_brand_slug text, p_location_id uuid, p_status text, p_category text, p_severity text, p_limit integer, p_offset integer'
    ),
    COALESCE(string_agg(identity_arguments, '; '), 'absent'),
    'p_brand_slug text, p_location_id uuid, p_status text, p_category text, p_severity text, p_limit integer, p_offset integer'
  FROM target

  UNION ALL
  SELECT
    'SECURITY DEFINER',
    count(*) = 1 AND bool_and(prosecdef),
    COALESCE(string_agg(prosecdef::text, ','), 'absent'),
    'true'
  FROM target

  UNION ALL
  SELECT
    'search_path public',
    count(*) = 1 AND bool_and('search_path=public' = ANY(COALESCE(proconfig, '{}'))),
    COALESCE(string_agg(array_to_string(proconfig, ','), '; '), 'absent'),
    'search_path=public'
  FROM target

  UNION ALL
  SELECT
    'service_role execute',
    count(*) = 1 AND bool_and(has_function_privilege('service_role', oid, 'EXECUTE')),
    count(*) FILTER (WHERE has_function_privilege('service_role', oid, 'EXECUTE')) || ' granted',
    '1 granted'
  FROM target

  UNION ALL
  SELECT
    'browser and PUBLIC denied',
    count(*) = 1 AND bool_and(
      NOT has_function_privilege('anon', oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')
      AND NOT EXISTS (
        SELECT 1
        FROM aclexplode(COALESCE(proacl, acldefault('f', proowner))) AS acl
        WHERE acl.grantee = 0
          AND acl.privilege_type = 'EXECUTE'
      )
    ),
    count(*) FILTER (
      WHERE has_function_privilege('anon', oid, 'EXECUTE')
         OR has_function_privilege('authenticated', oid, 'EXECUTE')
    ) || ' browser-exposed',
    '0 browser-exposed'
  FROM target

  UNION ALL
  SELECT
    'invalid outer alias absent',
    count(*) = 1 AND bool_and(position('x.detected_at' IN definition) = 0),
    CASE
      WHEN count(*) = 0 THEN 'function absent'
      WHEN bool_and(position('x.detected_at' IN definition) = 0) THEN 'x.detected_at absent'
      ELSE 'x.detected_at present'
    END,
    'x.detected_at absent'
  FROM target

  UNION ALL
  SELECT
    'correct outer alias present',
    count(*) = 1 AND bool_and(position('x."detectedAt"' IN definition) > 0),
    CASE
      WHEN count(*) = 0 THEN 'function absent'
      WHEN bool_and(position('x."detectedAt"' IN definition) > 0) THEN 'x."detectedAt" present'
      ELSE 'x."detectedAt" absent'
    END,
    'x."detectedAt" present'
  FROM target
)
SELECT check_name, passed, actual, expected
FROM checks

UNION ALL

SELECT
  'SUMMARY all_checks_passed',
  bool_and(passed),
  bool_and(passed)::text,
  'true'
FROM checks;
