-- RBAC V1B.1 postflight. Strictly read-only; do not run the functional suite here.
WITH decline_function AS (
  SELECT procedure.oid, procedure.prosecdef, procedure.proconfig, procedure.proacl,
    pg_get_functiondef(procedure.oid) AS definition
  FROM pg_proc procedure
  WHERE procedure.oid = 'public.pos_decline_user_invitation_v1(uuid,uuid,text)'::regprocedure
), checks(check_no, check_name, passed, details) AS (
  SELECT 1, 'decline RPC exists', EXISTS(SELECT 1 FROM decline_function), '{}'::jsonb
  UNION ALL SELECT 2, 'decline RPC security definer', COALESCE((SELECT prosecdef FROM decline_function),false), '{}'::jsonb
  UNION ALL SELECT 3, 'decline RPC secure search path', COALESCE((SELECT proconfig @> ARRAY['search_path=public'] FROM decline_function),false), '{}'::jsonb
  UNION ALL SELECT 4, 'decline RPC PUBLIC execute denied', COALESCE((SELECT NOT EXISTS(
    SELECT 1 FROM aclexplode(proacl) acl WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
  ) FROM decline_function),false), '{}'::jsonb
  UNION ALL SELECT 5, 'decline RPC anon execute denied', NOT has_function_privilege('anon','public.pos_decline_user_invitation_v1(uuid,uuid,text)','EXECUTE'), '{}'::jsonb
  UNION ALL SELECT 6, 'decline RPC authenticated execute denied', NOT has_function_privilege('authenticated','public.pos_decline_user_invitation_v1(uuid,uuid,text)','EXECUTE'), '{}'::jsonb
  UNION ALL SELECT 7, 'decline RPC service role execute granted', has_function_privilege('service_role','public.pos_decline_user_invitation_v1(uuid,uuid,text)','EXECUTE'), '{}'::jsonb
  UNION ALL SELECT 8, 'decline validates auth email', COALESCE((SELECT definition LIKE '%auth.users%' AND definition LIKE '%POS_INVITATION_EMAIL_MISMATCH%' FROM decline_function),false), '{}'::jsonb
  UNION ALL SELECT 9, 'decline locks invitation seat scope', COALESCE((SELECT definition LIKE '%pg_advisory_xact_lock%' AND definition LIKE '%FOR UPDATE%' FROM decline_function),false), '{}'::jsonb
  UNION ALL SELECT 10, 'decline marks revoked only', COALESCE((SELECT definition LIKE '%status = ''revoked''%' AND definition LIKE '%revoked_at = now()%' FROM decline_function),false), '{}'::jsonb
  UNION ALL SELECT 11, 'decline preserves expiry handling', COALESCE((SELECT definition LIKE '%status = ''expired''%' AND definition LIKE '%POS_INVITATION_EXPIRED%' FROM decline_function),false), '{}'::jsonb
  UNION ALL SELECT 12, 'V1A invitation table intact', to_regclass('public.pos_user_invitations') IS NOT NULL
    AND (SELECT relrowsecurity FROM pg_class WHERE oid='public.pos_user_invitations'::regclass), '{}'::jsonb
  UNION ALL SELECT 13, 'V1A pending unique index intact', EXISTS(
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='pos_user_invitations'
      AND indexname='pos_user_invitations_pending_email_uidx'
  ), '{}'::jsonb
  UNION ALL SELECT 14, 'V1A reserve RPC intact', to_regprocedure('public.pos_reserve_user_invitation_v1(text,text,text,uuid,timestamptz,jsonb)') IS NOT NULL, '{}'::jsonb
  UNION ALL SELECT 15, 'V1A accept RPC intact', to_regprocedure('public.pos_accept_user_invitation_v1(text,uuid,uuid,text)') IS NOT NULL, '{}'::jsonb
  UNION ALL SELECT 16, 'V1A owner trigger intact', EXISTS(
    SELECT 1 FROM pg_trigger WHERE tgrelid='public.user_brand_access'::regclass
      AND tgname='user_brand_access_last_owner_rbac_v1a' AND NOT tgisinternal
  ), '{}'::jsonb
  UNION ALL SELECT 17, 'V1A role constraint intact', COALESCE((
    SELECT pg_get_constraintdef(oid) LIKE '%owner%' AND pg_get_constraintdef(oid) LIKE '%viewer%'
    FROM pg_constraint WHERE conrelid='public.user_brand_access'::regclass
      AND conname='user_brand_access_access_role_rbac_v1a_ck'
  ),false), '{}'::jsonb
), diagnostic AS (
  SELECT * FROM checks
  UNION ALL SELECT 18, 'SUMMARY all_checks_passed', bool_and(passed), jsonb_build_object(
    'passed_count',count(*) FILTER(WHERE passed),
    'failed_count',count(*) FILTER(WHERE NOT passed),
    'all_checks_passed',bool_and(passed)
  ) FROM checks
)
SELECT * FROM diagnostic ORDER BY check_no;
