-- Run only in a local test transaction. All fixtures and changes roll back.
-- The runner must BEGIN before applying the candidate migration and this suite.
DO $test$
DECLARE
  v_user uuid;
  v_other uuid := gen_random_uuid();
  v_key uuid;
  v_result jsonb;
  v_replay jsonb;
  v_role text;
  v_name text;
  v_slug text;
  v_brand_id text;
  v_profile_id uuid;
  v_count integer;
BEGIN
  INSERT INTO auth.users(id, email) VALUES (v_other, v_other::text || '@example.invalid');
  FOREACH v_role IN ARRAY ARRAY['missing', 'client', 'admin', 'team', 'inactive'] LOOP
    v_user := gen_random_uuid();
    v_key := gen_random_uuid();
    v_name := 'Access Test ' || v_user::text;
    INSERT INTO auth.users(id, email, email_confirmed_at)
    VALUES (v_user, v_user::text || '@example.invalid', now());
    IF v_role <> 'missing' THEN
      INSERT INTO public.user_profiles(user_id, email, role, status, full_name)
      VALUES (v_user, v_user::text || '@example.invalid',
        CASE WHEN v_role = 'inactive' THEN 'client' ELSE v_role END,
        CASE WHEN v_role = 'inactive' THEN 'inactive' ELSE 'active' END,
        'Preserved fixture') RETURNING id INTO v_profile_id;
    END IF;
    IF v_role = 'inactive' THEN
      BEGIN
        PERFORM public.pos_create_self_service_business_v1(v_name, 'restaurant', v_user, v_key);
        RAISE EXCEPTION 'TEST_INACTIVE_ACCOUNT_WAS_ALLOWED';
      EXCEPTION WHEN raise_exception THEN
        IF SQLERRM <> 'PROFILE_INACTIVE_OR_MISSING' THEN RAISE; END IF;
      END;
      IF EXISTS(SELECT 1 FROM public.brands WHERE created_by=v_user) OR
         EXISTS(SELECT 1 FROM public.user_profiles WHERE user_id=v_user AND status<>'inactive') THEN
        RAISE EXCEPTION 'TEST_INACTIVE_ACCOUNT_MUTATED';
      END IF;
      CONTINUE;
    END IF;

    v_result := public.pos_create_self_service_business_v1(v_name, 'restaurant', v_user, v_key);
    v_slug := v_result #>> '{brand,slug}';
    v_brand_id := v_result #>> '{brand,id}';
    IF NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE user_id=v_user AND status='active'
      AND role=CASE WHEN v_role='missing' THEN 'client' ELSE v_role END) THEN
      RAISE EXCEPTION 'TEST_ACCOUNT_CLASSIFICATION_FAILED';
    END IF;
    IF v_role<>'missing' AND NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE user_id=v_user
      AND id=v_profile_id AND full_name='Preserved fixture') THEN
      RAISE EXCEPTION 'TEST_EXISTING_PROFILE_NOT_PRESERVED';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.user_brand_access WHERE user_id=v_user
      AND brand_slug=v_slug AND access_role='owner' AND status='active') THEN
      RAISE EXCEPTION 'TEST_OWNER_MISSING';
    END IF;
    IF EXISTS(SELECT 1 FROM public.user_brand_access WHERE user_id=v_other AND brand_slug=v_slug)
      OR EXISTS(SELECT 1 FROM public.user_brand_access WHERE user_id=v_user AND brand_slug<>v_slug) THEN
      RAISE EXCEPTION 'TEST_TENANT_LEAK';
    END IF;
    IF EXISTS(SELECT 1 FROM public.brand_os_access WHERE brand_slug=v_slug) THEN
      RAISE EXCEPTION 'TEST_POS_GRANTED_OS';
    END IF;
    IF NOT (public.pos_get_brand_entitlements(v_slug)->'entitlements' ? 'pos.access') THEN
      RAISE EXCEPTION 'TEST_POS_ENTITLEMENT_MISSING';
    END IF;

    v_replay := public.pos_create_self_service_business_v1(v_name, 'restaurant', v_user, v_key);
    IF v_replay #>> '{brand,id}' <> v_brand_id OR NOT (v_replay->>'idempotentReplay')::boolean THEN
      RAISE EXCEPTION 'TEST_REPLAY_FAILED';
    END IF;
    SELECT count(*) INTO v_count FROM public.user_profiles WHERE user_id=v_user;
    IF v_count<>1 THEN RAISE EXCEPTION 'TEST_PROFILE_DUPLICATED'; END IF;
    SELECT count(*) INTO v_count FROM public.brands WHERE created_by=v_user;
    IF v_count<>1 THEN RAISE EXCEPTION 'TEST_BRAND_DUPLICATED'; END IF;
    SELECT count(*) INTO v_count FROM public.user_brand_access WHERE user_id=v_user;
    IF v_count<>1 THEN RAISE EXCEPTION 'TEST_MEMBERSHIP_DUPLICATED'; END IF;
    SELECT count(*) INTO v_count FROM public.pos_subscription_events WHERE brand_slug=v_slug AND event_type='trial_started';
    IF v_count<>1 THEN RAISE EXCEPTION 'TEST_TRIAL_DUPLICATED'; END IF;
    BEGIN
      PERFORM public.pos_create_self_service_business_v1(v_name || ' changed', 'restaurant', v_user, v_key);
      RAISE EXCEPTION 'TEST_FINGERPRINT_NOT_ENFORCED';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'POS_SELF_SERVICE_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
    END;

    INSERT INTO public.pos_brand_entitlement_overrides(brand_id,brand_slug,entitlement_id,enabled)
    SELECT v_brand_id,v_slug,id,false FROM public.pos_entitlements WHERE code='pos.access';
    IF public.pos_get_brand_entitlements(v_slug)->'entitlements' ? 'pos.access' THEN
      RAISE EXCEPTION 'TEST_ENTITLEMENT_OVERRIDE_IGNORED';
    END IF;
    UPDATE public.pos_subscriptions SET trial_ends_at=now()-interval '1 day' WHERE brand_slug=v_slug;
    IF (public.pos_get_effective_commercial_access(v_slug)#>>'{effective,accessAllowed}')::boolean THEN
      RAISE EXCEPTION 'TEST_EXPIRED_TRIAL_ALLOWED';
    END IF;
  END LOOP;
  FOREACH v_role IN ARRAY ARRAY['fashion', 'retail', 'coffee_shop'] LOOP
    v_user := gen_random_uuid();
    INSERT INTO auth.users(id,email,email_confirmed_at)
    VALUES(v_user,v_user::text || '@example.invalid',now());
    v_result := public.pos_create_self_service_business_v1('Vertical Test ' || v_user::text,v_role,v_user,gen_random_uuid());
    v_slug := v_result #>> '{brand,slug}';
    IF NOT EXISTS(SELECT 1 FROM public.pos_business_profiles WHERE brand_slug=v_slug
      AND profile_code=v_role AND onboarding_status='completed') OR
      NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE user_id=v_user AND role='client' AND status='active') OR
      NOT EXISTS(SELECT 1 FROM public.user_brand_access WHERE user_id=v_user AND brand_slug=v_slug AND access_role='owner' AND status='active') OR
      NOT (public.pos_get_brand_entitlements(v_slug)->'entitlements' ? 'pos.access') OR
      EXISTS(SELECT 1 FROM public.brand_os_access WHERE brand_slug=v_slug) THEN
      RAISE EXCEPTION 'TEST_VERTICAL_BOOTSTRAP_FAILED: %',v_role;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS account creation/preservation/inactive/replay/owner/isolation/POS-only/entitlements/trial/fashion/retail/coffee_shop';
END
$test$;

ROLLBACK;
