-- COMETA POS — REPORTS V1D / PULSAR COMMERCIAL INTELLIGENCE
BEGIN;

CREATE TABLE public.pos_intelligence_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  brand_slug text NOT NULL,
  location_id uuid NULL REFERENCES public.pos_locations(id),
  report_type text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  analytics_snapshot_id uuid NULL REFERENCES public.pos_analytics_snapshots(id),
  signals_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  input_snapshot jsonb NOT NULL,
  executive_summary text NOT NULL,
  health_status text NULL,
  health_score numeric NULL,
  findings jsonb NOT NULL,
  opportunities jsonb NOT NULL,
  risks jsonb NOT NULL,
  hypotheses jsonb NOT NULL,
  recommended_actions jsonb NOT NULL,
  data_quality_notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text NOT NULL,
  prompt_version text NOT NULL,
  schema_version text NOT NULL,
  generation_status text NOT NULL,
  input_hash text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_intelligence_reports_type_ck CHECK(report_type IN('daily','weekly','monthly','manual')),
  CONSTRAINT pos_intelligence_reports_period_ck CHECK(period_end>period_start),
  CONSTRAINT pos_intelligence_reports_health_ck CHECK(health_status IS NULL OR health_status IN('strong','stable','watch','risk','insufficient_data')),
  CONSTRAINT pos_intelligence_reports_score_ck CHECK(health_score IS NULL OR health_score BETWEEN 0 AND 100),
  CONSTRAINT pos_intelligence_reports_status_ck CHECK(generation_status IN('pending','completed','failed')),
  CONSTRAINT pos_intelligence_reports_completed_ck CHECK(generation_status<>'completed' OR btrim(executive_summary)<>''),
  CONSTRAINT pos_intelligence_reports_signals_json_ck CHECK(jsonb_typeof(signals_snapshot)='array'),
  CONSTRAINT pos_intelligence_reports_input_json_ck CHECK(jsonb_typeof(input_snapshot)='object'),
  CONSTRAINT pos_intelligence_reports_findings_json_ck CHECK(jsonb_typeof(findings)='array'),
  CONSTRAINT pos_intelligence_reports_opportunities_json_ck CHECK(jsonb_typeof(opportunities)='array'),
  CONSTRAINT pos_intelligence_reports_risks_json_ck CHECK(jsonb_typeof(risks)='array'),
  CONSTRAINT pos_intelligence_reports_hypotheses_json_ck CHECK(jsonb_typeof(hypotheses)='array'),
  CONSTRAINT pos_intelligence_reports_actions_json_ck CHECK(jsonb_typeof(recommended_actions)='array'),
  CONSTRAINT pos_intelligence_reports_quality_json_ck CHECK(jsonb_typeof(data_quality_notes)='array'),
  CONSTRAINT pos_intelligence_reports_hash_ck CHECK(input_hash~'^[0-9a-f]{64}$'),
  CONSTRAINT pos_intelligence_reports_prompt_ck CHECK(prompt_version='pulsar_v1'),
  CONSTRAINT pos_intelligence_reports_schema_ck CHECK(schema_version='pulsar_report_v1')
);

CREATE UNIQUE INDEX pos_intelligence_reports_idempotency_uidx ON public.pos_intelligence_reports(
  brand_slug,COALESCE(location_id,'00000000-0000-0000-0000-000000000000'::uuid),report_type,
  period_start,period_end,input_hash,prompt_version,model
)WHERE generation_status='completed';
CREATE INDEX pos_intelligence_reports_scope_generated_idx ON public.pos_intelligence_reports(brand_slug,location_id,generated_at DESC);
CREATE INDEX pos_intelligence_reports_scope_type_period_idx ON public.pos_intelligence_reports(brand_slug,report_type,period_end DESC);

ALTER TABLE public.pos_intelligence_reports ENABLE ROW LEVEL SECURITY;
REVOKE INSERT,UPDATE,DELETE ON public.pos_intelligence_reports FROM PUBLIC,anon,authenticated;
REVOKE SELECT ON public.pos_intelligence_reports FROM PUBLIC,anon;
GRANT SELECT ON public.pos_intelligence_reports TO authenticated;
CREATE POLICY pos_intelligence_reports_select ON public.pos_intelligence_reports FOR SELECT TO authenticated USING(public.pos_can_access_brand(brand_slug));

CREATE OR REPLACE FUNCTION public.pos_create_intelligence_report_record(
 p_brand_slug text,p_location_id uuid,p_report_type text,p_period_start timestamptz,p_period_end timestamptz,
 p_analytics_snapshot_id uuid,p_signals_snapshot jsonb,p_input_snapshot jsonb,p_executive_summary text,
 p_health_status text,p_health_score numeric,p_findings jsonb,p_opportunities jsonb,p_risks jsonb,p_hypotheses jsonb,
 p_recommended_actions jsonb,p_data_quality_notes jsonb,p_model text,p_prompt_version text,p_schema_version text,p_input_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE b text; v_row public.pos_intelligence_reports%rowtype;
BEGIN
 SELECT brand_id INTO b FROM public.pos_analytics_assert_scope(p_brand_slug,p_period_start,p_period_end,p_location_id);
 IF p_analytics_snapshot_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.pos_analytics_snapshots s WHERE s.id=p_analytics_snapshot_id AND s.brand_slug=p_brand_slug AND COALESCE(s.location_id,'00000000-0000-0000-0000-000000000000'::uuid)=COALESCE(p_location_id,'00000000-0000-0000-0000-000000000000'::uuid))THEN RAISE EXCEPTION 'El snapshot analítico no pertenece al scope autorizado.';END IF;
 INSERT INTO public.pos_intelligence_reports(brand_id,brand_slug,location_id,report_type,period_start,period_end,analytics_snapshot_id,signals_snapshot,input_snapshot,executive_summary,health_status,health_score,findings,opportunities,risks,hypotheses,recommended_actions,data_quality_notes,model,prompt_version,schema_version,generation_status,input_hash)
 VALUES(b,p_brand_slug,p_location_id,p_report_type,p_period_start,p_period_end,p_analytics_snapshot_id,p_signals_snapshot,p_input_snapshot,p_executive_summary,p_health_status,p_health_score,p_findings,p_opportunities,p_risks,p_hypotheses,p_recommended_actions,p_data_quality_notes,p_model,p_prompt_version,p_schema_version,'completed',p_input_hash)
 ON CONFLICT(brand_slug,COALESCE(location_id,'00000000-0000-0000-0000-000000000000'::uuid),report_type,period_start,period_end,input_hash,prompt_version,model)WHERE generation_status='completed'
 DO NOTHING RETURNING * INTO v_row;
 IF v_row.id IS NULL THEN SELECT * INTO v_row FROM public.pos_intelligence_reports r WHERE r.brand_slug=p_brand_slug AND COALESCE(r.location_id,'00000000-0000-0000-0000-000000000000'::uuid)=COALESCE(p_location_id,'00000000-0000-0000-0000-000000000000'::uuid)AND r.report_type=p_report_type AND r.period_start=p_period_start AND r.period_end=p_period_end AND r.input_hash=p_input_hash AND r.prompt_version=p_prompt_version AND r.model=p_model AND r.generation_status='completed';END IF;
 RETURN to_jsonb(v_row)-'input_snapshot'-'signals_snapshot';
END $fn$;

CREATE OR REPLACE FUNCTION public.pos_get_intelligence_reports(p_brand_slug text,p_location_id uuid DEFAULT NULL,p_limit integer DEFAULT 20,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
BEGIN
 PERFORM 1 FROM public.pos_analytics_assert_scope(p_brand_slug,now()-interval'1 microsecond',now(),p_location_id);
 IF p_limit NOT BETWEEN 1 AND 100 OR p_offset<0 THEN RAISE EXCEPTION 'Paginación de reportes no válida.';END IF;
 RETURN(SELECT jsonb_build_object('reports',COALESCE(jsonb_agg(to_jsonb(x)ORDER BY x."generatedAt"DESC,x.id),'[]'::jsonb),'limit',p_limit,'offset',p_offset)FROM(SELECT id,location_id "locationId",report_type "reportType",period_start "periodStart",period_end "periodEnd",executive_summary "executiveSummary",health_status "healthStatus",health_score "healthScore",model,prompt_version "promptVersion",schema_version "schemaVersion",generated_at "generatedAt"FROM public.pos_intelligence_reports WHERE brand_slug=p_brand_slug AND(p_location_id IS NULL OR location_id=p_location_id)AND generation_status='completed'ORDER BY generated_at DESC,id LIMIT p_limit OFFSET p_offset)x);
END $fn$;

CREATE OR REPLACE FUNCTION public.pos_get_latest_intelligence_report(p_brand_slug text,p_location_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
BEGIN
 PERFORM 1 FROM public.pos_analytics_assert_scope(p_brand_slug,now()-interval'1 microsecond',now(),p_location_id);
 RETURN(SELECT to_jsonb(r)FROM public.pos_intelligence_reports r WHERE r.brand_slug=p_brand_slug AND COALESCE(r.location_id,'00000000-0000-0000-0000-000000000000'::uuid)=COALESCE(p_location_id,'00000000-0000-0000-0000-000000000000'::uuid)AND r.generation_status='completed'ORDER BY r.generated_at DESC,r.id LIMIT 1);
END $fn$;

CREATE OR REPLACE FUNCTION public.pos_get_intelligence_report(p_brand_slug text,p_report_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
DECLARE result jsonb;
BEGIN
 SELECT to_jsonb(r)INTO result FROM public.pos_intelligence_reports r WHERE r.id=p_report_id AND r.brand_slug=p_brand_slug AND r.generation_status='completed';
 IF result IS NULL THEN RAISE EXCEPTION 'El reporte PULSAR no existe o pertenece a otra marca.';END IF;
 RETURN result;
END $fn$;

DO $acl$ DECLARE r record;BEGIN FOR r IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname IN('pos_create_intelligence_report_record','pos_get_intelligence_reports','pos_get_latest_intelligence_report','pos_get_intelligence_report')LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',r.sig);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',r.sig);END LOOP;END $acl$;
COMMIT;
