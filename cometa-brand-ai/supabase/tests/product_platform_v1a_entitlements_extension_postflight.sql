-- PRODUCT PLATFORM V1A POSTFLIGHT — READ ONLY.
-- Run only after the V1A migration. No statement in this file mutates data or schema.
WITH expected_entitlements(code) AS (
  VALUES
    ('pos.access'), ('pos.sales'), ('pos.cash'), ('pos.products'),
    ('pos.inventory'), ('pos.customers'), ('pos.loyalty'), ('pos.reports'),
    ('intelligence.signals'), ('intelligence.pulsar'),
    ('intelligence.opportunities'), ('growth.strategy'), ('growth.calendar'),
    ('growth.sales_ai'), ('growth.agents'), ('growth.connections'),
    ('agency.strategy'), ('agency.content'), ('agency.ads'),
    ('agency.account_management'), ('platform.multi_location'),
    ('platform.advanced_users'), ('platform.api_access')
),
expected_pos_start(code) AS (
  VALUES
    ('pos.access'), ('pos.sales'), ('pos.cash'), ('pos.products'),
    ('pos.inventory'), ('pos.customers'), ('pos.loyalty'), ('pos.reports'),
    ('intelligence.signals')
),
expected_functions(name, args) AS (
  VALUES
    ('pos_get_brand_entitlements', 'p_brand_slug text'),
    ('pos_brand_has_entitlement', 'p_brand_slug text, p_entitlement_code text'),
    ('pos_set_brand_entitlement_override', 'p_brand_slug text, p_entitlement_code text, p_enabled boolean, p_reason text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_user_id uuid'),
    ('pos_set_subscription_plan', 'p_brand_slug text, p_plan_code text, p_user_id uuid')
),
v1a_functions AS (
  SELECT p.oid, p.proname, p.prosecdef, p.proconfig, p.proacl, p.proowner,
         pg_get_function_identity_arguments(p.oid) AS args,
         pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN expected_functions f
    ON f.name = p.proname
   AND f.args = pg_get_function_identity_arguments(p.oid)
  WHERE n.nspname = 'public'
),
canonical_functions AS (
  SELECT p.proname, pg_get_functiondef(p.oid) AS definition,
         md5(pg_get_functiondef(p.oid)) AS fingerprint
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND (
      (p.proname = 'pos_initialize_brand_setup'
       AND pg_get_function_identity_arguments(p.oid) = 'p_brand_id text, p_brand_slug text, p_brand_name text, p_user_id uuid')
      OR
      (p.proname = 'pos_set_subscription_offer'
       AND pg_get_function_identity_arguments(p.oid) = 'p_brand_slug text, p_contract_price numeric, p_promotion_code text, p_price_locked boolean, p_status text, p_user_id uuid')
    )
),
checks AS (
  SELECT '01 tables exist' AS check_name,
         to_regclass('public.pos_entitlements') IS NOT NULL
         AND to_regclass('public.pos_plan_entitlements') IS NOT NULL
         AND to_regclass('public.pos_brand_entitlement_overrides') IS NOT NULL AS passed,
         concat_ws(', ', to_regclass('public.pos_entitlements'), to_regclass('public.pos_plan_entitlements'), to_regclass('public.pos_brand_entitlement_overrides')) AS actual,
         'all three V1A tables' AS expected

  UNION ALL
  SELECT '02 exact column counts',
         (SELECT count(*) = 8 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pos_entitlements')
         AND (SELECT count(*) = 3 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pos_plan_entitlements')
         AND (SELECT count(*) = 11 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pos_brand_entitlement_overrides'),
         concat_ws('/',
           (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pos_entitlements'),
           (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pos_plan_entitlements'),
           (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pos_brand_entitlement_overrides')),
         '8/3/11'

  UNION ALL
  SELECT '03 category check', count(*) = 1, count(*)::text, '1'
  FROM pg_constraint
  WHERE conrelid = 'public.pos_entitlements'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%pos%intelligence%growth%automation%agency%platform%'

  UNION ALL
  SELECT '04 override window check', count(*) = 1, count(*)::text, '1'
  FROM pg_constraint
  WHERE conrelid = 'public.pos_brand_entitlement_overrides'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%ends_at%starts_at%'

  UNION ALL
  SELECT '05 mapping primary key', count(*) = 1, count(*)::text, '1'
  FROM pg_constraint
  WHERE conrelid = 'public.pos_plan_entitlements'::regclass
    AND contype = 'p'
    AND pg_get_constraintdef(oid) = 'PRIMARY KEY (plan_code, entitlement_id)'

  UNION ALL
  SELECT '06 plan mapping FK', count(*) = 1, count(*)::text, '1 to pos_plans(code)'
  FROM pg_constraint
  WHERE conrelid = 'public.pos_plan_entitlements'::regclass
    AND contype = 'f'
    AND confrelid = 'public.pos_plans'::regclass
    AND pg_get_constraintdef(oid) LIKE '%FOREIGN KEY (plan_code) REFERENCES pos_plans(code)%'

  UNION ALL
  SELECT '07 entitlement FKs', count(*) = 2, count(*)::text, '2'
  FROM pg_constraint
  WHERE contype = 'f'
    AND confrelid = 'public.pos_entitlements'::regclass
    AND conrelid IN ('public.pos_plan_entitlements'::regclass, 'public.pos_brand_entitlement_overrides'::regclass)

  UNION ALL
  SELECT '08 required indexes',
         count(*) FILTER (WHERE indexname = 'pos_entitlements_code_key') = 1
         AND count(*) FILTER (WHERE indexname = 'pos_plan_entitlements_pkey') = 1
         AND count(*) FILTER (WHERE indexname = 'pos_brand_entitlement_overrides_brand_idx') = 1
         AND count(*) FILTER (WHERE indexname = 'pos_brand_entitlement_overrides_resolve_idx') = 1,
         string_agg(indexname, ', ' ORDER BY indexname), 'code unique, mapping PK, two override indexes'
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename IN ('pos_entitlements', 'pos_plan_entitlements', 'pos_brand_entitlement_overrides')

  UNION ALL
  SELECT '09 RLS enabled', count(*) = 3 AND bool_and(relrowsecurity),
         string_agg(relname || '=' || relrowsecurity, ', ' ORDER BY relname), 'all true'
  FROM pg_class
  WHERE oid IN ('public.pos_entitlements'::regclass, 'public.pos_plan_entitlements'::regclass, 'public.pos_brand_entitlement_overrides'::regclass)

  UNION ALL
  SELECT '10 SELECT policies', count(*) = 3, count(*)::text, '3'
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('pos_entitlements', 'pos_plan_entitlements', 'pos_brand_entitlement_overrides')
    AND cmd = 'SELECT'

  UNION ALL
  SELECT '11 no browser write policies', count(*) = 0, count(*)::text, '0'
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('pos_entitlements', 'pos_plan_entitlements', 'pos_brand_entitlement_overrides')
    AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')

  UNION ALL
  SELECT '12 browser table writes denied',
         bool_and(NOT has_table_privilege(role_name, table_name, privilege_name)),
         count(*) FILTER (WHERE has_table_privilege(role_name, table_name, privilege_name))::text || ' exposed', '0 exposed'
  FROM (VALUES ('anon'), ('authenticated')) roles(role_name)
  CROSS JOIN (VALUES
    ('public.pos_entitlements'),
    ('public.pos_plan_entitlements'),
    ('public.pos_brand_entitlement_overrides')
  ) tables(table_name)
  CROSS JOIN (VALUES ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) privileges(privilege_name)

  UNION ALL
  SELECT '13 exact entitlement seed',
         (SELECT count(*) FROM public.pos_entitlements) = 23
         AND NOT EXISTS (SELECT code FROM expected_entitlements EXCEPT SELECT code FROM public.pos_entitlements)
         AND NOT EXISTS (SELECT code FROM public.pos_entitlements EXCEPT SELECT code FROM expected_entitlements),
         (SELECT count(*)::text FROM public.pos_entitlements), 'exactly the 23 canonical codes'

  UNION ALL
  SELECT '14 entitlement codes unique', count(*) = count(DISTINCT code), count(*)::text, 'all unique'
  FROM public.pos_entitlements

  UNION ALL
  SELECT '15 exact pos_start mapping',
         (SELECT count(*) FROM public.pos_plan_entitlements WHERE plan_code = 'pos_start') = 9
         AND NOT EXISTS (
           SELECT code FROM expected_pos_start
           EXCEPT
           SELECT e.code FROM public.pos_plan_entitlements pe JOIN public.pos_entitlements e ON e.id = pe.entitlement_id WHERE pe.plan_code = 'pos_start'
         )
         AND NOT EXISTS (
           SELECT e.code FROM public.pos_plan_entitlements pe JOIN public.pos_entitlements e ON e.id = pe.entitlement_id WHERE pe.plan_code = 'pos_start'
           EXCEPT
           SELECT code FROM expected_pos_start
         ),
         (SELECT count(*)::text FROM public.pos_plan_entitlements WHERE plan_code = 'pos_start'), 'exactly 9 canonical mappings'

  UNION ALL
  SELECT '16 pos_start excludes Pulsar', count(*) = 0, count(*)::text, '0'
  FROM public.pos_plan_entitlements pe
  JOIN public.pos_entitlements e ON e.id = pe.entitlement_id
  WHERE pe.plan_code = 'pos_start' AND e.code = 'intelligence.pulsar'

  UNION ALL
  SELECT '17 no fictitious product plans', count(*) = 0, count(*)::text, '0 growth/partner rows'
  FROM public.pos_plans WHERE code IN ('growth', 'partner')

  UNION ALL
  SELECT '18 function signatures', count(*) = 4, count(*)::text, '4'
  FROM v1a_functions

  UNION ALL
  SELECT '19 SECURITY DEFINER', count(*) = 4 AND bool_and(prosecdef),
         string_agg(proname || '=' || prosecdef, ', ' ORDER BY proname), 'all true'
  FROM v1a_functions

  UNION ALL
  SELECT '20 fixed search_path', count(*) = 4 AND bool_and('search_path=public' = ANY(COALESCE(proconfig, '{}'))),
         string_agg(proname || '=' || COALESCE(array_to_string(proconfig, ','), 'null'), '; ' ORDER BY proname), 'all search_path=public'
  FROM v1a_functions

  UNION ALL
  SELECT '21 service_role execute', count(*) = 4 AND bool_and(has_function_privilege('service_role', oid, 'EXECUTE')),
         count(*) FILTER (WHERE has_function_privilege('service_role', oid, 'EXECUTE'))::text || ' granted', '4 granted'
  FROM v1a_functions

  UNION ALL
  SELECT '22 browser and PUBLIC execute denied', count(*) = 4 AND bool_and(
           NOT has_function_privilege('anon', oid, 'EXECUTE')
           AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')
           AND NOT EXISTS (
             SELECT 1 FROM aclexplode(COALESCE(proacl, acldefault('f', proowner))) acl
             WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
           )
         ),
         count(*) FILTER (WHERE has_function_privilege('anon', oid, 'EXECUTE') OR has_function_privilege('authenticated', oid, 'EXECUTE'))::text || ' browser-exposed', '0 browser-exposed'
  FROM v1a_functions

  UNION ALL
  SELECT '23 canonical objects preserved',
         to_regclass('public.pos_plan_limits') IS NOT NULL
         AND to_regclass('public.pos_subscription_events') IS NOT NULL
         AND to_regclass('public.pos_capability_catalog') IS NOT NULL
         AND to_regclass('public.pos_business_capabilities') IS NOT NULL,
         'plan limits, ledger, capability tables', 'all present'

  UNION ALL
  SELECT '24 initialize RPC invariants', count(*) = 1 AND bool_and(
           definition LIKE '%''pos_start''%'
           AND definition LIKE '%''trial''%'
           AND definition ~* '14 days'
         ),
         string_agg(fingerprint, ', '), 'one overload; pos_start/trial/14 days; fingerprint reported'
  FROM canonical_functions WHERE proname = 'pos_initialize_brand_setup'

  UNION ALL
  SELECT '25 offer RPC invariants', count(*) = 1 AND bool_and(
           definition LIKE '%''offer_updated''%'
           AND position('plan_code' IN lower(definition)) = 0
         ),
         string_agg(fingerprint, ', '), 'one overload; offer_updated; no plan_code assignment; fingerprint reported'
  FROM canonical_functions WHERE proname = 'pos_set_subscription_offer'

  UNION ALL
  SELECT '26 plan change uses ledger', count(*) = 1 AND bool_and(
           definition LIKE '%pos_subscription_events%'
           AND definition LIKE '%''plan_changed''%'
           AND definition LIKE '%previousPlanCode%'
           AND definition LIKE '%newPlanCode%'
         ),
         count(*)::text, 'one canonical implementation'
  FROM v1a_functions WHERE proname = 'pos_set_subscription_plan'
)
SELECT check_name, passed, actual, expected FROM checks
UNION ALL
SELECT 'SUMMARY all_checks_passed', bool_and(passed), bool_and(passed)::text, 'true' FROM checks;
