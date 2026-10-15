-- COMETA POS V2C.1 - POSTFLIGHT READ ONLY
WITH checks(check_name, passed, details) AS (
  VALUES
    ('idempotency_key column', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'pos_inventory_receipts'
        AND column_name = 'idempotency_key' AND data_type = 'uuid'
    ), '{}'::jsonb),
    ('payload_fingerprint column', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'pos_inventory_receipts'
        AND column_name = 'payload_fingerprint' AND data_type = 'text'
    ), '{}'::jsonb),
    ('legacy columns nullable', 2 = (
      SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'pos_inventory_receipts'
        AND column_name IN ('idempotency_key', 'payload_fingerprint')
        AND is_nullable = 'YES'
    ), '{}'::jsonb),
    ('fingerprint format constrained', EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.pos_inventory_receipts'::regclass
        AND conname = 'pos_inventory_receipts_payload_fingerprint_format'
        AND pg_get_constraintdef(oid) LIKE '%[0-9a-f]{64}%'
    ), '{}'::jsonb),
    ('tenant partial unique index', EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'pos_inventory_receipts'
        AND indexname = 'pos_inventory_receipts_brand_idempotency_uidx'
        AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
        AND indexdef ~* '\(brand_slug, idempotency_key\)'
        AND indexdef ILIKE '%WHERE%idempotency_key IS NOT NULL%'
    ), '{}'::jsonb),
    ('v1 exact overload preserved', to_regprocedure(
      'public.pos_complete_inventory_receipt_v1(text,text,uuid,text,text,text,jsonb,uuid)'
    ) IS NOT NULL, '{}'::jsonb),
    ('v2 exact overload exists', to_regprocedure(
      'public.pos_complete_inventory_receipt_v2(text,text,uuid,text,text,text,jsonb,uuid,uuid)'
    ) IS NOT NULL, '{}'::jsonb),
    ('v2 returns jsonb', COALESCE(pg_get_function_result(to_regprocedure(
      'public.pos_complete_inventory_receipt_v2(text,text,uuid,text,text,text,jsonb,uuid,uuid)'
    )), '') = 'jsonb', '{}'::jsonb),
    ('v2 security definer', COALESCE((SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure(
      'public.pos_complete_inventory_receipt_v2(text,text,uuid,text,text,text,jsonb,uuid,uuid)'
    )), false), '{}'::jsonb),
    ('v2 search_path public', COALESCE((SELECT proconfig @> ARRAY['search_path=public'] FROM pg_proc WHERE oid = to_regprocedure(
      'public.pos_complete_inventory_receipt_v2(text,text,uuid,text,text,text,jsonb,uuid,uuid)'
    )), false), '{}'::jsonb),
    ('service_role execute', has_function_privilege('service_role',
      'public.pos_complete_inventory_receipt_v2(text,text,uuid,text,text,text,jsonb,uuid,uuid)', 'EXECUTE'
    ), '{}'::jsonb),
    ('anon execute denied', NOT has_function_privilege('anon',
      'public.pos_complete_inventory_receipt_v2(text,text,uuid,text,text,text,jsonb,uuid,uuid)', 'EXECUTE'
    ), '{}'::jsonb),
    ('authenticated execute denied', NOT has_function_privilege('authenticated',
      'public.pos_complete_inventory_receipt_v2(text,text,uuid,text,text,text,jsonb,uuid,uuid)', 'EXECUTE'
    ), '{}'::jsonb),
    ('supplier reference not idempotency unique', NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
        AND tablename = 'pos_inventory_receipts'
        AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
        AND indexdef ILIKE '%supplier_reference%'
    ), '{}'::jsonb),
    ('receipt number unique preserved', EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.pos_inventory_receipts'::regclass AND contype = 'u'
        AND pg_get_constraintdef(oid) ~* 'UNIQUE \(brand_slug, receipt_number\)'
    ), '{}'::jsonb),
    ('status check preserved', EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.pos_inventory_receipts'::regclass AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%status%'
        AND pg_get_constraintdef(oid) ILIKE '%draft%'
        AND pg_get_constraintdef(oid) ILIKE '%completed%'
        AND pg_get_constraintdef(oid) ILIKE '%cancelled%'
    ), '{}'::jsonb),
    ('receipt items preserved', to_regclass('public.pos_inventory_receipt_items') IS NOT NULL, '{}'::jsonb),
    ('inventory movements preserved', to_regclass('public.pos_inventory_movements') IS NOT NULL, '{}'::jsonb),
    ('movement reference columns preserved', 2 = (
      SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'
        AND table_name = 'pos_inventory_movements'
        AND column_name IN ('reference_type', 'reference_id')
    ), '{}'::jsonb),
    ('no idempotency operation table', NOT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_schema = 'public'
        AND table_name IN ('pos_inventory_idempotency_operations', 'pos_inventory_operation_ledger')
    ), '{}'::jsonb),
    ('v2 delegates canonical v1', position(
      'pos_complete_inventory_receipt_v1' IN pg_get_functiondef(to_regprocedure(
        'public.pos_complete_inventory_receipt_v2(text,text,uuid,text,text,text,jsonb,uuid,uuid)'
      ))
    ) > 0, '{}'::jsonb)
), diagnostic AS (
  SELECT check_name, passed, details FROM checks
  UNION ALL
  SELECT 'SUMMARY all_checks_passed', bool_and(passed), jsonb_build_object(
    'failed_count', count(*) FILTER (WHERE NOT passed),
    'passed_count', count(*) FILTER (WHERE passed),
    'all_checks_passed', bool_and(passed)
  ) FROM checks
)
SELECT * FROM diagnostic
ORDER BY CASE WHEN check_name LIKE 'SUMMARY%' THEN 1 ELSE 0 END, check_name;
