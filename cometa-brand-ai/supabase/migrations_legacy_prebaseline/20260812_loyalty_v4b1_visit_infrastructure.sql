BEGIN;

CREATE TABLE public.pos_loyalty_visit_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  brand_slug text NOT NULL,
  loyalty_program_id uuid NOT NULL REFERENCES public.pos_loyalty_programs(id),
  name text NOT NULL,
  required_visits integer NOT NULL,
  minimum_sale_amount numeric(14,2) NOT NULL DEFAULT 0,
  reward_id uuid NOT NULL REFERENCES public.pos_loyalty_rewards(id),
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NULL,
  ends_at timestamptz NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_loyalty_visit_programs_required_visits_ck CHECK (required_visits > 0),
  CONSTRAINT pos_loyalty_visit_programs_minimum_sale_ck CHECK (minimum_sale_amount >= 0),
  CONSTRAINT pos_loyalty_visit_programs_dates_ck CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
  CONSTRAINT pos_loyalty_visit_programs_program_name_uq UNIQUE (loyalty_program_id, name)
);

CREATE INDEX pos_loyalty_visit_programs_brand_idx
  ON public.pos_loyalty_visit_programs (brand_slug);
CREATE INDEX pos_loyalty_visit_programs_program_idx
  ON public.pos_loyalty_visit_programs (loyalty_program_id);
CREATE INDEX pos_loyalty_visit_programs_active_window_idx
  ON public.pos_loyalty_visit_programs (brand_slug, active, starts_at, ends_at);

CREATE TABLE public.pos_loyalty_visit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  brand_slug text NOT NULL,
  visit_program_id uuid NOT NULL REFERENCES public.pos_loyalty_visit_programs(id),
  member_id uuid NOT NULL REFERENCES public.pos_loyalty_members(id),
  sale_id uuid NOT NULL REFERENCES public.pos_sales(id),
  event_type text NOT NULL,
  cycle_number integer NOT NULL,
  required_visits_snapshot integer NOT NULL,
  minimum_sale_amount_snapshot numeric(14,2) NOT NULL,
  reward_id_snapshot uuid NOT NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reverses_event_id uuid NULL REFERENCES public.pos_loyalty_visit_events(id),
  CONSTRAINT pos_loyalty_visit_events_type_ck CHECK (event_type IN ('qualify', 'reverse')),
  CONSTRAINT pos_loyalty_visit_events_cycle_ck CHECK (cycle_number > 0),
  CONSTRAINT pos_loyalty_visit_events_required_ck CHECK (required_visits_snapshot > 0),
  CONSTRAINT pos_loyalty_visit_events_minimum_ck CHECK (minimum_sale_amount_snapshot >= 0),
  CONSTRAINT pos_loyalty_visit_events_shape_ck CHECK (
    (event_type = 'qualify' AND reverses_event_id IS NULL)
    OR (event_type = 'reverse' AND reverses_event_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX pos_loyalty_visit_events_qualify_sale_uidx
  ON public.pos_loyalty_visit_events (visit_program_id, sale_id)
  WHERE event_type = 'qualify';
CREATE UNIQUE INDEX pos_loyalty_visit_events_reverse_uidx
  ON public.pos_loyalty_visit_events (reverses_event_id)
  WHERE event_type = 'reverse';
CREATE INDEX pos_loyalty_visit_events_program_member_idx
  ON public.pos_loyalty_visit_events (visit_program_id, member_id);
CREATE INDEX pos_loyalty_visit_events_member_created_idx
  ON public.pos_loyalty_visit_events (member_id, created_at DESC);
CREATE INDEX pos_loyalty_visit_events_sale_idx
  ON public.pos_loyalty_visit_events (sale_id);
CREATE INDEX pos_loyalty_visit_events_brand_idx
  ON public.pos_loyalty_visit_events (brand_slug);

CREATE TABLE public.pos_loyalty_reward_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  brand_slug text NOT NULL,
  visit_program_id uuid NOT NULL REFERENCES public.pos_loyalty_visit_programs(id),
  member_id uuid NOT NULL REFERENCES public.pos_loyalty_members(id),
  reward_id uuid NOT NULL REFERENCES public.pos_loyalty_rewards(id),
  cycle_number integer NOT NULL,
  source_sale_id uuid NOT NULL REFERENCES public.pos_sales(id),
  status text NOT NULL DEFAULT 'available',
  redeemed_sale_id uuid NULL REFERENCES public.pos_sales(id),
  reward_name text NOT NULL,
  reward_type text NOT NULL,
  reward_value numeric(14,2) NOT NULL,
  required_visits_snapshot integer NOT NULL,
  minimum_sale_amount_snapshot numeric(14,2) NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_loyalty_reward_unlocks_cycle_ck CHECK (cycle_number > 0),
  CONSTRAINT pos_loyalty_reward_unlocks_type_ck CHECK (reward_type = 'discount_fixed'),
  CONSTRAINT pos_loyalty_reward_unlocks_value_ck CHECK (reward_value > 0),
  CONSTRAINT pos_loyalty_reward_unlocks_required_ck CHECK (required_visits_snapshot > 0),
  CONSTRAINT pos_loyalty_reward_unlocks_minimum_ck CHECK (minimum_sale_amount_snapshot >= 0),
  CONSTRAINT pos_loyalty_reward_unlocks_status_ck CHECK (status IN ('available', 'redeemed', 'cancelled')),
  CONSTRAINT pos_loyalty_reward_unlocks_status_shape_ck CHECK (
    (status = 'available' AND redeemed_sale_id IS NULL AND redeemed_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'redeemed' AND redeemed_sale_id IS NOT NULL AND redeemed_at IS NOT NULL AND cancelled_at IS NULL)
    OR (status = 'cancelled' AND redeemed_sale_id IS NULL AND redeemed_at IS NULL AND cancelled_at IS NOT NULL)
  ),
  CONSTRAINT pos_loyalty_reward_unlocks_cycle_uq UNIQUE (visit_program_id, member_id, cycle_number)
);

CREATE UNIQUE INDEX pos_loyalty_reward_unlocks_redeemed_sale_uidx
  ON public.pos_loyalty_reward_unlocks (redeemed_sale_id)
  WHERE redeemed_sale_id IS NOT NULL;
CREATE INDEX pos_loyalty_reward_unlocks_member_status_idx
  ON public.pos_loyalty_reward_unlocks (member_id, status);
CREATE INDEX pos_loyalty_reward_unlocks_brand_status_idx
  ON public.pos_loyalty_reward_unlocks (brand_slug, status);
CREATE INDEX pos_loyalty_reward_unlocks_reward_idx
  ON public.pos_loyalty_reward_unlocks (reward_id);
CREATE INDEX pos_loyalty_reward_unlocks_source_sale_idx
  ON public.pos_loyalty_reward_unlocks (source_sale_id);
CREATE INDEX pos_loyalty_reward_unlocks_redeemed_sale_idx
  ON public.pos_loyalty_reward_unlocks (redeemed_sale_id);

CREATE OR REPLACE FUNCTION public.pos_loyalty_visit_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path TO public AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER pos_loyalty_visit_programs_set_updated_at
BEFORE UPDATE ON public.pos_loyalty_visit_programs
FOR EACH ROW EXECUTE FUNCTION public.pos_loyalty_visit_set_updated_at();

CREATE TRIGGER pos_loyalty_reward_unlocks_set_updated_at
BEFORE UPDATE ON public.pos_loyalty_reward_unlocks
FOR EACH ROW EXECUTE FUNCTION public.pos_loyalty_visit_set_updated_at();

ALTER TABLE public.pos_loyalty_visit_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_loyalty_visit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_loyalty_reward_unlocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY pos_loyalty_visit_programs_brand_policy
ON public.pos_loyalty_visit_programs FOR ALL TO authenticated
USING (public.pos_can_access_brand(brand_slug))
WITH CHECK (public.pos_can_access_brand(brand_slug));
CREATE POLICY pos_loyalty_visit_events_brand_select_policy
ON public.pos_loyalty_visit_events FOR SELECT TO authenticated
USING (public.pos_can_access_brand(brand_slug));
CREATE POLICY pos_loyalty_reward_unlocks_brand_policy
ON public.pos_loyalty_reward_unlocks FOR ALL TO authenticated
USING (public.pos_can_access_brand(brand_slug))
WITH CHECK (public.pos_can_access_brand(brand_slug));

CREATE OR REPLACE FUNCTION public.pos_create_loyalty_visit_program(
  p_brand_slug text, p_name text, p_required_visits integer,
  p_minimum_sale_amount numeric, p_reward_id uuid, p_active boolean,
  p_starts_at timestamptz, p_ends_at timestamptz, p_user_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $function$
DECLARE
  v_program public.pos_loyalty_programs%rowtype;
  v_reward public.pos_loyalty_rewards%rowtype;
  v_visit public.pos_loyalty_visit_programs%rowtype;
BEGIN
  IF NULLIF(trim(p_name), '') IS NULL THEN RAISE EXCEPTION 'El nombre del programa de visitas es obligatorio.'; END IF;
  IF p_required_visits IS NULL OR p_required_visits <= 0 THEN RAISE EXCEPTION 'La meta de visitas debe ser mayor que cero.'; END IF;
  IF p_minimum_sale_amount IS NULL OR p_minimum_sale_amount < 0 THEN RAISE EXCEPTION 'La compra mínima no puede ser negativa.'; END IF;
  IF p_ends_at IS NOT NULL AND p_starts_at IS NOT NULL AND p_ends_at <= p_starts_at THEN RAISE EXCEPTION 'La fecha final debe ser posterior a la inicial.'; END IF;
  SELECT * INTO v_program FROM public.pos_loyalty_programs WHERE brand_slug = p_brand_slug AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe un programa de fidelización activo para esta marca.'; END IF;
  SELECT * INTO v_reward FROM public.pos_loyalty_rewards
  WHERE id = p_reward_id AND brand_slug = p_brand_slug AND brand_id = v_program.brand_id
    AND program_id = v_program.id AND active = true AND reward_type = 'discount_fixed';
  IF NOT FOUND THEN RAISE EXCEPTION 'La recompensa no existe, no está activa, pertenece a otra marca o no es de descuento fijo.'; END IF;
  INSERT INTO public.pos_loyalty_visit_programs (
    brand_id, brand_slug, loyalty_program_id, name, required_visits,
    minimum_sale_amount, reward_id, active, starts_at, ends_at, created_by
  ) VALUES (
    v_program.brand_id, v_program.brand_slug, v_program.id, trim(p_name), p_required_visits,
    round(p_minimum_sale_amount, 2), v_reward.id, COALESCE(p_active, true), p_starts_at, p_ends_at, p_user_id
  ) RETURNING * INTO v_visit;
  RETURN jsonb_build_object(
    'id', v_visit.id, 'name', v_visit.name, 'requiredVisits', v_visit.required_visits,
    'minimumSaleAmount', v_visit.minimum_sale_amount, 'rewardId', v_visit.reward_id,
    'active', v_visit.active, 'startsAt', v_visit.starts_at, 'endsAt', v_visit.ends_at,
    'createdAt', v_visit.created_at, 'updatedAt', v_visit.updated_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.pos_update_loyalty_visit_program(
  p_brand_slug text, p_visit_program_id uuid, p_name text,
  p_required_visits integer, p_minimum_sale_amount numeric, p_reward_id uuid,
  p_active boolean, p_starts_at timestamptz, p_ends_at timestamptz
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $function$
DECLARE
  v_visit public.pos_loyalty_visit_programs%rowtype;
  v_reward public.pos_loyalty_rewards%rowtype;
  v_has_events boolean;
BEGIN
  IF NULLIF(trim(p_name), '') IS NULL THEN RAISE EXCEPTION 'El nombre del programa de visitas es obligatorio.'; END IF;
  IF p_required_visits IS NULL OR p_required_visits <= 0 THEN RAISE EXCEPTION 'La meta de visitas debe ser mayor que cero.'; END IF;
  IF p_minimum_sale_amount IS NULL OR p_minimum_sale_amount < 0 THEN RAISE EXCEPTION 'La compra mínima no puede ser negativa.'; END IF;
  IF p_ends_at IS NOT NULL AND p_starts_at IS NOT NULL AND p_ends_at <= p_starts_at THEN RAISE EXCEPTION 'La fecha final debe ser posterior a la inicial.'; END IF;
  SELECT * INTO v_visit FROM public.pos_loyalty_visit_programs
  WHERE id = p_visit_program_id AND brand_slug = p_brand_slug FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El programa de visitas no existe o pertenece a otra marca.'; END IF;
  SELECT * INTO v_reward FROM public.pos_loyalty_rewards
  WHERE id = p_reward_id AND brand_slug = p_brand_slug AND brand_id = v_visit.brand_id
    AND program_id = v_visit.loyalty_program_id AND active = true AND reward_type = 'discount_fixed';
  IF NOT FOUND THEN RAISE EXCEPTION 'La recompensa no existe, no está activa, pertenece a otra marca o no es de descuento fijo.'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.pos_loyalty_visit_events WHERE visit_program_id = v_visit.id) INTO v_has_events;
  IF v_has_events AND (
    v_visit.required_visits IS DISTINCT FROM p_required_visits
    OR v_visit.minimum_sale_amount IS DISTINCT FROM round(p_minimum_sale_amount, 2)
    OR v_visit.reward_id IS DISTINCT FROM p_reward_id
  ) THEN RAISE EXCEPTION 'La mecánica de un programa con visitas registradas no puede modificarse. Desactívalo y crea uno nuevo.'; END IF;
  UPDATE public.pos_loyalty_visit_programs SET
    name = trim(p_name), required_visits = p_required_visits,
    minimum_sale_amount = round(p_minimum_sale_amount, 2), reward_id = p_reward_id,
    active = p_active, starts_at = p_starts_at, ends_at = p_ends_at
  WHERE id = v_visit.id RETURNING * INTO v_visit;
  RETURN jsonb_build_object(
    'id', v_visit.id, 'name', v_visit.name, 'requiredVisits', v_visit.required_visits,
    'minimumSaleAmount', v_visit.minimum_sale_amount, 'rewardId', v_visit.reward_id,
    'active', v_visit.active, 'startsAt', v_visit.starts_at, 'endsAt', v_visit.ends_at,
    'createdAt', v_visit.created_at, 'updatedAt', v_visit.updated_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.pos_set_loyalty_visit_program_active(
  p_brand_slug text, p_visit_program_id uuid, p_active boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $function$
DECLARE v_visit public.pos_loyalty_visit_programs%rowtype;
BEGIN
  IF p_active IS NULL THEN RAISE EXCEPTION 'El estado del programa es obligatorio.'; END IF;
  UPDATE public.pos_loyalty_visit_programs SET active = p_active
  WHERE id = p_visit_program_id AND brand_slug = p_brand_slug RETURNING * INTO v_visit;
  IF NOT FOUND THEN RAISE EXCEPTION 'El programa de visitas no existe o pertenece a otra marca.'; END IF;
  RETURN jsonb_build_object('id', v_visit.id, 'active', v_visit.active, 'updatedAt', v_visit.updated_at);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pos_get_loyalty_visit_progress(
  p_brand_slug text, p_visit_program_id uuid, p_member_id uuid
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public AS $function$
DECLARE v_required integer; v_completed integer; v_member_brand text;
BEGIN
  SELECT required_visits INTO v_required FROM public.pos_loyalty_visit_programs WHERE id = p_visit_program_id AND brand_slug = p_brand_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'El programa de visitas no existe o pertenece a otra marca.'; END IF;
  SELECT brand_slug INTO v_member_brand FROM public.pos_loyalty_members WHERE id = p_member_id AND brand_slug = p_brand_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'La membresía no existe o pertenece a otra marca.'; END IF;
  SELECT COALESCE(sum(CASE event_type WHEN 'qualify' THEN 1 ELSE -1 END), 0)::integer
  INTO v_completed FROM public.pos_loyalty_visit_events
  WHERE brand_slug = p_brand_slug AND visit_program_id = p_visit_program_id AND member_id = p_member_id;
  RETURN jsonb_build_object('completedVisits', v_completed, 'cyclesCompleted', v_completed / v_required,
    'currentProgress', mod(v_completed, v_required), 'requiredVisits', v_required);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pos_get_available_loyalty_reward_unlocks(
  p_brand_slug text, p_member_id uuid
)
RETURNS TABLE (
  id uuid, visit_program_id uuid, member_id uuid, reward_id uuid, cycle_number integer,
  reward_name text, reward_type text, reward_value numeric(14,2),
  required_visits_snapshot integer, minimum_sale_amount_snapshot numeric(14,2), unlocked_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pos_loyalty_members m WHERE m.id = p_member_id AND m.brand_slug = p_brand_slug) THEN
    RAISE EXCEPTION 'La membresía no existe o pertenece a otra marca.';
  END IF;
  RETURN QUERY SELECT u.id, u.visit_program_id, u.member_id, u.reward_id, u.cycle_number,
    u.reward_name, u.reward_type, u.reward_value, u.required_visits_snapshot,
    u.minimum_sale_amount_snapshot, u.unlocked_at
  FROM public.pos_loyalty_reward_unlocks u
  WHERE u.brand_slug = p_brand_slug AND u.member_id = p_member_id AND u.status = 'available'
  ORDER BY u.unlocked_at, u.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.pos_create_loyalty_visit_program(text,text,integer,numeric,uuid,boolean,timestamptz,timestamptz,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pos_loyalty_visit_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pos_update_loyalty_visit_program(text,uuid,text,integer,numeric,uuid,boolean,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pos_set_loyalty_visit_program_active(text,uuid,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pos_get_loyalty_visit_progress(text,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pos_get_available_loyalty_reward_unlocks(text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_create_loyalty_visit_program(text,text,integer,numeric,uuid,boolean,timestamptz,timestamptz,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_update_loyalty_visit_program(text,uuid,text,integer,numeric,uuid,boolean,timestamptz,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_set_loyalty_visit_program_active(text,uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_get_loyalty_visit_progress(text,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_get_available_loyalty_reward_unlocks(text,uuid) TO service_role;

COMMIT;
