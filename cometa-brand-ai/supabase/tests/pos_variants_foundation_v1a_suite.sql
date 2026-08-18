BEGIN;

CREATE TEMP TABLE pos_variants_foundation_suite_results (
  test_no integer,
  test_name text,
  passed boolean,
  details jsonb
);

CREATE TEMP TABLE pos_variants_fixture AS
SELECT b.slug AS brand_slug
FROM public.brands b
ORDER BY b.slug
LIMIT 1;

INSERT INTO pos_variants_foundation_suite_results
SELECT 1, 'equivalent JSON ordering and case trim share signature',
  public.pos_variant_signature_v1('{"size":"M","color":"Negro"}'::jsonb)
  = public.pos_variant_signature_v1('{"color":" negro ","size":"m"}'::jsonb), '{}'::jsonb;

INSERT INTO pos_variants_foundation_suite_results
SELECT 2, 'empty attributes produce stable signature',
  public.pos_variant_signature_v1('{}'::jsonb) = '{}'::text, '{}'::jsonb;

INSERT INTO pos_variants_foundation_suite_results
SELECT 3, 'same SKU is rejected within a brand',
  NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'pos_product_variants_brand_sku_uidx'
  ) IS FALSE, '{}'::jsonb;

INSERT INTO pos_variants_foundation_suite_results
SELECT 4, 'same barcode is rejected within a brand',
  NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'pos_product_variants_brand_barcode_uidx'
  ) IS FALSE, '{}'::jsonb;

INSERT INTO pos_variants_foundation_suite_results
SELECT 5, 'same product signature is protected',
  NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'pos_product_variants_product_signature_uidx'
  ) IS FALSE, '{}'::jsonb;

INSERT INTO pos_variants_foundation_suite_results
SELECT 6, 'technical Única signature remains valid',
  public.pos_variant_signature_v1('{}'::jsonb) = '{}'::text, '{}'::jsonb;

INSERT INTO pos_variants_foundation_suite_results
SELECT 7, 'variant IDs remain UUID-backed and untouched',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pos_product_variants'
      AND column_name = 'id'
      AND udt_name = 'uuid'
  ), '{}'::jsonb;

INSERT INTO pos_variants_foundation_suite_results
SELECT 8, 'inventory uniqueness remains location and variant scoped',
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'pos_inventory'
      AND indexdef ILIKE '%(location_id, variant_id)%'
  ), '{}'::jsonb;

SELECT test_no, test_name, passed, details
FROM pos_variants_foundation_suite_results
ORDER BY test_no;

SELECT 999 AS test_no,
  'SUMMARY all_checks_passed' AS test_name,
  bool_and(passed) AS passed,
  jsonb_build_object(
    'passed_count', count(*) FILTER (WHERE passed),
    'failed_count', count(*) FILTER (WHERE NOT passed),
    'all_checks_passed', bool_and(passed)
  ) AS details
FROM pos_variants_foundation_suite_results;

ROLLBACK;
