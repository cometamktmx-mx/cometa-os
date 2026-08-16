-- COMETA POS RBAC V1A FOUNDATION
BEGIN;

DO $role_constraint$
DECLARE
  v_constraint_name text;
  v_constraint_count integer;
BEGIN
  SELECT count(*), max(constraint_row.conname)
  INTO v_constraint_count, v_constraint_name
  FROM pg_constraint constraint_row
  WHERE constraint_row.conrelid = 'public.user_brand_access'::regclass
    AND constraint_row.contype = 'c'
    AND pg_get_constraintdef(constraint_row.oid) LIKE '%access_role%'
    AND pg_get_constraintdef(constraint_row.oid) LIKE '%owner%'
    AND pg_get_constraintdef(constraint_row.oid) LIKE '%editor%'
    AND pg_get_constraintdef(constraint_row.oid) LIKE '%viewer%';

  IF v_constraint_count <> 1 OR v_constraint_name IS NULL THEN
    RAISE EXCEPTION 'POS_RBAC_ACCESS_ROLE_CONSTRAINT_UNEXPECTED_%', v_constraint_count;
  END IF;

  EXECUTE format(
    'ALTER TABLE public.user_brand_access DROP CONSTRAINT %I',
    v_constraint_name
  );
END
$role_constraint$;

ALTER TABLE public.user_brand_access
  ADD CONSTRAINT user_brand_access_access_role_rbac_v1a_ck
  CHECK (access_role IN (
    'owner', 'admin', 'manager', 'cashier', 'inventory', 'editor', 'viewer'
  ));

CREATE TABLE public.pos_user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_slug text NOT NULL REFERENCES public.brands(slug) ON UPDATE CASCADE ON DELETE RESTRICT,
  email text NOT NULL,
  access_role text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz NULL,
  revoked_at timestamptz NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT pos_user_invitations_email_normalized_ck CHECK (
    email = lower(btrim(email)) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  CONSTRAINT pos_user_invitations_role_ck CHECK (
    access_role IN ('admin', 'manager', 'cashier', 'inventory')
  ),
  CONSTRAINT pos_user_invitations_status_ck CHECK (
    status IN ('pending', 'accepted', 'revoked', 'expired')
  ),
  CONSTRAINT pos_user_invitations_expiry_ck CHECK (expires_at > created_at),
  CONSTRAINT pos_user_invitations_metadata_ck CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT pos_user_invitations_state_dates_ck CHECK (
    (status = 'pending' AND accepted_at IS NULL AND revoked_at IS NULL)
    OR (status = 'accepted' AND accepted_at IS NOT NULL AND revoked_at IS NULL)
    OR (status = 'revoked' AND accepted_at IS NULL AND revoked_at IS NOT NULL)
    OR (status = 'expired' AND accepted_at IS NULL AND revoked_at IS NULL)
  )
);

CREATE UNIQUE INDEX pos_user_invitations_pending_email_uidx
  ON public.pos_user_invitations (brand_slug, email)
  WHERE status = 'pending';

CREATE INDEX pos_user_invitations_brand_status_idx
  ON public.pos_user_invitations (brand_slug, status, expires_at);

ALTER TABLE public.pos_user_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pos_user_invitations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pos_user_invitations TO service_role;

CREATE FUNCTION public.pos_rbac_protect_last_owner_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_other_active_owners integer;
  v_still_active_owner boolean;
BEGIN
  IF OLD.access_role <> 'owner' OR OLD.status <> 'active' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  v_still_active_owner := TG_OP <> 'DELETE'
    AND NEW.access_role = 'owner'
    AND NEW.status = 'active';

  IF v_still_active_owner THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('pos_rbac_owner'),
    hashtext(OLD.brand_slug)
  );

  PERFORM 1
  FROM public.user_brand_access membership
  WHERE membership.brand_slug = OLD.brand_slug
  FOR UPDATE;

  SELECT count(*)
  INTO v_other_active_owners
  FROM public.user_brand_access membership
  WHERE membership.brand_slug = OLD.brand_slug
    AND membership.access_role = 'owner'
    AND membership.status = 'active'
    AND membership.user_id <> OLD.user_id;

  IF v_other_active_owners = 0 THEN
    RAISE EXCEPTION 'POS_LAST_OWNER_REQUIRED';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$function$;

CREATE TRIGGER user_brand_access_last_owner_rbac_v1a
BEFORE UPDATE OF access_role, status OR DELETE
ON public.user_brand_access
FOR EACH ROW
EXECUTE FUNCTION public.pos_rbac_protect_last_owner_v1();

CREATE FUNCTION public.pos_change_brand_membership_role_v1(
  p_brand_slug text,
  p_target_user_id uuid,
  p_new_role text,
  p_actor_user_id uuid
)
RETURNS public.user_brand_access
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_slug text := btrim(p_brand_slug);
  v_actor public.user_brand_access%ROWTYPE;
  v_target public.user_brand_access%ROWTYPE;
BEGIN
  IF v_slug = '' OR p_target_user_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'POS_RBAC_MEMBERSHIP_INPUT_REQUIRED';
  END IF;
  IF p_new_role NOT IN ('owner', 'admin', 'manager', 'cashier', 'inventory') THEN
    RAISE EXCEPTION 'POS_RBAC_ROLE_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pos_rbac_membership'), hashtext(v_slug));

  SELECT * INTO v_actor FROM public.user_brand_access
  WHERE user_id = p_actor_user_id AND brand_slug = v_slug AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND OR v_actor.access_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'POS_PERMISSION_REQUIRED';
  END IF;

  SELECT * INTO v_target FROM public.user_brand_access
  WHERE user_id = p_target_user_id AND brand_slug = v_slug
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'POS_MEMBERSHIP_NOT_FOUND'; END IF;

  IF v_actor.access_role = 'admin' THEN
    IF p_actor_user_id = p_target_user_id
      OR v_target.access_role IN ('owner', 'admin')
      OR p_new_role NOT IN ('manager', 'cashier', 'inventory') THEN
      RAISE EXCEPTION 'POS_ROLE_ESCALATION_FORBIDDEN';
    END IF;
  END IF;

  UPDATE public.user_brand_access
  SET access_role = p_new_role, updated_at = now()
  WHERE user_id = p_target_user_id AND brand_slug = v_slug
  RETURNING * INTO v_target;

  RETURN v_target;
END
$function$;

CREATE FUNCTION public.pos_revoke_brand_membership_v1(
  p_brand_slug text,
  p_target_user_id uuid,
  p_actor_user_id uuid
)
RETURNS public.user_brand_access
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_slug text := btrim(p_brand_slug);
  v_actor public.user_brand_access%ROWTYPE;
  v_target public.user_brand_access%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pos_rbac_membership'), hashtext(v_slug));
  SELECT * INTO v_actor FROM public.user_brand_access
  WHERE user_id = p_actor_user_id AND brand_slug = v_slug AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND OR v_actor.access_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'POS_PERMISSION_REQUIRED';
  END IF;

  SELECT * INTO v_target FROM public.user_brand_access
  WHERE user_id = p_target_user_id AND brand_slug = v_slug
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'POS_MEMBERSHIP_NOT_FOUND'; END IF;

  IF v_actor.access_role = 'admin'
    AND (p_actor_user_id = p_target_user_id OR v_target.access_role IN ('owner', 'admin')) THEN
    RAISE EXCEPTION 'POS_ROLE_ESCALATION_FORBIDDEN';
  END IF;

  UPDATE public.user_brand_access
  SET status = 'inactive', updated_at = now()
  WHERE user_id = p_target_user_id AND brand_slug = v_slug
  RETURNING * INTO v_target;
  RETURN v_target;
END
$function$;

CREATE FUNCTION public.pos_reserve_user_invitation_v1(
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

  SELECT limits.max_users INTO v_max_users
  FROM public.pos_subscriptions subscription
  JOIN public.pos_plan_limits limits ON limits.plan_code = subscription.plan_code
  WHERE subscription.brand_slug = v_slug
  FOR UPDATE OF subscription;
  IF NOT FOUND THEN RAISE EXCEPTION 'POS_SUBSCRIPTION_NOT_FOUND'; END IF;

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

CREATE FUNCTION public.pos_revoke_user_invitation_v1(
  p_brand_slug text,
  p_invitation_id uuid,
  p_actor_user_id uuid
)
RETURNS public.pos_user_invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_slug text := btrim(p_brand_slug);
  v_actor public.user_brand_access%ROWTYPE;
  v_invitation public.pos_user_invitations%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pos_rbac_seats'), hashtext(v_slug));
  SELECT * INTO v_actor FROM public.user_brand_access
  WHERE user_id = p_actor_user_id AND brand_slug = v_slug AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND OR v_actor.access_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'POS_PERMISSION_REQUIRED';
  END IF;

  SELECT * INTO v_invitation FROM public.pos_user_invitations
  WHERE id = p_invitation_id AND brand_slug = v_slug
  FOR UPDATE;
  IF NOT FOUND OR v_invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'POS_INVITATION_NOT_PENDING';
  END IF;
  IF v_actor.access_role = 'admin' AND v_invitation.access_role = 'admin' THEN
    RAISE EXCEPTION 'POS_ROLE_ESCALATION_FORBIDDEN';
  END IF;

  UPDATE public.pos_user_invitations
  SET status = 'revoked', revoked_at = now()
  WHERE id = v_invitation.id
  RETURNING * INTO v_invitation;
  RETURN v_invitation;
END
$function$;

CREATE FUNCTION public.pos_accept_user_invitation_v1(
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

  SELECT limits.max_users INTO v_max_users
  FROM public.pos_subscriptions subscription
  JOIN public.pos_plan_limits limits ON limits.plan_code = subscription.plan_code
  WHERE subscription.brand_slug = v_slug
  FOR UPDATE OF subscription;
  IF NOT FOUND THEN RAISE EXCEPTION 'POS_SUBSCRIPTION_NOT_FOUND'; END IF;

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

REVOKE EXECUTE ON FUNCTION public.pos_rbac_protect_last_owner_v1() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pos_change_brand_membership_role_v1(text,uuid,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pos_revoke_brand_membership_v1(text,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pos_reserve_user_invitation_v1(text,text,text,uuid,timestamptz,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pos_revoke_user_invitation_v1(text,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pos_accept_user_invitation_v1(text,uuid,uuid,text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.pos_change_brand_membership_role_v1(text,uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_revoke_brand_membership_v1(text,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_reserve_user_invitation_v1(text,text,text,uuid,timestamptz,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_revoke_user_invitation_v1(text,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_accept_user_invitation_v1(text,uuid,uuid,text) TO service_role;

COMMIT;
