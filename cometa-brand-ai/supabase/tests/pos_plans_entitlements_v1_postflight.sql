-- COMETA POS Plans & Entitlements V1 postflight. Strictly read-only.
WITH initializer AS (
  SELECT pg_get_functiondef('public.pos_initialize_brand_setup(text,text,text,uuid)'::regprocedure) AS definition
), internal_initializer AS (
  SELECT count(*) AS function_count, max(pg_get_functiondef(procedure.oid)) AS definition
  FROM pg_proc procedure
  JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'pos_initialize_brand_setup_v1a_internal'
    AND oidvectortypes(procedure.proargtypes) = 'text, text, text, uuid'
), checks(check_no, check_name, passed, details) AS (
  SELECT 1, 'START catalog', count(*) = 1,
    jsonb_build_object('count', count(*))
  FROM public.pos_plans WHERE code = 'start' AND name = 'Cometa POS Start'
    AND list_price = 399.00 AND currency = 'MXN' AND billing_interval = 'month' AND active
  UNION ALL SELECT 2, 'PRO catalog', count(*) = 1, jsonb_build_object('count', count(*))
  FROM public.pos_plans WHERE code = 'pro' AND name = 'Cometa POS Pro'
    AND list_price = 499.00 AND currency = 'MXN' AND billing_interval = 'month' AND active
  UNION ALL SELECT 3, 'MULTI catalog', count(*) = 1, jsonb_build_object('count', count(*))
  FROM public.pos_plans WHERE code = 'multi' AND name = 'Cometa POS Multi'
    AND list_price = 899.00 AND currency = 'MXN' AND billing_interval = 'month' AND active
  UNION ALL SELECT 4, 'START limits', count(*) = 1, jsonb_build_object('count', count(*))
  FROM public.pos_plan_limits WHERE plan_code = 'start' AND max_locations = 1 AND max_registers = 1 AND max_users = 2
  UNION ALL SELECT 5, 'PRO limits', count(*) = 1, jsonb_build_object('count', count(*))
  FROM public.pos_plan_limits WHERE plan_code = 'pro' AND max_locations = 1 AND max_registers = 2 AND max_users = 5
  UNION ALL SELECT 6, 'MULTI limits', count(*) = 1, jsonb_build_object('count', count(*))
  FROM public.pos_plan_limits WHERE plan_code = 'multi' AND max_locations = 4 AND max_registers = 8 AND max_users = 10
  UNION ALL SELECT 7, 'legacy pos_start preserved', count(*) = 1, jsonb_build_object('count', count(*))
  FROM public.pos_plans WHERE code = 'pos_start'
  UNION ALL SELECT 8, 'START exact entitlements', count(*) = 7
    AND bool_and(entitlement.code = ANY(ARRAY['pos.access','pos.sales','pos.cash','pos.products','pos.inventory','pos.customers','pos.reports'])),
    jsonb_build_object('count', count(*))
  FROM public.pos_plan_entitlements mapping JOIN public.pos_entitlements entitlement ON entitlement.id = mapping.entitlement_id
  WHERE mapping.plan_code = 'start'
  UNION ALL SELECT 9, 'PRO exact entitlements', count(*) = 10, jsonb_build_object('count', count(*))
  FROM public.pos_plan_entitlements WHERE plan_code = 'pro'
  UNION ALL SELECT 10, 'MULTI exact entitlements', count(*) = 11, jsonb_build_object('count', count(*))
  FROM public.pos_plan_entitlements WHERE plan_code = 'multi'
  UNION ALL SELECT 11, 'PRO loyalty and intelligence', count(*) = 3
    AND bool_and(entitlement.code = ANY(ARRAY['pos.loyalty','intelligence.signals','intelligence.pulsar'])), jsonb_build_object('count', count(*))
  FROM public.pos_plan_entitlements mapping JOIN public.pos_entitlements entitlement ON entitlement.id = mapping.entitlement_id
  WHERE mapping.plan_code = 'pro' AND entitlement.code = ANY(ARRAY['pos.loyalty','intelligence.signals','intelligence.pulsar'])
  UNION ALL SELECT 12, 'MULTI multi-location', count(*) = 1, jsonb_build_object('count', count(*))
  FROM public.pos_plan_entitlements mapping JOIN public.pos_entitlements entitlement ON entitlement.id = mapping.entitlement_id
  WHERE mapping.plan_code = 'multi' AND entitlement.code = 'platform.multi_location'
  UNION ALL SELECT 13, 'future entitlements not overgranted', count(*) = 0, jsonb_build_object('count', count(*))
  FROM public.pos_plan_entitlements mapping JOIN public.pos_entitlements entitlement ON entitlement.id = mapping.entitlement_id
  WHERE mapping.plan_code IN ('start','pro','multi') AND entitlement.code IN ('intelligence.opportunities','platform.advanced_users')
  UNION ALL SELECT 14, 'digital card not launched', bool_and(NOT includes_digital_card), jsonb_build_object('checked', count(*))
  FROM public.pos_plan_limits WHERE plan_code IN ('start','pro','multi')
  UNION ALL SELECT 15, 'legacy trials migrated', count(*) = 0, jsonb_build_object('remaining', count(*))
  FROM public.pos_subscriptions WHERE plan_code = 'pos_start' AND status = 'trial'
  UNION ALL SELECT 16, 'two trial catalog migrations recorded', count(*) = 2, jsonb_build_object('count', count(*))
  FROM public.pos_subscription_events WHERE event_type = 'plan_changed'
    AND metadata->>'migration' = '20260814_pos_plans_entitlements_v1'
    AND metadata->>'previousPlanCode' = 'pos_start' AND metadata->>'newPlanCode' = 'pro'
    AND previous_status = 'trial' AND new_status = 'trial'
  UNION ALL SELECT 17, 'default initializer is PRO', COALESCE((SELECT definition LIKE '%SET plan_code = ''pro''%' FROM initializer), false), '{}'
  UNION ALL SELECT 18, 'initializer records PRO trial', COALESCE((SELECT definition LIKE '%''planCode'', ''pro''%' FROM initializer), false), '{}'
  UNION ALL SELECT 19, 'initializer retains advisory lock', COALESCE((SELECT definition LIKE '%pg_advisory_xact_lock%' FROM initializer), false), '{}'
  UNION ALL SELECT 20, '15-day authority preserved',
    COALESCE((SELECT function_count = 1 AND definition LIKE '%trial_ends_at%' AND definition LIKE '%15 days%' FROM internal_initializer), false), '{}'
  UNION ALL SELECT 21, 'lifecycle authority preserved', to_regprocedure('public.pos_get_subscription_lifecycle(text)') IS NOT NULL, '{}'
  UNION ALL SELECT 22, 'entitlement authority preserved', to_regprocedure('public.pos_get_brand_entitlements(text)') IS NOT NULL, '{}'
  UNION ALL SELECT 23, 'CORE-1 helper authority preserved', to_regprocedure('public.pos_brand_has_entitlement(text,text)') IS NOT NULL, '{}'
  UNION ALL SELECT 24, 'profiles remain independent', count(*) = 2, jsonb_build_object('count', count(*))
  FROM public.pos_profile_catalog WHERE code IN ('fashion','retail')
  UNION ALL SELECT 25, 'no Cometa OS POS plan', count(*) = 0, jsonb_build_object('count', count(*))
  FROM public.pos_plans WHERE lower(code) IN ('cometa_os','cometa-os','os')
  UNION ALL SELECT 26, 'initializer browser denied',
    NOT has_function_privilege('anon','public.pos_initialize_brand_setup(text,text,text,uuid)','EXECUTE')
    AND NOT has_function_privilege('authenticated','public.pos_initialize_brand_setup(text,text,text,uuid)','EXECUTE'), '{}'
  UNION ALL SELECT 27, 'initializer service role execute', has_function_privilege('service_role','public.pos_initialize_brand_setup(text,text,text,uuid)','EXECUTE'), '{}'
), diagnostic AS (
  SELECT * FROM checks
  UNION ALL
  SELECT 28, 'SUMMARY all_checks_passed', bool_and(passed), jsonb_build_object(
    'passed_count', count(*) FILTER (WHERE passed),
    'failed_count', count(*) FILTER (WHERE NOT passed),
    'all_checks_passed', bool_and(passed)
  ) FROM checks
)
SELECT * FROM diagnostic ORDER BY check_no;
