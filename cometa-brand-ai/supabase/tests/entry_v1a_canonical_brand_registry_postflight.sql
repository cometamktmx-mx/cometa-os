-- ENTRY V1A canonical brand registry postflight.
-- Strictly read-only: this file contains one diagnostic SELECT.

WITH checks(check_no, check_name, passed, details) AS (
  SELECT 1, 'brands exists', to_regclass('public.brands') IS NOT NULL, '{}'::jsonb
  UNION ALL
  SELECT 2, 'PK uuid', EXISTS (
    SELECT 1
    FROM pg_constraint constraint_row
    JOIN pg_class relation ON relation.oid = constraint_row.conrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN unnest(constraint_row.conkey) key(attnum) ON true
    JOIN pg_attribute attribute
      ON attribute.attrelid = relation.oid AND attribute.attnum = key.attnum
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'brands'
      AND constraint_row.contype = 'p'
      AND attribute.attname = 'id'
      AND format_type(attribute.atttypid, attribute.atttypmod) = 'uuid'
  ), '{}'::jsonb
  UNION ALL
  SELECT 3, 'slug not null', COALESCE((
    SELECT attribute.attnotnull
    FROM pg_attribute attribute
    WHERE attribute.attrelid = 'public.brands'::regclass
      AND attribute.attname = 'slug'
      AND NOT attribute.attisdropped
  ), false), '{}'::jsonb
  UNION ALL
  SELECT 4, 'slug unique', EXISTS (
    SELECT 1
    FROM pg_constraint constraint_row
    WHERE constraint_row.conrelid = 'public.brands'::regclass
      AND constraint_row.contype = 'u'
      AND pg_get_constraintdef(constraint_row.oid) = 'UNIQUE (slug)'
  ), '{}'::jsonb
  UNION ALL
  SELECT 5, 'name not null', COALESCE((
    SELECT attribute.attnotnull
    FROM pg_attribute attribute
    WHERE attribute.attrelid = 'public.brands'::regclass
      AND attribute.attname = 'name'
      AND NOT attribute.attisdropped
  ), false), '{}'::jsonb
  UNION ALL
  SELECT 6, 'status contract',
    COALESCE((SELECT column_default = '''active''::text'
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'brands' AND column_name = 'status'), false)
    AND EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.brands'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%active%inactive%'
    ), '{}'::jsonb
  UNION ALL
  SELECT 7, 'RLS enabled', COALESCE((
    SELECT relation.relrowsecurity
    FROM pg_class relation
    WHERE relation.oid = 'public.brands'::regclass
  ), false), '{}'::jsonb
  UNION ALL
  SELECT 8, 'no public writes',
    NOT has_table_privilege('anon', 'public.brands', 'INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('authenticated', 'public.brands', 'INSERT,UPDATE,DELETE'), '{}'::jsonb
  UNION ALL
  SELECT 9, 'user_brand_access preserved', to_regclass('public.user_brand_access') IS NOT NULL, '{}'::jsonb
  UNION ALL
  SELECT 10, 'brand_analysis preserved', to_regclass('public.brand_analysis') IS NOT NULL, '{}'::jsonb
  UNION ALL
  SELECT 11, 'cosmos_memory preserved', to_regclass('public.cosmos_memory') IS NOT NULL, '{}'::jsonb
  UNION ALL
  SELECT 12, 'clients preserved', to_regclass('public.clients') IS NOT NULL, '{}'::jsonb
  UNION ALL
  SELECT 13, 'known access brands backfilled', NOT EXISTS (
    SELECT 1
    FROM public.user_brand_access access
    WHERE access.brand_slug IS NOT NULL
      AND btrim(access.brand_slug) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM public.brands brand
        WHERE brand.slug = lower(btrim(access.brand_slug))
      )
  ), jsonb_build_object(
    'missing', (
      SELECT count(*)
      FROM public.user_brand_access access
      WHERE access.brand_slug IS NOT NULL
        AND btrim(access.brand_slug) <> ''
        AND NOT EXISTS (
          SELECT 1 FROM public.brands brand
          WHERE brand.slug = lower(btrim(access.brand_slug))
        )
    )
  )
  UNION ALL
  SELECT 14, 'duplicate slug prevention', EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.brands'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (slug)'
  ), '{}'::jsonb
  UNION ALL
  SELECT 15, 'analysis not required', EXISTS (
    SELECT 1
    FROM public.brands brand
    WHERE NOT EXISTS (
      SELECT 1 FROM public.brand_analysis analysis
      WHERE lower(btrim(analysis.brand_slug)) = brand.slug
    )
  ), '{}'::jsonb
  UNION ALL
  SELECT 16, 'cosmos memory not required', EXISTS (
    SELECT 1
    FROM public.brands brand
    WHERE NOT EXISTS (
      SELECT 1 FROM public.cosmos_memory memory
      WHERE lower(btrim(memory.brand_slug)) = brand.slug
    )
  ), '{}'::jsonb
  UNION ALL
  SELECT 17, 'brand resolver contract marker',
    COALESCE(obj_description('public.brands'::regclass, 'pg_class'), '') LIKE '%Resolver priority: brands first%', '{}'::jsonb
  UNION ALL
  SELECT 18, 'workspace membership contract marker',
    COALESCE(obj_description('public.brands'::regclass, 'pg_class'), '') LIKE '%membership-scoped%', '{}'::jsonb
  UNION ALL
  SELECT 19, 'no self-service writer or auth change',
    to_regprocedure('public.pos_create_self_service_business(text,text,uuid)') IS NULL, '{}'::jsonb
  UNION ALL
  SELECT 20, 'service role access',
    has_table_privilege('service_role', 'public.brands', 'SELECT,INSERT,UPDATE,DELETE'), '{}'::jsonb
), diagnostic AS (
  SELECT check_no, check_name, passed, details FROM checks
  UNION ALL
  SELECT
    21,
    'SUMMARY all_checks_passed',
    bool_and(passed),
    jsonb_build_object(
      'failed_count', count(*) FILTER (WHERE NOT passed),
      'passed_count', count(*) FILTER (WHERE passed),
      'all_checks_passed', bool_and(passed)
    )
  FROM checks
)
SELECT check_no, check_name, passed, details
FROM diagnostic
ORDER BY check_no;

