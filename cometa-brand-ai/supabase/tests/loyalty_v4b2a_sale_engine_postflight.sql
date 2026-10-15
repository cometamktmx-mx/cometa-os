-- LOYALTY V4B.2A POST-FLIGHT
-- READ ONLY. Ejecutar después de 20260812_loyalty_v4b2a_sale_engine.sql.

WITH expected_columns(name,type_name,not_null) AS (VALUES
 ('id','uuid',true),('brand_id','text',true),('brand_slug','text',true),('sale_id','uuid',true),
 ('member_id','uuid',false),('reward_source','text',false),('reward_id','uuid',false),
 ('reward_unlock_id','uuid',false),('reward_discount_applied','numeric(14,2)',true),('visits_earned','integer',true),
 ('visit_progress','jsonb',true),('visit_unlocks_created','jsonb',true),('response_json','jsonb',true),
 ('created_at','timestamp with time zone',true)
), expected_hashes(name,hash) AS (VALUES
 ('pos_complete_sale_v2','47b11fba0b8303702d92eb91124f5da215b9b639fe6e72ff191fb38b9b9994ed'),
 ('pos_complete_sale_v3','34993a96af4009c31856de57568210194551fcd77363fb93ee50c2edb080607c')
), v4 AS (
 SELECT p.* FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname='pos_complete_sale_v4'
), checks(check_name,passed,actual,expected) AS (
 SELECT 'TABLE snapshot',to_regclass('public.pos_sale_loyalty_visit_snapshots') IS NOT NULL,
   COALESCE(to_regclass('public.pos_sale_loyalty_visit_snapshots')::text,'absent'),'present'
 UNION ALL
 SELECT 'COLUMN '||e.name, a.attname IS NOT NULL AND format_type(a.atttypid,a.atttypmod)=e.type_name AND a.attnotnull=e.not_null,
   COALESCE(format_type(a.atttypid,a.atttypmod)||'/not_null='||a.attnotnull,'absent'),e.type_name||'/not_null='||e.not_null
 FROM expected_columns e LEFT JOIN pg_attribute a ON a.attrelid=to_regclass('public.pos_sale_loyalty_visit_snapshots') AND a.attname=e.name AND a.attnum>0 AND NOT a.attisdropped
 UNION ALL SELECT 'UNIQUE sale_id',EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.pos_sale_loyalty_visit_snapshots') AND contype='u' AND pg_get_constraintdef(oid) ILIKE '%sale_id%'),
   COALESCE((SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid=to_regclass('public.pos_sale_loyalty_visit_snapshots') AND contype='u' AND pg_get_constraintdef(oid) ILIKE '%sale_id%' LIMIT 1),'absent'),'UNIQUE(sale_id)'
 UNION ALL SELECT 'CHECK count',count(*)>=7,count(*)::text,'>=7' FROM pg_constraint WHERE conrelid=to_regclass('public.pos_sale_loyalty_visit_snapshots') AND contype='c'
 UNION ALL SELECT 'FK count',count(*)=3,count(*)::text,'3' FROM pg_constraint WHERE conrelid=to_regclass('public.pos_sale_loyalty_visit_snapshots') AND contype='f'
 UNION ALL SELECT 'RLS enabled',COALESCE(c.relrowsecurity,false),COALESCE(c.relrowsecurity,false)::text,'true' FROM pg_class c WHERE c.oid=to_regclass('public.pos_sale_loyalty_visit_snapshots')
 UNION ALL SELECT 'POLICY authenticated SELECT',count(*)=1,count(*)::text,'1' FROM pg_policies WHERE schemaname='public' AND tablename='pos_sale_loyalty_visit_snapshots' AND cmd='SELECT' AND 'authenticated'=ANY(roles)
 UNION ALL SELECT 'POLICY no authenticated write',count(*)=0,count(*)::text,'0' FROM pg_policies WHERE schemaname='public' AND tablename='pos_sale_loyalty_visit_snapshots' AND cmd IN('INSERT','UPDATE','DELETE','ALL') AND 'authenticated'=ANY(roles)
 UNION ALL SELECT 'FUNCTION V4 one overload',count(*)=1,count(*)::text,'1' FROM v4
 UNION ALL SELECT 'FUNCTION V4 signature',count(*)=1,count(*)::text,'public.pos_complete_sale_v4(text,uuid,uuid,uuid,uuid,jsonb,jsonb,text,uuid,uuid,uuid,uuid)' FROM v4 WHERE oid::regprocedure::text='pos_complete_sale_v4(text,uuid,uuid,uuid,uuid,jsonb,jsonb,text,uuid,uuid,uuid,uuid)'
 UNION ALL SELECT 'FUNCTION V4 security',COALESCE(bool_and(prosecdef AND 'search_path=public'=ANY(proconfig)),false),COALESCE(string_agg(prosecdef::text||'/'||array_to_string(proconfig,','),';'),'absent'),'true/search_path=public' FROM v4
 UNION ALL SELECT 'FUNCTION V4 service_role execute',COALESCE(bool_and(EXISTS(SELECT 1 FROM aclexplode(COALESCE(proacl,acldefault('f',proowner))) a JOIN pg_roles r ON r.oid=a.grantee WHERE r.rolname='service_role' AND a.privilege_type='EXECUTE')),false),'acl','service_role EXECUTE' FROM v4
 UNION ALL SELECT 'FUNCTION V4 no public execute',COALESCE(bool_and(NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(proacl,acldefault('f',proowner))) a LEFT JOIN pg_roles r ON r.oid=a.grantee WHERE a.privilege_type='EXECUTE' AND (a.grantee=0 OR r.rolname IN('anon','authenticated')))),false),'acl','none'
 FROM v4
 UNION ALL SELECT 'HASH '||h.name,COALESCE(encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=h.hash,false),
   COALESCE(encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'absent'),h.hash
 FROM expected_hashes h LEFT JOIN pg_proc p ON p.pronamespace='public'::regnamespace AND p.proname=h.name
)
SELECT check_name,passed,actual,expected FROM checks
UNION ALL SELECT 'SUMMARY all_checks_passed',bool_and(passed),bool_and(passed)::text,'true' FROM checks
ORDER BY check_name;
