-- COMETA POS — REPORTS V1A / ANALYTICS FOUNDATION
-- Facts are computed from operational tables. Snapshots are immutable analytical documents.

BEGIN;

CREATE TABLE public.pos_analytics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  brand_slug text NOT NULL,
  location_id uuid NULL REFERENCES public.pos_locations(id),
  snapshot_type text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  metrics jsonb NOT NULL,
  schema_version text NOT NULL DEFAULT 'reports_v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid NULL,
  CONSTRAINT pos_analytics_snapshots_type_ck CHECK (snapshot_type IN ('daily','weekly','monthly','custom')),
  CONSTRAINT pos_analytics_snapshots_period_ck CHECK (period_end > period_start),
  CONSTRAINT pos_analytics_snapshots_metrics_object_ck CHECK (jsonb_typeof(metrics) = 'object'),
  CONSTRAINT pos_analytics_snapshots_schema_version_ck CHECK (schema_version = 'reports_v1')
);

CREATE INDEX pos_analytics_snapshots_brand_period_idx
  ON public.pos_analytics_snapshots (brand_slug, period_start DESC);
CREATE INDEX pos_analytics_snapshots_brand_type_created_idx
  ON public.pos_analytics_snapshots (brand_slug, snapshot_type, created_at DESC);

ALTER TABLE public.pos_analytics_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE INSERT,UPDATE,DELETE ON TABLE public.pos_analytics_snapshots FROM PUBLIC,anon,authenticated;
CREATE POLICY pos_analytics_snapshots_select ON public.pos_analytics_snapshots
  FOR SELECT TO authenticated
  USING (public.pos_can_access_brand(brand_slug));

CREATE OR REPLACE FUNCTION public.pos_analytics_metric(p_current numeric,p_previous numeric)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public AS $fn$
SELECT jsonb_build_object('current',p_current,'previous',p_previous,'delta',p_current-p_previous,
 'deltaPercent',CASE WHEN p_previous=0 THEN NULL ELSE round((p_current-p_previous)*100/p_previous,2) END)
$fn$;

CREATE OR REPLACE FUNCTION public.pos_analytics_assert_scope(
  p_brand_slug text,
  p_date_from timestamptz,
  p_date_to timestamptz,
  p_location_id uuid DEFAULT NULL
) RETURNS TABLE(brand_id text, timezone text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_timezone_count integer;
BEGIN
  IF NULLIF(btrim(p_brand_slug),'') IS NULL THEN RAISE EXCEPTION 'brand_slug es obligatorio.'; END IF;
  IF p_date_from IS NULL OR p_date_to IS NULL OR p_date_to <= p_date_from THEN
    RAISE EXCEPTION 'El periodo analítico debe tener date_to posterior a date_from.';
  END IF;
  IF p_location_id IS NOT NULL THEN
    RETURN QUERY SELECT l.brand_id,l.timezone FROM public.pos_locations l
      WHERE l.id=p_location_id AND l.brand_slug=p_brand_slug;
    IF NOT FOUND THEN RAISE EXCEPTION 'La sucursal no existe o pertenece a otra marca.'; END IF;
  ELSE
    SELECT count(DISTINCT l.timezone),min(l.brand_id),min(l.timezone)
      INTO v_timezone_count,brand_id,timezone
    FROM public.pos_locations l WHERE l.brand_slug=p_brand_slug;
    IF brand_id IS NULL THEN RAISE EXCEPTION 'La marca no tiene sucursales POS.'; END IF;
    IF v_timezone_count > 1 THEN
      RAISE EXCEPTION 'Las sucursales usan zonas horarias distintas; especifica location_id.';
    END IF;
    RETURN NEXT;
  END IF;
END $fn$;

CREATE OR REPLACE FUNCTION public.pos_get_analytics_periods(
 p_brand_slug text,p_anchor timestamptz DEFAULT now(),p_location_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE z text; local_anchor timestamp; today_start timestamptz; month_start timestamptz;
 previous_month_start timestamptz; elapsed interval;
BEGIN
 SELECT l.timezone INTO z FROM public.pos_analytics_assert_scope(p_brand_slug,p_anchor-interval '1 microsecond',p_anchor,p_location_id)l;
 local_anchor:=p_anchor AT TIME ZONE z;
 today_start:=date_trunc('day',local_anchor) AT TIME ZONE z;
 month_start:=date_trunc('month',local_anchor) AT TIME ZONE z;
 previous_month_start:=(date_trunc('month',local_anchor)-interval '1 month') AT TIME ZONE z;
 elapsed:=p_anchor-month_start;
 RETURN jsonb_build_object('timezone',z,
  'today',jsonb_build_object('from',today_start,'to',p_anchor),
  'yesterday',jsonb_build_object('from',today_start-interval '1 day','to',today_start),
  'last7Days',jsonb_build_object('from',p_anchor-interval '7 days','to',p_anchor),
  'previous7Days',jsonb_build_object('from',p_anchor-interval '14 days','to',p_anchor-interval '7 days'),
  'last30Days',jsonb_build_object('from',p_anchor-interval '30 days','to',p_anchor),
  'previous30Days',jsonb_build_object('from',p_anchor-interval '60 days','to',p_anchor-interval '30 days'),
  'monthToDate',jsonb_build_object('from',month_start,'to',p_anchor),
  'previousMonthSameElapsedPeriod',jsonb_build_object('from',previous_month_start,'to',LEAST(previous_month_start+elapsed,month_start)));
END $fn$;

CREATE OR REPLACE FUNCTION public.pos_get_analytics_summary(
  p_brand_slug text,
  p_date_from timestamptz,
  p_date_to timestamptz,
  p_location_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_brand_id text; v_timezone text; v_duration interval; v_result jsonb;
BEGIN
  SELECT s.brand_id,s.timezone INTO v_brand_id,v_timezone
  FROM public.pos_analytics_assert_scope(p_brand_slug,p_date_from,p_date_to,p_location_id) s;
  v_duration:=p_date_to-p_date_from;
  WITH periods AS (
    SELECT 'current'::text k,p_date_from f,p_date_to t UNION ALL
    SELECT 'previous',p_date_from-v_duration,p_date_from
  ), sales AS (
    SELECT p.k,s.id,s.customer_id,s.location_id,s.subtotal,s.discount_total,
      COALESCE(s.loyalty_discount_total,0) loyalty_discount_total,s.tax_total,s.total,s.sold_at
    FROM periods p JOIN public.pos_sales s ON s.brand_slug=p_brand_slug AND s.status='completed'
      AND s.sold_at>=p.f AND s.sold_at<p.t
      AND (p_location_id IS NULL OR s.location_id=p_location_id)
  ), sale_facts AS (
    SELECT s.k,count(*) orders,COALESCE(sum(s.subtotal),0) gross,
      COALESCE(sum(s.discount_total+s.loyalty_discount_total),0) discounts,
      COALESCE(sum(s.total),0) net,COALESCE(sum(s.tax_total),0) tax,
      COALESCE(min(s.total),0) min_ticket,COALESCE(max(s.total),0) max_ticket,
      count(*) FILTER(WHERE s.customer_id IS NOT NULL) identified,
      count(DISTINCT s.customer_id) FILTER(WHERE s.customer_id IS NOT NULL) customers
    FROM sales s GROUP BY s.k
  ), item_facts AS (
    SELECT s.k,COALESCE(sum(i.quantity),0) items,
      COALESCE(sum(i.unit_cost*i.quantity),0) cogs
    FROM sales s JOIN public.pos_sale_items i ON i.sale_id=s.id GROUP BY s.k
  ), combined AS (
    SELECT p.k,COALESCE(f.orders,0) orders,COALESCE(f.gross,0) gross,
      COALESCE(f.discounts,0) discounts,COALESCE(f.net,0) net,COALESCE(f.tax,0) tax,
      COALESCE(f.min_ticket,0) min_ticket,COALESCE(f.max_ticket,0) max_ticket,
      COALESCE(f.identified,0) identified,COALESCE(f.customers,0) customers,
      COALESCE(i.items,0) items,COALESCE(i.cogs,0) cogs
    FROM periods p LEFT JOIN sale_facts f ON f.k=p.k LEFT JOIN item_facts i ON i.k=p.k
  ), cmp AS (
    SELECT c.*,p.orders p_orders,p.gross p_gross,p.discounts p_discounts,p.net p_net,
      p.tax p_tax,p.items p_items,p.customers p_customers,p.identified p_identified,p.cogs p_cogs
    FROM combined c JOIN combined p ON p.k='previous' WHERE c.k='current'
  ), payments AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('paymentMethod',x.payment_method,'transactionsCount',x.cnt,
      'amount',x.amount,'percentageOfSales',CASE WHEN c.net=0 THEN NULL ELSE round(x.amount*100/c.net,2) END)
      ORDER BY x.amount DESC),'[]'::jsonb) value
    FROM cmp c CROSS JOIN LATERAL (
      SELECT p.payment_method,count(*) cnt,sum(p.amount) amount FROM sales s
      JOIN public.pos_payments p ON p.sale_id=s.id WHERE s.k='current' GROUP BY p.payment_method
    ) x
  ), locations AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('locationId',x.location_id,'name',x.name,'salesTotal',x.net,
      'ordersCount',x.orders,'averageTicket',CASE WHEN x.orders=0 THEN 0 ELSE round(x.net/x.orders,2) END,
      'itemsSold',x.items,'customers',x.customers) ORDER BY x.net DESC),'[]'::jsonb) value
    FROM (SELECT s.location_id,l.name,count(*) orders,sum(s.total) net,
      COALESCE(sum(i.items),0) items,count(DISTINCT s.customer_id) FILTER(WHERE s.customer_id IS NOT NULL) customers
      FROM sales s JOIN public.pos_locations l ON l.id=s.location_id
      LEFT JOIN(SELECT sale_id,sum(quantity)items FROM public.pos_sale_items GROUP BY sale_id)i ON i.sale_id=s.id
      WHERE s.k='current' GROUP BY s.location_id,l.name) x
  ), categories AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('categoryId',x.category_id,'categoryName',x.name,
      'salesTotal',x.sales_total,'unitsSold',x.units) ORDER BY x.sales_total DESC),'[]'::jsonb) value
    FROM (SELECT p.category_id,c.name,sum(i.line_total) sales_total,sum(i.quantity) units
      FROM sales s JOIN public.pos_sale_items i ON i.sale_id=s.id
      JOIN public.pos_products p ON p.id=i.product_id LEFT JOIN public.pos_categories c ON c.id=p.category_id
      WHERE s.k='current' GROUP BY p.category_id,c.name) x
  )
  SELECT jsonb_build_object(
    'schemaVersion','reports_v1','brandSlug',p_brand_slug,'locationId',p_location_id,'timezone',v_timezone,
    'period',jsonb_build_object('from',p_date_from,'to',p_date_to,'previousFrom',p_date_from-v_duration,'previousTo',p_date_from),
    'sales',jsonb_build_object(
      'grossSales',public.pos_analytics_metric(c.gross,c.p_gross),
      'discountTotal',public.pos_analytics_metric(c.discounts,c.p_discounts),
      'netSales',public.pos_analytics_metric(c.net,c.p_net),
      'taxTotal',public.pos_analytics_metric(c.tax,c.p_tax),
      'ordersCount',public.pos_analytics_metric(c.orders,c.p_orders),
      'itemsSold',public.pos_analytics_metric(c.items,c.p_items),
      'averageTicket',public.pos_analytics_metric(CASE WHEN c.orders=0 THEN 0 ELSE round(c.net/c.orders,2) END,CASE WHEN c.p_orders=0 THEN 0 ELSE round(c.p_net/c.p_orders,2) END),
      'averageItemsPerTicket',public.pos_analytics_metric(CASE WHEN c.orders=0 THEN 0 ELSE round(c.items/c.orders,3) END,CASE WHEN c.p_orders=0 THEN 0 ELSE round(c.p_items/c.p_orders,3) END),
      'minTicket',c.min_ticket,'maxTicket',c.max_ticket,'completedSalesCount',c.orders,
      'cogs',public.pos_analytics_metric(c.cogs,c.p_cogs),
      'grossProfit',c.net-c.tax-c.cogs,
      'grossMarginPercent',CASE WHEN c.net-c.tax=0 THEN NULL ELSE round((c.net-c.tax-c.cogs)*100/(c.net-c.tax),2) END,
      'refundAnalytics','pending_no_refund_ledger'),
    'customers',jsonb_build_object('uniqueCustomers',c.customers,'identifiedSales',c.identified,
      'anonymousSales',c.orders-c.identified,'customerIdentificationRate',CASE WHEN c.orders=0 THEN NULL ELSE round(c.identified*100.0/c.orders,2) END,
      'newCustomers',(SELECT count(*) FROM(SELECT s.customer_id FROM public.pos_sales s WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.customer_id IS NOT NULL GROUP BY s.customer_id HAVING min(s.sold_at)>=p_date_from AND min(s.sold_at)<p_date_to AND EXISTS(SELECT 1 FROM public.pos_sales cp WHERE cp.brand_slug=p_brand_slug AND cp.status='completed' AND cp.customer_id=s.customer_id AND cp.sold_at>=p_date_from AND cp.sold_at<p_date_to AND(p_location_id IS NULL OR cp.location_id=p_location_id)))x),
      'returningCustomers',(SELECT count(DISTINCT s.customer_id) FROM public.pos_sales s WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.customer_id IS NOT NULL AND s.sold_at>=p_date_from AND s.sold_at<p_date_to AND(p_location_id IS NULL OR s.location_id=p_location_id) AND EXISTS(SELECT 1 FROM public.pos_sales h WHERE h.brand_slug=p_brand_slug AND h.status='completed' AND h.customer_id=s.customer_id AND h.sold_at<p_date_from)),
      'repeatCustomerRate',CASE WHEN c.customers=0 THEN NULL ELSE round((SELECT count(*) FROM(SELECT s.customer_id FROM public.pos_sales s WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.customer_id IS NOT NULL AND s.sold_at>=p_date_from AND s.sold_at<p_date_to AND(p_location_id IS NULL OR s.location_id=p_location_id) GROUP BY s.customer_id HAVING count(*)>=2)x)*100.0/c.customers,2) END,
      'customerSalesTotal',(SELECT COALESCE(sum(s.total),0) FROM public.pos_sales s WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.customer_id IS NOT NULL AND s.sold_at>=p_date_from AND s.sold_at<p_date_to AND(p_location_id IS NULL OR s.location_id=p_location_id)),
      'averageCustomerSpend',CASE WHEN c.customers=0 THEN NULL ELSE round((SELECT COALESCE(sum(s.total),0) FROM public.pos_sales s WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.customer_id IS NOT NULL AND s.sold_at>=p_date_from AND s.sold_at<p_date_to AND(p_location_id IS NULL OR s.location_id=p_location_id))/c.customers,2) END),
    'payments',payments.value,'locations',locations.value,'categories',categories.value)
  INTO v_result FROM cmp c CROSS JOIN payments CROSS JOIN locations CROSS JOIN categories;
  RETURN v_result;
END $fn$;

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
 SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.rank_value DESC,x.product_name,x.variant_name),'[]') INTO v_result
 FROM (SELECT r.product_id "productId",r.product_name "productName",r.variant_id "variantId",r.variant_name "variantName",r.sku,
  r.units_sold "unitsSold",r.sales_total "salesTotal",r.discount_total "discountTotal",r.ticket_count "ticketCount",
  r.average_unit_price "averageUnitPrice",CASE WHEN t.v=0 THEN NULL ELSE round(r.sales_total*100/t.v,2) END "percentageOfSales",
  COALESCE((SELECT sum(inv.quantity) FROM public.pos_inventory inv WHERE inv.brand_slug=p_brand_slug AND inv.variant_id=r.variant_id AND(p_location_id IS NULL OR inv.location_id=p_location_id)),0) "currentStock",
  CASE p_order_by WHEN 'units_sold' THEN r.units_sold WHEN 'ticket_count' THEN r.ticket_count ELSE r.sales_total END rank_value
  FROM rows r CROSS JOIN total t ORDER BY rank_value DESC,r.product_name,r.variant_name LIMIT p_limit)x;
 RETURN v_result;
END $fn$;

CREATE OR REPLACE FUNCTION public.pos_get_analytics_customers(
 p_brand_slug text,p_date_from timestamptz,p_date_to timestamptz,p_location_id uuid DEFAULT NULL,p_limit integer DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_result jsonb;
BEGIN
 PERFORM 1 FROM public.pos_analytics_assert_scope(p_brand_slug,p_date_from,p_date_to,p_location_id);
 IF p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'limit debe estar entre 1 y 200.'; END IF;
 WITH history AS (SELECT s.customer_id,s.id,s.total,s.sold_at,lag(s.sold_at) OVER(PARTITION BY s.customer_id ORDER BY s.sold_at,s.id) previous_at
  FROM public.pos_sales s WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.customer_id IS NOT NULL
   AND(p_location_id IS NULL OR s.location_id=p_location_id)), ranked AS (SELECT h.customer_id,count(*) FILTER(WHERE h.sold_at>=p_date_from AND h.sold_at<p_date_to) orders_period,
   COALESCE(sum(h.total) FILTER(WHERE h.sold_at>=p_date_from AND h.sold_at<p_date_to),0) sales_period,
   min(h.sold_at) first_purchase,max(h.sold_at) last_purchase,count(*) lifetime_orders,sum(h.total) lifetime_spend,
   (array_agg(h.previous_at ORDER BY h.sold_at DESC,h.id DESC))[1] previous_purchase,
   avg(extract(epoch FROM(h.sold_at-h.previous_at))/86400) FILTER(WHERE h.previous_at IS NOT NULL) avg_days,
   percentile_cont(.5) WITHIN GROUP(ORDER BY extract(epoch FROM(h.sold_at-h.previous_at))/86400) FILTER(WHERE h.previous_at IS NOT NULL) median_days
  FROM history h GROUP BY h.customer_id)
 SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x."salesTotal" DESC,x."customerName"),'[]') INTO v_result FROM (
  SELECT c.id "customerId",btrim(concat_ws(' ',c.first_name,c.last_name)) "customerName",r.orders_period "ordersCount",r.sales_period "salesTotal",
   CASE WHEN r.orders_period=0 THEN 0 ELSE round(r.sales_period/r.orders_period,2) END "averageTicket",r.last_purchase "lastPurchaseAt",r.first_purchase "firstPurchaseAt",
   floor(extract(epoch FROM(now()-r.last_purchase))/86400) "daysSinceLastPurchase",r.previous_purchase "previousPurchaseAt",
   round(r.avg_days::numeric,2) "averageDaysBetweenPurchases",round(r.median_days::numeric,2) "medianDaysBetweenPurchases",
   r.lifetime_orders "lifetimeOrders",r.lifetime_spend "lifetimeSpend",m.points_balance "loyaltyPointsBalance",m.lifetime_points "lifetimePoints",
   CASE WHEN t.id IS NULL THEN NULL ELSE jsonb_build_object('id',t.id,'name',t.name,'pointsMultiplier',t.points_multiplier) END "currentTier",
   (r.first_purchase>=p_date_from AND r.first_purchase<p_date_to) "isNewInPeriod",(r.first_purchase<p_date_from) "hadPurchaseBeforePeriod"
  FROM ranked r JOIN public.pos_customers c ON c.id=r.customer_id AND c.brand_slug=p_brand_slug
  LEFT JOIN public.pos_loyalty_members m ON m.customer_id=c.id AND m.brand_slug=p_brand_slug
  LEFT JOIN public.pos_loyalty_tiers t ON t.id=m.tier_id WHERE r.orders_period>0 ORDER BY r.sales_period DESC LIMIT p_limit)x;
 RETURN v_result;
END $fn$;

CREATE OR REPLACE FUNCTION public.pos_get_analytics_inventory(
 p_brand_slug text,p_date_from timestamptz,p_date_to timestamptz,p_location_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_result jsonb; v_days numeric;
BEGIN
 PERFORM 1 FROM public.pos_analytics_assert_scope(p_brand_slug,p_date_from,p_date_to,p_location_id);
 v_days:=GREATEST(extract(epoch FROM(p_date_to-p_date_from))/86400,1);
 WITH sold AS (SELECT i.variant_id,sum(i.quantity) units FROM public.pos_sales s JOIN public.pos_sale_items i ON i.sale_id=s.id
  WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.sold_at>=p_date_from AND s.sold_at<p_date_to
   AND(p_location_id IS NULL OR s.location_id=p_location_id) GROUP BY i.variant_id), receipts AS (
  SELECT im.variant_id,max(im.created_at) last_receipt FROM public.pos_inventory_movements im
  WHERE im.brand_slug=p_brand_slug AND im.movement_type='receipt' AND(p_location_id IS NULL OR im.location_id=p_location_id) GROUP BY im.variant_id)
 SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x."productName",x."variantName",x."locationId"),'[]') INTO v_result FROM(
  SELECT p.id "productId",p.name "productName",v.id "variantId",v.name "variantName",i.location_id "locationId",
   i.quantity "currentQuantity",i.reserved_quantity "reservedQuantity",i.quantity-i.reserved_quantity "availableQuantity",i.minimum_quantity "minimumQuantity",
   v.cost "unitCost",round((i.quantity-i.reserved_quantity)*v.cost,2) "inventoryCostValue",r.last_receipt "lastReceiptAt",
   COALESCE(s.units,0) "unitsSoldPeriod",round(COALESCE(s.units,0)/v_days,3) "averageUnitsSoldPerDay",
   CASE WHEN COALESCE(s.units,0)=0 THEN NULL ELSE round((i.quantity-i.reserved_quantity)/(s.units/v_days),2) END "daysOfStockEstimate"
  FROM public.pos_inventory i JOIN public.pos_product_variants v ON v.id=i.variant_id AND v.brand_slug=p_brand_slug
  JOIN public.pos_products p ON p.id=v.product_id AND p.brand_slug=p_brand_slug LEFT JOIN sold s ON s.variant_id=v.id LEFT JOIN receipts r ON r.variant_id=v.id
  WHERE i.brand_slug=p_brand_slug AND(p_location_id IS NULL OR i.location_id=p_location_id))x;
 RETURN v_result;
END $fn$;

CREATE OR REPLACE FUNCTION public.pos_get_analytics_loyalty(
 p_brand_slug text,p_date_from timestamptz,p_date_to timestamptz,p_location_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_result jsonb;
BEGIN
 PERFORM 1 FROM public.pos_analytics_assert_scope(p_brand_slug,p_date_from,p_date_to,p_location_id);
 WITH members AS (SELECT m.* FROM public.pos_loyalty_members m WHERE m.brand_slug=p_brand_slug), tx AS(
  SELECT t.* FROM public.pos_loyalty_transactions t LEFT JOIN public.pos_sales s ON s.id=t.sale_id
  WHERE t.brand_slug=p_brand_slug AND t.created_at>=p_date_from AND t.created_at<p_date_to AND(p_location_id IS NULL OR s.location_id=p_location_id OR t.sale_id IS NULL)), tiers AS(
  SELECT COALESCE(jsonb_agg(jsonb_build_object('tierId',x.id,'tierName',x.name,'members',x.members,'percentage',CASE WHEN x.total=0 THEN NULL ELSE round(x.members*100.0/x.total,2) END) ORDER BY x.minimum_lifetime_points),'[]') value
  FROM(SELECT t.id,t.name,t.minimum_lifetime_points,count(m.id) members,(SELECT count(*) FROM members) total FROM public.pos_loyalty_tiers t LEFT JOIN members m ON m.tier_id=t.id WHERE t.brand_slug=p_brand_slug GROUP BY t.id,t.name,t.minimum_lifetime_points)x), visits AS(
  SELECT COALESCE(jsonb_agg(jsonb_build_object('visitProgramId',x.id,'name',x.name,'requiredVisits',x.required_visits,'minimumSaleAmount',x.minimum_sale_amount,
   'qualifiesPeriod',x.qualifies,'uniqueMembersProgressing',x.members,'unlocksCreatedPeriod',x.created,'unlocksRedeemedPeriod',x.redeemed,'availableUnlocks',x.available) ORDER BY x.name),'[]') value
  FROM(SELECT vp.id,vp.name,vp.required_visits,vp.minimum_sale_amount,
   count(DISTINCT e.id) FILTER(WHERE e.event_type='qualify' AND e.created_at>=p_date_from AND e.created_at<p_date_to) qualifies,
   count(DISTINCT e.member_id) FILTER(WHERE e.event_type='qualify') members,
   count(DISTINCT u.id) FILTER(WHERE u.created_at>=p_date_from AND u.created_at<p_date_to) created,
   count(DISTINCT u.id) FILTER(WHERE u.redeemed_at>=p_date_from AND u.redeemed_at<p_date_to) redeemed,
   count(DISTINCT u.id) FILTER(WHERE u.status='available') available
   FROM public.pos_loyalty_visit_programs vp LEFT JOIN public.pos_loyalty_visit_events e ON e.visit_program_id=vp.id
   LEFT JOIN public.pos_loyalty_reward_unlocks u ON u.visit_program_id=vp.id WHERE vp.brand_slug=p_brand_slug GROUP BY vp.id)x)
 SELECT jsonb_build_object('membersCount',(SELECT count(*) FROM members),'activeMembersCount',(SELECT count(*) FROM members WHERE status='active'),
  'pointsEarnedPeriod',COALESCE((SELECT sum(points) FROM tx WHERE transaction_type='earn'),0),
  'pointsRedeemedPeriod',abs(COALESCE((SELECT sum(points) FROM tx WHERE transaction_type='redeem'),0)),
  'rewardsRedeemedCount',(SELECT count(*) FROM public.pos_loyalty_redemptions r JOIN public.pos_sales s ON s.id=r.sale_id WHERE r.brand_slug=p_brand_slug AND s.status='completed' AND s.sold_at>=p_date_from AND s.sold_at<p_date_to AND(p_location_id IS NULL OR s.location_id=p_location_id)),
  'rewardsDiscountValue',COALESCE((SELECT sum(r.discount_applied) FROM public.pos_loyalty_redemptions r JOIN public.pos_sales s ON s.id=r.sale_id WHERE r.brand_slug=p_brand_slug AND s.status='completed' AND s.sold_at>=p_date_from AND s.sold_at<p_date_to AND(p_location_id IS NULL OR s.location_id=p_location_id)),0),
  'tierDistribution',tiers.value,'visitProgramsActive',(SELECT count(*) FROM public.pos_loyalty_visit_programs WHERE brand_slug=p_brand_slug AND active),
  'visitQualifiesPeriod',COALESCE((SELECT sum((j->>'qualifiesPeriod')::int) FROM jsonb_array_elements(visits.value) j),0),
  'visitUnlocksCreatedPeriod',COALESCE((SELECT sum((j->>'unlocksCreatedPeriod')::int) FROM jsonb_array_elements(visits.value) j),0),
  'visitUnlocksRedeemedPeriod',COALESCE((SELECT sum((j->>'unlocksRedeemedPeriod')::int) FROM jsonb_array_elements(visits.value) j),0),
  'availableUnlocksCurrent',(SELECT count(*) FROM public.pos_loyalty_reward_unlocks WHERE brand_slug=p_brand_slug AND status='available'),
  'visitPrograms',visits.value) INTO v_result FROM tiers CROSS JOIN visits;
 RETURN v_result;
END $fn$;

CREATE OR REPLACE FUNCTION public.pos_get_analytics_sales_series(
 p_brand_slug text,p_date_from timestamptz,p_date_to timestamptz,p_granularity text,p_location_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_timezone text; v_result jsonb;
BEGIN
 SELECT s.timezone INTO v_timezone FROM public.pos_analytics_assert_scope(p_brand_slug,p_date_from,p_date_to,p_location_id)s;
 IF p_granularity NOT IN('hour','day','week','month') THEN RAISE EXCEPTION 'Granularidad no permitida.'; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x."bucketStart"),'[]') INTO v_result FROM(
  SELECT date_trunc(p_granularity,s.sold_at AT TIME ZONE v_timezone) AT TIME ZONE v_timezone "bucketStart",
   sum(s.total) "netSales",count(*) "ordersCount",COALESCE(sum(i.items),0) "itemsSold",round(sum(s.total)/count(*),2) "averageTicket"
  FROM public.pos_sales s LEFT JOIN(SELECT sale_id,sum(quantity)items FROM public.pos_sale_items GROUP BY sale_id)i ON i.sale_id=s.id
  WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.sold_at>=p_date_from AND s.sold_at<p_date_to AND(p_location_id IS NULL OR s.location_id=p_location_id)
  GROUP BY 1)x; RETURN v_result;
END $fn$;

CREATE OR REPLACE FUNCTION public.pos_get_analytics_sales_patterns(
 p_brand_slug text,p_date_from timestamptz,p_date_to timestamptz,p_location_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_timezone text; v_days jsonb; v_hours jsonb;
BEGIN
 SELECT s.timezone INTO v_timezone FROM public.pos_analytics_assert_scope(p_brand_slug,p_date_from,p_date_to,p_location_id)s;
 WITH base AS(SELECT s.*,COALESCE(i.items,0)items FROM public.pos_sales s LEFT JOIN(SELECT sale_id,sum(quantity)items FROM public.pos_sale_items GROUP BY sale_id)i ON i.sale_id=s.id WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.sold_at>=p_date_from AND s.sold_at<p_date_to AND(p_location_id IS NULL OR s.location_id=p_location_id))
 SELECT COALESCE(jsonb_agg(jsonb_build_object('dayOfWeek',x.d,'salesTotal',x.sales,'ordersCount',x.orders,'averageTicket',round(x.sales/x.orders,2)) ORDER BY x.d),'[]') INTO v_days FROM(SELECT extract(isodow FROM sold_at AT TIME ZONE v_timezone)::int d,sum(total)sales,count(*)orders FROM base GROUP BY 1)x;
 WITH base AS(SELECT s.* FROM public.pos_sales s WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.sold_at>=p_date_from AND s.sold_at<p_date_to AND(p_location_id IS NULL OR s.location_id=p_location_id))
 SELECT COALESCE(jsonb_agg(jsonb_build_object('hourOfDay',x.h,'salesTotal',x.sales,'ordersCount',x.orders,'averageTicket',round(x.sales/x.orders,2)) ORDER BY x.h),'[]') INTO v_hours FROM(SELECT extract(hour FROM sold_at AT TIME ZONE v_timezone)::int h,sum(total)sales,count(*)orders FROM base GROUP BY 1)x;
 RETURN jsonb_build_object('timezone',v_timezone,'byDayOfWeek',v_days,'byHourOfDay',v_hours);
END $fn$;

CREATE OR REPLACE FUNCTION public.pos_get_analytics_product_pairs(
 p_brand_slug text,p_date_from timestamptz,p_date_to timestamptz,p_location_id uuid DEFAULT NULL,p_limit integer DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_result jsonb; v_orders numeric;
BEGIN
 PERFORM 1 FROM public.pos_analytics_assert_scope(p_brand_slug,p_date_from,p_date_to,p_location_id);
 IF p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'limit debe estar entre 1 y 200.'; END IF;
 SELECT count(*) INTO v_orders FROM public.pos_sales WHERE brand_slug=p_brand_slug AND status='completed' AND sold_at>=p_date_from AND sold_at<p_date_to AND(p_location_id IS NULL OR location_id=p_location_id);
 WITH products AS(SELECT DISTINCT i.sale_id,i.product_id,i.product_name FROM public.pos_sales s JOIN public.pos_sale_items i ON i.sale_id=s.id WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.sold_at>=p_date_from AND s.sold_at<p_date_to AND(p_location_id IS NULL OR s.location_id=p_location_id)), freq AS(SELECT product_id,count(*)orders FROM products GROUP BY product_id), pairs AS(SELECT a.product_id a_id,a.product_name a_name,b.product_id b_id,b.product_name b_name,count(*) together FROM products a JOIN products b ON b.sale_id=a.sale_id AND a.product_id<b.product_id GROUP BY a.product_id,a.product_name,b.product_id,b.product_name)
 SELECT COALESCE(jsonb_agg(jsonb_build_object('productA',jsonb_build_object('id',a_id,'name',a_name),'productB',jsonb_build_object('id',b_id,'name',b_name),'ordersTogether',together,'pairSalesCount',together,'supportA',CASE WHEN v_orders=0 THEN NULL ELSE round(fa.orders*100/v_orders,2)END,'supportB',CASE WHEN v_orders=0 THEN NULL ELSE round(fb.orders*100/v_orders,2)END)ORDER BY together DESC,a_name,b_name),'[]') INTO v_result FROM(SELECT * FROM pairs ORDER BY together DESC,a_name,b_name LIMIT p_limit)p JOIN freq fa ON fa.product_id=p.a_id JOIN freq fb ON fb.product_id=p.b_id;
 RETURN v_result;
END $fn$;

CREATE OR REPLACE FUNCTION public.pos_get_analytics_data_quality(
 p_brand_slug text,p_date_from timestamptz,p_date_to timestamptz,p_location_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_result jsonb;
BEGIN
 PERFORM 1 FROM public.pos_analytics_assert_scope(p_brand_slug,p_date_from,p_date_to,p_location_id);
 WITH sales AS(SELECT * FROM public.pos_sales WHERE brand_slug=p_brand_slug AND status='completed' AND sold_at>=p_date_from AND sold_at<p_date_to AND(p_location_id IS NULL OR location_id=p_location_id)), counts AS(SELECT count(*) total,count(*)FILTER(WHERE customer_id IS NOT NULL)identified,count(*)FILTER(WHERE EXISTS(SELECT 1 FROM public.pos_payments p WHERE p.sale_id=sales.id))with_payment FROM sales)
 SELECT jsonb_build_object('completedSalesCount',c.total,'identifiedSalesCount',c.identified,'customerIdentificationRate',CASE WHEN c.total=0 THEN NULL ELSE round(c.identified*100.0/c.total,2)END,'salesWithPayment',c.with_payment,'salesWithoutPayment',c.total-c.with_payment,
  'productsWithoutCategory',(SELECT count(*) FROM public.pos_products WHERE brand_slug=p_brand_slug AND category_id IS NULL),
  'customersWithoutContact',(SELECT count(*) FROM public.pos_customers WHERE brand_slug=p_brand_slug AND NULLIF(btrim(phone),'')IS NULL AND NULLIF(btrim(email),'')IS NULL),
  'customersWithPhone',(SELECT count(*) FROM public.pos_customers WHERE brand_slug=p_brand_slug AND NULLIF(btrim(phone),'')IS NOT NULL),
  'customersWithEmail',(SELECT count(*) FROM public.pos_customers WHERE brand_slug=p_brand_slug AND NULLIF(btrim(email),'')IS NOT NULL),
  'customersWithMarketingConsent',(SELECT count(*) FROM public.pos_customers WHERE brand_slug=p_brand_slug AND marketing_consent),
  'customersWithWalletConsent',(SELECT count(*) FROM public.pos_customers WHERE brand_slug=p_brand_slug AND wallet_consent),
  'inventoryProductsWithoutStockRows',(SELECT count(*) FROM public.pos_product_variants v JOIN public.pos_products p ON p.id=v.product_id WHERE v.brand_slug=p_brand_slug AND p.track_inventory AND v.active AND NOT EXISTS(SELECT 1 FROM public.pos_inventory i WHERE i.variant_id=v.id AND i.brand_slug=p_brand_slug AND(p_location_id IS NULL OR i.location_id=p_location_id)))) INTO v_result FROM counts c;
 RETURN v_result;
END $fn$;

CREATE OR REPLACE FUNCTION public.pos_create_analytics_snapshot(
 p_brand_slug text,p_snapshot_type text,p_period_start timestamptz,p_period_end timestamptz,p_location_id uuid DEFAULT NULL,p_generated_by uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_brand_id text; v_metrics jsonb; v_row public.pos_analytics_snapshots%rowtype;
BEGIN
 IF p_snapshot_type NOT IN('daily','weekly','monthly','custom') THEN RAISE EXCEPTION 'Tipo de snapshot no permitido.'; END IF;
 SELECT s.brand_id INTO v_brand_id FROM public.pos_analytics_assert_scope(p_brand_slug,p_period_start,p_period_end,p_location_id)s;
 v_metrics:=jsonb_build_object('schemaVersion','reports_v1','salesAndCustomers',public.pos_get_analytics_summary(p_brand_slug,p_period_start,p_period_end,p_location_id),'topProducts',public.pos_get_analytics_products(p_brand_slug,p_period_start,p_period_end,p_location_id,10,'sales_total'),'topCustomers',public.pos_get_analytics_customers(p_brand_slug,p_period_start,p_period_end,p_location_id,10),
  'inventorySummary',(SELECT jsonb_build_object('trackedRows',count(*),'availableQuantity',COALESCE(sum((x->>'availableQuantity')::numeric),0),'inventoryCostValue',COALESCE(sum((x->>'inventoryCostValue')::numeric),0),'outOfStockRows',count(*)FILTER(WHERE(x->>'availableQuantity')::numeric<=0),'belowMinimumRows',count(*)FILTER(WHERE(x->>'availableQuantity')::numeric<=(x->>'minimumQuantity')::numeric)) FROM jsonb_array_elements(public.pos_get_analytics_inventory(p_brand_slug,p_period_start,p_period_end,p_location_id))x),
  'loyalty',public.pos_get_analytics_loyalty(p_brand_slug,p_period_start,p_period_end,p_location_id),'dataQuality',public.pos_get_analytics_data_quality(p_brand_slug,p_period_start,p_period_end,p_location_id));
 INSERT INTO public.pos_analytics_snapshots(brand_id,brand_slug,location_id,snapshot_type,period_start,period_end,metrics,schema_version,generated_by)VALUES(v_brand_id,p_brand_slug,p_location_id,p_snapshot_type,p_period_start,p_period_end,v_metrics,'reports_v1',p_generated_by)RETURNING * INTO v_row;
 RETURN jsonb_build_object('id',v_row.id,'brandSlug',v_row.brand_slug,'locationId',v_row.location_id,'snapshotType',v_row.snapshot_type,'periodStart',v_row.period_start,'periodEnd',v_row.period_end,'metrics',v_row.metrics,'schemaVersion',v_row.schema_version,'createdAt',v_row.created_at);
END $fn$;

-- Read-path indexes needed by V1A. Names and leading columns are deliberately specific.
CREATE INDEX IF NOT EXISTS pos_sales_analytics_brand_status_sold_idx ON public.pos_sales(brand_slug,status,sold_at DESC);
CREATE INDEX IF NOT EXISTS pos_sales_analytics_brand_customer_sold_idx ON public.pos_sales(brand_slug,customer_id,sold_at DESC) WHERE status='completed' AND customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pos_sale_items_analytics_variant_sale_idx ON public.pos_sale_items(variant_id,sale_id);
CREATE INDEX IF NOT EXISTS pos_payments_analytics_sale_method_idx ON public.pos_payments(sale_id,payment_method);

REVOKE ALL ON FUNCTION public.pos_analytics_metric(numeric,numeric) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pos_analytics_assert_scope(text,timestamptz,timestamptz,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pos_analytics_metric(numeric,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_analytics_assert_scope(text,timestamptz,timestamptz,uuid) TO service_role;

DO $acl$ DECLARE r record; BEGIN
 FOR r IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND (p.proname LIKE 'pos_get_analytics_%' OR p.proname='pos_create_analytics_snapshot')
 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',r.signature); EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',r.signature); END LOOP;
END $acl$;

COMMIT;
