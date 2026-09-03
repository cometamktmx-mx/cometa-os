-- COMETA OS Access Foundation V1.
-- This is a dedicated managed-service product authority. It intentionally
-- does not infer access from memberships, POS, or historical data.
BEGIN;

CREATE TABLE public.brand_os_access (
  brand_slug text PRIMARY KEY
    REFERENCES public.brands(slug)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  status text NOT NULL,
  started_at timestamptz NULL,
  ended_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_os_access_status_ck
    CHECK (status IN ('active', 'paused', 'inactive')),
  CONSTRAINT brand_os_access_time_window_ck
    CHECK (
      ended_at IS NULL
      OR started_at IS NULL
      OR ended_at >= started_at
    )
);

COMMENT ON TABLE public.brand_os_access IS
  'Canonical commercial and operational access state for Cometa OS. A missing row means not_configured.';
COMMENT ON COLUMN public.brand_os_access.status IS
  'Managed-service state only: active, paused, or inactive. It is independent from POS lifecycle and memberships.';

CREATE FUNCTION public.brand_os_access_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  -- clock_timestamp() records the actual update instant, including when a
  -- verification suite performs several updates in one transaction.
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END
$function$;

CREATE TRIGGER brand_os_access_updated_at
BEFORE UPDATE ON public.brand_os_access
FOR EACH ROW
EXECUTE FUNCTION public.brand_os_access_set_updated_at();

ALTER TABLE public.brand_os_access ENABLE ROW LEVEL SECURITY;

-- There are deliberately no browser policies. Reads and mutations are
-- server-side operations performed with the configured service-role client.
REVOKE ALL ON TABLE public.brand_os_access FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.brand_os_access TO service_role;

REVOKE ALL ON FUNCTION public.brand_os_access_set_updated_at()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brand_os_access_set_updated_at()
  TO service_role;

COMMIT;
