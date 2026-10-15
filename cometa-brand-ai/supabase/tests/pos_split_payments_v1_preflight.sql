-- SPLIT PAYMENTS V1 -- DATABASE PREFLIGHT
--
-- READ ONLY. Run this file in Supabase SQL Editor and export every result grid.
-- It only reads PostgreSQL catalogs and function definitions. It does NOT:
--   * create, alter, drop, or grant anything;
--   * call POS RPCs;
--   * read tenant rows, insert sales, or open/close cash sessions.
--
-- The function-definition grids are authoritative for the expected-cash formula.
-- The lexical analysis grids are navigational aids only; do not treat them as a
-- substitute for reading the complete pos_close_cash_session definition.

BEGIN TRANSACTION READ ONLY;

-- 01. Required table existence, identity, and RLS state.
SELECT
  '01_target_tables'::text AS section,
  requested.table_name,
  relation.oid,
  relation.relkind,
  pg_get_userbyid(relation.relowner) AS owner,
  relation.relrowsecurity AS rls_enabled,
  relation.relforcerowsecurity AS rls_forced
FROM (
  VALUES
    ('pos_payments'),
    ('pos_sales'),
    ('pos_cash_sessions')
) AS requested(table_name)
LEFT JOIN pg_namespace namespace
  ON namespace.nspname = 'public'
LEFT JOIN pg_class relation
  ON relation.relnamespace = namespace.oid
 AND relation.relname = requested.table_name
 AND relation.relkind IN ('r', 'p')
ORDER BY requested.table_name;

-- 02. Exact columns, types, nullability, defaults, identity, and generated metadata.
SELECT
  '02_target_columns'::text AS section,
  column_info.table_name,
  column_info.ordinal_position AS ordinal,
  column_info.column_name,
  column_info.data_type,
  column_info.udt_schema,
  column_info.udt_name,
  column_info.character_maximum_length,
  column_info.numeric_precision,
  column_info.numeric_scale,
  column_info.datetime_precision,
  column_info.is_nullable,
  column_info.column_default,
  column_info.is_identity,
  column_info.identity_generation,
  column_info.is_generated,
  column_info.generation_expression
FROM information_schema.columns column_info
WHERE column_info.table_schema = 'public'
  AND column_info.table_name IN (
    'pos_payments',
    'pos_sales',
    'pos_cash_sessions'
  )
ORDER BY column_info.table_name, column_info.ordinal_position;

-- 03. Complete PK, UNIQUE, CHECK, FK, and exclusion definitions.
SELECT
  '03_target_constraints'::text AS section,
  relation.relname AS table_name,
  constraint_row.conname AS constraint_name,
  CASE constraint_row.contype
    WHEN 'p' THEN 'PRIMARY KEY'
    WHEN 'u' THEN 'UNIQUE'
    WHEN 'f' THEN 'FOREIGN KEY'
    WHEN 'c' THEN 'CHECK'
    WHEN 'x' THEN 'EXCLUSION'
    ELSE constraint_row.contype::text
  END AS constraint_type,
  constraint_row.convalidated AS validated,
  pg_get_constraintdef(constraint_row.oid, true) AS definition
FROM pg_constraint constraint_row
JOIN pg_class relation
  ON relation.oid = constraint_row.conrelid
JOIN pg_namespace namespace
  ON namespace.oid = relation.relnamespace
WHERE namespace.nspname = 'public'
  AND relation.relname IN (
    'pos_payments',
    'pos_sales',
    'pos_cash_sessions'
  )
ORDER BY relation.relname, constraint_type, constraint_row.conname;

-- 04. Foreign keys expanded with source/target columns and actions.
SELECT
  '04_target_foreign_keys'::text AS section,
  source_relation.relname AS source_table,
  constraint_row.conname AS constraint_name,
  string_agg(source_attribute.attname, ', ' ORDER BY key_column.ordinality) AS source_columns,
  target_namespace.nspname AS target_schema,
  target_relation.relname AS target_table,
  string_agg(target_attribute.attname, ', ' ORDER BY key_column.ordinality) AS target_columns,
  CASE constraint_row.confupdtype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END AS on_update,
  CASE constraint_row.confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END AS on_delete
FROM pg_constraint constraint_row
JOIN pg_class source_relation
  ON source_relation.oid = constraint_row.conrelid
JOIN pg_namespace source_namespace
  ON source_namespace.oid = source_relation.relnamespace
JOIN pg_class target_relation
  ON target_relation.oid = constraint_row.confrelid
JOIN pg_namespace target_namespace
  ON target_namespace.oid = target_relation.relnamespace
JOIN LATERAL unnest(constraint_row.conkey, constraint_row.confkey)
  WITH ORDINALITY AS key_column(source_attnum, target_attnum, ordinality)
  ON true
JOIN pg_attribute source_attribute
  ON source_attribute.attrelid = source_relation.oid
 AND source_attribute.attnum = key_column.source_attnum
JOIN pg_attribute target_attribute
  ON target_attribute.attrelid = target_relation.oid
 AND target_attribute.attnum = key_column.target_attnum
WHERE constraint_row.contype = 'f'
  AND source_namespace.nspname = 'public'
  AND source_relation.relname IN (
    'pos_payments',
    'pos_sales',
    'pos_cash_sessions'
  )
GROUP BY
  source_relation.relname,
  constraint_row.conname,
  target_namespace.nspname,
  target_relation.relname,
  constraint_row.confupdtype,
  constraint_row.confdeltype
ORDER BY source_relation.relname, constraint_row.conname;

-- 05. All indexes, including independent unique/partial/expression indexes.
SELECT
  '05_target_indexes'::text AS section,
  index_info.tablename AS table_name,
  index_info.indexname AS index_name,
  index_meta.indisunique AS is_unique,
  index_meta.indisprimary AS is_primary,
  index_meta.indisvalid AS is_valid,
  (index_meta.indpred IS NOT NULL) AS is_partial,
  pg_get_expr(index_meta.indpred, index_meta.indrelid) AS predicate,
  index_info.indexdef AS definition
FROM pg_indexes index_info
JOIN pg_namespace namespace
  ON namespace.nspname = index_info.schemaname
JOIN pg_class index_relation
  ON index_relation.relnamespace = namespace.oid
 AND index_relation.relname = index_info.indexname
JOIN pg_index index_meta
  ON index_meta.indexrelid = index_relation.oid
WHERE index_info.schemaname = 'public'
  AND index_info.tablename IN (
    'pos_payments',
    'pos_sales',
    'pos_cash_sessions'
  )
ORDER BY index_info.tablename, index_info.indexname;

-- 06. Exact policies for the target tables.
SELECT
  '06_target_rls_policies'::text AS section,
  policy_info.tablename AS table_name,
  policy_info.policyname AS policy_name,
  policy_info.permissive,
  policy_info.roles,
  policy_info.cmd AS command,
  policy_info.qual AS using_expression,
  policy_info.with_check AS with_check_expression
FROM pg_policies policy_info
WHERE policy_info.schemaname = 'public'
  AND policy_info.tablename IN (
    'pos_payments',
    'pos_sales',
    'pos_cash_sessions'
  )
ORDER BY policy_info.tablename, policy_info.policyname;

-- 07. Effective table privileges for roles relevant to the application.
SELECT
  '07_target_table_acl'::text AS section,
  relation.relname AS table_name,
  roles.role_name,
  privilege.privilege_type,
  CASE
    WHEN roles.role_name = 'PUBLIC' THEN EXISTS (
      SELECT 1
      FROM aclexplode(COALESCE(relation.relacl, acldefault('r', relation.relowner))) acl
      WHERE acl.grantee = 0
        AND acl.privilege_type = privilege.privilege_type
    )
    ELSE has_table_privilege(roles.role_name, relation.oid, privilege.privilege_type)
  END AS granted
FROM pg_class relation
JOIN pg_namespace namespace
  ON namespace.oid = relation.relnamespace
CROSS JOIN (VALUES ('PUBLIC'), ('anon'), ('authenticated'), ('service_role'), ('postgres'))
  AS roles(role_name)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'))
  AS privilege(privilege_type)
WHERE namespace.nspname = 'public'
  AND relation.relname IN (
    'pos_payments',
    'pos_sales',
    'pos_cash_sessions'
  )
ORDER BY relation.relname, roles.role_name, privilege.privilege_type;

-- 08. Explicit multiple-payment check. Review the preceding index grid as the
-- authoritative evidence, especially if this returns REVIEW_COMPLEX_INDEX.
WITH unique_payment_indexes AS (
  SELECT
    index_meta.indexrelid,
    (index_meta.indpred IS NOT NULL) AS is_partial,
    index_meta.indisexclusion AS is_exclusion,
    pg_get_expr(index_meta.indpred, index_meta.indrelid) AS predicate,
    array_agg(
      COALESCE(
        attribute.attname::text,
        pg_get_indexdef(index_meta.indexrelid, key_column.ordinality::integer, true)
      )
      ORDER BY key_column.ordinality
    ) FILTER (WHERE key_column.ordinality <= index_meta.indnkeyatts) AS key_columns,
    pg_get_indexdef(index_meta.indexrelid) AS definition
  FROM pg_index index_meta
  JOIN pg_class relation
    ON relation.oid = index_meta.indrelid
  JOIN pg_namespace namespace
    ON namespace.oid = relation.relnamespace
  JOIN LATERAL unnest(index_meta.indkey::smallint[]) WITH ORDINALITY
    AS key_column(attnum, ordinality)
    ON true
  LEFT JOIN pg_attribute attribute
    ON attribute.attrelid = relation.oid
   AND attribute.attnum = key_column.attnum
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'pos_payments'
    AND (index_meta.indisunique OR index_meta.indisexclusion)
  GROUP BY
    index_meta.indexrelid,
    index_meta.indisexclusion,
    index_meta.indpred,
    index_meta.indrelid,
    index_meta.indnkeyatts
), verdict AS (
  SELECT
    EXISTS (
      SELECT 1 FROM unique_payment_indexes
      WHERE key_columns = ARRAY['sale_id']::text[]
        AND NOT is_partial
        AND NOT is_exclusion
    ) AS unique_sale_id,
    EXISTS (
      SELECT 1 FROM unique_payment_indexes
      WHERE key_columns = ARRAY['sale_id', 'payment_method']::text[]
        AND NOT is_partial
        AND NOT is_exclusion
    ) AS unique_sale_id_method,
    EXISTS (
      SELECT 1 FROM unique_payment_indexes
      WHERE ('sale_id' = ANY(key_columns) OR 'payment_method' = ANY(key_columns))
        AND (
          is_exclusion
          OR
          is_partial
          OR key_columns NOT IN (
            ARRAY['sale_id']::text[],
            ARRAY['sale_id', 'payment_method']::text[]
          )
        )
    ) AS needs_manual_review
  FROM unique_payment_indexes
)
SELECT
  '08_multiple_payments_verdict'::text AS section,
  CASE
    WHEN unique_sale_id THEN 'NO -- UNIQUE(sale_id) prevents multiple rows per sale'
    WHEN needs_manual_review THEN 'REVIEW_COMPLEX_INDEX -- inspect section 05 and 08b'
    ELSE 'YES -- no simple unique index on sale_id found'
  END AS multiple_rows_per_sale,
  CASE
    WHEN unique_sale_id THEN 'NO -- UNIQUE(sale_id) also prevents same-method rows'
    WHEN unique_sale_id_method THEN 'NO -- UNIQUE(sale_id,payment_method) prevents duplicate methods'
    WHEN needs_manual_review THEN 'REVIEW_COMPLEX_INDEX -- inspect section 05 and 08b'
    ELSE 'YES -- no simple unique index on sale_id,payment_method found'
  END AS multiple_rows_same_method_per_sale,
  unique_sale_id,
  unique_sale_id_method,
  needs_manual_review
FROM verdict;

WITH unique_payment_indexes AS (
  SELECT
    index_meta.indexrelid::regclass AS index_name,
    (index_meta.indpred IS NOT NULL) AS is_partial,
    index_meta.indisexclusion AS is_exclusion,
    pg_get_expr(index_meta.indpred, index_meta.indrelid) AS predicate,
    array_agg(
      COALESCE(attribute.attname::text, pg_get_indexdef(index_meta.indexrelid, key_column.ordinality::integer, true))
      ORDER BY key_column.ordinality
    ) FILTER (WHERE key_column.ordinality <= index_meta.indnkeyatts) AS key_columns,
    pg_get_indexdef(index_meta.indexrelid) AS definition
  FROM pg_index index_meta
  JOIN pg_class relation ON relation.oid = index_meta.indrelid
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  JOIN LATERAL unnest(index_meta.indkey::smallint[]) WITH ORDINALITY
    AS key_column(attnum, ordinality) ON true
  LEFT JOIN pg_attribute attribute
    ON attribute.attrelid = relation.oid
   AND attribute.attnum = key_column.attnum
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'pos_payments'
    AND (index_meta.indisunique OR index_meta.indisexclusion)
  GROUP BY
    index_meta.indexrelid,
    index_meta.indisexclusion,
    index_meta.indpred,
    index_meta.indrelid,
    index_meta.indnkeyatts
)
SELECT
  '08b_unique_payment_indexes'::text AS section,
  index_name,
  is_partial,
  is_exclusion,
  predicate,
  key_columns,
  definition
FROM unique_payment_indexes AS payment_index
ORDER BY payment_index.index_name::text;

-- 09. Cash-session field existence and persistence check.
SELECT
  '09_cash_session_financial_columns'::text AS section,
  expected.column_name,
  COALESCE(format_type(attribute.atttypid, attribute.atttypmod), 'ABSENT') AS actual_type,
  CASE
    WHEN attribute.attname IS NULL THEN 'ABSENT'
    WHEN attribute.attnotnull THEN 'NOT NULL PERSISTED COLUMN'
    ELSE 'NULLABLE PERSISTED COLUMN'
  END AS persistence_status,
  pg_get_expr(default_value.adbin, default_value.adrelid) AS default_expression
FROM (
  VALUES
    ('opening_amount'),
    ('expected_cash'),
    ('counted_cash'),
    ('difference')
) AS expected(column_name)
LEFT JOIN pg_attribute attribute
  ON attribute.attrelid = to_regclass('public.pos_cash_sessions')
 AND attribute.attname = expected.column_name
 AND attribute.attnum > 0
 AND NOT attribute.attisdropped
LEFT JOIN pg_attrdef default_value
  ON default_value.adrelid = attribute.attrelid
 AND default_value.adnum = attribute.attnum
ORDER BY expected.column_name;

-- 10. Open/close RPC identity, security metadata, and complete definition.
SELECT
  '10_cash_session_rpcs'::text AS section,
  procedure.oid::regprocedure AS signature,
  procedure.proname,
  pg_get_function_identity_arguments(procedure.oid) AS identity_arguments,
  pg_get_function_result(procedure.oid) AS returns,
  language.lanname AS language,
  procedure.provolatile AS volatility_code,
  procedure.prosecdef AS security_definer,
  procedure.proconfig AS function_config,
  pg_get_userbyid(procedure.proowner) AS owner,
  pg_get_functiondef(procedure.oid) AS full_definition
FROM pg_proc procedure
JOIN pg_namespace namespace
  ON namespace.oid = procedure.pronamespace
JOIN pg_language language
  ON language.oid = procedure.prolang
WHERE namespace.nspname = 'public'
  AND procedure.proname IN (
    'pos_open_cash_session',
    'pos_close_cash_session'
  )
ORDER BY procedure.proname, pg_get_function_identity_arguments(procedure.oid);

-- 11. Effective EXECUTE privileges for every open/close RPC overload.
SELECT
  '11_cash_session_rpc_acl'::text AS section,
  procedure.oid::regprocedure AS signature,
  roles.role_name,
  CASE
    WHEN roles.role_name = 'PUBLIC' THEN EXISTS (
      SELECT 1
      FROM aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) acl
      WHERE acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    )
    ELSE has_function_privilege(roles.role_name, procedure.oid, 'EXECUTE')
  END AS can_execute
FROM pg_proc procedure
JOIN pg_namespace namespace
  ON namespace.oid = procedure.pronamespace
CROSS JOIN (VALUES ('PUBLIC'), ('anon'), ('authenticated'), ('service_role'), ('postgres'))
  AS roles(role_name)
WHERE namespace.nspname = 'public'
  AND procedure.proname IN (
    'pos_open_cash_session',
    'pos_close_cash_session'
  )
ORDER BY procedure.oid::regprocedure::text, roles.role_name;

-- 12. Read-only lexical guide for the formula. The complete definition in
-- section 10 is the source of truth and must be reviewed before classification.
WITH close_definition AS (
  SELECT
    procedure.oid::regprocedure AS signature,
    lower(pg_get_functiondef(procedure.oid)) AS definition
  FROM pg_proc procedure
  JOIN pg_namespace namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'pos_close_cash_session'
)
SELECT
  '12_close_formula_guide'::text AS section,
  signature,
  definition LIKE '%pos_payments%' AS reads_pos_payments,
  definition LIKE '%payment_method%' AS reads_payment_method,
  definition LIKE '%''cash''%' AS checks_cash_method,
  definition LIKE '%pos_sales%' AS reads_pos_sales,
  definition LIKE '%total%' AS mentions_total,
  definition LIKE '%tendered_amount%' AS reads_tendered_amount,
  definition LIKE '%change_amount%' AS reads_change_amount,
  definition LIKE '%pos_cash_movements%' AS reads_pos_cash_movements,
  definition LIKE '%expected_cash%' AS mentions_expected_cash,
  definition LIKE '%update public.pos_cash_sessions%' AS updates_cash_session,
  CASE
    WHEN definition LIKE '%pos_payments%'
      AND definition LIKE '%payment_method%'
      AND definition LIKE '%''cash''%'
      AND definition NOT LIKE '%pos_sales%'
      THEN 'CANDIDATE_SPLIT_SAFE -- verify amount expression in full definition'
    WHEN definition LIKE '%pos_sales%'
      AND definition LIKE '%total%'
      AND NOT (
        definition LIKE '%pos_payments%'
        AND definition LIKE '%payment_method%'
        AND definition LIKE '%''cash''%'
      )
      THEN 'CANDIDATE_CRITICAL_BLOCKER -- sales.total appears without a cash-payment filter'
    ELSE 'MANUAL_REVIEW_REQUIRED -- read section 10 full definition'
  END AS preliminary_classification
FROM close_definition;

-- 13. Direct schema relationship evidence: session <- sale <- payment.
SELECT
  '13_sales_session_payment_relationships'::text AS section,
  source_relation.relname AS source_table,
  constraint_row.conname AS fk_name,
  string_agg(source_attribute.attname, ', ' ORDER BY key_column.ordinality) AS source_columns,
  target_relation.relname AS target_table,
  string_agg(target_attribute.attname, ', ' ORDER BY key_column.ordinality) AS target_columns,
  pg_get_constraintdef(constraint_row.oid, true) AS definition
FROM pg_constraint constraint_row
JOIN pg_class source_relation ON source_relation.oid = constraint_row.conrelid
JOIN pg_namespace source_namespace ON source_namespace.oid = source_relation.relnamespace
JOIN pg_class target_relation ON target_relation.oid = constraint_row.confrelid
JOIN LATERAL unnest(constraint_row.conkey, constraint_row.confkey)
  WITH ORDINALITY AS key_column(source_attnum, target_attnum, ordinality)
  ON true
JOIN pg_attribute source_attribute
  ON source_attribute.attrelid = source_relation.oid
 AND source_attribute.attnum = key_column.source_attnum
JOIN pg_attribute target_attribute
  ON target_attribute.attrelid = target_relation.oid
 AND target_attribute.attnum = key_column.target_attnum
WHERE constraint_row.contype = 'f'
  AND source_namespace.nspname = 'public'
  AND source_relation.relname IN ('pos_sales', 'pos_payments')
  AND target_relation.relname IN ('pos_cash_sessions', 'pos_sales')
GROUP BY
  source_relation.relname,
  constraint_row.conname,
  target_relation.relname,
  constraint_row.oid
ORDER BY source_relation.relname, constraint_row.conname;

-- 14. Candidate cash-movement ledgers. This is metadata only; it does not
-- inspect any tenant rows.
SELECT
  '14_cash_movement_table_candidates'::text AS section,
  relation.relname AS table_name,
  relation.oid,
  relation.relkind,
  relation.relrowsecurity AS rls_enabled,
  relation.relforcerowsecurity AS rls_forced
FROM pg_class relation
JOIN pg_namespace namespace
  ON namespace.oid = relation.relnamespace
WHERE namespace.nspname = 'public'
  AND relation.relkind IN ('r', 'p')
  AND relation.relname <> 'pos_cash_sessions'
  AND (
    relation.relname ILIKE '%cash%movement%'
    OR relation.relname ILIKE '%drawer%movement%'
    OR relation.relname ILIKE '%cash%adjust%'
    OR relation.relname ILIKE '%cash%in%'
    OR relation.relname ILIKE '%cash%out%'
  )
ORDER BY relation.relname;

SELECT
  '14b_cash_movement_candidate_columns'::text AS section,
  column_info.table_name,
  column_info.ordinal_position AS ordinal,
  column_info.column_name,
  column_info.data_type,
  column_info.udt_name,
  column_info.is_nullable,
  column_info.column_default
FROM information_schema.columns column_info
WHERE column_info.table_schema = 'public'
  AND column_info.table_name IN (
    SELECT relation.relname
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND relation.relname <> 'pos_cash_sessions'
      AND (
        relation.relname ILIKE '%cash%movement%'
        OR relation.relname ILIKE '%drawer%movement%'
        OR relation.relname ILIKE '%cash%adjust%'
        OR relation.relname ILIKE '%cash%in%'
        OR relation.relname ILIKE '%cash%out%'
      )
  )
ORDER BY column_info.table_name, column_info.ordinal_position;

-- 15. Candidate cash-movement constraints and policies, if any candidates exist.
SELECT
  '15_cash_movement_candidate_constraints'::text AS section,
  relation.relname AS table_name,
  constraint_row.conname AS constraint_name,
  CASE constraint_row.contype
    WHEN 'p' THEN 'PRIMARY KEY'
    WHEN 'u' THEN 'UNIQUE'
    WHEN 'f' THEN 'FOREIGN KEY'
    WHEN 'c' THEN 'CHECK'
    WHEN 'x' THEN 'EXCLUSION'
    ELSE constraint_row.contype::text
  END AS constraint_type,
  pg_get_constraintdef(constraint_row.oid, true) AS definition
FROM pg_constraint constraint_row
JOIN pg_class relation ON relation.oid = constraint_row.conrelid
JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
WHERE namespace.nspname = 'public'
  AND relation.relkind IN ('r', 'p')
  AND relation.relname <> 'pos_cash_sessions'
  AND (
    relation.relname ILIKE '%cash%movement%'
    OR relation.relname ILIKE '%drawer%movement%'
    OR relation.relname ILIKE '%cash%adjust%'
    OR relation.relname ILIKE '%cash%in%'
    OR relation.relname ILIKE '%cash%out%'
  )
ORDER BY relation.relname, constraint_type, constraint_row.conname;

SELECT
  '15b_cash_movement_candidate_policies'::text AS section,
  policy_info.tablename AS table_name,
  policy_info.policyname AS policy_name,
  policy_info.permissive,
  policy_info.roles,
  policy_info.cmd AS command,
  policy_info.qual AS using_expression,
  policy_info.with_check AS with_check_expression
FROM pg_policies policy_info
WHERE policy_info.schemaname = 'public'
  AND policy_info.tablename <> 'pos_cash_sessions'
  AND (
    policy_info.tablename ILIKE '%cash%movement%'
    OR policy_info.tablename ILIKE '%drawer%movement%'
    OR policy_info.tablename ILIKE '%cash%adjust%'
    OR policy_info.tablename ILIKE '%cash%in%'
    OR policy_info.tablename ILIKE '%cash%out%'
  )
ORDER BY policy_info.tablename, policy_info.policyname;

-- 16. Compact operator checklist. A BLOCKED result means the requested object
-- was absent or the closing formula still requires human review of section 10.
WITH target_columns AS (
  SELECT
    column_info.table_name,
    array_agg(column_info.column_name::text ORDER BY column_info.ordinal_position) AS columns
  FROM information_schema.columns column_info
  WHERE column_info.table_schema = 'public'
    AND column_info.table_name IN ('pos_payments', 'pos_cash_sessions')
  GROUP BY column_info.table_name
), close_function AS (
  SELECT lower(pg_get_functiondef(procedure.oid)) AS definition
  FROM pg_proc procedure
  JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'pos_close_cash_session'
)
SELECT
  '16_operator_checklist'::text AS section,
  CASE
    WHEN EXISTS (SELECT 1 FROM target_columns WHERE table_name = 'pos_payments')
      THEN 'PRESENT'
    ELSE 'BLOCKED: pos_payments absent'
  END AS pos_payments,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM target_columns
      WHERE table_name = 'pos_cash_sessions'
        AND columns @> ARRAY['opening_amount', 'expected_cash', 'counted_cash', 'difference']::text[]
    ) THEN 'PRESENT: all financial session columns exist'
    ELSE 'BLOCKED: one or more session financial columns absent'
  END AS cash_session_financial_columns,
  CASE
    WHEN EXISTS (SELECT 1 FROM close_function) THEN 'PRESENT: inspect section 10 formula'
    ELSE 'BLOCKED: pos_close_cash_session absent'
  END AS close_rpc,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM close_function
      WHERE definition LIKE '%pos_payments%'
        AND definition LIKE '%payment_method%'
        AND definition LIKE '%''cash''%'
        AND definition NOT LIKE '%pos_sales%'
    ) THEN 'CANDIDATE_SPLIT_SAFE: verify exact amount expression manually'
    WHEN EXISTS (
      SELECT 1 FROM close_function
      WHERE definition LIKE '%pos_sales%'
        AND definition LIKE '%total%'
        AND NOT (
          definition LIKE '%pos_payments%'
          AND definition LIKE '%payment_method%'
          AND definition LIKE '%''cash''%'
        )
    ) THEN 'CANDIDATE_CRITICAL_BLOCKER: appears to use sales.total without cash filter'
    ELSE 'BLOCKED: formula requires review of complete definition'
  END AS split_cash_formula_status;

COMMIT;
