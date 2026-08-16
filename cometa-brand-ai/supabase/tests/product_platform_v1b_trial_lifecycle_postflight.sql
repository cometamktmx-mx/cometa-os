-- PRODUCT PLATFORM V1B POSTFLIGHT — READ ONLY
WITH expected_functions(name, args) AS (
  VALUES
    ('pos_get_subscription_lifecycle', 'p_brand_slug text'),
    ('pos_transition_subscription_status', 'p_brand_slug text, p_new_status text, p_reason text, p_user_id uuid'),
    ('pos_reconcile_subscription_lifecycle', 'p_brand_slug text')
),
v1b_functions AS (
  SELECT p.oid, p.proname, p.prosecdef, p.proconfig, p.proacl, p.proowner,
         pg_get_function_identity_arguments(p.oid) AS args,
         CASE
           WHEN p.prokind = 'f' THEN pg_get_functiondef(p.oid)
           ELSE NULL
         END AS definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN expected_functions f
    ON f.name = p.proname
   AND f.args = pg_get_function_identity_arguments(p.oid)
  WHERE n.nspname = 'public'
),
canonical_functions AS (
  SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args,
         CASE
           WHEN p.prokind = 'f' THEN pg_get_functiondef(p.oid)
           ELSE NULL
         END AS definition,
         md5(
           CASE
             WHEN p.prokind = 'f' THEN pg_get_functiondef(p.oid)
             ELSE NULL
           END
         ) AS fingerprint
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'pos_initialize_brand_setup',
      'pos_initialize_brand_setup_v1a_internal',
      'pos_set_subscription_offer',
      'pos_set_subscription_plan',
      'pos_get_brand_entitlements'
    )
),
checks AS (
  SELECT '01 initialize public overload' AS check_name,
         count(*) = 1 AS passed, count(*)::text AS actual, '1' AS expected
  FROM canonical_functions
  WHERE proname = 'pos_initialize_brand_setup'
    AND args = 'p_brand_id text, p_brand_slug text, p_brand_name text, p_user_id uuid'

  UNION ALL
  SELECT '02 initialize uses 15 days', count(*) = 1 AND bool_and(definition LIKE '%15 days%'),
         string_agg(fingerprint, ', '), 'internal initializer contains 15 days'
  FROM canonical_functions
  WHERE proname = 'pos_initialize_brand_setup_v1a_internal'

  UNION ALL
  SELECT '03 initialize preserves pos_start', count(*) = 1 AND bool_and(definition LIKE '%pos_start%'),
         count(*)::text, '1 internal initializer with pos_start'
  FROM canonical_functions WHERE proname = 'pos_initialize_brand_setup_v1a_internal'

  UNION ALL
  SELECT '04 initialize preserves trial', count(*) = 1 AND bool_and(definition LIKE '%trial%'),
         count(*)::text, '1 internal initializer with trial'
  FROM canonical_functions WHERE proname = 'pos_initialize_brand_setup_v1a_internal'

  UNION ALL
  SELECT '05 trial_started ledger logic', count(*) = 1 AND bool_and(
           definition LIKE '%pos_subscription_events%'
           AND definition LIKE '%trial_started%'
           AND definition LIKE '%trialDays%'
           AND definition LIKE '%NOT EXISTS%'
         ), count(*)::text, 'wrapper inserts deduplicated trial_started'
  FROM canonical_functions WHERE proname = 'pos_initialize_brand_setup'

  UNION ALL
  SELECT '06 trial_started single writer', count(*) = 1, count(*)::text, '1 function definition'
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND CASE
          WHEN p.prokind = 'f' THEN pg_get_functiondef(p.oid)
          ELSE NULL
        END LIKE '%INSERT INTO public.pos_subscription_events%trial_started%'

  UNION ALL
  SELECT '07 lifecycle RPC exists', count(*) = 1, count(*)::text, '1'
  FROM v1b_functions WHERE proname = 'pos_get_subscription_lifecycle'

  UNION ALL
  SELECT '08 lifecycle SECURITY DEFINER', count(*) = 1 AND bool_and(prosecdef), count(*)::text, 'true'
  FROM v1b_functions WHERE proname = 'pos_get_subscription_lifecycle'

  UNION ALL
  SELECT '09 lifecycle search_path', count(*) = 1 AND bool_and('search_path=public' = ANY(COALESCE(proconfig, '{}'))),
         count(*)::text, 'search_path=public'
  FROM v1b_functions WHERE proname = 'pos_get_subscription_lifecycle'

  UNION ALL
  SELECT '10 lifecycle service_role execute', count(*) = 1 AND bool_and(has_function_privilege('service_role', oid, 'EXECUTE')),
         count(*)::text, 'granted'
  FROM v1b_functions WHERE proname = 'pos_get_subscription_lifecycle'

  UNION ALL
  SELECT '11 lifecycle browser denied', count(*) = 1 AND bool_and(
           NOT has_function_privilege('anon', oid, 'EXECUTE')
           AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')
           AND NOT EXISTS (
             SELECT 1 FROM aclexplode(COALESCE(proacl, acldefault('f', proowner))) acl
             WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
           )
         ), count(*)::text, 'anon/authenticated/PUBLIC denied'
  FROM v1b_functions WHERE proname = 'pos_get_subscription_lifecycle'

  UNION ALL
  SELECT '12 transition RPC exists', count(*) = 1, count(*)::text, '1'
  FROM v1b_functions WHERE proname = 'pos_transition_subscription_status'

  UNION ALL
  SELECT '13 transition security', count(*) = 1 AND bool_and(
           prosecdef
           AND 'search_path=public' = ANY(COALESCE(proconfig, '{}'))
           AND has_function_privilege('service_role', oid, 'EXECUTE')
           AND NOT has_function_privilege('anon', oid, 'EXECUTE')
           AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')
         ), count(*)::text, 'definer/public path/service only'
  FROM v1b_functions WHERE proname = 'pos_transition_subscription_status'

  UNION ALL
  SELECT '14 reconcile RPC exists', count(*) = 1, count(*)::text, '1'
  FROM v1b_functions WHERE proname = 'pos_reconcile_subscription_lifecycle'

  UNION ALL
  SELECT '15 reconcile security', count(*) = 1 AND bool_and(
           prosecdef
           AND 'search_path=public' = ANY(COALESCE(proconfig, '{}'))
           AND has_function_privilege('service_role', oid, 'EXECUTE')
           AND NOT has_function_privilege('anon', oid, 'EXECUTE')
           AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')
         ), count(*)::text, 'definer/public path/service only'
  FROM v1b_functions WHERE proname = 'pos_reconcile_subscription_lifecycle'

  UNION ALL
  SELECT '16 subscription schema unchanged', count(*) = 0, count(*)::text, '0 V1B lifecycle columns'
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'pos_subscriptions'
    AND column_name IN ('effective_status', 'access_allowed', 'requires_activation', 'trial_days')

  UNION ALL
  SELECT '17 event ledger reused', to_regclass('public.pos_subscription_events') IS NOT NULL,
         COALESCE(to_regclass('public.pos_subscription_events')::text, 'absent'), 'public.pos_subscription_events'

  UNION ALL
  SELECT '18 no parallel history table', count(*) = 0, count(*)::text, '0'
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('pos_subscription_history', 'pos_subscription_lifecycle', 'pos_trial_events')

  UNION ALL
  SELECT '19 V1A entitlements preserved', count(*) = 23, count(*)::text, '23 canonical seed rows'
  FROM public.pos_entitlements

  UNION ALL
  SELECT '20 V1A pos_start mappings preserved', count(*) = 9, count(*)::text, '9'
  FROM public.pos_plan_entitlements WHERE plan_code = 'pos_start'

  UNION ALL
  SELECT '21 offer RPC semantics preserved', count(*) = 1 AND bool_and(
           definition LIKE '%offer_updated%'
           AND position('plan_code' IN lower(definition)) = 0
         ), string_agg(fingerprint, ', '), 'offer_updated and no plan_code assignment'
  FROM canonical_functions
  WHERE proname = 'pos_set_subscription_offer'
    AND args = 'p_brand_slug text, p_contract_price numeric, p_promotion_code text, p_price_locked boolean, p_status text, p_user_id uuid'

  UNION ALL
  SELECT '22 plan RPC preserved', count(*) = 1 AND bool_and(
           definition LIKE '%plan_changed%'
           AND definition LIKE '%previousPlanCode%'
           AND definition LIKE '%newPlanCode%'
         ), string_agg(fingerprint, ', '), 'plan_changed metadata preserved'
  FROM canonical_functions
  WHERE proname = 'pos_set_subscription_plan'
    AND args = 'p_brand_slug text, p_plan_code text, p_user_id uuid'

  UNION ALL
  SELECT '23 API lifecycle shape available', NOT EXISTS (SELECT 1 FROM public.pos_subscriptions)
         OR bool_and(
           public.pos_get_subscription_lifecycle(brand_slug)
             ?& ARRAY['planCode', 'status', 'effectiveStatus', 'accessAllowed', 'trial', 'period', 'requiresActivation']
         ), count(*)::text, 'all existing subscriptions return API keys'
  FROM public.pos_subscriptions

  UNION ALL
  SELECT '24 no billing provider objects', count(*) = 0, count(*)::text, '0'
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND (
      table_name LIKE '%stripe%'
      OR table_name LIKE '%mercadopago%'
      OR table_name LIKE '%payment_intent%'
      OR table_name LIKE '%checkout%'
    )

  UNION ALL
  SELECT '25 event_type remains unrestricted', count(*) = 0, count(*)::text, '0 event_type CHECK constraints'
  FROM pg_constraint c
  WHERE c.conrelid = 'public.pos_subscription_events'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%event_type%'
)
SELECT check_name, passed, actual, expected FROM checks
UNION ALL
SELECT 'SUMMARY all_checks_passed', bool_and(passed), bool_and(passed)::text, 'true' FROM checks;
