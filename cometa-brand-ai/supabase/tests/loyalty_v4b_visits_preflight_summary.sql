-- LOYALTY V4B VISITS PRE-FLIGHT SUMMARY
-- READ ONLY
-- Ejecutar antes de implementar Loyalty V4B.

WITH
expected_base_tables(table_name) AS (
  VALUES
    ('pos_loyalty_programs'),
    ('pos_loyalty_members'),
    ('pos_loyalty_tiers'),
    ('pos_loyalty_rewards'),
    ('pos_loyalty_transactions'),
    ('pos_loyalty_redemptions'),
    ('pos_sale_loyalty_tier_snapshots'),
    ('pos_sales')
),
expected_absent_tables(table_name) AS (
  VALUES
    ('pos_loyalty_visit_programs'),
    ('pos_loyalty_visit_events'),
    ('pos_loyalty_reward_unlocks'),
    ('pos_sale_loyalty_visit_snapshots')
),
expected_base_functions(function_name) AS (
  VALUES
    ('pos_complete_sale_v2'),
    ('pos_complete_sale_v3'),
    ('pos_register_loyalty_member'),
    ('pos_register_loyalty_member_v2'),
    ('pos_resolve_loyalty_tier')
),
v3_function AS (
  SELECT procedure.*
  FROM pg_proc procedure
  JOIN pg_namespace namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'pos_complete_sale_v3'
),
v3_acl AS (
  SELECT
    procedure.oid AS function_oid,
    bool_or(
      role.rolname = 'service_role'
      AND privilege.privilege_type = 'EXECUTE'
    ) AS service_role_execute,
    bool_or(
      privilege.privilege_type = 'EXECUTE'
      AND (
        privilege.grantee = 0
        OR role.rolname IN ('anon', 'authenticated')
      )
    ) AS public_client_execute
  FROM v3_function procedure
  CROSS JOIN LATERAL aclexplode(
    COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
  ) privilege
  LEFT JOIN pg_roles role
    ON role.oid = privilege.grantee
  GROUP BY procedure.oid
),
checks(check_name, passed, actual, expected) AS (
  SELECT
    'BASE ' || expected.table_name,
    relation.oid IS NOT NULL,
    CASE WHEN relation.oid IS NULL THEN 'absent' ELSE 'present' END,
    'present'
  FROM expected_base_tables expected
  LEFT JOIN pg_namespace namespace
    ON namespace.nspname = 'public'
  LEFT JOIN pg_class relation
    ON relation.relnamespace = namespace.oid
   AND relation.relname = expected.table_name
   AND relation.relkind IN ('r', 'p')

  UNION ALL

  SELECT
    'V4B ' || expected.table_name || ' absent',
    relation.oid IS NULL,
    CASE WHEN relation.oid IS NULL THEN 'absent' ELSE 'present' END,
    'absent'
  FROM expected_absent_tables expected
  LEFT JOIN pg_namespace namespace
    ON namespace.nspname = 'public'
  LEFT JOIN pg_class relation
    ON relation.relnamespace = namespace.oid
   AND relation.relname = expected.table_name
   AND relation.relkind IN ('r', 'p')

  UNION ALL

  SELECT
    'V4B pos_complete_sale_v4 absent',
    count(procedure.oid) = 0,
    count(procedure.oid)::text || ' overload(s)',
    '0 overload(s)'
  FROM pg_namespace namespace
  LEFT JOIN pg_proc procedure
    ON procedure.pronamespace = namespace.oid
   AND procedure.proname = 'pos_complete_sale_v4'
  WHERE namespace.nspname = 'public'

  UNION ALL

  SELECT
    'RPC ' || expected.function_name,
    count(procedure.oid) > 0,
    count(procedure.oid)::text || ' overload(s)',
    'at least 1 overload'
  FROM expected_base_functions expected
  LEFT JOIN pg_namespace namespace
    ON namespace.nspname = 'public'
  LEFT JOIN pg_proc procedure
    ON procedure.pronamespace = namespace.oid
   AND procedure.proname = expected.function_name
  GROUP BY expected.function_name

  UNION ALL

  SELECT
    'SECURITY V3 security_definer',
    count(*) > 0 AND bool_and(procedure.prosecdef),
    COALESCE(string_agg(procedure.prosecdef::text, ', '), 'function absent'),
    'true for every overload'
  FROM v3_function procedure

  UNION ALL

  SELECT
    'SECURITY V3 search_path',
    count(*) > 0
      AND bool_and('search_path=public' = ANY(COALESCE(procedure.proconfig, ARRAY[]::text[]))),
    COALESCE(string_agg(COALESCE(array_to_string(procedure.proconfig, ', '), 'null'), ' | '), 'function absent'),
    'search_path=public'
  FROM v3_function procedure

  UNION ALL

  SELECT
    'SECURITY V3 service_role execute',
    count(*) > 0 AND bool_and(acl.service_role_execute),
    CASE
      WHEN count(*) = 0 THEN 'function absent'
      WHEN bool_and(acl.service_role_execute) THEN 'granted'
      ELSE 'missing on one or more overloads'
    END,
    'granted on every overload'
  FROM v3_function procedure
  JOIN v3_acl acl
    ON acl.function_oid = procedure.oid

  UNION ALL

  SELECT
    'SECURITY V3 public/anon/authenticated denied',
    count(*) > 0 AND bool_and(NOT acl.public_client_execute),
    CASE
      WHEN count(*) = 0 THEN 'function absent'
      WHEN bool_and(NOT acl.public_client_execute) THEN 'denied'
      ELSE 'unexpected EXECUTE grant found'
    END,
    'no EXECUTE for PUBLIC, anon or authenticated'
  FROM v3_function procedure
  JOIN v3_acl acl
    ON acl.function_oid = procedure.oid

  UNION ALL

  SELECT
    'IDEMPOTENCY column ' || expected.column_name,
    attribute.attname IS NOT NULL,
    CASE WHEN attribute.attname IS NULL THEN 'absent' ELSE format_type(attribute.atttypid, attribute.atttypmod) END,
    expected.expected_type
  FROM (
    VALUES
      ('idempotency_key', 'uuid'),
      ('idempotency_fingerprint', 'text'),
      ('loyalty_discount_total', 'numeric(14,2)')
  ) AS expected(column_name, expected_type)
  LEFT JOIN pg_namespace namespace
    ON namespace.nspname = 'public'
  LEFT JOIN pg_class relation
    ON relation.relnamespace = namespace.oid
   AND relation.relname = 'pos_sales'
  LEFT JOIN pg_attribute attribute
    ON attribute.attrelid = relation.oid
   AND attribute.attname = expected.column_name
   AND attribute.attnum > 0
   AND NOT attribute.attisdropped

  UNION ALL

  SELECT
    'IDEMPOTENCY unique brand_slug + idempotency_key',
    EXISTS (
      SELECT 1
      FROM pg_indexes index_row
      WHERE index_row.schemaname = 'public'
        AND index_row.tablename = 'pos_sales'
        AND index_row.indexdef ILIKE 'CREATE UNIQUE INDEX%'
        AND index_row.indexdef ~* '\(brand_slug, idempotency_key\)'
    ),
    COALESCE((
      SELECT string_agg(index_row.indexname, ', ')
      FROM pg_indexes index_row
      WHERE index_row.schemaname = 'public'
        AND index_row.tablename = 'pos_sales'
        AND index_row.indexdef ILIKE 'CREATE UNIQUE INDEX%'
        AND index_row.indexdef ~* '\(brand_slug, idempotency_key\)'
    ), 'absent'),
    'unique index on (brand_slug, idempotency_key)'

  UNION ALL

  SELECT
    'REWARDS column ' || expected.column_name,
    attribute.attname IS NOT NULL,
    CASE WHEN attribute.attname IS NULL THEN 'absent' ELSE format_type(attribute.atttypid, attribute.atttypmod) END,
    'present'
  FROM (
    VALUES ('reward_type'), ('points_cost'), ('reward_value'), ('active')
  ) AS expected(column_name)
  LEFT JOIN pg_namespace namespace
    ON namespace.nspname = 'public'
  LEFT JOIN pg_class relation
    ON relation.relnamespace = namespace.oid
   AND relation.relname = 'pos_loyalty_rewards'
  LEFT JOIN pg_attribute attribute
    ON attribute.attrelid = relation.oid
   AND attribute.attname = expected.column_name
   AND attribute.attnum > 0
   AND NOT attribute.attisdropped

  UNION ALL

  SELECT
    'REWARDS discount_fixed constraint compatible',
    NOT EXISTS (
      SELECT 1
      FROM pg_constraint constraint_row
      JOIN pg_namespace namespace
        ON namespace.oid = constraint_row.connamespace
      WHERE constraint_row.conrelid = to_regclass('public.pos_loyalty_rewards')
        AND constraint_row.contype = 'c'
        AND pg_get_constraintdef(constraint_row.oid, true) ILIKE '%reward_type%'
        AND pg_get_constraintdef(constraint_row.oid, true) NOT ILIKE '%discount_fixed%'
    ),
    COALESCE((
      SELECT string_agg(pg_get_constraintdef(constraint_row.oid, true), ' | ')
      FROM pg_constraint constraint_row
      WHERE constraint_row.conrelid = to_regclass('public.pos_loyalty_rewards')
        AND constraint_row.contype = 'c'
        AND pg_get_constraintdef(constraint_row.oid, true) ILIKE '%reward_type%'
    ), 'no reward_type CHECK'),
    'no CHECK excludes discount_fixed'

  UNION ALL

  SELECT
    'MEMBERS column ' || expected.column_name,
    attribute.attname IS NOT NULL,
    CASE WHEN attribute.attname IS NULL THEN 'absent' ELSE format_type(attribute.atttypid, attribute.atttypmod) END,
    'present'
  FROM (
    VALUES ('points_balance'), ('lifetime_points'), ('tier_id'), ('status')
  ) AS expected(column_name)
  LEFT JOIN pg_namespace namespace
    ON namespace.nspname = 'public'
  LEFT JOIN pg_class relation
    ON relation.relnamespace = namespace.oid
   AND relation.relname = 'pos_loyalty_members'
  LEFT JOIN pg_attribute attribute
    ON attribute.attrelid = relation.oid
   AND attribute.attname = expected.column_name
   AND attribute.attnum > 0
   AND NOT attribute.attisdropped

  UNION ALL

  SELECT
    'TRANSACTIONS points ledger columns',
    count(*) = 3,
    string_agg(attribute.attname, ', ' ORDER BY attribute.attname),
    'balance_after, points, transaction_type'
  FROM pg_attribute attribute
  WHERE attribute.attrelid = to_regclass('public.pos_loyalty_transactions')
    AND attribute.attname IN ('transaction_type', 'points', 'balance_after')
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped

  UNION ALL

  SELECT
    'TRANSACTIONS current types constrained',
    EXISTS (
      SELECT 1
      FROM pg_constraint constraint_row
      WHERE constraint_row.conrelid = to_regclass('public.pos_loyalty_transactions')
        AND constraint_row.contype = 'c'
        AND pg_get_constraintdef(constraint_row.oid, true) ILIKE '%transaction_type%'
        AND pg_get_constraintdef(constraint_row.oid, true) ILIKE '%adjust%'
        AND pg_get_constraintdef(constraint_row.oid, true) ILIKE '%earn%'
        AND pg_get_constraintdef(constraint_row.oid, true) ILIKE '%expire%'
        AND pg_get_constraintdef(constraint_row.oid, true) ILIKE '%redeem%'
    ),
    COALESCE((
      SELECT string_agg(pg_get_constraintdef(constraint_row.oid, true), ' | ')
      FROM pg_constraint constraint_row
      WHERE constraint_row.conrelid = to_regclass('public.pos_loyalty_transactions')
        AND constraint_row.contype = 'c'
        AND pg_get_constraintdef(constraint_row.oid, true) ILIKE '%transaction_type%'
    ), 'constraint absent'),
    'CHECK contains adjust, earn, expire, redeem'

  UNION ALL

  SELECT
    'REDEMPTIONS points_spent positive',
    EXISTS (
      SELECT 1
      FROM pg_constraint constraint_row
      WHERE constraint_row.conrelid = to_regclass('public.pos_loyalty_redemptions')
        AND constraint_row.contype = 'c'
        AND pg_get_constraintdef(constraint_row.oid, true) ILIKE '%points_spent%'
        AND pg_get_constraintdef(constraint_row.oid, true) ~ '>\s*0'
    ),
    COALESCE((
      SELECT string_agg(pg_get_constraintdef(constraint_row.oid, true), ' | ')
      FROM pg_constraint constraint_row
      WHERE constraint_row.conrelid = to_regclass('public.pos_loyalty_redemptions')
        AND constraint_row.contype = 'c'
        AND pg_get_constraintdef(constraint_row.oid, true) ILIKE '%points_spent%'
    ), 'constraint absent'),
    'points_spent > 0'

  UNION ALL

  SELECT
    'TIER SNAPSHOT sale unique',
    EXISTS (
      SELECT 1
      FROM pg_constraint constraint_row
      WHERE constraint_row.conrelid = to_regclass('public.pos_sale_loyalty_tier_snapshots')
        AND constraint_row.contype = 'u'
        AND pg_get_constraintdef(constraint_row.oid, true) ~* 'UNIQUE\s*\(sale_id\)'
    ),
    COALESCE((
      SELECT string_agg(constraint_row.conname, ', ')
      FROM pg_constraint constraint_row
      WHERE constraint_row.conrelid = to_regclass('public.pos_sale_loyalty_tier_snapshots')
        AND constraint_row.contype = 'u'
        AND pg_get_constraintdef(constraint_row.oid, true) ~* 'UNIQUE\s*\(sale_id\)'
    ), 'absent'),
    'UNIQUE(sale_id)'

  UNION ALL

  SELECT
    'TENANT brand_id + brand_slug on loyalty tables',
    bool_and(columns_present = 2),
    string_agg(table_name || '=' || columns_present::text || '/2', ', ' ORDER BY table_name),
    'both columns on every loyalty table'
  FROM (
    SELECT
      relation.relname AS table_name,
      count(attribute.attname) FILTER (
        WHERE attribute.attname IN ('brand_id', 'brand_slug')
      ) AS columns_present
    FROM pg_class relation
    JOIN pg_namespace namespace
      ON namespace.oid = relation.relnamespace
    LEFT JOIN pg_attribute attribute
      ON attribute.attrelid = relation.oid
     AND attribute.attnum > 0
     AND NOT attribute.attisdropped
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
        'pos_loyalty_programs',
        'pos_loyalty_members',
        'pos_loyalty_tiers',
        'pos_loyalty_rewards',
        'pos_loyalty_transactions',
        'pos_loyalty_redemptions',
        'pos_sale_loyalty_tier_snapshots'
      )
    GROUP BY relation.relname
  ) tenant_columns
),
report AS (
  SELECT check_name, passed, actual, expected
  FROM checks

  UNION ALL

  SELECT
    'SUMMARY all_checks_passed',
    bool_and(passed),
    bool_and(passed)::text,
    'true'
  FROM checks
)
SELECT
  check_name,
  passed,
  actual,
  expected
FROM report
ORDER BY
  CASE WHEN check_name = 'SUMMARY all_checks_passed' THEN 1 ELSE 0 END,
  passed ASC,
  check_name;
