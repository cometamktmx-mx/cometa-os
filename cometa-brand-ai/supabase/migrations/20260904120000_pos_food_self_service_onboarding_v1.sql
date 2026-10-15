-- COMETA POS Food onboarding V1.
-- Extend the canonical transaction without changing its signature or copying
-- its bootstrap, membership, trial, location, register or idempotency logic.

DO $migration$
DECLARE
  v_missing_profiles text[];
  v_definition text;
  v_original text := 'IF v_profile_code NOT IN (''fashion'', ''retail'') THEN';
  v_extended text := 'IF v_profile_code NOT IN (''fashion'', ''retail'', ''restaurant'', ''coffee_shop'') THEN';
BEGIN
  SELECT array_agg(required.code ORDER BY required.code)
  INTO v_missing_profiles
  FROM (VALUES ('coffee_shop'), ('restaurant')) AS required(code)
  LEFT JOIN public.pos_profile_catalog catalog ON catalog.code = required.code
  WHERE catalog.code IS NULL;

  IF v_missing_profiles IS NOT NULL THEN
    RAISE EXCEPTION 'POS_FOOD_PROFILE_CATALOG_MISSING: %', v_missing_profiles;
  END IF;

  UPDATE public.pos_profile_catalog
  SET launch_status = 'live', updated_at = now()
  WHERE code IN ('restaurant', 'coffee_shop')
    AND launch_status IS DISTINCT FROM 'live';

  SELECT pg_get_functiondef(
    'public.pos_create_self_service_business_v1(text,text,uuid,uuid)'::regprocedure
  ) INTO v_definition;

  IF position(v_original IN v_definition) = 0 THEN
    RAISE EXCEPTION 'POS_FOOD_SELF_SERVICE_ALLOWLIST_ANCHOR_NOT_FOUND';
  END IF;

  EXECUTE replace(v_definition, v_original, v_extended);
END
$migration$;

REVOKE ALL ON FUNCTION public.pos_create_self_service_business_v1(text, text, uuid, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.pos_create_self_service_business_v1(text, text, uuid, uuid)
TO service_role;
