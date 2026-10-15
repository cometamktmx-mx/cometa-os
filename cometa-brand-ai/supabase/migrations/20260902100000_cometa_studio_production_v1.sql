-- Cometa Studio Production Profile V1
CREATE TABLE IF NOT EXISTS public.cometa_brand_production_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE RESTRICT,
  brand_slug text NOT NULL,
  agency_model_allowed boolean NOT NULL DEFAULT false,
  client_model_available boolean NOT NULL DEFAULT false,
  hands_allowed boolean NOT NULL DEFAULT true,
  product_only_allowed boolean NOT NULL DEFAULT true,
  no_human_talent boolean NOT NULL DEFAULT false,
  recording_location_type text,
  recording_location_notes text,
  product_pickup_required boolean NOT NULL DEFAULT false,
  usual_recording_notes text,
  visual_restrictions text,
  production_notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cometa_brand_production_profiles_location_check CHECK (recording_location_type IS NULL OR recording_location_type IN ('client_location','cometa_location','external_location','not_applicable')),
  CONSTRAINT cometa_brand_production_profiles_talent_check CHECK (NOT no_human_talent OR (NOT agency_model_allowed AND NOT client_model_available)),
  CONSTRAINT cometa_brand_production_profiles_brand_unique UNIQUE (brand_id)
);

ALTER TABLE public.mercury_team_assignments DROP CONSTRAINT IF EXISTS mercury_team_assignments_role_check;
ALTER TABLE public.mercury_team_assignments ADD CONSTRAINT mercury_team_assignments_role_check CHECK (role IN ('admin','designer','reels','cm','copy','producer','client'));
ALTER TABLE public.mercury_content_items DROP CONSTRAINT IF EXISTS mercury_content_items_assigned_role_check;
ALTER TABLE public.mercury_content_items ADD CONSTRAINT mercury_content_items_assigned_role_check CHECK (assigned_role IS NULL OR assigned_role IN ('admin','designer','reels','cm','copy','producer','client'));

ALTER TABLE public.cometa_brand_production_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cometa_brand_production_profiles FROM anon, authenticated;
GRANT ALL ON public.cometa_brand_production_profiles TO service_role;

CREATE OR REPLACE FUNCTION public.cometa_brand_production_profiles_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS cometa_brand_production_profiles_updated_at ON public.cometa_brand_production_profiles;
CREATE TRIGGER cometa_brand_production_profiles_updated_at BEFORE UPDATE ON public.cometa_brand_production_profiles FOR EACH ROW EXECUTE FUNCTION public.cometa_brand_production_profiles_touch_updated_at();
