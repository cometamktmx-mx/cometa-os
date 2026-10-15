-- COMETA Access Center V2. No Auth identities or historical rows are deleted.
create table if not exists public.cometa_access_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  target_user_id uuid not null,
  action text not null check (action in ('create_profile','grant_brand','revoke_brand','revoke_all','restore_account','restore_brand')),
  brand_slug text null references public.brands(slug) on update cascade on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint cometa_access_audit_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists cometa_access_audit_target_time_idx on public.cometa_access_audit(target_user_id, occurred_at desc);
alter table public.cometa_access_audit enable row level security;
revoke all on table public.cometa_access_audit from public, anon, authenticated;
grant select, insert on table public.cometa_access_audit to service_role;

create or replace function public.cometa_access_assert_admin_v2(p_actor_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1 from public.user_profiles
    where user_id = p_actor_user_id and role = 'admin' and status = 'active'
  ) then raise exception using errcode = '42501', message = 'ADMIN_REQUIRED'; end if;
end;
$$;

create or replace function public.cometa_access_assert_brand_v2(p_brand_slug text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (select 1 from public.brands where slug = p_brand_slug) then
    raise exception using errcode = 'P0002', message = 'BRAND_NOT_FOUND';
  end if;
end;
$$;

create or replace function public.cometa_access_create_profile_v2(p_target_user_id uuid, p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_email text; v_changed boolean := false;
begin
  perform public.cometa_access_assert_admin_v2(p_actor_user_id);
  select email into v_email from auth.users where id=p_target_user_id for update;
  if not found or v_email is null then raise exception using message='USER_NOT_FOUND'; end if;
  if not exists(select 1 from public.user_profiles where user_id=p_target_user_id) then
    insert into public.user_profiles(user_id,email,role,status) values(p_target_user_id,lower(v_email),'client','active');
    v_changed := true;
    insert into public.cometa_access_audit(actor_user_id,target_user_id,action) values(p_actor_user_id,p_target_user_id,'create_profile');
  end if;
  return jsonb_build_object('status','active','role','client','changed',v_changed);
end; $$;

create or replace function public.cometa_access_grant_brand_v2(p_target_user_id uuid, p_brand_slug text, p_access_role text, p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_row public.user_brand_access; v_changed boolean := false;
begin
  perform public.cometa_access_assert_admin_v2(p_actor_user_id);
  perform public.cometa_access_assert_brand_v2(p_brand_slug);
  if not exists (select 1 from auth.users where id = p_target_user_id) then raise exception using message = 'USER_NOT_FOUND'; end if;
  if not exists (select 1 from public.user_profiles where user_id = p_target_user_id and status = 'active') then raise exception using message = 'PROFILE_INACTIVE_OR_MISSING'; end if;
  if p_access_role not in ('owner','admin','manager','cashier','inventory','editor','viewer') then raise exception using message = 'ACCESS_ROLE_INVALID'; end if;
  select * into v_row from public.user_brand_access where user_id=p_target_user_id and brand_slug=p_brand_slug for update;
  if not found then
    insert into public.user_brand_access(user_id, brand_slug, access_role, status) values (p_target_user_id, p_brand_slug, p_access_role, 'active') returning * into v_row;
    v_changed := true;
  elsif v_row.status <> 'active' or v_row.access_role <> p_access_role then
    update public.user_brand_access set access_role=p_access_role,status='active',updated_at=now() where id=v_row.id returning * into v_row;
    v_changed := true;
  end if;
  if v_changed then insert into public.cometa_access_audit(actor_user_id,target_user_id,action,brand_slug,metadata) values (p_actor_user_id,p_target_user_id,'grant_brand',p_brand_slug,jsonb_build_object('access_role',v_row.access_role)); end if;
  return jsonb_build_object('status',v_row.status,'brand_slug',v_row.brand_slug,'access_role',v_row.access_role,'changed',v_changed);
end; $$;

create or replace function public.cometa_access_revoke_brand_v2(p_target_user_id uuid, p_brand_slug text, p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_row public.user_brand_access; v_changed boolean := false;
begin
  perform public.cometa_access_assert_admin_v2(p_actor_user_id);
  perform public.cometa_access_assert_brand_v2(p_brand_slug);
  select * into v_row from public.user_brand_access where user_id=p_target_user_id and brand_slug=p_brand_slug for update;
  if not found then raise exception using message = 'MEMBERSHIP_NOT_FOUND'; end if;
  if v_row.status = 'active' then
    update public.user_brand_access set status='inactive',updated_at=now() where id=v_row.id returning * into v_row;
    update public.mercury_team_assignments set active=false,updated_at=now() where user_id=p_target_user_id and brand_slug=p_brand_slug and active=true;
    v_changed := true;
    insert into public.cometa_access_audit(actor_user_id,target_user_id,action,brand_slug,metadata) values(p_actor_user_id,p_target_user_id,'revoke_brand',p_brand_slug,jsonb_build_object('access_role',v_row.access_role));
  end if;
  return jsonb_build_object('status',v_row.status,'brand_slug',v_row.brand_slug,'changed',v_changed);
end; $$;

create or replace function public.cometa_access_revoke_all_v2(p_target_user_id uuid, p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_profile public.user_profiles; v_changed boolean := false; v_conflict text;
begin
  perform public.cometa_access_assert_admin_v2(p_actor_user_id);
  if p_target_user_id = p_actor_user_id then raise exception using message = 'SELF_REVOKE_FORBIDDEN'; end if;
  select * into v_profile from public.user_profiles where user_id=p_target_user_id for update;
  if not found then raise exception using message = 'PROFILE_NOT_FOUND'; end if;
  perform 1 from public.user_brand_access where user_id=p_target_user_id for update;
  if v_profile.role='admin' and v_profile.status='active' and not exists(select 1 from public.user_profiles where role='admin' and status='active' and user_id<>p_target_user_id) then raise exception using message='LAST_ADMIN_REQUIRED'; end if;
  select uba.brand_slug into v_conflict from public.user_brand_access uba where uba.user_id=p_target_user_id and uba.status='active' and uba.access_role='owner' and not exists(select 1 from public.user_brand_access other where other.brand_slug=uba.brand_slug and other.status='active' and other.access_role='owner' and other.user_id<>p_target_user_id) limit 1;
  if v_conflict is not null then raise exception using message='LAST_OWNER_REQUIRED:' || v_conflict; end if;
  if v_profile.status='active' or exists(select 1 from public.user_brand_access where user_id=p_target_user_id and status='active') or exists(select 1 from public.mercury_team_assignments where user_id=p_target_user_id and active=true) then
    update public.user_profiles set status='inactive',updated_at=now() where user_id=p_target_user_id;
    update public.user_brand_access set status='inactive',updated_at=now() where user_id=p_target_user_id and status='active';
    update public.mercury_team_assignments set active=false,updated_at=now() where user_id=p_target_user_id and active=true;
    v_changed := true;
    insert into public.cometa_access_audit(actor_user_id,target_user_id,action,metadata) values(p_actor_user_id,p_target_user_id,'revoke_all',jsonb_build_object('profile_role',v_profile.role));
  end if;
  return jsonb_build_object('status','inactive','changed',v_changed);
end; $$;

create or replace function public.cometa_access_restore_account_v2(p_target_user_id uuid, p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_profile public.user_profiles; v_changed boolean := false;
begin
  perform public.cometa_access_assert_admin_v2(p_actor_user_id);
  select * into v_profile from public.user_profiles where user_id=p_target_user_id for update;
  if not found then raise exception using message='PROFILE_NOT_FOUND'; end if;
  if v_profile.status='inactive' then update public.user_profiles set status='active',updated_at=now() where user_id=p_target_user_id; v_changed:=true; insert into public.cometa_access_audit(actor_user_id,target_user_id,action) values(p_actor_user_id,p_target_user_id,'restore_account'); end if;
  return jsonb_build_object('status','active','changed',v_changed);
end; $$;

create or replace function public.cometa_access_restore_brand_v2(p_target_user_id uuid, p_brand_slug text, p_access_role text, p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_row public.user_brand_access; v_changed boolean := false;
begin
  perform public.cometa_access_assert_admin_v2(p_actor_user_id); perform public.cometa_access_assert_brand_v2(p_brand_slug);
  if not exists(select 1 from public.user_profiles where user_id=p_target_user_id and status='active') then raise exception using message='PROFILE_INACTIVE'; end if;
  if p_access_role not in ('owner','admin','manager','cashier','inventory','editor','viewer') then raise exception using message='ACCESS_ROLE_INVALID'; end if;
  select * into v_row from public.user_brand_access where user_id=p_target_user_id and brand_slug=p_brand_slug for update;
  if not found then raise exception using message='MEMBERSHIP_NOT_FOUND'; end if;
  if v_row.status='inactive' or v_row.access_role<>p_access_role then update public.user_brand_access set status='active',access_role=p_access_role,updated_at=now() where id=v_row.id returning * into v_row; v_changed:=true; insert into public.cometa_access_audit(actor_user_id,target_user_id,action,brand_slug,metadata) values(p_actor_user_id,p_target_user_id,'restore_brand',p_brand_slug,jsonb_build_object('access_role',v_row.access_role)); end if;
  return jsonb_build_object('status',v_row.status,'brand_slug',v_row.brand_slug,'access_role',v_row.access_role,'changed',v_changed);
end; $$;

revoke all on function public.cometa_access_assert_admin_v2(uuid) from public, anon, authenticated;
revoke all on function public.cometa_access_assert_brand_v2(text) from public, anon, authenticated;
revoke all on function public.cometa_access_create_profile_v2(uuid,uuid) from public, anon, authenticated;
revoke all on function public.cometa_access_grant_brand_v2(uuid,text,text,uuid) from public, anon, authenticated;
revoke all on function public.cometa_access_revoke_brand_v2(uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.cometa_access_revoke_all_v2(uuid,uuid) from public, anon, authenticated;
revoke all on function public.cometa_access_restore_account_v2(uuid,uuid) from public, anon, authenticated;
revoke all on function public.cometa_access_restore_brand_v2(uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.cometa_access_grant_brand_v2(uuid,text,text,uuid) to service_role;
grant execute on function public.cometa_access_create_profile_v2(uuid,uuid) to service_role;
grant execute on function public.cometa_access_revoke_brand_v2(uuid,text,uuid) to service_role;
grant execute on function public.cometa_access_revoke_all_v2(uuid,uuid) to service_role;
grant execute on function public.cometa_access_restore_account_v2(uuid,uuid) to service_role;
grant execute on function public.cometa_access_restore_brand_v2(uuid,text,text,uuid) to service_role;
