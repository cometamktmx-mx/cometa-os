-- PRODUCT VARIANTS + INVENTORY PRE-FLIGHT
-- READ ONLY
-- Ejecutar antes de corregir el alta y ciclo de vida de variantes.

-- 1A. Existencia de las funciones requeridas.
WITH expected_functions(function_name) AS (
  VALUES
    ('pos_update_product_v2'),
    ('pos_create_product_v2'),
    ('pos_adjust_inventory'),
    ('pos_complete_inventory_receipt_v1')
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

-- 1B. Firma, seguridad, search_path y hash SHA256 de cada overload instalado.
SELECT
  procedure.proname AS function_name,
  procedure.oid::regprocedure::text AS identity,
  pg_get_function_identity_arguments(procedure.oid) AS identity_arguments,
  pg_get_function_result(procedure.oid) AS result_type,
  language.lanname AS language,
  procedure.prosecdef AS security_definer,
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
    'pos_update_product_v2',
    'pos_create_product_v2',
    'pos_adjust_inventory',
    'pos_complete_inventory_receipt_v1'
  )
ORDER BY procedure.proname, identity;

-- 1C. Definiciones completas. El SQL Editor muestra una fila por overload.
SELECT
  procedure.oid::regprocedure::text AS identity,
  pg_get_functiondef(procedure.oid) AS function_definition
FROM pg_proc procedure
JOIN pg_namespace namespace
  ON namespace.oid = procedure.pronamespace
WHERE namespace.nspname = 'public'
  AND procedure.proname IN (
    'pos_update_product_v2',
    'pos_create_product_v2',
    'pos_adjust_inventory',
    'pos_complete_inventory_receipt_v1'
  )
ORDER BY procedure.proname, identity;

-- 1D. ACL expandida: EXECUTE efectivo registrado para cada función.
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
  COALESCE(
    procedure.proacl,
    acldefault('f', procedure.proowner)
  )
) privilege
LEFT JOIN pg_roles grantee_role
  ON grantee_role.oid = privilege.grantee
LEFT JOIN pg_roles grantor_role
  ON grantor_role.oid = privilege.grantor
WHERE namespace.nspname = 'public'
  AND procedure.proname IN (
    'pos_update_product_v2',
    'pos_create_product_v2',
    'pos_adjust_inventory',
    'pos_complete_inventory_receipt_v1'
  )
ORDER BY identity, grantee, privilege.privilege_type;

-- 2. Columnas reales de pos_inventory.
SELECT
  attribute.attnum AS ordinal_position,
  attribute.attname AS column_name,
  format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
  attribute.attnotnull AS not_null,
  pg_get_expr(default_value.adbin, default_value.adrelid) AS default_expression,
  col_description(attribute.attrelid, attribute.attnum) AS description
FROM pg_attribute attribute
LEFT JOIN pg_attrdef default_value
  ON default_value.adrelid = attribute.attrelid
 AND default_value.adnum = attribute.attnum
WHERE attribute.attrelid = 'public.pos_inventory'::regclass
  AND attribute.attnum > 0
  AND NOT attribute.attisdropped
ORDER BY attribute.attnum;

-- 3. PK, FK, UNIQUE, CHECK y exclusiones de pos_inventory.
SELECT
  constraint_row.conname AS constraint_name,
  constraint_row.contype AS constraint_type_code,
  CASE constraint_row.contype
    WHEN 'p' THEN 'PRIMARY KEY'
    WHEN 'f' THEN 'FOREIGN KEY'
    WHEN 'u' THEN 'UNIQUE'
    WHEN 'c' THEN 'CHECK'
    WHEN 'x' THEN 'EXCLUSION'
    ELSE constraint_row.contype::text
  END AS constraint_type,
  pg_get_constraintdef(constraint_row.oid, true) AS definition,
  constraint_row.convalidated AS validated,
  CASE
    WHEN constraint_row.contype = 'f'
      THEN constraint_row.confrelid::regclass::text
    ELSE NULL
  END AS referenced_table
FROM pg_constraint constraint_row
WHERE constraint_row.conrelid = 'public.pos_inventory'::regclass
ORDER BY constraint_type, constraint_name;

-- 4. Todos los índices de pos_inventory.
SELECT
  index_row.indexname,
  index_row.indexdef
FROM pg_indexes index_row
WHERE index_row.schemaname = 'public'
  AND index_row.tablename = 'pos_inventory'
ORDER BY index_row.indexname;

-- 5. Triggers no internos de pos_inventory.
SELECT
  trigger_row.tgname AS trigger_name,
  trigger_row.tgenabled AS enabled_mode,
  pg_get_triggerdef(trigger_row.oid, true) AS definition,
  trigger_function.oid::regprocedure::text AS trigger_function
FROM pg_trigger trigger_row
JOIN pg_proc trigger_function
  ON trigger_function.oid = trigger_row.tgfoid
WHERE trigger_row.tgrelid = 'public.pos_inventory'::regclass
  AND NOT trigger_row.tgisinternal
ORDER BY trigger_row.tgname;

-- 6A. Estado RLS de las tablas involucradas.
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
    'pos_inventory',
    'pos_product_variants'
  )
ORDER BY relation.relname;

-- 6B. Policies completas de inventario y variantes.
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
    'pos_inventory',
    'pos_product_variants'
  )
ORDER BY tablename, policyname;

-- 7A. Columnas reales de pos_product_variants.
SELECT
  attribute.attnum AS ordinal_position,
  attribute.attname AS column_name,
  format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
  attribute.attnotnull AS not_null,
  pg_get_expr(default_value.adbin, default_value.adrelid) AS default_expression,
  col_description(attribute.attrelid, attribute.attnum) AS description
FROM pg_attribute attribute
LEFT JOIN pg_attrdef default_value
  ON default_value.adrelid = attribute.attrelid
 AND default_value.adnum = attribute.attnum
WHERE attribute.attrelid = 'public.pos_product_variants'::regclass
  AND attribute.attnum > 0
  AND NOT attribute.attisdropped
ORDER BY attribute.attnum;

-- 7B. Constraints de variantes: ownership, producto, SKU y barcode.
SELECT
  constraint_row.conname AS constraint_name,
  constraint_row.contype AS constraint_type_code,
  CASE constraint_row.contype
    WHEN 'p' THEN 'PRIMARY KEY'
    WHEN 'f' THEN 'FOREIGN KEY'
    WHEN 'u' THEN 'UNIQUE'
    WHEN 'c' THEN 'CHECK'
    WHEN 'x' THEN 'EXCLUSION'
    ELSE constraint_row.contype::text
  END AS constraint_type,
  pg_get_constraintdef(constraint_row.oid, true) AS definition,
  constraint_row.convalidated AS validated,
  CASE
    WHEN constraint_row.contype = 'f'
      THEN constraint_row.confrelid::regclass::text
    ELSE NULL
  END AS referenced_table
FROM pg_constraint constraint_row
WHERE constraint_row.conrelid = 'public.pos_product_variants'::regclass
ORDER BY constraint_type, constraint_name;

-- 7C. Todos los índices de variantes, incluidos uniques parciales o por expresión.
SELECT
  index_row.indexname,
  index_row.indexdef
FROM pg_indexes index_row
WHERE index_row.schemaname = 'public'
  AND index_row.tablename = 'pos_product_variants'
ORDER BY index_row.indexname;

-- 7D. FKs que apuntan a pos_product_variants, incluida la relación con inventario.
SELECT
  constraint_row.conrelid::regclass::text AS referencing_table,
  constraint_row.conname AS constraint_name,
  pg_get_constraintdef(constraint_row.oid, true) AS definition
FROM pg_constraint constraint_row
WHERE constraint_row.contype = 'f'
  AND constraint_row.confrelid = 'public.pos_product_variants'::regclass
ORDER BY referencing_table, constraint_name;

-- 8A. Evidencia estructural del update instalado.
-- Los indicadores son auxiliares; pg_get_functiondef anterior sigue siendo la autoridad.
WITH update_functions AS (
  SELECT
    procedure.oid,
    procedure.oid::regprocedure::text AS identity,
    pg_get_functiondef(procedure.oid) AS definition
  FROM pg_proc procedure
  JOIN pg_namespace namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'pos_update_product_v2'
)
SELECT
  identity,
  definition ~* 'item\s*->>\s*''id''' AS inspects_variant_id,
  definition ~* 'insert\s+into\s+(public\.)?pos_product_variants' AS inserts_new_variants,
  definition ~* 'update\s+(public\.)?pos_product_variants' AS updates_variants,
  definition ~* 'active\s*=\s*false' AS can_deactivate_variants,
  definition ~* 'insert\s+into\s+(public\.)?pos_inventory([\s(]|$)' AS inserts_inventory,
  definition ~* 'update\s+(public\.)?pos_inventory([\s]|$)' AS updates_inventory,
  definition ~* 'pos_inventory_movements' AS touches_inventory_movements,
  definition ~* 'inventory_mode' AS handles_inventory_mode,
  pg_get_function_result(oid) AS result_type
FROM update_functions
ORDER BY identity;

-- 8B. Mensajes RAISE EXCEPTION declarados por pos_update_product_v2.
WITH update_functions AS (
  SELECT
    procedure.oid::regprocedure::text AS identity,
    pg_get_functiondef(procedure.oid) AS definition
  FROM pg_proc procedure
  JOIN pg_namespace namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'pos_update_product_v2'
)
SELECT
  update_functions.identity,
  (raised_message.match)[1] AS raise_exception_message
FROM update_functions
CROSS JOIN LATERAL regexp_matches(
  update_functions.definition,
  'RAISE[[:space:]]+EXCEPTION[[:space:]]+''([^'']+)''',
  'gi'
) AS raised_message(match)
ORDER BY update_functions.identity, raise_exception_message;

-- 9A. Producto Short Dfyne y sus variantes, sin datos personales.
SELECT
  product.id AS product_id,
  product.brand_slug,
  product.name AS product_name,
  product.inventory_mode,
  product.track_inventory,
  product.active AS product_active,
  variant.id AS variant_id,
  variant.name AS variant_name,
  variant.sku,
  variant.barcode,
  variant.active AS variant_active
FROM public.pos_products product
LEFT JOIN public.pos_product_variants variant
  ON variant.product_id = product.id
 AND variant.brand_slug = product.brand_slug
WHERE product.brand_slug = 'tivana'
  AND lower(product.name) = lower('Short Dfyne')
ORDER BY variant.sort_order, variant.created_at, variant.id;

-- 9B. Matriz variante × sucursal de Tivana; revela filas de inventario ausentes.
WITH target_product AS (
  SELECT
    product.id,
    product.brand_id,
    product.brand_slug,
    product.name,
    product.inventory_mode,
    product.track_inventory
  FROM public.pos_products product
  WHERE product.brand_slug = 'tivana'
    AND lower(product.name) = lower('Short Dfyne')
),
target_variants AS (
  SELECT
    variant.id,
    variant.brand_id,
    variant.brand_slug,
    variant.product_id,
    variant.name,
    variant.sku,
    variant.barcode,
    variant.active
  FROM public.pos_product_variants variant
  JOIN target_product product
    ON product.id = variant.product_id
   AND product.brand_slug = variant.brand_slug
),
target_locations AS (
  SELECT
    location.id,
    location.brand_id,
    location.brand_slug,
    location.name,
    location.active
  FROM public.pos_locations location
  JOIN target_product product
    ON product.brand_slug = location.brand_slug
  WHERE location.brand_slug = 'tivana'
)
SELECT
  product.id AS product_id,
  product.inventory_mode,
  variant.id AS variant_id,
  variant.name AS variant_name,
  variant.sku,
  variant.barcode,
  variant.active AS variant_active,
  location.id AS location_id,
  location.name AS location_name,
  location.active AS location_active,
  inventory.id IS NOT NULL AS inventory_row_exists,
  inventory.id AS inventory_id,
  inventory.quantity,
  inventory.reserved_quantity,
  to_jsonb(inventory) AS complete_inventory_row
FROM target_product product
JOIN target_variants variant
  ON variant.product_id = product.id
CROSS JOIN target_locations location
LEFT JOIN public.pos_inventory inventory
  ON inventory.variant_id = variant.id
 AND inventory.location_id = location.id
 AND inventory.brand_slug = product.brand_slug
ORDER BY variant.name, location.name, variant.id, location.id;
