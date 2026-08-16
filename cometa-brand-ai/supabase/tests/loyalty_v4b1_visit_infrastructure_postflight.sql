-- LOYALTY V4B.1 POST-FLIGHT
-- READ ONLY
-- Ejecutar después de 20260812_loyalty_v4b1_visit_infrastructure.sql.

WITH expected_tables(name) AS (VALUES
  ('pos_loyalty_visit_programs'),('pos_loyalty_visit_events'),('pos_loyalty_reward_unlocks')
), expected_functions(name) AS (VALUES
  ('pos_create_loyalty_visit_program'),('pos_update_loyalty_visit_program'),
  ('pos_set_loyalty_visit_program_active'),('pos_get_loyalty_visit_progress'),
  ('pos_get_available_loyalty_reward_unlocks')
), expected_base_hashes(name, expected_sha256) AS (VALUES
  ('pos_complete_sale_v2', '47b11fba0b8303702d92eb91124f5da215b9b639fe6e72ff191fb38b9b9994ed'),
  ('pos_complete_sale_v3', '34993a96af4009c31856de57568210194551fcd77363fb93ee50c2edb080607c')
), checks(check_name,passed,actual,expected) AS (
  SELECT 'TABLE '||name, to_regclass('public.'||name) IS NOT NULL,
    COALESCE(to_regclass('public.'||name)::text,'absent'), 'present' FROM expected_tables
  UNION ALL
  SELECT 'RLS '||t.name, COALESCE(c.relrowsecurity,false), COALESCE(c.relrowsecurity,false)::text, 'true'
  FROM expected_tables t LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||t.name)
  UNION ALL
  SELECT 'POLICY '||t.name, EXISTS(SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=t.name AND 'authenticated'=ANY(p.roles)),
    (SELECT count(*)::text FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=t.name), '>=1 authenticated' FROM expected_tables t
  UNION ALL
  SELECT 'FUNCTION '||f.name, count(p.oid)=1, count(p.oid)::text, '1 overload'
  FROM expected_functions f LEFT JOIN pg_proc p ON p.proname=f.name AND p.pronamespace='public'::regnamespace GROUP BY f.name
  UNION ALL
  SELECT 'SECURITY '||f.name, COALESCE(bool_and(p.prosecdef AND 'search_path=public'=ANY(p.proconfig)),false),
    COALESCE(string_agg(p.prosecdef::text||'/'||COALESCE(array_to_string(p.proconfig,','),''),';'),'absent'), 'security_definer/search_path=public'
  FROM expected_functions f LEFT JOIN pg_proc p ON p.proname=f.name AND p.pronamespace='public'::regnamespace GROUP BY f.name
  UNION ALL
  SELECT 'GRANT service_role '||f.name,
    COALESCE(bool_and(EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a JOIN pg_roles r ON r.oid=a.grantee WHERE r.rolname='service_role' AND a.privilege_type='EXECUTE')),false),
    COALESCE(bool_and(EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a JOIN pg_roles r ON r.oid=a.grantee WHERE r.rolname='service_role' AND a.privilege_type='EXECUTE')),false)::text,'true'
  FROM expected_functions f LEFT JOIN pg_proc p ON p.proname=f.name AND p.pronamespace='public'::regnamespace GROUP BY f.name
  UNION ALL
  SELECT 'NO EXECUTE '||f.name,
    COALESCE(bool_and(NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a LEFT JOIN pg_roles r ON r.oid=a.grantee WHERE a.privilege_type='EXECUTE' AND (a.grantee=0 OR r.rolname IN ('anon','authenticated')))),false),
    COALESCE(bool_and(NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a LEFT JOIN pg_roles r ON r.oid=a.grantee WHERE a.privilege_type='EXECUTE' AND (a.grantee=0 OR r.rolname IN ('anon','authenticated')))),false)::text,'true'
  FROM expected_functions f LEFT JOIN pg_proc p ON p.proname=f.name AND p.pronamespace='public'::regnamespace GROUP BY f.name
  UNION ALL
  SELECT 'INDEX qualify sale unique',to_regclass('public.pos_loyalty_visit_events_qualify_sale_uidx') IS NOT NULL,
    COALESCE(to_regclass('public.pos_loyalty_visit_events_qualify_sale_uidx')::text,'absent'),'present'
  UNION ALL SELECT 'INDEX reverse unique',to_regclass('public.pos_loyalty_visit_events_reverse_uidx') IS NOT NULL,COALESCE(to_regclass('public.pos_loyalty_visit_events_reverse_uidx')::text,'absent'),'present'
  UNION ALL SELECT 'INDEX unlock cycle unique',EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.pos_loyalty_reward_unlocks'::regclass AND conname='pos_loyalty_reward_unlocks_cycle_uq'),
    COALESCE((SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.pos_loyalty_reward_unlocks'::regclass AND conname='pos_loyalty_reward_unlocks_cycle_uq'),'absent'),'UNIQUE'
  UNION ALL SELECT 'INDEX redeemed sale unique',to_regclass('public.pos_loyalty_reward_unlocks_redeemed_sale_uidx') IS NOT NULL,COALESCE(to_regclass('public.pos_loyalty_reward_unlocks_redeemed_sale_uidx')::text,'absent'),'present'
  UNION ALL SELECT 'FK count',count(*)>=8,count(*)::text,'>=8' FROM pg_constraint WHERE contype='f' AND conrelid IN ('public.pos_loyalty_visit_programs'::regclass,'public.pos_loyalty_visit_events'::regclass,'public.pos_loyalty_reward_unlocks'::regclass)
  UNION ALL SELECT 'CHECK count',count(*)>=13,count(*)::text,'>=13' FROM pg_constraint WHERE contype='c' AND conrelid IN ('public.pos_loyalty_visit_programs'::regclass,'public.pos_loyalty_visit_events'::regclass,'public.pos_loyalty_reward_unlocks'::regclass)
  UNION ALL SELECT 'BASE pos_complete_sale_v2',count(*)=1,count(*)::text,'1' FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='pos_complete_sale_v2'
  UNION ALL SELECT 'BASE pos_complete_sale_v3',count(*)=1,count(*)::text,'1' FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='pos_complete_sale_v3'
  UNION ALL
  SELECT 'HASH '||h.name,
    COALESCE(encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') = h.expected_sha256,false),
    COALESCE(encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'absent'),
    h.expected_sha256
  FROM expected_base_hashes h
  LEFT JOIN pg_proc p ON p.pronamespace='public'::regnamespace AND p.proname=h.name
)
SELECT check_name,passed,actual,expected FROM checks
UNION ALL SELECT 'SUMMARY all_checks_passed',bool_and(passed),bool_and(passed)::text,'true' FROM checks
ORDER BY check_name;

-- Evidencia adicional de hashes, también incluida en el SUMMARY anterior.
SELECT p.oid::regprocedure::text identity,
  encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition_sha256,
  CASE p.proname
    WHEN 'pos_complete_sale_v2' THEN '47b11fba0b8303702d92eb91124f5da215b9b639fe6e72ff191fb38b9b9994ed'
    WHEN 'pos_complete_sale_v3' THEN '34993a96af4009c31856de57568210194551fcd77363fb93ee50c2edb080607c'
  END expected_sha256,
  encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') = CASE p.proname
    WHEN 'pos_complete_sale_v2' THEN '47b11fba0b8303702d92eb91124f5da215b9b639fe6e72ff191fb38b9b9994ed'
    WHEN 'pos_complete_sale_v3' THEN '34993a96af4009c31856de57568210194551fcd77363fb93ee50c2edb080607c'
  END AS matches_expected
FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('pos_complete_sale_v2','pos_complete_sale_v3')
ORDER BY p.proname;
