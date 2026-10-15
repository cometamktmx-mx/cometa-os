-- COMETA POS Plans & Entitlements V1 suite. All fixtures roll back.
BEGIN;

CREATE TEMP TABLE plans_v1_results (
  test_no integer PRIMARY KEY,
  test_name text NOT NULL,
  passed boolean NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
) ON COMMIT DROP;

CREATE TEMP TABLE plans_v1_user AS
SELECT id FROM auth.users ORDER BY created_at, id LIMIT 1;

DO $preflight$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM plans_v1_user) THEN
    RAISE EXCEPTION 'POS_PLANS_V1_SUITE_REQUIRES_AUTH_USER';
  END IF;
END
$preflight$;

CREATE TEMP TABLE plans_v1_business AS
SELECT public.pos_create_self_service_business_v1(
  'Plans V1 Retail Fixture', 'retail', (SELECT id FROM plans_v1_user),
  '84000000-0000-4000-8000-000000000001'::uuid
) AS result;

CREATE TEMP TABLE plans_v1_identity AS
SELECT result #>> '{brand,id}' AS brand_id, result #>> '{brand,slug}' AS brand_slug
FROM plans_v1_business;

INSERT INTO plans_v1_results SELECT 1, 'START price', list_price = 399.00, jsonb_build_object('price', list_price) FROM public.pos_plans WHERE code='start';
INSERT INTO plans_v1_results SELECT 2, 'PRO price', list_price = 499.00, jsonb_build_object('price', list_price) FROM public.pos_plans WHERE code='pro';
INSERT INTO plans_v1_results SELECT 3, 'MULTI price', list_price = 899.00, jsonb_build_object('price', list_price) FROM public.pos_plans WHERE code='multi';
INSERT INTO plans_v1_results SELECT 4, 'prices are MXN monthly', count(*) = 3, jsonb_build_object('count', count(*)) FROM public.pos_plans WHERE code IN ('start','pro','multi') AND currency='MXN' AND billing_interval='month';
INSERT INTO plans_v1_results SELECT 5, 'START limits', ROW(max_locations,max_registers,max_users) IS NOT DISTINCT FROM ROW(1,1,2), to_jsonb(limits) FROM public.pos_plan_limits limits WHERE plan_code='start';
INSERT INTO plans_v1_results SELECT 6, 'PRO limits', ROW(max_locations,max_registers,max_users) IS NOT DISTINCT FROM ROW(1,2,5), to_jsonb(limits) FROM public.pos_plan_limits limits WHERE plan_code='pro';
INSERT INTO plans_v1_results SELECT 7, 'MULTI limits', ROW(max_locations,max_registers,max_users) IS NOT DISTINCT FROM ROW(4,8,10), to_jsonb(limits) FROM public.pos_plan_limits limits WHERE plan_code='multi';
INSERT INTO plans_v1_results SELECT 8, 'legacy plan preserved', count(*)=1, jsonb_build_object('count',count(*)) FROM public.pos_plans WHERE code='pos_start';
INSERT INTO plans_v1_results SELECT 9, 'new business uses PRO', subscription.plan_code='pro', jsonb_build_object('planCode',subscription.plan_code) FROM public.pos_subscriptions subscription CROSS JOIN plans_v1_identity identity WHERE subscription.brand_slug=identity.brand_slug;
INSERT INTO plans_v1_results SELECT 10, 'new business is trial', subscription.status='trial', jsonb_build_object('status',subscription.status) FROM public.pos_subscriptions subscription CROSS JOIN plans_v1_identity identity WHERE subscription.brand_slug=identity.brand_slug;
INSERT INTO plans_v1_results SELECT 11, 'trial approximately 15 days', subscription.trial_ends_at BETWEEN transaction_timestamp()+interval '14 days 23 hours' AND transaction_timestamp()+interval '15 days 1 hour', jsonb_build_object('trialEndsAt',subscription.trial_ends_at) FROM public.pos_subscriptions subscription CROSS JOIN plans_v1_identity identity WHERE subscription.brand_slug=identity.brand_slug;
INSERT INTO plans_v1_results SELECT 12, 'PRO snapshot price', subscription.list_price=499.00 AND subscription.contracted_price=499.00, jsonb_build_object('listPrice',subscription.list_price,'contractedPrice',subscription.contracted_price) FROM public.pos_subscriptions subscription CROSS JOIN plans_v1_identity identity WHERE subscription.brand_slug=identity.brand_slug;
INSERT INTO plans_v1_results SELECT 13, 'trial_started once', count(*)=1, jsonb_build_object('count',count(*)) FROM public.pos_subscription_events event CROSS JOIN plans_v1_identity identity WHERE event.brand_slug=identity.brand_slug AND event.event_type='trial_started';
INSERT INTO plans_v1_results SELECT 14, 'trial event records PRO', metadata->>'planCode'='pro' AND (metadata->>'trialDays')::integer=15, metadata FROM public.pos_subscription_events event CROSS JOIN plans_v1_identity identity WHERE event.brand_slug=identity.brand_slug AND event.event_type='trial_started';
INSERT INTO plans_v1_results SELECT 15, 'retail profile independent', profile.profile_code='retail', jsonb_build_object('profileCode',profile.profile_code) FROM public.pos_business_profiles profile CROSS JOIN plans_v1_identity identity WHERE profile.brand_slug=identity.brand_slug;
INSERT INTO plans_v1_results SELECT 16, 'Principal created', count(*)=1, jsonb_build_object('count',count(*)) FROM public.pos_locations location CROSS JOIN plans_v1_identity identity WHERE location.brand_slug=identity.brand_slug AND location.name='Principal';
INSERT INTO plans_v1_results SELECT 17, 'Caja 1 created', count(*)=1, jsonb_build_object('count',count(*)) FROM public.pos_registers register CROSS JOIN plans_v1_identity identity WHERE register.brand_slug=identity.brand_slug AND register.name='Caja 1';
INSERT INTO plans_v1_results SELECT 18, 'owner counts as membership', count(*)=1, jsonb_build_object('users',count(*)) FROM public.user_brand_access access CROSS JOIN plans_v1_identity identity WHERE access.brand_slug=identity.brand_slug AND access.status='active' AND access.access_role='owner';
INSERT INTO plans_v1_results SELECT 19, 'PRO lifecycle access', COALESCE((public.pos_get_subscription_lifecycle(identity.brand_slug)->>'accessAllowed')::boolean,false), '{}' FROM plans_v1_identity identity;
INSERT INTO plans_v1_results SELECT 20, 'PRO POS access', public.pos_brand_has_entitlement(identity.brand_slug,'pos.access'), '{}' FROM plans_v1_identity identity;
INSERT INTO plans_v1_results SELECT 21, 'PRO loyalty', public.pos_brand_has_entitlement(identity.brand_slug,'pos.loyalty'), '{}' FROM plans_v1_identity identity;
INSERT INTO plans_v1_results SELECT 22, 'PRO signals', public.pos_brand_has_entitlement(identity.brand_slug,'intelligence.signals'), '{}' FROM plans_v1_identity identity;
INSERT INTO plans_v1_results SELECT 23, 'PRO Pulsar', public.pos_brand_has_entitlement(identity.brand_slug,'intelligence.pulsar'), '{}' FROM plans_v1_identity identity;
INSERT INTO plans_v1_results SELECT 24, 'PRO is not multi-location', NOT public.pos_brand_has_entitlement(identity.brand_slug,'platform.multi_location'), '{}' FROM plans_v1_identity identity;

DO $start$ BEGIN PERFORM public.pos_set_subscription_plan((SELECT brand_slug FROM plans_v1_identity),'start',(SELECT id FROM plans_v1_user)); END $start$;
INSERT INTO plans_v1_results SELECT 25, 'START base access', public.pos_brand_has_entitlement(identity.brand_slug,'pos.sales') AND public.pos_brand_has_entitlement(identity.brand_slug,'pos.inventory'), '{}' FROM plans_v1_identity identity;
INSERT INTO plans_v1_results SELECT 26, 'START excludes loyalty', NOT public.pos_brand_has_entitlement(identity.brand_slug,'pos.loyalty'), '{}' FROM plans_v1_identity identity;
INSERT INTO plans_v1_results SELECT 27, 'START excludes intelligence', NOT public.pos_brand_has_entitlement(identity.brand_slug,'intelligence.signals') AND NOT public.pos_brand_has_entitlement(identity.brand_slug,'intelligence.pulsar'), '{}' FROM plans_v1_identity identity;

DO $multi$ BEGIN PERFORM public.pos_set_subscription_plan((SELECT brand_slug FROM plans_v1_identity),'multi',(SELECT id FROM plans_v1_user)); END $multi$;
INSERT INTO plans_v1_results SELECT 28, 'MULTI inherits loyalty', public.pos_brand_has_entitlement(identity.brand_slug,'pos.loyalty'), '{}' FROM plans_v1_identity identity;
INSERT INTO plans_v1_results SELECT 29, 'MULTI inherits intelligence', public.pos_brand_has_entitlement(identity.brand_slug,'intelligence.signals') AND public.pos_brand_has_entitlement(identity.brand_slug,'intelligence.pulsar'), '{}' FROM plans_v1_identity identity;
INSERT INTO plans_v1_results SELECT 30, 'MULTI grants multi-location', public.pos_brand_has_entitlement(identity.brand_slug,'platform.multi_location'), '{}' FROM plans_v1_identity identity;
INSERT INTO plans_v1_results SELECT 31, 'opportunities not auto-granted', NOT public.pos_brand_has_entitlement(identity.brand_slug,'intelligence.opportunities'), '{}' FROM plans_v1_identity identity;
INSERT INTO plans_v1_results SELECT 32, 'advanced users not auto-granted', NOT public.pos_brand_has_entitlement(identity.brand_slug,'platform.advanced_users'), '{}' FROM plans_v1_identity identity;
INSERT INTO plans_v1_results SELECT 33, 'plan changes preserve trial end', subscription.trial_ends_at IS NOT DISTINCT FROM (business.result #>> '{trial,endsAt}')::timestamptz, jsonb_build_object('trialEndsAt',subscription.trial_ends_at) FROM public.pos_subscriptions subscription CROSS JOIN plans_v1_identity identity CROSS JOIN plans_v1_business business WHERE subscription.brand_slug=identity.brand_slug;
INSERT INTO plans_v1_results SELECT 34, 'plan changes preserve started_at', subscription.started_at <= transaction_timestamp(), jsonb_build_object('startedAt',subscription.started_at) FROM public.pos_subscriptions subscription CROSS JOIN plans_v1_identity identity WHERE subscription.brand_slug=identity.brand_slug;
INSERT INTO plans_v1_results SELECT 35, 'plan change ledger', count(*)=2, jsonb_build_object('count',count(*)) FROM public.pos_subscription_events event CROSS JOIN plans_v1_identity identity WHERE event.brand_slug=identity.brand_slug AND event.event_type='plan_changed';
INSERT INTO plans_v1_results SELECT 36, 'no analysis or memory required', NOT EXISTS(SELECT 1 FROM public.brand_analysis analysis CROSS JOIN plans_v1_identity identity WHERE analysis.brand_slug=identity.brand_slug) AND NOT EXISTS(SELECT 1 FROM public.cosmos_memory memory CROSS JOIN plans_v1_identity identity WHERE memory.brand_slug=identity.brand_slug), '{}';

DO $result_guard$
BEGIN
  IF (SELECT count(*) FROM plans_v1_results) <> 36 THEN
    RAISE EXCEPTION 'POS_PLANS_V1_EXPECTED_36_TESTS_FOUND_%', (SELECT count(*) FROM plans_v1_results);
  END IF;
END
$result_guard$;

SELECT test_no, test_name, passed, details FROM plans_v1_results
UNION ALL
SELECT 37, 'SUMMARY all_checks_passed', bool_and(passed), jsonb_build_object(
  'passed_count', count(*) FILTER (WHERE passed),
  'failed_count', count(*) FILTER (WHERE NOT passed),
  'all_checks_passed', bool_and(passed)
) FROM plans_v1_results
ORDER BY test_no;

ROLLBACK;
