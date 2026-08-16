-- Cometa OS manual access seed V1.
-- Deliberately limited to the explicitly approved Cometa OS brand.
BEGIN;

DO $seed$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.brands
    WHERE slug = 'tienda-morotiendas'
  ) THEN
    RAISE EXCEPTION 'BRAND_OS_ACCESS_SEED_BRAND_NOT_FOUND: tienda-morotiendas';
  END IF;

  INSERT INTO public.brand_os_access (
    brand_slug,
    status,
    started_at,
    ended_at
  )
  VALUES (
    'tienda-morotiendas',
    'active',
    now(),
    NULL
  )
  ON CONFLICT (brand_slug) DO UPDATE
  SET
    status = 'active',
    started_at = COALESCE(public.brand_os_access.started_at, EXCLUDED.started_at),
    ended_at = NULL;
END
$seed$;

COMMIT;

-- Post-apply verification:
-- SELECT brand_slug, status, started_at, ended_at
-- FROM public.brand_os_access
-- ORDER BY brand_slug;
