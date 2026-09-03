-- CASH CLOSE V1 -- DATABASE PREFLIGHT
--
-- READ ONLY. Paste and run the complete file in Supabase SQL Editor.
-- It reads PostgreSQL catalogs, ACLs, policies, trigger definitions, and RPC
-- definitions only. It does not invoke POS RPCs or read tenant business rows.
--
-- Important: function-definition result grids are the authority for formula,
-- locking, sale-status, and movement-sign findings. The compact source-fact
-- grids are navigation aids, not replacements for reading those definitions.

BEGIN TRANSACTION READ ONLY;

-- 00. Required relation presence, ownership, and row-security state.
SELECT
  '00_target_relations'::text AS section,
  requested.relation_name,
  relation.oid AS relation_oid,
  relation.relkind AS relation_kind,
  pg_get_userbyid(relation.relowner) AS owner,
  relation.relrowsecurity AS rls_enabled,
  relation.relforcerowsecurity AS rls_forced,
  CASE
    WHEN relation.oid IS NULL THEN 'NOT FOUND'
    ELSE 'PRESENT'
  END AS presence
FROM (
  VALUES
    ('pos_cash_sessions'),
    ('pos_cash_movements')
) AS requested(relation_name)
LEFT JOIN pg_namespace namespace
  ON namespace.nspname = 'public'
LEFT JOIN pg_class relation
  ON relation.relnamespace = namespace.oid
 AND relation.relname = requested.relation_name
 AND relation.relkind IN ('r', 'p')
ORDER BY requested.relation_name;

-- 01. Exact session columns, including persistence metadata.
SELECT
  '01_cash_sessions_columns'::text AS section,
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
  AND column_info.table_name = 'pos_cash_sessions'
ORDER BY column_info.ordinal_position;

-- 01b. Explicit checklist for the names expected by Cash Close V1.
SELECT
  '01b_cash_sessions_required_columns'::text AS section,
  required.column_name AS expected_column,
  CASE
    WHEN attribute.attname IS NULL THEN 'ABSENT'
    ELSE 'PRESENT'
  END AS presence,
  format_type(attribute.atttypid, attribute.atttypmod) AS actual_type,
  CASE
    WHEN attribute.attname IS NULL THEN NULL
    WHEN attribute.attnotnull THEN 'NOT NULL'
    ELSE 'NULLABLE'
  END AS nullability,
  pg_get_expr(default_value.adbin, default_value.adrelid) AS default_expression
FROM (
  VALUES
    ('id'),
    ('brand_id'),
    ('brand_slug'),
    ('location_id'),
    ('register_id'),
    ('status'),
    ('opening_amount'),
    ('expected_cash'),
    ('counted_cash'),
    ('difference'),
    ('opened_by'),
    ('opened_at'),
    ('closed_by'),
    ('closed_at'),
    ('notes')
) AS required(column_name)
LEFT JOIN pg_attribute attribute
  ON attribute.attrelid = to_regclass('public.pos_cash_sessions')
 AND attribute.attname = required.column_name
 AND attribute.attnum > 0
 AND NOT attribute.attisdropped
LEFT JOIN pg_attrdef default_value
  ON default_value.adrelid = attribute.attrelid
 AND default_value.adnum = attribute.attnum
ORDER BY required.column_name;

-- 02. All session PK, UNIQUE, CHECK, FK, and exclusion definitions.
SELECT
  '02_cash_sessions_constraints'::text AS section,
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
  AND relation.relname = 'pos_cash_sessions'
ORDER BY constraint_type, constraint_row.conname;

-- 03. All session indexes, including independent UNIQUE and partial indexes.
SELECT
  '03_cash_sessions_indexes'::text AS section,
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
  AND index_info.tablename = 'pos_cash_sessions'
ORDER BY index_info.indexname;

-- 04. Session RLS state, policies, and raw ACL entries.
SELECT
  '04_cash_sessions_rls'::text AS section,
  relation.relrowsecurity AS rls_enabled,
  relation.relforcerowsecurity AS rls_forced,
  pg_get_userbyid(relation.relowner) AS owner
FROM pg_class relation
JOIN pg_namespace namespace
  ON namespace.oid = relation.relnamespace
WHERE namespace.nspname = 'public'
  AND relation.relname = 'pos_cash_sessions';

SELECT
  '04b_cash_sessions_policies'::text AS section,
  policy_info.policyname AS policy_name,
  policy_info.permissive,
  policy_info.roles,
  policy_info.cmd AS policy_command,
  policy_info.qual AS using_expression,
  policy_info.with_check AS with_check_expression
FROM pg_policies policy_info
WHERE policy_info.schemaname = 'public'
  AND policy_info.tablename = 'pos_cash_sessions'
ORDER BY policy_info.policyname;

SELECT
  '04c_cash_sessions_acl'::text AS section,
  CASE
    WHEN acl_entry.grantee = 0 THEN 'PUBLIC'
    ELSE COALESCE(grantee_role.rolname, acl_entry.grantee::regrole::text)
  END AS grantee,
  pg_get_userbyid(acl_entry.grantor) AS grantor,
  acl_entry.privilege_type,
  acl_entry.is_grantable
FROM pg_class relation
JOIN pg_namespace namespace
  ON namespace.oid = relation.relnamespace
CROSS JOIN LATERAL aclexplode(
  COALESCE(relation.relacl, acldefault('r', relation.relowner))
) AS acl_entry(grantor, grantee, privilege_type, is_grantable)
LEFT JOIN pg_roles grantee_role
  ON grantee_role.oid = acl_entry.grantee
WHERE namespace.nspname = 'public'
  AND relation.relname = 'pos_cash_sessions'
ORDER BY grantee, acl_entry.privilege_type;

-- 04d. Effective session read privilege for application-relevant roles.
WITH target_roles AS (
  SELECT *
  FROM (
    VALUES
      ('PUBLIC'::text, 0::oid),
      ('anon'::text, to_regrole('anon')::oid),
      ('authenticated'::text, to_regrole('authenticated')::oid),
      ('service_role'::text, to_regrole('service_role')::oid),
      ('postgres'::text, to_regrole('postgres')::oid)
  ) AS roles(role_name, role_oid)
)
SELECT
  '04d_cash_sessions_effective_read'::text AS section,
  roles.role_name,
  CASE
    WHEN roles.role_name = 'PUBLIC' THEN EXISTS (
      SELECT 1
      FROM aclexplode(COALESCE(relation.relacl, acldefault('r', relation.relowner)))
        AS acl_entry(grantor, grantee, privilege_type, is_grantable)
      WHERE acl_entry.grantee = 0
        AND acl_entry.privilege_type = 'SELECT'
    )
    WHEN roles.role_oid IS NULL THEN NULL
    ELSE has_table_privilege(roles.role_oid, relation.oid, 'SELECT')
  END AS can_read,
  CASE
    WHEN roles.role_oid IS NULL AND roles.role_name <> 'PUBLIC' THEN 'ROLE NOT FOUND'
    ELSE 'EVALUATED'
  END AS evaluation
FROM pg_class relation
JOIN pg_namespace namespace
  ON namespace.oid = relation.relnamespace
CROSS JOIN target_roles roles
WHERE namespace.nspname = 'public'
  AND relation.relname = 'pos_cash_sessions'
ORDER BY roles.role_name;

-- 05. Every open-session RPC overload with full source and security metadata.
SELECT
  '05_open_rpc'::text AS section,
  procedure.oid::regprocedure AS signature,
  pg_get_function_identity_arguments(procedure.oid) AS identity_arguments,
  pg_get_function_arguments(procedure.oid) AS arguments,
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
  AND procedure.proname = 'pos_open_cash_session'
ORDER BY pg_get_function_identity_arguments(procedure.oid);

-- 05b. Explicit raw ACL entries for each open-session overload.
SELECT
  '05b_open_rpc_acl'::text AS section,
  procedure.oid::regprocedure AS signature,
  CASE
    WHEN acl_entry.grantee = 0 THEN 'PUBLIC'
    ELSE COALESCE(grantee_role.rolname, acl_entry.grantee::regrole::text)
  END AS grantee,
  pg_get_userbyid(acl_entry.grantor) AS grantor,
  acl_entry.privilege_type,
  acl_entry.is_grantable
FROM pg_proc procedure
JOIN pg_namespace namespace
  ON namespace.oid = procedure.pronamespace
CROSS JOIN LATERAL aclexplode(
  COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
) AS acl_entry(grantor, grantee, privilege_type, is_grantable)
LEFT JOIN pg_roles grantee_role
  ON grantee_role.oid = acl_entry.grantee
WHERE namespace.nspname = 'public'
  AND procedure.proname = 'pos_open_cash_session'
ORDER BY procedure.oid::regprocedure::text, grantee, acl_entry.privilege_type;

-- 05c. Effective execute privilege for every open-session overload.
WITH target_roles AS (
  SELECT *
  FROM (
    VALUES
      ('PUBLIC'::text, 0::oid),
      ('anon'::text, to_regrole('anon')::oid),
      ('authenticated'::text, to_regrole('authenticated')::oid),
      ('service_role'::text, to_regrole('service_role')::oid),
      ('postgres'::text, to_regrole('postgres')::oid)
  ) AS roles(role_name, role_oid)
)
SELECT
  '05c_open_rpc_effective_execute'::text AS section,
  procedure.oid::regprocedure AS signature,
  roles.role_name,
  CASE
    WHEN roles.role_name = 'PUBLIC' THEN EXISTS (
      SELECT 1
      FROM aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner)))
        AS acl_entry(grantor, grantee, privilege_type, is_grantable)
      WHERE acl_entry.grantee = 0
        AND acl_entry.privilege_type = 'EXECUTE'
    )
    WHEN roles.role_oid IS NULL THEN NULL
    ELSE has_function_privilege(roles.role_oid, procedure.oid, 'EXECUTE')
  END AS can_execute,
  CASE
    WHEN roles.role_oid IS NULL AND roles.role_name <> 'PUBLIC' THEN 'ROLE NOT FOUND'
    ELSE 'EVALUATED'
  END AS evaluation
FROM pg_proc procedure
JOIN pg_namespace namespace
  ON namespace.oid = procedure.pronamespace
CROSS JOIN target_roles roles
WHERE namespace.nspname = 'public'
  AND procedure.proname = 'pos_open_cash_session'
ORDER BY procedure.oid::regprocedure::text, roles.role_name;

-- 06. Every close-session RPC overload with full source and security metadata.
SELECT
  '06_close_rpc'::text AS section,
  procedure.oid::regprocedure AS signature,
  pg_get_function_identity_arguments(procedure.oid) AS identity_arguments,
  pg_get_function_arguments(procedure.oid) AS arguments,
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
  AND procedure.proname = 'pos_close_cash_session'
ORDER BY pg_get_function_identity_arguments(procedure.oid);

-- 06b. Explicit raw ACL entries for each close-session overload.
SELECT
  '06b_close_rpc_acl'::text AS section,
  procedure.oid::regprocedure AS signature,
  CASE
    WHEN acl_entry.grantee = 0 THEN 'PUBLIC'
    ELSE COALESCE(grantee_role.rolname, acl_entry.grantee::regrole::text)
  END AS grantee,
  pg_get_userbyid(acl_entry.grantor) AS grantor,
  acl_entry.privilege_type,
  acl_entry.is_grantable
FROM pg_proc procedure
JOIN pg_namespace namespace
  ON namespace.oid = procedure.pronamespace
CROSS JOIN LATERAL aclexplode(
  COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
) AS acl_entry(grantor, grantee, privilege_type, is_grantable)
LEFT JOIN pg_roles grantee_role
  ON grantee_role.oid = acl_entry.grantee
WHERE namespace.nspname = 'public'
  AND procedure.proname = 'pos_close_cash_session'
ORDER BY procedure.oid::regprocedure::text, grantee, acl_entry.privilege_type;

-- 06c. Effective execute privilege for every close-session overload.
WITH target_roles AS (
  SELECT *
  FROM (
    VALUES
      ('PUBLIC'::text, 0::oid),
      ('anon'::text, to_regrole('anon')::oid),
      ('authenticated'::text, to_regrole('authenticated')::oid),
      ('service_role'::text, to_regrole('service_role')::oid),
      ('postgres'::text, to_regrole('postgres')::oid)
  ) AS roles(role_name, role_oid)
)
SELECT
  '06c_close_rpc_effective_execute'::text AS section,
  procedure.oid::regprocedure AS signature,
  roles.role_name,
  CASE
    WHEN roles.role_name = 'PUBLIC' THEN EXISTS (
      SELECT 1
      FROM aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner)))
        AS acl_entry(grantor, grantee, privilege_type, is_grantable)
      WHERE acl_entry.grantee = 0
        AND acl_entry.privilege_type = 'EXECUTE'
    )
    WHEN roles.role_oid IS NULL THEN NULL
    ELSE has_function_privilege(roles.role_oid, procedure.oid, 'EXECUTE')
  END AS can_execute,
  CASE
    WHEN roles.role_oid IS NULL AND roles.role_name <> 'PUBLIC' THEN 'ROLE NOT FOUND'
    ELSE 'EVALUATED'
  END AS evaluation
FROM pg_proc procedure
JOIN pg_namespace namespace
  ON namespace.oid = procedure.pronamespace
CROSS JOIN target_roles roles
WHERE namespace.nspname = 'public'
  AND procedure.proname = 'pos_close_cash_session'
ORDER BY procedure.oid::regprocedure::text, roles.role_name;

-- 07. Exact movement columns, including persistence metadata.
SELECT
  '07_movements_columns'::text AS section,
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
  AND column_info.table_name = 'pos_cash_movements'
ORDER BY column_info.ordinal_position;

-- 07b. Explicit movement-field checklist. It is intentionally tolerant of
-- different production naming, so the actual column grid remains authoritative.
SELECT
  '07b_movements_semantic_columns'::text AS section,
  required.column_name AS expected_or_candidate_column,
  CASE
    WHEN attribute.attname IS NULL THEN 'ABSENT'
    ELSE 'PRESENT'
  END AS presence,
  format_type(attribute.atttypid, attribute.atttypmod) AS actual_type,
  CASE
    WHEN attribute.attname IS NULL THEN NULL
    WHEN attribute.attnotnull THEN 'NOT NULL'
    ELSE 'NULLABLE'
  END AS nullability,
  pg_get_expr(default_value.adbin, default_value.adrelid) AS default_expression
FROM (
  VALUES
    ('id'),
    ('brand_id'),
    ('brand_slug'),
    ('cash_session_id'),
    ('session_id'),
    ('register_id'),
    ('location_id'),
    ('amount'),
    ('type'),
    ('movement_type'),
    ('direction'),
    ('sign'),
    ('reason'),
    ('notes'),
    ('created_by'),
    ('created_at')
) AS required(column_name)
LEFT JOIN pg_attribute attribute
  ON attribute.attrelid = to_regclass('public.pos_cash_movements')
 AND attribute.attname = required.column_name
 AND attribute.attnum > 0
 AND NOT attribute.attisdropped
LEFT JOIN pg_attrdef default_value
  ON default_value.adrelid = attribute.attrelid
 AND default_value.adnum = attribute.attnum
ORDER BY required.column_name;

-- 08. All movement PK, UNIQUE, CHECK, FK, and exclusion definitions.
SELECT
  '08_movements_constraints'::text AS section,
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
  AND relation.relname = 'pos_cash_movements'
ORDER BY constraint_type, constraint_row.conname;

-- 09. All movement indexes, including independent UNIQUE and partial indexes.
SELECT
  '09_movements_indexes'::text AS section,
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
  AND index_info.tablename = 'pos_cash_movements'
ORDER BY index_info.indexname;

-- 10. Movement RLS state, policies, and raw ACL entries.
SELECT
  '10_movements_rls'::text AS section,
  relation.relrowsecurity AS rls_enabled,
  relation.relforcerowsecurity AS rls_forced,
  pg_get_userbyid(relation.relowner) AS owner
FROM pg_class relation
JOIN pg_namespace namespace
  ON namespace.oid = relation.relnamespace
WHERE namespace.nspname = 'public'
  AND relation.relname = 'pos_cash_movements';

SELECT
  '10b_movements_policies'::text AS section,
  policy_info.policyname AS policy_name,
  policy_info.permissive,
  policy_info.roles,
  policy_info.cmd AS policy_command,
  policy_info.qual AS using_expression,
  policy_info.with_check AS with_check_expression
FROM pg_policies policy_info
WHERE policy_info.schemaname = 'public'
  AND policy_info.tablename = 'pos_cash_movements'
ORDER BY policy_info.policyname;

SELECT
  '10c_movements_acl'::text AS section,
  CASE
    WHEN acl_entry.grantee = 0 THEN 'PUBLIC'
    ELSE COALESCE(grantee_role.rolname, acl_entry.grantee::regrole::text)
  END AS grantee,
  pg_get_userbyid(acl_entry.grantor) AS grantor,
  acl_entry.privilege_type,
  acl_entry.is_grantable
FROM pg_class relation
JOIN pg_namespace namespace
  ON namespace.oid = relation.relnamespace
CROSS JOIN LATERAL aclexplode(
  COALESCE(relation.relacl, acldefault('r', relation.relowner))
) AS acl_entry(grantor, grantee, privilege_type, is_grantable)
LEFT JOIN pg_roles grantee_role
  ON grantee_role.oid = acl_entry.grantee
WHERE namespace.nspname = 'public'
  AND relation.relname = 'pos_cash_movements'
ORDER BY grantee, acl_entry.privilege_type;

-- 10d. Effective movement read privilege for application-relevant roles.
WITH target_roles AS (
  SELECT *
  FROM (
    VALUES
      ('PUBLIC'::text, 0::oid),
      ('anon'::text, to_regrole('anon')::oid),
      ('authenticated'::text, to_regrole('authenticated')::oid),
      ('service_role'::text, to_regrole('service_role')::oid),
      ('postgres'::text, to_regrole('postgres')::oid)
  ) AS roles(role_name, role_oid)
)
SELECT
  '10d_movements_effective_read'::text AS section,
  roles.role_name,
  CASE
    WHEN roles.role_name = 'PUBLIC' THEN EXISTS (
      SELECT 1
      FROM aclexplode(COALESCE(relation.relacl, acldefault('r', relation.relowner)))
        AS acl_entry(grantor, grantee, privilege_type, is_grantable)
      WHERE acl_entry.grantee = 0
        AND acl_entry.privilege_type = 'SELECT'
    )
    WHEN roles.role_oid IS NULL THEN NULL
    ELSE has_table_privilege(roles.role_oid, relation.oid, 'SELECT')
  END AS can_read,
  CASE
    WHEN roles.role_oid IS NULL AND roles.role_name <> 'PUBLIC' THEN 'ROLE NOT FOUND'
    ELSE 'EVALUATED'
  END AS evaluation
FROM pg_class relation
JOIN pg_namespace namespace
  ON namespace.oid = relation.relnamespace
CROSS JOIN target_roles roles
WHERE namespace.nspname = 'public'
  AND relation.relname = 'pos_cash_movements'
ORDER BY roles.role_name;

-- 11. Type metadata for amount/sign/type-like movement fields. Enum labels and
-- CHECK definitions in section 08 reveal the permitted movement vocabulary.
SELECT
  '11_movements_type_metadata'::text AS section,
  attribute.attname AS column_name,
  format_type(attribute.atttypid, attribute.atttypmod) AS actual_type,
  type_info.typtype AS type_kind,
  string_agg(enum_value.enumlabel, ', ' ORDER BY enum_value.enumsortorder) AS enum_values
FROM pg_attribute attribute
JOIN pg_class relation
  ON relation.oid = attribute.attrelid
JOIN pg_namespace namespace
  ON namespace.oid = relation.relnamespace
JOIN pg_type type_info
  ON type_info.oid = attribute.atttypid
LEFT JOIN pg_enum enum_value
  ON enum_value.enumtypid = type_info.oid
WHERE namespace.nspname = 'public'
  AND relation.relname = 'pos_cash_movements'
  AND attribute.attnum > 0
  AND NOT attribute.attisdropped
  AND attribute.attname IN ('amount', 'type', 'movement_type', 'direction', 'sign')
GROUP BY
  attribute.attname,
  attribute.atttypid,
  attribute.atttypmod,
  type_info.typtype
ORDER BY attribute.attname;

-- 12. Triggers on sessions and movements plus their complete function source.
SELECT
  '12_cash_triggers'::text AS section,
  relation.relname AS table_name,
  trigger_info.tgname AS trigger_name,
  CASE
    WHEN (trigger_info.tgtype & 2) <> 0 THEN 'BEFORE'
    WHEN (trigger_info.tgtype & 64) <> 0 THEN 'INSTEAD OF'
    ELSE 'AFTER'
  END AS timing,
  concat_ws(
    ', ',
    CASE WHEN (trigger_info.tgtype & 4) <> 0 THEN chr(73) || chr(78) || chr(83) || chr(69) || chr(82) || chr(84) END,
    CASE WHEN (trigger_info.tgtype & 8) <> 0 THEN chr(68) || chr(69) || chr(76) || chr(69) || chr(84) || chr(69) END,
    CASE WHEN (trigger_info.tgtype & 16) <> 0 THEN chr(85) || chr(80) || chr(68) || chr(65) || chr(84) || chr(69) END,
    CASE WHEN (trigger_info.tgtype & 32) <> 0 THEN chr(84) || chr(82) || chr(85) || chr(78) || chr(67) || chr(65) || chr(84) || chr(69) END
  ) AS event,
  CASE
    WHEN (trigger_info.tgtype & 1) <> 0 THEN 'ROW'
    ELSE 'STATEMENT'
  END AS level,
  trigger_function.oid::regprocedure AS trigger_function_signature,
  trigger_function.prosecdef AS trigger_function_security_definer,
  trigger_function.proconfig AS trigger_function_config,
  pg_get_userbyid(trigger_function.proowner) AS trigger_function_owner,
  pg_get_triggerdef(trigger_info.oid, true) AS trigger_definition,
  pg_get_functiondef(trigger_function.oid) AS trigger_function_definition
FROM pg_trigger trigger_info
JOIN pg_class relation
  ON relation.oid = trigger_info.tgrelid
JOIN pg_namespace namespace
  ON namespace.oid = relation.relnamespace
JOIN pg_proc trigger_function
  ON trigger_function.oid = trigger_info.tgfoid
WHERE namespace.nspname = 'public'
  AND relation.relname IN ('pos_cash_sessions', 'pos_cash_movements')
  AND NOT trigger_info.tgisinternal
ORDER BY relation.relname, trigger_info.tgname;

-- 13. Close-RPC source lines relevant to expected cash, sale inclusion,
-- movement sign, final session state, and locking. Read alongside section 06.
WITH close_procedures AS (
  SELECT
    procedure.oid::regprocedure AS signature,
    pg_get_functiondef(procedure.oid) AS definition
  FROM pg_proc procedure
  JOIN pg_namespace namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'pos_close_cash_session'
)
SELECT
  '13_close_rpc_relevant_source'::text AS section,
  close_procedures.signature,
  source_line.line_number,
  source_line.text_value AS source_line
FROM close_procedures
CROSS JOIN LATERAL regexp_split_to_table(close_procedures.definition, E'\n')
  WITH ORDINALITY AS source_line(text_value, line_number)
WHERE lower(source_line.text_value) LIKE ANY (
  ARRAY[
    '%opening_amount%',
    '%expected_cash%',
    '%counted_cash%',
    '%difference%',
    '%pos_payments%',
    '%pos_sales%',
    '%pos_cash_movements%',
    '%payment_method%',
    '%cash_session_id%',
    '%status%',
    '%' || 'for ' || chr(117) || chr(112) || chr(100) || chr(97) || chr(116) || chr(101) || '%',
    '%closed_by%',
    '%closed_at%',
    '%notes%',
    '%amount%'
  ]
)
ORDER BY close_procedures.signature::text, source_line.line_number;

-- 13b. Compact evidence pointers extracted from the close source. These flags
-- never replace the full source result above.
WITH close_procedures AS (
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
  '13b_close_rpc_source_facts'::text AS section,
  signature,
  definition LIKE '%opening_amount%' AS mentions_opening_amount,
  definition LIKE '%pos_payments%' AS reads_pos_payments,
  definition LIKE '%payment_method%' AS reads_payment_method,
  definition LIKE '%''cash''%' AS mentions_cash_literal,
  definition LIKE '%pos_cash_movements%' AS reads_pos_cash_movements,
  definition LIKE '%cash_session_id%' AS mentions_cash_session_id,
  definition LIKE '%pos_sales%' AS reads_pos_sales,
  definition LIKE '%status%' AS mentions_sale_or_session_status,
  definition LIKE ('%' || 'for ' || chr(117) || chr(112) || chr(100) || chr(97) || chr(116) || chr(101) || '%') AS has_row_lock_phrase,
  definition LIKE '%expected_cash%' AS writes_or_returns_expected_cash,
  definition LIKE '%counted_cash%' AS reads_or_writes_counted_cash,
  definition LIKE '%difference%' AS writes_or_returns_difference,
  definition LIKE '%closed_by%' AS mentions_closed_by,
  definition LIKE '%closed_at%' AS mentions_closed_at,
  definition LIKE '%notes%' AS mentions_notes
FROM close_procedures
ORDER BY signature::text;

-- 14. Status literals requested for refund safety. "MENTIONED" is lexical
-- evidence only; the complete section 06 source decides inclusion or exclusion.
WITH close_procedures AS (
  SELECT
    procedure.oid::regprocedure AS signature,
    lower(pg_get_functiondef(procedure.oid)) AS definition
  FROM pg_proc procedure
  JOIN pg_namespace namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'pos_close_cash_session'
), requested_statuses AS (
  SELECT *
  FROM (
    VALUES
      ('completed'),
      ('partially_refunded'),
      ('refunded'),
      ('void'),
      ('cancelled'),
      ('pending')
  ) AS statuses(status_name)
)
SELECT
  '14_sale_status_safety'::text AS section,
  close_procedures.signature,
  requested_statuses.status_name,
  CASE
    WHEN close_procedures.definition LIKE '%' || quote_literal(requested_statuses.status_name) || '%'
      THEN 'MENTIONED IN CLOSE SOURCE'
    ELSE 'NOT PRESENT IN CLOSE SOURCE'
  END AS source_evidence,
  CASE
    WHEN close_procedures.definition LIKE '%status%' THEN 'READ SECTION 06/13 FOR ACTUAL FILTER'
    ELSE 'FUTURE REFUND RISK: no status filter phrase found'
  END AS review_direction
FROM close_procedures
CROSS JOIN requested_statuses
ORDER BY close_procedures.signature::text, requested_statuses.status_name;

-- 14b. Direct FK evidence for session-scoped sales and payment components.
SELECT
  '14b_session_sale_payment_relationships'::text AS section,
  source_relation.relname AS source_table,
  constraint_row.conname AS constraint_name,
  string_agg(source_attribute.attname, ', ' ORDER BY key_column.ordinality) AS source_columns,
  target_relation.relname AS target_table,
  string_agg(target_attribute.attname, ', ' ORDER BY key_column.ordinality) AS target_columns,
  pg_get_constraintdef(constraint_row.oid, true) AS definition
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
  AND source_relation.relname IN ('pos_sales', 'pos_payments', 'pos_cash_movements')
  AND target_namespace.nspname = 'public'
  AND target_relation.relname IN ('pos_cash_sessions', 'pos_sales')
GROUP BY
  source_relation.relname,
  constraint_row.conname,
  target_relation.relname,
  constraint_row.oid
ORDER BY source_relation.relname, constraint_row.conname;

-- 15. Concurrency-source comparison: close RPC and every live V4 overload.
-- It exposes whether both procedures mention the same session identity and a
-- row-lock phrase. Exact ordering still requires reading the complete sources.
WITH cash_procedures AS (
  SELECT
    procedure.proname,
    procedure.oid::regprocedure AS signature,
    lower(pg_get_functiondef(procedure.oid)) AS definition
  FROM pg_proc procedure
  JOIN pg_namespace namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname IN ('pos_close_cash_session', 'pos_complete_sale_v4')
)
SELECT
  '15_concurrency_source_facts'::text AS section,
  proname,
  signature,
  definition LIKE '%cash_session_id%' AS mentions_cash_session_id,
  definition LIKE '%register_id%' AS mentions_register_id,
  definition LIKE '%brand_slug%' AS mentions_brand_slug,
  definition LIKE '%status%' AS mentions_status,
  definition LIKE ('%' || 'for ' || chr(117) || chr(112) || chr(100) || chr(97) || chr(116) || chr(101) || '%') AS has_row_lock_phrase,
  definition LIKE '%''open''%' AS mentions_open_literal,
  definition LIKE '%''closed''%' AS mentions_closed_literal
FROM cash_procedures
ORDER BY proname, signature::text;

-- 15b. Relevant V4 source lines for session validation and locking.
WITH sale_procedures AS (
  SELECT
    procedure.oid::regprocedure AS signature,
    pg_get_functiondef(procedure.oid) AS definition
  FROM pg_proc procedure
  JOIN pg_namespace namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'pos_complete_sale_v4'
)
SELECT
  '15b_complete_sale_v4_session_source'::text AS section,
  sale_procedures.signature,
  source_line.line_number,
  source_line.text_value AS source_line
FROM sale_procedures
CROSS JOIN LATERAL regexp_split_to_table(sale_procedures.definition, E'\n')
  WITH ORDINALITY AS source_line(text_value, line_number)
WHERE lower(source_line.text_value) LIKE ANY (
  ARRAY[
    '%cash_session_id%',
    '%register_id%',
    '%brand_slug%',
    '%status%',
    '%' || 'for ' || chr(117) || chr(112) || chr(100) || chr(97) || chr(116) || chr(101) || '%'
  ]
)
ORDER BY sale_procedures.signature::text, source_line.line_number;

-- 16. Immutability evidence: RLS/ACL appears above; this grid identifies any
-- non-internal trigger protection and the session-state terms in close source.
WITH trigger_counts AS (
  SELECT
    relation.relname AS table_name,
    count(trigger_info.oid) FILTER (WHERE NOT trigger_info.tgisinternal) AS non_internal_trigger_count
  FROM pg_class relation
  JOIN pg_namespace namespace
    ON namespace.oid = relation.relnamespace
  LEFT JOIN pg_trigger trigger_info
    ON trigger_info.tgrelid = relation.oid
  WHERE namespace.nspname = 'public'
    AND relation.relname IN ('pos_cash_sessions', 'pos_cash_movements')
  GROUP BY relation.relname
), close_procedures AS (
  SELECT lower(pg_get_functiondef(procedure.oid)) AS definition
  FROM pg_proc procedure
  JOIN pg_namespace namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'pos_close_cash_session'
)
SELECT
  '16_immutability_facts'::text AS section,
  trigger_counts.table_name,
  trigger_counts.non_internal_trigger_count,
  EXISTS (
    SELECT 1
    FROM close_procedures
    WHERE definition LIKE '%''closed''%'
  ) AS close_source_mentions_closed_state,
  EXISTS (
    SELECT 1
    FROM close_procedures
    WHERE definition LIKE '%status%'
      AND definition LIKE ('%' || 'for ' || chr(117) || chr(112) || chr(100) || chr(97) || chr(116) || chr(101) || '%')
  ) AS close_source_mentions_state_and_lock,
  'REVIEW sections 04/10/12/13 before classifying STRONG, PARTIAL, or NONE' AS review_direction
FROM trigger_counts
ORDER BY trigger_counts.table_name;

-- 17. Compact operator checklist. It intentionally reports only facts proven
-- by this read-only preflight; formula and safety conclusions require the full
-- source grids above.
WITH target_relations AS (
  SELECT
    requested.relation_name,
    to_regclass('public.' || requested.relation_name) AS relation_oid
  FROM (
    VALUES
      ('pos_cash_sessions'),
      ('pos_cash_movements')
  ) AS requested(relation_name)
), required_session_columns AS (
  SELECT
    required.column_name,
    EXISTS (
      SELECT 1
      FROM pg_attribute attribute
      WHERE attribute.attrelid = to_regclass('public.pos_cash_sessions')
        AND attribute.attname = required.column_name
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
    ) AS present
  FROM (
    VALUES
      ('opening_amount'),
      ('expected_cash'),
      ('counted_cash'),
      ('difference')
  ) AS required(column_name)
), procedures AS (
  SELECT procedure.proname, procedure.oid
  FROM pg_proc procedure
  JOIN pg_namespace namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname IN ('pos_open_cash_session', 'pos_close_cash_session')
)
SELECT
  '17_operator_checklist'::text AS section,
  max(CASE WHEN target_relations.relation_name = 'pos_cash_sessions'
             AND target_relations.relation_oid IS NOT NULL
           THEN 'PRESENT' ELSE 'NOT FOUND' END) AS cash_sessions_relation,
  max(CASE WHEN target_relations.relation_name = 'pos_cash_movements'
             AND target_relations.relation_oid IS NOT NULL
           THEN 'PRESENT' ELSE 'NOT FOUND' END) AS cash_movements_relation,
  CASE
    WHEN bool_and(required_session_columns.present) THEN 'PRESENT'
    ELSE 'INCOMPLETE OR NOT FOUND'
  END AS required_financial_columns,
  CASE
    WHEN EXISTS (SELECT 1 FROM procedures WHERE proname = 'pos_open_cash_session') THEN 'PRESENT'
    ELSE 'NOT FOUND'
  END AS open_rpc,
  CASE
    WHEN EXISTS (SELECT 1 FROM procedures WHERE proname = 'pos_close_cash_session') THEN 'PRESENT'
    ELSE 'NOT FOUND'
  END AS close_rpc,
  'READ sections 05, 06, 12, 13, 15, and 16 before a GO decision' AS next_review
FROM target_relations
CROSS JOIN required_session_columns;

COMMIT;
