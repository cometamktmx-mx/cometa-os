-- COMETA POS Commercial Grants V1 ACL corrective migration.
-- Apply only after 20260816_pos_commercial_grants_v1.sql.
BEGIN;

DO $guard$
DECLARE
  v_table_owner oid;
  v_service_role oid;
  v_service_role_is_superuser boolean;
BEGIN
  SELECT oid, rolsuper
    INTO v_service_role, v_service_role_is_superuser
  FROM pg_roles
  WHERE rolname = 'service_role';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_COMMERCIAL_GRANTS_SERVICE_ROLE_NOT_FOUND';
  END IF;

  SELECT relowner
    INTO v_table_owner
  FROM pg_class
  WHERE oid = 'public.pos_commercial_grants'::regclass;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_COMMERCIAL_GRANTS_TABLE_NOT_FOUND';
  END IF;

  IF v_table_owner = v_service_role OR v_service_role_is_superuser THEN
    RAISE EXCEPTION 'POS_COMMERCIAL_GRANTS_SERVICE_ROLE_ACL_UNENFORCEABLE'
      USING DETAIL = 'service_role owns the table or is a superuser; changing ownership requires explicit authorization.';
  END IF;
END
$guard$;

REVOKE ALL PRIVILEGES ON TABLE public.pos_commercial_grants FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pos_commercial_grants TO service_role;

DO $verify$
BEGIN
  IF has_table_privilege('service_role', 'public.pos_commercial_grants', 'DELETE') THEN
    RAISE EXCEPTION 'POS_COMMERCIAL_GRANTS_SERVICE_ROLE_DELETE_REMAINS'
      USING DETAIL = 'An inherited privilege still grants DELETE to service_role.';
  END IF;
END
$verify$;

COMMIT;
