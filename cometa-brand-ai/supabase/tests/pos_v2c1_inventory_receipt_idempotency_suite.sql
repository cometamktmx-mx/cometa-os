-- COMETA POS V2C.1 - SUITE TRANSACCIONAL
BEGIN;

CREATE TEMP TABLE v2c1_fixture ON COMMIT DROP AS
SELECT
  product.brand_id,
  product.brand_slug,
  product.id AS product_id,
  product.name AS product_name_before,
  product.category_id AS category_id_before,
  product.active AS product_active_before,
  variant.id AS variant_id,
  variant.unit_code,
  location.id AS location_id,
  sale.sold_by AS user_id,
  gen_random_uuid() AS operation_key,
  gen_random_uuid() AS second_operation_key,
  inventory.quantity AS quantity_before,
  variant.price AS price_before,
  variant.cost AS cost_before,
  subscription.plan_code AS plan_before,
  subscription.contracted_price AS contracted_price_before
FROM public.pos_products product
JOIN public.pos_product_variants variant
  ON variant.product_id = product.id AND variant.brand_slug = product.brand_slug
JOIN public.pos_locations location
  ON location.brand_slug = product.brand_slug AND location.active = true
JOIN public.pos_inventory inventory
  ON inventory.variant_id = variant.id AND inventory.location_id = location.id
JOIN public.pos_subscriptions subscription ON subscription.brand_slug = product.brand_slug
JOIN LATERAL (
  SELECT sold_by FROM public.pos_sales
  WHERE brand_slug = product.brand_slug AND sold_by IS NOT NULL
  ORDER BY sold_at DESC LIMIT 1
) sale ON true
WHERE product.active = true AND product.track_inventory = true
  AND product.inventory_mode = 'direct' AND variant.active = true
ORDER BY product.created_at, variant.created_at, location.created_at
LIMIT 1;

DO $fixture$
BEGIN
  IF (SELECT count(*) FROM v2c1_fixture) <> 1 THEN
    RAISE EXCEPTION 'PRECONDITION: an active direct-inventory fixture is required.';
  END IF;
END;
$fixture$;

CREATE TEMP TABLE v2c1_calls (
  call_name text PRIMARY KEY,
  response jsonb NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE v2c1_snapshots (
  stage text PRIMARY KEY,
  stock numeric NOT NULL,
  receipt_count bigint NOT NULL,
  movement_count bigint NOT NULL,
  item_count bigint NOT NULL,
  input_unit_code text NULL,
  base_unit_code text NULL,
  quantity_mode text NULL,
  conversion_factor numeric NULL
) ON COMMIT DROP;

CREATE TEMP TABLE v2c1_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
) ON COMMIT DROP;

CREATE TEMP TABLE v2c1_conflicts (
  conflict_name text PRIMARY KEY,
  rejected boolean NOT NULL
) ON COMMIT DROP;

-- Snapshot A: baseline anterior a cualquier recepción V2C.1.
INSERT INTO v2c1_snapshots(stage, stock, receipt_count, movement_count, item_count)
SELECT 'A', inventory.quantity,
  (SELECT count(*) FROM public.pos_inventory_receipts receipt
    WHERE receipt.brand_slug = fixture.brand_slug
      AND receipt.idempotency_key IN (fixture.operation_key, fixture.second_operation_key)),
  (SELECT count(*) FROM public.pos_inventory_movements movement
    JOIN public.pos_inventory_receipts receipt ON receipt.id = movement.reference_id
    WHERE movement.reference_type = 'inventory_receipt'
      AND receipt.brand_slug = fixture.brand_slug
      AND receipt.idempotency_key IN (fixture.operation_key, fixture.second_operation_key)),
  (SELECT count(*) FROM public.pos_inventory_receipt_items receipt_item
    JOIN public.pos_inventory_receipts receipt ON receipt.id = receipt_item.receipt_id
    WHERE receipt.brand_slug = fixture.brand_slug
      AND receipt.idempotency_key IN (fixture.operation_key, fixture.second_operation_key))
FROM v2c1_fixture fixture
JOIN public.pos_inventory inventory
  ON inventory.variant_id = fixture.variant_id AND inventory.location_id = fixture.location_id;

-- La mutación y su verificación se ejecutan en statements diferentes.
INSERT INTO v2c1_calls(call_name, response)
SELECT 'first', public.pos_complete_inventory_receipt_v2(
    brand_id, brand_slug, location_id, 'V2C1 Supplier', 'SAME-REFERENCE', 'Idempotency suite',
    jsonb_build_array(jsonb_build_object(
      'variant_id', variant_id, 'purchase_presentation_id', null,
      'scanned_code', 'V2C1-SCAN', 'quantity_mode', 'direct',
      'input_quantity', 3, 'input_unit_code', unit_code,
      'conversion_factor', 1, 'total_cost', 30
    )), user_id, operation_key
  )
FROM v2c1_fixture;

INSERT INTO v2c1_snapshots
SELECT 'B', inventory.quantity, counts.receipts, counts.movements, counts.items,
  receipt_item.input_unit_code, receipt_item.base_unit_code,
  receipt_item.quantity_mode, receipt_item.conversion_factor
FROM v2c1_fixture fixture
JOIN public.pos_inventory inventory
  ON inventory.variant_id = fixture.variant_id AND inventory.location_id = fixture.location_id
JOIN v2c1_calls call ON call.call_name = 'first'
LEFT JOIN public.pos_inventory_receipt_items receipt_item
  ON receipt_item.receipt_id = (call.response #>> '{receipt,id}')::uuid
CROSS JOIN LATERAL (
  SELECT
    (SELECT count(*) FROM public.pos_inventory_receipts receipt WHERE receipt.brand_slug=fixture.brand_slug AND receipt.idempotency_key IN (fixture.operation_key,fixture.second_operation_key)) AS receipts,
    (SELECT count(*) FROM public.pos_inventory_movements movement JOIN public.pos_inventory_receipts receipt ON receipt.id=movement.reference_id WHERE movement.reference_type='inventory_receipt' AND receipt.brand_slug=fixture.brand_slug AND receipt.idempotency_key IN (fixture.operation_key,fixture.second_operation_key)) AS movements,
    (SELECT count(*) FROM public.pos_inventory_receipt_items item JOIN public.pos_inventory_receipts receipt ON receipt.id=item.receipt_id WHERE receipt.brand_slug=fixture.brand_slug AND receipt.idempotency_key IN (fixture.operation_key,fixture.second_operation_key)) AS items
) counts;

INSERT INTO v2c1_calls(call_name, response)
SELECT 'replay', public.pos_complete_inventory_receipt_v2(
    brand_id, brand_slug, location_id, 'V2C1 Supplier', 'SAME-REFERENCE', 'Idempotency suite',
    jsonb_build_array(jsonb_build_object(
      'total_cost', 30, 'conversion_factor', 1, 'input_unit_code', unit_code,
      'input_quantity', 3, 'quantity_mode', 'direct', 'scanned_code', 'V2C1-SCAN',
      'purchase_presentation_id', null, 'variant_id', variant_id
    )), user_id, operation_key
  )
FROM v2c1_fixture;

INSERT INTO v2c1_snapshots
SELECT 'C', inventory.quantity, counts.receipts, counts.movements, counts.items,
  receipt_item.input_unit_code, receipt_item.base_unit_code,
  receipt_item.quantity_mode, receipt_item.conversion_factor
FROM v2c1_fixture fixture
JOIN public.pos_inventory inventory ON inventory.variant_id=fixture.variant_id AND inventory.location_id=fixture.location_id
JOIN v2c1_calls call ON call.call_name='replay'
LEFT JOIN public.pos_inventory_receipt_items receipt_item ON receipt_item.receipt_id=(call.response #>> '{receipt,id}')::uuid
CROSS JOIN LATERAL (
  SELECT
    (SELECT count(*) FROM public.pos_inventory_receipts receipt WHERE receipt.brand_slug=fixture.brand_slug AND receipt.idempotency_key IN (fixture.operation_key,fixture.second_operation_key)) AS receipts,
    (SELECT count(*) FROM public.pos_inventory_movements movement JOIN public.pos_inventory_receipts receipt ON receipt.id=movement.reference_id WHERE movement.reference_type='inventory_receipt' AND receipt.brand_slug=fixture.brand_slug AND receipt.idempotency_key IN (fixture.operation_key,fixture.second_operation_key)) AS movements,
    (SELECT count(*) FROM public.pos_inventory_receipt_items item JOIN public.pos_inventory_receipts receipt ON receipt.id=item.receipt_id WHERE receipt.brand_slug=fixture.brand_slug AND receipt.idempotency_key IN (fixture.operation_key,fixture.second_operation_key)) AS items
) counts;

DO $conflicts$
DECLARE f v2c1_fixture%ROWTYPE; alt_variant uuid;
BEGIN
  SELECT * INTO f FROM v2c1_fixture;
  SELECT variant.id INTO alt_variant FROM public.pos_product_variants variant
  JOIN public.pos_products product ON product.id = variant.product_id
  WHERE variant.brand_slug = f.brand_slug AND variant.active AND product.active
    AND variant.id <> f.variant_id ORDER BY (product.id <> f.product_id) DESC LIMIT 1;

  BEGIN
    PERFORM public.pos_complete_inventory_receipt_v2(
      f.brand_id, f.brand_slug, f.location_id, 'V2C1 Supplier', 'SAME-REFERENCE', 'Idempotency suite',
      jsonb_build_array(jsonb_build_object('variant_id', f.variant_id, 'purchase_presentation_id', null,
        'scanned_code', 'V2C1-SCAN', 'quantity_mode', 'direct', 'input_quantity', 4,
        'input_unit_code', f.unit_code, 'conversion_factor', 1, 'total_cost', 30)), f.user_id, f.operation_key);
    INSERT INTO v2c1_conflicts VALUES ('quantity', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO v2c1_conflicts VALUES ('quantity', SQLERRM LIKE '%POS_INVENTORY_IDEMPOTENCY_CONFLICT%');
  END;

  BEGIN
    PERFORM public.pos_complete_inventory_receipt_v2(
      f.brand_id, f.brand_slug, f.location_id, 'V2C1 Supplier', 'SAME-REFERENCE', 'Idempotency suite',
      jsonb_build_array(jsonb_build_object('variant_id', COALESCE(alt_variant, gen_random_uuid()),
        'purchase_presentation_id', null, 'scanned_code', 'V2C1-SCAN', 'quantity_mode', 'direct',
        'input_quantity', 3, 'input_unit_code', f.unit_code, 'conversion_factor', 1, 'total_cost', 30)),
      f.user_id, f.operation_key);
    INSERT INTO v2c1_conflicts VALUES ('variant_product', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO v2c1_conflicts VALUES ('variant_product', SQLERRM LIKE '%POS_INVENTORY_IDEMPOTENCY_CONFLICT%');
  END;
END;
$conflicts$;

INSERT INTO v2c1_calls(call_name, response)
SELECT 'new_key', public.pos_complete_inventory_receipt_v2(
    brand_id, brand_slug, location_id, 'V2C1 Supplier', 'SAME-REFERENCE', 'Idempotency suite',
    jsonb_build_array(jsonb_build_object('variant_id', variant_id, 'purchase_presentation_id', null,
      'scanned_code', 'V2C1-SCAN', 'quantity_mode', 'direct', 'input_quantity', 3,
      'input_unit_code', unit_code, 'conversion_factor', 1, 'total_cost', 30)),
    user_id, second_operation_key
  )
FROM v2c1_fixture;

INSERT INTO v2c1_snapshots
SELECT 'D', inventory.quantity, counts.receipts, counts.movements, counts.items,
  receipt_item.input_unit_code, receipt_item.base_unit_code,
  receipt_item.quantity_mode, receipt_item.conversion_factor
FROM v2c1_fixture fixture
JOIN public.pos_inventory inventory ON inventory.variant_id=fixture.variant_id AND inventory.location_id=fixture.location_id
JOIN v2c1_calls call ON call.call_name='new_key'
LEFT JOIN public.pos_inventory_receipt_items receipt_item ON receipt_item.receipt_id=(call.response #>> '{receipt,id}')::uuid
CROSS JOIN LATERAL (
  SELECT
    (SELECT count(*) FROM public.pos_inventory_receipts receipt WHERE receipt.brand_slug=fixture.brand_slug AND receipt.idempotency_key IN (fixture.operation_key,fixture.second_operation_key)) AS receipts,
    (SELECT count(*) FROM public.pos_inventory_movements movement JOIN public.pos_inventory_receipts receipt ON receipt.id=movement.reference_id WHERE movement.reference_type='inventory_receipt' AND receipt.brand_slug=fixture.brand_slug AND receipt.idempotency_key IN (fixture.operation_key,fixture.second_operation_key)) AS movements,
    (SELECT count(*) FROM public.pos_inventory_receipt_items item JOIN public.pos_inventory_receipts receipt ON receipt.id=item.receipt_id WHERE receipt.brand_slug=fixture.brand_slug AND receipt.idempotency_key IN (fixture.operation_key,fixture.second_operation_key)) AS items
) counts;

WITH f AS (SELECT * FROM v2c1_fixture),
first AS (SELECT * FROM v2c1_calls WHERE call_name='first'),
replay AS (SELECT * FROM v2c1_calls WHERE call_name='replay'),
second AS (SELECT * FROM v2c1_calls WHERE call_name='new_key'),
a AS (SELECT * FROM v2c1_snapshots WHERE stage='A'),
b AS (SELECT * FROM v2c1_snapshots WHERE stage='B'),
c AS (SELECT * FROM v2c1_snapshots WHERE stage='C'),
d AS (SELECT * FROM v2c1_snapshots WHERE stage='D')
INSERT INTO v2c1_results(test_name, passed, details)
SELECT test_name, passed, details
FROM f, first, replay, second, a, b, c, d, LATERAL (VALUES
  ('01 valid receipt works', first.response ? 'receipt', jsonb_build_object('response',first.response)),
  ('02 one keyed header', b.receipt_count = a.receipt_count + 1, jsonb_build_object('before',a.receipt_count,'afterFirst',b.receipt_count,'expected',a.receipt_count+1)),
  ('03 stock increases N', b.stock IS NOT DISTINCT FROM a.stock + 3, jsonb_build_object('before',a.stock,'received',3,'afterFirst',b.stock,'expected',a.stock+3)),
  ('04 movement created', b.movement_count = a.movement_count + 1, jsonb_build_object('before',a.movement_count,'afterFirst',b.movement_count,'expected',a.movement_count+1)),
  ('05 receipt item created', b.item_count = a.item_count + 1, jsonb_build_object('before',a.item_count,'afterFirst',b.item_count,'expected',a.item_count+1)),
  ('06 replay succeeds', replay.response ? 'receipt', jsonb_build_object('response',replay.response)),
  ('07 replay header remains one', c.receipt_count = b.receipt_count, jsonb_build_object('afterFirst',b.receipt_count,'afterReplay',c.receipt_count)),
  ('08 replay stock unchanged', c.stock IS NOT DISTINCT FROM b.stock, jsonb_build_object('afterFirst',b.stock,'afterReplay',c.stock,'expected',b.stock)),
  ('09 replay movement unchanged', c.movement_count = b.movement_count, jsonb_build_object('afterFirst',b.movement_count,'afterReplay',c.movement_count,'expected',b.movement_count)),
  ('10 replay item unchanged', c.item_count = b.item_count, jsonb_build_object('afterFirst',b.item_count,'afterReplay',c.item_count,'expected',b.item_count)),
  ('11 replay same receipt id', first.response #>> '{receipt,id}' IS NOT NULL AND replay.response #>> '{receipt,id}' IS NOT DISTINCT FROM first.response #>> '{receipt,id}', jsonb_build_object('first',first.response #>> '{receipt,id}','replay',replay.response #>> '{receipt,id}')),
  ('12 replay same receipt number', first.response #>> '{receipt,receipt_number}' IS NOT NULL AND replay.response #>> '{receipt,receipt_number}' IS NOT DISTINCT FROM first.response #>> '{receipt,receipt_number}', jsonb_build_object('first',first.response #>> '{receipt,receipt_number}','replay',replay.response #>> '{receipt,receipt_number}')),
  ('13 quantity conflict', (SELECT rejected FROM v2c1_conflicts WHERE conflict_name='quantity') IS TRUE, '{}'::jsonb),
  ('14 variant conflict', (SELECT rejected FROM v2c1_conflicts WHERE conflict_name='variant_product') IS TRUE, '{}'::jsonb),
  ('15 product semantic conflict', (SELECT rejected FROM v2c1_conflicts WHERE conflict_name='variant_product') IS TRUE, '{}'::jsonb),
  ('16 new key creates second receipt', d.receipt_count = c.receipt_count + 1, jsonb_build_object('afterReplay',c.receipt_count,'afterNewKey',d.receipt_count,'expected',c.receipt_count+1)),
  ('17 new key increases stock again', d.stock IS NOT DISTINCT FROM c.stock + 3, jsonb_build_object('afterReplay',c.stock,'received',3,'afterNewKey',d.stock,'expected',c.stock+3)),
  ('18 new key creates movement', d.movement_count = c.movement_count + 1, jsonb_build_object('afterReplay',c.movement_count,'afterNewKey',d.movement_count,'expected',c.movement_count+1)),
  ('19 same supplier reference is allowed', second.response #>> '{receipt,supplier_reference}' IS NOT DISTINCT FROM 'SAME-REFERENCE', jsonb_build_object('actual',second.response #>> '{receipt,supplier_reference}','expected','SAME-REFERENCE')),
  ('20 tenant key scope encoded', EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='pos_inventory_receipts_brand_idempotency_uidx' AND indexdef ~* '\(brand_slug, idempotency_key\)'), '{}'::jsonb),
  ('21 null key rejected', true, '{}'::jsonb),
  ('22 completed status preserved', first.response #>> '{receipt,status}' IS NOT DISTINCT FROM 'completed', jsonb_build_object('actual',first.response #>> '{receipt,status}','expected','completed')),
  ('23 unit preserved', ROW(b.input_unit_code,b.base_unit_code,b.quantity_mode,b.conversion_factor) IS NOT DISTINCT FROM ROW(f.unit_code,f.unit_code,'direct'::text,1::numeric), jsonb_build_object('persisted',jsonb_build_object('inputUnitCode',b.input_unit_code,'baseUnitCode',b.base_unit_code,'quantityMode',b.quantity_mode,'conversionFactor',b.conversion_factor),'expected',jsonb_build_object('inputUnitCode',f.unit_code,'baseUnitCode',f.unit_code,'quantityMode','direct','conversionFactor',1))),
  ('24 totals preserved', (first.response #>> '{receipt,total_base_quantity}')::numeric IS NOT DISTINCT FROM 3::numeric AND (first.response #>> '{receipt,total_cost}')::numeric IS NOT DISTINCT FROM 30::numeric, jsonb_build_object('baseQuantity',first.response #>> '{receipt,total_base_quantity}','totalCost',first.response #>> '{receipt,total_cost}')),
  ('25 v1 preserved', to_regprocedure('public.pos_complete_inventory_receipt_v1(text,text,uuid,text,text,text,jsonb,uuid)') IS NOT NULL, '{}'::jsonb),
  ('26 product pricing untouched', EXISTS (SELECT 1 FROM public.pos_product_variants variant JOIN public.pos_products product ON product.id=variant.product_id WHERE variant.id=f.variant_id AND variant.price IS NOT DISTINCT FROM f.price_before AND variant.product_id=f.product_id AND product.name IS NOT DISTINCT FROM f.product_name_before AND product.category_id IS NOT DISTINCT FROM f.category_id_before AND product.active IS NOT DISTINCT FROM f.product_active_before), jsonb_build_object('salePriceBefore',f.price_before,'costBefore',f.cost_before,'costAfter',(SELECT variant.cost FROM public.pos_product_variants variant WHERE variant.id=f.variant_id),'costMayChangeByWeightedAverage',true)),
  ('27 plan pricing untouched', EXISTS (SELECT 1 FROM public.pos_subscriptions s WHERE s.brand_slug=f.brand_slug AND s.plan_code=f.plan_before AND s.contracted_price IS NOT DISTINCT FROM f.contracted_price_before), '{}'::jsonb)
) AS tests(test_name, passed, details);

-- Explicit null-key behavior, replacing the provisional result above.
DO $null_key$
DECLARE f v2c1_fixture%ROWTYPE; rejected boolean := false;
BEGIN
  SELECT * INTO f FROM v2c1_fixture;
  BEGIN
    PERFORM public.pos_complete_inventory_receipt_v2(f.brand_id, f.brand_slug, f.location_id,
      null, null, null, '[]'::jsonb, f.user_id, null);
  EXCEPTION WHEN OTHERS THEN
    rejected := SQLERRM LIKE '%POS_INVENTORY_IDEMPOTENCY_KEY_REQUIRED%';
  END;
  UPDATE v2c1_results SET passed = rejected WHERE test_name = '21 null key rejected';
END;
$null_key$;

WITH summary AS (
  SELECT count(*) AS result_count, count(*) FILTER (WHERE passed) AS passed_count,
    count(*) FILTER (WHERE NOT passed) AS failed_count, bool_and(passed) AS all_checks_passed
  FROM v2c1_results
)
SELECT 'tests' AS diagnostic_type, test_name, passed, details FROM v2c1_results
UNION ALL
SELECT 'SUMMARY', 'all_checks_passed', all_checks_passed,
  jsonb_build_object('exactly_27_results', result_count = 27, 'passed_count', passed_count,
    'failed_count', failed_count, 'all_checks_passed', all_checks_passed)
FROM summary
ORDER BY diagnostic_type, test_name;

ROLLBACK;
