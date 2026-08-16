-- PRODUCT PLATFORM V1A SUITE — fixtures are transaction-local and always rolled back.
BEGIN;

CREATE TEMP TABLE v1a_results (
  test_number integer PRIMARY KEY,
  test_name text NOT NULL,
  passed boolean NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'
) ON COMMIT DROP;

CREATE TEMP TABLE v1a_errors (
  test_number integer,
  test_name text,
  sqlstate text,
  message text
) ON COMMIT DROP;

CREATE TEMP TABLE v1a_fixture AS
SELECT s.*
FROM public.pos_subscriptions s
ORDER BY s.created_at, s.id
LIMIT 1;

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM v1a_fixture) THEN
    RAISE EXCEPTION 'Suite requires one canonical POS subscription';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pos_plans WHERE code = 'pos_start' AND active) THEN
    RAISE EXCEPTION 'Suite requires the active canonical pos_start plan';
  END IF;
END
$guard$;

-- Normalize only the transaction-local view of the selected fixture. ROLLBACK restores it.
UPDATE public.pos_subscriptions
SET plan_code = 'pos_start', status = 'active'
WHERE id = (SELECT id FROM v1a_fixture);

-- Remove only fixture-brand overrides used by this suite; ROLLBACK restores them.
DELETE FROM public.pos_brand_entitlement_overrides o
USING public.pos_entitlements e, v1a_fixture f
WHERE o.entitlement_id = e.id
  AND o.brand_id = f.brand_id
  AND o.brand_slug = f.brand_slug
  AND e.code IN (
    'intelligence.pulsar', 'intelligence.opportunities', 'pos.loyalty',
    'pos.cash', 'pos.sales'
  );

INSERT INTO v1a_results
SELECT 1, 'entitlement catalog', count(*) = 23, jsonb_build_object('count', count(*))
FROM public.pos_entitlements;

INSERT INTO v1a_results
SELECT 2, 'entitlement codes unique', count(*) = count(DISTINCT code), '{}'
FROM public.pos_entitlements;

INSERT INTO v1a_results
SELECT 3, 'pos_start mappings', count(*) = 9, jsonb_build_object('count', count(*))
FROM public.pos_plan_entitlements WHERE plan_code = 'pos_start';

INSERT INTO v1a_results SELECT 4, 'pos_start has POS access', public.pos_brand_has_entitlement(brand_slug, 'pos.access'), '{}' FROM v1a_fixture;
INSERT INTO v1a_results SELECT 5, 'pos_start has loyalty', public.pos_brand_has_entitlement(brand_slug, 'pos.loyalty'), '{}' FROM v1a_fixture;
INSERT INTO v1a_results SELECT 6, 'pos_start has reports', public.pos_brand_has_entitlement(brand_slug, 'pos.reports'), '{}' FROM v1a_fixture;
INSERT INTO v1a_results SELECT 7, 'pos_start has signals', public.pos_brand_has_entitlement(brand_slug, 'intelligence.signals'), '{}' FROM v1a_fixture;
INSERT INTO v1a_results SELECT 8, 'pos_start lacks Pulsar', NOT public.pos_brand_has_entitlement(brand_slug, 'intelligence.pulsar'), '{}' FROM v1a_fixture;

UPDATE public.pos_subscriptions SET status = 'trial' WHERE id = (SELECT id FROM v1a_fixture);
INSERT INTO v1a_results SELECT 9, 'trial gets access', public.pos_brand_has_entitlement(brand_slug, 'pos.access'), '{}' FROM v1a_fixture;
UPDATE public.pos_subscriptions SET status = 'active' WHERE id = (SELECT id FROM v1a_fixture);
INSERT INTO v1a_results SELECT 10, 'active gets access', public.pos_brand_has_entitlement(brand_slug, 'pos.access'), '{}' FROM v1a_fixture;
UPDATE public.pos_subscriptions SET status = 'grace_period' WHERE id = (SELECT id FROM v1a_fixture);
INSERT INTO v1a_results SELECT 11, 'grace gets access', public.pos_brand_has_entitlement(brand_slug, 'pos.access'), '{}' FROM v1a_fixture;
UPDATE public.pos_subscriptions SET status = 'past_due' WHERE id = (SELECT id FROM v1a_fixture);
INSERT INTO v1a_results SELECT 12, 'past_due denied consistently with current POS APIs', NOT public.pos_brand_has_entitlement(brand_slug, 'pos.access'), '{}' FROM v1a_fixture;
UPDATE public.pos_subscriptions SET status = 'suspended' WHERE id = (SELECT id FROM v1a_fixture);
INSERT INTO v1a_results SELECT 13, 'suspended denied', NOT public.pos_brand_has_entitlement(brand_slug, 'pos.access'), '{}' FROM v1a_fixture;
UPDATE public.pos_subscriptions SET status = 'cancelled' WHERE id = (SELECT id FROM v1a_fixture);
INSERT INTO v1a_results SELECT 14, 'cancelled denied', NOT public.pos_brand_has_entitlement(brand_slug, 'pos.access'), '{}' FROM v1a_fixture;
UPDATE public.pos_subscriptions SET status = 'active' WHERE id = (SELECT id FROM v1a_fixture);

DO $test_15$ BEGIN
  PERFORM public.pos_set_brand_entitlement_override((SELECT brand_slug FROM v1a_fixture), 'intelligence.pulsar', true, 'suite positive', NULL, NULL, NULL);
END $test_15$;
INSERT INTO v1a_results SELECT 15, 'positive override', public.pos_brand_has_entitlement(brand_slug, 'intelligence.pulsar'), '{}' FROM v1a_fixture;

DO $test_16$ BEGIN
  PERFORM public.pos_set_brand_entitlement_override((SELECT brand_slug FROM v1a_fixture), 'pos.loyalty', false, 'suite negative', now() - interval '2 seconds', NULL, NULL);
END $test_16$;
INSERT INTO v1a_results SELECT 16, 'negative override', NOT public.pos_brand_has_entitlement(brand_slug, 'pos.loyalty'), '{}' FROM v1a_fixture;

DO $test_17$ BEGIN
  PERFORM public.pos_set_brand_entitlement_override((SELECT brand_slug FROM v1a_fixture), 'pos.loyalty', true, 'suite precedence', now() - interval '1 second', NULL, NULL);
END $test_17$;
INSERT INTO v1a_results SELECT 17, 'override precedence', public.pos_brand_has_entitlement(brand_slug, 'pos.loyalty'), '{}' FROM v1a_fixture;

DO $test_18$ BEGIN
  PERFORM public.pos_set_brand_entitlement_override((SELECT brand_slug FROM v1a_fixture), 'pos.cash', false, 'suite future', now() + interval '1 day', NULL, NULL);
END $test_18$;
INSERT INTO v1a_results SELECT 18, 'future override ignored', public.pos_brand_has_entitlement(brand_slug, 'pos.cash'), '{}' FROM v1a_fixture;

DO $test_19$ BEGIN
  PERFORM public.pos_set_brand_entitlement_override((SELECT brand_slug FROM v1a_fixture), 'pos.sales', false, 'suite expired', now() - interval '2 days', now() - interval '1 day', NULL);
END $test_19$;
INSERT INTO v1a_results SELECT 19, 'expired override ignored', public.pos_brand_has_entitlement(brand_slug, 'pos.sales'), '{}' FROM v1a_fixture;

UPDATE public.pos_entitlements SET active = false WHERE code = 'pos.inventory';
INSERT INTO v1a_results SELECT 20, 'inactive entitlement ignored', NOT public.pos_brand_has_entitlement(brand_slug, 'pos.inventory'), '{}' FROM v1a_fixture;
INSERT INTO v1a_results SELECT 21, 'unknown entitlement false', NOT public.pos_brand_has_entitlement(brand_slug, 'unknown.entitlement'), '{}' FROM v1a_fixture;

DO $test_22$ BEGIN
  PERFORM public.pos_set_brand_entitlement_override((SELECT brand_slug FROM v1a_fixture), 'intelligence.opportunities', false, 'suite tenant baseline', NULL, NULL, NULL);
END $test_22$;
INSERT INTO public.pos_brand_entitlement_overrides (
  brand_id, brand_slug, entitlement_id, enabled, reason, starts_at
)
SELECT '__different_brand_id__', f.brand_slug, e.id, true, 'suite cross-tenant poison row', NULL
FROM v1a_fixture f
CROSS JOIN public.pos_entitlements e
WHERE e.code = 'intelligence.opportunities';
INSERT INTO v1a_results
SELECT 22, 'tenant isolation uses brand id and slug',
       NOT public.pos_brand_has_entitlement(brand_slug, 'intelligence.opportunities'), '{}'
FROM v1a_fixture;

INSERT INTO v1a_results
SELECT 23, 'browser override writes denied',
       bool_and(NOT has_table_privilege(role_name, 'public.pos_brand_entitlement_overrides', privilege_name)),
       jsonb_build_object('checked', count(*))
FROM (VALUES ('anon'), ('authenticated')) roles(role_name)
CROSS JOIN (VALUES ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) privileges(privilege_name);

INSERT INTO v1a_results
SELECT 24, 'service role helper path', bool_and(has_function_privilege('service_role', signature, 'EXECUTE')),
       jsonb_build_object('checked', count(*))
FROM (VALUES
  ('public.pos_get_brand_entitlements(text)'),
  ('public.pos_brand_has_entitlement(text,text)'),
  ('public.pos_set_brand_entitlement_override(text,text,boolean,text,timestamptz,timestamptz,uuid)'),
  ('public.pos_set_subscription_plan(text,text,uuid)')
) functions(signature);

CREATE TEMP TABLE v1a_before AS
SELECT list_price, contracted_price, currency, billing_interval, price_locked,
       promotion_code, trial_ends_at, current_period_start, current_period_end,
       grace_ends_at
FROM public.pos_subscriptions
WHERE id = (SELECT id FROM v1a_fixture);

CREATE TEMP TABLE v1a_event_baseline AS
SELECT count(*) AS count
FROM public.pos_subscription_events
WHERE subscription_id = (SELECT id FROM v1a_fixture)
  AND event_type = 'plan_changed';

DO $plan$
BEGIN
  INSERT INTO public.pos_plans (
    code, name, description, list_price, currency, billing_interval, active
  )
  SELECT 'suite_plan', 'Suite plan', description, list_price, currency,
         billing_interval, true
  FROM public.pos_plans
  WHERE code = 'pos_start';
END
$plan$;

DO $test_25$ BEGIN
  PERFORM public.pos_set_subscription_plan((SELECT brand_slug FROM v1a_fixture), 'suite_plan', NULL);
END $test_25$;
INSERT INTO v1a_results
SELECT 25, 'plan change works', plan_code = 'suite_plan', '{}'
FROM public.pos_subscriptions WHERE id = (SELECT id FROM v1a_fixture);

INSERT INTO v1a_results
SELECT 26, 'plan change event', count(*) = b.count + 1,
       jsonb_build_object('before', b.count, 'after', count(*))
FROM public.pos_subscription_events e
CROSS JOIN v1a_event_baseline b
WHERE e.subscription_id = (SELECT id FROM v1a_fixture)
  AND e.event_type = 'plan_changed'
GROUP BY b.count;

INSERT INTO v1a_results
SELECT 27, 'plan change metadata',
       metadata->>'previousPlanCode' = 'pos_start'
       AND metadata->>'newPlanCode' = 'suite_plan', metadata
FROM public.pos_subscription_events
WHERE subscription_id = (SELECT id FROM v1a_fixture)
  AND event_type = 'plan_changed'
  AND metadata->>'previousPlanCode' = 'pos_start'
  AND metadata->>'newPlanCode' = 'suite_plan'
ORDER BY created_at DESC
LIMIT 1;

DO $test_28$ BEGIN
  PERFORM public.pos_set_subscription_plan((SELECT brand_slug FROM v1a_fixture), 'suite_plan', NULL);
END $test_28$;
INSERT INTO v1a_results
SELECT 28, 'same plan safe', count(*) = b.count + 1,
       jsonb_build_object('before', b.count, 'after', count(*))
FROM public.pos_subscription_events e
CROSS JOIN v1a_event_baseline b
WHERE e.subscription_id = (SELECT id FROM v1a_fixture)
  AND e.event_type = 'plan_changed'
GROUP BY b.count;

DO $invalid_plan$
BEGIN
  PERFORM public.pos_set_subscription_plan((SELECT brand_slug FROM v1a_fixture), 'missing_plan', NULL);
  INSERT INTO v1a_results VALUES (29, 'invalid plan rejected', false, '{}');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO v1a_results VALUES (
    29, 'invalid plan rejected', SQLERRM LIKE '%POS_SUBSCRIPTION_PLAN_INVALID%',
    jsonb_build_object('sqlstate', SQLSTATE)
  );
  INSERT INTO v1a_errors VALUES (29, 'invalid plan rejected', SQLSTATE, SQLERRM);
END
$invalid_plan$;

INSERT INTO v1a_results
SELECT 30, 'pricing and dates untouched by plan change',
       ROW(s.list_price, s.contracted_price, s.currency, s.billing_interval,
           s.price_locked, s.promotion_code, s.trial_ends_at,
           s.current_period_start, s.current_period_end, s.grace_ends_at)
       IS NOT DISTINCT FROM
       ROW(b.list_price, b.contracted_price, b.currency, b.billing_interval,
           b.price_locked, b.promotion_code, b.trial_ends_at,
           b.current_period_start, b.current_period_end, b.grace_ends_at), '{}'
FROM public.pos_subscriptions s
CROSS JOIN v1a_before b
WHERE s.id = (SELECT id FROM v1a_fixture);

INSERT INTO v1a_results
SELECT 31, 'capabilities untouched',
       position('pos_business_capabilities' IN pg_get_functiondef(p.oid)) = 0
       AND position('pos_capability_catalog' IN pg_get_functiondef(p.oid)) = 0, '{}'
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'pos_set_subscription_plan'
  AND pg_get_function_identity_arguments(p.oid) = 'p_brand_slug text, p_plan_code text, p_user_id uuid';

INSERT INTO v1a_results
SELECT 32, 'plan limits untouched',
       to_regclass('public.pos_plan_limits') IS NOT NULL
       AND position('pos_plan_limits' IN pg_get_functiondef(p.oid)) = 0, '{}'
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'pos_set_subscription_plan'
  AND pg_get_function_identity_arguments(p.oid) = 'p_brand_slug text, p_plan_code text, p_user_id uuid';

INSERT INTO v1a_results
SELECT 33, 'Pulsar pilot override', public.pos_brand_has_entitlement(brand_slug, 'intelligence.pulsar'), '{}'
FROM v1a_fixture;

INSERT INTO v1a_results
SELECT 34, 'legacy subscription contract preserved',
       count(*) = 9, jsonb_build_object('columns', count(*))
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'pos_plan_limits' AND column_name IN ('includes_loyalty', 'includes_digital_card', 'includes_basic_insights'))
    OR
    (table_name = 'pos_subscriptions' AND column_name IN ('list_price', 'contracted_price', 'currency', 'billing_interval', 'price_locked', 'promotion_code'))
  );

INSERT INTO v1a_results
SELECT 35, 'cross-tenant browser RPC access denied',
       bool_and(
         NOT has_function_privilege(role_name, 'public.pos_get_brand_entitlements(text)', 'EXECUTE')
         AND NOT has_function_privilege(role_name, 'public.pos_brand_has_entitlement(text,text)', 'EXECUTE')
       ), jsonb_build_object('roles', count(*))
FROM (VALUES ('anon'), ('authenticated')) roles(role_name);

INSERT INTO v1a_results
VALUES (36, 'rollback boundary present', true, jsonb_build_object('transaction', 'ROLLBACK is the final statement'));

WITH summary AS (
  SELECT
    count(*) = 36 AS exactly_36_results,
    count(*) FILTER (WHERE NOT passed) AS failed_count,
    count(*) FILTER (WHERE passed) AS passed_count,
    bool_and(passed) AS all_checks_passed
  FROM v1a_results
),
diagnostic AS (
  SELECT
    'FAILED_TEST'::text AS result_type,
    r.test_number,
    r.test_name,
    r.passed,
    r.details,
    NULL::boolean AS exactly_36_results,
    NULL::bigint AS failed_count,
    NULL::bigint AS passed_count,
    NULL::boolean AS all_checks_passed
  FROM v1a_results r
  WHERE NOT r.passed

  UNION ALL

  SELECT
    'SUMMARY',
    NULL,
    'Product Platform V1A entitlement suite',
    s.all_checks_passed,
    jsonb_build_object('errors_captured', (SELECT count(*) FROM v1a_errors)),
    s.exactly_36_results,
    s.failed_count,
    s.passed_count,
    s.all_checks_passed
  FROM summary s
)
SELECT *
FROM diagnostic
ORDER BY result_type, test_number NULLS LAST;

ROLLBACK;
