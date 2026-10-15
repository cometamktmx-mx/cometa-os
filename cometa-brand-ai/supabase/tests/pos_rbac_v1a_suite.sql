-- RBAC V1A functional suite. No email or external effects. Everything rolls back.
BEGIN;

CREATE TEMP TABLE rbac_v1a_results(test_no integer PRIMARY KEY,test_name text NOT NULL,passed boolean NOT NULL,details jsonb NOT NULL DEFAULT '{}') ON COMMIT DROP;
CREATE TEMP TABLE rbac_v1a_fixture AS
SELECT subscription.brand_slug, owner.user_id AS owner_id
FROM public.pos_subscriptions subscription
JOIN public.user_brand_access owner ON owner.brand_slug=subscription.brand_slug AND owner.access_role='owner' AND owner.status='active'
WHERE (SELECT count(*) FROM public.user_brand_access member WHERE member.brand_slug=subscription.brand_slug AND member.status='active')=1
ORDER BY subscription.created_at LIMIT 1;
CREATE TEMP TABLE rbac_v1a_users AS
SELECT auth_user.id,lower(auth_user.email) AS email,row_number() OVER(ORDER BY auth_user.created_at,auth_user.id) ordinal
FROM auth.users auth_user CROSS JOIN rbac_v1a_fixture fixture
WHERE auth_user.email IS NOT NULL AND auth_user.id<>fixture.owner_id
  AND NOT EXISTS(SELECT 1 FROM public.user_brand_access membership WHERE membership.user_id=auth_user.id AND membership.brand_slug=fixture.brand_slug)
ORDER BY auth_user.created_at,auth_user.id LIMIT 2;
CREATE TEMP TABLE rbac_v1a_other_brand AS
SELECT brand.slug
FROM public.brands brand
CROSS JOIN rbac_v1a_fixture fixture
WHERE brand.slug<>fixture.brand_slug
  AND NOT EXISTS(
    SELECT 1 FROM public.user_brand_access membership
    WHERE membership.brand_slug=brand.slug
      AND membership.user_id=(SELECT id FROM rbac_v1a_users WHERE ordinal=1)
  )
ORDER BY brand.created_at,brand.id LIMIT 1;

DO $preflight$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM rbac_v1a_fixture) OR (SELECT count(*) FROM rbac_v1a_users)<2 OR NOT EXISTS(SELECT 1 FROM rbac_v1a_other_brand) THEN RAISE EXCEPTION 'POS_RBAC_V1A_SUITE_FIXTURES_REQUIRED'; END IF;
END $preflight$;

INSERT INTO public.user_brand_access(user_id,brand_slug,access_role,status,updated_at)
SELECT id,fixture.brand_slug,CASE ordinal WHEN 1 THEN 'manager' ELSE 'cashier' END,'active',now()
FROM rbac_v1a_users CROSS JOIN rbac_v1a_fixture fixture;

DO $owner_roles$ BEGIN
  PERFORM public.pos_change_brand_membership_role_v1((SELECT brand_slug FROM rbac_v1a_fixture),(SELECT id FROM rbac_v1a_users WHERE ordinal=1),'admin',(SELECT owner_id FROM rbac_v1a_fixture));
  INSERT INTO rbac_v1a_results VALUES(1,'owner assigns admin',(SELECT access_role='admin' FROM public.user_brand_access CROSS JOIN rbac_v1a_fixture WHERE user_id=(SELECT id FROM rbac_v1a_users WHERE ordinal=1) AND user_brand_access.brand_slug=rbac_v1a_fixture.brand_slug),'{}');
  PERFORM public.pos_change_brand_membership_role_v1((SELECT brand_slug FROM rbac_v1a_fixture),(SELECT id FROM rbac_v1a_users WHERE ordinal=1),'manager',(SELECT owner_id FROM rbac_v1a_fixture));
  INSERT INTO rbac_v1a_results VALUES(2,'owner assigns manager',true,'{}');
  PERFORM public.pos_change_brand_membership_role_v1((SELECT brand_slug FROM rbac_v1a_fixture),(SELECT id FROM rbac_v1a_users WHERE ordinal=1),'cashier',(SELECT owner_id FROM rbac_v1a_fixture));
  INSERT INTO rbac_v1a_results VALUES(3,'owner assigns cashier',true,'{}');
  PERFORM public.pos_change_brand_membership_role_v1((SELECT brand_slug FROM rbac_v1a_fixture),(SELECT id FROM rbac_v1a_users WHERE ordinal=1),'inventory',(SELECT owner_id FROM rbac_v1a_fixture));
  INSERT INTO rbac_v1a_results VALUES(4,'owner assigns inventory',true,'{}');
  PERFORM public.pos_change_brand_membership_role_v1((SELECT brand_slug FROM rbac_v1a_fixture),(SELECT id FROM rbac_v1a_users WHERE ordinal=1),'owner',(SELECT owner_id FROM rbac_v1a_fixture));
  INSERT INTO rbac_v1a_results VALUES(5,'owner promotes owner',true,'{}');
END $owner_roles$;

DO $last_owner$ BEGIN
  PERFORM public.pos_change_brand_membership_role_v1((SELECT brand_slug FROM rbac_v1a_fixture),(SELECT owner_id FROM rbac_v1a_fixture),'manager',(SELECT id FROM rbac_v1a_users WHERE ordinal=1));
  INSERT INTO rbac_v1a_results VALUES(6,'one of two owners may downgrade',true,'{}');
  BEGIN
    PERFORM public.pos_change_brand_membership_role_v1((SELECT brand_slug FROM rbac_v1a_fixture),(SELECT id FROM rbac_v1a_users WHERE ordinal=1),'manager',(SELECT id FROM rbac_v1a_users WHERE ordinal=1));
    INSERT INTO rbac_v1a_results VALUES(7,'last owner downgrade rejected',false,'{}');
  EXCEPTION WHEN OTHERS THEN INSERT INTO rbac_v1a_results VALUES(7,'last owner downgrade rejected',SQLERRM LIKE '%POS_LAST_OWNER_REQUIRED%',jsonb_build_object('error',SQLERRM)); END;
  PERFORM public.pos_change_brand_membership_role_v1((SELECT brand_slug FROM rbac_v1a_fixture),(SELECT owner_id FROM rbac_v1a_fixture),'owner',(SELECT id FROM rbac_v1a_users WHERE ordinal=1));
  PERFORM public.pos_change_brand_membership_role_v1((SELECT brand_slug FROM rbac_v1a_fixture),(SELECT id FROM rbac_v1a_users WHERE ordinal=1),'admin',(SELECT owner_id FROM rbac_v1a_fixture));
  BEGIN
    DELETE FROM public.user_brand_access WHERE user_id=(SELECT owner_id FROM rbac_v1a_fixture) AND brand_slug=(SELECT brand_slug FROM rbac_v1a_fixture);
    INSERT INTO rbac_v1a_results VALUES(8,'last owner DELETE rejected',false,'{}');
  EXCEPTION WHEN OTHERS THEN INSERT INTO rbac_v1a_results VALUES(8,'last owner DELETE rejected',SQLERRM LIKE '%POS_LAST_OWNER_REQUIRED%',jsonb_build_object('error',SQLERRM)); END;
END $last_owner$;

DO $admin_policy$ BEGIN
  PERFORM public.pos_change_brand_membership_role_v1((SELECT brand_slug FROM rbac_v1a_fixture),(SELECT id FROM rbac_v1a_users WHERE ordinal=2),'manager',(SELECT id FROM rbac_v1a_users WHERE ordinal=1));
  INSERT INTO rbac_v1a_results VALUES(9,'admin assigns manager',true,'{}');
  PERFORM public.pos_change_brand_membership_role_v1((SELECT brand_slug FROM rbac_v1a_fixture),(SELECT id FROM rbac_v1a_users WHERE ordinal=2),'cashier',(SELECT id FROM rbac_v1a_users WHERE ordinal=1));
  INSERT INTO rbac_v1a_results VALUES(10,'admin assigns cashier',true,'{}');
  PERFORM public.pos_change_brand_membership_role_v1((SELECT brand_slug FROM rbac_v1a_fixture),(SELECT id FROM rbac_v1a_users WHERE ordinal=2),'inventory',(SELECT id FROM rbac_v1a_users WHERE ordinal=1));
  INSERT INTO rbac_v1a_results VALUES(11,'admin assigns inventory',true,'{}');
  BEGIN PERFORM public.pos_change_brand_membership_role_v1((SELECT brand_slug FROM rbac_v1a_fixture),(SELECT id FROM rbac_v1a_users WHERE ordinal=2),'admin',(SELECT id FROM rbac_v1a_users WHERE ordinal=1)); INSERT INTO rbac_v1a_results VALUES(12,'admin cannot promote admin',false,'{}');
  EXCEPTION WHEN OTHERS THEN INSERT INTO rbac_v1a_results VALUES(12,'admin cannot promote admin',SQLERRM LIKE '%POS_ROLE_ESCALATION_FORBIDDEN%',jsonb_build_object('error',SQLERRM)); END;
  BEGIN PERFORM public.pos_change_brand_membership_role_v1((SELECT brand_slug FROM rbac_v1a_fixture),(SELECT id FROM rbac_v1a_users WHERE ordinal=2),'owner',(SELECT id FROM rbac_v1a_users WHERE ordinal=1)); INSERT INTO rbac_v1a_results VALUES(13,'admin cannot promote owner',false,'{}');
  EXCEPTION WHEN OTHERS THEN INSERT INTO rbac_v1a_results VALUES(13,'admin cannot promote owner',SQLERRM LIKE '%POS_ROLE_ESCALATION_FORBIDDEN%',jsonb_build_object('error',SQLERRM)); END;
  BEGIN PERFORM public.pos_change_brand_membership_role_v1((SELECT brand_slug FROM rbac_v1a_fixture),(SELECT owner_id FROM rbac_v1a_fixture),'manager',(SELECT id FROM rbac_v1a_users WHERE ordinal=1)); INSERT INTO rbac_v1a_results VALUES(14,'admin cannot modify owner',false,'{}');
  EXCEPTION WHEN OTHERS THEN INSERT INTO rbac_v1a_results VALUES(14,'admin cannot modify owner',SQLERRM LIKE '%POS_ROLE_ESCALATION_FORBIDDEN%',jsonb_build_object('error',SQLERRM)); END;
END $admin_policy$;

DO $restricted_roles$ DECLARE v_role text;v_no integer:=15; BEGIN
  FOREACH v_role IN ARRAY ARRAY['manager','cashier','inventory','editor','viewer'] LOOP
    UPDATE public.user_brand_access SET access_role=v_role WHERE user_id=(SELECT id FROM rbac_v1a_users WHERE ordinal=1) AND brand_slug=(SELECT brand_slug FROM rbac_v1a_fixture);
    BEGIN PERFORM public.pos_change_brand_membership_role_v1((SELECT brand_slug FROM rbac_v1a_fixture),(SELECT id FROM rbac_v1a_users WHERE ordinal=2),'manager',(SELECT id FROM rbac_v1a_users WHERE ordinal=1)); INSERT INTO rbac_v1a_results VALUES(v_no,v_role||' cannot manage team',false,'{}');
    EXCEPTION WHEN OTHERS THEN INSERT INTO rbac_v1a_results VALUES(v_no,v_role||' cannot manage team',SQLERRM LIKE '%POS_PERMISSION_REQUIRED%',jsonb_build_object('error',SQLERRM)); END;
    v_no:=v_no+1;
  END LOOP;
END $restricted_roles$;

-- Reset to one active owner so plan seat tests are deterministic.
UPDATE public.user_brand_access SET status='inactive' WHERE brand_slug=(SELECT brand_slug FROM rbac_v1a_fixture) AND user_id<>(SELECT owner_id FROM rbac_v1a_fixture);
DELETE FROM public.pos_user_invitations WHERE brand_slug=(SELECT brand_slug FROM rbac_v1a_fixture);

DO $start_limit$ DECLARE v_inv public.pos_user_invitations; BEGIN
  UPDATE public.pos_subscriptions SET plan_code='start' WHERE brand_slug=(SELECT brand_slug FROM rbac_v1a_fixture);
  v_inv:=public.pos_reserve_user_invitation_v1((SELECT brand_slug FROM rbac_v1a_fixture),'seat1@example.test','cashier',(SELECT owner_id FROM rbac_v1a_fixture),now()+interval '1 day','{}');
  INSERT INTO rbac_v1a_results VALUES(20,'START second seat reserved',v_inv.id IS NOT NULL,'{}');
  BEGIN PERFORM public.pos_reserve_user_invitation_v1((SELECT brand_slug FROM rbac_v1a_fixture),'seat2@example.test','cashier',(SELECT owner_id FROM rbac_v1a_fixture),now()+interval '1 day','{}'); INSERT INTO rbac_v1a_results VALUES(21,'START third seat rejected',false,'{}');
  EXCEPTION WHEN OTHERS THEN INSERT INTO rbac_v1a_results VALUES(21,'START third seat rejected',SQLERRM LIKE '%POS_USER_LIMIT_REACHED%',jsonb_build_object('error',SQLERRM)); END;
  BEGIN PERFORM public.pos_reserve_user_invitation_v1((SELECT brand_slug FROM rbac_v1a_fixture),'seat1@example.test','cashier',(SELECT owner_id FROM rbac_v1a_fixture),now()+interval '1 day','{}'); INSERT INTO rbac_v1a_results VALUES(22,'duplicate pending rejected',false,'{}');
  EXCEPTION WHEN OTHERS THEN INSERT INTO rbac_v1a_results VALUES(22,'duplicate pending rejected',SQLERRM LIKE '%POS_INVITATION_ALREADY_PENDING%',jsonb_build_object('error',SQLERRM)); END;
  PERFORM public.pos_revoke_user_invitation_v1((SELECT brand_slug FROM rbac_v1a_fixture),v_inv.id,(SELECT owner_id FROM rbac_v1a_fixture));
  INSERT INTO rbac_v1a_results SELECT 23,'revoked invite does not reserve',count(*)=0,jsonb_build_object('pending',count(*)) FROM public.pos_user_invitations WHERE brand_slug=(SELECT brand_slug FROM rbac_v1a_fixture) AND status='pending' AND expires_at>now();
END $start_limit$;

DO $plan_limits$ DECLARE i integer; BEGIN
  UPDATE public.pos_subscriptions SET plan_code='pro' WHERE brand_slug=(SELECT brand_slug FROM rbac_v1a_fixture);
  FOR i IN 1..4 LOOP PERFORM public.pos_reserve_user_invitation_v1((SELECT brand_slug FROM rbac_v1a_fixture),'pro'||i||'@example.test','manager',(SELECT owner_id FROM rbac_v1a_fixture),now()+interval '1 day','{}'); END LOOP;
  INSERT INTO rbac_v1a_results SELECT 24,'PRO five seats allowed',1+count(*)=5,jsonb_build_object('usage',1+count(*)) FROM public.pos_user_invitations WHERE brand_slug=(SELECT brand_slug FROM rbac_v1a_fixture) AND status='pending' AND expires_at>now();
  BEGIN PERFORM public.pos_reserve_user_invitation_v1((SELECT brand_slug FROM rbac_v1a_fixture),'pro5@example.test','manager',(SELECT owner_id FROM rbac_v1a_fixture),now()+interval '1 day','{}'); INSERT INTO rbac_v1a_results VALUES(25,'PRO sixth seat rejected',false,'{}'); EXCEPTION WHEN OTHERS THEN INSERT INTO rbac_v1a_results VALUES(25,'PRO sixth seat rejected',SQLERRM LIKE '%POS_USER_LIMIT_REACHED%',jsonb_build_object('error',SQLERRM)); END;
  DELETE FROM public.pos_user_invitations WHERE brand_slug=(SELECT brand_slug FROM rbac_v1a_fixture);
  UPDATE public.pos_subscriptions SET plan_code='multi' WHERE brand_slug=(SELECT brand_slug FROM rbac_v1a_fixture);
  FOR i IN 1..9 LOOP PERFORM public.pos_reserve_user_invitation_v1((SELECT brand_slug FROM rbac_v1a_fixture),'multi'||i||'@example.test','inventory',(SELECT owner_id FROM rbac_v1a_fixture),now()+interval '1 day','{}'); END LOOP;
  INSERT INTO rbac_v1a_results SELECT 26,'MULTI ten seats allowed',1+count(*)=10,jsonb_build_object('usage',1+count(*)) FROM public.pos_user_invitations WHERE brand_slug=(SELECT brand_slug FROM rbac_v1a_fixture) AND status='pending' AND expires_at>now();
  BEGIN PERFORM public.pos_reserve_user_invitation_v1((SELECT brand_slug FROM rbac_v1a_fixture),'multi10@example.test','inventory',(SELECT owner_id FROM rbac_v1a_fixture),now()+interval '1 day','{}'); INSERT INTO rbac_v1a_results VALUES(27,'MULTI eleventh seat rejected',false,'{}'); EXCEPTION WHEN OTHERS THEN INSERT INTO rbac_v1a_results VALUES(27,'MULTI eleventh seat rejected',SQLERRM LIKE '%POS_USER_LIMIT_REACHED%',jsonb_build_object('error',SQLERRM)); END;
END $plan_limits$;

DELETE FROM public.pos_user_invitations WHERE brand_slug=(SELECT brand_slug FROM rbac_v1a_fixture);
UPDATE public.pos_subscriptions SET plan_code='pro' WHERE brand_slug=(SELECT brand_slug FROM rbac_v1a_fixture);

DO $acceptance$ DECLARE v_inv public.pos_user_invitations;v_user uuid;v_email text; BEGIN
  SELECT id,email INTO v_user,v_email FROM rbac_v1a_users WHERE ordinal=1;
  v_inv:=public.pos_reserve_user_invitation_v1((SELECT brand_slug FROM rbac_v1a_fixture),v_email,'cashier',(SELECT owner_id FROM rbac_v1a_fixture),now()+interval '1 day','{}');
  BEGIN PERFORM public.pos_accept_user_invitation_v1((SELECT brand_slug FROM rbac_v1a_fixture),v_inv.id,v_user,'wrong@example.test'); INSERT INTO rbac_v1a_results VALUES(28,'wrong email rejected',false,'{}'); EXCEPTION WHEN OTHERS THEN INSERT INTO rbac_v1a_results VALUES(28,'wrong email rejected',SQLERRM LIKE '%POS_INVITATION_EMAIL_MISMATCH%',jsonb_build_object('error',SQLERRM)); END;
  PERFORM public.pos_accept_user_invitation_v1((SELECT brand_slug FROM rbac_v1a_fixture),v_inv.id,v_user,v_email);
  INSERT INTO rbac_v1a_results SELECT 29,'acceptance creates active membership',status='active' AND access_role='cashier',to_jsonb(membership) FROM public.user_brand_access membership WHERE user_id=v_user AND brand_slug=(SELECT brand_slug FROM rbac_v1a_fixture);
  INSERT INTO rbac_v1a_results SELECT 30,'accepted invite leaves pending usage',count(*)=0,jsonb_build_object('pending',count(*)) FROM public.pos_user_invitations WHERE id=v_inv.id AND status='pending';
  UPDATE public.user_brand_access SET status='inactive' WHERE user_id=v_user AND brand_slug=(SELECT brand_slug FROM rbac_v1a_fixture);
  v_inv:=public.pos_reserve_user_invitation_v1((SELECT brand_slug FROM rbac_v1a_fixture),v_email,'inventory',(SELECT owner_id FROM rbac_v1a_fixture),now()+interval '1 day','{}');
  PERFORM public.pos_accept_user_invitation_v1((SELECT brand_slug FROM rbac_v1a_fixture),v_inv.id,v_user,v_email);
  INSERT INTO rbac_v1a_results SELECT 31,'inactive membership reactivated',status='active' AND access_role='inventory',to_jsonb(membership) FROM public.user_brand_access membership WHERE user_id=v_user AND brand_slug=(SELECT brand_slug FROM rbac_v1a_fixture);
END $acceptance$;

DO $invalid_acceptance$ DECLARE v_inv public.pos_user_invitations;v_user uuid;v_email text; BEGIN
  SELECT id,email INTO v_user,v_email FROM rbac_v1a_users WHERE ordinal=2;
  v_inv:=public.pos_reserve_user_invitation_v1((SELECT brand_slug FROM rbac_v1a_fixture),v_email,'manager',(SELECT owner_id FROM rbac_v1a_fixture),now()+interval '1 day','{}');
  PERFORM public.pos_revoke_user_invitation_v1((SELECT brand_slug FROM rbac_v1a_fixture),v_inv.id,(SELECT owner_id FROM rbac_v1a_fixture));
  BEGIN PERFORM public.pos_accept_user_invitation_v1((SELECT brand_slug FROM rbac_v1a_fixture),v_inv.id,v_user,v_email); INSERT INTO rbac_v1a_results VALUES(32,'revoked invite rejected',false,'{}'); EXCEPTION WHEN OTHERS THEN INSERT INTO rbac_v1a_results VALUES(32,'revoked invite rejected',SQLERRM LIKE '%POS_INVITATION_NOT_PENDING%',jsonb_build_object('error',SQLERRM)); END;
  INSERT INTO public.pos_user_invitations(brand_slug,email,access_role,status,invited_by,created_at,expires_at) VALUES((SELECT brand_slug FROM rbac_v1a_fixture),v_email,'cashier','pending',(SELECT owner_id FROM rbac_v1a_fixture),now()-interval '2 days',now()-interval '1 day') RETURNING * INTO v_inv;
  BEGIN PERFORM public.pos_accept_user_invitation_v1((SELECT brand_slug FROM rbac_v1a_fixture),v_inv.id,v_user,v_email); INSERT INTO rbac_v1a_results VALUES(33,'expired invite rejected',false,'{}'); EXCEPTION WHEN OTHERS THEN INSERT INTO rbac_v1a_results VALUES(33,'expired invite rejected',SQLERRM LIKE '%POS_INVITATION_EXPIRED%',jsonb_build_object('error',SQLERRM)); END;
END $invalid_acceptance$;

DO $downgrade$ DECLARE v_inv public.pos_user_invitations;v_user uuid;v_email text;i integer; BEGIN
  DELETE FROM public.pos_user_invitations WHERE brand_slug=(SELECT brand_slug FROM rbac_v1a_fixture);
  UPDATE public.user_brand_access SET status='inactive' WHERE brand_slug=(SELECT brand_slug FROM rbac_v1a_fixture) AND user_id<>(SELECT owner_id FROM rbac_v1a_fixture);
  SELECT id,email INTO v_user,v_email FROM rbac_v1a_users WHERE ordinal=2;
  v_inv:=public.pos_reserve_user_invitation_v1((SELECT brand_slug FROM rbac_v1a_fixture),v_email,'manager',(SELECT owner_id FROM rbac_v1a_fixture),now()+interval '1 day','{}');
  FOR i IN 1..3 LOOP PERFORM public.pos_reserve_user_invitation_v1((SELECT brand_slug FROM rbac_v1a_fixture),'downgrade'||i||'@example.test','cashier',(SELECT owner_id FROM rbac_v1a_fixture),now()+interval '1 day','{}'); END LOOP;
  UPDATE public.pos_subscriptions SET plan_code='start' WHERE brand_slug=(SELECT brand_slug FROM rbac_v1a_fixture);
  BEGIN PERFORM public.pos_accept_user_invitation_v1((SELECT brand_slug FROM rbac_v1a_fixture),v_inv.id,v_user,v_email); INSERT INTO rbac_v1a_results VALUES(34,'downgrade capacity revalidated',false,'{}'); EXCEPTION WHEN OTHERS THEN INSERT INTO rbac_v1a_results VALUES(34,'downgrade capacity revalidated',SQLERRM LIKE '%POS_USER_LIMIT_REACHED%',jsonb_build_object('error',SQLERRM)); END;
END $downgrade$;

INSERT INTO rbac_v1a_results SELECT 35,'acceptance concurrency authority encoded',definition LIKE '%pg_advisory_xact_lock%' AND definition LIKE '%FOR UPDATE%' AND definition LIKE '%POS_USER_LIMIT_REACHED%',jsonb_build_object('checked','transaction lock + capacity revalidation') FROM (SELECT pg_get_functiondef('public.pos_accept_user_invitation_v1(text,uuid,uuid,text)'::regprocedure) definition) function;
INSERT INTO rbac_v1a_results SELECT 36,'legacy editor stored unchanged',count(*)=1,jsonb_build_object('count',count(*)) FROM public.user_brand_access WHERE brand_slug='nash-mood' AND access_role='editor';
UPDATE public.user_brand_access SET status='active',access_role='inventory'
WHERE user_id=(SELECT id FROM rbac_v1a_users WHERE ordinal=1) AND brand_slug=(SELECT brand_slug FROM rbac_v1a_fixture);
INSERT INTO public.user_brand_access(user_id,brand_slug,access_role,status,updated_at)
VALUES((SELECT id FROM rbac_v1a_users WHERE ordinal=1),(SELECT slug FROM rbac_v1a_other_brand),'viewer','active',now());
INSERT INTO rbac_v1a_results
SELECT 37,'multi-brand roles remain membership scoped',
  count(*)=2 AND count(DISTINCT access_role)=2,
  jsonb_build_object('roles',jsonb_agg(jsonb_build_object('brand',brand_slug,'role',access_role) ORDER BY brand_slug))
FROM public.user_brand_access
WHERE user_id=(SELECT id FROM rbac_v1a_users WHERE ordinal=1)
  AND brand_slug IN ((SELECT brand_slug FROM rbac_v1a_fixture),(SELECT slug FROM rbac_v1a_other_brand));

DO $guard$ BEGIN IF (SELECT count(*) FROM rbac_v1a_results)<>37 THEN RAISE EXCEPTION 'POS_RBAC_V1A_EXPECTED_37_TESTS_FOUND_%',(SELECT count(*) FROM rbac_v1a_results); END IF; END $guard$;

SELECT test_no,test_name,passed,details FROM rbac_v1a_results
UNION ALL SELECT 38,'SUMMARY all_checks_passed',bool_and(passed),jsonb_build_object('passed_count',count(*) FILTER(WHERE passed),'failed_count',count(*) FILTER(WHERE NOT passed),'all_checks_passed',bool_and(passed)) FROM rbac_v1a_results
ORDER BY test_no;

ROLLBACK;
