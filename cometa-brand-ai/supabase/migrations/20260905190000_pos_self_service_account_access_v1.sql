-- Keep account provisioning inside the existing self-service transaction.
-- Preserve the complete business bootstrap and the RPC's public signature.
DO $migration$
DECLARE
  v_definition text;
  v_anchor text := '  v_fingerprint := md5(jsonb_build_object(';
  v_account_guard text := $guard$
  -- Serialize all self-service operations for this Auth account, including
  -- different idempotency keys. Access Center also locks Auth on creation.
  PERFORM 1 FROM auth.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'USER_NOT_FOUND';
  END IF;

  -- Never update role/status on conflict. The unique user_id constraint also
  -- protects against a concurrent profile creator outside self-service.
  INSERT INTO public.user_profiles (user_id, email, role, status)
  SELECT id, lower(email), 'client', 'active'
  FROM auth.users
  WHERE id = p_user_id
  ON CONFLICT (user_id) DO NOTHING;

  PERFORM 1 FROM public.user_profiles
  WHERE user_id = p_user_id FOR UPDATE;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE user_id = p_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'PROFILE_INACTIVE_OR_MISSING';
  END IF;

$guard$;
BEGIN
  SELECT pg_get_functiondef(
    'public.pos_create_self_service_business_v1(text,text,uuid,uuid)'::regprocedure
  ) INTO v_definition;
  IF (length(v_definition) - length(replace(v_definition, v_anchor, '')))
      / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'POS_SELF_SERVICE_ACCOUNT_ANCHOR_INVALID';
  END IF;
  EXECUTE replace(v_definition, v_anchor, v_account_guard || v_anchor);
END
$migration$;

REVOKE ALL ON FUNCTION public.pos_create_self_service_business_v1(text, text, uuid, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_create_self_service_business_v1(text, text, uuid, uuid)
TO service_role;
