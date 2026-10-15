WITH checks AS (
  SELECT 1 AS test_no, 'product_code column exists' AS test_name,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'pos_products' AND column_name = 'product_code'
    ) AS passed,
    jsonb_build_object('nullable', NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'pos_products' AND column_name = 'product_code' AND is_nullable = 'NO'
    )) AS details
  UNION ALL
  SELECT 2, 'product_code unique brand index exists',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'pos_products_brand_product_code_uidx'),
    jsonb_build_object('index', 'pos_products_brand_product_code_uidx')
  UNION ALL
  SELECT 3, 'variant SKU and barcode indexes remain installed',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'pos_product_variants_brand_sku_uidx')
      AND EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'pos_product_variants_brand_barcode_uidx'),
    jsonb_build_object('sku_index', 'pos_product_variants_brand_sku_uidx', 'barcode_index', 'pos_product_variants_brand_barcode_uidx')
  UNION ALL
  SELECT 4, 'extended product RPCs exist',
    EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'pos_create_product_v2' AND pg_get_function_arguments(p.oid) LIKE '%p_product_code%'
    )
    AND EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'pos_update_product_v2' AND pg_get_function_arguments(p.oid) LIKE '%p_product_code%'
    ),
    jsonb_build_object('create_rpc', 'pos_create_product_v2', 'update_rpc', 'pos_update_product_v2')
)
SELECT test_no, test_name, passed, details FROM checks ORDER BY test_no;
