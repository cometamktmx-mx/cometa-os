-- COMETA POS Commercial Grants V1 functional suite.
-- No external delivery or billing effects. Everything rolls back.
BEGIN;

CREATE TEMP TABLE pos_commercial_grants_v1_results (
  test_no integer PRIMARY KEY,
  test_name text NOT NULL,
  passed boolean NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
) ON COMMIT DROP;

CREATE TEMP TABLE pos_commercial_grants_v1_fixture AS
SELECT subscription.brand_slug,
       owner.user_id AS owner_id
FROM public.pos_subscriptions subscription
JOIN public.user_brand_access owner
  ON owner.brand_slug = subscription.brand_slug
  AND owner.status = 'active'
  AND owner.access_role = 'owner'
WHERE (
  SELECT count(*)
  FROM public.user_brand_access member
  WHERE member.brand_slug = subscription.brand_slug
    AND member.status = 'active'
) = 1
ORDER BY subscription.created_at, subscription.id
LIMIT 1;

CREATE TEMP TABLE pos_commercial_grants_v1_no_subscription_fixture AS
SELECT brand.slug
FROM public.brands brand
WHERE NOT EXISTS (
  SELECT 1
  FROM public.pos_subscriptions subscription
  WHERE subscription.brand_slug = brand.slug
)
ORDER BY brand.created_at, brand.id
LIMIT 1;

DO $preflight$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pos_commercial_grants_v1_fixture) THEN
    RAISE EXCEPTION 'POS_COMMERCIAL_GRANTS_V1_SUITE_FIXTURE_REQUIRED';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pos_commercial_grants_v1_no_subscription_fixture) THEN
    RAISE EXCEPTION 'POS_COMMERCIAL_GRANTS_V1_NO_SUBSCRIPTION_FIXTURE_REQUIRED';
  END IF;
END
$preflight$;

DELETE FROM public.pos_commercial_grants
WHERE brand_slug IN (
  SELECT brand_slug FROM pos_commercial_grants_v1_fixture
  UNION ALL
  SELECT slug FROM pos_commercial_grants_v1_no_subscription_fixture
);

DELETE FROM public.pos_user_invitations
WHERE brand_slug = (SELECT brand_slug FROM pos_commercial_grants_v1_fixture);

UPDATE public.pos_subscriptions
SET plan_code = 'start',
    status = 'trial',
    trial_ends_at = now() + interval '2 days'
WHERE brand_slug = (SELECT brand_slug FROM pos_commercial_grants_v1_fixture);

CREATE TEMP TABLE pos_commercial_grants_v1_baseline AS
SELECT plan_code, status, trial_ends_at
FROM public.pos_subscriptions
WHERE brand_slug = (SELECT brand_slug FROM pos_commercial_grants_v1_fixture);

INSERT INTO public.pos_commercial_grants (
  brand_slug, grant_code, grant_type, plan_code, status, starts_at, ends_at, reason
) VALUES (
  (SELECT brand_slug FROM pos_commercial_grants_v1_fixture),
  'TEST-ACTIVE-PRO', 'complimentary', 'pro', 'active',
  now() - interval '1 hour', now() + interval '2 days', 'Commercial grant suite fixture'
);

INSERT INTO pos_commercial_grants_v1_results
SELECT 1,
       'active grant is effective',
       (access #>> '{effective,accessAllowed}')::boolean
         AND access #>> '{effective,planCode}' = 'pro'
         AND access #>> '{effective,planSource}' = 'commercial_grant',
       access
FROM (
  SELECT public.pos_get_effective_commercial_access(
    (SELECT brand_slug FROM pos_commercial_grants_v1_fixture)
  ) AS access
) resolved;

INSERT INTO pos_commercial_grants_v1_results
SELECT 2,
       'grant does not mutate subscription truth',
       current.plan_code = baseline.plan_code
         AND current.status = baseline.status,
       jsonb_build_object(
         'before', to_jsonb(baseline),
         'after', to_jsonb(current)
       )
FROM pos_commercial_grants_v1_baseline baseline
JOIN public.pos_subscriptions current
  ON current.brand_slug = (SELECT brand_slug FROM pos_commercial_grants_v1_fixture);

INSERT INTO pos_commercial_grants_v1_results
SELECT 3,
       'grant does not mutate trial end',
       current.trial_ends_at IS NOT DISTINCT FROM baseline.trial_ends_at,
       jsonb_build_object(
         'before', baseline.trial_ends_at,
         'after', current.trial_ends_at
       )
FROM pos_commercial_grants_v1_baseline baseline
JOIN public.pos_subscriptions current
  ON current.brand_slug = (SELECT brand_slug FROM pos_commercial_grants_v1_fixture);

INSERT INTO pos_commercial_grants_v1_results
SELECT 4,
       'Pro grant resolves Pro entitlements',
       resolved.entitlements #>> '{plan,code}' = 'pro'
         AND resolved.entitlements -> 'entitlements' ? 'pos.access'
         AND resolved.entitlements -> 'entitlements' ? 'pos.loyalty',
       resolved.entitlements
FROM (
  SELECT public.pos_get_brand_entitlements(
    (SELECT brand_slug FROM pos_commercial_grants_v1_fixture)
  ) AS entitlements
) resolved;

DO $future_grant$
DECLARE
  v_access jsonb;
BEGIN
  UPDATE public.pos_commercial_grants
  SET status = 'revoked', revoked_at = now()
  WHERE brand_slug = (SELECT brand_slug FROM pos_commercial_grants_v1_fixture)
    AND status = 'active';

  INSERT INTO public.pos_commercial_grants (
    brand_slug, grant_code, grant_type, plan_code, status, starts_at, ends_at
  ) VALUES (
    (SELECT brand_slug FROM pos_commercial_grants_v1_fixture),
    'TEST-FUTURE-PRO', 'complimentary', 'pro', 'active',
    now() + interval '3 days', now() + interval '5 days'
  );

  v_access := public.pos_get_effective_commercial_access(
    (SELECT brand_slug FROM pos_commercial_grants_v1_fixture)
  );
  INSERT INTO pos_commercial_grants_v1_results
  VALUES (
    5,
    'future grant is ineffective',
    COALESCE((v_access #>> '{grant,active}')::boolean, false) = false
      AND v_access #>> '{effective,planCode}' = 'start',
    v_access
  );
END
$future_grant$;

DO $expired_grant$
DECLARE
  v_access jsonb;
BEGIN
  INSERT INTO public.pos_commercial_grants (
    brand_slug, grant_code, grant_type, plan_code, status, starts_at, ends_at
  ) VALUES (
    (SELECT brand_slug FROM pos_commercial_grants_v1_fixture),
    'TEST-EXPIRED-PRO', 'complimentary', 'pro', 'active',
    now() - interval '5 days', now() - interval '3 days'
  );

  v_access := public.pos_get_effective_commercial_access(
    (SELECT brand_slug FROM pos_commercial_grants_v1_fixture)
  );
  INSERT INTO pos_commercial_grants_v1_results
  VALUES (6, 'expired grant is ineffective',
    COALESCE((v_access #>> '{grant,active}')::boolean, false) = false,
    v_access);
END
$expired_grant$;

DO $revoked_grant$
DECLARE
  v_access jsonb;
  v_grant_id uuid;
BEGIN
  INSERT INTO public.pos_commercial_grants (
    brand_slug, grant_code, grant_type, plan_code, status, starts_at, ends_at
  ) VALUES (
    (SELECT brand_slug FROM pos_commercial_grants_v1_fixture),
    'TEST-REVOKED-PRO', 'complimentary', 'pro', 'active',
    now() + interval '6 days', now() + interval '8 days'
  ) RETURNING id INTO v_grant_id;

  UPDATE public.pos_commercial_grants
  SET status = 'revoked', revoked_at = now()
  WHERE id = v_grant_id;

  v_access := public.pos_get_effective_commercial_access(
    (SELECT brand_slug FROM pos_commercial_grants_v1_fixture)
  );
  INSERT INTO pos_commercial_grants_v1_results
  VALUES (7, 'revoked grant is ineffective',
    COALESCE((v_access #>> '{grant,active}')::boolean, false) = false,
    v_access);
END
$revoked_grant$;

DO $invalid_inputs$
BEGIN
  BEGIN
    INSERT INTO public.pos_commercial_grants (
      brand_slug, grant_code, grant_type, plan_code, status, starts_at, ends_at
    ) VALUES (
      'missing-commercial-grant-brand', 'TEST-BRAND', 'complimentary', 'pro', 'active', now(), now() + interval '1 day'
    );
    INSERT INTO pos_commercial_grants_v1_results VALUES (8, 'invalid brand rejected', false, '{}'::jsonb);
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO pos_commercial_grants_v1_results VALUES (8, 'invalid brand rejected', true, '{}'::jsonb);
  END;

  BEGIN
    INSERT INTO public.pos_commercial_grants (
      brand_slug, grant_code, grant_type, plan_code, status, starts_at, ends_at
    ) VALUES (
      (SELECT brand_slug FROM pos_commercial_grants_v1_fixture), 'TEST-PLAN', 'complimentary', 'not-a-plan', 'active', now() + interval '10 days', now() + interval '11 days'
    );
    INSERT INTO pos_commercial_grants_v1_results VALUES (9, 'invalid plan rejected', false, '{}'::jsonb);
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO pos_commercial_grants_v1_results VALUES (9, 'invalid plan rejected', true, '{}'::jsonb);
  END;

  BEGIN
    INSERT INTO public.pos_commercial_grants (
      brand_slug, grant_code, grant_type, plan_code, status, starts_at, ends_at
    ) VALUES (
      (SELECT brand_slug FROM pos_commercial_grants_v1_fixture), 'TEST-WINDOW', 'complimentary', 'pro', 'active', now() + interval '12 days', now() + interval '12 days'
    );
    INSERT INTO pos_commercial_grants_v1_results VALUES (10, 'invalid time window rejected', false, '{}'::jsonb);
  EXCEPTION WHEN check_violation THEN
    INSERT INTO pos_commercial_grants_v1_results VALUES (10, 'invalid time window rejected', true, '{}'::jsonb);
  END;
END
$invalid_inputs$;

DO $overlap$
DECLARE
  v_first uuid;
BEGIN
  INSERT INTO public.pos_commercial_grants (
    brand_slug, grant_code, grant_type, plan_code, status, starts_at, ends_at
  ) VALUES (
    (SELECT brand_slug FROM pos_commercial_grants_v1_fixture),
    'TEST-OVERLAP-ONE', 'complimentary', 'pro', 'active',
    now() + interval '20 days', now() + interval '24 days'
  ) RETURNING id INTO v_first;

  BEGIN
    INSERT INTO public.pos_commercial_grants (
      brand_slug, grant_code, grant_type, plan_code, status, starts_at, ends_at
    ) VALUES (
      (SELECT brand_slug FROM pos_commercial_grants_v1_fixture),
      'TEST-OVERLAP-TWO', 'complimentary', 'pro', 'active',
      now() + interval '22 days', now() + interval '26 days'
    );
    INSERT INTO pos_commercial_grants_v1_results VALUES (11, 'overlapping active grants rejected', false, '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO pos_commercial_grants_v1_results
    VALUES (11, 'overlapping active grants rejected', SQLERRM LIKE '%POS_COMMERCIAL_GRANT_OVERLAP%', jsonb_build_object('error', SQLERRM));
  END;

  UPDATE public.pos_commercial_grants
  SET status = 'revoked', revoked_at = now()
  WHERE id = v_first;
END
$overlap$;

DO $precedence$
DECLARE
  v_access jsonb;
  v_grant_id uuid;
BEGIN
  UPDATE public.pos_subscriptions
  SET plan_code = 'start', status = 'trial', trial_ends_at = now() + interval '2 days'
  WHERE brand_slug = (SELECT brand_slug FROM pos_commercial_grants_v1_fixture);
  INSERT INTO public.pos_commercial_grants (brand_slug, grant_code, grant_type, plan_code, status, starts_at, ends_at)
  VALUES ((SELECT brand_slug FROM pos_commercial_grants_v1_fixture), 'TEST-START-PRO', 'complimentary', 'pro', 'active', now() - interval '1 hour', now() + interval '1 day')
  RETURNING id INTO v_grant_id;
  v_access := public.pos_get_effective_commercial_access((SELECT brand_slug FROM pos_commercial_grants_v1_fixture));
  INSERT INTO pos_commercial_grants_v1_results VALUES (12, 'Start plus Pro resolves Pro', v_access #>> '{effective,planCode}' = 'pro', v_access);
  UPDATE public.pos_commercial_grants SET status = 'revoked', revoked_at = now() WHERE id = v_grant_id;

  UPDATE public.pos_subscriptions
  SET plan_code = 'pro'
  WHERE brand_slug = (SELECT brand_slug FROM pos_commercial_grants_v1_fixture);
  INSERT INTO public.pos_commercial_grants (brand_slug, grant_code, grant_type, plan_code, status, starts_at, ends_at)
  VALUES ((SELECT brand_slug FROM pos_commercial_grants_v1_fixture), 'TEST-PRO-PRO', 'complimentary', 'pro', 'active', now() - interval '1 hour', now() + interval '1 day')
  RETURNING id INTO v_grant_id;
  v_access := public.pos_get_effective_commercial_access((SELECT brand_slug FROM pos_commercial_grants_v1_fixture));
  INSERT INTO pos_commercial_grants_v1_results VALUES (13, 'Pro plus Pro resolves Pro', v_access #>> '{effective,planCode}' = 'pro', v_access);
  UPDATE public.pos_commercial_grants SET status = 'revoked', revoked_at = now() WHERE id = v_grant_id;

  UPDATE public.pos_subscriptions
  SET plan_code = 'multi'
  WHERE brand_slug = (SELECT brand_slug FROM pos_commercial_grants_v1_fixture);
  INSERT INTO public.pos_commercial_grants (brand_slug, grant_code, grant_type, plan_code, status, starts_at, ends_at)
  VALUES ((SELECT brand_slug FROM pos_commercial_grants_v1_fixture), 'TEST-MULTI-PRO', 'complimentary', 'pro', 'active', now() - interval '1 hour', now() + interval '1 day')
  RETURNING id INTO v_grant_id;
  v_access := public.pos_get_effective_commercial_access((SELECT brand_slug FROM pos_commercial_grants_v1_fixture));
  INSERT INTO pos_commercial_grants_v1_results VALUES (14, 'Multi plus Pro preserves Multi', v_access #>> '{effective,planCode}' = 'multi', v_access);
  UPDATE public.pos_commercial_grants SET status = 'revoked', revoked_at = now() WHERE id = v_grant_id;

  UPDATE public.pos_subscriptions
  SET plan_code = 'pro'
  WHERE brand_slug = (SELECT brand_slug FROM pos_commercial_grants_v1_fixture);
  INSERT INTO public.pos_commercial_grants (brand_slug, grant_code, grant_type, plan_code, status, starts_at, ends_at)
  VALUES ((SELECT brand_slug FROM pos_commercial_grants_v1_fixture), 'TEST-PRO-START', 'complimentary', 'start', 'active', now() - interval '1 hour', now() + interval '1 day')
  RETURNING id INTO v_grant_id;
  v_access := public.pos_get_effective_commercial_access((SELECT brand_slug FROM pos_commercial_grants_v1_fixture));
  INSERT INTO pos_commercial_grants_v1_results VALUES (15, 'Pro plus Start preserves Pro', v_access #>> '{effective,planCode}' = 'pro', v_access);
  UPDATE public.pos_commercial_grants SET status = 'revoked', revoked_at = now() WHERE id = v_grant_id;
END
$precedence$;

DO $fallbacks$
DECLARE
  v_grant_id uuid;
  v_access jsonb;
BEGIN
  UPDATE public.pos_subscriptions
  SET plan_code = 'start', status = 'cancelled'
  WHERE brand_slug = (SELECT brand_slug FROM pos_commercial_grants_v1_fixture);

  INSERT INTO public.pos_commercial_grants (brand_slug, grant_code, grant_type, plan_code, status, starts_at, ends_at)
  VALUES ((SELECT brand_slug FROM pos_commercial_grants_v1_fixture), 'TEST-EXPIRE-FALLBACK', 'complimentary', 'pro', 'active', now() - interval '8 days', now() - interval '6 days')
  RETURNING id INTO v_grant_id;
  v_access := public.pos_get_effective_commercial_access((SELECT brand_slug FROM pos_commercial_grants_v1_fixture));
  INSERT INTO pos_commercial_grants_v1_results VALUES (16, 'expiration falls back to native lifecycle', COALESCE((v_access #>> '{effective,accessAllowed}')::boolean, false) = false, v_access);

  INSERT INTO public.pos_commercial_grants (brand_slug, grant_code, grant_type, plan_code, status, starts_at, ends_at)
  VALUES ((SELECT brand_slug FROM pos_commercial_grants_v1_fixture), 'TEST-REVOKE-FALLBACK', 'complimentary', 'pro', 'active', now() - interval '1 hour', now() + interval '1 day')
  RETURNING id INTO v_grant_id;
  UPDATE public.pos_commercial_grants SET status = 'revoked', revoked_at = now() WHERE id = v_grant_id;
  v_access := public.pos_get_effective_commercial_access((SELECT brand_slug FROM pos_commercial_grants_v1_fixture));
  INSERT INTO pos_commercial_grants_v1_results VALUES (17, 'revoke falls back to native lifecycle', COALESCE((v_access #>> '{effective,accessAllowed}')::boolean, false) = false, v_access);
END
$fallbacks$;

DO $seats$
DECLARE
  v_invitation public.pos_user_invitations%ROWTYPE;
  v_index integer;
  v_effective_access jsonb;
  v_effective_plan_code text;
  v_effective_max_users integer;
  v_pro_max_users integer;
  v_active_memberships integer;
  v_owner_memberships integer;
  v_pending_before integer;
  v_pending_after integer;
  v_available_seats integer;
BEGIN
  UPDATE public.pos_subscriptions
  SET plan_code = 'start', status = 'trial', trial_ends_at = now() + interval '2 days'
  WHERE brand_slug = (SELECT brand_slug FROM pos_commercial_grants_v1_fixture);
  INSERT INTO public.pos_commercial_grants (brand_slug, grant_code, grant_type, plan_code, status, starts_at, ends_at)
  VALUES ((SELECT brand_slug FROM pos_commercial_grants_v1_fixture), 'TEST-SEATS-PRO', 'complimentary', 'pro', 'active', now() - interval '1 hour', now() + interval '1 day');

  v_effective_access := public.pos_get_effective_commercial_access(
    (SELECT brand_slug FROM pos_commercial_grants_v1_fixture)
  );
  v_effective_plan_code := v_effective_access #>> '{effective,planCode}';

  SELECT max_users
    INTO v_effective_max_users
  FROM public.pos_plan_limits
  WHERE plan_code = v_effective_plan_code;

  SELECT max_users
    INTO v_pro_max_users
  FROM public.pos_plan_limits
  WHERE plan_code = 'pro';

  SELECT count(*)
    INTO v_active_memberships
  FROM public.user_brand_access
  WHERE brand_slug = (SELECT brand_slug FROM pos_commercial_grants_v1_fixture)
    AND status = 'active';

  SELECT count(*)
    INTO v_owner_memberships
  FROM public.user_brand_access
  WHERE brand_slug = (SELECT brand_slug FROM pos_commercial_grants_v1_fixture)
    AND status = 'active'
    AND access_role = 'owner';

  SELECT count(*)
    INTO v_pending_before
  FROM public.pos_user_invitations
  WHERE brand_slug = (SELECT brand_slug FROM pos_commercial_grants_v1_fixture)
    AND status = 'pending'
    AND expires_at > now();

  v_available_seats := COALESCE(v_effective_max_users, -1)
    - v_active_memberships
    - v_pending_before;

  IF v_available_seats >= 0 THEN
    FOR v_index IN 1..v_available_seats LOOP
      v_invitation := public.pos_reserve_user_invitation_v1(
        (SELECT brand_slug FROM pos_commercial_grants_v1_fixture),
        'commercial-grant-seat-' || v_index || '@example.test',
        'cashier',
        (SELECT owner_id FROM pos_commercial_grants_v1_fixture),
        now() + interval '1 day',
        '{}'::jsonb
      );
    END LOOP;
  END IF;

  SELECT count(*)
    INTO v_pending_after
  FROM public.pos_user_invitations
  WHERE brand_slug = (SELECT brand_slug FROM pos_commercial_grants_v1_fixture)
    AND status = 'pending'
    AND expires_at > now();

  INSERT INTO pos_commercial_grants_v1_results
  VALUES (
    18,
    'Pro grant uses effective max_users and reserves all available seats',
    COALESCE(v_effective_plan_code = 'pro', false)
      AND v_effective_max_users IS NOT DISTINCT FROM v_pro_max_users
      AND v_available_seats >= 0
      AND v_owner_memberships >= 1
      AND v_pending_after = v_pending_before + v_available_seats
      AND v_active_memberships + v_pending_after = v_effective_max_users,
    jsonb_build_object(
      'effectivePlanCode', v_effective_plan_code,
      'effectiveMaxUsers', v_effective_max_users,
      'proMaxUsers', v_pro_max_users,
      'activeMemberships', v_active_memberships,
      'ownerMemberships', v_owner_memberships,
      'pendingBefore', v_pending_before,
      'availableSeats', v_available_seats,
      'pendingAfter', v_pending_after,
      'effectiveUsageAfter', v_active_memberships + v_pending_after
    )
  );

  BEGIN
    PERFORM public.pos_reserve_user_invitation_v1(
      (SELECT brand_slug FROM pos_commercial_grants_v1_fixture),
      'commercial-grant-seat-overflow@example.test',
      'cashier',
      (SELECT owner_id FROM pos_commercial_grants_v1_fixture),
      now() + interval '1 day',
      '{}'::jsonb
    );
    INSERT INTO pos_commercial_grants_v1_results VALUES (19, 'effective seat overflow rejected', false, '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO pos_commercial_grants_v1_results
    VALUES (19, 'effective seat overflow rejected', SQLERRM LIKE '%POS_USER_LIMIT_REACHED%', jsonb_build_object('error', SQLERRM));
  END;
END
$seats$;

DO $inactive_plan_and_no_subscription$
DECLARE
  v_access jsonb;
BEGIN
  DELETE FROM public.pos_user_invitations
  WHERE brand_slug = (SELECT brand_slug FROM pos_commercial_grants_v1_fixture);
  UPDATE public.pos_commercial_grants
  SET status = 'revoked', revoked_at = now()
  WHERE brand_slug = (SELECT brand_slug FROM pos_commercial_grants_v1_fixture)
    AND status = 'active';
  UPDATE public.pos_subscriptions
  SET status = 'cancelled', plan_code = 'start'
  WHERE brand_slug = (SELECT brand_slug FROM pos_commercial_grants_v1_fixture);
  UPDATE public.pos_plans SET active = false WHERE code = 'pro';
  INSERT INTO public.pos_commercial_grants (brand_slug, grant_code, grant_type, plan_code, status, starts_at, ends_at)
  VALUES ((SELECT brand_slug FROM pos_commercial_grants_v1_fixture), 'TEST-INACTIVE-PLAN', 'complimentary', 'pro', 'active', now() - interval '1 hour', now() + interval '1 day');
  v_access := public.pos_get_effective_commercial_access((SELECT brand_slug FROM pos_commercial_grants_v1_fixture));
  INSERT INTO pos_commercial_grants_v1_results
  VALUES (20, 'inactive grant plan is ineffective',
    COALESCE((v_access #>> '{grant,active}')::boolean, false) = false
      AND COALESCE((v_access #>> '{effective,accessAllowed}')::boolean, false) = false,
    v_access);

  UPDATE public.pos_plans SET active = true WHERE code = 'pro';
  INSERT INTO public.pos_commercial_grants (brand_slug, grant_code, grant_type, plan_code, status, starts_at, ends_at)
  VALUES ((SELECT slug FROM pos_commercial_grants_v1_no_subscription_fixture), 'TEST-NO-SUBSCRIPTION', 'complimentary', 'pro', 'active', now() - interval '1 hour', now() + interval '1 day');
  v_access := public.pos_get_effective_commercial_access((SELECT slug FROM pos_commercial_grants_v1_no_subscription_fixture));
  INSERT INTO pos_commercial_grants_v1_results
  VALUES (21, 'active grant resolves without a persisted subscription',
    COALESCE((v_access #>> '{effective,accessAllowed}')::boolean, false)
      AND v_access #>> '{effective,accessSource}' = 'commercial_grant'
      AND v_access -> 'subscriptionLifecycle' = 'null'::jsonb,
    v_access);
END
$inactive_plan_and_no_subscription$;

WITH public_table_acl AS (
  SELECT acl.privilege_type
  FROM pg_class table_row
  CROSS JOIN LATERAL aclexplode(
    COALESCE(table_row.relacl, acldefault('r', table_row.relowner))
  ) AS acl(grantee, grantor, privilege_type, is_grantable)
  WHERE table_row.oid = 'public.pos_commercial_grants'::regclass
    AND acl.grantee = 0
    AND acl.privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
)
INSERT INTO pos_commercial_grants_v1_results
SELECT 22,
       'browser roles cannot mutate grants',
       NOT EXISTS (SELECT 1 FROM public_table_acl)
         AND NOT has_table_privilege('anon', 'public.pos_commercial_grants', 'INSERT')
         AND NOT has_table_privilege('anon', 'public.pos_commercial_grants', 'UPDATE')
         AND NOT has_table_privilege('anon', 'public.pos_commercial_grants', 'DELETE')
         AND NOT has_table_privilege('authenticated', 'public.pos_commercial_grants', 'INSERT')
         AND NOT has_table_privilege('authenticated', 'public.pos_commercial_grants', 'UPDATE')
         AND NOT has_table_privilege('authenticated', 'public.pos_commercial_grants', 'DELETE'),
       jsonb_build_object(
         'public', jsonb_build_object(
           'insert', EXISTS (SELECT 1 FROM public_table_acl WHERE privilege_type = 'INSERT'),
           'update', EXISTS (SELECT 1 FROM public_table_acl WHERE privilege_type = 'UPDATE'),
           'delete', EXISTS (SELECT 1 FROM public_table_acl WHERE privilege_type = 'DELETE')
         ),
         'anon', jsonb_build_object(
           'insert', has_table_privilege('anon', 'public.pos_commercial_grants', 'INSERT'),
           'update', has_table_privilege('anon', 'public.pos_commercial_grants', 'UPDATE'),
           'delete', has_table_privilege('anon', 'public.pos_commercial_grants', 'DELETE')
         ),
         'authenticated', jsonb_build_object(
           'insert', has_table_privilege('authenticated', 'public.pos_commercial_grants', 'INSERT'),
           'update', has_table_privilege('authenticated', 'public.pos_commercial_grants', 'UPDATE'),
           'delete', has_table_privilege('authenticated', 'public.pos_commercial_grants', 'DELETE')
         )
       );

DO $guard$
BEGIN
  IF (SELECT count(*) FROM pos_commercial_grants_v1_results) <> 22 THEN
    RAISE EXCEPTION 'POS_COMMERCIAL_GRANTS_V1_EXPECTED_22_TESTS_FOUND_%',
      (SELECT count(*) FROM pos_commercial_grants_v1_results);
  END IF;
END
$guard$;

SELECT test_no, test_name, passed, details
FROM pos_commercial_grants_v1_results
UNION ALL
SELECT 23,
       'SUMMARY all_checks_passed',
       bool_and(passed),
       jsonb_build_object(
         'passed_count', count(*) FILTER (WHERE passed),
         'failed_count', count(*) FILTER (WHERE NOT passed),
         'all_checks_passed', bool_and(passed)
       )
FROM pos_commercial_grants_v1_results
ORDER BY test_no;

ROLLBACK;
