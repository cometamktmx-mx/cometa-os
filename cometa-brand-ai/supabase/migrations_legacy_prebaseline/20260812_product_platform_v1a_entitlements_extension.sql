-- COMETA PRODUCT PLATFORM V1A — ENTITLEMENTS EXTENSION
BEGIN;

CREATE TABLE public.pos_entitlements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, name text NOT NULL,
 description text NULL, category text NOT NULL, active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT pos_entitlements_code_ck CHECK(code~'^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
 CONSTRAINT pos_entitlements_name_ck CHECK(btrim(name)<>''),
 CONSTRAINT pos_entitlements_category_ck CHECK(category IN('pos','intelligence','growth','automation','agency','platform'))
);
CREATE TABLE public.pos_plan_entitlements (
 plan_code text NOT NULL REFERENCES public.pos_plans(code) ON UPDATE CASCADE ON DELETE CASCADE,
 entitlement_id uuid NOT NULL REFERENCES public.pos_entitlements(id) ON UPDATE CASCADE ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(plan_code,entitlement_id)
);
CREATE TABLE public.pos_brand_entitlement_overrides (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id text NOT NULL, brand_slug text NOT NULL,
 entitlement_id uuid NOT NULL REFERENCES public.pos_entitlements(id) ON UPDATE CASCADE ON DELETE CASCADE,
 enabled boolean NOT NULL, reason text NULL, starts_at timestamptz NULL, ends_at timestamptz NULL,
 created_by uuid NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT pos_brand_entitlement_overrides_window_ck CHECK(ends_at IS NULL OR starts_at IS NULL OR ends_at>starts_at),
 CONSTRAINT pos_brand_entitlement_overrides_slug_ck CHECK(btrim(brand_slug)<>'')
);
CREATE INDEX pos_brand_entitlement_overrides_brand_idx ON public.pos_brand_entitlement_overrides
 (brand_slug,entitlement_id);
CREATE INDEX pos_brand_entitlement_overrides_resolve_idx ON public.pos_brand_entitlement_overrides
 (brand_slug,entitlement_id,starts_at DESC,ends_at,created_at DESC);

CREATE FUNCTION public.pos_entitlements_set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $fn$
BEGIN NEW.updated_at:=now();RETURN NEW;END $fn$;
CREATE TRIGGER pos_entitlements_updated_at BEFORE UPDATE ON public.pos_entitlements
 FOR EACH ROW EXECUTE FUNCTION public.pos_entitlements_set_updated_at();
CREATE TRIGGER pos_brand_entitlement_overrides_updated_at BEFORE UPDATE ON public.pos_brand_entitlement_overrides
 FOR EACH ROW EXECUTE FUNCTION public.pos_entitlements_set_updated_at();

INSERT INTO public.pos_entitlements(code,name,description,category) VALUES
 ('pos.access','Acceso a Cometa POS','Acceso al producto operativo Cometa POS.','pos'),
 ('pos.sales','Ventas','Registro y consulta de ventas.','pos'),('pos.cash','Caja','Operación de caja.','pos'),
 ('pos.products','Productos','Catálogo de productos y variantes.','pos'),('pos.inventory','Inventario','Existencias y movimientos.','pos'),
 ('pos.customers','Clientes','Directorio e historial de clientes.','pos'),('pos.loyalty','Fidelización','Puntos, niveles y visitas.','pos'),
 ('pos.reports','Reportes','Analítica ejecutiva.','pos'),('intelligence.signals','Señales comerciales','Señales deterministas.','intelligence'),
 ('intelligence.pulsar','PULSAR AI','Inteligencia comercial interpretativa.','intelligence'),
 ('intelligence.opportunities','Oportunidades','Oportunidades comerciales estructuradas.','intelligence'),
 ('growth.strategy','Estrategia','Estrategia de crecimiento.','growth'),('growth.calendar','Calendario','Calendario comercial.','growth'),
 ('growth.sales_ai','Sales AI','Asistencia inteligente para ventas.','growth'),('growth.agents','Agentes','Agentes de crecimiento.','growth'),
 ('growth.connections','Conexiones','Conexiones de canales.','growth'),('agency.strategy','Estrategia de agencia','Acompañamiento estratégico.','agency'),
 ('agency.content','Contenido de agencia','Ejecución de contenido.','agency'),('agency.ads','Publicidad de agencia','Gestión de publicidad.','agency'),
 ('agency.account_management','Account management','Acompañamiento de cuenta.','agency'),
 ('platform.multi_location','Múltiples sucursales','Derecho comercial multi-location.','platform'),
 ('platform.advanced_users','Usuarios avanzados','Usuarios avanzados.','platform'),('platform.api_access','Acceso API','Acceso programático.','platform')
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,category=EXCLUDED.category;
INSERT INTO public.pos_plan_entitlements(plan_code,entitlement_id)
SELECT 'pos_start',id FROM public.pos_entitlements WHERE code IN
 ('pos.access','pos.sales','pos.cash','pos.products','pos.inventory','pos.customers','pos.loyalty','pos.reports','intelligence.signals')
AND EXISTS(SELECT 1 FROM public.pos_plans WHERE code='pos_start' AND active)
ON CONFLICT DO NOTHING;

ALTER TABLE public.pos_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_plan_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_brand_entitlement_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY pos_entitlements_select ON public.pos_entitlements FOR SELECT TO authenticated USING(true);
CREATE POLICY pos_plan_entitlements_select ON public.pos_plan_entitlements FOR SELECT TO authenticated USING(true);
CREATE POLICY pos_brand_entitlement_overrides_select ON public.pos_brand_entitlement_overrides FOR SELECT TO authenticated
 USING(public.pos_can_access_brand(brand_slug));
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.pos_entitlements,public.pos_plan_entitlements,public.pos_brand_entitlement_overrides FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.pos_entitlements,public.pos_plan_entitlements,public.pos_brand_entitlement_overrides TO authenticated;

CREATE FUNCTION public.pos_get_brand_entitlements(p_brand_slug text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
DECLARE s public.pos_subscriptions%ROWTYPE;p public.pos_plans%ROWTYPE;allowed boolean;codes jsonb:='[]';overrides jsonb:='[]';
BEGIN
 IF p_brand_slug IS NULL OR btrim(p_brand_slug)='' THEN RAISE EXCEPTION 'POS_ENTITLEMENTS_BRAND_REQUIRED';END IF;
 SELECT * INTO s FROM public.pos_subscriptions WHERE brand_slug=btrim(p_brand_slug);
 IF NOT FOUND THEN RAISE EXCEPTION 'POS_ENTITLEMENTS_SUBSCRIPTION_NOT_FOUND';END IF;
 SELECT * INTO p FROM public.pos_plans WHERE code=s.plan_code;
 IF NOT FOUND THEN RAISE EXCEPTION 'POS_ENTITLEMENTS_PLAN_NOT_FOUND';END IF;
 allowed:=s.status IN('trial','active','grace_period');
 WITH ranked AS(SELECT o.*,row_number()OVER(PARTITION BY entitlement_id ORDER BY starts_at DESC NULLS LAST,created_at DESC,id DESC)rn
  FROM public.pos_brand_entitlement_overrides o WHERE o.brand_slug=s.brand_slug AND o.brand_id=s.brand_id
  AND(o.starts_at IS NULL OR o.starts_at<=now())AND(o.ends_at IS NULL OR o.ends_at>now())),eff AS(SELECT * FROM ranked WHERE rn=1)
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',o.id,'entitlementCode',e.code,'enabled',o.enabled,'reason',o.reason,'startsAt',o.starts_at,'endsAt',o.ends_at)ORDER BY e.code),'[]')
 INTO overrides FROM eff o JOIN public.pos_entitlements e ON e.id=o.entitlement_id;
 IF allowed AND p.active THEN
  WITH ranked AS(SELECT o.entitlement_id,o.enabled,row_number()OVER(PARTITION BY entitlement_id ORDER BY starts_at DESC NULLS LAST,created_at DESC,id DESC)rn
   FROM public.pos_brand_entitlement_overrides o WHERE o.brand_slug=s.brand_slug AND o.brand_id=s.brand_id
   AND(o.starts_at IS NULL OR o.starts_at<=now())AND(o.ends_at IS NULL OR o.ends_at>now())),eff AS(SELECT entitlement_id,enabled FROM ranked WHERE rn=1),final AS(
   SELECT e.code FROM public.pos_plan_entitlements pe JOIN public.pos_entitlements e ON e.id=pe.entitlement_id AND e.active
   LEFT JOIN eff o ON o.entitlement_id=e.id WHERE pe.plan_code=s.plan_code AND COALESCE(o.enabled,true)
   UNION SELECT e.code FROM eff o JOIN public.pos_entitlements e ON e.id=o.entitlement_id AND e.active WHERE o.enabled)
  SELECT COALESCE(jsonb_agg(code ORDER BY code),'[]')INTO codes FROM final;
 END IF;
 RETURN jsonb_build_object('plan',jsonb_build_object('code',p.code,'name',p.name),'subscription',jsonb_build_object(
  'status',s.status,'trialEndsAt',s.trial_ends_at,'currentPeriodStart',s.current_period_start,'currentPeriodEnd',s.current_period_end,'graceEndsAt',s.grace_ends_at),
  'entitlements',codes,'overrides',overrides);
END $fn$;

CREATE FUNCTION public.pos_brand_has_entitlement(p_brand_slug text,p_entitlement_code text)RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$
 SELECT CASE WHEN p_entitlement_code IS NULL OR btrim(p_entitlement_code)='' THEN false
 ELSE COALESCE((public.pos_get_brand_entitlements(p_brand_slug)->'entitlements')?btrim(p_entitlement_code),false)END
$fn$;

CREATE FUNCTION public.pos_set_brand_entitlement_override(p_brand_slug text,p_entitlement_code text,p_enabled boolean,p_reason text DEFAULT NULL,
 p_starts_at timestamptz DEFAULT NULL,p_ends_at timestamptz DEFAULT NULL,p_user_id uuid DEFAULT NULL)RETURNS public.pos_brand_entitlement_overrides
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE s public.pos_subscriptions%ROWTYPE;e public.pos_entitlements%ROWTYPE;o public.pos_brand_entitlement_overrides%ROWTYPE;
BEGIN
 IF p_brand_slug IS NULL OR btrim(p_brand_slug)='' THEN RAISE EXCEPTION 'POS_ENTITLEMENTS_BRAND_REQUIRED';END IF;
 IF p_entitlement_code IS NULL OR btrim(p_entitlement_code)='' THEN RAISE EXCEPTION 'POS_ENTITLEMENTS_CODE_REQUIRED';END IF;
 IF p_enabled IS NULL THEN RAISE EXCEPTION 'POS_ENTITLEMENTS_OVERRIDE_ENABLED_REQUIRED';END IF;
 IF p_ends_at IS NOT NULL AND p_starts_at IS NOT NULL AND p_ends_at<=p_starts_at THEN RAISE EXCEPTION 'POS_ENTITLEMENTS_OVERRIDE_WINDOW_INVALID';END IF;
 SELECT * INTO s FROM public.pos_subscriptions WHERE brand_slug=btrim(p_brand_slug);IF NOT FOUND THEN RAISE EXCEPTION 'POS_ENTITLEMENTS_SUBSCRIPTION_NOT_FOUND';END IF;
 SELECT * INTO e FROM public.pos_entitlements WHERE code=btrim(p_entitlement_code);IF NOT FOUND THEN RAISE EXCEPTION 'POS_ENTITLEMENTS_CODE_NOT_FOUND';END IF;
 INSERT INTO public.pos_brand_entitlement_overrides(brand_id,brand_slug,entitlement_id,enabled,reason,starts_at,ends_at,created_by)
 VALUES(s.brand_id,s.brand_slug,e.id,p_enabled,p_reason,p_starts_at,p_ends_at,p_user_id)RETURNING * INTO o;RETURN o;
END $fn$;

CREATE FUNCTION public.pos_set_subscription_plan(p_brand_slug text,p_plan_code text,p_user_id uuid)RETURNS SETOF public.pos_subscriptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE s public.pos_subscriptions%ROWTYPE;previous_plan text;
BEGIN
 IF p_brand_slug IS NULL OR btrim(p_brand_slug)='' THEN RAISE EXCEPTION 'POS_SUBSCRIPTION_BRAND_REQUIRED';END IF;
 IF p_plan_code IS NULL OR btrim(p_plan_code)='' THEN RAISE EXCEPTION 'POS_SUBSCRIPTION_PLAN_REQUIRED';END IF;
 PERFORM 1 FROM public.pos_plans WHERE code=btrim(p_plan_code)AND active;IF NOT FOUND THEN RAISE EXCEPTION 'POS_SUBSCRIPTION_PLAN_INVALID';END IF;
 SELECT * INTO s FROM public.pos_subscriptions WHERE brand_slug=btrim(p_brand_slug)FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'POS_SUBSCRIPTION_NOT_FOUND';END IF;
 previous_plan:=s.plan_code;IF previous_plan=btrim(p_plan_code)THEN RETURN NEXT s;RETURN;END IF;
 UPDATE public.pos_subscriptions SET plan_code=btrim(p_plan_code)WHERE id=s.id RETURNING * INTO s;
 INSERT INTO public.pos_subscription_events(brand_id,brand_slug,subscription_id,event_type,previous_status,new_status,previous_price,new_price,promotion_code,notes,metadata,created_by)
 VALUES(s.brand_id,s.brand_slug,s.id,'plan_changed',s.status,s.status,s.contracted_price,s.contracted_price,s.promotion_code,'Subscription plan changed.',
 jsonb_build_object('previousPlanCode',previous_plan,'newPlanCode',s.plan_code),p_user_id);
 RETURN NEXT s;
END $fn$;

REVOKE ALL ON FUNCTION public.pos_get_brand_entitlements(text),public.pos_brand_has_entitlement(text,text),
 public.pos_set_brand_entitlement_override(text,text,boolean,text,timestamptz,timestamptz,uuid),public.pos_set_subscription_plan(text,text,uuid),
 public.pos_entitlements_set_updated_at() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pos_get_brand_entitlements(text),public.pos_brand_has_entitlement(text,text),
 public.pos_set_brand_entitlement_override(text,text,boolean,text,timestamptz,timestamptz,uuid),public.pos_set_subscription_plan(text,text,uuid) TO service_role;
COMMIT;
