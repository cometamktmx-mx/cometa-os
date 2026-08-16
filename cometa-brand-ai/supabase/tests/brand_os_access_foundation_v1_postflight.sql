-- Cometa OS Access Foundation V1 postflight. Strictly read-only.
WITH relation AS (
  SELECT class.oid, class.relrowsecurity, class.relacl, class.relowner
  FROM pg_class class
  WHERE class.oid = 'public.brand_os_access'::regclass
), columns AS (
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'brand_os_access'
), constraints AS (
  SELECT con.conname, con.contype, con.confupdtype,
    con.confdeltype, pg_get_constraintdef(con.oid) AS definition
  FROM pg_constraint con
  WHERE con.conrelid = 'public.brand_os_access'::regclass
), privileges AS (
  SELECT acl.grantee, acl.privilege_type
  FROM relation
  CROSS JOIN LATERAL aclexplode(
    COALESCE(relation.relacl, acldefault('r', relation.relowner))
  ) acl
), checks(check_no, check_name, passed, details) AS (
  SELECT 1, 'brand_os_access table exists', to_regclass('public.brand_os_access') IS NOT NULL, '{}'::jsonb
  UNION ALL SELECT 2, 'exact access columns exist', (
    SELECT (SELECT count(*) FROM columns) = 6 AND count(*) = 6
    FROM columns
    WHERE column_name IN ('brand_slug', 'status', 'started_at', 'ended_at', 'created_at', 'updated_at')
  ), jsonb_build_object('columns', (SELECT jsonb_agg(column_name ORDER BY column_name) FROM columns))
  UNION ALL SELECT 3, 'brand_slug is the primary key', EXISTS(
    SELECT 1 FROM constraints
    WHERE contype = 'p' AND definition = 'PRIMARY KEY (brand_slug)'
  ), '{}'::jsonb
  UNION ALL SELECT 4, 'brand_slug references brands.slug with stable actions', EXISTS(
    SELECT 1 FROM constraints
    WHERE contype = 'f'
      AND definition LIKE '%FOREIGN KEY (brand_slug)%REFERENCES brands(slug)%'
      AND confupdtype = 'c'
      AND confdeltype = 'r'
  ), '{}'::jsonb
  UNION ALL SELECT 5, 'status allows only active paused inactive', EXISTS(
    SELECT 1 FROM constraints
    WHERE conname = 'brand_os_access_status_ck'
      AND definition LIKE '%active%'
      AND definition LIKE '%paused%'
      AND definition LIKE '%inactive%'
  ), '{}'::jsonb
  UNION ALL SELECT 6, 'status has no default', COALESCE((
    SELECT column_default IS NULL FROM columns WHERE column_name = 'status'
  ), false), '{}'::jsonb
  UNION ALL SELECT 7, 'temporal consistency constraint exists', EXISTS(
    SELECT 1 FROM constraints
    WHERE conname = 'brand_os_access_time_window_ck'
      AND definition LIKE '%ended_at >= started_at%'
  ), '{}'::jsonb
  UNION ALL SELECT 8, 'RLS enabled without browser policies', COALESCE((
    SELECT relrowsecurity FROM relation
  ), false) AND NOT EXISTS(
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'brand_os_access'
  ), '{}'::jsonb
  UNION ALL SELECT 9, 'PUBLIC has no table privileges', NOT EXISTS(
    SELECT 1 FROM privileges WHERE grantee = 0
  ), '{}'::jsonb
  UNION ALL SELECT 10, 'anon and authenticated have no table privileges', NOT EXISTS(
    SELECT 1
    FROM (VALUES ('anon'), ('authenticated')) role(role_name)
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) privilege(privilege_name)
    WHERE has_table_privilege(role.role_name, 'public.brand_os_access', privilege.privilege_name)
  ), '{}'::jsonb
  UNION ALL SELECT 11, 'service_role has required table privileges', (
    SELECT bool_and(has_table_privilege('service_role', 'public.brand_os_access', privilege_name))
    FROM (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) privilege(privilege_name)
  ), '{}'::jsonb
  UNION ALL SELECT 12, 'updated_at trigger exists', EXISTS(
    SELECT 1 FROM pg_trigger trigger
    WHERE trigger.tgrelid = 'public.brand_os_access'::regclass
      AND trigger.tgname = 'brand_os_access_updated_at'
      AND NOT trigger.tgisinternal
  ), '{}'::jsonb
  UNION ALL SELECT 13, 'updated_at function is server-only and records update time', COALESCE((
    SELECT procedure.prosecdef = false
      AND procedure.proconfig @> ARRAY['search_path=public']
      AND pg_get_functiondef(procedure.oid) LIKE '%clock_timestamp()%'
    FROM pg_proc procedure
    WHERE procedure.oid = 'public.brand_os_access_set_updated_at()'::regprocedure
  ), false)
    AND NOT has_function_privilege('anon', 'public.brand_os_access_set_updated_at()', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.brand_os_access_set_updated_at()', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.brand_os_access_set_updated_at()', 'EXECUTE'), '{}'::jsonb
  UNION ALL SELECT 14, 'migration inserted no OS access rows', (SELECT count(*) = 0 FROM public.brand_os_access),
    jsonb_build_object('row_count', (SELECT count(*) FROM public.brand_os_access))
  UNION ALL SELECT 15, 'membership authority remains distinct', to_regclass('public.user_brand_access') IS NOT NULL,
    '{}'::jsonb
  UNION ALL SELECT 16, 'POS commercial authorities remain present', to_regclass('public.pos_subscriptions') IS NOT NULL
    AND to_regclass('public.pos_plans') IS NOT NULL
    AND to_regclass('public.pos_entitlements') IS NOT NULL, '{}'::jsonb
), diagnostic AS (
  SELECT * FROM checks
  UNION ALL SELECT 17, 'SUMMARY all_checks_passed', bool_and(passed), jsonb_build_object(
    'passed_count', count(*) FILTER (WHERE passed),
    'failed_count', count(*) FILTER (WHERE NOT passed),
    'all_checks_passed', bool_and(passed)
  ) FROM checks
)
SELECT * FROM diagnostic ORDER BY check_no;
