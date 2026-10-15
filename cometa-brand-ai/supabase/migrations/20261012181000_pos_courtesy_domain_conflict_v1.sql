begin;
-- Business CAS conflict, not a retryable database serialization failure.
create or replace function public.pos_manage_complimentary_v1(p_brand text,p_actor uuid,p_expected uuid,p_action text,p_plan text,p_end timestamptz,p_reason text)
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
 if old_row.id is distinct from p_expected then raise exception 'GRANT_CONFLICT' using errcode='P0001';end if;
 if p_action='revoke' and old_row.id is null then raise exception 'GRANT_CONFLICT' using errcode='P0001';end if;
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
commit;
