BEGIN;

CREATE TEMP TABLE pos_variants_foundation_results (
  test_no integer,
  test_name text,
  passed boolean,
  details jsonb
);

INSERT INTO pos_variants_foundation_results
SELECT 1, 'variant_signature column exists',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pos_product_variants'
      AND column_name = 'variant_signature'
      AND is_nullable = 'NO'
  ), '{}'::jsonb;

INSERT INTO pos_variants_foundation_results
SELECT 2, 'normalizer and signature functions exist',
  to_regprocedure('public.pos_normalize_variant_attributes_v1(jsonb)') IS NOT NULL
  AND to_regprocedure('public.pos_variant_signature_v1(jsonb)') IS NOT NULL
  AND to_regprocedure('public.pos_product_variants_set_signature_v1()') IS NOT NULL,
  '{}'::jsonb;

INSERT INTO pos_variants_foundation_results
SELECT 3, 'signature trigger exists',
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.pos_product_variants'::regclass
      AND tgname = 'pos_product_variants_signature_v1'
      AND NOT tgisinternal
  ), '{}'::jsonb;

INSERT INTO pos_variants_foundation_results
SELECT 4, 'product signature unique index exists',
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'pos_product_variants'
      AND indexname = 'pos_product_variants_product_signature_uidx'
  ), '{}'::jsonb;

INSERT INTO pos_variants_foundation_results
SELECT 5, 'brand SKU and barcode unique indexes exist',
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'pos_product_variants' AND indexname = 'pos_product_variants_brand_sku_uidx')
  AND EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'pos_product_variants' AND indexname = 'pos_product_variants_brand_barcode_uidx'),
  '{}'::jsonb;

INSERT INTO pos_variants_foundation_results
SELECT 6, 'inventory authority remains location and variant unique',
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'pos_inventory'
      AND indexdef ILIKE '%(location_id, variant_id)%'
  ), '{}'::jsonb;

INSERT INTO pos_variants_foundation_results
SELECT 7, 'no duplicate signatures remain',
  NOT EXISTS (
    SELECT 1 FROM public.pos_product_variants
    GROUP BY product_id, variant_signature
    HAVING count(*) > 1
  ), '{}'::jsonb;

SELECT test_no, test_name, passed, details
FROM pos_variants_foundation_results
ORDER BY test_no;

SELECT 999 AS test_no,
  'SUMMARY all_checks_passed' AS test_name,
  bool_and(passed) AS passed,
  jsonb_build_object(
    'passed_count', count(*) FILTER (WHERE passed),
    'failed_count', count(*) FILTER (WHERE NOT passed),
    'all_checks_passed', bool_and(passed)
  ) AS details
FROM pos_variants_foundation_results;

ROLLBACK;
