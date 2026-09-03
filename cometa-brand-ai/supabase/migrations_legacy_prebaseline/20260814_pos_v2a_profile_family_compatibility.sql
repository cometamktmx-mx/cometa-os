-- COMETA POS V2A — PROFILE FAMILY COMPATIBILITY
-- profile_family is derived only. This migration changes no table or data.
BEGIN;

CREATE FUNCTION public.pos_profile_family(p_profile_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT CASE lower(btrim(COALESCE(p_profile_code, '')))
    WHEN 'fashion' THEN 'retail'
    WHEN 'retail' THEN 'retail'
    WHEN 'pharmacy' THEN 'retail'
    WHEN 'coffee_shop' THEN 'restaurant'
    WHEN 'restaurant' THEN 'restaurant'
    WHEN 'services' THEN 'services'
    WHEN 'mixed' THEN 'generic'
    WHEN 'unconfigured' THEN 'generic'
    ELSE 'generic'
  END
$function$;

REVOKE ALL ON FUNCTION public.pos_profile_family(text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.pos_profile_family(text)
TO service_role;

COMMIT;
