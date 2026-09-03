-- Multi-brand Access V1: explicit grant, restore and role-change semantics.
alter table public.cometa_access_audit
  drop constraint if exists cometa_access_audit_action_check;

alter table public.cometa_access_audit
  add constraint cometa_access_audit_action_check
  check (action in ('create_profile','grant_brand','revoke_brand','revoke_all','restore_account','restore_brand','change_role'));

create or replace function public.cometa_access_grant_brand_v2(
  p_target_user_id uuid,
  p_brand_slug text,
  p_access_role text,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.user_brand_access;
begin
  perform public.cometa_access_assert_admin_v2(p_actor_user_id);
  perform public.cometa_access_assert_brand_v2(p_brand_slug);
  if not exists (select 1 from auth.users where id = p_target_user_id) then raise exception using message = 'USER_NOT_FOUND'; end if;
  if not exists (select 1 from public.user_profiles where user_id = p_target_user_id and status = 'active') then raise exception using message = 'PROFILE_INACTIVE_OR_MISSING'; end if;
  if p_access_role not in ('owner','admin','manager','cashier','inventory','editor','viewer') then raise exception using message = 'ACCESS_ROLE_INVALID'; end if;

  select * into v_row from public.user_brand_access
  where user_id = p_target_user_id and brand_slug = p_brand_slug
  for update;

  if found then
    if v_row.status = 'inactive' then raise exception using message = 'MEMBERSHIP_INACTIVE_USE_RESTORE'; end if;
    if v_row.access_role <> p_access_role then raise exception using message = 'ROLE_CHANGE_REQUIRES_EXPLICIT_ACTION'; end if;
    return jsonb_build_object('status',v_row.status,'brand_slug',v_row.brand_slug,'access_role',v_row.access_role,'changed',false);
  end if;

  insert into public.user_brand_access(user_id,brand_slug,access_role,status)
  values(p_target_user_id,p_brand_slug,p_access_role,'active') returning * into v_row;
  insert into public.cometa_access_audit(actor_user_id,target_user_id,action,brand_slug,metadata)
  values(p_actor_user_id,p_target_user_id,'grant_brand',p_brand_slug,jsonb_build_object('access_role',v_row.access_role));
  return jsonb_build_object('status',v_row.status,'brand_slug',v_row.brand_slug,'access_role',v_row.access_role,'changed',true);
end;
$$;

create or replace function public.cometa_access_change_role_v2(
  p_target_user_id uuid,
  p_brand_slug text,
  p_access_role text,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.user_brand_access;
  v_role_from text;
begin
  perform public.cometa_access_assert_admin_v2(p_actor_user_id);
  perform public.cometa_access_assert_brand_v2(p_brand_slug);
  if not exists (select 1 from auth.users where id = p_target_user_id) then raise exception using message = 'USER_NOT_FOUND'; end if;
  if p_access_role not in ('owner','admin','manager','cashier','inventory','editor','viewer') then raise exception using message = 'ACCESS_ROLE_INVALID'; end if;

  select * into v_row from public.user_brand_access
  where user_id = p_target_user_id and brand_slug = p_brand_slug
  for update;
  if not found then raise exception using message = 'MEMBERSHIP_NOT_FOUND'; end if;
  if v_row.status <> 'active' then raise exception using message = 'MEMBERSHIP_INACTIVE_USE_RESTORE'; end if;
  if v_row.access_role = p_access_role then
    return jsonb_build_object('status',v_row.status,'brand_slug',v_row.brand_slug,'access_role',v_row.access_role,'changed',false);
  end if;

  v_role_from := v_row.access_role;
  update public.user_brand_access set access_role = p_access_role, updated_at = now()
  where id = v_row.id returning * into v_row;
  insert into public.cometa_access_audit(actor_user_id,target_user_id,action,brand_slug,metadata)
  values(p_actor_user_id,p_target_user_id,'change_role',p_brand_slug,jsonb_build_object('role_from',v_role_from,'role_to',v_row.access_role));
  return jsonb_build_object('status',v_row.status,'brand_slug',v_row.brand_slug,'access_role',v_row.access_role,'changed',true);
end;
$$;

revoke all on function public.cometa_access_change_role_v2(uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.cometa_access_change_role_v2(uuid,text,text,uuid) to service_role;
