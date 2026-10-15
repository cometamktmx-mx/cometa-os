-- PRODUCT VARIANTS + INVENTORY V1
-- SUITE TRANSACCIONAL; ejecutar sólo después de instalar la migración.
-- Termina en ROLLBACK. No ejecutar contra producción sin revisar el fixture.

BEGIN;

CREATE TEMP TABLE product_variant_v1_fixture ON COMMIT DROP AS
SELECT
  product.brand_id,
  product.brand_slug,
  product.id AS product_id,
  product.name AS original_product_name,
  product.category_id,
  product.description,
  product.product_type,
  product.inventory_mode,
  product.default_unit_code,
  product.has_variants,
  product.sellable,
  product.purchasable,
  product.tax_rate,
  product.image_url,
  product.configuration,
  variant.id AS existing_variant_id,
  variant.name AS original_variant_name,
  variant.sku AS original_sku,
  variant.barcode AS original_barcode,
  variant.price AS original_price,
  variant.cost AS original_cost,
  variant.attributes AS original_attributes,
  variant.unit_code AS original_unit_code,
  variant.image_url AS original_variant_image_url,
  variant.configuration AS original_variant_configuration,
  variant.sort_order AS original_sort_order,
  location.id AS location_id,
  reference_sale.sold_by AS user_id,
  gen_random_uuid() AS token
FROM public.pos_products product
JOIN public.pos_product_variants variant
  ON variant.product_id = product.id
 AND variant.brand_slug = product.brand_slug
JOIN public.pos_locations location
  ON location.brand_slug = product.brand_slug
 AND location.active = true
LEFT JOIN LATERAL (
  SELECT sale.sold_by
  FROM public.pos_sales sale
  WHERE sale.brand_slug = product.brand_slug
    AND sale.sold_by IS NOT NULL
  ORDER BY sale.sold_at DESC
  LIMIT 1
) reference_sale ON true
WHERE product.brand_slug = 'tivana'
  AND lower(product.name) = lower('Short Dfyne')
  AND variant.active = true
  AND reference_sale.sold_by IS NOT NULL
ORDER BY variant.is_default DESC, variant.created_at, location.created_at
LIMIT 1;

DO $check_fixture$
BEGIN
  IF (SELECT count(*) FROM product_variant_v1_fixture) <> 1 THEN
    RAISE EXCEPTION 'PRECONDICIÓN: el fixture debe contener exactamente una fila.';
  END IF;
END;
$check_fixture$;

CREATE TEMP TABLE product_variant_v1_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
) ON COMMIT DROP;

CREATE TEMP TABLE product_variant_v1_rpc_results (
  operation text PRIMARY KEY,
  response jsonb NOT NULL
) ON COMMIT DROP;

-- TEST A/B/C/D/E: editar producto/variante, conservar ID, crear variante e inventario cero sin movimientos.
INSERT INTO product_variant_v1_rpc_results(operation, response)
SELECT
  'update_create',
  public.pos_update_product_v2(
    fixture.brand_id,
    fixture.brand_slug,
    fixture.product_id,
    fixture.category_id,
    fixture.original_product_name || ' V1 TEST',
    fixture.description,
    fixture.product_type,
    'direct',
    fixture.default_unit_code,
    true,
    fixture.sellable,
    fixture.purchasable,
    fixture.tax_rate,
    fixture.image_url,
    fixture.configuration,
    jsonb_build_array(
      jsonb_build_object(
        'id', fixture.existing_variant_id,
        'name', fixture.original_variant_name || ' EDITADA',
        'sku', fixture.original_sku,
        'barcode', fixture.original_barcode,
        'price', fixture.original_price + 1,
        'cost', fixture.original_cost,
        'attributes', fixture.original_attributes,
        'unit_code', fixture.original_unit_code,
        'image_url', fixture.original_variant_image_url,
        'active', true,
        'sort_order', fixture.original_sort_order,
        'configuration', fixture.original_variant_configuration
      ),
      jsonb_build_object(
        'name', 'V1 NUEVA ' || fixture.token::text,
        'sku', 'V1-' || left(replace(fixture.token::text, '-', ''), 20),
        'barcode', 'V1' || left(replace(fixture.token::text, '-', ''), 24),
        'price', 199,
        'cost', 100,
        'attributes', '{}'::jsonb,
        'unit_code', fixture.default_unit_code,
        'active', true,
        'sort_order', 999,
        'configuration', '{}'::jsonb
      )
    ),
    fixture.user_id
  )
FROM product_variant_v1_fixture fixture;

WITH created AS (
  SELECT
    fixture.*,
    rpc.response,
    (rpc.response -> 'createdVariantIds' ->> 0)::uuid AS new_variant_id
  FROM product_variant_v1_fixture fixture
  JOIN product_variant_v1_rpc_results rpc
    ON rpc.operation = 'update_create'
)
INSERT INTO product_variant_v1_results(test_name, passed, details)
SELECT
  'A-E update/create/inventory-zero/no-movement',
  product.name = created.original_product_name || ' V1 TEST'
    AND existing_variant.id = created.existing_variant_id
    AND existing_variant.price = created.original_price + 1
    AND new_variant.id = created.new_variant_id
    AND inventory_summary.row_count = active_locations.location_count
    AND inventory_summary.zero_row_count = active_locations.location_count
    AND movement_summary.movement_count = 0,
  jsonb_build_object(
    'response', created.response,
    'productId', created.product_id,
    'existingVariantId', existing_variant.id,
    'newVariantId', new_variant.id,
    'inventoryRows', inventory_summary.row_count,
    'activeLocations', active_locations.location_count,
    'zeroInventoryRows', inventory_summary.zero_row_count,
    'inventoryMovements', movement_summary.movement_count
  )
FROM created
JOIN public.pos_products product ON product.id = created.product_id
JOIN public.pos_product_variants existing_variant ON existing_variant.id = created.existing_variant_id
JOIN public.pos_product_variants new_variant ON new_variant.id = created.new_variant_id
CROSS JOIN LATERAL (
  SELECT count(*)::integer AS location_count
  FROM public.pos_locations location
  WHERE location.brand_slug = created.brand_slug AND location.active = true
) active_locations
CROSS JOIN LATERAL (
  SELECT
    count(*)::integer AS row_count,
    count(*) FILTER (
      WHERE inventory.quantity = 0
        AND inventory.reserved_quantity = 0
        AND inventory.minimum_quantity = 0
    )::integer AS zero_row_count
  FROM public.pos_inventory inventory
  WHERE inventory.variant_id = created.new_variant_id
) inventory_summary
CROSS JOIN LATERAL (
  SELECT count(*)::integer AS movement_count
  FROM public.pos_inventory_movements movement
  WHERE movement.variant_id = created.new_variant_id
) movement_summary;

-- TEST F/G: recepción canónica posterior aumenta stock y genera movimiento real.
WITH fixture AS (
  SELECT fixture.*, variant.id AS new_variant_id
  FROM product_variant_v1_fixture fixture
  JOIN public.pos_product_variants variant
    ON variant.product_id = fixture.product_id
   AND variant.sku = 'V1-' || left(replace(fixture.token::text, '-', ''), 20)
)
INSERT INTO product_variant_v1_rpc_results(operation, response)
SELECT
  'receipt',
  public.pos_complete_inventory_receipt_v1(
    fixture.brand_id,
    fixture.brand_slug,
    fixture.location_id,
    'V1 TEST',
    fixture.token::text,
    'Recepción transaccional de prueba',
    jsonb_build_array(jsonb_build_object(
      'variant_id', fixture.new_variant_id,
      'purchase_presentation_id', null,
      'scanned_code', 'V1-' || left(replace(fixture.token::text, '-', ''), 20),
      'quantity_mode', 'direct',
      'input_quantity', 10,
      'input_unit_code', fixture.default_unit_code,
      'conversion_factor', 1,
      'total_cost', 1000
    )),
    fixture.user_id
  )
FROM fixture;

WITH fixture AS (
  SELECT fixture.*, variant.id AS new_variant_id
  FROM product_variant_v1_fixture fixture
  JOIN public.pos_product_variants variant
    ON variant.product_id = fixture.product_id
   AND variant.sku = 'V1-' || left(replace(fixture.token::text, '-', ''), 20)
)
INSERT INTO product_variant_v1_results(test_name, passed, details)
SELECT
  'F-G canonical receipt',
  inventory.quantity = 10 AND movement_count.count = 1,
  jsonb_build_object(
    'response', rpc.response,
    'quantity', inventory.quantity,
    'movementCount', movement_count.count,
    'variantId', fixture.new_variant_id,
    'locationId', fixture.location_id
  )
FROM fixture
JOIN product_variant_v1_rpc_results rpc
  ON rpc.operation = 'receipt'
JOIN public.pos_inventory inventory
  ON inventory.variant_id = fixture.new_variant_id
 AND inventory.location_id = fixture.location_id
CROSS JOIN LATERAL (
  SELECT count(*)::integer AS count
  FROM public.pos_inventory_movements movement
  WHERE movement.variant_id = fixture.new_variant_id
    AND movement.location_id = fixture.location_id
) movement_count;

-- TEST H/I/N: desactivar/reactivar conserva ID e inventario y no duplica filas.
DO $test_lifecycle$
DECLARE
  fixture product_variant_v1_fixture%ROWTYPE;
  new_variant public.pos_product_variants%ROWTYPE;
  payload jsonb;
  inventory_before integer;
  inventory_after integer;
BEGIN
  SELECT * INTO fixture FROM product_variant_v1_fixture;
  SELECT * INTO new_variant
  FROM public.pos_product_variants
  WHERE product_id = fixture.product_id
    AND sku = 'V1-' || left(replace(fixture.token::text, '-', ''), 20);

  SELECT count(*) INTO inventory_before
  FROM public.pos_inventory WHERE variant_id = new_variant.id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', variant.id, 'name', variant.name, 'sku', variant.sku,
      'barcode', variant.barcode, 'price', variant.price, 'cost', variant.cost,
      'attributes', variant.attributes, 'unit_code', variant.unit_code,
      'image_url', variant.image_url,
      'active', CASE WHEN variant.id = new_variant.id THEN false ELSE variant.active END,
      'sort_order', variant.sort_order, 'configuration', variant.configuration
    ) ORDER BY variant.sort_order, variant.created_at, variant.id
  ) INTO payload
  FROM public.pos_product_variants variant
  WHERE variant.product_id = fixture.product_id;

  PERFORM public.pos_update_product_v2(
    fixture.brand_id, fixture.brand_slug, fixture.product_id, fixture.category_id,
    fixture.original_product_name, fixture.description, fixture.product_type, 'direct',
    fixture.default_unit_code, true, fixture.sellable, fixture.purchasable,
    fixture.tax_rate, fixture.image_url, fixture.configuration, payload, fixture.user_id
  );

  IF (SELECT active FROM public.pos_product_variants WHERE id = new_variant.id) THEN
    RAISE EXCEPTION 'TEST H: la variante no fue desactivada.';
  END IF;

  payload := (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', variant.id, 'name', variant.name, 'sku', variant.sku,
        'barcode', variant.barcode, 'price', variant.price, 'cost', variant.cost,
        'attributes', variant.attributes, 'unit_code', variant.unit_code,
        'image_url', variant.image_url,
        'active', CASE WHEN variant.id = new_variant.id THEN true ELSE variant.active END,
        'sort_order', variant.sort_order, 'configuration', variant.configuration
      ) ORDER BY variant.sort_order, variant.created_at, variant.id
    )
    FROM public.pos_product_variants variant
    WHERE variant.product_id = fixture.product_id
  );

  PERFORM public.pos_update_product_v2(
    fixture.brand_id, fixture.brand_slug, fixture.product_id, fixture.category_id,
    fixture.original_product_name, fixture.description, fixture.product_type, 'direct',
    fixture.default_unit_code, true, fixture.sellable, fixture.purchasable,
    fixture.tax_rate, fixture.image_url, fixture.configuration, payload, fixture.user_id
  );

  SELECT count(*) INTO inventory_after
  FROM public.pos_inventory WHERE variant_id = new_variant.id;

  INSERT INTO product_variant_v1_results(test_name, passed, details)
  VALUES (
    'H-I-N deactivate/reactivate/idempotent inventory',
    (SELECT active FROM public.pos_product_variants WHERE id = new_variant.id)
      AND inventory_before = inventory_after,
    jsonb_build_object(
      'variantId', new_variant.id,
      'inventoryRowsBefore', inventory_before,
      'inventoryRowsAfter', inventory_after
    )
  );
END;
$test_lifecycle$;

-- TEST J/K/L: conflictos de SKU, barcode y ownership deben rechazarse.
DO $test_errors$
DECLARE
  fixture product_variant_v1_fixture%ROWTYPE;
  base_payload jsonb;
  test_sku text;
  test_barcode text;
  sku_rejected boolean := false;
  barcode_rejected boolean := false;
  tenant_rejected boolean := false;
BEGIN
  SELECT * INTO fixture FROM product_variant_v1_fixture;
  SELECT jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'sku', sku, 'barcode', barcode,
    'price', price, 'cost', cost, 'attributes', attributes,
    'unit_code', unit_code, 'image_url', image_url, 'active', active,
    'sort_order', sort_order, 'configuration', configuration
  )) INTO base_payload
  FROM public.pos_product_variants WHERE product_id = fixture.product_id;

  SELECT variant.sku, variant.barcode
  INTO test_sku, test_barcode
  FROM public.pos_product_variants variant
  WHERE variant.product_id = fixture.product_id
    AND variant.sku = 'V1-' || left(replace(fixture.token::text, '-', ''), 20);

  BEGIN
    PERFORM public.pos_update_product_v2(
      fixture.brand_id, fixture.brand_slug, fixture.product_id, fixture.category_id,
      fixture.original_product_name, fixture.description, fixture.product_type, 'direct',
      fixture.default_unit_code, true, fixture.sellable, fixture.purchasable,
      fixture.tax_rate, fixture.image_url, fixture.configuration,
      base_payload || jsonb_build_array(jsonb_build_object(
        'name', 'SKU DUP', 'sku', test_sku, 'price', 1,
        'cost', 0, 'active', true, 'unit_code', fixture.default_unit_code
      )), fixture.user_id
    );
  EXCEPTION WHEN OTHERS THEN
    sku_rejected := position('SKU' in SQLERRM) > 0;
  END;

  BEGIN
    PERFORM public.pos_update_product_v2(
      fixture.brand_id, fixture.brand_slug, fixture.product_id, fixture.category_id,
      fixture.original_product_name, fixture.description, fixture.product_type, 'direct',
      fixture.default_unit_code, true, fixture.sellable, fixture.purchasable,
      fixture.tax_rate, fixture.image_url, fixture.configuration,
      base_payload || jsonb_build_array(jsonb_build_object(
        'name', 'BARCODE DUP', 'barcode', test_barcode, 'price', 1,
        'cost', 0, 'active', true, 'unit_code', fixture.default_unit_code
      )), fixture.user_id
    );
  EXCEPTION WHEN OTHERS THEN
    barcode_rejected := position('código de barras' in SQLERRM) > 0;
  END;

  BEGIN
    PERFORM public.pos_update_product_v2(
      fixture.brand_id, fixture.brand_slug || '-otra', fixture.product_id,
      fixture.category_id, fixture.original_product_name, fixture.description,
      fixture.product_type, 'direct', fixture.default_unit_code, true,
      fixture.sellable, fixture.purchasable, fixture.tax_rate, fixture.image_url,
      fixture.configuration, base_payload, fixture.user_id
    );
  EXCEPTION WHEN OTHERS THEN
    tenant_rejected := position('otra marca' in SQLERRM) > 0;
  END;

  INSERT INTO product_variant_v1_results(test_name, passed, details)
  VALUES (
    'J-K-L duplicate and cross-tenant errors',
    sku_rejected AND barcode_rejected AND tenant_rejected,
    jsonb_build_object(
      'skuRejected', sku_rejected,
      'barcodeRejected', barcode_rejected,
      'crossTenantRejected', tenant_rejected
    )
  );
END;
$test_errors$;

-- TEST M: none -> direct materializa inventario cero para todas las variantes.
DO $test_mode$
DECLARE
  fixture product_variant_v1_fixture%ROWTYPE;
  payload jsonb;
  expected integer;
  actual integer;
BEGIN
  SELECT * INTO fixture FROM product_variant_v1_fixture;
  SELECT jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'sku', sku, 'barcode', barcode,
    'price', price, 'cost', cost, 'attributes', attributes,
    'unit_code', unit_code, 'image_url', image_url, 'active', active,
    'sort_order', sort_order, 'configuration', configuration
  )) INTO payload
  FROM public.pos_product_variants WHERE product_id = fixture.product_id;

  PERFORM public.pos_update_product_v2(
    fixture.brand_id, fixture.brand_slug, fixture.product_id, fixture.category_id,
    fixture.original_product_name, fixture.description, fixture.product_type, 'none',
    fixture.default_unit_code, true, fixture.sellable, fixture.purchasable,
    fixture.tax_rate, fixture.image_url, fixture.configuration, payload, fixture.user_id
  );

  PERFORM public.pos_update_product_v2(
    fixture.brand_id, fixture.brand_slug, fixture.product_id, fixture.category_id,
    fixture.original_product_name, fixture.description, fixture.product_type, 'direct',
    fixture.default_unit_code, true, fixture.sellable, fixture.purchasable,
    fixture.tax_rate, fixture.image_url, fixture.configuration, payload, fixture.user_id
  );

  SELECT count(*) INTO expected
  FROM public.pos_product_variants variant
  CROSS JOIN public.pos_locations location
  WHERE variant.product_id = fixture.product_id
    AND location.brand_slug = fixture.brand_slug
    AND location.active = true;

  SELECT count(*) INTO actual
  FROM public.pos_inventory inventory
  JOIN public.pos_product_variants variant ON variant.id = inventory.variant_id
  JOIN public.pos_locations location ON location.id = inventory.location_id
  WHERE variant.product_id = fixture.product_id
    AND location.active = true;

  INSERT INTO product_variant_v1_results(test_name, passed, details)
  VALUES (
    'M none-to-direct inventory materialization',
    expected = actual,
    jsonb_build_object('expectedRows', expected, 'actualRows', actual)
  );
END;
$test_mode$;

SELECT
  test_name,
  passed,
  details
FROM product_variant_v1_results
ORDER BY
  passed ASC,
  test_name;

ROLLBACK;
