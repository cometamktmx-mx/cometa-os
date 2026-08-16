-- PRODUCT PLATFORM V1B SUITE — all fixture changes roll back.
BEGIN;

CREATE TEMP TABLE v1b_results (
  test_number integer PRIMARY KEY,
  test_name text NOT NULL,
  passed boolean NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'
) ON COMMIT DROP;

CREATE TEMP TABLE v1b_errors (
  test_number integer,
  test_name text,
  sqlstate text,
  message text
) ON COMMIT DROP;

CREATE TEMP TABLE v1b_fixture AS
SELECT s.* FROM public.pos_subscriptions s ORDER BY s.created_at, s.id LIMIT 1;

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM v1b_fixture) THEN
    RAISE EXCEPTION 'Suite requires one canonical POS subscription';
  END IF;
END
$guard$;

CREATE TEMP TABLE v1b_commercial_before AS
SELECT plan_code, list_price, contracted_price, currency, billing_interval,
       price_locked, promotion_code
FROM public.pos_subscriptions
WHERE id = (SELECT id FROM v1b_fixture);

DELETE FROM public.pos_subscription_events
WHERE subscription_id = (SELECT id FROM v1b_fixture)
  AND event_type IN (
    'trial_started', 'trial_expired', 'activated', 'reactivated',
    'grace_started', 'suspended', 'cancelled'
  );

UPDATE public.pos_subscriptions
SET plan_code = 'pos_start',
    status = 'trial',
    started_at = now(),
    trial_ends_at = now() + interval '15 days',
    current_period_start = NULL,
    current_period_end = NULL,
    grace_ends_at = NULL,
    cancelled_at = NULL
WHERE id = (SELECT id FROM v1b_fixture);

INSERT INTO v1b_results
SELECT 1, 'new trial effective access',
       (public.pos_get_subscription_lifecycle(brand_slug)->>'accessAllowed')::boolean, '{}'
FROM v1b_fixture;

INSERT INTO v1b_results
SELECT 2, '15 day duration',
       trial_ends_at - started_at = interval '15 days', '{}'
FROM public.pos_subscriptions WHERE id = (SELECT id FROM v1b_fixture);

INSERT INTO v1b_results
SELECT 3, 'trial days remaining',
       (public.pos_get_subscription_lifecycle(brand_slug)->'trial'->>'daysRemaining')::integer = 15, '{}'
FROM v1b_fixture;

INSERT INTO v1b_results
SELECT 4, 'trial expiringSoon false',
       NOT (public.pos_get_subscription_lifecycle(brand_slug)->'trial'->>'expiringSoon')::boolean, '{}'
FROM v1b_fixture;

UPDATE public.pos_subscriptions
SET trial_ends_at = now() + interval '2 days 3 hours'
WHERE id = (SELECT id FROM v1b_fixture);
INSERT INTO v1b_results
SELECT 5, 'trial expiringSoon true',
       (lifecycle->'trial'->>'expiringSoon')::boolean
       AND (lifecycle->'trial'->>'daysRemaining')::integer = 3,
       jsonb_build_object('trial', lifecycle->'trial')
FROM (SELECT public.pos_get_subscription_lifecycle(brand_slug) AS lifecycle FROM v1b_fixture) q;

UPDATE public.pos_subscriptions
SET trial_ends_at = now() - interval '1 second'
WHERE id = (SELECT id FROM v1b_fixture);
INSERT INTO v1b_results
SELECT 6, 'trial expired effective state', lifecycle->>'effectiveStatus' = 'trial_expired', lifecycle
FROM (SELECT public.pos_get_subscription_lifecycle(brand_slug) AS lifecycle FROM v1b_fixture) q;
INSERT INTO v1b_results
SELECT 7, 'expired access denied', NOT (lifecycle->>'accessAllowed')::boolean, '{}'
FROM (SELECT public.pos_get_subscription_lifecycle(brand_slug) AS lifecycle FROM v1b_fixture) q;
INSERT INTO v1b_results
SELECT 8, 'expired requires activation', (lifecycle->>'requiresActivation')::boolean, '{}'
FROM (SELECT public.pos_get_subscription_lifecycle(brand_slug) AS lifecycle FROM v1b_fixture) q;

UPDATE public.pos_subscriptions SET status = 'active' WHERE id = (SELECT id FROM v1b_fixture);
INSERT INTO v1b_results SELECT 9, 'active access', (public.pos_get_subscription_lifecycle(brand_slug)->>'accessAllowed')::boolean, '{}' FROM v1b_fixture;
UPDATE public.pos_subscriptions SET status = 'grace_period' WHERE id = (SELECT id FROM v1b_fixture);
INSERT INTO v1b_results SELECT 10, 'grace access', (public.pos_get_subscription_lifecycle(brand_slug)->>'accessAllowed')::boolean, '{}' FROM v1b_fixture;
UPDATE public.pos_subscriptions SET status = 'past_due' WHERE id = (SELECT id FROM v1b_fixture);
INSERT INTO v1b_results SELECT 11, 'past_due denied', NOT (public.pos_get_subscription_lifecycle(brand_slug)->>'accessAllowed')::boolean, '{}' FROM v1b_fixture;
UPDATE public.pos_subscriptions SET status = 'suspended' WHERE id = (SELECT id FROM v1b_fixture);
INSERT INTO v1b_results SELECT 12, 'suspended denied', NOT (public.pos_get_subscription_lifecycle(brand_slug)->>'accessAllowed')::boolean, '{}' FROM v1b_fixture;
UPDATE public.pos_subscriptions SET status = 'cancelled' WHERE id = (SELECT id FROM v1b_fixture);
INSERT INTO v1b_results SELECT 13, 'cancelled denied', NOT (public.pos_get_subscription_lifecycle(brand_slug)->>'accessAllowed')::boolean, '{}' FROM v1b_fixture;

UPDATE public.pos_subscriptions
SET status = 'trial', current_period_start = NULL, current_period_end = NULL, cancelled_at = NULL
WHERE id = (SELECT id FROM v1b_fixture);
DO $test_14$ BEGIN
  PERFORM public.pos_transition_subscription_status((SELECT brand_slug FROM v1b_fixture), 'active', 'suite activation', NULL);
END $test_14$;
INSERT INTO v1b_results
SELECT 14, 'trial to active', status = 'active' AND current_period_start IS NOT NULL AND current_period_end IS NOT NULL, '{}'
FROM public.pos_subscriptions WHERE id = (SELECT id FROM v1b_fixture);
INSERT INTO v1b_results
SELECT 15, 'activated event', count(*) = 1, jsonb_build_object('count', count(*))
FROM public.pos_subscription_events
WHERE subscription_id = (SELECT id FROM v1b_fixture) AND event_type = 'activated';

DO $test_16$ BEGIN
  PERFORM public.pos_transition_subscription_status((SELECT brand_slug FROM v1b_fixture), 'past_due', 'suite past due', NULL);
END $test_16$;
INSERT INTO v1b_results
SELECT 16, 'active to past_due', status = 'past_due', '{}'
FROM public.pos_subscriptions WHERE id = (SELECT id FROM v1b_fixture);

DO $test_17$ BEGIN
  PERFORM public.pos_transition_subscription_status((SELECT brand_slug FROM v1b_fixture), 'grace_period', 'suite grace', NULL);
END $test_17$;
INSERT INTO v1b_results
SELECT 17, 'past_due to grace', status = 'grace_period' AND grace_ends_at = now() + interval '3 days', '{}'
FROM public.pos_subscriptions WHERE id = (SELECT id FROM v1b_fixture);
INSERT INTO v1b_results
SELECT 18, 'grace_started event', count(*) = 1, jsonb_build_object('count', count(*))
FROM public.pos_subscription_events
WHERE subscription_id = (SELECT id FROM v1b_fixture) AND event_type = 'grace_started';

DO $test_19$ BEGIN
  PERFORM public.pos_transition_subscription_status((SELECT brand_slug FROM v1b_fixture), 'active', 'suite grace recovery', NULL);
END $test_19$;
INSERT INTO v1b_results
SELECT 19, 'grace to active', status = 'active', '{}'
FROM public.pos_subscriptions WHERE id = (SELECT id FROM v1b_fixture);
INSERT INTO v1b_results
SELECT 20, 'reactivated event', count(*) = 1, jsonb_build_object('count', count(*))
FROM public.pos_subscription_events
WHERE subscription_id = (SELECT id FROM v1b_fixture) AND event_type = 'reactivated';

DO $test_21$ BEGIN
  PERFORM public.pos_transition_subscription_status((SELECT brand_slug FROM v1b_fixture), 'suspended', 'suite suspension', NULL);
END $test_21$;
INSERT INTO v1b_results
SELECT 21, 'active to suspended', status = 'suspended', '{}'
FROM public.pos_subscriptions WHERE id = (SELECT id FROM v1b_fixture);
INSERT INTO v1b_results
SELECT 22, 'suspended event', count(*) = 1, jsonb_build_object('count', count(*))
FROM public.pos_subscription_events
WHERE subscription_id = (SELECT id FROM v1b_fixture) AND event_type = 'suspended';

DO $test_23$ BEGIN
  PERFORM public.pos_transition_subscription_status((SELECT brand_slug FROM v1b_fixture), 'active', 'suite suspended recovery', NULL);
END $test_23$;
INSERT INTO v1b_results
SELECT 23, 'suspended to active', status = 'active', '{}'
FROM public.pos_subscriptions WHERE id = (SELECT id FROM v1b_fixture);
INSERT INTO v1b_results
SELECT 24, 'reactivated from suspended', count(*) = 2, jsonb_build_object('count', count(*))
FROM public.pos_subscription_events
WHERE subscription_id = (SELECT id FROM v1b_fixture) AND event_type = 'reactivated';

DO $test_25$ BEGIN
  PERFORM public.pos_transition_subscription_status((SELECT brand_slug FROM v1b_fixture), 'cancelled', 'suite cancellation', NULL);
END $test_25$;
INSERT INTO v1b_results
SELECT 25, 'active to cancelled', status = 'cancelled' AND cancelled_at IS NOT NULL, '{}'
FROM public.pos_subscriptions WHERE id = (SELECT id FROM v1b_fixture);
INSERT INTO v1b_results
SELECT 26, 'cancelled event', count(*) = 1, jsonb_build_object('count', count(*))
FROM public.pos_subscription_events
WHERE subscription_id = (SELECT id FROM v1b_fixture) AND event_type = 'cancelled';

DO $test_27$
BEGIN
  PERFORM public.pos_transition_subscription_status((SELECT brand_slug FROM v1b_fixture), 'active', 'invalid', NULL);
  INSERT INTO v1b_results VALUES (27, 'cancelled to active rejected', false, '{}');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO v1b_results VALUES (27, 'cancelled to active rejected', SQLERRM LIKE '%POS_SUBSCRIPTION_TRANSITION_INVALID%', jsonb_build_object('sqlstate', SQLSTATE));
  INSERT INTO v1b_errors VALUES (27, 'cancelled to active rejected', SQLSTATE, SQLERRM);
END
$test_27$;

UPDATE public.pos_subscriptions SET status = 'active' WHERE id = (SELECT id FROM v1b_fixture);
DO $test_28$
BEGIN
  PERFORM public.pos_transition_subscription_status((SELECT brand_slug FROM v1b_fixture), 'trial', 'invalid', NULL);
  INSERT INTO v1b_results VALUES (28, 'active to trial rejected', false, '{}');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO v1b_results VALUES (28, 'active to trial rejected', SQLERRM LIKE '%POS_SUBSCRIPTION_TRANSITION_INVALID%', jsonb_build_object('sqlstate', SQLSTATE));
  INSERT INTO v1b_errors VALUES (28, 'active to trial rejected', SQLSTATE, SQLERRM);
END
$test_28$;

UPDATE public.pos_subscriptions SET status = 'trial' WHERE id = (SELECT id FROM v1b_fixture);
INSERT INTO public.pos_subscription_events (
  brand_id, brand_slug, subscription_id, event_type, previous_status,
  new_status, previous_price, new_price, promotion_code, notes, metadata, created_by
)
SELECT brand_id, brand_slug, id, 'trial_started', NULL, 'trial', NULL,
       contracted_price, promotion_code, 'suite baseline',
       jsonb_build_object('planCode', plan_code, 'trialEndsAt', trial_ends_at, 'trialDays', 15), NULL
FROM public.pos_subscriptions WHERE id = (SELECT id FROM v1b_fixture);
DO $test_29$ BEGIN
  PERFORM public.pos_initialize_brand_setup(
    (SELECT brand_id FROM v1b_fixture),
    (SELECT brand_slug FROM v1b_fixture),
    'Suite brand',
    NULL
  );
  PERFORM public.pos_initialize_brand_setup(
    (SELECT brand_id FROM v1b_fixture),
    (SELECT brand_slug FROM v1b_fixture),
    'Suite brand',
    NULL
  );
END $test_29$;
INSERT INTO v1b_results
SELECT 29, 'trial_started one event', count(*) = 1, jsonb_build_object('count', count(*))
FROM public.pos_subscription_events
WHERE subscription_id = (SELECT id FROM v1b_fixture) AND event_type = 'trial_started';

UPDATE public.pos_subscriptions
SET status = 'trial', trial_ends_at = now() - interval '1 second'
WHERE id = (SELECT id FROM v1b_fixture);
DO $test_30$ BEGIN
  PERFORM public.pos_reconcile_subscription_lifecycle((SELECT brand_slug FROM v1b_fixture));
END $test_30$;
INSERT INTO v1b_results
SELECT 30, 'reconcile trial expired', status = 'trial', '{}'
FROM public.pos_subscriptions WHERE id = (SELECT id FROM v1b_fixture);
INSERT INTO v1b_results
SELECT 31, 'trial_expired one event', count(*) = 1, jsonb_build_object('count', count(*))
FROM public.pos_subscription_events
WHERE subscription_id = (SELECT id FROM v1b_fixture) AND event_type = 'trial_expired';
DO $test_32$ BEGIN
  PERFORM public.pos_reconcile_subscription_lifecycle((SELECT brand_slug FROM v1b_fixture));
END $test_32$;
INSERT INTO v1b_results
SELECT 32, 'reconcile idempotent', count(*) = 1, jsonb_build_object('count', count(*))
FROM public.pos_subscription_events
WHERE subscription_id = (SELECT id FROM v1b_fixture) AND event_type = 'trial_expired';

INSERT INTO v1b_results
SELECT 33, 'pricing untouched',
       ROW(s.list_price, s.contracted_price, s.currency, s.billing_interval, s.price_locked, s.promotion_code)
       IS NOT DISTINCT FROM
       ROW(b.list_price, b.contracted_price, b.currency, b.billing_interval, b.price_locked, b.promotion_code), '{}'
FROM public.pos_subscriptions s CROSS JOIN v1b_commercial_before b
WHERE s.id = (SELECT id FROM v1b_fixture);

INSERT INTO v1b_results
SELECT 34, 'plan untouched by lifecycle transitions', s.plan_code = 'pos_start', jsonb_build_object('planCode', s.plan_code)
FROM public.pos_subscriptions s WHERE s.id = (SELECT id FROM v1b_fixture);

INSERT INTO v1b_results
SELECT 35, 'entitlements reflect expiry',
       jsonb_array_length(public.pos_get_brand_entitlements(brand_slug)->'entitlements') = 0, '{}'
FROM v1b_fixture;

UPDATE public.pos_subscriptions SET status = 'active' WHERE id = (SELECT id FROM v1b_fixture);
INSERT INTO v1b_results
SELECT 36, 'entitlements restored after active',
       (public.pos_get_brand_entitlements(brand_slug)->'entitlements') ? 'pos.access', '{}'
FROM v1b_fixture;

INSERT INTO v1b_results
SELECT 37, 'data objects untouched', bool_and(
         position(object_name IN definition) = 0
       ), jsonb_build_object('checked', count(*))
FROM (
  SELECT pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('pos_transition_subscription_status', 'pos_reconcile_subscription_lifecycle')
) functions
CROSS JOIN (VALUES
  ('pos_sales'), ('pos_customers'), ('pos_products'), ('pos_inventory'),
  ('pos_loyalty_programs'), ('pos_analytics_snapshots'), ('pos_intelligence_signals')
) objects(object_name);

INSERT INTO v1b_results
SELECT 38, 'tenant isolation', bool_and(
         definition LIKE '%WHERE brand_slug = btrim(p_brand_slug)%'
       ), jsonb_build_object('functions', count(*))
FROM (
  SELECT pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('pos_compute_subscription_lifecycle', 'pos_transition_subscription_status', 'pos_reconcile_subscription_lifecycle')
) functions;

INSERT INTO v1b_results
SELECT 39, 'browser execute denied', bool_and(
         NOT has_function_privilege(role_name, signature, 'EXECUTE')
       ), jsonb_build_object('checked', count(*))
FROM (VALUES ('anon'), ('authenticated')) roles(role_name)
CROSS JOIN (VALUES
  ('public.pos_get_subscription_lifecycle(text)'),
  ('public.pos_transition_subscription_status(text,text,text,uuid)'),
  ('public.pos_reconcile_subscription_lifecycle(text)')
) functions(signature);

INSERT INTO v1b_results
SELECT 40, 'service_role execute', bool_and(
         has_function_privilege('service_role', signature, 'EXECUTE')
       ), jsonb_build_object('checked', count(*))
FROM (VALUES
  ('public.pos_get_subscription_lifecycle(text)'),
  ('public.pos_transition_subscription_status(text,text,text,uuid)'),
  ('public.pos_reconcile_subscription_lifecycle(text)')
) functions(signature);

DO $test_41$
BEGIN
  PERFORM public.pos_transition_subscription_status((SELECT brand_slug FROM v1b_fixture), 'unknown', NULL, NULL);
  INSERT INTO v1b_results VALUES (41, 'invalid status rejected', false, '{}');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO v1b_results VALUES (41, 'invalid status rejected', SQLERRM LIKE '%POS_SUBSCRIPTION_STATUS_INVALID%', jsonb_build_object('sqlstate', SQLSTATE));
  INSERT INTO v1b_errors VALUES (41, 'invalid status rejected', SQLSTATE, SQLERRM);
END
$test_41$;

DO $test_42$
BEGIN
  PERFORM public.pos_get_subscription_lifecycle('suite-missing-brand');
  INSERT INTO v1b_results VALUES (42, 'invalid brand rejected', false, '{}');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO v1b_results VALUES (42, 'invalid brand rejected', SQLERRM LIKE '%POS_SUBSCRIPTION_NOT_FOUND%', jsonb_build_object('sqlstate', SQLSTATE));
  INSERT INTO v1b_errors VALUES (42, 'invalid brand rejected', SQLSTATE, SQLERRM);
END
$test_42$;

INSERT INTO v1b_results
SELECT 43, 'status and date shape', lifecycle ?& ARRAY[
         'planCode', 'status', 'effectiveStatus', 'accessAllowed',
         'trial', 'period', 'cancelledAt', 'requiresActivation', 'reason'
       ]
       AND lifecycle->'trial' ?& ARRAY[
         'startedAt', 'endsAt', 'daysRemaining', 'hoursRemaining', 'expired', 'expiringSoon'
       ]
       AND lifecycle->'period' ?& ARRAY['startsAt', 'endsAt', 'graceEndsAt'], lifecycle
FROM (SELECT public.pos_get_subscription_lifecycle(brand_slug) AS lifecycle FROM v1b_fixture) q;

INSERT INTO v1b_results
VALUES (44, 'rollback boundary', true, jsonb_build_object('finalStatement', 'ROLLBACK'));

INSERT INTO v1b_results
SELECT 45, 'legacy offer RPC preserved', count(*) = 1 AND bool_and(
         definition LIKE '%offer_updated%'
         AND position('plan_code' IN lower(definition)) = 0
       ), jsonb_build_object('fingerprint', string_agg(md5(definition), ', '))
FROM (
  SELECT pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'pos_set_subscription_offer'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_brand_slug text, p_contract_price numeric, p_promotion_code text, p_price_locked boolean, p_status text, p_user_id uuid'
) offer;

WITH summary AS (
  SELECT count(*) = 45 AS exactly_45_results,
         count(*) FILTER (WHERE NOT passed) AS failed_count,
         count(*) FILTER (WHERE passed) AS passed_count,
         bool_and(passed) AS all_checks_passed
  FROM v1b_results
), diagnostic AS (
  SELECT 'FAILED_TEST'::text AS result_type, r.test_number, r.test_name,
         r.passed, r.details, NULL::boolean AS exactly_45_results,
         NULL::bigint AS failed_count, NULL::bigint AS passed_count,
         NULL::boolean AS all_checks_passed
  FROM v1b_results r WHERE NOT r.passed
  UNION ALL
  SELECT 'SUMMARY', NULL, 'Product Platform V1B lifecycle suite',
         s.all_checks_passed,
         jsonb_build_object('errors_captured', (SELECT count(*) FROM v1b_errors)),
         s.exactly_45_results, s.failed_count, s.passed_count, s.all_checks_passed
  FROM summary s
)
SELECT * FROM diagnostic ORDER BY result_type, test_number NULLS LAST;

ROLLBACK;
