-- LOYALTY V4A PRE-FLIGHT
-- READ ONLY
-- Ejecutar ANTES de 20260811_loyalty_v4a_tiers.sql

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
  EXISTS (
    SELECT 1
    FROM pg_proc proc
    JOIN pg_namespace namespace
      ON namespace.oid = proc.pronamespace
    WHERE namespace.nspname = 'public'
      AND proc.proname = expected.function_name
  ) AS exists_before_migration
FROM expected_functions expected
ORDER BY expected.function_name;

SELECT
  to_regclass(
    'public.pos_sale_loyalty_tier_snapshots'
  ) AS snapshots_table_before_migration;

SELECT count(*) AS current_tier_count
FROM public.pos_loyalty_tiers;

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

SELECT
  con.conname,
  con.contype,
  pg_get_constraintdef(
    con.oid,
    true
  ) AS definition
FROM pg_constraint con
WHERE con.conrelid =
  'public.pos_loyalty_tiers'::regclass
ORDER BY con.conname;
