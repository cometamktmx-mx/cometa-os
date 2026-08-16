-- COMETA POS Commercial Grants V1 postflight.
-- Run this after the migration and before any manual grant seed.
WITH public_table_acl AS (
  SELECT acl.privilege_type
  FROM pg_class table_row
  CROSS JOIN LATERAL aclexplode(
    COALESCE(table_row.relacl, acldefault('r', table_row.relowner))
  ) AS acl(grantee, grantor, privilege_type, is_grantable)
  WHERE table_row.oid = 'public.pos_commercial_grants'::regclass
    AND acl.grantee = 0
    AND acl.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
),
public_effective_access_function_acl AS (
  SELECT acl.privilege_type
  FROM pg_proc function_row
  CROSS JOIN LATERAL aclexplode(
    COALESCE(function_row.proacl, acldefault('f', function_row.proowner))
  ) AS acl(grantee, grantor, privilege_type, is_grantable)
  WHERE function_row.oid = to_regprocedure('public.pos_get_effective_commercial_access(text)')
    AND acl.grantee = 0
    AND acl.privilege_type = 'EXECUTE'
),
checks AS (
  SELECT 1 AS check_no,
         'pos_commercial_grants table exists'::text AS check_name,
         to_regclass('public.pos_commercial_grants') IS NOT NULL AS passed,
         jsonb_build_object('table', to_regclass('public.pos_commercial_grants')) AS details

  UNION ALL
  SELECT 2,
         'grant table has the expected columns',
         count(*) = 14,
         jsonb_build_object('columns', jsonb_agg(column_name ORDER BY ordinal_position))
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'pos_commercial_grants'

  UNION ALL
  SELECT 3,
         'id is the primary key',
         EXISTS (
           SELECT 1
           FROM pg_constraint con
           WHERE con.conrelid = 'public.pos_commercial_grants'::regclass
             AND con.contype = 'p'
             AND pg_get_constraintdef(con.oid) LIKE '%(id)%'
         ),
         '{}'::jsonb

  UNION ALL
  SELECT 4,
         'brand FK targets brands.slug with cascade/restrict semantics',
         EXISTS (
           SELECT 1
           FROM pg_constraint con
           JOIN pg_class target ON target.oid = con.confrelid
           JOIN pg_namespace target_schema ON target_schema.oid = target.relnamespace
           WHERE con.conrelid = 'public.pos_commercial_grants'::regclass
             AND con.contype = 'f'
             AND target_schema.nspname = 'public'
             AND target.relname = 'brands'
             AND con.confupdtype = 'c'
             AND con.confdeltype = 'r'
             AND pg_get_constraintdef(con.oid) LIKE '%(brand_slug)%'
         ),
         '{}'::jsonb

  UNION ALL
  SELECT 5,
         'plan FK targets pos_plans.code with cascade/restrict semantics',
         EXISTS (
           SELECT 1
           FROM pg_constraint con
           JOIN pg_class target ON target.oid = con.confrelid
           JOIN pg_namespace target_schema ON target_schema.oid = target.relnamespace
           WHERE con.conrelid = 'public.pos_commercial_grants'::regclass
             AND con.contype = 'f'
             AND target_schema.nspname = 'public'
             AND target.relname = 'pos_plans'
             AND con.confupdtype = 'c'
             AND con.confdeltype = 'r'
             AND pg_get_constraintdef(con.oid) LIKE '%(plan_code)%'
         ),
         '{}'::jsonb

  UNION ALL
  SELECT 6,
         'grant checks enforce type status window and revocation',
         (
           SELECT count(*)
           FROM pg_constraint con
           WHERE con.conrelid = 'public.pos_commercial_grants'::regclass
             AND con.contype = 'c'
         ) >= 4,
         jsonb_build_object(
           'constraints', (
             SELECT jsonb_agg(pg_get_constraintdef(con.oid) ORDER BY con.conname)
             FROM pg_constraint con
             WHERE con.conrelid = 'public.pos_commercial_grants'::regclass
               AND con.contype = 'c'
           )
         )

  UNION ALL
  SELECT 7,
         'grant type status and time inputs have no defaults',
         count(*) = 5,
         jsonb_build_object('columns', jsonb_agg(column_name ORDER BY column_name))
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'pos_commercial_grants'
    AND column_name IN ('grant_type', 'plan_code', 'status', 'starts_at', 'ends_at')
    AND column_default IS NULL

  UNION ALL
  SELECT 8,
         'RLS is enabled',
         COALESCE((
           SELECT relrowsecurity
           FROM pg_class
           WHERE oid = 'public.pos_commercial_grants'::regclass
         ), false),
         '{}'::jsonb

  UNION ALL
  SELECT 9,
         'PUBLIC anon and authenticated have no table privileges',
         NOT EXISTS (SELECT 1 FROM public_table_acl)
           AND NOT has_table_privilege('anon', 'public.pos_commercial_grants', 'SELECT')
           AND NOT has_table_privilege('anon', 'public.pos_commercial_grants', 'INSERT')
           AND NOT has_table_privilege('anon', 'public.pos_commercial_grants', 'UPDATE')
           AND NOT has_table_privilege('anon', 'public.pos_commercial_grants', 'DELETE')
           AND NOT has_table_privilege('authenticated', 'public.pos_commercial_grants', 'SELECT')
           AND NOT has_table_privilege('authenticated', 'public.pos_commercial_grants', 'INSERT')
           AND NOT has_table_privilege('authenticated', 'public.pos_commercial_grants', 'UPDATE')
           AND NOT has_table_privilege('authenticated', 'public.pos_commercial_grants', 'DELETE'),
         jsonb_build_object(
           'public', jsonb_build_object(
             'select', EXISTS (SELECT 1 FROM public_table_acl WHERE privilege_type = 'SELECT'),
             'insert', EXISTS (SELECT 1 FROM public_table_acl WHERE privilege_type = 'INSERT'),
             'update', EXISTS (SELECT 1 FROM public_table_acl WHERE privilege_type = 'UPDATE'),
             'delete', EXISTS (SELECT 1 FROM public_table_acl WHERE privilege_type = 'DELETE')
           ),
           'anon', jsonb_build_object(
             'select', has_table_privilege('anon', 'public.pos_commercial_grants', 'SELECT'),
             'insert', has_table_privilege('anon', 'public.pos_commercial_grants', 'INSERT'),
             'update', has_table_privilege('anon', 'public.pos_commercial_grants', 'UPDATE'),
             'delete', has_table_privilege('anon', 'public.pos_commercial_grants', 'DELETE')
           ),
           'authenticated', jsonb_build_object(
             'select', has_table_privilege('authenticated', 'public.pos_commercial_grants', 'SELECT'),
             'insert', has_table_privilege('authenticated', 'public.pos_commercial_grants', 'INSERT'),
             'update', has_table_privilege('authenticated', 'public.pos_commercial_grants', 'UPDATE'),
             'delete', has_table_privilege('authenticated', 'public.pos_commercial_grants', 'DELETE')
           )
         )

  UNION ALL
  SELECT 10,
         'service_role has SELECT INSERT UPDATE but not DELETE',
         has_table_privilege('service_role', 'public.pos_commercial_grants', 'SELECT')
           AND has_table_privilege('service_role', 'public.pos_commercial_grants', 'INSERT')
           AND has_table_privilege('service_role', 'public.pos_commercial_grants', 'UPDATE')
           AND NOT has_table_privilege('service_role', 'public.pos_commercial_grants', 'DELETE'),
         jsonb_build_object(
           'select', has_table_privilege('service_role', 'public.pos_commercial_grants', 'SELECT'),
           'insert', has_table_privilege('service_role', 'public.pos_commercial_grants', 'INSERT'),
           'update', has_table_privilege('service_role', 'public.pos_commercial_grants', 'UPDATE'),
           'delete', has_table_privilege('service_role', 'public.pos_commercial_grants', 'DELETE')
         )

  UNION ALL
  SELECT 11,
         'updated_at and overlap triggers are installed',
         (
           SELECT count(*)
           FROM pg_trigger trigger_row
           WHERE trigger_row.tgrelid = 'public.pos_commercial_grants'::regclass
             AND NOT trigger_row.tgisinternal
             AND trigger_row.tgname IN (
               'pos_commercial_grants_updated_at_v1',
               'pos_commercial_grants_overlap_v1',
               'pos_commercial_grants_immutability_v1'
             )
         ) = 3,
         jsonb_build_object(
           'triggers', (
             SELECT jsonb_agg(trigger_row.tgname ORDER BY trigger_row.tgname)
             FROM pg_trigger trigger_row
             WHERE trigger_row.tgrelid = 'public.pos_commercial_grants'::regclass
               AND NOT trigger_row.tgisinternal
           )
         )

  UNION ALL
  SELECT 12,
         'foundation migration inserted no grants',
         (SELECT count(*) FROM public.pos_commercial_grants) = 0,
         jsonb_build_object('rows', (SELECT count(*) FROM public.pos_commercial_grants))

  UNION ALL
  SELECT 13,
         'effective access RPC is SECURITY DEFINER with safe search_path',
         EXISTS (
           SELECT 1
           FROM pg_proc proc
           JOIN pg_namespace namespace ON namespace.oid = proc.pronamespace
           WHERE namespace.nspname = 'public'
             AND proc.proname = 'pos_get_effective_commercial_access'
             AND proc.prosecdef
             AND COALESCE(proc.proconfig @> ARRAY['search_path=public'], false)
         ),
         '{}'::jsonb

  UNION ALL
  SELECT 14,
         'effective access RPC is service-role only',
         has_function_privilege('service_role', 'public.pos_get_effective_commercial_access(text)', 'EXECUTE')
           AND NOT EXISTS (SELECT 1 FROM public_effective_access_function_acl)
           AND NOT has_function_privilege('anon', 'public.pos_get_effective_commercial_access(text)', 'EXECUTE')
           AND NOT has_function_privilege('authenticated', 'public.pos_get_effective_commercial_access(text)', 'EXECUTE'),
         jsonb_build_object(
           'service_role', has_function_privilege('service_role', 'public.pos_get_effective_commercial_access(text)', 'EXECUTE'),
           'public', EXISTS (SELECT 1 FROM public_effective_access_function_acl),
           'anon', has_function_privilege('anon', 'public.pos_get_effective_commercial_access(text)', 'EXECUTE'),
           'authenticated', has_function_privilege('authenticated', 'public.pos_get_effective_commercial_access(text)', 'EXECUTE')
         )

  UNION ALL
  SELECT 15,
         'native lifecycle and effective entitlements RPCs remain installed',
         to_regprocedure('public.pos_get_subscription_lifecycle(text)') IS NOT NULL
           AND to_regprocedure('public.pos_get_brand_entitlements(text)') IS NOT NULL,
         jsonb_build_object(
           'nativeLifecycle', to_regprocedure('public.pos_get_subscription_lifecycle(text)'),
           'entitlements', to_regprocedure('public.pos_get_brand_entitlements(text)')
         )

  UNION ALL
  SELECT 16,
         'V1A invitation RPCs remain installed',
         to_regprocedure('public.pos_reserve_user_invitation_v1(text,text,text,uuid,timestamptz,jsonb)') IS NOT NULL
           AND to_regprocedure('public.pos_accept_user_invitation_v1(text,uuid,uuid,text)') IS NOT NULL,
         '{}'::jsonb

  UNION ALL
  SELECT 17,
         'owner invariant trigger remains installed',
         EXISTS (
           SELECT 1
           FROM pg_trigger trigger_row
           WHERE trigger_row.tgrelid = 'public.user_brand_access'::regclass
             AND trigger_row.tgname = 'user_brand_access_last_owner_rbac_v1a'
         ),
         '{}'::jsonb
)
SELECT check_no, check_name, passed, details
FROM checks
UNION ALL
SELECT 18,
       'SUMMARY all_checks_passed',
       bool_and(passed),
       jsonb_build_object(
         'passed_count', count(*) FILTER (WHERE passed),
         'failed_count', count(*) FILTER (WHERE NOT passed),
         'all_checks_passed', bool_and(passed)
       )
FROM checks
ORDER BY check_no;
