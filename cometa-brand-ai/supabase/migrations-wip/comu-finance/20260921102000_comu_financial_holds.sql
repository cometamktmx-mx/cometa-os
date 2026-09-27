create table public.comu_seller_fund_holds (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.comu_sellers(id),
  suborder_id uuid not null references public.comu_order_suborders(id),
  allocation_id uuid not null references public.comu_payment_allocations(id),
  reason text not null check (length(btrim(reason)) between 1 and 240),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','RELEASED')),
  created_at timestamptz not null default now(),
  released_at timestamptz,
  created_by uuid not null,
  released_by uuid
);
create unique index comu_one_active_fund_hold on public.comu_seller_fund_holds(allocation_id) where status='ACTIVE';
create table public.comu_financial_events (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.comu_sellers(id),
  allocation_id uuid references public.comu_payment_allocations(id),
  settlement_id uuid,
  event_type text not null,
  actor_id uuid,
  idempotency_key text not null unique,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create function public.comu_set_fund_hold(p_allocation_id uuid, p_release boolean, p_reason text, p_actor_id uuid) returns public.comu_seller_fund_holds
language plpgsql security definer set search_path=public as $$
declare a public.comu_payment_allocations%rowtype; h public.comu_seller_fund_holds%rowtype;
begin
  select * into strict a from public.comu_payment_allocations where id=p_allocation_id for update;
  select * into h from public.comu_seller_fund_holds where allocation_id=a.id and status='ACTIVE' for update;
  if p_release then
    if not found then return null; end if;
    update public.comu_seller_fund_holds set status='RELEASED',released_at=now(),released_by=p_actor_id where id=h.id returning * into h;
  else
    if found then return h; end if;
    if a.status not in ('HELD','AVAILABLE') then raise exception 'COMU_FUNDS_ALREADY_COMMITTED'; end if;
    insert into public.comu_seller_fund_holds(seller_id,suborder_id,allocation_id,reason,created_by)
    values(a.seller_id,a.suborder_id,a.id,p_reason,p_actor_id) returning * into h;
  end if;
  insert into public.comu_financial_events(seller_id,allocation_id,event_type,actor_id,idempotency_key,payload)
  values(a.seller_id,a.id,case when p_release then 'HOLD_RELEASED' else 'HOLD_CREATED' end,p_actor_id,h.id::text||':'||h.status,jsonb_build_object('hold_id',h.id));
  return h;
end; $$;
revoke all on function public.comu_set_fund_hold(uuid,boolean,text,uuid) from public,anon,authenticated;
grant execute on function public.comu_set_fund_hold(uuid,boolean,text,uuid) to service_role;
