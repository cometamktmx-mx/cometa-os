-- COMETA POS Commercial Grants V1 plan dominance corrective migration.
-- NULL in both compared limit columns means that dimension is not an
-- explicit commercial constraint in the current catalog. A one-sided NULL
-- remains incomparable and fails closed.
BEGIN;

CREATE OR REPLACE FUNCTION public.pos_plan_dominates_v1(
  p_candidate_plan_code text,
  p_baseline_plan_code text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_candidate_plan public.pos_plans%ROWTYPE;
  v_candidate public.pos_plan_limits%ROWTYPE;
  v_baseline public.pos_plan_limits%ROWTYPE;
BEGIN
  IF p_candidate_plan_code IS NULL
    OR p_baseline_plan_code IS NULL
    OR btrim(p_candidate_plan_code) = ''
    OR btrim(p_baseline_plan_code) = '' THEN
    RETURN false;
  END IF;

  SELECT * INTO v_candidate_plan
  FROM public.pos_plans
  WHERE code = p_candidate_plan_code;
  IF NOT FOUND OR NOT COALESCE(v_candidate_plan.active, false) THEN
    RETURN false;
  END IF;

  IF p_candidate_plan_code = p_baseline_plan_code THEN
    RETURN true;
  END IF;

  SELECT * INTO v_candidate
  FROM public.pos_plan_limits
  WHERE plan_code = p_candidate_plan_code;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT * INTO v_baseline
  FROM public.pos_plan_limits
  WHERE plan_code = p_baseline_plan_code;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Both NULL values are compatible. A one-sided NULL is unknown rather
  -- than an implicit unlimited value, so dominance fails closed.
  IF (v_candidate.max_locations IS NULL AND v_baseline.max_locations IS NOT NULL)
    OR (v_candidate.max_locations IS NOT NULL AND v_baseline.max_locations IS NULL)
    OR (v_candidate.max_locations IS NOT NULL AND v_baseline.max_locations IS NOT NULL
      AND v_candidate.max_locations < v_baseline.max_locations)
    OR (v_candidate.max_registers IS NULL AND v_baseline.max_registers IS NOT NULL)
    OR (v_candidate.max_registers IS NOT NULL AND v_baseline.max_registers IS NULL)
    OR (v_candidate.max_registers IS NOT NULL AND v_baseline.max_registers IS NOT NULL
      AND v_candidate.max_registers < v_baseline.max_registers)
    OR (v_candidate.max_users IS NULL AND v_baseline.max_users IS NOT NULL)
    OR (v_candidate.max_users IS NOT NULL AND v_baseline.max_users IS NULL)
    OR (v_candidate.max_users IS NOT NULL AND v_baseline.max_users IS NOT NULL
      AND v_candidate.max_users < v_baseline.max_users)
    OR (v_candidate.max_products IS NULL AND v_baseline.max_products IS NOT NULL)
    OR (v_candidate.max_products IS NOT NULL AND v_baseline.max_products IS NULL)
    OR (v_candidate.max_products IS NOT NULL AND v_baseline.max_products IS NOT NULL
      AND v_candidate.max_products < v_baseline.max_products)
    OR (v_candidate.max_customers IS NULL AND v_baseline.max_customers IS NOT NULL)
    OR (v_candidate.max_customers IS NOT NULL AND v_baseline.max_customers IS NULL)
    OR (v_candidate.max_customers IS NOT NULL AND v_baseline.max_customers IS NOT NULL
      AND v_candidate.max_customers < v_baseline.max_customers)
    OR (COALESCE(v_baseline.includes_loyalty, false)
      AND NOT COALESCE(v_candidate.includes_loyalty, false))
    OR (COALESCE(v_baseline.includes_digital_card, false)
      AND NOT COALESCE(v_candidate.includes_digital_card, false))
    OR (COALESCE(v_baseline.includes_basic_insights, false)
      AND NOT COALESCE(v_candidate.includes_basic_insights, false)) THEN
    RETURN false;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
    FROM public.pos_plan_entitlements baseline_entitlement
    JOIN public.pos_entitlements entitlement
      ON entitlement.id = baseline_entitlement.entitlement_id
      AND entitlement.active
    WHERE baseline_entitlement.plan_code = p_baseline_plan_code
      AND NOT EXISTS (
        SELECT 1
        FROM public.pos_plan_entitlements candidate_entitlement
        JOIN public.pos_entitlements candidate_code
          ON candidate_code.id = candidate_entitlement.entitlement_id
          AND candidate_code.active
        WHERE candidate_entitlement.plan_code = p_candidate_plan_code
          AND candidate_code.code = entitlement.code
      )
  );
END
$function$;

COMMIT;
