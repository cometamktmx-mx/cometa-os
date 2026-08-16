-- Cometa OS Access Foundation V1 functional suite.
-- This suite is transactional and does not mutate memberships or POS data.
BEGIN;

CREATE TEMP TABLE brand_os_access_v1_results (
  test_no integer PRIMARY KEY,
  test_name text NOT NULL,
  passed boolean NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
) ON COMMIT DROP;

CREATE TEMP TABLE brand_os_access_v1_fixture AS
SELECT brand.slug
FROM public.brands brand
ORDER BY brand.created_at, brand.id
LIMIT 1;

CREATE TEMP TABLE brand_os_access_v1_baseline AS
SELECT
  (SELECT count(*) FROM public.user_brand_access) AS memberships,
  (SELECT count(*) FROM public.pos_subscriptions) AS subscriptions,
  (SELECT count(*) FROM public.pos_plans) AS plans,
  (SELECT count(*) FROM public.pos_entitlements) AS entitlements;

DO $preflight$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM brand_os_access_v1_fixture) THEN
    RAISE EXCEPTION 'BRAND_OS_ACCESS_V1_SUITE_BRAND_FIXTURE_REQUIRED';
  END IF;
END
$preflight$;

-- A fixture row is removed only inside this transaction and is restored by ROLLBACK.
DELETE FROM public.brand_os_access
WHERE brand_slug = (SELECT slug FROM brand_os_access_v1_fixture);

INSERT INTO public.brand_os_access (brand_slug, status)
VALUES ((SELECT slug FROM brand_os_access_v1_fixture), 'active');
INSERT INTO brand_os_access_v1_results
SELECT 1, 'active accepted', status = 'active', to_jsonb(access)
FROM public.brand_os_access access
WHERE brand_slug = (SELECT slug FROM brand_os_access_v1_fixture);

UPDATE public.brand_os_access
SET status = 'paused'
WHERE brand_slug = (SELECT slug FROM brand_os_access_v1_fixture);
INSERT INTO brand_os_access_v1_results
SELECT 2, 'paused accepted', status = 'paused', to_jsonb(access)
FROM public.brand_os_access access
WHERE brand_slug = (SELECT slug FROM brand_os_access_v1_fixture);

UPDATE public.brand_os_access
SET status = 'inactive'
WHERE brand_slug = (SELECT slug FROM brand_os_access_v1_fixture);
INSERT INTO brand_os_access_v1_results
SELECT 3, 'inactive accepted', status = 'inactive', to_jsonb(access)
FROM public.brand_os_access access
WHERE brand_slug = (SELECT slug FROM brand_os_access_v1_fixture);

DO $invalid_status$
BEGIN
  BEGIN
    UPDATE public.brand_os_access
    SET status = 'trialing'
    WHERE brand_slug = (SELECT slug FROM brand_os_access_v1_fixture);
    INSERT INTO brand_os_access_v1_results VALUES (4, 'invalid status rejected', false, '{}'::jsonb);
  EXCEPTION WHEN check_violation THEN
    INSERT INTO brand_os_access_v1_results VALUES (4, 'invalid status rejected', true, '{}'::jsonb);
  END;
END
$invalid_status$;

DO $missing_brand$
BEGIN
  BEGIN
    INSERT INTO public.brand_os_access (brand_slug, status)
    VALUES ('brand-os-access-v1-missing-fixture', 'active');
    INSERT INTO brand_os_access_v1_results VALUES (5, 'nonexistent brand rejected by FK', false, '{}'::jsonb);
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO brand_os_access_v1_results VALUES (5, 'nonexistent brand rejected by FK', true, '{}'::jsonb);
  END;
END
$missing_brand$;

DO $duplicate_brand$
BEGIN
  BEGIN
    INSERT INTO public.brand_os_access (brand_slug, status)
    VALUES ((SELECT slug FROM brand_os_access_v1_fixture), 'active');
    INSERT INTO brand_os_access_v1_results VALUES (6, 'duplicate brand rejected', false, '{}'::jsonb);
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO brand_os_access_v1_results VALUES (6, 'duplicate brand rejected', true, '{}'::jsonb);
  END;
END
$duplicate_brand$;

UPDATE public.brand_os_access
SET status = 'inactive',
    started_at = clock_timestamp() - interval '2 days',
    ended_at = clock_timestamp() - interval '1 day'
WHERE brand_slug = (SELECT slug FROM brand_os_access_v1_fixture);
INSERT INTO brand_os_access_v1_results
SELECT 7, 'valid started and ended window accepted', started_at IS NOT NULL AND ended_at >= started_at, to_jsonb(access)
FROM public.brand_os_access access
WHERE brand_slug = (SELECT slug FROM brand_os_access_v1_fixture);

DO $invalid_window$
BEGIN
  BEGIN
    UPDATE public.brand_os_access
    SET started_at = clock_timestamp(),
        ended_at = clock_timestamp() - interval '1 day'
    WHERE brand_slug = (SELECT slug FROM brand_os_access_v1_fixture);
    INSERT INTO brand_os_access_v1_results VALUES (8, 'ended before started rejected', false, '{}'::jsonb);
  EXCEPTION WHEN check_violation THEN
    INSERT INTO brand_os_access_v1_results VALUES (8, 'ended before started rejected', true, '{}'::jsonb);
  END;
END
$invalid_window$;

UPDATE public.brand_os_access
SET status = 'paused', ended_at = NULL
WHERE brand_slug = (SELECT slug FROM brand_os_access_v1_fixture);
INSERT INTO brand_os_access_v1_results
SELECT 9, 'row status can update', status = 'paused', to_jsonb(access)
FROM public.brand_os_access access
WHERE brand_slug = (SELECT slug FROM brand_os_access_v1_fixture);

DO $updated_at$
DECLARE
  v_before timestamptz;
  v_after timestamptz;
BEGIN
  SELECT updated_at INTO v_before
  FROM public.brand_os_access
  WHERE brand_slug = (SELECT slug FROM brand_os_access_v1_fixture);

  PERFORM pg_sleep(0.01);

  UPDATE public.brand_os_access
  SET status = 'inactive'
  WHERE brand_slug = (SELECT slug FROM brand_os_access_v1_fixture);

  SELECT updated_at INTO v_after
  FROM public.brand_os_access
  WHERE brand_slug = (SELECT slug FROM brand_os_access_v1_fixture);

  INSERT INTO brand_os_access_v1_results
  VALUES (10, 'updated_at changes on update', v_after > v_before,
    jsonb_build_object('before', v_before, 'after', v_after));
END
$updated_at$;

DELETE FROM public.brand_os_access
WHERE brand_slug = (SELECT slug FROM brand_os_access_v1_fixture);
INSERT INTO brand_os_access_v1_results
SELECT 11, 'absence remains physical not_configured state', count(*) = 0,
  jsonb_build_object('rows', count(*))
FROM public.brand_os_access
WHERE brand_slug = (SELECT slug FROM brand_os_access_v1_fixture);

INSERT INTO brand_os_access_v1_results
SELECT 12, 'no membership mutation',
  (SELECT count(*) FROM public.user_brand_access) = (
    SELECT memberships FROM brand_os_access_v1_baseline
  ),
  jsonb_build_object(
    'before', (SELECT memberships FROM brand_os_access_v1_baseline),
    'after', (SELECT count(*) FROM public.user_brand_access)
  );

INSERT INTO brand_os_access_v1_results
SELECT 13, 'no POS authority mutation',
  (SELECT count(*) FROM public.pos_subscriptions) = (
    SELECT subscriptions FROM brand_os_access_v1_baseline
  )
  AND (SELECT count(*) FROM public.pos_plans) = (
    SELECT plans FROM brand_os_access_v1_baseline
  )
  AND (SELECT count(*) FROM public.pos_entitlements) = (
    SELECT entitlements FROM brand_os_access_v1_baseline
  ),
  jsonb_build_object(
    'subscriptions', jsonb_build_object(
      'before', (SELECT subscriptions FROM brand_os_access_v1_baseline),
      'after', (SELECT count(*) FROM public.pos_subscriptions)
    ),
    'plans', jsonb_build_object(
      'before', (SELECT plans FROM brand_os_access_v1_baseline),
      'after', (SELECT count(*) FROM public.pos_plans)
    ),
    'entitlements', jsonb_build_object(
      'before', (SELECT entitlements FROM brand_os_access_v1_baseline),
      'after', (SELECT count(*) FROM public.pos_entitlements)
    )
  );

DO $guard$
BEGIN
  IF (SELECT count(*) FROM brand_os_access_v1_results) <> 13 THEN
    RAISE EXCEPTION 'BRAND_OS_ACCESS_V1_EXPECTED_13_TESTS_FOUND_%',
      (SELECT count(*) FROM brand_os_access_v1_results);
  END IF;
END
$guard$;

SELECT test_no, test_name, passed, details
FROM brand_os_access_v1_results
UNION ALL
SELECT 14, 'SUMMARY all_checks_passed', bool_and(passed), jsonb_build_object(
  'passed_count', count(*) FILTER (WHERE passed),
  'failed_count', count(*) FILTER (WHERE NOT passed),
  'all_checks_passed', bool_and(passed)
)
FROM brand_os_access_v1_results
ORDER BY test_no;

ROLLBACK;
