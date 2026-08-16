-- ENTRY V1B postflight. Strictly read-only.

WITH target AS (
  SELECT
    procedure.oid,
    procedure.prosecdef,
    procedure.proconfig,
    pg_get_function_result(procedure.oid) AS result_type,
    pg_get_functiondef(procedure.oid) AS definition,
    procedure.proacl
  FROM pg_proc procedure
  WHERE procedure.oid = 'public.pos_create_self_service_business_v1(text,text,uuid,uuid)'::regprocedure
), initializer AS (
  SELECT pg_get_functiondef('public.pos_initialize_brand_setup(text,text,text,uuid)'::regprocedure) AS definition
), internal_initializer_candidates AS (
  SELECT
    procedure.oid,
    CASE
      WHEN procedure.prokind = 'f' THEN pg_get_functiondef(procedure.oid)
      ELSE NULL
    END AS definition
  FROM pg_proc procedure
  JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'pos_initialize_brand_setup_v1a_internal'
    AND procedure.prokind = 'f'
    AND oidvectortypes(procedure.proargtypes) = 'text, text, text, uuid'
), internal_initializer AS (
  SELECT
    count(*) AS function_count,
    max(definition) AS definition
  FROM internal_initializer_candidates
), checks(check_no, check_name, passed) AS (
  SELECT 1, 'brands reused', to_regclass('public.brands') IS NOT NULL
  UNION ALL SELECT 2, 'no parallel brand registry', NOT EXISTS (
    SELECT 1 FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relkind = 'r'
      AND relation.relname IN ('pos_brands', 'business_brands', 'self_service_brands')
  )
  UNION ALL SELECT 3, 'creation RPC exists', EXISTS (SELECT 1 FROM target)
  UNION ALL SELECT 4, 'security definer', COALESCE((SELECT prosecdef FROM target), false)
  UNION ALL SELECT 5, 'search path public', COALESCE((SELECT proconfig @> ARRAY['search_path=public'] FROM target), false)
  UNION ALL SELECT 6, 'browser execute denied',
    NOT has_function_privilege('anon', 'public.pos_create_self_service_business_v1(text,text,uuid,uuid)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.pos_create_self_service_business_v1(text,text,uuid,uuid)', 'EXECUTE')
  UNION ALL SELECT 7, 'service role execute', has_function_privilege('service_role', 'public.pos_create_self_service_business_v1(text,text,uuid,uuid)', 'EXECUTE')
  UNION ALL SELECT 8, 'owner role canonical', COALESCE((SELECT definition LIKE '%''owner''%' FROM target), false)
  UNION ALL SELECT 9, 'initializer referenced', COALESCE((SELECT definition LIKE '%pos_initialize_brand_setup%' FROM target), false)
  UNION ALL SELECT 10, 'profile configurator referenced', COALESCE((SELECT definition LIKE '%pos_configure_business_profile%' FROM target), false)
  UNION ALL SELECT 11, '15 day trial preserved',
    COALESCE((SELECT definition LIKE '%pos_initialize_brand_setup_v1a_internal%' FROM initializer), false)
    AND COALESCE((SELECT function_count = 1 FROM internal_initializer), false)
    AND COALESCE((SELECT definition LIKE '%trial_ends_at%' FROM internal_initializer), false)
    AND COALESCE((SELECT definition LIKE '%15 days%' FROM internal_initializer), false)
  UNION ALL SELECT 12, 'trial started preserved', COALESCE((SELECT definition LIKE '%trial_started%' FROM initializer), false)
  UNION ALL SELECT 13, 'locations reused', to_regclass('public.pos_locations') IS NOT NULL
    AND COALESCE((SELECT definition LIKE '%INSERT INTO public.pos_locations%' FROM target), false)
  UNION ALL SELECT 14, 'registers reused', to_regclass('public.pos_registers') IS NOT NULL
    AND COALESCE((SELECT definition LIKE '%INSERT INTO public.pos_registers%' FROM target), false)
  UNION ALL SELECT 15, 'no brand analysis insert', COALESCE((SELECT definition NOT LIKE '%INSERT INTO public.brand_analysis%' FROM target), false)
  UNION ALL SELECT 16, 'no cosmos memory insert', COALESCE((SELECT definition NOT LIKE '%INSERT INTO public.cosmos_memory%' FROM target), false)
  UNION ALL SELECT 17, 'no billing provider', COALESCE((SELECT definition !~* '(stripe|mercado.?pago|wallet|checkout)' FROM target), false)
  UNION ALL SELECT 18, 'ENTRY V1A intact', EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.brands'::regclass AND contype = 'u' AND pg_get_constraintdef(oid) = 'UNIQUE (slug)'
  )
  UNION ALL SELECT 19, 'V1A entitlements intact', to_regclass('public.pos_entitlements') IS NOT NULL
    AND to_regprocedure('public.pos_get_brand_entitlements(text)') IS NOT NULL
  UNION ALL SELECT 20, 'V1B lifecycle intact', to_regprocedure('public.pos_get_subscription_lifecycle(text)') IS NOT NULL
  UNION ALL SELECT 21, 'CORE-1 commercial authority intact',
    to_regprocedure('public.pos_get_subscription_lifecycle(text)') IS NOT NULL
    AND to_regprocedure('public.pos_get_brand_entitlements(text)') IS NOT NULL
  UNION ALL SELECT 22, 'V2C.1 intact', to_regprocedure('public.pos_complete_inventory_receipt_v2(text,text,uuid,text,text,text,jsonb,uuid,uuid)') IS NOT NULL
  UNION ALL SELECT 23, 'idempotency tenant creator scope', EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'brands'
      AND indexname = 'brands_creator_creation_key_uidx'
      AND indexdef LIKE '%(created_by, creation_idempotency_key)%'
      AND indexdef LIKE '%WHERE (creation_idempotency_key IS NOT NULL)%'
  )
), diagnostic AS (
  SELECT check_no, check_name, passed, '{}'::jsonb AS details FROM checks
  UNION ALL
  SELECT 24, 'SUMMARY all_checks_passed', bool_and(passed), jsonb_build_object(
    'passed_count', count(*) FILTER (WHERE passed),
    'failed_count', count(*) FILTER (WHERE NOT passed),
    'all_checks_passed', bool_and(passed)
  ) FROM checks
)
SELECT * FROM diagnostic ORDER BY check_no;
