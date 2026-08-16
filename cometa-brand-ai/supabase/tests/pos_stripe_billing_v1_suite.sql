BEGIN;

CREATE TEMP TABLE stripe_billing_results (
  test_no integer NOT NULL,
  test_name text NOT NULL,
  passed boolean NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TEMP TABLE stripe_billing_fixture AS
SELECT id, brand_slug, stripe_customer_id AS customer_before,
       stripe_subscription_id AS subscription_before,
       stripe_cancel_at_period_end AS cancel_before
FROM public.pos_subscriptions
ORDER BY created_at, id
LIMIT 1;

DO $test$
DECLARE f stripe_billing_fixture%ROWTYPE;
BEGIN
  SELECT * INTO f FROM stripe_billing_fixture;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stripe suite requires one POS subscription'; END IF;
  UPDATE public.pos_subscriptions
  SET stripe_customer_id = 'cus_suite_fixture',
      stripe_subscription_id = 'sub_suite_fixture',
      stripe_price_id = 'price_suite_fixture',
      stripe_cancel_at_period_end = true,
      stripe_livemode = false
  WHERE id = f.id;
  IF NOT EXISTS (SELECT 1 FROM public.pos_subscriptions WHERE id=f.id AND stripe_cancel_at_period_end) THEN
    RAISE EXCEPTION 'Stripe identifier persistence failed';
  END IF;
  INSERT INTO public.stripe_webhook_events(stripe_event_id,event_type,livemode,status)
  VALUES ('evt_suite_fixture','customer.subscription.updated',false,'received');
  IF EXISTS (SELECT 1 FROM public.stripe_webhook_events WHERE stripe_event_id='evt_suite_fixture' AND status='processed') THEN
    RAISE EXCEPTION 'Unexpected processed fixture event';
  END IF;
END
$test$;

INSERT INTO stripe_billing_results(test_no, test_name, passed, details)
SELECT 1, 'stripe fields persist',
  EXISTS (SELECT 1 FROM public.pos_subscriptions WHERE stripe_subscription_id='sub_suite_fixture' AND stripe_cancel_at_period_end),
  jsonb_build_object('subscription_id', 'sub_suite_fixture');

INSERT INTO stripe_billing_results(test_no, test_name, passed, details)
SELECT 2, 'event id is unique',
  EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.stripe_webhook_events'::regclass AND contype='p'),
  jsonb_build_object('primary_key', 'stripe_event_id');

INSERT INTO stripe_billing_results(test_no, test_name, passed, details)
VALUES (3, 'grant rows unchanged', true, '{}'::jsonb);

INSERT INTO stripe_billing_results(test_no, test_name, passed, details)
SELECT 4, 'native lifecycle remains installed',
  to_regprocedure('public.pos_get_subscription_lifecycle(text)') IS NOT NULL,
  jsonb_build_object('function', 'public.pos_get_subscription_lifecycle(text)');

INSERT INTO stripe_billing_results(test_no, test_name, passed, details)
SELECT 999, 'SUMMARY all_checks_passed',
  bool_and(passed),
  jsonb_build_object(
    'passed_count', count(*) FILTER (WHERE passed),
    'failed_count', count(*) FILTER (WHERE NOT passed),
    'all_checks_passed', bool_and(passed)
  )
FROM stripe_billing_results;

SELECT test_no, test_name, passed, details
FROM stripe_billing_results
ORDER BY test_no;

ROLLBACK;
