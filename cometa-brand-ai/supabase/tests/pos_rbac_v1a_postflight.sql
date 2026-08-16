-- RBAC V1A postflight. Strictly read-only.
WITH role_constraint AS (
  SELECT pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
  WHERE conrelid = 'public.user_brand_access'::regclass
    AND conname = 'user_brand_access_access_role_rbac_v1a_ck'
), functions AS (
  SELECT procedure.proname, procedure.prosecdef, procedure.proconfig, procedure.proacl,
    pg_get_functiondef(procedure.oid) AS definition
  FROM pg_proc procedure
  JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public' AND procedure.proname IN (
    'pos_change_brand_membership_role_v1', 'pos_revoke_brand_membership_v1',
    'pos_reserve_user_invitation_v1', 'pos_revoke_user_invitation_v1',
    'pos_accept_user_invitation_v1'
  )
), checks(check_no, check_name, passed, details) AS (
  SELECT 1, 'canonical and legacy roles allowed', COALESCE((SELECT
    definition LIKE '%owner%' AND definition LIKE '%admin%' AND definition LIKE '%manager%'
    AND definition LIKE '%cashier%' AND definition LIKE '%inventory%'
    AND definition LIKE '%editor%' AND definition LIKE '%viewer%' FROM role_constraint), false), '{}'
  UNION ALL SELECT 2, 'known owners preserved', count(*) = 3, jsonb_build_object('count',count(*))
    FROM public.user_brand_access WHERE brand_slug IN ('magenta-fit-wear','nash-mood','tienda-morotiendas') AND access_role='owner' AND status='active'
  UNION ALL SELECT 3, 'nash editor preserved', count(*) = 1, jsonb_build_object('count',count(*))
    FROM public.user_brand_access WHERE brand_slug='nash-mood' AND access_role='editor' AND status='active'
  UNION ALL SELECT 4, 'no duplicate memberships', count(*) = 0, jsonb_build_object('duplicates',count(*))
    FROM (SELECT user_id,brand_slug FROM public.user_brand_access GROUP BY user_id,brand_slug HAVING count(*)>1) duplicate
  UNION ALL SELECT 5, 'invitation table exists', to_regclass('public.pos_user_invitations') IS NOT NULL, '{}'
  UNION ALL SELECT 6, 'invitation role constraint', count(*)=1, jsonb_build_object('count',count(*)) FROM pg_constraint
    WHERE conrelid='public.pos_user_invitations'::regclass AND conname='pos_user_invitations_role_ck'
  UNION ALL SELECT 7, 'invitation status constraint', count(*)=1, jsonb_build_object('count',count(*)) FROM pg_constraint
    WHERE conrelid='public.pos_user_invitations'::regclass AND conname='pos_user_invitations_status_ck'
  UNION ALL SELECT 8, 'pending unique index', count(*)=1, jsonb_build_object('count',count(*)) FROM pg_indexes
    WHERE schemaname='public' AND tablename='pos_user_invitations' AND indexname='pos_user_invitations_pending_email_uidx'
      AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%(brand_slug, email)%' AND indexdef LIKE '%status = ''pending''%'
  UNION ALL SELECT 9, 'invitation RLS enabled', relrowsecurity, '{}' FROM pg_class WHERE oid='public.pos_user_invitations'::regclass
  UNION ALL SELECT 10, 'browser table writes denied', bool_and(
    NOT has_table_privilege(role_name,'public.pos_user_invitations',privilege_name)
  ), jsonb_build_object('checked',count(*)) FROM (VALUES('anon'),('authenticated')) role(role_name)
    CROSS JOIN (VALUES('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) privilege(privilege_name)
  UNION ALL SELECT 11, 'five server RPCs exist', count(*)=5, jsonb_build_object('count',count(*)) FROM functions
  UNION ALL SELECT 12, 'all RPCs security definer', count(*)=5 AND bool_and(prosecdef), jsonb_build_object('count',count(*)) FROM functions
  UNION ALL SELECT 13, 'all RPCs secure search path', count(*)=5 AND bool_and(proconfig @> ARRAY['search_path=public']), jsonb_build_object('count',count(*)) FROM functions
  UNION ALL SELECT 14, 'PUBLIC execute denied', count(*)=5 AND bool_and(NOT EXISTS(
    SELECT 1 FROM aclexplode(functions.proacl) acl WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
  )), jsonb_build_object('checked',count(*)) FROM functions
  UNION ALL SELECT 15, 'browser execute denied', bool_and(NOT has_function_privilege(role_name,signature,'EXECUTE')), jsonb_build_object('checked',count(*))
    FROM (VALUES('anon'),('authenticated')) role(role_name) CROSS JOIN (VALUES
    ('public.pos_change_brand_membership_role_v1(text,uuid,text,uuid)'),('public.pos_revoke_brand_membership_v1(text,uuid,uuid)'),
    ('public.pos_reserve_user_invitation_v1(text,text,text,uuid,timestamptz,jsonb)'),('public.pos_revoke_user_invitation_v1(text,uuid,uuid)'),
    ('public.pos_accept_user_invitation_v1(text,uuid,uuid,text)')) f(signature)
  UNION ALL SELECT 16, 'service role execute granted', bool_and(has_function_privilege('service_role',signature,'EXECUTE')), jsonb_build_object('checked',count(*)) FROM (VALUES
    ('public.pos_change_brand_membership_role_v1(text,uuid,text,uuid)'),('public.pos_revoke_brand_membership_v1(text,uuid,uuid)'),
    ('public.pos_reserve_user_invitation_v1(text,text,text,uuid,timestamptz,jsonb)'),('public.pos_revoke_user_invitation_v1(text,uuid,uuid)'),
    ('public.pos_accept_user_invitation_v1(text,uuid,uuid,text)')) f(signature)
  UNION ALL SELECT 17, 'last owner trigger exists', count(*)=1, jsonb_build_object('count',count(*)) FROM pg_trigger
    WHERE tgrelid='public.user_brand_access'::regclass AND tgname='user_brand_access_last_owner_rbac_v1a' AND NOT tgisinternal
  UNION ALL SELECT 18, 'owner invariant DB-side', COALESCE((SELECT pg_get_functiondef(oid) LIKE '%POS_LAST_OWNER_REQUIRED%' FROM pg_proc WHERE oid='public.pos_rbac_protect_last_owner_v1()'::regprocedure),false), '{}'
  UNION ALL SELECT 19, 'reservation uses max_users', COALESCE((SELECT definition LIKE '%max_users%' AND definition LIKE '%POS_USER_LIMIT_REACHED%' FROM functions WHERE proname='pos_reserve_user_invitation_v1'),false), '{}'
  UNION ALL SELECT 20, 'acceptance revalidates capacity', COALESCE((SELECT definition LIKE '%max_users%' AND definition LIKE '%POS_USER_LIMIT_REACHED%' AND definition LIKE '%pg_advisory_xact_lock%' FROM functions WHERE proname='pos_accept_user_invitation_v1'),false), '{}'
  UNION ALL SELECT 21, 'acceptance validates auth email', COALESCE((SELECT definition LIKE '%auth.users%' AND definition LIKE '%POS_INVITATION_EMAIL_MISMATCH%' FROM functions WHERE proname='pos_accept_user_invitation_v1'),false), '{}'
  UNION ALL SELECT 22, 'ENTRY V1B owner intact', COALESCE(pg_get_functiondef('public.pos_create_self_service_business_v1(text,text,uuid,uuid)'::regprocedure) LIKE '%''owner''%',false), '{}'
  UNION ALL SELECT 23, 'CORE-1 lifecycle intact', to_regprocedure('public.pos_get_subscription_lifecycle(text)') IS NOT NULL, '{}'
  UNION ALL SELECT 24, 'CORE-1 entitlements intact', to_regprocedure('public.pos_get_brand_entitlements(text)') IS NOT NULL, '{}'
  UNION ALL SELECT 25, 'no parallel membership table', to_regclass('public.pos_users') IS NULL AND to_regclass('public.brand_users') IS NULL AND to_regclass('public.employees') IS NULL, '{}'
), diagnostic AS (
  SELECT * FROM checks
  UNION ALL SELECT 26, 'SUMMARY all_checks_passed', bool_and(passed), jsonb_build_object(
    'passed_count',count(*) FILTER(WHERE passed),'failed_count',count(*) FILTER(WHERE NOT passed),'all_checks_passed',bool_and(passed)
  ) FROM checks
)
SELECT * FROM diagnostic ORDER BY check_no;
