BEGIN;

CREATE OR REPLACE FUNCTION public.pos_get_reports_export_products_v1(
  p_brand_slug text,
  p_date_from timestamptz,
  p_date_to timestamptz,
  p_location_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM 1 FROM public.pos_analytics_assert_scope(
    p_brand_slug, p_date_from, p_date_to, p_location_id
  );

  WITH line_rows AS (
    SELECT
      i.product_id,
      i.variant_id,
      max(i.product_name) AS product_name,
      max(i.variant_name) AS variant_name,
      max(i.sku) AS sku,
      sum(i.quantity) AS units_sold,
      sum(i.line_total) AS net_sales,
      sum(i.unit_cost * i.quantity) AS historical_cogs,
      sum(i.tax_amount) AS tax_amount
    FROM public.pos_sales s
    JOIN public.pos_sale_items i ON i.sale_id = s.id
    WHERE s.brand_slug = p_brand_slug
      AND s.status = 'completed'
      AND s.sold_at >= p_date_from
      AND s.sold_at < p_date_to
      AND (p_location_id IS NULL OR s.location_id = p_location_id)
    GROUP BY i.product_id, i.variant_id
  ), rows AS (
    SELECT
      lr.product_id,
      prod.product_code,
      lr.product_name,
      lr.variant_id,
      lr.variant_name,
      lr.sku,
      variant.attributes AS current_attributes,
      lr.units_sold,
      lr.net_sales,
      lr.historical_cogs,
      lr.net_sales - lr.tax_amount - lr.historical_cogs AS gross_margin,
      CASE
        WHEN lr.net_sales - lr.tax_amount > 0
          THEN round((lr.net_sales - lr.tax_amount - lr.historical_cogs) * 100 / (lr.net_sales - lr.tax_amount), 2)
        ELSE NULL
      END AS gross_margin_pct,
      COALESCE((
        SELECT sum(inv.quantity - inv.reserved_quantity)
        FROM public.pos_inventory inv
        WHERE inv.brand_slug = p_brand_slug
          AND inv.variant_id = lr.variant_id
          AND (p_location_id IS NULL OR inv.location_id = p_location_id)
      ), 0) AS current_stock,
      CASE WHEN p_location_id IS NULL THEN NULL ELSE location.name END AS location_name
    FROM line_rows lr
    JOIN public.pos_products prod
      ON prod.id = lr.product_id
      AND prod.brand_slug = p_brand_slug
    JOIN public.pos_product_variants variant
      ON variant.id = lr.variant_id
      AND variant.product_id = lr.product_id
      AND variant.brand_slug = p_brand_slug
    LEFT JOIN public.pos_locations location
      ON location.id = p_location_id
      AND location.brand_slug = p_brand_slug
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'productCode', product_code,
    'productName', product_name,
    'variantName', variant_name,
    'sku', sku,
    'currentAttributes', current_attributes,
    'unitsSold', units_sold,
    'netSales', net_sales,
    'historicalCogs', historical_cogs,
    'grossMargin', gross_margin,
    'grossMarginPct', gross_margin_pct,
    'currentStock', current_stock,
    'locationName', location_name
  ) ORDER BY net_sales DESC, product_name, variant_name, variant_id), '[]'::jsonb)
  INTO v_result
  FROM rows;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pos_get_reports_export_inventory_v1(
  p_brand_slug text,
  p_date_from timestamptz,
  p_date_to timestamptz,
  p_location_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_result jsonb;
  v_days numeric;
BEGIN
  PERFORM 1 FROM public.pos_analytics_assert_scope(
    p_brand_slug, p_date_from, p_date_to, p_location_id
  );
  v_days := GREATEST(extract(epoch FROM (p_date_to - p_date_from)) / 86400, 1);

  WITH sold AS (
    SELECT i.variant_id, sum(i.quantity) AS units
    FROM public.pos_sales s
    JOIN public.pos_sale_items i ON i.sale_id = s.id
    WHERE s.brand_slug = p_brand_slug
      AND s.status = 'completed'
      AND s.sold_at >= p_date_from
      AND s.sold_at < p_date_to
      AND (p_location_id IS NULL OR s.location_id = p_location_id)
    GROUP BY i.variant_id
  ), rows AS (
    SELECT
      prod.product_code,
      prod.name AS product_name,
      variant.name AS variant_name,
      variant.sku,
      location.name AS location_name,
      inv.quantity - inv.reserved_quantity AS available_quantity,
      inv.minimum_quantity AS minimum_quantity,
      variant.cost AS current_unit_cost,
      round((inv.quantity - inv.reserved_quantity) * variant.cost, 2) AS estimated_inventory_value,
      round(COALESCE(sold.units, 0) / v_days, 3) AS average_units_per_day,
      CASE
        WHEN COALESCE(sold.units, 0) = 0 THEN NULL
        ELSE round((inv.quantity - inv.reserved_quantity) / (sold.units / v_days), 2)
      END AS estimated_days_of_stock,
      CASE
        WHEN inv.quantity - inv.reserved_quantity <= 0 THEN 'out_of_stock'
        WHEN inv.quantity - inv.reserved_quantity <= inv.minimum_quantity THEN 'low_stock'
        ELSE 'normal'
      END AS status
    FROM public.pos_inventory inv
    JOIN public.pos_product_variants variant
      ON variant.id = inv.variant_id
      AND variant.brand_slug = p_brand_slug
    JOIN public.pos_products prod
      ON prod.id = variant.product_id
      AND prod.brand_slug = p_brand_slug
    JOIN public.pos_locations location
      ON location.id = inv.location_id
      AND location.brand_slug = p_brand_slug
    LEFT JOIN sold ON sold.variant_id = variant.id
    WHERE inv.brand_slug = p_brand_slug
      AND (p_location_id IS NULL OR inv.location_id = p_location_id)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'productCode', product_code,
    'productName', product_name,
    'variantName', variant_name,
    'sku', sku,
    'location', location_name,
    'availableQuantity', available_quantity,
    'minimumQuantity', minimum_quantity,
    'currentUnitCost', current_unit_cost,
    'estimatedInventoryValue', estimated_inventory_value,
    'averageUnitsPerDay', average_units_per_day,
    'estimatedDaysOfStock', estimated_days_of_stock,
    'status', status
  ) ORDER BY product_name, variant_name, location_name), '[]'::jsonb)
  INTO v_result
  FROM rows;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.pos_get_reports_export_products_v1(text, timestamptz, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_get_reports_export_products_v1(text, timestamptz, timestamptz, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.pos_get_reports_export_inventory_v1(text, timestamptz, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_get_reports_export_inventory_v1(text, timestamptz, timestamptz, uuid)
  TO service_role;

COMMIT;
