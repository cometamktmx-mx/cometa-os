-- COMETA POS Commercial Grants V1.
-- Grants are a server-only commercial layer. They never rewrite billing truth
-- in pos_subscriptions or the native subscription lifecycle.
BEGIN;

CREATE TABLE public.pos_commercial_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_slug text NOT NULL
    REFERENCES public.brands(slug)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  grant_code text NOT NULL
    CHECK (btrim(grant_code) <> ''),
  grant_type text NOT NULL
    CHECK (grant_type = 'complimentary'),
  plan_code text NOT NULL
    REFERENCES public.pos_plans(code)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  status text NOT NULL
    CHECK (status IN ('active', 'revoked')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text NULL,
  created_by uuid NULL,
  revoked_at timestamptz NULL,
  revoked_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_commercial_grants_window_ck CHECK (ends_at > starts_at),
  CONSTRAINT pos_commercial_grants_revocation_ck CHECK (
    (status = 'active' AND revoked_at IS NULL)
    OR
    (status = 'revoked' AND revoked_at IS NOT NULL)
  )
);

CREATE INDEX pos_commercial_grants_effective_idx
  ON public.pos_commercial_grants (brand_slug, starts_at, ends_at)
  WHERE status = 'active';

CREATE FUNCTION public.pos_commercial_grants_reject_overlap_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- btree_gist is not a versioned dependency in this repository. A
  -- transaction-scoped advisory lock serializes overlap checks per brand
  -- without introducing an extension and covers concurrent service-role writes.
  IF NEW.status = 'active' THEN
    PERFORM pg_advisory_xact_lock(
      hashtext('pos_commercial_grants_overlap'),
      hashtext(NEW.brand_slug)
    );

    IF EXISTS (
      SELECT 1
      FROM public.pos_commercial_grants pcg
      WHERE pcg.brand_slug = NEW.brand_slug
        AND pcg.status = 'active'
        AND pcg.id IS DISTINCT FROM NEW.id
        AND pcg.starts_at < NEW.ends_at
        AND pcg.ends_at > NEW.starts_at
    ) THEN
      RAISE EXCEPTION 'POS_COMMERCIAL_GRANT_OVERLAP';
    END IF;
  END IF;

  RETURN NEW;
END
$function$;

CREATE FUNCTION public.pos_commercial_grants_protect_economics_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.brand_slug IS DISTINCT FROM OLD.brand_slug
    OR NEW.grant_code IS DISTINCT FROM OLD.grant_code
    OR NEW.grant_type IS DISTINCT FROM OLD.grant_type
    OR NEW.plan_code IS DISTINCT FROM OLD.plan_code
    OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
    OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
    OR NEW.reason IS DISTINCT FROM OLD.reason
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'POS_COMMERCIAL_GRANT_IMMUTABLE';
  END IF;

  IF OLD.status = 'revoked' THEN
    RAISE EXCEPTION 'POS_COMMERCIAL_GRANT_REVOKED_IMMUTABLE';
  END IF;

  IF NEW.status <> 'revoked' THEN
    RAISE EXCEPTION 'POS_COMMERCIAL_GRANT_REVOKE_REQUIRED';
  END IF;

  RETURN NEW;
END
$function$;

CREATE FUNCTION public.pos_commercial_grants_set_updated_at_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$function$;

CREATE TRIGGER pos_commercial_grants_overlap_v1
  BEFORE INSERT OR UPDATE ON public.pos_commercial_grants
  FOR EACH ROW
  EXECUTE FUNCTION public.pos_commercial_grants_reject_overlap_v1();

CREATE TRIGGER pos_commercial_grants_immutability_v1
  BEFORE UPDATE ON public.pos_commercial_grants
  FOR EACH ROW
  EXECUTE FUNCTION public.pos_commercial_grants_protect_economics_v1();

CREATE TRIGGER pos_commercial_grants_updated_at_v1
  BEFORE UPDATE ON public.pos_commercial_grants
  FOR EACH ROW
  EXECUTE FUNCTION public.pos_commercial_grants_set_updated_at_v1();

ALTER TABLE public.pos_commercial_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pos_commercial_grants
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pos_commercial_grants
  TO service_role;

CREATE FUNCTION public.pos_plan_dominates_v1(
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
  v_candidate public.pos_plan_limits%ROWTYPE;
  v_baseline public.pos_plan_limits%ROWTYPE;
BEGIN
  IF p_candidate_plan_code IS NULL
    OR p_baseline_plan_code IS NULL
    OR btrim(p_candidate_plan_code) = ''
    OR btrim(p_baseline_plan_code) = '' THEN
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

  IF v_candidate.max_locations IS NULL
    OR v_candidate.max_registers IS NULL
    OR v_candidate.max_users IS NULL
    OR v_candidate.max_products IS NULL
    OR v_candidate.max_customers IS NULL
    OR v_baseline.max_locations IS NULL
    OR v_baseline.max_registers IS NULL
    OR v_baseline.max_users IS NULL
    OR v_baseline.max_products IS NULL
    OR v_baseline.max_customers IS NULL THEN
    RETURN false;
  END IF;

  IF v_candidate.max_locations < v_baseline.max_locations
    OR v_candidate.max_registers < v_baseline.max_registers
    OR v_candidate.max_users < v_baseline.max_users
    OR v_candidate.max_products < v_baseline.max_products
    OR v_candidate.max_customers < v_baseline.max_customers
    OR (v_baseline.includes_loyalty AND NOT v_candidate.includes_loyalty)
    OR (v_baseline.includes_digital_card AND NOT v_candidate.includes_digital_card)
    OR (v_baseline.includes_basic_insights AND NOT v_candidate.includes_basic_insights) THEN
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

CREATE FUNCTION public.pos_get_effective_commercial_access(p_brand_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_slug text := btrim(COALESCE(p_brand_slug, ''));
  v_subscription public.pos_subscriptions%ROWTYPE;
  v_subscription_plan public.pos_plans%ROWTYPE;
  v_grant public.pos_commercial_grants%ROWTYPE;
  v_grant_plan public.pos_plans%ROWTYPE;
  v_subscription_found boolean := false;
  v_subscription_plan_valid boolean := false;
  v_grant_found boolean := false;
  v_grant_effective boolean := false;
  v_native_access_allowed boolean := false;
  v_lifecycle jsonb := NULL;
  v_effective_plan_code text := NULL;
  v_plan_source text := NULL;
  v_access_source text := 'none';
  v_access_allowed boolean := false;
  v_reason text := NULL;
BEGIN
  IF v_slug = '' THEN
    RAISE EXCEPTION 'POS_COMMERCIAL_ACCESS_BRAND_REQUIRED';
  END IF;

  SELECT * INTO v_subscription
  FROM public.pos_subscriptions
  WHERE brand_slug = v_slug;
  v_subscription_found := FOUND;

  IF v_subscription_found THEN
    v_lifecycle := public.pos_compute_subscription_lifecycle(v_slug);
    v_native_access_allowed := COALESCE(
      (v_lifecycle ->> 'accessAllowed')::boolean,
      false
    );

    SELECT * INTO v_subscription_plan
    FROM public.pos_plans
    WHERE code = v_subscription.plan_code;
    v_subscription_plan_valid := FOUND AND v_subscription_plan.active;

    IF NOT v_subscription_plan_valid THEN
      v_native_access_allowed := false;
      v_reason := 'SUBSCRIPTION_PLAN_INACTIVE';
    END IF;
  END IF;

  SELECT * INTO v_grant
  FROM public.pos_commercial_grants
  WHERE brand_slug = v_slug
    AND status = 'active'
    AND starts_at <= now()
    AND ends_at > now()
  ORDER BY starts_at DESC, created_at DESC, id DESC
  LIMIT 1;
  v_grant_found := FOUND;

  IF v_grant_found THEN
    SELECT * INTO v_grant_plan
    FROM public.pos_plans
    WHERE code = v_grant.plan_code
      AND active;
    v_grant_effective := FOUND;

    IF NOT v_grant_effective THEN
      v_reason := 'COMMERCIAL_GRANT_PLAN_INACTIVE';
    END IF;
  END IF;

  IF v_subscription_plan_valid THEN
    v_effective_plan_code := v_subscription.plan_code;
    v_plan_source := 'subscription';
  END IF;

  IF v_grant_effective THEN
    IF v_effective_plan_code IS NULL
      OR public.pos_plan_dominates_v1(v_grant.plan_code, v_effective_plan_code) THEN
      v_effective_plan_code := v_grant.plan_code;
      v_plan_source := 'commercial_grant';
    END IF;
  END IF;

  IF v_native_access_allowed THEN
    v_access_allowed := true;
    v_access_source := CASE
      WHEN v_lifecycle ->> 'effectiveStatus' = 'trial' THEN 'trial'
      ELSE 'subscription'
    END;
  ELSIF v_grant_effective THEN
    v_access_allowed := true;
    v_access_source := 'commercial_grant';
  ELSIF NOT v_subscription_found THEN
    v_reason := COALESCE(v_reason, 'SUBSCRIPTION_NOT_CONFIGURED');
  ELSE
    v_reason := COALESCE(v_reason, v_lifecycle ->> 'reason', 'SUBSCRIPTION_ACCESS_DENIED');
  END IF;

  RETURN jsonb_build_object(
    'subscriptionLifecycle', v_lifecycle,
    'effective', jsonb_build_object(
      'accessAllowed', v_access_allowed,
      'accessSource', v_access_source,
      'planCode', v_effective_plan_code,
      'planSource', v_plan_source,
      'reason', v_reason
    ),
    'grant', jsonb_build_object(
      'active', v_grant_effective,
      'planCode', CASE WHEN v_grant_effective THEN v_grant.plan_code ELSE NULL END,
      'type', CASE WHEN v_grant_effective THEN v_grant.grant_type ELSE NULL END,
      'startsAt', CASE WHEN v_grant_effective THEN v_grant.starts_at ELSE NULL END,
      'endsAt', CASE WHEN v_grant_effective THEN v_grant.ends_at ELSE NULL END
    )
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.pos_get_brand_entitlements(p_brand_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  s public.pos_subscriptions%ROWTYPE;
  p public.pos_plans%ROWTYPE;
  commercial_access jsonb;
  effective_plan_code text;
  allowed boolean;
  codes jsonb := '[]';
  overrides jsonb := '[]';
BEGIN
  IF p_brand_slug IS NULL OR btrim(p_brand_slug) = '' THEN
    RAISE EXCEPTION 'POS_ENTITLEMENTS_BRAND_REQUIRED';
  END IF;

  SELECT * INTO s
  FROM public.pos_subscriptions
  WHERE brand_slug = btrim(p_brand_slug);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_ENTITLEMENTS_SUBSCRIPTION_NOT_FOUND';
  END IF;

  commercial_access := public.pos_get_effective_commercial_access(s.brand_slug);
  allowed := COALESCE(
    (commercial_access #>> '{effective,accessAllowed}')::boolean,
    false
  );
  effective_plan_code := commercial_access #>> '{effective,planCode}';

  IF effective_plan_code IS NULL OR btrim(effective_plan_code) = '' THEN
    RAISE EXCEPTION 'POS_ENTITLEMENTS_EFFECTIVE_PLAN_NOT_FOUND';
  END IF;

  SELECT * INTO p
  FROM public.pos_plans
  WHERE code = effective_plan_code
    AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_ENTITLEMENTS_PLAN_NOT_FOUND';
  END IF;

  WITH ranked AS (
    SELECT o.*,
           row_number() OVER (
             PARTITION BY entitlement_id
             ORDER BY starts_at DESC NULLS LAST, created_at DESC, id DESC
           ) AS rn
    FROM public.pos_brand_entitlement_overrides o
    WHERE o.brand_slug = s.brand_slug
      AND o.brand_id = s.brand_id
      AND (o.starts_at IS NULL OR o.starts_at <= now())
      AND (o.ends_at IS NULL OR o.ends_at > now())
  ), effective_overrides AS (
    SELECT * FROM ranked WHERE rn = 1
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'entitlementCode', e.code,
        'enabled', o.enabled,
        'reason', o.reason,
        'startsAt', o.starts_at,
        'endsAt', o.ends_at
      ) ORDER BY e.code
    ),
    '[]'
  )
  INTO overrides
  FROM effective_overrides o
  JOIN public.pos_entitlements e ON e.id = o.entitlement_id;

  IF allowed THEN
    WITH ranked AS (
      SELECT o.entitlement_id,
             o.enabled,
             row_number() OVER (
               PARTITION BY entitlement_id
               ORDER BY starts_at DESC NULLS LAST, created_at DESC, id DESC
             ) AS rn
      FROM public.pos_brand_entitlement_overrides o
      WHERE o.brand_slug = s.brand_slug
        AND o.brand_id = s.brand_id
        AND (o.starts_at IS NULL OR o.starts_at <= now())
        AND (o.ends_at IS NULL OR o.ends_at > now())
    ), effective_overrides AS (
      SELECT entitlement_id, enabled FROM ranked WHERE rn = 1
    ), final_entitlements AS (
      SELECT e.code
      FROM public.pos_plan_entitlements pe
      JOIN public.pos_entitlements e
        ON e.id = pe.entitlement_id AND e.active
      LEFT JOIN effective_overrides o ON o.entitlement_id = e.id
      WHERE pe.plan_code = effective_plan_code
        AND COALESCE(o.enabled, true)
      UNION
      SELECT e.code
      FROM effective_overrides o
      JOIN public.pos_entitlements e
        ON e.id = o.entitlement_id AND e.active
      WHERE o.enabled
    )
    SELECT COALESCE(jsonb_agg(code ORDER BY code), '[]')
    INTO codes
    FROM final_entitlements;
  END IF;

  RETURN jsonb_build_object(
    'plan', jsonb_build_object('code', p.code, 'name', p.name),
    'subscription', jsonb_build_object(
      'status', s.status,
      'trialEndsAt', s.trial_ends_at,
      'currentPeriodStart', s.current_period_start,
      'currentPeriodEnd', s.current_period_end,
      'graceEndsAt', s.grace_ends_at
    ),
    'entitlements', codes,
    'overrides', overrides
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.pos_reserve_user_invitation_v1(
  p_brand_slug text,
  p_email text,
  p_access_role text,
  p_invited_by uuid,
  p_expires_at timestamptz,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS public.pos_user_invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_slug text := btrim(p_brand_slug);
  v_email text := lower(btrim(p_email));
  v_actor public.user_brand_access%ROWTYPE;
  v_invitation public.pos_user_invitations%ROWTYPE;
  v_commercial_access jsonb;
  v_effective_plan_code text;
  v_max_users integer;
  v_active_memberships integer;
  v_pending_invitations integer;
BEGIN
  IF v_slug = '' OR v_email = '' OR p_invited_by IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'POS_INVITATION_INPUT_INVALID';
  END IF;
  IF p_access_role NOT IN ('admin', 'manager', 'cashier', 'inventory') THEN
    RAISE EXCEPTION 'POS_RBAC_ROLE_INVALID';
  END IF;
  IF p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' THEN
    RAISE EXCEPTION 'POS_INVITATION_METADATA_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pos_rbac_seats'), hashtext(v_slug));

  SELECT * INTO v_actor FROM public.user_brand_access
  WHERE user_id = p_invited_by AND brand_slug = v_slug AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND OR v_actor.access_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'POS_PERMISSION_REQUIRED';
  END IF;
  IF v_actor.access_role = 'admin' AND p_access_role = 'admin' THEN
    RAISE EXCEPTION 'POS_ROLE_ESCALATION_FORBIDDEN';
  END IF;

  UPDATE public.pos_user_invitations
  SET status = 'expired'
  WHERE brand_slug = v_slug AND status = 'pending' AND expires_at <= now();

  IF EXISTS (
    SELECT 1 FROM public.user_brand_access membership
    JOIN auth.users auth_user ON auth_user.id = membership.user_id
    WHERE membership.brand_slug = v_slug AND membership.status = 'active'
      AND lower(auth_user.email) = v_email
  ) THEN
    RAISE EXCEPTION 'POS_MEMBERSHIP_ALREADY_EXISTS';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pos_user_invitations invitation
    WHERE invitation.brand_slug = v_slug AND invitation.email = v_email
      AND invitation.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'POS_INVITATION_ALREADY_PENDING';
  END IF;

  v_commercial_access := public.pos_get_effective_commercial_access(v_slug);
  v_effective_plan_code := v_commercial_access #>> '{effective,planCode}';
  IF v_effective_plan_code IS NULL OR btrim(v_effective_plan_code) = '' THEN
    RAISE EXCEPTION 'POS_SUBSCRIPTION_NOT_FOUND';
  END IF;

  SELECT limits.max_users INTO v_max_users
  FROM public.pos_plan_limits limits
  WHERE limits.plan_code = v_effective_plan_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'POS_PLAN_LIMITS_NOT_FOUND'; END IF;

  SELECT count(*) INTO v_active_memberships FROM public.user_brand_access
  WHERE brand_slug = v_slug AND status = 'active';
  SELECT count(*) INTO v_pending_invitations FROM public.pos_user_invitations
  WHERE brand_slug = v_slug AND status = 'pending' AND expires_at > now();

  IF v_active_memberships + v_pending_invitations >= v_max_users THEN
    RAISE EXCEPTION 'POS_USER_LIMIT_REACHED';
  END IF;

  INSERT INTO public.pos_user_invitations (
    brand_slug, email, access_role, status, invited_by, expires_at, metadata
  ) VALUES (
    v_slug, v_email, p_access_role, 'pending', p_invited_by, p_expires_at, p_metadata
  ) RETURNING * INTO v_invitation;
  RETURN v_invitation;
END
$function$;

CREATE OR REPLACE FUNCTION public.pos_accept_user_invitation_v1(
  p_brand_slug text,
  p_invitation_id uuid,
  p_user_id uuid,
  p_email text
)
RETURNS public.user_brand_access
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_slug text := btrim(p_brand_slug);
  v_email text := lower(btrim(p_email));
  v_auth_email text;
  v_invitation public.pos_user_invitations%ROWTYPE;
  v_membership public.user_brand_access%ROWTYPE;
  v_commercial_access jsonb;
  v_effective_plan_code text;
  v_max_users integer;
  v_active_memberships integer;
  v_pending_invitations integer;
BEGIN
  IF v_slug = '' OR p_invitation_id IS NULL OR p_user_id IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'POS_INVITATION_INPUT_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pos_rbac_seats'), hashtext(v_slug));

  SELECT lower(auth_user.email) INTO v_auth_email
  FROM auth.users auth_user WHERE auth_user.id = p_user_id;
  IF NOT FOUND OR v_auth_email IS DISTINCT FROM v_email THEN
    RAISE EXCEPTION 'POS_INVITATION_EMAIL_MISMATCH';
  END IF;

  SELECT * INTO v_invitation FROM public.pos_user_invitations
  WHERE id = p_invitation_id AND brand_slug = v_slug
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'POS_INVITATION_NOT_FOUND'; END IF;
  IF v_invitation.status <> 'pending' THEN RAISE EXCEPTION 'POS_INVITATION_NOT_PENDING'; END IF;
  IF v_invitation.expires_at <= now() THEN
    UPDATE public.pos_user_invitations SET status = 'expired' WHERE id = v_invitation.id;
    RAISE EXCEPTION 'POS_INVITATION_EXPIRED';
  END IF;
  IF v_invitation.email IS DISTINCT FROM v_email THEN
    RAISE EXCEPTION 'POS_INVITATION_EMAIL_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_brand_access membership
    WHERE membership.user_id = p_user_id AND membership.brand_slug = v_slug
      AND membership.status = 'active'
  ) THEN
    RAISE EXCEPTION 'POS_MEMBERSHIP_ALREADY_EXISTS';
  END IF;

  v_commercial_access := public.pos_get_effective_commercial_access(v_slug);
  v_effective_plan_code := v_commercial_access #>> '{effective,planCode}';
  IF v_effective_plan_code IS NULL OR btrim(v_effective_plan_code) = '' THEN
    RAISE EXCEPTION 'POS_SUBSCRIPTION_NOT_FOUND';
  END IF;

  SELECT limits.max_users INTO v_max_users
  FROM public.pos_plan_limits limits
  WHERE limits.plan_code = v_effective_plan_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'POS_PLAN_LIMITS_NOT_FOUND'; END IF;

  SELECT count(*) INTO v_active_memberships FROM public.user_brand_access
  WHERE brand_slug = v_slug AND status = 'active';
  SELECT count(*) INTO v_pending_invitations FROM public.pos_user_invitations
  WHERE brand_slug = v_slug AND status = 'pending' AND expires_at > now();

  IF v_active_memberships + v_pending_invitations > v_max_users THEN
    RAISE EXCEPTION 'POS_USER_LIMIT_REACHED';
  END IF;

  INSERT INTO public.user_brand_access (
    user_id, brand_slug, access_role, status, updated_at
  ) VALUES (
    p_user_id, v_slug, v_invitation.access_role, 'active', now()
  )
  ON CONFLICT (user_id, brand_slug) DO UPDATE SET
    access_role = EXCLUDED.access_role,
    status = 'active',
    updated_at = now()
  RETURNING * INTO v_membership;

  UPDATE public.pos_user_invitations
  SET status = 'accepted', accepted_at = now()
  WHERE id = v_invitation.id;

  RETURN v_membership;
END
$function$;

REVOKE ALL ON FUNCTION
  public.pos_commercial_grants_reject_overlap_v1(),
  public.pos_commercial_grants_protect_economics_v1(),
  public.pos_commercial_grants_set_updated_at_v1(),
  public.pos_plan_dominates_v1(text, text),
  public.pos_get_effective_commercial_access(text),
  public.pos_get_brand_entitlements(text),
  public.pos_reserve_user_invitation_v1(text, text, text, uuid, timestamptz, jsonb),
  public.pos_accept_user_invitation_v1(text, uuid, uuid, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.pos_get_effective_commercial_access(text),
  public.pos_get_brand_entitlements(text),
  public.pos_reserve_user_invitation_v1(text, text, text, uuid, timestamptz, jsonb),
  public.pos_accept_user_invitation_v1(text, uuid, uuid, text)
TO service_role;

COMMIT;
