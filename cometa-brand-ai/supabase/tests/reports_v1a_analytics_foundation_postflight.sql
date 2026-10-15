-- REPORTS V1A POST-FLIGHT — READ ONLY
WITH expected_functions(name,requires_definer) AS (VALUES
 ('pos_analytics_assert_scope',true),('pos_analytics_metric',false),('pos_get_analytics_periods',true),('pos_get_analytics_summary',true),
 ('pos_get_analytics_products',true),('pos_get_analytics_customers',true),('pos_get_analytics_inventory',true),
 ('pos_get_analytics_loyalty',true),('pos_get_analytics_sales_series',true),('pos_get_analytics_sales_patterns',true),
 ('pos_get_analytics_product_pairs',true),('pos_get_analytics_data_quality',true),('pos_create_analytics_snapshot',true)
), checks AS (
 SELECT 'TABLE snapshots exists' check_name,to_regclass('public.pos_analytics_snapshots') IS NOT NULL passed,
  COALESCE(to_regclass('public.pos_analytics_snapshots')::text,'absent') actual,'public.pos_analytics_snapshots' expected
 UNION ALL SELECT 'TABLE columns',count(*)=11,count(*)::text,'11' FROM information_schema.columns WHERE table_schema='public' AND table_name='pos_analytics_snapshots'
 UNION ALL SELECT 'TABLE metrics jsonb not null',count(*)=1,count(*)::text,'1' FROM information_schema.columns WHERE table_schema='public' AND table_name='pos_analytics_snapshots' AND column_name='metrics' AND data_type='jsonb' AND is_nullable='NO'
 UNION ALL SELECT 'CONSTRAINT checks',count(*)>=4,count(*)::text,'>=4' FROM pg_constraint WHERE conrelid='public.pos_analytics_snapshots'::regclass AND contype='c'
 UNION ALL SELECT 'FK location',count(*)=1,count(*)::text,'1' FROM pg_constraint WHERE conrelid='public.pos_analytics_snapshots'::regclass AND contype='f'
 UNION ALL SELECT 'INDEX analytics snapshots',count(*)>=3,count(*)::text,'>=3' FROM pg_indexes WHERE schemaname='public' AND tablename='pos_analytics_snapshots'
 UNION ALL SELECT 'RLS enabled',c.relrowsecurity,c.relrowsecurity::text,'true' FROM pg_class c WHERE c.oid='public.pos_analytics_snapshots'::regclass
 UNION ALL SELECT 'RLS SELECT policy',count(*)=1,count(*)::text,'1' FROM pg_policies WHERE schemaname='public' AND tablename='pos_analytics_snapshots' AND cmd='SELECT'
 UNION ALL SELECT 'RLS no write policies',count(*)=0,count(*)::text,'0' FROM pg_policies WHERE schemaname='public' AND tablename='pos_analytics_snapshots' AND cmd IN('INSERT','UPDATE','DELETE','ALL')
 UNION ALL SELECT 'FUNCTION count',count(*)=(SELECT count(*) FROM expected_functions),count(*)::text,(SELECT count(*)::text FROM expected_functions) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN(SELECT name FROM expected_functions)
 UNION ALL SELECT 'FUNCTION tenant RPC security definer',bool_and(p.prosecdef),string_agg(p.proname||'='||p.prosecdef,',' ORDER BY p.proname),'all tenant RPCs true' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN expected_functions e ON e.name=p.proname AND e.requires_definer WHERE n.nspname='public'
 UNION ALL SELECT 'FUNCTION pure helper security invoker',bool_and(NOT p.prosecdef),string_agg(p.proname||'='||p.prosecdef,',' ORDER BY p.proname),'all pure helpers false' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN expected_functions e ON e.name=p.proname AND NOT e.requires_definer WHERE n.nspname='public'
 UNION ALL SELECT 'FUNCTION search_path',bool_and('search_path=public'=ANY(COALESCE(p.proconfig,'{}'))),string_agg(p.proname||'='||COALESCE(array_to_string(p.proconfig,','),'null'),'; ' ORDER BY p.proname),'search_path=public' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN(SELECT name FROM expected_functions)
 UNION ALL SELECT 'ACL service_role execute',bool_and(has_function_privilege('service_role',p.oid,'EXECUTE')),count(*)FILTER(WHERE has_function_privilege('service_role',p.oid,'EXECUTE'))||' granted',(SELECT count(*)||' granted' FROM expected_functions) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN(SELECT name FROM expected_functions)
 UNION ALL SELECT 'ACL browser denied',bool_and(NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner)))a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')),count(*)FILTER(WHERE has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE') OR EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner)))a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))||' exposed','0 exposed' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN(SELECT name FROM expected_functions)
)
SELECT check_name,passed,actual,expected FROM checks
UNION ALL SELECT 'SUMMARY all_checks_passed',bool_and(passed),bool_and(passed)::text,'true' FROM checks;
