BEGIN;

ALTER TABLE public.pos_loyalty_tiers
  ADD CONSTRAINT pos_loyalty_tiers_minimum_lifetime_points_nonnegative
  CHECK (minimum_lifetime_points >= 0),
  ADD CONSTRAINT pos_loyalty_tiers_points_multiplier_positive
  CHECK (points_multiplier > 0);

CREATE UNIQUE INDEX pos_loyalty_tiers_program_threshold_uidx
  ON public.pos_loyalty_tiers (program_id, minimum_lifetime_points);

CREATE TABLE public.pos_sale_loyalty_tier_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  brand_slug text NOT NULL,
  sale_id uuid NOT NULL REFERENCES public.pos_sales(id),
  member_id uuid NULL REFERENCES public.pos_loyalty_members(id),
  base_points integer NOT NULL DEFAULT 0,
  earned_points integer NOT NULL DEFAULT 0,
  tier_multiplier numeric(8,4) NOT NULL DEFAULT 1,
  lifetime_points_before integer NOT NULL DEFAULT 0,
  lifetime_points_after integer NOT NULL DEFAULT 0,
  tier_before_id uuid NULL,
  tier_before_name text NULL,
  tier_before_minimum_lifetime_points integer NULL,
  tier_before_points_multiplier numeric(8,4) NULL,
  tier_after_id uuid NULL,
  tier_after_name text NULL,
  tier_after_minimum_lifetime_points integer NULL,
  tier_after_points_multiplier numeric(8,4) NULL,
  tier_promoted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_sale_loyalty_tier_snapshots_sale_unique UNIQUE (sale_id),
  CONSTRAINT pos_sale_loyalty_tier_snapshots_base_points_nonnegative CHECK (base_points >= 0),
  CONSTRAINT pos_sale_loyalty_tier_snapshots_earned_points_nonnegative CHECK (earned_points >= 0),
  CONSTRAINT pos_sale_loyalty_tier_snapshots_multiplier_positive CHECK (tier_multiplier > 0),
  CONSTRAINT pos_sale_loyalty_tier_snapshots_lifetime_before_nonnegative CHECK (lifetime_points_before >= 0),
  CONSTRAINT pos_sale_loyalty_tier_snapshots_lifetime_after_nonnegative CHECK (lifetime_points_after >= 0)
);

CREATE INDEX pos_sale_loyalty_tier_snapshots_brand_member_idx
  ON public.pos_sale_loyalty_tier_snapshots (brand_slug, member_id, created_at DESC);

ALTER TABLE public.pos_sale_loyalty_tier_snapshots ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.pos_resolve_loyalty_tier(
  p_brand_slug text,
  p_program_id uuid,
  p_lifetime_points integer
)
RETURNS TABLE (
  tier_id uuid,
  name text,
  minimum_lifetime_points integer,
  points_multiplier numeric(8,4)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $function$
  SELECT
    tier.id,
    tier.name,
    tier.minimum_lifetime_points,
    tier.points_multiplier
  FROM public.pos_loyalty_tiers tier
  WHERE tier.brand_slug = p_brand_slug
    AND tier.program_id = p_program_id
    AND tier.active = true
    AND tier.minimum_lifetime_points <= GREATEST(COALESCE(p_lifetime_points, 0), 0)
  ORDER BY tier.minimum_lifetime_points DESC, tier.sort_order DESC, tier.id
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.pos_register_loyalty_member_v2(
  p_brand_slug text,
  p_customer_id uuid,
  p_user_id uuid
)
RETURNS public.pos_loyalty_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_program public.pos_loyalty_programs%rowtype;
  v_member public.pos_loyalty_members%rowtype;
  v_tier record;
BEGIN
  PERFORM *
  FROM public.pos_register_loyalty_member(
    p_brand_slug,
    p_customer_id,
    p_user_id
  );

  SELECT * INTO v_program
  FROM public.pos_loyalty_programs
  WHERE brand_slug = p_brand_slug;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe un programa de fidelización para esta marca.';
  END IF;

  SELECT * INTO v_member
  FROM public.pos_loyalty_members
  WHERE brand_slug = p_brand_slug
    AND program_id = v_program.id
    AND customer_id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo registrar la membresía de fidelización.';
  END IF;

  SELECT * INTO v_tier
  FROM public.pos_resolve_loyalty_tier(
    p_brand_slug,
    v_program.id,
    v_member.lifetime_points
  );

  UPDATE public.pos_loyalty_members
  SET tier_id = CASE WHEN v_tier.tier_id IS NULL THEN NULL ELSE v_tier.tier_id END
  WHERE id = v_member.id
  RETURNING * INTO v_member;

  RETURN v_member;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pos_create_loyalty_tier(
  p_brand_slug text,
  p_name text,
  p_minimum_lifetime_points integer,
  p_points_multiplier numeric,
  p_sort_order integer,
  p_active boolean
)
RETURNS public.pos_loyalty_tiers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_program public.pos_loyalty_programs%rowtype;
  v_tier public.pos_loyalty_tiers%rowtype;
BEGIN
  SELECT * INTO v_program FROM public.pos_loyalty_programs
  WHERE brand_slug = p_brand_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe un programa de fidelización para esta marca.'; END IF;
  IF NULLIF(trim(p_name), '') IS NULL THEN RAISE EXCEPTION 'El nombre del nivel es obligatorio.'; END IF;
  IF p_minimum_lifetime_points IS NULL OR p_minimum_lifetime_points < 0 THEN RAISE EXCEPTION 'Los puntos históricos mínimos deben ser cero o mayores.'; END IF;
  IF p_points_multiplier IS NULL OR p_points_multiplier <= 0 THEN RAISE EXCEPTION 'El multiplicador debe ser mayor que cero.'; END IF;

  INSERT INTO public.pos_loyalty_tiers (
    brand_id, brand_slug, program_id, name, minimum_lifetime_points,
    points_multiplier, benefits, sort_order, active
  ) VALUES (
    v_program.brand_id, v_program.brand_slug, v_program.id, trim(p_name),
    p_minimum_lifetime_points, p_points_multiplier, '[]'::jsonb,
    COALESCE(p_sort_order, 0), COALESCE(p_active, true)
  ) RETURNING * INTO v_tier;
  UPDATE public.pos_loyalty_members member
  SET tier_id = (
    SELECT resolved.tier_id FROM public.pos_resolve_loyalty_tier(
      member.brand_slug, member.program_id, member.lifetime_points
    ) resolved
  )
  WHERE member.program_id = v_program.id;
  RETURN v_tier;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pos_update_loyalty_tier(
  p_brand_slug text,
  p_tier_id uuid,
  p_name text,
  p_minimum_lifetime_points integer,
  p_points_multiplier numeric,
  p_sort_order integer,
  p_active boolean
)
RETURNS public.pos_loyalty_tiers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_tier public.pos_loyalty_tiers%rowtype;
BEGIN
  IF NULLIF(trim(p_name), '') IS NULL THEN RAISE EXCEPTION 'El nombre del nivel es obligatorio.'; END IF;
  IF p_minimum_lifetime_points IS NULL OR p_minimum_lifetime_points < 0 THEN RAISE EXCEPTION 'Los puntos históricos mínimos deben ser cero o mayores.'; END IF;
  IF p_points_multiplier IS NULL OR p_points_multiplier <= 0 THEN RAISE EXCEPTION 'El multiplicador debe ser mayor que cero.'; END IF;

  UPDATE public.pos_loyalty_tiers tier
  SET name = trim(p_name),
      minimum_lifetime_points = p_minimum_lifetime_points,
      points_multiplier = p_points_multiplier,
      sort_order = COALESCE(p_sort_order, tier.sort_order),
      active = COALESCE(p_active, tier.active)
  WHERE tier.id = p_tier_id
    AND tier.brand_slug = p_brand_slug
    AND EXISTS (
      SELECT 1 FROM public.pos_loyalty_programs program
      WHERE program.id = tier.program_id AND program.brand_slug = p_brand_slug
    )
  RETURNING * INTO v_tier;
  IF NOT FOUND THEN RAISE EXCEPTION 'El nivel no existe o pertenece a otra marca.'; END IF;
  UPDATE public.pos_loyalty_members member
  SET tier_id = (
    SELECT resolved.tier_id FROM public.pos_resolve_loyalty_tier(
      member.brand_slug, member.program_id, member.lifetime_points
    ) resolved
  )
  WHERE member.program_id = v_tier.program_id;
  RETURN v_tier;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pos_set_loyalty_tier_active(
  p_brand_slug text,
  p_tier_id uuid,
  p_active boolean
)
RETURNS public.pos_loyalty_tiers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_tier public.pos_loyalty_tiers%rowtype;
BEGIN
  IF p_active IS NULL THEN RAISE EXCEPTION 'El estado del nivel es obligatorio.'; END IF;
  UPDATE public.pos_loyalty_tiers tier
  SET active = p_active
  WHERE tier.id = p_tier_id
    AND tier.brand_slug = p_brand_slug
    AND EXISTS (
      SELECT 1 FROM public.pos_loyalty_programs program
      WHERE program.id = tier.program_id AND program.brand_slug = p_brand_slug
    )
  RETURNING * INTO v_tier;
  IF NOT FOUND THEN RAISE EXCEPTION 'El nivel no existe o pertenece a otra marca.'; END IF;
  UPDATE public.pos_loyalty_members member
  SET tier_id = (
    SELECT resolved.tier_id FROM public.pos_resolve_loyalty_tier(
      member.brand_slug, member.program_id, member.lifetime_points
    ) resolved
  )
  WHERE member.program_id = v_tier.program_id;
  RETURN v_tier;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pos_complete_sale_v3(
  p_brand_slug text,
  p_location_id uuid,
  p_register_id uuid,
  p_cash_session_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_payments jsonb,
  p_notes text,
  p_user_id uuid,
  p_reward_id uuid,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_result jsonb;
  v_program public.pos_loyalty_programs%rowtype;
  v_member public.pos_loyalty_members%rowtype;
  v_tier_before record;
  v_tier_after record;
  v_snapshot public.pos_sale_loyalty_tier_snapshots%rowtype;
  v_existing_sale_id uuid;
  v_sale_id uuid;
  v_base_points integer := 0;
  v_earned_points integer := 0;
  v_bonus_points integer := 0;
  v_multiplier numeric(8,4) := 1;
  v_lifetime_before integer := 0;
  v_lifetime_after integer := 0;
  v_promoted boolean := false;
BEGIN
  SELECT
    NULL::uuid AS tier_id,
    NULL::text AS name,
    NULL::integer AS minimum_lifetime_points,
    NULL::numeric(8,4) AS points_multiplier
  INTO v_tier_before;

  SELECT
    NULL::uuid AS tier_id,
    NULL::text AS name,
    NULL::integer AS minimum_lifetime_points,
    NULL::numeric(8,4) AS points_multiplier
  INTO v_tier_after;

  SELECT sale.id INTO v_existing_sale_id
  FROM public.pos_sales sale
  WHERE sale.brand_slug = p_brand_slug
    AND sale.idempotency_key = p_idempotency_key;

  IF v_existing_sale_id IS NULL AND p_customer_id IS NOT NULL THEN
    SELECT * INTO v_program
    FROM public.pos_loyalty_programs
    WHERE brand_slug = p_brand_slug AND active = true;

    IF FOUND THEN
      SELECT * INTO v_member
      FROM public.pos_loyalty_members
      WHERE brand_slug = p_brand_slug
        AND program_id = v_program.id
        AND customer_id = p_customer_id
      FOR UPDATE;

      IF NOT FOUND AND p_reward_id IS NULL THEN
        SELECT * INTO v_member
        FROM public.pos_register_loyalty_member_v2(p_brand_slug, p_customer_id, p_user_id);
      END IF;

      IF v_member.id IS NOT NULL THEN
        v_lifetime_before := v_member.lifetime_points;
        SELECT * INTO v_tier_before
        FROM public.pos_resolve_loyalty_tier(p_brand_slug, v_program.id, v_lifetime_before);
        v_multiplier := COALESCE(v_tier_before.points_multiplier, 1);

        IF v_member.tier_id IS DISTINCT FROM v_tier_before.tier_id THEN
          UPDATE public.pos_loyalty_members
          SET tier_id = v_tier_before.tier_id
          WHERE id = v_member.id
          RETURNING * INTO v_member;
        END IF;
      END IF;
    END IF;
  END IF;

  v_result := public.pos_complete_sale_v2(
    p_brand_slug, p_location_id, p_register_id, p_cash_session_id,
    p_customer_id, p_items, p_payments, p_notes, p_user_id,
    p_reward_id, p_idempotency_key
  );
  v_sale_id := (v_result ->> 'id')::uuid;

  IF COALESCE((v_result ->> 'idempotent_replay')::boolean, false) THEN
    SELECT * INTO v_snapshot
    FROM public.pos_sale_loyalty_tier_snapshots
    WHERE sale_id = v_sale_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inconsistencia de fidelización: la venta V3 no tiene snapshot de niveles.';
    END IF;

    RETURN v_result || jsonb_build_object(
      'points_earned', v_snapshot.earned_points,
      'base_points', v_snapshot.base_points,
      'tier_multiplier', v_snapshot.tier_multiplier,
      'tier_before', CASE WHEN v_snapshot.tier_before_id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', v_snapshot.tier_before_id, 'name', v_snapshot.tier_before_name,
        'minimumLifetimePoints', v_snapshot.tier_before_minimum_lifetime_points,
        'pointsMultiplier', v_snapshot.tier_before_points_multiplier
      ) END,
      'tier_after', CASE WHEN v_snapshot.tier_after_id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', v_snapshot.tier_after_id, 'name', v_snapshot.tier_after_name,
        'minimumLifetimePoints', v_snapshot.tier_after_minimum_lifetime_points,
        'pointsMultiplier', v_snapshot.tier_after_points_multiplier
      ) END,
      'tier_promoted', v_snapshot.tier_promoted
    );
  END IF;

  IF v_member.id IS NOT NULL AND v_program.id IS NOT NULL THEN
    v_base_points := floor(((v_result ->> 'total')::numeric) * v_program.points_per_currency);
    v_earned_points := floor(v_base_points * v_multiplier);
    v_bonus_points := v_earned_points - v_base_points;

    IF v_bonus_points <> 0 THEN
      UPDATE public.pos_loyalty_members
      SET points_balance = points_balance + v_bonus_points,
          lifetime_points = lifetime_points + v_bonus_points
      WHERE id = v_member.id
      RETURNING * INTO v_member;

      UPDATE public.pos_loyalty_transactions
      SET points = v_earned_points,
          balance_after = balance_after + v_bonus_points
      WHERE sale_id = v_sale_id
        AND member_id = v_member.id
        AND transaction_type = 'earn';
    ELSE
      SELECT * INTO v_member
      FROM public.pos_loyalty_members
      WHERE id = v_member.id;
    END IF;

    v_lifetime_after := v_member.lifetime_points;
    SELECT * INTO v_tier_after
    FROM public.pos_resolve_loyalty_tier(p_brand_slug, v_program.id, v_lifetime_after);

    v_promoted := v_tier_after.tier_id IS NOT NULL
      AND v_tier_after.tier_id IS DISTINCT FROM v_tier_before.tier_id
      AND v_tier_after.minimum_lifetime_points > COALESCE(v_tier_before.minimum_lifetime_points, -1);

    UPDATE public.pos_loyalty_members
    SET tier_id = v_tier_after.tier_id
    WHERE id = v_member.id
    RETURNING * INTO v_member;

    INSERT INTO public.pos_sale_loyalty_tier_snapshots (
      brand_id, brand_slug, sale_id, member_id, base_points, earned_points,
      tier_multiplier, lifetime_points_before, lifetime_points_after,
      tier_before_id, tier_before_name, tier_before_minimum_lifetime_points,
      tier_before_points_multiplier, tier_after_id, tier_after_name,
      tier_after_minimum_lifetime_points, tier_after_points_multiplier,
      tier_promoted
    ) VALUES (
      v_member.brand_id, v_member.brand_slug, v_sale_id, v_member.id,
      v_base_points, v_earned_points, v_multiplier, v_lifetime_before,
      v_lifetime_after, v_tier_before.tier_id, v_tier_before.name,
      v_tier_before.minimum_lifetime_points, v_tier_before.points_multiplier,
      v_tier_after.tier_id, v_tier_after.name,
      v_tier_after.minimum_lifetime_points, v_tier_after.points_multiplier,
      v_promoted
    );
  ELSE
    INSERT INTO public.pos_sale_loyalty_tier_snapshots (
      brand_id, brand_slug, sale_id, member_id, base_points, earned_points,
      tier_multiplier, lifetime_points_before, lifetime_points_after,
      tier_promoted
    )
    SELECT sale.brand_id, sale.brand_slug, sale.id, NULL, 0, 0, 1, 0, 0, false
    FROM public.pos_sales sale WHERE sale.id = v_sale_id;
  END IF;

  RETURN v_result || jsonb_build_object(
    'points_earned', v_earned_points,
    'loyalty_balance', CASE WHEN v_member.id IS NULL THEN NULL ELSE v_member.points_balance END,
    'base_points', v_base_points,
    'tier_multiplier', v_multiplier,
    'tier_before', CASE WHEN v_tier_before.tier_id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_tier_before.tier_id, 'name', v_tier_before.name,
      'minimumLifetimePoints', v_tier_before.minimum_lifetime_points,
      'pointsMultiplier', v_tier_before.points_multiplier
    ) END,
    'tier_after', CASE WHEN v_tier_after.tier_id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_tier_after.tier_id, 'name', v_tier_after.name,
      'minimumLifetimePoints', v_tier_after.minimum_lifetime_points,
      'pointsMultiplier', v_tier_after.points_multiplier
    ) END,
    'tier_promoted', v_promoted
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.pos_resolve_loyalty_tier(text, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pos_register_loyalty_member_v2(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pos_create_loyalty_tier(text, text, integer, numeric, integer, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pos_update_loyalty_tier(text, uuid, text, integer, numeric, integer, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pos_set_loyalty_tier_active(text, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pos_complete_sale_v3(text, uuid, uuid, uuid, uuid, jsonb, jsonb, text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.pos_resolve_loyalty_tier(text, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_register_loyalty_member_v2(text, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_create_loyalty_tier(text, text, integer, numeric, integer, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_update_loyalty_tier(text, uuid, text, integer, numeric, integer, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_set_loyalty_tier_active(text, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_complete_sale_v3(text, uuid, uuid, uuid, uuid, jsonb, jsonb, text, uuid, uuid, uuid) TO service_role;

COMMIT;
