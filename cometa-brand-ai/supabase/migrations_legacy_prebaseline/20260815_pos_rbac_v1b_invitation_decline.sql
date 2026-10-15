-- COMETA POS RBAC V1B.1: authenticated invitee decline authority.
-- This migration intentionally adds no membership table or browser-write path.
BEGIN;

CREATE FUNCTION public.pos_decline_user_invitation_v1(
  p_invitation_id uuid,
  p_user_id uuid,
  p_email text
)
RETURNS public.pos_user_invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_email text := lower(btrim(p_email));
  v_auth_email text;
  v_brand_slug text;
  v_invitation public.pos_user_invitations%ROWTYPE;
BEGIN
  IF p_invitation_id IS NULL OR p_user_id IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'POS_INVITATION_INPUT_INVALID';
  END IF;

  SELECT invitation.brand_slug
  INTO v_brand_slug
  FROM public.pos_user_invitations invitation
  WHERE invitation.id = p_invitation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_INVITATION_NOT_FOUND';
  END IF;

  -- Match the lock namespace used by V1A reservation and acceptance so a
  -- decline cannot race a concurrent seat calculation or acceptance.
  PERFORM pg_advisory_xact_lock(hashtext('pos_rbac_seats'), hashtext(v_brand_slug));

  SELECT lower(auth_user.email)
  INTO v_auth_email
  FROM auth.users auth_user
  WHERE auth_user.id = p_user_id;

  IF NOT FOUND OR v_auth_email IS DISTINCT FROM v_email THEN
    RAISE EXCEPTION 'POS_INVITATION_EMAIL_MISMATCH';
  END IF;

  SELECT *
  INTO v_invitation
  FROM public.pos_user_invitations invitation
  WHERE invitation.id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_INVITATION_NOT_FOUND';
  END IF;

  IF v_invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'POS_INVITATION_NOT_PENDING';
  END IF;

  IF v_invitation.expires_at <= now() THEN
    UPDATE public.pos_user_invitations
    SET status = 'expired'
    WHERE id = v_invitation.id;

    RAISE EXCEPTION 'POS_INVITATION_EXPIRED';
  END IF;

  IF v_invitation.email IS DISTINCT FROM v_email THEN
    RAISE EXCEPTION 'POS_INVITATION_EMAIL_MISMATCH';
  END IF;

  UPDATE public.pos_user_invitations
  SET status = 'revoked',
      revoked_at = now()
  WHERE id = v_invitation.id
  RETURNING * INTO v_invitation;

  RETURN v_invitation;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.pos_decline_user_invitation_v1(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_decline_user_invitation_v1(uuid,uuid,text)
  TO service_role;

COMMIT;
