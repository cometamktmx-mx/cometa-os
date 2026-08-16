-- LOYALTY V4B VISITS PRE-FLIGHT
-- READ ONLY
-- Ejecutar después de Loyalty V4A y antes de diseñar/aplicar Loyalty V4B.

-- 1. Existencia de tablas actuales y candidatas V4B.
WITH expected_tables(table_name) AS (
  VALUES
    ('pos_loyalty_programs'),
    ('pos_loyalty_members'),
    ('pos_loyalty_tiers'),
    ('pos_loyalty_rewards'),
    ('pos_loyalty_transactions'),
    ('pos_loyalty_redemptions'),
    ('pos_sale_loyalty_tier_snapshots'),
    ('pos_sales'),
    ('pos_loyalty_visit_programs'),
    ('pos_loyalty_visit_events'),
    ('pos_loyalty_reward_unlocks')
)
SELECT
  expected.table_name,
  to_regclass('public.' || expected.table_name) AS installed_relation
FROM expected_tables expected
ORDER BY expected.table_name;

-- 2. Columnas, tipos, nullability y defaults de la infraestructura actual.
SELECT
  relation.relname AS table_name,
  attribute.attnum AS ordinal_position,
  attribute.attname AS column_name,
  format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
  attribute.attnotnull AS not_null,
  pg_get_expr(default_value.adbin, default_value.adrelid) AS default_expression
FROM pg_class relation
JOIN pg_namespace namespace
  ON namespace.oid = relation.relnamespace
JOIN pg_attribute attribute
  ON attribute.attrelid = relation.oid
LEFT JOIN pg_attrdef default_value
  ON default_value.adrelid = attribute.attrelid
 AND default_value.adnum = attribute.attnum
WHERE namespace.nspname = 'public'
  AND relation.relname IN (
    'pos_loyalty_programs',
    'pos_loyalty_members',
    'pos_loyalty_tiers',
    'pos_loyalty_rewards',
    'pos_loyalty_transactions',
    'pos_loyalty_redemptions',
    'pos_sale_loyalty_tier_snapshots',
    'pos_sales'
  )
  AND attribute.attnum > 0
  AND NOT attribute.attisdropped
ORDER BY relation.relname, attribute.attnum;

-- 3. PK, FK, UNIQUE, CHECK y exclusiones actuales.
SELECT
  constraint_row.conrelid::regclass::text AS table_name,
  constraint_row.conname AS constraint_name,
  CASE constraint_row.contype
    WHEN 'p' THEN 'PRIMARY KEY'
    WHEN 'f' THEN 'FOREIGN KEY'
    WHEN 'u' THEN 'UNIQUE'
    WHEN 'c' THEN 'CHECK'
    WHEN 'x' THEN 'EXCLUSION'
    ELSE constraint_row.contype::text
  END AS constraint_type,
  pg_get_constraintdef(constraint_row.oid, true) AS definition,
  constraint_row.convalidated AS validated
FROM pg_constraint constraint_row
WHERE constraint_row.conrelid IN (
  'public.pos_loyalty_programs'::regclass,
  'public.pos_loyalty_members'::regclass,
  'public.pos_loyalty_tiers'::regclass,
  'public.pos_loyalty_rewards'::regclass,
  'public.pos_loyalty_transactions'::regclass,
  'public.pos_loyalty_redemptions'::regclass,
  'public.pos_sale_loyalty_tier_snapshots'::regclass,
  'public.pos_sales'::regclass
)
ORDER BY table_name, constraint_type, constraint_name;

-- 4. Índices actuales, incluidos parciales e idempotencia de venta/redemption.
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'pos_loyalty_programs',
    'pos_loyalty_members',
    'pos_loyalty_tiers',
    'pos_loyalty_rewards',
    'pos_loyalty_transactions',
    'pos_loyalty_redemptions',
    'pos_sale_loyalty_tier_snapshots',
    'pos_sales'
  )
ORDER BY tablename, indexname;

-- 5. Triggers no internos y funciones asociadas.
SELECT
  trigger_row.tgrelid::regclass::text AS table_name,
  trigger_row.tgname AS trigger_name,
  trigger_row.tgenabled AS enabled_mode,
  pg_get_triggerdef(trigger_row.oid, true) AS definition,
  trigger_function.oid::regprocedure::text AS trigger_function
FROM pg_trigger trigger_row
JOIN pg_proc trigger_function
  ON trigger_function.oid = trigger_row.tgfoid
WHERE trigger_row.tgrelid IN (
  'public.pos_loyalty_programs'::regclass,
  'public.pos_loyalty_members'::regclass,
  'public.pos_loyalty_tiers'::regclass,
  'public.pos_loyalty_rewards'::regclass,
  'public.pos_loyalty_transactions'::regclass,
  'public.pos_loyalty_redemptions'::regclass,
  'public.pos_sale_loyalty_tier_snapshots'::regclass,
  'public.pos_sales'::regclass
)
  AND NOT trigger_row.tgisinternal
ORDER BY table_name, trigger_name;

-- 6. RLS y FORCE RLS.
SELECT
  namespace.nspname AS schema_name,
  relation.relname AS table_name,
  relation.relrowsecurity AS rls_enabled,
  relation.relforcerowsecurity AS rls_forced
FROM pg_class relation
JOIN pg_namespace namespace
  ON namespace.oid = relation.relnamespace
WHERE namespace.nspname = 'public'
  AND relation.relname IN (
    'pos_loyalty_programs',
    'pos_loyalty_members',
    'pos_loyalty_tiers',
    'pos_loyalty_rewards',
    'pos_loyalty_transactions',
    'pos_loyalty_redemptions',
    'pos_sale_loyalty_tier_snapshots',
    'pos_sales'
  )
ORDER BY relation.relname;

-- 7. Policies completas.
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'pos_loyalty_programs',
    'pos_loyalty_members',
    'pos_loyalty_tiers',
    'pos_loyalty_rewards',
    'pos_loyalty_transactions',
    'pos_loyalty_redemptions',
    'pos_sale_loyalty_tier_snapshots',
    'pos_sales'
  )
ORDER BY tablename, policyname;

-- 8A. Existencia y overloads de RPCs relevantes.
WITH expected_functions(function_name) AS (
  VALUES
    ('pos_complete_sale_v2'),
    ('pos_complete_sale_v3'),
    ('pos_register_loyalty_member'),
    ('pos_register_loyalty_member_v2'),
    ('pos_resolve_loyalty_tier'),
    ('pos_loyalty_adjust_points'),
    ('pos_create_loyalty_tier'),
    ('pos_update_loyalty_tier'),
    ('pos_set_loyalty_tier_active')
)
SELECT
  expected.function_name,
  EXISTS (
    SELECT 1
    FROM pg_proc procedure
    JOIN pg_namespace namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = expected.function_name
  ) AS function_exists,
  (
    SELECT count(*)
    FROM pg_proc procedure
    JOIN pg_namespace namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = expected.function_name
  ) AS overload_count
FROM expected_functions expected
ORDER BY expected.function_name;

-- 8B. Firma, resultado, seguridad, search_path y hash SHA256.
SELECT
  procedure.proname AS function_name,
  procedure.oid::regprocedure::text AS identity,
  pg_get_function_identity_arguments(procedure.oid) AS identity_arguments,
  pg_get_function_result(procedure.oid) AS result_type,
  language.lanname AS language,
  procedure.prosecdef AS security_definer,
  procedure.provolatile AS volatility,
  procedure.proconfig AS function_configuration,
  encode(
    sha256(convert_to(pg_get_functiondef(procedure.oid), 'UTF8')),
    'hex'
  ) AS definition_sha256
FROM pg_proc procedure
JOIN pg_namespace namespace
  ON namespace.oid = procedure.pronamespace
JOIN pg_language language
  ON language.oid = procedure.prolang
WHERE namespace.nspname = 'public'
  AND procedure.proname IN (
    'pos_complete_sale_v2',
    'pos_complete_sale_v3',
    'pos_register_loyalty_member',
    'pos_register_loyalty_member_v2',
    'pos_resolve_loyalty_tier',
    'pos_loyalty_adjust_points',
    'pos_create_loyalty_tier',
    'pos_update_loyalty_tier',
    'pos_set_loyalty_tier_active'
  )
ORDER BY procedure.proname, identity;

-- 8C. Definiciones completas. Ejecutar este bloque individualmente si el editor trunca celdas.
SELECT
  procedure.oid::regprocedure::text AS identity,
  pg_get_functiondef(procedure.oid) AS function_definition
FROM pg_proc procedure
JOIN pg_namespace namespace
  ON namespace.oid = procedure.pronamespace
WHERE namespace.nspname = 'public'
  AND procedure.proname IN (
    'pos_complete_sale_v2',
    'pos_complete_sale_v3',
    'pos_register_loyalty_member',
    'pos_register_loyalty_member_v2',
    'pos_resolve_loyalty_tier'
  )
ORDER BY procedure.proname, identity;

-- 8D. ACL expandida de RPCs.
SELECT
  procedure.oid::regprocedure::text AS identity,
  COALESCE(grantee_role.rolname, 'PUBLIC') AS grantee,
  privilege.privilege_type,
  privilege.is_grantable,
  grantor_role.rolname AS grantor
FROM pg_proc procedure
JOIN pg_namespace namespace
  ON namespace.oid = procedure.pronamespace
CROSS JOIN LATERAL aclexplode(
  COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
) privilege
LEFT JOIN pg_roles grantee_role
  ON grantee_role.oid = privilege.grantee
LEFT JOIN pg_roles grantor_role
  ON grantor_role.oid = privilege.grantor
WHERE namespace.nspname = 'public'
  AND procedure.proname IN (
    'pos_complete_sale_v2',
    'pos_complete_sale_v3',
    'pos_register_loyalty_member',
    'pos_register_loyalty_member_v2',
    'pos_resolve_loyalty_tier',
    'pos_loyalty_adjust_points',
    'pos_create_loyalty_tier',
    'pos_update_loyalty_tier',
    'pos_set_loyalty_tier_active'
  )
ORDER BY identity, grantee, privilege.privilege_type;

-- 9. Conteos no personales para dimensionar estado actual.
SELECT 'programs' AS entity, count(*) AS row_count FROM public.pos_loyalty_programs
UNION ALL
SELECT 'members', count(*) FROM public.pos_loyalty_members
UNION ALL
SELECT 'tiers', count(*) FROM public.pos_loyalty_tiers
UNION ALL
SELECT 'rewards', count(*) FROM public.pos_loyalty_rewards
UNION ALL
SELECT 'transactions', count(*) FROM public.pos_loyalty_transactions
UNION ALL
SELECT 'redemptions', count(*) FROM public.pos_loyalty_redemptions
UNION ALL
SELECT 'tier_snapshots', count(*) FROM public.pos_sale_loyalty_tier_snapshots
ORDER BY entity;

-- 10. Catálogo de valores realmente usados, sin exponer clientes.
SELECT
  'reward_type' AS field,
  reward.reward_type AS value,
  count(*) AS row_count
FROM public.pos_loyalty_rewards reward
GROUP BY reward.reward_type
UNION ALL
SELECT
  'transaction_type',
  transaction.transaction_type,
  count(*)
FROM public.pos_loyalty_transactions transaction
GROUP BY transaction.transaction_type
UNION ALL
SELECT
  'redemption_status',
  redemption.status,
  count(*)
FROM public.pos_loyalty_redemptions redemption
GROUP BY redemption.status
ORDER BY field, value;
