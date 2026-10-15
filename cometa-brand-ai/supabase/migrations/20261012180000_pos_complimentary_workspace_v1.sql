begin;
-- Existing immutable grants remain authoritative. Infinity means no automatic expiry.
create table public.pos_commercial_grant_events (
 id uuid primary key default gen_random_uuid(), brand_slug text not null references public.brands(slug),
 actor_user_id uuid not null references auth.users(id), action text not null check(action in ('grant','replace','revoke')),
 reason text not null, previous_grant jsonb, new_grant jsonb, created_at timestamptz not null default now()
);
alter table public.pos_commercial_grant_events enable row level security;
revoke all on public.pos_commercial_grant_events from public,anon,authenticated,service_role;
grant select on public.pos_commercial_grant_events to service_role;

create function public.pos_manage_complimentary_v1(p_brand text,p_actor uuid,p_expected uuid,p_action text,p_plan text,p_end timestamptz,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare old_row pos_commercial_grants%rowtype; new_row pos_commercial_grants%rowtype;
begin
 perform 1 from user_profiles where user_id=p_actor and role='admin' and status='active' for share;
 if not found then raise exception 'ADMIN_REQUIRED' using errcode='42501';end if;
 if p_action is null or p_action not in ('save','revoke') or p_reason is null or length(btrim(p_reason)) not between 3 and 500 then raise exception 'GRANT_INVALID' using errcode='22023';end if;
 perform 1 from brands where slug=p_brand for update;
 if not found then raise exception 'BRAND_NOT_FOUND' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtext('pos_commercial_grants_overlap'),hashtext(p_brand));
 select * into old_row from pos_commercial_grants where brand_slug=p_brand and status='active' order by starts_at desc,created_at desc,id desc limit 1 for update;
 if old_row.id is distinct from p_expected then raise exception 'GRANT_CONFLICT' using errcode='40001';end if;
 if p_action='revoke' and old_row.id is null then raise exception 'GRANT_CONFLICT' using errcode='40001';end if;
 if p_action='save' then
  perform 1 from pos_plans where code=p_plan and active for share;
  if not found or (p_end is not null and (not isfinite(p_end) or p_end<=now())) then raise exception 'GRANT_INVALID' using errcode='22023';end if;
 end if;
 if old_row.id is not null then
  update pos_commercial_grants set status='revoked',revoked_at=now(),revoked_by=p_actor where id=old_row.id;
 end if;
 if p_action='save' then
  insert into pos_commercial_grants(brand_slug,grant_code,grant_type,plan_code,status,starts_at,ends_at,reason,created_by)
  values(p_brand,'WORKSPACE-'||gen_random_uuid()::text,'complimentary',p_plan,'active',now(),coalesce(p_end,'infinity'::timestamptz),btrim(p_reason),p_actor) returning * into new_row;
 end if;
 insert into pos_commercial_grant_events(brand_slug,actor_user_id,action,reason,previous_grant,new_grant)
 values(p_brand,p_actor,case when p_action='revoke' then 'revoke' when old_row.id is null then 'grant' else 'replace' end,btrim(p_reason),case when old_row.id is not null then to_jsonb(old_row) end,case when new_row.id is not null then to_jsonb(new_row) end);
 return jsonb_build_object('id',new_row.id,'action',p_action);
end $$;
revoke all on function public.pos_manage_complimentary_v1(text,uuid,uuid,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.pos_manage_complimentary_v1(text,uuid,uuid,text,text,timestamptz,text) to service_role;
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
      'endsAt', CASE WHEN v_grant_effective AND isfinite(v_grant.ends_at) THEN v_grant.ends_at ELSE NULL END
    )
  );
END
$$;

commit;
