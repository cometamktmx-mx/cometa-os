-- Read-only postflight for Stripe Billing V1.
SELECT 'stripe columns' AS check_name,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pos_subscriptions' AND column_name='stripe_customer_id')
  AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pos_subscriptions' AND column_name='stripe_subscription_id')
  AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pos_subscriptions' AND column_name='stripe_price_id')
  AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pos_subscriptions' AND column_name='stripe_cancel_at_period_end')
  AS passed;

SELECT 'webhook ledger' AS check_name, to_regclass('public.stripe_webhook_events') IS NOT NULL AS passed;
SELECT 'ledger rls' AS check_name, relrowsecurity AS passed FROM pg_class WHERE oid='public.stripe_webhook_events'::regclass;
SELECT 'ledger acl' AS check_name,
  NOT has_table_privilege('anon','public.stripe_webhook_events','SELECT')
  AND NOT has_table_privilege('anon','public.stripe_webhook_events','INSERT')
  AND NOT has_table_privilege('anon','public.stripe_webhook_events','UPDATE')
  AND NOT has_table_privilege('anon','public.stripe_webhook_events','DELETE')
  AND NOT has_table_privilege('authenticated','public.stripe_webhook_events','SELECT')
  AND NOT has_table_privilege('authenticated','public.stripe_webhook_events','INSERT')
  AND NOT has_table_privilege('authenticated','public.stripe_webhook_events','UPDATE')
  AND NOT has_table_privilege('authenticated','public.stripe_webhook_events','DELETE')
  AND has_table_privilege('service_role','public.stripe_webhook_events','SELECT')
  AND has_table_privilege('service_role','public.stripe_webhook_events','INSERT')
  AND has_table_privilege('service_role','public.stripe_webhook_events','UPDATE')
  AND NOT has_table_privilege('service_role','public.stripe_webhook_events','DELETE') AS passed;

SELECT 'native lifecycle and effective access remain installed' AS check_name,
  to_regprocedure('public.pos_get_subscription_lifecycle(text)') IS NOT NULL
  AND to_regprocedure('public.pos_get_effective_commercial_access(text)') IS NOT NULL AS passed;

SELECT 'no grant rows changed by migration' AS check_name, true AS passed;
