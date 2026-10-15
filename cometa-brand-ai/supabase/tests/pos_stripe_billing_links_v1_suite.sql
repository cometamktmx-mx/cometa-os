BEGIN;

CREATE TEMP TABLE stripe_links_results (
  test_no integer,
  test_name text,
  passed boolean,
  details jsonb
);

CREATE TEMP TABLE stripe_links_fixture AS
SELECT b.slug AS brand_slug
FROM public.brands b
LEFT JOIN public.pos_stripe_billing_links link ON link.brand_slug = b.slug
GROUP BY b.slug
HAVING count(link.id) = 0
ORDER BY b.slug
LIMIT 1;

INSERT INTO public.pos_stripe_billing_links(brand_slug, livemode, stripe_customer_id)
SELECT brand_slug, mode,
  CASE WHEN mode THEN 'cus_live_fixture' ELSE 'cus_test_fixture' END
FROM stripe_links_fixture CROSS JOIN (VALUES (false), (true)) AS modes(mode);

INSERT INTO stripe_links_results
SELECT 1, 'same brand supports both modes',
  (SELECT count(*) FROM public.pos_stripe_billing_links WHERE brand_slug = (SELECT brand_slug FROM stripe_links_fixture)) = 2,
  jsonb_build_object('brand_slug', (SELECT brand_slug FROM stripe_links_fixture));

UPDATE public.pos_stripe_billing_links
SET stripe_customer_id = 'cus_test_isolated'
WHERE brand_slug = (SELECT brand_slug FROM stripe_links_fixture) AND livemode = false;

INSERT INTO stripe_links_results
SELECT 2, 'test mapping update does not overwrite live mapping',
  (SELECT stripe_customer_id FROM public.pos_stripe_billing_links WHERE brand_slug = (SELECT brand_slug FROM stripe_links_fixture) AND livemode = true) = 'cus_live_fixture'
  AND (SELECT stripe_customer_id FROM public.pos_stripe_billing_links WHERE brand_slug = (SELECT brand_slug FROM stripe_links_fixture) AND livemode = false) = 'cus_test_isolated', '{}'::jsonb;

UPDATE public.pos_stripe_billing_links
SET stripe_customer_id = 'cus_live_isolated'
WHERE brand_slug = (SELECT brand_slug FROM stripe_links_fixture) AND livemode = true;

INSERT INTO stripe_links_results
SELECT 3, 'live mapping update does not overwrite test mapping',
  (SELECT stripe_customer_id FROM public.pos_stripe_billing_links WHERE brand_slug = (SELECT brand_slug FROM stripe_links_fixture) AND livemode = false) = 'cus_test_isolated'
  AND (SELECT stripe_customer_id FROM public.pos_stripe_billing_links WHERE brand_slug = (SELECT brand_slug FROM stripe_links_fixture) AND livemode = true) = 'cus_live_isolated', '{}'::jsonb;

INSERT INTO stripe_links_results
SELECT 4, 'brand mode uniqueness exists',
  EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.pos_stripe_billing_links'::regclass AND conname='pos_stripe_billing_links_brand_mode_key'), '{}'::jsonb;

INSERT INTO stripe_links_results
SELECT 5, 'legacy test backfill remains available',
  EXISTS (SELECT 1 FROM public.pos_stripe_billing_links link JOIN public.pos_subscriptions subscription ON subscription.brand_slug=link.brand_slug AND subscription.stripe_livemode=link.livemode WHERE link.livemode=false), '{}'::jsonb;

INSERT INTO stripe_links_results
SELECT 6, 'browser cannot mutate links',
  NOT has_table_privilege('anon','public.pos_stripe_billing_links','INSERT')
  AND NOT has_table_privilege('authenticated','public.pos_stripe_billing_links','UPDATE'), '{}'::jsonb;

INSERT INTO stripe_links_results
SELECT 7, 'webhook ledger includes mode dimension',
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='stripe_webhook_events' AND indexname='stripe_webhook_events_event_mode_key'), '{}'::jsonb;

INSERT INTO stripe_links_results
SELECT 8, 'native authorities remain installed',
  to_regprocedure('public.pos_get_subscription_lifecycle(text)') IS NOT NULL
  AND to_regprocedure('public.pos_get_effective_commercial_access(text)') IS NOT NULL, '{}'::jsonb;

SELECT test_no, test_name, passed, details FROM stripe_links_results ORDER BY test_no;
SELECT 999 AS test_no, 'SUMMARY all_checks_passed' AS test_name, bool_and(passed), jsonb_build_object('passed_count', count(*) FILTER (WHERE passed), 'failed_count', count(*) FILTER (WHERE NOT passed), 'all_checks_passed', bool_and(passed)) FROM stripe_links_results;

ROLLBACK;
