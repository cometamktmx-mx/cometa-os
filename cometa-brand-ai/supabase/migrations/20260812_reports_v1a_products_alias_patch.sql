-- REPORTS V1A — PATCH pos_get_analytics_products camelCase aliases

BEGIN;

CREATE OR REPLACE FUNCTION public.pos_get_analytics_products(
 p_brand_slug text,p_date_from timestamptz,p_date_to timestamptz,p_location_id uuid DEFAULT NULL,
 p_limit integer DEFAULT 20,p_order_by text DEFAULT 'sales_total') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_result jsonb;
BEGIN
 PERFORM 1 FROM public.pos_analytics_assert_scope(p_brand_slug,p_date_from,p_date_to,p_location_id);
 IF p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'limit debe estar entre 1 y 100.'; END IF;
 IF p_order_by NOT IN('sales_total','units_sold','ticket_count') THEN RAISE EXCEPTION 'Orden de productos no permitido.'; END IF;
 WITH rows AS (SELECT i.product_id,i.product_name,i.variant_id,i.variant_name,i.sku,
   sum(i.quantity) units_sold,sum(i.line_total) sales_total,
   sum(i.discount_amount+i.loyalty_discount_amount) discount_total,count(DISTINCT i.sale_id) ticket_count,
   CASE WHEN sum(i.quantity)=0 THEN NULL ELSE round(sum(i.line_total)/sum(i.quantity),2) END average_unit_price
  FROM public.pos_sales s JOIN public.pos_sale_items i ON i.sale_id=s.id
  WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.sold_at>=p_date_from AND s.sold_at<p_date_to
   AND(p_location_id IS NULL OR s.location_id=p_location_id)
  GROUP BY i.product_id,i.product_name,i.variant_id,i.variant_name,i.sku), total AS (SELECT COALESCE(sum(sales_total),0) v FROM rows)
 SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.rank_value DESC,x."productName",x."variantName"),'[]') INTO v_result
 FROM (SELECT r.product_id "productId",r.product_name "productName",r.variant_id "variantId",r.variant_name "variantName",r.sku,
  r.units_sold "unitsSold",r.sales_total "salesTotal",r.discount_total "discountTotal",r.ticket_count "ticketCount",
  r.average_unit_price "averageUnitPrice",CASE WHEN t.v=0 THEN NULL ELSE round(r.sales_total*100/t.v,2) END "percentageOfSales",
  COALESCE((SELECT sum(inv.quantity) FROM public.pos_inventory inv WHERE inv.brand_slug=p_brand_slug AND inv.variant_id=r.variant_id AND(p_location_id IS NULL OR inv.location_id=p_location_id)),0) "currentStock",
  CASE p_order_by WHEN 'units_sold' THEN r.units_sold WHEN 'ticket_count' THEN r.ticket_count ELSE r.sales_total END rank_value
  FROM rows r CROSS JOIN total t ORDER BY rank_value DESC,r.product_name,r.variant_name LIMIT p_limit)x;
 RETURN v_result;
END $fn$;

REVOKE ALL ON FUNCTION public.pos_get_analytics_products(text,timestamptz,timestamptz,uuid,integer,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pos_get_analytics_products(text,timestamptz,timestamptz,uuid,integer,text)
  TO service_role;

COMMIT;
