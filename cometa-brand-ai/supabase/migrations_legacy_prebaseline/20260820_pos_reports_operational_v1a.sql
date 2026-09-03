BEGIN;

CREATE OR REPLACE FUNCTION public.pos_get_operational_report_products_v1(
  p_brand_slug text,
  p_date_from timestamptz,
  p_date_to timestamptz,
  p_location_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 200
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

  IF p_limit NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'El límite de productos no es válido.';
  END IF;

  WITH line_rows AS (
    SELECT
      i.product_id,
      max(i.product_name) AS product_name,
      i.variant_id,
      max(i.variant_name) AS variant_name,
      max(i.sku) AS sku,
      sum(i.quantity) AS units_sold,
      sum(i.line_total) AS revenue,
      sum(i.unit_cost * i.quantity) AS cogs,
      sum(i.tax_amount) AS tax_amount
    FROM public.pos_sales s
    JOIN public.pos_sale_items i ON i.sale_id = s.id
    WHERE s.brand_slug = p_brand_slug
      AND s.status = 'completed'
      AND s.sold_at >= p_date_from
      AND s.sold_at < p_date_to
      AND (p_location_id IS NULL OR s.location_id = p_location_id)
    GROUP BY i.product_id, i.variant_id
  ), variant_rows AS (
    SELECT
      lr.*,
      p.product_code,
      v.attributes,
      COALESCE((
        SELECT sum(inv.quantity - inv.reserved_quantity)
        FROM public.pos_inventory inv
        WHERE inv.brand_slug = p_brand_slug
          AND inv.variant_id = lr.variant_id
          AND (p_location_id IS NULL OR inv.location_id = p_location_id)
      ), 0) AS current_stock
    FROM line_rows lr
    JOIN public.pos_products p
      ON p.id = lr.product_id
      AND p.brand_slug = p_brand_slug
    JOIN public.pos_product_variants v
      ON v.id = lr.variant_id
      AND v.product_id = lr.product_id
      AND v.brand_slug = p_brand_slug
  ), product_rows AS (
    SELECT
      vr.product_id,
      max(vr.product_code) AS product_code,
      max(vr.product_name) AS product_name,
      sum(vr.units_sold) AS units_sold,
      sum(vr.revenue) AS revenue,
      sum(vr.cogs) AS cogs,
      sum(vr.tax_amount) AS tax_amount,
      sum(vr.current_stock) AS current_stock,
      jsonb_agg(
        jsonb_build_object(
          'variantId', vr.variant_id,
          'variantName', vr.variant_name,
          'sku', vr.sku,
          'attributes', vr.attributes,
          'attributesAreCurrent', true,
          'unitsSold', vr.units_sold,
          'revenue', vr.revenue,
          'cogs', vr.cogs,
          'grossProfit', vr.revenue - vr.tax_amount - vr.cogs,
          'grossMarginPercent', CASE
            WHEN vr.revenue - vr.tax_amount > 0
              THEN round((vr.revenue - vr.tax_amount - vr.cogs) * 100 / (vr.revenue - vr.tax_amount), 2)
            ELSE NULL
          END,
          'currentStock', vr.current_stock
        ) ORDER BY vr.variant_name, vr.variant_id
      ) AS variants
    FROM variant_rows vr
    GROUP BY vr.product_id
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'productId', x.product_id,
      'productCode', x.product_code,
      'productName', x.product_name,
      'unitsSold', x.units_sold,
      'revenue', x.revenue,
      'cogs', x.cogs,
      'grossProfit', x.revenue - x.tax_amount - x.cogs,
      'grossMarginPercent', CASE
        WHEN x.revenue - x.tax_amount > 0
          THEN round((x.revenue - x.tax_amount - x.cogs) * 100 / (x.revenue - x.tax_amount), 2)
        ELSE NULL
      END,
      'currentStock', x.current_stock,
      'variants', x.variants,
      'productCodeIsCurrentMetadata', true
    ) ORDER BY x.revenue DESC, x.product_name, x.product_id
  ), '[]'::jsonb) INTO v_result
  FROM (
    SELECT * FROM product_rows
    ORDER BY revenue DESC, product_name, product_id
    LIMIT p_limit
  ) x;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.pos_get_operational_report_products_v1(text, timestamptz, timestamptz, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_get_operational_report_products_v1(text, timestamptz, timestamptz, uuid, integer)
  TO service_role;

COMMIT;
