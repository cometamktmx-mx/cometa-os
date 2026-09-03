-- COMETA Platform ENTRY V1A: canonical brand registry.
-- Additive only: legacy identity sources remain available as resolver fallbacks.

CREATE TABLE public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brands_slug_key UNIQUE (slug),
  CONSTRAINT brands_slug_format_check CHECK (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  CONSTRAINT brands_name_not_blank_check CHECK (btrim(name) <> ''),
  CONSTRAINT brands_status_check CHECK (status IN ('active', 'inactive'))
);

COMMENT ON TABLE public.brands IS
  'Canonical COMETA brand identity registry. Resolver priority: brands first, legacy fallback temporarily. Workspace visibility remains membership-scoped through user_brand_access.';
COMMENT ON COLUMN public.brands.slug IS
  'Globally unique, normalized human routing identifier for /brand/[brandSlug].';
COMMENT ON COLUMN public.brands.status IS
  'Brand registry status only; independent from POS subscription lifecycle.';

CREATE INDEX brands_status_idx ON public.brands (status);

-- Build an ephemeral inventory of every explicit legacy slug. Rows without a
-- slug are intentionally ignored; a name is never promoted into identity.
CREATE TEMP TABLE entry_v1a_brand_candidates (
  raw_slug text NOT NULL,
  normalized_slug text NOT NULL,
  candidate_name text NULL,
  source_name text NOT NULL,
  source_priority integer NOT NULL
) ON COMMIT DROP;

INSERT INTO entry_v1a_brand_candidates (
  raw_slug,
  normalized_slug,
  candidate_name,
  source_name,
  source_priority
)
SELECT
  btrim(access.brand_slug),
  lower(btrim(access.brand_slug)),
  NULL,
  'user_brand_access',
  10
FROM public.user_brand_access access
WHERE access.brand_slug IS NOT NULL
  AND btrim(access.brand_slug) <> '';

INSERT INTO entry_v1a_brand_candidates (
  raw_slug,
  normalized_slug,
  candidate_name,
  source_name,
  source_priority
)
SELECT
  btrim(analysis.brand_slug),
  lower(btrim(analysis.brand_slug)),
  NULLIF(btrim(analysis.brand_name), ''),
  'brand_analysis',
  30
FROM public.brand_analysis analysis
WHERE analysis.brand_slug IS NOT NULL
  AND btrim(analysis.brand_slug) <> '';

INSERT INTO entry_v1a_brand_candidates (
  raw_slug,
  normalized_slug,
  candidate_name,
  source_name,
  source_priority
)
SELECT
  btrim(memory.brand_slug),
  lower(btrim(memory.brand_slug)),
  NULLIF(btrim(memory.brand_name), ''),
  'cosmos_memory',
  20
FROM public.cosmos_memory memory
WHERE memory.brand_slug IS NOT NULL
  AND btrim(memory.brand_slug) <> '';

-- clients is retained as a legacy source. Its historical deployments have
-- used different column names, so only explicit, existing slug/name columns
-- are read. The confirmed current rows have no slug and are therefore ignored.
DO $backfill_clients$
DECLARE
  v_slug_column text;
  v_name_column text;
BEGIN
  SELECT column_name
  INTO v_slug_column
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'clients'
    AND column_name IN ('brand_slug', 'slug', 'client_slug')
  ORDER BY CASE column_name
    WHEN 'brand_slug' THEN 1
    WHEN 'slug' THEN 2
    ELSE 3
  END
  LIMIT 1;

  SELECT column_name
  INTO v_name_column
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'clients'
    AND column_name IN ('brand_name', 'name', 'client_name', 'business_name')
  ORDER BY CASE column_name
    WHEN 'brand_name' THEN 1
    WHEN 'name' THEN 2
    WHEN 'client_name' THEN 3
    ELSE 4
  END
  LIMIT 1;

  IF v_slug_column IS NOT NULL THEN
    EXECUTE format(
      'INSERT INTO entry_v1a_brand_candidates
         (raw_slug, normalized_slug, candidate_name, source_name, source_priority)
       SELECT btrim(%1$I::text),
              lower(btrim(%1$I::text)),
              %2$s,
              ''clients'',
              40
       FROM public.clients
       WHERE %1$I IS NOT NULL AND btrim(%1$I::text) <> ''''',
      v_slug_column,
      CASE
        WHEN v_name_column IS NULL THEN 'NULL'
        ELSE format('NULLIF(btrim(%I::text), '''')', v_name_column)
      END
    );
  END IF;
END
$backfill_clients$;

-- Refuse ambiguous normalization instead of silently merging identities.
DO $validate_brand_candidates$
DECLARE
  v_invalid_slugs text;
  v_conflicting_slugs text;
BEGIN
  SELECT string_agg(DISTINCT raw_slug, ', ' ORDER BY raw_slug)
  INTO v_invalid_slugs
  FROM entry_v1a_brand_candidates
  WHERE normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$';

  IF v_invalid_slugs IS NOT NULL THEN
    RAISE EXCEPTION
      'ENTRY_V1A_INVALID_LEGACY_BRAND_SLUGS: %',
      v_invalid_slugs;
  END IF;

  SELECT string_agg(normalized_slug, ', ' ORDER BY normalized_slug)
  INTO v_conflicting_slugs
  FROM (
    SELECT normalized_slug
    FROM entry_v1a_brand_candidates
    GROUP BY normalized_slug
    HAVING count(DISTINCT raw_slug) > 1
  ) conflicts;

  IF v_conflicting_slugs IS NOT NULL THEN
    RAISE EXCEPTION
      'ENTRY_V1A_NORMALIZED_SLUG_CONFLICTS: %',
      v_conflicting_slugs;
  END IF;
END
$validate_brand_candidates$;

-- One registry row per normalized slug. Real names win by source reliability;
-- the formatted slug is used only when no source contains a nonblank name.
INSERT INTO public.brands (slug, name)
SELECT DISTINCT ON (candidate.normalized_slug)
  candidate.normalized_slug,
  COALESCE(
    candidate.candidate_name,
    initcap(replace(candidate.normalized_slug, '-', ' '))
  )
FROM entry_v1a_brand_candidates candidate
ORDER BY
  candidate.normalized_slug,
  (candidate.candidate_name IS NOT NULL) DESC,
  candidate.source_priority DESC,
  candidate.candidate_name ASC NULLS LAST
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY brands_select_by_active_membership
ON public.brands
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_brand_access access
    WHERE access.user_id = auth.uid()
      AND access.brand_slug = brands.slug
      AND access.status = 'active'
  )
);

REVOKE ALL ON TABLE public.brands FROM PUBLIC;
REVOKE ALL ON TABLE public.brands FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.brands FROM authenticated;
GRANT SELECT ON TABLE public.brands TO authenticated;
GRANT ALL ON TABLE public.brands TO service_role;

