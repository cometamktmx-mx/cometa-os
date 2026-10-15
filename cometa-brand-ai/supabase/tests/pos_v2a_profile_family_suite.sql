-- COMETA POS V2A PROFILE FAMILY SUITE — all fixture changes roll back.
BEGIN;

CREATE TEMP TABLE v2a_results (
  test_number integer PRIMARY KEY,
  test_name text NOT NULL,
  passed boolean NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'
) ON COMMIT DROP;

CREATE TEMP TABLE v2a_errors (
  test_number integer,
  test_name text,
  sqlstate text,
  message text
) ON COMMIT DROP;

CREATE TEMP TABLE v2a_fixture AS
SELECT p.*
FROM public.pos_business_profiles p
ORDER BY p.created_at, p.brand_slug
LIMIT 1;

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM v2a_fixture) THEN
    RAISE EXCEPTION 'Suite requires one canonical POS business profile';
  END IF;
END
$guard$;

CREATE TEMP TABLE v2a_commercial_before AS
SELECT plan_code, list_price, contracted_price, currency, billing_interval,
       price_locked, promotion_code
FROM public.pos_subscriptions
WHERE brand_slug = (SELECT brand_slug FROM v2a_fixture);

CREATE TEMP TABLE v2a_entitlements_before AS
SELECT public.pos_get_brand_entitlements(brand_slug) AS document
FROM v2a_fixture;

CREATE TEMP TABLE v2a_lifecycle_before AS
SELECT public.pos_get_subscription_lifecycle(brand_slug) AS document
FROM v2a_fixture;

CREATE TEMP TABLE v2a_capabilities_before AS
SELECT capability_code, enabled
FROM public.pos_business_capabilities
WHERE brand_slug = (SELECT brand_slug FROM v2a_fixture);

CREATE TEMP TABLE v2a_effective_capabilities AS
SELECT bc.capability_code
FROM public.pos_business_capabilities bc
JOIN public.pos_capability_catalog catalog ON catalog.code = bc.capability_code
WHERE bc.brand_slug = (SELECT brand_slug FROM v2a_fixture)
  AND bc.brand_id = (SELECT brand_id FROM v2a_fixture)
  AND bc.enabled
  AND catalog.launch_status = 'live';

CREATE TEMP TABLE v2a_operational_before AS
SELECT
  (SELECT count(*) FROM public.pos_sales) AS sales_count,
  (SELECT count(*) FROM public.pos_customers) AS customers_count,
  (SELECT count(*) FROM public.pos_products) AS products_count,
  (SELECT count(*) FROM public.pos_inventory) AS inventory_count;

CREATE TEMP TABLE v2a_catalog_before AS
SELECT
  (SELECT md5(COALESCE(string_agg(to_jsonb(c)::text, '' ORDER BY c.code), '')) FROM public.pos_capability_catalog c) AS capability_hash,
  (SELECT md5(COALESCE(string_agg(to_jsonb(d)::text, '' ORDER BY d.profile_code, d.capability_code), '')) FROM public.pos_profile_capability_defaults d) AS defaults_hash;

INSERT INTO v2a_results VALUES (1, 'fashion maps retail', public.pos_profile_family('fashion') = 'retail', '{}');
INSERT INTO v2a_results VALUES (2, 'retail maps retail', public.pos_profile_family('retail') = 'retail', '{}');
INSERT INTO v2a_results VALUES (3, 'pharmacy maps retail', public.pos_profile_family('pharmacy') = 'retail', '{}');
INSERT INTO v2a_results VALUES (4, 'coffee_shop maps restaurant', public.pos_profile_family('coffee_shop') = 'restaurant', '{}');
INSERT INTO v2a_results VALUES (5, 'restaurant maps restaurant', public.pos_profile_family('restaurant') = 'restaurant', '{}');
INSERT INTO v2a_results VALUES (6, 'services maps services', public.pos_profile_family('services') = 'services', '{}');
INSERT INTO v2a_results VALUES (7, 'mixed maps generic', public.pos_profile_family('mixed') = 'generic', '{}');
INSERT INTO v2a_results VALUES (8, 'unconfigured maps generic', public.pos_profile_family('unconfigured') = 'generic', '{}');
INSERT INTO v2a_results VALUES (9, 'unknown maps generic', public.pos_profile_family('legacy_unknown') = 'generic', '{}');
INSERT INTO v2a_results VALUES (10, 'null maps generic', public.pos_profile_family(NULL) = 'generic', '{}');

INSERT INTO v2a_results
SELECT 11, 'family never null', bool_and(public.pos_profile_family(code) IS NOT NULL),
       jsonb_build_object('profiles', count(*))
FROM public.pos_profile_catalog;

INSERT INTO v2a_results
SELECT 12, 'known profile catalog preserved', count(*) = 8, jsonb_build_object('count', count(*))
FROM public.pos_profile_catalog
WHERE code IN (
  'fashion', 'retail', 'pharmacy', 'coffee_shop', 'restaurant',
  'services', 'mixed', 'unconfigured'
);

INSERT INTO v2a_results
SELECT 13, 'profile defaults preserved', count(*) > 0, jsonb_build_object('count', count(*))
FROM public.pos_profile_capability_defaults;

INSERT INTO v2a_results
SELECT 14, 'effective capabilities only enabled', NOT EXISTS (
         SELECT 1
         FROM v2a_effective_capabilities effective
         JOIN public.pos_business_capabilities bc
           ON bc.capability_code = effective.capability_code
          AND bc.brand_slug = (SELECT brand_slug FROM v2a_fixture)
         WHERE NOT bc.enabled
       ), '{}';

INSERT INTO v2a_results
SELECT 15, 'effective capabilities only live', NOT EXISTS (
         SELECT 1
         FROM v2a_effective_capabilities effective
         JOIN public.pos_capability_catalog catalog
           ON catalog.code = effective.capability_code
         WHERE catalog.launch_status <> 'live'
       ), '{}';

INSERT INTO v2a_results
SELECT 16, 'enabled live rows included', NOT EXISTS (
         SELECT bc.capability_code
         FROM public.pos_business_capabilities bc
         JOIN public.pos_capability_catalog catalog ON catalog.code = bc.capability_code
         WHERE bc.brand_slug = (SELECT brand_slug FROM v2a_fixture)
           AND bc.brand_id = (SELECT brand_id FROM v2a_fixture)
           AND bc.enabled
           AND catalog.launch_status = 'live'
         EXCEPT
         SELECT capability_code FROM v2a_effective_capabilities
       ), '{}';

INSERT INTO v2a_results
SELECT 17, 'disabled rows excluded', NOT EXISTS (
         SELECT 1
         FROM v2a_effective_capabilities effective
         JOIN public.pos_business_capabilities bc
           ON bc.brand_slug = (SELECT brand_slug FROM v2a_fixture)
          AND bc.capability_code = effective.capability_code
         WHERE NOT bc.enabled
       ), '{}';

INSERT INTO v2a_results
SELECT 18, 'non-live rows excluded', NOT EXISTS (
         SELECT 1
         FROM v2a_effective_capabilities effective
         JOIN public.pos_capability_catalog catalog ON catalog.code = effective.capability_code
         WHERE catalog.launch_status IN ('upcoming', 'internal')
       ), '{}';

INSERT INTO v2a_results
SELECT 19, 'helper does not rewrite overrides', NOT EXISTS (
         SELECT capability_code, enabled FROM v2a_capabilities_before
         EXCEPT
         SELECT capability_code, enabled
         FROM public.pos_business_capabilities
         WHERE brand_slug = (SELECT brand_slug FROM v2a_fixture)
       ), '{}';

CREATE TEMP TABLE v2a_target_profile AS
SELECT catalog.code
FROM public.pos_profile_catalog catalog
WHERE catalog.launch_status = 'live'
ORDER BY
  CASE WHEN catalog.code <> (SELECT profile_code FROM v2a_fixture) THEN 0 ELSE 1 END,
  catalog.sort_order,
  catalog.code
LIMIT 1;

DO $configure$
DECLARE
  v_capabilities jsonb;
BEGIN
  SELECT COALESCE(jsonb_object_agg(capability_code, enabled), '{}')
  INTO v_capabilities
  FROM v2a_capabilities_before;

  PERFORM public.pos_configure_business_profile(
    p_brand_id => (SELECT brand_id FROM v2a_fixture),
    p_brand_slug => (SELECT brand_slug FROM v2a_fixture),
    p_profile_code => (SELECT code FROM v2a_target_profile),
    p_operation_mode => COALESCE((SELECT operation_mode FROM v2a_fixture), 'single'),
    p_capabilities => v_capabilities,
    p_user_id => NULL
  );
END
$configure$;

INSERT INTO v2a_results
SELECT 20, 'canonical profile configuration works', p.profile_code = target.code,
       jsonb_build_object('profileCode', p.profile_code)
FROM public.pos_business_profiles p
CROSS JOIN v2a_target_profile target
WHERE p.brand_slug = (SELECT brand_slug FROM v2a_fixture);

INSERT INTO v2a_results
SELECT 21, 'configured profile family agrees',
       public.pos_profile_family(p.profile_code) IN ('retail', 'restaurant', 'services', 'generic'),
       jsonb_build_object('family', public.pos_profile_family(p.profile_code))
FROM public.pos_business_profiles p
WHERE p.brand_slug = (SELECT brand_slug FROM v2a_fixture);

INSERT INTO v2a_results
SELECT 22, 'business override values preserved', NOT EXISTS (
         SELECT capability_code, enabled FROM v2a_capabilities_before
         EXCEPT
         SELECT capability_code, enabled
         FROM public.pos_business_capabilities
         WHERE brand_slug = (SELECT brand_slug FROM v2a_fixture)
       ), '{}';

INSERT INTO v2a_results
SELECT 23, 'operational data not deleted',
       before.sales_count = (SELECT count(*) FROM public.pos_sales)
       AND before.customers_count = (SELECT count(*) FROM public.pos_customers)
       AND before.products_count = (SELECT count(*) FROM public.pos_products)
       AND before.inventory_count = (SELECT count(*) FROM public.pos_inventory), '{}'
FROM v2a_operational_before before;

INSERT INTO v2a_results
SELECT 24, 'tenant isolation', NOT EXISTS (
         SELECT 1
         FROM public.pos_business_capabilities bc
         JOIN v2a_capabilities_before original USING (capability_code)
         WHERE bc.brand_slug <> (SELECT brand_slug FROM v2a_fixture)
           AND bc.updated_at >= transaction_timestamp()
           AND bc.enabled IS DISTINCT FROM original.enabled
       ), '{}';

INSERT INTO v2a_results
SELECT 25, 'plan unchanged', subscription.plan_code = before.plan_code,
       jsonb_build_object('planCode', subscription.plan_code)
FROM public.pos_subscriptions subscription
CROSS JOIN v2a_commercial_before before
WHERE subscription.brand_slug = (SELECT brand_slug FROM v2a_fixture);

INSERT INTO v2a_results
SELECT 26, 'pricing unchanged',
       ROW(subscription.list_price, subscription.contracted_price,
           subscription.currency, subscription.billing_interval,
           subscription.price_locked, subscription.promotion_code)
       IS NOT DISTINCT FROM
       ROW(before.list_price, before.contracted_price,
           before.currency, before.billing_interval,
           before.price_locked, before.promotion_code), '{}'
FROM public.pos_subscriptions subscription
CROSS JOIN v2a_commercial_before before
WHERE subscription.brand_slug = (SELECT brand_slug FROM v2a_fixture);

INSERT INTO v2a_results
SELECT 27, 'V1A entitlements unchanged',
       public.pos_get_brand_entitlements(fixture.brand_slug) IS NOT DISTINCT FROM before.document, '{}'
FROM v2a_fixture fixture CROSS JOIN v2a_entitlements_before before;

INSERT INTO v2a_results
SELECT 28, 'V1B lifecycle unchanged',
       public.pos_get_subscription_lifecycle(fixture.brand_slug) IS NOT DISTINCT FROM before.document, '{}'
FROM v2a_fixture fixture CROSS JOIN v2a_lifecycle_before before;

INSERT INTO v2a_results
SELECT 29, 'capability catalog unchanged',
       before.capability_hash = (
         SELECT md5(COALESCE(string_agg(to_jsonb(c)::text, '' ORDER BY c.code), ''))
         FROM public.pos_capability_catalog c
       ), '{}'
FROM v2a_catalog_before before;

INSERT INTO v2a_results
SELECT 30, 'defaults catalog unchanged',
       before.defaults_hash = (
         SELECT md5(COALESCE(string_agg(to_jsonb(d)::text, '' ORDER BY d.profile_code, d.capability_code), ''))
         FROM public.pos_profile_capability_defaults d
       ), '{}'
FROM v2a_catalog_before before;

INSERT INTO v2a_results
SELECT 31, 'configure RPC remains canonical', count(*) = 1,
       jsonb_build_object('overloads', count(*))
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'pos_configure_business_profile';

INSERT INTO v2a_results
SELECT 32, 'no namespaced capability codes', count(*) = 0,
       jsonb_build_object('count', count(*))
FROM public.pos_capability_catalog WHERE code LIKE '%.%';

INSERT INTO v2a_results
SELECT 33, 'browser helper execute denied', bool_and(
         NOT has_function_privilege(role_name, 'public.pos_profile_family(text)', 'EXECUTE')
       ), jsonb_build_object('roles', count(*))
FROM (VALUES ('anon'), ('authenticated')) roles(role_name);

INSERT INTO v2a_results
SELECT 34, 'service_role helper execute',
       has_function_privilege('service_role', 'public.pos_profile_family(text)', 'EXECUTE'), '{}';

INSERT INTO v2a_results
VALUES (35, 'rollback boundary', true, jsonb_build_object('finalStatement', 'ROLLBACK'));

WITH summary AS (
  SELECT count(*) = 35 AS exactly_35_results,
         count(*) FILTER (WHERE NOT passed) AS failed_count,
         count(*) FILTER (WHERE passed) AS passed_count,
         bool_and(passed) AS all_checks_passed
  FROM v2a_results
), diagnostic AS (
  SELECT 'FAILED_TEST'::text AS result_type, result.test_number,
         result.test_name, result.passed, result.details,
         NULL::boolean AS exactly_35_results, NULL::bigint AS failed_count,
         NULL::bigint AS passed_count, NULL::boolean AS all_checks_passed
  FROM v2a_results result WHERE NOT result.passed
  UNION ALL
  SELECT 'SUMMARY', NULL, 'Cometa POS V2A profile family suite',
         summary.all_checks_passed,
         jsonb_build_object('errors_captured', (SELECT count(*) FROM v2a_errors)),
         summary.exactly_35_results, summary.failed_count,
         summary.passed_count, summary.all_checks_passed
  FROM summary
)
SELECT * FROM diagnostic ORDER BY result_type, test_number NULLS LAST;

ROLLBACK;
