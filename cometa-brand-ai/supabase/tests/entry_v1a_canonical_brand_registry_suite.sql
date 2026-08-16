BEGIN;

CREATE TEMP TABLE entry_v1a_results (
  test_no integer PRIMARY KEY,
  test_name text NOT NULL,
  passed boolean NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
) ON COMMIT DROP;

CREATE TEMP TABLE entry_v1a_baseline AS
SELECT
  (SELECT count(*) FROM public.clients) AS clients_count,
  (SELECT count(*) FROM public.brand_analysis) AS analysis_count,
  (SELECT count(*) FROM public.cosmos_memory) AS memory_count,
  (SELECT count(*) FROM public.user_brand_access) AS access_count,
  (SELECT count(*) FROM public.pos_subscriptions) AS subscription_count;

INSERT INTO public.brands (slug, name)
VALUES ('entry-v1a-registry-only-fixture', 'ENTRY V1A Registry Only Fixture');

INSERT INTO entry_v1a_results VALUES
(1, 'create registry brand', EXISTS (
  SELECT 1 FROM public.brands WHERE slug = 'entry-v1a-registry-only-fixture'
), '{}');

INSERT INTO entry_v1a_results
SELECT 2, 'uuid identity generated', id IS NOT NULL, jsonb_build_object('id', id)
FROM public.brands WHERE slug = 'entry-v1a-registry-only-fixture';

INSERT INTO entry_v1a_results
SELECT 3, 'slug preserved', slug = 'entry-v1a-registry-only-fixture', jsonb_build_object('slug', slug)
FROM public.brands WHERE slug = 'entry-v1a-registry-only-fixture';

INSERT INTO entry_v1a_results
SELECT 4, 'brand name preserved', name = 'ENTRY V1A Registry Only Fixture', jsonb_build_object('name', name)
FROM public.brands WHERE slug = 'entry-v1a-registry-only-fixture';

INSERT INTO entry_v1a_results
SELECT 5, 'active status default', status = 'active', jsonb_build_object('status', status)
FROM public.brands WHERE slug = 'entry-v1a-registry-only-fixture';

DO $test$
BEGIN
  BEGIN
    INSERT INTO public.brands (slug, name)
    VALUES ('entry-v1a-registry-only-fixture', 'Duplicate');
    INSERT INTO entry_v1a_results VALUES (6, 'duplicate slug rejected', false, '{"unexpected":"insert succeeded"}');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO entry_v1a_results VALUES (6, 'duplicate slug rejected', true, '{}');
  END;
END
$test$;

DO $test$
BEGIN
  BEGIN
    INSERT INTO public.brands (slug, name) VALUES ('Invalid Slug', 'Invalid');
    INSERT INTO entry_v1a_results VALUES (7, 'invalid slug rejected', false, '{"unexpected":"insert succeeded"}');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO entry_v1a_results VALUES (7, 'invalid slug rejected', true, '{}');
  END;
END
$test$;

DO $test$
BEGIN
  BEGIN
    INSERT INTO public.brands (slug, name) VALUES ('entry-v1a-blank-name', '   ');
    INSERT INTO entry_v1a_results VALUES (8, 'blank name rejected', false, '{"unexpected":"insert succeeded"}');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO entry_v1a_results VALUES (8, 'blank name rejected', true, '{}');
  END;
END
$test$;

INSERT INTO entry_v1a_results VALUES
(9, 'registry-only brand is valid identity', EXISTS (
  SELECT 1 FROM public.brands WHERE slug = 'entry-v1a-registry-only-fixture'
), '{}'),
(10, 'brand analysis is not required', NOT EXISTS (
  SELECT 1 FROM public.brand_analysis WHERE lower(btrim(brand_slug)) = 'entry-v1a-registry-only-fixture'
), '{}'),
(11, 'cosmos memory is not required', NOT EXISTS (
  SELECT 1 FROM public.cosmos_memory WHERE lower(btrim(brand_slug)) = 'entry-v1a-registry-only-fixture'
), '{}'),
(12, 'access memberships resolve to registry', NOT EXISTS (
  SELECT 1
  FROM public.user_brand_access access
  WHERE access.brand_slug IS NOT NULL
    AND btrim(access.brand_slug) <> ''
    AND NOT EXISTS (
      SELECT 1 FROM public.brands brand
      WHERE brand.slug = lower(btrim(access.brand_slug))
    )
), '{}'),
(13, 'nash-mood compatibility', EXISTS (
  SELECT 1 FROM public.brands WHERE slug = 'nash-mood'
), '{}'),
(14, 'magenta-fit-wear compatibility', EXISTS (
  SELECT 1 FROM public.brands WHERE slug = 'magenta-fit-wear'
), '{}'),
(15, 'analysis rows do not duplicate registry brands', (
  SELECT count(*) FROM public.brands WHERE slug = 'nash-mood'
) = 1, '{}'),
(16, 'backfilled names are nonblank', NOT EXISTS (
  SELECT 1 FROM public.brands WHERE btrim(name) = ''
), '{}');

UPDATE public.brands
SET status = 'inactive', updated_at = now()
WHERE slug = 'entry-v1a-registry-only-fixture';

INSERT INTO entry_v1a_results
SELECT 17, 'inactive registry status supported', status = 'inactive', jsonb_build_object('status', status)
FROM public.brands WHERE slug = 'entry-v1a-registry-only-fixture';

INSERT INTO entry_v1a_results
SELECT 18, 'registry status does not mutate subscriptions',
  (SELECT count(*) FROM public.pos_subscriptions) = baseline.subscription_count,
  jsonb_build_object(
    'before', baseline.subscription_count,
    'after', (SELECT count(*) FROM public.pos_subscriptions)
  )
FROM entry_v1a_baseline baseline;

INSERT INTO entry_v1a_results VALUES
(19, 'membership-scoped select policy', EXISTS (
  SELECT 1
  FROM pg_policy policy
  WHERE policy.polrelid = 'public.brands'::regclass
    AND policy.polcmd = 'r'
    AND pg_get_expr(policy.polqual, policy.polrelid) LIKE '%user_brand_access%'
    AND pg_get_expr(policy.polqual, policy.polrelid) LIKE '%auth.uid()%'
    AND pg_get_expr(policy.polqual, policy.polrelid) LIKE '%brand_slug%'
), '{}'),
(20, 'authenticated select allowed', has_table_privilege('authenticated', 'public.brands', 'SELECT'), '{}'),
(21, 'authenticated writes denied', NOT has_table_privilege('authenticated', 'public.brands', 'INSERT,UPDATE,DELETE'), '{}'),
(22, 'anonymous access denied', NOT has_table_privilege('anon', 'public.brands', 'SELECT,INSERT,UPDATE,DELETE'), '{}'),
(23, 'service role registry access', has_table_privilege('service_role', 'public.brands', 'SELECT,INSERT,UPDATE,DELETE'), '{}');

INSERT INTO entry_v1a_results
SELECT 24, 'clients untouched',
  (SELECT count(*) FROM public.clients) = baseline.clients_count,
  jsonb_build_object('before', baseline.clients_count, 'after', (SELECT count(*) FROM public.clients))
FROM entry_v1a_baseline baseline;

INSERT INTO entry_v1a_results
SELECT 25, 'brand analysis untouched',
  (SELECT count(*) FROM public.brand_analysis) = baseline.analysis_count,
  jsonb_build_object('before', baseline.analysis_count, 'after', (SELECT count(*) FROM public.brand_analysis))
FROM entry_v1a_baseline baseline;

INSERT INTO entry_v1a_results
SELECT 26, 'cosmos memory untouched',
  (SELECT count(*) FROM public.cosmos_memory) = baseline.memory_count,
  jsonb_build_object('before', baseline.memory_count, 'after', (SELECT count(*) FROM public.cosmos_memory))
FROM entry_v1a_baseline baseline;

INSERT INTO entry_v1a_results
SELECT 27, 'user brand access untouched',
  (SELECT count(*) FROM public.user_brand_access) = baseline.access_count,
  jsonb_build_object('before', baseline.access_count, 'after', (SELECT count(*) FROM public.user_brand_access))
FROM entry_v1a_baseline baseline;

INSERT INTO entry_v1a_results VALUES
(28, 'no self-service writer introduced',
  to_regprocedure('public.pos_create_self_service_business(text,text,uuid)') IS NULL, '{}'),
(29, 'rollback boundary active', txid_current_if_assigned() IS NOT NULL, '{}');

SELECT
  test_no,
  test_name,
  passed,
  details,
  count(*) OVER () = 29 AS exactly_29_results,
  count(*) FILTER (WHERE passed) OVER () AS passed_count,
  count(*) FILTER (WHERE NOT passed) OVER () AS failed_count,
  bool_and(passed) OVER () AS all_checks_passed
FROM entry_v1a_results
ORDER BY test_no;

ROLLBACK;

