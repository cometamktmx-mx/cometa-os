BEGIN;

ALTER TABLE public.pos_sales
  ADD COLUMN idempotency_key uuid NULL,
  ADD COLUMN idempotency_fingerprint text NULL,
  ADD COLUMN loyalty_discount_total numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.pos_sales
  ADD CONSTRAINT pos_sales_loyalty_discount_total_nonnegative
  CHECK (loyalty_discount_total >= 0);

ALTER TABLE public.pos_sales
  ADD CONSTRAINT pos_sales_idempotency_fingerprint_format
  CHECK (
    idempotency_fingerprint IS NULL
    OR idempotency_fingerprint ~ '^[0-9a-f]{64}$'
  );

CREATE UNIQUE INDEX pos_sales_brand_idempotency_uidx
  ON public.pos_sales (brand_slug, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.pos_sale_items
  ADD COLUMN loyalty_discount_amount numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.pos_sale_items
  ADD CONSTRAINT pos_sale_items_loyalty_discount_amount_nonnegative
  CHECK (loyalty_discount_amount >= 0);

ALTER TABLE public.pos_loyalty_redemptions
  ADD COLUMN reward_name text NULL,
  ADD COLUMN reward_type text NULL,
  ADD COLUMN reward_value numeric NULL,
  ADD COLUMN discount_applied numeric(14,2) NULL;

ALTER TABLE public.pos_loyalty_redemptions
  ADD CONSTRAINT pos_loyalty_redemptions_discount_applied_nonnegative
  CHECK (
    discount_applied IS NULL
    OR discount_applied >= 0
  );

CREATE UNIQUE INDEX pos_loyalty_redemptions_one_per_sale_uidx
  ON public.pos_loyalty_redemptions (sale_id)
  WHERE sale_id IS NOT NULL;

CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS pgcrypto
  WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.pos_complete_sale_v2(
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
    'reward_id', p_reward_id
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
    IF v_existing_sale.idempotency_fingerprint
       IS DISTINCT FROM v_idempotency_fingerprint THEN
      RAISE EXCEPTION
        'Conflicto de idempotencia: la clave ya fue utilizada con un payload diferente.';
    END IF;

    SELECT
      COALESCE(sum(payment.amount), 0),
      COALESCE(sum(payment.tendered_amount), 0),
      COALESCE(sum(payment.change_amount), 0)
    INTO
      v_replay_payment_total,
      v_replay_tendered_total,
      v_replay_change_total
    FROM public.pos_payments payment
    WHERE payment.sale_id = v_existing_sale.id;

    SELECT COALESCE(
      sum(
        CASE
          WHEN transaction.transaction_type = 'earn'
            THEN transaction.points
          ELSE 0
        END
      ),
      0
    )
    INTO v_replay_points
    FROM public.pos_loyalty_transactions transaction
    WHERE transaction.sale_id = v_existing_sale.id;

    SELECT
      redemption.id,
      redemption.reward_id,
      redemption.points_spent
    INTO
      v_redemption_id,
      v_response_reward_id,
      v_replay_points_redeemed
    FROM public.pos_loyalty_redemptions redemption
    WHERE redemption.sale_id = v_existing_sale.id
    LIMIT 1;

    v_replay_points_redeemed :=
      COALESCE(v_replay_points_redeemed, 0);

    SELECT transaction.balance_after
    INTO v_replay_loyalty_balance
    FROM public.pos_loyalty_transactions transaction
    WHERE transaction.sale_id = v_existing_sale.id
      AND transaction.transaction_type IN ('redeem', 'earn')
    ORDER BY
      CASE transaction.transaction_type
        WHEN 'earn' THEN 2
        WHEN 'redeem' THEN 1
        ELSE 0
      END DESC,
      transaction.created_at DESC
    LIMIT 1;

    RETURN jsonb_build_object(
      'id', v_existing_sale.id,
      'sale_number', v_existing_sale.sale_number,
      'subtotal', v_existing_sale.subtotal,
      'discount_total', v_existing_sale.discount_total,
      'tax_total', v_existing_sale.tax_total,
      'total', v_existing_sale.total,
      'currency', v_existing_sale.currency,
      'payment_applied', round(v_replay_payment_total, 2),
      'payment_received', round(v_replay_tendered_total, 2),
      'change_due', round(v_replay_change_total, 2),
      'points_earned', v_replay_points,
      'points_redeemed', v_replay_points_redeemed,
      'loyalty_discount', COALESCE(
        v_existing_sale.loyalty_discount_total,
        0
      ),
      'redemption_id', v_redemption_id,
      'reward_id', v_response_reward_id,
      'loyalty_balance', v_replay_loyalty_balance,
      'idempotent_replay', true,
      'sold_at', v_existing_sale.sold_at
    );
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

  IF p_reward_id IS NOT NULL THEN
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

    IF p_reward_id IS NOT NULL
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

  IF p_reward_id IS NOT NULL
     AND round(v_remaining_loyalty_discount, 2) <> 0 THEN
    RAISE EXCEPTION 'No se pudo distribuir completamente el descuento de fidelización.';
  END IF;

  IF p_reward_id IS NOT NULL
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

  IF p_reward_id IS NOT NULL THEN
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

  IF p_customer_id IS NOT NULL THEN
    IF p_reward_id IS NULL THEN
      SELECT *
      INTO v_program
      FROM public.pos_loyalty_programs
      WHERE brand_slug = p_brand_slug
        AND active = true;

      IF FOUND THEN
        SELECT *
        INTO v_member
        FROM public.pos_loyalty_members
        WHERE program_id = v_program.id
          AND customer_id = p_customer_id
        FOR UPDATE;

        IF NOT FOUND THEN
          PERFORM *
          FROM public.pos_register_loyalty_member(
            p_brand_slug,
            p_customer_id,
            p_user_id
          );

          SELECT *
          INTO v_member
          FROM public.pos_loyalty_members
          WHERE program_id = v_program.id
            AND customer_id = p_customer_id
          FOR UPDATE;
        END IF;
      END IF;
    END IF;

    IF v_program.id IS NOT NULL
       AND v_member.id IS NOT NULL THEN
      v_points :=
        floor(v_sale.total * v_program.points_per_currency);

      IF v_points > 0 THEN
        UPDATE public.pos_loyalty_members
        SET
          points_balance = points_balance + v_points,
          lifetime_points = lifetime_points + v_points
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
          'earn',
          v_points,
          v_member.points_balance,
          'Puntos por compra ' || v_sale.sale_number,
          p_user_id
        );
      ELSE
        v_loyalty_balance := v_member.points_balance;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', v_sale.id,
    'sale_number', v_sale.sale_number,
    'subtotal', v_sale.subtotal,
    'discount_total', v_sale.discount_total,
    'tax_total', v_sale.tax_total,
    'total', v_sale.total,
    'currency', v_sale.currency,
    'payment_applied', v_payment_total,
    'payment_received', v_tendered_total,
    'change_due', v_change_total,
    'points_earned', v_points,
    'points_redeemed', v_points_redeemed,
    'loyalty_discount', round(v_loyalty_discount_total, 2),
    'redemption_id', v_redemption_id,
    'reward_id', v_response_reward_id,
    'loyalty_balance', v_loyalty_balance,
    'idempotent_replay', false,
    'sold_at', v_sale.sold_at
  );
END;
$function$;

REVOKE ALL
ON FUNCTION public.pos_complete_sale_v2(
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb,
  text,
  uuid,
  uuid,
  uuid
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.pos_complete_sale_v2(
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb,
  text,
  uuid,
  uuid,
  uuid
)
FROM anon;

REVOKE ALL
ON FUNCTION public.pos_complete_sale_v2(
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb,
  text,
  uuid,
  uuid,
  uuid
)
FROM authenticated;

GRANT EXECUTE
ON FUNCTION public.pos_complete_sale_v2(
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  jsonb,
  jsonb,
  text,
  uuid,
  uuid,
  uuid
)
TO service_role;

COMMIT;
