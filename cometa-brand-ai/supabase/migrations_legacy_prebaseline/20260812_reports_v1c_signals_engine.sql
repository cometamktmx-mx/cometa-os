-- COMETA POS — REPORTS V1C / DETERMINISTIC SIGNALS ENGINE
BEGIN;

CREATE TABLE public.pos_signal_rule_configs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id text NOT NULL, brand_slug text NOT NULL,
 signal_type text NOT NULL, enabled boolean NOT NULL DEFAULT true, config jsonb NOT NULL DEFAULT '{}'::jsonb,
 rule_version text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT pos_signal_rule_configs_uq UNIQUE(brand_slug,signal_type),
 CONSTRAINT pos_signal_rule_configs_json_ck CHECK(jsonb_typeof(config)='object')
);

CREATE TABLE public.pos_intelligence_signals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id text NOT NULL, brand_slug text NOT NULL,
 location_id uuid NULL REFERENCES public.pos_locations(id), signal_type text NOT NULL, signal_category text NOT NULL,
 severity text NOT NULL, status text NOT NULL DEFAULT 'open', entity_type text NULL, entity_id text NULL, entity_name text NULL,
 period_start timestamptz NOT NULL, period_end timestamptz NOT NULL, comparison_start timestamptz NULL, comparison_end timestamptz NULL,
 title text NOT NULL, metric_key text NOT NULL, current_value numeric NULL, previous_value numeric NULL,
 delta_value numeric NULL, delta_percent numeric NULL, evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
 context jsonb NOT NULL DEFAULT '{}'::jsonb, rule_version text NOT NULL, dedupe_key text NOT NULL,
 detected_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT pos_intelligence_signals_category_ck CHECK(signal_category IN('opportunity','risk','anomaly','trend','loyalty','customer','inventory','product')),
 CONSTRAINT pos_intelligence_signals_severity_ck CHECK(severity IN('info','low','medium','high','critical')),
 CONSTRAINT pos_intelligence_signals_status_ck CHECK(status IN('open','acknowledged','resolved','dismissed')),
 CONSTRAINT pos_intelligence_signals_period_ck CHECK(period_end>period_start),
 CONSTRAINT pos_intelligence_signals_comparison_ck CHECK((comparison_start IS NULL AND comparison_end IS NULL) OR comparison_end>comparison_start),
 CONSTRAINT pos_intelligence_signals_evidence_ck CHECK(jsonb_typeof(evidence)='object'),
 CONSTRAINT pos_intelligence_signals_context_ck CHECK(jsonb_typeof(context)='object'),
 CONSTRAINT pos_intelligence_signals_resolved_ck CHECK((status='resolved' AND resolved_at IS NOT NULL) OR status<>'resolved')
);

CREATE UNIQUE INDEX pos_intelligence_signals_open_dedupe_uidx ON public.pos_intelligence_signals
 (brand_slug,COALESCE(location_id,'00000000-0000-0000-0000-000000000000'::uuid),dedupe_key) WHERE status IN('open','acknowledged');
CREATE INDEX pos_intelligence_signals_brand_status_detected_idx ON public.pos_intelligence_signals(brand_slug,status,detected_at DESC);
CREATE INDEX pos_intelligence_signals_brand_type_status_idx ON public.pos_intelligence_signals(brand_slug,signal_type,status);
CREATE INDEX pos_intelligence_signals_entity_idx ON public.pos_intelligence_signals(brand_slug,entity_type,entity_id);

CREATE OR REPLACE FUNCTION public.pos_signals_set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $fn$
BEGIN NEW.updated_at=now(); RETURN NEW; END $fn$;
CREATE TRIGGER pos_signal_rule_configs_updated BEFORE UPDATE ON public.pos_signal_rule_configs FOR EACH ROW EXECUTE FUNCTION public.pos_signals_set_updated_at();
CREATE TRIGGER pos_intelligence_signals_updated BEFORE UPDATE ON public.pos_intelligence_signals FOR EACH ROW EXECUTE FUNCTION public.pos_signals_set_updated_at();

ALTER TABLE public.pos_signal_rule_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_intelligence_signals ENABLE ROW LEVEL SECURITY;
REVOKE INSERT,UPDATE,DELETE ON public.pos_signal_rule_configs,public.pos_intelligence_signals FROM PUBLIC,anon,authenticated;
CREATE POLICY pos_signal_rule_configs_select ON public.pos_signal_rule_configs FOR SELECT TO authenticated USING(public.pos_can_access_brand(brand_slug));
CREATE POLICY pos_intelligence_signals_select ON public.pos_intelligence_signals FOR SELECT TO authenticated USING(public.pos_can_access_brand(brand_slug));

CREATE OR REPLACE FUNCTION public.pos_signal_rule_config(p_brand_slug text,p_signal_type text,p_defaults jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$
 SELECT CASE WHEN c.enabled IS FALSE THEN NULL ELSE p_defaults||COALESCE(c.config,'{}') END
 FROM (SELECT 1) seed LEFT JOIN public.pos_signal_rule_configs c ON c.brand_slug=p_brand_slug AND c.signal_type=p_signal_type
$fn$;

CREATE OR REPLACE FUNCTION public.pos_emit_intelligence_signal(
 p_brand_id text,p_brand_slug text,p_location_id uuid,p_signal_type text,p_category text,p_severity text,
 p_entity_type text,p_entity_id text,p_entity_name text,p_period_start timestamptz,p_period_end timestamptz,
 p_comparison_start timestamptz,p_comparison_end timestamptz,p_title text,p_metric_key text,
 p_current numeric,p_previous numeric,p_delta numeric,p_delta_percent numeric,p_evidence jsonb,p_context jsonb,
 p_rule_version text,p_dedupe_key text) RETURNS TABLE(signal_id uuid,was_created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_brand_slug||':'||COALESCE(p_location_id::text,'all')||':'||p_dedupe_key,0));
 UPDATE public.pos_intelligence_signals SET last_seen_at=now(),period_start=p_period_start,period_end=p_period_end,
  comparison_start=p_comparison_start,comparison_end=p_comparison_end,title=p_title,severity=p_severity,current_value=p_current,
  previous_value=p_previous,delta_value=p_delta,delta_percent=p_delta_percent,evidence=p_evidence,context=p_context
 WHERE brand_slug=p_brand_slug AND COALESCE(location_id,'00000000-0000-0000-0000-000000000000'::uuid)=COALESCE(p_location_id,'00000000-0000-0000-0000-000000000000'::uuid)
  AND dedupe_key=p_dedupe_key AND status IN('open','acknowledged') RETURNING id,false INTO signal_id,was_created;
 IF FOUND THEN RETURN NEXT; RETURN; END IF;
 INSERT INTO public.pos_intelligence_signals(brand_id,brand_slug,location_id,signal_type,signal_category,severity,entity_type,entity_id,entity_name,period_start,period_end,comparison_start,comparison_end,title,metric_key,current_value,previous_value,delta_value,delta_percent,evidence,context,rule_version,dedupe_key)
 VALUES(p_brand_id,p_brand_slug,p_location_id,p_signal_type,p_category,p_severity,p_entity_type,p_entity_id,p_entity_name,p_period_start,p_period_end,p_comparison_start,p_comparison_end,p_title,p_metric_key,p_current,p_previous,p_delta,p_delta_percent,COALESCE(p_evidence,'{}'),COALESCE(p_context,'{}'),p_rule_version,p_dedupe_key)
 RETURNING id,true INTO signal_id,was_created; RETURN NEXT;
END $fn$;

CREATE OR REPLACE FUNCTION public.pos_generate_intelligence_signals(
 p_brand_slug text,p_period_start timestamptz,p_period_end timestamptz,p_location_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE b text; duration interval; cmp_start timestamptz; run_started timestamptz:=now(); s jsonb; cfg jsonb; r record; emit record; made int:=0; touched int:=0;
BEGIN
 SELECT brand_id INTO b FROM public.pos_analytics_assert_scope(p_brand_slug,p_period_start,p_period_end,p_location_id);
 duration:=p_period_end-p_period_start; cmp_start:=p_period_start-duration;
 CREATE TEMP TABLE IF NOT EXISTS pg_temp.signal_run_keys(dedupe_key text PRIMARY KEY) ON COMMIT DROP; TRUNCATE pg_temp.signal_run_keys;

 -- Central defaults: minimum comparable orders 5; sales ±20%; ticket ±15%.
 s:=public.pos_get_analytics_summary(p_brand_slug,p_period_start,p_period_end,p_location_id);
 cfg:=public.pos_signal_rule_config(p_brand_slug,'sales_change',jsonb_build_object('minPreviousOrders',5,'dropPercent',-20,'growthPercent',20));
 IF cfg IS NOT NULL AND (s#>>'{sales,ordersCount,previous}')::numeric >= (cfg->>'minPreviousOrders')::numeric THEN
  IF (s#>>'{sales,netSales,deltaPercent}')::numeric <= (cfg->>'dropPercent')::numeric THEN
   SELECT * INTO emit FROM public.pos_emit_intelligence_signal(b,p_brand_slug,p_location_id,'sales_drop','risk','high',NULL,NULL,NULL,p_period_start,p_period_end,cmp_start,p_period_start,'Ventas '||abs(round((s#>>'{sales,netSales,deltaPercent}')::numeric,0))||'% abajo','net_sales',(s#>>'{sales,netSales,current}')::numeric,(s#>>'{sales,netSales,previous}')::numeric,(s#>>'{sales,netSales,delta}')::numeric,(s#>>'{sales,netSales,deltaPercent}')::numeric,s#>'{sales,netSales}',jsonb_build_object('ordersCurrent',s#>>'{sales,ordersCount,current}','ordersPrevious',s#>>'{sales,ordersCount,previous}'),'sales_drop_v1','sales_drop:'||p_period_start::date||':'||p_period_end::date); made:=made+emit.was_created::int;touched:=touched+1;INSERT INTO pg_temp.signal_run_keys VALUES('sales_drop:'||p_period_start::date||':'||p_period_end::date);
  ELSIF (s#>>'{sales,netSales,deltaPercent}')::numeric >= (cfg->>'growthPercent')::numeric THEN
   SELECT * INTO emit FROM public.pos_emit_intelligence_signal(b,p_brand_slug,p_location_id,'sales_growth','trend','medium',NULL,NULL,NULL,p_period_start,p_period_end,cmp_start,p_period_start,'Ventas +'||round((s#>>'{sales,netSales,deltaPercent}')::numeric,0)||'%','net_sales',(s#>>'{sales,netSales,current}')::numeric,(s#>>'{sales,netSales,previous}')::numeric,(s#>>'{sales,netSales,delta}')::numeric,(s#>>'{sales,netSales,deltaPercent}')::numeric,s#>'{sales,netSales}','{}','sales_growth_v1','sales_growth:'||p_period_start::date||':'||p_period_end::date); made:=made+emit.was_created::int;touched:=touched+1;INSERT INTO pg_temp.signal_run_keys VALUES('sales_growth:'||p_period_start::date||':'||p_period_end::date);
  END IF;
 END IF;
 cfg:=public.pos_signal_rule_config(p_brand_slug,'average_ticket_change',jsonb_build_object('minPreviousOrders',5,'dropPercent',-15,'growthPercent',15));
 IF cfg IS NOT NULL AND (s#>>'{sales,ordersCount,previous}')::numeric >= (cfg->>'minPreviousOrders')::numeric AND (s#>>'{sales,averageTicket,deltaPercent}') IS NOT NULL THEN
  IF (s#>>'{sales,averageTicket,deltaPercent}')::numeric <= (cfg->>'dropPercent')::numeric OR (s#>>'{sales,averageTicket,deltaPercent}')::numeric >= (cfg->>'growthPercent')::numeric THEN
   SELECT * INTO emit FROM public.pos_emit_intelligence_signal(b,p_brand_slug,p_location_id,CASE WHEN (s#>>'{sales,averageTicket,deltaPercent}')::numeric<0 THEN 'average_ticket_drop' ELSE 'average_ticket_growth' END,CASE WHEN (s#>>'{sales,averageTicket,deltaPercent}')::numeric<0 THEN 'risk' ELSE 'opportunity' END,'medium',NULL,NULL,NULL,p_period_start,p_period_end,cmp_start,p_period_start,'Ticket promedio '||CASE WHEN (s#>>'{sales,averageTicket,deltaPercent}')::numeric>=0 THEN '+' ELSE '' END||round((s#>>'{sales,averageTicket,deltaPercent}')::numeric,0)||'%','average_ticket',(s#>>'{sales,averageTicket,current}')::numeric,(s#>>'{sales,averageTicket,previous}')::numeric,(s#>>'{sales,averageTicket,delta}')::numeric,(s#>>'{sales,averageTicket,deltaPercent}')::numeric,s#>'{sales,averageTicket}','{}',CASE WHEN (s#>>'{sales,averageTicket,deltaPercent}')::numeric<0 THEN 'average_ticket_drop_v1' ELSE 'average_ticket_growth_v1' END,'average_ticket:'||p_period_start::date||':'||p_period_end::date);made:=made+emit.was_created::int;touched:=touched+1;INSERT INTO pg_temp.signal_run_keys VALUES('average_ticket:'||p_period_start::date||':'||p_period_end::date);
  END IF;
 END IF;

 -- Product growth/decline, capped to five entities per direction.
 FOR r IN WITH cur AS(SELECT i.variant_id,max(i.product_name) product_name,max(i.variant_name) variant_name,sum(i.quantity) units,sum(i.line_total) sales FROM public.pos_sales s JOIN public.pos_sale_items i ON i.sale_id=s.id WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.sold_at>=p_period_start AND s.sold_at<p_period_end AND(p_location_id IS NULL OR s.location_id=p_location_id)GROUP BY i.variant_id),prev AS(SELECT i.variant_id,sum(i.quantity)units FROM public.pos_sales s JOIN public.pos_sale_items i ON i.sale_id=s.id WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.sold_at>=cmp_start AND s.sold_at<p_period_start AND(p_location_id IS NULL OR s.location_id=p_location_id)GROUP BY i.variant_id), ranked AS(SELECT c.*,p.units previous_units,round((c.units-p.units)*100/NULLIF(p.units,0),2) growth FROM cur c JOIN prev p USING(variant_id)WHERE p.units>0 AND c.units>0), capped AS(SELECT ranked.*,row_number()OVER(PARTITION BY growth>0 ORDER BY abs(growth)DESC,variant_id)rn FROM ranked)SELECT * FROM capped WHERE rn<=5 ORDER BY abs(growth)DESC LOOP
  cfg:=public.pos_signal_rule_config(p_brand_slug,CASE WHEN r.growth>0 THEN 'product_growth' ELSE 'product_decline' END,jsonb_build_object('growthPercent',30,'minUnits',3));
  CONTINUE WHEN cfg IS NULL OR r.previous_units<(cfg->>'minUnits')::numeric OR r.units<(cfg->>'minUnits')::numeric OR abs(r.growth)<(cfg->>'growthPercent')::numeric;
  SELECT * INTO emit FROM public.pos_emit_intelligence_signal(b,p_brand_slug,p_location_id,CASE WHEN r.growth>0 THEN 'product_growth' ELSE 'product_decline' END,'product','medium','variant',r.variant_id::text,r.product_name||' · '||r.variant_name,p_period_start,p_period_end,cmp_start,p_period_start,CASE WHEN r.growth>0 THEN 'Producto creciendo: ' ELSE 'Producto en descenso: ' END||r.product_name,'units_sold',r.units,r.previous_units,r.units-r.previous_units,r.growth,jsonb_build_object('variantId',r.variant_id,'currentUnits',r.units,'previousUnits',r.previous_units,'salesTotal',r.sales),jsonb_build_object('variantId',r.variant_id),CASE WHEN r.growth>0 THEN 'product_growth_v1' ELSE 'product_decline_v1' END,(CASE WHEN r.growth>0 THEN 'product_growth:' ELSE 'product_decline:' END)||r.variant_id||':'||p_period_start::date);made:=made+emit.was_created::int;touched:=touched+1;INSERT INTO pg_temp.signal_run_keys VALUES((CASE WHEN r.growth>0 THEN 'product_growth:' ELSE 'product_decline:' END)||r.variant_id||':'||p_period_start::date)ON CONFLICT DO NOTHING;
 END LOOP;

 -- Inventory state rules: ten most material rows. State keys intentionally exclude period.
 FOR r IN SELECT i.location_id,p.id product_id,p.name product_name,v.id variant_id,v.name variant_name,i.quantity-i.reserved_quantity available,i.minimum_quantity,v.cost,(i.quantity-i.reserved_quantity)*v.cost stock_value,
  COALESCE((SELECT sum(si.quantity) FROM public.pos_sales ss JOIN public.pos_sale_items si ON si.sale_id=ss.id WHERE ss.brand_slug=p_brand_slug AND ss.status='completed' AND ss.location_id=i.location_id AND si.variant_id=v.id AND ss.sold_at>=p_period_start AND ss.sold_at<p_period_end),0) units,
  CASE WHEN EXTRACT(epoch FROM duration)>0 THEN COALESCE((SELECT sum(si.quantity) FROM public.pos_sales ss JOIN public.pos_sale_items si ON si.sale_id=ss.id WHERE ss.brand_slug=p_brand_slug AND ss.status='completed' AND ss.location_id=i.location_id AND si.variant_id=v.id AND ss.sold_at>=p_period_start AND ss.sold_at<p_period_end),0)/(EXTRACT(epoch FROM duration)/86400) END velocity
 FROM public.pos_inventory i JOIN public.pos_product_variants v ON v.id=i.variant_id AND v.active JOIN public.pos_products p ON p.id=v.product_id AND p.active AND p.track_inventory WHERE i.brand_slug=p_brand_slug AND(p_location_id IS NULL OR i.location_id=p_location_id) ORDER BY stock_value DESC LIMIT 200 LOOP
  IF r.available<=0 THEN PERFORM public.pos_emit_intelligence_signal(b,p_brand_slug,r.location_id,'inventory_out_of_stock','inventory','high','variant',r.variant_id::text,r.product_name||' · '||r.variant_name,p_period_start,p_period_end,NULL,NULL,'Sin stock: '||r.product_name,'available_quantity',r.available,NULL,NULL,NULL,jsonb_build_object('availableQuantity',r.available,'minimumQuantity',r.minimum_quantity,'locationId',r.location_id),jsonb_build_object('variantId',r.variant_id,'locationId',r.location_id),'inventory_out_of_stock_v1','inventory_out_of_stock:'||r.location_id||':'||r.variant_id);touched:=touched+1;INSERT INTO pg_temp.signal_run_keys VALUES('inventory_out_of_stock:'||r.location_id||':'||r.variant_id)ON CONFLICT DO NOTHING;
  ELSIF r.minimum_quantity>0 AND r.available<=r.minimum_quantity THEN PERFORM public.pos_emit_intelligence_signal(b,p_brand_slug,r.location_id,'inventory_below_minimum','inventory','medium','variant',r.variant_id::text,r.product_name||' · '||r.variant_name,p_period_start,p_period_end,NULL,NULL,'Stock bajo: '||r.product_name,'available_quantity',r.available,r.minimum_quantity,r.available-r.minimum_quantity,NULL,jsonb_build_object('availableQuantity',r.available,'minimumQuantity',r.minimum_quantity,'locationId',r.location_id),jsonb_build_object('variantId',r.variant_id,'locationId',r.location_id),'inventory_below_minimum_v1','inventory_below_minimum:'||r.location_id||':'||r.variant_id);touched:=touched+1;INSERT INTO pg_temp.signal_run_keys VALUES('inventory_below_minimum:'||r.location_id||':'||r.variant_id)ON CONFLICT DO NOTHING; END IF;
  IF r.velocity>0 AND r.available/r.velocity<=7 THEN PERFORM public.pos_emit_intelligence_signal(b,p_brand_slug,r.location_id,'inventory_low_days','inventory',CASE WHEN r.available/r.velocity<=2 THEN 'high' ELSE 'medium' END,'variant',r.variant_id::text,r.product_name||' · '||r.variant_name,p_period_start,p_period_end,NULL,NULL,'Cobertura baja: '||r.product_name,'days_of_stock',round(r.available/r.velocity,2),NULL,NULL,NULL,jsonb_build_object('daysOfStockEstimate',round(r.available/r.velocity,2),'availableQuantity',r.available,'unitsSoldPeriod',r.units,'locationId',r.location_id),jsonb_build_object('variantId',r.variant_id,'locationId',r.location_id),'inventory_low_days_v1','inventory_low_days:'||r.location_id||':'||r.variant_id);touched:=touched+1;INSERT INTO pg_temp.signal_run_keys VALUES('inventory_low_days:'||r.location_id||':'||r.variant_id)ON CONFLICT DO NOTHING; END IF;
  IF r.available>0 AND r.units=0 AND r.stock_value>0 THEN PERFORM public.pos_emit_intelligence_signal(b,p_brand_slug,r.location_id,'inventory_stagnant','inventory','low','variant',r.variant_id::text,r.product_name||' · '||r.variant_name,p_period_start,p_period_end,NULL,NULL,'Stock sin ventas: '||r.product_name,'units_sold',0,NULL,NULL,NULL,jsonb_build_object('availableQuantity',r.available,'inventoryValue',r.stock_value,'unitsSoldPeriod',0,'locationId',r.location_id),jsonb_build_object('variantId',r.variant_id,'locationId',r.location_id),'inventory_stagnant_v1','inventory_stagnant:'||r.location_id||':'||r.variant_id);touched:=touched+1;INSERT INTO pg_temp.signal_run_keys VALUES('inventory_stagnant:'||r.location_id||':'||r.variant_id)ON CONFLICT DO NOTHING; END IF;
 END LOOP;

 -- Aggregated customer frequency opportunities; requires identified history.
 FOR r IN WITH hist AS(SELECT s.customer_id,s.sold_at,s.total,lag(s.sold_at)OVER(PARTITION BY s.customer_id ORDER BY s.sold_at,s.id)prev FROM public.pos_sales s WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.customer_id IS NOT NULL AND(p_location_id IS NULL OR s.location_id=p_location_id)),facts AS(SELECT customer_id,count(*)orders,sum(total)spend,max(sold_at)last_at,avg(EXTRACT(epoch FROM(sold_at-prev))/86400)FILTER(WHERE prev IS NOT NULL)avg_days FROM hist GROUP BY customer_id), picked AS(SELECT * FROM facts WHERE orders>=2 AND avg_days IS NOT NULL), agg AS(SELECT 'customer_reactivation' kind,count(*)n,jsonb_agg(customer_id ORDER BY spend DESC)FILTER(WHERE EXTRACT(epoch FROM(now()-last_at))/86400 BETWEEN avg_days*.9 AND avg_days*1.5) ids,sum(spend)FILTER(WHERE EXTRACT(epoch FROM(now()-last_at))/86400 BETWEEN avg_days*.9 AND avg_days*1.5) spend FROM picked WHERE EXTRACT(epoch FROM(now()-last_at))/86400 BETWEEN avg_days*.9 AND avg_days*1.5 UNION ALL SELECT 'customer_at_risk',count(*),jsonb_agg(customer_id ORDER BY spend DESC),sum(spend)FROM picked WHERE orders>=3 AND EXTRACT(epoch FROM(now()-last_at))/86400>avg_days*1.5)SELECT * FROM agg WHERE n>0 LOOP
  SELECT * INTO emit FROM public.pos_emit_intelligence_signal(b,p_brand_slug,p_location_id,r.kind,'customer',CASE WHEN r.kind='customer_at_risk' THEN 'high' ELSE 'medium' END,'customer_group',NULL,NULL,p_period_start,p_period_end,NULL,NULL,CASE WHEN r.kind='customer_at_risk' THEN r.n||' clientes fuera de su frecuencia habitual' ELSE r.n||' clientes en ventana de recompra' END,'affected_customers',r.n,NULL,NULL,NULL,jsonb_build_object('affectedCustomers',r.n,'historicalSpend',r.spend),jsonb_build_object('customerIds',(SELECT jsonb_agg(value)FROM(SELECT value FROM jsonb_array_elements(r.ids)LIMIT 10)x)),r.kind||'_v1',r.kind||':'||p_period_end::date);made:=made+emit.was_created::int;touched:=touched+1;INSERT INTO pg_temp.signal_run_keys VALUES(r.kind||':'||p_period_end::date);
 END LOOP;

 -- Data quality and loyalty aggregates.
 IF (s#>>'{sales,completedSalesCount}')::int>=10 AND COALESCE((s#>>'{customers,customerIdentificationRate}')::numeric,0)<50 THEN PERFORM public.pos_emit_intelligence_signal(b,p_brand_slug,p_location_id,'customer_identification_low','risk','medium',NULL,NULL,NULL,p_period_start,p_period_end,NULL,NULL,'Menos de la mitad de las ventas están identificadas','customer_identification_rate',(s#>>'{customers,customerIdentificationRate}')::numeric,NULL,NULL,NULL,jsonb_build_object('completedSales',(s#>>'{sales,completedSalesCount}')::int,'identifiedSales',(s#>>'{customers,identifiedSales}')::int),'{}','customer_identification_low_v1','customer_identification_low:'||p_period_end::date);touched:=touched+1;INSERT INTO pg_temp.signal_run_keys VALUES('customer_identification_low:'||p_period_end::date); END IF;
 IF p_location_id IS NULL THEN
  FOR r IN SELECT vp.id,vp.name,vp.required_visits,count(*) affected,jsonb_agg(m.customer_id ORDER BY m.customer_id) customer_ids FROM public.pos_loyalty_visit_programs vp JOIN public.pos_loyalty_members m ON m.program_id=vp.loyalty_program_id AND m.status='active' LEFT JOIN LATERAL(SELECT COALESCE(sum(CASE e.event_type WHEN 'qualify'THEN 1 ELSE -1 END),0)::int n FROM public.pos_loyalty_visit_events e WHERE e.visit_program_id=vp.id AND e.member_id=m.id)x ON true WHERE vp.brand_slug=p_brand_slug AND vp.active AND mod(x.n,vp.required_visits)=vp.required_visits-1 GROUP BY vp.id,vp.name,vp.required_visits ORDER BY count(*) DESC,vp.id LIMIT 5 LOOP PERFORM public.pos_emit_intelligence_signal(b,p_brand_slug,NULL,'loyalty_near_visit_reward','loyalty','medium','visit_program',r.id::text,r.name,p_period_start,p_period_end,NULL,NULL,r.affected||' clientes a una visita de la recompensa','affected_customers',r.affected,NULL,NULL,NULL,jsonb_build_object('requiredVisits',r.required_visits,'affectedCustomers',r.affected),jsonb_build_object('visitProgramId',r.id,'customerIds',(SELECT jsonb_agg(value)FROM(SELECT value FROM jsonb_array_elements(r.customer_ids)LIMIT 10)x)),'loyalty_near_visit_reward_v1','loyalty_near_visit_reward:'||r.id);INSERT INTO pg_temp.signal_run_keys VALUES('loyalty_near_visit_reward:'||r.id);END LOOP;
  FOR r IN SELECT u.visit_program_id,vp.name,u.reward_id,u.reward_name,count(*)affected,jsonb_agg(DISTINCT m.customer_id)customer_ids FROM public.pos_loyalty_reward_unlocks u JOIN public.pos_loyalty_visit_programs vp ON vp.id=u.visit_program_id JOIN public.pos_loyalty_members m ON m.id=u.member_id WHERE u.brand_slug=p_brand_slug AND u.status='available' GROUP BY u.visit_program_id,vp.name,u.reward_id,u.reward_name ORDER BY count(*) DESC,u.visit_program_id LIMIT 5 LOOP PERFORM public.pos_emit_intelligence_signal(b,p_brand_slug,NULL,'loyalty_unlock_available','loyalty','info','visit_program',r.visit_program_id::text,r.name,p_period_start,p_period_end,NULL,NULL,r.affected||' recompensas disponibles: '||r.reward_name,'available_unlocks',r.affected,NULL,NULL,NULL,jsonb_build_object('availableUnlocks',r.affected,'rewardName',r.reward_name),jsonb_build_object('visitProgramId',r.visit_program_id,'rewardId',r.reward_id,'customerIds',(SELECT jsonb_agg(value)FROM(SELECT value FROM jsonb_array_elements(r.customer_ids)LIMIT 10)x)),'loyalty_unlock_available_v1','loyalty_unlock_available:'||r.visit_program_id||':'||r.reward_id);INSERT INTO pg_temp.signal_run_keys VALUES('loyalty_unlock_available:'||r.visit_program_id||':'||r.reward_id);END LOOP;
 END IF;

 -- Payment concentration, strongest sales window and cross-sell (informational/opportunity).
 FOR r IN SELECT p.payment_method,sum(p.amount)amount,sum(p.amount)*100/NULLIF(sum(sum(p.amount))OVER(),0)share,count(*)transactions FROM public.pos_payments p JOIN public.pos_sales ss ON ss.id=p.sale_id WHERE ss.brand_slug=p_brand_slug AND ss.status='completed' AND ss.sold_at>=p_period_start AND ss.sold_at<p_period_end AND(p_location_id IS NULL OR ss.location_id=p_location_id)GROUP BY p.payment_method ORDER BY share DESC LIMIT 1 LOOP IF r.share>=80 AND r.transactions>=5 THEN PERFORM public.pos_emit_intelligence_signal(b,p_brand_slug,p_location_id,'payment_method_concentration','trend','info','payment_method',r.payment_method,r.payment_method,p_period_start,p_period_end,NULL,NULL,round(r.share,0)||'% de pagos por '||r.payment_method,'payment_share',r.share,NULL,NULL,NULL,jsonb_build_object('paymentMethod',r.payment_method,'amount',r.amount,'transactions',r.transactions),'{}','payment_method_concentration_v1','payment_method_concentration:'||r.payment_method||':'||p_period_end::date);touched:=touched+1;INSERT INTO pg_temp.signal_run_keys VALUES('payment_method_concentration:'||r.payment_method||':'||p_period_end::date);END IF;END LOOP;
 FOR r IN WITH h AS(SELECT EXTRACT(ISODOW FROM(ss.sold_at AT TIME ZONE l.timezone))::int AS dow,EXTRACT(HOUR FROM(ss.sold_at AT TIME ZONE l.timezone))::int AS hour_of_day,sum(ss.total)sales,count(*)orders FROM public.pos_sales ss JOIN public.pos_locations l ON l.id=ss.location_id WHERE ss.brand_slug=p_brand_slug AND ss.status='completed' AND ss.sold_at>=p_period_start AND ss.sold_at<p_period_end AND(p_location_id IS NULL OR ss.location_id=p_location_id)GROUP BY 1,2),a AS(SELECT avg(sales)avg_sales FROM h)SELECT h.* FROM h,a WHERE h.orders>=3 AND h.sales>=a.avg_sales*1.5 ORDER BY h.sales DESC LIMIT 3 LOOP PERFORM public.pos_emit_intelligence_signal(b,p_brand_slug,p_location_id,'strong_sales_window','trend','info','time_window',r.dow||':'||r.hour_of_day,'Día '||r.dow||' · '||r.hour_of_day||':00',p_period_start,p_period_end,NULL,NULL,'Franja fuerte: día '||r.dow||' a las '||r.hour_of_day||':00','net_sales',r.sales,NULL,NULL,NULL,jsonb_build_object('dayOfWeek',r.dow,'hourOfDay',r.hour_of_day,'sales',r.sales,'orders',r.orders),jsonb_build_object('dayOfWeek',r.dow,'hourOfDay',r.hour_of_day),'strong_sales_window_v1','strong_sales_window:'||r.dow||':'||r.hour_of_day||':'||p_period_end::date);touched:=touched+1;INSERT INTO pg_temp.signal_run_keys VALUES('strong_sales_window:'||r.dow||':'||r.hour_of_day||':'||p_period_end::date);END LOOP;
 FOR r IN SELECT value p FROM jsonb_array_elements(public.pos_get_analytics_product_pairs(p_brand_slug,p_period_start,p_period_end,p_location_id,10)) WHERE(value->>'ordersTogether')::int>=5 LOOP PERFORM public.pos_emit_intelligence_signal(b,p_brand_slug,p_location_id,'product_pair_opportunity','opportunity','low','product_pair',(r.p#>>'{productA,id}')||':'||(r.p#>>'{productB,id}'),(r.p#>>'{productA,name}')||' + '||(r.p#>>'{productB,name}'),p_period_start,p_period_end,NULL,NULL,'Productos comprados juntos: '||(r.p#>>'{productA,name}')||' + '||(r.p#>>'{productB,name}'),'orders_together',(r.p->>'ordersTogether')::numeric,NULL,NULL,NULL,r.p,'{}','product_pair_opportunity_v1','product_pair:'||(r.p#>>'{productA,id}')||':'||(r.p#>>'{productB,id}')||':'||p_period_end::date);touched:=touched+1;INSERT INTO pg_temp.signal_run_keys VALUES('product_pair:'||(r.p#>>'{productA,id}')||':'||(r.p#>>'{productB,id}')||':'||p_period_end::date);END LOOP;

 -- Objective state signals disappear when no longer observed. Event/period signals remain historical.
 UPDATE public.pos_intelligence_signals x SET status='resolved',resolved_at=now()
 WHERE x.brand_slug=p_brand_slug AND(p_location_id IS NULL OR x.location_id=p_location_id)
 AND x.status IN('open','acknowledged') AND x.signal_type IN('inventory_out_of_stock','inventory_below_minimum','inventory_low_days','inventory_stagnant','loyalty_near_visit_reward','loyalty_unlock_available')
 AND NOT EXISTS(SELECT 1 FROM pg_temp.signal_run_keys k WHERE k.dedupe_key=x.dedupe_key);
 RETURN jsonb_build_object('generated',(SELECT count(*) FROM public.pos_intelligence_signals x WHERE x.brand_slug=p_brand_slug AND(p_location_id IS NULL OR x.location_id=p_location_id)AND x.created_at>=run_started AND x.last_seen_at>=run_started),'updated',(SELECT count(*) FROM public.pos_intelligence_signals x WHERE x.brand_slug=p_brand_slug AND(p_location_id IS NULL OR x.location_id=p_location_id)AND x.created_at<run_started AND x.last_seen_at>=run_started),'signals',(SELECT COALESCE(jsonb_agg(to_jsonb(q)ORDER BY q.detected_at DESC),'[]')FROM(SELECT id,signal_type,signal_category,severity,title,current_value,evidence,context,detected_at FROM public.pos_intelligence_signals WHERE brand_slug=p_brand_slug AND status='open' AND last_seen_at>=run_started AND(p_location_id IS NULL OR location_id=p_location_id)ORDER BY CASE severity WHEN 'critical'THEN 5 WHEN'high'THEN 4 WHEN'medium'THEN 3 WHEN'low'THEN 2 ELSE 1 END DESC,detected_at DESC LIMIT 20)q));
END $fn$;

CREATE OR REPLACE FUNCTION public.pos_get_intelligence_signals(p_brand_slug text,p_location_id uuid DEFAULT NULL,p_status text DEFAULT 'open',p_category text DEFAULT NULL,p_severity text DEFAULT NULL,p_limit integer DEFAULT 20,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
BEGIN
 PERFORM 1 FROM public.pos_analytics_assert_scope(p_brand_slug,now()-interval '1 microsecond',now(),p_location_id);
 IF p_status IS NOT NULL AND p_status NOT IN('open','acknowledged','resolved','dismissed')THEN RAISE EXCEPTION 'Estado de señal no permitido.';END IF;
 IF p_category IS NOT NULL AND p_category NOT IN('opportunity','risk','anomaly','trend','loyalty','customer','inventory','product')THEN RAISE EXCEPTION 'Categoría de señal no permitida.';END IF;
 IF p_severity IS NOT NULL AND p_severity NOT IN('info','low','medium','high','critical')THEN RAISE EXCEPTION 'Severidad no permitida.';END IF;
 IF p_limit NOT BETWEEN 1 AND 100 OR p_offset<0 THEN RAISE EXCEPTION 'Paginación de señales no válida.';END IF;
 RETURN(SELECT jsonb_build_object('signals',COALESCE(jsonb_agg(to_jsonb(x)ORDER BY x.weight DESC,x.detected_at DESC,x.id),'[]'),'limit',p_limit,'offset',p_offset)FROM(SELECT id,signal_type "signalType",signal_category category,severity,status,entity_type "entityType",entity_id "entityId",entity_name "entityName",period_start "periodStart",period_end "periodEnd",title,metric_key "metricKey",current_value "currentValue",previous_value "previousValue",delta_value "deltaValue",delta_percent "deltaPercent",evidence,context,rule_version "ruleVersion",detected_at "detectedAt",last_seen_at "lastSeenAt",CASE severity WHEN'critical'THEN 5 WHEN'high'THEN 4 WHEN'medium'THEN 3 WHEN'low'THEN 2 ELSE 1 END weight FROM public.pos_intelligence_signals WHERE brand_slug=p_brand_slug AND(p_location_id IS NULL OR location_id=p_location_id)AND(p_status IS NULL OR status=p_status)AND(p_category IS NULL OR signal_category=p_category)AND(p_severity IS NULL OR severity=p_severity)ORDER BY weight DESC,detected_at DESC,id LIMIT p_limit OFFSET p_offset)x);
END $fn$;

DO $acl$ DECLARE r record;BEGIN
 FOR r IN SELECT p.oid::regprocedure sig,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('pos_signal_rule_config','pos_emit_intelligence_signal','pos_generate_intelligence_signals','pos_get_intelligence_signals') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.sig);
  IF r.proname IN('pos_generate_intelligence_signals','pos_get_intelligence_signals')THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',r.sig);END IF;
 END LOOP;
END $acl$;
REVOKE ALL ON FUNCTION public.pos_signals_set_updated_at() FROM PUBLIC,anon,authenticated;
COMMIT;
