-- CASH CLOSE V1
-- Financial safeguards for the existing session, sale, and movement model.

BEGIN;

-- A movement locks the same session row used by sale completion and closing.
-- This makes a concurrent movement either part of the close or rejected once
-- the close has changed the session state.
CREATE OR REPLACE FUNCTION public.pos_cash_movement_assert_open_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_session public.pos_cash_sessions%ROWTYPE;
BEGIN
  IF NEW.cash_session_id IS NULL THEN
    RAISE EXCEPTION 'POS_CASH_MOVEMENT_SESSION_REQUIRED';
  END IF;

  IF NEW.brand_slug IS NULL OR btrim(NEW.brand_slug) = '' THEN
    RAISE EXCEPTION 'POS_CASH_MOVEMENT_BRAND_REQUIRED';
  END IF;

  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'POS_CASH_MOVEMENT_AMOUNT_INVALID';
  END IF;

  IF NEW.movement_type NOT IN ('income', 'expense', 'withdrawal', 'deposit') THEN
    RAISE EXCEPTION 'POS_CASH_MOVEMENT_TYPE_INVALID';
  END IF;

  IF NEW.reason IS NULL OR btrim(NEW.reason) = '' THEN
    RAISE EXCEPTION 'POS_CASH_MOVEMENT_REASON_REQUIRED';
  END IF;

  SELECT *
  INTO v_session
  FROM public.pos_cash_sessions session
  WHERE session.id = NEW.cash_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_CASH_MOVEMENT_SESSION_NOT_FOUND';
  END IF;

  IF NEW.brand_slug IS DISTINCT FROM v_session.brand_slug
     OR NEW.brand_id IS DISTINCT FROM v_session.brand_id THEN
    RAISE EXCEPTION 'POS_CASH_MOVEMENT_SESSION_BRAND_MISMATCH';
  END IF;

  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'POS_CASH_MOVEMENT_SESSION_CLOSED';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER pos_cash_movements_assert_open_session
BEFORE INSERT ON public.pos_cash_movements
FOR EACH ROW
EXECUTE FUNCTION public.pos_cash_movement_assert_open_session();

-- The ledger is append-only. A cascading deletion issued by an existing
-- parent-session foreign key remains possible for controlled test cleanup;
-- direct movement edits and deletions are rejected.
CREATE OR REPLACE FUNCTION public.pos_cash_movement_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'POS_CASH_MOVEMENT_APPEND_ONLY';
END;
$function$;

CREATE TRIGGER pos_cash_movements_append_only
BEFORE UPDATE OR DELETE ON public.pos_cash_movements
FOR EACH ROW
EXECUTE FUNCTION public.pos_cash_movement_append_only();

-- The close RPC still performs the allowed open -> closed transition. Once a
-- session is closed, its financial result and state cannot be changed again.
CREATE OR REPLACE FUNCTION public.pos_cash_session_protect_closed_financials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
  IF OLD.status = 'closed' AND (
    NEW.status IS DISTINCT FROM OLD.status
    OR NEW.opening_amount IS DISTINCT FROM OLD.opening_amount
    OR NEW.expected_cash IS DISTINCT FROM OLD.expected_cash
    OR NEW.counted_cash IS DISTINCT FROM OLD.counted_cash
    OR NEW.difference IS DISTINCT FROM OLD.difference
    OR NEW.closed_by IS DISTINCT FROM OLD.closed_by
    OR NEW.closed_at IS DISTINCT FROM OLD.closed_at
  ) THEN
    RAISE EXCEPTION 'POS_CASH_SESSION_CLOSED_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER pos_cash_sessions_protect_closed_financials
BEFORE UPDATE ON public.pos_cash_sessions
FOR EACH ROW
EXECUTE FUNCTION public.pos_cash_session_protect_closed_financials();

CREATE OR REPLACE FUNCTION public.pos_create_cash_movement(
  p_brand_slug text,
  p_cash_session_id uuid,
  p_movement_type text,
  p_amount numeric,
  p_reason text,
  p_user_id uuid
)
RETURNS public.pos_cash_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_brand_slug text := lower(btrim(p_brand_slug));
  v_movement_type text := lower(btrim(p_movement_type));
  v_reason text := btrim(p_reason);
  v_session public.pos_cash_sessions%ROWTYPE;
  v_movement public.pos_cash_movements%ROWTYPE;
BEGIN
  IF v_brand_slug = '' THEN
    RAISE EXCEPTION 'POS_CASH_MOVEMENT_BRAND_REQUIRED';
  END IF;

  IF p_cash_session_id IS NULL THEN
    RAISE EXCEPTION 'POS_CASH_MOVEMENT_SESSION_REQUIRED';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'POS_CASH_MOVEMENT_USER_REQUIRED';
  END IF;

  IF v_movement_type NOT IN ('income', 'expense', 'withdrawal', 'deposit') THEN
    RAISE EXCEPTION 'POS_CASH_MOVEMENT_TYPE_INVALID';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> trunc(p_amount, 2) THEN
    RAISE EXCEPTION 'POS_CASH_MOVEMENT_AMOUNT_INVALID';
  END IF;

  IF v_reason = '' THEN
    RAISE EXCEPTION 'POS_CASH_MOVEMENT_REASON_REQUIRED';
  END IF;

  IF length(v_reason) > 500 THEN
    RAISE EXCEPTION 'POS_CASH_MOVEMENT_REASON_TOO_LONG';
  END IF;

  SELECT *
  INTO v_session
  FROM public.pos_cash_sessions session
  WHERE session.id = p_cash_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_CASH_MOVEMENT_SESSION_NOT_FOUND';
  END IF;

  IF v_session.brand_slug IS DISTINCT FROM v_brand_slug THEN
    RAISE EXCEPTION 'POS_CASH_MOVEMENT_SESSION_BRAND_MISMATCH';
  END IF;

  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'POS_CASH_MOVEMENT_SESSION_CLOSED';
  END IF;

  INSERT INTO public.pos_cash_movements (
    brand_id,
    brand_slug,
    cash_session_id,
    movement_type,
    amount,
    reason,
    created_by
  ) VALUES (
    v_session.brand_id,
    v_session.brand_slug,
    v_session.id,
    v_movement_type,
    p_amount,
    v_reason,
    p_user_id
  )
  RETURNING * INTO v_movement;

  RETURN v_movement;
END;
$function$;

REVOKE ALL ON FUNCTION public.pos_create_cash_movement(text,uuid,text,numeric,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_create_cash_movement(text,uuid,text,numeric,text,uuid)
  TO service_role;

-- One set-based summary keeps the operational dashboard free of per-session
-- network queries. Its formula matches the live close contract:
-- opening + cash payment amounts + signed movements.
CREATE OR REPLACE FUNCTION public.pos_get_cash_session_summaries_v1(
  p_brand_slug text,
  p_session_ids uuid[] DEFAULT NULL,
  p_include_expected_cash boolean DEFAULT false
)
RETURNS TABLE (
  cash_session_id uuid,
  sales_total numeric,
  tickets_count bigint,
  cash_sales numeric,
  card_sales numeric,
  transfer_sales numeric,
  wallet_sales numeric,
  other_sales numeric,
  cash_income numeric,
  cash_deposits numeric,
  cash_expenses numeric,
  cash_withdrawals numeric,
  net_cash_movements numeric,
  expected_cash numeric,
  recent_movements jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $function$
  WITH scoped_sessions AS (
    SELECT session.*
    FROM public.pos_cash_sessions session
    WHERE session.brand_slug = lower(btrim(p_brand_slug))
      AND (p_session_ids IS NULL OR session.id = ANY(p_session_ids))
  ), sale_rows AS (
    SELECT sale.id, sale.cash_session_id, sale.total
    FROM public.pos_sales sale
    JOIN scoped_sessions session
      ON session.id = sale.cash_session_id
    WHERE sale.status IN ('completed', 'partially_refunded')
  ), sale_totals AS (
    SELECT
      sale.cash_session_id,
      COALESCE(sum(sale.total), 0)::numeric AS sales_total,
      count(*)::bigint AS tickets_count
    FROM sale_rows sale
    GROUP BY sale.cash_session_id
  ), payment_totals AS (
    SELECT
      sale.cash_session_id,
      COALESCE(sum(payment.amount) FILTER (WHERE payment.payment_method = 'cash'), 0)::numeric AS cash_sales,
      COALESCE(sum(payment.amount) FILTER (WHERE payment.payment_method = 'card'), 0)::numeric AS card_sales,
      COALESCE(sum(payment.amount) FILTER (WHERE payment.payment_method = 'transfer'), 0)::numeric AS transfer_sales,
      COALESCE(sum(payment.amount) FILTER (WHERE payment.payment_method = 'wallet'), 0)::numeric AS wallet_sales,
      COALESCE(sum(payment.amount) FILTER (WHERE payment.payment_method = 'other'), 0)::numeric AS other_sales
    FROM sale_rows sale
    JOIN public.pos_payments payment
      ON payment.sale_id = sale.id
    GROUP BY sale.cash_session_id
  ), movement_totals AS (
    SELECT
      movement.cash_session_id,
      COALESCE(sum(movement.amount) FILTER (WHERE movement.movement_type = 'income'), 0)::numeric AS cash_income,
      COALESCE(sum(movement.amount) FILTER (WHERE movement.movement_type = 'deposit'), 0)::numeric AS cash_deposits,
      COALESCE(sum(movement.amount) FILTER (WHERE movement.movement_type = 'expense'), 0)::numeric AS cash_expenses,
      COALESCE(sum(movement.amount) FILTER (WHERE movement.movement_type = 'withdrawal'), 0)::numeric AS cash_withdrawals
    FROM public.pos_cash_movements movement
    JOIN scoped_sessions session
      ON session.id = movement.cash_session_id
    GROUP BY movement.cash_session_id
  )
  SELECT
    session.id,
    COALESCE(sale_totals.sales_total, 0)::numeric,
    COALESCE(sale_totals.tickets_count, 0)::bigint,
    COALESCE(payment_totals.cash_sales, 0)::numeric,
    COALESCE(payment_totals.card_sales, 0)::numeric,
    COALESCE(payment_totals.transfer_sales, 0)::numeric,
    COALESCE(payment_totals.wallet_sales, 0)::numeric,
    COALESCE(payment_totals.other_sales, 0)::numeric,
    COALESCE(movement_totals.cash_income, 0)::numeric,
    COALESCE(movement_totals.cash_deposits, 0)::numeric,
    COALESCE(movement_totals.cash_expenses, 0)::numeric,
    COALESCE(movement_totals.cash_withdrawals, 0)::numeric,
    (
      COALESCE(movement_totals.cash_income, 0)
      + COALESCE(movement_totals.cash_deposits, 0)
      - COALESCE(movement_totals.cash_expenses, 0)
      - COALESCE(movement_totals.cash_withdrawals, 0)
    )::numeric,
    CASE
      WHEN session.status = 'closed' THEN session.expected_cash
      WHEN p_include_expected_cash THEN (
        session.opening_amount
        + COALESCE(payment_totals.cash_sales, 0)
        + COALESCE(movement_totals.cash_income, 0)
        + COALESCE(movement_totals.cash_deposits, 0)
        - COALESCE(movement_totals.cash_expenses, 0)
        - COALESCE(movement_totals.cash_withdrawals, 0)
      )::numeric
      ELSE NULL
    END,
    COALESCE(recent.rows, '[]'::jsonb)
  FROM scoped_sessions session
  LEFT JOIN sale_totals
    ON sale_totals.cash_session_id = session.id
  LEFT JOIN payment_totals
    ON payment_totals.cash_session_id = session.id
  LEFT JOIN movement_totals
    ON movement_totals.cash_session_id = session.id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', recent_movement.id,
        'movementType', recent_movement.movement_type,
        'amount', recent_movement.amount,
        'reason', recent_movement.reason,
        'createdAt', recent_movement.created_at,
        'createdBy', recent_movement.created_by
      )
      ORDER BY recent_movement.created_at DESC, recent_movement.id DESC
    ) AS rows
    FROM (
      SELECT movement.*
      FROM public.pos_cash_movements movement
      WHERE movement.cash_session_id = session.id
      ORDER BY movement.created_at DESC, movement.id DESC
      LIMIT 5
    ) recent_movement
  ) recent ON true;
$function$;

REVOKE ALL ON FUNCTION public.pos_get_cash_session_summaries_v1(text,uuid[],boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_get_cash_session_summaries_v1(text,uuid[],boolean)
  TO service_role;

COMMIT;
