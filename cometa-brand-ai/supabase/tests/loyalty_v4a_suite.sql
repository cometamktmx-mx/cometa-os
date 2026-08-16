-- LOYALTY V4A TRANSACTIONAL TEST SUITE
-- Ejecutar DESPUÉS de loyalty_v4a_postflight.sql.
--
-- IMPORTANTE:
-- Esta suite termina en ROLLBACK.
-- Sin embargo pos_sale_number_seq / nextval NO es transaccional.
-- Ejecutar la suite consumirá números de venta y puede dejar huecos en el consecutivo.
-- Esto es esperado.

-- ESTADO OPCIONAL TRAS UNA EJECUCIÓN FALLIDA Y REVERTIDA:
-- Esperado antes de reejecutar esta suite:
-- tiers = 0, sales_with_test_keys = 0 y snapshots_for_test_sales = 0.
SELECT
  (SELECT count(*) FROM public.pos_loyalty_tiers) AS tiers,
  (
    SELECT count(*)
    FROM public.pos_sales sale
    WHERE sale.idempotency_key::text LIKE '41000000-%'
  ) AS sales_with_test_keys,
  (
    SELECT count(*)
    FROM public.pos_sale_loyalty_tier_snapshots snapshot
    JOIN public.pos_sales sale ON sale.id = snapshot.sale_id
    WHERE sale.idempotency_key::text LIKE '41000000-%'
  ) AS snapshots_for_test_sales;

DROP TABLE IF EXISTS pg_temp.v4a_fixture;
DROP TABLE IF EXISTS pg_temp.v4a_results;
DROP TABLE IF EXISTS pg_temp.v4a_errors;
DROP TABLE IF EXISTS pg_temp.v4a_test_10_audit;

CREATE TEMPORARY TABLE v4a_fixture AS
SELECT
  program.brand_id,
  program.brand_slug,
  program.id AS program_id,
  member.id AS member_id,
  member.customer_id,
  reward.id AS reward_id,
  variant.id AS variant_id,
  location.id AS location_id,
  register.id AS register_id,
  session.id AS cash_session_id,
  reference_sale.sold_by AS user_id,
  variant.price AS unit_price,
  product.tax_rate,
  product.track_inventory,
  inventory.quantity AS inventory_quantity,
  inventory.reserved_quantity,
  location.prices_include_tax,
  CASE
    WHEN location.prices_include_tax THEN round(variant.price, 2)
    ELSE round(variant.price + variant.price * product.tax_rate / 100, 2)
  END AS normal_total,
  round(
    CASE
      WHEN location.prices_include_tax THEN variant.price
      ELSE variant.price + variant.price * product.tax_rate / 100
    END - reward.reward_value,
    2
  ) AS reward_total
FROM public.pos_loyalty_programs program
JOIN public.pos_loyalty_members member
  ON member.program_id = program.id
 AND member.brand_slug = program.brand_slug
JOIN public.pos_loyalty_rewards reward
  ON reward.program_id = program.id
 AND reward.brand_slug = program.brand_slug
 AND reward.id = 'cd9dce78-67d3-4fda-b998-ea04847a5307'::uuid
JOIN public.pos_product_variants variant
  ON variant.id = '9aff80fe-bb93-4cf6-b899-1c34cf8a3c57'::uuid
 AND variant.brand_slug = program.brand_slug
JOIN public.pos_products product
  ON product.id = variant.product_id
 AND product.brand_slug = program.brand_slug
JOIN LATERAL (
  SELECT
    cash_session.id,
    cash_register.id AS register_id,
    cash_register.location_id
  FROM public.pos_cash_sessions cash_session
  JOIN public.pos_registers cash_register
    ON cash_register.id = cash_session.register_id
   AND cash_register.brand_slug = cash_session.brand_slug
  WHERE cash_session.brand_slug = program.brand_slug
    AND cash_session.status = 'open'
    AND cash_register.status = 'available'
  ORDER BY cash_session.opened_at DESC
  LIMIT 1
) session_context ON true
JOIN public.pos_registers register
  ON register.id = session_context.register_id
JOIN public.pos_cash_sessions session
  ON session.id = session_context.id
JOIN public.pos_locations location
  ON location.id = session_context.location_id
 AND location.active = true
LEFT JOIN public.pos_inventory inventory
  ON inventory.brand_slug = program.brand_slug
 AND inventory.location_id = location.id
 AND inventory.variant_id = variant.id
JOIN public.pos_sales reference_sale
  ON reference_sale.id = 'ae40801f-850f-4f34-a43d-2e995c29372c'::uuid
WHERE program.brand_slug = 'tivana'
  AND program.active = true
  AND member.id = '92fe9320-fcc5-4d16-9ab8-fbbf11151169'::uuid
  AND member.status = 'active'
  AND reward.active = true
  AND reward.reward_type = 'discount_fixed'
  AND variant.active = true
  AND product.active = true
  AND (
    product.track_inventory = false
    OR inventory.quantity - inventory.reserved_quantity >= 1
  );

CREATE TEMPORARY TABLE v4a_results (
  test_number integer NOT NULL,
  attempt text NOT NULL,
  response jsonb NOT NULL
);

CREATE TEMPORARY TABLE v4a_errors (
  test_number integer NOT NULL,
  error_message text NOT NULL
);

CREATE TEMPORARY TABLE v4a_test_10_audit (
  customer_id uuid NOT NULL,
  membership_count_before integer NOT NULL
);

SELECT * FROM v4a_fixture;

-- PRECONDICIÓN:
-- Este SELECT debe devolver EXACTAMENTE 1 fila.
-- Si devuelve 0 o más de 1, DETENER la suite.

BEGIN;

-- TEST 1
-- Objetivo: completar una venta V3 sin tiers configurados.
-- Esperado: multiplier 1, tiers null, earned_points = base_points y snapshot consistente.
SAVEPOINT test_1;

INSERT INTO v4a_results
SELECT 1, 'initial', public.pos_complete_sale_v3(
  fixture.brand_slug, fixture.location_id, fixture.register_id,
  fixture.cash_session_id, fixture.customer_id,
  jsonb_build_array(jsonb_build_object(
    'variant_id', fixture.variant_id, 'quantity', 1, 'discount_amount', 0
  )),
  jsonb_build_array(jsonb_build_object(
    'method', 'cash', 'amount', fixture.normal_total,
    'tendered_amount', fixture.normal_total, 'metadata', '{}'::jsonb
  )),
  'TEST V4A 1 SIN TIERS', fixture.user_id, null,
  '41000000-0000-4000-8000-000000000001'::uuid
)
FROM v4a_fixture fixture;

SELECT response FROM v4a_results WHERE test_number = 1;
SELECT snapshot.*
FROM public.pos_sale_loyalty_tier_snapshots snapshot
JOIN v4a_results result
  ON snapshot.sale_id = (result.response ->> 'id')::uuid
WHERE result.test_number = 1;

ROLLBACK TO SAVEPOINT test_1;

-- TEST 2
-- Objetivo: crear Bronce, Plata y Oro con los umbrales aprobados.
-- Esperado: tres tiers activos, ordenados por 0, 1000 y 3000 puntos históricos.
SELECT public.pos_create_loyalty_tier(
  fixture.brand_slug, 'Bronce', 0, 1.0000, 0, true
) FROM v4a_fixture fixture;
SELECT public.pos_create_loyalty_tier(
  fixture.brand_slug, 'Plata', 1000, 1.2500, 1000, true
) FROM v4a_fixture fixture;
SELECT public.pos_create_loyalty_tier(
  fixture.brand_slug, 'Oro', 3000, 1.5000, 3000, true
) FROM v4a_fixture fixture;

SELECT id, name, minimum_lifetime_points, points_multiplier, sort_order, active
FROM public.pos_loyalty_tiers
WHERE program_id = (SELECT program_id FROM v4a_fixture)
ORDER BY minimum_lifetime_points;

-- TEST 3
-- Objetivo: comprobar un miembro existente asignado a Bronce.
-- Esperado: lifetime 695, balance 695 y multiplier 1.0000.
SAVEPOINT test_3;
UPDATE public.pos_loyalty_members member
SET lifetime_points = 695,
    points_balance = 695,
    tier_id = (
      SELECT id FROM public.pos_loyalty_tiers
      WHERE program_id = member.program_id AND name = 'Bronce'
    )
WHERE member.id = (SELECT member_id FROM v4a_fixture);

SELECT member.points_balance, member.lifetime_points, tier.name, tier.points_multiplier
FROM public.pos_loyalty_members member
LEFT JOIN public.pos_loyalty_tiers tier ON tier.id = member.tier_id
WHERE member.id = (SELECT member_id FROM v4a_fixture);
ROLLBACK TO SAVEPOINT test_3;

-- TEST 4
-- Objetivo: completar una venta que no cruce el umbral de Plata.
-- Esperado: Bronce antes/después, multiplier 1 y promoted false.
SAVEPOINT test_4;
UPDATE public.pos_loyalty_members member
SET lifetime_points = 100,
    points_balance = 100,
    tier_id = (
      SELECT id FROM public.pos_loyalty_tiers
      WHERE program_id = member.program_id AND name = 'Bronce'
    )
WHERE member.id = (SELECT member_id FROM v4a_fixture);

INSERT INTO v4a_results
SELECT 4, 'initial', public.pos_complete_sale_v3(
  fixture.brand_slug, fixture.location_id, fixture.register_id,
  fixture.cash_session_id, fixture.customer_id,
  jsonb_build_array(jsonb_build_object(
    'variant_id', fixture.variant_id, 'quantity', 1, 'discount_amount', 0
  )),
  jsonb_build_array(jsonb_build_object(
    'method', 'cash', 'amount', fixture.normal_total,
    'tendered_amount', fixture.normal_total, 'metadata', '{}'::jsonb
  )),
  'TEST V4A 4 NO CRUZA', fixture.user_id, null,
  '41000000-0000-4000-8000-000000000004'::uuid
) FROM v4a_fixture fixture;

SELECT response FROM v4a_results WHERE test_number = 4;
SELECT snapshot.*
FROM public.pos_sale_loyalty_tier_snapshots snapshot
JOIN v4a_results result ON snapshot.sale_id = (result.response ->> 'id')::uuid
WHERE result.test_number = 4;
ROLLBACK TO SAVEPOINT test_4;

-- TEST 5
-- Objetivo: cruzar a Plata usando todavía Bronce 1.00x en esta venta.
-- Esperado: tier_before Bronce, tier_after Plata, multiplier 1 y promoted true.
SAVEPOINT test_5;
UPDATE public.pos_loyalty_members member
SET lifetime_points = 701,
    points_balance = 701,
    tier_id = (
      SELECT id FROM public.pos_loyalty_tiers
      WHERE program_id = member.program_id AND name = 'Bronce'
    )
WHERE member.id = (SELECT member_id FROM v4a_fixture);

INSERT INTO v4a_results
SELECT 5, 'initial', public.pos_complete_sale_v3(
  fixture.brand_slug, fixture.location_id, fixture.register_id,
  fixture.cash_session_id, fixture.customer_id,
  jsonb_build_array(jsonb_build_object(
    'variant_id', fixture.variant_id, 'quantity', 1, 'discount_amount', 0
  )),
  jsonb_build_array(jsonb_build_object(
    'method', 'cash', 'amount', fixture.normal_total,
    'tendered_amount', fixture.normal_total, 'metadata', '{}'::jsonb
  )),
  'TEST V4A 5 PROMOCION PLATA', fixture.user_id, null,
  '41000000-0000-4000-8000-000000000005'::uuid
) FROM v4a_fixture fixture;

SELECT response FROM v4a_results WHERE test_number = 5;
SELECT snapshot.*
FROM public.pos_sale_loyalty_tier_snapshots snapshot
JOIN v4a_results result ON snapshot.sale_id = (result.response ->> 'id')::uuid
WHERE result.test_number = 5;
ROLLBACK TO SAVEPOINT test_5;

-- TEST 6
-- Objetivo: comprobar que la siguiente venta usa Plata 1.25x.
-- Esperado: base 299, earned 373 y balances finales 1373 con el fixture actual.
SAVEPOINT test_6;
UPDATE public.pos_loyalty_members member
SET lifetime_points = 1000,
    points_balance = 1000,
    tier_id = (
      SELECT id FROM public.pos_loyalty_tiers
      WHERE program_id = member.program_id AND name = 'Plata'
    )
WHERE member.id = (SELECT member_id FROM v4a_fixture);

INSERT INTO v4a_results
SELECT 6, 'initial', public.pos_complete_sale_v3(
  fixture.brand_slug, fixture.location_id, fixture.register_id,
  fixture.cash_session_id, fixture.customer_id,
  jsonb_build_array(jsonb_build_object(
    'variant_id', fixture.variant_id, 'quantity', 1, 'discount_amount', 0
  )),
  jsonb_build_array(jsonb_build_object(
    'method', 'cash', 'amount', fixture.normal_total,
    'tendered_amount', fixture.normal_total, 'metadata', '{}'::jsonb
  )),
  'TEST V4A 6 MULTIPLICADOR PLATA', fixture.user_id, null,
  '41000000-0000-4000-8000-000000000006'::uuid
) FROM v4a_fixture fixture;

SELECT result.response, transaction.points, transaction.balance_after,
       member.points_balance, member.lifetime_points
FROM v4a_results result
JOIN public.pos_loyalty_transactions transaction
  ON transaction.sale_id = (result.response ->> 'id')::uuid
 AND transaction.transaction_type = 'earn'
JOIN public.pos_loyalty_members member ON member.id = transaction.member_id
WHERE result.test_number = 6;
ROLLBACK TO SAVEPOINT test_6;

-- TEST 7
-- Objetivo: combinar reward, redeem y multiplier de Plata.
-- Esperado: redeem -500, base 249, earned 311, balance 411 y lifetime 1311.
SAVEPOINT test_7;
UPDATE public.pos_loyalty_members member
SET lifetime_points = 1000,
    points_balance = 600,
    tier_id = (
      SELECT id FROM public.pos_loyalty_tiers
      WHERE program_id = member.program_id AND name = 'Plata'
    )
WHERE member.id = (SELECT member_id FROM v4a_fixture);

INSERT INTO v4a_results
SELECT 7, 'initial', public.pos_complete_sale_v3(
  fixture.brand_slug, fixture.location_id, fixture.register_id,
  fixture.cash_session_id, fixture.customer_id,
  jsonb_build_array(jsonb_build_object(
    'variant_id', fixture.variant_id, 'quantity', 1, 'discount_amount', 0
  )),
  jsonb_build_array(jsonb_build_object(
    'method', 'cash', 'amount', fixture.reward_total,
    'tendered_amount', fixture.reward_total, 'metadata', '{}'::jsonb
  )),
  'TEST V4A 7 REWARD MULTIPLIER', fixture.user_id, fixture.reward_id,
  '41000000-0000-4000-8000-000000000007'::uuid
) FROM v4a_fixture fixture;

SELECT response FROM v4a_results WHERE test_number = 7;
SELECT transaction.transaction_type, transaction.points, transaction.balance_after
FROM public.pos_loyalty_transactions transaction
JOIN v4a_results result ON transaction.sale_id = (result.response ->> 'id')::uuid
WHERE result.test_number = 7
ORDER BY CASE transaction.transaction_type WHEN 'redeem' THEN 1 WHEN 'earn' THEN 2 ELSE 3 END,
         transaction.created_at;
SELECT points_balance, lifetime_points
FROM public.pos_loyalty_members
WHERE id = (SELECT member_id FROM v4a_fixture);
ROLLBACK TO SAVEPOINT test_7;

-- TEST 8
-- Objetivo: repetir exactamente la misma venta.
-- Esperado: una sale, item, payment, inventory movement, earn y snapshot; replay true.
SAVEPOINT test_8;
UPDATE public.pos_loyalty_members member
SET lifetime_points = 1000,
    points_balance = 1000,
    tier_id = (
      SELECT id FROM public.pos_loyalty_tiers
      WHERE program_id = member.program_id AND name = 'Plata'
    )
WHERE member.id = (SELECT member_id FROM v4a_fixture);

INSERT INTO v4a_results
SELECT 8, 'first', public.pos_complete_sale_v3(
  fixture.brand_slug, fixture.location_id, fixture.register_id,
  fixture.cash_session_id, fixture.customer_id,
  jsonb_build_array(jsonb_build_object(
    'variant_id', fixture.variant_id, 'quantity', 1, 'discount_amount', 0
  )),
  jsonb_build_array(jsonb_build_object(
    'method', 'cash', 'amount', fixture.normal_total,
    'tendered_amount', fixture.normal_total, 'metadata', '{}'::jsonb
  )),
  'TEST V4A 8 REPLAY', fixture.user_id, null,
  '41000000-0000-4000-8000-000000000008'::uuid
) FROM v4a_fixture fixture;

INSERT INTO v4a_results
SELECT 8, 'replay', public.pos_complete_sale_v3(
  fixture.brand_slug, fixture.location_id, fixture.register_id,
  fixture.cash_session_id, fixture.customer_id,
  jsonb_build_array(jsonb_build_object(
    'variant_id', fixture.variant_id, 'quantity', 1, 'discount_amount', 0
  )),
  jsonb_build_array(jsonb_build_object(
    'method', 'cash', 'amount', fixture.normal_total,
    'tendered_amount', fixture.normal_total, 'metadata', '{}'::jsonb
  )),
  'TEST V4A 8 REPLAY', fixture.user_id, null,
  '41000000-0000-4000-8000-000000000008'::uuid
) FROM v4a_fixture fixture;

SELECT attempt, response FROM v4a_results WHERE test_number = 8 ORDER BY attempt;
SELECT
  count(DISTINCT sale.id) AS sales,
  count(DISTINCT item.id) AS sale_items,
  count(DISTINCT payment.id) AS payments,
  count(DISTINCT movement.id) AS inventory_movements,
  count(DISTINCT transaction.id) FILTER (
    WHERE transaction.transaction_type = 'earn'
  ) AS earn_transactions,
  count(DISTINCT snapshot.id) AS snapshots
FROM v4a_results result
JOIN public.pos_sales sale ON sale.id = (result.response ->> 'id')::uuid
LEFT JOIN public.pos_sale_items item ON item.sale_id = sale.id
LEFT JOIN public.pos_payments payment ON payment.sale_id = sale.id
LEFT JOIN public.pos_inventory_movements movement ON movement.reference_id = sale.id
LEFT JOIN public.pos_loyalty_transactions transaction ON transaction.sale_id = sale.id
LEFT JOIN public.pos_sale_loyalty_tier_snapshots snapshot ON snapshot.sale_id = sale.id
WHERE result.test_number = 8;
SELECT points_balance, lifetime_points
FROM public.pos_loyalty_members
WHERE id = (SELECT member_id FROM v4a_fixture);
ROLLBACK TO SAVEPOINT test_8;

-- TEST 9
-- Objetivo: reutilizar una key con quantity diferente.
-- Esperado: conflicto de idempotencia y exactamente una venta.
SAVEPOINT test_9;
INSERT INTO v4a_results
SELECT 9, 'first', public.pos_complete_sale_v3(
  fixture.brand_slug, fixture.location_id, fixture.register_id,
  fixture.cash_session_id, fixture.customer_id,
  jsonb_build_array(jsonb_build_object(
    'variant_id', fixture.variant_id, 'quantity', 1, 'discount_amount', 0
  )),
  jsonb_build_array(jsonb_build_object(
    'method', 'cash', 'amount', fixture.normal_total,
    'tendered_amount', fixture.normal_total, 'metadata', '{}'::jsonb
  )),
  'TEST V4A 9 CONFLICT', fixture.user_id, null,
  '41000000-0000-4000-8000-000000000009'::uuid
) FROM v4a_fixture fixture;

DO $test$
DECLARE
  fixture v4a_fixture%rowtype;
BEGIN
  SELECT * INTO fixture FROM v4a_fixture;
  PERFORM public.pos_complete_sale_v3(
    fixture.brand_slug, fixture.location_id, fixture.register_id,
    fixture.cash_session_id, fixture.customer_id,
    jsonb_build_array(jsonb_build_object(
      'variant_id', fixture.variant_id, 'quantity', 2, 'discount_amount', 0
    )),
    jsonb_build_array(jsonb_build_object(
      'method', 'cash', 'amount', fixture.normal_total,
      'tendered_amount', fixture.normal_total, 'metadata', '{}'::jsonb
    )),
    'TEST V4A 9 CONFLICT', fixture.user_id, null,
    '41000000-0000-4000-8000-000000000009'::uuid
  );
  RAISE EXCEPTION 'TEST 9 FAIL: se aceptó payload diferente.';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM ILIKE '%Conflicto de idempotencia%' THEN
      INSERT INTO v4a_errors VALUES (9, SQLERRM);
    ELSE
      RAISE;
    END IF;
END;
$test$;

SELECT * FROM v4a_errors WHERE test_number = 9;
SELECT count(*) AS sales_for_key
FROM public.pos_sales
WHERE brand_slug = (SELECT brand_slug FROM v4a_fixture)
  AND idempotency_key = '41000000-0000-4000-8000-000000000009'::uuid;
ROLLBACK TO SAVEPOINT test_9;

-- TEST 10
-- Objetivo: crear un cliente temporal sin membership y completar su primera venta.
-- Esperado: membership_count antes 0; después exactamente 1, Bronce y snapshot correcto.
SAVEPOINT test_10;
DO $test$
DECLARE
  fixture v4a_fixture%rowtype;
  temporary_customer_id uuid;
  membership_count integer;
  sale_response jsonb;
BEGIN
  SELECT * INTO fixture FROM v4a_fixture;

  INSERT INTO public.pos_customers (
    brand_id,
    brand_slug,
    first_name,
    last_name,
    phone,
    email,
    marketing_consent,
    wallet_consent,
    tags,
    active,
    created_by
  )
  VALUES (
    fixture.brand_id,
    fixture.brand_slug,
    'V4A TEST AUTO MEMBERSHIP',
    'TEMPORAL',
    null,
    'v4a-test-' || gen_random_uuid()::text || '@example.invalid',
    false,
    false,
    '[]'::jsonb,
    true,
    fixture.user_id
  )
  RETURNING id INTO temporary_customer_id;

  SELECT count(*)
  INTO membership_count
  FROM public.pos_loyalty_members member
  WHERE member.customer_id = temporary_customer_id
    AND member.program_id = fixture.program_id;

  INSERT INTO v4a_test_10_audit (
    customer_id,
    membership_count_before
  )
  VALUES (
    temporary_customer_id,
    membership_count
  );

  IF membership_count <> 0 THEN
    RAISE EXCEPTION 'TEST 10 FAIL: el cliente temporal ya tiene membership antes de la venta.';
  END IF;

  sale_response := public.pos_complete_sale_v3(
    fixture.brand_slug,
    fixture.location_id,
    fixture.register_id,
    fixture.cash_session_id,
    temporary_customer_id,
    jsonb_build_array(jsonb_build_object(
      'variant_id', fixture.variant_id,
      'quantity', 1,
      'discount_amount', 0
    )),
    jsonb_build_array(jsonb_build_object(
      'method', 'cash',
      'amount', fixture.normal_total,
      'tendered_amount', fixture.normal_total,
      'metadata', '{}'::jsonb
    )),
    'TEST V4A 10 AUTO MEMBERSHIP',
    fixture.user_id,
    null,
    '41000000-0000-4000-8000-000000000010'::uuid
  );

  INSERT INTO v4a_results (
    test_number,
    attempt,
    response
  )
  VALUES (
    10,
    'initial',
    sale_response
  );
END;
$test$;

SELECT
  customer_id,
  membership_count_before
FROM v4a_test_10_audit;

SELECT
  result.response,
  audit.customer_id,
  (
    SELECT count(*)
    FROM public.pos_loyalty_members counted_member
    WHERE counted_member.customer_id = audit.customer_id
      AND counted_member.program_id = fixture.program_id
  ) AS membership_count_after,
  member.id AS created_member_id,
  snapshot.member_id = member.id AS snapshot_member_matches,
  snapshot.tier_before_name,
  snapshot.lifetime_points_before,
  snapshot.tier_multiplier,
  snapshot.base_points,
  snapshot.earned_points,
  snapshot.lifetime_points_after,
  snapshot.earned_points = floor(
    floor(
      (result.response ->> 'total')::numeric
      * program.points_per_currency
    ) * snapshot.tier_multiplier
  )::integer AS earned_points_correct,
  snapshot.lifetime_points_after = snapshot.earned_points
    AS lifetime_after_matches_earned,
  member.points_balance,
  member.lifetime_points,
  member.tier_id,
  bronze_tier.id AS bronze_tier_id,
  member_tier.name AS member_tier_name,
  member.tier_id = bronze_tier.id AS member_tier_is_bronze
FROM v4a_results result
JOIN v4a_test_10_audit audit ON true
JOIN v4a_fixture fixture ON true
JOIN public.pos_loyalty_programs program
  ON program.id = fixture.program_id
JOIN public.pos_sale_loyalty_tier_snapshots snapshot
  ON snapshot.sale_id = (result.response ->> 'id')::uuid
JOIN public.pos_loyalty_members member ON member.id = snapshot.member_id
JOIN public.pos_loyalty_tiers bronze_tier
  ON bronze_tier.program_id = fixture.program_id
 AND bronze_tier.name = 'Bronce'
LEFT JOIN public.pos_loyalty_tiers member_tier
  ON member_tier.id = member.tier_id
WHERE result.test_number = 10
  AND member.customer_id = audit.customer_id;
ROLLBACK TO SAVEPOINT test_10;

-- TEST 11
-- Objetivo: desactivar Plata y resolver el siguiente tier activo aplicable.
-- Esperado: resolver y membresía quedan en Bronce usando fixture.brand_slug.
SAVEPOINT test_11;
UPDATE public.pos_loyalty_members member
SET lifetime_points = 1500,
    points_balance = 1500,
    tier_id = (
      SELECT id FROM public.pos_loyalty_tiers
      WHERE program_id = member.program_id AND name = 'Plata'
    )
WHERE member.id = (SELECT member_id FROM v4a_fixture);

SELECT public.pos_set_loyalty_tier_active(
  fixture.brand_slug, tier.id, false
)
FROM v4a_fixture fixture
JOIN public.pos_loyalty_tiers tier
  ON tier.program_id = fixture.program_id
 AND tier.name = 'Plata';

SELECT resolved.*
FROM v4a_fixture fixture
CROSS JOIN LATERAL public.pos_resolve_loyalty_tier(
  fixture.brand_slug,
  fixture.program_id,
  1500
) resolved;

SELECT member.tier_id, tier.name, tier.active
FROM public.pos_loyalty_members member
LEFT JOIN public.pos_loyalty_tiers tier ON tier.id = member.tier_id
WHERE member.id = (SELECT member_id FROM v4a_fixture);
ROLLBACK TO SAVEPOINT test_11;

-- TEST 12
-- Objetivo: crear otro tier con threshold 1000.
-- Esperado: unique_violation y exactamente un tier en el umbral 1000.
SAVEPOINT test_12;
DO $test$
DECLARE
  fixture v4a_fixture%rowtype;
BEGIN
  SELECT * INTO fixture FROM v4a_fixture;
  PERFORM public.pos_create_loyalty_tier(
    fixture.brand_slug, 'Plata duplicada', 1000, 1.1000, 1001, true
  );
  RAISE EXCEPTION 'TEST 12 FAIL: se aceptó threshold duplicado.';
EXCEPTION
  WHEN unique_violation THEN
    INSERT INTO v4a_errors VALUES (12, SQLERRM);
END;
$test$;

SELECT * FROM v4a_errors WHERE test_number = 12;
SELECT count(*) AS tiers_at_1000
FROM public.pos_loyalty_tiers
WHERE program_id = (SELECT program_id FROM v4a_fixture)
  AND minimum_lifetime_points = 1000;
ROLLBACK TO SAVEPOINT test_12;

-- TEST 13
-- Objetivo: intentar modificar un tier de Tivana usando otro brand_slug.
-- Esperado: error de ownership y tier_unchanged true para los cinco campos auditados.
SAVEPOINT test_13;
CREATE TEMPORARY TABLE v4a_test_13_before ON COMMIT DROP AS
SELECT tier.id, tier.name, tier.minimum_lifetime_points,
       tier.points_multiplier, tier.sort_order, tier.active
FROM public.pos_loyalty_tiers tier
WHERE tier.program_id = (SELECT program_id FROM v4a_fixture)
  AND tier.name = 'Bronce';

DO $test$
DECLARE
  target_tier_id uuid;
BEGIN
  SELECT id INTO target_tier_id FROM v4a_test_13_before;
  PERFORM public.pos_update_loyalty_tier(
    '__otra_marca__', target_tier_id, 'Intento cross-tenant',
    999, 9.0000, 999, false
  );
  RAISE EXCEPTION 'TEST 13 FAIL: se aceptó acceso cross-tenant.';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM ILIKE '%pertenece a otra marca%' THEN
      INSERT INTO v4a_errors VALUES (13, SQLERRM);
    ELSE
      RAISE;
    END IF;
END;
$test$;

SELECT * FROM v4a_errors WHERE test_number = 13;
SELECT
  before.id,
  before.name AS name_before,
  current.name AS name_after,
  before.minimum_lifetime_points AS threshold_before,
  current.minimum_lifetime_points AS threshold_after,
  before.points_multiplier AS multiplier_before,
  current.points_multiplier AS multiplier_after,
  before.sort_order AS sort_before,
  current.sort_order AS sort_after,
  before.active AS active_before,
  current.active AS active_after,
  (
    before.name,
    before.minimum_lifetime_points,
    before.points_multiplier,
    before.sort_order,
    before.active
  ) IS NOT DISTINCT FROM (
    current.name,
    current.minimum_lifetime_points,
    current.points_multiplier,
    current.sort_order,
    current.active
  ) AS tier_unchanged
FROM v4a_test_13_before before
JOIN public.pos_loyalty_tiers current ON current.id = before.id;
ROLLBACK TO SAVEPOINT test_13;

rollback;
