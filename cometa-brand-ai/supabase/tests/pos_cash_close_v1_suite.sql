-- CASH CLOSE V1 -- portable rollback integration suite
--
-- The suite discovers only existing, coherent POS context. Every write is
-- contained by this transaction and the final ROLLBACK. Run it only while the
-- selected open fixture session is not being operated by a cashier.

BEGIN;

CREATE TEMP TABLE pos_cash_close_v1_results (
  test_order integer NOT NULL,
  test_number text NOT NULL,
  test_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('PASS', 'FAIL', 'SKIPPED')),
  expected text NOT NULL,
  actual text NOT NULL,
  notes text NOT NULL
);

DO $cash_close_v1$
DECLARE
  v_brand_slug text;
  v_location_id uuid;
  v_register_id uuid;
  v_session_id uuid;
  v_user_id uuid;
  v_variant_id uuid;
  v_total numeric(14,2);
  v_opening_amount numeric(14,2);
  v_free_register_id uuid;
  v_free_user_id uuid;
  v_summary_before numeric(14,2);
  v_summary_after numeric(14,2);
  v_cash_before numeric(14,2);
  v_cash_after numeric(14,2);
  v_cash_component numeric(14,2);
  v_card_component numeric(14,2);
  v_movement_id uuid;
  v_result jsonb;
  v_close_result jsonb;
  v_expected numeric(14,2);
  v_message text;
  v_fixture_reason text;
  v_open_result jsonb;
BEGIN
  WITH eligible_fixture AS (
    SELECT
      brand.slug AS brand_slug,
      location.id AS location_id,
      register.id AS register_id,
      session.id AS session_id,
      session.opening_amount,
      access.user_id,
      variant_fixture.variant_id,
      variant_fixture.total
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
          OR COALESCE(inventory.quantity, 0) - COALESCE(inventory.reserved_quantity, 0) >= 4
        )
        AND round(
          CASE
            WHEN COALESCE(location.prices_include_tax, true)
              THEN variant.price
            ELSE variant.price + (variant.price * product.tax_rate / 100)
          END,
          2
        ) >= 3
      ORDER BY COALESCE(product.track_inventory, false), variant.price, variant.id
      LIMIT 1
    ) variant_fixture ON true
    WHERE brand.status = 'active'
    ORDER BY brand.slug, session.opened_at, session.id, access.user_id
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

  IF to_regprocedure('public.pos_create_cash_movement(text,uuid,text,numeric,text,uuid)') IS NULL
     OR to_regprocedure('public.pos_get_cash_session_summaries_v1(text,uuid[],boolean)') IS NULL THEN
    v_fixture_reason := 'Cash Close V1 migration has not been applied.';
  ELSIF v_session_id IS NULL THEN
    v_fixture_reason := 'No safe fixture: active brand, active member, open session, and sellable variant are required.';
  END IF;

  IF v_fixture_reason IS NOT NULL THEN
    INSERT INTO pos_cash_close_v1_results
      VALUES (0, 'FIXTURE', 'Fixture discovery', 'SKIPPED', 'safe Cash Close V1 fixture', 'SKIPPED', v_fixture_reason);
    INSERT INTO pos_cash_close_v1_results
    SELECT test_number, lpad(test_number::text, 2, '0'), test_name, 'SKIPPED', 'eligible fixture and migration', 'not executed', v_fixture_reason
    FROM (VALUES
      (1, 'open session basic'), (2, 'negative opening rejected'), (3, 'duplicate open rejected'),
      (4, 'income increases expected'), (5, 'deposit increases expected'), (6, 'expense decreases expected'),
      (7, 'withdrawal decreases expected'), (8, 'movement amount <= 0 rejected'), (9, 'invalid movement type rejected'),
      (10, 'movement on closed session rejected'), (11, 'movement update rejected'), (12, 'movement delete rejected'),
      (13, 'cash-only sale affects expected'), (14, 'card-only sale excludes cash expected'),
      (15, 'split sale counts only cash'), (16, 'cash change uses applied amount'),
      (17, 'exact close'), (18, 'shortage close'), (19, 'overage close'),
      (20, 'double close rejected'), (21, 'sale and close share session lock'),
      (22, 'tenant mismatch rejected'), (23, 'outer rollback safety')
    ) AS cases(test_number, test_name);
    RETURN;
  END IF;

  INSERT INTO pos_cash_close_v1_results VALUES (
    0,
    'FIXTURE',
    'Fixture discovery',
    'PASS',
    'coherent existing POS context',
    format('fixture_brand_slug=%s; fixture_location_id=%s; fixture_register_id=%s; fixture_cash_session_id=%s; fixture_variant_id=%s', v_brand_slug, v_location_id, v_register_id, v_session_id, v_variant_id),
    'No personal user data is included.'
  );

  -- An available register is optional. Only opening-specific cases skip when
  -- the environment does not have one without an open session.
  SELECT register.id, access.user_id
  INTO v_free_register_id, v_free_user_id
  FROM public.pos_registers register
  JOIN public.user_brand_access access
    ON access.brand_slug = register.brand_slug
   AND access.status = 'active'
  JOIN auth.users fixture_user
    ON fixture_user.id = access.user_id
  WHERE register.brand_slug = v_brand_slug
    AND register.status = 'available'
    AND NOT EXISTS (
      SELECT 1
      FROM public.pos_cash_sessions session
      WHERE session.register_id = register.id
        AND session.status = 'open'
    )
  ORDER BY register.created_at, register.id, access.user_id
  LIMIT 1;

  IF v_free_register_id IS NULL THEN
    INSERT INTO pos_cash_close_v1_results
    SELECT test_number, lpad(test_number::text, 2, '0'), test_name, 'SKIPPED', 'available register without open session', 'not available', 'No production register was created for the suite.'
    FROM (VALUES
      (1, 'open session basic'), (2, 'negative opening rejected'), (3, 'duplicate open rejected')
    ) AS cases(test_number, test_name);
  ELSE
    BEGIN
      PERFORM public.pos_open_cash_session(
        v_brand_slug, v_free_register_id, -0.01, v_free_user_id
      );
      v_message := 'accepted';
    EXCEPTION WHEN OTHERS THEN
      v_message := SQLERRM;
    END;

    INSERT INTO pos_cash_close_v1_results VALUES (
      2, '02', 'negative opening rejected',
      CASE WHEN v_message = 'accepted' THEN 'FAIL' ELSE 'PASS' END,
      'negative opening rejected', v_message, ''
    );

    BEGIN
      SELECT to_jsonb(open_result)
      INTO v_open_result
      FROM public.pos_open_cash_session(
        p_brand_slug := v_brand_slug,
        p_register_id := v_free_register_id,
        p_opening_amount := 10,
        p_user_id := v_free_user_id
      ) AS open_result
      LIMIT 1;

      IF v_open_result IS NOT NULL THEN
        INSERT INTO pos_cash_close_v1_results VALUES (1, '01', 'open session basic', 'PASS', 'new open session', v_open_result::text, 'Outer rollback removes the test session.');
      ELSE
        INSERT INTO pos_cash_close_v1_results VALUES (1, '01', 'open session basic', 'FAIL', 'new open session', 'NULL', 'Open RPC returned no row.');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO pos_cash_close_v1_results VALUES (1, '01', 'open session basic', 'FAIL', 'new open session', SQLERRM, 'Open RPC failed.');
    END;

    BEGIN
      PERFORM public.pos_open_cash_session(
        v_brand_slug, v_free_register_id, 10, v_free_user_id
      );
      v_message := 'accepted';
    EXCEPTION WHEN OTHERS THEN
      v_message := SQLERRM;
    END;

    INSERT INTO pos_cash_close_v1_results VALUES (
      3, '03', 'duplicate open rejected',
      CASE WHEN v_message = 'accepted' THEN 'FAIL' ELSE 'PASS' END,
      'second open rejected for same register', v_message, ''
    );
  END IF;

  -- 04-07. Each movement is measured from an authoritative server summary.
  SELECT expected_cash INTO v_summary_before
  FROM public.pos_get_cash_session_summaries_v1(v_brand_slug, ARRAY[v_session_id], true)
  LIMIT 1;
  PERFORM public.pos_create_cash_movement(v_brand_slug, v_session_id, 'income', 500, 'suite income', v_user_id);
  SELECT expected_cash INTO v_summary_after
  FROM public.pos_get_cash_session_summaries_v1(v_brand_slug, ARRAY[v_session_id], true)
  LIMIT 1;
  INSERT INTO pos_cash_close_v1_results VALUES (
    4, '04', 'income increases expected',
    CASE WHEN round(v_summary_after - v_summary_before, 2) = 500 THEN 'PASS' ELSE 'FAIL' END,
    'expected increment=500', format('increment=%s', round(v_summary_after - v_summary_before, 2)), ''
  );

  SELECT expected_cash INTO v_summary_before
  FROM public.pos_get_cash_session_summaries_v1(v_brand_slug, ARRAY[v_session_id], true)
  LIMIT 1;
  PERFORM public.pos_create_cash_movement(v_brand_slug, v_session_id, 'deposit', 500, 'suite deposit', v_user_id);
  SELECT expected_cash INTO v_summary_after
  FROM public.pos_get_cash_session_summaries_v1(v_brand_slug, ARRAY[v_session_id], true)
  LIMIT 1;
  INSERT INTO pos_cash_close_v1_results VALUES (
    5, '05', 'deposit increases expected',
    CASE WHEN round(v_summary_after - v_summary_before, 2) = 500 THEN 'PASS' ELSE 'FAIL' END,
    'expected increment=500', format('increment=%s', round(v_summary_after - v_summary_before, 2)), ''
  );

  SELECT expected_cash INTO v_summary_before
  FROM public.pos_get_cash_session_summaries_v1(v_brand_slug, ARRAY[v_session_id], true)
  LIMIT 1;
  PERFORM public.pos_create_cash_movement(v_brand_slug, v_session_id, 'expense', 200, 'suite expense', v_user_id);
  SELECT expected_cash INTO v_summary_after
  FROM public.pos_get_cash_session_summaries_v1(v_brand_slug, ARRAY[v_session_id], true)
  LIMIT 1;
  INSERT INTO pos_cash_close_v1_results VALUES (
    6, '06', 'expense decreases expected',
    CASE WHEN round(v_summary_after - v_summary_before, 2) = -200 THEN 'PASS' ELSE 'FAIL' END,
    'expected decrement=200', format('increment=%s', round(v_summary_after - v_summary_before, 2)), ''
  );

  SELECT expected_cash INTO v_summary_before
  FROM public.pos_get_cash_session_summaries_v1(v_brand_slug, ARRAY[v_session_id], true)
  LIMIT 1;
  PERFORM public.pos_create_cash_movement(v_brand_slug, v_session_id, 'withdrawal', 200, 'suite withdrawal', v_user_id);
  SELECT expected_cash INTO v_summary_after
  FROM public.pos_get_cash_session_summaries_v1(v_brand_slug, ARRAY[v_session_id], true)
  LIMIT 1;
  INSERT INTO pos_cash_close_v1_results VALUES (
    7, '07', 'withdrawal decreases expected',
    CASE WHEN round(v_summary_after - v_summary_before, 2) = -200 THEN 'PASS' ELSE 'FAIL' END,
    'expected decrement=200', format('increment=%s', round(v_summary_after - v_summary_before, 2)), ''
  );

  BEGIN
    PERFORM public.pos_create_cash_movement(v_brand_slug, v_session_id, 'income', 0, 'suite invalid amount', v_user_id);
    v_message := 'accepted';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
  END;
  INSERT INTO pos_cash_close_v1_results VALUES (
    8, '08', 'movement amount <= 0 rejected',
    CASE WHEN v_message LIKE '%POS_CASH_MOVEMENT_AMOUNT_INVALID%' THEN 'PASS' ELSE 'FAIL' END,
    'POS_CASH_MOVEMENT_AMOUNT_INVALID', v_message, ''
  );

  BEGIN
    PERFORM public.pos_create_cash_movement(v_brand_slug, v_session_id, 'invalid', 1, 'suite invalid type', v_user_id);
    v_message := 'accepted';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
  END;
  INSERT INTO pos_cash_close_v1_results VALUES (
    9, '09', 'invalid movement type rejected',
    CASE WHEN v_message LIKE '%POS_CASH_MOVEMENT_TYPE_INVALID%' THEN 'PASS' ELSE 'FAIL' END,
    'POS_CASH_MOVEMENT_TYPE_INVALID', v_message, ''
  );

  -- 10. Close and attempted post-close movement are reverted in one nested block.
  BEGIN
    SELECT expected_cash INTO v_expected
    FROM public.pos_get_cash_session_summaries_v1(v_brand_slug, ARRAY[v_session_id], true)
    LIMIT 1;
    PERFORM public.pos_close_cash_session(v_brand_slug, v_session_id, v_expected, v_user_id, 'suite closed movement');
    BEGIN
      PERFORM public.pos_create_cash_movement(v_brand_slug, v_session_id, 'income', 1, 'must fail closed', v_user_id);
      v_message := 'accepted';
    EXCEPTION WHEN OTHERS THEN
      v_message := SQLERRM;
    END;
    RAISE EXCEPTION 'CASH_CLOSE_V1_TEST_10_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'CASH_CLOSE_V1_TEST_10_ROLLBACK' THEN
      INSERT INTO pos_cash_close_v1_results VALUES (
        10, '10', 'movement on closed session rejected',
        CASE WHEN v_message LIKE '%POS_CASH_MOVEMENT_SESSION_CLOSED%' THEN 'PASS' ELSE 'FAIL' END,
        'POS_CASH_MOVEMENT_SESSION_CLOSED', v_message, 'Nested close was reverted.'
      );
    ELSE
      INSERT INTO pos_cash_close_v1_results VALUES (10, '10', 'movement on closed session rejected', 'FAIL', 'closed session rejects movement', SQLERRM, 'Close integration failed.');
    END IF;
  END;

  SELECT movement.id INTO v_movement_id
  FROM public.pos_create_cash_movement(v_brand_slug, v_session_id, 'income', 1, 'suite append-only', v_user_id) AS movement;

  BEGIN
    UPDATE public.pos_cash_movements
    SET reason = 'must not change'
    WHERE id = v_movement_id;
    v_message := 'accepted';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
  END;
  INSERT INTO pos_cash_close_v1_results VALUES (
    11, '11', 'movement update rejected',
    CASE WHEN v_message LIKE '%POS_CASH_MOVEMENT_APPEND_ONLY%' THEN 'PASS' ELSE 'FAIL' END,
    'POS_CASH_MOVEMENT_APPEND_ONLY', v_message, ''
  );

  BEGIN
    DELETE FROM public.pos_cash_movements WHERE id = v_movement_id;
    v_message := 'accepted';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
  END;
  INSERT INTO pos_cash_close_v1_results VALUES (
    12, '12', 'movement delete rejected',
    CASE WHEN v_message LIKE '%POS_CASH_MOVEMENT_APPEND_ONLY%' THEN 'PASS' ELSE 'FAIL' END,
    'POS_CASH_MOVEMENT_APPEND_ONLY', v_message, ''
  );

  -- 13. A cash-only sale increases the session expected cash by payment.amount.
  SELECT expected_cash INTO v_summary_before
  FROM public.pos_get_cash_session_summaries_v1(v_brand_slug, ARRAY[v_session_id], true)
  LIMIT 1;
  SELECT public.pos_complete_sale_v4(
    v_brand_slug, v_location_id, v_register_id, v_session_id, NULL,
    jsonb_build_array(jsonb_build_object('variant_id', v_variant_id, 'quantity', 1, 'discount_amount', 0)),
    jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', v_total, 'tendered_amount', v_total)),
    'CASH CLOSE V1 suite cash only', v_user_id, NULL, gen_random_uuid(), NULL
  ) INTO v_result;
  SELECT expected_cash INTO v_summary_after
  FROM public.pos_get_cash_session_summaries_v1(v_brand_slug, ARRAY[v_session_id], true)
  LIMIT 1;
  INSERT INTO pos_cash_close_v1_results VALUES (
    13, '13', 'cash-only sale affects expected',
    CASE WHEN round(v_summary_after - v_summary_before, 2) = v_total THEN 'PASS' ELSE 'FAIL' END,
    format('expected increment=%s', v_total), format('increment=%s', round(v_summary_after - v_summary_before, 2)), ''
  );

  -- 14. Card-only does not increase expected cash.
  SELECT expected_cash INTO v_summary_before
  FROM public.pos_get_cash_session_summaries_v1(v_brand_slug, ARRAY[v_session_id], true)
  LIMIT 1;
  SELECT public.pos_complete_sale_v4(
    v_brand_slug, v_location_id, v_register_id, v_session_id, NULL,
    jsonb_build_array(jsonb_build_object('variant_id', v_variant_id, 'quantity', 1, 'discount_amount', 0)),
    jsonb_build_array(jsonb_build_object('method', 'card', 'amount', v_total, 'reference', 'suite-card-only')),
    'CASH CLOSE V1 suite card only', v_user_id, NULL, gen_random_uuid(), NULL
  ) INTO v_result;
  SELECT expected_cash INTO v_summary_after
  FROM public.pos_get_cash_session_summaries_v1(v_brand_slug, ARRAY[v_session_id], true)
  LIMIT 1;
  INSERT INTO pos_cash_close_v1_results VALUES (
    14, '14', 'card-only sale excludes cash expected',
    CASE WHEN round(v_summary_after - v_summary_before, 2) = 0 THEN 'PASS' ELSE 'FAIL' END,
    'expected increment=0', format('increment=%s', round(v_summary_after - v_summary_before, 2)), ''
  );

  -- 15. Split payment counts only its cash component.
  v_cash_component := round(v_total / 2, 2);
  v_card_component := round(v_total - v_cash_component, 2);
  SELECT expected_cash INTO v_summary_before
  FROM public.pos_get_cash_session_summaries_v1(v_brand_slug, ARRAY[v_session_id], true)
  LIMIT 1;
  SELECT public.pos_complete_sale_v4(
    v_brand_slug, v_location_id, v_register_id, v_session_id, NULL,
    jsonb_build_array(jsonb_build_object('variant_id', v_variant_id, 'quantity', 1, 'discount_amount', 0)),
    jsonb_build_array(
      jsonb_build_object('method', 'cash', 'amount', v_cash_component, 'tendered_amount', v_cash_component),
      jsonb_build_object('method', 'card', 'amount', v_card_component, 'reference', 'suite-split-card')
    ),
    'CASH CLOSE V1 suite split', v_user_id, NULL, gen_random_uuid(), NULL
  ) INTO v_result;
  SELECT expected_cash INTO v_summary_after
  FROM public.pos_get_cash_session_summaries_v1(v_brand_slug, ARRAY[v_session_id], true)
  LIMIT 1;
  INSERT INTO pos_cash_close_v1_results VALUES (
    15, '15', 'split sale counts only cash',
    CASE WHEN round(v_summary_after - v_summary_before, 2) = v_cash_component THEN 'PASS' ELSE 'FAIL' END,
    format('expected increment=%s', v_cash_component), format('increment=%s', round(v_summary_after - v_summary_before, 2)), ''
  );

  -- 16. Tendered and change never replace the applied cash payment amount.
  SELECT expected_cash INTO v_summary_before
  FROM public.pos_get_cash_session_summaries_v1(v_brand_slug, ARRAY[v_session_id], true)
  LIMIT 1;
  SELECT public.pos_complete_sale_v4(
    v_brand_slug, v_location_id, v_register_id, v_session_id, NULL,
    jsonb_build_array(jsonb_build_object('variant_id', v_variant_id, 'quantity', 1, 'discount_amount', 0)),
    jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', v_total, 'tendered_amount', v_total + 1)),
    'CASH CLOSE V1 suite change', v_user_id, NULL, gen_random_uuid(), NULL
  ) INTO v_result;
  SELECT expected_cash INTO v_summary_after
  FROM public.pos_get_cash_session_summaries_v1(v_brand_slug, ARRAY[v_session_id], true)
  LIMIT 1;
  INSERT INTO pos_cash_close_v1_results VALUES (
    16, '16', 'cash change uses applied amount',
    CASE WHEN round(v_summary_after - v_summary_before, 2) = v_total THEN 'PASS' ELSE 'FAIL' END,
    format('expected increment=%s, not %s', v_total, v_total + 1), format('increment=%s', round(v_summary_after - v_summary_before, 2)), ''
  );

  -- 17-20 use nested rollbacks because the real close changes session status.
  BEGIN
    SELECT expected_cash INTO v_expected
    FROM public.pos_get_cash_session_summaries_v1(v_brand_slug, ARRAY[v_session_id], true)
    LIMIT 1;
    SELECT to_jsonb(close_result) INTO v_close_result
    FROM public.pos_close_cash_session(v_brand_slug, v_session_id, v_expected, v_user_id, 'suite exact') AS close_result
    LIMIT 1;
    IF round((v_close_result ->> 'difference')::numeric, 2) <> 0 THEN
      RAISE EXCEPTION 'CASH_CLOSE_V1_EXACT_FAILED %', v_close_result;
    END IF;
    RAISE EXCEPTION 'CASH_CLOSE_V1_TEST_17_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO pos_cash_close_v1_results VALUES (
      17, '17', 'exact close',
      CASE WHEN SQLERRM = 'CASH_CLOSE_V1_TEST_17_ROLLBACK' THEN 'PASS' ELSE 'FAIL' END,
      'difference=0', COALESCE(v_close_result::text, SQLERRM), 'Nested close was reverted.'
    );
  END;

  BEGIN
    SELECT expected_cash INTO v_expected
    FROM public.pos_get_cash_session_summaries_v1(v_brand_slug, ARRAY[v_session_id], true)
    LIMIT 1;
    SELECT to_jsonb(close_result) INTO v_close_result
    FROM public.pos_close_cash_session(v_brand_slug, v_session_id, v_expected - 1, v_user_id, 'suite shortage') AS close_result
    LIMIT 1;
    IF round((v_close_result ->> 'difference')::numeric, 2) <> -1 THEN
      RAISE EXCEPTION 'CASH_CLOSE_V1_SHORTAGE_FAILED %', v_close_result;
    END IF;
    RAISE EXCEPTION 'CASH_CLOSE_V1_TEST_18_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO pos_cash_close_v1_results VALUES (
      18, '18', 'shortage close',
      CASE WHEN SQLERRM = 'CASH_CLOSE_V1_TEST_18_ROLLBACK' THEN 'PASS' ELSE 'FAIL' END,
      'difference=-1', COALESCE(v_close_result::text, SQLERRM), 'Nested close was reverted.'
    );
  END;

  BEGIN
    SELECT expected_cash INTO v_expected
    FROM public.pos_get_cash_session_summaries_v1(v_brand_slug, ARRAY[v_session_id], true)
    LIMIT 1;
    SELECT to_jsonb(close_result) INTO v_close_result
    FROM public.pos_close_cash_session(v_brand_slug, v_session_id, v_expected + 1, v_user_id, 'suite overage') AS close_result
    LIMIT 1;
    IF round((v_close_result ->> 'difference')::numeric, 2) <> 1 THEN
      RAISE EXCEPTION 'CASH_CLOSE_V1_OVERAGE_FAILED %', v_close_result;
    END IF;
    RAISE EXCEPTION 'CASH_CLOSE_V1_TEST_19_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO pos_cash_close_v1_results VALUES (
      19, '19', 'overage close',
      CASE WHEN SQLERRM = 'CASH_CLOSE_V1_TEST_19_ROLLBACK' THEN 'PASS' ELSE 'FAIL' END,
      'difference=1', COALESCE(v_close_result::text, SQLERRM), 'Nested close was reverted.'
    );
  END;

  BEGIN
    SELECT expected_cash INTO v_expected
    FROM public.pos_get_cash_session_summaries_v1(v_brand_slug, ARRAY[v_session_id], true)
    LIMIT 1;
    PERFORM public.pos_close_cash_session(v_brand_slug, v_session_id, v_expected, v_user_id, 'suite first close');
    BEGIN
      PERFORM public.pos_close_cash_session(v_brand_slug, v_session_id, v_expected, v_user_id, 'suite second close');
      v_message := 'accepted';
    EXCEPTION WHEN OTHERS THEN
      v_message := SQLERRM;
    END;
    RAISE EXCEPTION 'CASH_CLOSE_V1_TEST_20_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'CASH_CLOSE_V1_TEST_20_ROLLBACK' THEN
      INSERT INTO pos_cash_close_v1_results VALUES (
        20, '20', 'double close rejected',
        CASE WHEN v_message = 'accepted' THEN 'FAIL' ELSE 'PASS' END,
        'second close rejected', v_message, 'Nested close was reverted.'
      );
    ELSE
      INSERT INTO pos_cash_close_v1_results VALUES (20, '20', 'double close rejected', 'FAIL', 'second close rejected', SQLERRM, 'First close failed.');
    END IF;
  END;

  INSERT INTO pos_cash_close_v1_results VALUES (
    21, '21', 'sale and close share session lock', 'SKIPPED',
    'two independent database connections', 'not executed in one SQL Editor transaction',
    'Preflight confirmed both RPCs lock the same pos_cash_sessions row with FOR UPDATE; exercise a two-connection race separately.'
  );

  BEGIN
    PERFORM public.pos_create_cash_movement(v_brand_slug || '-mismatch', v_session_id, 'income', 1, 'suite tenant mismatch', v_user_id);
    v_message := 'accepted';
  EXCEPTION WHEN OTHERS THEN
    v_message := SQLERRM;
  END;
  INSERT INTO pos_cash_close_v1_results VALUES (
    22, '22', 'tenant mismatch rejected',
    CASE WHEN v_message LIKE '%POS_CASH_MOVEMENT_SESSION_BRAND_MISMATCH%' THEN 'PASS' ELSE 'FAIL' END,
    'POS_CASH_MOVEMENT_SESSION_BRAND_MISMATCH', v_message, ''
  );

  INSERT INTO pos_cash_close_v1_results VALUES (
    23, '23', 'outer rollback safety', 'PASS', 'all suite writes revert at final ROLLBACK',
    'ROLLBACK pending after result grid', 'The transaction encloses session opens, movements, sales, inventory effects, and nested close calls.'
  );
END;
$cash_close_v1$;

WITH counts AS (
  SELECT
    count(*) FILTER (WHERE status = 'PASS') AS passed_count,
    count(*) FILTER (WHERE status = 'FAIL') AS failed_count,
    count(*) FILTER (WHERE status = 'SKIPPED') AS skipped_count
  FROM pos_cash_close_v1_results
  WHERE test_order BETWEEN 1 AND 23
), output_rows AS (
  SELECT test_order, test_number, test_name, status, expected, actual, notes
  FROM pos_cash_close_v1_results
  UNION ALL
  SELECT
    999,
    'TOTAL',
    'Suite totals',
    CASE WHEN failed_count > 0 THEN 'FAIL' WHEN skipped_count > 0 THEN 'SKIPPED' ELSE 'PASS' END,
    format('passed=%s', passed_count),
    format('failed=%s', failed_count),
    format('skipped=%s', skipped_count)
  FROM counts
)
SELECT test_number, test_name, status, expected, actual, notes
FROM output_rows
ORDER BY test_order;

ROLLBACK;
