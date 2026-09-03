


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";






CREATE OR REPLACE FUNCTION "public"."brand_os_access_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- clock_timestamp() records the actual update instant, including when a
  -- verification suite performs several updates in one transaction.
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END
$$;


ALTER FUNCTION "public"."brand_os_access_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_orion_evidence_from_brand_analysis"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.instagram is not null and trim(new.instagram) <> '' then
    insert into public.orion_evidence (
      brand_analysis_id,
      brand_name,
      source_type,
      source_url,
      source_name,
      evidence_status,
      collection_method,
      raw_data,
      evidence_summary,
      confidence_score
    )
    values (
      new.id,
      new.brand_name,
      'instagram',
      new.instagram,
      'Instagram',
      'pending',
      'form_input',
      jsonb_build_object('submitted_url', new.instagram),
      'Perfil de Instagram recibido desde el formulario de ORION. Pendiente de validación visual o scraping externo.',
      40
    );
  end if;

  if new.facebook is not null and trim(new.facebook) <> '' then
    insert into public.orion_evidence (
      brand_analysis_id,
      brand_name,
      source_type,
      source_url,
      source_name,
      evidence_status,
      collection_method,
      raw_data,
      evidence_summary,
      confidence_score
    )
    values (
      new.id,
      new.brand_name,
      'facebook',
      new.facebook,
      'Facebook',
      'pending',
      'form_input',
      jsonb_build_object('submitted_url', new.facebook),
      'Perfil de Facebook recibido desde el formulario de ORION. Pendiente de validación visual o scraping externo.',
      40
    );
  end if;

  if new.tiktok is not null and trim(new.tiktok) <> '' then
    insert into public.orion_evidence (
      brand_analysis_id,
      brand_name,
      source_type,
      source_url,
      source_name,
      evidence_status,
      collection_method,
      raw_data,
      evidence_summary,
      confidence_score
    )
    values (
      new.id,
      new.brand_name,
      'tiktok',
      new.tiktok,
      'TikTok',
      'pending',
      'form_input',
      jsonb_build_object('submitted_url', new.tiktok),
      'Perfil de TikTok recibido desde el formulario de ORION. Pendiente de validación visual o scraping externo.',
      40
    );
  end if;

  if new.website is not null and trim(new.website) <> '' then
    insert into public.orion_evidence (
      brand_analysis_id,
      brand_name,
      source_type,
      source_url,
      source_name,
      evidence_status,
      collection_method,
      raw_data,
      evidence_summary,
      confidence_score
    )
    values (
      new.id,
      new.brand_name,
      'website',
      new.website,
      'Website',
      'pending',
      'form_input',
      jsonb_build_object('submitted_url', new.website),
      'Sitio web recibido desde el formulario de ORION. Pendiente de análisis con Website Analyzer Lite.',
      50
    );
  end if;

  if new.competitors is not null and trim(new.competitors::text) <> '' then
    insert into public.orion_evidence (
      brand_analysis_id,
      brand_name,
      source_type,
      source_url,
      source_name,
      evidence_status,
      collection_method,
      raw_data,
      evidence_summary,
      confidence_score
    )
    values (
      new.id,
      new.brand_name,
      'competitor',
      null,
      'Competidores declarados',
      'pending',
      'form_input',
      jsonb_build_object('submitted_competitors', new.competitors),
      'Competidores recibidos desde el formulario de ORION. Pendiente de análisis comparativo.',
      35
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."create_orion_evidence_from_brand_analysis"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_orion_scrape_jobs_from_brand_analysis"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.instagram is not null and trim(new.instagram) <> '' then
    insert into public.orion_scrape_jobs (
      brand_analysis_id,
      brand_name,
      source_type,
      source_url,
      status,
      priority
    )
    values (
      new.id,
      new.brand_name,
      'instagram',
      new.instagram,
      'pending',
      1
    );
  end if;

  if new.facebook is not null and trim(new.facebook) <> '' then
    insert into public.orion_scrape_jobs (
      brand_analysis_id,
      brand_name,
      source_type,
      source_url,
      status,
      priority
    )
    values (
      new.id,
      new.brand_name,
      'facebook',
      new.facebook,
      'pending',
      2
    );
  end if;

  if new.tiktok is not null and trim(new.tiktok) <> '' then
    insert into public.orion_scrape_jobs (
      brand_analysis_id,
      brand_name,
      source_type,
      source_url,
      status,
      priority
    )
    values (
      new.id,
      new.brand_name,
      'tiktok',
      new.tiktok,
      'pending',
      3
    );
  end if;

  if new.website is not null and trim(new.website) <> '' then
    insert into public.orion_scrape_jobs (
      brand_analysis_id,
      brand_name,
      source_type,
      source_url,
      status,
      priority
    )
    values (
      new.id,
      new.brand_name,
      'website',
      new.website,
      'pending',
      4
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."create_orion_scrape_jobs_from_brand_analysis"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_cometa_admin"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.user_profiles
    where user_id = auth.uid()
      and role = 'admin'
      and status = 'active'
  );
$$;


ALTER FUNCTION "public"."is_cometa_admin"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."user_brand_access" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "role" "text" DEFAULT 'viewer'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "access_role" "text" DEFAULT 'viewer'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_brand_access_access_role_rbac_v1a_ck" CHECK (("access_role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'cashier'::"text", 'inventory'::"text", 'editor'::"text", 'viewer'::"text"]))),
    CONSTRAINT "user_brand_access_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."user_brand_access" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_accept_user_invitation_v1"("p_brand_slug" "text", "p_invitation_id" "uuid", "p_user_id" "uuid", "p_email" "text") RETURNS "public"."user_brand_access"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."pos_accept_user_invitation_v1"("p_brand_slug" "text", "p_invitation_id" "uuid", "p_user_id" "uuid", "p_email" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "variant_id" "uuid" NOT NULL,
    "quantity" numeric(14,3) DEFAULT 0 NOT NULL,
    "reserved_quantity" numeric(14,3) DEFAULT 0 NOT NULL,
    "minimum_quantity" numeric(14,3) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_inventory_minimum_quantity_check" CHECK (("minimum_quantity" >= (0)::numeric)),
    CONSTRAINT "pos_inventory_quantity_check" CHECK (("quantity" >= (0)::numeric)),
    CONSTRAINT "pos_inventory_reserved_quantity_check" CHECK (("reserved_quantity" >= (0)::numeric))
);


ALTER TABLE "public"."pos_inventory" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_adjust_inventory"("p_brand_slug" "text", "p_location_id" "uuid", "p_variant_id" "uuid", "p_quantity" numeric, "p_movement_type" "text", "p_notes" "text", "p_user_id" "uuid", "p_set_absolute" boolean DEFAULT false) RETURNS SETOF "public"."pos_inventory"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_inventory public.pos_inventory%rowtype;
  v_variant public.pos_product_variants%rowtype;
  v_before numeric(14,3);
  v_after numeric(14,3);
  v_delta numeric(14,3);
begin
  select *
  into v_variant
  from public.pos_product_variants
  where id = p_variant_id
    and brand_slug = p_brand_slug
    and active = true;

  if not found then
    raise exception 'La variante no existe o pertenece a otra marca.';
  end if;

  insert into public.pos_inventory (
    brand_id,
    brand_slug,
    location_id,
    variant_id,
    quantity
  )
  values (
    v_variant.brand_id,
    v_variant.brand_slug,
    p_location_id,
    v_variant.id,
    0
  )
  on conflict (location_id, variant_id) do nothing;

  select *
  into v_inventory
  from public.pos_inventory
  where location_id = p_location_id
    and variant_id = p_variant_id
    and brand_slug = p_brand_slug
  for update;

  if not found then
    raise exception 'No se pudo localizar el registro de inventario.';
  end if;

  v_before := v_inventory.quantity;

  if p_set_absolute then
    v_after := p_quantity;
    v_delta := v_after - v_before;
  else
    v_delta := p_quantity;
    v_after := v_before + v_delta;
  end if;

  if v_after < 0 then
    raise exception 'El movimiento dejaría inventario negativo.';
  end if;

  update public.pos_inventory
  set quantity = v_after
  where id = v_inventory.id
  returning *
  into v_inventory;

  insert into public.pos_inventory_movements (
    brand_id,
    brand_slug,
    location_id,
    variant_id,
    movement_type,
    quantity_delta,
    quantity_before,
    quantity_after,
    notes,
    created_by
  )
  values (
    v_inventory.brand_id,
    v_inventory.brand_slug,
    v_inventory.location_id,
    v_inventory.variant_id,
    p_movement_type,
    v_delta,
    v_before,
    v_after,
    p_notes,
    p_user_id
  );

  return next v_inventory;
end;
$$;


ALTER FUNCTION "public"."pos_adjust_inventory"("p_brand_slug" "text", "p_location_id" "uuid", "p_variant_id" "uuid", "p_quantity" numeric, "p_movement_type" "text", "p_notes" "text", "p_user_id" "uuid", "p_set_absolute" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_analytics_assert_scope"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("brand_id" "text", "timezone" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_timezone_count integer;
BEGIN
  IF NULLIF(btrim(p_brand_slug),'') IS NULL THEN RAISE EXCEPTION 'brand_slug es obligatorio.'; END IF;
  IF p_date_from IS NULL OR p_date_to IS NULL OR p_date_to <= p_date_from THEN
    RAISE EXCEPTION 'El periodo analítico debe tener date_to posterior a date_from.';
  END IF;
  IF p_location_id IS NOT NULL THEN
    RETURN QUERY SELECT l.brand_id,l.timezone FROM public.pos_locations l
      WHERE l.id=p_location_id AND l.brand_slug=p_brand_slug;
    IF NOT FOUND THEN RAISE EXCEPTION 'La sucursal no existe o pertenece a otra marca.'; END IF;
  ELSE
    SELECT count(DISTINCT l.timezone),min(l.brand_id),min(l.timezone)
      INTO v_timezone_count,brand_id,timezone
    FROM public.pos_locations l WHERE l.brand_slug=p_brand_slug;
    IF brand_id IS NULL THEN RAISE EXCEPTION 'La marca no tiene sucursales POS.'; END IF;
    IF v_timezone_count > 1 THEN
      RAISE EXCEPTION 'Las sucursales usan zonas horarias distintas; especifica location_id.';
    END IF;
    RETURN NEXT;
  END IF;
END $$;


ALTER FUNCTION "public"."pos_analytics_assert_scope"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_analytics_metric"("p_current" numeric, "p_previous" numeric) RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
SELECT jsonb_build_object('current',p_current,'previous',p_previous,'delta',p_current-p_previous,
 'deltaPercent',CASE WHEN p_previous=0 THEN NULL ELSE round((p_current-p_previous)*100/p_previous,2) END)
$$;


ALTER FUNCTION "public"."pos_analytics_metric"("p_current" numeric, "p_previous" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_brand_has_entitlement"("p_brand_slug" "text", "p_entitlement_code" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
 SELECT CASE WHEN p_entitlement_code IS NULL OR btrim(p_entitlement_code)='' THEN false
 ELSE COALESCE((public.pos_get_brand_entitlements(p_brand_slug)->'entitlements')?btrim(p_entitlement_code),false)END
$$;


ALTER FUNCTION "public"."pos_brand_has_entitlement"("p_brand_slug" "text", "p_entitlement_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_can_access_brand"("target_brand_slug" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    (select auth.uid()) is not null
    and (
      exists (
        select 1
        from public.user_profiles profile
        where profile.user_id = (select auth.uid())
          and profile.role = 'admin'
          and profile.status = 'active'
      )
      or exists (
        select 1
        from public.user_brand_access access_row
        where access_row.user_id = (select auth.uid())
          and access_row.status = 'active'
          and lower(access_row.brand_slug) = lower(target_brand_slug)
      )
    );
$$;


ALTER FUNCTION "public"."pos_can_access_brand"("target_brand_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_cash_movement_append_only"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'POS_CASH_MOVEMENT_APPEND_ONLY';
END;
$$;


ALTER FUNCTION "public"."pos_cash_movement_append_only"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_cash_movement_assert_open_session"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."pos_cash_movement_assert_open_session"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_cash_session_protect_closed_financials"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."pos_cash_session_protect_closed_financials"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_change_brand_membership_role_v1"("p_brand_slug" "text", "p_target_user_id" "uuid", "p_new_role" "text", "p_actor_user_id" "uuid") RETURNS "public"."user_brand_access"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."pos_change_brand_membership_role_v1"("p_brand_slug" "text", "p_target_user_id" "uuid", "p_new_role" "text", "p_actor_user_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_cash_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "register_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "opening_amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "expected_cash" numeric(14,2),
    "counted_cash" numeric(14,2),
    "difference" numeric(14,2),
    "opened_by" "uuid",
    "closed_by" "uuid",
    "opened_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_cash_sessions_opening_amount_check" CHECK (("opening_amount" >= (0)::numeric)),
    CONSTRAINT "pos_cash_sessions_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."pos_cash_sessions" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_close_cash_session"("p_brand_slug" "text", "p_session_id" "uuid", "p_counted_cash" numeric, "p_user_id" "uuid", "p_notes" "text" DEFAULT NULL::"text") RETURNS SETOF "public"."pos_cash_sessions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_session public.pos_cash_sessions%rowtype;
  v_cash_sales numeric(14,2) := 0;
  v_cash_movements numeric(14,2) := 0;
  v_expected numeric(14,2) := 0;
begin
  if p_counted_cash < 0 then
    raise exception 'El efectivo contado no puede ser negativo.';
  end if;

  select *
  into v_session
  from public.pos_cash_sessions
  where id = p_session_id
    and brand_slug = p_brand_slug
    and status = 'open'
  for update;

  if not found then
    raise exception 'La sesión no existe, ya está cerrada o pertenece a otra marca.';
  end if;

  select coalesce(sum(payment.amount), 0)
  into v_cash_sales
  from public.pos_payments payment
  join public.pos_sales sale
    on sale.id = payment.sale_id
  where sale.cash_session_id = v_session.id
    and sale.status in ('completed', 'partially_refunded')
    and payment.payment_method = 'cash';

  select coalesce(
    sum(
      case
        when movement_type in ('income', 'deposit')
          then amount
        else -amount
      end
    ),
    0
  )
  into v_cash_movements
  from public.pos_cash_movements
  where cash_session_id = v_session.id;

  v_expected :=
    round(
      v_session.opening_amount +
      v_cash_sales +
      v_cash_movements,
      2
    );

  update public.pos_cash_sessions
  set
    status = 'closed',
    expected_cash = v_expected,
    counted_cash = round(p_counted_cash, 2),
    difference = round(p_counted_cash - v_expected, 2),
    closed_by = p_user_id,
    closed_at = now(),
    notes = coalesce(p_notes, notes)
  where id = v_session.id
  returning *
  into v_session;

  return next v_session;
end;
$$;


ALTER FUNCTION "public"."pos_close_cash_session"("p_brand_slug" "text", "p_session_id" "uuid", "p_counted_cash" numeric, "p_user_id" "uuid", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_commercial_grants_protect_economics_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."pos_commercial_grants_protect_economics_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_commercial_grants_reject_overlap_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."pos_commercial_grants_reject_overlap_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_commercial_grants_set_updated_at_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;


ALTER FUNCTION "public"."pos_commercial_grants_set_updated_at_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_complete_inventory_receipt_v1"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_supplier_name" "text", "p_supplier_reference" "text", "p_notes" "text", "p_items" "jsonb", "p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_location public.pos_locations%rowtype;
  v_receipt public.pos_inventory_receipts%rowtype;

  v_item_json jsonb;

  v_variant public.pos_product_variants%rowtype;
  v_product public.pos_products%rowtype;
  v_presentation
    public.pos_variant_purchase_presentations%rowtype;
  v_inventory public.pos_inventory%rowtype;

  v_variant_id uuid;
  v_presentation_id uuid;

  v_quantity_mode text;
  v_input_unit_code text;
  v_base_unit_code text;

  v_input_quantity numeric(14,3);
  v_conversion_factor numeric(18,6);
  v_base_quantity numeric(14,3);

  v_line_total_cost numeric(18,2);
  v_base_unit_cost numeric(18,6);

  v_quantity_before numeric(14,3);
  v_quantity_after numeric(14,3);

  v_current_cost numeric(18,6);
  v_new_average_cost numeric(18,6);

  v_receipt_total_quantity numeric(18,3) := 0;
  v_receipt_total_cost numeric(18,2) := 0;

  v_receipt_number text;
  v_scanned_code text;

  v_items_result jsonb := '[]'::jsonb;
begin
  if nullif(btrim(p_brand_id), '') is null then
    raise exception 'brand_id es obligatorio.';
  end if;

  if nullif(btrim(p_brand_slug), '') is null then
    raise exception 'brand_slug es obligatorio.';
  end if;

  select *
  into v_location
  from public.pos_locations
  where id = p_location_id
    and brand_slug = btrim(p_brand_slug)
    and active = true;

  if not found then
    raise exception
      'La sucursal no existe, está desactivada o pertenece a otra marca.';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0
  then
    raise exception
      'Agrega al menos una partida a la recepción.';
  end if;

  if jsonb_array_length(p_items) > 500 then
    raise exception
      'Una recepción no puede contener más de 500 partidas.';
  end if;

  v_receipt_number :=
    'REC-' ||
    to_char(
      clock_timestamp(),
      'YYYYMMDD-HH24MISSMS'
    ) ||
    '-' ||
    upper(
      substr(
        replace(
          gen_random_uuid()::text,
          '-',
          ''
        ),
        1,
        6
      )
    );

  insert into public.pos_inventory_receipts (
    brand_id,
    brand_slug,
    location_id,
    receipt_number,
    status,
    supplier_name,
    supplier_reference,
    received_at,
    notes,
    created_by
  )
  values (
    btrim(p_brand_id),
    btrim(p_brand_slug),
    p_location_id,
    v_receipt_number,
    'draft',
    nullif(btrim(p_supplier_name), ''),
    nullif(btrim(p_supplier_reference), ''),
    now(),
    nullif(btrim(p_notes), ''),
    p_user_id
  )
  returning *
  into v_receipt;

  for v_item_json in
    select value
    from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item_json) <> 'object' then
      raise exception
        'Cada partida de la recepción debe ser un objeto válido.';
    end if;

    begin
      v_variant_id :=
        nullif(
          btrim(
            v_item_json ->> 'variant_id'
          ),
          ''
        )::uuid;
    exception
      when invalid_text_representation then
        raise exception
          'La partida contiene un variant_id inválido.';
    end;

    if v_variant_id is null then
      raise exception
        'Cada partida necesita variant_id.';
    end if;

    select *
    into v_variant
    from public.pos_product_variants
    where id = v_variant_id
      and brand_slug = btrim(p_brand_slug)
      and active = true;

    if not found then
      raise exception
        'La variante no existe, está desactivada o pertenece a otra marca.';
    end if;

    select *
    into v_product
    from public.pos_products
    where id = v_variant.product_id
      and brand_slug = btrim(p_brand_slug)
      and active = true;

    if not found then
      raise exception
        'El producto de la variante no está disponible.';
    end if;

    if v_product.inventory_mode <> 'direct'
       or v_product.track_inventory = false
    then
      raise exception
        'El producto % no utiliza inventario directo.',
        v_product.name;
    end if;

    v_presentation_id := null;

    if nullif(
      btrim(
        v_item_json ->>
        'purchase_presentation_id'
      ),
      ''
    ) is not null
    then
      begin
        v_presentation_id :=
          (
            v_item_json ->>
            'purchase_presentation_id'
          )::uuid;
      exception
        when invalid_text_representation then
          raise exception
            'La presentación de compra es inválida.';
      end;

      select *
      into v_presentation
      from public.pos_variant_purchase_presentations
      where id = v_presentation_id
        and brand_slug = btrim(p_brand_slug)
        and variant_id = v_variant.id
        and active = true;

      if not found then
        raise exception
          'La presentación de compra no existe o no corresponde a la variante.';
      end if;

      v_quantity_mode :=
        v_presentation.quantity_mode;

      v_input_unit_code :=
        v_presentation.input_unit_code;

      v_base_unit_code :=
        v_presentation.base_unit_code;

      v_conversion_factor :=
        v_presentation.conversion_factor;
    else
      v_quantity_mode :=
        lower(
          coalesce(
            nullif(
              btrim(
                v_item_json ->>
                'quantity_mode'
              ),
              ''
            ),
            'direct'
          )
        );

      if v_quantity_mode not in (
        'direct',
        'fixed_package',
        'variable_quantity'
      ) then
        raise exception
          'El modo de recepción no es válido.';
      end if;

      v_input_unit_code :=
        lower(
          coalesce(
            nullif(
              btrim(
                v_item_json ->>
                'input_unit_code'
              ),
              ''
            ),
            v_variant.unit_code
          )
        );

      v_base_unit_code :=
        v_variant.unit_code;

      if v_input_unit_code =
         v_base_unit_code
      then
        v_conversion_factor := 1;
      elsif nullif(
        btrim(
          v_item_json ->>
          'conversion_factor'
        ),
        ''
      ) is not null
      then
        begin
          v_conversion_factor :=
            (
              v_item_json ->>
              'conversion_factor'
            )::numeric;
        exception
          when invalid_text_representation then
            raise exception
              'El factor de conversión no es válido.';
        end;
      else
        select conversion.multiplier
        into v_conversion_factor
        from public.pos_unit_conversions conversion
        where conversion.from_unit_code =
          v_input_unit_code
          and conversion.to_unit_code =
          v_base_unit_code
          and conversion.active = true;

        if not found then
          raise exception
            'No existe conversión de % a %.',
            v_input_unit_code,
            v_base_unit_code;
        end if;
      end if;
    end if;

    if not exists (
      select 1
      from public.pos_units unit_record
      where unit_record.code =
        v_input_unit_code
        and unit_record.active = true
    ) then
      raise exception
        'La unidad de entrada % no existe.',
        v_input_unit_code;
    end if;

    if not exists (
      select 1
      from public.pos_units unit_record
      where unit_record.code =
        v_base_unit_code
        and unit_record.active = true
    ) then
      raise exception
        'La unidad base % no existe.',
        v_base_unit_code;
    end if;

    if v_base_unit_code <>
       v_variant.unit_code
    then
      raise exception
        'La unidad base de la recepción no coincide con la unidad de inventario de la variante.';
    end if;

    begin
      v_input_quantity :=
        (
          v_item_json ->>
          'input_quantity'
        )::numeric;
    exception
      when invalid_text_representation then
        raise exception
          'La cantidad recibida no es válida.';
    end;

    if v_input_quantity is null
       or v_input_quantity <= 0
    then
      raise exception
        'La cantidad recibida debe ser mayor a cero.';
    end if;

    if v_conversion_factor is null
       or v_conversion_factor <= 0
    then
      raise exception
        'El factor de conversión debe ser mayor a cero.';
    end if;

    v_base_quantity :=
      round(
        (
          v_input_quantity *
          v_conversion_factor
        )::numeric,
        3
      );

    if v_base_quantity <= 0 then
      raise exception
        'La conversión produjo una cantidad inválida.';
    end if;

    begin
      v_line_total_cost :=
        greatest(
          coalesce(
            nullif(
              v_item_json ->>
              'total_cost',
              ''
            )::numeric,
            0
          ),
          0
        );
    exception
      when invalid_text_representation then
        raise exception
          'El costo total de la partida no es válido.';
    end;

    v_base_unit_cost :=
      case
        when v_line_total_cost > 0
          then round(
            (
              v_line_total_cost /
              v_base_quantity
            )::numeric,
            6
          )
        else 0
      end;

    insert into public.pos_inventory (
      brand_id,
      brand_slug,
      location_id,
      variant_id,
      quantity,
      reserved_quantity,
      minimum_quantity
    )
    values (
      v_variant.brand_id,
      v_variant.brand_slug,
      p_location_id,
      v_variant.id,
      0,
      0,
      0
    )
    on conflict (
      location_id,
      variant_id
    ) do nothing;

    select *
    into v_inventory
    from public.pos_inventory
    where location_id = p_location_id
      and variant_id = v_variant.id
      and brand_slug = btrim(p_brand_slug)
    for update;

    if not found then
      raise exception
        'No se pudo localizar el inventario de la variante.';
    end if;

    v_quantity_before :=
      v_inventory.quantity;

    v_quantity_after :=
      v_quantity_before +
      v_base_quantity;

    v_current_cost :=
      coalesce(
        v_variant.cost,
        0
      );

    if v_line_total_cost > 0 then
      v_new_average_cost :=
        round(
          (
            (
              v_quantity_before *
              v_current_cost
            ) +
            v_line_total_cost
          ) /
          nullif(
            v_quantity_after,
            0
          ),
          6
        );
    else
      v_new_average_cost :=
        v_current_cost;
    end if;

    update public.pos_inventory
    set
      quantity = v_quantity_after
    where id = v_inventory.id;

    if v_line_total_cost > 0 then
      update public.pos_product_variants
      set
        cost = v_new_average_cost
      where id = v_variant.id;
    end if;

    v_scanned_code :=
      nullif(
        btrim(
          v_item_json ->>
          'scanned_code'
        ),
        ''
      );

    insert into public.pos_inventory_movements (
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
    values (
      v_variant.brand_id,
      v_variant.brand_slug,
      p_location_id,
      v_variant.id,
      'receipt',
      v_base_quantity,
      v_quantity_before,
      v_quantity_after,
      'inventory_receipt',
      v_receipt.id,
      coalesce(
        nullif(btrim(p_notes), ''),
        'Recepción inteligente de inventario'
      ),
      p_user_id
    );

    insert into public.pos_inventory_receipt_items (
      brand_id,
      brand_slug,
      receipt_id,
      location_id,
      variant_id,
      purchase_presentation_id,
      scanned_code,
      quantity_mode,
      input_quantity,
      input_unit_code,
      conversion_factor,
      base_quantity,
      base_unit_code,
      total_cost,
      base_unit_cost,
      quantity_before,
      quantity_after
    )
    values (
      v_variant.brand_id,
      v_variant.brand_slug,
      v_receipt.id,
      p_location_id,
      v_variant.id,
      v_presentation_id,
      v_scanned_code,
      v_quantity_mode,
      v_input_quantity,
      v_input_unit_code,
      v_conversion_factor,
      v_base_quantity,
      v_base_unit_code,
      v_line_total_cost,
      v_base_unit_cost,
      v_quantity_before,
      v_quantity_after
    );

    v_receipt_total_quantity :=
      v_receipt_total_quantity +
      v_base_quantity;

    v_receipt_total_cost :=
      v_receipt_total_cost +
      v_line_total_cost;

    v_items_result :=
      v_items_result ||
      jsonb_build_array(
        jsonb_build_object(
          'variantId',
          v_variant.id,
          'productId',
          v_product.id,
          'productName',
          v_product.name,
          'variantName',
          v_variant.name,
          'quantityMode',
          v_quantity_mode,
          'inputQuantity',
          v_input_quantity,
          'inputUnitCode',
          v_input_unit_code,
          'conversionFactor',
          v_conversion_factor,
          'baseQuantity',
          v_base_quantity,
          'baseUnitCode',
          v_base_unit_code,
          'quantityBefore',
          v_quantity_before,
          'quantityAfter',
          v_quantity_after,
          'totalCost',
          v_line_total_cost,
          'baseUnitCost',
          v_base_unit_cost,
          'averageCostAfter',
          v_new_average_cost
        )
      );
  end loop;

  update public.pos_inventory_receipts
  set
    status = 'completed',
    total_base_quantity =
      v_receipt_total_quantity,
    total_cost =
      v_receipt_total_cost,
    completed_by = p_user_id,
    completed_at = now()
  where id = v_receipt.id
  returning *
  into v_receipt;

  return jsonb_build_object(
    'receipt',
    to_jsonb(v_receipt),
    'items',
    v_items_result
  );
end;
$$;


ALTER FUNCTION "public"."pos_complete_inventory_receipt_v1"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_supplier_name" "text", "p_supplier_reference" "text", "p_notes" "text", "p_items" "jsonb", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_complete_inventory_receipt_v2"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_supplier_name" "text", "p_supplier_reference" "text", "p_notes" "text", "p_items" "jsonb", "p_user_id" "uuid", "p_idempotency_key" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_fingerprint text;
  v_pgcrypto_schema text;
  v_normalized_items jsonb;
  v_existing public.pos_inventory_receipts%ROWTYPE;
  v_result jsonb;
  v_receipt_id uuid;
  v_replay_items jsonb;
BEGIN
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'POS_INVENTORY_IDEMPOTENCY_KEY_REQUIRED'
      USING ERRCODE = '22023';
  END IF;

  -- jsonb normaliza el orden de keys. El jsonb_agg ordenado elimina el orden
  -- accidental de las líneas sin alterar el payload que recibe la RPC v1.
  SELECT COALESCE(
    jsonb_agg(normalized.item ORDER BY normalized.item::text),
    '[]'::jsonb
  )
  INTO v_normalized_items
  FROM (
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'variant_id', lower(NULLIF(btrim(item ->> 'variant_id'), '')),
      'purchase_presentation_id', lower(NULLIF(btrim(item ->> 'purchase_presentation_id'), '')),
      'quantity_mode', lower(NULLIF(btrim(item ->> 'quantity_mode'), '')),
      'input_quantity', NULLIF(btrim(item ->> 'input_quantity'), ''),
      'input_unit_code', lower(NULLIF(btrim(item ->> 'input_unit_code'), '')),
      'conversion_factor', NULLIF(btrim(item ->> 'conversion_factor'), ''),
      'total_cost', NULLIF(btrim(item ->> 'total_cost'), ''),
      'scanned_code', NULLIF(btrim(item ->> 'scanned_code'), '')
    )) AS item
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS source(item)
  ) AS normalized;

  SELECT namespace.nspname
  INTO v_pgcrypto_schema
  FROM pg_extension extension_row
  JOIN pg_namespace namespace ON namespace.oid = extension_row.extnamespace
  WHERE extension_row.extname = 'pgcrypto';

  IF NOT FOUND OR v_pgcrypto_schema IS NULL THEN
    RAISE EXCEPTION 'La extensión pgcrypto no está disponible.';
  END IF;

  EXECUTE format(
    'SELECT encode(%I.digest(convert_to($1, ''UTF8''), ''sha256''), ''hex'')',
    v_pgcrypto_schema
  )
  INTO v_fingerprint
  USING jsonb_build_object(
    'brand_id', p_brand_id,
    'brand_slug', lower(btrim(COALESCE(p_brand_slug, ''))),
    'location_id', p_location_id,
    'supplier_name', NULLIF(btrim(p_supplier_name), ''),
    'supplier_reference', NULLIF(btrim(p_supplier_reference), ''),
    'notes', NULLIF(btrim(p_notes), ''),
    'items', v_normalized_items
  )::text;

  -- Serializa únicamente la misma operación lógica. La restricción UNIQUE
  -- parcial continúa siendo la invariante final frente a carreras.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      lower(btrim(COALESCE(p_brand_slug, ''))) || ':' || p_idempotency_key::text,
      0
    )
  );

  SELECT receipt.*
  INTO v_existing
  FROM public.pos_inventory_receipts AS receipt
  WHERE receipt.brand_slug = p_brand_slug
    AND receipt.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'POS_INVENTORY_IDEMPOTENCY_CONFLICT'
        USING ERRCODE = '23505';
    END IF;

    IF v_existing.status <> 'completed' THEN
      RAISE EXCEPTION 'POS_INVENTORY_IDEMPOTENCY_INCOMPLETE'
        USING ERRCODE = '55000';
    END IF;

    SELECT COALESCE(
      jsonb_agg(to_jsonb(receipt_item) ORDER BY receipt_item.id),
      '[]'::jsonb
    )
    INTO v_replay_items
    FROM public.pos_inventory_receipt_items AS receipt_item
    WHERE receipt_item.receipt_id = v_existing.id;

    RETURN jsonb_build_object(
      'receipt', to_jsonb(v_existing) - 'idempotency_key' - 'payload_fingerprint',
      'items', v_replay_items
    );
  END IF;

  -- v1 permanece como el único core de negocio: validaciones, conversiones,
  -- costos, locks, movimientos, partidas, numeración y totales no se duplican.
  v_result := public.pos_complete_inventory_receipt_v1(
    p_brand_id,
    p_brand_slug,
    p_location_id,
    p_supplier_name,
    p_supplier_reference,
    p_notes,
    p_items,
    p_user_id
  );

  v_receipt_id := NULLIF(v_result #>> '{receipt,id}', '')::uuid;

  IF v_receipt_id IS NULL THEN
    RAISE EXCEPTION 'La recepción v1 no devolvió receipt.id.';
  END IF;

  UPDATE public.pos_inventory_receipts AS receipt
  SET idempotency_key = p_idempotency_key,
      payload_fingerprint = v_fingerprint
  WHERE receipt.id = v_receipt_id
    AND receipt.brand_id = p_brand_id
    AND receipt.brand_slug = p_brand_slug
    AND receipt.status = 'completed'
  RETURNING receipt.* INTO v_existing;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La recepción idempotente no terminó en estado completed.';
  END IF;

  RETURN jsonb_set(
    v_result,
    '{receipt}',
    (v_result -> 'receipt') - 'idempotency_key' - 'payload_fingerprint'
  );
END;
$_$;


ALTER FUNCTION "public"."pos_complete_inventory_receipt_v2"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_supplier_name" "text", "p_supplier_reference" "text", "p_notes" "text", "p_items" "jsonb", "p_user_id" "uuid", "p_idempotency_key" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."pos_complete_inventory_receipt_v2"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_supplier_name" "text", "p_supplier_reference" "text", "p_notes" "text", "p_items" "jsonb", "p_user_id" "uuid", "p_idempotency_key" "uuid") IS 'Completa una recepción mediante el core v1 con idempotencia tenant-scoped y fingerprint de payload.';



CREATE OR REPLACE FUNCTION "public"."pos_complete_sale"("p_brand_slug" "text", "p_location_id" "uuid", "p_register_id" "uuid", "p_cash_session_id" "uuid", "p_customer_id" "uuid", "p_items" "jsonb", "p_payments" "jsonb", "p_notes" "text", "p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_location public.pos_locations%rowtype;
  v_register public.pos_registers%rowtype;
  v_session public.pos_cash_sessions%rowtype;
  v_sale public.pos_sales%rowtype;
  v_item jsonb;
  v_payment jsonb;
  v_variant record;
  v_inventory public.pos_inventory%rowtype;
  v_quantity numeric(14,3);
  v_discount numeric(14,2);
  v_line_subtotal numeric(14,2);
  v_line_tax numeric(14,2);
  v_line_total numeric(14,2);
  v_subtotal numeric(14,2) := 0;
  v_discount_total numeric(14,2) := 0;
  v_tax_total numeric(14,2) := 0;
  v_total numeric(14,2) := 0;

  -- El monto aplicado paga la venta.
  -- El monto recibido representa lo que entrega el cliente.
  -- La diferencia entre ambos solo puede ser cambio en efectivo.
  v_payment_total numeric(14,2) := 0;
  v_tendered_total numeric(14,2) := 0;
  v_change_total numeric(14,2) := 0;
  v_payment_amount numeric(14,2);
  v_tendered_amount numeric(14,2);
  v_change_amount numeric(14,2);

  v_sale_number text;
  v_program public.pos_loyalty_programs%rowtype;
  v_member public.pos_loyalty_members%rowtype;
  v_points integer := 0;
begin
  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no contiene productos.';
  end if;

  if jsonb_typeof(p_payments) <> 'array'
     or jsonb_array_length(p_payments) = 0 then
    raise exception 'La venta no contiene pagos.';
  end if;

  select *
  into v_location
  from public.pos_locations
  where id = p_location_id
    and brand_slug = p_brand_slug
    and active = true;

  if not found then
    raise exception 'La sucursal no existe o pertenece a otra marca.';
  end if;

  select *
  into v_register
  from public.pos_registers
  where id = p_register_id
    and location_id = p_location_id
    and brand_slug = p_brand_slug
    and status = 'available';

  if not found then
    raise exception 'La caja no existe o no corresponde a la sucursal.';
  end if;

  select *
  into v_session
  from public.pos_cash_sessions
  where id = p_cash_session_id
    and register_id = p_register_id
    and brand_slug = p_brand_slug
    and status = 'open'
  for update;

  if not found then
    raise exception 'No existe una sesión de caja abierta.';
  end if;

  if p_customer_id is not null
     and not exists (
       select 1
       from public.pos_customers
       where id = p_customer_id
         and brand_slug = p_brand_slug
         and active = true
     ) then
    raise exception 'El cliente no existe o pertenece a otra marca.';
  end if;

  v_sale_number :=
    'V-'
    || to_char(clock_timestamp(), 'YYMMDD')
    || '-'
    || lpad(
      nextval('public.pos_sale_number_seq')::text,
      7,
      '0'
    );

  insert into public.pos_sales (
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
    notes
  )
  values (
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
    p_notes
  )
  returning *
  into v_sale;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    v_quantity :=
      coalesce((v_item ->> 'quantity')::numeric, 0);

    if v_quantity <= 0 then
      raise exception 'La cantidad de un producto debe ser mayor que cero.';
    end if;

    v_discount :=
      greatest(
        coalesce(
          (v_item ->> 'discount_amount')::numeric,
          0
        ),
        0
      );

    select
      variant.*,
      product.name as product_name,
      product.track_inventory,
      product.tax_rate,
      product.id as parent_product_id
    into v_variant
    from public.pos_product_variants variant
    join public.pos_products product
      on product.id = variant.product_id
    where variant.id =
      (v_item ->> 'variant_id')::uuid
      and variant.brand_slug = p_brand_slug
      and variant.active = true
      and product.active = true;

    if not found then
      raise exception 'Uno de los productos ya no está disponible.';
    end if;

    v_line_subtotal :=
      round(v_variant.price * v_quantity, 2);

    if v_discount > v_line_subtotal then
      raise exception 'El descuento supera el subtotal de un producto.';
    end if;

    if v_location.prices_include_tax then
      v_line_tax :=
        case
          when v_variant.tax_rate > 0 then
            round(
              (v_line_subtotal - v_discount)
              - (
                (v_line_subtotal - v_discount)
                / (1 + v_variant.tax_rate / 100)
              ),
              2
            )
          else 0
        end;

      v_line_total :=
        round(v_line_subtotal - v_discount, 2);
    else
      v_line_tax :=
        round(
          (v_line_subtotal - v_discount)
          * v_variant.tax_rate
          / 100,
          2
        );

      v_line_total :=
        round(
          v_line_subtotal
          - v_discount
          + v_line_tax,
          2
        );
    end if;

    if v_variant.track_inventory then
      select *
      into v_inventory
      from public.pos_inventory
      where location_id = p_location_id
        and variant_id = v_variant.id
        and brand_slug = p_brand_slug
      for update;

      if not found then
        raise exception 'El producto no tiene inventario en esta sucursal.';
      end if;

      if
        v_inventory.quantity
        - v_inventory.reserved_quantity
        < v_quantity
      then
        raise exception 'Inventario insuficiente para %.', v_variant.product_name;
      end if;

      update public.pos_inventory
      set quantity = quantity - v_quantity
      where id = v_inventory.id;

      insert into public.pos_inventory_movements (
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
      values (
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
    end if;

    insert into public.pos_sale_items (
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
      tax_rate,
      tax_amount,
      line_total
    )
    values (
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
      v_variant.tax_rate,
      v_line_tax,
      v_line_total
    );

    v_subtotal := v_subtotal + v_line_subtotal;
    v_discount_total :=
      v_discount_total + v_discount;
    v_tax_total := v_tax_total + v_line_tax;
    v_total := v_total + v_line_total;
  end loop;

  for v_payment in
    select value
    from jsonb_array_elements(p_payments)
  loop
    if
      (v_payment ->> 'method')
      not in (
        'cash',
        'card',
        'transfer',
        'wallet',
        'other'
      )
    then
      raise exception 'Método de pago no permitido.';
    end if;

    begin
      v_payment_amount :=
        round(
          coalesce(
            nullif(
              trim(v_payment ->> 'amount'),
              ''
            )::numeric,
            0
          ),
          2
        );
    exception
      when invalid_text_representation then
        raise exception
          'El monto aplicado de un pago no es válido.';
    end;

    if v_payment_amount <= 0 then
      raise exception
        'El monto aplicado de un pago debe ser mayor que cero.';
    end if;

    if (v_payment ->> 'method') = 'cash' then
      begin
        v_tendered_amount :=
          round(
            coalesce(
              nullif(
                trim(
                  v_payment ->>
                  'tendered_amount'
                ),
                ''
              )::numeric,
              v_payment_amount
            ),
            2
          );
      exception
        when invalid_text_representation then
          raise exception
            'El efectivo recibido no es válido.';
      end;

      if v_tendered_amount <
         v_payment_amount
      then
        raise exception
          'El efectivo recibido no cubre el monto aplicado.';
      end if;

      v_change_amount :=
        round(
          v_tendered_amount -
          v_payment_amount,
          2
        );
    else
      v_tendered_amount :=
        v_payment_amount;

      v_change_amount := 0;
    end if;

    insert into public.pos_payments (
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
    values (
      v_sale.brand_id,
      v_sale.brand_slug,
      v_sale.id,
      v_payment ->> 'method',
      v_payment_amount,
      v_tendered_amount,
      v_change_amount,
      nullif(
        trim(
          v_payment ->> 'reference'
        ),
        ''
      ),
      coalesce(
        v_payment -> 'metadata',
        '{}'::jsonb
      )
    );

    v_payment_total :=
      v_payment_total +
      v_payment_amount;

    v_tendered_total :=
      v_tendered_total +
      v_tendered_amount;

    v_change_total :=
      v_change_total +
      v_change_amount;
  end loop;

  if round(v_payment_total, 2) <
     round(v_total, 2)
  then
    raise exception
      'Los pagos aplicados no cubren el total de la venta.';
  end if;

  if round(v_payment_total, 2) >
     round(v_total, 2)
  then
    raise exception
      'Los pagos aplicados superan el total de la venta. Registra el excedente como efectivo recibido, no como pago aplicado.';
  end if;

  update public.pos_sales
  set
    subtotal = round(v_subtotal, 2),
    discount_total = round(v_discount_total, 2),
    tax_total = round(v_tax_total, 2),
    total = round(v_total, 2)
  where id = v_sale.id
  returning *
  into v_sale;

  if p_customer_id is not null then
    select *
    into v_program
    from public.pos_loyalty_programs
    where brand_slug = p_brand_slug
      and active = true;

    if found then
      select *
      into v_member
      from public.pos_loyalty_members
      where program_id = v_program.id
        and customer_id = p_customer_id
      for update;

      if not found then
        perform *
        from public.pos_register_loyalty_member(
          p_brand_slug,
          p_customer_id,
          p_user_id
        );

        select *
        into v_member
        from public.pos_loyalty_members
        where program_id = v_program.id
          and customer_id = p_customer_id
        for update;
      end if;

      v_points :=
        floor(v_sale.total * v_program.points_per_currency);

      if v_points > 0 then
        update public.pos_loyalty_members
        set
          points_balance = points_balance + v_points,
          lifetime_points = lifetime_points + v_points
        where id = v_member.id
        returning *
        into v_member;

        insert into public.pos_loyalty_transactions (
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
        values (
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
      end if;
    end if;
  end if;

  return jsonb_build_object(
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
    'sold_at', v_sale.sold_at
  );
end;
$$;


ALTER FUNCTION "public"."pos_complete_sale"("p_brand_slug" "text", "p_location_id" "uuid", "p_register_id" "uuid", "p_cash_session_id" "uuid", "p_customer_id" "uuid", "p_items" "jsonb", "p_payments" "jsonb", "p_notes" "text", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_complete_sale_v2"("p_brand_slug" "text", "p_location_id" "uuid", "p_register_id" "uuid", "p_cash_session_id" "uuid", "p_customer_id" "uuid", "p_items" "jsonb", "p_payments" "jsonb", "p_notes" "text", "p_user_id" "uuid", "p_reward_id" "uuid", "p_idempotency_key" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."pos_complete_sale_v2"("p_brand_slug" "text", "p_location_id" "uuid", "p_register_id" "uuid", "p_cash_session_id" "uuid", "p_customer_id" "uuid", "p_items" "jsonb", "p_payments" "jsonb", "p_notes" "text", "p_user_id" "uuid", "p_reward_id" "uuid", "p_idempotency_key" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_complete_sale_v3"("p_brand_slug" "text", "p_location_id" "uuid", "p_register_id" "uuid", "p_cash_session_id" "uuid", "p_customer_id" "uuid", "p_items" "jsonb", "p_payments" "jsonb", "p_notes" "text", "p_user_id" "uuid", "p_reward_id" "uuid", "p_idempotency_key" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_result jsonb;
  v_program public.pos_loyalty_programs%rowtype;
  v_member public.pos_loyalty_members%rowtype;
  v_tier_before record;
  v_tier_after record;
  v_snapshot public.pos_sale_loyalty_tier_snapshots%rowtype;
  v_existing_sale_id uuid;
  v_sale_id uuid;
  v_base_points integer := 0;
  v_earned_points integer := 0;
  v_bonus_points integer := 0;
  v_multiplier numeric(8,4) := 1;
  v_lifetime_before integer := 0;
  v_lifetime_after integer := 0;
  v_promoted boolean := false;
BEGIN
  SELECT
    NULL::uuid AS tier_id,
    NULL::text AS name,
    NULL::integer AS minimum_lifetime_points,
    NULL::numeric(8,4) AS points_multiplier
  INTO v_tier_before;

  SELECT
    NULL::uuid AS tier_id,
    NULL::text AS name,
    NULL::integer AS minimum_lifetime_points,
    NULL::numeric(8,4) AS points_multiplier
  INTO v_tier_after;

  SELECT sale.id INTO v_existing_sale_id
  FROM public.pos_sales sale
  WHERE sale.brand_slug = p_brand_slug
    AND sale.idempotency_key = p_idempotency_key;

  IF v_existing_sale_id IS NULL AND p_customer_id IS NOT NULL THEN
    SELECT * INTO v_program
    FROM public.pos_loyalty_programs
    WHERE brand_slug = p_brand_slug AND active = true;

    IF FOUND THEN
      SELECT * INTO v_member
      FROM public.pos_loyalty_members
      WHERE brand_slug = p_brand_slug
        AND program_id = v_program.id
        AND customer_id = p_customer_id
      FOR UPDATE;

      IF NOT FOUND AND p_reward_id IS NULL THEN
        SELECT * INTO v_member
        FROM public.pos_register_loyalty_member_v2(p_brand_slug, p_customer_id, p_user_id);
      END IF;

      IF v_member.id IS NOT NULL THEN
        v_lifetime_before := v_member.lifetime_points;
        SELECT * INTO v_tier_before
        FROM public.pos_resolve_loyalty_tier(p_brand_slug, v_program.id, v_lifetime_before);
        v_multiplier := COALESCE(v_tier_before.points_multiplier, 1);

        IF v_member.tier_id IS DISTINCT FROM v_tier_before.tier_id THEN
          UPDATE public.pos_loyalty_members
          SET tier_id = v_tier_before.tier_id
          WHERE id = v_member.id
          RETURNING * INTO v_member;
        END IF;
      END IF;
    END IF;
  END IF;

  v_result := public.pos_complete_sale_v2(
    p_brand_slug, p_location_id, p_register_id, p_cash_session_id,
    p_customer_id, p_items, p_payments, p_notes, p_user_id,
    p_reward_id, p_idempotency_key
  );
  v_sale_id := (v_result ->> 'id')::uuid;

  IF COALESCE((v_result ->> 'idempotent_replay')::boolean, false) THEN
    SELECT * INTO v_snapshot
    FROM public.pos_sale_loyalty_tier_snapshots
    WHERE sale_id = v_sale_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inconsistencia de fidelización: la venta V3 no tiene snapshot de niveles.';
    END IF;

    RETURN v_result || jsonb_build_object(
      'points_earned', v_snapshot.earned_points,
      'base_points', v_snapshot.base_points,
      'tier_multiplier', v_snapshot.tier_multiplier,
      'tier_before', CASE WHEN v_snapshot.tier_before_id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', v_snapshot.tier_before_id, 'name', v_snapshot.tier_before_name,
        'minimumLifetimePoints', v_snapshot.tier_before_minimum_lifetime_points,
        'pointsMultiplier', v_snapshot.tier_before_points_multiplier
      ) END,
      'tier_after', CASE WHEN v_snapshot.tier_after_id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', v_snapshot.tier_after_id, 'name', v_snapshot.tier_after_name,
        'minimumLifetimePoints', v_snapshot.tier_after_minimum_lifetime_points,
        'pointsMultiplier', v_snapshot.tier_after_points_multiplier
      ) END,
      'tier_promoted', v_snapshot.tier_promoted
    );
  END IF;

  IF v_member.id IS NOT NULL AND v_program.id IS NOT NULL THEN
    v_base_points := floor(((v_result ->> 'total')::numeric) * v_program.points_per_currency);
    v_earned_points := floor(v_base_points * v_multiplier);
    v_bonus_points := v_earned_points - v_base_points;

    IF v_bonus_points <> 0 THEN
      UPDATE public.pos_loyalty_members
      SET points_balance = points_balance + v_bonus_points,
          lifetime_points = lifetime_points + v_bonus_points
      WHERE id = v_member.id
      RETURNING * INTO v_member;

      UPDATE public.pos_loyalty_transactions
      SET points = v_earned_points,
          balance_after = balance_after + v_bonus_points
      WHERE sale_id = v_sale_id
        AND member_id = v_member.id
        AND transaction_type = 'earn';
    ELSE
      SELECT * INTO v_member
      FROM public.pos_loyalty_members
      WHERE id = v_member.id;
    END IF;

    v_lifetime_after := v_member.lifetime_points;
    SELECT * INTO v_tier_after
    FROM public.pos_resolve_loyalty_tier(p_brand_slug, v_program.id, v_lifetime_after);

    v_promoted := v_tier_after.tier_id IS NOT NULL
      AND v_tier_after.tier_id IS DISTINCT FROM v_tier_before.tier_id
      AND v_tier_after.minimum_lifetime_points > COALESCE(v_tier_before.minimum_lifetime_points, -1);

    UPDATE public.pos_loyalty_members
    SET tier_id = v_tier_after.tier_id
    WHERE id = v_member.id
    RETURNING * INTO v_member;

    INSERT INTO public.pos_sale_loyalty_tier_snapshots (
      brand_id, brand_slug, sale_id, member_id, base_points, earned_points,
      tier_multiplier, lifetime_points_before, lifetime_points_after,
      tier_before_id, tier_before_name, tier_before_minimum_lifetime_points,
      tier_before_points_multiplier, tier_after_id, tier_after_name,
      tier_after_minimum_lifetime_points, tier_after_points_multiplier,
      tier_promoted
    ) VALUES (
      v_member.brand_id, v_member.brand_slug, v_sale_id, v_member.id,
      v_base_points, v_earned_points, v_multiplier, v_lifetime_before,
      v_lifetime_after, v_tier_before.tier_id, v_tier_before.name,
      v_tier_before.minimum_lifetime_points, v_tier_before.points_multiplier,
      v_tier_after.tier_id, v_tier_after.name,
      v_tier_after.minimum_lifetime_points, v_tier_after.points_multiplier,
      v_promoted
    );
  ELSE
    INSERT INTO public.pos_sale_loyalty_tier_snapshots (
      brand_id, brand_slug, sale_id, member_id, base_points, earned_points,
      tier_multiplier, lifetime_points_before, lifetime_points_after,
      tier_promoted
    )
    SELECT sale.brand_id, sale.brand_slug, sale.id, NULL, 0, 0, 1, 0, 0, false
    FROM public.pos_sales sale WHERE sale.id = v_sale_id;
  END IF;

  RETURN v_result || jsonb_build_object(
    'points_earned', v_earned_points,
    'loyalty_balance', CASE WHEN v_member.id IS NULL THEN NULL ELSE v_member.points_balance END,
    'base_points', v_base_points,
    'tier_multiplier', v_multiplier,
    'tier_before', CASE WHEN v_tier_before.tier_id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_tier_before.tier_id, 'name', v_tier_before.name,
      'minimumLifetimePoints', v_tier_before.minimum_lifetime_points,
      'pointsMultiplier', v_tier_before.points_multiplier
    ) END,
    'tier_after', CASE WHEN v_tier_after.tier_id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_tier_after.tier_id, 'name', v_tier_after.name,
      'minimumLifetimePoints', v_tier_after.minimum_lifetime_points,
      'pointsMultiplier', v_tier_after.points_multiplier
    ) END,
    'tier_promoted', v_promoted
  );
END;
$$;


ALTER FUNCTION "public"."pos_complete_sale_v3"("p_brand_slug" "text", "p_location_id" "uuid", "p_register_id" "uuid", "p_cash_session_id" "uuid", "p_customer_id" "uuid", "p_items" "jsonb", "p_payments" "jsonb", "p_notes" "text", "p_user_id" "uuid", "p_reward_id" "uuid", "p_idempotency_key" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_complete_sale_v4"("p_brand_slug" "text", "p_location_id" "uuid", "p_register_id" "uuid", "p_cash_session_id" "uuid", "p_customer_id" "uuid", "p_items" "jsonb", "p_payments" "jsonb", "p_notes" "text", "p_user_id" "uuid", "p_reward_id" "uuid", "p_idempotency_key" "uuid", "p_reward_unlock_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
  v_reward_unlock public.pos_loyalty_reward_unlocks%rowtype;
  v_reward_source text := NULL;
  v_effective_reward_name text := NULL;
  v_effective_reward_type text := NULL;
  v_tier_before record;
  v_tier_after record;
  v_base_points integer := 0;
  v_earned_points integer := 0;
  v_multiplier numeric(8,4) := 1;
  v_lifetime_before integer := 0;
  v_lifetime_after integer := 0;
  v_tier_promoted boolean := false;
  v_visit_snapshot public.pos_sale_loyalty_visit_snapshots%rowtype;
  v_campaign record;
  v_completed_before integer;
  v_completed_after integer;
  v_cycles_before integer;
  v_cycles_after integer;
  v_cycle integer;
  v_event_id uuid;
  v_created_unlock public.pos_loyalty_reward_unlocks%rowtype;
  v_visits_earned integer := 0;
  v_visit_progress jsonb := '[]'::jsonb;
  v_visit_unlocks_created jsonb := '[]'::jsonb;
  v_response jsonb;
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
  SELECT NULL::uuid tier_id, NULL::text name, NULL::integer minimum_lifetime_points,
    NULL::numeric(8,4) points_multiplier INTO v_tier_before;
  SELECT NULL::uuid tier_id, NULL::text name, NULL::integer minimum_lifetime_points,
    NULL::numeric(8,4) points_multiplier INTO v_tier_after;

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

  IF p_reward_id IS NOT NULL AND p_reward_unlock_id IS NOT NULL THEN
    RAISE EXCEPTION 'Sólo puede aplicarse una recompensa por venta.';
  END IF;

  v_reward_source := CASE WHEN p_reward_id IS NOT NULL THEN 'points' WHEN p_reward_unlock_id IS NOT NULL THEN 'visits' ELSE NULL END;

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
    'reward', jsonb_build_object(
      'source', COALESCE(v_reward_source, 'none'),
      'rewardId', p_reward_id,
      'rewardUnlockId', p_reward_unlock_id
    )
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
    IF v_existing_sale.idempotency_fingerprint IS DISTINCT FROM v_idempotency_fingerprint THEN
      RAISE EXCEPTION 'Conflicto de idempotencia: la clave ya fue utilizada con un payload diferente.';
    END IF;
    SELECT * INTO v_visit_snapshot FROM public.pos_sale_loyalty_visit_snapshots WHERE sale_id = v_existing_sale.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Inconsistencia de fidelización: la venta V4 no tiene snapshot de visitas.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.pos_sale_loyalty_tier_snapshots WHERE sale_id = v_existing_sale.id) THEN
      RAISE EXCEPTION 'Inconsistencia de fidelización: la venta V4 no tiene snapshot de niveles.';
    END IF;
    RETURN jsonb_set(v_visit_snapshot.response_json, '{idempotent_replay}', 'true'::jsonb, true);
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
    v_effective_reward_name := v_reward.name;
    v_effective_reward_type := v_reward.reward_type;
  ELSIF p_reward_unlock_id IS NOT NULL THEN
    IF p_customer_id IS NULL THEN RAISE EXCEPTION 'Se requiere un cliente para canjear una recompensa.'; END IF;
    SELECT * INTO v_program FROM public.pos_loyalty_programs WHERE brand_slug=p_brand_slug AND active=true;
    IF NOT FOUND THEN RAISE EXCEPTION 'No existe un programa de fidelización activo.'; END IF;
    SELECT * INTO v_member FROM public.pos_loyalty_members WHERE program_id=v_program.id AND customer_id=p_customer_id AND brand_slug=p_brand_slug AND status='active' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El cliente no tiene una membresía de fidelización activa.'; END IF;
    SELECT * INTO v_reward_unlock FROM public.pos_loyalty_reward_unlocks
    WHERE id=p_reward_unlock_id AND brand_slug=p_brand_slug AND member_id=v_member.id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La recompensa desbloqueada no existe o pertenece a otro cliente.'; END IF;
    IF v_reward_unlock.status<>'available' OR v_reward_unlock.redeemed_sale_id IS NOT NULL THEN RAISE EXCEPTION 'La recompensa desbloqueada ya no está disponible.'; END IF;
    IF v_reward_unlock.reward_type<>'discount_fixed' OR v_reward_unlock.reward_value<=0 THEN RAISE EXCEPTION 'La recompensa desbloqueada tiene un snapshot inválido.'; END IF;
    v_reward_value:=round(v_reward_unlock.reward_value,2);
    v_effective_reward_name:=v_reward_unlock.reward_name;
    v_effective_reward_type:=v_reward_unlock.reward_type;
  END IF;

  IF p_customer_id IS NOT NULL AND v_program.id IS NULL THEN
    SELECT * INTO v_program FROM public.pos_loyalty_programs WHERE brand_slug=p_brand_slug AND active=true;
    IF FOUND THEN
      SELECT * INTO v_member FROM public.pos_loyalty_members WHERE program_id=v_program.id AND customer_id=p_customer_id AND brand_slug=p_brand_slug AND status='active' FOR UPDATE;
      IF NOT FOUND THEN SELECT * INTO v_member FROM public.pos_register_loyalty_member_v2(p_brand_slug,p_customer_id,p_user_id); END IF;
    END IF;
  END IF;
  IF v_member.id IS NOT NULL THEN
    v_lifetime_before:=v_member.lifetime_points;
    SELECT * INTO v_tier_before FROM public.pos_resolve_loyalty_tier(p_brand_slug,v_program.id,v_lifetime_before);
    v_multiplier:=COALESCE(v_tier_before.points_multiplier,1);
    IF v_member.tier_id IS DISTINCT FROM v_tier_before.tier_id THEN UPDATE public.pos_loyalty_members SET tier_id=v_tier_before.tier_id WHERE id=v_member.id RETURNING * INTO v_member; END IF;
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

  IF v_reward_source IS NOT NULL THEN
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

    IF v_reward_source IS NOT NULL
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

  IF v_reward_source IS NOT NULL
     AND round(v_remaining_loyalty_discount, 2) <> 0 THEN
    RAISE EXCEPTION 'No se pudo distribuir completamente el descuento de fidelización.';
  END IF;

  IF v_reward_source IS NOT NULL
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

  IF v_reward_source = 'points' THEN
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

  IF v_reward_source = 'visits' THEN
    UPDATE public.pos_loyalty_reward_unlocks SET status='redeemed',redeemed_sale_id=v_sale.id,redeemed_at=now()
    WHERE id=v_reward_unlock.id AND status='available' AND redeemed_sale_id IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'La recompensa desbloqueada ya no está disponible.'; END IF;
  END IF;

  IF v_program.id IS NOT NULL AND v_member.id IS NOT NULL THEN
    v_base_points:=floor(v_sale.total*v_program.points_per_currency);
    v_earned_points:=floor(v_base_points*v_multiplier);
    IF v_earned_points>0 THEN
      UPDATE public.pos_loyalty_members SET points_balance=points_balance+v_earned_points,lifetime_points=lifetime_points+v_earned_points WHERE id=v_member.id RETURNING * INTO v_member;
      INSERT INTO public.pos_loyalty_transactions(brand_id,brand_slug,member_id,sale_id,transaction_type,points,balance_after,description,created_by)
      VALUES(v_member.brand_id,v_member.brand_slug,v_member.id,v_sale.id,'earn',v_earned_points,v_member.points_balance,'Puntos por compra '||v_sale.sale_number,p_user_id);
    END IF;
    v_loyalty_balance:=v_member.points_balance; v_lifetime_after:=v_member.lifetime_points;
    SELECT * INTO v_tier_after FROM public.pos_resolve_loyalty_tier(p_brand_slug,v_program.id,v_lifetime_after);
    v_tier_promoted:=v_tier_after.tier_id IS NOT NULL AND v_tier_after.tier_id IS DISTINCT FROM v_tier_before.tier_id AND v_tier_after.minimum_lifetime_points>COALESCE(v_tier_before.minimum_lifetime_points,-1);
    UPDATE public.pos_loyalty_members SET tier_id=v_tier_after.tier_id WHERE id=v_member.id RETURNING * INTO v_member;
    INSERT INTO public.pos_sale_loyalty_tier_snapshots(brand_id,brand_slug,sale_id,member_id,base_points,earned_points,tier_multiplier,lifetime_points_before,lifetime_points_after,tier_before_id,tier_before_name,tier_before_minimum_lifetime_points,tier_before_points_multiplier,tier_after_id,tier_after_name,tier_after_minimum_lifetime_points,tier_after_points_multiplier,tier_promoted)
    VALUES(v_member.brand_id,v_member.brand_slug,v_sale.id,v_member.id,v_base_points,v_earned_points,v_multiplier,v_lifetime_before,v_lifetime_after,v_tier_before.tier_id,v_tier_before.name,v_tier_before.minimum_lifetime_points,v_tier_before.points_multiplier,v_tier_after.tier_id,v_tier_after.name,v_tier_after.minimum_lifetime_points,v_tier_after.points_multiplier,v_tier_promoted);
  ELSE
    INSERT INTO public.pos_sale_loyalty_tier_snapshots(brand_id,brand_slug,sale_id,member_id,base_points,earned_points,tier_multiplier,lifetime_points_before,lifetime_points_after,tier_promoted)
    VALUES(v_sale.brand_id,v_sale.brand_slug,v_sale.id,NULL,0,0,1,0,0,false);
  END IF;

  IF v_member.id IS NOT NULL AND v_member.status='active' THEN
    FOR v_campaign IN SELECT c.*,r.name reward_name,r.reward_type,r.reward_value FROM public.pos_loyalty_visit_programs c JOIN public.pos_loyalty_rewards r ON r.id=c.reward_id WHERE c.brand_slug=p_brand_slug AND c.loyalty_program_id=v_program.id AND c.active=true AND r.brand_slug=p_brand_slug AND r.program_id=v_program.id AND r.reward_type='discount_fixed' AND r.reward_value>0 AND (c.starts_at IS NULL OR c.starts_at<=v_sale.sold_at) AND (c.ends_at IS NULL OR c.ends_at>=v_sale.sold_at) ORDER BY c.id LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended(v_campaign.id::text||':'||v_member.id::text,0));
      SELECT COALESCE(sum(CASE event_type WHEN 'qualify' THEN 1 ELSE -1 END),0)::integer INTO v_completed_before FROM public.pos_loyalty_visit_events WHERE visit_program_id=v_campaign.id AND member_id=v_member.id;
      v_cycles_before:=v_completed_before/v_campaign.required_visits; v_event_id:=NULL;
      IF v_sale.total>=v_campaign.minimum_sale_amount THEN
        INSERT INTO public.pos_loyalty_visit_events(brand_id,brand_slug,visit_program_id,member_id,sale_id,event_type,cycle_number,required_visits_snapshot,minimum_sale_amount_snapshot,reward_id_snapshot,created_by) VALUES(v_campaign.brand_id,v_campaign.brand_slug,v_campaign.id,v_member.id,v_sale.id,'qualify',v_cycles_before+1,v_campaign.required_visits,v_campaign.minimum_sale_amount,v_campaign.reward_id,p_user_id) ON CONFLICT DO NOTHING RETURNING id INTO v_event_id;
        IF v_event_id IS NOT NULL THEN v_visits_earned:=v_visits_earned+1; END IF;
      END IF;
      SELECT COALESCE(sum(CASE event_type WHEN 'qualify' THEN 1 ELSE -1 END),0)::integer INTO v_completed_after FROM public.pos_loyalty_visit_events WHERE visit_program_id=v_campaign.id AND member_id=v_member.id;
      v_cycles_after:=v_completed_after/v_campaign.required_visits;
      IF v_cycles_after>v_cycles_before THEN
        FOR v_cycle IN v_cycles_before+1..v_cycles_after LOOP
          v_created_unlock:=NULL;
          INSERT INTO public.pos_loyalty_reward_unlocks(brand_id,brand_slug,visit_program_id,member_id,reward_id,cycle_number,source_sale_id,status,reward_name,reward_type,reward_value,required_visits_snapshot,minimum_sale_amount_snapshot) VALUES(v_campaign.brand_id,v_campaign.brand_slug,v_campaign.id,v_member.id,v_campaign.reward_id,v_cycle,v_sale.id,'available',v_campaign.reward_name,v_campaign.reward_type,v_campaign.reward_value,v_campaign.required_visits,v_campaign.minimum_sale_amount) ON CONFLICT(visit_program_id,member_id,cycle_number) DO NOTHING RETURNING * INTO v_created_unlock;
          IF v_created_unlock.id IS NOT NULL THEN v_visit_unlocks_created:=v_visit_unlocks_created||jsonb_build_array(jsonb_build_object('id',v_created_unlock.id,'visitProgramId',v_campaign.id,'visitProgramName',v_campaign.name,'cycleNumber',v_cycle,'rewardId',v_campaign.reward_id,'rewardName',v_campaign.reward_name,'rewardType',v_campaign.reward_type,'rewardValue',v_campaign.reward_value)); END IF;
        END LOOP;
      END IF;
      v_visit_progress:=v_visit_progress||jsonb_build_array(jsonb_build_object('visitProgramId',v_campaign.id,'name',v_campaign.name,'qualified',v_event_id IS NOT NULL,'requiredVisits',v_campaign.required_visits,'completedVisits',v_completed_after,'cyclesCompleted',v_cycles_after,'currentProgress',mod(v_completed_after,v_campaign.required_visits),'minimumSaleAmount',v_campaign.minimum_sale_amount));
    END LOOP;
  END IF;

  v_response:=jsonb_build_object('id',v_sale.id,'sale_number',v_sale.sale_number,'subtotal',v_sale.subtotal,'discount_total',v_sale.discount_total,'tax_total',v_sale.tax_total,'total',v_sale.total,'currency',v_sale.currency,'payment_applied',v_payment_total,'payment_received',v_tendered_total,'change_due',v_change_total,'points_earned',v_earned_points,'points_redeemed',v_points_redeemed,'loyalty_discount',round(v_loyalty_discount_total,2),'redemption_id',v_redemption_id,'reward_id',v_response_reward_id,'loyalty_balance',v_loyalty_balance,'base_points',v_base_points,'tier_multiplier',v_multiplier,'tier_before',CASE WHEN v_tier_before.tier_id IS NULL THEN NULL ELSE jsonb_build_object('id',v_tier_before.tier_id,'name',v_tier_before.name,'minimumLifetimePoints',v_tier_before.minimum_lifetime_points,'pointsMultiplier',v_tier_before.points_multiplier) END,'tier_after',CASE WHEN v_tier_after.tier_id IS NULL THEN NULL ELSE jsonb_build_object('id',v_tier_after.tier_id,'name',v_tier_after.name,'minimumLifetimePoints',v_tier_after.minimum_lifetime_points,'pointsMultiplier',v_tier_after.points_multiplier) END,'tier_promoted',v_tier_promoted,'reward_source',v_reward_source,'reward_unlock_id',p_reward_unlock_id,'visits_earned',v_visits_earned,'visit_progress',v_visit_progress,'visit_unlocks_created',v_visit_unlocks_created,'idempotent_replay',false,'sold_at',v_sale.sold_at);
  INSERT INTO public.pos_sale_loyalty_visit_snapshots(brand_id,brand_slug,sale_id,member_id,reward_source,reward_id,reward_unlock_id,reward_discount_applied,visits_earned,visit_progress,visit_unlocks_created,response_json) VALUES(v_sale.brand_id,v_sale.brand_slug,v_sale.id,v_member.id,v_reward_source,p_reward_id,p_reward_unlock_id,round(v_loyalty_discount_total,2),v_visits_earned,v_visit_progress,v_visit_unlocks_created,v_response);
  RETURN v_response;
END;
$_$;


ALTER FUNCTION "public"."pos_complete_sale_v4"("p_brand_slug" "text", "p_location_id" "uuid", "p_register_id" "uuid", "p_cash_session_id" "uuid", "p_customer_id" "uuid", "p_items" "jsonb", "p_payments" "jsonb", "p_notes" "text", "p_user_id" "uuid", "p_reward_id" "uuid", "p_idempotency_key" "uuid", "p_reward_unlock_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_compute_subscription_lifecycle"("p_brand_slug" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_subscription public.pos_subscriptions%ROWTYPE;
  v_now timestamptz := now();
  v_seconds_remaining numeric := 0;
  v_days_remaining integer := 0;
  v_hours_remaining integer := 0;
  v_trial_expired boolean := false;
  v_expiring_soon boolean := false;
  v_effective_status text;
  v_access_allowed boolean := false;
  v_requires_activation boolean := false;
  v_reason text := NULL;
BEGIN
  IF p_brand_slug IS NULL OR btrim(p_brand_slug) = '' THEN
    RAISE EXCEPTION 'POS_SUBSCRIPTION_BRAND_REQUIRED';
  END IF;

  SELECT *
  INTO v_subscription
  FROM public.pos_subscriptions
  WHERE brand_slug = btrim(p_brand_slug);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_SUBSCRIPTION_NOT_FOUND';
  END IF;

  IF v_subscription.status = 'trial' THEN
    v_trial_expired :=
      v_subscription.trial_ends_at IS NULL
      OR v_subscription.trial_ends_at <= v_now;

    IF NOT v_trial_expired THEN
      v_seconds_remaining := greatest(
        extract(epoch FROM (v_subscription.trial_ends_at - v_now)),
        0
      );
      v_days_remaining := ceil(v_seconds_remaining / 86400.0)::integer;
      v_hours_remaining := ceil(v_seconds_remaining / 3600.0)::integer;
      v_expiring_soon := v_seconds_remaining <= 259200;
    END IF;
  END IF;

  v_effective_status := CASE
    WHEN v_subscription.status = 'trial' AND v_trial_expired THEN 'trial_expired'
    ELSE v_subscription.status
  END;

  v_access_allowed := v_effective_status IN ('trial', 'active', 'grace_period');
  v_requires_activation := v_effective_status IN (
    'trial_expired', 'past_due', 'suspended', 'cancelled'
  );
  v_reason := CASE v_effective_status
    WHEN 'trial_expired' THEN 'TRIAL_EXPIRED'
    WHEN 'past_due' THEN 'PAYMENT_PAST_DUE'
    WHEN 'suspended' THEN 'SUBSCRIPTION_SUSPENDED'
    WHEN 'cancelled' THEN 'SUBSCRIPTION_CANCELLED'
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'planCode', v_subscription.plan_code,
    'status', v_subscription.status,
    'effectiveStatus', v_effective_status,
    'accessAllowed', v_access_allowed,
    'trial', jsonb_build_object(
      'startedAt', v_subscription.started_at,
      'endsAt', v_subscription.trial_ends_at,
      'daysRemaining', v_days_remaining,
      'hoursRemaining', v_hours_remaining,
      'expired', v_trial_expired,
      'expiringSoon', v_expiring_soon
    ),
    'period', jsonb_build_object(
      'startsAt', v_subscription.current_period_start,
      'endsAt', v_subscription.current_period_end,
      'graceEndsAt', v_subscription.grace_ends_at
    ),
    'cancelledAt', v_subscription.cancelled_at,
    'requiresActivation', v_requires_activation,
    'reason', v_reason
  );
END
$$;


ALTER FUNCTION "public"."pos_compute_subscription_lifecycle"("p_brand_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_configure_business_profile"("p_brand_id" "text", "p_brand_slug" "text", "p_profile_code" "text", "p_operation_mode" "text", "p_capabilities" "jsonb", "p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_profile_catalog public.pos_profile_catalog%rowtype;
  v_profile public.pos_business_profiles%rowtype;
  v_capability public.pos_capability_catalog%rowtype;
  v_default_enabled boolean;
  v_requested_value text;
  v_enabled boolean;
  v_source text;
  v_capabilities_result jsonb := '{}'::jsonb;
begin
  if nullif(trim(p_brand_id), '') is null then
    raise exception 'brand_id es obligatorio.';
  end if;

  if nullif(trim(p_brand_slug), '') is null then
    raise exception 'brand_slug es obligatorio.';
  end if;

  if nullif(trim(p_profile_code), '') is null then
    raise exception 'profile_code es obligatorio.';
  end if;

  select *
  into v_profile_catalog
  from public.pos_profile_catalog
  where code = trim(p_profile_code)
    and launch_status = 'live';

  if not found then
    raise exception 'El perfil no existe o todavía no está disponible.';
  end if;

  insert into public.pos_business_profiles (
    brand_id,
    brand_slug,
    profile_code,
    operation_mode,
    onboarding_status,
    onboarding_step,
    created_by
  )
  values (
    trim(p_brand_id),
    trim(p_brand_slug),
    trim(p_profile_code),
    case
      when lower(trim(coalesce(p_operation_mode, 'single'))) = 'mixed'
        then 'mixed'
      else 'single'
    end,
    'in_progress',
    2,
    p_user_id
  )
  on conflict (brand_slug) do update
  set
    brand_id = excluded.brand_id,
    profile_code = excluded.profile_code,
    operation_mode = excluded.operation_mode,
    onboarding_status =
      case
        when public.pos_business_profiles.onboarding_status = 'completed'
          then 'completed'
        else 'in_progress'
      end,
    onboarding_step = greatest(
      public.pos_business_profiles.onboarding_step,
      2
    )
  returning *
  into v_profile;

  for v_capability in
    select *
    from public.pos_capability_catalog
    order by sort_order, code
  loop
    select defaults.enabled
    into v_default_enabled
    from public.pos_profile_capability_defaults defaults
    where defaults.profile_code = trim(p_profile_code)
      and defaults.capability_code = v_capability.code;

    v_requested_value :=
      coalesce(p_capabilities, '{}'::jsonb) ->> v_capability.code;

    if v_requested_value is not null then
      v_enabled := lower(trim(v_requested_value)) in ('true', '1', 'yes', 'si');
      v_source := 'manual';
    else
      v_enabled := coalesce(v_default_enabled, false);
      v_source := 'template';
    end if;

    -- Las capacidades futuras se registran, pero no pueden
    -- activarse todavía desde el producto comercial.
    if v_capability.launch_status <> 'live' then
      v_enabled := false;
      v_source := 'system';
    end if;

    insert into public.pos_business_capabilities (
      brand_id,
      brand_slug,
      capability_code,
      enabled,
      source,
      created_by
    )
    values (
      trim(p_brand_id),
      trim(p_brand_slug),
      v_capability.code,
      v_enabled,
      v_source,
      p_user_id
    )
    on conflict (brand_slug, capability_code) do update
    set
      brand_id = excluded.brand_id,
      enabled = excluded.enabled,
      source = excluded.source
    returning enabled
    into v_enabled;

    v_capabilities_result :=
      v_capabilities_result ||
      jsonb_build_object(v_capability.code, v_enabled);
  end loop;

  return jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'capabilities', v_capabilities_result
  );
end;
$$;


ALTER FUNCTION "public"."pos_configure_business_profile"("p_brand_id" "text", "p_brand_slug" "text", "p_profile_code" "text", "p_operation_mode" "text", "p_capabilities" "jsonb", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_create_analytics_snapshot"("p_brand_slug" "text", "p_snapshot_type" "text", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_location_id" "uuid" DEFAULT NULL::"uuid", "p_generated_by" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_brand_id text; v_metrics jsonb; v_row public.pos_analytics_snapshots%rowtype;
BEGIN
 IF p_snapshot_type NOT IN('daily','weekly','monthly','custom') THEN RAISE EXCEPTION 'Tipo de snapshot no permitido.'; END IF;
 SELECT s.brand_id INTO v_brand_id FROM public.pos_analytics_assert_scope(p_brand_slug,p_period_start,p_period_end,p_location_id)s;
 v_metrics:=jsonb_build_object('schemaVersion','reports_v1','salesAndCustomers',public.pos_get_analytics_summary(p_brand_slug,p_period_start,p_period_end,p_location_id),'topProducts',public.pos_get_analytics_products(p_brand_slug,p_period_start,p_period_end,p_location_id,10,'sales_total'),'topCustomers',public.pos_get_analytics_customers(p_brand_slug,p_period_start,p_period_end,p_location_id,10),
  'inventorySummary',(SELECT jsonb_build_object('trackedRows',count(*),'availableQuantity',COALESCE(sum((x->>'availableQuantity')::numeric),0),'inventoryCostValue',COALESCE(sum((x->>'inventoryCostValue')::numeric),0),'outOfStockRows',count(*)FILTER(WHERE(x->>'availableQuantity')::numeric<=0),'belowMinimumRows',count(*)FILTER(WHERE(x->>'availableQuantity')::numeric<=(x->>'minimumQuantity')::numeric)) FROM jsonb_array_elements(public.pos_get_analytics_inventory(p_brand_slug,p_period_start,p_period_end,p_location_id))x),
  'loyalty',public.pos_get_analytics_loyalty(p_brand_slug,p_period_start,p_period_end,p_location_id),'dataQuality',public.pos_get_analytics_data_quality(p_brand_slug,p_period_start,p_period_end,p_location_id));
 INSERT INTO public.pos_analytics_snapshots(brand_id,brand_slug,location_id,snapshot_type,period_start,period_end,metrics,schema_version,generated_by)VALUES(v_brand_id,p_brand_slug,p_location_id,p_snapshot_type,p_period_start,p_period_end,v_metrics,'reports_v1',p_generated_by)RETURNING * INTO v_row;
 RETURN jsonb_build_object('id',v_row.id,'brandSlug',v_row.brand_slug,'locationId',v_row.location_id,'snapshotType',v_row.snapshot_type,'periodStart',v_row.period_start,'periodEnd',v_row.period_end,'metrics',v_row.metrics,'schemaVersion',v_row.schema_version,'createdAt',v_row.created_at);
END $$;


ALTER FUNCTION "public"."pos_create_analytics_snapshot"("p_brand_slug" "text", "p_snapshot_type" "text", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_location_id" "uuid", "p_generated_by" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_cash_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "cash_session_id" "uuid" NOT NULL,
    "movement_type" "text" NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "reason" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_cash_movements_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "pos_cash_movements_movement_type_check" CHECK (("movement_type" = ANY (ARRAY['income'::"text", 'expense'::"text", 'withdrawal'::"text", 'deposit'::"text"])))
);


ALTER TABLE "public"."pos_cash_movements" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_create_cash_movement"("p_brand_slug" "text", "p_cash_session_id" "uuid", "p_movement_type" "text", "p_amount" numeric, "p_reason" "text", "p_user_id" "uuid") RETURNS "public"."pos_cash_movements"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."pos_create_cash_movement"("p_brand_slug" "text", "p_cash_session_id" "uuid", "p_movement_type" "text", "p_amount" numeric, "p_reason" "text", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_create_intelligence_report_record"("p_brand_slug" "text", "p_location_id" "uuid", "p_report_type" "text", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_analytics_snapshot_id" "uuid", "p_signals_snapshot" "jsonb", "p_input_snapshot" "jsonb", "p_executive_summary" "text", "p_health_status" "text", "p_health_score" numeric, "p_findings" "jsonb", "p_opportunities" "jsonb", "p_risks" "jsonb", "p_hypotheses" "jsonb", "p_recommended_actions" "jsonb", "p_data_quality_notes" "jsonb", "p_model" "text", "p_prompt_version" "text", "p_schema_version" "text", "p_input_hash" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE b text; v_row public.pos_intelligence_reports%rowtype;
BEGIN
 SELECT brand_id INTO b FROM public.pos_analytics_assert_scope(p_brand_slug,p_period_start,p_period_end,p_location_id);
 IF p_analytics_snapshot_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.pos_analytics_snapshots s WHERE s.id=p_analytics_snapshot_id AND s.brand_slug=p_brand_slug AND COALESCE(s.location_id,'00000000-0000-0000-0000-000000000000'::uuid)=COALESCE(p_location_id,'00000000-0000-0000-0000-000000000000'::uuid))THEN RAISE EXCEPTION 'El snapshot analítico no pertenece al scope autorizado.';END IF;
 INSERT INTO public.pos_intelligence_reports(brand_id,brand_slug,location_id,report_type,period_start,period_end,analytics_snapshot_id,signals_snapshot,input_snapshot,executive_summary,health_status,health_score,findings,opportunities,risks,hypotheses,recommended_actions,data_quality_notes,model,prompt_version,schema_version,generation_status,input_hash)
 VALUES(b,p_brand_slug,p_location_id,p_report_type,p_period_start,p_period_end,p_analytics_snapshot_id,p_signals_snapshot,p_input_snapshot,p_executive_summary,p_health_status,p_health_score,p_findings,p_opportunities,p_risks,p_hypotheses,p_recommended_actions,p_data_quality_notes,p_model,p_prompt_version,p_schema_version,'completed',p_input_hash)
 ON CONFLICT(brand_slug,COALESCE(location_id,'00000000-0000-0000-0000-000000000000'::uuid),report_type,period_start,period_end,input_hash,prompt_version,model)WHERE generation_status='completed'
 DO NOTHING RETURNING * INTO v_row;
 IF v_row.id IS NULL THEN SELECT * INTO v_row FROM public.pos_intelligence_reports r WHERE r.brand_slug=p_brand_slug AND COALESCE(r.location_id,'00000000-0000-0000-0000-000000000000'::uuid)=COALESCE(p_location_id,'00000000-0000-0000-0000-000000000000'::uuid)AND r.report_type=p_report_type AND r.period_start=p_period_start AND r.period_end=p_period_end AND r.input_hash=p_input_hash AND r.prompt_version=p_prompt_version AND r.model=p_model AND r.generation_status='completed';END IF;
 RETURN to_jsonb(v_row)-'input_snapshot'-'signals_snapshot';
END $$;


ALTER FUNCTION "public"."pos_create_intelligence_report_record"("p_brand_slug" "text", "p_location_id" "uuid", "p_report_type" "text", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_analytics_snapshot_id" "uuid", "p_signals_snapshot" "jsonb", "p_input_snapshot" "jsonb", "p_executive_summary" "text", "p_health_status" "text", "p_health_score" numeric, "p_findings" "jsonb", "p_opportunities" "jsonb", "p_risks" "jsonb", "p_hypotheses" "jsonb", "p_recommended_actions" "jsonb", "p_data_quality_notes" "jsonb", "p_model" "text", "p_prompt_version" "text", "p_schema_version" "text", "p_input_hash" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_loyalty_tiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "program_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "minimum_lifetime_points" integer DEFAULT 0 NOT NULL,
    "points_multiplier" numeric(8,4) DEFAULT 1 NOT NULL,
    "benefits" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_loyalty_tiers_minimum_lifetime_points_nonnegative" CHECK (("minimum_lifetime_points" >= 0)),
    CONSTRAINT "pos_loyalty_tiers_points_multiplier_positive" CHECK (("points_multiplier" > (0)::numeric))
);


ALTER TABLE "public"."pos_loyalty_tiers" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_create_loyalty_tier"("p_brand_slug" "text", "p_name" "text", "p_minimum_lifetime_points" integer, "p_points_multiplier" numeric, "p_sort_order" integer, "p_active" boolean) RETURNS "public"."pos_loyalty_tiers"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_program public.pos_loyalty_programs%rowtype;
  v_tier public.pos_loyalty_tiers%rowtype;
BEGIN
  SELECT * INTO v_program FROM public.pos_loyalty_programs
  WHERE brand_slug = p_brand_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe un programa de fidelización para esta marca.'; END IF;
  IF NULLIF(trim(p_name), '') IS NULL THEN RAISE EXCEPTION 'El nombre del nivel es obligatorio.'; END IF;
  IF p_minimum_lifetime_points IS NULL OR p_minimum_lifetime_points < 0 THEN RAISE EXCEPTION 'Los puntos históricos mínimos deben ser cero o mayores.'; END IF;
  IF p_points_multiplier IS NULL OR p_points_multiplier <= 0 THEN RAISE EXCEPTION 'El multiplicador debe ser mayor que cero.'; END IF;

  INSERT INTO public.pos_loyalty_tiers (
    brand_id, brand_slug, program_id, name, minimum_lifetime_points,
    points_multiplier, benefits, sort_order, active
  ) VALUES (
    v_program.brand_id, v_program.brand_slug, v_program.id, trim(p_name),
    p_minimum_lifetime_points, p_points_multiplier, '[]'::jsonb,
    COALESCE(p_sort_order, 0), COALESCE(p_active, true)
  ) RETURNING * INTO v_tier;
  UPDATE public.pos_loyalty_members member
  SET tier_id = (
    SELECT resolved.tier_id FROM public.pos_resolve_loyalty_tier(
      member.brand_slug, member.program_id, member.lifetime_points
    ) resolved
  )
  WHERE member.program_id = v_program.id;
  RETURN v_tier;
END;
$$;


ALTER FUNCTION "public"."pos_create_loyalty_tier"("p_brand_slug" "text", "p_name" "text", "p_minimum_lifetime_points" integer, "p_points_multiplier" numeric, "p_sort_order" integer, "p_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_create_loyalty_visit_program"("p_brand_slug" "text", "p_name" "text", "p_required_visits" integer, "p_minimum_sale_amount" numeric, "p_reward_id" "uuid", "p_active" boolean, "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_program public.pos_loyalty_programs%rowtype;
  v_reward public.pos_loyalty_rewards%rowtype;
  v_visit public.pos_loyalty_visit_programs%rowtype;
BEGIN
  IF NULLIF(trim(p_name), '') IS NULL THEN RAISE EXCEPTION 'El nombre del programa de visitas es obligatorio.'; END IF;
  IF p_required_visits IS NULL OR p_required_visits <= 0 THEN RAISE EXCEPTION 'La meta de visitas debe ser mayor que cero.'; END IF;
  IF p_minimum_sale_amount IS NULL OR p_minimum_sale_amount < 0 THEN RAISE EXCEPTION 'La compra mínima no puede ser negativa.'; END IF;
  IF p_ends_at IS NOT NULL AND p_starts_at IS NOT NULL AND p_ends_at <= p_starts_at THEN RAISE EXCEPTION 'La fecha final debe ser posterior a la inicial.'; END IF;
  SELECT * INTO v_program FROM public.pos_loyalty_programs WHERE brand_slug = p_brand_slug AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe un programa de fidelización activo para esta marca.'; END IF;
  SELECT * INTO v_reward FROM public.pos_loyalty_rewards
  WHERE id = p_reward_id AND brand_slug = p_brand_slug AND brand_id = v_program.brand_id
    AND program_id = v_program.id AND active = true AND reward_type = 'discount_fixed';
  IF NOT FOUND THEN RAISE EXCEPTION 'La recompensa no existe, no está activa, pertenece a otra marca o no es de descuento fijo.'; END IF;
  INSERT INTO public.pos_loyalty_visit_programs (
    brand_id, brand_slug, loyalty_program_id, name, required_visits,
    minimum_sale_amount, reward_id, active, starts_at, ends_at, created_by
  ) VALUES (
    v_program.brand_id, v_program.brand_slug, v_program.id, trim(p_name), p_required_visits,
    round(p_minimum_sale_amount, 2), v_reward.id, COALESCE(p_active, true), p_starts_at, p_ends_at, p_user_id
  ) RETURNING * INTO v_visit;
  RETURN jsonb_build_object(
    'id', v_visit.id, 'name', v_visit.name, 'requiredVisits', v_visit.required_visits,
    'minimumSaleAmount', v_visit.minimum_sale_amount, 'rewardId', v_visit.reward_id,
    'active', v_visit.active, 'startsAt', v_visit.starts_at, 'endsAt', v_visit.ends_at,
    'createdAt', v_visit.created_at, 'updatedAt', v_visit.updated_at
  );
END;
$$;


ALTER FUNCTION "public"."pos_create_loyalty_visit_program"("p_brand_slug" "text", "p_name" "text", "p_required_visits" integer, "p_minimum_sale_amount" numeric, "p_reward_id" "uuid", "p_active" boolean, "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_create_product"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_category_id" "uuid", "p_name" "text", "p_description" "text", "p_product_type" "text", "p_track_inventory" boolean, "p_tax_rate" numeric, "p_image_url" "text", "p_variants" "jsonb", "p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_location public.pos_locations%rowtype;
  v_product public.pos_products%rowtype;
  v_variant_json jsonb;
  v_variant public.pos_product_variants%rowtype;
  v_initial_quantity numeric(14,3);
  v_minimum_quantity numeric(14,3);
  v_variants_result jsonb := '[]'::jsonb;
begin
  if trim(coalesce(p_name, '')) = '' then
    raise exception 'El nombre del producto es obligatorio.';
  end if;

  select *
  into v_location
  from public.pos_locations
  where id = p_location_id
    and brand_slug = p_brand_slug
    and active = true;

  if not found then
    raise exception 'La sucursal no existe o pertenece a otra marca.';
  end if;

  insert into public.pos_products (
    brand_id,
    brand_slug,
    category_id,
    name,
    description,
    product_type,
    track_inventory,
    tax_rate,
    image_url,
    created_by
  )
  values (
    p_brand_id,
    p_brand_slug,
    p_category_id,
    trim(p_name),
    p_description,
    case
      when p_product_type in ('physical', 'service')
        then p_product_type
      else 'physical'
    end,
    coalesce(p_track_inventory, true),
    coalesce(p_tax_rate, 0),
    p_image_url,
    p_user_id
  )
  returning *
  into v_product;

  if jsonb_typeof(p_variants) <> 'array'
     or jsonb_array_length(p_variants) = 0 then
    p_variants := jsonb_build_array(
      jsonb_build_object(
        'name', 'Única',
        'price', 0,
        'cost', 0,
        'initial_quantity', 0,
        'minimum_quantity', 0,
        'attributes', '{}'::jsonb
      )
    );
  end if;

  for v_variant_json in
    select value from jsonb_array_elements(p_variants)
  loop
    v_initial_quantity :=
      greatest(
        coalesce(
          (v_variant_json ->> 'initial_quantity')::numeric,
          0
        ),
        0
      );

    v_minimum_quantity :=
      greatest(
        coalesce(
          (v_variant_json ->> 'minimum_quantity')::numeric,
          0
        ),
        0
      );

    insert into public.pos_product_variants (
      brand_id,
      brand_slug,
      product_id,
      name,
      sku,
      barcode,
      price,
      cost,
      attributes,
      created_by
    )
    values (
      p_brand_id,
      p_brand_slug,
      v_product.id,
      coalesce(
        nullif(trim(v_variant_json ->> 'name'), ''),
        'Única'
      ),
      nullif(trim(v_variant_json ->> 'sku'), ''),
      nullif(trim(v_variant_json ->> 'barcode'), ''),
      greatest(
        coalesce((v_variant_json ->> 'price')::numeric, 0),
        0
      ),
      greatest(
        coalesce((v_variant_json ->> 'cost')::numeric, 0),
        0
      ),
      coalesce(v_variant_json -> 'attributes', '{}'::jsonb),
      p_user_id
    )
    returning *
    into v_variant;

    insert into public.pos_inventory (
      brand_id,
      brand_slug,
      location_id,
      variant_id,
      quantity,
      minimum_quantity
    )
    values (
      p_brand_id,
      p_brand_slug,
      p_location_id,
      v_variant.id,
      case
        when p_track_inventory then v_initial_quantity
        else 0
      end,
      v_minimum_quantity
    );

    if p_track_inventory and v_initial_quantity > 0 then
      insert into public.pos_inventory_movements (
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
      values (
        p_brand_id,
        p_brand_slug,
        p_location_id,
        v_variant.id,
        'initial',
        v_initial_quantity,
        0,
        v_initial_quantity,
        'product',
        v_product.id,
        'Inventario inicial',
        p_user_id
      );
    end if;

    v_variants_result :=
      v_variants_result ||
      jsonb_build_array(to_jsonb(v_variant));
  end loop;

  return jsonb_build_object(
    'id', v_product.id,
    'product', to_jsonb(v_product),
    'variants', v_variants_result
  );
end;
$$;


ALTER FUNCTION "public"."pos_create_product"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_category_id" "uuid", "p_name" "text", "p_description" "text", "p_product_type" "text", "p_track_inventory" boolean, "p_tax_rate" numeric, "p_image_url" "text", "p_variants" "jsonb", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_create_product_v2"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_category_id" "uuid", "p_name" "text", "p_description" "text", "p_product_type" "text", "p_inventory_mode" "text", "p_default_unit_code" "text", "p_has_variants" boolean, "p_sellable" boolean, "p_purchasable" boolean, "p_tax_rate" numeric, "p_image_url" "text", "p_configuration" "jsonb", "p_variants" "jsonb", "p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_profile public.pos_business_profiles%rowtype;
  v_location public.pos_locations%rowtype;
  v_category public.pos_categories%rowtype;
  v_unit public.pos_units%rowtype;
  v_product public.pos_products%rowtype;
  v_variant public.pos_product_variants%rowtype;

  v_variant_json jsonb;
  v_attributes jsonb;
  v_variant_configuration jsonb;

  v_product_type text;
  v_inventory_mode text;
  v_default_unit_code text;
  v_variant_unit_code text;
  v_variant_name text;
  v_sku text;
  v_barcode text;
  v_variant_image_url text;

  v_price numeric(14,2);
  v_cost numeric(14,2);
  v_initial_quantity numeric(14,3);
  v_minimum_quantity numeric(14,3);

  v_variant_count integer;
  v_position integer := 0;
  v_is_default boolean;
  v_track_inventory boolean;
  v_has_variants boolean;

  v_required_attribute record;
  v_attribute_value text;

  v_variants_result jsonb := '[]'::jsonb;
begin
  -- -------------------------------------------------------
  -- Validaciones generales
  -- -------------------------------------------------------

  if nullif(trim(p_brand_id), '') is null then
    raise exception 'brand_id es obligatorio.';
  end if;

  if nullif(trim(p_brand_slug), '') is null then
    raise exception 'brand_slug es obligatorio.';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'El nombre del producto es obligatorio.';
  end if;

  if length(trim(p_name)) > 180 then
    raise exception 'El nombre del producto supera 180 caracteres.';
  end if;

  select *
  into v_profile
  from public.pos_business_profiles
  where brand_slug = trim(p_brand_slug);

  if not found
     or v_profile.profile_code = 'unconfigured' then
    raise exception 'Primero configura el giro del negocio.';
  end if;

  -- En el lanzamiento inicial solo activamos productos físicos
  -- y servicios. Los demás tipos ya existen en la arquitectura,
  -- pero permanecen reservados para bloques posteriores.

  v_product_type :=
    lower(trim(coalesce(p_product_type, 'physical')));

  if v_product_type not in (
    'physical',
    'service'
  ) then
    raise exception
      'Este tipo de producto todavía no está disponible.';
  end if;

  v_inventory_mode :=
    lower(
      trim(
        coalesce(
          p_inventory_mode,
          case
            when v_product_type = 'service'
              then 'none'
            else 'direct'
          end
        )
      )
    );

  if v_inventory_mode not in (
    'direct',
    'none'
  ) then
    raise exception
      'Este modo de inventario todavía no está disponible.';
  end if;

  if v_product_type = 'service' then
    v_inventory_mode := 'none';
  end if;

  v_track_inventory :=
    v_inventory_mode = 'direct';

  v_has_variants :=
    coalesce(p_has_variants, false);

  -- Los servicios se guardan inicialmente como concepto único.
  if v_product_type = 'service' then
    v_has_variants := false;
  end if;

  -- -------------------------------------------------------
  -- Validar capacidad para servicios
  -- -------------------------------------------------------

  if v_product_type = 'service'
     and not exists (
       select 1
       from public.pos_business_capabilities capability
       where capability.brand_slug = trim(p_brand_slug)
         and capability.capability_code = 'services'
         and capability.enabled = true
     )
  then
    raise exception
      'El perfil del negocio no tiene habilitada la venta de servicios.';
  end if;

  -- -------------------------------------------------------
  -- Validar sucursal cuando se utilizará inventario directo
  -- -------------------------------------------------------

  if v_track_inventory then
    if p_location_id is null then
      raise exception
        'Selecciona una sucursal para manejar inventario.';
    end if;

    select *
    into v_location
    from public.pos_locations
    where id = p_location_id
      and brand_slug = trim(p_brand_slug)
      and active = true;

    if not found then
      raise exception
        'La sucursal no existe, está desactivada o pertenece a otra marca.';
    end if;
  elsif p_location_id is not null then
    select *
    into v_location
    from public.pos_locations
    where id = p_location_id
      and brand_slug = trim(p_brand_slug)
      and active = true;

    if not found then
      raise exception
        'La sucursal no existe, está desactivada o pertenece a otra marca.';
    end if;
  end if;

  -- -------------------------------------------------------
  -- Validar categoría
  -- -------------------------------------------------------

  if p_category_id is not null then
    select *
    into v_category
    from public.pos_categories
    where id = p_category_id
      and brand_slug = trim(p_brand_slug)
      and active = true;

    if not found then
      raise exception
        'La categoría no existe o pertenece a otra marca.';
    end if;
  end if;

  -- -------------------------------------------------------
  -- Validar unidad predeterminada
  -- -------------------------------------------------------

  v_default_unit_code :=
    lower(
      trim(
        coalesce(
          p_default_unit_code,
          case
            when v_product_type = 'service'
              then 'service'
            else 'piece'
          end
        )
      )
    );

  select *
  into v_unit
  from public.pos_units
  where code = v_default_unit_code
    and active = true;

  if not found then
    raise exception
      'La unidad predeterminada no existe o está desactivada.';
  end if;

  if v_product_type = 'service' then
    v_default_unit_code := 'service';
  end if;

  -- -------------------------------------------------------
  -- Validar arreglo de variantes
  -- -------------------------------------------------------

  if p_variants is null
     or jsonb_typeof(p_variants) <> 'array'
     or jsonb_array_length(p_variants) = 0
  then
    p_variants := jsonb_build_array(
      jsonb_build_object(
        'name',
        'Única',
        'price',
        0,
        'cost',
        0,
        'initial_quantity',
        0,
        'minimum_quantity',
        0,
        'attributes',
        '{}'::jsonb,
        'unit_code',
        v_default_unit_code,
        'is_default',
        true,
        'sort_order',
        0,
        'configuration',
        '{}'::jsonb
      )
    );
  end if;

  v_variant_count :=
    jsonb_array_length(p_variants);

  if not v_has_variants
     and v_variant_count > 1 then
    raise exception
      'Un producto sin variantes solo puede contener una presentación.';
  end if;

  if v_variant_count > 100 then
    raise exception
      'Un producto no puede crear más de 100 variantes en una sola operación.';
  end if;

  -- -------------------------------------------------------
  -- Crear producto
  -- -------------------------------------------------------

  insert into public.pos_products (
    brand_id,
    brand_slug,
    category_id,
    name,
    description,
    product_type,
    track_inventory,
    inventory_mode,
    default_unit_code,
    has_variants,
    sellable,
    purchasable,
    tax_rate,
    image_url,
    configuration,
    active,
    created_by
  )
  values (
    trim(p_brand_id),
    trim(p_brand_slug),
    p_category_id,
    trim(p_name),
    nullif(trim(p_description), ''),
    v_product_type,
    v_track_inventory,
    v_inventory_mode,
    v_default_unit_code,
    v_has_variants,
    coalesce(p_sellable, true),
    coalesce(p_purchasable, true),
    greatest(
      0,
      least(
        100,
        coalesce(p_tax_rate, 0)
      )
    ),
    nullif(trim(p_image_url), ''),
    case
      when p_configuration is null
        or jsonb_typeof(p_configuration) <> 'object'
        then '{}'::jsonb
      else p_configuration
    end,
    true,
    p_user_id
  )
  returning *
  into v_product;

  -- -------------------------------------------------------
  -- Crear variantes e inventario inicial
  -- -------------------------------------------------------

  for v_variant_json in
    select value
    from jsonb_array_elements(p_variants)
  loop
    v_position := v_position + 1;

    if jsonb_typeof(v_variant_json) <> 'object' then
      raise exception
        'Cada variante debe ser un objeto válido.';
    end if;

    v_attributes :=
      case
        when jsonb_typeof(
          v_variant_json -> 'attributes'
        ) = 'object'
          then v_variant_json -> 'attributes'
        else '{}'::jsonb
      end;

    v_variant_configuration :=
      case
        when jsonb_typeof(
          v_variant_json -> 'configuration'
        ) = 'object'
          then v_variant_json -> 'configuration'
        else '{}'::jsonb
      end;

    -- Validar atributos obligatorios definidos para la marca.

    for v_required_attribute in
      select
        code,
        name
      from public.pos_product_attribute_definitions
      where brand_slug = trim(p_brand_slug)
        and active = true
        and required = true
      order by sort_order
    loop
      v_attribute_value :=
        nullif(
          trim(
            v_attributes ->>
            v_required_attribute.code
          ),
          ''
        );

      if v_attribute_value is null then
        raise exception
          'La variante % requiere el atributo %.',
          v_position,
          v_required_attribute.name;
      end if;
    end loop;

    v_variant_unit_code :=
      lower(
        trim(
          coalesce(
            nullif(
              v_variant_json ->> 'unit_code',
              ''
            ),
            v_default_unit_code
          )
        )
      );

    if not exists (
      select 1
      from public.pos_units unit_record
      where unit_record.code =
        v_variant_unit_code
        and unit_record.active = true
    ) then
      raise exception
        'La unidad de la variante % no existe.',
        v_position;
    end if;

    v_variant_name :=
      coalesce(
        nullif(
          trim(v_variant_json ->> 'name'),
          ''
        ),
        case
          when v_has_variants
            then 'Variante ' || v_position
          else 'Única'
        end
      );

    v_sku :=
      nullif(
        trim(v_variant_json ->> 'sku'),
        ''
      );

    v_barcode :=
      nullif(
        trim(v_variant_json ->> 'barcode'),
        ''
      );

    v_variant_image_url :=
      nullif(
        trim(v_variant_json ->> 'image_url'),
        ''
      );

    begin
      v_price :=
        greatest(
          coalesce(
            nullif(
              v_variant_json ->> 'price',
              ''
            )::numeric,
            0
          ),
          0
        );
    exception
      when invalid_text_representation then
        raise exception
          'El precio de la variante % no es válido.',
          v_position;
    end;

    begin
      v_cost :=
        greatest(
          coalesce(
            nullif(
              v_variant_json ->> 'cost',
              ''
            )::numeric,
            0
          ),
          0
        );
    exception
      when invalid_text_representation then
        raise exception
          'El costo de la variante % no es válido.',
          v_position;
    end;

    begin
      v_initial_quantity :=
        greatest(
          coalesce(
            nullif(
              v_variant_json ->>
              'initial_quantity',
              ''
            )::numeric,
            0
          ),
          0
        );
    exception
      when invalid_text_representation then
        raise exception
          'La existencia inicial de la variante % no es válida.',
          v_position;
    end;

    begin
      v_minimum_quantity :=
        greatest(
          coalesce(
            nullif(
              v_variant_json ->>
              'minimum_quantity',
              ''
            )::numeric,
            0
          ),
          0
        );
    exception
      when invalid_text_representation then
        raise exception
          'La existencia mínima de la variante % no es válida.',
          v_position;
    end;

    -- La primera variante siempre será la predeterminada.
    -- Esto evita que el cliente envíe varias como default.

    v_is_default :=
      v_position = 1;

    insert into public.pos_product_variants (
      brand_id,
      brand_slug,
      product_id,
      name,
      sku,
      barcode,
      price,
      cost,
      attributes,
      unit_code,
      is_default,
      sort_order,
      image_url,
      configuration,
      active,
      created_by
    )
    values (
      trim(p_brand_id),
      trim(p_brand_slug),
      v_product.id,
      v_variant_name,
      v_sku,
      v_barcode,
      v_price,
      v_cost,
      v_attributes,
      v_variant_unit_code,
      v_is_default,
      coalesce(
        nullif(
          v_variant_json ->> 'sort_order',
          ''
        )::integer,
        v_position - 1
      ),
      v_variant_image_url,
      v_variant_configuration,
      true,
      p_user_id
    )
    returning *
    into v_variant;

    if v_track_inventory then
      insert into public.pos_inventory (
        brand_id,
        brand_slug,
        location_id,
        variant_id,
        quantity,
        reserved_quantity,
        minimum_quantity
      )
      values (
        trim(p_brand_id),
        trim(p_brand_slug),
        p_location_id,
        v_variant.id,
        v_initial_quantity,
        0,
        v_minimum_quantity
      );

      if v_initial_quantity > 0 then
        insert into public.pos_inventory_movements (
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
        values (
          trim(p_brand_id),
          trim(p_brand_slug),
          p_location_id,
          v_variant.id,
          'initial',
          v_initial_quantity,
          0,
          v_initial_quantity,
          'product',
          v_product.id,
          'Inventario inicial del Product Engine V1',
          p_user_id
        );
      end if;
    end if;

    v_variants_result :=
      v_variants_result ||
      jsonb_build_array(
        jsonb_build_object(
          'variant',
          to_jsonb(v_variant),
          'initialQuantity',
          case
            when v_track_inventory
              then v_initial_quantity
            else 0
          end,
          'minimumQuantity',
          case
            when v_track_inventory
              then v_minimum_quantity
            else 0
          end
        )
      );
  end loop;

  return jsonb_build_object(
    'id',
    v_product.id,
    'product',
    to_jsonb(v_product),
    'variants',
    v_variants_result,
    'inventoryMode',
    v_inventory_mode,
    'locationId',
    p_location_id
  );

exception
  when unique_violation then
    if sqlerrm ilike '%unique_sku%'
       or sqlerrm ilike '%sku%' then
      raise exception
        'Ya existe una variante con ese SKU.';
    elsif sqlerrm ilike '%unique_barcode%'
       or sqlerrm ilike '%barcode%' then
      raise exception
        'Ya existe una variante con ese código de barras.';
    else
      raise;
    end if;
end;
$$;


ALTER FUNCTION "public"."pos_create_product_v2"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_category_id" "uuid", "p_name" "text", "p_description" "text", "p_product_type" "text", "p_inventory_mode" "text", "p_default_unit_code" "text", "p_has_variants" boolean, "p_sellable" boolean, "p_purchasable" boolean, "p_tax_rate" numeric, "p_image_url" "text", "p_configuration" "jsonb", "p_variants" "jsonb", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_create_product_v2"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_category_id" "uuid", "p_name" "text", "p_description" "text", "p_product_type" "text", "p_inventory_mode" "text", "p_default_unit_code" "text", "p_has_variants" boolean, "p_sellable" boolean, "p_purchasable" boolean, "p_tax_rate" numeric, "p_image_url" "text", "p_configuration" "jsonb", "p_variants" "jsonb", "p_user_id" "uuid", "p_product_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_result jsonb;
  v_product_id uuid;
  v_code text := NULLIF(btrim(p_product_code), '');
BEGIN
  IF v_code IS NOT NULL AND v_code !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' THEN
    RAISE EXCEPTION 'POS_PRODUCT_CODE_INVALID';
  END IF;

  v_result := public.pos_create_product_v2(
    p_brand_id, p_brand_slug, p_location_id, p_category_id, p_name,
    p_description, p_product_type, p_inventory_mode, p_default_unit_code,
    p_has_variants, p_sellable, p_purchasable, p_tax_rate, p_image_url,
    p_configuration, p_variants, p_user_id
  );

  v_product_id := NULLIF(v_result ->> 'id', '')::uuid;
  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'POS_PRODUCT_CREATE_RESULT_INVALID';
  END IF;

  UPDATE public.pos_products
  SET product_code = v_code,
      updated_at = now()
  WHERE id = v_product_id
    AND brand_id = p_brand_id
    AND brand_slug = p_brand_slug;

  RETURN v_result || jsonb_build_object('product_code', v_code);
END;
$_$;


ALTER FUNCTION "public"."pos_create_product_v2"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_category_id" "uuid", "p_name" "text", "p_description" "text", "p_product_type" "text", "p_inventory_mode" "text", "p_default_unit_code" "text", "p_has_variants" boolean, "p_sellable" boolean, "p_purchasable" boolean, "p_tax_rate" numeric, "p_image_url" "text", "p_configuration" "jsonb", "p_variants" "jsonb", "p_user_id" "uuid", "p_product_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_create_self_service_business_v1"("p_brand_name" "text", "p_profile_code" "text", "p_user_id" "uuid", "p_idempotency_key" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_brand public.brands%ROWTYPE;
  v_location public.pos_locations%ROWTYPE;
  v_register public.pos_registers%ROWTYPE;
  v_subscription public.pos_subscriptions%ROWTYPE;
  v_brand_name text := btrim(COALESCE(p_brand_name, ''));
  v_profile_code text := lower(btrim(COALESCE(p_profile_code, '')));
  v_base_slug text;
  v_candidate_slug text;
  v_suffix integer := 1;
  v_fingerprint text;
  v_capabilities jsonb;
  v_replay boolean := false;
BEGIN
  IF v_brand_name = '' OR char_length(v_brand_name) > 120 THEN
    RAISE EXCEPTION 'POS_SELF_SERVICE_BRAND_NAME_INVALID';
  END IF;

  IF v_profile_code NOT IN ('fashion', 'retail') THEN
    RAISE EXCEPTION 'POS_SELF_SERVICE_PROFILE_INVALID';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'POS_SELF_SERVICE_USER_REQUIRED';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'POS_SELF_SERVICE_IDEMPOTENCY_KEY_REQUIRED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.pos_profile_catalog profile
    WHERE profile.code = v_profile_code
      AND profile.launch_status = 'live'
  ) THEN
    RAISE EXCEPTION 'POS_SELF_SERVICE_PROFILE_NOT_AVAILABLE';
  END IF;

  v_fingerprint := md5(jsonb_build_object(
    'brandName', v_brand_name,
    'profileCode', v_profile_code
  )::text);

  -- Same creator/key operations serialize before checking or claiming a row.
  PERFORM pg_advisory_xact_lock(
    hashtext('pos_create_self_service_business_v1'),
    hashtext(p_user_id::text || ':' || p_idempotency_key::text)
  );

  SELECT *
  INTO v_brand
  FROM public.brands brand
  WHERE brand.created_by = p_user_id
    AND brand.creation_idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_brand.creation_payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'POS_SELF_SERVICE_IDEMPOTENCY_CONFLICT';
    END IF;

    v_replay := true;
  ELSE
    v_base_slug := lower(v_brand_name);
    v_base_slug := translate(
      v_base_slug,
      'áéíóúüñàèìòùäëïöüâêîôûç',
      'aeiouunaeiouaeiouaeiouc'
    );
    v_base_slug := regexp_replace(v_base_slug, '[^a-z0-9]+', '-', 'g');
    v_base_slug := regexp_replace(v_base_slug, '(^-+|-+$)', '', 'g');

    IF v_base_slug = '' THEN
      RAISE EXCEPTION 'POS_SELF_SERVICE_BRAND_NAME_INVALID';
    END IF;

    LOOP
      v_candidate_slug := CASE
        WHEN v_suffix = 1 THEN v_base_slug
        ELSE v_base_slug || '-' || v_suffix::text
      END;

      BEGIN
        INSERT INTO public.brands (
          slug,
          name,
          status,
          created_by,
          creation_idempotency_key,
          creation_payload_fingerprint
        ) VALUES (
          v_candidate_slug,
          v_brand_name,
          'active',
          p_user_id,
          p_idempotency_key,
          v_fingerprint
        )
        RETURNING * INTO v_brand;

        EXIT;
      EXCEPTION WHEN unique_violation THEN
        -- A concurrent claim of the same operation is serialized above. Any
        -- remaining collision is a taken slug, so try the next suffix.
        v_suffix := v_suffix + 1;
        IF v_suffix > 10000 THEN
          RAISE EXCEPTION 'POS_SELF_SERVICE_SLUG_EXHAUSTED';
        END IF;
      END;
    END LOOP;

    INSERT INTO public.user_brand_access (
      user_id,
      brand_slug,
      access_role,
      status,
      updated_at
    ) VALUES (
      p_user_id,
      v_brand.slug,
      'owner',
      'active',
      now()
    );

    PERFORM public.pos_initialize_brand_setup(
      v_brand.id::text,
      v_brand.slug,
      v_brand.name,
      p_user_id
    );

    SELECT COALESCE(jsonb_object_agg(defaults.capability_code, defaults.enabled), '{}'::jsonb)
    INTO v_capabilities
    FROM public.pos_profile_capability_defaults defaults
    WHERE defaults.profile_code = v_profile_code;

    PERFORM public.pos_configure_business_profile(
      p_brand_id => v_brand.id::text,
      p_brand_slug => v_brand.slug,
      p_profile_code => v_profile_code,
      p_operation_mode => 'single',
      p_capabilities => v_capabilities,
      p_user_id => p_user_id
    );

    INSERT INTO public.pos_locations (
      brand_id,
      brand_slug,
      name,
      code,
      country,
      timezone,
      currency,
      tax_name,
      tax_rate,
      prices_include_tax,
      active,
      created_by
    ) VALUES (
      v_brand.id::text,
      v_brand.slug,
      'Principal',
      'P',
      'MX',
      'America/Mexico_City',
      'MXN',
      'IVA',
      0,
      true,
      true,
      p_user_id
    )
    RETURNING * INTO v_location;

    INSERT INTO public.pos_registers (
      brand_id,
      brand_slug,
      location_id,
      name,
      code,
      status,
      created_by
    ) VALUES (
      v_brand.id::text,
      v_brand.slug,
      v_location.id,
      'Caja 1',
      'CAJA1',
      'available',
      p_user_id
    )
    RETURNING * INTO v_register;

    UPDATE public.pos_business_profiles
    SET onboarding_status = 'completed',
        onboarding_step = 4,
        onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
        updated_at = now()
    WHERE brand_slug = v_brand.slug;
  END IF;

  SELECT *
  INTO v_subscription
  FROM public.pos_subscriptions subscription
  WHERE subscription.brand_slug = v_brand.slug;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_SELF_SERVICE_SETUP_INCOMPLETE';
  END IF;

  SELECT *
  INTO v_location
  FROM public.pos_locations location
  WHERE location.brand_slug = v_brand.slug
  ORDER BY location.created_at, location.id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_SELF_SERVICE_LOCATION_INCOMPLETE';
  END IF;

  SELECT *
  INTO v_register
  FROM public.pos_registers register
  WHERE register.brand_slug = v_brand.slug
    AND register.location_id = v_location.id
  ORDER BY register.created_at, register.id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_SELF_SERVICE_REGISTER_INCOMPLETE';
  END IF;

  RETURN jsonb_build_object(
    'brand', jsonb_build_object(
      'id', v_brand.id,
      'slug', v_brand.slug,
      'name', v_brand.name
    ),
    'profileCode', v_profile_code,
    'trial', jsonb_build_object(
      'status', v_subscription.status,
      'endsAt', v_subscription.trial_ends_at,
      'planCode', v_subscription.plan_code
    ),
    'location', to_jsonb(v_location),
    'register', to_jsonb(v_register),
    'idempotentReplay', v_replay
  );
END
$_$;


ALTER FUNCTION "public"."pos_create_self_service_business_v1"("p_brand_name" "text", "p_profile_code" "text", "p_user_id" "uuid", "p_idempotency_key" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_user_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_slug" "text" NOT NULL,
    "email" "text" NOT NULL,
    "access_role" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "pos_user_invitations_email_normalized_ck" CHECK ((("email" = "lower"("btrim"("email"))) AND ("email" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'::"text"))),
    CONSTRAINT "pos_user_invitations_expiry_ck" CHECK (("expires_at" > "created_at")),
    CONSTRAINT "pos_user_invitations_metadata_ck" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "pos_user_invitations_role_ck" CHECK (("access_role" = ANY (ARRAY['admin'::"text", 'manager'::"text", 'cashier'::"text", 'inventory'::"text"]))),
    CONSTRAINT "pos_user_invitations_state_dates_ck" CHECK (((("status" = 'pending'::"text") AND ("accepted_at" IS NULL) AND ("revoked_at" IS NULL)) OR (("status" = 'accepted'::"text") AND ("accepted_at" IS NOT NULL) AND ("revoked_at" IS NULL)) OR (("status" = 'revoked'::"text") AND ("accepted_at" IS NULL) AND ("revoked_at" IS NOT NULL)) OR (("status" = 'expired'::"text") AND ("accepted_at" IS NULL) AND ("revoked_at" IS NULL)))),
    CONSTRAINT "pos_user_invitations_status_ck" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'revoked'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."pos_user_invitations" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_decline_user_invitation_v1"("p_invitation_id" "uuid", "p_user_id" "uuid", "p_email" "text") RETURNS "public"."pos_user_invitations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."pos_decline_user_invitation_v1"("p_invitation_id" "uuid", "p_user_id" "uuid", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_emit_intelligence_signal"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_signal_type" "text", "p_category" "text", "p_severity" "text", "p_entity_type" "text", "p_entity_id" "text", "p_entity_name" "text", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_comparison_start" timestamp with time zone, "p_comparison_end" timestamp with time zone, "p_title" "text", "p_metric_key" "text", "p_current" numeric, "p_previous" numeric, "p_delta" numeric, "p_delta_percent" numeric, "p_evidence" "jsonb", "p_context" "jsonb", "p_rule_version" "text", "p_dedupe_key" "text") RETURNS TABLE("signal_id" "uuid", "was_created" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_brand_slug||':'||COALESCE(p_location_id::text,'all')||':'||p_dedupe_key,0));
 UPDATE public.pos_intelligence_signals SET last_seen_at=now(),period_start=p_period_start,period_end=p_period_end,
  comparison_start=p_comparison_start,comparison_end=p_comparison_end,title=p_title,severity=p_severity,current_value=p_current,
  previous_value=p_previous,delta_value=p_delta,delta_percent=p_delta_percent,evidence=p_evidence,context=p_context
 WHERE brand_slug=p_brand_slug AND COALESCE(location_id,'00000000-0000-0000-0000-000000000000'::uuid)=COALESCE(p_location_id,'00000000-0000-0000-0000-000000000000'::uuid)
  AND dedupe_key=p_dedupe_key AND status IN('open','acknowledged') RETURNING id,false INTO signal_id,was_created;
 IF FOUND THEN RETURN NEXT; RETURN; END IF;
 INSERT INTO public.pos_intelligence_signals(brand_id,brand_slug,location_id,signal_type,signal_category,severity,entity_type,entity_id,entity_name,period_start,period_end,comparison_start,comparison_end,title,metric_key,current_value,previous_value,delta_value,delta_percent,evidence,context,rule_version,dedupe_key)
 VALUES(p_brand_id,p_brand_slug,p_location_id,p_signal_type,p_category,p_severity,p_entity_type,p_entity_id,p_entity_name,p_period_start,p_period_end,p_comparison_start,p_comparison_end,p_title,p_metric_key,p_current,p_previous,p_delta,p_delta_percent,COALESCE(p_evidence,'{}'),COALESCE(p_context,'{}'),p_rule_version,p_dedupe_key)
 RETURNING id,true INTO signal_id,was_created; RETURN NEXT;
END $$;


ALTER FUNCTION "public"."pos_emit_intelligence_signal"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_signal_type" "text", "p_category" "text", "p_severity" "text", "p_entity_type" "text", "p_entity_id" "text", "p_entity_name" "text", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_comparison_start" timestamp with time zone, "p_comparison_end" timestamp with time zone, "p_title" "text", "p_metric_key" "text", "p_current" numeric, "p_previous" numeric, "p_delta" numeric, "p_delta_percent" numeric, "p_evidence" "jsonb", "p_context" "jsonb", "p_rule_version" "text", "p_dedupe_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_entitlements_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN NEW.updated_at:=now();RETURN NEW;END $$;


ALTER FUNCTION "public"."pos_entitlements_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_generate_intelligence_signals"("p_brand_slug" "text", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_location_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE b text; duration interval; cmp_start timestamptz; run_started timestamptz:=now(); s jsonb; cfg jsonb; r record; emit record; made int:=0; touched int:=0;
BEGIN
 SELECT brand_id INTO b FROM public.pos_analytics_assert_scope(p_brand_slug,p_period_start,p_period_end,p_location_id);
 duration:=p_period_end-p_period_start; cmp_start:=p_period_start-duration;
 CREATE TEMP TABLE IF NOT EXISTS pg_temp.signal_run_keys(dedupe_key text PRIMARY KEY) ON COMMIT DROP; TRUNCATE pg_temp.signal_run_keys;

 -- Central defaults: minimum comparable orders 5; sales ±20%; ticket ±15%.
 s:=public.pos_get_analytics_summary(p_brand_slug,p_period_start,p_period_end,p_location_id);
 cfg:=public.pos_signal_rule_config(p_brand_slug,'sales_change',jsonb_build_object('minPreviousOrders',5,'dropPercent',-20,'growthPercent',20));
 IF cfg IS NOT NULL AND (s#>>'{sales,ordersCount,previous}')::numeric >= (cfg->>'minPreviousOrders')::numeric THEN
  IF (s#>>'{sales,netSales,deltaPercent}')::numeric <= (cfg->>'dropPercent')::numeric THEN
   SELECT * INTO emit FROM public.pos_emit_intelligence_signal(b,p_brand_slug,p_location_id,'sales_drop','risk','high',NULL,NULL,NULL,p_period_start,p_period_end,cmp_start,p_period_start,'Ventas '||abs(round((s#>>'{sales,netSales,deltaPercent}')::numeric,0))||'% abajo','net_sales',(s#>>'{sales,netSales,current}')::numeric,(s#>>'{sales,netSales,previous}')::numeric,(s#>>'{sales,netSales,delta}')::numeric,(s#>>'{sales,netSales,deltaPercent}')::numeric,s#>'{sales,netSales}',jsonb_build_object('ordersCurrent',s#>>'{sales,ordersCount,current}','ordersPrevious',s#>>'{sales,ordersCount,previous}'),'sales_drop_v1','sales_drop:'||p_period_start::date||':'||p_period_end::date); made:=made+emit.was_created::int;touched:=touched+1;INSERT INTO pg_temp.signal_run_keys VALUES('sales_drop:'||p_period_start::date||':'||p_period_end::date);
  ELSIF (s#>>'{sales,netSales,deltaPercent}')::numeric >= (cfg->>'growthPercent')::numeric THEN
   SELECT * INTO emit FROM public.pos_emit_intelligence_signal(b,p_brand_slug,p_location_id,'sales_growth','trend','medium',NULL,NULL,NULL,p_period_start,p_period_end,cmp_start,p_period_start,'Ventas +'||round((s#>>'{sales,netSales,deltaPercent}')::numeric,0)||'%','net_sales',(s#>>'{sales,netSales,current}')::numeric,(s#>>'{sales,netSales,previous}')::numeric,(s#>>'{sales,netSales,delta}')::numeric,(s#>>'{sales,netSales,deltaPercent}')::numeric,s#>'{sales,netSales}','{}','sales_growth_v1','sales_growth:'||p_period_start::date||':'||p_period_end::date); made:=made+emit.was_created::int;touched:=touched+1;INSERT INTO pg_temp.signal_run_keys VALUES('sales_growth:'||p_period_start::date||':'||p_period_end::date);
  END IF;
 END IF;
 cfg:=public.pos_signal_rule_config(p_brand_slug,'average_ticket_change',jsonb_build_object('minPreviousOrders',5,'dropPercent',-15,'growthPercent',15));
 IF cfg IS NOT NULL AND (s#>>'{sales,ordersCount,previous}')::numeric >= (cfg->>'minPreviousOrders')::numeric AND (s#>>'{sales,averageTicket,deltaPercent}') IS NOT NULL THEN
  IF (s#>>'{sales,averageTicket,deltaPercent}')::numeric <= (cfg->>'dropPercent')::numeric OR (s#>>'{sales,averageTicket,deltaPercent}')::numeric >= (cfg->>'growthPercent')::numeric THEN
   SELECT * INTO emit FROM public.pos_emit_intelligence_signal(b,p_brand_slug,p_location_id,CASE WHEN (s#>>'{sales,averageTicket,deltaPercent}')::numeric<0 THEN 'average_ticket_drop' ELSE 'average_ticket_growth' END,CASE WHEN (s#>>'{sales,averageTicket,deltaPercent}')::numeric<0 THEN 'risk' ELSE 'opportunity' END,'medium',NULL,NULL,NULL,p_period_start,p_period_end,cmp_start,p_period_start,'Ticket promedio '||CASE WHEN (s#>>'{sales,averageTicket,deltaPercent}')::numeric>=0 THEN '+' ELSE '' END||round((s#>>'{sales,averageTicket,deltaPercent}')::numeric,0)||'%','average_ticket',(s#>>'{sales,averageTicket,current}')::numeric,(s#>>'{sales,averageTicket,previous}')::numeric,(s#>>'{sales,averageTicket,delta}')::numeric,(s#>>'{sales,averageTicket,deltaPercent}')::numeric,s#>'{sales,averageTicket}','{}',CASE WHEN (s#>>'{sales,averageTicket,deltaPercent}')::numeric<0 THEN 'average_ticket_drop_v1' ELSE 'average_ticket_growth_v1' END,'average_ticket:'||p_period_start::date||':'||p_period_end::date);made:=made+emit.was_created::int;touched:=touched+1;INSERT INTO pg_temp.signal_run_keys VALUES('average_ticket:'||p_period_start::date||':'||p_period_end::date);
  END IF;
 END IF;

 -- Product growth/decline, capped to five entities per direction.
 FOR r IN WITH cur AS(SELECT i.variant_id,max(i.product_name) product_name,max(i.variant_name) variant_name,sum(i.quantity) units,sum(i.line_total) sales FROM public.pos_sales s JOIN public.pos_sale_items i ON i.sale_id=s.id WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.sold_at>=p_period_start AND s.sold_at<p_period_end AND(p_location_id IS NULL OR s.location_id=p_location_id)GROUP BY i.variant_id),prev AS(SELECT i.variant_id,sum(i.quantity)units FROM public.pos_sales s JOIN public.pos_sale_items i ON i.sale_id=s.id WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.sold_at>=cmp_start AND s.sold_at<p_period_start AND(p_location_id IS NULL OR s.location_id=p_location_id)GROUP BY i.variant_id), ranked AS(SELECT c.*,p.units previous_units,round((c.units-p.units)*100/NULLIF(p.units,0),2) growth FROM cur c JOIN prev p USING(variant_id)WHERE p.units>0 AND c.units>0), capped AS(SELECT ranked.*,row_number()OVER(PARTITION BY growth>0 ORDER BY abs(growth)DESC,variant_id)rn FROM ranked)SELECT * FROM capped WHERE rn<=5 ORDER BY abs(growth)DESC LOOP
  cfg:=public.pos_signal_rule_config(p_brand_slug,CASE WHEN r.growth>0 THEN 'product_growth' ELSE 'product_decline' END,jsonb_build_object('growthPercent',30,'minUnits',3));
  CONTINUE WHEN cfg IS NULL OR r.previous_units<(cfg->>'minUnits')::numeric OR r.units<(cfg->>'minUnits')::numeric OR abs(r.growth)<(cfg->>'growthPercent')::numeric;
  SELECT * INTO emit FROM public.pos_emit_intelligence_signal(b,p_brand_slug,p_location_id,CASE WHEN r.growth>0 THEN 'product_growth' ELSE 'product_decline' END,'product','medium','variant',r.variant_id::text,r.product_name||' · '||r.variant_name,p_period_start,p_period_end,cmp_start,p_period_start,CASE WHEN r.growth>0 THEN 'Producto creciendo: ' ELSE 'Producto en descenso: ' END||r.product_name,'units_sold',r.units,r.previous_units,r.units-r.previous_units,r.growth,jsonb_build_object('variantId',r.variant_id,'currentUnits',r.units,'previousUnits',r.previous_units,'salesTotal',r.sales),jsonb_build_object('variantId',r.variant_id),CASE WHEN r.growth>0 THEN 'product_growth_v1' ELSE 'product_decline_v1' END,(CASE WHEN r.growth>0 THEN 'product_growth:' ELSE 'product_decline:' END)||r.variant_id||':'||p_period_start::date);made:=made+emit.was_created::int;touched:=touched+1;INSERT INTO pg_temp.signal_run_keys VALUES((CASE WHEN r.growth>0 THEN 'product_growth:' ELSE 'product_decline:' END)||r.variant_id||':'||p_period_start::date)ON CONFLICT DO NOTHING;
 END LOOP;

 -- Inventory state rules: ten most material rows. State keys intentionally exclude period.
 FOR r IN SELECT i.location_id,p.id product_id,p.name product_name,v.id variant_id,v.name variant_name,i.quantity-i.reserved_quantity available,i.minimum_quantity,v.cost,(i.quantity-i.reserved_quantity)*v.cost stock_value,
  COALESCE((SELECT sum(si.quantity) FROM public.pos_sales ss JOIN public.pos_sale_items si ON si.sale_id=ss.id WHERE ss.brand_slug=p_brand_slug AND ss.status='completed' AND ss.location_id=i.location_id AND si.variant_id=v.id AND ss.sold_at>=p_period_start AND ss.sold_at<p_period_end),0) units,
  CASE WHEN EXTRACT(epoch FROM duration)>0 THEN COALESCE((SELECT sum(si.quantity) FROM public.pos_sales ss JOIN public.pos_sale_items si ON si.sale_id=ss.id WHERE ss.brand_slug=p_brand_slug AND ss.status='completed' AND ss.location_id=i.location_id AND si.variant_id=v.id AND ss.sold_at>=p_period_start AND ss.sold_at<p_period_end),0)/(EXTRACT(epoch FROM duration)/86400) END velocity
 FROM public.pos_inventory i JOIN public.pos_product_variants v ON v.id=i.variant_id AND v.active JOIN public.pos_products p ON p.id=v.product_id AND p.active AND p.track_inventory WHERE i.brand_slug=p_brand_slug AND(p_location_id IS NULL OR i.location_id=p_location_id) ORDER BY stock_value DESC LIMIT 200 LOOP
  IF r.available<=0 THEN PERFORM public.pos_emit_intelligence_signal(b,p_brand_slug,r.location_id,'inventory_out_of_stock','inventory','high','variant',r.variant_id::text,r.product_name||' · '||r.variant_name,p_period_start,p_period_end,NULL,NULL,'Sin stock: '||r.product_name,'available_quantity',r.available,NULL,NULL,NULL,jsonb_build_object('availableQuantity',r.available,'minimumQuantity',r.minimum_quantity,'locationId',r.location_id),jsonb_build_object('variantId',r.variant_id,'locationId',r.location_id),'inventory_out_of_stock_v1','inventory_out_of_stock:'||r.location_id||':'||r.variant_id);touched:=touched+1;INSERT INTO pg_temp.signal_run_keys VALUES('inventory_out_of_stock:'||r.location_id||':'||r.variant_id)ON CONFLICT DO NOTHING;
  ELSIF r.minimum_quantity>0 AND r.available<=r.minimum_quantity THEN PERFORM public.pos_emit_intelligence_signal(b,p_brand_slug,r.location_id,'inventory_below_minimum','inventory','medium','variant',r.variant_id::text,r.product_name||' · '||r.variant_name,p_period_start,p_period_end,NULL,NULL,'Stock bajo: '||r.product_name,'available_quantity',r.available,r.minimum_quantity,r.available-r.minimum_quantity,NULL,jsonb_build_object('availableQuantity',r.available,'minimumQuantity',r.minimum_quantity,'locationId',r.location_id),jsonb_build_object('variantId',r.variant_id,'locationId',r.location_id),'inventory_below_minimum_v1','inventory_below_minimum:'||r.location_id||':'||r.variant_id);touched:=touched+1;INSERT INTO pg_temp.signal_run_keys VALUES('inventory_below_minimum:'||r.location_id||':'||r.variant_id)ON CONFLICT DO NOTHING; END IF;
  IF r.velocity>0 AND r.available/r.velocity<=7 THEN PERFORM public.pos_emit_intelligence_signal(b,p_brand_slug,r.location_id,'inventory_low_days','inventory',CASE WHEN r.available/r.velocity<=2 THEN 'high' ELSE 'medium' END,'variant',r.variant_id::text,r.product_name||' · '||r.variant_name,p_period_start,p_period_end,NULL,NULL,'Cobertura baja: '||r.product_name,'days_of_stock',round(r.available/r.velocity,2),NULL,NULL,NULL,jsonb_build_object('daysOfStockEstimate',round(r.available/r.velocity,2),'availableQuantity',r.available,'unitsSoldPeriod',r.units,'locationId',r.location_id),jsonb_build_object('variantId',r.variant_id,'locationId',r.location_id),'inventory_low_days_v1','inventory_low_days:'||r.location_id||':'||r.variant_id);touched:=touched+1;INSERT INTO pg_temp.signal_run_keys VALUES('inventory_low_days:'||r.location_id||':'||r.variant_id)ON CONFLICT DO NOTHING; END IF;
  IF r.available>0 AND r.units=0 AND r.stock_value>0 THEN PERFORM public.pos_emit_intelligence_signal(b,p_brand_slug,r.location_id,'inventory_stagnant','inventory','low','variant',r.variant_id::text,r.product_name||' · '||r.variant_name,p_period_start,p_period_end,NULL,NULL,'Stock sin ventas: '||r.product_name,'units_sold',0,NULL,NULL,NULL,jsonb_build_object('availableQuantity',r.available,'inventoryValue',r.stock_value,'unitsSoldPeriod',0,'locationId',r.location_id),jsonb_build_object('variantId',r.variant_id,'locationId',r.location_id),'inventory_stagnant_v1','inventory_stagnant:'||r.location_id||':'||r.variant_id);touched:=touched+1;INSERT INTO pg_temp.signal_run_keys VALUES('inventory_stagnant:'||r.location_id||':'||r.variant_id)ON CONFLICT DO NOTHING; END IF;
 END LOOP;

 -- Aggregated customer frequency opportunities; requires identified history.
 FOR r IN WITH hist AS(SELECT s.customer_id,s.sold_at,s.total,lag(s.sold_at)OVER(PARTITION BY s.customer_id ORDER BY s.sold_at,s.id)prev FROM public.pos_sales s WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.customer_id IS NOT NULL AND(p_location_id IS NULL OR s.location_id=p_location_id)),facts AS(SELECT customer_id,count(*)orders,sum(total)spend,max(sold_at)last_at,avg(EXTRACT(epoch FROM(sold_at-prev))/86400)FILTER(WHERE prev IS NOT NULL)avg_days FROM hist GROUP BY customer_id), picked AS(SELECT * FROM facts WHERE orders>=2 AND avg_days IS NOT NULL), agg AS(SELECT 'customer_reactivation' kind,count(*)n,jsonb_agg(customer_id ORDER BY spend DESC)FILTER(WHERE EXTRACT(epoch FROM(now()-last_at))/86400 BETWEEN avg_days*.9 AND avg_days*1.5) ids,sum(spend)FILTER(WHERE EXTRACT(epoch FROM(now()-last_at))/86400 BETWEEN avg_days*.9 AND avg_days*1.5) spend FROM picked WHERE EXTRACT(epoch FROM(now()-last_at))/86400 BETWEEN avg_days*.9 AND avg_days*1.5 UNION ALL SELECT 'customer_at_risk',count(*),jsonb_agg(customer_id ORDER BY spend DESC),sum(spend)FROM picked WHERE orders>=3 AND EXTRACT(epoch FROM(now()-last_at))/86400>avg_days*1.5)SELECT * FROM agg WHERE n>0 LOOP
  SELECT * INTO emit FROM public.pos_emit_intelligence_signal(b,p_brand_slug,p_location_id,r.kind,'customer',CASE WHEN r.kind='customer_at_risk' THEN 'high' ELSE 'medium' END,'customer_group',NULL,NULL,p_period_start,p_period_end,NULL,NULL,CASE WHEN r.kind='customer_at_risk' THEN r.n||' clientes fuera de su frecuencia habitual' ELSE r.n||' clientes en ventana de recompra' END,'affected_customers',r.n,NULL,NULL,NULL,jsonb_build_object('affectedCustomers',r.n,'historicalSpend',r.spend),jsonb_build_object('customerIds',(SELECT jsonb_agg(value)FROM(SELECT value FROM jsonb_array_elements(r.ids)LIMIT 10)x)),r.kind||'_v1',r.kind||':'||p_period_end::date);made:=made+emit.was_created::int;touched:=touched+1;INSERT INTO pg_temp.signal_run_keys VALUES(r.kind||':'||p_period_end::date);
 END LOOP;

 -- Data quality and loyalty aggregates.
 IF (s#>>'{sales,completedSalesCount}')::int>=10 AND COALESCE((s#>>'{customers,customerIdentificationRate}')::numeric,0)<50 THEN PERFORM public.pos_emit_intelligence_signal(b,p_brand_slug,p_location_id,'customer_identification_low','risk','medium',NULL,NULL,NULL,p_period_start,p_period_end,NULL,NULL,'Menos de la mitad de las ventas están identificadas','customer_identification_rate',(s#>>'{customers,customerIdentificationRate}')::numeric,NULL,NULL,NULL,jsonb_build_object('completedSales',(s#>>'{sales,completedSalesCount}')::int,'identifiedSales',(s#>>'{customers,identifiedSales}')::int),'{}','customer_identification_low_v1','customer_identification_low:'||p_period_end::date);touched:=touched+1;INSERT INTO pg_temp.signal_run_keys VALUES('customer_identification_low:'||p_period_end::date); END IF;
 IF p_location_id IS NULL THEN
  FOR r IN SELECT vp.id,vp.name,vp.required_visits,count(*) affected,jsonb_agg(m.customer_id ORDER BY m.customer_id) customer_ids FROM public.pos_loyalty_visit_programs vp JOIN public.pos_loyalty_members m ON m.program_id=vp.loyalty_program_id AND m.status='active' LEFT JOIN LATERAL(SELECT COALESCE(sum(CASE e.event_type WHEN 'qualify'THEN 1 ELSE -1 END),0)::int n FROM public.pos_loyalty_visit_events e WHERE e.visit_program_id=vp.id AND e.member_id=m.id)x ON true WHERE vp.brand_slug=p_brand_slug AND vp.active AND mod(x.n,vp.required_visits)=vp.required_visits-1 GROUP BY vp.id,vp.name,vp.required_visits ORDER BY count(*) DESC,vp.id LIMIT 5 LOOP PERFORM public.pos_emit_intelligence_signal(b,p_brand_slug,NULL,'loyalty_near_visit_reward','loyalty','medium','visit_program',r.id::text,r.name,p_period_start,p_period_end,NULL,NULL,r.affected||' clientes a una visita de la recompensa','affected_customers',r.affected,NULL,NULL,NULL,jsonb_build_object('requiredVisits',r.required_visits,'affectedCustomers',r.affected),jsonb_build_object('visitProgramId',r.id,'customerIds',(SELECT jsonb_agg(value)FROM(SELECT value FROM jsonb_array_elements(r.customer_ids)LIMIT 10)x)),'loyalty_near_visit_reward_v1','loyalty_near_visit_reward:'||r.id);INSERT INTO pg_temp.signal_run_keys VALUES('loyalty_near_visit_reward:'||r.id);END LOOP;
  FOR r IN SELECT u.visit_program_id,vp.name,u.reward_id,u.reward_name,count(*)affected,jsonb_agg(DISTINCT m.customer_id)customer_ids FROM public.pos_loyalty_reward_unlocks u JOIN public.pos_loyalty_visit_programs vp ON vp.id=u.visit_program_id JOIN public.pos_loyalty_members m ON m.id=u.member_id WHERE u.brand_slug=p_brand_slug AND u.status='available' GROUP BY u.visit_program_id,vp.name,u.reward_id,u.reward_name ORDER BY count(*) DESC,u.visit_program_id LIMIT 5 LOOP PERFORM public.pos_emit_intelligence_signal(b,p_brand_slug,NULL,'loyalty_unlock_available','loyalty','info','visit_program',r.visit_program_id::text,r.name,p_period_start,p_period_end,NULL,NULL,r.affected||' recompensas disponibles: '||r.reward_name,'available_unlocks',r.affected,NULL,NULL,NULL,jsonb_build_object('availableUnlocks',r.affected,'rewardName',r.reward_name),jsonb_build_object('visitProgramId',r.visit_program_id,'rewardId',r.reward_id,'customerIds',(SELECT jsonb_agg(value)FROM(SELECT value FROM jsonb_array_elements(r.customer_ids)LIMIT 10)x)),'loyalty_unlock_available_v1','loyalty_unlock_available:'||r.visit_program_id||':'||r.reward_id);INSERT INTO pg_temp.signal_run_keys VALUES('loyalty_unlock_available:'||r.visit_program_id||':'||r.reward_id);END LOOP;
 END IF;

 -- Payment concentration, strongest sales window and cross-sell (informational/opportunity).
 FOR r IN SELECT p.payment_method,sum(p.amount)amount,sum(p.amount)*100/NULLIF(sum(sum(p.amount))OVER(),0)share,count(*)transactions FROM public.pos_payments p JOIN public.pos_sales ss ON ss.id=p.sale_id WHERE ss.brand_slug=p_brand_slug AND ss.status='completed' AND ss.sold_at>=p_period_start AND ss.sold_at<p_period_end AND(p_location_id IS NULL OR ss.location_id=p_location_id)GROUP BY p.payment_method ORDER BY share DESC LIMIT 1 LOOP IF r.share>=80 AND r.transactions>=5 THEN PERFORM public.pos_emit_intelligence_signal(b,p_brand_slug,p_location_id,'payment_method_concentration','trend','info','payment_method',r.payment_method,r.payment_method,p_period_start,p_period_end,NULL,NULL,round(r.share,0)||'% de pagos por '||r.payment_method,'payment_share',r.share,NULL,NULL,NULL,jsonb_build_object('paymentMethod',r.payment_method,'amount',r.amount,'transactions',r.transactions),'{}','payment_method_concentration_v1','payment_method_concentration:'||r.payment_method||':'||p_period_end::date);touched:=touched+1;INSERT INTO pg_temp.signal_run_keys VALUES('payment_method_concentration:'||r.payment_method||':'||p_period_end::date);END IF;END LOOP;
 FOR r IN WITH h AS(SELECT EXTRACT(ISODOW FROM(ss.sold_at AT TIME ZONE l.timezone))::int AS dow,EXTRACT(HOUR FROM(ss.sold_at AT TIME ZONE l.timezone))::int AS hour_of_day,sum(ss.total)sales,count(*)orders FROM public.pos_sales ss JOIN public.pos_locations l ON l.id=ss.location_id WHERE ss.brand_slug=p_brand_slug AND ss.status='completed' AND ss.sold_at>=p_period_start AND ss.sold_at<p_period_end AND(p_location_id IS NULL OR ss.location_id=p_location_id)GROUP BY 1,2),a AS(SELECT avg(sales)avg_sales FROM h)SELECT h.* FROM h,a WHERE h.orders>=3 AND h.sales>=a.avg_sales*1.5 ORDER BY h.sales DESC LIMIT 3 LOOP PERFORM public.pos_emit_intelligence_signal(b,p_brand_slug,p_location_id,'strong_sales_window','trend','info','time_window',r.dow||':'||r.hour_of_day,'Día '||r.dow||' · '||r.hour_of_day||':00',p_period_start,p_period_end,NULL,NULL,'Franja fuerte: día '||r.dow||' a las '||r.hour_of_day||':00','net_sales',r.sales,NULL,NULL,NULL,jsonb_build_object('dayOfWeek',r.dow,'hourOfDay',r.hour_of_day,'sales',r.sales,'orders',r.orders),jsonb_build_object('dayOfWeek',r.dow,'hourOfDay',r.hour_of_day),'strong_sales_window_v1','strong_sales_window:'||r.dow||':'||r.hour_of_day||':'||p_period_end::date);touched:=touched+1;INSERT INTO pg_temp.signal_run_keys VALUES('strong_sales_window:'||r.dow||':'||r.hour_of_day||':'||p_period_end::date);END LOOP;
 FOR r IN SELECT value p FROM jsonb_array_elements(public.pos_get_analytics_product_pairs(p_brand_slug,p_period_start,p_period_end,p_location_id,10)) WHERE(value->>'ordersTogether')::int>=5 LOOP PERFORM public.pos_emit_intelligence_signal(b,p_brand_slug,p_location_id,'product_pair_opportunity','opportunity','low','product_pair',(r.p#>>'{productA,id}')||':'||(r.p#>>'{productB,id}'),(r.p#>>'{productA,name}')||' + '||(r.p#>>'{productB,name}'),p_period_start,p_period_end,NULL,NULL,'Productos comprados juntos: '||(r.p#>>'{productA,name}')||' + '||(r.p#>>'{productB,name}'),'orders_together',(r.p->>'ordersTogether')::numeric,NULL,NULL,NULL,r.p,'{}','product_pair_opportunity_v1','product_pair:'||(r.p#>>'{productA,id}')||':'||(r.p#>>'{productB,id}')||':'||p_period_end::date);touched:=touched+1;INSERT INTO pg_temp.signal_run_keys VALUES('product_pair:'||(r.p#>>'{productA,id}')||':'||(r.p#>>'{productB,id}')||':'||p_period_end::date);END LOOP;

 -- Objective state signals disappear when no longer observed. Event/period signals remain historical.
 UPDATE public.pos_intelligence_signals x SET status='resolved',resolved_at=now()
 WHERE x.brand_slug=p_brand_slug AND(p_location_id IS NULL OR x.location_id=p_location_id)
 AND x.status IN('open','acknowledged') AND x.signal_type IN('inventory_out_of_stock','inventory_below_minimum','inventory_low_days','inventory_stagnant','loyalty_near_visit_reward','loyalty_unlock_available')
 AND NOT EXISTS(SELECT 1 FROM pg_temp.signal_run_keys k WHERE k.dedupe_key=x.dedupe_key);
 RETURN jsonb_build_object('generated',(SELECT count(*) FROM public.pos_intelligence_signals x WHERE x.brand_slug=p_brand_slug AND(p_location_id IS NULL OR x.location_id=p_location_id)AND x.created_at>=run_started AND x.last_seen_at>=run_started),'updated',(SELECT count(*) FROM public.pos_intelligence_signals x WHERE x.brand_slug=p_brand_slug AND(p_location_id IS NULL OR x.location_id=p_location_id)AND x.created_at<run_started AND x.last_seen_at>=run_started),'signals',(SELECT COALESCE(jsonb_agg(to_jsonb(q)ORDER BY q.detected_at DESC),'[]')FROM(SELECT id,signal_type,signal_category,severity,title,current_value,evidence,context,detected_at FROM public.pos_intelligence_signals WHERE brand_slug=p_brand_slug AND status='open' AND last_seen_at>=run_started AND(p_location_id IS NULL OR location_id=p_location_id)ORDER BY CASE severity WHEN 'critical'THEN 5 WHEN'high'THEN 4 WHEN'medium'THEN 3 WHEN'low'THEN 2 ELSE 1 END DESC,detected_at DESC LIMIT 20)q));
END $$;


ALTER FUNCTION "public"."pos_generate_intelligence_signals"("p_brand_slug" "text", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_location_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_get_analytics_customers"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 50) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_result jsonb;
BEGIN
 PERFORM 1 FROM public.pos_analytics_assert_scope(p_brand_slug,p_date_from,p_date_to,p_location_id);
 IF p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'limit debe estar entre 1 y 200.'; END IF;
 WITH history AS (SELECT s.customer_id,s.id,s.total,s.sold_at,lag(s.sold_at) OVER(PARTITION BY s.customer_id ORDER BY s.sold_at,s.id) previous_at
  FROM public.pos_sales s WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.customer_id IS NOT NULL
   AND(p_location_id IS NULL OR s.location_id=p_location_id)), ranked AS (SELECT h.customer_id,count(*) FILTER(WHERE h.sold_at>=p_date_from AND h.sold_at<p_date_to) orders_period,
   COALESCE(sum(h.total) FILTER(WHERE h.sold_at>=p_date_from AND h.sold_at<p_date_to),0) sales_period,
   min(h.sold_at) first_purchase,max(h.sold_at) last_purchase,count(*) lifetime_orders,sum(h.total) lifetime_spend,
   (array_agg(h.previous_at ORDER BY h.sold_at DESC,h.id DESC))[1] previous_purchase,
   avg(extract(epoch FROM(h.sold_at-h.previous_at))/86400) FILTER(WHERE h.previous_at IS NOT NULL) avg_days,
   percentile_cont(.5) WITHIN GROUP(ORDER BY extract(epoch FROM(h.sold_at-h.previous_at))/86400) FILTER(WHERE h.previous_at IS NOT NULL) median_days
  FROM history h GROUP BY h.customer_id)
 SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x."salesTotal" DESC,x."customerName"),'[]') INTO v_result FROM (
  SELECT c.id "customerId",btrim(concat_ws(' ',c.first_name,c.last_name)) "customerName",r.orders_period "ordersCount",r.sales_period "salesTotal",
   CASE WHEN r.orders_period=0 THEN 0 ELSE round(r.sales_period/r.orders_period,2) END "averageTicket",r.last_purchase "lastPurchaseAt",r.first_purchase "firstPurchaseAt",
   floor(extract(epoch FROM(now()-r.last_purchase))/86400) "daysSinceLastPurchase",r.previous_purchase "previousPurchaseAt",
   round(r.avg_days::numeric,2) "averageDaysBetweenPurchases",round(r.median_days::numeric,2) "medianDaysBetweenPurchases",
   r.lifetime_orders "lifetimeOrders",r.lifetime_spend "lifetimeSpend",m.points_balance "loyaltyPointsBalance",m.lifetime_points "lifetimePoints",
   CASE WHEN t.id IS NULL THEN NULL ELSE jsonb_build_object('id',t.id,'name',t.name,'pointsMultiplier',t.points_multiplier) END "currentTier",
   (r.first_purchase>=p_date_from AND r.first_purchase<p_date_to) "isNewInPeriod",(r.first_purchase<p_date_from) "hadPurchaseBeforePeriod"
  FROM ranked r JOIN public.pos_customers c ON c.id=r.customer_id AND c.brand_slug=p_brand_slug
  LEFT JOIN public.pos_loyalty_members m ON m.customer_id=c.id AND m.brand_slug=p_brand_slug
  LEFT JOIN public.pos_loyalty_tiers t ON t.id=m.tier_id WHERE r.orders_period>0 ORDER BY r.sales_period DESC LIMIT p_limit)x;
 RETURN v_result;
END $$;


ALTER FUNCTION "public"."pos_get_analytics_customers"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_get_analytics_data_quality"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_result jsonb;
BEGIN
 PERFORM 1 FROM public.pos_analytics_assert_scope(p_brand_slug,p_date_from,p_date_to,p_location_id);
 WITH sales AS(SELECT * FROM public.pos_sales WHERE brand_slug=p_brand_slug AND status='completed' AND sold_at>=p_date_from AND sold_at<p_date_to AND(p_location_id IS NULL OR location_id=p_location_id)), counts AS(SELECT count(*) total,count(*)FILTER(WHERE customer_id IS NOT NULL)identified,count(*)FILTER(WHERE EXISTS(SELECT 1 FROM public.pos_payments p WHERE p.sale_id=sales.id))with_payment FROM sales)
 SELECT jsonb_build_object('completedSalesCount',c.total,'identifiedSalesCount',c.identified,'customerIdentificationRate',CASE WHEN c.total=0 THEN NULL ELSE round(c.identified*100.0/c.total,2)END,'salesWithPayment',c.with_payment,'salesWithoutPayment',c.total-c.with_payment,
  'productsWithoutCategory',(SELECT count(*) FROM public.pos_products WHERE brand_slug=p_brand_slug AND category_id IS NULL),
  'customersWithoutContact',(SELECT count(*) FROM public.pos_customers WHERE brand_slug=p_brand_slug AND NULLIF(btrim(phone),'')IS NULL AND NULLIF(btrim(email),'')IS NULL),
  'customersWithPhone',(SELECT count(*) FROM public.pos_customers WHERE brand_slug=p_brand_slug AND NULLIF(btrim(phone),'')IS NOT NULL),
  'customersWithEmail',(SELECT count(*) FROM public.pos_customers WHERE brand_slug=p_brand_slug AND NULLIF(btrim(email),'')IS NOT NULL),
  'customersWithMarketingConsent',(SELECT count(*) FROM public.pos_customers WHERE brand_slug=p_brand_slug AND marketing_consent),
  'customersWithWalletConsent',(SELECT count(*) FROM public.pos_customers WHERE brand_slug=p_brand_slug AND wallet_consent),
  'inventoryProductsWithoutStockRows',(SELECT count(*) FROM public.pos_product_variants v JOIN public.pos_products p ON p.id=v.product_id WHERE v.brand_slug=p_brand_slug AND p.track_inventory AND v.active AND NOT EXISTS(SELECT 1 FROM public.pos_inventory i WHERE i.variant_id=v.id AND i.brand_slug=p_brand_slug AND(p_location_id IS NULL OR i.location_id=p_location_id)))) INTO v_result FROM counts c;
 RETURN v_result;
END $$;


ALTER FUNCTION "public"."pos_get_analytics_data_quality"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_get_analytics_inventory"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_result jsonb; v_days numeric;
BEGIN
 PERFORM 1 FROM public.pos_analytics_assert_scope(p_brand_slug,p_date_from,p_date_to,p_location_id);
 v_days:=GREATEST(extract(epoch FROM(p_date_to-p_date_from))/86400,1);
 WITH sold AS (SELECT i.variant_id,sum(i.quantity) units FROM public.pos_sales s JOIN public.pos_sale_items i ON i.sale_id=s.id
  WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.sold_at>=p_date_from AND s.sold_at<p_date_to
   AND(p_location_id IS NULL OR s.location_id=p_location_id) GROUP BY i.variant_id), receipts AS (
  SELECT im.variant_id,max(im.created_at) last_receipt FROM public.pos_inventory_movements im
  WHERE im.brand_slug=p_brand_slug AND im.movement_type='receipt' AND(p_location_id IS NULL OR im.location_id=p_location_id) GROUP BY im.variant_id)
 SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x."productName",x."variantName",x."locationId"),'[]') INTO v_result FROM(
  SELECT p.id "productId",p.name "productName",v.id "variantId",v.name "variantName",i.location_id "locationId",
   i.quantity "currentQuantity",i.reserved_quantity "reservedQuantity",i.quantity-i.reserved_quantity "availableQuantity",i.minimum_quantity "minimumQuantity",
   v.cost "unitCost",round((i.quantity-i.reserved_quantity)*v.cost,2) "inventoryCostValue",r.last_receipt "lastReceiptAt",
   COALESCE(s.units,0) "unitsSoldPeriod",round(COALESCE(s.units,0)/v_days,3) "averageUnitsSoldPerDay",
   CASE WHEN COALESCE(s.units,0)=0 THEN NULL ELSE round((i.quantity-i.reserved_quantity)/(s.units/v_days),2) END "daysOfStockEstimate"
  FROM public.pos_inventory i JOIN public.pos_product_variants v ON v.id=i.variant_id AND v.brand_slug=p_brand_slug
  JOIN public.pos_products p ON p.id=v.product_id AND p.brand_slug=p_brand_slug LEFT JOIN sold s ON s.variant_id=v.id LEFT JOIN receipts r ON r.variant_id=v.id
  WHERE i.brand_slug=p_brand_slug AND(p_location_id IS NULL OR i.location_id=p_location_id))x;
 RETURN v_result;
END $$;


ALTER FUNCTION "public"."pos_get_analytics_inventory"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_get_analytics_loyalty"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_result jsonb;
BEGIN
 PERFORM 1 FROM public.pos_analytics_assert_scope(p_brand_slug,p_date_from,p_date_to,p_location_id);
 WITH members AS (SELECT m.* FROM public.pos_loyalty_members m WHERE m.brand_slug=p_brand_slug), tx AS(
  SELECT t.* FROM public.pos_loyalty_transactions t LEFT JOIN public.pos_sales s ON s.id=t.sale_id
  WHERE t.brand_slug=p_brand_slug AND t.created_at>=p_date_from AND t.created_at<p_date_to AND(p_location_id IS NULL OR s.location_id=p_location_id OR t.sale_id IS NULL)), tiers AS(
  SELECT COALESCE(jsonb_agg(jsonb_build_object('tierId',x.id,'tierName',x.name,'members',x.members,'percentage',CASE WHEN x.total=0 THEN NULL ELSE round(x.members*100.0/x.total,2) END) ORDER BY x.minimum_lifetime_points),'[]') value
  FROM(SELECT t.id,t.name,t.minimum_lifetime_points,count(m.id) members,(SELECT count(*) FROM members) total FROM public.pos_loyalty_tiers t LEFT JOIN members m ON m.tier_id=t.id WHERE t.brand_slug=p_brand_slug GROUP BY t.id,t.name,t.minimum_lifetime_points)x), visits AS(
  SELECT COALESCE(jsonb_agg(jsonb_build_object('visitProgramId',x.id,'name',x.name,'requiredVisits',x.required_visits,'minimumSaleAmount',x.minimum_sale_amount,
   'qualifiesPeriod',x.qualifies,'uniqueMembersProgressing',x.members,'unlocksCreatedPeriod',x.created,'unlocksRedeemedPeriod',x.redeemed,'availableUnlocks',x.available) ORDER BY x.name),'[]') value
  FROM(SELECT vp.id,vp.name,vp.required_visits,vp.minimum_sale_amount,
   count(DISTINCT e.id) FILTER(WHERE e.event_type='qualify' AND e.created_at>=p_date_from AND e.created_at<p_date_to) qualifies,
   count(DISTINCT e.member_id) FILTER(WHERE e.event_type='qualify') members,
   count(DISTINCT u.id) FILTER(WHERE u.created_at>=p_date_from AND u.created_at<p_date_to) created,
   count(DISTINCT u.id) FILTER(WHERE u.redeemed_at>=p_date_from AND u.redeemed_at<p_date_to) redeemed,
   count(DISTINCT u.id) FILTER(WHERE u.status='available') available
   FROM public.pos_loyalty_visit_programs vp LEFT JOIN public.pos_loyalty_visit_events e ON e.visit_program_id=vp.id
   LEFT JOIN public.pos_loyalty_reward_unlocks u ON u.visit_program_id=vp.id WHERE vp.brand_slug=p_brand_slug GROUP BY vp.id)x)
 SELECT jsonb_build_object('membersCount',(SELECT count(*) FROM members),'activeMembersCount',(SELECT count(*) FROM members WHERE status='active'),
  'pointsEarnedPeriod',COALESCE((SELECT sum(points) FROM tx WHERE transaction_type='earn'),0),
  'pointsRedeemedPeriod',abs(COALESCE((SELECT sum(points) FROM tx WHERE transaction_type='redeem'),0)),
  'rewardsRedeemedCount',(SELECT count(*) FROM public.pos_loyalty_redemptions r JOIN public.pos_sales s ON s.id=r.sale_id WHERE r.brand_slug=p_brand_slug AND s.status='completed' AND s.sold_at>=p_date_from AND s.sold_at<p_date_to AND(p_location_id IS NULL OR s.location_id=p_location_id)),
  'rewardsDiscountValue',COALESCE((SELECT sum(r.discount_applied) FROM public.pos_loyalty_redemptions r JOIN public.pos_sales s ON s.id=r.sale_id WHERE r.brand_slug=p_brand_slug AND s.status='completed' AND s.sold_at>=p_date_from AND s.sold_at<p_date_to AND(p_location_id IS NULL OR s.location_id=p_location_id)),0),
  'tierDistribution',tiers.value,'visitProgramsActive',(SELECT count(*) FROM public.pos_loyalty_visit_programs WHERE brand_slug=p_brand_slug AND active),
  'visitQualifiesPeriod',COALESCE((SELECT sum((j->>'qualifiesPeriod')::int) FROM jsonb_array_elements(visits.value) j),0),
  'visitUnlocksCreatedPeriod',COALESCE((SELECT sum((j->>'unlocksCreatedPeriod')::int) FROM jsonb_array_elements(visits.value) j),0),
  'visitUnlocksRedeemedPeriod',COALESCE((SELECT sum((j->>'unlocksRedeemedPeriod')::int) FROM jsonb_array_elements(visits.value) j),0),
  'availableUnlocksCurrent',(SELECT count(*) FROM public.pos_loyalty_reward_unlocks WHERE brand_slug=p_brand_slug AND status='available'),
  'visitPrograms',visits.value) INTO v_result FROM tiers CROSS JOIN visits;
 RETURN v_result;
END $$;


ALTER FUNCTION "public"."pos_get_analytics_loyalty"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_get_analytics_periods"("p_brand_slug" "text", "p_anchor" timestamp with time zone DEFAULT "now"(), "p_location_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE z text; local_anchor timestamp; today_start timestamptz; month_start timestamptz;
 previous_month_start timestamptz; elapsed interval;
BEGIN
 SELECT l.timezone INTO z FROM public.pos_analytics_assert_scope(p_brand_slug,p_anchor-interval '1 microsecond',p_anchor,p_location_id)l;
 local_anchor:=p_anchor AT TIME ZONE z;
 today_start:=date_trunc('day',local_anchor) AT TIME ZONE z;
 month_start:=date_trunc('month',local_anchor) AT TIME ZONE z;
 previous_month_start:=(date_trunc('month',local_anchor)-interval '1 month') AT TIME ZONE z;
 elapsed:=p_anchor-month_start;
 RETURN jsonb_build_object('timezone',z,
  'today',jsonb_build_object('from',today_start,'to',p_anchor),
  'yesterday',jsonb_build_object('from',today_start-interval '1 day','to',today_start),
  'last7Days',jsonb_build_object('from',p_anchor-interval '7 days','to',p_anchor),
  'previous7Days',jsonb_build_object('from',p_anchor-interval '14 days','to',p_anchor-interval '7 days'),
  'last30Days',jsonb_build_object('from',p_anchor-interval '30 days','to',p_anchor),
  'previous30Days',jsonb_build_object('from',p_anchor-interval '60 days','to',p_anchor-interval '30 days'),
  'monthToDate',jsonb_build_object('from',month_start,'to',p_anchor),
  'previousMonthSameElapsedPeriod',jsonb_build_object('from',previous_month_start,'to',LEAST(previous_month_start+elapsed,month_start)));
END $$;


ALTER FUNCTION "public"."pos_get_analytics_periods"("p_brand_slug" "text", "p_anchor" timestamp with time zone, "p_location_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_get_analytics_product_pairs"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 50) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_result jsonb; v_orders numeric;
BEGIN
 PERFORM 1 FROM public.pos_analytics_assert_scope(p_brand_slug,p_date_from,p_date_to,p_location_id);
 IF p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'limit debe estar entre 1 y 200.'; END IF;
 SELECT count(*) INTO v_orders FROM public.pos_sales WHERE brand_slug=p_brand_slug AND status='completed' AND sold_at>=p_date_from AND sold_at<p_date_to AND(p_location_id IS NULL OR location_id=p_location_id);
 WITH products AS(SELECT DISTINCT i.sale_id,i.product_id,i.product_name FROM public.pos_sales s JOIN public.pos_sale_items i ON i.sale_id=s.id WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.sold_at>=p_date_from AND s.sold_at<p_date_to AND(p_location_id IS NULL OR s.location_id=p_location_id)), freq AS(SELECT product_id,count(*)orders FROM products GROUP BY product_id), pairs AS(SELECT a.product_id a_id,a.product_name a_name,b.product_id b_id,b.product_name b_name,count(*) together FROM products a JOIN products b ON b.sale_id=a.sale_id AND a.product_id<b.product_id GROUP BY a.product_id,a.product_name,b.product_id,b.product_name)
 SELECT COALESCE(jsonb_agg(jsonb_build_object('productA',jsonb_build_object('id',a_id,'name',a_name),'productB',jsonb_build_object('id',b_id,'name',b_name),'ordersTogether',together,'pairSalesCount',together,'supportA',CASE WHEN v_orders=0 THEN NULL ELSE round(fa.orders*100/v_orders,2)END,'supportB',CASE WHEN v_orders=0 THEN NULL ELSE round(fb.orders*100/v_orders,2)END)ORDER BY together DESC,a_name,b_name),'[]') INTO v_result FROM(SELECT * FROM pairs ORDER BY together DESC,a_name,b_name LIMIT p_limit)p JOIN freq fa ON fa.product_id=p.a_id JOIN freq fb ON fb.product_id=p.b_id;
 RETURN v_result;
END $$;


ALTER FUNCTION "public"."pos_get_analytics_product_pairs"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_get_analytics_products"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 20, "p_order_by" "text" DEFAULT 'sales_total'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_result jsonb;
BEGIN
 PERFORM 1 FROM public.pos_analytics_assert_scope(p_brand_slug,p_date_from,p_date_to,p_location_id);
 IF p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'limit debe estar entre 1 y 100.'; END IF;
 IF p_order_by NOT IN('sales_total','units_sold','ticket_count') THEN RAISE EXCEPTION 'Orden de productos no permitido.'; END IF;
 WITH rows AS (SELECT i.product_id,i.product_name,i.variant_id,i.variant_name,i.sku,
   sum(i.quantity) units_sold,sum(i.line_total) sales_total,
   sum(i.discount_amount+i.loyalty_discount_amount) discount_total,count(DISTINCT i.sale_id) ticket_count,
   CASE WHEN sum(i.quantity)=0 THEN NULL ELSE round(sum(i.line_total)/sum(i.quantity),2) END average_unit_price
  FROM public.pos_sales s JOIN public.pos_sale_items i ON i.sale_id=s.id
  WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.sold_at>=p_date_from AND s.sold_at<p_date_to
   AND(p_location_id IS NULL OR s.location_id=p_location_id)
  GROUP BY i.product_id,i.product_name,i.variant_id,i.variant_name,i.sku), total AS (SELECT COALESCE(sum(sales_total),0) v FROM rows)
 SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.rank_value DESC,x."productName",x."variantName"),'[]') INTO v_result
 FROM (SELECT r.product_id "productId",r.product_name "productName",r.variant_id "variantId",r.variant_name "variantName",r.sku,
  r.units_sold "unitsSold",r.sales_total "salesTotal",r.discount_total "discountTotal",r.ticket_count "ticketCount",
  r.average_unit_price "averageUnitPrice",CASE WHEN t.v=0 THEN NULL ELSE round(r.sales_total*100/t.v,2) END "percentageOfSales",
  COALESCE((SELECT sum(inv.quantity) FROM public.pos_inventory inv WHERE inv.brand_slug=p_brand_slug AND inv.variant_id=r.variant_id AND(p_location_id IS NULL OR inv.location_id=p_location_id)),0) "currentStock",
  CASE p_order_by WHEN 'units_sold' THEN r.units_sold WHEN 'ticket_count' THEN r.ticket_count ELSE r.sales_total END rank_value
  FROM rows r CROSS JOIN total t ORDER BY rank_value DESC,r.product_name,r.variant_name LIMIT p_limit)x;
 RETURN v_result;
END $$;


ALTER FUNCTION "public"."pos_get_analytics_products"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid", "p_limit" integer, "p_order_by" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_get_analytics_sales_patterns"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_timezone text; v_days jsonb; v_hours jsonb;
BEGIN
 SELECT s.timezone INTO v_timezone FROM public.pos_analytics_assert_scope(p_brand_slug,p_date_from,p_date_to,p_location_id)s;
 WITH base AS(SELECT s.*,COALESCE(i.items,0)items FROM public.pos_sales s LEFT JOIN(SELECT sale_id,sum(quantity)items FROM public.pos_sale_items GROUP BY sale_id)i ON i.sale_id=s.id WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.sold_at>=p_date_from AND s.sold_at<p_date_to AND(p_location_id IS NULL OR s.location_id=p_location_id))
 SELECT COALESCE(jsonb_agg(jsonb_build_object('dayOfWeek',x.d,'salesTotal',x.sales,'ordersCount',x.orders,'averageTicket',round(x.sales/x.orders,2)) ORDER BY x.d),'[]') INTO v_days FROM(SELECT extract(isodow FROM sold_at AT TIME ZONE v_timezone)::int d,sum(total)sales,count(*)orders FROM base GROUP BY 1)x;
 WITH base AS(SELECT s.* FROM public.pos_sales s WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.sold_at>=p_date_from AND s.sold_at<p_date_to AND(p_location_id IS NULL OR s.location_id=p_location_id))
 SELECT COALESCE(jsonb_agg(jsonb_build_object('hourOfDay',x.h,'salesTotal',x.sales,'ordersCount',x.orders,'averageTicket',round(x.sales/x.orders,2)) ORDER BY x.h),'[]') INTO v_hours FROM(SELECT extract(hour FROM sold_at AT TIME ZONE v_timezone)::int h,sum(total)sales,count(*)orders FROM base GROUP BY 1)x;
 RETURN jsonb_build_object('timezone',v_timezone,'byDayOfWeek',v_days,'byHourOfDay',v_hours);
END $$;


ALTER FUNCTION "public"."pos_get_analytics_sales_patterns"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_get_analytics_sales_series"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_granularity" "text", "p_location_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_timezone text; v_result jsonb;
BEGIN
 SELECT s.timezone INTO v_timezone FROM public.pos_analytics_assert_scope(p_brand_slug,p_date_from,p_date_to,p_location_id)s;
 IF p_granularity NOT IN('hour','day','week','month') THEN RAISE EXCEPTION 'Granularidad no permitida.'; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x."bucketStart"),'[]') INTO v_result FROM(
  SELECT date_trunc(p_granularity,s.sold_at AT TIME ZONE v_timezone) AT TIME ZONE v_timezone "bucketStart",
   sum(s.total) "netSales",count(*) "ordersCount",COALESCE(sum(i.items),0) "itemsSold",round(sum(s.total)/count(*),2) "averageTicket"
  FROM public.pos_sales s LEFT JOIN(SELECT sale_id,sum(quantity)items FROM public.pos_sale_items GROUP BY sale_id)i ON i.sale_id=s.id
  WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.sold_at>=p_date_from AND s.sold_at<p_date_to AND(p_location_id IS NULL OR s.location_id=p_location_id)
  GROUP BY 1)x; RETURN v_result;
END $$;


ALTER FUNCTION "public"."pos_get_analytics_sales_series"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_granularity" "text", "p_location_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_get_analytics_summary"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_brand_id text; v_timezone text; v_duration interval; v_result jsonb;
BEGIN
  SELECT s.brand_id,s.timezone INTO v_brand_id,v_timezone
  FROM public.pos_analytics_assert_scope(p_brand_slug,p_date_from,p_date_to,p_location_id) s;
  v_duration:=p_date_to-p_date_from;
  WITH periods AS (
    SELECT 'current'::text k,p_date_from f,p_date_to t UNION ALL
    SELECT 'previous',p_date_from-v_duration,p_date_from
  ), sales AS (
    SELECT p.k,s.id,s.customer_id,s.location_id,s.subtotal,s.discount_total,
      COALESCE(s.loyalty_discount_total,0) loyalty_discount_total,s.tax_total,s.total,s.sold_at
    FROM periods p JOIN public.pos_sales s ON s.brand_slug=p_brand_slug AND s.status='completed'
      AND s.sold_at>=p.f AND s.sold_at<p.t
      AND (p_location_id IS NULL OR s.location_id=p_location_id)
  ), sale_facts AS (
    SELECT s.k,count(*) orders,COALESCE(sum(s.subtotal),0) gross,
      COALESCE(sum(s.discount_total+s.loyalty_discount_total),0) discounts,
      COALESCE(sum(s.total),0) net,COALESCE(sum(s.tax_total),0) tax,
      COALESCE(min(s.total),0) min_ticket,COALESCE(max(s.total),0) max_ticket,
      count(*) FILTER(WHERE s.customer_id IS NOT NULL) identified,
      count(DISTINCT s.customer_id) FILTER(WHERE s.customer_id IS NOT NULL) customers
    FROM sales s GROUP BY s.k
  ), item_facts AS (
    SELECT s.k,COALESCE(sum(i.quantity),0) items,
      COALESCE(sum(i.unit_cost*i.quantity),0) cogs
    FROM sales s JOIN public.pos_sale_items i ON i.sale_id=s.id GROUP BY s.k
  ), combined AS (
    SELECT p.k,COALESCE(f.orders,0) orders,COALESCE(f.gross,0) gross,
      COALESCE(f.discounts,0) discounts,COALESCE(f.net,0) net,COALESCE(f.tax,0) tax,
      COALESCE(f.min_ticket,0) min_ticket,COALESCE(f.max_ticket,0) max_ticket,
      COALESCE(f.identified,0) identified,COALESCE(f.customers,0) customers,
      COALESCE(i.items,0) items,COALESCE(i.cogs,0) cogs
    FROM periods p LEFT JOIN sale_facts f ON f.k=p.k LEFT JOIN item_facts i ON i.k=p.k
  ), cmp AS (
    SELECT c.*,p.orders p_orders,p.gross p_gross,p.discounts p_discounts,p.net p_net,
      p.tax p_tax,p.items p_items,p.customers p_customers,p.identified p_identified,p.cogs p_cogs
    FROM combined c JOIN combined p ON p.k='previous' WHERE c.k='current'
  ), payments AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('paymentMethod',x.payment_method,'transactionsCount',x.cnt,
      'amount',x.amount,'percentageOfSales',CASE WHEN c.net=0 THEN NULL ELSE round(x.amount*100/c.net,2) END)
      ORDER BY x.amount DESC),'[]'::jsonb) value
    FROM cmp c CROSS JOIN LATERAL (
      SELECT p.payment_method,count(*) cnt,sum(p.amount) amount FROM sales s
      JOIN public.pos_payments p ON p.sale_id=s.id WHERE s.k='current' GROUP BY p.payment_method
    ) x
  ), locations AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('locationId',x.location_id,'name',x.name,'salesTotal',x.net,
      'ordersCount',x.orders,'averageTicket',CASE WHEN x.orders=0 THEN 0 ELSE round(x.net/x.orders,2) END,
      'itemsSold',x.items,'customers',x.customers) ORDER BY x.net DESC),'[]'::jsonb) value
    FROM (SELECT s.location_id,l.name,count(*) orders,sum(s.total) net,
      COALESCE(sum(i.items),0) items,count(DISTINCT s.customer_id) FILTER(WHERE s.customer_id IS NOT NULL) customers
      FROM sales s JOIN public.pos_locations l ON l.id=s.location_id
      LEFT JOIN(SELECT sale_id,sum(quantity)items FROM public.pos_sale_items GROUP BY sale_id)i ON i.sale_id=s.id
      WHERE s.k='current' GROUP BY s.location_id,l.name) x
  ), categories AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('categoryId',x.category_id,'categoryName',x.name,
      'salesTotal',x.sales_total,'unitsSold',x.units) ORDER BY x.sales_total DESC),'[]'::jsonb) value
    FROM (SELECT p.category_id,c.name,sum(i.line_total) sales_total,sum(i.quantity) units
      FROM sales s JOIN public.pos_sale_items i ON i.sale_id=s.id
      JOIN public.pos_products p ON p.id=i.product_id LEFT JOIN public.pos_categories c ON c.id=p.category_id
      WHERE s.k='current' GROUP BY p.category_id,c.name) x
  )
  SELECT jsonb_build_object(
    'schemaVersion','reports_v1','brandSlug',p_brand_slug,'locationId',p_location_id,'timezone',v_timezone,
    'period',jsonb_build_object('from',p_date_from,'to',p_date_to,'previousFrom',p_date_from-v_duration,'previousTo',p_date_from),
    'sales',jsonb_build_object(
      'grossSales',public.pos_analytics_metric(c.gross,c.p_gross),
      'discountTotal',public.pos_analytics_metric(c.discounts,c.p_discounts),
      'netSales',public.pos_analytics_metric(c.net,c.p_net),
      'taxTotal',public.pos_analytics_metric(c.tax,c.p_tax),
      'ordersCount',public.pos_analytics_metric(c.orders,c.p_orders),
      'itemsSold',public.pos_analytics_metric(c.items,c.p_items),
      'averageTicket',public.pos_analytics_metric(CASE WHEN c.orders=0 THEN 0 ELSE round(c.net/c.orders,2) END,CASE WHEN c.p_orders=0 THEN 0 ELSE round(c.p_net/c.p_orders,2) END),
      'averageItemsPerTicket',public.pos_analytics_metric(CASE WHEN c.orders=0 THEN 0 ELSE round(c.items/c.orders,3) END,CASE WHEN c.p_orders=0 THEN 0 ELSE round(c.p_items/c.p_orders,3) END),
      'minTicket',c.min_ticket,'maxTicket',c.max_ticket,'completedSalesCount',c.orders,
      'cogs',public.pos_analytics_metric(c.cogs,c.p_cogs),
      'grossProfit',c.net-c.tax-c.cogs,
      'grossMarginPercent',CASE WHEN c.net-c.tax=0 THEN NULL ELSE round((c.net-c.tax-c.cogs)*100/(c.net-c.tax),2) END,
      'refundAnalytics','pending_no_refund_ledger'),
    'customers',jsonb_build_object('uniqueCustomers',c.customers,'identifiedSales',c.identified,
      'anonymousSales',c.orders-c.identified,'customerIdentificationRate',CASE WHEN c.orders=0 THEN NULL ELSE round(c.identified*100.0/c.orders,2) END,
      'newCustomers',(SELECT count(*) FROM(SELECT s.customer_id FROM public.pos_sales s WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.customer_id IS NOT NULL GROUP BY s.customer_id HAVING min(s.sold_at)>=p_date_from AND min(s.sold_at)<p_date_to AND EXISTS(SELECT 1 FROM public.pos_sales cp WHERE cp.brand_slug=p_brand_slug AND cp.status='completed' AND cp.customer_id=s.customer_id AND cp.sold_at>=p_date_from AND cp.sold_at<p_date_to AND(p_location_id IS NULL OR cp.location_id=p_location_id)))x),
      'returningCustomers',(SELECT count(DISTINCT s.customer_id) FROM public.pos_sales s WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.customer_id IS NOT NULL AND s.sold_at>=p_date_from AND s.sold_at<p_date_to AND(p_location_id IS NULL OR s.location_id=p_location_id) AND EXISTS(SELECT 1 FROM public.pos_sales h WHERE h.brand_slug=p_brand_slug AND h.status='completed' AND h.customer_id=s.customer_id AND h.sold_at<p_date_from)),
      'repeatCustomerRate',CASE WHEN c.customers=0 THEN NULL ELSE round((SELECT count(*) FROM(SELECT s.customer_id FROM public.pos_sales s WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.customer_id IS NOT NULL AND s.sold_at>=p_date_from AND s.sold_at<p_date_to AND(p_location_id IS NULL OR s.location_id=p_location_id) GROUP BY s.customer_id HAVING count(*)>=2)x)*100.0/c.customers,2) END,
      'customerSalesTotal',(SELECT COALESCE(sum(s.total),0) FROM public.pos_sales s WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.customer_id IS NOT NULL AND s.sold_at>=p_date_from AND s.sold_at<p_date_to AND(p_location_id IS NULL OR s.location_id=p_location_id)),
      'averageCustomerSpend',CASE WHEN c.customers=0 THEN NULL ELSE round((SELECT COALESCE(sum(s.total),0) FROM public.pos_sales s WHERE s.brand_slug=p_brand_slug AND s.status='completed' AND s.customer_id IS NOT NULL AND s.sold_at>=p_date_from AND s.sold_at<p_date_to AND(p_location_id IS NULL OR s.location_id=p_location_id))/c.customers,2) END),
    'payments',payments.value,'locations',locations.value,'categories',categories.value)
  INTO v_result FROM cmp c CROSS JOIN payments CROSS JOIN locations CROSS JOIN categories;
  RETURN v_result;
END $$;


ALTER FUNCTION "public"."pos_get_analytics_summary"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_get_available_loyalty_reward_unlocks"("p_brand_slug" "text", "p_member_id" "uuid") RETURNS TABLE("id" "uuid", "visit_program_id" "uuid", "member_id" "uuid", "reward_id" "uuid", "cycle_number" integer, "reward_name" "text", "reward_type" "text", "reward_value" numeric, "required_visits_snapshot" integer, "minimum_sale_amount_snapshot" numeric, "unlocked_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pos_loyalty_members m WHERE m.id = p_member_id AND m.brand_slug = p_brand_slug) THEN
    RAISE EXCEPTION 'La membresía no existe o pertenece a otra marca.';
  END IF;
  RETURN QUERY SELECT u.id, u.visit_program_id, u.member_id, u.reward_id, u.cycle_number,
    u.reward_name, u.reward_type, u.reward_value, u.required_visits_snapshot,
    u.minimum_sale_amount_snapshot, u.unlocked_at
  FROM public.pos_loyalty_reward_unlocks u
  WHERE u.brand_slug = p_brand_slug AND u.member_id = p_member_id AND u.status = 'available'
  ORDER BY u.unlocked_at, u.id;
END;
$$;


ALTER FUNCTION "public"."pos_get_available_loyalty_reward_unlocks"("p_brand_slug" "text", "p_member_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_get_brand_entitlements"("p_brand_slug" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."pos_get_brand_entitlements"("p_brand_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_get_cash_session_summaries_v1"("p_brand_slug" "text", "p_session_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_include_expected_cash" boolean DEFAULT false) RETURNS TABLE("cash_session_id" "uuid", "sales_total" numeric, "tickets_count" bigint, "cash_sales" numeric, "card_sales" numeric, "transfer_sales" numeric, "wallet_sales" numeric, "other_sales" numeric, "cash_income" numeric, "cash_deposits" numeric, "cash_expenses" numeric, "cash_withdrawals" numeric, "net_cash_movements" numeric, "expected_cash" numeric, "recent_movements" "jsonb")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."pos_get_cash_session_summaries_v1"("p_brand_slug" "text", "p_session_ids" "uuid"[], "p_include_expected_cash" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_get_effective_commercial_access"("p_brand_slug" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."pos_get_effective_commercial_access"("p_brand_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_get_intelligence_report"("p_brand_slug" "text", "p_report_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE result jsonb;
BEGIN
 SELECT to_jsonb(r)INTO result FROM public.pos_intelligence_reports r WHERE r.id=p_report_id AND r.brand_slug=p_brand_slug AND r.generation_status='completed';
 IF result IS NULL THEN RAISE EXCEPTION 'El reporte PULSAR no existe o pertenece a otra marca.';END IF;
 RETURN result;
END $$;


ALTER FUNCTION "public"."pos_get_intelligence_report"("p_brand_slug" "text", "p_report_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_get_intelligence_reports"("p_brand_slug" "text", "p_location_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 20, "p_offset" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
 PERFORM 1 FROM public.pos_analytics_assert_scope(p_brand_slug,now()-interval'1 microsecond',now(),p_location_id);
 IF p_limit NOT BETWEEN 1 AND 100 OR p_offset<0 THEN RAISE EXCEPTION 'Paginación de reportes no válida.';END IF;
 RETURN(SELECT jsonb_build_object('reports',COALESCE(jsonb_agg(to_jsonb(x)ORDER BY x."generatedAt"DESC,x.id),'[]'::jsonb),'limit',p_limit,'offset',p_offset)FROM(SELECT id,location_id "locationId",report_type "reportType",period_start "periodStart",period_end "periodEnd",executive_summary "executiveSummary",health_status "healthStatus",health_score "healthScore",model,prompt_version "promptVersion",schema_version "schemaVersion",generated_at "generatedAt"FROM public.pos_intelligence_reports WHERE brand_slug=p_brand_slug AND(p_location_id IS NULL OR location_id=p_location_id)AND generation_status='completed'ORDER BY generated_at DESC,id LIMIT p_limit OFFSET p_offset)x);
END $$;


ALTER FUNCTION "public"."pos_get_intelligence_reports"("p_brand_slug" "text", "p_location_id" "uuid", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_get_intelligence_signals"("p_brand_slug" "text", "p_location_id" "uuid" DEFAULT NULL::"uuid", "p_status" "text" DEFAULT 'open'::"text", "p_category" "text" DEFAULT NULL::"text", "p_severity" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 20, "p_offset" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM 1
  FROM public.pos_analytics_assert_scope(
    p_brand_slug,
    now() - interval '1 microsecond',
    now(),
    p_location_id
  );

  IF p_status IS NOT NULL
     AND p_status NOT IN ('open', 'acknowledged', 'resolved', 'dismissed') THEN
    RAISE EXCEPTION 'Estado de señal no permitido.';
  END IF;

  IF p_category IS NOT NULL
     AND p_category NOT IN (
       'opportunity', 'risk', 'anomaly', 'trend',
       'loyalty', 'customer', 'inventory', 'product'
     ) THEN
    RAISE EXCEPTION 'Categoría de señal no permitida.';
  END IF;

  IF p_severity IS NOT NULL
     AND p_severity NOT IN ('info', 'low', 'medium', 'high', 'critical') THEN
    RAISE EXCEPTION 'Severidad no permitida.';
  END IF;

  IF p_limit NOT BETWEEN 1 AND 100 OR p_offset < 0 THEN
    RAISE EXCEPTION 'Paginación de señales no válida.';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'signals',
      COALESCE(
        jsonb_agg(
          to_jsonb(x)
          ORDER BY x.weight DESC, x."detectedAt" DESC, x.id
        ),
        '[]'::jsonb
      ),
      'limit', p_limit,
      'offset', p_offset
    )
    FROM (
      SELECT
        id,
        signal_type AS "signalType",
        signal_category AS category,
        severity,
        status,
        entity_type AS "entityType",
        entity_id AS "entityId",
        entity_name AS "entityName",
        period_start AS "periodStart",
        period_end AS "periodEnd",
        title,
        metric_key AS "metricKey",
        current_value AS "currentValue",
        previous_value AS "previousValue",
        delta_value AS "deltaValue",
        delta_percent AS "deltaPercent",
        evidence,
        context,
        rule_version AS "ruleVersion",
        detected_at AS "detectedAt",
        last_seen_at AS "lastSeenAt",
        CASE severity
          WHEN 'critical' THEN 5
          WHEN 'high' THEN 4
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 2
          ELSE 1
        END AS weight
      FROM public.pos_intelligence_signals
      WHERE brand_slug = p_brand_slug
        AND (p_location_id IS NULL OR location_id = p_location_id)
        AND (p_status IS NULL OR status = p_status)
        AND (p_category IS NULL OR signal_category = p_category)
        AND (p_severity IS NULL OR severity = p_severity)
      ORDER BY weight DESC, detected_at DESC, id
      LIMIT p_limit
      OFFSET p_offset
    ) AS x
  );
END
$$;


ALTER FUNCTION "public"."pos_get_intelligence_signals"("p_brand_slug" "text", "p_location_id" "uuid", "p_status" "text", "p_category" "text", "p_severity" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_get_latest_intelligence_report"("p_brand_slug" "text", "p_location_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
 PERFORM 1 FROM public.pos_analytics_assert_scope(p_brand_slug,now()-interval'1 microsecond',now(),p_location_id);
 RETURN(SELECT to_jsonb(r)FROM public.pos_intelligence_reports r WHERE r.brand_slug=p_brand_slug AND COALESCE(r.location_id,'00000000-0000-0000-0000-000000000000'::uuid)=COALESCE(p_location_id,'00000000-0000-0000-0000-000000000000'::uuid)AND r.generation_status='completed'ORDER BY r.generated_at DESC,r.id LIMIT 1);
END $$;


ALTER FUNCTION "public"."pos_get_latest_intelligence_report"("p_brand_slug" "text", "p_location_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_get_loyalty_visit_progress"("p_brand_slug" "text", "p_visit_program_id" "uuid", "p_member_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_required integer; v_completed integer; v_member_brand text;
BEGIN
  SELECT required_visits INTO v_required FROM public.pos_loyalty_visit_programs WHERE id = p_visit_program_id AND brand_slug = p_brand_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'El programa de visitas no existe o pertenece a otra marca.'; END IF;
  SELECT brand_slug INTO v_member_brand FROM public.pos_loyalty_members WHERE id = p_member_id AND brand_slug = p_brand_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'La membresía no existe o pertenece a otra marca.'; END IF;
  SELECT COALESCE(sum(CASE event_type WHEN 'qualify' THEN 1 ELSE -1 END), 0)::integer
  INTO v_completed FROM public.pos_loyalty_visit_events
  WHERE brand_slug = p_brand_slug AND visit_program_id = p_visit_program_id AND member_id = p_member_id;
  RETURN jsonb_build_object('completedVisits', v_completed, 'cyclesCompleted', v_completed / v_required,
    'currentProgress', mod(v_completed, v_required), 'requiredVisits', v_required);
END;
$$;


ALTER FUNCTION "public"."pos_get_loyalty_visit_progress"("p_brand_slug" "text", "p_visit_program_id" "uuid", "p_member_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_get_operational_report_products_v1"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 200) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM 1 FROM public.pos_analytics_assert_scope(
    p_brand_slug, p_date_from, p_date_to, p_location_id
  );

  IF p_limit NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'El límite de productos no es válido.';
  END IF;

  WITH line_rows AS (
    SELECT
      i.product_id,
      max(i.product_name) AS product_name,
      i.variant_id,
      max(i.variant_name) AS variant_name,
      max(i.sku) AS sku,
      sum(i.quantity) AS units_sold,
      sum(i.line_total) AS revenue,
      sum(i.unit_cost * i.quantity) AS cogs,
      sum(i.tax_amount) AS tax_amount
    FROM public.pos_sales s
    JOIN public.pos_sale_items i ON i.sale_id = s.id
    WHERE s.brand_slug = p_brand_slug
      AND s.status = 'completed'
      AND s.sold_at >= p_date_from
      AND s.sold_at < p_date_to
      AND (p_location_id IS NULL OR s.location_id = p_location_id)
    GROUP BY i.product_id, i.variant_id
  ), variant_rows AS (
    SELECT
      lr.*,
      p.product_code,
      v.attributes,
      COALESCE((
        SELECT sum(inv.quantity - inv.reserved_quantity)
        FROM public.pos_inventory inv
        WHERE inv.brand_slug = p_brand_slug
          AND inv.variant_id = lr.variant_id
          AND (p_location_id IS NULL OR inv.location_id = p_location_id)
      ), 0) AS current_stock
    FROM line_rows lr
    JOIN public.pos_products p
      ON p.id = lr.product_id
      AND p.brand_slug = p_brand_slug
    JOIN public.pos_product_variants v
      ON v.id = lr.variant_id
      AND v.product_id = lr.product_id
      AND v.brand_slug = p_brand_slug
  ), product_rows AS (
    SELECT
      vr.product_id,
      max(vr.product_code) AS product_code,
      max(vr.product_name) AS product_name,
      sum(vr.units_sold) AS units_sold,
      sum(vr.revenue) AS revenue,
      sum(vr.cogs) AS cogs,
      sum(vr.tax_amount) AS tax_amount,
      sum(vr.current_stock) AS current_stock,
      jsonb_agg(
        jsonb_build_object(
          'variantId', vr.variant_id,
          'variantName', vr.variant_name,
          'sku', vr.sku,
          'attributes', vr.attributes,
          'attributesAreCurrent', true,
          'unitsSold', vr.units_sold,
          'revenue', vr.revenue,
          'cogs', vr.cogs,
          'grossProfit', vr.revenue - vr.tax_amount - vr.cogs,
          'grossMarginPercent', CASE
            WHEN vr.revenue - vr.tax_amount > 0
              THEN round((vr.revenue - vr.tax_amount - vr.cogs) * 100 / (vr.revenue - vr.tax_amount), 2)
            ELSE NULL
          END,
          'currentStock', vr.current_stock
        ) ORDER BY vr.variant_name, vr.variant_id
      ) AS variants
    FROM variant_rows vr
    GROUP BY vr.product_id
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'productId', x.product_id,
      'productCode', x.product_code,
      'productName', x.product_name,
      'unitsSold', x.units_sold,
      'revenue', x.revenue,
      'cogs', x.cogs,
      'grossProfit', x.revenue - x.tax_amount - x.cogs,
      'grossMarginPercent', CASE
        WHEN x.revenue - x.tax_amount > 0
          THEN round((x.revenue - x.tax_amount - x.cogs) * 100 / (x.revenue - x.tax_amount), 2)
        ELSE NULL
      END,
      'currentStock', x.current_stock,
      'variants', x.variants,
      'productCodeIsCurrentMetadata', true
    ) ORDER BY x.revenue DESC, x.product_name, x.product_id
  ), '[]'::jsonb) INTO v_result
  FROM (
    SELECT * FROM product_rows
    ORDER BY revenue DESC, product_name, product_id
    LIMIT p_limit
  ) x;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."pos_get_operational_report_products_v1"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_get_reports_export_inventory_v1"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_result jsonb;
  v_days numeric;
BEGIN
  PERFORM 1 FROM public.pos_analytics_assert_scope(
    p_brand_slug, p_date_from, p_date_to, p_location_id
  );
  v_days := GREATEST(extract(epoch FROM (p_date_to - p_date_from)) / 86400, 1);

  WITH sold AS (
    SELECT i.variant_id, sum(i.quantity) AS units
    FROM public.pos_sales s
    JOIN public.pos_sale_items i ON i.sale_id = s.id
    WHERE s.brand_slug = p_brand_slug
      AND s.status = 'completed'
      AND s.sold_at >= p_date_from
      AND s.sold_at < p_date_to
      AND (p_location_id IS NULL OR s.location_id = p_location_id)
    GROUP BY i.variant_id
  ), rows AS (
    SELECT
      prod.product_code,
      prod.name AS product_name,
      variant.name AS variant_name,
      variant.sku,
      location.name AS location_name,
      inv.quantity - inv.reserved_quantity AS available_quantity,
      inv.minimum_quantity AS minimum_quantity,
      variant.cost AS current_unit_cost,
      round((inv.quantity - inv.reserved_quantity) * variant.cost, 2) AS estimated_inventory_value,
      round(COALESCE(sold.units, 0) / v_days, 3) AS average_units_per_day,
      CASE
        WHEN COALESCE(sold.units, 0) = 0 THEN NULL
        ELSE round((inv.quantity - inv.reserved_quantity) / (sold.units / v_days), 2)
      END AS estimated_days_of_stock,
      CASE
        WHEN inv.quantity - inv.reserved_quantity <= 0 THEN 'out_of_stock'
        WHEN inv.quantity - inv.reserved_quantity <= inv.minimum_quantity THEN 'low_stock'
        ELSE 'normal'
      END AS status
    FROM public.pos_inventory inv
    JOIN public.pos_product_variants variant
      ON variant.id = inv.variant_id
      AND variant.brand_slug = p_brand_slug
    JOIN public.pos_products prod
      ON prod.id = variant.product_id
      AND prod.brand_slug = p_brand_slug
    JOIN public.pos_locations location
      ON location.id = inv.location_id
      AND location.brand_slug = p_brand_slug
    LEFT JOIN sold ON sold.variant_id = variant.id
    WHERE inv.brand_slug = p_brand_slug
      AND (p_location_id IS NULL OR inv.location_id = p_location_id)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'productCode', product_code,
    'productName', product_name,
    'variantName', variant_name,
    'sku', sku,
    'location', location_name,
    'availableQuantity', available_quantity,
    'minimumQuantity', minimum_quantity,
    'currentUnitCost', current_unit_cost,
    'estimatedInventoryValue', estimated_inventory_value,
    'averageUnitsPerDay', average_units_per_day,
    'estimatedDaysOfStock', estimated_days_of_stock,
    'status', status
  ) ORDER BY product_name, variant_name, location_name), '[]'::jsonb)
  INTO v_result
  FROM rows;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."pos_get_reports_export_inventory_v1"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_get_reports_export_products_v1"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM 1 FROM public.pos_analytics_assert_scope(
    p_brand_slug, p_date_from, p_date_to, p_location_id
  );

  WITH line_rows AS (
    SELECT
      i.product_id,
      i.variant_id,
      max(i.product_name) AS product_name,
      max(i.variant_name) AS variant_name,
      max(i.sku) AS sku,
      sum(i.quantity) AS units_sold,
      sum(i.line_total) AS net_sales,
      sum(i.unit_cost * i.quantity) AS historical_cogs,
      sum(i.tax_amount) AS tax_amount
    FROM public.pos_sales s
    JOIN public.pos_sale_items i ON i.sale_id = s.id
    WHERE s.brand_slug = p_brand_slug
      AND s.status = 'completed'
      AND s.sold_at >= p_date_from
      AND s.sold_at < p_date_to
      AND (p_location_id IS NULL OR s.location_id = p_location_id)
    GROUP BY i.product_id, i.variant_id
  ), rows AS (
    SELECT
      lr.product_id,
      prod.product_code,
      lr.product_name,
      lr.variant_id,
      lr.variant_name,
      lr.sku,
      variant.attributes AS current_attributes,
      lr.units_sold,
      lr.net_sales,
      lr.historical_cogs,
      lr.net_sales - lr.tax_amount - lr.historical_cogs AS gross_margin,
      CASE
        WHEN lr.net_sales - lr.tax_amount > 0
          THEN round((lr.net_sales - lr.tax_amount - lr.historical_cogs) * 100 / (lr.net_sales - lr.tax_amount), 2)
        ELSE NULL
      END AS gross_margin_pct,
      COALESCE((
        SELECT sum(inv.quantity - inv.reserved_quantity)
        FROM public.pos_inventory inv
        WHERE inv.brand_slug = p_brand_slug
          AND inv.variant_id = lr.variant_id
          AND (p_location_id IS NULL OR inv.location_id = p_location_id)
      ), 0) AS current_stock,
      CASE WHEN p_location_id IS NULL THEN NULL ELSE location.name END AS location_name
    FROM line_rows lr
    JOIN public.pos_products prod
      ON prod.id = lr.product_id
      AND prod.brand_slug = p_brand_slug
    JOIN public.pos_product_variants variant
      ON variant.id = lr.variant_id
      AND variant.product_id = lr.product_id
      AND variant.brand_slug = p_brand_slug
    LEFT JOIN public.pos_locations location
      ON location.id = p_location_id
      AND location.brand_slug = p_brand_slug
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'productCode', product_code,
    'productName', product_name,
    'variantName', variant_name,
    'sku', sku,
    'currentAttributes', current_attributes,
    'unitsSold', units_sold,
    'netSales', net_sales,
    'historicalCogs', historical_cogs,
    'grossMargin', gross_margin,
    'grossMarginPct', gross_margin_pct,
    'currentStock', current_stock,
    'locationName', location_name
  ) ORDER BY net_sales DESC, product_name, variant_name, variant_id), '[]'::jsonb)
  INTO v_result
  FROM rows;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."pos_get_reports_export_products_v1"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_get_subscription_lifecycle"("p_brand_slug" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.pos_compute_subscription_lifecycle(p_brand_slug)
$$;


ALTER FUNCTION "public"."pos_get_subscription_lifecycle"("p_brand_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_initialize_brand_setup"("p_brand_id" "text", "p_brand_slug" "text", "p_brand_name" "text", "p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_result jsonb;
  v_subscription public.pos_subscriptions%ROWTYPE;
  v_subscription_existed boolean;
  v_pro_plan public.pos_plans%ROWTYPE;
BEGIN
  IF p_brand_slug IS NULL OR btrim(p_brand_slug) = '' THEN
    RAISE EXCEPTION 'POS_SUBSCRIPTION_BRAND_REQUIRED';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('pos_initialize_brand_setup'),
    hashtext(btrim(p_brand_slug))
  );

  SELECT EXISTS (
    SELECT 1 FROM public.pos_subscriptions
    WHERE brand_slug = btrim(p_brand_slug)
  ) INTO v_subscription_existed;

  SELECT * INTO v_pro_plan
  FROM public.pos_plans
  WHERE code = 'pro' AND active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_SUBSCRIPTION_DEFAULT_PLAN_NOT_FOUND';
  END IF;

  SELECT public.pos_initialize_brand_setup_v1a_internal(
    p_brand_id, p_brand_slug, p_brand_name, p_user_id
  ) INTO v_result;

  IF NOT v_subscription_existed THEN
    UPDATE public.pos_subscriptions
    SET plan_code = 'pro',
        list_price = v_pro_plan.list_price,
        contracted_price = v_pro_plan.list_price,
        currency = v_pro_plan.currency,
        billing_interval = v_pro_plan.billing_interval
    WHERE brand_slug = btrim(p_brand_slug)
      AND plan_code = 'pos_start'
      AND status = 'trial';
  END IF;

  SELECT * INTO v_subscription
  FROM public.pos_subscriptions
  WHERE brand_slug = btrim(p_brand_slug);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_SUBSCRIPTION_INITIALIZATION_FAILED';
  END IF;

  IF NOT v_subscription_existed THEN
    INSERT INTO public.pos_subscription_events (
      brand_id, brand_slug, subscription_id, event_type, previous_status,
      new_status, previous_price, new_price, promotion_code, notes, metadata,
      created_by
    )
    SELECT
      v_subscription.brand_id,
      v_subscription.brand_slug,
      v_subscription.id,
      'trial_started',
      NULL,
      'trial',
      NULL,
      v_subscription.contracted_price,
      v_subscription.promotion_code,
      'Cometa POS Pro trial started.',
      jsonb_build_object(
        'planCode', 'pro',
        'trialEndsAt', v_subscription.trial_ends_at,
        'trialDays', 15
      ),
      p_user_id
    WHERE v_subscription.plan_code = 'pro'
      AND v_subscription.status = 'trial'
      AND NOT EXISTS (
        SELECT 1 FROM public.pos_subscription_events event
        WHERE event.subscription_id = v_subscription.id
          AND event.event_type = 'trial_started'
      );
  END IF;

  RETURN v_result;
END
$$;


ALTER FUNCTION "public"."pos_initialize_brand_setup"("p_brand_id" "text", "p_brand_slug" "text", "p_brand_name" "text", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_initialize_brand_setup_v1a_internal"("p_brand_id" "text", "p_brand_slug" "text", "p_brand_name" "text", "p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_plan public.pos_plans%rowtype;
  v_profile public.pos_business_profiles%rowtype;
  v_branding public.pos_branding%rowtype;
  v_subscription public.pos_subscriptions%rowtype;
begin
  if nullif(trim(p_brand_id), '') is null then
    raise exception 'brand_id es obligatorio.';
  end if;

  if nullif(trim(p_brand_slug), '') is null then
    raise exception 'brand_slug es obligatorio.';
  end if;

  if nullif(trim(p_brand_name), '') is null then
    raise exception 'brand_name es obligatorio.';
  end if;

  select *
  into v_plan
  from public.pos_plans
  where code = 'pos_start'
    and active = true;

  if not found then
    raise exception 'El plan pos_start no está configurado.';
  end if;

  insert into public.pos_business_profiles (
    brand_id,
    brand_slug,
    profile_code,
    operation_mode,
    onboarding_status,
    onboarding_step,
    created_by
  )
  values (
    trim(p_brand_id),
    trim(p_brand_slug),
    'unconfigured',
    'single',
    'not_started',
    1,
    p_user_id
  )
  on conflict (brand_slug) do nothing;

  insert into public.pos_branding (
    brand_id,
    brand_slug,
    display_name,
    loyalty_program_name,
    created_by
  )
  values (
    trim(p_brand_id),
    trim(p_brand_slug),
    trim(p_brand_name),
    trim(p_brand_name) || ' Rewards',
    p_user_id
  )
  on conflict (brand_slug) do nothing;

  insert into public.pos_subscriptions (
    brand_id,
    brand_slug,
    plan_code,
    status,
    list_price,
    contracted_price,
    currency,
    billing_interval,
    price_locked,
    trial_ends_at,
    created_by
  )
  values (
    trim(p_brand_id),
    trim(p_brand_slug),
    v_plan.code,
    'trial',
    v_plan.list_price,
    v_plan.list_price,
    v_plan.currency,
    v_plan.billing_interval,
    false,
    now() + interval '15 days',
    p_user_id
  )
  on conflict (brand_slug) do nothing;

  select *
  into v_profile
  from public.pos_business_profiles
  where brand_slug = trim(p_brand_slug);

  select *
  into v_branding
  from public.pos_branding
  where brand_slug = trim(p_brand_slug);

  select *
  into v_subscription
  from public.pos_subscriptions
  where brand_slug = trim(p_brand_slug);

  return jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'branding', to_jsonb(v_branding),
    'subscription', to_jsonb(v_subscription)
  );
end;
$$;


ALTER FUNCTION "public"."pos_initialize_brand_setup_v1a_internal"("p_brand_id" "text", "p_brand_slug" "text", "p_brand_name" "text", "p_user_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_loyalty_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "program_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "tier_id" "uuid",
    "member_number" "text" NOT NULL,
    "points_balance" integer DEFAULT 0 NOT NULL,
    "lifetime_points" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_loyalty_members_lifetime_points_check" CHECK (("lifetime_points" >= 0)),
    CONSTRAINT "pos_loyalty_members_points_balance_check" CHECK (("points_balance" >= 0)),
    CONSTRAINT "pos_loyalty_members_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."pos_loyalty_members" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_loyalty_adjust_points"("p_brand_slug" "text", "p_customer_id" "uuid", "p_points" integer, "p_description" "text", "p_user_id" "uuid") RETURNS SETOF "public"."pos_loyalty_members"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_member public.pos_loyalty_members%rowtype;
  v_new_balance integer;
begin
  select member.*
  into v_member
  from public.pos_loyalty_members member
  join public.pos_loyalty_programs program
    on program.id = member.program_id
  where member.customer_id = p_customer_id
    and member.brand_slug = p_brand_slug
    and member.status = 'active'
    and program.active = true
  for update;

  if not found then
    perform *
    from public.pos_register_loyalty_member(
      p_brand_slug,
      p_customer_id,
      p_user_id
    );

    select *
    into v_member
    from public.pos_loyalty_members
    where customer_id = p_customer_id
      and brand_slug = p_brand_slug
    for update;
  end if;

  v_new_balance := v_member.points_balance + p_points;

  if v_new_balance < 0 then
    raise exception 'El ajuste dejaría un saldo de puntos negativo.';
  end if;

  update public.pos_loyalty_members
  set
    points_balance = v_new_balance,
    lifetime_points =
      greatest(
        lifetime_points + greatest(p_points, 0),
        lifetime_points
      )
  where id = v_member.id
  returning *
  into v_member;

  insert into public.pos_loyalty_transactions (
    brand_id,
    brand_slug,
    member_id,
    transaction_type,
    points,
    balance_after,
    description,
    created_by
  )
  values (
    v_member.brand_id,
    v_member.brand_slug,
    v_member.id,
    'adjust',
    p_points,
    v_member.points_balance,
    p_description,
    p_user_id
  );

  return next v_member;
end;
$$;


ALTER FUNCTION "public"."pos_loyalty_adjust_points"("p_brand_slug" "text", "p_customer_id" "uuid", "p_points" integer, "p_description" "text", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_loyalty_visit_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."pos_loyalty_visit_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_normalize_variant_attributes_v1"("p_attributes" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE STRICT
    SET "search_path" TO 'public'
    AS $$
DECLARE
  item record;
  normalized jsonb := '{}'::jsonb;
  normalized_key text;
  normalized_value text;
BEGIN
  IF jsonb_typeof(p_attributes) <> 'object' THEN
    RAISE EXCEPTION 'POS_VARIANT_ATTRIBUTES_OBJECT_REQUIRED';
  END IF;

  FOR item IN
    SELECT key, value
    FROM jsonb_each(p_attributes)
  LOOP
    normalized_key := lower(btrim(item.key));

    IF normalized_key = '' THEN
      RAISE EXCEPTION 'POS_VARIANT_ATTRIBUTE_KEY_REQUIRED';
    END IF;

    IF normalized ? normalized_key THEN
      RAISE EXCEPTION 'POS_VARIANT_ATTRIBUTE_KEY_COLLISION';
    END IF;

    IF jsonb_typeof(item.value) = 'string' THEN
      normalized_value := lower(btrim(item.value #>> '{}'));
      normalized := normalized || jsonb_build_object(normalized_key, normalized_value);
    ELSE
      normalized := normalized || jsonb_build_object(normalized_key, item.value);
    END IF;
  END LOOP;

  RETURN normalized;
END;
$$;


ALTER FUNCTION "public"."pos_normalize_variant_attributes_v1"("p_attributes" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_open_cash_session"("p_brand_slug" "text", "p_register_id" "uuid", "p_opening_amount" numeric, "p_user_id" "uuid") RETURNS SETOF "public"."pos_cash_sessions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_register public.pos_registers%rowtype;
  v_session public.pos_cash_sessions%rowtype;
begin
  if p_opening_amount < 0 then
    raise exception 'El fondo inicial no puede ser negativo.';
  end if;

  select *
  into v_register
  from public.pos_registers
  where id = p_register_id
    and brand_slug = p_brand_slug
    and status = 'available';

  if not found then
    raise exception 'La caja no existe, está deshabilitada o pertenece a otra marca.';
  end if;

  insert into public.pos_cash_sessions (
    brand_id,
    brand_slug,
    location_id,
    register_id,
    status,
    opening_amount,
    opened_by
  )
  values (
    v_register.brand_id,
    v_register.brand_slug,
    v_register.location_id,
    v_register.id,
    'open',
    round(p_opening_amount, 2),
    p_user_id
  )
  returning *
  into v_session;

  return next v_session;
end;
$$;


ALTER FUNCTION "public"."pos_open_cash_session"("p_brand_slug" "text", "p_register_id" "uuid", "p_opening_amount" numeric, "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_plan_dominates_v1"("p_candidate_plan_code" "text", "p_baseline_plan_code" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."pos_plan_dominates_v1"("p_candidate_plan_code" "text", "p_baseline_plan_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_product_variants_set_signature_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.variant_signature := public.pos_variant_signature_v1(COALESCE(NEW.attributes, '{}'::jsonb));
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."pos_product_variants_set_signature_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_profile_family"("p_profile_code" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE lower(btrim(COALESCE(p_profile_code, '')))
    WHEN 'fashion' THEN 'retail'
    WHEN 'retail' THEN 'retail'
    WHEN 'pharmacy' THEN 'retail'
    WHEN 'coffee_shop' THEN 'restaurant'
    WHEN 'restaurant' THEN 'restaurant'
    WHEN 'services' THEN 'services'
    WHEN 'mixed' THEN 'generic'
    WHEN 'unconfigured' THEN 'generic'
    ELSE 'generic'
  END
$$;


ALTER FUNCTION "public"."pos_profile_family"("p_profile_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_rbac_protect_last_owner_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."pos_rbac_protect_last_owner_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_reconcile_subscription_lifecycle"("p_brand_slug" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  s public.pos_subscriptions%ROWTYPE;
  lifecycle jsonb;
BEGIN
  IF p_brand_slug IS NULL OR btrim(p_brand_slug) = '' THEN
    RAISE EXCEPTION 'POS_SUBSCRIPTION_BRAND_REQUIRED';
  END IF;

  SELECT * INTO s
  FROM public.pos_subscriptions
  WHERE brand_slug = btrim(p_brand_slug)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_SUBSCRIPTION_NOT_FOUND';
  END IF;

  lifecycle := public.pos_compute_subscription_lifecycle(s.brand_slug);

  IF lifecycle->>'effectiveStatus' = 'trial_expired' THEN
    INSERT INTO public.pos_subscription_events (
      brand_id,
      brand_slug,
      subscription_id,
      event_type,
      previous_status,
      new_status,
      previous_price,
      new_price,
      promotion_code,
      notes,
      metadata,
      created_by
    )
    SELECT
      s.brand_id,
      s.brand_slug,
      s.id,
      'trial_expired',
      'trial',
      'trial',
      s.contracted_price,
      s.contracted_price,
      s.promotion_code,
      'Cometa POS trial expired.',
      jsonb_build_object(
        'planCode', s.plan_code,
        'trialEndsAt', s.trial_ends_at,
        'effectiveStatus', 'trial_expired'
      ),
      NULL
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.pos_subscription_events event
      WHERE event.subscription_id = s.id
        AND event.event_type = 'trial_expired'
    );
  END IF;

  RETURN lifecycle;
END
$$;


ALTER FUNCTION "public"."pos_reconcile_subscription_lifecycle"("p_brand_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_register_loyalty_member"("p_brand_slug" "text", "p_customer_id" "uuid", "p_user_id" "uuid") RETURNS SETOF "public"."pos_loyalty_members"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_program public.pos_loyalty_programs%rowtype;
  v_customer public.pos_customers%rowtype;
  v_member public.pos_loyalty_members%rowtype;
  v_member_number text;
begin
  select *
  into v_program
  from public.pos_loyalty_programs
  where brand_slug = p_brand_slug
    and active = true;

  if not found then
    raise exception 'No existe un programa de lealtad activo.';
  end if;

  select *
  into v_customer
  from public.pos_customers
  where id = p_customer_id
    and brand_slug = p_brand_slug
    and active = true;

  if not found then
    raise exception 'El cliente no existe o pertenece a otra marca.';
  end if;

  select *
  into v_member
  from public.pos_loyalty_members
  where program_id = v_program.id
    and customer_id = v_customer.id;

  if found then
    return next v_member;
    return;
  end if;

  v_member_number :=
    upper(substr(replace(p_brand_slug, '-', ''), 1, 5))
    || '-'
    || lpad(
      (
        select (count(*) + 1)::text
        from public.pos_loyalty_members
        where brand_slug = p_brand_slug
      ),
      6,
      '0'
    );

  insert into public.pos_loyalty_members (
    brand_id,
    brand_slug,
    program_id,
    customer_id,
    member_number
  )
  values (
    v_program.brand_id,
    v_program.brand_slug,
    v_program.id,
    v_customer.id,
    v_member_number
  )
  returning *
  into v_member;

  return next v_member;
end;
$$;


ALTER FUNCTION "public"."pos_register_loyalty_member"("p_brand_slug" "text", "p_customer_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_register_loyalty_member_v2"("p_brand_slug" "text", "p_customer_id" "uuid", "p_user_id" "uuid") RETURNS "public"."pos_loyalty_members"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_program public.pos_loyalty_programs%rowtype;
  v_member public.pos_loyalty_members%rowtype;
  v_tier record;
BEGIN
  PERFORM *
  FROM public.pos_register_loyalty_member(
    p_brand_slug,
    p_customer_id,
    p_user_id
  );

  SELECT * INTO v_program
  FROM public.pos_loyalty_programs
  WHERE brand_slug = p_brand_slug;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe un programa de fidelización para esta marca.';
  END IF;

  SELECT * INTO v_member
  FROM public.pos_loyalty_members
  WHERE brand_slug = p_brand_slug
    AND program_id = v_program.id
    AND customer_id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo registrar la membresía de fidelización.';
  END IF;

  SELECT * INTO v_tier
  FROM public.pos_resolve_loyalty_tier(
    p_brand_slug,
    v_program.id,
    v_member.lifetime_points
  );

  UPDATE public.pos_loyalty_members
  SET tier_id = CASE WHEN v_tier.tier_id IS NULL THEN NULL ELSE v_tier.tier_id END
  WHERE id = v_member.id
  RETURNING * INTO v_member;

  RETURN v_member;
END;
$$;


ALTER FUNCTION "public"."pos_register_loyalty_member_v2"("p_brand_slug" "text", "p_customer_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_report_summary"("p_brand_slug" "text", "p_start" timestamp with time zone, "p_end" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with filtered_sales as (
    select *
    from public.pos_sales
    where brand_slug = p_brand_slug
      and status in ('completed', 'partially_refunded')
      and sold_at >= p_start
      and sold_at <= p_end
  ),
  sale_metrics as (
    select
      coalesce(sum(total), 0)::numeric(14,2) as gross_sales,
      count(*)::integer as tickets,
      coalesce(avg(total), 0)::numeric(14,2) as average_ticket,
      count(distinct customer_id)
        filter (where customer_id is not null)::integer
        as identified_customers
    from filtered_sales
  ),
  top_product as (
    select
      item.product_name,
      sum(item.quantity)::numeric(14,3) as units,
      sum(item.line_total)::numeric(14,2) as revenue
    from public.pos_sale_items item
    join filtered_sales sale
      on sale.id = item.sale_id
    group by item.product_name
    order by units desc, revenue desc
    limit 1
  ),
  payment_breakdown as (
    select
      payment.payment_method,
      sum(payment.amount)::numeric(14,2) as amount
    from public.pos_payments payment
    join filtered_sales sale
      on sale.id = payment.sale_id
    group by payment.payment_method
  )
  select jsonb_build_object(
    'gross_sales', metrics.gross_sales,
    'tickets', metrics.tickets,
    'average_ticket', metrics.average_ticket,
    'identified_customers', metrics.identified_customers,
    'top_product', (
      select to_jsonb(product)
      from top_product product
    ),
    'payments', coalesce(
      (
        select jsonb_agg(to_jsonb(breakdown))
        from payment_breakdown breakdown
      ),
      '[]'::jsonb
    ),
    'period_start', p_start,
    'period_end', p_end
  )
  from sale_metrics metrics;
$$;


ALTER FUNCTION "public"."pos_report_summary"("p_brand_slug" "text", "p_start" timestamp with time zone, "p_end" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_reserve_user_invitation_v1"("p_brand_slug" "text", "p_email" "text", "p_access_role" "text", "p_invited_by" "uuid", "p_expires_at" timestamp with time zone, "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "public"."pos_user_invitations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."pos_reserve_user_invitation_v1"("p_brand_slug" "text", "p_email" "text", "p_access_role" "text", "p_invited_by" "uuid", "p_expires_at" timestamp with time zone, "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_resolve_loyalty_tier"("p_brand_slug" "text", "p_program_id" "uuid", "p_lifetime_points" integer) RETURNS TABLE("tier_id" "uuid", "name" "text", "minimum_lifetime_points" integer, "points_multiplier" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    tier.id,
    tier.name,
    tier.minimum_lifetime_points,
    tier.points_multiplier
  FROM public.pos_loyalty_tiers tier
  WHERE tier.brand_slug = p_brand_slug
    AND tier.program_id = p_program_id
    AND tier.active = true
    AND tier.minimum_lifetime_points <= GREATEST(COALESCE(p_lifetime_points, 0), 0)
  ORDER BY tier.minimum_lifetime_points DESC, tier.sort_order DESC, tier.id
  LIMIT 1;
$$;


ALTER FUNCTION "public"."pos_resolve_loyalty_tier"("p_brand_slug" "text", "p_program_id" "uuid", "p_lifetime_points" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_revoke_brand_membership_v1"("p_brand_slug" "text", "p_target_user_id" "uuid", "p_actor_user_id" "uuid") RETURNS "public"."user_brand_access"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."pos_revoke_brand_membership_v1"("p_brand_slug" "text", "p_target_user_id" "uuid", "p_actor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_revoke_user_invitation_v1"("p_brand_slug" "text", "p_invitation_id" "uuid", "p_actor_user_id" "uuid") RETURNS "public"."pos_user_invitations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."pos_revoke_user_invitation_v1"("p_brand_slug" "text", "p_invitation_id" "uuid", "p_actor_user_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_branding" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "logo_url" "text",
    "cover_image_url" "text",
    "primary_color" "text" DEFAULT '#67E8F9'::"text" NOT NULL,
    "secondary_color" "text" DEFAULT '#06111F'::"text" NOT NULL,
    "accent_color" "text" DEFAULT '#34D399'::"text" NOT NULL,
    "text_color" "text" DEFAULT '#FFFFFF'::"text" NOT NULL,
    "loyalty_program_name" "text" DEFAULT 'Mi Club'::"text" NOT NULL,
    "loyalty_message" "text" DEFAULT 'Cada compra te acerca a tu próxima recompensa.'::"text" NOT NULL,
    "whatsapp" "text",
    "website" "text",
    "ticket_footer" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "legal_name" "text",
    "tax_id" "text",
    "phone" "text",
    "email" "text",
    "instagram" "text",
    "facebook" "text",
    "tiktok" "text",
    "receipt_message" "text",
    "return_policy" "text",
    CONSTRAINT "pos_branding_accent_color_check" CHECK (("accent_color" ~ '^#[0-9A-Fa-f]{6}$'::"text")),
    CONSTRAINT "pos_branding_personalization_lengths_ck" CHECK (((("legal_name" IS NULL) OR ("char_length"("legal_name") <= 180)) AND (("tax_id" IS NULL) OR ("char_length"("tax_id") <= 40)) AND (("phone" IS NULL) OR ("char_length"("phone") <= 40)) AND (("email" IS NULL) OR ("char_length"("email") <= 180)) AND (("instagram" IS NULL) OR ("char_length"("instagram") <= 300)) AND (("facebook" IS NULL) OR ("char_length"("facebook") <= 300)) AND (("tiktok" IS NULL) OR ("char_length"("tiktok") <= 300)) AND (("receipt_message" IS NULL) OR ("char_length"("receipt_message") <= 240)) AND (("return_policy" IS NULL) OR ("char_length"("return_policy") <= 1000)))),
    CONSTRAINT "pos_branding_primary_color_check" CHECK (("primary_color" ~ '^#[0-9A-Fa-f]{6}$'::"text")),
    CONSTRAINT "pos_branding_secondary_color_check" CHECK (("secondary_color" ~ '^#[0-9A-Fa-f]{6}$'::"text")),
    CONSTRAINT "pos_branding_text_color_check" CHECK (("text_color" ~ '^#[0-9A-Fa-f]{6}$'::"text"))
);


ALTER TABLE "public"."pos_branding" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_save_branding"("p_brand_id" "text", "p_brand_slug" "text", "p_display_name" "text", "p_logo_url" "text", "p_cover_image_url" "text", "p_primary_color" "text", "p_secondary_color" "text", "p_accent_color" "text", "p_text_color" "text", "p_loyalty_program_name" "text", "p_loyalty_message" "text", "p_whatsapp" "text", "p_website" "text", "p_ticket_footer" "text", "p_user_id" "uuid") RETURNS SETOF "public"."pos_branding"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_branding public.pos_branding%rowtype;
begin
  if nullif(trim(p_brand_id), '') is null then
    raise exception 'brand_id es obligatorio.';
  end if;

  if nullif(trim(p_brand_slug), '') is null then
    raise exception 'brand_slug es obligatorio.';
  end if;

  if nullif(trim(p_display_name), '') is null then
    raise exception 'display_name es obligatorio.';
  end if;

  if nullif(trim(p_loyalty_program_name), '') is null then
    raise exception 'loyalty_program_name es obligatorio.';
  end if;

  if nullif(trim(p_loyalty_message), '') is null then
    raise exception 'loyalty_message es obligatorio.';
  end if;

  if trim(p_primary_color) !~ '^#[0-9A-Fa-f]{6}$'
     or trim(p_secondary_color) !~ '^#[0-9A-Fa-f]{6}$'
     or trim(p_accent_color) !~ '^#[0-9A-Fa-f]{6}$'
     or trim(p_text_color) !~ '^#[0-9A-Fa-f]{6}$'
  then
    raise exception 'Los colores deben usar el formato hexadecimal #RRGGBB.';
  end if;

  insert into public.pos_branding (
    brand_id,
    brand_slug,
    display_name,
    logo_url,
    cover_image_url,
    primary_color,
    secondary_color,
    accent_color,
    text_color,
    loyalty_program_name,
    loyalty_message,
    whatsapp,
    website,
    ticket_footer,
    created_by
  )
  values (
    trim(p_brand_id),
    trim(p_brand_slug),
    trim(p_display_name),
    nullif(trim(p_logo_url), ''),
    nullif(trim(p_cover_image_url), ''),
    upper(trim(p_primary_color)),
    upper(trim(p_secondary_color)),
    upper(trim(p_accent_color)),
    upper(trim(p_text_color)),
    trim(p_loyalty_program_name),
    trim(p_loyalty_message),
    nullif(trim(p_whatsapp), ''),
    nullif(trim(p_website), ''),
    nullif(trim(p_ticket_footer), ''),
    p_user_id
  )
  on conflict (brand_slug) do update
  set
    brand_id = excluded.brand_id,
    display_name = excluded.display_name,
    logo_url = excluded.logo_url,
    cover_image_url = excluded.cover_image_url,
    primary_color = excluded.primary_color,
    secondary_color = excluded.secondary_color,
    accent_color = excluded.accent_color,
    text_color = excluded.text_color,
    loyalty_program_name = excluded.loyalty_program_name,
    loyalty_message = excluded.loyalty_message,
    whatsapp = excluded.whatsapp,
    website = excluded.website,
    ticket_footer = excluded.ticket_footer
  returning *
  into v_branding;

  update public.pos_business_profiles
  set
    onboarding_status =
      case
        when onboarding_status = 'completed'
          then 'completed'
        else 'in_progress'
      end,
    onboarding_step = greatest(onboarding_step, 3)
  where brand_slug = trim(p_brand_slug);

  return next v_branding;
end;
$_$;


ALTER FUNCTION "public"."pos_save_branding"("p_brand_id" "text", "p_brand_slug" "text", "p_display_name" "text", "p_logo_url" "text", "p_cover_image_url" "text", "p_primary_color" "text", "p_secondary_color" "text", "p_accent_color" "text", "p_text_color" "text", "p_loyalty_program_name" "text", "p_loyalty_message" "text", "p_whatsapp" "text", "p_website" "text", "p_ticket_footer" "text", "p_user_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_brand_entitlement_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "entitlement_id" "uuid" NOT NULL,
    "enabled" boolean NOT NULL,
    "reason" "text",
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_brand_entitlement_overrides_slug_ck" CHECK (("btrim"("brand_slug") <> ''::"text")),
    CONSTRAINT "pos_brand_entitlement_overrides_window_ck" CHECK ((("ends_at" IS NULL) OR ("starts_at" IS NULL) OR ("ends_at" > "starts_at")))
);


ALTER TABLE "public"."pos_brand_entitlement_overrides" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_set_brand_entitlement_override"("p_brand_slug" "text", "p_entitlement_code" "text", "p_enabled" boolean, "p_reason" "text" DEFAULT NULL::"text", "p_starts_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_ends_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "public"."pos_brand_entitlement_overrides"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE s public.pos_subscriptions%ROWTYPE;e public.pos_entitlements%ROWTYPE;o public.pos_brand_entitlement_overrides%ROWTYPE;
BEGIN
 IF p_brand_slug IS NULL OR btrim(p_brand_slug)='' THEN RAISE EXCEPTION 'POS_ENTITLEMENTS_BRAND_REQUIRED';END IF;
 IF p_entitlement_code IS NULL OR btrim(p_entitlement_code)='' THEN RAISE EXCEPTION 'POS_ENTITLEMENTS_CODE_REQUIRED';END IF;
 IF p_enabled IS NULL THEN RAISE EXCEPTION 'POS_ENTITLEMENTS_OVERRIDE_ENABLED_REQUIRED';END IF;
 IF p_ends_at IS NOT NULL AND p_starts_at IS NOT NULL AND p_ends_at<=p_starts_at THEN RAISE EXCEPTION 'POS_ENTITLEMENTS_OVERRIDE_WINDOW_INVALID';END IF;
 SELECT * INTO s FROM public.pos_subscriptions WHERE brand_slug=btrim(p_brand_slug);IF NOT FOUND THEN RAISE EXCEPTION 'POS_ENTITLEMENTS_SUBSCRIPTION_NOT_FOUND';END IF;
 SELECT * INTO e FROM public.pos_entitlements WHERE code=btrim(p_entitlement_code);IF NOT FOUND THEN RAISE EXCEPTION 'POS_ENTITLEMENTS_CODE_NOT_FOUND';END IF;
 INSERT INTO public.pos_brand_entitlement_overrides(brand_id,brand_slug,entitlement_id,enabled,reason,starts_at,ends_at,created_by)
 VALUES(s.brand_id,s.brand_slug,e.id,p_enabled,p_reason,p_starts_at,p_ends_at,p_user_id)RETURNING * INTO o;RETURN o;
END $$;


ALTER FUNCTION "public"."pos_set_brand_entitlement_override"("p_brand_slug" "text", "p_entitlement_code" "text", "p_enabled" boolean, "p_reason" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_set_loyalty_tier_active"("p_brand_slug" "text", "p_tier_id" "uuid", "p_active" boolean) RETURNS "public"."pos_loyalty_tiers"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tier public.pos_loyalty_tiers%rowtype;
BEGIN
  IF p_active IS NULL THEN RAISE EXCEPTION 'El estado del nivel es obligatorio.'; END IF;
  UPDATE public.pos_loyalty_tiers tier
  SET active = p_active
  WHERE tier.id = p_tier_id
    AND tier.brand_slug = p_brand_slug
    AND EXISTS (
      SELECT 1 FROM public.pos_loyalty_programs program
      WHERE program.id = tier.program_id AND program.brand_slug = p_brand_slug
    )
  RETURNING * INTO v_tier;
  IF NOT FOUND THEN RAISE EXCEPTION 'El nivel no existe o pertenece a otra marca.'; END IF;
  UPDATE public.pos_loyalty_members member
  SET tier_id = (
    SELECT resolved.tier_id FROM public.pos_resolve_loyalty_tier(
      member.brand_slug, member.program_id, member.lifetime_points
    ) resolved
  )
  WHERE member.program_id = v_tier.program_id;
  RETURN v_tier;
END;
$$;


ALTER FUNCTION "public"."pos_set_loyalty_tier_active"("p_brand_slug" "text", "p_tier_id" "uuid", "p_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_set_loyalty_visit_program_active"("p_brand_slug" "text", "p_visit_program_id" "uuid", "p_active" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_visit public.pos_loyalty_visit_programs%rowtype;
BEGIN
  IF p_active IS NULL THEN RAISE EXCEPTION 'El estado del programa es obligatorio.'; END IF;
  UPDATE public.pos_loyalty_visit_programs SET active = p_active
  WHERE id = p_visit_program_id AND brand_slug = p_brand_slug RETURNING * INTO v_visit;
  IF NOT FOUND THEN RAISE EXCEPTION 'El programa de visitas no existe o pertenece a otra marca.'; END IF;
  RETURN jsonb_build_object('id', v_visit.id, 'active', v_visit.active, 'updatedAt', v_visit.updated_at);
END;
$$;


ALTER FUNCTION "public"."pos_set_loyalty_visit_program_active"("p_brand_slug" "text", "p_visit_program_id" "uuid", "p_active" boolean) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "plan_code" "text" DEFAULT 'pos_start'::"text" NOT NULL,
    "status" "text" DEFAULT 'trial'::"text" NOT NULL,
    "list_price" numeric(14,2) NOT NULL,
    "contracted_price" numeric(14,2) NOT NULL,
    "currency" "text" DEFAULT 'MXN'::"text" NOT NULL,
    "billing_interval" "text" DEFAULT 'month'::"text" NOT NULL,
    "price_locked" boolean DEFAULT false NOT NULL,
    "promotion_code" "text",
    "trial_ends_at" timestamp with time zone,
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "grace_ends_at" timestamp with time zone,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cancelled_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "stripe_price_id" "text",
    "stripe_cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "stripe_livemode" boolean,
    CONSTRAINT "pos_subscriptions_billing_interval_check" CHECK (("billing_interval" = ANY (ARRAY['month'::"text", 'year'::"text"]))),
    CONSTRAINT "pos_subscriptions_contracted_price_check" CHECK (("contracted_price" >= (0)::numeric)),
    CONSTRAINT "pos_subscriptions_list_price_check" CHECK (("list_price" >= (0)::numeric)),
    CONSTRAINT "pos_subscriptions_status_check" CHECK (("status" = ANY (ARRAY['trial'::"text", 'active'::"text", 'past_due'::"text", 'grace_period'::"text", 'suspended'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."pos_subscriptions" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_set_subscription_offer"("p_brand_slug" "text", "p_contract_price" numeric, "p_promotion_code" "text", "p_price_locked" boolean, "p_status" "text", "p_user_id" "uuid") RETURNS SETOF "public"."pos_subscriptions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_subscription public.pos_subscriptions%rowtype;
  v_previous_price numeric(14,2);
  v_previous_status text;
  v_requested_status text;
begin
  if nullif(trim(p_brand_slug), '') is null then
    raise exception 'brand_slug es obligatorio.';
  end if;

  if p_contract_price is null or p_contract_price < 0 then
    raise exception 'El precio contratado no puede ser negativo.';
  end if;

  v_requested_status := lower(trim(coalesce(p_status, 'active')));

  if v_requested_status not in (
    'trial',
    'active',
    'past_due',
    'grace_period',
    'suspended',
    'cancelled'
  ) then
    raise exception 'Estado de suscripción inválido.';
  end if;

  select *
  into v_subscription
  from public.pos_subscriptions
  where brand_slug = trim(p_brand_slug)
  for update;

  if not found then
    raise exception 'La suscripción todavía no existe.';
  end if;

  v_previous_price := v_subscription.contracted_price;
  v_previous_status := v_subscription.status;

  update public.pos_subscriptions
  set
    contracted_price = round(p_contract_price, 2),
    promotion_code = nullif(trim(p_promotion_code), ''),
    price_locked = coalesce(p_price_locked, false),
    status = v_requested_status,

    current_period_start =
      case
        when v_requested_status = 'active'
             and current_period_start is null
          then now()
        else current_period_start
      end,

    current_period_end =
      case
        when v_requested_status = 'active'
             and current_period_end is null
          then now() + interval '1 month'
        else current_period_end
      end,

    cancelled_at =
      case
        when v_requested_status = 'cancelled'
          then coalesce(cancelled_at, now())
        else null
      end
  where id = v_subscription.id
  returning *
  into v_subscription;

  insert into public.pos_subscription_events (
    brand_id,
    brand_slug,
    subscription_id,
    event_type,
    previous_status,
    new_status,
    previous_price,
    new_price,
    promotion_code,
    created_by
  )
  values (
    v_subscription.brand_id,
    v_subscription.brand_slug,
    v_subscription.id,
    'offer_updated',
    v_previous_status,
    v_subscription.status,
    v_previous_price,
    v_subscription.contracted_price,
    v_subscription.promotion_code,
    p_user_id
  );

  return next v_subscription;
end;
$$;


ALTER FUNCTION "public"."pos_set_subscription_offer"("p_brand_slug" "text", "p_contract_price" numeric, "p_promotion_code" "text", "p_price_locked" boolean, "p_status" "text", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_set_subscription_plan"("p_brand_slug" "text", "p_plan_code" "text", "p_user_id" "uuid") RETURNS SETOF "public"."pos_subscriptions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE s public.pos_subscriptions%ROWTYPE;previous_plan text;
BEGIN
 IF p_brand_slug IS NULL OR btrim(p_brand_slug)='' THEN RAISE EXCEPTION 'POS_SUBSCRIPTION_BRAND_REQUIRED';END IF;
 IF p_plan_code IS NULL OR btrim(p_plan_code)='' THEN RAISE EXCEPTION 'POS_SUBSCRIPTION_PLAN_REQUIRED';END IF;
 PERFORM 1 FROM public.pos_plans WHERE code=btrim(p_plan_code)AND active;IF NOT FOUND THEN RAISE EXCEPTION 'POS_SUBSCRIPTION_PLAN_INVALID';END IF;
 SELECT * INTO s FROM public.pos_subscriptions WHERE brand_slug=btrim(p_brand_slug)FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'POS_SUBSCRIPTION_NOT_FOUND';END IF;
 previous_plan:=s.plan_code;IF previous_plan=btrim(p_plan_code)THEN RETURN NEXT s;RETURN;END IF;
 UPDATE public.pos_subscriptions SET plan_code=btrim(p_plan_code)WHERE id=s.id RETURNING * INTO s;
 INSERT INTO public.pos_subscription_events(brand_id,brand_slug,subscription_id,event_type,previous_status,new_status,previous_price,new_price,promotion_code,notes,metadata,created_by)
 VALUES(s.brand_id,s.brand_slug,s.id,'plan_changed',s.status,s.status,s.contracted_price,s.contracted_price,s.promotion_code,'Subscription plan changed.',
 jsonb_build_object('previousPlanCode',previous_plan,'newPlanCode',s.plan_code),p_user_id);
 RETURN NEXT s;
END $$;


ALTER FUNCTION "public"."pos_set_subscription_plan"("p_brand_slug" "text", "p_plan_code" "text", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."pos_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_signal_rule_config"("p_brand_slug" "text", "p_signal_type" "text", "p_defaults" "jsonb") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
 SELECT CASE WHEN c.enabled IS FALSE THEN NULL ELSE p_defaults||COALESCE(c.config,'{}') END
 FROM (SELECT 1) seed LEFT JOIN public.pos_signal_rule_configs c ON c.brand_slug=p_brand_slug AND c.signal_type=p_signal_type
$$;


ALTER FUNCTION "public"."pos_signal_rule_config"("p_brand_slug" "text", "p_signal_type" "text", "p_defaults" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_signals_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN NEW.updated_at=now(); RETURN NEW; END $$;


ALTER FUNCTION "public"."pos_signals_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_sync_product_attributes_from_profile"("p_brand_id" "text", "p_brand_slug" "text", "p_profile_code" "text", "p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_attribute
    public.pos_profile_attribute_defaults%rowtype;
  v_inserted integer := 0;
  v_updated integer := 0;
begin
  if nullif(trim(p_brand_id), '') is null then
    raise exception 'brand_id es obligatorio.';
  end if;

  if nullif(trim(p_brand_slug), '') is null then
    raise exception 'brand_slug es obligatorio.';
  end if;

  if nullif(trim(p_profile_code), '') is null then
    raise exception 'profile_code es obligatorio.';
  end if;

  if not exists (
    select 1
    from public.pos_profile_catalog profile
    where profile.code = trim(p_profile_code)
  ) then
    raise exception 'El perfil indicado no existe.';
  end if;

  for v_attribute in
    select *
    from public.pos_profile_attribute_defaults
    where profile_code = trim(p_profile_code)
    order by sort_order, code
  loop
    if exists (
      select 1
      from public.pos_product_attribute_definitions definition
      where definition.brand_slug = trim(p_brand_slug)
        and definition.code = v_attribute.code
    ) then
      update public.pos_product_attribute_definitions
      set
        name = v_attribute.name,
        input_type = v_attribute.input_type,
        options = v_attribute.options,
        required = v_attribute.required,
        use_in_variant_name =
          v_attribute.use_in_variant_name,
        source =
          case
            when source = 'manual'
              then 'manual'
            else 'template'
          end,
        source_profile_code =
          case
            when source = 'manual'
              then source_profile_code
            else trim(p_profile_code)
          end,
        sort_order = v_attribute.sort_order,
        active = true
      where brand_slug = trim(p_brand_slug)
        and code = v_attribute.code;

      v_updated := v_updated + 1;
    else
      insert into public.pos_product_attribute_definitions (
        brand_id,
        brand_slug,
        code,
        name,
        input_type,
        options,
        required,
        use_in_variant_name,
        source,
        source_profile_code,
        sort_order,
        active,
        created_by
      )
      values (
        trim(p_brand_id),
        trim(p_brand_slug),
        v_attribute.code,
        v_attribute.name,
        v_attribute.input_type,
        v_attribute.options,
        v_attribute.required,
        v_attribute.use_in_variant_name,
        'template',
        trim(p_profile_code),
        v_attribute.sort_order,
        true,
        p_user_id
      );

      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'profileCode',
    trim(p_profile_code),
    'inserted',
    v_inserted,
    'updated',
    v_updated
  );
end;
$$;


ALTER FUNCTION "public"."pos_sync_product_attributes_from_profile"("p_brand_id" "text", "p_brand_slug" "text", "p_profile_code" "text", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_transition_subscription_status"("p_brand_slug" "text", "p_new_status" "text", "p_reason" "text" DEFAULT NULL::"text", "p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS SETOF "public"."pos_subscriptions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  s public.pos_subscriptions%ROWTYPE;
  v_previous_status text;
  v_new_status text := lower(btrim(COALESCE(p_new_status, '')));
  v_event_type text;
BEGIN
  IF p_brand_slug IS NULL OR btrim(p_brand_slug) = '' THEN
    RAISE EXCEPTION 'POS_SUBSCRIPTION_BRAND_REQUIRED';
  END IF;

  IF v_new_status NOT IN (
    'trial', 'active', 'past_due', 'grace_period', 'suspended', 'cancelled'
  ) THEN
    RAISE EXCEPTION 'POS_SUBSCRIPTION_STATUS_INVALID';
  END IF;

  SELECT * INTO s
  FROM public.pos_subscriptions
  WHERE brand_slug = btrim(p_brand_slug)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_SUBSCRIPTION_NOT_FOUND';
  END IF;

  v_previous_status := s.status;
  IF v_previous_status = v_new_status THEN
    RETURN NEXT s;
    RETURN;
  END IF;

  IF NOT (
    (v_previous_status = 'trial' AND v_new_status IN ('active', 'suspended', 'cancelled'))
    OR (v_previous_status = 'active' AND v_new_status IN ('past_due', 'suspended', 'cancelled'))
    OR (v_previous_status = 'past_due' AND v_new_status IN ('grace_period', 'active', 'suspended', 'cancelled'))
    OR (v_previous_status = 'grace_period' AND v_new_status IN ('active', 'suspended', 'cancelled'))
    OR (v_previous_status = 'suspended' AND v_new_status IN ('active', 'cancelled'))
  ) THEN
    RAISE EXCEPTION 'POS_SUBSCRIPTION_TRANSITION_INVALID_%_TO_%', v_previous_status, v_new_status;
  END IF;

  v_event_type := CASE
    WHEN v_new_status = 'active' AND v_previous_status = 'trial' THEN 'activated'
    WHEN v_new_status = 'active' THEN 'reactivated'
    WHEN v_new_status = 'grace_period' THEN 'grace_started'
    WHEN v_new_status = 'suspended' THEN 'suspended'
    WHEN v_new_status = 'cancelled' THEN 'cancelled'
    ELSE NULL
  END;

  UPDATE public.pos_subscriptions
  SET
    status = v_new_status,
    current_period_start = CASE
      WHEN v_new_status = 'active' THEN COALESCE(current_period_start, now())
      ELSE current_period_start
    END,
    current_period_end = CASE
      WHEN v_new_status = 'active' THEN COALESCE(current_period_end, now() + interval '1 month')
      ELSE current_period_end
    END,
    grace_ends_at = CASE
      WHEN v_new_status = 'grace_period' THEN COALESCE(grace_ends_at, now() + interval '3 days')
      ELSE grace_ends_at
    END,
    cancelled_at = CASE
      WHEN v_new_status = 'active' THEN NULL
      WHEN v_new_status = 'cancelled' THEN COALESCE(cancelled_at, now())
      ELSE cancelled_at
    END
  WHERE id = s.id
  RETURNING * INTO s;

  IF v_event_type IS NOT NULL THEN
    INSERT INTO public.pos_subscription_events (
      brand_id,
      brand_slug,
      subscription_id,
      event_type,
      previous_status,
      new_status,
      previous_price,
      new_price,
      promotion_code,
      notes,
      metadata,
      created_by
    ) VALUES (
      s.brand_id,
      s.brand_slug,
      s.id,
      v_event_type,
      v_previous_status,
      s.status,
      s.contracted_price,
      s.contracted_price,
      s.promotion_code,
      p_reason,
      jsonb_build_object(
        'previousStatus', v_previous_status,
        'newStatus', s.status,
        'reason', p_reason
      ),
      p_user_id
    );
  END IF;

  RETURN NEXT s;
END
$$;


ALTER FUNCTION "public"."pos_transition_subscription_status"("p_brand_slug" "text", "p_new_status" "text", "p_reason" "text", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_update_loyalty_tier"("p_brand_slug" "text", "p_tier_id" "uuid", "p_name" "text", "p_minimum_lifetime_points" integer, "p_points_multiplier" numeric, "p_sort_order" integer, "p_active" boolean) RETURNS "public"."pos_loyalty_tiers"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tier public.pos_loyalty_tiers%rowtype;
BEGIN
  IF NULLIF(trim(p_name), '') IS NULL THEN RAISE EXCEPTION 'El nombre del nivel es obligatorio.'; END IF;
  IF p_minimum_lifetime_points IS NULL OR p_minimum_lifetime_points < 0 THEN RAISE EXCEPTION 'Los puntos históricos mínimos deben ser cero o mayores.'; END IF;
  IF p_points_multiplier IS NULL OR p_points_multiplier <= 0 THEN RAISE EXCEPTION 'El multiplicador debe ser mayor que cero.'; END IF;

  UPDATE public.pos_loyalty_tiers tier
  SET name = trim(p_name),
      minimum_lifetime_points = p_minimum_lifetime_points,
      points_multiplier = p_points_multiplier,
      sort_order = COALESCE(p_sort_order, tier.sort_order),
      active = COALESCE(p_active, tier.active)
  WHERE tier.id = p_tier_id
    AND tier.brand_slug = p_brand_slug
    AND EXISTS (
      SELECT 1 FROM public.pos_loyalty_programs program
      WHERE program.id = tier.program_id AND program.brand_slug = p_brand_slug
    )
  RETURNING * INTO v_tier;
  IF NOT FOUND THEN RAISE EXCEPTION 'El nivel no existe o pertenece a otra marca.'; END IF;
  UPDATE public.pos_loyalty_members member
  SET tier_id = (
    SELECT resolved.tier_id FROM public.pos_resolve_loyalty_tier(
      member.brand_slug, member.program_id, member.lifetime_points
    ) resolved
  )
  WHERE member.program_id = v_tier.program_id;
  RETURN v_tier;
END;
$$;


ALTER FUNCTION "public"."pos_update_loyalty_tier"("p_brand_slug" "text", "p_tier_id" "uuid", "p_name" "text", "p_minimum_lifetime_points" integer, "p_points_multiplier" numeric, "p_sort_order" integer, "p_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_update_loyalty_visit_program"("p_brand_slug" "text", "p_visit_program_id" "uuid", "p_name" "text", "p_required_visits" integer, "p_minimum_sale_amount" numeric, "p_reward_id" "uuid", "p_active" boolean, "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_visit public.pos_loyalty_visit_programs%rowtype;
  v_reward public.pos_loyalty_rewards%rowtype;
  v_has_events boolean;
BEGIN
  IF NULLIF(trim(p_name), '') IS NULL THEN RAISE EXCEPTION 'El nombre del programa de visitas es obligatorio.'; END IF;
  IF p_required_visits IS NULL OR p_required_visits <= 0 THEN RAISE EXCEPTION 'La meta de visitas debe ser mayor que cero.'; END IF;
  IF p_minimum_sale_amount IS NULL OR p_minimum_sale_amount < 0 THEN RAISE EXCEPTION 'La compra mínima no puede ser negativa.'; END IF;
  IF p_ends_at IS NOT NULL AND p_starts_at IS NOT NULL AND p_ends_at <= p_starts_at THEN RAISE EXCEPTION 'La fecha final debe ser posterior a la inicial.'; END IF;
  SELECT * INTO v_visit FROM public.pos_loyalty_visit_programs
  WHERE id = p_visit_program_id AND brand_slug = p_brand_slug FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El programa de visitas no existe o pertenece a otra marca.'; END IF;
  SELECT * INTO v_reward FROM public.pos_loyalty_rewards
  WHERE id = p_reward_id AND brand_slug = p_brand_slug AND brand_id = v_visit.brand_id
    AND program_id = v_visit.loyalty_program_id AND active = true AND reward_type = 'discount_fixed';
  IF NOT FOUND THEN RAISE EXCEPTION 'La recompensa no existe, no está activa, pertenece a otra marca o no es de descuento fijo.'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.pos_loyalty_visit_events WHERE visit_program_id = v_visit.id) INTO v_has_events;
  IF v_has_events AND (
    v_visit.required_visits IS DISTINCT FROM p_required_visits
    OR v_visit.minimum_sale_amount IS DISTINCT FROM round(p_minimum_sale_amount, 2)
    OR v_visit.reward_id IS DISTINCT FROM p_reward_id
  ) THEN RAISE EXCEPTION 'La mecánica de un programa con visitas registradas no puede modificarse. Desactívalo y crea uno nuevo.'; END IF;
  UPDATE public.pos_loyalty_visit_programs SET
    name = trim(p_name), required_visits = p_required_visits,
    minimum_sale_amount = round(p_minimum_sale_amount, 2), reward_id = p_reward_id,
    active = p_active, starts_at = p_starts_at, ends_at = p_ends_at
  WHERE id = v_visit.id RETURNING * INTO v_visit;
  RETURN jsonb_build_object(
    'id', v_visit.id, 'name', v_visit.name, 'requiredVisits', v_visit.required_visits,
    'minimumSaleAmount', v_visit.minimum_sale_amount, 'rewardId', v_visit.reward_id,
    'active', v_visit.active, 'startsAt', v_visit.starts_at, 'endsAt', v_visit.ends_at,
    'createdAt', v_visit.created_at, 'updatedAt', v_visit.updated_at
  );
END;
$$;


ALTER FUNCTION "public"."pos_update_loyalty_visit_program"("p_brand_slug" "text", "p_visit_program_id" "uuid", "p_name" "text", "p_required_visits" integer, "p_minimum_sale_amount" numeric, "p_reward_id" "uuid", "p_active" boolean, "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_update_product_v2"("p_brand_id" "text", "p_brand_slug" "text", "p_product_id" "uuid", "p_category_id" "uuid", "p_name" "text", "p_description" "text", "p_product_type" "text", "p_inventory_mode" "text", "p_default_unit_code" "text", "p_has_variants" boolean, "p_sellable" boolean, "p_purchasable" boolean, "p_tax_rate" numeric, "p_image_url" "text", "p_configuration" "jsonb", "p_variants" "jsonb", "p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_product public.pos_products%ROWTYPE;
  v_variant jsonb;
  v_variant_id uuid;
  v_default_variant_id uuid;
  v_name text;
  v_sku text;
  v_barcode text;
  v_active boolean;
  v_created_variant_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NULLIF(trim(p_brand_slug), '') IS NULL THEN
    RAISE EXCEPTION 'La marca es obligatoria.';
  END IF;

  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'El producto es obligatorio.';
  END IF;

  IF NULLIF(trim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'El nombre del producto es obligatorio.';
  END IF;

  IF p_inventory_mode NOT IN ('direct', 'none') THEN
    RAISE EXCEPTION 'El modo de inventario no es válido.';
  END IF;

  IF p_tax_rate IS NULL OR p_tax_rate < 0 OR p_tax_rate > 100 THEN
    RAISE EXCEPTION 'La tasa de impuesto no es válida.';
  END IF;

  IF jsonb_typeof(p_variants) <> 'array'
     OR jsonb_array_length(p_variants) = 0 THEN
    RAISE EXCEPTION 'El producto debe contener al menos una variante.';
  END IF;

  SELECT *
  INTO v_product
  FROM public.pos_products
  WHERE id = p_product_id
    AND brand_id = p_brand_id
    AND brand_slug = p_brand_slug
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El producto no existe o pertenece a otra marca.';
  END IF;

  IF p_category_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.pos_categories
       WHERE id = p_category_id
         AND brand_slug = p_brand_slug
     ) THEN
    RAISE EXCEPTION 'La categoría no existe o pertenece a otra marca.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_variants) item
    WHERE NULLIF(item ->> 'id', '') IS NOT NULL
      AND (item ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION 'El identificador de una variante no es válido.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_variants) item
    WHERE NULLIF(item ->> 'id', '') IS NOT NULL
    GROUP BY item ->> 'id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'El payload contiene variantes duplicadas.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_variants) item
    LEFT JOIN public.pos_product_variants variant
      ON variant.id = (item ->> 'id')::uuid
     AND variant.product_id = p_product_id
     AND variant.brand_id = p_brand_id
     AND variant.brand_slug = p_brand_slug
    WHERE NULLIF(item ->> 'id', '') IS NOT NULL
      AND variant.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Una variante no existe o pertenece a otro producto o marca.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_variants) item
    WHERE COALESCE((item ->> 'active')::boolean, true) = true
  ) THEN
    RAISE EXCEPTION 'El producto debe conservar al menos una variante activa.';
  END IF;

  UPDATE public.pos_products
  SET
    category_id = p_category_id,
    name = trim(p_name),
    description = p_description,
    product_type = p_product_type,
    inventory_mode = p_inventory_mode,
    track_inventory = p_inventory_mode = 'direct',
    default_unit_code = p_default_unit_code,
    has_variants = p_has_variants,
    sellable = p_sellable,
    purchasable = p_purchasable,
    tax_rate = p_tax_rate,
    image_url = p_image_url,
    configuration = COALESCE(p_configuration, '{}'::jsonb),
    updated_at = now()
  WHERE id = p_product_id
    AND brand_id = p_brand_id
    AND brand_slug = p_brand_slug;

  -- Compatibilidad: una variante existente omitida se retira, nunca se borra.
  UPDATE public.pos_product_variants existing
  SET
    active = false,
    is_default = false,
    updated_at = now()
  WHERE existing.product_id = p_product_id
    AND existing.brand_id = p_brand_id
    AND existing.brand_slug = p_brand_slug
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_variants) item
      WHERE NULLIF(item ->> 'id', '') IS NOT NULL
        AND (item ->> 'id')::uuid = existing.id
    );

  FOR v_variant IN
    SELECT value
    FROM jsonb_array_elements(p_variants)
  LOOP
    v_variant_id := NULLIF(v_variant ->> 'id', '')::uuid;
    v_name := NULLIF(trim(v_variant ->> 'name'), '');
    v_sku := NULLIF(trim(v_variant ->> 'sku'), '');
    v_barcode := NULLIF(trim(v_variant ->> 'barcode'), '');
    v_active := COALESCE((v_variant ->> 'active')::boolean, true);

    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Cada variante necesita un nombre.';
    END IF;

    IF COALESCE((v_variant ->> 'price')::numeric, 0) < 0 THEN
      RAISE EXCEPTION 'El precio de una variante no puede ser negativo.';
    END IF;

    IF COALESCE((v_variant ->> 'cost')::numeric, 0) < 0 THEN
      RAISE EXCEPTION 'El costo de una variante no puede ser negativo.';
    END IF;

    IF v_sku IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM public.pos_product_variants existing
         WHERE existing.brand_slug = p_brand_slug
           AND lower(existing.sku) = lower(v_sku)
           AND existing.id <> COALESCE(v_variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
       ) THEN
      RAISE EXCEPTION 'Ya existe una variante con ese SKU.';
    END IF;

    IF v_barcode IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM public.pos_product_variants existing
         WHERE existing.brand_slug = p_brand_slug
           AND existing.barcode = v_barcode
           AND existing.id <> COALESCE(v_variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
       ) THEN
      RAISE EXCEPTION 'Ya existe una variante con ese código de barras.';
    END IF;

    IF v_variant_id IS NOT NULL THEN
      UPDATE public.pos_product_variants
      SET
        name = v_name,
        sku = v_sku,
        barcode = v_barcode,
        price = COALESCE((v_variant ->> 'price')::numeric, 0),
        cost = COALESCE((v_variant ->> 'cost')::numeric, 0),
        attributes = COALESCE(v_variant -> 'attributes', '{}'::jsonb),
        unit_code = COALESCE(NULLIF(v_variant ->> 'unit_code', ''), p_default_unit_code),
        image_url = NULLIF(trim(v_variant ->> 'image_url'), ''),
        active = v_active,
        sort_order = COALESCE((v_variant ->> 'sort_order')::integer, 0),
        configuration = COALESCE(v_variant -> 'configuration', '{}'::jsonb),
        updated_at = now()
      WHERE id = v_variant_id
        AND product_id = p_product_id
        AND brand_id = p_brand_id
        AND brand_slug = p_brand_slug;
    ELSE
      INSERT INTO public.pos_product_variants (
        brand_id,
        brand_slug,
        product_id,
        name,
        sku,
        barcode,
        price,
        cost,
        attributes,
        active,
        created_by,
        unit_code,
        is_default,
        sort_order,
        image_url,
        configuration
      )
      VALUES (
        p_brand_id,
        p_brand_slug,
        p_product_id,
        v_name,
        v_sku,
        v_barcode,
        COALESCE((v_variant ->> 'price')::numeric, 0),
        COALESCE((v_variant ->> 'cost')::numeric, 0),
        COALESCE(v_variant -> 'attributes', '{}'::jsonb),
        v_active,
        p_user_id,
        COALESCE(NULLIF(v_variant ->> 'unit_code', ''), p_default_unit_code),
        false,
        COALESCE((v_variant ->> 'sort_order')::integer, 0),
        NULLIF(trim(v_variant ->> 'image_url'), ''),
        COALESCE(v_variant -> 'configuration', '{}'::jsonb)
      )
      RETURNING id INTO v_variant_id;

      v_created_variant_ids := array_append(v_created_variant_ids, v_variant_id);
    END IF;
  END LOOP;

  -- En modo directo toda variante, nueva o preexistente, debe tener inventario cero
  -- en cada sucursal activa. No se genera movimiento porque no hubo recepción.
  IF p_inventory_mode = 'direct' THEN
    INSERT INTO public.pos_inventory (
      brand_id,
      brand_slug,
      location_id,
      variant_id,
      quantity,
      reserved_quantity,
      minimum_quantity
    )
    SELECT
      p_brand_id,
      p_brand_slug,
      location.id,
      variant.id,
      0,
      0,
      0
    FROM public.pos_locations location
    CROSS JOIN public.pos_product_variants variant
    WHERE location.brand_id = p_brand_id
      AND location.brand_slug = p_brand_slug
      AND location.active = true
      AND variant.product_id = p_product_id
      AND variant.brand_id = p_brand_id
      AND variant.brand_slug = p_brand_slug
    ON CONFLICT (location_id, variant_id) DO NOTHING;
  END IF;

  UPDATE public.pos_product_variants
  SET is_default = false
  WHERE product_id = p_product_id
    AND brand_id = p_brand_id
    AND brand_slug = p_brand_slug;

  SELECT id
  INTO v_default_variant_id
  FROM public.pos_product_variants
  WHERE product_id = p_product_id
    AND brand_id = p_brand_id
    AND brand_slug = p_brand_slug
    AND active = true
  ORDER BY sort_order, created_at, id
  LIMIT 1;

  IF v_default_variant_id IS NULL THEN
    RAISE EXCEPTION 'El producto debe conservar al menos una variante activa.';
  END IF;

  UPDATE public.pos_product_variants
  SET is_default = true
  WHERE id = v_default_variant_id;

  RETURN jsonb_build_object(
    'id', p_product_id,
    'updated', true,
    'createdVariantIds', to_jsonb(v_created_variant_ids),
    'inventoryMode', p_inventory_mode
  );
END;
$_$;


ALTER FUNCTION "public"."pos_update_product_v2"("p_brand_id" "text", "p_brand_slug" "text", "p_product_id" "uuid", "p_category_id" "uuid", "p_name" "text", "p_description" "text", "p_product_type" "text", "p_inventory_mode" "text", "p_default_unit_code" "text", "p_has_variants" boolean, "p_sellable" boolean, "p_purchasable" boolean, "p_tax_rate" numeric, "p_image_url" "text", "p_configuration" "jsonb", "p_variants" "jsonb", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_update_product_v2"("p_brand_id" "text", "p_brand_slug" "text", "p_product_id" "uuid", "p_category_id" "uuid", "p_name" "text", "p_description" "text", "p_product_type" "text", "p_inventory_mode" "text", "p_default_unit_code" "text", "p_has_variants" boolean, "p_sellable" boolean, "p_purchasable" boolean, "p_tax_rate" numeric, "p_image_url" "text", "p_configuration" "jsonb", "p_variants" "jsonb", "p_user_id" "uuid", "p_product_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_result jsonb;
  v_code text := NULLIF(btrim(p_product_code), '');
BEGIN
  IF v_code IS NOT NULL AND v_code !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' THEN
    RAISE EXCEPTION 'POS_PRODUCT_CODE_INVALID';
  END IF;

  v_result := public.pos_update_product_v2(
    p_brand_id, p_brand_slug, p_product_id, p_category_id, p_name,
    p_description, p_product_type, p_inventory_mode, p_default_unit_code,
    p_has_variants, p_sellable, p_purchasable, p_tax_rate, p_image_url,
    p_configuration, p_variants, p_user_id
  );

  UPDATE public.pos_products
  SET product_code = v_code,
      updated_at = now()
  WHERE id = p_product_id
    AND brand_id = p_brand_id
    AND brand_slug = p_brand_slug;

  RETURN v_result || jsonb_build_object('product_code', v_code);
END;
$_$;


ALTER FUNCTION "public"."pos_update_product_v2"("p_brand_id" "text", "p_brand_slug" "text", "p_product_id" "uuid", "p_category_id" "uuid", "p_name" "text", "p_description" "text", "p_product_type" "text", "p_inventory_mode" "text", "p_default_unit_code" "text", "p_has_variants" boolean, "p_sellable" boolean, "p_purchasable" boolean, "p_tax_rate" numeric, "p_image_url" "text", "p_configuration" "jsonb", "p_variants" "jsonb", "p_user_id" "uuid", "p_product_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pos_variant_signature_v1"("p_attributes" "jsonb") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE STRICT
    SET "search_path" TO 'public'
    AS $$
  SELECT public.pos_normalize_variant_attributes_v1(COALESCE(p_attributes, '{}'::jsonb))::text;
$$;


ALTER FUNCTION "public"."pos_variant_signature_v1"("p_attributes" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_cometa_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_cometa_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_cosmos_memory_after_agent_run"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  payload jsonb;
begin
  if new.status is distinct from 'success' or new.output_data is null then
    return new;
  end if;

  if new.agent_name = 'ORION' then
    payload := coalesce(
      new.output_data -> 'result',
      new.output_data -> 'analysis',
      new.output_data
    );

    update public.cosmos_memory
    set
      orion_analysis = payload,
      updated_at = now()
    where brand_analysis_id = new.brand_analysis_id;

  elsif new.agent_name in ('BUSINESS_MEMORY', 'NOVA')
     or new.action_type in ('generate_business_memory', 'generate_business_map') then

    payload := coalesce(
      new.output_data -> 'businessMemory',
      new.output_data -> 'business_memory',
      new.output_data -> 'businessMap',
      new.output_data -> 'business_map',
      new.output_data
    );

    update public.cosmos_memory
    set
      business_memory = payload,
      updated_at = now()
    where brand_analysis_id = new.brand_analysis_id;

  elsif new.agent_name = 'ATLAS' then
    payload := coalesce(
      new.output_data -> 'strategy',
      new.output_data -> 'atlas_strategy',
      new.output_data
    );

    update public.cosmos_memory
    set
      atlas_strategy = payload,
      updated_at = now()
    where brand_analysis_id = new.brand_analysis_id;

  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_cosmos_memory_after_agent_run"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_orion_evidence_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_orion_evidence_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_sales_ai_leads_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_sales_ai_leads_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_sales_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_sales_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_whatsapp_connections_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_whatsapp_connections_updated_at"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_name" "text",
    "brand_slug" "text",
    "agent_name" "text" NOT NULL,
    "target_agent" "text",
    "signal_type" "text" NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "summary" "text" NOT NULL,
    "recommended_action" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "source_data" "jsonb" DEFAULT '{}'::"jsonb",
    "action_payload" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "resolved_at" timestamp with time zone
);


ALTER TABLE "public"."agent_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_activity" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "client_id" "uuid",
    "agent_name" "text",
    "action" "text",
    "summary" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."atlas_hypotheses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "evidence" "jsonb",
    "confidence_score" integer DEFAULT 0,
    "status" "text" DEFAULT 'active'::"text",
    "impact_level" "text",
    "decision" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."atlas_hypotheses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."atlas_observations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "observation_date" "date" DEFAULT CURRENT_DATE,
    "observation_type" "text",
    "summary" "text",
    "evidence" "jsonb",
    "recommendation" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."atlas_observations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."atlas_strategy_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "version" integer NOT NULL,
    "strategy_name" "text",
    "strategy" "jsonb",
    "reason_for_change" "text",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."atlas_strategy_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."atlas_whatsapp_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "whatsapp_message_id" "text",
    "contact_name" "text",
    "contact_phone" "text",
    "direction" "text",
    "message_type" "text",
    "message_body" "text",
    "timestamp" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."atlas_whatsapp_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."brand_analysis" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_name" "text" NOT NULL,
    "industry" "text",
    "analysis" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "city" "text",
    "instagram" "text",
    "facebook" "text",
    "tiktok" "text",
    "website" "text",
    "competitors" "text",
    "objective" "text",
    "budget" "text",
    "problem" "text",
    "brand_slug" "text"
);


ALTER TABLE "public"."brand_analysis" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."brand_evidence" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_analysis_id" "uuid",
    "brand_name" "text" NOT NULL,
    "industry" "text",
    "city" "text",
    "source" "text" NOT NULL,
    "evidence_type" "text" NOT NULL,
    "source_url" "text",
    "raw_data" "jsonb" DEFAULT '{}'::"jsonb",
    "extracted_signals" "jsonb" DEFAULT '{}'::"jsonb",
    "ai_summary" "text",
    "confidence" integer DEFAULT 0,
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "screenshot_url" "text",
    "evidence_title" "text",
    "evidence_notes" "text"
);


ALTER TABLE "public"."brand_evidence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."brand_memory" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "client_id" "uuid",
    "business_summary" "text",
    "target_audience" "text",
    "value_proposition" "text",
    "main_offer" "text",
    "communication_tone" "text",
    "visual_style" "text",
    "objectives" "text",
    "opportunities" "text",
    "restrictions" "text",
    "important_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."brand_memory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."brand_os_access" (
    "brand_slug" "text" NOT NULL,
    "status" "text" NOT NULL,
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "brand_os_access_status_ck" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'inactive'::"text"]))),
    CONSTRAINT "brand_os_access_time_window_ck" CHECK ((("ended_at" IS NULL) OR ("started_at" IS NULL) OR ("ended_at" >= "started_at")))
);


ALTER TABLE "public"."brand_os_access" OWNER TO "postgres";


COMMENT ON TABLE "public"."brand_os_access" IS 'Canonical commercial and operational access state for Cometa OS. A missing row means not_configured.';



COMMENT ON COLUMN "public"."brand_os_access"."status" IS 'Managed-service state only: active, paused, or inactive. It is independent from POS lifecycle and memberships.';



CREATE TABLE IF NOT EXISTS "public"."brands" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "creation_idempotency_key" "uuid",
    "creation_payload_fingerprint" "text",
    CONSTRAINT "brands_name_not_blank_check" CHECK (("btrim"("name") <> ''::"text")),
    CONSTRAINT "brands_slug_format_check" CHECK (("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text")),
    CONSTRAINT "brands_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."brands" OWNER TO "postgres";


COMMENT ON TABLE "public"."brands" IS 'Canonical COMETA brand identity registry. Resolver priority: brands first, legacy fallback temporarily. Workspace visibility remains membership-scoped through user_brand_access.';



COMMENT ON COLUMN "public"."brands"."slug" IS 'Globally unique, normalized human routing identifier for /brand/[brandSlug].';



COMMENT ON COLUMN "public"."brands"."status" IS 'Brand registry status only; independent from POS subscription lifecycle.';



COMMENT ON COLUMN "public"."brands"."creation_idempotency_key" IS 'Server-authorized logical creation operation key; scoped to created_by.';



COMMENT ON COLUMN "public"."brands"."creation_payload_fingerprint" IS 'Deterministic fingerprint used to reject mismatched creation retries.';



CREATE TABLE IF NOT EXISTS "public"."briefs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "client_id" "uuid",
    "brief_type" "text",
    "content" "text",
    "status" "text" DEFAULT 'draft'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."briefs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_maps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_analysis_id" "uuid",
    "brand_name" "text",
    "industry" "text",
    "city" "text",
    "discovery_data" "jsonb",
    "business_map_json" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."business_maps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "platform" "text" NOT NULL,
    "account_name" "text",
    "account_id" "text",
    "access_token" "text",
    "refresh_token" "text",
    "token_expires_at" timestamp with time zone,
    "status" "text" DEFAULT 'connected'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."client_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "industry" "text",
    "city" "text",
    "website" "text",
    "instagram" "text",
    "facebook" "text",
    "whatsapp" "text",
    "sales_channel" "text",
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "brand_slug" "text"
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."content_performance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "platform" "text" NOT NULL,
    "post_id" "text",
    "post_url" "text",
    "post_type" "text",
    "caption" "text",
    "published_at" timestamp with time zone,
    "reach" integer,
    "impressions" integer,
    "likes" integer,
    "comments" integer,
    "shares" integer,
    "saves" integer,
    "clicks" integer,
    "messages" integer,
    "engagement_rate" numeric,
    "raw_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."content_performance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."content_publications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_name" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "brand_analysis_id" "text",
    "agent_name" "text" DEFAULT 'MERCURY'::"text" NOT NULL,
    "source" "text" DEFAULT 'MERCURY'::"text" NOT NULL,
    "status" "text" DEFAULT 'approved'::"text" NOT NULL,
    "is_client_visible" boolean DEFAULT false NOT NULL,
    "content_plan" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "internal_notes" "text",
    "approved_by" "text" DEFAULT 'Cometa'::"text",
    "approved_at" timestamp with time zone,
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."content_publications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."corrections" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "client_id" "uuid",
    "correction" "text" NOT NULL,
    "context" "text",
    "apply_to" "text",
    "priority" "text" DEFAULT 'high'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."corrections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cosmos_agent_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_name" "text" NOT NULL,
    "brand_analysis_id" "uuid",
    "agent_name" "text" NOT NULL,
    "action_type" "text" NOT NULL,
    "input_data" "jsonb",
    "output_data" "jsonb",
    "status" "text" DEFAULT 'success'::"text",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cosmos_agent_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cosmos_memory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_analysis_id" "uuid",
    "brand_name" "text" NOT NULL,
    "industry" "text",
    "city" "text",
    "orion_analysis" "jsonb",
    "nova_business_map" "jsonb",
    "atlas_strategy" "jsonb",
    "mercury_content" "jsonb",
    "ares_ads" "jsonb",
    "mercurio_sales" "jsonb",
    "last_agent" "text",
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "mercury_content_plan" "jsonb",
    "mercury_last_execution" timestamp without time zone,
    "company_memory" "jsonb",
    "business_memory" "jsonb",
    "orion_memory" "jsonb",
    "business_intelligence" "jsonb",
    "growth_memory" "jsonb",
    "revenue_memory" "jsonb",
    "activity_timeline" "jsonb" DEFAULT '[]'::"jsonb",
    "brand_slug" "text"
);


ALTER TABLE "public"."cosmos_memory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cosmos_strategies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "version" integer DEFAULT 1 NOT NULL,
    "strategy_name" "text",
    "executive_summary" "text",
    "strategic_objective" "text",
    "content_strategy" "jsonb",
    "sales_strategy" "jsonb",
    "acquisition_strategy" "jsonb",
    "retention_strategy" "jsonb",
    "source_hypothesis_id" "uuid",
    "status" "text" DEFAULT 'active'::"text",
    "created_by" "text" DEFAULT 'ATLAS'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "activated_at" timestamp with time zone DEFAULT "now"(),
    "archived_at" timestamp with time zone
);


ALTER TABLE "public"."cosmos_strategies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."decisions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "client_id" "uuid",
    "decision" "text" NOT NULL,
    "reason" "text",
    "impact" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."decisions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memory_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "client_id" "uuid",
    "type" "text" NOT NULL,
    "title" "text",
    "content" "text" NOT NULL,
    "source" "text",
    "priority" "text" DEFAULT 'medium'::"text",
    "embedding" "public"."vector"(1536),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."memory_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mercury_agent_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_name" "text",
    "brand_slug" "text",
    "run_type" "text" NOT NULL,
    "status" "text" DEFAULT 'started'::"text" NOT NULL,
    "calendar_id" "uuid",
    "input_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "output_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error_message" "text",
    "requested_by" "uuid",
    "requested_by_role" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "mercury_agent_runs_run_type_check" CHECK (("run_type" = ANY (ARRAY['manual_calendar_generation'::"text", 'auto_calendar_generation'::"text", 'creative_review'::"text", 'monthly_learning'::"text", 'task_generation'::"text"]))),
    CONSTRAINT "mercury_agent_runs_status_check" CHECK (("status" = ANY (ARRAY['started'::"text", 'completed'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."mercury_agent_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mercury_brand_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_name" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "content_cycle_day" integer DEFAULT 6 NOT NULL,
    "generate_days_before" integer DEFAULT 7 NOT NULL,
    "posts_per_month" integer DEFAULT 4 NOT NULL,
    "reels_per_month" integer DEFAULT 4 NOT NULL,
    "stories_per_week" integer DEFAULT 5 NOT NULL,
    "preferred_platforms" "text"[] DEFAULT ARRAY['instagram'::"text", 'facebook'::"text"] NOT NULL,
    "content_focus" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "assigned_designer_id" "uuid",
    "assigned_reels_id" "uuid",
    "assigned_cm_id" "uuid",
    "requires_internal_approval" boolean DEFAULT true NOT NULL,
    "requires_client_approval" boolean DEFAULT false NOT NULL,
    "auto_generate_enabled" boolean DEFAULT false NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "internal_notes" "text",
    "client_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mercury_brand_settings_content_cycle_day_check" CHECK ((("content_cycle_day" >= 1) AND ("content_cycle_day" <= 28))),
    CONSTRAINT "mercury_brand_settings_generate_days_before_check" CHECK ((("generate_days_before" >= 1) AND ("generate_days_before" <= 21))),
    CONSTRAINT "mercury_brand_settings_posts_per_month_check" CHECK (("posts_per_month" >= 0)),
    CONSTRAINT "mercury_brand_settings_reels_per_month_check" CHECK (("reels_per_month" >= 0)),
    CONSTRAINT "mercury_brand_settings_stories_per_week_check" CHECK (("stories_per_week" >= 0))
);


ALTER TABLE "public"."mercury_brand_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mercury_calendars" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_name" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "cycle_month" integer NOT NULL,
    "cycle_year" integer NOT NULL,
    "cycle_start_date" "date",
    "cycle_end_date" "date",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "monthly_objective" "text",
    "strategic_focus" "text",
    "campaign_theme" "text",
    "key_offers" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "content_angles" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "channels" "text"[] DEFAULT ARRAY['instagram'::"text", 'facebook'::"text"] NOT NULL,
    "generated_by" "text" DEFAULT 'mercury'::"text" NOT NULL,
    "generated_from_context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "approved_internal_by" "uuid",
    "approved_internal_at" timestamp with time zone,
    "approved_client_by" "uuid",
    "approved_client_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mercury_calendars_cycle_month_check" CHECK ((("cycle_month" >= 1) AND ("cycle_month" <= 12))),
    CONSTRAINT "mercury_calendars_cycle_year_check" CHECK ((("cycle_year" >= 2024) AND ("cycle_year" <= 2100))),
    CONSTRAINT "mercury_calendars_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'generated'::"text", 'internal_review'::"text", 'approved_internal'::"text", 'sent_to_client'::"text", 'client_changes'::"text", 'approved_client'::"text", 'in_production'::"text", 'completed'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."mercury_calendars" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mercury_content_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content_item_id" "uuid" NOT NULL,
    "brand_name" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "file_url" "text" NOT NULL,
    "file_type" "text" DEFAULT 'image'::"text" NOT NULL,
    "uploaded_by" "uuid",
    "version_number" integer DEFAULT 1 NOT NULL,
    "is_final" boolean DEFAULT false NOT NULL,
    "ai_review_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "ai_review_score" integer,
    "ai_review_summary" "text",
    "ai_review_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "asset_name" "text",
    "asset_type" "text" DEFAULT 'external_link'::"text",
    "asset_url" "text",
    "asset_status" "text" DEFAULT 'active'::"text",
    "notes" "text",
    "provider" "text" DEFAULT 'external'::"text",
    "uploaded_by_role" "text" DEFAULT 'cometa'::"text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "calendar_id" "uuid",
    CONSTRAINT "mercury_content_assets_ai_review_score_check" CHECK ((("ai_review_score" IS NULL) OR (("ai_review_score" >= 0) AND ("ai_review_score" <= 100)))),
    CONSTRAINT "mercury_content_assets_ai_review_status_check" CHECK (("ai_review_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'changes_requested'::"text", 'rejected'::"text", 'not_reviewed'::"text"]))),
    CONSTRAINT "mercury_content_assets_file_type_check" CHECK (("file_type" = ANY (ARRAY['image'::"text", 'video'::"text", 'pdf'::"text", 'document'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."mercury_content_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mercury_content_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content_item_id" "uuid" NOT NULL,
    "brand_name" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "user_id" "uuid",
    "user_role" "text" DEFAULT 'cometa'::"text" NOT NULL,
    "comment" "text" NOT NULL,
    "is_private" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mercury_content_comments_user_role_check" CHECK (("user_role" = ANY (ARRAY['cometa'::"text", 'designer'::"text", 'client'::"text", 'agent'::"text"])))
);


ALTER TABLE "public"."mercury_content_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mercury_content_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "calendar_id" "uuid" NOT NULL,
    "brand_name" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "content_type" "text" NOT NULL,
    "platform" "text" DEFAULT 'instagram'::"text" NOT NULL,
    "objective" "text",
    "funnel_stage" "text",
    "brief" "text",
    "copy_base" "text",
    "cta" "text",
    "visual_direction" "text",
    "reference_notes" "text",
    "due_date" "date",
    "publish_date" "date",
    "assigned_to" "uuid",
    "assigned_role" "text",
    "status" "text" DEFAULT 'generated'::"text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "private_notes" "text",
    "client_notes" "text",
    "created_by_agent" boolean DEFAULT true NOT NULL,
    "locked" boolean DEFAULT false NOT NULL,
    "raw_ai_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mercury_content_items_assigned_role_check" CHECK ((("assigned_role" IS NULL) OR ("assigned_role" = ANY (ARRAY['designer'::"text", 'reels'::"text", 'cm'::"text", 'copy'::"text", 'admin'::"text"])))),
    CONSTRAINT "mercury_content_items_content_type_check" CHECK (("content_type" = ANY (ARRAY['post'::"text", 'carousel'::"text", 'reel'::"text", 'story'::"text", 'video'::"text", 'ad'::"text", 'email'::"text", 'whatsapp'::"text", 'other'::"text"]))),
    CONSTRAINT "mercury_content_items_funnel_stage_check" CHECK ((("funnel_stage" IS NULL) OR ("funnel_stage" = ANY (ARRAY['awareness'::"text", 'consideration'::"text", 'conversion'::"text", 'retention'::"text", 'loyalty'::"text"])))),
    CONSTRAINT "mercury_content_items_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "mercury_content_items_status_check" CHECK (("status" = ANY (ARRAY['generated'::"text", 'internal_review'::"text", 'assigned'::"text", 'in_design'::"text", 'design_uploaded'::"text", 'changes_requested'::"text", 'approved_internal'::"text", 'sent_to_client'::"text", 'approved_client'::"text", 'scheduled'::"text", 'published'::"text", 'analyzed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."mercury_content_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mercury_content_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content_item_id" "uuid" NOT NULL,
    "brand_name" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "review_type" "text" DEFAULT 'creative_ai'::"text" NOT NULL,
    "verdict" "text" NOT NULL,
    "score" integer,
    "strengths" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "issues" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "recommendations" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "summary" "text",
    "raw_review" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "reviewed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mercury_content_reviews_review_type_check" CHECK (("review_type" = ANY (ARRAY['creative_ai'::"text", 'copy_ai'::"text", 'internal'::"text", 'client'::"text"]))),
    CONSTRAINT "mercury_content_reviews_score_check" CHECK ((("score" IS NULL) OR (("score" >= 0) AND ("score" <= 100)))),
    CONSTRAINT "mercury_content_reviews_verdict_check" CHECK (("verdict" = ANY (ARRAY['approved'::"text", 'changes_requested'::"text", 'rejected'::"text", 'needs_human_review'::"text"])))
);


ALTER TABLE "public"."mercury_content_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mercury_monthly_learnings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_name" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "cycle_month" integer NOT NULL,
    "cycle_year" integer NOT NULL,
    "summary" "text",
    "what_worked" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "what_did_not_work" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "opportunities" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "recommendations_next_cycle" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "raw_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mercury_monthly_learnings_cycle_month_check" CHECK ((("cycle_month" >= 1) AND ("cycle_month" <= 12))),
    CONSTRAINT "mercury_monthly_learnings_cycle_year_check" CHECK ((("cycle_year" >= 2024) AND ("cycle_year" <= 2100)))
);


ALTER TABLE "public"."mercury_monthly_learnings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mercury_piece_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content_piece_id" "uuid" NOT NULL,
    "comment_text" "text" NOT NULL,
    "author_name" "text",
    "author_role" "text",
    "source" "text" DEFAULT 'manual'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."mercury_piece_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mercury_team_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "brand_name" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "role" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mercury_team_assignments_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'designer'::"text", 'reels'::"text", 'cm'::"text", 'copy'::"text", 'client'::"text"])))
);


ALTER TABLE "public"."mercury_team_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."opportunities" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "client_id" "uuid",
    "opportunity" "text" NOT NULL,
    "area" "text",
    "priority" "text" DEFAULT 'medium'::"text",
    "recommended_action" "text",
    "status" "text" DEFAULT 'open'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."opportunities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orion_evidence" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_analysis_id" "uuid",
    "brand_name" "text" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_url" "text",
    "source_name" "text",
    "evidence_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "collection_method" "text" DEFAULT 'manual'::"text" NOT NULL,
    "raw_data" "jsonb" DEFAULT '{}'::"jsonb",
    "visual_signals" "jsonb" DEFAULT '{}'::"jsonb",
    "ai_observations" "jsonb" DEFAULT '{}'::"jsonb",
    "evidence_summary" "text",
    "screenshot_url" "text",
    "confidence_score" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "orion_evidence_collection_method_check" CHECK (("collection_method" = ANY (ARRAY['manual'::"text", 'form_input'::"text", 'website_analyzer'::"text", 'screenshot_upload'::"text", 'external_worker'::"text", 'api'::"text"]))),
    CONSTRAINT "orion_evidence_confidence_score_check" CHECK ((("confidence_score" >= 0) AND ("confidence_score" <= 100))),
    CONSTRAINT "orion_evidence_source_type_check" CHECK (("source_type" = ANY (ARRAY['instagram'::"text", 'facebook'::"text", 'tiktok'::"text", 'website'::"text", 'competitor'::"text", 'google_business'::"text", 'ads_library'::"text", 'manual_note'::"text", 'screenshot'::"text", 'other'::"text"]))),
    CONSTRAINT "orion_evidence_status_check" CHECK (("evidence_status" = ANY (ARRAY['pending'::"text", 'success'::"text", 'partial'::"text", 'failed'::"text", 'manual_uploaded'::"text", 'not_available'::"text"])))
);


ALTER TABLE "public"."orion_evidence" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."orion_evidence_summary" AS
 SELECT "brand_analysis_id",
    "brand_name",
    "count"(*) AS "total_evidence_items",
    "count"(*) FILTER (WHERE ("source_type" = 'instagram'::"text")) AS "instagram_evidence_count",
    "count"(*) FILTER (WHERE ("source_type" = 'facebook'::"text")) AS "facebook_evidence_count",
    "count"(*) FILTER (WHERE ("source_type" = 'tiktok'::"text")) AS "tiktok_evidence_count",
    "count"(*) FILTER (WHERE ("source_type" = 'website'::"text")) AS "website_evidence_count",
    "count"(*) FILTER (WHERE ("source_type" = 'competitor'::"text")) AS "competitor_evidence_count",
    "jsonb_agg"("jsonb_build_object"('source_type', "source_type", 'source_url', "source_url", 'source_name', "source_name", 'evidence_status', "evidence_status", 'collection_method', "collection_method", 'evidence_summary', "evidence_summary", 'confidence_score', "confidence_score", 'raw_data', "raw_data", 'visual_signals', "visual_signals", 'ai_observations', "ai_observations", 'screenshot_url', "screenshot_url", 'created_at', "created_at") ORDER BY "created_at" DESC) AS "evidence_items",
    "max"("created_at") AS "latest_evidence_at"
   FROM "public"."orion_evidence"
  GROUP BY "brand_analysis_id", "brand_name";


ALTER VIEW "public"."orion_evidence_summary" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."orion_latest_evidence" AS
 SELECT DISTINCT ON (("regexp_replace"("lower"(TRIM(BOTH FROM "brand_name")), '\s+'::"text", ''::"text", 'g'::"text")), ("lower"(TRIM(BOTH FROM "source_type")))) "regexp_replace"("lower"(TRIM(BOTH FROM "brand_name")), '\s+'::"text", ''::"text", 'g'::"text") AS "brand_search_key",
    "id",
    "brand_analysis_id",
    "brand_name",
    "source_type",
    "source_url",
    "source_name",
    "evidence_status",
    "collection_method",
    "raw_data",
    "visual_signals",
    "ai_observations",
    "evidence_summary",
    "screenshot_url",
    "confidence_score",
    "created_at",
    "updated_at"
   FROM "public"."orion_evidence"
  WHERE (("evidence_status" = ANY (ARRAY['success'::"text", 'partial'::"text"])) AND ("collection_method" = 'external_worker'::"text"))
  ORDER BY ("regexp_replace"("lower"(TRIM(BOTH FROM "brand_name")), '\s+'::"text", ''::"text", 'g'::"text")), ("lower"(TRIM(BOTH FROM "source_type"))), "created_at" DESC, "confidence_score" DESC;


ALTER VIEW "public"."orion_latest_evidence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orion_scrape_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_analysis_id" "uuid",
    "brand_name" "text" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_url" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "priority" integer DEFAULT 5,
    "attempts" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 3 NOT NULL,
    "result_data" "jsonb" DEFAULT '{}'::"jsonb",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    CONSTRAINT "orion_scrape_jobs_source_type_check" CHECK (("source_type" = ANY (ARRAY['instagram'::"text", 'facebook'::"text", 'tiktok'::"text", 'website'::"text", 'competitor'::"text"]))),
    CONSTRAINT "orion_scrape_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'success'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."orion_scrape_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_analytics_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "location_id" "uuid",
    "snapshot_type" "text" NOT NULL,
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "metrics" "jsonb" NOT NULL,
    "schema_version" "text" DEFAULT 'reports_v1'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "generated_by" "uuid",
    CONSTRAINT "pos_analytics_snapshots_metrics_object_ck" CHECK (("jsonb_typeof"("metrics") = 'object'::"text")),
    CONSTRAINT "pos_analytics_snapshots_period_ck" CHECK (("period_end" > "period_start")),
    CONSTRAINT "pos_analytics_snapshots_schema_version_ck" CHECK (("schema_version" = 'reports_v1'::"text")),
    CONSTRAINT "pos_analytics_snapshots_type_ck" CHECK (("snapshot_type" = ANY (ARRAY['daily'::"text", 'weekly'::"text", 'monthly'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."pos_analytics_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_business_capabilities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "capability_code" "text" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "source" "text" DEFAULT 'template'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_business_capabilities_source_check" CHECK (("source" = ANY (ARRAY['template'::"text", 'manual'::"text", 'plan'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."pos_business_capabilities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_business_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "profile_code" "text" DEFAULT 'unconfigured'::"text" NOT NULL,
    "operation_mode" "text" DEFAULT 'single'::"text" NOT NULL,
    "onboarding_status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "onboarding_step" integer DEFAULT 1 NOT NULL,
    "onboarding_completed_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_business_profiles_onboarding_status_check" CHECK (("onboarding_status" = ANY (ARRAY['not_started'::"text", 'in_progress'::"text", 'completed'::"text"]))),
    CONSTRAINT "pos_business_profiles_onboarding_step_check" CHECK ((("onboarding_step" >= 1) AND ("onboarding_step" <= 10))),
    CONSTRAINT "pos_business_profiles_operation_mode_check" CHECK (("operation_mode" = ANY (ARRAY['single'::"text", 'mixed'::"text"])))
);


ALTER TABLE "public"."pos_business_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_capability_catalog" (
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "category" "text" NOT NULL,
    "launch_status" "text" DEFAULT 'live'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_capability_catalog_launch_status_check" CHECK (("launch_status" = ANY (ARRAY['internal'::"text", 'live'::"text", 'upcoming'::"text"])))
);


ALTER TABLE "public"."pos_capability_catalog" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "parent_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pos_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_commercial_grants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_slug" "text" NOT NULL,
    "grant_code" "text" NOT NULL,
    "grant_type" "text" NOT NULL,
    "plan_code" "text" NOT NULL,
    "status" "text" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "reason" "text",
    "created_by" "uuid",
    "revoked_at" timestamp with time zone,
    "revoked_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_commercial_grants_grant_code_check" CHECK (("btrim"("grant_code") <> ''::"text")),
    CONSTRAINT "pos_commercial_grants_grant_type_check" CHECK (("grant_type" = 'complimentary'::"text")),
    CONSTRAINT "pos_commercial_grants_revocation_ck" CHECK (((("status" = 'active'::"text") AND ("revoked_at" IS NULL)) OR (("status" = 'revoked'::"text") AND ("revoked_at" IS NOT NULL)))),
    CONSTRAINT "pos_commercial_grants_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'revoked'::"text"]))),
    CONSTRAINT "pos_commercial_grants_window_ck" CHECK (("ends_at" > "starts_at"))
);


ALTER TABLE "public"."pos_commercial_grants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text",
    "phone" "text",
    "email" "text",
    "birthday" "date",
    "marketing_consent" boolean DEFAULT false NOT NULL,
    "wallet_consent" boolean DEFAULT false NOT NULL,
    "tags" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "notes" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pos_customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_entitlements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "category" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_entitlements_category_ck" CHECK (("category" = ANY (ARRAY['pos'::"text", 'intelligence'::"text", 'growth'::"text", 'automation'::"text", 'agency'::"text", 'platform'::"text"]))),
    CONSTRAINT "pos_entitlements_code_ck" CHECK (("code" ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'::"text")),
    CONSTRAINT "pos_entitlements_name_ck" CHECK (("btrim"("name") <> ''::"text"))
);


ALTER TABLE "public"."pos_entitlements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_intelligence_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "location_id" "uuid",
    "report_type" "text" NOT NULL,
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "analytics_snapshot_id" "uuid",
    "signals_snapshot" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "input_snapshot" "jsonb" NOT NULL,
    "executive_summary" "text" NOT NULL,
    "health_status" "text",
    "health_score" numeric,
    "findings" "jsonb" NOT NULL,
    "opportunities" "jsonb" NOT NULL,
    "risks" "jsonb" NOT NULL,
    "hypotheses" "jsonb" NOT NULL,
    "recommended_actions" "jsonb" NOT NULL,
    "data_quality_notes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "model" "text" NOT NULL,
    "prompt_version" "text" NOT NULL,
    "schema_version" "text" NOT NULL,
    "generation_status" "text" NOT NULL,
    "input_hash" "text" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_intelligence_reports_actions_json_ck" CHECK (("jsonb_typeof"("recommended_actions") = 'array'::"text")),
    CONSTRAINT "pos_intelligence_reports_completed_ck" CHECK ((("generation_status" <> 'completed'::"text") OR ("btrim"("executive_summary") <> ''::"text"))),
    CONSTRAINT "pos_intelligence_reports_findings_json_ck" CHECK (("jsonb_typeof"("findings") = 'array'::"text")),
    CONSTRAINT "pos_intelligence_reports_hash_ck" CHECK (("input_hash" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "pos_intelligence_reports_health_ck" CHECK ((("health_status" IS NULL) OR ("health_status" = ANY (ARRAY['strong'::"text", 'stable'::"text", 'watch'::"text", 'risk'::"text", 'insufficient_data'::"text"])))),
    CONSTRAINT "pos_intelligence_reports_hypotheses_json_ck" CHECK (("jsonb_typeof"("hypotheses") = 'array'::"text")),
    CONSTRAINT "pos_intelligence_reports_input_json_ck" CHECK (("jsonb_typeof"("input_snapshot") = 'object'::"text")),
    CONSTRAINT "pos_intelligence_reports_opportunities_json_ck" CHECK (("jsonb_typeof"("opportunities") = 'array'::"text")),
    CONSTRAINT "pos_intelligence_reports_period_ck" CHECK (("period_end" > "period_start")),
    CONSTRAINT "pos_intelligence_reports_prompt_ck" CHECK (("prompt_version" = 'pulsar_v1'::"text")),
    CONSTRAINT "pos_intelligence_reports_quality_json_ck" CHECK (("jsonb_typeof"("data_quality_notes") = 'array'::"text")),
    CONSTRAINT "pos_intelligence_reports_risks_json_ck" CHECK (("jsonb_typeof"("risks") = 'array'::"text")),
    CONSTRAINT "pos_intelligence_reports_schema_ck" CHECK (("schema_version" = 'pulsar_report_v1'::"text")),
    CONSTRAINT "pos_intelligence_reports_score_ck" CHECK ((("health_score" IS NULL) OR (("health_score" >= (0)::numeric) AND ("health_score" <= (100)::numeric)))),
    CONSTRAINT "pos_intelligence_reports_signals_json_ck" CHECK (("jsonb_typeof"("signals_snapshot") = 'array'::"text")),
    CONSTRAINT "pos_intelligence_reports_status_ck" CHECK (("generation_status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'failed'::"text"]))),
    CONSTRAINT "pos_intelligence_reports_type_ck" CHECK (("report_type" = ANY (ARRAY['daily'::"text", 'weekly'::"text", 'monthly'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."pos_intelligence_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_intelligence_signals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "location_id" "uuid",
    "signal_type" "text" NOT NULL,
    "signal_category" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "entity_type" "text",
    "entity_id" "text",
    "entity_name" "text",
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "comparison_start" timestamp with time zone,
    "comparison_end" timestamp with time zone,
    "title" "text" NOT NULL,
    "metric_key" "text" NOT NULL,
    "current_value" numeric,
    "previous_value" numeric,
    "delta_value" numeric,
    "delta_percent" numeric,
    "evidence" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "rule_version" "text" NOT NULL,
    "dedupe_key" "text" NOT NULL,
    "detected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_intelligence_signals_category_ck" CHECK (("signal_category" = ANY (ARRAY['opportunity'::"text", 'risk'::"text", 'anomaly'::"text", 'trend'::"text", 'loyalty'::"text", 'customer'::"text", 'inventory'::"text", 'product'::"text"]))),
    CONSTRAINT "pos_intelligence_signals_comparison_ck" CHECK (((("comparison_start" IS NULL) AND ("comparison_end" IS NULL)) OR ("comparison_end" > "comparison_start"))),
    CONSTRAINT "pos_intelligence_signals_context_ck" CHECK (("jsonb_typeof"("context") = 'object'::"text")),
    CONSTRAINT "pos_intelligence_signals_evidence_ck" CHECK (("jsonb_typeof"("evidence") = 'object'::"text")),
    CONSTRAINT "pos_intelligence_signals_period_ck" CHECK (("period_end" > "period_start")),
    CONSTRAINT "pos_intelligence_signals_resolved_ck" CHECK (((("status" = 'resolved'::"text") AND ("resolved_at" IS NOT NULL)) OR ("status" <> 'resolved'::"text"))),
    CONSTRAINT "pos_intelligence_signals_severity_ck" CHECK (("severity" = ANY (ARRAY['info'::"text", 'low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"]))),
    CONSTRAINT "pos_intelligence_signals_status_ck" CHECK (("status" = ANY (ARRAY['open'::"text", 'acknowledged'::"text", 'resolved'::"text", 'dismissed'::"text"])))
);


ALTER TABLE "public"."pos_intelligence_signals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_inventory_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "variant_id" "uuid" NOT NULL,
    "movement_type" "text" NOT NULL,
    "quantity_delta" numeric(14,3) NOT NULL,
    "quantity_before" numeric(14,3) NOT NULL,
    "quantity_after" numeric(14,3) NOT NULL,
    "reference_type" "text",
    "reference_id" "uuid",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_inventory_movements_movement_type_check" CHECK (("movement_type" = ANY (ARRAY['initial'::"text", 'receipt'::"text", 'sale'::"text", 'return'::"text", 'adjustment'::"text", 'transfer_in'::"text", 'transfer_out'::"text", 'loss'::"text"]))),
    CONSTRAINT "pos_inventory_movements_quantity_after_check" CHECK (("quantity_after" >= (0)::numeric))
);


ALTER TABLE "public"."pos_inventory_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_inventory_receipt_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "receipt_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "variant_id" "uuid" NOT NULL,
    "purchase_presentation_id" "uuid",
    "scanned_code" "text",
    "quantity_mode" "text" NOT NULL,
    "input_quantity" numeric(14,3) NOT NULL,
    "input_unit_code" "text" NOT NULL,
    "conversion_factor" numeric(18,6) NOT NULL,
    "base_quantity" numeric(14,3) NOT NULL,
    "base_unit_code" "text" NOT NULL,
    "total_cost" numeric(18,2) DEFAULT 0 NOT NULL,
    "base_unit_cost" numeric(18,6) DEFAULT 0 NOT NULL,
    "quantity_before" numeric(14,3) NOT NULL,
    "quantity_after" numeric(14,3) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_inventory_receipt_items_base_quantity_check" CHECK (("base_quantity" > (0)::numeric)),
    CONSTRAINT "pos_inventory_receipt_items_base_unit_cost_check" CHECK (("base_unit_cost" >= (0)::numeric)),
    CONSTRAINT "pos_inventory_receipt_items_conversion_factor_check" CHECK (("conversion_factor" > (0)::numeric)),
    CONSTRAINT "pos_inventory_receipt_items_input_quantity_check" CHECK (("input_quantity" > (0)::numeric)),
    CONSTRAINT "pos_inventory_receipt_items_quantity_after_check" CHECK (("quantity_after" >= (0)::numeric)),
    CONSTRAINT "pos_inventory_receipt_items_quantity_before_check" CHECK (("quantity_before" >= (0)::numeric)),
    CONSTRAINT "pos_inventory_receipt_items_quantity_mode_check" CHECK (("quantity_mode" = ANY (ARRAY['direct'::"text", 'fixed_package'::"text", 'variable_quantity'::"text"]))),
    CONSTRAINT "pos_inventory_receipt_items_total_cost_check" CHECK (("total_cost" >= (0)::numeric))
);


ALTER TABLE "public"."pos_inventory_receipt_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_inventory_receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "receipt_number" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "supplier_name" "text",
    "supplier_reference" "text",
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "total_base_quantity" numeric(18,3) DEFAULT 0 NOT NULL,
    "total_cost" numeric(18,2) DEFAULT 0 NOT NULL,
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "completed_by" "uuid",
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "idempotency_key" "uuid",
    "payload_fingerprint" "text",
    CONSTRAINT "pos_inventory_receipts_metadata_check" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "pos_inventory_receipts_payload_fingerprint_format" CHECK ((("payload_fingerprint" IS NULL) OR ("payload_fingerprint" ~ '^[0-9a-f]{64}$'::"text"))),
    CONSTRAINT "pos_inventory_receipts_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "pos_inventory_receipts_total_base_quantity_check" CHECK (("total_base_quantity" >= (0)::numeric)),
    CONSTRAINT "pos_inventory_receipts_total_cost_check" CHECK (("total_cost" >= (0)::numeric))
);


ALTER TABLE "public"."pos_inventory_receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "code" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "address_line1" "text",
    "address_line2" "text",
    "city" "text",
    "state" "text",
    "postal_code" "text",
    "country" "text" DEFAULT 'MX'::"text" NOT NULL,
    "timezone" "text" DEFAULT 'America/Mexico_City'::"text" NOT NULL,
    "currency" "text" DEFAULT 'MXN'::"text" NOT NULL,
    "tax_name" "text" DEFAULT 'IVA'::"text" NOT NULL,
    "tax_rate" numeric(7,4) DEFAULT 0 NOT NULL,
    "prices_include_tax" boolean DEFAULT true NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_locations_tax_rate_check" CHECK ((("tax_rate" >= (0)::numeric) AND ("tax_rate" <= (100)::numeric)))
);


ALTER TABLE "public"."pos_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_loyalty_programs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "points_per_currency" numeric(14,4) DEFAULT 1 NOT NULL,
    "redemption_value" numeric(14,4) DEFAULT 0.01 NOT NULL,
    "minimum_redeem_points" integer DEFAULT 100 NOT NULL,
    "points_expire_days" integer,
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_loyalty_programs_minimum_redeem_points_check" CHECK (("minimum_redeem_points" >= 0)),
    CONSTRAINT "pos_loyalty_programs_points_per_currency_check" CHECK (("points_per_currency" >= (0)::numeric)),
    CONSTRAINT "pos_loyalty_programs_redemption_value_check" CHECK (("redemption_value" >= (0)::numeric))
);


ALTER TABLE "public"."pos_loyalty_programs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_loyalty_redemptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "reward_id" "uuid" NOT NULL,
    "sale_id" "uuid",
    "points_spent" integer NOT NULL,
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reward_name" "text",
    "reward_type" "text",
    "reward_value" numeric,
    "discount_applied" numeric(14,2),
    CONSTRAINT "pos_loyalty_redemptions_discount_applied_nonnegative" CHECK ((("discount_applied" IS NULL) OR ("discount_applied" >= (0)::numeric))),
    CONSTRAINT "pos_loyalty_redemptions_points_spent_check" CHECK (("points_spent" > 0)),
    CONSTRAINT "pos_loyalty_redemptions_status_check" CHECK (("status" = ANY (ARRAY['reserved'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."pos_loyalty_redemptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_loyalty_reward_unlocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "visit_program_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "reward_id" "uuid" NOT NULL,
    "cycle_number" integer NOT NULL,
    "source_sale_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'available'::"text" NOT NULL,
    "redeemed_sale_id" "uuid",
    "reward_name" "text" NOT NULL,
    "reward_type" "text" NOT NULL,
    "reward_value" numeric(14,2) NOT NULL,
    "required_visits_snapshot" integer NOT NULL,
    "minimum_sale_amount_snapshot" numeric(14,2) NOT NULL,
    "unlocked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "redeemed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_loyalty_reward_unlocks_cycle_ck" CHECK (("cycle_number" > 0)),
    CONSTRAINT "pos_loyalty_reward_unlocks_minimum_ck" CHECK (("minimum_sale_amount_snapshot" >= (0)::numeric)),
    CONSTRAINT "pos_loyalty_reward_unlocks_required_ck" CHECK (("required_visits_snapshot" > 0)),
    CONSTRAINT "pos_loyalty_reward_unlocks_status_ck" CHECK (("status" = ANY (ARRAY['available'::"text", 'redeemed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "pos_loyalty_reward_unlocks_status_shape_ck" CHECK (((("status" = 'available'::"text") AND ("redeemed_sale_id" IS NULL) AND ("redeemed_at" IS NULL) AND ("cancelled_at" IS NULL)) OR (("status" = 'redeemed'::"text") AND ("redeemed_sale_id" IS NOT NULL) AND ("redeemed_at" IS NOT NULL) AND ("cancelled_at" IS NULL)) OR (("status" = 'cancelled'::"text") AND ("redeemed_sale_id" IS NULL) AND ("redeemed_at" IS NULL) AND ("cancelled_at" IS NOT NULL)))),
    CONSTRAINT "pos_loyalty_reward_unlocks_type_ck" CHECK (("reward_type" = 'discount_fixed'::"text")),
    CONSTRAINT "pos_loyalty_reward_unlocks_value_ck" CHECK (("reward_value" > (0)::numeric))
);


ALTER TABLE "public"."pos_loyalty_reward_unlocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_loyalty_rewards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "program_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "reward_type" "text" NOT NULL,
    "points_cost" integer NOT NULL,
    "reward_value" numeric(14,2),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_loyalty_rewards_points_cost_check" CHECK (("points_cost" > 0)),
    CONSTRAINT "pos_loyalty_rewards_reward_type_check" CHECK (("reward_type" = ANY (ARRAY['discount_fixed'::"text", 'discount_percent'::"text", 'product'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."pos_loyalty_rewards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_loyalty_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "sale_id" "uuid",
    "transaction_type" "text" NOT NULL,
    "points" integer NOT NULL,
    "balance_after" integer NOT NULL,
    "description" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_loyalty_transactions_balance_after_check" CHECK (("balance_after" >= 0)),
    CONSTRAINT "pos_loyalty_transactions_transaction_type_check" CHECK (("transaction_type" = ANY (ARRAY['earn'::"text", 'redeem'::"text", 'adjust'::"text", 'expire'::"text"])))
);


ALTER TABLE "public"."pos_loyalty_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_loyalty_visit_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "visit_program_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "sale_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "cycle_number" integer NOT NULL,
    "required_visits_snapshot" integer NOT NULL,
    "minimum_sale_amount_snapshot" numeric(14,2) NOT NULL,
    "reward_id_snapshot" "uuid" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reverses_event_id" "uuid",
    CONSTRAINT "pos_loyalty_visit_events_cycle_ck" CHECK (("cycle_number" > 0)),
    CONSTRAINT "pos_loyalty_visit_events_minimum_ck" CHECK (("minimum_sale_amount_snapshot" >= (0)::numeric)),
    CONSTRAINT "pos_loyalty_visit_events_required_ck" CHECK (("required_visits_snapshot" > 0)),
    CONSTRAINT "pos_loyalty_visit_events_shape_ck" CHECK (((("event_type" = 'qualify'::"text") AND ("reverses_event_id" IS NULL)) OR (("event_type" = 'reverse'::"text") AND ("reverses_event_id" IS NOT NULL)))),
    CONSTRAINT "pos_loyalty_visit_events_type_ck" CHECK (("event_type" = ANY (ARRAY['qualify'::"text", 'reverse'::"text"])))
);


ALTER TABLE "public"."pos_loyalty_visit_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_loyalty_visit_programs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "loyalty_program_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "required_visits" integer NOT NULL,
    "minimum_sale_amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "reward_id" "uuid" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_loyalty_visit_programs_dates_ck" CHECK ((("ends_at" IS NULL) OR ("starts_at" IS NULL) OR ("ends_at" > "starts_at"))),
    CONSTRAINT "pos_loyalty_visit_programs_minimum_sale_ck" CHECK (("minimum_sale_amount" >= (0)::numeric)),
    CONSTRAINT "pos_loyalty_visit_programs_required_visits_ck" CHECK (("required_visits" > 0))
);


ALTER TABLE "public"."pos_loyalty_visit_programs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "sale_id" "uuid" NOT NULL,
    "payment_method" "text" NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "reference" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tendered_amount" numeric(14,2) NOT NULL,
    "change_amount" numeric(14,2) DEFAULT 0 NOT NULL,
    CONSTRAINT "pos_payments_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "pos_payments_change_matches_cash" CHECK (((("payment_method" = 'cash'::"text") AND ("change_amount" = "round"(("tendered_amount" - "amount"), 2))) OR (("payment_method" <> 'cash'::"text") AND ("tendered_amount" = "amount") AND ("change_amount" = (0)::numeric)))),
    CONSTRAINT "pos_payments_change_non_negative" CHECK (("change_amount" >= (0)::numeric)),
    CONSTRAINT "pos_payments_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['cash'::"text", 'card'::"text", 'transfer'::"text", 'wallet'::"text", 'other'::"text"]))),
    CONSTRAINT "pos_payments_tendered_covers_amount" CHECK (("tendered_amount" >= "amount"))
);


ALTER TABLE "public"."pos_payments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."pos_payments"."amount" IS 'Monto aplicado al total de la venta. Es el ingreso neto que cuenta para reportes y cierre de caja.';



COMMENT ON COLUMN "public"."pos_payments"."tendered_amount" IS 'Monto entregado por el cliente. En pagos distintos a efectivo debe coincidir con amount.';



COMMENT ON COLUMN "public"."pos_payments"."change_amount" IS 'Cambio devuelto al cliente. Solo puede ser mayor a cero en pagos en efectivo.';



CREATE TABLE IF NOT EXISTS "public"."pos_plan_entitlements" (
    "plan_code" "text" NOT NULL,
    "entitlement_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pos_plan_entitlements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_plan_limits" (
    "plan_code" "text" NOT NULL,
    "max_locations" integer DEFAULT 1 NOT NULL,
    "max_registers" integer DEFAULT 1 NOT NULL,
    "max_users" integer DEFAULT 3 NOT NULL,
    "max_products" integer,
    "max_customers" integer,
    "includes_loyalty" boolean DEFAULT true NOT NULL,
    "includes_digital_card" boolean DEFAULT true NOT NULL,
    "includes_basic_insights" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_plan_limits_max_locations_check" CHECK (("max_locations" >= 0)),
    CONSTRAINT "pos_plan_limits_max_registers_check" CHECK (("max_registers" >= 0)),
    CONSTRAINT "pos_plan_limits_max_users_check" CHECK (("max_users" >= 0))
);


ALTER TABLE "public"."pos_plan_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_plans" (
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "list_price" numeric(14,2) NOT NULL,
    "currency" "text" DEFAULT 'MXN'::"text" NOT NULL,
    "billing_interval" "text" DEFAULT 'month'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_plans_billing_interval_check" CHECK (("billing_interval" = ANY (ARRAY['month'::"text", 'year'::"text"]))),
    CONSTRAINT "pos_plans_list_price_check" CHECK (("list_price" >= (0)::numeric))
);


ALTER TABLE "public"."pos_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_product_attribute_definitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "input_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "options" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "required" boolean DEFAULT false NOT NULL,
    "use_in_variant_name" boolean DEFAULT true NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "source_profile_code" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_product_attribute_definitions_input_type_check" CHECK (("input_type" = ANY (ARRAY['text'::"text", 'number'::"text", 'select'::"text"]))),
    CONSTRAINT "pos_product_attribute_definitions_options_check" CHECK (("jsonb_typeof"("options") = 'array'::"text")),
    CONSTRAINT "pos_product_attribute_definitions_source_check" CHECK (("source" = ANY (ARRAY['template'::"text", 'manual'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."pos_product_attribute_definitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_product_components" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "component_variant_id" "uuid" NOT NULL,
    "quantity" numeric(14,3) NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_product_components_quantity_check" CHECK (("quantity" > (0)::numeric))
);


ALTER TABLE "public"."pos_product_components" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_product_variants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "name" "text" DEFAULT 'Única'::"text" NOT NULL,
    "sku" "text",
    "barcode" "text",
    "price" numeric(14,2) DEFAULT 0 NOT NULL,
    "cost" numeric(18,6) DEFAULT 0 NOT NULL,
    "attributes" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "unit_code" "text" DEFAULT 'piece'::"text" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "image_url" "text",
    "configuration" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "variant_signature" "text" NOT NULL,
    CONSTRAINT "pos_product_variants_attributes_object_check" CHECK (("jsonb_typeof"("attributes") = 'object'::"text")),
    CONSTRAINT "pos_product_variants_configuration_object_check" CHECK (("jsonb_typeof"("configuration") = 'object'::"text")),
    CONSTRAINT "pos_product_variants_cost_check" CHECK (("cost" >= (0)::numeric)),
    CONSTRAINT "pos_product_variants_price_check" CHECK (("price" >= (0)::numeric))
);


ALTER TABLE "public"."pos_product_variants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "category_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "product_type" "text" DEFAULT 'physical'::"text" NOT NULL,
    "track_inventory" boolean DEFAULT true NOT NULL,
    "tax_rate" numeric(7,4) DEFAULT 0 NOT NULL,
    "image_url" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "inventory_mode" "text" DEFAULT 'direct'::"text" NOT NULL,
    "default_unit_code" "text" DEFAULT 'piece'::"text" NOT NULL,
    "has_variants" boolean DEFAULT false NOT NULL,
    "sellable" boolean DEFAULT true NOT NULL,
    "purchasable" boolean DEFAULT true NOT NULL,
    "configuration" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "product_code" "text",
    CONSTRAINT "pos_products_configuration_object_check" CHECK (("jsonb_typeof"("configuration") = 'object'::"text")),
    CONSTRAINT "pos_products_inventory_mode_check" CHECK (("inventory_mode" = ANY (ARRAY['direct'::"text", 'none'::"text", 'component'::"text", 'recipe'::"text", 'batch'::"text"]))),
    CONSTRAINT "pos_products_product_type_check" CHECK (("product_type" = ANY (ARRAY['physical'::"text", 'service'::"text", 'combo'::"text", 'prepared'::"text", 'ingredient'::"text", 'batch_product'::"text"]))),
    CONSTRAINT "pos_products_tax_rate_check" CHECK ((("tax_rate" >= (0)::numeric) AND ("tax_rate" <= (100)::numeric)))
);


ALTER TABLE "public"."pos_products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_profile_attribute_defaults" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_code" "text" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "input_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "options" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "required" boolean DEFAULT false NOT NULL,
    "use_in_variant_name" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_profile_attribute_defaults_input_type_check" CHECK (("input_type" = ANY (ARRAY['text'::"text", 'number'::"text", 'select'::"text"]))),
    CONSTRAINT "pos_profile_attribute_defaults_options_check" CHECK (("jsonb_typeof"("options") = 'array'::"text"))
);


ALTER TABLE "public"."pos_profile_attribute_defaults" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_profile_capability_defaults" (
    "profile_code" "text" NOT NULL,
    "capability_code" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pos_profile_capability_defaults" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_profile_catalog" (
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "icon_code" "text",
    "launch_status" "text" DEFAULT 'live'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_profile_catalog_launch_status_check" CHECK (("launch_status" = ANY (ARRAY['internal'::"text", 'live'::"text", 'upcoming'::"text"])))
);


ALTER TABLE "public"."pos_profile_catalog" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_registers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "code" "text" NOT NULL,
    "printer_name" "text",
    "hardware_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'available'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_registers_status_check" CHECK (("status" = ANY (ARRAY['available'::"text", 'disabled'::"text"])))
);


ALTER TABLE "public"."pos_registers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_sale_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "sale_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "variant_id" "uuid" NOT NULL,
    "product_name" "text" NOT NULL,
    "variant_name" "text" NOT NULL,
    "sku" "text",
    "quantity" numeric(14,3) NOT NULL,
    "unit_price" numeric(14,2) NOT NULL,
    "unit_cost" numeric(14,2) DEFAULT 0 NOT NULL,
    "discount_amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "tax_rate" numeric(7,4) DEFAULT 0 NOT NULL,
    "tax_amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "line_total" numeric(14,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "loyalty_discount_amount" numeric(14,2) DEFAULT 0 NOT NULL,
    CONSTRAINT "pos_sale_items_discount_amount_check" CHECK (("discount_amount" >= (0)::numeric)),
    CONSTRAINT "pos_sale_items_line_total_check" CHECK (("line_total" >= (0)::numeric)),
    CONSTRAINT "pos_sale_items_loyalty_discount_amount_nonnegative" CHECK (("loyalty_discount_amount" >= (0)::numeric)),
    CONSTRAINT "pos_sale_items_quantity_check" CHECK (("quantity" > (0)::numeric)),
    CONSTRAINT "pos_sale_items_unit_cost_check" CHECK (("unit_cost" >= (0)::numeric)),
    CONSTRAINT "pos_sale_items_unit_price_check" CHECK (("unit_price" >= (0)::numeric))
);


ALTER TABLE "public"."pos_sale_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_sale_loyalty_tier_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "sale_id" "uuid" NOT NULL,
    "member_id" "uuid",
    "base_points" integer DEFAULT 0 NOT NULL,
    "earned_points" integer DEFAULT 0 NOT NULL,
    "tier_multiplier" numeric(8,4) DEFAULT 1 NOT NULL,
    "lifetime_points_before" integer DEFAULT 0 NOT NULL,
    "lifetime_points_after" integer DEFAULT 0 NOT NULL,
    "tier_before_id" "uuid",
    "tier_before_name" "text",
    "tier_before_minimum_lifetime_points" integer,
    "tier_before_points_multiplier" numeric(8,4),
    "tier_after_id" "uuid",
    "tier_after_name" "text",
    "tier_after_minimum_lifetime_points" integer,
    "tier_after_points_multiplier" numeric(8,4),
    "tier_promoted" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_sale_loyalty_tier_snapshots_base_points_nonnegative" CHECK (("base_points" >= 0)),
    CONSTRAINT "pos_sale_loyalty_tier_snapshots_earned_points_nonnegative" CHECK (("earned_points" >= 0)),
    CONSTRAINT "pos_sale_loyalty_tier_snapshots_lifetime_after_nonnegative" CHECK (("lifetime_points_after" >= 0)),
    CONSTRAINT "pos_sale_loyalty_tier_snapshots_lifetime_before_nonnegative" CHECK (("lifetime_points_before" >= 0)),
    CONSTRAINT "pos_sale_loyalty_tier_snapshots_multiplier_positive" CHECK (("tier_multiplier" > (0)::numeric))
);


ALTER TABLE "public"."pos_sale_loyalty_tier_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_sale_loyalty_visit_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "sale_id" "uuid" NOT NULL,
    "member_id" "uuid",
    "reward_source" "text",
    "reward_id" "uuid",
    "reward_unlock_id" "uuid",
    "reward_discount_applied" numeric(14,2) DEFAULT 0 NOT NULL,
    "visits_earned" integer DEFAULT 0 NOT NULL,
    "visit_progress" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "visit_unlocks_created" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "response_json" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_sale_loyalty_visit_snapshots_discount_ck" CHECK (("reward_discount_applied" >= (0)::numeric)),
    CONSTRAINT "pos_sale_loyalty_visit_snapshots_progress_ck" CHECK (("jsonb_typeof"("visit_progress") = 'array'::"text")),
    CONSTRAINT "pos_sale_loyalty_visit_snapshots_response_ck" CHECK (("jsonb_typeof"("response_json") = 'object'::"text")),
    CONSTRAINT "pos_sale_loyalty_visit_snapshots_reward_shape_ck" CHECK (((("reward_source" IS NULL) AND ("reward_id" IS NULL) AND ("reward_unlock_id" IS NULL)) OR (("reward_source" = 'points'::"text") AND ("reward_id" IS NOT NULL) AND ("reward_unlock_id" IS NULL)) OR (("reward_source" = 'visits'::"text") AND ("reward_unlock_id" IS NOT NULL)))),
    CONSTRAINT "pos_sale_loyalty_visit_snapshots_source_ck" CHECK ((("reward_source" IS NULL) OR ("reward_source" = ANY (ARRAY['points'::"text", 'visits'::"text"])))),
    CONSTRAINT "pos_sale_loyalty_visit_snapshots_unlocks_ck" CHECK (("jsonb_typeof"("visit_unlocks_created") = 'array'::"text")),
    CONSTRAINT "pos_sale_loyalty_visit_snapshots_visits_ck" CHECK (("visits_earned" >= 0))
);


ALTER TABLE "public"."pos_sale_loyalty_visit_snapshots" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."pos_sale_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."pos_sale_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_sales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "sale_number" "text" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "register_id" "uuid" NOT NULL,
    "cash_session_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "subtotal" numeric(14,2) DEFAULT 0 NOT NULL,
    "discount_total" numeric(14,2) DEFAULT 0 NOT NULL,
    "tax_total" numeric(14,2) DEFAULT 0 NOT NULL,
    "total" numeric(14,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'MXN'::"text" NOT NULL,
    "sold_by" "uuid",
    "sold_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "idempotency_key" "uuid",
    "idempotency_fingerprint" "text",
    "loyalty_discount_total" numeric(14,2) DEFAULT 0 NOT NULL,
    CONSTRAINT "pos_sales_idempotency_fingerprint_format" CHECK ((("idempotency_fingerprint" IS NULL) OR ("idempotency_fingerprint" ~ '^[0-9a-f]{64}$'::"text"))),
    CONSTRAINT "pos_sales_loyalty_discount_total_nonnegative" CHECK (("loyalty_discount_total" >= (0)::numeric)),
    CONSTRAINT "pos_sales_status_check" CHECK (("status" = ANY (ARRAY['completed'::"text", 'partially_refunded'::"text", 'refunded'::"text", 'void'::"text"])))
);


ALTER TABLE "public"."pos_sales" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_signal_rule_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "signal_type" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "rule_version" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_signal_rule_configs_json_ck" CHECK (("jsonb_typeof"("config") = 'object'::"text"))
);


ALTER TABLE "public"."pos_signal_rule_configs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_stripe_billing_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_slug" "text" NOT NULL,
    "livemode" boolean NOT NULL,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "stripe_price_id" "text",
    "stripe_cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pos_stripe_billing_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_subscription_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "subscription_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "previous_status" "text",
    "new_status" "text",
    "previous_price" numeric(14,2),
    "new_price" numeric(14,2),
    "promotion_code" "text",
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pos_subscription_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_unit_conversions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "from_unit_code" "text" NOT NULL,
    "to_unit_code" "text" NOT NULL,
    "multiplier" numeric(18,6) NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_unit_conversions_check" CHECK (("from_unit_code" <> "to_unit_code")),
    CONSTRAINT "pos_unit_conversions_multiplier_check" CHECK (("multiplier" > (0)::numeric))
);


ALTER TABLE "public"."pos_unit_conversions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_units" (
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "symbol" "text" NOT NULL,
    "unit_type" "text" NOT NULL,
    "decimal_precision" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_units_decimal_precision_check" CHECK ((("decimal_precision" >= 0) AND ("decimal_precision" <= 6))),
    CONSTRAINT "pos_units_unit_type_check" CHECK (("unit_type" = ANY (ARRAY['count'::"text", 'weight'::"text", 'volume'::"text", 'length'::"text", 'service'::"text"])))
);


ALTER TABLE "public"."pos_units" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_variant_purchase_presentations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "variant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "barcode" "text",
    "supplier_sku" "text",
    "quantity_mode" "text" DEFAULT 'direct'::"text" NOT NULL,
    "input_unit_code" "text" NOT NULL,
    "base_unit_code" "text" NOT NULL,
    "conversion_factor" numeric(18,6) DEFAULT 1 NOT NULL,
    "default_input_quantity" numeric(14,3) DEFAULT 1 NOT NULL,
    "prompt_label" "text",
    "allow_fraction" boolean DEFAULT false NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_variant_purchase_presentations_conversion_factor_check" CHECK (("conversion_factor" > (0)::numeric)),
    CONSTRAINT "pos_variant_purchase_presentations_default_input_quantity_check" CHECK (("default_input_quantity" > (0)::numeric)),
    CONSTRAINT "pos_variant_purchase_presentations_quantity_mode_check" CHECK (("quantity_mode" = ANY (ARRAY['direct'::"text", 'fixed_package'::"text", 'variable_quantity'::"text"])))
);


ALTER TABLE "public"."pos_variant_purchase_presentations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_wallet_passes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "platform" "text" NOT NULL,
    "serial_number" "text" NOT NULL,
    "external_object_id" "text",
    "pass_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "last_error" "text",
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_wallet_passes_pass_status_check" CHECK (("pass_status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'revoked'::"text", 'error'::"text"]))),
    CONSTRAINT "pos_wallet_passes_platform_check" CHECK (("platform" = ANY (ARRAY['apple'::"text", 'google'::"text"])))
);


ALTER TABLE "public"."pos_wallet_passes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_agent_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid",
    "brand_name" "text" NOT NULL,
    "agent_mode" "text" DEFAULT 'observation'::"text",
    "action" "text" NOT NULL,
    "action_status" "text" DEFAULT 'pending'::"text",
    "incoming_message" "text",
    "agent_reply" "text",
    "decision_reason" "text",
    "lead_stage" "text",
    "requires_human" boolean DEFAULT false,
    "next_follow_up_at" timestamp with time zone,
    "confidence_score" integer DEFAULT 0,
    "analysis_snapshot" "jsonb" DEFAULT '{}'::"jsonb",
    "raw_data" "jsonb" DEFAULT '{}'::"jsonb",
    "executed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sales_agent_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_ai_insights" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "insight_type" "text",
    "title" "text",
    "description" "text",
    "confidence_score" numeric,
    "conversations_analyzed" integer,
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sales_ai_insights" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_ai_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_analysis_id" "uuid",
    "brand_name" "text",
    "customer_name" "text",
    "phone" "text",
    "source" "text" DEFAULT 'whatsapp'::"text",
    "message" "text",
    "conversation_text" "text",
    "lead_status" "text" DEFAULT 'new'::"text",
    "lead_temperature" "text",
    "intent" "text",
    "budget_level" "text",
    "city" "text",
    "is_qualified" boolean DEFAULT false,
    "main_objection" "text",
    "close_probability" integer DEFAULT 0,
    "ai_summary" "text",
    "next_action" "text",
    "recommended_reply" "text",
    "follow_up_message" "text",
    "sales_diagnosis" "text",
    "detected_errors" "jsonb" DEFAULT '[]'::"jsonb",
    "questions_to_ask" "jsonb" DEFAULT '[]'::"jsonb",
    "tags" "text"[] DEFAULT ARRAY[]::"text"[],
    "raw_ai_response" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "whatsapp_conversation_id" "text",
    "last_customer_message_at" timestamp with time zone,
    "last_ai_reply_at" timestamp with time zone,
    "next_follow_up_at" timestamp with time zone,
    "follow_up_stage" integer DEFAULT 0,
    "automation_status" "text" DEFAULT 'active'::"text",
    "auto_reply_enabled" boolean DEFAULT true,
    "requires_human_review" boolean DEFAULT false,
    "human_review_reason" "text",
    "last_message_direction" "text",
    "last_message_text" "text",
    "ai_confidence" integer DEFAULT 0,
    "sales_stage" "text" DEFAULT 'new_conversation'::"text",
    "handoff_to_human" boolean DEFAULT false
);


ALTER TABLE "public"."sales_ai_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_ai_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "brand_analysis_id" "uuid",
    "brand_name" "text" NOT NULL,
    "period_start" "date",
    "period_end" "date",
    "total_leads" integer DEFAULT 0,
    "qualified_leads" integer DEFAULT 0,
    "hot_leads" integer DEFAULT 0,
    "warm_leads" integer DEFAULT 0,
    "cold_leads" integer DEFAULT 0,
    "unqualified_leads" integer DEFAULT 0,
    "closed_sales" integer DEFAULT 0,
    "total_sales_amount" numeric DEFAULT 0,
    "top_objections" "jsonb" DEFAULT '[]'::"jsonb",
    "lost_reasons" "jsonb" DEFAULT '[]'::"jsonb",
    "ai_insights" "text",
    "recommendations" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sales_ai_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_ai_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_name" "text" NOT NULL,
    "agent_mode" "text" DEFAULT 'observation'::"text" NOT NULL,
    "whatsapp_status" "text" DEFAULT 'pending_verification'::"text" NOT NULL,
    "whatsapp_phone_number" "text",
    "whatsapp_phone_number_id" "text",
    "whatsapp_business_account_id" "text",
    "auto_reply_enabled" boolean DEFAULT false NOT NULL,
    "send_whatsapp_enabled" boolean DEFAULT false NOT NULL,
    "followups_enabled" boolean DEFAULT true NOT NULL,
    "human_escalation_enabled" boolean DEFAULT true NOT NULL,
    "timezone" "text" DEFAULT 'America/Mexico_City'::"text" NOT NULL,
    "business_hours" "jsonb" DEFAULT '{"friday": {"open": "09:00", "close": "18:00"}, "monday": {"open": "09:00", "close": "18:00"}, "sunday": {"closed": true}, "enabled": false, "tuesday": {"open": "09:00", "close": "18:00"}, "saturday": {"open": "09:00", "close": "14:00"}, "thursday": {"open": "09:00", "close": "18:00"}, "wednesday": {"open": "09:00", "close": "18:00"}}'::"jsonb" NOT NULL,
    "max_followups" integer DEFAULT 3 NOT NULL,
    "first_followup_delay_minutes" integer DEFAULT 1440 NOT NULL,
    "escalation_rules" "jsonb" DEFAULT '{"high_ticket": true, "angry_customer": true, "payment_problem": true, "delivery_problem": true, "close_probability_over": 75}'::"jsonb" NOT NULL,
    "response_rules" "jsonb" DEFAULT '{"tone": "profesional, claro y vendedor", "always_try_to_qualify": true, "ask_one_question_at_a_time": true, "avoid_promising_without_confirmation": true, "never_apply_discounts_without_permission": true}'::"jsonb" NOT NULL,
    "internal_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "client_connection_status" "text" DEFAULT 'not_requested'::"text" NOT NULL,
    "client_requested_phone_number" "text",
    "client_connection_notes" "text",
    "client_requested_at" timestamp with time zone,
    "client_agent_preferences" "jsonb" DEFAULT '{"tone": "profesional, claro y vendedor", "allow_followups": true, "business_hours_enabled": false, "human_escalation_enabled": true, "client_can_activate_automatic": false}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."sales_ai_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_business_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_name" "text" NOT NULL,
    "rule_type" "text" DEFAULT 'general'::"text" NOT NULL,
    "rule_name" "text" NOT NULL,
    "rule_content" "text" NOT NULL,
    "condition_text" "text",
    "priority" integer DEFAULT 50,
    "requires_human_confirmation" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sales_business_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_catalog_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_name" "text" NOT NULL,
    "item_type" "text" DEFAULT 'product'::"text",
    "name" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "sku" "text",
    "price_min" numeric,
    "price_max" numeric,
    "price_text" "text",
    "currency" "text" DEFAULT 'MXN'::"text",
    "min_order_qty" integer,
    "min_order_amount" numeric,
    "minimum_order_text" "text",
    "availability_status" "text" DEFAULT 'unknown'::"text",
    "stock_notes" "text",
    "ideal_for" "text",
    "sales_angle" "text",
    "when_to_offer" "text",
    "requires_human_confirmation" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sales_catalog_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_channels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "brand_analysis_id" "uuid",
    "brand_name" "text" NOT NULL,
    "platform" "text" DEFAULT 'whatsapp'::"text",
    "whatsapp_phone_number_id" "text",
    "whatsapp_business_account_id" "text",
    "display_phone_number" "text",
    "agent_mode" "text" DEFAULT 'observation'::"text",
    "auto_reply_enabled" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sales_channels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_faqs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_name" "text" NOT NULL,
    "question" "text" NOT NULL,
    "answer" "text" NOT NULL,
    "intent" "text",
    "keywords" "text"[] DEFAULT ARRAY[]::"text"[],
    "requires_human_confirmation" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sales_faqs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_followups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid",
    "followup_number" integer DEFAULT 1,
    "scheduled_at" timestamp with time zone NOT NULL,
    "sent_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text",
    "message_text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sales_followups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_knowledge_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_name" "text" NOT NULL,
    "source_type" "text" DEFAULT 'manual_note'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "content_text" "text" NOT NULL,
    "file_url" "text",
    "source_url" "text",
    "status" "text" DEFAULT 'active'::"text",
    "confidence_score" numeric DEFAULT 100,
    "is_active" boolean DEFAULT true,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sales_knowledge_sources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "brand_analysis_id" "uuid",
    "brand_name" "text" NOT NULL,
    "contact_name" "text",
    "contact_phone" "text",
    "contact_username" "text",
    "source" "text" DEFAULT 'whatsapp'::"text",
    "campaign_name" "text",
    "ad_name" "text",
    "lead_status" "text" DEFAULT 'new'::"text",
    "lead_temperature" "text" DEFAULT 'unknown'::"text",
    "intent" "text",
    "business_type" "text",
    "budget_level" "text",
    "city" "text",
    "is_qualified" boolean DEFAULT false,
    "qualification_reason" "text",
    "main_objection" "text",
    "lost_reason" "text",
    "close_probability" integer DEFAULT 0,
    "last_message_at" timestamp with time zone,
    "next_follow_up_at" timestamp with time zone,
    "sale_status" "text" DEFAULT 'not_closed'::"text",
    "sale_amount" numeric,
    "sale_closed_at" timestamp with time zone,
    "ai_summary" "text",
    "next_action" "text",
    "recommended_reply" "text",
    "raw_data" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "agent_stage" "text" DEFAULT 'new'::"text",
    "agent_mode" "text" DEFAULT 'observation'::"text",
    "requires_human" boolean DEFAULT false,
    "last_agent_action" "text",
    "last_agent_reason" "text",
    "brand_slug" "text",
    "customer_name" "text",
    "lead_name" "text",
    "name" "text",
    "phone" "text",
    "whatsapp" "text",
    "whatsapp_number" "text",
    "from_number" "text",
    "status" "text",
    "stage" "text",
    "temperature" "text",
    "detected_intent" "text",
    "purchase_intent" "text",
    "budget_text" "text",
    "location" "text",
    "qualified" boolean DEFAULT false,
    "objection" "text",
    "probability" integer,
    "summary" "text",
    "recommended_next_action" "text",
    "reply_suggestion" "text",
    "requires_human_confirmation" boolean DEFAULT false,
    "tags" "text"[]
);


ALTER TABLE "public"."sales_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid",
    "sender" "text",
    "message_text" "text",
    "message_type" "text" DEFAULT 'text'::"text",
    "platform" "text" DEFAULT 'whatsapp'::"text",
    "ai_detected_intent" "text",
    "ai_detected_objection" "text",
    "ai_recommendation" "text",
    "raw_data" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "channel_id" "uuid",
    "agent_run_id" "uuid",
    "outbound_message_id" "uuid",
    "brand_name" "text",
    "direction" "text",
    "sender_type" "text",
    "contact_phone" "text",
    "from_phone_number_id" "text",
    "whatsapp_message_id" "text",
    "status" "text" DEFAULT 'received'::"text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "message_direction" "text",
    "type" "text",
    "message" "text",
    "body" "text",
    "content" "text",
    "text" "text",
    "content_text" "text",
    "incoming_message" "text",
    "sender_name" "text",
    "from_number" "text",
    "to_number" "text",
    "external_message_id" "text",
    "raw_message" "jsonb",
    "is_from_customer" boolean DEFAULT false,
    "from" "text",
    "to" "text"
);


ALTER TABLE "public"."sales_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_outbound_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid",
    "agent_run_id" "uuid",
    "channel_id" "uuid",
    "brand_name" "text" NOT NULL,
    "platform" "text" DEFAULT 'whatsapp'::"text",
    "to_phone" "text" NOT NULL,
    "from_phone_number_id" "text",
    "message_text" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "send_reason" "text",
    "error_message" "text",
    "whatsapp_message_id" "text",
    "whatsapp_response" "jsonb" DEFAULT '{}'::"jsonb",
    "scheduled_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sales_outbound_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_playbook_suggestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_name" "text" NOT NULL,
    "source_lead_id" "uuid",
    "source_agent_run_id" "uuid",
    "suggestion_type" "text" DEFAULT 'general'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "current_value" "text",
    "suggested_value" "text" NOT NULL,
    "reason" "text",
    "confidence_score" numeric DEFAULT 0,
    "status" "text" DEFAULT 'pending'::"text",
    "applied_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sales_playbook_suggestions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_playbooks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "brand_analysis_id" "uuid",
    "brand_name" "text" NOT NULL,
    "business_model" "text",
    "ideal_customer" "text",
    "sales_rules" "jsonb" DEFAULT '{}'::"jsonb",
    "qualification_questions" "jsonb" DEFAULT '[]'::"jsonb",
    "objections" "jsonb" DEFAULT '[]'::"jsonb",
    "approved_replies" "jsonb" DEFAULT '[]'::"jsonb",
    "forbidden_promises" "jsonb" DEFAULT '[]'::"jsonb",
    "tone" "text" DEFAULT 'friendly_professional'::"text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "sales_objective" "text",
    "offer_summary" "text",
    "minimum_order" "text",
    "average_ticket" "text",
    "catalog_url" "text",
    "shipping_policy" "text",
    "business_hours" "text",
    "payment_methods" "jsonb" DEFAULT '[]'::"jsonb",
    "product_offers" "jsonb" DEFAULT '[]'::"jsonb",
    "faq" "jsonb" DEFAULT '[]'::"jsonb",
    "autonomy_rules" "jsonb" DEFAULT '{}'::"jsonb",
    "escalation_rules" "jsonb" DEFAULT '{}'::"jsonb",
    "followup_rules" "jsonb" DEFAULT '{}'::"jsonb",
    "closing_rules" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."sales_playbooks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_metrics_daily" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "platform" "text" NOT NULL,
    "date" "date" NOT NULL,
    "followers" integer,
    "reach" integer,
    "impressions" integer,
    "profile_views" integer,
    "likes" integer,
    "comments" integer,
    "shares" integer,
    "saves" integer,
    "messages" integer,
    "clicks" integer,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."social_metrics_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."strategy_analysis" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_analysis_id" "uuid",
    "brand_name" "text" NOT NULL,
    "industry" "text",
    "city" "text",
    "package_name" "text" NOT NULL,
    "main_objective" "text",
    "ninety_day_goal" "text",
    "ads_budget" numeric DEFAULT 0,
    "influencer_enabled" boolean DEFAULT false,
    "influencer_level" "text",
    "influencer_budget" numeric DEFAULT 0,
    "ugc_access" "text",
    "strong_season" boolean DEFAULT false,
    "season_name" "text",
    "restrictions" "text",
    "strategy_json" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."strategy_analysis" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."strategy_publications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_name" "text" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "brand_analysis_id" "text",
    "agent_name" "text" DEFAULT 'ATLAS'::"text" NOT NULL,
    "source" "text" DEFAULT 'ATLAS'::"text" NOT NULL,
    "status" "text" DEFAULT 'approved'::"text" NOT NULL,
    "is_client_visible" boolean DEFAULT false NOT NULL,
    "client_strategy" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "internal_strategy" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "form_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "internal_notes" "text",
    "approved_by" "text" DEFAULT 'Cometa'::"text",
    "approved_at" timestamp with time zone,
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."strategy_publications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stripe_webhook_events" (
    "stripe_event_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "livemode" boolean NOT NULL,
    "status" "text" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "stripe_webhook_events_status_check" CHECK (("status" = ANY (ARRAY['received'::"text", 'processed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."stripe_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "role" "text" DEFAULT 'client'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'client'::"text"]))),
    CONSTRAINT "user_profiles_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_connection_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "connection_id" "uuid",
    "signup_session_id" "uuid",
    "user_id" "uuid",
    "brand_slug" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "severity" "text" DEFAULT 'info'::"text" NOT NULL,
    "message" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whatsapp_connection_events_severity_check" CHECK (("severity" = ANY (ARRAY['info'::"text", 'warning'::"text", 'error'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."whatsapp_connection_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_connection_secrets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "connection_id" "uuid" NOT NULL,
    "token_ciphertext" "text" NOT NULL,
    "token_iv" "text" NOT NULL,
    "token_auth_tag" "text" NOT NULL,
    "token_algorithm" "text" DEFAULT 'aes-256-gcm'::"text" NOT NULL,
    "token_type" "text" DEFAULT 'business_system_user'::"text" NOT NULL,
    "token_expires_at" timestamp with time zone,
    "key_version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "phone_pin_ciphertext" "text",
    "phone_pin_iv" "text",
    "phone_pin_auth_tag" "text",
    "phone_pin_algorithm" "text" DEFAULT 'aes-256-gcm'::"text",
    "phone_pin_key_version" integer
);


ALTER TABLE "public"."whatsapp_connection_secrets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "business_name" "text",
    "phone_number" "text",
    "phone_number_id" "text",
    "whatsapp_business_account_id" "text",
    "access_token" "text",
    "webhook_verified" boolean DEFAULT false,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "brand_slug" "text",
    "brand_name" "text",
    "meta_app_id" "text",
    "meta_business_id" "text",
    "waba_id" "text",
    "display_phone_number" "text",
    "verified_name" "text",
    "connection_status" "text" DEFAULT 'pending_review'::"text",
    "webhook_status" "text" DEFAULT 'pending'::"text",
    "receive_enabled" boolean DEFAULT true,
    "agent_enabled" boolean DEFAULT false,
    "allow_real_send" boolean DEFAULT false,
    "token_source" "text" DEFAULT 'legacy_env'::"text",
    "access_token_ciphertext" "text",
    "access_token_iv" "text",
    "access_token_auth_tag" "text",
    "token_expires_at" timestamp with time zone,
    "last_webhook_at" timestamp with time zone,
    "last_inbound_at" timestamp with time zone,
    "last_outbound_at" timestamp with time zone,
    "last_health_check_at" timestamp with time zone,
    "connected_at" timestamp with time zone,
    "approved_at" timestamp with time zone,
    "paused_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "last_error_code" "text",
    "last_error" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_by_user_id" "uuid",
    "meta_config_id" "text",
    "onboarding_source" "text" DEFAULT 'manual'::"text",
    "onboarding_session_id" "uuid",
    "subscribed_apps_at" timestamp with time zone,
    "phone_registered_at" timestamp with time zone,
    "token_last_rotated_at" timestamp with time zone,
    CONSTRAINT "whatsapp_connections_connection_status_check" CHECK (("connection_status" = ANY (ARRAY['pending'::"text", 'connected'::"text", 'pending_review'::"text", 'active'::"text", 'paused'::"text", 'error'::"text", 'revoked'::"text"]))),
    CONSTRAINT "whatsapp_connections_token_source_check" CHECK (("token_source" = ANY (ARRAY['legacy_env'::"text", 'encrypted_db'::"text", 'system_user'::"text"]))),
    CONSTRAINT "whatsapp_connections_webhook_status_check" CHECK (("webhook_status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'error'::"text", 'disabled'::"text"])))
);


ALTER TABLE "public"."whatsapp_connections" OWNER TO "postgres";


COMMENT ON COLUMN "public"."whatsapp_connections"."access_token" IS 'Columna heredada. No almacenar tokens nuevos sin cifrado. Usar access_token_ciphertext.';



CREATE TABLE IF NOT EXISTS "public"."whatsapp_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_slug" "text" DEFAULT 'cometa-mkt'::"text" NOT NULL,
    "wa_id" "text" NOT NULL,
    "phone" "text",
    "profile_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "connection_id" "uuid"
);


ALTER TABLE "public"."whatsapp_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "contact_name" "text",
    "contact_phone" "text",
    "message" "text",
    "direction" "text",
    "received_at" timestamp with time zone,
    "intent" "text",
    "product_interest" "text",
    "objection_detected" "text",
    "sentiment" "text",
    "raw_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."whatsapp_conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_embedded_signup_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "brand_slug" "text" NOT NULL,
    "brand_name" "text" NOT NULL,
    "state_hash" "text" NOT NULL,
    "status" "text" DEFAULT 'created'::"text" NOT NULL,
    "app_id" "text",
    "config_id" "text",
    "graph_api_version" "text",
    "meta_business_id" "text",
    "waba_id" "text",
    "phone_number_id" "text",
    "code_received_at" timestamp with time zone,
    "exchange_started_at" timestamp with time zone,
    "exchange_completed_at" timestamp with time zone,
    "error_code" "text",
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:20:00'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whatsapp_embedded_signup_sessions_status_check" CHECK (("status" = ANY (ARRAY['created'::"text", 'login_started'::"text", 'code_received'::"text", 'exchanging_token'::"text", 'subscribing_webhook'::"text", 'registering_phone'::"text", 'completed'::"text", 'failed'::"text", 'expired'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."whatsapp_embedded_signup_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "contact_name" "text",
    "contact_phone" "text",
    "source" "text",
    "product_interest" "text",
    "lead_status" "text" DEFAULT 'new'::"text",
    "objection" "text",
    "estimated_value" numeric,
    "quoted" boolean DEFAULT false,
    "purchased" boolean DEFAULT false,
    "lost_reason" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."whatsapp_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_message_statuses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_slug" "text" DEFAULT 'cometa-mkt'::"text" NOT NULL,
    "message_id" "text",
    "recipient_id" "text",
    "status" "text",
    "raw_status" "jsonb",
    "timestamp_text" "text",
    "timestamp_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "connection_id" "uuid"
);


ALTER TABLE "public"."whatsapp_message_statuses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_slug" "text" DEFAULT 'cometa-mkt'::"text" NOT NULL,
    "message_id" "text" NOT NULL,
    "wa_id" "text" NOT NULL,
    "phone_number_id" "text",
    "display_phone_number" "text",
    "direction" "text" DEFAULT 'inbound'::"text" NOT NULL,
    "message_type" "text",
    "content_text" "text",
    "raw_message" "jsonb",
    "timestamp_text" "text",
    "timestamp_at" timestamp with time zone,
    "status" "text" DEFAULT 'received'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "connection_id" "uuid"
);


ALTER TABLE "public"."whatsapp_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_unmatched_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phone_number_id" "text",
    "display_phone_number" "text",
    "event_type" "text" DEFAULT 'unknown_connection'::"text" NOT NULL,
    "reason" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."whatsapp_unmatched_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_slug" "text" DEFAULT 'cometa-mkt'::"text" NOT NULL,
    "event_type" "text",
    "payload" "jsonb" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "connection_id" "uuid"
);


ALTER TABLE "public"."whatsapp_webhook_events" OWNER TO "postgres";


ALTER TABLE ONLY "public"."agent_notifications"
    ADD CONSTRAINT "agent_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_activity"
    ADD CONSTRAINT "ai_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."atlas_hypotheses"
    ADD CONSTRAINT "atlas_hypotheses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."atlas_observations"
    ADD CONSTRAINT "atlas_observations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."atlas_strategy_versions"
    ADD CONSTRAINT "atlas_strategy_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."atlas_whatsapp_messages"
    ADD CONSTRAINT "atlas_whatsapp_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."brand_analysis"
    ADD CONSTRAINT "brand_analysis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."brand_evidence"
    ADD CONSTRAINT "brand_evidence_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."brand_memory"
    ADD CONSTRAINT "brand_memory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."brand_os_access"
    ADD CONSTRAINT "brand_os_access_pkey" PRIMARY KEY ("brand_slug");



ALTER TABLE ONLY "public"."brands"
    ADD CONSTRAINT "brands_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."brands"
    ADD CONSTRAINT "brands_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."briefs"
    ADD CONSTRAINT "briefs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_maps"
    ADD CONSTRAINT "business_maps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_connections"
    ADD CONSTRAINT "client_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content_performance"
    ADD CONSTRAINT "content_performance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content_publications"
    ADD CONSTRAINT "content_publications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."corrections"
    ADD CONSTRAINT "corrections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cosmos_agent_runs"
    ADD CONSTRAINT "cosmos_agent_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cosmos_memory"
    ADD CONSTRAINT "cosmos_memory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cosmos_strategies"
    ADD CONSTRAINT "cosmos_strategies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."decisions"
    ADD CONSTRAINT "decisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memory_items"
    ADD CONSTRAINT "memory_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mercury_agent_runs"
    ADD CONSTRAINT "mercury_agent_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mercury_brand_settings"
    ADD CONSTRAINT "mercury_brand_settings_brand_slug_key" UNIQUE ("brand_slug");



ALTER TABLE ONLY "public"."mercury_brand_settings"
    ADD CONSTRAINT "mercury_brand_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mercury_calendars"
    ADD CONSTRAINT "mercury_calendars_brand_slug_cycle_month_cycle_year_key" UNIQUE ("brand_slug", "cycle_month", "cycle_year");



ALTER TABLE ONLY "public"."mercury_calendars"
    ADD CONSTRAINT "mercury_calendars_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mercury_content_assets"
    ADD CONSTRAINT "mercury_content_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mercury_content_comments"
    ADD CONSTRAINT "mercury_content_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mercury_content_items"
    ADD CONSTRAINT "mercury_content_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mercury_content_reviews"
    ADD CONSTRAINT "mercury_content_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mercury_monthly_learnings"
    ADD CONSTRAINT "mercury_monthly_learnings_brand_slug_cycle_month_cycle_year_key" UNIQUE ("brand_slug", "cycle_month", "cycle_year");



ALTER TABLE ONLY "public"."mercury_monthly_learnings"
    ADD CONSTRAINT "mercury_monthly_learnings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mercury_piece_comments"
    ADD CONSTRAINT "mercury_piece_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mercury_team_assignments"
    ADD CONSTRAINT "mercury_team_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mercury_team_assignments"
    ADD CONSTRAINT "mercury_team_assignments_user_id_brand_slug_role_key" UNIQUE ("user_id", "brand_slug", "role");



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orion_evidence"
    ADD CONSTRAINT "orion_evidence_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orion_scrape_jobs"
    ADD CONSTRAINT "orion_scrape_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_analytics_snapshots"
    ADD CONSTRAINT "pos_analytics_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_brand_entitlement_overrides"
    ADD CONSTRAINT "pos_brand_entitlement_overrides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_branding"
    ADD CONSTRAINT "pos_branding_brand_slug_key" UNIQUE ("brand_slug");



ALTER TABLE ONLY "public"."pos_branding"
    ADD CONSTRAINT "pos_branding_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_business_capabilities"
    ADD CONSTRAINT "pos_business_capabilities_brand_slug_capability_code_key" UNIQUE ("brand_slug", "capability_code");



ALTER TABLE ONLY "public"."pos_business_capabilities"
    ADD CONSTRAINT "pos_business_capabilities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_business_profiles"
    ADD CONSTRAINT "pos_business_profiles_brand_slug_key" UNIQUE ("brand_slug");



ALTER TABLE ONLY "public"."pos_business_profiles"
    ADD CONSTRAINT "pos_business_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_capability_catalog"
    ADD CONSTRAINT "pos_capability_catalog_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."pos_cash_movements"
    ADD CONSTRAINT "pos_cash_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_cash_sessions"
    ADD CONSTRAINT "pos_cash_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_categories"
    ADD CONSTRAINT "pos_categories_brand_slug_name_key" UNIQUE ("brand_slug", "name");



ALTER TABLE ONLY "public"."pos_categories"
    ADD CONSTRAINT "pos_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_commercial_grants"
    ADD CONSTRAINT "pos_commercial_grants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_customers"
    ADD CONSTRAINT "pos_customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_entitlements"
    ADD CONSTRAINT "pos_entitlements_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."pos_entitlements"
    ADD CONSTRAINT "pos_entitlements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_intelligence_reports"
    ADD CONSTRAINT "pos_intelligence_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_intelligence_signals"
    ADD CONSTRAINT "pos_intelligence_signals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_inventory"
    ADD CONSTRAINT "pos_inventory_location_id_variant_id_key" UNIQUE ("location_id", "variant_id");



ALTER TABLE ONLY "public"."pos_inventory_movements"
    ADD CONSTRAINT "pos_inventory_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_inventory"
    ADD CONSTRAINT "pos_inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_inventory_receipt_items"
    ADD CONSTRAINT "pos_inventory_receipt_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_inventory_receipts"
    ADD CONSTRAINT "pos_inventory_receipts_brand_slug_receipt_number_key" UNIQUE ("brand_slug", "receipt_number");



ALTER TABLE ONLY "public"."pos_inventory_receipts"
    ADD CONSTRAINT "pos_inventory_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_locations"
    ADD CONSTRAINT "pos_locations_brand_slug_code_key" UNIQUE ("brand_slug", "code");



ALTER TABLE ONLY "public"."pos_locations"
    ADD CONSTRAINT "pos_locations_brand_slug_name_key" UNIQUE ("brand_slug", "name");



ALTER TABLE ONLY "public"."pos_locations"
    ADD CONSTRAINT "pos_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_loyalty_members"
    ADD CONSTRAINT "pos_loyalty_members_brand_slug_member_number_key" UNIQUE ("brand_slug", "member_number");



ALTER TABLE ONLY "public"."pos_loyalty_members"
    ADD CONSTRAINT "pos_loyalty_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_loyalty_members"
    ADD CONSTRAINT "pos_loyalty_members_program_id_customer_id_key" UNIQUE ("program_id", "customer_id");



ALTER TABLE ONLY "public"."pos_loyalty_programs"
    ADD CONSTRAINT "pos_loyalty_programs_brand_slug_key" UNIQUE ("brand_slug");



ALTER TABLE ONLY "public"."pos_loyalty_programs"
    ADD CONSTRAINT "pos_loyalty_programs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_loyalty_redemptions"
    ADD CONSTRAINT "pos_loyalty_redemptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_loyalty_reward_unlocks"
    ADD CONSTRAINT "pos_loyalty_reward_unlocks_cycle_uq" UNIQUE ("visit_program_id", "member_id", "cycle_number");



ALTER TABLE ONLY "public"."pos_loyalty_reward_unlocks"
    ADD CONSTRAINT "pos_loyalty_reward_unlocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_loyalty_rewards"
    ADD CONSTRAINT "pos_loyalty_rewards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_loyalty_tiers"
    ADD CONSTRAINT "pos_loyalty_tiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_loyalty_tiers"
    ADD CONSTRAINT "pos_loyalty_tiers_program_id_name_key" UNIQUE ("program_id", "name");



ALTER TABLE ONLY "public"."pos_loyalty_transactions"
    ADD CONSTRAINT "pos_loyalty_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_loyalty_visit_events"
    ADD CONSTRAINT "pos_loyalty_visit_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_loyalty_visit_programs"
    ADD CONSTRAINT "pos_loyalty_visit_programs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_loyalty_visit_programs"
    ADD CONSTRAINT "pos_loyalty_visit_programs_program_name_uq" UNIQUE ("loyalty_program_id", "name");



ALTER TABLE ONLY "public"."pos_payments"
    ADD CONSTRAINT "pos_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_plan_entitlements"
    ADD CONSTRAINT "pos_plan_entitlements_pkey" PRIMARY KEY ("plan_code", "entitlement_id");



ALTER TABLE ONLY "public"."pos_plan_limits"
    ADD CONSTRAINT "pos_plan_limits_pkey" PRIMARY KEY ("plan_code");



ALTER TABLE ONLY "public"."pos_plans"
    ADD CONSTRAINT "pos_plans_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."pos_product_attribute_definitions"
    ADD CONSTRAINT "pos_product_attribute_definitions_brand_slug_code_key" UNIQUE ("brand_slug", "code");



ALTER TABLE ONLY "public"."pos_product_attribute_definitions"
    ADD CONSTRAINT "pos_product_attribute_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_product_components"
    ADD CONSTRAINT "pos_product_components_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_product_components"
    ADD CONSTRAINT "pos_product_components_product_id_component_variant_id_key" UNIQUE ("product_id", "component_variant_id");



ALTER TABLE ONLY "public"."pos_product_variants"
    ADD CONSTRAINT "pos_product_variants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_products"
    ADD CONSTRAINT "pos_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_profile_attribute_defaults"
    ADD CONSTRAINT "pos_profile_attribute_defaults_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_profile_attribute_defaults"
    ADD CONSTRAINT "pos_profile_attribute_defaults_profile_code_code_key" UNIQUE ("profile_code", "code");



ALTER TABLE ONLY "public"."pos_profile_capability_defaults"
    ADD CONSTRAINT "pos_profile_capability_defaults_pkey" PRIMARY KEY ("profile_code", "capability_code");



ALTER TABLE ONLY "public"."pos_profile_catalog"
    ADD CONSTRAINT "pos_profile_catalog_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."pos_registers"
    ADD CONSTRAINT "pos_registers_location_id_code_key" UNIQUE ("location_id", "code");



ALTER TABLE ONLY "public"."pos_registers"
    ADD CONSTRAINT "pos_registers_location_id_name_key" UNIQUE ("location_id", "name");



ALTER TABLE ONLY "public"."pos_registers"
    ADD CONSTRAINT "pos_registers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_sale_items"
    ADD CONSTRAINT "pos_sale_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_sale_loyalty_tier_snapshots"
    ADD CONSTRAINT "pos_sale_loyalty_tier_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_sale_loyalty_tier_snapshots"
    ADD CONSTRAINT "pos_sale_loyalty_tier_snapshots_sale_unique" UNIQUE ("sale_id");



ALTER TABLE ONLY "public"."pos_sale_loyalty_visit_snapshots"
    ADD CONSTRAINT "pos_sale_loyalty_visit_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_sale_loyalty_visit_snapshots"
    ADD CONSTRAINT "pos_sale_loyalty_visit_snapshots_sale_uq" UNIQUE ("sale_id");



ALTER TABLE ONLY "public"."pos_sales"
    ADD CONSTRAINT "pos_sales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_sales"
    ADD CONSTRAINT "pos_sales_sale_number_key" UNIQUE ("sale_number");



ALTER TABLE ONLY "public"."pos_signal_rule_configs"
    ADD CONSTRAINT "pos_signal_rule_configs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_signal_rule_configs"
    ADD CONSTRAINT "pos_signal_rule_configs_uq" UNIQUE ("brand_slug", "signal_type");



ALTER TABLE ONLY "public"."pos_stripe_billing_links"
    ADD CONSTRAINT "pos_stripe_billing_links_brand_mode_key" UNIQUE ("brand_slug", "livemode");



ALTER TABLE ONLY "public"."pos_stripe_billing_links"
    ADD CONSTRAINT "pos_stripe_billing_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_subscription_events"
    ADD CONSTRAINT "pos_subscription_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_subscriptions"
    ADD CONSTRAINT "pos_subscriptions_brand_slug_key" UNIQUE ("brand_slug");



ALTER TABLE ONLY "public"."pos_subscriptions"
    ADD CONSTRAINT "pos_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_unit_conversions"
    ADD CONSTRAINT "pos_unit_conversions_from_unit_code_to_unit_code_key" UNIQUE ("from_unit_code", "to_unit_code");



ALTER TABLE ONLY "public"."pos_unit_conversions"
    ADD CONSTRAINT "pos_unit_conversions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_units"
    ADD CONSTRAINT "pos_units_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."pos_user_invitations"
    ADD CONSTRAINT "pos_user_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_variant_purchase_presentations"
    ADD CONSTRAINT "pos_variant_purchase_presentations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_wallet_passes"
    ADD CONSTRAINT "pos_wallet_passes_member_id_platform_key" UNIQUE ("member_id", "platform");



ALTER TABLE ONLY "public"."pos_wallet_passes"
    ADD CONSTRAINT "pos_wallet_passes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_wallet_passes"
    ADD CONSTRAINT "pos_wallet_passes_platform_serial_number_key" UNIQUE ("platform", "serial_number");



ALTER TABLE ONLY "public"."sales_agent_runs"
    ADD CONSTRAINT "sales_agent_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_ai_insights"
    ADD CONSTRAINT "sales_ai_insights_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_ai_leads"
    ADD CONSTRAINT "sales_ai_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_ai_reports"
    ADD CONSTRAINT "sales_ai_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_ai_settings"
    ADD CONSTRAINT "sales_ai_settings_brand_name_key" UNIQUE ("brand_name");



ALTER TABLE ONLY "public"."sales_ai_settings"
    ADD CONSTRAINT "sales_ai_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_business_rules"
    ADD CONSTRAINT "sales_business_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_catalog_items"
    ADD CONSTRAINT "sales_catalog_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_channels"
    ADD CONSTRAINT "sales_channels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_faqs"
    ADD CONSTRAINT "sales_faqs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_followups"
    ADD CONSTRAINT "sales_followups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_knowledge_sources"
    ADD CONSTRAINT "sales_knowledge_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_leads"
    ADD CONSTRAINT "sales_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_messages"
    ADD CONSTRAINT "sales_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_outbound_messages"
    ADD CONSTRAINT "sales_outbound_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_playbook_suggestions"
    ADD CONSTRAINT "sales_playbook_suggestions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_playbooks"
    ADD CONSTRAINT "sales_playbooks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_metrics_daily"
    ADD CONSTRAINT "social_metrics_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."strategy_analysis"
    ADD CONSTRAINT "strategy_analysis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."strategy_publications"
    ADD CONSTRAINT "strategy_publications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_brand_access"
    ADD CONSTRAINT "user_brand_access_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_brand_access"
    ADD CONSTRAINT "user_brand_access_user_id_brand_slug_key" UNIQUE ("user_id", "brand_slug");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."whatsapp_connection_events"
    ADD CONSTRAINT "whatsapp_connection_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_connection_secrets"
    ADD CONSTRAINT "whatsapp_connection_secrets_connection_id_key" UNIQUE ("connection_id");



ALTER TABLE ONLY "public"."whatsapp_connection_secrets"
    ADD CONSTRAINT "whatsapp_connection_secrets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_connections"
    ADD CONSTRAINT "whatsapp_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_contacts"
    ADD CONSTRAINT "whatsapp_contacts_brand_slug_wa_id_key" UNIQUE ("brand_slug", "wa_id");



ALTER TABLE ONLY "public"."whatsapp_contacts"
    ADD CONSTRAINT "whatsapp_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_conversations"
    ADD CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_embedded_signup_sessions"
    ADD CONSTRAINT "whatsapp_embedded_signup_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_embedded_signup_sessions"
    ADD CONSTRAINT "whatsapp_embedded_signup_sessions_state_hash_key" UNIQUE ("state_hash");



ALTER TABLE ONLY "public"."whatsapp_leads"
    ADD CONSTRAINT "whatsapp_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_message_statuses"
    ADD CONSTRAINT "whatsapp_message_statuses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_message_id_key" UNIQUE ("message_id");



ALTER TABLE ONLY "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_unmatched_events"
    ADD CONSTRAINT "whatsapp_unmatched_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_webhook_events"
    ADD CONSTRAINT "whatsapp_webhook_events_pkey" PRIMARY KEY ("id");



CREATE INDEX "agent_notifications_agent_idx" ON "public"."agent_notifications" USING "btree" ("agent_name");



CREATE INDEX "agent_notifications_brand_slug_idx" ON "public"."agent_notifications" USING "btree" ("brand_slug");



CREATE INDEX "agent_notifications_created_at_idx" ON "public"."agent_notifications" USING "btree" ("created_at" DESC);



CREATE INDEX "agent_notifications_status_idx" ON "public"."agent_notifications" USING "btree" ("status");



CREATE INDEX "brand_analysis_brand_slug_idx" ON "public"."brand_analysis" USING "btree" ("brand_slug");



CREATE INDEX "brand_evidence_brand_name_idx" ON "public"."brand_evidence" USING "btree" ("lower"("brand_name"));



CREATE INDEX "brand_evidence_created_at_idx" ON "public"."brand_evidence" USING "btree" ("created_at" DESC);



CREATE INDEX "brand_evidence_source_idx" ON "public"."brand_evidence" USING "btree" ("source");



CREATE UNIQUE INDEX "brands_creator_creation_key_uidx" ON "public"."brands" USING "btree" ("created_by", "creation_idempotency_key") WHERE ("creation_idempotency_key" IS NOT NULL);



CREATE INDEX "brands_status_idx" ON "public"."brands" USING "btree" ("status");



CREATE INDEX "clients_brand_slug_idx" ON "public"."clients" USING "btree" ("brand_slug");



CREATE INDEX "content_publications_brand_name_idx" ON "public"."content_publications" USING "btree" ("brand_name");



CREATE INDEX "content_publications_brand_slug_idx" ON "public"."content_publications" USING "btree" ("brand_slug");



CREATE INDEX "content_publications_visible_idx" ON "public"."content_publications" USING "btree" ("brand_slug", "is_client_visible", "published_at" DESC);



CREATE UNIQUE INDEX "cosmos_memory_brand_name_unique" ON "public"."cosmos_memory" USING "btree" ("lower"("brand_name"));



CREATE INDEX "cosmos_memory_brand_slug_idx" ON "public"."cosmos_memory" USING "btree" ("brand_slug");



CREATE INDEX "idx_ai_activity_client_id" ON "public"."ai_activity" USING "btree" ("client_id");



CREATE INDEX "idx_briefs_client_id" ON "public"."briefs" USING "btree" ("client_id");



CREATE INDEX "idx_corrections_client_id" ON "public"."corrections" USING "btree" ("client_id");



CREATE INDEX "idx_cosmos_strategies_client_status" ON "public"."cosmos_strategies" USING "btree" ("client_id", "status");



CREATE INDEX "idx_cosmos_strategies_client_version" ON "public"."cosmos_strategies" USING "btree" ("client_id", "version");



CREATE INDEX "idx_memory_items_client_id" ON "public"."memory_items" USING "btree" ("client_id");



CREATE INDEX "idx_mercury_agent_runs_brand" ON "public"."mercury_agent_runs" USING "btree" ("brand_slug", "created_at" DESC);



CREATE INDEX "idx_mercury_brand_settings_slug" ON "public"."mercury_brand_settings" USING "btree" ("brand_slug");



CREATE INDEX "idx_mercury_calendars_brand_cycle" ON "public"."mercury_calendars" USING "btree" ("brand_slug", "cycle_year", "cycle_month");



CREATE INDEX "idx_mercury_content_items_assigned_to" ON "public"."mercury_content_items" USING "btree" ("assigned_to");



CREATE INDEX "idx_mercury_content_items_brand_status" ON "public"."mercury_content_items" USING "btree" ("brand_slug", "status");



CREATE INDEX "idx_mercury_content_items_calendar" ON "public"."mercury_content_items" USING "btree" ("calendar_id");



CREATE INDEX "idx_mercury_content_items_due_date" ON "public"."mercury_content_items" USING "btree" ("due_date");



CREATE INDEX "idx_mercury_team_assignments_brand" ON "public"."mercury_team_assignments" USING "btree" ("brand_slug");



CREATE INDEX "idx_mercury_team_assignments_user" ON "public"."mercury_team_assignments" USING "btree" ("user_id");



CREATE INDEX "idx_opportunities_client_id" ON "public"."opportunities" USING "btree" ("client_id");



CREATE INDEX "idx_orion_evidence_brand_analysis_id" ON "public"."orion_evidence" USING "btree" ("brand_analysis_id");



CREATE INDEX "idx_orion_evidence_brand_name" ON "public"."orion_evidence" USING "btree" ("brand_name");



CREATE INDEX "idx_orion_evidence_created_at" ON "public"."orion_evidence" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_orion_evidence_source_type" ON "public"."orion_evidence" USING "btree" ("source_type");



CREATE INDEX "idx_orion_scrape_jobs_brand_analysis_id" ON "public"."orion_scrape_jobs" USING "btree" ("brand_analysis_id");



CREATE INDEX "idx_orion_scrape_jobs_created_at" ON "public"."orion_scrape_jobs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_orion_scrape_jobs_status" ON "public"."orion_scrape_jobs" USING "btree" ("status");



CREATE INDEX "memory_items_embedding_idx" ON "public"."memory_items" USING "ivfflat" ("embedding" "public"."vector_cosine_ops") WITH ("lists"='100');



CREATE INDEX "mercury_content_assets_asset_status_idx" ON "public"."mercury_content_assets" USING "btree" ("asset_status");



CREATE INDEX "mercury_content_assets_brand_slug_idx" ON "public"."mercury_content_assets" USING "btree" ("brand_slug");



CREATE INDEX "mercury_content_assets_calendar_id_idx" ON "public"."mercury_content_assets" USING "btree" ("calendar_id");



CREATE INDEX "mercury_content_assets_content_item_id_idx" ON "public"."mercury_content_assets" USING "btree" ("content_item_id");



CREATE INDEX "mercury_piece_comments_content_piece_id_idx" ON "public"."mercury_piece_comments" USING "btree" ("content_piece_id");



CREATE INDEX "pos_analytics_snapshots_brand_period_idx" ON "public"."pos_analytics_snapshots" USING "btree" ("brand_slug", "period_start" DESC);



CREATE INDEX "pos_analytics_snapshots_brand_type_created_idx" ON "public"."pos_analytics_snapshots" USING "btree" ("brand_slug", "snapshot_type", "created_at" DESC);



CREATE INDEX "pos_attribute_definitions_brand_sort_idx" ON "public"."pos_product_attribute_definitions" USING "btree" ("brand_slug", "active", "sort_order");



CREATE INDEX "pos_brand_entitlement_overrides_brand_idx" ON "public"."pos_brand_entitlement_overrides" USING "btree" ("brand_slug", "entitlement_id");



CREATE INDEX "pos_brand_entitlement_overrides_resolve_idx" ON "public"."pos_brand_entitlement_overrides" USING "btree" ("brand_slug", "entitlement_id", "starts_at" DESC, "ends_at", "created_at" DESC);



CREATE INDEX "pos_business_capabilities_brand_idx" ON "public"."pos_business_capabilities" USING "btree" ("brand_slug", "enabled");



CREATE INDEX "pos_business_profiles_profile_idx" ON "public"."pos_business_profiles" USING "btree" ("profile_code");



CREATE INDEX "pos_cash_sessions_brand_status_idx" ON "public"."pos_cash_sessions" USING "btree" ("brand_slug", "status", "opened_at" DESC);



CREATE INDEX "pos_commercial_grants_effective_idx" ON "public"."pos_commercial_grants" USING "btree" ("brand_slug", "starts_at", "ends_at") WHERE ("status" = 'active'::"text");



CREATE INDEX "pos_customers_brand_created_idx" ON "public"."pos_customers" USING "btree" ("brand_slug", "created_at" DESC);



CREATE UNIQUE INDEX "pos_customers_unique_email" ON "public"."pos_customers" USING "btree" ("brand_slug", "lower"("email")) WHERE (("email" IS NOT NULL) AND ("email" <> ''::"text"));



CREATE UNIQUE INDEX "pos_customers_unique_phone" ON "public"."pos_customers" USING "btree" ("brand_slug", "phone") WHERE (("phone" IS NOT NULL) AND ("phone" <> ''::"text"));



CREATE UNIQUE INDEX "pos_intelligence_reports_idempotency_uidx" ON "public"."pos_intelligence_reports" USING "btree" ("brand_slug", COALESCE("location_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "report_type", "period_start", "period_end", "input_hash", "prompt_version", "model") WHERE ("generation_status" = 'completed'::"text");



CREATE INDEX "pos_intelligence_reports_scope_generated_idx" ON "public"."pos_intelligence_reports" USING "btree" ("brand_slug", "location_id", "generated_at" DESC);



CREATE INDEX "pos_intelligence_reports_scope_type_period_idx" ON "public"."pos_intelligence_reports" USING "btree" ("brand_slug", "report_type", "period_end" DESC);



CREATE INDEX "pos_intelligence_signals_brand_status_detected_idx" ON "public"."pos_intelligence_signals" USING "btree" ("brand_slug", "status", "detected_at" DESC);



CREATE INDEX "pos_intelligence_signals_brand_type_status_idx" ON "public"."pos_intelligence_signals" USING "btree" ("brand_slug", "signal_type", "status");



CREATE INDEX "pos_intelligence_signals_entity_idx" ON "public"."pos_intelligence_signals" USING "btree" ("brand_slug", "entity_type", "entity_id");



CREATE UNIQUE INDEX "pos_intelligence_signals_open_dedupe_uidx" ON "public"."pos_intelligence_signals" USING "btree" ("brand_slug", COALESCE("location_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "dedupe_key") WHERE ("status" = ANY (ARRAY['open'::"text", 'acknowledged'::"text"]));



CREATE INDEX "pos_inventory_brand_location_idx" ON "public"."pos_inventory" USING "btree" ("brand_slug", "location_id");



CREATE INDEX "pos_inventory_movements_brand_created_idx" ON "public"."pos_inventory_movements" USING "btree" ("brand_slug", "created_at" DESC);



CREATE INDEX "pos_inventory_receipt_items_receipt_idx" ON "public"."pos_inventory_receipt_items" USING "btree" ("receipt_id", "created_at");



CREATE INDEX "pos_inventory_receipt_items_variant_idx" ON "public"."pos_inventory_receipt_items" USING "btree" ("variant_id", "created_at" DESC);



CREATE INDEX "pos_inventory_receipts_brand_date_idx" ON "public"."pos_inventory_receipts" USING "btree" ("brand_slug", "received_at" DESC);



CREATE UNIQUE INDEX "pos_inventory_receipts_brand_idempotency_uidx" ON "public"."pos_inventory_receipts" USING "btree" ("brand_slug", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "pos_inventory_receipts_location_idx" ON "public"."pos_inventory_receipts" USING "btree" ("location_id", "received_at" DESC);



CREATE INDEX "pos_inventory_variant_idx" ON "public"."pos_inventory" USING "btree" ("variant_id");



CREATE INDEX "pos_locations_brand_idx" ON "public"."pos_locations" USING "btree" ("brand_slug", "active");



CREATE INDEX "pos_loyalty_members_brand_idx" ON "public"."pos_loyalty_members" USING "btree" ("brand_slug", "status");



CREATE UNIQUE INDEX "pos_loyalty_redemptions_one_per_sale_uidx" ON "public"."pos_loyalty_redemptions" USING "btree" ("sale_id") WHERE ("sale_id" IS NOT NULL);



CREATE INDEX "pos_loyalty_reward_unlocks_brand_status_idx" ON "public"."pos_loyalty_reward_unlocks" USING "btree" ("brand_slug", "status");



CREATE INDEX "pos_loyalty_reward_unlocks_member_status_idx" ON "public"."pos_loyalty_reward_unlocks" USING "btree" ("member_id", "status");



CREATE INDEX "pos_loyalty_reward_unlocks_redeemed_sale_idx" ON "public"."pos_loyalty_reward_unlocks" USING "btree" ("redeemed_sale_id");



CREATE UNIQUE INDEX "pos_loyalty_reward_unlocks_redeemed_sale_uidx" ON "public"."pos_loyalty_reward_unlocks" USING "btree" ("redeemed_sale_id") WHERE ("redeemed_sale_id" IS NOT NULL);



CREATE INDEX "pos_loyalty_reward_unlocks_reward_idx" ON "public"."pos_loyalty_reward_unlocks" USING "btree" ("reward_id");



CREATE INDEX "pos_loyalty_reward_unlocks_source_sale_idx" ON "public"."pos_loyalty_reward_unlocks" USING "btree" ("source_sale_id");



CREATE UNIQUE INDEX "pos_loyalty_tiers_program_threshold_uidx" ON "public"."pos_loyalty_tiers" USING "btree" ("program_id", "minimum_lifetime_points");



CREATE INDEX "pos_loyalty_transactions_member_idx" ON "public"."pos_loyalty_transactions" USING "btree" ("member_id", "created_at" DESC);



CREATE INDEX "pos_loyalty_visit_events_brand_idx" ON "public"."pos_loyalty_visit_events" USING "btree" ("brand_slug");



CREATE INDEX "pos_loyalty_visit_events_member_created_idx" ON "public"."pos_loyalty_visit_events" USING "btree" ("member_id", "created_at" DESC);



CREATE INDEX "pos_loyalty_visit_events_program_member_idx" ON "public"."pos_loyalty_visit_events" USING "btree" ("visit_program_id", "member_id");



CREATE UNIQUE INDEX "pos_loyalty_visit_events_qualify_sale_uidx" ON "public"."pos_loyalty_visit_events" USING "btree" ("visit_program_id", "sale_id") WHERE ("event_type" = 'qualify'::"text");



CREATE UNIQUE INDEX "pos_loyalty_visit_events_reverse_uidx" ON "public"."pos_loyalty_visit_events" USING "btree" ("reverses_event_id") WHERE ("event_type" = 'reverse'::"text");



CREATE INDEX "pos_loyalty_visit_events_sale_idx" ON "public"."pos_loyalty_visit_events" USING "btree" ("sale_id");



CREATE INDEX "pos_loyalty_visit_programs_active_window_idx" ON "public"."pos_loyalty_visit_programs" USING "btree" ("brand_slug", "active", "starts_at", "ends_at");



CREATE INDEX "pos_loyalty_visit_programs_brand_idx" ON "public"."pos_loyalty_visit_programs" USING "btree" ("brand_slug");



CREATE INDEX "pos_loyalty_visit_programs_program_idx" ON "public"."pos_loyalty_visit_programs" USING "btree" ("loyalty_program_id");



CREATE UNIQUE INDEX "pos_one_default_variant_per_product" ON "public"."pos_product_variants" USING "btree" ("product_id") WHERE ("is_default" = true);



CREATE UNIQUE INDEX "pos_one_open_session_per_register" ON "public"."pos_cash_sessions" USING "btree" ("register_id") WHERE ("status" = 'open'::"text");



CREATE INDEX "pos_payments_analytics_sale_method_idx" ON "public"."pos_payments" USING "btree" ("sale_id", "payment_method");



CREATE INDEX "pos_payments_sale_idx" ON "public"."pos_payments" USING "btree" ("sale_id");



CREATE INDEX "pos_product_components_product_idx" ON "public"."pos_product_components" USING "btree" ("product_id", "active", "sort_order");



CREATE INDEX "pos_product_components_variant_idx" ON "public"."pos_product_components" USING "btree" ("component_variant_id");



CREATE UNIQUE INDEX "pos_product_variants_brand_barcode_uidx" ON "public"."pos_product_variants" USING "btree" ("brand_slug", "lower"("btrim"("barcode"))) WHERE (("barcode" IS NOT NULL) AND ("btrim"("barcode") <> ''::"text"));



CREATE UNIQUE INDEX "pos_product_variants_brand_sku_uidx" ON "public"."pos_product_variants" USING "btree" ("brand_slug", "lower"("btrim"("sku"))) WHERE (("sku" IS NOT NULL) AND ("btrim"("sku") <> ''::"text"));



CREATE UNIQUE INDEX "pos_product_variants_product_signature_uidx" ON "public"."pos_product_variants" USING "btree" ("product_id", "variant_signature");



CREATE INDEX "pos_product_variants_product_sort_idx" ON "public"."pos_product_variants" USING "btree" ("product_id", "sort_order", "created_at");



CREATE UNIQUE INDEX "pos_product_variants_unique_barcode" ON "public"."pos_product_variants" USING "btree" ("brand_slug", "barcode") WHERE (("barcode" IS NOT NULL) AND ("btrim"("barcode") <> ''::"text"));



CREATE UNIQUE INDEX "pos_product_variants_unique_sku" ON "public"."pos_product_variants" USING "btree" ("brand_slug", "lower"("sku")) WHERE (("sku" IS NOT NULL) AND ("btrim"("sku") <> ''::"text"));



CREATE INDEX "pos_products_brand_active_idx" ON "public"."pos_products" USING "btree" ("brand_slug", "active", "created_at" DESC);



CREATE UNIQUE INDEX "pos_products_brand_product_code_uidx" ON "public"."pos_products" USING "btree" ("brand_slug", "lower"("btrim"("product_code"))) WHERE (("product_code" IS NOT NULL) AND ("btrim"("product_code") <> ''::"text"));



CREATE INDEX "pos_products_brand_type_idx" ON "public"."pos_products" USING "btree" ("brand_slug", "product_type", "active");



CREATE INDEX "pos_products_inventory_mode_idx" ON "public"."pos_products" USING "btree" ("brand_slug", "inventory_mode", "active");



CREATE INDEX "pos_purchase_presentations_brand_idx" ON "public"."pos_variant_purchase_presentations" USING "btree" ("brand_slug", "active", "created_at");



CREATE UNIQUE INDEX "pos_purchase_presentations_unique_barcode" ON "public"."pos_variant_purchase_presentations" USING "btree" ("brand_slug", "barcode") WHERE (("barcode" IS NOT NULL) AND ("btrim"("barcode") <> ''::"text"));



CREATE UNIQUE INDEX "pos_purchase_presentations_unique_supplier_sku" ON "public"."pos_variant_purchase_presentations" USING "btree" ("brand_slug", "lower"("supplier_sku")) WHERE (("supplier_sku" IS NOT NULL) AND ("btrim"("supplier_sku") <> ''::"text"));



CREATE INDEX "pos_purchase_presentations_variant_idx" ON "public"."pos_variant_purchase_presentations" USING "btree" ("variant_id", "active", "created_at");



CREATE INDEX "pos_registers_brand_location_idx" ON "public"."pos_registers" USING "btree" ("brand_slug", "location_id");



CREATE INDEX "pos_sale_items_analytics_variant_sale_idx" ON "public"."pos_sale_items" USING "btree" ("variant_id", "sale_id");



CREATE INDEX "pos_sale_items_sale_idx" ON "public"."pos_sale_items" USING "btree" ("sale_id");



CREATE INDEX "pos_sale_loyalty_tier_snapshots_brand_member_idx" ON "public"."pos_sale_loyalty_tier_snapshots" USING "btree" ("brand_slug", "member_id", "created_at" DESC);



CREATE INDEX "pos_sales_analytics_brand_customer_sold_idx" ON "public"."pos_sales" USING "btree" ("brand_slug", "customer_id", "sold_at" DESC) WHERE (("status" = 'completed'::"text") AND ("customer_id" IS NOT NULL));



CREATE INDEX "pos_sales_analytics_brand_status_sold_idx" ON "public"."pos_sales" USING "btree" ("brand_slug", "status", "sold_at" DESC);



CREATE UNIQUE INDEX "pos_sales_brand_idempotency_uidx" ON "public"."pos_sales" USING "btree" ("brand_slug", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "pos_sales_brand_sold_at_idx" ON "public"."pos_sales" USING "btree" ("brand_slug", "sold_at" DESC);



CREATE INDEX "pos_sales_session_idx" ON "public"."pos_sales" USING "btree" ("cash_session_id", "status");



CREATE UNIQUE INDEX "pos_stripe_billing_links_customer_key" ON "public"."pos_stripe_billing_links" USING "btree" ("livemode", "stripe_customer_id") WHERE ("stripe_customer_id" IS NOT NULL);



CREATE UNIQUE INDEX "pos_stripe_billing_links_subscription_key" ON "public"."pos_stripe_billing_links" USING "btree" ("livemode", "stripe_subscription_id") WHERE ("stripe_subscription_id" IS NOT NULL);



CREATE INDEX "pos_subscription_events_brand_idx" ON "public"."pos_subscription_events" USING "btree" ("brand_slug", "created_at" DESC);



CREATE INDEX "pos_subscriptions_status_idx" ON "public"."pos_subscriptions" USING "btree" ("status", "current_period_end");



CREATE UNIQUE INDEX "pos_subscriptions_stripe_customer_uidx" ON "public"."pos_subscriptions" USING "btree" ("stripe_customer_id") WHERE ("stripe_customer_id" IS NOT NULL);



CREATE UNIQUE INDEX "pos_subscriptions_stripe_subscription_uidx" ON "public"."pos_subscriptions" USING "btree" ("stripe_subscription_id") WHERE ("stripe_subscription_id" IS NOT NULL);



CREATE INDEX "pos_user_invitations_brand_status_idx" ON "public"."pos_user_invitations" USING "btree" ("brand_slug", "status", "expires_at");



CREATE UNIQUE INDEX "pos_user_invitations_pending_email_uidx" ON "public"."pos_user_invitations" USING "btree" ("brand_slug", "email") WHERE ("status" = 'pending'::"text");



CREATE INDEX "pos_variants_product_idx" ON "public"."pos_product_variants" USING "btree" ("product_id", "active");



CREATE INDEX "sales_ai_leads_automation_status_idx" ON "public"."sales_ai_leads" USING "btree" ("automation_status");



CREATE INDEX "sales_ai_leads_brand_analysis_id_idx" ON "public"."sales_ai_leads" USING "btree" ("brand_analysis_id");



CREATE INDEX "sales_ai_leads_brand_name_idx" ON "public"."sales_ai_leads" USING "btree" ("brand_name");



CREATE INDEX "sales_ai_leads_close_probability_idx" ON "public"."sales_ai_leads" USING "btree" ("close_probability");



CREATE INDEX "sales_ai_leads_lead_status_idx" ON "public"."sales_ai_leads" USING "btree" ("lead_status");



CREATE INDEX "sales_ai_leads_lead_temperature_idx" ON "public"."sales_ai_leads" USING "btree" ("lead_temperature");



CREATE INDEX "sales_ai_leads_next_follow_up_at_idx" ON "public"."sales_ai_leads" USING "btree" ("next_follow_up_at");



CREATE INDEX "sales_ai_leads_requires_human_review_idx" ON "public"."sales_ai_leads" USING "btree" ("requires_human_review");



CREATE INDEX "sales_ai_settings_brand_name_idx" ON "public"."sales_ai_settings" USING "btree" ("brand_name");



CREATE INDEX "sales_business_rules_active_idx" ON "public"."sales_business_rules" USING "btree" ("is_active");



CREATE INDEX "sales_business_rules_brand_name_idx" ON "public"."sales_business_rules" USING "btree" ("brand_name");



CREATE INDEX "sales_business_rules_priority_idx" ON "public"."sales_business_rules" USING "btree" ("priority");



CREATE INDEX "sales_business_rules_type_idx" ON "public"."sales_business_rules" USING "btree" ("rule_type");



CREATE INDEX "sales_catalog_items_active_idx" ON "public"."sales_catalog_items" USING "btree" ("is_active");



CREATE INDEX "sales_catalog_items_brand_name_idx" ON "public"."sales_catalog_items" USING "btree" ("brand_name");



CREATE INDEX "sales_catalog_items_category_idx" ON "public"."sales_catalog_items" USING "btree" ("category");



CREATE INDEX "sales_catalog_items_type_idx" ON "public"."sales_catalog_items" USING "btree" ("item_type");



CREATE UNIQUE INDEX "sales_channels_phone_number_id_unique" ON "public"."sales_channels" USING "btree" ("whatsapp_phone_number_id");



CREATE INDEX "sales_faqs_active_idx" ON "public"."sales_faqs" USING "btree" ("is_active");



CREATE INDEX "sales_faqs_brand_name_idx" ON "public"."sales_faqs" USING "btree" ("brand_name");



CREATE INDEX "sales_faqs_intent_idx" ON "public"."sales_faqs" USING "btree" ("intent");



CREATE INDEX "sales_knowledge_sources_active_idx" ON "public"."sales_knowledge_sources" USING "btree" ("is_active");



CREATE INDEX "sales_knowledge_sources_brand_name_idx" ON "public"."sales_knowledge_sources" USING "btree" ("brand_name");



CREATE INDEX "sales_knowledge_sources_type_idx" ON "public"."sales_knowledge_sources" USING "btree" ("source_type");



CREATE INDEX "sales_leads_brand_name_phone_idx" ON "public"."sales_leads" USING "btree" ("brand_name", "phone");



CREATE INDEX "sales_leads_brand_slug_idx" ON "public"."sales_leads" USING "btree" ("brand_slug");



CREATE INDEX "sales_messages_brand_name_idx" ON "public"."sales_messages" USING "btree" ("brand_name");



CREATE INDEX "sales_messages_lead_id_idx" ON "public"."sales_messages" USING "btree" ("lead_id");



CREATE UNIQUE INDEX "sales_messages_whatsapp_message_id_unique" ON "public"."sales_messages" USING "btree" ("whatsapp_message_id") WHERE ("whatsapp_message_id" IS NOT NULL);



CREATE INDEX "sales_playbook_suggestions_brand_name_idx" ON "public"."sales_playbook_suggestions" USING "btree" ("brand_name");



CREATE INDEX "sales_playbook_suggestions_status_idx" ON "public"."sales_playbook_suggestions" USING "btree" ("status");



CREATE INDEX "sales_playbook_suggestions_type_idx" ON "public"."sales_playbook_suggestions" USING "btree" ("suggestion_type");



CREATE INDEX "strategy_analysis_brand_analysis_id_idx" ON "public"."strategy_analysis" USING "btree" ("brand_analysis_id");



CREATE INDEX "strategy_analysis_created_at_idx" ON "public"."strategy_analysis" USING "btree" ("created_at" DESC);



CREATE INDEX "strategy_publications_brand_name_idx" ON "public"."strategy_publications" USING "btree" ("brand_name");



CREATE INDEX "strategy_publications_brand_slug_idx" ON "public"."strategy_publications" USING "btree" ("brand_slug");



CREATE INDEX "strategy_publications_visible_idx" ON "public"."strategy_publications" USING "btree" ("brand_slug", "is_client_visible", "published_at" DESC);



CREATE UNIQUE INDEX "stripe_webhook_events_event_mode_key" ON "public"."stripe_webhook_events" USING "btree" ("stripe_event_id", "livemode");



CREATE INDEX "user_brand_access_brand_slug_idx" ON "public"."user_brand_access" USING "btree" ("brand_slug");



CREATE INDEX "user_brand_access_status_idx" ON "public"."user_brand_access" USING "btree" ("status");



CREATE INDEX "user_brand_access_user_id_idx" ON "public"."user_brand_access" USING "btree" ("user_id");



CREATE INDEX "user_profiles_email_idx" ON "public"."user_profiles" USING "btree" ("email");



CREATE INDEX "user_profiles_role_idx" ON "public"."user_profiles" USING "btree" ("role");



CREATE INDEX "user_profiles_user_id_idx" ON "public"."user_profiles" USING "btree" ("user_id");



CREATE INDEX "whatsapp_connection_events_brand_slug_idx" ON "public"."whatsapp_connection_events" USING "btree" ("brand_slug");



CREATE INDEX "whatsapp_connection_events_connection_id_idx" ON "public"."whatsapp_connection_events" USING "btree" ("connection_id");



CREATE INDEX "whatsapp_connection_events_created_at_idx" ON "public"."whatsapp_connection_events" USING "btree" ("created_at" DESC);



CREATE INDEX "whatsapp_connection_events_signup_session_id_idx" ON "public"."whatsapp_connection_events" USING "btree" ("signup_session_id");



CREATE INDEX "whatsapp_connection_secrets_connection_id_idx" ON "public"."whatsapp_connection_secrets" USING "btree" ("connection_id");



CREATE INDEX "whatsapp_connections_brand_name_idx" ON "public"."whatsapp_connections" USING "btree" ("brand_name");



CREATE INDEX "whatsapp_connections_brand_slug_idx" ON "public"."whatsapp_connections" USING "btree" ("brand_slug");



CREATE INDEX "whatsapp_connections_display_phone_idx" ON "public"."whatsapp_connections" USING "btree" ("display_phone_number");



CREATE UNIQUE INDEX "whatsapp_connections_phone_number_id_unique_idx" ON "public"."whatsapp_connections" USING "btree" ("phone_number_id");



CREATE INDEX "whatsapp_connections_status_idx" ON "public"."whatsapp_connections" USING "btree" ("connection_status");



CREATE INDEX "whatsapp_contacts_connection_idx" ON "public"."whatsapp_contacts" USING "btree" ("connection_id");



CREATE INDEX "whatsapp_embedded_signup_sessions_brand_slug_idx" ON "public"."whatsapp_embedded_signup_sessions" USING "btree" ("brand_slug");



CREATE INDEX "whatsapp_embedded_signup_sessions_expires_at_idx" ON "public"."whatsapp_embedded_signup_sessions" USING "btree" ("expires_at");



CREATE INDEX "whatsapp_embedded_signup_sessions_status_idx" ON "public"."whatsapp_embedded_signup_sessions" USING "btree" ("status");



CREATE INDEX "whatsapp_embedded_signup_sessions_user_id_idx" ON "public"."whatsapp_embedded_signup_sessions" USING "btree" ("user_id");



CREATE INDEX "whatsapp_message_statuses_connection_idx" ON "public"."whatsapp_message_statuses" USING "btree" ("connection_id");



CREATE INDEX "whatsapp_messages_connection_idx" ON "public"."whatsapp_messages" USING "btree" ("connection_id");



CREATE INDEX "whatsapp_unmatched_events_phone_idx" ON "public"."whatsapp_unmatched_events" USING "btree" ("phone_number_id");



CREATE INDEX "whatsapp_unmatched_events_received_at_idx" ON "public"."whatsapp_unmatched_events" USING "btree" ("received_at" DESC);



CREATE INDEX "whatsapp_webhook_events_connection_idx" ON "public"."whatsapp_webhook_events" USING "btree" ("connection_id");



CREATE OR REPLACE TRIGGER "brand_os_access_updated_at" BEFORE UPDATE ON "public"."brand_os_access" FOR EACH ROW EXECUTE FUNCTION "public"."brand_os_access_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_brand_entitlement_overrides_updated_at" BEFORE UPDATE ON "public"."pos_brand_entitlement_overrides" FOR EACH ROW EXECUTE FUNCTION "public"."pos_entitlements_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_branding_set_updated_at" BEFORE UPDATE ON "public"."pos_branding" FOR EACH ROW EXECUTE FUNCTION "public"."pos_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_business_capabilities_set_updated_at" BEFORE UPDATE ON "public"."pos_business_capabilities" FOR EACH ROW EXECUTE FUNCTION "public"."pos_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_business_profiles_set_updated_at" BEFORE UPDATE ON "public"."pos_business_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."pos_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_capability_catalog_set_updated_at" BEFORE UPDATE ON "public"."pos_capability_catalog" FOR EACH ROW EXECUTE FUNCTION "public"."pos_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_cash_movements_append_only" BEFORE DELETE OR UPDATE ON "public"."pos_cash_movements" FOR EACH ROW EXECUTE FUNCTION "public"."pos_cash_movement_append_only"();



CREATE OR REPLACE TRIGGER "pos_cash_movements_assert_open_session" BEFORE INSERT ON "public"."pos_cash_movements" FOR EACH ROW EXECUTE FUNCTION "public"."pos_cash_movement_assert_open_session"();



CREATE OR REPLACE TRIGGER "pos_cash_sessions_protect_closed_financials" BEFORE UPDATE ON "public"."pos_cash_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."pos_cash_session_protect_closed_financials"();



CREATE OR REPLACE TRIGGER "pos_cash_sessions_set_updated_at" BEFORE UPDATE ON "public"."pos_cash_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."pos_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_categories_set_updated_at" BEFORE UPDATE ON "public"."pos_categories" FOR EACH ROW EXECUTE FUNCTION "public"."pos_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_commercial_grants_immutability_v1" BEFORE UPDATE ON "public"."pos_commercial_grants" FOR EACH ROW EXECUTE FUNCTION "public"."pos_commercial_grants_protect_economics_v1"();



CREATE OR REPLACE TRIGGER "pos_commercial_grants_overlap_v1" BEFORE INSERT OR UPDATE ON "public"."pos_commercial_grants" FOR EACH ROW EXECUTE FUNCTION "public"."pos_commercial_grants_reject_overlap_v1"();



CREATE OR REPLACE TRIGGER "pos_commercial_grants_updated_at_v1" BEFORE UPDATE ON "public"."pos_commercial_grants" FOR EACH ROW EXECUTE FUNCTION "public"."pos_commercial_grants_set_updated_at_v1"();



CREATE OR REPLACE TRIGGER "pos_customers_set_updated_at" BEFORE UPDATE ON "public"."pos_customers" FOR EACH ROW EXECUTE FUNCTION "public"."pos_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_entitlements_updated_at" BEFORE UPDATE ON "public"."pos_entitlements" FOR EACH ROW EXECUTE FUNCTION "public"."pos_entitlements_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_intelligence_signals_updated" BEFORE UPDATE ON "public"."pos_intelligence_signals" FOR EACH ROW EXECUTE FUNCTION "public"."pos_signals_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_inventory_receipts_set_updated_at" BEFORE UPDATE ON "public"."pos_inventory_receipts" FOR EACH ROW EXECUTE FUNCTION "public"."pos_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_inventory_set_updated_at" BEFORE UPDATE ON "public"."pos_inventory" FOR EACH ROW EXECUTE FUNCTION "public"."pos_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_locations_set_updated_at" BEFORE UPDATE ON "public"."pos_locations" FOR EACH ROW EXECUTE FUNCTION "public"."pos_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_loyalty_members_set_updated_at" BEFORE UPDATE ON "public"."pos_loyalty_members" FOR EACH ROW EXECUTE FUNCTION "public"."pos_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_loyalty_programs_set_updated_at" BEFORE UPDATE ON "public"."pos_loyalty_programs" FOR EACH ROW EXECUTE FUNCTION "public"."pos_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_loyalty_reward_unlocks_set_updated_at" BEFORE UPDATE ON "public"."pos_loyalty_reward_unlocks" FOR EACH ROW EXECUTE FUNCTION "public"."pos_loyalty_visit_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_loyalty_rewards_set_updated_at" BEFORE UPDATE ON "public"."pos_loyalty_rewards" FOR EACH ROW EXECUTE FUNCTION "public"."pos_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_loyalty_tiers_set_updated_at" BEFORE UPDATE ON "public"."pos_loyalty_tiers" FOR EACH ROW EXECUTE FUNCTION "public"."pos_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_loyalty_visit_programs_set_updated_at" BEFORE UPDATE ON "public"."pos_loyalty_visit_programs" FOR EACH ROW EXECUTE FUNCTION "public"."pos_loyalty_visit_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_plan_limits_set_updated_at" BEFORE UPDATE ON "public"."pos_plan_limits" FOR EACH ROW EXECUTE FUNCTION "public"."pos_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_plans_set_updated_at" BEFORE UPDATE ON "public"."pos_plans" FOR EACH ROW EXECUTE FUNCTION "public"."pos_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_product_attribute_definitions_set_updated_at" BEFORE UPDATE ON "public"."pos_product_attribute_definitions" FOR EACH ROW EXECUTE FUNCTION "public"."pos_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_product_components_set_updated_at" BEFORE UPDATE ON "public"."pos_product_components" FOR EACH ROW EXECUTE FUNCTION "public"."pos_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_product_variants_set_updated_at" BEFORE UPDATE ON "public"."pos_product_variants" FOR EACH ROW EXECUTE FUNCTION "public"."pos_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_product_variants_signature_v1" BEFORE INSERT OR UPDATE ON "public"."pos_product_variants" FOR EACH ROW EXECUTE FUNCTION "public"."pos_product_variants_set_signature_v1"();



CREATE OR REPLACE TRIGGER "pos_products_set_updated_at" BEFORE UPDATE ON "public"."pos_products" FOR EACH ROW EXECUTE FUNCTION "public"."pos_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_profile_attribute_defaults_set_updated_at" BEFORE UPDATE ON "public"."pos_profile_attribute_defaults" FOR EACH ROW EXECUTE FUNCTION "public"."pos_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_profile_catalog_set_updated_at" BEFORE UPDATE ON "public"."pos_profile_catalog" FOR EACH ROW EXECUTE FUNCTION "public"."pos_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_purchase_presentations_set_updated_at" BEFORE UPDATE ON "public"."pos_variant_purchase_presentations" FOR EACH ROW EXECUTE FUNCTION "public"."pos_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_registers_set_updated_at" BEFORE UPDATE ON "public"."pos_registers" FOR EACH ROW EXECUTE FUNCTION "public"."pos_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_sales_set_updated_at" BEFORE UPDATE ON "public"."pos_sales" FOR EACH ROW EXECUTE FUNCTION "public"."pos_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_signal_rule_configs_updated" BEFORE UPDATE ON "public"."pos_signal_rule_configs" FOR EACH ROW EXECUTE FUNCTION "public"."pos_signals_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_subscriptions_set_updated_at" BEFORE UPDATE ON "public"."pos_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."pos_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_unit_conversions_set_updated_at" BEFORE UPDATE ON "public"."pos_unit_conversions" FOR EACH ROW EXECUTE FUNCTION "public"."pos_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_units_set_updated_at" BEFORE UPDATE ON "public"."pos_units" FOR EACH ROW EXECUTE FUNCTION "public"."pos_set_updated_at"();



CREATE OR REPLACE TRIGGER "pos_wallet_passes_set_updated_at" BEFORE UPDATE ON "public"."pos_wallet_passes" FOR EACH ROW EXECUTE FUNCTION "public"."pos_set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_mercury_brand_settings" BEFORE UPDATE ON "public"."mercury_brand_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_mercury_calendars" BEFORE UPDATE ON "public"."mercury_calendars" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_mercury_content_items" BEFORE UPDATE ON "public"."mercury_content_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_mercury_team_assignments" BEFORE UPDATE ON "public"."mercury_team_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_whatsapp_connection_secrets_updated_at" BEFORE UPDATE ON "public"."whatsapp_connection_secrets" FOR EACH ROW EXECUTE FUNCTION "public"."set_cometa_updated_at"();



CREATE OR REPLACE TRIGGER "set_whatsapp_embedded_signup_sessions_updated_at" BEFORE UPDATE ON "public"."whatsapp_embedded_signup_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."set_cometa_updated_at"();



CREATE OR REPLACE TRIGGER "trg_create_orion_evidence_from_brand_analysis" AFTER INSERT ON "public"."brand_analysis" FOR EACH ROW EXECUTE FUNCTION "public"."create_orion_evidence_from_brand_analysis"();



CREATE OR REPLACE TRIGGER "trg_create_orion_scrape_jobs_from_brand_analysis" AFTER INSERT ON "public"."brand_analysis" FOR EACH ROW EXECUTE FUNCTION "public"."create_orion_scrape_jobs_from_brand_analysis"();



CREATE OR REPLACE TRIGGER "trg_sync_cosmos_memory_after_agent_run" AFTER INSERT ON "public"."cosmos_agent_runs" FOR EACH ROW EXECUTE FUNCTION "public"."sync_cosmos_memory_after_agent_run"();



CREATE OR REPLACE TRIGGER "trg_update_orion_evidence_updated_at" BEFORE UPDATE ON "public"."orion_evidence" FOR EACH ROW EXECUTE FUNCTION "public"."update_orion_evidence_updated_at"();



CREATE OR REPLACE TRIGGER "update_sales_ai_leads_updated_at" BEFORE UPDATE ON "public"."sales_ai_leads" FOR EACH ROW EXECUTE FUNCTION "public"."update_sales_ai_leads_updated_at"();



CREATE OR REPLACE TRIGGER "update_sales_business_rules_updated_at" BEFORE UPDATE ON "public"."sales_business_rules" FOR EACH ROW EXECUTE FUNCTION "public"."update_sales_updated_at"();



CREATE OR REPLACE TRIGGER "update_sales_catalog_items_updated_at" BEFORE UPDATE ON "public"."sales_catalog_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_sales_updated_at"();



CREATE OR REPLACE TRIGGER "update_sales_channels_updated_at" BEFORE UPDATE ON "public"."sales_channels" FOR EACH ROW EXECUTE FUNCTION "public"."update_sales_updated_at"();



CREATE OR REPLACE TRIGGER "update_sales_faqs_updated_at" BEFORE UPDATE ON "public"."sales_faqs" FOR EACH ROW EXECUTE FUNCTION "public"."update_sales_updated_at"();



CREATE OR REPLACE TRIGGER "update_sales_knowledge_sources_updated_at" BEFORE UPDATE ON "public"."sales_knowledge_sources" FOR EACH ROW EXECUTE FUNCTION "public"."update_sales_updated_at"();



CREATE OR REPLACE TRIGGER "update_sales_leads_updated_at" BEFORE UPDATE ON "public"."sales_leads" FOR EACH ROW EXECUTE FUNCTION "public"."update_sales_updated_at"();



CREATE OR REPLACE TRIGGER "update_sales_messages_updated_at" BEFORE UPDATE ON "public"."sales_messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_sales_updated_at"();



CREATE OR REPLACE TRIGGER "update_sales_outbound_messages_updated_at" BEFORE UPDATE ON "public"."sales_outbound_messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_sales_updated_at"();



CREATE OR REPLACE TRIGGER "update_sales_playbook_suggestions_updated_at" BEFORE UPDATE ON "public"."sales_playbook_suggestions" FOR EACH ROW EXECUTE FUNCTION "public"."update_sales_updated_at"();



CREATE OR REPLACE TRIGGER "update_sales_playbooks_updated_at" BEFORE UPDATE ON "public"."sales_playbooks" FOR EACH ROW EXECUTE FUNCTION "public"."update_sales_updated_at"();



CREATE OR REPLACE TRIGGER "user_brand_access_last_owner_rbac_v1a" BEFORE DELETE OR UPDATE OF "access_role", "status" ON "public"."user_brand_access" FOR EACH ROW EXECUTE FUNCTION "public"."pos_rbac_protect_last_owner_v1"();



CREATE OR REPLACE TRIGGER "whatsapp_connections_updated_at_trigger" BEFORE UPDATE ON "public"."whatsapp_connections" FOR EACH ROW EXECUTE FUNCTION "public"."update_whatsapp_connections_updated_at"();



ALTER TABLE ONLY "public"."ai_activity"
    ADD CONSTRAINT "ai_activity_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."atlas_hypotheses"
    ADD CONSTRAINT "atlas_hypotheses_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."atlas_observations"
    ADD CONSTRAINT "atlas_observations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."atlas_strategy_versions"
    ADD CONSTRAINT "atlas_strategy_versions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."atlas_whatsapp_messages"
    ADD CONSTRAINT "atlas_whatsapp_messages_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."brand_memory"
    ADD CONSTRAINT "brand_memory_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."brand_os_access"
    ADD CONSTRAINT "brand_os_access_brand_slug_fkey" FOREIGN KEY ("brand_slug") REFERENCES "public"."brands"("slug") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."briefs"
    ADD CONSTRAINT "briefs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_connections"
    ADD CONSTRAINT "client_connections_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_performance"
    ADD CONSTRAINT "content_performance_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."corrections"
    ADD CONSTRAINT "corrections_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cosmos_strategies"
    ADD CONSTRAINT "cosmos_strategies_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cosmos_strategies"
    ADD CONSTRAINT "cosmos_strategies_source_hypothesis_id_fkey" FOREIGN KEY ("source_hypothesis_id") REFERENCES "public"."atlas_hypotheses"("id");



ALTER TABLE ONLY "public"."decisions"
    ADD CONSTRAINT "decisions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_items"
    ADD CONSTRAINT "memory_items_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mercury_agent_runs"
    ADD CONSTRAINT "mercury_agent_runs_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "public"."mercury_calendars"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."mercury_content_assets"
    ADD CONSTRAINT "mercury_content_assets_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "public"."mercury_content_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mercury_content_comments"
    ADD CONSTRAINT "mercury_content_comments_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "public"."mercury_content_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mercury_content_items"
    ADD CONSTRAINT "mercury_content_items_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "public"."mercury_calendars"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mercury_content_reviews"
    ADD CONSTRAINT "mercury_content_reviews_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "public"."mercury_content_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_analytics_snapshots"
    ADD CONSTRAINT "pos_analytics_snapshots_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."pos_locations"("id");



ALTER TABLE ONLY "public"."pos_brand_entitlement_overrides"
    ADD CONSTRAINT "pos_brand_entitlement_overrides_entitlement_id_fkey" FOREIGN KEY ("entitlement_id") REFERENCES "public"."pos_entitlements"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_branding"
    ADD CONSTRAINT "pos_branding_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_business_capabilities"
    ADD CONSTRAINT "pos_business_capabilities_capability_code_fkey" FOREIGN KEY ("capability_code") REFERENCES "public"."pos_capability_catalog"("code") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_business_capabilities"
    ADD CONSTRAINT "pos_business_capabilities_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_business_profiles"
    ADD CONSTRAINT "pos_business_profiles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_business_profiles"
    ADD CONSTRAINT "pos_business_profiles_profile_code_fkey" FOREIGN KEY ("profile_code") REFERENCES "public"."pos_profile_catalog"("code") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_cash_movements"
    ADD CONSTRAINT "pos_cash_movements_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "public"."pos_cash_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_cash_movements"
    ADD CONSTRAINT "pos_cash_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_cash_sessions"
    ADD CONSTRAINT "pos_cash_sessions_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_cash_sessions"
    ADD CONSTRAINT "pos_cash_sessions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."pos_locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_cash_sessions"
    ADD CONSTRAINT "pos_cash_sessions_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_cash_sessions"
    ADD CONSTRAINT "pos_cash_sessions_register_id_fkey" FOREIGN KEY ("register_id") REFERENCES "public"."pos_registers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_categories"
    ADD CONSTRAINT "pos_categories_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_categories"
    ADD CONSTRAINT "pos_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."pos_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_commercial_grants"
    ADD CONSTRAINT "pos_commercial_grants_brand_slug_fkey" FOREIGN KEY ("brand_slug") REFERENCES "public"."brands"("slug") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_commercial_grants"
    ADD CONSTRAINT "pos_commercial_grants_plan_code_fkey" FOREIGN KEY ("plan_code") REFERENCES "public"."pos_plans"("code") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_customers"
    ADD CONSTRAINT "pos_customers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_intelligence_reports"
    ADD CONSTRAINT "pos_intelligence_reports_analytics_snapshot_id_fkey" FOREIGN KEY ("analytics_snapshot_id") REFERENCES "public"."pos_analytics_snapshots"("id");



ALTER TABLE ONLY "public"."pos_intelligence_reports"
    ADD CONSTRAINT "pos_intelligence_reports_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."pos_locations"("id");



ALTER TABLE ONLY "public"."pos_intelligence_signals"
    ADD CONSTRAINT "pos_intelligence_signals_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."pos_locations"("id");



ALTER TABLE ONLY "public"."pos_inventory"
    ADD CONSTRAINT "pos_inventory_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."pos_locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_inventory_movements"
    ADD CONSTRAINT "pos_inventory_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_inventory_movements"
    ADD CONSTRAINT "pos_inventory_movements_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."pos_locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_inventory_movements"
    ADD CONSTRAINT "pos_inventory_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."pos_product_variants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_inventory_receipt_items"
    ADD CONSTRAINT "pos_inventory_receipt_items_base_unit_code_fkey" FOREIGN KEY ("base_unit_code") REFERENCES "public"."pos_units"("code") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_inventory_receipt_items"
    ADD CONSTRAINT "pos_inventory_receipt_items_input_unit_code_fkey" FOREIGN KEY ("input_unit_code") REFERENCES "public"."pos_units"("code") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_inventory_receipt_items"
    ADD CONSTRAINT "pos_inventory_receipt_items_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."pos_locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_inventory_receipt_items"
    ADD CONSTRAINT "pos_inventory_receipt_items_purchase_presentation_id_fkey" FOREIGN KEY ("purchase_presentation_id") REFERENCES "public"."pos_variant_purchase_presentations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_inventory_receipt_items"
    ADD CONSTRAINT "pos_inventory_receipt_items_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "public"."pos_inventory_receipts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_inventory_receipt_items"
    ADD CONSTRAINT "pos_inventory_receipt_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."pos_product_variants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_inventory_receipts"
    ADD CONSTRAINT "pos_inventory_receipts_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_inventory_receipts"
    ADD CONSTRAINT "pos_inventory_receipts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_inventory_receipts"
    ADD CONSTRAINT "pos_inventory_receipts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."pos_locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_inventory"
    ADD CONSTRAINT "pos_inventory_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."pos_product_variants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_locations"
    ADD CONSTRAINT "pos_locations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_loyalty_members"
    ADD CONSTRAINT "pos_loyalty_members_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."pos_customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_loyalty_members"
    ADD CONSTRAINT "pos_loyalty_members_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."pos_loyalty_programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_loyalty_members"
    ADD CONSTRAINT "pos_loyalty_members_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "public"."pos_loyalty_tiers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_loyalty_programs"
    ADD CONSTRAINT "pos_loyalty_programs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_loyalty_redemptions"
    ADD CONSTRAINT "pos_loyalty_redemptions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."pos_loyalty_members"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_loyalty_redemptions"
    ADD CONSTRAINT "pos_loyalty_redemptions_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "public"."pos_loyalty_rewards"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_loyalty_redemptions"
    ADD CONSTRAINT "pos_loyalty_redemptions_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."pos_sales"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_loyalty_reward_unlocks"
    ADD CONSTRAINT "pos_loyalty_reward_unlocks_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."pos_loyalty_members"("id");



ALTER TABLE ONLY "public"."pos_loyalty_reward_unlocks"
    ADD CONSTRAINT "pos_loyalty_reward_unlocks_redeemed_sale_id_fkey" FOREIGN KEY ("redeemed_sale_id") REFERENCES "public"."pos_sales"("id");



ALTER TABLE ONLY "public"."pos_loyalty_reward_unlocks"
    ADD CONSTRAINT "pos_loyalty_reward_unlocks_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "public"."pos_loyalty_rewards"("id");



ALTER TABLE ONLY "public"."pos_loyalty_reward_unlocks"
    ADD CONSTRAINT "pos_loyalty_reward_unlocks_source_sale_id_fkey" FOREIGN KEY ("source_sale_id") REFERENCES "public"."pos_sales"("id");



ALTER TABLE ONLY "public"."pos_loyalty_reward_unlocks"
    ADD CONSTRAINT "pos_loyalty_reward_unlocks_visit_program_id_fkey" FOREIGN KEY ("visit_program_id") REFERENCES "public"."pos_loyalty_visit_programs"("id");



ALTER TABLE ONLY "public"."pos_loyalty_rewards"
    ADD CONSTRAINT "pos_loyalty_rewards_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."pos_loyalty_programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_loyalty_tiers"
    ADD CONSTRAINT "pos_loyalty_tiers_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."pos_loyalty_programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_loyalty_transactions"
    ADD CONSTRAINT "pos_loyalty_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_loyalty_transactions"
    ADD CONSTRAINT "pos_loyalty_transactions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."pos_loyalty_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_loyalty_transactions"
    ADD CONSTRAINT "pos_loyalty_transactions_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."pos_sales"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_loyalty_visit_events"
    ADD CONSTRAINT "pos_loyalty_visit_events_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."pos_loyalty_members"("id");



ALTER TABLE ONLY "public"."pos_loyalty_visit_events"
    ADD CONSTRAINT "pos_loyalty_visit_events_reverses_event_id_fkey" FOREIGN KEY ("reverses_event_id") REFERENCES "public"."pos_loyalty_visit_events"("id");



ALTER TABLE ONLY "public"."pos_loyalty_visit_events"
    ADD CONSTRAINT "pos_loyalty_visit_events_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."pos_sales"("id");



ALTER TABLE ONLY "public"."pos_loyalty_visit_events"
    ADD CONSTRAINT "pos_loyalty_visit_events_visit_program_id_fkey" FOREIGN KEY ("visit_program_id") REFERENCES "public"."pos_loyalty_visit_programs"("id");



ALTER TABLE ONLY "public"."pos_loyalty_visit_programs"
    ADD CONSTRAINT "pos_loyalty_visit_programs_loyalty_program_id_fkey" FOREIGN KEY ("loyalty_program_id") REFERENCES "public"."pos_loyalty_programs"("id");



ALTER TABLE ONLY "public"."pos_loyalty_visit_programs"
    ADD CONSTRAINT "pos_loyalty_visit_programs_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "public"."pos_loyalty_rewards"("id");



ALTER TABLE ONLY "public"."pos_payments"
    ADD CONSTRAINT "pos_payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."pos_sales"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_plan_entitlements"
    ADD CONSTRAINT "pos_plan_entitlements_entitlement_id_fkey" FOREIGN KEY ("entitlement_id") REFERENCES "public"."pos_entitlements"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_plan_entitlements"
    ADD CONSTRAINT "pos_plan_entitlements_plan_code_fkey" FOREIGN KEY ("plan_code") REFERENCES "public"."pos_plans"("code") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_plan_limits"
    ADD CONSTRAINT "pos_plan_limits_plan_code_fkey" FOREIGN KEY ("plan_code") REFERENCES "public"."pos_plans"("code") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_product_attribute_definitions"
    ADD CONSTRAINT "pos_product_attribute_definitions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_product_attribute_definitions"
    ADD CONSTRAINT "pos_product_attribute_definitions_source_profile_code_fkey" FOREIGN KEY ("source_profile_code") REFERENCES "public"."pos_profile_catalog"("code") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_product_components"
    ADD CONSTRAINT "pos_product_components_component_variant_id_fkey" FOREIGN KEY ("component_variant_id") REFERENCES "public"."pos_product_variants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_product_components"
    ADD CONSTRAINT "pos_product_components_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_product_components"
    ADD CONSTRAINT "pos_product_components_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."pos_products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_product_variants"
    ADD CONSTRAINT "pos_product_variants_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_product_variants"
    ADD CONSTRAINT "pos_product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."pos_products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_product_variants"
    ADD CONSTRAINT "pos_product_variants_unit_code_fkey" FOREIGN KEY ("unit_code") REFERENCES "public"."pos_units"("code") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_products"
    ADD CONSTRAINT "pos_products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."pos_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_products"
    ADD CONSTRAINT "pos_products_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_products"
    ADD CONSTRAINT "pos_products_default_unit_code_fkey" FOREIGN KEY ("default_unit_code") REFERENCES "public"."pos_units"("code") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_profile_attribute_defaults"
    ADD CONSTRAINT "pos_profile_attribute_defaults_profile_code_fkey" FOREIGN KEY ("profile_code") REFERENCES "public"."pos_profile_catalog"("code") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_profile_capability_defaults"
    ADD CONSTRAINT "pos_profile_capability_defaults_capability_code_fkey" FOREIGN KEY ("capability_code") REFERENCES "public"."pos_capability_catalog"("code") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_profile_capability_defaults"
    ADD CONSTRAINT "pos_profile_capability_defaults_profile_code_fkey" FOREIGN KEY ("profile_code") REFERENCES "public"."pos_profile_catalog"("code") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_registers"
    ADD CONSTRAINT "pos_registers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_registers"
    ADD CONSTRAINT "pos_registers_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."pos_locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_sale_items"
    ADD CONSTRAINT "pos_sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."pos_products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_sale_items"
    ADD CONSTRAINT "pos_sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."pos_sales"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_sale_items"
    ADD CONSTRAINT "pos_sale_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."pos_product_variants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_sale_loyalty_tier_snapshots"
    ADD CONSTRAINT "pos_sale_loyalty_tier_snapshots_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."pos_loyalty_members"("id");



ALTER TABLE ONLY "public"."pos_sale_loyalty_tier_snapshots"
    ADD CONSTRAINT "pos_sale_loyalty_tier_snapshots_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."pos_sales"("id");



ALTER TABLE ONLY "public"."pos_sale_loyalty_visit_snapshots"
    ADD CONSTRAINT "pos_sale_loyalty_visit_snapshots_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."pos_loyalty_members"("id");



ALTER TABLE ONLY "public"."pos_sale_loyalty_visit_snapshots"
    ADD CONSTRAINT "pos_sale_loyalty_visit_snapshots_reward_unlock_id_fkey" FOREIGN KEY ("reward_unlock_id") REFERENCES "public"."pos_loyalty_reward_unlocks"("id");



ALTER TABLE ONLY "public"."pos_sale_loyalty_visit_snapshots"
    ADD CONSTRAINT "pos_sale_loyalty_visit_snapshots_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."pos_sales"("id");



ALTER TABLE ONLY "public"."pos_sales"
    ADD CONSTRAINT "pos_sales_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "public"."pos_cash_sessions"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_sales"
    ADD CONSTRAINT "pos_sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."pos_customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_sales"
    ADD CONSTRAINT "pos_sales_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."pos_locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_sales"
    ADD CONSTRAINT "pos_sales_register_id_fkey" FOREIGN KEY ("register_id") REFERENCES "public"."pos_registers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_sales"
    ADD CONSTRAINT "pos_sales_sold_by_fkey" FOREIGN KEY ("sold_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_stripe_billing_links"
    ADD CONSTRAINT "pos_stripe_billing_links_brand_slug_fkey" FOREIGN KEY ("brand_slug") REFERENCES "public"."brands"("slug") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_subscription_events"
    ADD CONSTRAINT "pos_subscription_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_subscription_events"
    ADD CONSTRAINT "pos_subscription_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."pos_subscriptions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_subscriptions"
    ADD CONSTRAINT "pos_subscriptions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_subscriptions"
    ADD CONSTRAINT "pos_subscriptions_plan_code_fkey" FOREIGN KEY ("plan_code") REFERENCES "public"."pos_plans"("code") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_unit_conversions"
    ADD CONSTRAINT "pos_unit_conversions_from_unit_code_fkey" FOREIGN KEY ("from_unit_code") REFERENCES "public"."pos_units"("code") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_unit_conversions"
    ADD CONSTRAINT "pos_unit_conversions_to_unit_code_fkey" FOREIGN KEY ("to_unit_code") REFERENCES "public"."pos_units"("code") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_user_invitations"
    ADD CONSTRAINT "pos_user_invitations_brand_slug_fkey" FOREIGN KEY ("brand_slug") REFERENCES "public"."brands"("slug") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_user_invitations"
    ADD CONSTRAINT "pos_user_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_variant_purchase_presentations"
    ADD CONSTRAINT "pos_variant_purchase_presentations_base_unit_code_fkey" FOREIGN KEY ("base_unit_code") REFERENCES "public"."pos_units"("code") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_variant_purchase_presentations"
    ADD CONSTRAINT "pos_variant_purchase_presentations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_variant_purchase_presentations"
    ADD CONSTRAINT "pos_variant_purchase_presentations_input_unit_code_fkey" FOREIGN KEY ("input_unit_code") REFERENCES "public"."pos_units"("code") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_variant_purchase_presentations"
    ADD CONSTRAINT "pos_variant_purchase_presentations_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."pos_product_variants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_wallet_passes"
    ADD CONSTRAINT "pos_wallet_passes_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."pos_loyalty_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales_agent_runs"
    ADD CONSTRAINT "sales_agent_runs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."sales_leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales_ai_insights"
    ADD CONSTRAINT "sales_ai_insights_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."sales_ai_leads"
    ADD CONSTRAINT "sales_ai_leads_brand_analysis_id_fkey" FOREIGN KEY ("brand_analysis_id") REFERENCES "public"."brand_analysis"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_followups"
    ADD CONSTRAINT "sales_followups_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."sales_leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales_messages"
    ADD CONSTRAINT "sales_messages_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "public"."sales_agent_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_messages"
    ADD CONSTRAINT "sales_messages_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."sales_channels"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_messages"
    ADD CONSTRAINT "sales_messages_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."sales_leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales_messages"
    ADD CONSTRAINT "sales_messages_outbound_message_id_fkey" FOREIGN KEY ("outbound_message_id") REFERENCES "public"."sales_outbound_messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_outbound_messages"
    ADD CONSTRAINT "sales_outbound_messages_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "public"."sales_agent_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_outbound_messages"
    ADD CONSTRAINT "sales_outbound_messages_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."sales_channels"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_outbound_messages"
    ADD CONSTRAINT "sales_outbound_messages_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."sales_leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales_playbook_suggestions"
    ADD CONSTRAINT "sales_playbook_suggestions_source_agent_run_id_fkey" FOREIGN KEY ("source_agent_run_id") REFERENCES "public"."sales_agent_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_playbook_suggestions"
    ADD CONSTRAINT "sales_playbook_suggestions_source_lead_id_fkey" FOREIGN KEY ("source_lead_id") REFERENCES "public"."sales_leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_metrics_daily"
    ADD CONSTRAINT "social_metrics_daily_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."strategy_analysis"
    ADD CONSTRAINT "strategy_analysis_brand_analysis_id_fkey" FOREIGN KEY ("brand_analysis_id") REFERENCES "public"."brand_analysis"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_brand_access"
    ADD CONSTRAINT "user_brand_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_connection_events"
    ADD CONSTRAINT "whatsapp_connection_events_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."whatsapp_connections"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_connection_events"
    ADD CONSTRAINT "whatsapp_connection_events_signup_session_id_fkey" FOREIGN KEY ("signup_session_id") REFERENCES "public"."whatsapp_embedded_signup_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_connection_events"
    ADD CONSTRAINT "whatsapp_connection_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_connection_secrets"
    ADD CONSTRAINT "whatsapp_connection_secrets_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."whatsapp_connections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_connections"
    ADD CONSTRAINT "whatsapp_connections_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_connections"
    ADD CONSTRAINT "whatsapp_connections_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_connections"
    ADD CONSTRAINT "whatsapp_connections_onboarding_session_id_fkey" FOREIGN KEY ("onboarding_session_id") REFERENCES "public"."whatsapp_embedded_signup_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_contacts"
    ADD CONSTRAINT "whatsapp_contacts_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."whatsapp_connections"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_conversations"
    ADD CONSTRAINT "whatsapp_conversations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_embedded_signup_sessions"
    ADD CONSTRAINT "whatsapp_embedded_signup_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_leads"
    ADD CONSTRAINT "whatsapp_leads_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_message_statuses"
    ADD CONSTRAINT "whatsapp_message_statuses_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."whatsapp_connections"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."whatsapp_connections"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_webhook_events"
    ADD CONSTRAINT "whatsapp_webhook_events_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."whatsapp_connections"("id") ON DELETE SET NULL;



CREATE POLICY "Admins can delete brand access" ON "public"."user_brand_access" FOR DELETE TO "authenticated" USING ("public"."is_cometa_admin"());



CREATE POLICY "Admins can delete profiles" ON "public"."user_profiles" FOR DELETE TO "authenticated" USING ("public"."is_cometa_admin"());



CREATE POLICY "Admins can insert brand access" ON "public"."user_brand_access" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_cometa_admin"());



CREATE POLICY "Admins can insert profiles" ON "public"."user_profiles" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_cometa_admin"());



CREATE POLICY "Admins can update brand access" ON "public"."user_brand_access" FOR UPDATE TO "authenticated" USING ("public"."is_cometa_admin"()) WITH CHECK ("public"."is_cometa_admin"());



CREATE POLICY "Admins can update profiles" ON "public"."user_profiles" FOR UPDATE TO "authenticated" USING ("public"."is_cometa_admin"()) WITH CHECK ("public"."is_cometa_admin"());



CREATE POLICY "Allow public insert brand_analysis" ON "public"."brand_analysis" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Allow public read brand_analysis" ON "public"."brand_analysis" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Allow public read clients" ON "public"."clients" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Authenticated users can insert sales ai leads" ON "public"."sales_ai_leads" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can read sales ai leads" ON "public"."sales_ai_leads" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can update sales ai leads" ON "public"."sales_ai_leads" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage content publications" ON "public"."content_publications" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage strategy publications" ON "public"."strategy_publications" USING (true) WITH CHECK (true);



CREATE POLICY "Users can read own brand access or admin can read all" ON "public"."user_brand_access" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_cometa_admin"()));



CREATE POLICY "Users can read own profile or admin can read all" ON "public"."user_profiles" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_cometa_admin"()));



ALTER TABLE "public"."agent_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_activity" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."atlas_hypotheses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."atlas_observations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."atlas_strategy_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."atlas_whatsapp_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."brand_analysis" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."brand_evidence" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."brand_memory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."brand_os_access" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."brands" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "brands_select_by_active_membership" ON "public"."brands" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_brand_access" "access"
  WHERE (("access"."user_id" = "auth"."uid"()) AND ("access"."brand_slug" = "brands"."slug") AND ("access"."status" = 'active'::"text")))));



ALTER TABLE "public"."briefs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."business_maps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_connections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."content_performance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."content_publications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."corrections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cosmos_strategies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."decisions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memory_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mercury_agent_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mercury_brand_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mercury_calendars" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mercury_content_assets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mercury_content_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mercury_content_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mercury_content_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mercury_monthly_learnings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mercury_piece_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mercury_team_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."opportunities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orion_evidence" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orion_scrape_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pos_analytics_snapshots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_analytics_snapshots_select" ON "public"."pos_analytics_snapshots" FOR SELECT TO "authenticated" USING ("public"."pos_can_access_brand"("brand_slug"));



ALTER TABLE "public"."pos_brand_entitlement_overrides" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_brand_entitlement_overrides_select" ON "public"."pos_brand_entitlement_overrides" FOR SELECT TO "authenticated" USING ("public"."pos_can_access_brand"("brand_slug"));



ALTER TABLE "public"."pos_branding" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_branding_select_brand" ON "public"."pos_branding" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_branding"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."pos_business_capabilities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_business_capabilities_select_brand" ON "public"."pos_business_capabilities" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_business_capabilities"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."pos_business_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_business_profiles_select_brand" ON "public"."pos_business_profiles" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_business_profiles"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."pos_capability_catalog" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_capability_catalog_authenticated_select" ON "public"."pos_capability_catalog" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."pos_cash_movements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_cash_movements_delete_brand" ON "public"."pos_cash_movements" FOR DELETE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_cash_movements"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_cash_movements_insert_brand" ON "public"."pos_cash_movements" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_cash_movements"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_cash_movements_select_brand" ON "public"."pos_cash_movements" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_cash_movements"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_cash_movements_update_brand" ON "public"."pos_cash_movements" FOR UPDATE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_cash_movements"."brand_slug") AS "pos_can_access_brand")) WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_cash_movements"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."pos_cash_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_cash_sessions_delete_brand" ON "public"."pos_cash_sessions" FOR DELETE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_cash_sessions"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_cash_sessions_insert_brand" ON "public"."pos_cash_sessions" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_cash_sessions"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_cash_sessions_select_brand" ON "public"."pos_cash_sessions" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_cash_sessions"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_cash_sessions_update_brand" ON "public"."pos_cash_sessions" FOR UPDATE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_cash_sessions"."brand_slug") AS "pos_can_access_brand")) WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_cash_sessions"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."pos_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_categories_delete_brand" ON "public"."pos_categories" FOR DELETE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_categories"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_categories_insert_brand" ON "public"."pos_categories" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_categories"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_categories_select_brand" ON "public"."pos_categories" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_categories"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_categories_update_brand" ON "public"."pos_categories" FOR UPDATE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_categories"."brand_slug") AS "pos_can_access_brand")) WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_categories"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."pos_commercial_grants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pos_customers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_customers_delete_brand" ON "public"."pos_customers" FOR DELETE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_customers"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_customers_insert_brand" ON "public"."pos_customers" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_customers"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_customers_select_brand" ON "public"."pos_customers" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_customers"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_customers_update_brand" ON "public"."pos_customers" FOR UPDATE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_customers"."brand_slug") AS "pos_can_access_brand")) WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_customers"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."pos_entitlements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_entitlements_select" ON "public"."pos_entitlements" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."pos_intelligence_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_intelligence_reports_select" ON "public"."pos_intelligence_reports" FOR SELECT TO "authenticated" USING ("public"."pos_can_access_brand"("brand_slug"));



ALTER TABLE "public"."pos_intelligence_signals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_intelligence_signals_select" ON "public"."pos_intelligence_signals" FOR SELECT TO "authenticated" USING ("public"."pos_can_access_brand"("brand_slug"));



ALTER TABLE "public"."pos_inventory" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_inventory_delete_brand" ON "public"."pos_inventory" FOR DELETE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_inventory"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_inventory_insert_brand" ON "public"."pos_inventory" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_inventory"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."pos_inventory_movements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_inventory_movements_delete_brand" ON "public"."pos_inventory_movements" FOR DELETE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_inventory_movements"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_inventory_movements_insert_brand" ON "public"."pos_inventory_movements" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_inventory_movements"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_inventory_movements_select_brand" ON "public"."pos_inventory_movements" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_inventory_movements"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_inventory_movements_update_brand" ON "public"."pos_inventory_movements" FOR UPDATE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_inventory_movements"."brand_slug") AS "pos_can_access_brand")) WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_inventory_movements"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."pos_inventory_receipt_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_inventory_receipt_items_select_brand" ON "public"."pos_inventory_receipt_items" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_inventory_receipt_items"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."pos_inventory_receipts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_inventory_receipts_select_brand" ON "public"."pos_inventory_receipts" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_inventory_receipts"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_inventory_select_brand" ON "public"."pos_inventory" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_inventory"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_inventory_update_brand" ON "public"."pos_inventory" FOR UPDATE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_inventory"."brand_slug") AS "pos_can_access_brand")) WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_inventory"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."pos_locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_locations_delete_brand" ON "public"."pos_locations" FOR DELETE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_locations"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_locations_insert_brand" ON "public"."pos_locations" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_locations"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_locations_select_brand" ON "public"."pos_locations" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_locations"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_locations_update_brand" ON "public"."pos_locations" FOR UPDATE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_locations"."brand_slug") AS "pos_can_access_brand")) WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_locations"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."pos_loyalty_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_loyalty_members_delete_brand" ON "public"."pos_loyalty_members" FOR DELETE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_loyalty_members"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_loyalty_members_insert_brand" ON "public"."pos_loyalty_members" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_loyalty_members"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_loyalty_members_select_brand" ON "public"."pos_loyalty_members" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_loyalty_members"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_loyalty_members_update_brand" ON "public"."pos_loyalty_members" FOR UPDATE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_loyalty_members"."brand_slug") AS "pos_can_access_brand")) WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_loyalty_members"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."pos_loyalty_programs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_loyalty_programs_delete_brand" ON "public"."pos_loyalty_programs" FOR DELETE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_loyalty_programs"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_loyalty_programs_insert_brand" ON "public"."pos_loyalty_programs" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_loyalty_programs"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_loyalty_programs_select_brand" ON "public"."pos_loyalty_programs" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_loyalty_programs"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_loyalty_programs_update_brand" ON "public"."pos_loyalty_programs" FOR UPDATE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_loyalty_programs"."brand_slug") AS "pos_can_access_brand")) WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_loyalty_programs"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."pos_loyalty_redemptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_loyalty_redemptions_delete_brand" ON "public"."pos_loyalty_redemptions" FOR DELETE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_loyalty_redemptions"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_loyalty_redemptions_insert_brand" ON "public"."pos_loyalty_redemptions" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_loyalty_redemptions"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_loyalty_redemptions_select_brand" ON "public"."pos_loyalty_redemptions" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_loyalty_redemptions"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_loyalty_redemptions_update_brand" ON "public"."pos_loyalty_redemptions" FOR UPDATE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_loyalty_redemptions"."brand_slug") AS "pos_can_access_brand")) WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_loyalty_redemptions"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."pos_loyalty_reward_unlocks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_loyalty_reward_unlocks_brand_policy" ON "public"."pos_loyalty_reward_unlocks" TO "authenticated" USING ("public"."pos_can_access_brand"("brand_slug")) WITH CHECK ("public"."pos_can_access_brand"("brand_slug"));



ALTER TABLE "public"."pos_loyalty_rewards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_loyalty_rewards_delete_brand" ON "public"."pos_loyalty_rewards" FOR DELETE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_loyalty_rewards"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_loyalty_rewards_insert_brand" ON "public"."pos_loyalty_rewards" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_loyalty_rewards"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_loyalty_rewards_select_brand" ON "public"."pos_loyalty_rewards" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_loyalty_rewards"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_loyalty_rewards_update_brand" ON "public"."pos_loyalty_rewards" FOR UPDATE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_loyalty_rewards"."brand_slug") AS "pos_can_access_brand")) WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_loyalty_rewards"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."pos_loyalty_tiers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_loyalty_tiers_delete_brand" ON "public"."pos_loyalty_tiers" FOR DELETE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_loyalty_tiers"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_loyalty_tiers_insert_brand" ON "public"."pos_loyalty_tiers" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_loyalty_tiers"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_loyalty_tiers_select_brand" ON "public"."pos_loyalty_tiers" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_loyalty_tiers"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_loyalty_tiers_update_brand" ON "public"."pos_loyalty_tiers" FOR UPDATE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_loyalty_tiers"."brand_slug") AS "pos_can_access_brand")) WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_loyalty_tiers"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."pos_loyalty_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_loyalty_transactions_delete_brand" ON "public"."pos_loyalty_transactions" FOR DELETE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_loyalty_transactions"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_loyalty_transactions_insert_brand" ON "public"."pos_loyalty_transactions" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_loyalty_transactions"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_loyalty_transactions_select_brand" ON "public"."pos_loyalty_transactions" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_loyalty_transactions"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_loyalty_transactions_update_brand" ON "public"."pos_loyalty_transactions" FOR UPDATE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_loyalty_transactions"."brand_slug") AS "pos_can_access_brand")) WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_loyalty_transactions"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."pos_loyalty_visit_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_loyalty_visit_events_brand_select_policy" ON "public"."pos_loyalty_visit_events" FOR SELECT TO "authenticated" USING ("public"."pos_can_access_brand"("brand_slug"));



ALTER TABLE "public"."pos_loyalty_visit_programs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_loyalty_visit_programs_brand_policy" ON "public"."pos_loyalty_visit_programs" TO "authenticated" USING ("public"."pos_can_access_brand"("brand_slug")) WITH CHECK ("public"."pos_can_access_brand"("brand_slug"));



ALTER TABLE "public"."pos_payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_payments_delete_brand" ON "public"."pos_payments" FOR DELETE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_payments"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_payments_insert_brand" ON "public"."pos_payments" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_payments"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_payments_select_brand" ON "public"."pos_payments" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_payments"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_payments_update_brand" ON "public"."pos_payments" FOR UPDATE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_payments"."brand_slug") AS "pos_can_access_brand")) WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_payments"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."pos_plan_entitlements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_plan_entitlements_select" ON "public"."pos_plan_entitlements" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."pos_plan_limits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_plan_limits_authenticated_select" ON "public"."pos_plan_limits" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."pos_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_plans_authenticated_select" ON "public"."pos_plans" FOR SELECT TO "authenticated" USING (("active" = true));



ALTER TABLE "public"."pos_product_attribute_definitions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_product_attribute_definitions_select_brand" ON "public"."pos_product_attribute_definitions" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_product_attribute_definitions"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."pos_product_components" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_product_components_select_brand" ON "public"."pos_product_components" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_product_components"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."pos_product_variants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_product_variants_delete_brand" ON "public"."pos_product_variants" FOR DELETE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_product_variants"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_product_variants_insert_brand" ON "public"."pos_product_variants" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_product_variants"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_product_variants_select_brand" ON "public"."pos_product_variants" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_product_variants"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_product_variants_update_brand" ON "public"."pos_product_variants" FOR UPDATE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_product_variants"."brand_slug") AS "pos_can_access_brand")) WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_product_variants"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."pos_products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_products_delete_brand" ON "public"."pos_products" FOR DELETE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_products"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_products_insert_brand" ON "public"."pos_products" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_products"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_products_select_brand" ON "public"."pos_products" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_products"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_products_update_brand" ON "public"."pos_products" FOR UPDATE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_products"."brand_slug") AS "pos_can_access_brand")) WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_products"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."pos_profile_attribute_defaults" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_profile_attribute_defaults_authenticated_select" ON "public"."pos_profile_attribute_defaults" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."pos_profile_capability_defaults" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pos_profile_catalog" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_profile_catalog_authenticated_select" ON "public"."pos_profile_catalog" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "pos_profile_defaults_authenticated_select" ON "public"."pos_profile_capability_defaults" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "pos_purchase_presentations_select_brand" ON "public"."pos_variant_purchase_presentations" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_variant_purchase_presentations"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."pos_registers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_registers_delete_brand" ON "public"."pos_registers" FOR DELETE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_registers"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_registers_insert_brand" ON "public"."pos_registers" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_registers"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_registers_select_brand" ON "public"."pos_registers" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_registers"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_registers_update_brand" ON "public"."pos_registers" FOR UPDATE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_registers"."brand_slug") AS "pos_can_access_brand")) WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_registers"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."pos_sale_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_sale_items_delete_brand" ON "public"."pos_sale_items" FOR DELETE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_sale_items"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_sale_items_insert_brand" ON "public"."pos_sale_items" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_sale_items"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_sale_items_select_brand" ON "public"."pos_sale_items" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_sale_items"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_sale_items_update_brand" ON "public"."pos_sale_items" FOR UPDATE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_sale_items"."brand_slug") AS "pos_can_access_brand")) WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_sale_items"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."pos_sale_loyalty_tier_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pos_sale_loyalty_visit_snapshots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_sale_loyalty_visit_snapshots_select_policy" ON "public"."pos_sale_loyalty_visit_snapshots" FOR SELECT TO "authenticated" USING ("public"."pos_can_access_brand"("brand_slug"));



ALTER TABLE "public"."pos_sales" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_sales_delete_brand" ON "public"."pos_sales" FOR DELETE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_sales"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_sales_insert_brand" ON "public"."pos_sales" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_sales"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_sales_select_brand" ON "public"."pos_sales" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_sales"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_sales_update_brand" ON "public"."pos_sales" FOR UPDATE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_sales"."brand_slug") AS "pos_can_access_brand")) WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_sales"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."pos_signal_rule_configs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_signal_rule_configs_select" ON "public"."pos_signal_rule_configs" FOR SELECT TO "authenticated" USING ("public"."pos_can_access_brand"("brand_slug"));



ALTER TABLE "public"."pos_stripe_billing_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pos_subscription_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_subscription_events_select_brand" ON "public"."pos_subscription_events" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_subscription_events"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."pos_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_subscriptions_select_brand" ON "public"."pos_subscriptions" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_subscriptions"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."pos_unit_conversions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_unit_conversions_authenticated_select" ON "public"."pos_unit_conversions" FOR SELECT TO "authenticated" USING (("active" = true));



ALTER TABLE "public"."pos_units" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_units_authenticated_select" ON "public"."pos_units" FOR SELECT TO "authenticated" USING (("active" = true));



ALTER TABLE "public"."pos_user_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pos_variant_purchase_presentations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pos_wallet_passes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pos_wallet_passes_delete_brand" ON "public"."pos_wallet_passes" FOR DELETE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_wallet_passes"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_wallet_passes_insert_brand" ON "public"."pos_wallet_passes" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_wallet_passes"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_wallet_passes_select_brand" ON "public"."pos_wallet_passes" FOR SELECT TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_wallet_passes"."brand_slug") AS "pos_can_access_brand"));



CREATE POLICY "pos_wallet_passes_update_brand" ON "public"."pos_wallet_passes" FOR UPDATE TO "authenticated" USING (( SELECT "public"."pos_can_access_brand"("pos_wallet_passes"."brand_slug") AS "pos_can_access_brand")) WITH CHECK (( SELECT "public"."pos_can_access_brand"("pos_wallet_passes"."brand_slug") AS "pos_can_access_brand"));



ALTER TABLE "public"."sales_agent_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_ai_insights" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_ai_leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_ai_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_ai_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_business_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_catalog_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_channels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_faqs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_followups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_knowledge_sources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_outbound_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_playbook_suggestions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_playbooks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_metrics_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."strategy_analysis" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."strategy_publications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stripe_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_brand_access" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_connection_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_connection_secrets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_connections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_embedded_signup_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_message_statuses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_unmatched_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_webhook_events" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "service_role";



REVOKE ALL ON FUNCTION "public"."brand_os_access_set_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."brand_os_access_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_orion_evidence_from_brand_analysis"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_orion_evidence_from_brand_analysis"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_orion_evidence_from_brand_analysis"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_orion_scrape_jobs_from_brand_analysis"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_orion_scrape_jobs_from_brand_analysis"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_orion_scrape_jobs_from_brand_analysis"() TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "postgres";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "anon";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "authenticated";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_cometa_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_cometa_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_cometa_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "postgres";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "anon";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "authenticated";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "service_role";



GRANT ALL ON TABLE "public"."user_brand_access" TO "anon";
GRANT ALL ON TABLE "public"."user_brand_access" TO "authenticated";
GRANT ALL ON TABLE "public"."user_brand_access" TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_accept_user_invitation_v1"("p_brand_slug" "text", "p_invitation_id" "uuid", "p_user_id" "uuid", "p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_accept_user_invitation_v1"("p_brand_slug" "text", "p_invitation_id" "uuid", "p_user_id" "uuid", "p_email" "text") TO "service_role";



GRANT ALL ON TABLE "public"."pos_inventory" TO "anon";
GRANT ALL ON TABLE "public"."pos_inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_inventory" TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_adjust_inventory"("p_brand_slug" "text", "p_location_id" "uuid", "p_variant_id" "uuid", "p_quantity" numeric, "p_movement_type" "text", "p_notes" "text", "p_user_id" "uuid", "p_set_absolute" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_adjust_inventory"("p_brand_slug" "text", "p_location_id" "uuid", "p_variant_id" "uuid", "p_quantity" numeric, "p_movement_type" "text", "p_notes" "text", "p_user_id" "uuid", "p_set_absolute" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."pos_adjust_inventory"("p_brand_slug" "text", "p_location_id" "uuid", "p_variant_id" "uuid", "p_quantity" numeric, "p_movement_type" "text", "p_notes" "text", "p_user_id" "uuid", "p_set_absolute" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_adjust_inventory"("p_brand_slug" "text", "p_location_id" "uuid", "p_variant_id" "uuid", "p_quantity" numeric, "p_movement_type" "text", "p_notes" "text", "p_user_id" "uuid", "p_set_absolute" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_analytics_assert_scope"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_analytics_assert_scope"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_analytics_metric"("p_current" numeric, "p_previous" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_analytics_metric"("p_current" numeric, "p_previous" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_brand_has_entitlement"("p_brand_slug" "text", "p_entitlement_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_brand_has_entitlement"("p_brand_slug" "text", "p_entitlement_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_can_access_brand"("target_brand_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_can_access_brand"("target_brand_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pos_can_access_brand"("target_brand_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_can_access_brand"("target_brand_slug" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pos_cash_movement_append_only"() TO "anon";
GRANT ALL ON FUNCTION "public"."pos_cash_movement_append_only"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_cash_movement_append_only"() TO "service_role";



GRANT ALL ON FUNCTION "public"."pos_cash_movement_assert_open_session"() TO "anon";
GRANT ALL ON FUNCTION "public"."pos_cash_movement_assert_open_session"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_cash_movement_assert_open_session"() TO "service_role";



GRANT ALL ON FUNCTION "public"."pos_cash_session_protect_closed_financials"() TO "anon";
GRANT ALL ON FUNCTION "public"."pos_cash_session_protect_closed_financials"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_cash_session_protect_closed_financials"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_change_brand_membership_role_v1"("p_brand_slug" "text", "p_target_user_id" "uuid", "p_new_role" "text", "p_actor_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_change_brand_membership_role_v1"("p_brand_slug" "text", "p_target_user_id" "uuid", "p_new_role" "text", "p_actor_user_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."pos_cash_sessions" TO "anon";
GRANT ALL ON TABLE "public"."pos_cash_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_cash_sessions" TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_close_cash_session"("p_brand_slug" "text", "p_session_id" "uuid", "p_counted_cash" numeric, "p_user_id" "uuid", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_close_cash_session"("p_brand_slug" "text", "p_session_id" "uuid", "p_counted_cash" numeric, "p_user_id" "uuid", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pos_close_cash_session"("p_brand_slug" "text", "p_session_id" "uuid", "p_counted_cash" numeric, "p_user_id" "uuid", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_close_cash_session"("p_brand_slug" "text", "p_session_id" "uuid", "p_counted_cash" numeric, "p_user_id" "uuid", "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_commercial_grants_protect_economics_v1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_commercial_grants_protect_economics_v1"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_commercial_grants_reject_overlap_v1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_commercial_grants_reject_overlap_v1"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_commercial_grants_set_updated_at_v1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_commercial_grants_set_updated_at_v1"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_complete_inventory_receipt_v1"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_supplier_name" "text", "p_supplier_reference" "text", "p_notes" "text", "p_items" "jsonb", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_complete_inventory_receipt_v1"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_supplier_name" "text", "p_supplier_reference" "text", "p_notes" "text", "p_items" "jsonb", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."pos_complete_inventory_receipt_v1"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_supplier_name" "text", "p_supplier_reference" "text", "p_notes" "text", "p_items" "jsonb", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_complete_inventory_receipt_v1"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_supplier_name" "text", "p_supplier_reference" "text", "p_notes" "text", "p_items" "jsonb", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_complete_inventory_receipt_v2"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_supplier_name" "text", "p_supplier_reference" "text", "p_notes" "text", "p_items" "jsonb", "p_user_id" "uuid", "p_idempotency_key" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_complete_inventory_receipt_v2"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_supplier_name" "text", "p_supplier_reference" "text", "p_notes" "text", "p_items" "jsonb", "p_user_id" "uuid", "p_idempotency_key" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_complete_sale"("p_brand_slug" "text", "p_location_id" "uuid", "p_register_id" "uuid", "p_cash_session_id" "uuid", "p_customer_id" "uuid", "p_items" "jsonb", "p_payments" "jsonb", "p_notes" "text", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_complete_sale"("p_brand_slug" "text", "p_location_id" "uuid", "p_register_id" "uuid", "p_cash_session_id" "uuid", "p_customer_id" "uuid", "p_items" "jsonb", "p_payments" "jsonb", "p_notes" "text", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."pos_complete_sale"("p_brand_slug" "text", "p_location_id" "uuid", "p_register_id" "uuid", "p_cash_session_id" "uuid", "p_customer_id" "uuid", "p_items" "jsonb", "p_payments" "jsonb", "p_notes" "text", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_complete_sale"("p_brand_slug" "text", "p_location_id" "uuid", "p_register_id" "uuid", "p_cash_session_id" "uuid", "p_customer_id" "uuid", "p_items" "jsonb", "p_payments" "jsonb", "p_notes" "text", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_complete_sale_v2"("p_brand_slug" "text", "p_location_id" "uuid", "p_register_id" "uuid", "p_cash_session_id" "uuid", "p_customer_id" "uuid", "p_items" "jsonb", "p_payments" "jsonb", "p_notes" "text", "p_user_id" "uuid", "p_reward_id" "uuid", "p_idempotency_key" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_complete_sale_v2"("p_brand_slug" "text", "p_location_id" "uuid", "p_register_id" "uuid", "p_cash_session_id" "uuid", "p_customer_id" "uuid", "p_items" "jsonb", "p_payments" "jsonb", "p_notes" "text", "p_user_id" "uuid", "p_reward_id" "uuid", "p_idempotency_key" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_complete_sale_v3"("p_brand_slug" "text", "p_location_id" "uuid", "p_register_id" "uuid", "p_cash_session_id" "uuid", "p_customer_id" "uuid", "p_items" "jsonb", "p_payments" "jsonb", "p_notes" "text", "p_user_id" "uuid", "p_reward_id" "uuid", "p_idempotency_key" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_complete_sale_v3"("p_brand_slug" "text", "p_location_id" "uuid", "p_register_id" "uuid", "p_cash_session_id" "uuid", "p_customer_id" "uuid", "p_items" "jsonb", "p_payments" "jsonb", "p_notes" "text", "p_user_id" "uuid", "p_reward_id" "uuid", "p_idempotency_key" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_complete_sale_v4"("p_brand_slug" "text", "p_location_id" "uuid", "p_register_id" "uuid", "p_cash_session_id" "uuid", "p_customer_id" "uuid", "p_items" "jsonb", "p_payments" "jsonb", "p_notes" "text", "p_user_id" "uuid", "p_reward_id" "uuid", "p_idempotency_key" "uuid", "p_reward_unlock_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_complete_sale_v4"("p_brand_slug" "text", "p_location_id" "uuid", "p_register_id" "uuid", "p_cash_session_id" "uuid", "p_customer_id" "uuid", "p_items" "jsonb", "p_payments" "jsonb", "p_notes" "text", "p_user_id" "uuid", "p_reward_id" "uuid", "p_idempotency_key" "uuid", "p_reward_unlock_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_compute_subscription_lifecycle"("p_brand_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_compute_subscription_lifecycle"("p_brand_slug" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_configure_business_profile"("p_brand_id" "text", "p_brand_slug" "text", "p_profile_code" "text", "p_operation_mode" "text", "p_capabilities" "jsonb", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_configure_business_profile"("p_brand_id" "text", "p_brand_slug" "text", "p_profile_code" "text", "p_operation_mode" "text", "p_capabilities" "jsonb", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."pos_configure_business_profile"("p_brand_id" "text", "p_brand_slug" "text", "p_profile_code" "text", "p_operation_mode" "text", "p_capabilities" "jsonb", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_configure_business_profile"("p_brand_id" "text", "p_brand_slug" "text", "p_profile_code" "text", "p_operation_mode" "text", "p_capabilities" "jsonb", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_create_analytics_snapshot"("p_brand_slug" "text", "p_snapshot_type" "text", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_location_id" "uuid", "p_generated_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_create_analytics_snapshot"("p_brand_slug" "text", "p_snapshot_type" "text", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_location_id" "uuid", "p_generated_by" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."pos_cash_movements" TO "anon";
GRANT ALL ON TABLE "public"."pos_cash_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_cash_movements" TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_create_cash_movement"("p_brand_slug" "text", "p_cash_session_id" "uuid", "p_movement_type" "text", "p_amount" numeric, "p_reason" "text", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_create_cash_movement"("p_brand_slug" "text", "p_cash_session_id" "uuid", "p_movement_type" "text", "p_amount" numeric, "p_reason" "text", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_create_intelligence_report_record"("p_brand_slug" "text", "p_location_id" "uuid", "p_report_type" "text", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_analytics_snapshot_id" "uuid", "p_signals_snapshot" "jsonb", "p_input_snapshot" "jsonb", "p_executive_summary" "text", "p_health_status" "text", "p_health_score" numeric, "p_findings" "jsonb", "p_opportunities" "jsonb", "p_risks" "jsonb", "p_hypotheses" "jsonb", "p_recommended_actions" "jsonb", "p_data_quality_notes" "jsonb", "p_model" "text", "p_prompt_version" "text", "p_schema_version" "text", "p_input_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_create_intelligence_report_record"("p_brand_slug" "text", "p_location_id" "uuid", "p_report_type" "text", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_analytics_snapshot_id" "uuid", "p_signals_snapshot" "jsonb", "p_input_snapshot" "jsonb", "p_executive_summary" "text", "p_health_status" "text", "p_health_score" numeric, "p_findings" "jsonb", "p_opportunities" "jsonb", "p_risks" "jsonb", "p_hypotheses" "jsonb", "p_recommended_actions" "jsonb", "p_data_quality_notes" "jsonb", "p_model" "text", "p_prompt_version" "text", "p_schema_version" "text", "p_input_hash" "text") TO "service_role";



GRANT ALL ON TABLE "public"."pos_loyalty_tiers" TO "anon";
GRANT ALL ON TABLE "public"."pos_loyalty_tiers" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_loyalty_tiers" TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_create_loyalty_tier"("p_brand_slug" "text", "p_name" "text", "p_minimum_lifetime_points" integer, "p_points_multiplier" numeric, "p_sort_order" integer, "p_active" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_create_loyalty_tier"("p_brand_slug" "text", "p_name" "text", "p_minimum_lifetime_points" integer, "p_points_multiplier" numeric, "p_sort_order" integer, "p_active" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_create_loyalty_visit_program"("p_brand_slug" "text", "p_name" "text", "p_required_visits" integer, "p_minimum_sale_amount" numeric, "p_reward_id" "uuid", "p_active" boolean, "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_create_loyalty_visit_program"("p_brand_slug" "text", "p_name" "text", "p_required_visits" integer, "p_minimum_sale_amount" numeric, "p_reward_id" "uuid", "p_active" boolean, "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_create_product"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_category_id" "uuid", "p_name" "text", "p_description" "text", "p_product_type" "text", "p_track_inventory" boolean, "p_tax_rate" numeric, "p_image_url" "text", "p_variants" "jsonb", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_create_product"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_category_id" "uuid", "p_name" "text", "p_description" "text", "p_product_type" "text", "p_track_inventory" boolean, "p_tax_rate" numeric, "p_image_url" "text", "p_variants" "jsonb", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."pos_create_product"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_category_id" "uuid", "p_name" "text", "p_description" "text", "p_product_type" "text", "p_track_inventory" boolean, "p_tax_rate" numeric, "p_image_url" "text", "p_variants" "jsonb", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_create_product"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_category_id" "uuid", "p_name" "text", "p_description" "text", "p_product_type" "text", "p_track_inventory" boolean, "p_tax_rate" numeric, "p_image_url" "text", "p_variants" "jsonb", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_create_product_v2"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_category_id" "uuid", "p_name" "text", "p_description" "text", "p_product_type" "text", "p_inventory_mode" "text", "p_default_unit_code" "text", "p_has_variants" boolean, "p_sellable" boolean, "p_purchasable" boolean, "p_tax_rate" numeric, "p_image_url" "text", "p_configuration" "jsonb", "p_variants" "jsonb", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_create_product_v2"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_category_id" "uuid", "p_name" "text", "p_description" "text", "p_product_type" "text", "p_inventory_mode" "text", "p_default_unit_code" "text", "p_has_variants" boolean, "p_sellable" boolean, "p_purchasable" boolean, "p_tax_rate" numeric, "p_image_url" "text", "p_configuration" "jsonb", "p_variants" "jsonb", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."pos_create_product_v2"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_category_id" "uuid", "p_name" "text", "p_description" "text", "p_product_type" "text", "p_inventory_mode" "text", "p_default_unit_code" "text", "p_has_variants" boolean, "p_sellable" boolean, "p_purchasable" boolean, "p_tax_rate" numeric, "p_image_url" "text", "p_configuration" "jsonb", "p_variants" "jsonb", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_create_product_v2"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_category_id" "uuid", "p_name" "text", "p_description" "text", "p_product_type" "text", "p_inventory_mode" "text", "p_default_unit_code" "text", "p_has_variants" boolean, "p_sellable" boolean, "p_purchasable" boolean, "p_tax_rate" numeric, "p_image_url" "text", "p_configuration" "jsonb", "p_variants" "jsonb", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_create_product_v2"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_category_id" "uuid", "p_name" "text", "p_description" "text", "p_product_type" "text", "p_inventory_mode" "text", "p_default_unit_code" "text", "p_has_variants" boolean, "p_sellable" boolean, "p_purchasable" boolean, "p_tax_rate" numeric, "p_image_url" "text", "p_configuration" "jsonb", "p_variants" "jsonb", "p_user_id" "uuid", "p_product_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_create_product_v2"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_category_id" "uuid", "p_name" "text", "p_description" "text", "p_product_type" "text", "p_inventory_mode" "text", "p_default_unit_code" "text", "p_has_variants" boolean, "p_sellable" boolean, "p_purchasable" boolean, "p_tax_rate" numeric, "p_image_url" "text", "p_configuration" "jsonb", "p_variants" "jsonb", "p_user_id" "uuid", "p_product_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_create_self_service_business_v1"("p_brand_name" "text", "p_profile_code" "text", "p_user_id" "uuid", "p_idempotency_key" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_create_self_service_business_v1"("p_brand_name" "text", "p_profile_code" "text", "p_user_id" "uuid", "p_idempotency_key" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."pos_user_invitations" TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_decline_user_invitation_v1"("p_invitation_id" "uuid", "p_user_id" "uuid", "p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_decline_user_invitation_v1"("p_invitation_id" "uuid", "p_user_id" "uuid", "p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_emit_intelligence_signal"("p_brand_id" "text", "p_brand_slug" "text", "p_location_id" "uuid", "p_signal_type" "text", "p_category" "text", "p_severity" "text", "p_entity_type" "text", "p_entity_id" "text", "p_entity_name" "text", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_comparison_start" timestamp with time zone, "p_comparison_end" timestamp with time zone, "p_title" "text", "p_metric_key" "text", "p_current" numeric, "p_previous" numeric, "p_delta" numeric, "p_delta_percent" numeric, "p_evidence" "jsonb", "p_context" "jsonb", "p_rule_version" "text", "p_dedupe_key" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."pos_entitlements_set_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_entitlements_set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_generate_intelligence_signals"("p_brand_slug" "text", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_location_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_generate_intelligence_signals"("p_brand_slug" "text", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_location_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_get_analytics_customers"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_get_analytics_customers"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_get_analytics_data_quality"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_get_analytics_data_quality"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_get_analytics_inventory"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_get_analytics_inventory"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_get_analytics_loyalty"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_get_analytics_loyalty"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_get_analytics_periods"("p_brand_slug" "text", "p_anchor" timestamp with time zone, "p_location_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_get_analytics_periods"("p_brand_slug" "text", "p_anchor" timestamp with time zone, "p_location_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_get_analytics_product_pairs"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_get_analytics_product_pairs"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_get_analytics_products"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid", "p_limit" integer, "p_order_by" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_get_analytics_products"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid", "p_limit" integer, "p_order_by" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_get_analytics_sales_patterns"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_get_analytics_sales_patterns"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_get_analytics_sales_series"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_granularity" "text", "p_location_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_get_analytics_sales_series"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_granularity" "text", "p_location_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_get_analytics_summary"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_get_analytics_summary"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_get_available_loyalty_reward_unlocks"("p_brand_slug" "text", "p_member_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_get_available_loyalty_reward_unlocks"("p_brand_slug" "text", "p_member_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_get_brand_entitlements"("p_brand_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_get_brand_entitlements"("p_brand_slug" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_get_cash_session_summaries_v1"("p_brand_slug" "text", "p_session_ids" "uuid"[], "p_include_expected_cash" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_get_cash_session_summaries_v1"("p_brand_slug" "text", "p_session_ids" "uuid"[], "p_include_expected_cash" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_get_effective_commercial_access"("p_brand_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_get_effective_commercial_access"("p_brand_slug" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_get_intelligence_report"("p_brand_slug" "text", "p_report_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_get_intelligence_report"("p_brand_slug" "text", "p_report_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_get_intelligence_reports"("p_brand_slug" "text", "p_location_id" "uuid", "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_get_intelligence_reports"("p_brand_slug" "text", "p_location_id" "uuid", "p_limit" integer, "p_offset" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_get_intelligence_signals"("p_brand_slug" "text", "p_location_id" "uuid", "p_status" "text", "p_category" "text", "p_severity" "text", "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_get_intelligence_signals"("p_brand_slug" "text", "p_location_id" "uuid", "p_status" "text", "p_category" "text", "p_severity" "text", "p_limit" integer, "p_offset" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_get_latest_intelligence_report"("p_brand_slug" "text", "p_location_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_get_latest_intelligence_report"("p_brand_slug" "text", "p_location_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_get_loyalty_visit_progress"("p_brand_slug" "text", "p_visit_program_id" "uuid", "p_member_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_get_loyalty_visit_progress"("p_brand_slug" "text", "p_visit_program_id" "uuid", "p_member_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_get_operational_report_products_v1"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_get_operational_report_products_v1"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_get_reports_export_inventory_v1"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_get_reports_export_inventory_v1"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_get_reports_export_products_v1"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_get_reports_export_products_v1"("p_brand_slug" "text", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone, "p_location_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_get_subscription_lifecycle"("p_brand_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_get_subscription_lifecycle"("p_brand_slug" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_initialize_brand_setup"("p_brand_id" "text", "p_brand_slug" "text", "p_brand_name" "text", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_initialize_brand_setup"("p_brand_id" "text", "p_brand_slug" "text", "p_brand_name" "text", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_initialize_brand_setup_v1a_internal"("p_brand_id" "text", "p_brand_slug" "text", "p_brand_name" "text", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_initialize_brand_setup_v1a_internal"("p_brand_id" "text", "p_brand_slug" "text", "p_brand_name" "text", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."pos_loyalty_members" TO "anon";
GRANT ALL ON TABLE "public"."pos_loyalty_members" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_loyalty_members" TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_loyalty_adjust_points"("p_brand_slug" "text", "p_customer_id" "uuid", "p_points" integer, "p_description" "text", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_loyalty_adjust_points"("p_brand_slug" "text", "p_customer_id" "uuid", "p_points" integer, "p_description" "text", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."pos_loyalty_adjust_points"("p_brand_slug" "text", "p_customer_id" "uuid", "p_points" integer, "p_description" "text", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_loyalty_adjust_points"("p_brand_slug" "text", "p_customer_id" "uuid", "p_points" integer, "p_description" "text", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_loyalty_visit_set_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_loyalty_visit_set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_normalize_variant_attributes_v1"("p_attributes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_normalize_variant_attributes_v1"("p_attributes" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_open_cash_session"("p_brand_slug" "text", "p_register_id" "uuid", "p_opening_amount" numeric, "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_open_cash_session"("p_brand_slug" "text", "p_register_id" "uuid", "p_opening_amount" numeric, "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."pos_open_cash_session"("p_brand_slug" "text", "p_register_id" "uuid", "p_opening_amount" numeric, "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_open_cash_session"("p_brand_slug" "text", "p_register_id" "uuid", "p_opening_amount" numeric, "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_plan_dominates_v1"("p_candidate_plan_code" "text", "p_baseline_plan_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_plan_dominates_v1"("p_candidate_plan_code" "text", "p_baseline_plan_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_product_variants_set_signature_v1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_product_variants_set_signature_v1"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_profile_family"("p_profile_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_profile_family"("p_profile_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_rbac_protect_last_owner_v1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_rbac_protect_last_owner_v1"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_reconcile_subscription_lifecycle"("p_brand_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_reconcile_subscription_lifecycle"("p_brand_slug" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_register_loyalty_member"("p_brand_slug" "text", "p_customer_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_register_loyalty_member"("p_brand_slug" "text", "p_customer_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."pos_register_loyalty_member"("p_brand_slug" "text", "p_customer_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_register_loyalty_member"("p_brand_slug" "text", "p_customer_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_register_loyalty_member_v2"("p_brand_slug" "text", "p_customer_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_register_loyalty_member_v2"("p_brand_slug" "text", "p_customer_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_report_summary"("p_brand_slug" "text", "p_start" timestamp with time zone, "p_end" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_report_summary"("p_brand_slug" "text", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."pos_report_summary"("p_brand_slug" "text", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_report_summary"("p_brand_slug" "text", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_reserve_user_invitation_v1"("p_brand_slug" "text", "p_email" "text", "p_access_role" "text", "p_invited_by" "uuid", "p_expires_at" timestamp with time zone, "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_reserve_user_invitation_v1"("p_brand_slug" "text", "p_email" "text", "p_access_role" "text", "p_invited_by" "uuid", "p_expires_at" timestamp with time zone, "p_metadata" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_resolve_loyalty_tier"("p_brand_slug" "text", "p_program_id" "uuid", "p_lifetime_points" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_resolve_loyalty_tier"("p_brand_slug" "text", "p_program_id" "uuid", "p_lifetime_points" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_revoke_brand_membership_v1"("p_brand_slug" "text", "p_target_user_id" "uuid", "p_actor_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_revoke_brand_membership_v1"("p_brand_slug" "text", "p_target_user_id" "uuid", "p_actor_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_revoke_user_invitation_v1"("p_brand_slug" "text", "p_invitation_id" "uuid", "p_actor_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_revoke_user_invitation_v1"("p_brand_slug" "text", "p_invitation_id" "uuid", "p_actor_user_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."pos_branding" TO "anon";
GRANT ALL ON TABLE "public"."pos_branding" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_branding" TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_save_branding"("p_brand_id" "text", "p_brand_slug" "text", "p_display_name" "text", "p_logo_url" "text", "p_cover_image_url" "text", "p_primary_color" "text", "p_secondary_color" "text", "p_accent_color" "text", "p_text_color" "text", "p_loyalty_program_name" "text", "p_loyalty_message" "text", "p_whatsapp" "text", "p_website" "text", "p_ticket_footer" "text", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_save_branding"("p_brand_id" "text", "p_brand_slug" "text", "p_display_name" "text", "p_logo_url" "text", "p_cover_image_url" "text", "p_primary_color" "text", "p_secondary_color" "text", "p_accent_color" "text", "p_text_color" "text", "p_loyalty_program_name" "text", "p_loyalty_message" "text", "p_whatsapp" "text", "p_website" "text", "p_ticket_footer" "text", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."pos_save_branding"("p_brand_id" "text", "p_brand_slug" "text", "p_display_name" "text", "p_logo_url" "text", "p_cover_image_url" "text", "p_primary_color" "text", "p_secondary_color" "text", "p_accent_color" "text", "p_text_color" "text", "p_loyalty_program_name" "text", "p_loyalty_message" "text", "p_whatsapp" "text", "p_website" "text", "p_ticket_footer" "text", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_save_branding"("p_brand_id" "text", "p_brand_slug" "text", "p_display_name" "text", "p_logo_url" "text", "p_cover_image_url" "text", "p_primary_color" "text", "p_secondary_color" "text", "p_accent_color" "text", "p_text_color" "text", "p_loyalty_program_name" "text", "p_loyalty_message" "text", "p_whatsapp" "text", "p_website" "text", "p_ticket_footer" "text", "p_user_id" "uuid") TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."pos_brand_entitlement_overrides" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."pos_brand_entitlement_overrides" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_brand_entitlement_overrides" TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_set_brand_entitlement_override"("p_brand_slug" "text", "p_entitlement_code" "text", "p_enabled" boolean, "p_reason" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_set_brand_entitlement_override"("p_brand_slug" "text", "p_entitlement_code" "text", "p_enabled" boolean, "p_reason" "text", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_set_loyalty_tier_active"("p_brand_slug" "text", "p_tier_id" "uuid", "p_active" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_set_loyalty_tier_active"("p_brand_slug" "text", "p_tier_id" "uuid", "p_active" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_set_loyalty_visit_program_active"("p_brand_slug" "text", "p_visit_program_id" "uuid", "p_active" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_set_loyalty_visit_program_active"("p_brand_slug" "text", "p_visit_program_id" "uuid", "p_active" boolean) TO "service_role";



GRANT ALL ON TABLE "public"."pos_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."pos_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_subscriptions" TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_set_subscription_offer"("p_brand_slug" "text", "p_contract_price" numeric, "p_promotion_code" "text", "p_price_locked" boolean, "p_status" "text", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_set_subscription_offer"("p_brand_slug" "text", "p_contract_price" numeric, "p_promotion_code" "text", "p_price_locked" boolean, "p_status" "text", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."pos_set_subscription_offer"("p_brand_slug" "text", "p_contract_price" numeric, "p_promotion_code" "text", "p_price_locked" boolean, "p_status" "text", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_set_subscription_offer"("p_brand_slug" "text", "p_contract_price" numeric, "p_promotion_code" "text", "p_price_locked" boolean, "p_status" "text", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_set_subscription_plan"("p_brand_slug" "text", "p_plan_code" "text", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_set_subscription_plan"("p_brand_slug" "text", "p_plan_code" "text", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."pos_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."pos_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_signal_rule_config"("p_brand_slug" "text", "p_signal_type" "text", "p_defaults" "jsonb") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."pos_signals_set_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_signals_set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_sync_product_attributes_from_profile"("p_brand_id" "text", "p_brand_slug" "text", "p_profile_code" "text", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_sync_product_attributes_from_profile"("p_brand_id" "text", "p_brand_slug" "text", "p_profile_code" "text", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."pos_sync_product_attributes_from_profile"("p_brand_id" "text", "p_brand_slug" "text", "p_profile_code" "text", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pos_sync_product_attributes_from_profile"("p_brand_id" "text", "p_brand_slug" "text", "p_profile_code" "text", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_transition_subscription_status"("p_brand_slug" "text", "p_new_status" "text", "p_reason" "text", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_transition_subscription_status"("p_brand_slug" "text", "p_new_status" "text", "p_reason" "text", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_update_loyalty_tier"("p_brand_slug" "text", "p_tier_id" "uuid", "p_name" "text", "p_minimum_lifetime_points" integer, "p_points_multiplier" numeric, "p_sort_order" integer, "p_active" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_update_loyalty_tier"("p_brand_slug" "text", "p_tier_id" "uuid", "p_name" "text", "p_minimum_lifetime_points" integer, "p_points_multiplier" numeric, "p_sort_order" integer, "p_active" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_update_loyalty_visit_program"("p_brand_slug" "text", "p_visit_program_id" "uuid", "p_name" "text", "p_required_visits" integer, "p_minimum_sale_amount" numeric, "p_reward_id" "uuid", "p_active" boolean, "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_update_loyalty_visit_program"("p_brand_slug" "text", "p_visit_program_id" "uuid", "p_name" "text", "p_required_visits" integer, "p_minimum_sale_amount" numeric, "p_reward_id" "uuid", "p_active" boolean, "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_update_product_v2"("p_brand_id" "text", "p_brand_slug" "text", "p_product_id" "uuid", "p_category_id" "uuid", "p_name" "text", "p_description" "text", "p_product_type" "text", "p_inventory_mode" "text", "p_default_unit_code" "text", "p_has_variants" boolean, "p_sellable" boolean, "p_purchasable" boolean, "p_tax_rate" numeric, "p_image_url" "text", "p_configuration" "jsonb", "p_variants" "jsonb", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_update_product_v2"("p_brand_id" "text", "p_brand_slug" "text", "p_product_id" "uuid", "p_category_id" "uuid", "p_name" "text", "p_description" "text", "p_product_type" "text", "p_inventory_mode" "text", "p_default_unit_code" "text", "p_has_variants" boolean, "p_sellable" boolean, "p_purchasable" boolean, "p_tax_rate" numeric, "p_image_url" "text", "p_configuration" "jsonb", "p_variants" "jsonb", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_update_product_v2"("p_brand_id" "text", "p_brand_slug" "text", "p_product_id" "uuid", "p_category_id" "uuid", "p_name" "text", "p_description" "text", "p_product_type" "text", "p_inventory_mode" "text", "p_default_unit_code" "text", "p_has_variants" boolean, "p_sellable" boolean, "p_purchasable" boolean, "p_tax_rate" numeric, "p_image_url" "text", "p_configuration" "jsonb", "p_variants" "jsonb", "p_user_id" "uuid", "p_product_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_update_product_v2"("p_brand_id" "text", "p_brand_slug" "text", "p_product_id" "uuid", "p_category_id" "uuid", "p_name" "text", "p_description" "text", "p_product_type" "text", "p_inventory_mode" "text", "p_default_unit_code" "text", "p_has_variants" boolean, "p_sellable" boolean, "p_purchasable" boolean, "p_tax_rate" numeric, "p_image_url" "text", "p_configuration" "jsonb", "p_variants" "jsonb", "p_user_id" "uuid", "p_product_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pos_variant_signature_v1"("p_attributes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pos_variant_signature_v1"("p_attributes" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_cometa_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_cometa_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_cometa_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_cosmos_memory_after_agent_run"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_cosmos_memory_after_agent_run"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_cosmos_memory_after_agent_run"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_orion_evidence_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_orion_evidence_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_orion_evidence_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_sales_ai_leads_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_sales_ai_leads_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_sales_ai_leads_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_sales_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_sales_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_sales_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_whatsapp_connections_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_whatsapp_connections_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_whatsapp_connections_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "service_role";












GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "service_role";









GRANT ALL ON TABLE "public"."agent_notifications" TO "anon";
GRANT ALL ON TABLE "public"."agent_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."ai_activity" TO "anon";
GRANT ALL ON TABLE "public"."ai_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_activity" TO "service_role";



GRANT ALL ON TABLE "public"."atlas_hypotheses" TO "anon";
GRANT ALL ON TABLE "public"."atlas_hypotheses" TO "authenticated";
GRANT ALL ON TABLE "public"."atlas_hypotheses" TO "service_role";



GRANT ALL ON TABLE "public"."atlas_observations" TO "anon";
GRANT ALL ON TABLE "public"."atlas_observations" TO "authenticated";
GRANT ALL ON TABLE "public"."atlas_observations" TO "service_role";



GRANT ALL ON TABLE "public"."atlas_strategy_versions" TO "anon";
GRANT ALL ON TABLE "public"."atlas_strategy_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."atlas_strategy_versions" TO "service_role";



GRANT ALL ON TABLE "public"."atlas_whatsapp_messages" TO "anon";
GRANT ALL ON TABLE "public"."atlas_whatsapp_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."atlas_whatsapp_messages" TO "service_role";



GRANT ALL ON TABLE "public"."brand_analysis" TO "anon";
GRANT ALL ON TABLE "public"."brand_analysis" TO "authenticated";
GRANT ALL ON TABLE "public"."brand_analysis" TO "service_role";



GRANT ALL ON TABLE "public"."brand_evidence" TO "anon";
GRANT ALL ON TABLE "public"."brand_evidence" TO "authenticated";
GRANT ALL ON TABLE "public"."brand_evidence" TO "service_role";



GRANT ALL ON TABLE "public"."brand_memory" TO "anon";
GRANT ALL ON TABLE "public"."brand_memory" TO "authenticated";
GRANT ALL ON TABLE "public"."brand_memory" TO "service_role";



GRANT ALL ON TABLE "public"."brand_os_access" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."brands" TO "authenticated";
GRANT ALL ON TABLE "public"."brands" TO "service_role";



GRANT ALL ON TABLE "public"."briefs" TO "anon";
GRANT ALL ON TABLE "public"."briefs" TO "authenticated";
GRANT ALL ON TABLE "public"."briefs" TO "service_role";



GRANT ALL ON TABLE "public"."business_maps" TO "anon";
GRANT ALL ON TABLE "public"."business_maps" TO "authenticated";
GRANT ALL ON TABLE "public"."business_maps" TO "service_role";



GRANT ALL ON TABLE "public"."client_connections" TO "anon";
GRANT ALL ON TABLE "public"."client_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."client_connections" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."content_performance" TO "anon";
GRANT ALL ON TABLE "public"."content_performance" TO "authenticated";
GRANT ALL ON TABLE "public"."content_performance" TO "service_role";



GRANT ALL ON TABLE "public"."content_publications" TO "anon";
GRANT ALL ON TABLE "public"."content_publications" TO "authenticated";
GRANT ALL ON TABLE "public"."content_publications" TO "service_role";



GRANT ALL ON TABLE "public"."corrections" TO "anon";
GRANT ALL ON TABLE "public"."corrections" TO "authenticated";
GRANT ALL ON TABLE "public"."corrections" TO "service_role";



GRANT ALL ON TABLE "public"."cosmos_agent_runs" TO "anon";
GRANT ALL ON TABLE "public"."cosmos_agent_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."cosmos_agent_runs" TO "service_role";



GRANT ALL ON TABLE "public"."cosmos_memory" TO "anon";
GRANT ALL ON TABLE "public"."cosmos_memory" TO "authenticated";
GRANT ALL ON TABLE "public"."cosmos_memory" TO "service_role";



GRANT ALL ON TABLE "public"."cosmos_strategies" TO "anon";
GRANT ALL ON TABLE "public"."cosmos_strategies" TO "authenticated";
GRANT ALL ON TABLE "public"."cosmos_strategies" TO "service_role";



GRANT ALL ON TABLE "public"."decisions" TO "anon";
GRANT ALL ON TABLE "public"."decisions" TO "authenticated";
GRANT ALL ON TABLE "public"."decisions" TO "service_role";



GRANT ALL ON TABLE "public"."memory_items" TO "anon";
GRANT ALL ON TABLE "public"."memory_items" TO "authenticated";
GRANT ALL ON TABLE "public"."memory_items" TO "service_role";



GRANT ALL ON TABLE "public"."mercury_agent_runs" TO "anon";
GRANT ALL ON TABLE "public"."mercury_agent_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."mercury_agent_runs" TO "service_role";



GRANT ALL ON TABLE "public"."mercury_brand_settings" TO "anon";
GRANT ALL ON TABLE "public"."mercury_brand_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."mercury_brand_settings" TO "service_role";



GRANT ALL ON TABLE "public"."mercury_calendars" TO "anon";
GRANT ALL ON TABLE "public"."mercury_calendars" TO "authenticated";
GRANT ALL ON TABLE "public"."mercury_calendars" TO "service_role";



GRANT ALL ON TABLE "public"."mercury_content_assets" TO "anon";
GRANT ALL ON TABLE "public"."mercury_content_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."mercury_content_assets" TO "service_role";



GRANT ALL ON TABLE "public"."mercury_content_comments" TO "anon";
GRANT ALL ON TABLE "public"."mercury_content_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."mercury_content_comments" TO "service_role";



GRANT ALL ON TABLE "public"."mercury_content_items" TO "anon";
GRANT ALL ON TABLE "public"."mercury_content_items" TO "authenticated";
GRANT ALL ON TABLE "public"."mercury_content_items" TO "service_role";



GRANT ALL ON TABLE "public"."mercury_content_reviews" TO "anon";
GRANT ALL ON TABLE "public"."mercury_content_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."mercury_content_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."mercury_monthly_learnings" TO "anon";
GRANT ALL ON TABLE "public"."mercury_monthly_learnings" TO "authenticated";
GRANT ALL ON TABLE "public"."mercury_monthly_learnings" TO "service_role";



GRANT ALL ON TABLE "public"."mercury_piece_comments" TO "anon";
GRANT ALL ON TABLE "public"."mercury_piece_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."mercury_piece_comments" TO "service_role";



GRANT ALL ON TABLE "public"."mercury_team_assignments" TO "anon";
GRANT ALL ON TABLE "public"."mercury_team_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."mercury_team_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."opportunities" TO "anon";
GRANT ALL ON TABLE "public"."opportunities" TO "authenticated";
GRANT ALL ON TABLE "public"."opportunities" TO "service_role";



GRANT ALL ON TABLE "public"."orion_evidence" TO "anon";
GRANT ALL ON TABLE "public"."orion_evidence" TO "authenticated";
GRANT ALL ON TABLE "public"."orion_evidence" TO "service_role";



GRANT ALL ON TABLE "public"."orion_evidence_summary" TO "anon";
GRANT ALL ON TABLE "public"."orion_evidence_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."orion_evidence_summary" TO "service_role";



GRANT ALL ON TABLE "public"."orion_latest_evidence" TO "anon";
GRANT ALL ON TABLE "public"."orion_latest_evidence" TO "authenticated";
GRANT ALL ON TABLE "public"."orion_latest_evidence" TO "service_role";



GRANT ALL ON TABLE "public"."orion_scrape_jobs" TO "anon";
GRANT ALL ON TABLE "public"."orion_scrape_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."orion_scrape_jobs" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."pos_analytics_snapshots" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."pos_analytics_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_analytics_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."pos_business_capabilities" TO "anon";
GRANT ALL ON TABLE "public"."pos_business_capabilities" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_business_capabilities" TO "service_role";



GRANT ALL ON TABLE "public"."pos_business_profiles" TO "anon";
GRANT ALL ON TABLE "public"."pos_business_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_business_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."pos_capability_catalog" TO "anon";
GRANT ALL ON TABLE "public"."pos_capability_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_capability_catalog" TO "service_role";



GRANT ALL ON TABLE "public"."pos_categories" TO "anon";
GRANT ALL ON TABLE "public"."pos_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_categories" TO "service_role";



GRANT SELECT,INSERT,UPDATE ON TABLE "public"."pos_commercial_grants" TO "service_role";



GRANT ALL ON TABLE "public"."pos_customers" TO "anon";
GRANT ALL ON TABLE "public"."pos_customers" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_customers" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."pos_entitlements" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."pos_entitlements" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_entitlements" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."pos_intelligence_reports" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."pos_intelligence_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_intelligence_reports" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."pos_intelligence_signals" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."pos_intelligence_signals" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_intelligence_signals" TO "service_role";



GRANT ALL ON TABLE "public"."pos_inventory_movements" TO "anon";
GRANT ALL ON TABLE "public"."pos_inventory_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_inventory_movements" TO "service_role";



GRANT ALL ON TABLE "public"."pos_inventory_receipt_items" TO "anon";
GRANT ALL ON TABLE "public"."pos_inventory_receipt_items" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_inventory_receipt_items" TO "service_role";



GRANT ALL ON TABLE "public"."pos_inventory_receipts" TO "anon";
GRANT ALL ON TABLE "public"."pos_inventory_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_inventory_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."pos_locations" TO "anon";
GRANT ALL ON TABLE "public"."pos_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_locations" TO "service_role";



GRANT ALL ON TABLE "public"."pos_loyalty_programs" TO "anon";
GRANT ALL ON TABLE "public"."pos_loyalty_programs" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_loyalty_programs" TO "service_role";



GRANT ALL ON TABLE "public"."pos_loyalty_redemptions" TO "anon";
GRANT ALL ON TABLE "public"."pos_loyalty_redemptions" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_loyalty_redemptions" TO "service_role";



GRANT ALL ON TABLE "public"."pos_loyalty_reward_unlocks" TO "anon";
GRANT ALL ON TABLE "public"."pos_loyalty_reward_unlocks" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_loyalty_reward_unlocks" TO "service_role";



GRANT ALL ON TABLE "public"."pos_loyalty_rewards" TO "anon";
GRANT ALL ON TABLE "public"."pos_loyalty_rewards" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_loyalty_rewards" TO "service_role";



GRANT ALL ON TABLE "public"."pos_loyalty_transactions" TO "anon";
GRANT ALL ON TABLE "public"."pos_loyalty_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_loyalty_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."pos_loyalty_visit_events" TO "anon";
GRANT ALL ON TABLE "public"."pos_loyalty_visit_events" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_loyalty_visit_events" TO "service_role";



GRANT ALL ON TABLE "public"."pos_loyalty_visit_programs" TO "anon";
GRANT ALL ON TABLE "public"."pos_loyalty_visit_programs" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_loyalty_visit_programs" TO "service_role";



GRANT ALL ON TABLE "public"."pos_payments" TO "anon";
GRANT ALL ON TABLE "public"."pos_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_payments" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."pos_plan_entitlements" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."pos_plan_entitlements" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_plan_entitlements" TO "service_role";



GRANT ALL ON TABLE "public"."pos_plan_limits" TO "anon";
GRANT ALL ON TABLE "public"."pos_plan_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_plan_limits" TO "service_role";



GRANT ALL ON TABLE "public"."pos_plans" TO "anon";
GRANT ALL ON TABLE "public"."pos_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_plans" TO "service_role";



GRANT ALL ON TABLE "public"."pos_product_attribute_definitions" TO "anon";
GRANT ALL ON TABLE "public"."pos_product_attribute_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_product_attribute_definitions" TO "service_role";



GRANT ALL ON TABLE "public"."pos_product_components" TO "anon";
GRANT ALL ON TABLE "public"."pos_product_components" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_product_components" TO "service_role";



GRANT ALL ON TABLE "public"."pos_product_variants" TO "anon";
GRANT ALL ON TABLE "public"."pos_product_variants" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_product_variants" TO "service_role";



GRANT ALL ON TABLE "public"."pos_products" TO "anon";
GRANT ALL ON TABLE "public"."pos_products" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_products" TO "service_role";



GRANT ALL ON TABLE "public"."pos_profile_attribute_defaults" TO "anon";
GRANT ALL ON TABLE "public"."pos_profile_attribute_defaults" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_profile_attribute_defaults" TO "service_role";



GRANT ALL ON TABLE "public"."pos_profile_capability_defaults" TO "anon";
GRANT ALL ON TABLE "public"."pos_profile_capability_defaults" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_profile_capability_defaults" TO "service_role";



GRANT ALL ON TABLE "public"."pos_profile_catalog" TO "anon";
GRANT ALL ON TABLE "public"."pos_profile_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_profile_catalog" TO "service_role";



GRANT ALL ON TABLE "public"."pos_registers" TO "anon";
GRANT ALL ON TABLE "public"."pos_registers" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_registers" TO "service_role";



GRANT ALL ON TABLE "public"."pos_sale_items" TO "anon";
GRANT ALL ON TABLE "public"."pos_sale_items" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_sale_items" TO "service_role";



GRANT ALL ON TABLE "public"."pos_sale_loyalty_tier_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."pos_sale_loyalty_tier_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_sale_loyalty_tier_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."pos_sale_loyalty_visit_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."pos_sale_loyalty_visit_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_sale_loyalty_visit_snapshots" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pos_sale_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pos_sale_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pos_sale_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."pos_sales" TO "anon";
GRANT ALL ON TABLE "public"."pos_sales" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_sales" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."pos_signal_rule_configs" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."pos_signal_rule_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_signal_rule_configs" TO "service_role";



GRANT SELECT,INSERT,UPDATE ON TABLE "public"."pos_stripe_billing_links" TO "service_role";



GRANT ALL ON TABLE "public"."pos_subscription_events" TO "anon";
GRANT ALL ON TABLE "public"."pos_subscription_events" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_subscription_events" TO "service_role";



GRANT ALL ON TABLE "public"."pos_unit_conversions" TO "anon";
GRANT ALL ON TABLE "public"."pos_unit_conversions" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_unit_conversions" TO "service_role";



GRANT ALL ON TABLE "public"."pos_units" TO "anon";
GRANT ALL ON TABLE "public"."pos_units" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_units" TO "service_role";



GRANT ALL ON TABLE "public"."pos_variant_purchase_presentations" TO "anon";
GRANT ALL ON TABLE "public"."pos_variant_purchase_presentations" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_variant_purchase_presentations" TO "service_role";



GRANT ALL ON TABLE "public"."pos_wallet_passes" TO "anon";
GRANT ALL ON TABLE "public"."pos_wallet_passes" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_wallet_passes" TO "service_role";



GRANT ALL ON TABLE "public"."sales_agent_runs" TO "anon";
GRANT ALL ON TABLE "public"."sales_agent_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_agent_runs" TO "service_role";



GRANT ALL ON TABLE "public"."sales_ai_insights" TO "anon";
GRANT ALL ON TABLE "public"."sales_ai_insights" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_ai_insights" TO "service_role";



GRANT ALL ON TABLE "public"."sales_ai_leads" TO "anon";
GRANT ALL ON TABLE "public"."sales_ai_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_ai_leads" TO "service_role";



GRANT ALL ON TABLE "public"."sales_ai_reports" TO "anon";
GRANT ALL ON TABLE "public"."sales_ai_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_ai_reports" TO "service_role";



GRANT ALL ON TABLE "public"."sales_ai_settings" TO "anon";
GRANT ALL ON TABLE "public"."sales_ai_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_ai_settings" TO "service_role";



GRANT ALL ON TABLE "public"."sales_business_rules" TO "anon";
GRANT ALL ON TABLE "public"."sales_business_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_business_rules" TO "service_role";



GRANT ALL ON TABLE "public"."sales_catalog_items" TO "anon";
GRANT ALL ON TABLE "public"."sales_catalog_items" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_catalog_items" TO "service_role";



GRANT ALL ON TABLE "public"."sales_channels" TO "anon";
GRANT ALL ON TABLE "public"."sales_channels" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_channels" TO "service_role";



GRANT ALL ON TABLE "public"."sales_faqs" TO "anon";
GRANT ALL ON TABLE "public"."sales_faqs" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_faqs" TO "service_role";



GRANT ALL ON TABLE "public"."sales_followups" TO "anon";
GRANT ALL ON TABLE "public"."sales_followups" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_followups" TO "service_role";



GRANT ALL ON TABLE "public"."sales_knowledge_sources" TO "anon";
GRANT ALL ON TABLE "public"."sales_knowledge_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_knowledge_sources" TO "service_role";



GRANT ALL ON TABLE "public"."sales_leads" TO "anon";
GRANT ALL ON TABLE "public"."sales_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_leads" TO "service_role";



GRANT ALL ON TABLE "public"."sales_messages" TO "anon";
GRANT ALL ON TABLE "public"."sales_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_messages" TO "service_role";



GRANT ALL ON TABLE "public"."sales_outbound_messages" TO "anon";
GRANT ALL ON TABLE "public"."sales_outbound_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_outbound_messages" TO "service_role";



GRANT ALL ON TABLE "public"."sales_playbook_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."sales_playbook_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_playbook_suggestions" TO "service_role";



GRANT ALL ON TABLE "public"."sales_playbooks" TO "anon";
GRANT ALL ON TABLE "public"."sales_playbooks" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_playbooks" TO "service_role";



GRANT ALL ON TABLE "public"."social_metrics_daily" TO "anon";
GRANT ALL ON TABLE "public"."social_metrics_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."social_metrics_daily" TO "service_role";



GRANT ALL ON TABLE "public"."strategy_analysis" TO "anon";
GRANT ALL ON TABLE "public"."strategy_analysis" TO "authenticated";
GRANT ALL ON TABLE "public"."strategy_analysis" TO "service_role";



GRANT ALL ON TABLE "public"."strategy_publications" TO "anon";
GRANT ALL ON TABLE "public"."strategy_publications" TO "authenticated";
GRANT ALL ON TABLE "public"."strategy_publications" TO "service_role";



GRANT SELECT,INSERT,UPDATE ON TABLE "public"."stripe_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_connection_events" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_connection_secrets" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_connections" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_contacts" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_conversations" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_embedded_signup_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_leads" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_leads" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_message_statuses" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_message_statuses" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_message_statuses" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_messages" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_messages" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_unmatched_events" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_webhook_events" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
