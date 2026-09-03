-- Stripe Billing V1: separate external identities by brand and Stripe mode.
BEGIN;

CREATE TABLE IF NOT EXISTS public.pos_stripe_billing_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_slug text NOT NULL REFERENCES public.brands(slug) ON UPDATE CASCADE ON DELETE RESTRICT,
  livemode boolean NOT NULL,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  stripe_cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_stripe_billing_links_brand_mode_key UNIQUE (brand_slug, livemode)
);

CREATE UNIQUE INDEX IF NOT EXISTS pos_stripe_billing_links_customer_key
  ON public.pos_stripe_billing_links (livemode, stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pos_stripe_billing_links_subscription_key
  ON public.pos_stripe_billing_links (livemode, stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

ALTER TABLE public.pos_stripe_billing_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pos_stripe_billing_links FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pos_stripe_billing_links FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pos_stripe_billing_links TO service_role;

-- Preserve already-tested identities only when their persisted mode is explicit.
INSERT INTO public.pos_stripe_billing_links (
  brand_slug, livemode, stripe_customer_id, stripe_subscription_id,
  stripe_price_id, stripe_cancel_at_period_end
)
SELECT
  s.brand_slug, s.stripe_livemode, s.stripe_customer_id,
  s.stripe_subscription_id, s.stripe_price_id,
  COALESCE(s.stripe_cancel_at_period_end, false)
FROM public.pos_subscriptions s
WHERE s.stripe_livemode IS NOT NULL
  AND (s.stripe_customer_id IS NOT NULL
    OR s.stripe_subscription_id IS NOT NULL
    OR s.stripe_price_id IS NOT NULL)
ON CONFLICT (brand_slug, livemode) DO NOTHING;

-- Existing ledger rows already contain livemode. Make idempotency explicit per mode.
DO $ledger$
DECLARE
  primary_key_name text;
BEGIN
  SELECT conname
  INTO primary_key_name
  FROM pg_constraint
  WHERE conrelid = 'public.stripe_webhook_events'::regclass
    AND contype = 'p'
  LIMIT 1;

  IF primary_key_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.stripe_webhook_events DROP CONSTRAINT %I',
      primary_key_name
    );
  END IF;
END
$ledger$;

ALTER TABLE public.stripe_webhook_events
  ALTER COLUMN livemode SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS stripe_webhook_events_event_mode_key
  ON public.stripe_webhook_events (stripe_event_id, livemode);

COMMIT;
