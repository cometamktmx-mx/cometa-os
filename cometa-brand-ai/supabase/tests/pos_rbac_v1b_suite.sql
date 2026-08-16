-- RBAC V1B.1 functional suite. No email or external effects. Everything rolls back.
BEGIN;

CREATE TEMP TABLE rbac_v1b_results (
  test_no integer PRIMARY KEY,
  test_name text NOT NULL,
  passed boolean NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'
) ON COMMIT DROP;

CREATE TEMP TABLE rbac_v1b_fixture AS
SELECT subscription.brand_slug, owner.user_id AS owner_id
FROM public.pos_subscriptions subscription
JOIN public.user_brand_access owner
  ON owner.brand_slug=subscription.brand_slug
  AND owner.access_role='owner'
  AND owner.status='active'
WHERE (
  SELECT count(*) FROM public.user_brand_access member
  WHERE member.brand_slug=subscription.brand_slug AND member.status='active'
)=1
ORDER BY subscription.created_at
LIMIT 1;

CREATE TEMP TABLE rbac_v1b_users AS
SELECT auth_user.id, lower(auth_user.email) AS email,
  row_number() OVER (ORDER BY auth_user.created_at, auth_user.id) AS ordinal
FROM auth.users auth_user
CROSS JOIN rbac_v1b_fixture fixture
WHERE auth_user.email IS NOT NULL
  AND auth_user.id <> fixture.owner_id
  AND NOT EXISTS(
    SELECT 1 FROM public.user_brand_access membership
    WHERE membership.user_id=auth_user.id AND membership.brand_slug=fixture.brand_slug
  )
ORDER BY auth_user.created_at, auth_user.id
LIMIT 2;

DO $preflight$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM rbac_v1b_fixture)
    OR (SELECT count(*) FROM rbac_v1b_users) <> 2 THEN
    RAISE EXCEPTION 'POS_RBAC_V1B_SUITE_FIXTURES_REQUIRED';
  END IF;
END
$preflight$;

-- Leave one owner and a Start plan so reservation/release is observable.
UPDATE public.pos_subscriptions SET plan_code='start'
WHERE brand_slug=(SELECT brand_slug FROM rbac_v1b_fixture);
DELETE FROM public.pos_user_invitations
WHERE brand_slug=(SELECT brand_slug FROM rbac_v1b_fixture);

DO $decline$
DECLARE
  v_invitation public.pos_user_invitations%ROWTYPE;
  v_user_id uuid;
  v_email text;
BEGIN
  SELECT id,email INTO v_user_id,v_email FROM rbac_v1b_users WHERE ordinal=1;
  v_invitation:=public.pos_reserve_user_invitation_v1(
    (SELECT brand_slug FROM rbac_v1b_fixture),v_email,'cashier',
    (SELECT owner_id FROM rbac_v1b_fixture),now()+interval '1 day','{}'
  );
  PERFORM public.pos_decline_user_invitation_v1(v_invitation.id,v_user_id,v_email);
  INSERT INTO rbac_v1b_results
  SELECT 1,'invitee declines own pending invitation',status='revoked' AND revoked_at IS NOT NULL,
    jsonb_build_object('status',status)
  FROM public.pos_user_invitations WHERE id=v_invitation.id;
  INSERT INTO rbac_v1b_results
  SELECT 2,'decline creates no membership',count(*)=0,jsonb_build_object('memberships',count(*))
  FROM public.user_brand_access WHERE user_id=v_user_id AND brand_slug=(SELECT brand_slug FROM rbac_v1b_fixture);
  INSERT INTO rbac_v1b_results
  SELECT 3,'revoked invite releases seat',count(*)=0,jsonb_build_object('pending',count(*))
  FROM public.pos_user_invitations WHERE brand_slug=(SELECT brand_slug FROM rbac_v1b_fixture)
    AND status='pending' AND expires_at>now();
END
$decline$;

DO $wrong_email$
DECLARE
  v_invitation public.pos_user_invitations%ROWTYPE;
  v_user_id uuid;
  v_email text;
BEGIN
  SELECT id,email INTO v_user_id,v_email FROM rbac_v1b_users WHERE ordinal=1;
  v_invitation:=public.pos_reserve_user_invitation_v1(
    (SELECT brand_slug FROM rbac_v1b_fixture),v_email,'cashier',
    (SELECT owner_id FROM rbac_v1b_fixture),now()+interval '1 day','{}'
  );
  BEGIN
    PERFORM public.pos_decline_user_invitation_v1(
      v_invitation.id,(SELECT id FROM rbac_v1b_users WHERE ordinal=2),
      (SELECT email FROM rbac_v1b_users WHERE ordinal=2)
    );
    INSERT INTO rbac_v1b_results VALUES(4,'wrong email cannot decline',false,'{}');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO rbac_v1b_results VALUES(4,'wrong email cannot decline',
      SQLERRM LIKE '%POS_INVITATION_EMAIL_MISMATCH%',jsonb_build_object('error',SQLERRM));
  END;
  PERFORM public.pos_revoke_user_invitation_v1(
    (SELECT brand_slug FROM rbac_v1b_fixture),v_invitation.id,(SELECT owner_id FROM rbac_v1b_fixture)
  );
END
$wrong_email$;

DO $accepted_and_expired$
DECLARE
  v_invitation public.pos_user_invitations%ROWTYPE;
  v_user_id uuid;
  v_email text;
BEGIN
  SELECT id,email INTO v_user_id,v_email FROM rbac_v1b_users WHERE ordinal=1;
  v_invitation:=public.pos_reserve_user_invitation_v1(
    (SELECT brand_slug FROM rbac_v1b_fixture),v_email,'manager',
    (SELECT owner_id FROM rbac_v1b_fixture),now()+interval '1 day','{}'
  );
  PERFORM public.pos_accept_user_invitation_v1(
    (SELECT brand_slug FROM rbac_v1b_fixture),v_invitation.id,v_user_id,v_email
  );
  BEGIN
    PERFORM public.pos_decline_user_invitation_v1(v_invitation.id,v_user_id,v_email);
    INSERT INTO rbac_v1b_results VALUES(5,'accepted invitation cannot decline',false,'{}');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO rbac_v1b_results VALUES(5,'accepted invitation cannot decline',
      SQLERRM LIKE '%POS_INVITATION_NOT_PENDING%',jsonb_build_object('error',SQLERRM));
  END;
  INSERT INTO public.pos_user_invitations(
    brand_slug,email,access_role,status,invited_by,created_at,expires_at
  ) VALUES (
    (SELECT brand_slug FROM rbac_v1b_fixture),
    (SELECT email FROM rbac_v1b_users WHERE ordinal=2),'inventory','pending',
    (SELECT owner_id FROM rbac_v1b_fixture),now()-interval '2 days',now()-interval '1 day'
  ) RETURNING * INTO v_invitation;
  BEGIN
    PERFORM public.pos_decline_user_invitation_v1(
      v_invitation.id,(SELECT id FROM rbac_v1b_users WHERE ordinal=2),
      (SELECT email FROM rbac_v1b_users WHERE ordinal=2)
    );
    INSERT INTO rbac_v1b_results VALUES(6,'expired invitation cannot decline',false,'{}');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO rbac_v1b_results VALUES(6,'expired invitation cannot decline',
      SQLERRM LIKE '%POS_INVITATION_EXPIRED%',jsonb_build_object('error',SQLERRM));
  END;
  INSERT INTO rbac_v1b_results
  SELECT 7,'expired invitation receives no membership',count(*)=0,jsonb_build_object('memberships',count(*))
  FROM public.user_brand_access WHERE user_id=(SELECT id FROM rbac_v1b_users WHERE ordinal=2)
    AND brand_slug=(SELECT brand_slug FROM rbac_v1b_fixture);
END
$accepted_and_expired$;

INSERT INTO rbac_v1b_results
SELECT 8,'V1A acceptance remains intact',count(*)=1,jsonb_build_object('active_memberships',count(*))
FROM public.user_brand_access
WHERE user_id=(SELECT id FROM rbac_v1b_users WHERE ordinal=1)
  AND brand_slug=(SELECT brand_slug FROM rbac_v1b_fixture)
  AND status='active' AND access_role='manager';

DO $guard$
BEGIN
  IF (SELECT count(*) FROM rbac_v1b_results) <> 8 THEN
    RAISE EXCEPTION 'POS_RBAC_V1B_EXPECTED_8_TESTS_FOUND_%',(SELECT count(*) FROM rbac_v1b_results);
  END IF;
END
$guard$;

SELECT test_no,test_name,passed,details FROM rbac_v1b_results
UNION ALL
SELECT 9,'SUMMARY all_checks_passed',bool_and(passed),jsonb_build_object(
  'passed_count',count(*) FILTER(WHERE passed),
  'failed_count',count(*) FILTER(WHERE NOT passed),
  'all_checks_passed',bool_and(passed)
) FROM rbac_v1b_results
ORDER BY test_no;

ROLLBACK;
