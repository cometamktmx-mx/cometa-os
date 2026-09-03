-- SPLIT PAYMENTS V1 -- portable rollback integration suite
--
-- This script discovers an eligible existing POS fixture. It never creates a
-- brand, user, membership, catalog item, or cash session. Test writes are
-- contained by the outer transaction and the final ROLLBACK.
-- Result-grid coverage markers: PASS 01, PASS 02, PASS 03, PASS 04,
-- PASS 05, PASS 06, PASS 07, PASS 08, PASS 09, PASS 10, PASS 11, PASS 12.
--
-- Run when the selected open session is not in use by a cashier. Case 12 also
-- exercises the close RPC inside a PL/pgSQL subtransaction and verifies that
-- its status and financial fields are restored before the outer ROLLBACK.

BEGIN;

-- Session-local only; the final ROLLBACK removes this table and every test row.
CREATE TEMP TABLE pos_split_payments_v1_results (
  test_order integer NOT NULL,
  test_number text NOT NULL,
  test_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('PASS', 'FAIL', 'SKIPPED')),
  expected text NOT NULL,
  actual text NOT NULL,
  notes text NOT NULL
);

DO $split_payments_v1$
DECLARE
  v_brand_slug text;
  v_location_id uuid;
  v_register_id uuid;
  v_session_id uuid;
  v_opening_amount numeric(14,2);
  v_user_id uuid;
  v_variant_id uuid;
  v_total numeric(14,2);
  v_cash_amount numeric(14,2);
  v_card_amount numeric(14,2);
  v_transfer_amount numeric(14,2);
  v_result jsonb;
  v_replay jsonb;
  v_sale_id uuid;
  v_idempotency_key uuid;
  v_payment_tendered numeric(14,2);
  v_payment_change numeric(14,2);
  v_cash_before numeric(14,2);
  v_cash_after numeric(14,2);
  v_close_result jsonb;
  v_expected_cash numeric(14,2);
  v_sale_count integer;
  v_fixture_reason text;
  v_rejection_message text;
  v_session_status_before text;
  v_session_status_after text;
  v_expected_cash_before numeric(14,2);
  v_expected_cash_after numeric(14,2);
  v_counted_cash_before numeric(14,2);
  v_counted_cash_after numeric(14,2);
  v_difference_before numeric(14,2);
  v_difference_after numeric(14,2);
BEGIN
  -- One deterministic query selects a coherent fixture only when every
  -- prerequisite is present for the same active brand and open session.
  WITH eligible_fixture AS (
    SELECT
      brand.slug AS brand_slug,
      location.id AS location_id,
      register.id AS register_id,
      session.id AS session_id,
      session.opening_amount,
      access.user_id,
      fixture_variant.variant_id,
      fixture_variant.total
    FROM public.brands brand
    JOIN public.pos_cash_sessions session
      ON session.brand_slug = brand.slug
     AND session.status = 'open'
    JOIN public.pos_locations location
      ON location.id = session.location_id
     AND location.brand_slug = brand.slug
     AND location.active = true
    JOIN public.pos_registers register
      ON register.id = session.register_id
     AND register.location_id = location.id
     AND register.brand_slug = brand.slug
     AND register.status = 'available'
    JOIN public.user_brand_access access
      ON access.brand_slug = brand.slug
     AND access.status = 'active'
    JOIN auth.users fixture_user
      ON fixture_user.id = access.user_id
    JOIN LATERAL (
      SELECT
        variant.id AS variant_id,
        round(
          CASE
            WHEN COALESCE(location.prices_include_tax, true)
              THEN variant.price
            ELSE variant.price + (variant.price * product.tax_rate / 100)
          END,
          2
        ) AS total
      FROM public.pos_product_variants variant
      JOIN public.pos_products product
        ON product.id = variant.product_id
       AND product.brand_slug = brand.slug
      LEFT JOIN public.pos_inventory inventory
        ON inventory.location_id = location.id
       AND inventory.variant_id = variant.id
       AND inventory.brand_slug = brand.slug
      WHERE variant.brand_slug = brand.slug
        AND variant.active = true
        AND product.active = true
        AND variant.price > 0
        AND (
          COALESCE(product.track_inventory, false) = false
          OR (
            COALESCE(inventory.quantity, 0)
            - COALESCE(inventory.reserved_quantity, 0)
          ) >= 1
        )
        AND round(
          CASE
            WHEN COALESCE(location.prices_include_tax, true)
              THEN variant.price
            ELSE variant.price + (variant.price * product.tax_rate / 100)
          END,
          2
        ) >= 3
      ORDER BY
        COALESCE(product.track_inventory, false),
        variant.price,
        variant.id
      LIMIT 1
    ) fixture_variant ON true
    WHERE brand.status = 'active'
    ORDER BY
      brand.slug,
      session.opened_at,
      session.id,
      access.user_id
    LIMIT 1
  )
  SELECT
    brand_slug,
    location_id,
    register_id,
    session_id,
    opening_amount,
    user_id,
    variant_id,
    total
  INTO
    v_brand_slug,
    v_location_id,
    v_register_id,
    v_session_id,
    v_opening_amount,
    v_user_id,
    v_variant_id,
    v_total
  FROM eligible_fixture;

  IF v_session_id IS NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.brands brand
      JOIN public.user_brand_access access
        ON access.brand_slug = brand.slug
       AND access.status = 'active'
      WHERE brand.status = 'active'
    ) THEN
      v_fixture_reason :=
        'no active brand with an active user_brand_access member';
    ELSIF NOT EXISTS (
      SELECT 1
      FROM public.brands brand
      JOIN public.user_brand_access access
        ON access.brand_slug = brand.slug
       AND access.status = 'active'
      JOIN public.pos_cash_sessions session
        ON session.brand_slug = brand.slug
       AND session.status = 'open'
      JOIN public.pos_locations location
        ON location.id = session.location_id
       AND location.brand_slug = brand.slug
       AND location.active = true
      JOIN public.pos_registers register
        ON register.id = session.register_id
       AND register.location_id = location.id
       AND register.brand_slug = brand.slug
       AND register.status = 'available'
      WHERE brand.status = 'active'
    ) THEN
      v_fixture_reason :=
        'no active member has a coherent open cash session, location, and available register';
    ELSE
      v_fixture_reason :=
        'no coherent fixture has a sellable variant with final total >= 3.00 and available stock';
    END IF;

    INSERT INTO pos_split_payments_v1_results (
      test_order, test_number, test_name, status, expected, actual, notes
    ) VALUES (
      0,
      'FIXTURE',
      'Fixture discovery',
      'SKIPPED',
      'active brand + active member + open session + sellable variant',
      'SKIPPED: no safe fixture available',
      v_fixture_reason
    );

    INSERT INTO pos_split_payments_v1_results (
      test_order, test_number, test_name, status, expected, actual, notes
    )
    SELECT
      test_number::integer,
      lpad(test_number::text, 2, '0'),
      test_name,
      'SKIPPED',
      'eligible fixture',
      'not executed',
      v_fixture_reason
    FROM (VALUES
      (1, 'cash simple'),
      (2, 'card simple'),
      (3, 'cash + card'),
      (4, 'cash + card + transfer'),
      (5, 'cash with change'),
      (6, 'two cash components'),
      (7, 'underpayment by 0.01 rejected'),
      (8, 'overpayment by 0.01 rejected'),
      (9, 'cash tender below applied rejected'),
      (10, 'non-cash tender normalization'),
      (11, 'idempotency replay'),
      (12, 'cash session split impact')
    ) AS cases(test_number, test_name);

    RETURN;
  END IF;

  INSERT INTO pos_split_payments_v1_results (
    test_order, test_number, test_name, status, expected, actual, notes
  ) VALUES (
    0,
    'FIXTURE',
    'Fixture discovery',
    'PASS',
    'coherent existing POS context',
    format(
      'fixture_brand_slug=%s; fixture_location_id=%s; fixture_register_id=%s; fixture_cash_session_id=%s; fixture_variant_id=%s',
      v_brand_slug,
      v_location_id,
      v_register_id,
      v_session_id,
      v_variant_id
    ),
    'No user identifier or personal data is displayed.'
  );

  SELECT
    status,
    expected_cash,
    counted_cash,
    difference
  INTO
    v_session_status_before,
    v_expected_cash_before,
    v_counted_cash_before,
    v_difference_before
  FROM public.pos_cash_sessions
  WHERE id = v_session_id;

  v_cash_amount := round(v_total / 3, 2);
  v_card_amount := round((v_total - v_cash_amount) / 2, 2);
  v_transfer_amount := round(
    v_total - v_cash_amount - v_card_amount,
    2
  );

  IF v_cash_amount <= 0 OR v_card_amount <= 0 OR v_transfer_amount <= 0 THEN
    INSERT INTO pos_split_payments_v1_results (
      test_order, test_number, test_name, status, expected, actual, notes
    )
    SELECT
      test_number::integer,
      lpad(test_number::text, 2, '0'),
      test_name,
      'SKIPPED',
      'three positive payment components',
      format('fixture total=%s', v_total),
      'Fixture total cannot produce the required split.'
    FROM (VALUES
      (1, 'cash simple'),
      (2, 'card simple'),
      (3, 'cash + card'),
      (4, 'cash + card + transfer'),
      (5, 'cash with change'),
      (6, 'two cash components'),
      (7, 'underpayment by 0.01 rejected'),
      (8, 'overpayment by 0.01 rejected'),
      (9, 'cash tender below applied rejected'),
      (10, 'non-cash tender normalization'),
      (11, 'idempotency replay'),
      (12, 'cash session split impact')
    ) AS cases(test_number, test_name);

    RETURN;
  END IF;

  -- 01. 100% cash.
  BEGIN
    SELECT public.pos_complete_sale_v4(
      v_brand_slug, v_location_id, v_register_id, v_session_id, NULL,
      jsonb_build_array(jsonb_build_object('variant_id', v_variant_id, 'quantity', 1, 'discount_amount', 0)),
      jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', v_total, 'tendered_amount', v_total)),
      'SPLIT PAYMENTS V1 rollback suite: cash simple', v_user_id, NULL,
      gen_random_uuid(), NULL
    ) INTO v_result;

    IF round((v_result ->> 'payment_applied')::numeric, 2) = v_total
       AND round((v_result ->> 'payment_received')::numeric, 2) = v_total
       AND round((v_result ->> 'change_due')::numeric, 2) = 0 THEN
      INSERT INTO pos_split_payments_v1_results VALUES (1, '01', 'cash simple', 'PASS', 'applied=total; change=0', v_result::text, '');
    ELSE
      INSERT INTO pos_split_payments_v1_results VALUES (1, '01', 'cash simple', 'FAIL', 'applied=total; change=0', v_result::text, 'Unexpected V4 summary.');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO pos_split_payments_v1_results VALUES (1, '01', 'cash simple', 'FAIL', 'V4 accepts one cash payment', SQLERRM, 'RPC error.');
  END;

  -- 02. 100% card.
  BEGIN
    SELECT public.pos_complete_sale_v4(
      v_brand_slug, v_location_id, v_register_id, v_session_id, NULL,
      jsonb_build_array(jsonb_build_object('variant_id', v_variant_id, 'quantity', 1, 'discount_amount', 0)),
      jsonb_build_array(jsonb_build_object('method', 'card', 'amount', v_total, 'reference', 'rollback-card')),
      'SPLIT PAYMENTS V1 rollback suite: card simple', v_user_id, NULL,
      gen_random_uuid(), NULL
    ) INTO v_result;

    IF round((v_result ->> 'payment_applied')::numeric, 2) = v_total
       AND round((v_result ->> 'change_due')::numeric, 2) = 0 THEN
      INSERT INTO pos_split_payments_v1_results VALUES (2, '02', 'card simple', 'PASS', 'applied=total; change=0', v_result::text, '');
    ELSE
      INSERT INTO pos_split_payments_v1_results VALUES (2, '02', 'card simple', 'FAIL', 'applied=total; change=0', v_result::text, 'Unexpected V4 summary.');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO pos_split_payments_v1_results VALUES (2, '02', 'card simple', 'FAIL', 'V4 accepts one card payment', SQLERRM, 'RPC error.');
  END;

  -- 03. Cash + card.
  BEGIN
    SELECT public.pos_complete_sale_v4(
      v_brand_slug, v_location_id, v_register_id, v_session_id, NULL,
      jsonb_build_array(jsonb_build_object('variant_id', v_variant_id, 'quantity', 1, 'discount_amount', 0)),
      jsonb_build_array(
        jsonb_build_object('method', 'cash', 'amount', v_cash_amount, 'tendered_amount', v_cash_amount),
        jsonb_build_object('method', 'card', 'amount', round(v_total - v_cash_amount, 2), 'reference', 'rollback-card-split')
      ),
      'SPLIT PAYMENTS V1 rollback suite: cash card', v_user_id, NULL,
      gen_random_uuid(), NULL
    ) INTO v_result;

    IF round((v_result ->> 'payment_applied')::numeric, 2) = v_total THEN
      INSERT INTO pos_split_payments_v1_results VALUES (3, '03', 'cash + card', 'PASS', 'applied=total', v_result::text, '');
    ELSE
      INSERT INTO pos_split_payments_v1_results VALUES (3, '03', 'cash + card', 'FAIL', 'applied=total', v_result::text, 'Unexpected V4 summary.');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO pos_split_payments_v1_results VALUES (3, '03', 'cash + card', 'FAIL', 'V4 accepts two payment rows', SQLERRM, 'RPC error.');
  END;

  -- 04. Cash + card + transfer.
  BEGIN
    SELECT public.pos_complete_sale_v4(
      v_brand_slug, v_location_id, v_register_id, v_session_id, NULL,
      jsonb_build_array(jsonb_build_object('variant_id', v_variant_id, 'quantity', 1, 'discount_amount', 0)),
      jsonb_build_array(
        jsonb_build_object('method', 'cash', 'amount', v_cash_amount, 'tendered_amount', v_cash_amount),
        jsonb_build_object('method', 'card', 'amount', v_card_amount, 'reference', 'rollback-card-three'),
        jsonb_build_object('method', 'transfer', 'amount', v_transfer_amount, 'reference', 'rollback-transfer-three')
      ),
      'SPLIT PAYMENTS V1 rollback suite: three methods', v_user_id, NULL,
      gen_random_uuid(), NULL
    ) INTO v_result;

    IF round((v_result ->> 'payment_applied')::numeric, 2) = v_total THEN
      INSERT INTO pos_split_payments_v1_results VALUES (4, '04', 'cash + card + transfer', 'PASS', 'applied=total', v_result::text, '');
    ELSE
      INSERT INTO pos_split_payments_v1_results VALUES (4, '04', 'cash + card + transfer', 'FAIL', 'applied=total', v_result::text, 'Unexpected V4 summary.');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO pos_split_payments_v1_results VALUES (4, '04', 'cash + card + transfer', 'FAIL', 'V4 accepts three payment rows', SQLERRM, 'RPC error.');
  END;

  -- 05. Cash with change: tendered is not applied revenue.
  BEGIN
    SELECT public.pos_complete_sale_v4(
      v_brand_slug, v_location_id, v_register_id, v_session_id, NULL,
      jsonb_build_array(jsonb_build_object('variant_id', v_variant_id, 'quantity', 1, 'discount_amount', 0)),
      jsonb_build_array(jsonb_build_object(
        'method', 'cash', 'amount', v_total, 'tendered_amount', v_total + 1
      )),
      'SPLIT PAYMENTS V1 rollback suite: cash change', v_user_id, NULL,
      gen_random_uuid(), NULL
    ) INTO v_result;

    IF round((v_result ->> 'payment_applied')::numeric, 2) = v_total
       AND round((v_result ->> 'payment_received')::numeric, 2) = v_total + 1
       AND round((v_result ->> 'change_due')::numeric, 2) = 1 THEN
      INSERT INTO pos_split_payments_v1_results VALUES (5, '05', 'cash with change', 'PASS', 'applied=total; received=total+1; change=1', v_result::text, '');
    ELSE
      INSERT INTO pos_split_payments_v1_results VALUES (5, '05', 'cash with change', 'FAIL', 'applied=total; received=total+1; change=1', v_result::text, 'Unexpected V4 summary.');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO pos_split_payments_v1_results VALUES (5, '05', 'cash with change', 'FAIL', 'V4 computes change from cash tendered', SQLERRM, 'RPC error.');
  END;

  -- 06. Two independent cash components are allowed.
  BEGIN
    SELECT public.pos_complete_sale_v4(
      v_brand_slug, v_location_id, v_register_id, v_session_id, NULL,
      jsonb_build_array(jsonb_build_object('variant_id', v_variant_id, 'quantity', 1, 'discount_amount', 0)),
      jsonb_build_array(
        jsonb_build_object('method', 'cash', 'amount', v_cash_amount, 'tendered_amount', v_cash_amount),
        jsonb_build_object('method', 'cash', 'amount', v_card_amount, 'tendered_amount', v_card_amount),
        jsonb_build_object('method', 'card', 'amount', v_transfer_amount, 'reference', 'rollback-card-two-cash')
      ),
      'SPLIT PAYMENTS V1 rollback suite: two cash', v_user_id, NULL,
      gen_random_uuid(), NULL
    ) INTO v_result;

    v_sale_id := (v_result ->> 'id')::uuid;
    IF (
      SELECT count(*)
      FROM public.pos_payments
      WHERE sale_id = v_sale_id
        AND payment_method = 'cash'
    ) = 2 THEN
      INSERT INTO pos_split_payments_v1_results VALUES (6, '06', 'two cash components', 'PASS', 'two cash payment rows', 'cash_rows=2', '');
    ELSE
      INSERT INTO pos_split_payments_v1_results VALUES (6, '06', 'two cash components', 'FAIL', 'two cash payment rows', 'cash_rows not equal to 2', 'Unexpected payment persistence.');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO pos_split_payments_v1_results VALUES (6, '06', 'two cash components', 'FAIL', 'two cash payment rows', SQLERRM, 'RPC or query error.');
  END;

  -- 07. One cent under must be rejected.
  v_rejection_message := NULL;
  BEGIN
    PERFORM public.pos_complete_sale_v4(
      v_brand_slug, v_location_id, v_register_id, v_session_id, NULL,
      jsonb_build_array(jsonb_build_object('variant_id', v_variant_id, 'quantity', 1, 'discount_amount', 0)),
      jsonb_build_array(jsonb_build_object('method', 'card', 'amount', v_total - 0.01)),
      'SPLIT PAYMENTS V1 rollback suite: under by one cent', v_user_id, NULL,
      gen_random_uuid(), NULL
    );
    v_rejection_message := 'accepted';
  EXCEPTION WHEN OTHERS THEN
    v_rejection_message := SQLERRM;
  END;

  IF lower(v_rejection_message) LIKE '%no cubren el total%' THEN
    INSERT INTO pos_split_payments_v1_results VALUES (7, '07', 'underpayment by 0.01 rejected', 'PASS', 'rejection for total minus 0.01', v_rejection_message, '');
  ELSE
    INSERT INTO pos_split_payments_v1_results VALUES (7, '07', 'underpayment by 0.01 rejected', 'FAIL', 'rejection for total minus 0.01', v_rejection_message, 'Wrong result or rejection.');
  END IF;

  -- 08. One cent over must be rejected.
  v_rejection_message := NULL;
  BEGIN
    PERFORM public.pos_complete_sale_v4(
      v_brand_slug, v_location_id, v_register_id, v_session_id, NULL,
      jsonb_build_array(jsonb_build_object('variant_id', v_variant_id, 'quantity', 1, 'discount_amount', 0)),
      jsonb_build_array(jsonb_build_object('method', 'card', 'amount', v_total + 0.01)),
      'SPLIT PAYMENTS V1 rollback suite: over by one cent', v_user_id, NULL,
      gen_random_uuid(), NULL
    );
    v_rejection_message := 'accepted';
  EXCEPTION WHEN OTHERS THEN
    v_rejection_message := SQLERRM;
  END;

  IF lower(v_rejection_message) LIKE '%superan el total%' THEN
    INSERT INTO pos_split_payments_v1_results VALUES (8, '08', 'overpayment by 0.01 rejected', 'PASS', 'rejection for total plus 0.01', v_rejection_message, '');
  ELSE
    INSERT INTO pos_split_payments_v1_results VALUES (8, '08', 'overpayment by 0.01 rejected', 'FAIL', 'rejection for total plus 0.01', v_rejection_message, 'Wrong result or rejection.');
  END IF;

  -- 09. Cash tendered below its applied amount must be rejected.
  v_rejection_message := NULL;
  BEGIN
    PERFORM public.pos_complete_sale_v4(
      v_brand_slug, v_location_id, v_register_id, v_session_id, NULL,
      jsonb_build_array(jsonb_build_object('variant_id', v_variant_id, 'quantity', 1, 'discount_amount', 0)),
      jsonb_build_array(jsonb_build_object(
        'method', 'cash', 'amount', v_total, 'tendered_amount', v_total - 0.01
      )),
      'SPLIT PAYMENTS V1 rollback suite: cash short', v_user_id, NULL,
      gen_random_uuid(), NULL
    );
    v_rejection_message := 'accepted';
  EXCEPTION WHEN OTHERS THEN
    v_rejection_message := SQLERRM;
  END;

  IF lower(v_rejection_message) LIKE '%no cubre el monto aplicado%' THEN
    INSERT INTO pos_split_payments_v1_results VALUES (9, '09', 'cash tender below applied rejected', 'PASS', 'cash tender below applied is rejected', v_rejection_message, '');
  ELSE
    INSERT INTO pos_split_payments_v1_results VALUES (9, '09', 'cash tender below applied rejected', 'FAIL', 'cash tender below applied is rejected', v_rejection_message, 'Wrong result or rejection.');
  END IF;

  -- 10. Non-cash tendered amount is normalized by V4, never change.
  BEGIN
    SELECT public.pos_complete_sale_v4(
      v_brand_slug, v_location_id, v_register_id, v_session_id, NULL,
      jsonb_build_array(jsonb_build_object('variant_id', v_variant_id, 'quantity', 1, 'discount_amount', 0)),
      jsonb_build_array(jsonb_build_object(
        'method', 'card', 'amount', v_total, 'tendered_amount', v_total + 10
      )),
      'SPLIT PAYMENTS V1 rollback suite: card tender normalization', v_user_id, NULL,
      gen_random_uuid(), NULL
    ) INTO v_result;

    v_sale_id := (v_result ->> 'id')::uuid;
    SELECT tendered_amount, change_amount
    INTO v_payment_tendered, v_payment_change
    FROM public.pos_payments
    WHERE sale_id = v_sale_id;

    IF round(v_payment_tendered, 2) = v_total
       AND round(v_payment_change, 2) = 0 THEN
      INSERT INTO pos_split_payments_v1_results VALUES (10, '10', 'non-cash tender normalization', 'PASS', 'tendered=amount; change=0', format('tendered=%s; change=%s', v_payment_tendered, v_payment_change), '');
    ELSE
      INSERT INTO pos_split_payments_v1_results VALUES (10, '10', 'non-cash tender normalization', 'FAIL', 'tendered=amount; change=0', format('tendered=%s; change=%s', v_payment_tendered, v_payment_change), 'Unexpected stored values.');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO pos_split_payments_v1_results VALUES (10, '10', 'non-cash tender normalization', 'FAIL', 'tendered=amount; change=0', SQLERRM, 'RPC or query error.');
  END;

  -- 11. Same idempotency key replays the original sale without a second sale.
  BEGIN
    v_idempotency_key := gen_random_uuid();
    SELECT public.pos_complete_sale_v4(
      v_brand_slug, v_location_id, v_register_id, v_session_id, NULL,
      jsonb_build_array(jsonb_build_object('variant_id', v_variant_id, 'quantity', 1, 'discount_amount', 0)),
      jsonb_build_array(jsonb_build_object('method', 'card', 'amount', v_total, 'reference', 'rollback-idempotency')),
      'SPLIT PAYMENTS V1 rollback suite: idempotency', v_user_id, NULL,
      v_idempotency_key, NULL
    ) INTO v_result;

    SELECT public.pos_complete_sale_v4(
      v_brand_slug, v_location_id, v_register_id, v_session_id, NULL,
      jsonb_build_array(jsonb_build_object('variant_id', v_variant_id, 'quantity', 1, 'discount_amount', 0)),
      jsonb_build_array(jsonb_build_object('method', 'card', 'amount', v_total, 'reference', 'rollback-idempotency')),
      'SPLIT PAYMENTS V1 rollback suite: idempotency', v_user_id, NULL,
      v_idempotency_key, NULL
    ) INTO v_replay;

    SELECT count(*)
    INTO v_sale_count
    FROM public.pos_sales
    WHERE brand_slug = v_brand_slug
      AND idempotency_key = v_idempotency_key;

    IF (v_result ->> 'id') IS NOT DISTINCT FROM (v_replay ->> 'id')
       AND COALESCE((v_replay ->> 'idempotent_replay')::boolean, false) = true
       AND v_sale_count = 1 THEN
      INSERT INTO pos_split_payments_v1_results VALUES (11, '11', 'idempotency replay', 'PASS', 'same sale id; one sale row; replay=true', v_replay::text, '');
    ELSE
      INSERT INTO pos_split_payments_v1_results VALUES (11, '11', 'idempotency replay', 'FAIL', 'same sale id; one sale row; replay=true', format('first=%s; replay=%s; sales=%s', v_result, v_replay, v_sale_count), 'Unexpected replay result.');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO pos_split_payments_v1_results VALUES (11, '11', 'idempotency replay', 'FAIL', 'same sale id; one sale row; replay=true', SQLERRM, 'RPC or query error.');
  END;

  -- 12. Close RPC integration is contained in a subtransaction. The sentinel
  -- forces its writes to roll back before the result is recorded.
  BEGIN
    SELECT COALESCE(sum(payment.amount), 0)
    INTO v_cash_before
    FROM public.pos_payments payment
    JOIN public.pos_sales sale
      ON sale.id = payment.sale_id
    WHERE sale.cash_session_id = v_session_id
      AND payment.payment_method = 'cash';

    SELECT public.pos_complete_sale_v4(
      v_brand_slug, v_location_id, v_register_id, v_session_id, NULL,
      jsonb_build_array(jsonb_build_object('variant_id', v_variant_id, 'quantity', 1, 'discount_amount', 0)),
      jsonb_build_array(
        jsonb_build_object('method', 'cash', 'amount', v_cash_amount, 'tendered_amount', v_cash_amount + 1),
        jsonb_build_object('method', 'card', 'amount', v_card_amount, 'reference', 'rollback-cash-close-card'),
        jsonb_build_object('method', 'transfer', 'amount', v_transfer_amount, 'reference', 'rollback-cash-close-transfer')
      ),
      'SPLIT PAYMENTS V1 rollback suite: cash close split', v_user_id, NULL,
      gen_random_uuid(), NULL
    ) INTO v_result;

    SELECT COALESCE(sum(payment.amount), 0)
    INTO v_cash_after
    FROM public.pos_payments payment
    JOIN public.pos_sales sale
      ON sale.id = payment.sale_id
    WHERE sale.cash_session_id = v_session_id
      AND payment.payment_method = 'cash';

    IF round(v_cash_after - v_cash_before, 2) <> v_cash_amount THEN
      RAISE EXCEPTION 'cash increment %, expected %',
        v_cash_after - v_cash_before,
        v_cash_amount;
    END IF;

    SELECT to_jsonb(close_result)
    INTO v_close_result
    FROM public.pos_close_cash_session(
      p_brand_slug := v_brand_slug,
      p_session_id := v_session_id,
      p_counted_cash := 0,
      p_user_id := v_user_id,
      p_notes := 'SPLIT PAYMENTS V1 rollback suite: close verification'
    ) AS close_result
    LIMIT 1;

    v_expected_cash := (v_close_result ->> 'expected_cash')::numeric;

    IF v_expected_cash IS NULL
       OR round(v_expected_cash, 2) <> round(v_opening_amount + v_cash_after, 2) THEN
      RAISE EXCEPTION 'close expected cash %, expected opening % + cash payments %',
        v_expected_cash,
        v_opening_amount,
        v_cash_after;
    END IF;

    RAISE EXCEPTION 'SPLIT_V1_CLOSE_ROLLBACK_SENTINEL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'SPLIT_V1_CLOSE_ROLLBACK_SENTINEL' THEN
      SELECT
        status,
        expected_cash,
        counted_cash,
        difference
      INTO
        v_session_status_after,
        v_expected_cash_after,
        v_counted_cash_after,
        v_difference_after
      FROM public.pos_cash_sessions
      WHERE id = v_session_id;

      IF v_session_status_after IS NOT DISTINCT FROM v_session_status_before
         AND v_expected_cash_after IS NOT DISTINCT FROM v_expected_cash_before
         AND v_counted_cash_after IS NOT DISTINCT FROM v_counted_cash_before
         AND v_difference_after IS NOT DISTINCT FROM v_difference_before THEN
        INSERT INTO pos_split_payments_v1_results VALUES (12, '12', 'cash session split impact', 'PASS', 'cash increment only; close expected cash; close rollback restores session', format('cash_increment=%s; expected_cash=%s', v_cash_amount, v_expected_cash), 'Close RPC changes were rolled back inside the subtransaction.');
      ELSE
        INSERT INTO pos_split_payments_v1_results VALUES (12, '12', 'cash session split impact', 'FAIL', 'session fields restored after close subtransaction rollback', format('before=(%s,%s,%s,%s); after=(%s,%s,%s,%s)', v_session_status_before, v_expected_cash_before, v_counted_cash_before, v_difference_before, v_session_status_after, v_expected_cash_after, v_counted_cash_after, v_difference_after), 'Rollback verification failed. Outer ROLLBACK still follows.');
      END IF;
    ELSE
      INSERT INTO pos_split_payments_v1_results VALUES (12, '12', 'cash session split impact', 'FAIL', 'cash amount only affects expected cash', SQLERRM, 'Close RPC integration failed; subtransaction rolled back.');
    END IF;
  END;
END;
$split_payments_v1$;

WITH counts AS (
  SELECT
    count(*) FILTER (WHERE status = 'PASS') AS passed_count,
    count(*) FILTER (WHERE status = 'FAIL') AS failed_count,
    count(*) FILTER (WHERE status = 'SKIPPED') AS skipped_count
  FROM pos_split_payments_v1_results
  WHERE test_order BETWEEN 1 AND 12
), output_rows AS (
  SELECT
    test_order,
    test_number,
    test_name,
    status,
    expected,
    actual,
    notes
  FROM pos_split_payments_v1_results

  UNION ALL

  SELECT
    999,
    'TOTAL',
    'Suite totals',
    CASE
      WHEN failed_count > 0 THEN 'FAIL'
      WHEN skipped_count > 0 THEN 'SKIPPED'
      ELSE 'PASS'
    END,
    format('passed_count=%s', passed_count),
    format('failed_count=%s', failed_count),
    format('skipped_count=%s', skipped_count)
  FROM counts
)
SELECT
  test_number,
  test_name,
  status,
  expected,
  actual,
  notes
FROM output_rows
ORDER BY test_order;

ROLLBACK;
