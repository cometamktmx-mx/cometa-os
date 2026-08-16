-- COMETA Product Platform V1A.0
-- Canonical inventory of the existing POS product/subscription subsystem.
-- READ ONLY: run in Supabase SQL Editor and export every result grid.

BEGIN TRANSACTION READ ONLY;

-- 01. Target table existence, identity, ownership and RLS.
SELECT
  '01_table_inventory'::text AS section,
  requested.table_name,
  c.oid,
  pg_get_userbyid(c.relowner) AS owner,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  c.relkind
FROM (
  VALUES
    ('pos_plans'),
    ('pos_plan_limits'),
    ('pos_subscriptions'),
    ('pos_subscription_events'),
    ('pos_capability_catalog'),
    ('pos_business_capabilities')
) AS requested(table_name)
LEFT JOIN pg_namespace n
  ON n.nspname = 'public'
LEFT JOIN pg_class c
  ON c.relnamespace = n.oid
 AND c.relname = requested.table_name
 AND c.relkind IN ('r', 'p')
ORDER BY requested.table_name;

-- 02. Columns, including precision, default, identity and generated metadata.
SELECT
  '02_columns'::text AS section,
  c.table_name,
  c.ordinal_position AS ordinal,
  c.column_name,
  c.data_type,
  c.udt_schema,
  c.udt_name,
  c.character_maximum_length,
  c.numeric_precision,
  c.numeric_scale,
  c.datetime_precision,
  c.is_nullable,
  c.column_default,
  c.is_identity,
  c.identity_generation,
  c.is_generated,
  c.generation_expression
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN (
    'pos_plans',
    'pos_plan_limits',
    'pos_subscriptions',
    'pos_subscription_events',
    'pos_capability_catalog',
    'pos_business_capabilities'
  )
ORDER BY c.table_name, c.ordinal_position;

-- 03. Complete PK, UNIQUE, CHECK and FK definitions.
SELECT
  '03_constraints'::text AS section,
  c.relname AS table_name,
  con.conname AS constraint_name,
  CASE con.contype
    WHEN 'p' THEN 'PRIMARY KEY'
    WHEN 'u' THEN 'UNIQUE'
    WHEN 'f' THEN 'FOREIGN KEY'
    WHEN 'c' THEN 'CHECK'
    WHEN 'x' THEN 'EXCLUSION'
    ELSE con.contype::text
  END AS constraint_type,
  con.convalidated AS validated,
  pg_get_constraintdef(con.oid, true) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'pos_plans',
    'pos_plan_limits',
    'pos_subscriptions',
    'pos_subscription_events',
    'pos_capability_catalog',
    'pos_business_capabilities'
  )
ORDER BY c.relname, constraint_type, con.conname;

-- 04. Foreign keys expanded to source/target columns and actions.
SELECT
  '04_foreign_keys'::text AS section,
  src.relname AS source_table,
  con.conname AS constraint_name,
  string_agg(src_att.attname, ', ' ORDER BY key_cols.ordinality) AS source_columns,
  tgt_ns.nspname AS target_schema,
  tgt.relname AS target_table,
  string_agg(tgt_att.attname, ', ' ORDER BY key_cols.ordinality) AS target_columns,
  CASE con.confupdtype
    WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END AS on_update,
  CASE con.confdeltype
    WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END AS on_delete
FROM pg_constraint con
JOIN pg_class src ON src.oid = con.conrelid
JOIN pg_namespace src_ns ON src_ns.oid = src.relnamespace
JOIN pg_class tgt ON tgt.oid = con.confrelid
JOIN pg_namespace tgt_ns ON tgt_ns.oid = tgt.relnamespace
JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY
  AS key_cols(src_attnum, tgt_attnum, ordinality) ON true
JOIN pg_attribute src_att
  ON src_att.attrelid = src.oid AND src_att.attnum = key_cols.src_attnum
JOIN pg_attribute tgt_att
  ON tgt_att.attrelid = tgt.oid AND tgt_att.attnum = key_cols.tgt_attnum
WHERE con.contype = 'f'
  AND src_ns.nspname = 'public'
  AND src.relname IN (
    'pos_plans',
    'pos_plan_limits',
    'pos_subscriptions',
    'pos_subscription_events',
    'pos_capability_catalog',
    'pos_business_capabilities'
  )
GROUP BY src.relname, con.conname, tgt_ns.nspname, tgt.relname,
  con.confupdtype, con.confdeltype
ORDER BY src.relname, con.conname;

-- 05. Indexes (constraint-backed and independent).
SELECT
  '05_indexes'::text AS section,
  pi.tablename AS table_name,
  indexname AS index_name,
  ix.indisunique AS is_unique,
  ix.indisprimary AS is_primary,
  ix.indisvalid AS is_valid,
  indexdef AS definition
FROM pg_indexes pi
JOIN pg_namespace n ON n.nspname = pi.schemaname
JOIN pg_class ic ON ic.relnamespace = n.oid AND ic.relname = pi.indexname
JOIN pg_index ix ON ix.indexrelid = ic.oid
WHERE pi.schemaname = 'public'
  AND pi.tablename IN (
    'pos_plans',
    'pos_plan_limits',
    'pos_subscriptions',
    'pos_subscription_events',
    'pos_capability_catalog',
    'pos_business_capabilities'
  )
ORDER BY table_name, index_name;

-- 06. RLS policies.
SELECT
  '06_rls_policies'::text AS section,
  tablename AS table_name,
  policyname AS policy_name,
  permissive,
  roles,
  cmd AS command,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'pos_plans',
    'pos_plan_limits',
    'pos_subscriptions',
    'pos_subscription_events',
    'pos_capability_catalog',
    'pos_business_capabilities'
  )
ORDER BY tablename, policyname;

-- 07. Effective table ACL for the roles relevant to the application.
SELECT
  '07_table_acl'::text AS section,
  c.relname AS table_name,
  roles.role_name,
  privilege.privilege_type,
  CASE
    WHEN roles.role_name = 'PUBLIC' THEN EXISTS (
      SELECT 1
      FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) acl
      WHERE acl.grantee = 0
        AND acl.privilege_type = privilege.privilege_type
    )
    ELSE has_table_privilege(
      roles.role_name,
      c.oid,
      privilege.privilege_type
    )
  END AS granted
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN (VALUES ('PUBLIC'), ('anon'), ('authenticated'), ('service_role'), ('postgres'))
  AS roles(role_name)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'))
  AS privilege(privilege_type)
WHERE n.nspname = 'public'
  AND c.relname IN (
    'pos_plans',
    'pos_plan_limits',
    'pos_subscriptions',
    'pos_subscription_events',
    'pos_capability_catalog',
    'pos_business_capabilities'
  )
ORDER BY c.relname, roles.role_name, privilege.privilege_type;

-- 08. Exact overloads and security metadata for the two known RPCs.
SELECT
  '08_known_functions'::text AS section,
  p.oid,
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_function_result(p.oid) AS result_type,
  l.lanname AS language,
  p.provolatile AS volatility_code,
  p.prosecdef AS security_definer,
  p.proconfig,
  pg_get_userbyid(p.proowner) AS owner,
  p.proacl AS acl,
  pg_get_functiondef(p.oid) AS full_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = 'public'
  AND p.proname IN (
    'pos_initialize_brand_setup',
    'pos_set_subscription_offer'
  )
ORDER BY p.proname, identity_arguments;

-- 09. Effective function EXECUTE privileges.
SELECT
  '09_known_function_acl'::text AS section,
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  roles.role_name,
  CASE
    WHEN roles.role_name = 'PUBLIC' THEN EXISTS (
      SELECT 1
      FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
      WHERE acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    )
    ELSE has_function_privilege(roles.role_name, p.oid, 'EXECUTE')
  END AS can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN (VALUES ('PUBLIC'), ('anon'), ('authenticated'), ('service_role'), ('postgres'))
  AS roles(role_name)
WHERE n.nspname = 'public'
  AND p.proname IN (
    'pos_initialize_brand_setup',
    'pos_set_subscription_offer'
  )
ORDER BY p.proname, identity_arguments, roles.role_name;

-- 10. Candidate related functions. Review definitions manually; a name match
-- does not by itself make a function part of Product Platform.
SELECT
  '10_related_function_candidates'::text AS section,
  p.oid,
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_function_result(p.oid) AS result_type,
  l.lanname AS language,
  p.prosecdef AS security_definer,
  p.proconfig,
  pg_get_userbyid(p.proowner) AS owner,
  p.proacl AS acl,
  pg_get_functiondef(p.oid) AS full_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = 'public'
  AND (
    p.proname ILIKE '%subscription%'
    OR p.proname ILIKE '%plan%'
    OR p.proname ILIKE '%capability%'
    OR p.proname ILIKE '%offer%'
    OR p.proname ILIKE '%trial%'
  )
ORDER BY p.proname, identity_arguments;

-- 11. Enum labels used by target-table columns, if any.
SELECT
  '11_enum_values'::text AS section,
  c.relname AS table_name,
  a.attname AS column_name,
  t.typname AS enum_type,
  e.enumsortorder,
  e.enumlabel
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
JOIN pg_type t ON t.oid = a.atttypid AND t.typtype = 'e'
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE n.nspname = 'public'
  AND c.relname IN (
    'pos_plans',
    'pos_plan_limits',
    'pos_subscriptions',
    'pos_subscription_events',
    'pos_capability_catalog',
    'pos_business_capabilities'
  )
ORDER BY c.relname, a.attname, e.enumsortorder;

-- 12. Relevant CHECK constraints are the canonical source for text enums.
SELECT
  '12_status_and_code_checks'::text AS section,
  c.relname AS table_name,
  con.conname AS constraint_name,
  pg_get_constraintdef(con.oid, true) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'pos_plans',
    'pos_plan_limits',
    'pos_subscriptions',
    'pos_subscription_events',
    'pos_capability_catalog',
    'pos_business_capabilities'
  )
  AND con.contype = 'c'
ORDER BY c.relname, con.conname;

-- 13. Non-sensitive catalog samples. Catalog rows are product definitions,
-- not tenant assignments. Limit prevents accidental large output.
SELECT '13a_pos_plans_sample'::text AS section, to_jsonb(p) AS catalog_row
FROM public.pos_plans p
ORDER BY p.code
LIMIT 50;

SELECT '13b_pos_plan_limits_sample'::text AS section, to_jsonb(l) AS catalog_row
FROM public.pos_plan_limits l
ORDER BY l.plan_code
LIMIT 50;

SELECT '13c_capability_catalog_sample'::text AS section, to_jsonb(c) AS catalog_row
FROM public.pos_capability_catalog c
ORDER BY c.code
LIMIT 100;

-- 14. Tenant-safe aggregate subscription distribution. No brand identifiers.
SELECT
  '14_subscription_distribution'::text AS section,
  plan_code,
  status,
  count(*)::bigint AS subscriptions_count
FROM public.pos_subscriptions
GROUP BY plan_code, status
ORDER BY plan_code, status;

-- 15. Capability assignment distribution. No brand identifiers.
SELECT
  '15_capability_distribution'::text AS section,
  capability_code,
  enabled,
  source,
  count(*)::bigint AS brand_assignments_count
FROM public.pos_business_capabilities
GROUP BY capability_code, enabled, source
ORDER BY capability_code, enabled DESC, source;

-- 16. Candidate trial/history tables in public (metadata only).
SELECT
  '16_trial_and_history_table_candidates'::text AS section,
  c.relname AS table_name,
  c.oid,
  pg_get_userbyid(c.relowner) AS owner,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p', 'v', 'm')
  AND (
    c.relname ILIKE '%subscription%'
    OR c.relname ILIKE '%plan%history%'
    OR c.relname ILIKE '%subscription%history%'
    OR c.relname ILIKE '%trial%'
    OR c.relname ILIKE '%offer%history%'
  )
ORDER BY c.relname;

-- 17. Date/readiness columns on subscription/history candidates.
SELECT
  '17_trial_and_history_columns'::text AS section,
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND (
    c.table_name ILIKE '%subscription%'
    OR c.table_name ILIKE '%plan%history%'
    OR c.table_name ILIKE '%trial%'
    OR c.table_name ILIKE '%offer%history%'
  )
ORDER BY c.table_name, c.ordinal_position;

-- 18. Subscription event table identity and storage statistics.
SELECT
  '18_subscription_events_structure'::text AS section,
  c.oid,
  c.relname AS table_name,
  pg_get_userbyid(c.relowner) AS owner,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  c.relkind,
  c.relpersistence,
  c.reltuples::bigint AS estimated_rows,
  pg_total_relation_size(c.oid) AS total_bytes
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'pos_subscription_events'
  AND c.relkind IN ('r', 'p');

-- 19. Subscription event constraints, including event_type CHECKs.
SELECT
  '19_subscription_events_constraints'::text AS section,
  con.conname AS constraint_name,
  CASE con.contype
    WHEN 'p' THEN 'PRIMARY KEY'
    WHEN 'u' THEN 'UNIQUE'
    WHEN 'f' THEN 'FOREIGN KEY'
    WHEN 'c' THEN 'CHECK'
    WHEN 'x' THEN 'EXCLUSION'
    ELSE con.contype::text
  END AS constraint_type,
  con.convalidated AS validated,
  pg_get_constraintdef(con.oid, true) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'pos_subscription_events'
ORDER BY constraint_type, con.conname;

-- 20. Subscription event indexes.
SELECT
  '20_subscription_events_indexes'::text AS section,
  pi.indexname AS index_name,
  ix.indisunique AS is_unique,
  ix.indisprimary AS is_primary,
  ix.indisvalid AS is_valid,
  pi.indexdef AS definition
FROM pg_indexes pi
JOIN pg_namespace n ON n.nspname = pi.schemaname
JOIN pg_class ic ON ic.relnamespace = n.oid AND ic.relname = pi.indexname
JOIN pg_index ix ON ix.indexrelid = ic.oid
WHERE pi.schemaname = 'public'
  AND pi.tablename = 'pos_subscription_events'
ORDER BY pi.indexname;

-- 21. Subscription event RLS policies.
SELECT
  '21_subscription_events_rls'::text AS section,
  policyname AS policy_name,
  permissive,
  roles,
  cmd AS command,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'pos_subscription_events'
ORDER BY policyname;

-- 22. Effective subscription event ACL. PUBLIC is pseudo-role grantee 0;
-- real roles continue through PostgreSQL's effective privilege resolver.
SELECT
  '22_subscription_events_acl'::text AS section,
  roles.role_name,
  privilege.privilege_type,
  CASE
    WHEN roles.role_name = 'PUBLIC' THEN EXISTS (
      SELECT 1
      FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) acl
      WHERE acl.grantee = 0
        AND acl.privilege_type = privilege.privilege_type
    )
    ELSE has_table_privilege(
      roles.role_name,
      c.oid,
      privilege.privilege_type
    )
  END AS granted
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN (VALUES ('PUBLIC'), ('anon'), ('authenticated'), ('service_role'), ('postgres'))
  AS roles(role_name)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'))
  AS privilege(privilege_type)
WHERE n.nspname = 'public'
  AND c.relname = 'pos_subscription_events'
ORDER BY roles.role_name, privilege.privilege_type;

-- 23. Safe aggregate of event types currently stored; no tenant/event rows.
SELECT
  '23_subscription_event_type_distribution'::text AS section,
  event_type,
  count(*)::bigint AS events_count
FROM public.pos_subscription_events
GROUP BY event_type
ORDER BY event_type;

-- 24. event_type type/domain/enum and trigger enforcement.
SELECT
  '24a_subscription_event_type_contract'::text AS section,
  a.attname AS column_name,
  format_type(a.atttypid, a.atttypmod) AS formatted_type,
  t.typtype AS type_kind,
  tn.nspname AS type_schema,
  t.typname AS type_name,
  bt.typname AS domain_base_type,
  pg_get_expr(t.typdefaultbin, 0) AS type_default
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a
  ON a.attrelid = c.oid
 AND a.attname = 'event_type'
 AND a.attnum > 0
 AND NOT a.attisdropped
JOIN pg_type t ON t.oid = a.atttypid
JOIN pg_namespace tn ON tn.oid = t.typnamespace
LEFT JOIN pg_type bt ON bt.oid = t.typbasetype
WHERE n.nspname = 'public'
  AND c.relname = 'pos_subscription_events';

SELECT
  '24b_subscription_event_type_enum_labels'::text AS section,
  t.typname AS enum_type,
  e.enumsortorder,
  e.enumlabel
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'event_type'
JOIN pg_type t ON t.oid = a.atttypid
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE n.nspname = 'public'
  AND c.relname = 'pos_subscription_events'
ORDER BY e.enumsortorder;

SELECT
  '24c_subscription_event_type_domain_checks'::text AS section,
  t.typname AS domain_name,
  con.conname AS constraint_name,
  pg_get_constraintdef(con.oid, true) AS definition
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'event_type'
JOIN pg_type t ON t.oid = a.atttypid
JOIN pg_constraint con ON con.contypid = t.oid
WHERE n.nspname = 'public'
  AND c.relname = 'pos_subscription_events'
ORDER BY con.conname;

SELECT
  '24d_subscription_events_triggers'::text AS section,
  tr.tgname AS trigger_name,
  tr.tgenabled AS enabled_code,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS function_arguments,
  pg_get_triggerdef(tr.oid, true) AS trigger_definition,
  pg_get_functiondef(p.oid) AS trigger_function_definition
FROM pg_trigger tr
JOIN pg_class c ON c.oid = tr.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = tr.tgfoid
WHERE n.nspname = 'public'
  AND c.relname = 'pos_subscription_events'
  AND NOT tr.tgisinternal
ORDER BY tr.tgname;

-- 25. Static indicators over every pos_set_subscription_offer overload.
-- The complete definition remains authoritative in section 08.
WITH offer_functions AS (
  SELECT
    p.oid,
    p.proname,
    pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'pos_set_subscription_offer'
)
SELECT
  '25_subscription_offer_semantics'::text AS section,
  oid,
  proname,
  identity_arguments,
  definition ~* '\mplan_code\M' AS references_plan_code,
  definition ~* '\mstatus\M' AS references_status,
  definition ~* '(list_price|contracted_price|price_locked)' AS references_pricing,
  definition ~* '\mpromotion_code\M' AS references_promotion_code,
  definition ~* '(trial_ends_at|started_at|grace_ends_at|current_period_start|current_period_end|cancelled_at)'
    AS references_subscription_dates,
  definition ~* '\mpos_subscription_events\M' AS writes_or_reads_subscription_events,
  definition ~* '\mINSERT\s+INTO\s+(public\.)?pos_subscription_events\M'
    AS directly_inserts_subscription_events,
  definition ~* '\mPERFORM\M|\mCALL\M|\.rpc\s*\(' AS invokes_helper_candidate,
  definition
FROM offer_functions
ORDER BY identity_arguments;

-- 26. Static indicators over every pos_initialize_brand_setup overload.
-- Review the returned definition to distinguish reads from writes.
WITH initialize_functions AS (
  SELECT
    p.oid,
    p.proname,
    pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'pos_initialize_brand_setup'
)
SELECT
  '26_initialize_brand_setup_semantics'::text AS section,
  oid,
  proname,
  identity_arguments,
  definition ~* '\mpos_subscriptions\M' AS references_subscriptions,
  definition ~* '\mplan_code\M' AS references_initial_plan,
  definition ~* '\mstatus\M' AS references_initial_status,
  definition ~* '\mtrial_ends_at\M' AS references_trial_end,
  definition ~* '\mpos_plan_limits\M' AS references_plan_limits,
  definition ~* '\mpos_business_capabilities\M' AS references_capabilities,
  definition ~* '\mpos_subscription_events\M' AS references_subscription_events,
  definition ~* '\mINSERT\s+INTO\s+(public\.)?pos_subscription_events\M'
    AS directly_inserts_subscription_events,
  definition ~* '(ON\s+CONFLICT|pg_advisory|FOR\s+UPDATE)' AS has_idempotency_or_lock_marker,
  definition
FROM initialize_functions
ORDER BY identity_arguments;

-- 27. Semantic markers for related candidate functions. A true marker is a
-- review aid, not proof of mutation; inspect full_definition in section 10.
WITH related_functions AS (
  SELECT
    p.oid,
    p.proname,
    pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND (
      p.proname ILIKE '%subscription%'
      OR p.proname ILIKE '%plan%'
      OR p.proname ILIKE '%capability%'
      OR p.proname ILIKE '%offer%'
      OR p.proname ILIKE '%trial%'
    )
)
SELECT
  '27_related_function_semantic_markers'::text AS section,
  oid,
  proname,
  identity_arguments,
  definition ~* '\mplan_code\M' AS references_plan_code,
  definition ~* '\mstatus\M' AS references_status,
  definition ~* '(trial_ends_at|grace_ends_at)' AS references_trial_or_grace_dates,
  definition ~* '\mpos_subscription_events\M' AS references_subscription_events,
  definition ~* '\mINSERT\s+INTO\s+(public\.)?pos_subscription_events\M'
    AS directly_inserts_subscription_events
FROM related_functions
ORDER BY proname, identity_arguments;

ROLLBACK;
