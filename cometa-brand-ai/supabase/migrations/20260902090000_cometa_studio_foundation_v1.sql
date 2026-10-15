-- COMETA Studio Foundation V1: global team role and primary operational assignment.
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('admin', 'client', 'team'));

ALTER TABLE public.mercury_team_assignments
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS mercury_team_assignments_one_primary_active_idx
  ON public.mercury_team_assignments (brand_slug, role)
  WHERE is_primary = true AND active = true;
