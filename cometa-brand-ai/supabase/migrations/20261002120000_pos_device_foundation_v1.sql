begin;

create table public.pos_devices (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  auth_session_id uuid not null unique,
  brand_id text not null,
  brand_slug text not null references public.brands(slug) on update cascade on delete restrict,
  location_id uuid not null references public.pos_locations(id) on delete restrict,
  label text not null check (char_length(btrim(label)) between 1 and 120),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','REVOKED')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  check ((status = 'REVOKED') = (revoked_at is not null)),
  check (expires_at > created_at)
);
create index pos_devices_brand_idx on public.pos_devices(brand_slug, status);
alter table public.pos_devices enable row level security;
revoke all on public.pos_devices from public, anon, authenticated;
grant select, insert, update on public.pos_devices to service_role;

alter table public.pos_staff_sessions add column device_id uuid references public.pos_devices(id) on delete restrict;
create index pos_staff_sessions_device_idx on public.pos_staff_sessions(device_id) where revoked_at is null;

create function public.pos_device_identity_v1() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if old.status = 'REVOKED' and new is distinct from old then raise exception 'POS_DEVICE_REVOKED'; end if;
    if (new.id,new.host_user_id,new.auth_session_id,new.brand_id,new.brand_slug,new.location_id,new.token_hash,new.created_at)
       is distinct from
       (old.id,old.host_user_id,old.auth_session_id,old.brand_id,old.brand_slug,old.location_id,old.token_hash,old.created_at)
    then raise exception 'POS_DEVICE_IDENTITY_IMMUTABLE'; end if;
  end if;
  if not exists(select 1 from public.brands b join public.pos_locations l on l.brand_slug=b.slug
    where b.slug=new.brand_slug and b.id::text=new.brand_id and l.id=new.location_id)
  then raise exception 'POS_DEVICE_LOCATION_FORBIDDEN'; end if;
  return new;
end $$;
create trigger pos_device_identity before insert or update on public.pos_devices
for each row execute function public.pos_device_identity_v1();

create function public.pos_staff_device_binding_v1() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Serialize creation against revocation; a session cannot appear after the
  -- revocation transaction has already invalidated the device's sessions.
  if new.device_id is not null then
    perform 1 from public.pos_devices d
    where d.id=new.device_id and d.host_user_id=new.host_user_id and d.brand_slug=new.brand_slug
      and d.location_id=new.location_id and d.status='ACTIVE' and d.expires_at>clock_timestamp() for share;
    if not found then raise exception 'POS_DEVICE_SESSION_INVALID'; end if;
  end if;
  return new;
end $$;
create trigger pos_staff_device_binding before insert on public.pos_staff_sessions
for each row execute function public.pos_staff_device_binding_v1();

create function public.pos_revoke_device_v1(p_brand_slug text,p_device_id uuid,p_actor_user_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare d public.pos_devices;
begin
  select * into d from public.pos_devices where id=p_device_id and brand_slug=p_brand_slug for update;
  if not found then return false; end if;
  if d.status='ACTIVE' then
    update public.pos_devices set status='REVOKED',revoked_at=clock_timestamp(),revoked_by=p_actor_user_id where id=d.id;
  end if;
  update public.pos_staff_sessions set revoked_at=coalesce(revoked_at,clock_timestamp()) where device_id=d.id;
  return true;
end $$;
revoke all on function public.pos_device_identity_v1(), public.pos_staff_device_binding_v1(), public.pos_revoke_device_v1(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.pos_revoke_device_v1(text,uuid,uuid) to service_role;

-- Preserve Food's existing actor contract, with the terminal's branch as the
-- effective scope for an operator otherwise allowed in all branches.
create or replace function public.pos_food_actor_v1(p_brand_slug text, p_host_user_id uuid, p_session_id uuid)
returns public.pos_staff language plpgsql security definer set search_path=public as $$
declare v_staff public.pos_staff; v_session public.pos_staff_sessions;
begin
  select * into v_session from public.pos_staff_sessions
    where id=p_session_id and host_user_id=p_host_user_id and brand_slug=p_brand_slug;
  if not found then raise exception 'POS_FOOD_SESSION_REQUIRED'; end if;
  if v_session.device_id is not null then
    -- Same lock order as revoke: device, then operator session.
    perform 1 from public.pos_devices d where d.id=v_session.device_id
      and d.host_user_id=p_host_user_id and d.brand_slug=p_brand_slug
      and d.location_id=v_session.location_id and d.status='ACTIVE'
      and d.expires_at>clock_timestamp() for share;
    if not found then raise exception 'POS_FOOD_SESSION_REQUIRED'; end if;
  end if;
  select st.* into v_staff from public.pos_staff st join public.pos_staff_sessions se
    on se.staff_id=st.id and se.brand_slug=st.brand_slug
    where se.id=p_session_id and se.host_user_id=p_host_user_id and se.brand_slug=p_brand_slug
      and se.revoked_at is null and se.expires_at>clock_timestamp() and st.active
      and se.device_id is not distinct from v_session.device_id
      and se.location_id is not distinct from v_session.location_id
      and ((se.device_id is null and se.location_id is not distinct from st.location_id)
        or (se.device_id is not null and (st.location_id is null or st.location_id=se.location_id)))
    for share of st,se;
  if not found then raise exception 'POS_FOOD_SESSION_REQUIRED'; end if;
  if not exists(select 1 from public.pos_business_profiles where brand_slug=p_brand_slug and profile_code in ('restaurant','coffee_shop')) then
    raise exception 'POS_FOOD_FORBIDDEN';
  end if;
  if v_session.device_id is not null then v_staff.location_id:=v_session.location_id; end if;
  return v_staff;
end $$;
revoke all on function public.pos_food_actor_v1(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.pos_food_actor_v1(text,uuid,uuid) to service_role;
commit;
