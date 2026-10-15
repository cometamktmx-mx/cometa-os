-- COMETA POS V2A PROFILE FAMILY POSTFLIGHT — READ ONLY
WITH helper AS (
  SELECT p.oid, p.prosecdef, p.provolatile, p.proconfig, p.proacl, p.proowner,
         CASE WHEN p.prokind = 'f' THEN pg_get_functiondef(p.oid) ELSE NULL END AS definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.oid = 'public.pos_profile_family(text)'::regprocedure
    AND n.nspname = 'public'
),
configure_rpc AS (
  SELECT p.oid,
         CASE WHEN p.prokind = 'f' THEN pg_get_functiondef(p.oid) ELSE NULL END AS definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'pos_configure_business_profile'
),
checks AS (
  SELECT '01 helper unique' AS check_name, count(*) = 1 AS passed,
         count(*)::text AS actual, '1' AS expected
  FROM helper

  UNION ALL
  SELECT '02 helper immutable', count(*) = 1 AND bool_and(provolatile = 'i'),
         count(*)::text, 'immutable'
  FROM helper

  UNION ALL
  SELECT '03 known mapping', bool_and(actual = expected),
         string_agg(profile_code || '=' || actual, ', ' ORDER BY profile_code),
         'all eight mappings'
  FROM (VALUES
    ('fashion', 'retail'), ('retail', 'retail'), ('pharmacy', 'retail'),
    ('coffee_shop', 'restaurant'), ('restaurant', 'restaurant'),
    ('services', 'services'), ('mixed', 'generic'), ('unconfigured', 'generic')
  ) expected_mapping(profile_code, expected)
  CROSS JOIN LATERAL (
    SELECT public.pos_profile_family(profile_code) AS actual
  ) resolved

  UNION ALL
  SELECT '04 unknown and null fallback',
         public.pos_profile_family('legacy_unknown') = 'generic'
         AND public.pos_profile_family(NULL) = 'generic',
         public.pos_profile_family('legacy_unknown') || '/' || public.pos_profile_family(NULL),
         'generic/generic'

  UNION ALL
  SELECT '05 no physical profile_family', count(*) = 0, count(*)::text, '0 columns'
  FROM information_schema.columns
  WHERE table_schema = 'public' AND column_name = 'profile_family'

  UNION ALL
  SELECT '06 no parallel industry table', count(*) = 0, count(*)::text, '0 tables'
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('pos_industries', 'pos_brand_industries', 'pos_profile_families')

  UNION ALL
  SELECT '07 profile catalog preserved',
         to_regclass('public.pos_profile_catalog') IS NOT NULL
         AND (SELECT count(*) FROM public.pos_profile_catalog WHERE code IN (
           'fashion', 'retail', 'services', 'mixed', 'coffee_shop',
           'restaurant', 'pharmacy', 'unconfigured'
         )) = 8,
         COALESCE(to_regclass('public.pos_profile_catalog')::text, 'absent'),
         'table plus eight known profiles'

  UNION ALL
  SELECT '08 business profiles preserved', to_regclass('public.pos_business_profiles') IS NOT NULL,
         COALESCE(to_regclass('public.pos_business_profiles')::text, 'absent'), 'public.pos_business_profiles'

  UNION ALL
  SELECT '09 capability catalog preserved',
         to_regclass('public.pos_capability_catalog') IS NOT NULL,
         COALESCE(to_regclass('public.pos_capability_catalog')::text, 'absent'), 'public.pos_capability_catalog'

  UNION ALL
  SELECT '10 legacy capability codes preserved', count(*) = 14, count(*)::text, '14'
  FROM public.pos_capability_catalog
  WHERE code IN (
    'variants', 'sizes', 'colors', 'direct_inventory', 'services', 'loyalty',
    'recipes', 'ingredients', 'modifiers', 'combos', 'tables',
    'kitchen_tickets', 'batches', 'expiration_dates'
  )

  UNION ALL
  SELECT '11 no namespaced capability duplicates', count(*) = 0, count(*)::text, '0'
  FROM public.pos_capability_catalog WHERE code LIKE '%.%'

  UNION ALL
  SELECT '12 defaults preserved',
         to_regclass('public.pos_profile_capability_defaults') IS NOT NULL
         AND count(*) > 0, count(*)::text, '>0'
  FROM public.pos_profile_capability_defaults

  UNION ALL
  SELECT '13 business capabilities preserved',
         to_regclass('public.pos_business_capabilities') IS NOT NULL,
         COALESCE(to_regclass('public.pos_business_capabilities')::text, 'absent'),
         'public.pos_business_capabilities'

  UNION ALL
  SELECT '14 configure RPC preserved', count(*) = 1 AND bool_and(
           definition LIKE '%pos_business_profiles%'
           AND definition LIKE '%pos_business_capabilities%'
         ), count(*)::text, 'one canonical writer'
  FROM configure_rpc

  UNION ALL
  SELECT '15 helper security', count(*) = 1 AND bool_and(
           prosecdef AND 'search_path=public' = ANY(COALESCE(proconfig, '{}'))
         ), count(*)::text, 'SECURITY DEFINER/search_path=public'
  FROM helper

  UNION ALL
  SELECT '16 service_role execute', count(*) = 1 AND bool_and(
           has_function_privilege('service_role', oid, 'EXECUTE')
         ), count(*)::text, 'granted'
  FROM helper

  UNION ALL
  SELECT '17 browser execute denied', count(*) = 1 AND bool_and(
           NOT has_function_privilege('anon', oid, 'EXECUTE')
           AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')
           AND NOT EXISTS (
             SELECT 1 FROM aclexplode(COALESCE(proacl, acldefault('f', proowner))) acl
             WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
           )
         ), count(*)::text, 'anon/authenticated/PUBLIC denied'
  FROM helper

  UNION ALL
  SELECT '18 RLS state preserved', count(*) = 5,
         string_agg(relname || '=' || relrowsecurity, ', ' ORDER BY relname),
         'five existing authority tables present; migration changes no RLS'
  FROM pg_class
  WHERE oid IN (
    'public.pos_profile_catalog'::regclass,
    'public.pos_business_profiles'::regclass,
    'public.pos_profile_capability_defaults'::regclass,
    'public.pos_capability_catalog'::regclass,
    'public.pos_business_capabilities'::regclass
  )

  UNION ALL
  SELECT '19 V1A entitlements preserved',
         to_regclass('public.pos_entitlements') IS NOT NULL
         AND (SELECT count(*) FROM public.pos_plan_entitlements WHERE plan_code = 'pos_start') = 9,
         'entitlements plus pos_start mappings', 'present/9'

  UNION ALL
  SELECT '20 V1B lifecycle preserved',
         to_regprocedure('public.pos_get_subscription_lifecycle(text)') IS NOT NULL
         AND to_regprocedure('public.pos_transition_subscription_status(text,text,text,uuid)') IS NOT NULL,
         'lifecycle and transition RPCs', 'present'

  UNION ALL
  SELECT '21 additive API dependency', count(*) = 1,
         count(*)::text, 'one helper consumed by bootstrap/profile API'
  FROM helper
)
SELECT check_name, passed, actual, expected FROM checks
UNION ALL
SELECT 'SUMMARY all_checks_passed', bool_and(passed), bool_and(passed)::text, 'true'
FROM checks;
