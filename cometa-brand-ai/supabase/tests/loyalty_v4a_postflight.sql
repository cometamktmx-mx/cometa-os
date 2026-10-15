-- LOYALTY V4A POST-FLIGHT
-- READ ONLY
-- Ejecutar inmediatamente DESPUÉS de la migración y ANTES de la suite.

SELECT
  to_regclass(
    'public.pos_sale_loyalty_tier_snapshots'
  ) AS snapshots_table;

SELECT
  attribute.attnum,
  attribute.attname AS column_name,
  pg_catalog.format_type(
    attribute.atttypid,
    attribute.atttypmod
  ) AS data_type,
  attribute.attnotnull AS not_null,
  pg_get_expr(
    default_value.adbin,
    default_value.adrelid
  ) AS default_expression
FROM pg_attribute attribute
JOIN pg_class relation
  ON relation.oid = attribute.attrelid
JOIN pg_namespace namespace
  ON namespace.oid = relation.relnamespace
LEFT JOIN pg_attrdef default_value
  ON default_value.adrelid = attribute.attrelid
 AND default_value.adnum = attribute.attnum
WHERE namespace.nspname = 'public'
  AND relation.relname =
    'pos_sale_loyalty_tier_snapshots'
  AND attribute.attnum > 0
  AND NOT attribute.attisdropped
ORDER BY attribute.attnum;

SELECT
  con.conrelid::regclass::text AS table_name,
  con.conname,
  con.contype,
  pg_get_constraintdef(
    con.oid,
    true
  ) AS definition
FROM pg_constraint con
WHERE con.conrelid IN (
  'public.pos_loyalty_tiers'::regclass,
  'public.pos_sale_loyalty_tier_snapshots'::regclass
)
ORDER BY table_name, con.conname;

SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'pos_loyalty_tiers',
    'pos_sale_loyalty_tier_snapshots'
  )
ORDER BY tablename, indexname;

WITH expected_functions(function_name) AS (
  VALUES
    ('pos_complete_sale_v3'),
    ('pos_resolve_loyalty_tier'),
    ('pos_register_loyalty_member_v2'),
    ('pos_create_loyalty_tier'),
    ('pos_update_loyalty_tier'),
    ('pos_set_loyalty_tier_active')
)
SELECT
  expected.function_name,
  resolved.identity,
  resolved.security_definer,
  resolved.function_configuration
FROM expected_functions expected
LEFT JOIN LATERAL (
  SELECT
    proc.oid::regprocedure::text AS identity,
    proc.prosecdef AS security_definer,
    proc.proconfig AS function_configuration
  FROM pg_proc proc
  JOIN pg_namespace namespace
    ON namespace.oid = proc.pronamespace
  WHERE namespace.nspname = 'public'
    AND proc.proname = expected.function_name
) resolved ON true
ORDER BY expected.function_name;

SELECT
  proc.oid::regprocedure::text AS identity,
  COALESCE(role.rolname, 'PUBLIC') AS grantee,
  privilege.privilege_type,
  privilege.is_grantable
FROM pg_proc proc
JOIN pg_namespace namespace
  ON namespace.oid = proc.pronamespace
CROSS JOIN LATERAL aclexplode(
  COALESCE(
    proc.proacl,
    acldefault('f', proc.proowner)
  )
) privilege
LEFT JOIN pg_roles role
  ON role.oid = privilege.grantee
WHERE namespace.nspname = 'public'
  AND proc.proname IN (
    'pos_complete_sale_v3',
    'pos_resolve_loyalty_tier',
    'pos_register_loyalty_member_v2',
    'pos_create_loyalty_tier',
    'pos_update_loyalty_tier',
    'pos_set_loyalty_tier_active'
  )
ORDER BY identity, grantee;

SELECT
  proc.oid::regprocedure::text AS identity,
  encode(
    sha256(
      convert_to(
        pg_get_functiondef(proc.oid),
        'UTF8'
      )
    ),
    'hex'
  ) AS definition_sha256,
  CASE proc.proname
    WHEN 'pos_complete_sale_v2' THEN
      '47b11fba0b8303702d92eb91124f5da215b9b639fe6e72ff191fb38b9b9994ed'
    WHEN 'pos_register_loyalty_member' THEN
      '297392709ed257b5631f8fb54b1c72e254d0afc57f6904fe8a1f2640fcafcde4'
  END AS expected_sha256,
  encode(
    sha256(convert_to(pg_get_functiondef(proc.oid), 'UTF8')),
    'hex'
  ) = CASE proc.proname
    WHEN 'pos_complete_sale_v2' THEN
      '47b11fba0b8303702d92eb91124f5da215b9b639fe6e72ff191fb38b9b9994ed'
    WHEN 'pos_register_loyalty_member' THEN
      '297392709ed257b5631f8fb54b1c72e254d0afc57f6904fe8a1f2640fcafcde4'
  END AS matches_expected
FROM pg_proc proc
JOIN pg_namespace namespace
  ON namespace.oid = proc.pronamespace
WHERE namespace.nspname = 'public'
  AND proc.proname IN (
    'pos_complete_sale_v2',
    'pos_register_loyalty_member'
  )
ORDER BY proc.proname;
