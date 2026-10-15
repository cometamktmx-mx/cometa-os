BEGIN;

CREATE TEMP TABLE entry_v1b_results (
  test_no integer PRIMARY KEY,
  test_name text NOT NULL,
  passed boolean NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
) ON COMMIT DROP;

CREATE TEMP TABLE entry_v1b_users AS
SELECT id, row_number() OVER (ORDER BY created_at, id) AS ordinal
FROM auth.users
ORDER BY created_at, id
LIMIT 2;

DO $preflight$
BEGIN
  IF (SELECT count(*) FROM entry_v1b_users) < 2 THEN
    RAISE EXCEPTION 'ENTRY_V1B_SUITE_REQUIRES_TWO_AUTH_USERS';
  END IF;
END
$preflight$;

CREATE TEMP TABLE entry_v1b_baseline AS
SELECT
  (SELECT count(*) FROM public.brands) AS brands_count,
  (SELECT count(*) FROM public.user_brand_access) AS access_count,
  (SELECT count(*) FROM public.pos_subscriptions) AS subscriptions_count,
  (SELECT count(*) FROM public.pos_subscription_events) AS events_count,
  (SELECT count(*) FROM public.pos_locations) AS locations_count,
  (SELECT count(*) FROM public.pos_registers) AS registers_count,
  (SELECT count(*) FROM public.brand_analysis) AS analysis_count,
  (SELECT count(*) FROM public.cosmos_memory) AS memory_count;

CREATE TEMP TABLE entry_v1b_first AS
SELECT public.pos_create_self_service_business_v1(
  'ENTRY V1B Fashion Fixture',
  'fashion',
  (SELECT id FROM entry_v1b_users WHERE ordinal = 1),
  '11111111-1111-4111-8111-111111111111'::uuid
) AS result;

CREATE TEMP TABLE entry_v1b_first_identity AS
SELECT
  result #>> '{brand,id}' AS brand_id,
  result #>> '{brand,slug}' AS brand_slug,
  result #>> '{brand,name}' AS brand_name,
  result #>> '{location,id}' AS location_id,
  result #>> '{register,id}' AS register_id
FROM entry_v1b_first;

INSERT INTO entry_v1b_results
SELECT 1, 'valid business creation', brand_id IS NOT NULL AND brand_slug IS NOT NULL,
  jsonb_build_object('brandId', brand_id, 'brandSlug', brand_slug)
FROM entry_v1b_first_identity;

INSERT INTO entry_v1b_results
SELECT 2, 'brand registry row', EXISTS (
  SELECT 1 FROM public.brands brand WHERE brand.id::text = identity.brand_id
), '{}' FROM entry_v1b_first_identity identity;

INSERT INTO entry_v1b_results
SELECT 3, 'generated slug', brand_slug ~ '^entry-v1b-fashion-fixture(-[0-9]+)?$',
  jsonb_build_object('slug', brand_slug)
FROM entry_v1b_first_identity;

INSERT INTO entry_v1b_results
SELECT 4, 'brand name preserved', brand_name = 'ENTRY V1B Fashion Fixture',
  jsonb_build_object('name', brand_name)
FROM entry_v1b_first_identity;

INSERT INTO entry_v1b_results
SELECT 5, 'creator owner membership', EXISTS (
  SELECT 1 FROM public.user_brand_access access
  WHERE access.user_id = (SELECT id FROM entry_v1b_users WHERE ordinal = 1)
    AND access.brand_slug = identity.brand_slug
    AND access.access_role = 'owner'
    AND access.status = 'active'
), '{}' FROM entry_v1b_first_identity identity;

INSERT INTO entry_v1b_results
SELECT 6, 'subscription created', EXISTS (
  SELECT 1 FROM public.pos_subscriptions subscription WHERE subscription.brand_slug = identity.brand_slug
), '{}' FROM entry_v1b_first_identity identity;

INSERT INTO entry_v1b_results
SELECT 7, 'pos_start plan', subscription.plan_code = 'pos_start', jsonb_build_object('planCode', subscription.plan_code)
FROM public.pos_subscriptions subscription CROSS JOIN entry_v1b_first_identity identity
WHERE subscription.brand_slug = identity.brand_slug;

INSERT INTO entry_v1b_results
SELECT 8, 'trial status', subscription.status = 'trial', jsonb_build_object('status', subscription.status)
FROM public.pos_subscriptions subscription CROSS JOIN entry_v1b_first_identity identity
WHERE subscription.brand_slug = identity.brand_slug;

INSERT INTO entry_v1b_results
SELECT 9, 'trial approximately 15 days',
  subscription.trial_ends_at BETWEEN transaction_timestamp() + interval '14 days 23 hours'
    AND transaction_timestamp() + interval '15 days 1 hour',
  jsonb_build_object('trialEndsAt', subscription.trial_ends_at)
FROM public.pos_subscriptions subscription CROSS JOIN entry_v1b_first_identity identity
WHERE subscription.brand_slug = identity.brand_slug;

INSERT INTO entry_v1b_results
SELECT 10, 'trial_started once', (
  SELECT count(*) FROM public.pos_subscription_events event
  WHERE event.brand_slug = identity.brand_slug AND event.event_type = 'trial_started'
) = 1, '{}' FROM entry_v1b_first_identity identity;

INSERT INTO entry_v1b_results
SELECT 11, 'fashion profile configured', profile.profile_code = 'fashion', jsonb_build_object('profileCode', profile.profile_code)
FROM public.pos_business_profiles profile CROSS JOIN entry_v1b_first_identity identity
WHERE profile.brand_slug = identity.brand_slug;

INSERT INTO entry_v1b_results
SELECT 12, 'fashion capabilities initialized', EXISTS (
  SELECT 1 FROM public.pos_business_capabilities capability
  WHERE capability.brand_slug = identity.brand_slug AND capability.enabled
), '{}' FROM entry_v1b_first_identity identity;

INSERT INTO entry_v1b_results
SELECT 13, 'Principal location created', location.name = 'Principal' AND location.active,
  jsonb_build_object('locationId', location.id, 'code', location.code)
FROM public.pos_locations location CROSS JOIN entry_v1b_first_identity identity
WHERE location.id::text = identity.location_id;

INSERT INTO entry_v1b_results
SELECT 14, 'Caja 1 register created', register.name = 'Caja 1' AND register.status = 'available',
  jsonb_build_object('registerId', register.id, 'code', register.code)
FROM public.pos_registers register CROSS JOIN entry_v1b_first_identity identity
WHERE register.id::text = identity.register_id;

INSERT INTO entry_v1b_results
SELECT 15, 'lifecycle access true',
  COALESCE((public.pos_get_subscription_lifecycle(identity.brand_slug) ->> 'accessAllowed')::boolean, false), '{}'
FROM entry_v1b_first_identity identity;

INSERT INTO entry_v1b_results
SELECT 16, 'effective entitlements present',
  public.pos_brand_has_entitlement(identity.brand_slug, 'pos.access'), '{}'
FROM entry_v1b_first_identity identity;

CREATE TEMP TABLE entry_v1b_replay AS
SELECT public.pos_create_self_service_business_v1(
  'ENTRY V1B Fashion Fixture',
  'fashion',
  (SELECT id FROM entry_v1b_users WHERE ordinal = 1),
  '11111111-1111-4111-8111-111111111111'::uuid
) AS result;

INSERT INTO entry_v1b_results VALUES
(17, 'same key replay succeeds', COALESCE((SELECT (result ->> 'idempotentReplay')::boolean FROM entry_v1b_replay), false), '{}');

INSERT INTO entry_v1b_results
SELECT 18, 'replay same brand id', replay.result #>> '{brand,id}' = identity.brand_id, '{}'
FROM entry_v1b_replay replay CROSS JOIN entry_v1b_first_identity identity;

INSERT INTO entry_v1b_results
SELECT 19, 'replay same slug', replay.result #>> '{brand,slug}' = identity.brand_slug, '{}'
FROM entry_v1b_replay replay CROSS JOIN entry_v1b_first_identity identity;

INSERT INTO entry_v1b_results
SELECT 20, 'no duplicate membership', (SELECT count(*) FROM public.user_brand_access WHERE brand_slug = identity.brand_slug) = 1, '{}'
FROM entry_v1b_first_identity identity;

INSERT INTO entry_v1b_results
SELECT 21, 'no duplicate subscription', (SELECT count(*) FROM public.pos_subscriptions WHERE brand_slug = identity.brand_slug) = 1, '{}'
FROM entry_v1b_first_identity identity;

INSERT INTO entry_v1b_results
SELECT 22, 'no duplicate trial event', (SELECT count(*) FROM public.pos_subscription_events WHERE brand_slug = identity.brand_slug AND event_type = 'trial_started') = 1, '{}'
FROM entry_v1b_first_identity identity;

INSERT INTO entry_v1b_results
SELECT 23, 'no duplicate location', (SELECT count(*) FROM public.pos_locations WHERE brand_slug = identity.brand_slug) = 1, '{}'
FROM entry_v1b_first_identity identity;

INSERT INTO entry_v1b_results
SELECT 24, 'no duplicate register', (SELECT count(*) FROM public.pos_registers WHERE brand_slug = identity.brand_slug) = 1, '{}'
FROM entry_v1b_first_identity identity;

DO $mismatch$
BEGIN
  BEGIN
    PERFORM public.pos_create_self_service_business_v1(
      'ENTRY V1B Changed Payload', 'fashion',
      (SELECT id FROM entry_v1b_users WHERE ordinal = 1),
      '11111111-1111-4111-8111-111111111111'::uuid
    );
    INSERT INTO entry_v1b_results VALUES (25, 'payload mismatch rejected', false, '{"unexpected":"accepted"}');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO entry_v1b_results VALUES (
      25, 'payload mismatch rejected', SQLERRM LIKE '%POS_SELF_SERVICE_IDEMPOTENCY_CONFLICT%', jsonb_build_object('message', SQLERRM)
    );
  END;
END
$mismatch$;

CREATE TEMP TABLE entry_v1b_retail AS
SELECT public.pos_create_self_service_business_v1(
  'ENTRY V1B Retail Fixture', 'retail',
  (SELECT id FROM entry_v1b_users WHERE ordinal = 1),
  '22222222-2222-4222-8222-222222222222'::uuid
) AS result;

INSERT INTO entry_v1b_results VALUES
(26, 'new key creates another business', (SELECT result #>> '{brand,id}' FROM entry_v1b_retail) IS DISTINCT FROM (SELECT brand_id FROM entry_v1b_first_identity), '{}'),
(27, 'retail profile configured', EXISTS (
  SELECT 1 FROM public.pos_business_profiles profile
  WHERE profile.brand_slug = (SELECT result #>> '{brand,slug}' FROM entry_v1b_retail)
    AND profile.profile_code = 'retail'
), '{}'),
(28, 'new business has one location', (
  SELECT count(*) FROM public.pos_locations WHERE brand_slug = (SELECT result #>> '{brand,slug}' FROM entry_v1b_retail)
) = 1, '{}'),
(29, 'new business has one register', (
  SELECT count(*) FROM public.pos_registers WHERE brand_slug = (SELECT result #>> '{brand,slug}' FROM entry_v1b_retail)
) = 1, '{}');

CREATE TEMP TABLE entry_v1b_other_user AS
SELECT public.pos_create_self_service_business_v1(
  'ENTRY V1B Other User Fixture', 'fashion',
  (SELECT id FROM entry_v1b_users WHERE ordinal = 2),
  '11111111-1111-4111-8111-111111111111'::uuid
) AS result;

INSERT INTO entry_v1b_results VALUES
(30, 'same UUID is tenant creator scoped',
  (SELECT result #>> '{brand,id}' FROM entry_v1b_other_user) IS DISTINCT FROM (SELECT brand_id FROM entry_v1b_first_identity), '{}'),
(31, 'other user owns only new business fixture', EXISTS (
  SELECT 1 FROM public.user_brand_access access
  WHERE access.user_id = (SELECT id FROM entry_v1b_users WHERE ordinal = 2)
    AND access.brand_slug = (SELECT result #>> '{brand,slug}' FROM entry_v1b_other_user)
    AND access.access_role = 'owner'
), '{}');

DO $invalid_profile$
BEGIN
  BEGIN
    PERFORM public.pos_create_self_service_business_v1('Invalid Profile', 'restaurant', (SELECT id FROM entry_v1b_users WHERE ordinal = 1), '33333333-3333-4333-8333-333333333333'::uuid);
    INSERT INTO entry_v1b_results VALUES (32, 'invalid profile rejected', false, '{}');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO entry_v1b_results VALUES (32, 'invalid profile rejected', SQLERRM LIKE '%POS_SELF_SERVICE_PROFILE_INVALID%', jsonb_build_object('message', SQLERRM));
  END;
END
$invalid_profile$;

DO $invalid_name$
BEGIN
  BEGIN
    PERFORM public.pos_create_self_service_business_v1(' ', 'fashion', (SELECT id FROM entry_v1b_users WHERE ordinal = 1), '44444444-4444-4444-8444-444444444444'::uuid);
    INSERT INTO entry_v1b_results VALUES (33, 'empty name rejected', false, '{}');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO entry_v1b_results VALUES (33, 'empty name rejected', SQLERRM LIKE '%POS_SELF_SERVICE_BRAND_NAME_INVALID%', jsonb_build_object('message', SQLERRM));
  END;
END
$invalid_name$;

DO $null_key$
BEGIN
  BEGIN
    PERFORM public.pos_create_self_service_business_v1('Null Key', 'fashion', (SELECT id FROM entry_v1b_users WHERE ordinal = 1), NULL);
    INSERT INTO entry_v1b_results VALUES (34, 'null key rejected', false, '{}');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO entry_v1b_results VALUES (34, 'null key rejected', SQLERRM LIKE '%POS_SELF_SERVICE_IDEMPOTENCY_KEY_REQUIRED%', jsonb_build_object('message', SQLERRM));
  END;
END
$null_key$;

INSERT INTO entry_v1b_results
SELECT 35, 'no analysis created', (SELECT count(*) FROM public.brand_analysis) = baseline.analysis_count, '{}'
FROM entry_v1b_baseline baseline;

INSERT INTO entry_v1b_results
SELECT 36, 'no memory created', (SELECT count(*) FROM public.cosmos_memory) = baseline.memory_count, '{}'
FROM entry_v1b_baseline baseline;

INSERT INTO entry_v1b_results VALUES
(37, 'browser RPC execute denied',
  NOT has_function_privilege('anon', 'public.pos_create_self_service_business_v1(text,text,uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.pos_create_self_service_business_v1(text,text,uuid,uuid)', 'EXECUTE'), '{}');

CREATE TEMP TABLE entry_v1b_atomic_baseline AS
SELECT
  (SELECT count(*) FROM public.brands) AS brands_count,
  (SELECT count(*) FROM public.user_brand_access) AS access_count,
  (SELECT count(*) FROM public.pos_subscriptions) AS subscriptions_count,
  (SELECT count(*) FROM public.pos_locations) AS locations_count,
  (SELECT count(*) FROM public.pos_registers) AS registers_count;

CREATE FUNCTION pg_temp.entry_v1b_force_location_failure()
RETURNS trigger
LANGUAGE plpgsql
AS $trigger$
BEGIN
  RAISE EXCEPTION 'ENTRY_V1B_FORCED_LOCATION_FAILURE';
END
$trigger$;

CREATE TRIGGER entry_v1b_force_location_failure
BEFORE INSERT ON public.pos_locations
FOR EACH ROW
EXECUTE FUNCTION pg_temp.entry_v1b_force_location_failure();

DO $atomic_failure$
BEGIN
  BEGIN
    PERFORM public.pos_create_self_service_business_v1(
      'ENTRY V1B Atomic Failure', 'fashion',
      (SELECT id FROM entry_v1b_users WHERE ordinal = 1),
      '55555555-5555-4555-8555-555555555555'::uuid
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%ENTRY_V1B_FORCED_LOCATION_FAILURE%' THEN
      RAISE;
    END IF;
  END;
END
$atomic_failure$;

DROP TRIGGER entry_v1b_force_location_failure ON public.pos_locations;

INSERT INTO entry_v1b_results
SELECT 38, 'downstream failure rolls back whole business',
  (SELECT count(*) FROM public.brands) = baseline.brands_count
  AND (SELECT count(*) FROM public.user_brand_access) = baseline.access_count
  AND (SELECT count(*) FROM public.pos_subscriptions) = baseline.subscriptions_count
  AND (SELECT count(*) FROM public.pos_locations) = baseline.locations_count
  AND (SELECT count(*) FROM public.pos_registers) = baseline.registers_count,
  jsonb_build_object(
    'brandsBefore', baseline.brands_count,
    'brandsAfter', (SELECT count(*) FROM public.brands),
    'locationsBefore', baseline.locations_count,
    'locationsAfter', (SELECT count(*) FROM public.pos_locations)
  )
FROM entry_v1b_atomic_baseline baseline;

INSERT INTO entry_v1b_results VALUES
(39, 'rollback boundary active', txid_current_if_assigned() IS NOT NULL, '{}');

SELECT
  test_no,
  test_name,
  passed,
  details,
  count(*) OVER () = 39 AS exactly_39_results,
  count(*) FILTER (WHERE passed) OVER () AS passed_count,
  count(*) FILTER (WHERE NOT passed) OVER () AS failed_count,
  bool_and(passed) OVER () AS all_checks_passed
FROM entry_v1b_results
ORDER BY test_no;

ROLLBACK;
