begin;

-- Commercial authority only. No storefront, publication, membership or inventory.
create table public.brand_online_store_access (
  brand_id uuid primary key references public.brands(id),
  status text not null check (status in ('enabled','suspended')),
  revision integer not null check (revision > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id)
);
create table public.brand_online_store_access_events (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id),
  actor_user_id uuid not null references auth.users(id),
  previous_status text not null check (previous_status in ('disabled','enabled','suspended')),
  new_status text not null check (new_status in ('enabled','suspended')),
  revision integer not null check (revision > 0),
  created_at timestamptz not null default now(),
  unique (brand_id, revision)
);
alter table public.brand_online_store_access enable row level security;
alter table public.brand_online_store_access_events enable row level security;
revoke all on public.brand_online_store_access, public.brand_online_store_access_events from public, anon, authenticated, service_role;
grant select on public.brand_online_store_access, public.brand_online_store_access_events to service_role;

-- Actor is supplied only by the authenticated server. Never expose this RPC to
-- authenticated/anon: callers cannot nominate an admin actor directly.
create function public.brand_online_store_set_access_a1(
  p_brand_slug text, p_actor_user_id uuid, p_status text, p_expected_revision integer
) returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.brands%rowtype; current_row public.brand_online_store_access%rowtype;
  previous text; current_revision integer;
begin
  perform 1 from public.user_profiles where user_id=p_actor_user_id
    and role='admin' and status='active' for share;
  if not found then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  if p_status is null or p_status not in ('enabled','suspended') or
     p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'STORE_ACCESS_INPUT_INVALID' using errcode='22023';
  end if;
  -- Serialize even the first activation, when no capability row exists yet.
  select * into b from public.brands where slug=p_brand_slug for update;
  if not found then raise exception 'BRAND_NOT_FOUND' using errcode='P0002'; end if;
  if p_status='enabled' and b.status is distinct from 'active' then
    raise exception 'BRAND_INACTIVE' using errcode='22023';
  end if;
  select * into current_row from public.brand_online_store_access where brand_id=b.id for update;
  current_revision := coalesce(current_row.revision,0);
  previous := coalesce(current_row.status,'disabled');
  if current_revision <> p_expected_revision then
    raise exception 'STORE_ACCESS_CONFLICT' using errcode='40001';
  end if;
  if previous=p_status then return to_jsonb(current_row); end if;
  if previous='disabled' and p_status='suspended' then
    raise exception 'STORE_NOT_ENABLED' using errcode='22023';
  end if;
  insert into public.brand_online_store_access(brand_id,status,revision,updated_by)
    values(b.id,p_status,current_revision+1,p_actor_user_id)
    on conflict(brand_id) do update set status=excluded.status,revision=excluded.revision,
      updated_by=excluded.updated_by,updated_at=now()
    returning * into current_row;
  insert into public.brand_online_store_access_events(brand_id,actor_user_id,previous_status,new_status,revision)
    values(b.id,p_actor_user_id,previous,p_status,current_row.revision);
  return to_jsonb(current_row);
end $$;
revoke all on function public.brand_online_store_set_access_a1(text,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.brand_online_store_set_access_a1(text,uuid,text,integer) to service_role;
commit;
