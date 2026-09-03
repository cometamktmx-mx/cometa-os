-- COMETA POS Plans & Entitlements V1: START / PRO / MULTI.
BEGIN;

-- Keep pos_start intact as a legacy compatibility plan. New catalog prices use
-- the existing numeric pesos convention (not minor currency units).
INSERT INTO public.pos_plans (
  code, name, description, list_price, currency, billing_interval, active
)
VALUES
  ('start', 'Cometa POS Start', 'Operación esencial para una sucursal.', 399.00, 'MXN', 'month', true),
  ('pro', 'Cometa POS Pro', 'Operación, fidelización e inteligencia para crecer.', 499.00, 'MXN', 'month', true),
  ('multi', 'Cometa POS Multi', 'Operación multi-sucursal con límites comerciales ampliados.', 899.00, 'MXN', 'month', true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  list_price = EXCLUDED.list_price,
  currency = EXCLUDED.currency,
  billing_interval = EXCLUDED.billing_interval,
  active = EXCLUDED.active;

-- max_products/max_customers retain the installed legacy defaults. Digital card
-- remains disabled for new plans because Wallet is not part of this release.
INSERT INTO public.pos_plan_limits (
  plan_code, max_locations, max_registers, max_users, max_products,
  max_customers, includes_loyalty, includes_digital_card,
  includes_basic_insights
)
SELECT catalog.plan_code, catalog.max_locations, catalog.max_registers,
       catalog.max_users, legacy.max_products, legacy.max_customers,
       catalog.includes_loyalty, false, true
FROM public.pos_plan_limits legacy
CROSS JOIN (VALUES
  ('start'::text, 1, 1, 2, false),
  ('pro'::text, 1, 2, 5, true),
  ('multi'::text, 4, 8, 10, true)
) AS catalog(plan_code, max_locations, max_registers, max_users, includes_loyalty)
WHERE legacy.plan_code = 'pos_start'
ON CONFLICT (plan_code) DO UPDATE SET
  max_locations = EXCLUDED.max_locations,
  max_registers = EXCLUDED.max_registers,
  max_users = EXCLUDED.max_users,
  includes_loyalty = EXCLUDED.includes_loyalty,
  includes_digital_card = EXCLUDED.includes_digital_card,
  includes_basic_insights = EXCLUDED.includes_basic_insights;

DO $limits_guard$
BEGIN
  IF (SELECT count(*) FROM public.pos_plan_limits WHERE plan_code IN ('start', 'pro', 'multi')) <> 3 THEN
    RAISE EXCEPTION 'POS_PLANS_V1_LIMITS_SEED_FAILED';
  END IF;
END
$limits_guard$;

DELETE FROM public.pos_plan_entitlements
WHERE plan_code IN ('start', 'pro', 'multi');

INSERT INTO public.pos_plan_entitlements (plan_code, entitlement_id)
SELECT mapping.plan_code, entitlement.id
FROM (VALUES
  ('start', 'pos.access'), ('start', 'pos.sales'), ('start', 'pos.cash'),
  ('start', 'pos.products'), ('start', 'pos.inventory'), ('start', 'pos.customers'),
  ('start', 'pos.reports'),
  ('pro', 'pos.access'), ('pro', 'pos.sales'), ('pro', 'pos.cash'),
  ('pro', 'pos.products'), ('pro', 'pos.inventory'), ('pro', 'pos.customers'),
  ('pro', 'pos.reports'), ('pro', 'pos.loyalty'),
  ('pro', 'intelligence.signals'), ('pro', 'intelligence.pulsar'),
  ('multi', 'pos.access'), ('multi', 'pos.sales'), ('multi', 'pos.cash'),
  ('multi', 'pos.products'), ('multi', 'pos.inventory'), ('multi', 'pos.customers'),
  ('multi', 'pos.reports'), ('multi', 'pos.loyalty'),
  ('multi', 'intelligence.signals'), ('multi', 'intelligence.pulsar'),
  ('multi', 'platform.multi_location')
) AS mapping(plan_code, entitlement_code)
JOIN public.pos_entitlements entitlement ON entitlement.code = mapping.entitlement_code
ON CONFLICT DO NOTHING;

-- Migrate only the confirmed legacy trials. Plan changes deliberately preserve
-- started_at, trial_ends_at and subscription price snapshots.
WITH migrated AS (
  UPDATE public.pos_subscriptions subscription
  SET plan_code = 'pro'
  WHERE subscription.plan_code = 'pos_start'
    AND subscription.status = 'trial'
  RETURNING subscription.*
)
INSERT INTO public.pos_subscription_events (
  brand_id, brand_slug, subscription_id, event_type, previous_status,
  new_status, previous_price, new_price, promotion_code, notes, metadata,
  created_by
)
SELECT
  migrated.brand_id,
  migrated.brand_slug,
  migrated.id,
  'plan_changed',
  migrated.status,
  migrated.status,
  migrated.contracted_price,
  migrated.contracted_price,
  migrated.promotion_code,
  'POS Plans & Entitlements V1 catalog migration.',
  jsonb_build_object(
    'previousPlanCode', 'pos_start',
    'newPlanCode', 'pro',
    'migration', '20260814_pos_plans_entitlements_v1',
    'trialDatesPreserved', true
  ),
  NULL
FROM migrated;

-- Preserve the audited V1B initializer and change only the effective default
-- for subscriptions created by this wrapper. The internal initializer remains
-- the authority for the 15-day trial and all operational bootstrap behavior.
CREATE OR REPLACE FUNCTION public.pos_initialize_brand_setup(
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
  v_pro_plan public.pos_plans%ROWTYPE;
BEGIN
  IF p_brand_slug IS NULL OR btrim(p_brand_slug) = '' THEN
    RAISE EXCEPTION 'POS_SUBSCRIPTION_BRAND_REQUIRED';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('pos_initialize_brand_setup'),
    hashtext(btrim(p_brand_slug))
  );

  SELECT EXISTS (
    SELECT 1 FROM public.pos_subscriptions
    WHERE brand_slug = btrim(p_brand_slug)
  ) INTO v_subscription_existed;

  SELECT * INTO v_pro_plan
  FROM public.pos_plans
  WHERE code = 'pro' AND active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_SUBSCRIPTION_DEFAULT_PLAN_NOT_FOUND';
  END IF;

  SELECT public.pos_initialize_brand_setup_v1a_internal(
    p_brand_id, p_brand_slug, p_brand_name, p_user_id
  ) INTO v_result;

  IF NOT v_subscription_existed THEN
    UPDATE public.pos_subscriptions
    SET plan_code = 'pro',
        list_price = v_pro_plan.list_price,
        contracted_price = v_pro_plan.list_price,
        currency = v_pro_plan.currency,
        billing_interval = v_pro_plan.billing_interval
    WHERE brand_slug = btrim(p_brand_slug)
      AND plan_code = 'pos_start'
      AND status = 'trial';
  END IF;

  SELECT * INTO v_subscription
  FROM public.pos_subscriptions
  WHERE brand_slug = btrim(p_brand_slug);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_SUBSCRIPTION_INITIALIZATION_FAILED';
  END IF;

  IF NOT v_subscription_existed THEN
    INSERT INTO public.pos_subscription_events (
      brand_id, brand_slug, subscription_id, event_type, previous_status,
      new_status, previous_price, new_price, promotion_code, notes, metadata,
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
      'Cometa POS Pro trial started.',
      jsonb_build_object(
        'planCode', 'pro',
        'trialEndsAt', v_subscription.trial_ends_at,
        'trialDays', 15
      ),
      p_user_id
    WHERE v_subscription.plan_code = 'pro'
      AND v_subscription.status = 'trial'
      AND NOT EXISTS (
        SELECT 1 FROM public.pos_subscription_events event
        WHERE event.subscription_id = v_subscription.id
          AND event.event_type = 'trial_started'
      );
  END IF;

  RETURN v_result;
END
$function$;

REVOKE ALL ON FUNCTION public.pos_initialize_brand_setup(text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_initialize_brand_setup(text, text, text, uuid)
  TO service_role;

COMMIT;
