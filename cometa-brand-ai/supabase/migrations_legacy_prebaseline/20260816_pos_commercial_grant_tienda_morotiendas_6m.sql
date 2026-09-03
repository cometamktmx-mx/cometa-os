-- COMETA POS: explicit administrative commercial grant for tienda-morotiendas.
-- This migration is intentionally brand-specific and does not mutate subscription truth.
BEGIN;

DO $grant$
DECLARE
  v_starts_at timestamptz := now();
  v_ends_at timestamptz;
BEGIN
  v_ends_at := v_starts_at + interval '6 months';

  IF NOT EXISTS (
    SELECT 1
    FROM public.brands
    WHERE slug = 'tienda-morotiendas'
  ) THEN
    RAISE EXCEPTION 'POS_GRANT_BRAND_NOT_FOUND';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.pos_plans
    WHERE code = 'pro'
      AND active = true
  ) THEN
    RAISE EXCEPTION 'POS_GRANT_PLAN_NOT_ACTIVE';
  END IF;

  -- Serialize the same brand-scoped overlap decision used by the grant trigger.
  PERFORM pg_advisory_xact_lock(
    hashtext('pos_commercial_grants_overlap'),
    hashtext('tienda-morotiendas')
  );

  -- A previously created grant is immutable history; leave it unchanged.
  IF EXISTS (
    SELECT 1
    FROM public.pos_commercial_grants pcg
    WHERE pcg.brand_slug = 'tienda-morotiendas'
      AND pcg.grant_code = 'COMETA-AGENCY-6M'
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pos_commercial_grants pcg
    WHERE pcg.brand_slug = 'tienda-morotiendas'
      AND pcg.status = 'active'
      AND pcg.starts_at < v_ends_at
      AND pcg.ends_at > v_starts_at
  ) THEN
    RAISE EXCEPTION 'POS_GRANT_ACTIVE_GRANT_EXISTS';
  END IF;

  INSERT INTO public.pos_commercial_grants (
    brand_slug,
    grant_code,
    grant_type,
    plan_code,
    status,
    starts_at,
    ends_at,
    reason,
    created_by,
    revoked_at,
    revoked_by
  )
  VALUES (
    'tienda-morotiendas',
    'COMETA-AGENCY-6M',
    'complimentary',
    'pro',
    'active',
    v_starts_at,
    v_ends_at,
    'Cliente Cometa Growth Partner — Cometa POS Pro incluido durante 6 meses',
    NULL,
    NULL,
    NULL
  );
END
$grant$;

COMMIT;
