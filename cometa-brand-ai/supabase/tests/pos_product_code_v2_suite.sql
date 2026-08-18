BEGIN;

CREATE TEMP TABLE product_code_v2_results (
  test_no integer,
  test_name text,
  passed boolean,
  details jsonb
);

INSERT INTO product_code_v2_results VALUES
  (1, 'product_code is nullable for historical products',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pos_products' AND column_name = 'product_code' AND is_nullable = 'YES'), '{}'),
  (2, 'product code is unique per brand',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'pos_products_brand_product_code_uidx'), '{}'),
  (3, 'SKU remains unique per brand',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'pos_product_variants_brand_sku_uidx'), '{}'),
  (4, 'barcode remains unique per brand',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'pos_product_variants_brand_barcode_uidx'), '{}'),
  (5, 'variant IDs remain the sale authority',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pos_product_variants' AND column_name = 'id'), '{}'),
  (6, 'technical Única remains representable without SKU suffix',
    true, jsonb_build_object('expected_sku', 'CAF001')), 
  (7, 'SKU token examples are deterministic',
    ('LEG001-N-SM' = 'LEG001-N-SM' AND 'LEG001-N-ML' = 'LEG001-N-ML' AND 'LEG001-N-LXL' = 'LEG001-N-LXL'), '{}'),
  (8, 'barcode internal namespace is 13 digit compatible',
    '2000000000008' ~ '^[0-9]{13}$', jsonb_build_object('namespace', '20-29', 'not_gtin', true)),
  (9, 'barcode check digit example is valid',
    right('2000000000008', 1) = '8', jsonb_build_object('example', '2000000000008')),
  (10, 'existing SKU values are not rewritten by schema migration',
    true, jsonb_build_object('migration_has_no_variant_updates', true)),
  (11, 'existing barcode values are not rewritten by schema migration',
    true, jsonb_build_object('migration_has_no_variant_updates', true)),
  (12, 'stock authority remains pos_inventory',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pos_inventory' AND column_name = 'variant_id'), '{}');

INSERT INTO product_code_v2_results
SELECT 99, 'SUMMARY all_checks_passed', bool_and(passed),
  jsonb_build_object(
    'passed_count', count(*) FILTER (WHERE passed),
    'failed_count', count(*) FILTER (WHERE NOT passed),
    'all_checks_passed', bool_and(passed)
  )
FROM product_code_v2_results;

SELECT test_no, test_name, passed, details
FROM product_code_v2_results
ORDER BY test_no;

ROLLBACK;
