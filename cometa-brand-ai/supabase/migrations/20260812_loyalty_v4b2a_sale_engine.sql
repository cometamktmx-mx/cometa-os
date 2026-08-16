BEGIN;

CREATE TABLE public.pos_sale_loyalty_visit_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id text NOT NULL, brand_slug text NOT NULL,
  sale_id uuid NOT NULL REFERENCES public.pos_sales(id), member_id uuid NULL REFERENCES public.pos_loyalty_members(id),
  reward_source text NULL, reward_id uuid NULL, reward_unlock_id uuid NULL REFERENCES public.pos_loyalty_reward_unlocks(id),
  reward_discount_applied numeric(14,2) NOT NULL DEFAULT 0, visits_earned integer NOT NULL DEFAULT 0,
  visit_progress jsonb NOT NULL DEFAULT '[]'::jsonb, visit_unlocks_created jsonb NOT NULL DEFAULT '[]'::jsonb,
  response_json jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_sale_loyalty_visit_snapshots_sale_uq UNIQUE(sale_id),
  CONSTRAINT pos_sale_loyalty_visit_snapshots_source_ck CHECK(reward_source IS NULL OR reward_source IN('points','visits')),
  CONSTRAINT pos_sale_loyalty_visit_snapshots_discount_ck CHECK(reward_discount_applied>=0),
  CONSTRAINT pos_sale_loyalty_visit_snapshots_visits_ck CHECK(visits_earned>=0),
  CONSTRAINT pos_sale_loyalty_visit_snapshots_progress_ck CHECK(jsonb_typeof(visit_progress)='array'),
  CONSTRAINT pos_sale_loyalty_visit_snapshots_unlocks_ck CHECK(jsonb_typeof(visit_unlocks_created)='array'),
  CONSTRAINT pos_sale_loyalty_visit_snapshots_response_ck CHECK(jsonb_typeof(response_json)='object'),
  CONSTRAINT pos_sale_loyalty_visit_snapshots_reward_shape_ck CHECK((reward_source IS NULL AND reward_id IS NULL AND reward_unlock_id IS NULL) OR (reward_source='points' AND reward_id IS NOT NULL AND reward_unlock_id IS NULL) OR (reward_source='visits' AND reward_unlock_id IS NOT NULL))
);
ALTER TABLE public.pos_sale_loyalty_visit_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY pos_sale_loyalty_visit_snapshots_select_policy ON public.pos_sale_loyalty_visit_snapshots FOR SELECT TO authenticated USING(public.pos_can_access_brand(brand_slug));

-- V2 fragment SHA-256: 1f908a2bf9573d962e12bc9a4163559cc9db7004d484808c85693c267d3ba295. Tier semantics integrated from V3/V4A.
CREATE OR REPLACE FUNCTION public.pos_complete_sale_v4(
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
  p_idempotency_key uuid,
  p_reward_unlock_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_location public.pos_locations%rowtype;
  v_register public.pos_registers%rowtype;
  v_session public.pos_cash_sessions%rowtype;
  v_sale public.pos_sales%rowtype;
  v_existing_sale public.pos_sales%rowtype;
  v_item jsonb;
  v_payment jsonb;
  v_variant record;
  v_inventory public.pos_inventory%rowtype;
  v_quantity numeric(14,3);
  v_discount numeric(14,2);
  v_manual_discount numeric(14,2);
  v_loyalty_line_discount numeric(14,2);
  v_line_subtotal numeric(14,2);
  v_line_tax numeric(14,2);
  v_line_total numeric(14,2);
  v_line_pre_reward_total numeric(14,2);
  v_subtotal numeric(14,2) := 0;
  v_discount_total numeric(14,2) := 0;
  v_loyalty_discount_total numeric(14,2) := 0;
  v_tax_total numeric(14,2) := 0;
  v_total numeric(14,2) := 0;
  v_payment_total numeric(14,2) := 0;
  v_tendered_total numeric(14,2) := 0;
  v_change_total numeric(14,2) := 0;
  v_payment_amount numeric(14,2);
  v_tendered_amount numeric(14,2);
  v_change_amount numeric(14,2);
  v_sale_number text;
  v_program public.pos_loyalty_programs%rowtype;
  v_member public.pos_loyalty_members%rowtype;
  v_reward public.pos_loyalty_rewards%rowtype;
  v_reward_unlock public.pos_loyalty_reward_unlocks%rowtype;
  v_reward_source text := NULL;
  v_effective_reward_name text := NULL;
  v_effective_reward_type text := NULL;
  v_tier_before record;
  v_tier_after record;
  v_base_points integer := 0;
  v_earned_points integer := 0;
  v_multiplier numeric(8,4) := 1;
  v_lifetime_before integer := 0;
  v_lifetime_after integer := 0;
  v_tier_promoted boolean := false;
  v_visit_snapshot public.pos_sale_loyalty_visit_snapshots%rowtype;
  v_campaign record;
  v_completed_before integer;
  v_completed_after integer;
  v_cycles_before integer;
  v_cycles_after integer;
  v_cycle integer;
  v_event_id uuid;
  v_created_unlock public.pos_loyalty_reward_unlocks%rowtype;
  v_visits_earned integer := 0;
  v_visit_progress jsonb := '[]'::jsonb;
  v_visit_unlocks_created jsonb := '[]'::jsonb;
  v_response jsonb;
  v_points integer := 0;
  v_points_redeemed integer := 0;
  v_new_balance integer;
  v_loyalty_balance integer := NULL;
  v_reward_value numeric(14,2) := 0;
  v_redemption_id uuid := NULL;
  v_response_reward_id uuid := NULL;
  v_eligible_total numeric(14,2) := 0;
  v_remaining_eligible numeric(14,2) := 0;
  v_remaining_loyalty_discount numeric(14,2) := 0;
  v_eligible_line_count integer := 0;
  v_eligible_line_index integer := 0;
  v_allocation_lower numeric(14,2);
  v_allocation_upper numeric(14,2);
  v_canonical_items jsonb;
  v_canonical_payments jsonb;
  v_canonical_payload jsonb;
  v_idempotency_fingerprint text;
  v_pgcrypto_schema name;
  v_replay_payment_total numeric(14,2) := 0;
  v_replay_tendered_total numeric(14,2) := 0;
  v_replay_change_total numeric(14,2) := 0;
  v_replay_points integer := 0;
  v_replay_points_redeemed integer := 0;
  v_replay_loyalty_balance integer := NULL;
BEGIN
  SELECT NULL::uuid tier_id, NULL::text name, NULL::integer minimum_lifetime_points,
    NULL::numeric(8,4) points_multiplier INTO v_tier_before;
  SELECT NULL::uuid tier_id, NULL::text name, NULL::integer minimum_lifetime_points,
    NULL::numeric(8,4) points_multiplier INTO v_tier_after;

  IF jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La venta no contiene productos.';
  END IF;

  IF jsonb_typeof(p_payments) <> 'array'
     OR jsonb_array_length(p_payments) = 0 THEN
    RAISE EXCEPTION 'La venta no contiene pagos.';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'La venta requiere una clave de idempotencia.';
  END IF;

  IF p_reward_id IS NOT NULL AND p_reward_unlock_id IS NOT NULL THEN
    RAISE EXCEPTION 'Sólo puede aplicarse una recompensa por venta.';
  END IF;

  v_reward_source := CASE WHEN p_reward_id IS NOT NULL THEN 'points' WHEN p_reward_unlock_id IS NOT NULL THEN 'visits' ELSE NULL END;

  SELECT COALESCE(
    jsonb_agg(canonical_item ORDER BY canonical_item::text),
    '[]'::jsonb
  )
  INTO v_canonical_items
  FROM (
    SELECT jsonb_build_object(
      'variant_id', item.value -> 'variant_id',
      'quantity', item.value -> 'quantity',
      'discount_amount', COALESCE(
        item.value -> 'discount_amount',
        '0'::jsonb
      )
    ) AS canonical_item
    FROM jsonb_array_elements(p_items) AS item(value)
  ) normalized_items;

  SELECT COALESCE(
    jsonb_agg(canonical_payment ORDER BY canonical_payment::text),
    '[]'::jsonb
  )
  INTO v_canonical_payments
  FROM (
    SELECT jsonb_build_object(
      'method', payment.value -> 'method',
      'amount', payment.value -> 'amount',
      'tendered_amount', COALESCE(
        payment.value -> 'tendered_amount',
        payment.value -> 'amount'
      ),
      'reference', to_jsonb(
        NULLIF(trim(payment.value ->> 'reference'), '')
      ),
      'metadata', COALESCE(
        payment.value -> 'metadata',
        '{}'::jsonb
      )
    ) AS canonical_payment
    FROM jsonb_array_elements(p_payments) AS payment(value)
  ) normalized_payments;

  v_canonical_payload := jsonb_build_object(
    'brand_slug', p_brand_slug,
    'location_id', p_location_id,
    'register_id', p_register_id,
    'cash_session_id', p_cash_session_id,
    'customer_id', p_customer_id,
    'items', v_canonical_items,
    'payments', v_canonical_payments,
    'notes', p_notes,
    'reward', jsonb_build_object(
      'source', COALESCE(v_reward_source, 'none'),
      'rewardId', p_reward_id,
      'rewardUnlockId', p_reward_unlock_id
    )
  );

  SELECT ns.nspname
  INTO v_pgcrypto_schema
  FROM pg_extension ext
  JOIN pg_namespace ns
    ON ns.oid = ext.extnamespace
  WHERE ext.extname = 'pgcrypto';

  IF NOT FOUND OR v_pgcrypto_schema IS NULL THEN
    RAISE EXCEPTION 'La extensión pgcrypto no está disponible.';
  END IF;

  EXECUTE format(
    'SELECT encode(%I.digest(convert_to($1, ''UTF8''), ''sha256''), ''hex'')',
    v_pgcrypto_schema
  )
  INTO v_idempotency_fingerprint
  USING v_canonical_payload::text;

  IF v_idempotency_fingerprint IS NULL THEN
    RAISE EXCEPTION 'No se pudo calcular el fingerprint de idempotencia.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      COALESCE(p_brand_slug, '')
      || ':'
      || p_idempotency_key::text,
      0
    )
  );

  SELECT *
  INTO v_existing_sale
  FROM public.pos_sales
  WHERE brand_slug = p_brand_slug
    AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing_sale.idempotency_fingerprint IS DISTINCT FROM v_idempotency_fingerprint THEN
      RAISE EXCEPTION 'Conflicto de idempotencia: la clave ya fue utilizada con un payload diferente.';
    END IF;
    SELECT * INTO v_visit_snapshot FROM public.pos_sale_loyalty_visit_snapshots WHERE sale_id = v_existing_sale.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Inconsistencia de fidelización: la venta V4 no tiene snapshot de visitas.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.pos_sale_loyalty_tier_snapshots WHERE sale_id = v_existing_sale.id) THEN
      RAISE EXCEPTION 'Inconsistencia de fidelización: la venta V4 no tiene snapshot de niveles.';
    END IF;
    RETURN jsonb_set(v_visit_snapshot.response_json, '{idempotent_replay}', 'true'::jsonb, true);
  END IF;

  SELECT *
  INTO v_location
  FROM public.pos_locations
  WHERE id = p_location_id
    AND brand_slug = p_brand_slug
    AND active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La sucursal no existe o pertenece a otra marca.';
  END IF;

  SELECT *
  INTO v_register
  FROM public.pos_registers
  WHERE id = p_register_id
    AND location_id = p_location_id
    AND brand_slug = p_brand_slug
    AND status = 'available';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La caja no existe o no corresponde a la sucursal.';
  END IF;

  SELECT *
  INTO v_session
  FROM public.pos_cash_sessions
  WHERE id = p_cash_session_id
    AND register_id = p_register_id
    AND brand_slug = p_brand_slug
    AND status = 'open'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe una sesión de caja abierta.';
  END IF;

  IF p_customer_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.pos_customers
       WHERE id = p_customer_id
         AND brand_slug = p_brand_slug
         AND active = true
     ) THEN
    RAISE EXCEPTION 'El cliente no existe o pertenece a otra marca.';
  END IF;

  IF p_reward_id IS NOT NULL THEN
    IF p_customer_id IS NULL THEN
      RAISE EXCEPTION 'Se requiere un cliente para canjear una recompensa.';
    END IF;

    SELECT *
    INTO v_program
    FROM public.pos_loyalty_programs
    WHERE brand_slug = p_brand_slug
      AND active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No existe un programa de fidelización activo.';
    END IF;

    SELECT *
    INTO v_reward
    FROM public.pos_loyalty_rewards
    WHERE id = p_reward_id
      AND brand_slug = p_brand_slug
      AND program_id = v_program.id
      AND active = true
      AND reward_type = 'discount_fixed'
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'La recompensa no existe, no está activa o pertenece a otro programa.';
    END IF;

    IF v_reward.points_cost <= 0 THEN
      RAISE EXCEPTION 'El costo en puntos de la recompensa no es válido.';
    END IF;

    IF v_reward.reward_value IS NULL
       OR v_reward.reward_value <= 0 THEN
      RAISE EXCEPTION 'El valor de la recompensa no es válido.';
    END IF;

    IF round(v_reward.reward_value, 2) <> v_reward.reward_value THEN
      RAISE EXCEPTION 'El valor de la recompensa debe tener máximo dos decimales.';
    END IF;

    v_reward_value := round(v_reward.reward_value, 2);

    SELECT *
    INTO v_member
    FROM public.pos_loyalty_members
    WHERE program_id = v_program.id
      AND customer_id = p_customer_id
      AND brand_slug = p_brand_slug
      AND status = 'active'
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El cliente no tiene una membresía de fidelización activa.';
    END IF;

    IF v_member.points_balance < v_reward.points_cost THEN
      RAISE EXCEPTION 'El cliente no tiene puntos suficientes para esta recompensa.';
    END IF;

    v_points_redeemed := v_reward.points_cost;
    v_response_reward_id := v_reward.id;
    v_effective_reward_name := v_reward.name;
    v_effective_reward_type := v_reward.reward_type;
  ELSIF p_reward_unlock_id IS NOT NULL THEN
    IF p_customer_id IS NULL THEN RAISE EXCEPTION 'Se requiere un cliente para canjear una recompensa.'; END IF;
    SELECT * INTO v_program FROM public.pos_loyalty_programs WHERE brand_slug=p_brand_slug AND active=true;
    IF NOT FOUND THEN RAISE EXCEPTION 'No existe un programa de fidelización activo.'; END IF;
    SELECT * INTO v_member FROM public.pos_loyalty_members WHERE program_id=v_program.id AND customer_id=p_customer_id AND brand_slug=p_brand_slug AND status='active' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El cliente no tiene una membresía de fidelización activa.'; END IF;
    SELECT * INTO v_reward_unlock FROM public.pos_loyalty_reward_unlocks
    WHERE id=p_reward_unlock_id AND brand_slug=p_brand_slug AND member_id=v_member.id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La recompensa desbloqueada no existe o pertenece a otro cliente.'; END IF;
    IF v_reward_unlock.status<>'available' OR v_reward_unlock.redeemed_sale_id IS NOT NULL THEN RAISE EXCEPTION 'La recompensa desbloqueada ya no está disponible.'; END IF;
    IF v_reward_unlock.reward_type<>'discount_fixed' OR v_reward_unlock.reward_value<=0 THEN RAISE EXCEPTION 'La recompensa desbloqueada tiene un snapshot inválido.'; END IF;
    v_reward_value:=round(v_reward_unlock.reward_value,2);
    v_effective_reward_name:=v_reward_unlock.reward_name;
    v_effective_reward_type:=v_reward_unlock.reward_type;
  END IF;

  IF p_customer_id IS NOT NULL AND v_program.id IS NULL THEN
    SELECT * INTO v_program FROM public.pos_loyalty_programs WHERE brand_slug=p_brand_slug AND active=true;
    IF FOUND THEN
      SELECT * INTO v_member FROM public.pos_loyalty_members WHERE program_id=v_program.id AND customer_id=p_customer_id AND brand_slug=p_brand_slug AND status='active' FOR UPDATE;
      IF NOT FOUND THEN SELECT * INTO v_member FROM public.pos_register_loyalty_member_v2(p_brand_slug,p_customer_id,p_user_id); END IF;
    END IF;
  END IF;
  IF v_member.id IS NOT NULL THEN
    v_lifetime_before:=v_member.lifetime_points;
    SELECT * INTO v_tier_before FROM public.pos_resolve_loyalty_tier(p_brand_slug,v_program.id,v_lifetime_before);
    v_multiplier:=COALESCE(v_tier_before.points_multiplier,1);
    IF v_member.tier_id IS DISTINCT FROM v_tier_before.tier_id THEN UPDATE public.pos_loyalty_members SET tier_id=v_tier_before.tier_id WHERE id=v_member.id RETURNING * INTO v_member; END IF;
  END IF;

  v_sale_number :=
    'V-'
    || to_char(clock_timestamp(), 'YYMMDD')
    || '-'
    || lpad(
      nextval('public.pos_sale_number_seq')::text,
      7,
      '0'
    );

  INSERT INTO public.pos_sales (
    brand_id,
    brand_slug,
    sale_number,
    location_id,
    register_id,
    cash_session_id,
    customer_id,
    status,
    currency,
    sold_by,
    notes,
    idempotency_key,
    idempotency_fingerprint,
    loyalty_discount_total
  )
  VALUES (
    v_location.brand_id,
    v_location.brand_slug,
    v_sale_number,
    v_location.id,
    v_register.id,
    v_session.id,
    p_customer_id,
    'completed',
    v_location.currency,
    p_user_id,
    p_notes,
    p_idempotency_key,
    v_idempotency_fingerprint,
    0
  )
  RETURNING *
  INTO v_sale;

  IF v_reward_source IS NOT NULL THEN
    FOR v_item IN
      SELECT value
      FROM jsonb_array_elements(p_items)
    LOOP
      v_quantity :=
        COALESCE((v_item ->> 'quantity')::numeric, 0);

      IF v_quantity <= 0 THEN
        RAISE EXCEPTION 'La cantidad de un producto debe ser mayor que cero.';
      END IF;

      v_manual_discount :=
        greatest(
          COALESCE(
            (v_item ->> 'discount_amount')::numeric,
            0
          ),
          0
        );

      SELECT
        variant.*,
        product.name AS product_name,
        product.track_inventory,
        product.tax_rate,
        product.id AS parent_product_id
      INTO v_variant
      FROM public.pos_product_variants variant
      JOIN public.pos_products product
        ON product.id = variant.product_id
      WHERE variant.id =
        (v_item ->> 'variant_id')::uuid
        AND variant.brand_slug = p_brand_slug
        AND variant.active = true
        AND product.active = true;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Uno de los productos ya no está disponible.';
      END IF;

      v_line_subtotal :=
        round(v_variant.price * v_quantity, 2);

      IF v_manual_discount > v_line_subtotal THEN
        RAISE EXCEPTION 'El descuento supera el subtotal de un producto.';
      END IF;

      IF v_location.prices_include_tax THEN
        v_line_tax :=
          CASE
            WHEN v_variant.tax_rate > 0 THEN
              round(
                (v_line_subtotal - v_manual_discount)
                - (
                  (v_line_subtotal - v_manual_discount)
                  / (1 + v_variant.tax_rate / 100)
                ),
                2
              )
            ELSE 0
          END;

        v_line_pre_reward_total :=
          round(v_line_subtotal - v_manual_discount, 2);
      ELSE
        v_line_tax :=
          round(
            (v_line_subtotal - v_manual_discount)
            * v_variant.tax_rate
            / 100,
            2
          );

        v_line_pre_reward_total :=
          round(
            v_line_subtotal
            - v_manual_discount
            + v_line_tax,
            2
          );
      END IF;

      IF v_line_pre_reward_total > 0 THEN
        v_eligible_total :=
          round(v_eligible_total + v_line_pre_reward_total, 2);
        v_eligible_line_count := v_eligible_line_count + 1;
      END IF;
    END LOOP;

    IF v_eligible_total <= 0 THEN
      RAISE EXCEPTION 'La venta no tiene un total elegible para aplicar la recompensa.';
    END IF;

    IF v_reward_value >= v_eligible_total THEN
      RAISE EXCEPTION 'El valor de la recompensa debe ser menor que el total elegible de la venta.';
    END IF;

    v_remaining_eligible := v_eligible_total;
    v_remaining_loyalty_discount := v_reward_value;
  END IF;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_items)
  LOOP
    v_quantity :=
      COALESCE((v_item ->> 'quantity')::numeric, 0);

    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'La cantidad de un producto debe ser mayor que cero.';
    END IF;

    v_manual_discount :=
      greatest(
        COALESCE(
          (v_item ->> 'discount_amount')::numeric,
          0
        ),
        0
      );

    SELECT
      variant.*,
      product.name AS product_name,
      product.track_inventory,
      product.tax_rate,
      product.id AS parent_product_id
    INTO v_variant
    FROM public.pos_product_variants variant
    JOIN public.pos_products product
      ON product.id = variant.product_id
    WHERE variant.id =
      (v_item ->> 'variant_id')::uuid
      AND variant.brand_slug = p_brand_slug
      AND variant.active = true
      AND product.active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Uno de los productos ya no está disponible.';
    END IF;

    v_line_subtotal :=
      round(v_variant.price * v_quantity, 2);

    IF v_manual_discount > v_line_subtotal THEN
      RAISE EXCEPTION 'El descuento supera el subtotal de un producto.';
    END IF;

    IF v_location.prices_include_tax THEN
      v_line_tax :=
        CASE
          WHEN v_variant.tax_rate > 0 THEN
            round(
              (v_line_subtotal - v_manual_discount)
              - (
                (v_line_subtotal - v_manual_discount)
                / (1 + v_variant.tax_rate / 100)
              ),
              2
            )
          ELSE 0
        END;

      v_line_pre_reward_total :=
        round(v_line_subtotal - v_manual_discount, 2);
    ELSE
      v_line_tax :=
        round(
          (v_line_subtotal - v_manual_discount)
          * v_variant.tax_rate
          / 100,
          2
        );

      v_line_pre_reward_total :=
        round(
          v_line_subtotal
          - v_manual_discount
          + v_line_tax,
          2
        );
    END IF;

    v_loyalty_line_discount := 0;

    IF v_reward_source IS NOT NULL
       AND v_line_pre_reward_total > 0 THEN
      v_eligible_line_index := v_eligible_line_index + 1;

      IF v_eligible_line_index = v_eligible_line_count THEN
        v_loyalty_line_discount :=
          round(v_remaining_loyalty_discount, 2);
      ELSE
        v_loyalty_line_discount :=
          round(
            v_remaining_loyalty_discount
            * v_line_pre_reward_total
            / v_remaining_eligible,
            2
          );

        v_allocation_lower :=
          greatest(
            0,
            round(
              v_remaining_loyalty_discount
              - (
                v_remaining_eligible
                - v_line_pre_reward_total
              ),
              2
            )
          );

        v_allocation_upper :=
          least(
            v_line_pre_reward_total,
            v_remaining_loyalty_discount
          );

        v_loyalty_line_discount :=
          greatest(
            v_allocation_lower,
            least(
              v_allocation_upper,
              v_loyalty_line_discount
            )
          );
      END IF;

      v_remaining_loyalty_discount :=
        round(
          v_remaining_loyalty_discount
          - v_loyalty_line_discount,
          2
        );

      v_remaining_eligible :=
        round(
          v_remaining_eligible
          - v_line_pre_reward_total,
          2
        );
    END IF;

    v_discount :=
      round(
        v_manual_discount
        + v_loyalty_line_discount,
        2
      );

    IF v_location.prices_include_tax THEN
      v_line_total :=
        round(
          v_line_pre_reward_total
          - v_loyalty_line_discount,
          2
        );

      v_line_tax :=
        CASE
          WHEN v_variant.tax_rate > 0 THEN
            round(
              v_line_total
              - (
                v_line_total
                / (1 + v_variant.tax_rate / 100)
              ),
              2
            )
          ELSE 0
        END;
    ELSE
      v_line_total :=
        round(
          v_line_pre_reward_total
          - v_loyalty_line_discount,
          2
        );
    END IF;

    IF v_line_total < 0 THEN
      RAISE EXCEPTION 'El descuento supera el total elegible de un producto.';
    END IF;

    IF v_variant.track_inventory THEN
      SELECT *
      INTO v_inventory
      FROM public.pos_inventory
      WHERE location_id = p_location_id
        AND variant_id = v_variant.id
        AND brand_slug = p_brand_slug
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'El producto no tiene inventario en esta sucursal.';
      END IF;

      IF
        v_inventory.quantity
        - v_inventory.reserved_quantity
        < v_quantity
      THEN
        RAISE EXCEPTION 'Inventario insuficiente para %.', v_variant.product_name;
      END IF;

      UPDATE public.pos_inventory
      SET quantity = quantity - v_quantity
      WHERE id = v_inventory.id;

      INSERT INTO public.pos_inventory_movements (
        brand_id,
        brand_slug,
        location_id,
        variant_id,
        movement_type,
        quantity_delta,
        quantity_before,
        quantity_after,
        reference_type,
        reference_id,
        notes,
        created_by
      )
      VALUES (
        v_inventory.brand_id,
        v_inventory.brand_slug,
        v_inventory.location_id,
        v_inventory.variant_id,
        'sale',
        -v_quantity,
        v_inventory.quantity,
        v_inventory.quantity - v_quantity,
        'sale',
        v_sale.id,
        v_sale.sale_number,
        p_user_id
      );
    END IF;

    INSERT INTO public.pos_sale_items (
      brand_id,
      brand_slug,
      sale_id,
      product_id,
      variant_id,
      product_name,
      variant_name,
      sku,
      quantity,
      unit_price,
      unit_cost,
      discount_amount,
      loyalty_discount_amount,
      tax_rate,
      tax_amount,
      line_total
    )
    VALUES (
      v_sale.brand_id,
      v_sale.brand_slug,
      v_sale.id,
      v_variant.parent_product_id,
      v_variant.id,
      v_variant.product_name,
      v_variant.name,
      v_variant.sku,
      v_quantity,
      v_variant.price,
      v_variant.cost,
      v_discount,
      v_loyalty_line_discount,
      v_variant.tax_rate,
      v_line_tax,
      v_line_total
    );

    v_subtotal := v_subtotal + v_line_subtotal;
    v_discount_total := v_discount_total + v_discount;
    v_loyalty_discount_total :=
      v_loyalty_discount_total + v_loyalty_line_discount;
    v_tax_total := v_tax_total + v_line_tax;
    v_total := v_total + v_line_total;
  END LOOP;

  IF v_reward_source IS NOT NULL
     AND round(v_remaining_loyalty_discount, 2) <> 0 THEN
    RAISE EXCEPTION 'No se pudo distribuir completamente el descuento de fidelización.';
  END IF;

  IF v_reward_source IS NOT NULL
     AND round(v_loyalty_discount_total, 2)
       <> round(v_reward_value, 2) THEN
    RAISE EXCEPTION 'El descuento aplicado no coincide con el valor de la recompensa.';
  END IF;

  IF round(v_total, 2) <= 0 THEN
    RAISE EXCEPTION 'El total final de la venta debe ser mayor que cero.';
  END IF;

  FOR v_payment IN
    SELECT value
    FROM jsonb_array_elements(p_payments)
  LOOP
    IF
      (v_payment ->> 'method')
      NOT IN (
        'cash',
        'card',
        'transfer',
        'wallet',
        'other'
      )
    THEN
      RAISE EXCEPTION 'Método de pago no permitido.';
    END IF;

    BEGIN
      v_payment_amount :=
        round(
          COALESCE(
            NULLIF(trim(v_payment ->> 'amount'), '')::numeric,
            0
          ),
          2
        );
    EXCEPTION
      WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'El monto aplicado de un pago no es válido.';
    END;

    IF v_payment_amount <= 0 THEN
      RAISE EXCEPTION 'El monto aplicado de un pago debe ser mayor que cero.';
    END IF;

    IF (v_payment ->> 'method') = 'cash' THEN
      BEGIN
        v_tendered_amount :=
          round(
            COALESCE(
              NULLIF(
                trim(v_payment ->> 'tendered_amount'),
                ''
              )::numeric,
              v_payment_amount
            ),
            2
          );
      EXCEPTION
        WHEN invalid_text_representation THEN
          RAISE EXCEPTION 'El efectivo recibido no es válido.';
      END;

      IF v_tendered_amount < v_payment_amount THEN
        RAISE EXCEPTION 'El efectivo recibido no cubre el monto aplicado.';
      END IF;

      v_change_amount :=
        round(v_tendered_amount - v_payment_amount, 2);
    ELSE
      v_tendered_amount := v_payment_amount;
      v_change_amount := 0;
    END IF;

    INSERT INTO public.pos_payments (
      brand_id,
      brand_slug,
      sale_id,
      payment_method,
      amount,
      tendered_amount,
      change_amount,
      reference,
      metadata
    )
    VALUES (
      v_sale.brand_id,
      v_sale.brand_slug,
      v_sale.id,
      v_payment ->> 'method',
      v_payment_amount,
      v_tendered_amount,
      v_change_amount,
      NULLIF(trim(v_payment ->> 'reference'), ''),
      COALESCE(v_payment -> 'metadata', '{}'::jsonb)
    );

    v_payment_total := v_payment_total + v_payment_amount;
    v_tendered_total := v_tendered_total + v_tendered_amount;
    v_change_total := v_change_total + v_change_amount;
  END LOOP;

  IF round(v_payment_total, 2) < round(v_total, 2) THEN
    RAISE EXCEPTION 'Los pagos aplicados no cubren el total de la venta.';
  END IF;

  IF round(v_payment_total, 2) > round(v_total, 2) THEN
    RAISE EXCEPTION 'Los pagos aplicados superan el total de la venta. Registra el excedente como efectivo recibido, no como pago aplicado.';
  END IF;

  UPDATE public.pos_sales
  SET
    subtotal = round(v_subtotal, 2),
    discount_total = round(v_discount_total, 2),
    loyalty_discount_total = round(v_loyalty_discount_total, 2),
    tax_total = round(v_tax_total, 2),
    total = round(v_total, 2)
  WHERE id = v_sale.id
  RETURNING *
  INTO v_sale;

  IF v_reward_source = 'points' THEN
    v_new_balance :=
      v_member.points_balance - v_reward.points_cost;

    IF v_new_balance < 0 THEN
      RAISE EXCEPTION 'El cliente no tiene puntos suficientes para esta recompensa.';
    END IF;

    UPDATE public.pos_loyalty_members
    SET points_balance = v_new_balance
    WHERE id = v_member.id
    RETURNING *
    INTO v_member;

    v_loyalty_balance := v_member.points_balance;

    INSERT INTO public.pos_loyalty_transactions (
      brand_id,
      brand_slug,
      member_id,
      sale_id,
      transaction_type,
      points,
      balance_after,
      description,
      created_by
    )
    VALUES (
      v_member.brand_id,
      v_member.brand_slug,
      v_member.id,
      v_sale.id,
      'redeem',
      -v_reward.points_cost,
      v_member.points_balance,
      'Canje: ' || v_reward.name,
      p_user_id
    );

    INSERT INTO public.pos_loyalty_redemptions (
      brand_id,
      brand_slug,
      member_id,
      reward_id,
      sale_id,
      points_spent,
      status,
      reward_name,
      reward_type,
      reward_value,
      discount_applied
    )
    VALUES (
      v_member.brand_id,
      v_member.brand_slug,
      v_member.id,
      v_reward.id,
      v_sale.id,
      v_reward.points_cost,
      'completed',
      v_reward.name,
      v_reward.reward_type,
      v_reward.reward_value,
      round(v_loyalty_discount_total, 2)
    )
    RETURNING id
    INTO v_redemption_id;
  END IF;

  IF v_reward_source = 'visits' THEN
    UPDATE public.pos_loyalty_reward_unlocks SET status='redeemed',redeemed_sale_id=v_sale.id,redeemed_at=now()
    WHERE id=v_reward_unlock.id AND status='available' AND redeemed_sale_id IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'La recompensa desbloqueada ya no está disponible.'; END IF;
  END IF;

  IF v_program.id IS NOT NULL AND v_member.id IS NOT NULL THEN
    v_base_points:=floor(v_sale.total*v_program.points_per_currency);
    v_earned_points:=floor(v_base_points*v_multiplier);
    IF v_earned_points>0 THEN
      UPDATE public.pos_loyalty_members SET points_balance=points_balance+v_earned_points,lifetime_points=lifetime_points+v_earned_points WHERE id=v_member.id RETURNING * INTO v_member;
      INSERT INTO public.pos_loyalty_transactions(brand_id,brand_slug,member_id,sale_id,transaction_type,points,balance_after,description,created_by)
      VALUES(v_member.brand_id,v_member.brand_slug,v_member.id,v_sale.id,'earn',v_earned_points,v_member.points_balance,'Puntos por compra '||v_sale.sale_number,p_user_id);
    END IF;
    v_loyalty_balance:=v_member.points_balance; v_lifetime_after:=v_member.lifetime_points;
    SELECT * INTO v_tier_after FROM public.pos_resolve_loyalty_tier(p_brand_slug,v_program.id,v_lifetime_after);
    v_tier_promoted:=v_tier_after.tier_id IS NOT NULL AND v_tier_after.tier_id IS DISTINCT FROM v_tier_before.tier_id AND v_tier_after.minimum_lifetime_points>COALESCE(v_tier_before.minimum_lifetime_points,-1);
    UPDATE public.pos_loyalty_members SET tier_id=v_tier_after.tier_id WHERE id=v_member.id RETURNING * INTO v_member;
    INSERT INTO public.pos_sale_loyalty_tier_snapshots(brand_id,brand_slug,sale_id,member_id,base_points,earned_points,tier_multiplier,lifetime_points_before,lifetime_points_after,tier_before_id,tier_before_name,tier_before_minimum_lifetime_points,tier_before_points_multiplier,tier_after_id,tier_after_name,tier_after_minimum_lifetime_points,tier_after_points_multiplier,tier_promoted)
    VALUES(v_member.brand_id,v_member.brand_slug,v_sale.id,v_member.id,v_base_points,v_earned_points,v_multiplier,v_lifetime_before,v_lifetime_after,v_tier_before.tier_id,v_tier_before.name,v_tier_before.minimum_lifetime_points,v_tier_before.points_multiplier,v_tier_after.tier_id,v_tier_after.name,v_tier_after.minimum_lifetime_points,v_tier_after.points_multiplier,v_tier_promoted);
  ELSE
    INSERT INTO public.pos_sale_loyalty_tier_snapshots(brand_id,brand_slug,sale_id,member_id,base_points,earned_points,tier_multiplier,lifetime_points_before,lifetime_points_after,tier_promoted)
    VALUES(v_sale.brand_id,v_sale.brand_slug,v_sale.id,NULL,0,0,1,0,0,false);
  END IF;

  IF v_member.id IS NOT NULL AND v_member.status='active' THEN
    FOR v_campaign IN SELECT c.*,r.name reward_name,r.reward_type,r.reward_value FROM public.pos_loyalty_visit_programs c JOIN public.pos_loyalty_rewards r ON r.id=c.reward_id WHERE c.brand_slug=p_brand_slug AND c.loyalty_program_id=v_program.id AND c.active=true AND r.brand_slug=p_brand_slug AND r.program_id=v_program.id AND r.reward_type='discount_fixed' AND r.reward_value>0 AND (c.starts_at IS NULL OR c.starts_at<=v_sale.sold_at) AND (c.ends_at IS NULL OR c.ends_at>=v_sale.sold_at) ORDER BY c.id LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended(v_campaign.id::text||':'||v_member.id::text,0));
      SELECT COALESCE(sum(CASE event_type WHEN 'qualify' THEN 1 ELSE -1 END),0)::integer INTO v_completed_before FROM public.pos_loyalty_visit_events WHERE visit_program_id=v_campaign.id AND member_id=v_member.id;
      v_cycles_before:=v_completed_before/v_campaign.required_visits; v_event_id:=NULL;
      IF v_sale.total>=v_campaign.minimum_sale_amount THEN
        INSERT INTO public.pos_loyalty_visit_events(brand_id,brand_slug,visit_program_id,member_id,sale_id,event_type,cycle_number,required_visits_snapshot,minimum_sale_amount_snapshot,reward_id_snapshot,created_by) VALUES(v_campaign.brand_id,v_campaign.brand_slug,v_campaign.id,v_member.id,v_sale.id,'qualify',v_cycles_before+1,v_campaign.required_visits,v_campaign.minimum_sale_amount,v_campaign.reward_id,p_user_id) ON CONFLICT DO NOTHING RETURNING id INTO v_event_id;
        IF v_event_id IS NOT NULL THEN v_visits_earned:=v_visits_earned+1; END IF;
      END IF;
      SELECT COALESCE(sum(CASE event_type WHEN 'qualify' THEN 1 ELSE -1 END),0)::integer INTO v_completed_after FROM public.pos_loyalty_visit_events WHERE visit_program_id=v_campaign.id AND member_id=v_member.id;
      v_cycles_after:=v_completed_after/v_campaign.required_visits;
      IF v_cycles_after>v_cycles_before THEN
        FOR v_cycle IN v_cycles_before+1..v_cycles_after LOOP
          v_created_unlock:=NULL;
          INSERT INTO public.pos_loyalty_reward_unlocks(brand_id,brand_slug,visit_program_id,member_id,reward_id,cycle_number,source_sale_id,status,reward_name,reward_type,reward_value,required_visits_snapshot,minimum_sale_amount_snapshot) VALUES(v_campaign.brand_id,v_campaign.brand_slug,v_campaign.id,v_member.id,v_campaign.reward_id,v_cycle,v_sale.id,'available',v_campaign.reward_name,v_campaign.reward_type,v_campaign.reward_value,v_campaign.required_visits,v_campaign.minimum_sale_amount) ON CONFLICT(visit_program_id,member_id,cycle_number) DO NOTHING RETURNING * INTO v_created_unlock;
          IF v_created_unlock.id IS NOT NULL THEN v_visit_unlocks_created:=v_visit_unlocks_created||jsonb_build_array(jsonb_build_object('id',v_created_unlock.id,'visitProgramId',v_campaign.id,'visitProgramName',v_campaign.name,'cycleNumber',v_cycle,'rewardId',v_campaign.reward_id,'rewardName',v_campaign.reward_name,'rewardType',v_campaign.reward_type,'rewardValue',v_campaign.reward_value)); END IF;
        END LOOP;
      END IF;
      v_visit_progress:=v_visit_progress||jsonb_build_array(jsonb_build_object('visitProgramId',v_campaign.id,'name',v_campaign.name,'qualified',v_event_id IS NOT NULL,'requiredVisits',v_campaign.required_visits,'completedVisits',v_completed_after,'cyclesCompleted',v_cycles_after,'currentProgress',mod(v_completed_after,v_campaign.required_visits),'minimumSaleAmount',v_campaign.minimum_sale_amount));
    END LOOP;
  END IF;

  v_response:=jsonb_build_object('id',v_sale.id,'sale_number',v_sale.sale_number,'subtotal',v_sale.subtotal,'discount_total',v_sale.discount_total,'tax_total',v_sale.tax_total,'total',v_sale.total,'currency',v_sale.currency,'payment_applied',v_payment_total,'payment_received',v_tendered_total,'change_due',v_change_total,'points_earned',v_earned_points,'points_redeemed',v_points_redeemed,'loyalty_discount',round(v_loyalty_discount_total,2),'redemption_id',v_redemption_id,'reward_id',v_response_reward_id,'loyalty_balance',v_loyalty_balance,'base_points',v_base_points,'tier_multiplier',v_multiplier,'tier_before',CASE WHEN v_tier_before.tier_id IS NULL THEN NULL ELSE jsonb_build_object('id',v_tier_before.tier_id,'name',v_tier_before.name,'minimumLifetimePoints',v_tier_before.minimum_lifetime_points,'pointsMultiplier',v_tier_before.points_multiplier) END,'tier_after',CASE WHEN v_tier_after.tier_id IS NULL THEN NULL ELSE jsonb_build_object('id',v_tier_after.tier_id,'name',v_tier_after.name,'minimumLifetimePoints',v_tier_after.minimum_lifetime_points,'pointsMultiplier',v_tier_after.points_multiplier) END,'tier_promoted',v_tier_promoted,'reward_source',v_reward_source,'reward_unlock_id',p_reward_unlock_id,'visits_earned',v_visits_earned,'visit_progress',v_visit_progress,'visit_unlocks_created',v_visit_unlocks_created,'idempotent_replay',false,'sold_at',v_sale.sold_at);
  INSERT INTO public.pos_sale_loyalty_visit_snapshots(brand_id,brand_slug,sale_id,member_id,reward_source,reward_id,reward_unlock_id,reward_discount_applied,visits_earned,visit_progress,visit_unlocks_created,response_json) VALUES(v_sale.brand_id,v_sale.brand_slug,v_sale.id,v_member.id,v_reward_source,p_reward_id,p_reward_unlock_id,round(v_loyalty_discount_total,2),v_visits_earned,v_visit_progress,v_visit_unlocks_created,v_response);
  RETURN v_response;
END;
$function$;
REVOKE ALL ON FUNCTION public.pos_complete_sale_v4(text,uuid,uuid,uuid,uuid,jsonb,jsonb,text,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pos_complete_sale_v4(text,uuid,uuid,uuid,uuid,jsonb,jsonb,text,uuid,uuid,uuid,uuid) TO service_role;
COMMIT;
