-- COMETA POS ENTRY V1B: transactional self-service business creation.

ALTER TABLE public.brands
  ADD COLUMN creation_idempotency_key uuid NULL,
  ADD COLUMN creation_payload_fingerprint text NULL;

CREATE UNIQUE INDEX brands_creator_creation_key_uidx
  ON public.brands (created_by, creation_idempotency_key)
  WHERE creation_idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.brands.creation_idempotency_key IS
  'Server-authorized logical creation operation key; scoped to created_by.';
COMMENT ON COLUMN public.brands.creation_payload_fingerprint IS
  'Deterministic fingerprint used to reject mismatched creation retries.';

CREATE FUNCTION public.pos_create_self_service_business_v1(
  p_brand_name text,
  p_profile_code text,
  p_user_id uuid,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_brand public.brands%ROWTYPE;
  v_location public.pos_locations%ROWTYPE;
  v_register public.pos_registers%ROWTYPE;
  v_subscription public.pos_subscriptions%ROWTYPE;
  v_brand_name text := btrim(COALESCE(p_brand_name, ''));
  v_profile_code text := lower(btrim(COALESCE(p_profile_code, '')));
  v_base_slug text;
  v_candidate_slug text;
  v_suffix integer := 1;
  v_fingerprint text;
  v_capabilities jsonb;
  v_replay boolean := false;
BEGIN
  IF v_brand_name = '' OR char_length(v_brand_name) > 120 THEN
    RAISE EXCEPTION 'POS_SELF_SERVICE_BRAND_NAME_INVALID';
  END IF;

  IF v_profile_code NOT IN ('fashion', 'retail') THEN
    RAISE EXCEPTION 'POS_SELF_SERVICE_PROFILE_INVALID';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'POS_SELF_SERVICE_USER_REQUIRED';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'POS_SELF_SERVICE_IDEMPOTENCY_KEY_REQUIRED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.pos_profile_catalog profile
    WHERE profile.code = v_profile_code
      AND profile.launch_status = 'live'
  ) THEN
    RAISE EXCEPTION 'POS_SELF_SERVICE_PROFILE_NOT_AVAILABLE';
  END IF;

  v_fingerprint := md5(jsonb_build_object(
    'brandName', v_brand_name,
    'profileCode', v_profile_code
  )::text);

  -- Same creator/key operations serialize before checking or claiming a row.
  PERFORM pg_advisory_xact_lock(
    hashtext('pos_create_self_service_business_v1'),
    hashtext(p_user_id::text || ':' || p_idempotency_key::text)
  );

  SELECT *
  INTO v_brand
  FROM public.brands brand
  WHERE brand.created_by = p_user_id
    AND brand.creation_idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_brand.creation_payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'POS_SELF_SERVICE_IDEMPOTENCY_CONFLICT';
    END IF;

    v_replay := true;
  ELSE
    v_base_slug := lower(v_brand_name);
    v_base_slug := translate(
      v_base_slug,
      'áéíóúüñàèìòùäëïöüâêîôûç',
      'aeiouunaeiouaeiouaeiouc'
    );
    v_base_slug := regexp_replace(v_base_slug, '[^a-z0-9]+', '-', 'g');
    v_base_slug := regexp_replace(v_base_slug, '(^-+|-+$)', '', 'g');

    IF v_base_slug = '' THEN
      RAISE EXCEPTION 'POS_SELF_SERVICE_BRAND_NAME_INVALID';
    END IF;

    LOOP
      v_candidate_slug := CASE
        WHEN v_suffix = 1 THEN v_base_slug
        ELSE v_base_slug || '-' || v_suffix::text
      END;

      BEGIN
        INSERT INTO public.brands (
          slug,
          name,
          status,
          created_by,
          creation_idempotency_key,
          creation_payload_fingerprint
        ) VALUES (
          v_candidate_slug,
          v_brand_name,
          'active',
          p_user_id,
          p_idempotency_key,
          v_fingerprint
        )
        RETURNING * INTO v_brand;

        EXIT;
      EXCEPTION WHEN unique_violation THEN
        -- A concurrent claim of the same operation is serialized above. Any
        -- remaining collision is a taken slug, so try the next suffix.
        v_suffix := v_suffix + 1;
        IF v_suffix > 10000 THEN
          RAISE EXCEPTION 'POS_SELF_SERVICE_SLUG_EXHAUSTED';
        END IF;
      END;
    END LOOP;

    INSERT INTO public.user_brand_access (
      user_id,
      brand_slug,
      access_role,
      status,
      updated_at
    ) VALUES (
      p_user_id,
      v_brand.slug,
      'owner',
      'active',
      now()
    );

    PERFORM public.pos_initialize_brand_setup(
      v_brand.id::text,
      v_brand.slug,
      v_brand.name,
      p_user_id
    );

    SELECT COALESCE(jsonb_object_agg(defaults.capability_code, defaults.enabled), '{}'::jsonb)
    INTO v_capabilities
    FROM public.pos_profile_capability_defaults defaults
    WHERE defaults.profile_code = v_profile_code;

    PERFORM public.pos_configure_business_profile(
      p_brand_id => v_brand.id::text,
      p_brand_slug => v_brand.slug,
      p_profile_code => v_profile_code,
      p_operation_mode => 'single',
      p_capabilities => v_capabilities,
      p_user_id => p_user_id
    );

    INSERT INTO public.pos_locations (
      brand_id,
      brand_slug,
      name,
      code,
      country,
      timezone,
      currency,
      tax_name,
      tax_rate,
      prices_include_tax,
      active,
      created_by
    ) VALUES (
      v_brand.id::text,
      v_brand.slug,
      'Principal',
      'P',
      'MX',
      'America/Mexico_City',
      'MXN',
      'IVA',
      0,
      true,
      true,
      p_user_id
    )
    RETURNING * INTO v_location;

    INSERT INTO public.pos_registers (
      brand_id,
      brand_slug,
      location_id,
      name,
      code,
      status,
      created_by
    ) VALUES (
      v_brand.id::text,
      v_brand.slug,
      v_location.id,
      'Caja 1',
      'CAJA1',
      'available',
      p_user_id
    )
    RETURNING * INTO v_register;

    UPDATE public.pos_business_profiles
    SET onboarding_status = 'completed',
        onboarding_step = 4,
        onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
        updated_at = now()
    WHERE brand_slug = v_brand.slug;
  END IF;

  SELECT *
  INTO v_subscription
  FROM public.pos_subscriptions subscription
  WHERE subscription.brand_slug = v_brand.slug;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_SELF_SERVICE_SETUP_INCOMPLETE';
  END IF;

  SELECT *
  INTO v_location
  FROM public.pos_locations location
  WHERE location.brand_slug = v_brand.slug
  ORDER BY location.created_at, location.id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_SELF_SERVICE_LOCATION_INCOMPLETE';
  END IF;

  SELECT *
  INTO v_register
  FROM public.pos_registers register
  WHERE register.brand_slug = v_brand.slug
    AND register.location_id = v_location.id
  ORDER BY register.created_at, register.id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_SELF_SERVICE_REGISTER_INCOMPLETE';
  END IF;

  RETURN jsonb_build_object(
    'brand', jsonb_build_object(
      'id', v_brand.id,
      'slug', v_brand.slug,
      'name', v_brand.name
    ),
    'profileCode', v_profile_code,
    'trial', jsonb_build_object(
      'status', v_subscription.status,
      'endsAt', v_subscription.trial_ends_at,
      'planCode', v_subscription.plan_code
    ),
    'location', to_jsonb(v_location),
    'register', to_jsonb(v_register),
    'idempotentReplay', v_replay
  );
END
$function$;

REVOKE EXECUTE ON FUNCTION public.pos_create_self_service_business_v1(text, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_create_self_service_business_v1(text, text, uuid, uuid)
  TO service_role;

