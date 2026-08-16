SELECT 'mapping table exists' AS check_name, to_regclass('public.pos_stripe_billing_links') IS NOT NULL AS passed;
SELECT 'mapping columns' AS check_name,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pos_stripe_billing_links' AND column_name='livemode')
  AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pos_stripe_billing_links' AND column_name='stripe_customer_id')
  AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pos_stripe_billing_links' AND column_name='stripe_subscription_id') AS passed;
SELECT 'mapping brand mode unique' AS check_name,
  EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.pos_stripe_billing_links'::regclass AND conname='pos_stripe_billing_links_brand_mode_key') AS passed;
SELECT 'mapping RLS enabled' AS check_name, relrowsecurity FROM pg_class WHERE oid='public.pos_stripe_billing_links'::regclass;
SELECT 'mapping ACL server only' AS check_name,
  NOT has_table_privilege('anon','public.pos_stripe_billing_links','SELECT')
  AND NOT has_table_privilege('authenticated','public.pos_stripe_billing_links','INSERT')
  AND has_table_privilege('service_role','public.pos_stripe_billing_links','SELECT')
  AND has_table_privilege('service_role','public.pos_stripe_billing_links','INSERT')
  AND has_table_privilege('service_role','public.pos_stripe_billing_links','UPDATE')
  AND NOT has_table_privilege('service_role','public.pos_stripe_billing_links','DELETE') AS passed;
SELECT 'webhook ledger mode unique' AS check_name,
  EXISTS (SELECT 1 FROM pg_class WHERE oid='public.stripe_webhook_events'::regclass)
  AND EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='stripe_webhook_events' AND indexname='stripe_webhook_events_event_mode_key') AS passed;
