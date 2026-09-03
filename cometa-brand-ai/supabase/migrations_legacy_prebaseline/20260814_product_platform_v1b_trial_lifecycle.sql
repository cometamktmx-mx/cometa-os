-- COMETA PRODUCT PLATFORM V1B — TRIAL & SUBSCRIPTION LIFECYCLE
BEGIN;

-- Preserve the audited initializer body without reconstructing its profile,
-- branding or ON CONFLICT behavior. Only its trial interval is changed.
ALTER FUNCTION public.pos_initialize_brand_setup(text, text, text, uuid)
  RENAME TO pos_initialize_brand_setup_v1a_internal;

DO $migration$
DECLARE
  v_oid oid;
  v_definition text;
  v_occurrences integer;
BEGIN
  SELECT p.oid
  INTO v_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'pos_initialize_brand_setup_v1a_internal'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_brand_id text, p_brand_slug text, p_brand_name text, p_user_id uuid';

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'POS_V1B_INITIALIZER_NOT_FOUND';
  END IF;

  v_definition := pg_get_functiondef(v_oid);
  v_occurrences := (
    length(v_definition) - length(replace(v_definition, '14 days', ''))
  ) / length('14 days');

  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION 'POS_V1B_EXPECTED_ONE_14_DAY_INTERVAL_FOUND_%', v_occurrences;
  END IF;

  EXECUTE replace(v_definition, '14 days', '15 days');
END
$migration$;

CREATE FUNCTION public.pos_initialize_brand_setup(
  p_brand_id text,
  p_brand_slug text,
  p_brand_name text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_result jsonb;
  v_subscription public.pos_subscriptions%ROWTYPE;
  v_subscription_existed boolean;
BEGIN
  IF p_brand_slug IS NULL OR btrim(p_brand_slug) = '' THEN
    RAISE EXCEPTION 'POS_SUBSCRIPTION_BRAND_REQUIRED';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('pos_initialize_brand_setup'),
    hashtext(btrim(p_brand_slug))
  );

  SELECT EXISTS (
    SELECT 1
    FROM public.pos_subscriptions
    WHERE brand_slug = btrim(p_brand_slug)
  )
  INTO v_subscription_existed;

  SELECT public.pos_initialize_brand_setup_v1a_internal(
    p_brand_id,
    p_brand_slug,
    p_brand_name,
    p_user_id
  )
  INTO v_result;

  SELECT *
  INTO v_subscription
  FROM public.pos_subscriptions
  WHERE brand_slug = btrim(p_brand_slug);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_SUBSCRIPTION_INITIALIZATION_FAILED';
  END IF;

  IF NOT v_subscription_existed THEN
    INSERT INTO public.pos_subscription_events (
      brand_id,
      brand_slug,
      subscription_id,
      event_type,
      previous_status,
      new_status,
      previous_price,
      new_price,
      promotion_code,
      notes,
      metadata,
      created_by
    )
    SELECT
      v_subscription.brand_id,
      v_subscription.brand_slug,
      v_subscription.id,
      'trial_started',
      NULL,
      'trial',
      NULL,
      v_subscription.contracted_price,
      v_subscription.promotion_code,
      'Cometa POS trial started.',
      jsonb_build_object(
        'planCode', 'pos_start',
        'trialEndsAt', v_subscription.trial_ends_at,
        'trialDays', 15
      ),
      p_user_id
    WHERE v_subscription.plan_code = 'pos_start'
      AND v_subscription.status = 'trial'
      AND NOT EXISTS (
        SELECT 1
        FROM public.pos_subscription_events event
        WHERE event.subscription_id = v_subscription.id
          AND event.event_type = 'trial_started'
      );
  END IF;

  RETURN v_result;
END
$function$;

CREATE FUNCTION public.pos_compute_subscription_lifecycle(p_brand_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_subscription public.pos_subscriptions%ROWTYPE;
  v_now timestamptz := now();
  v_seconds_remaining numeric := 0;
  v_days_remaining integer := 0;
  v_hours_remaining integer := 0;
  v_trial_expired boolean := false;
  v_expiring_soon boolean := false;
  v_effective_status text;
  v_access_allowed boolean := false;
  v_requires_activation boolean := false;
  v_reason text := NULL;
BEGIN
  IF p_brand_slug IS NULL OR btrim(p_brand_slug) = '' THEN
    RAISE EXCEPTION 'POS_SUBSCRIPTION_BRAND_REQUIRED';
  END IF;

  SELECT *
  INTO v_subscription
  FROM public.pos_subscriptions
  WHERE brand_slug = btrim(p_brand_slug);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_SUBSCRIPTION_NOT_FOUND';
  END IF;

  IF v_subscription.status = 'trial' THEN
    v_trial_expired :=
      v_subscription.trial_ends_at IS NULL
      OR v_subscription.trial_ends_at <= v_now;

    IF NOT v_trial_expired THEN
      v_seconds_remaining := greatest(
        extract(epoch FROM (v_subscription.trial_ends_at - v_now)),
        0
      );
      v_days_remaining := ceil(v_seconds_remaining / 86400.0)::integer;
      v_hours_remaining := ceil(v_seconds_remaining / 3600.0)::integer;
      v_expiring_soon := v_seconds_remaining <= 259200;
    END IF;
  END IF;

  v_effective_status := CASE
    WHEN v_subscription.status = 'trial' AND v_trial_expired THEN 'trial_expired'
    ELSE v_subscription.status
  END;

  v_access_allowed := v_effective_status IN ('trial', 'active', 'grace_period');
  v_requires_activation := v_effective_status IN (
    'trial_expired', 'past_due', 'suspended', 'cancelled'
  );
  v_reason := CASE v_effective_status
    WHEN 'trial_expired' THEN 'TRIAL_EXPIRED'
    WHEN 'past_due' THEN 'PAYMENT_PAST_DUE'
    WHEN 'suspended' THEN 'SUBSCRIPTION_SUSPENDED'
    WHEN 'cancelled' THEN 'SUBSCRIPTION_CANCELLED'
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'planCode', v_subscription.plan_code,
    'status', v_subscription.status,
    'effectiveStatus', v_effective_status,
    'accessAllowed', v_access_allowed,
    'trial', jsonb_build_object(
      'startedAt', v_subscription.started_at,
      'endsAt', v_subscription.trial_ends_at,
      'daysRemaining', v_days_remaining,
      'hoursRemaining', v_hours_remaining,
      'expired', v_trial_expired,
      'expiringSoon', v_expiring_soon
    ),
    'period', jsonb_build_object(
      'startsAt', v_subscription.current_period_start,
      'endsAt', v_subscription.current_period_end,
      'graceEndsAt', v_subscription.grace_ends_at
    ),
    'cancelledAt', v_subscription.cancelled_at,
    'requiresActivation', v_requires_activation,
    'reason', v_reason
  );
END
$function$;

CREATE FUNCTION public.pos_get_subscription_lifecycle(p_brand_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT public.pos_compute_subscription_lifecycle(p_brand_slug)
$function$;

CREATE OR REPLACE FUNCTION public.pos_get_brand_entitlements(p_brand_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  s public.pos_subscriptions%ROWTYPE;
  p public.pos_plans%ROWTYPE;
  lifecycle jsonb;
  allowed boolean;
  codes jsonb := '[]';
  overrides jsonb := '[]';
BEGIN
  IF p_brand_slug IS NULL OR btrim(p_brand_slug) = '' THEN
    RAISE EXCEPTION 'POS_ENTITLEMENTS_BRAND_REQUIRED';
  END IF;

  SELECT * INTO s
  FROM public.pos_subscriptions
  WHERE brand_slug = btrim(p_brand_slug);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_ENTITLEMENTS_SUBSCRIPTION_NOT_FOUND';
  END IF;

  SELECT * INTO p FROM public.pos_plans WHERE code = s.plan_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_ENTITLEMENTS_PLAN_NOT_FOUND';
  END IF;

  lifecycle := public.pos_compute_subscription_lifecycle(s.brand_slug);
  allowed := COALESCE((lifecycle->>'accessAllowed')::boolean, false);

  WITH ranked AS (
    SELECT o.*,
           row_number() OVER (
             PARTITION BY entitlement_id
             ORDER BY starts_at DESC NULLS LAST, created_at DESC, id DESC
           ) AS rn
    FROM public.pos_brand_entitlement_overrides o
    WHERE o.brand_slug = s.brand_slug
      AND o.brand_id = s.brand_id
      AND (o.starts_at IS NULL OR o.starts_at <= now())
      AND (o.ends_at IS NULL OR o.ends_at > now())
  ), effective_overrides AS (
    SELECT * FROM ranked WHERE rn = 1
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'entitlementCode', e.code,
        'enabled', o.enabled,
        'reason', o.reason,
        'startsAt', o.starts_at,
        'endsAt', o.ends_at
      ) ORDER BY e.code
    ),
    '[]'
  )
  INTO overrides
  FROM effective_overrides o
  JOIN public.pos_entitlements e ON e.id = o.entitlement_id;

  IF allowed AND p.active THEN
    WITH ranked AS (
      SELECT o.entitlement_id,
             o.enabled,
             row_number() OVER (
               PARTITION BY entitlement_id
               ORDER BY starts_at DESC NULLS LAST, created_at DESC, id DESC
             ) AS rn
      FROM public.pos_brand_entitlement_overrides o
      WHERE o.brand_slug = s.brand_slug
        AND o.brand_id = s.brand_id
        AND (o.starts_at IS NULL OR o.starts_at <= now())
        AND (o.ends_at IS NULL OR o.ends_at > now())
    ), effective_overrides AS (
      SELECT entitlement_id, enabled FROM ranked WHERE rn = 1
    ), final_entitlements AS (
      SELECT e.code
      FROM public.pos_plan_entitlements pe
      JOIN public.pos_entitlements e
        ON e.id = pe.entitlement_id AND e.active
      LEFT JOIN effective_overrides o ON o.entitlement_id = e.id
      WHERE pe.plan_code = s.plan_code
        AND COALESCE(o.enabled, true)
      UNION
      SELECT e.code
      FROM effective_overrides o
      JOIN public.pos_entitlements e
        ON e.id = o.entitlement_id AND e.active
      WHERE o.enabled
    )
    SELECT COALESCE(jsonb_agg(code ORDER BY code), '[]')
    INTO codes
    FROM final_entitlements;
  END IF;

  RETURN jsonb_build_object(
    'plan', jsonb_build_object('code', p.code, 'name', p.name),
    'subscription', jsonb_build_object(
      'status', s.status,
      'trialEndsAt', s.trial_ends_at,
      'currentPeriodStart', s.current_period_start,
      'currentPeriodEnd', s.current_period_end,
      'graceEndsAt', s.grace_ends_at
    ),
    'entitlements', codes,
    'overrides', overrides
  );
END
$function$;

CREATE FUNCTION public.pos_transition_subscription_status(
  p_brand_slug text,
  p_new_status text,
  p_reason text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS SETOF public.pos_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  s public.pos_subscriptions%ROWTYPE;
  v_previous_status text;
  v_new_status text := lower(btrim(COALESCE(p_new_status, '')));
  v_event_type text;
BEGIN
  IF p_brand_slug IS NULL OR btrim(p_brand_slug) = '' THEN
    RAISE EXCEPTION 'POS_SUBSCRIPTION_BRAND_REQUIRED';
  END IF;

  IF v_new_status NOT IN (
    'trial', 'active', 'past_due', 'grace_period', 'suspended', 'cancelled'
  ) THEN
    RAISE EXCEPTION 'POS_SUBSCRIPTION_STATUS_INVALID';
  END IF;

  SELECT * INTO s
  FROM public.pos_subscriptions
  WHERE brand_slug = btrim(p_brand_slug)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_SUBSCRIPTION_NOT_FOUND';
  END IF;

  v_previous_status := s.status;
  IF v_previous_status = v_new_status THEN
    RETURN NEXT s;
    RETURN;
  END IF;

  IF NOT (
    (v_previous_status = 'trial' AND v_new_status IN ('active', 'suspended', 'cancelled'))
    OR (v_previous_status = 'active' AND v_new_status IN ('past_due', 'suspended', 'cancelled'))
    OR (v_previous_status = 'past_due' AND v_new_status IN ('grace_period', 'active', 'suspended', 'cancelled'))
    OR (v_previous_status = 'grace_period' AND v_new_status IN ('active', 'suspended', 'cancelled'))
    OR (v_previous_status = 'suspended' AND v_new_status IN ('active', 'cancelled'))
  ) THEN
    RAISE EXCEPTION 'POS_SUBSCRIPTION_TRANSITION_INVALID_%_TO_%', v_previous_status, v_new_status;
  END IF;

  v_event_type := CASE
    WHEN v_new_status = 'active' AND v_previous_status = 'trial' THEN 'activated'
    WHEN v_new_status = 'active' THEN 'reactivated'
    WHEN v_new_status = 'grace_period' THEN 'grace_started'
    WHEN v_new_status = 'suspended' THEN 'suspended'
    WHEN v_new_status = 'cancelled' THEN 'cancelled'
    ELSE NULL
  END;

  UPDATE public.pos_subscriptions
  SET
    status = v_new_status,
    current_period_start = CASE
      WHEN v_new_status = 'active' THEN COALESCE(current_period_start, now())
      ELSE current_period_start
    END,
    current_period_end = CASE
      WHEN v_new_status = 'active' THEN COALESCE(current_period_end, now() + interval '1 month')
      ELSE current_period_end
    END,
    grace_ends_at = CASE
      WHEN v_new_status = 'grace_period' THEN COALESCE(grace_ends_at, now() + interval '3 days')
      ELSE grace_ends_at
    END,
    cancelled_at = CASE
      WHEN v_new_status = 'active' THEN NULL
      WHEN v_new_status = 'cancelled' THEN COALESCE(cancelled_at, now())
      ELSE cancelled_at
    END
  WHERE id = s.id
  RETURNING * INTO s;

  IF v_event_type IS NOT NULL THEN
    INSERT INTO public.pos_subscription_events (
      brand_id,
      brand_slug,
      subscription_id,
      event_type,
      previous_status,
      new_status,
      previous_price,
      new_price,
      promotion_code,
      notes,
      metadata,
      created_by
    ) VALUES (
      s.brand_id,
      s.brand_slug,
      s.id,
      v_event_type,
      v_previous_status,
      s.status,
      s.contracted_price,
      s.contracted_price,
      s.promotion_code,
      p_reason,
      jsonb_build_object(
        'previousStatus', v_previous_status,
        'newStatus', s.status,
        'reason', p_reason
      ),
      p_user_id
    );
  END IF;

  RETURN NEXT s;
END
$function$;

CREATE FUNCTION public.pos_reconcile_subscription_lifecycle(p_brand_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  s public.pos_subscriptions%ROWTYPE;
  lifecycle jsonb;
BEGIN
  IF p_brand_slug IS NULL OR btrim(p_brand_slug) = '' THEN
    RAISE EXCEPTION 'POS_SUBSCRIPTION_BRAND_REQUIRED';
  END IF;

  SELECT * INTO s
  FROM public.pos_subscriptions
  WHERE brand_slug = btrim(p_brand_slug)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_SUBSCRIPTION_NOT_FOUND';
  END IF;

  lifecycle := public.pos_compute_subscription_lifecycle(s.brand_slug);

  IF lifecycle->>'effectiveStatus' = 'trial_expired' THEN
    INSERT INTO public.pos_subscription_events (
      brand_id,
      brand_slug,
      subscription_id,
      event_type,
      previous_status,
      new_status,
      previous_price,
      new_price,
      promotion_code,
      notes,
      metadata,
      created_by
    )
    SELECT
      s.brand_id,
      s.brand_slug,
      s.id,
      'trial_expired',
      'trial',
      'trial',
      s.contracted_price,
      s.contracted_price,
      s.promotion_code,
      'Cometa POS trial expired.',
      jsonb_build_object(
        'planCode', s.plan_code,
        'trialEndsAt', s.trial_ends_at,
        'effectiveStatus', 'trial_expired'
      ),
      NULL
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.pos_subscription_events event
      WHERE event.subscription_id = s.id
        AND event.event_type = 'trial_expired'
    );
  END IF;

  RETURN lifecycle;
END
$function$;

REVOKE ALL ON FUNCTION
  public.pos_initialize_brand_setup_v1a_internal(text, text, text, uuid),
  public.pos_compute_subscription_lifecycle(text),
  public.pos_initialize_brand_setup(text, text, text, uuid),
  public.pos_get_subscription_lifecycle(text),
  public.pos_transition_subscription_status(text, text, text, uuid),
  public.pos_reconcile_subscription_lifecycle(text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.pos_initialize_brand_setup(text, text, text, uuid),
  public.pos_get_subscription_lifecycle(text),
  public.pos_transition_subscription_status(text, text, text, uuid),
  public.pos_reconcile_subscription_lifecycle(text)
TO service_role;

COMMIT;
