-- REPORTS V1C — pos_get_intelligence_signals read alias patch
CREATE OR REPLACE FUNCTION public.pos_get_intelligence_signals(
  p_brand_slug text,
  p_location_id uuid DEFAULT NULL,
  p_status text DEFAULT 'open',
  p_category text DEFAULT NULL,
  p_severity text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM 1
  FROM public.pos_analytics_assert_scope(
    p_brand_slug,
    now() - interval '1 microsecond',
    now(),
    p_location_id
  );

  IF p_status IS NOT NULL
     AND p_status NOT IN ('open', 'acknowledged', 'resolved', 'dismissed') THEN
    RAISE EXCEPTION 'Estado de señal no permitido.';
  END IF;

  IF p_category IS NOT NULL
     AND p_category NOT IN (
       'opportunity', 'risk', 'anomaly', 'trend',
       'loyalty', 'customer', 'inventory', 'product'
     ) THEN
    RAISE EXCEPTION 'Categoría de señal no permitida.';
  END IF;

  IF p_severity IS NOT NULL
     AND p_severity NOT IN ('info', 'low', 'medium', 'high', 'critical') THEN
    RAISE EXCEPTION 'Severidad no permitida.';
  END IF;

  IF p_limit NOT BETWEEN 1 AND 100 OR p_offset < 0 THEN
    RAISE EXCEPTION 'Paginación de señales no válida.';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'signals',
      COALESCE(
        jsonb_agg(
          to_jsonb(x)
          ORDER BY x.weight DESC, x."detectedAt" DESC, x.id
        ),
        '[]'::jsonb
      ),
      'limit', p_limit,
      'offset', p_offset
    )
    FROM (
      SELECT
        id,
        signal_type AS "signalType",
        signal_category AS category,
        severity,
        status,
        entity_type AS "entityType",
        entity_id AS "entityId",
        entity_name AS "entityName",
        period_start AS "periodStart",
        period_end AS "periodEnd",
        title,
        metric_key AS "metricKey",
        current_value AS "currentValue",
        previous_value AS "previousValue",
        delta_value AS "deltaValue",
        delta_percent AS "deltaPercent",
        evidence,
        context,
        rule_version AS "ruleVersion",
        detected_at AS "detectedAt",
        last_seen_at AS "lastSeenAt",
        CASE severity
          WHEN 'critical' THEN 5
          WHEN 'high' THEN 4
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 2
          ELSE 1
        END AS weight
      FROM public.pos_intelligence_signals
      WHERE brand_slug = p_brand_slug
        AND (p_location_id IS NULL OR location_id = p_location_id)
        AND (p_status IS NULL OR status = p_status)
        AND (p_category IS NULL OR signal_category = p_category)
        AND (p_severity IS NULL OR severity = p_severity)
      ORDER BY weight DESC, detected_at DESC, id
      LIMIT p_limit
      OFFSET p_offset
    ) AS x
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.pos_get_intelligence_signals(
  text, uuid, text, text, text, integer, integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.pos_get_intelligence_signals(
  text, uuid, text, text, text, integer, integer
) TO service_role;
