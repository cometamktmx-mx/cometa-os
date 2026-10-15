-- COMU Fulfillment + HUB Core V1. Additive operational layer; no inventory writes.
alter table public.comu_orders add column if not exists fulfillment_status text not null default 'WAITING_FOR_SELLERS';
alter table public.comu_orders add column if not exists fulfillment_updated_at timestamptz not null default now();
alter table public.comu_order_suborders add column if not exists fulfillment_status text not null default 'PAID';
alter table public.comu_order_suborders add column if not exists fulfillment_route text not null default 'HUB';
alter table public.comu_order_suborders add column if not exists hub_handoff_token text;
alter table public.comu_order_suborders add column if not exists deadline_at timestamptz;
alter table public.comu_order_suborders add column if not exists overdue boolean not null default false;
alter table public.comu_order_suborders add column if not exists package_count integer not null default 1;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='comu_orders_fulfillment_v1_status_ck') then
    alter table public.comu_orders add constraint comu_orders_fulfillment_v1_status_ck check (fulfillment_status in ('WAITING_FOR_SELLERS','READY_FOR_CONSOLIDATION','CONSOLIDATED','READY_TO_SHIP','SHIPPED','DELIVERED','ISSUE'));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='comu_order_suborders_fulfillment_v1_status_ck') then
    alter table public.comu_order_suborders add constraint comu_order_suborders_fulfillment_v1_status_ck check (fulfillment_status in ('PAID','PREPARING','READY_FOR_HUB','HANDED_TO_HUB','HUB_RECEIVED','CONSOLIDATED','READY_TO_SHIP','SHIPPED','DELIVERED','CANCELLED','ISSUE'));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='comu_order_suborders_fulfillment_v1_route_ck') then
    alter table public.comu_order_suborders add constraint comu_order_suborders_fulfillment_v1_route_ck check (fulfillment_route in ('HUB','DIRECT'));
  end if;
end $$;

create table if not exists public.comu_fulfillment_events (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.comu_orders(id) on delete cascade,
  suborder_id uuid references public.comu_order_suborders(id) on delete cascade, event_type text not null,
  from_status text, to_status text, actor_type text not null, actor_id uuid, note text, payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), unique(suborder_id,event_type,to_status)
);
create index if not exists comu_fulfillment_events_order_idx on public.comu_fulfillment_events(order_id,created_at);

create table if not exists public.comu_hub_receipts (
  id uuid primary key default gen_random_uuid(), suborder_id uuid not null unique references public.comu_order_suborders(id) on delete cascade,
  receipt_token text not null unique, received_by uuid, expected_items numeric(14,3) not null default 0, received_items numeric(14,3) not null default 0,
  note text, created_at timestamptz not null default now()
);

create table if not exists public.comu_shipments (
  id uuid primary key default gen_random_uuid(), master_order_id uuid not null unique references public.comu_orders(id) on delete cascade,
  provider text not null default 'LOCAL_TEST', provider_shipment_id text, carrier text, tracking_number text, label_url text,
  status text not null default 'READY_TO_SHIP', destination_snapshot jsonb, weight_kg numeric(10,3), length_cm numeric(10,2), width_cm numeric(10,2), height_cm numeric(10,2),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.comu_shipment_suborders (
  shipment_id uuid not null references public.comu_shipments(id) on delete cascade, suborder_id uuid not null unique references public.comu_order_suborders(id) on delete restrict,
  primary key(shipment_id,suborder_id)
);
create table if not exists public.comu_fulfillment_incidents (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.comu_orders(id) on delete cascade,
  suborder_id uuid not null references public.comu_order_suborders(id) on delete cascade, seller_id uuid not null,
  incident_type text not null check (incident_type in ('INCOMPLETE_PACKAGE','WRONG_PRODUCT','DAMAGED_PACKAGE','OTHER')),
  note text, actor_id uuid, created_at timestamptz not null default now()
);
create index if not exists comu_fulfillment_incidents_suborder_idx on public.comu_fulfillment_incidents(suborder_id,created_at);

alter table public.comu_orders enable row level security;
alter table public.comu_order_suborders enable row level security;
alter table public.comu_fulfillment_events enable row level security;
alter table public.comu_hub_receipts enable row level security;
alter table public.comu_shipments enable row level security;
alter table public.comu_shipment_suborders enable row level security;
alter table public.comu_fulfillment_incidents enable row level security;
create policy comu_fulfillment_events_buyer_seller_v1 on public.comu_fulfillment_events for select to authenticated using (
  exists(select 1 from public.comu_orders o join public.comu_buyers b on b.id=o.buyer_id where o.id=order_id and (b.user_id=auth.uid() or public.is_cometa_admin()))
  or exists(select 1 from public.comu_order_suborders so join public.comu_seller_memberships m on m.seller_id=so.seller_id where so.id=suborder_id and m.user_id=auth.uid() and m.active)
);
create policy comu_hub_receipts_admin_v1 on public.comu_hub_receipts for select to authenticated using (public.is_cometa_admin());
create policy comu_shipments_buyer_v1 on public.comu_shipments for select to authenticated using (exists(select 1 from public.comu_orders o join public.comu_buyers b on b.id=o.buyer_id where o.id=master_order_id and (b.user_id=auth.uid() or public.is_cometa_admin())));
create policy comu_shipment_suborders_buyer_v1 on public.comu_shipment_suborders for select to authenticated using (exists(select 1 from public.comu_shipments s join public.comu_orders o on o.id=s.master_order_id join public.comu_buyers b on b.id=o.buyer_id where s.id=shipment_id and (b.user_id=auth.uid() or public.is_cometa_admin())));
create policy comu_fulfillment_incidents_admin_seller_v1 on public.comu_fulfillment_incidents for select to authenticated using (public.is_cometa_admin() or exists(select 1 from public.comu_seller_memberships m where m.seller_id=comu_fulfillment_incidents.seller_id and m.user_id=auth.uid() and m.active));

create or replace function public.comu_fulfillment_deadline_v1(p_at timestamptz) returns timestamptz language plpgsql immutable as $$
declare local_at timestamp := p_at at time zone 'America/Mexico_City'; d date := local_at::date; h integer := extract(hour from local_at); dow integer := extract(isodow from local_at); target date;
begin
  if dow=7 then target:=d+1; return (target::text||' 15:00:00 America/Mexico_City')::timestamptz; end if;
  if dow=6 then if h<12 then return (d::text||' 12:00:00 America/Mexico_City')::timestamptz; else target:=d+2; return (target::text||' 15:00:00 America/Mexico_City')::timestamptz; end if; end if;
  if h<14 then return (d::text||' 16:00:00 America/Mexico_City')::timestamptz; end if;
  target:=d+1; if extract(isodow from target)=6 then target:=target+2; end if; return (target::text||' 15:00:00 America/Mexico_City')::timestamptz;
end $$;

create or replace function public.comu_transition_suborder_fulfillment_v1(p_suborder_id uuid,p_to_status text,p_actor_type text,p_note text default null)
returns public.comu_order_suborders language plpgsql security definer set search_path=public as $$
declare so public.comu_order_suborders%rowtype; previous_status text; allowed boolean:=false; actor uuid:=auth.uid();
begin
  select * into so from public.comu_order_suborders where id=p_suborder_id for update;
  if not found then raise exception 'COMU_SUBORDER_NOT_FOUND'; end if;
  if p_actor_type='SELLER' and not exists(select 1 from public.comu_seller_memberships m where m.seller_id=so.seller_id and m.user_id=auth.uid() and m.active) then raise exception 'COMU_SELLER_ACCESS_DENIED'; end if;
  if p_actor_type in ('HUB','ADMIN') and not public.is_cometa_admin() then raise exception 'COMU_HUB_ACCESS_DENIED'; end if;
  if p_actor_type not in ('SELLER','HUB','ADMIN') then raise exception 'COMU_ACTOR_INVALID'; end if;
  previous_status := so.fulfillment_status;
  if p_actor_type='SELLER' and p_to_status not in ('PREPARING','READY_FOR_HUB','HANDED_TO_HUB') then raise exception 'COMU_SELLER_FULFILLMENT_FORBIDDEN'; end if;
  if p_actor_type='HUB' and p_to_status <> 'HUB_RECEIVED' then raise exception 'COMU_HUB_FULFILLMENT_FORBIDDEN'; end if;
  allowed := (previous_status,p_to_status) in (('PAID','PREPARING'),('PREPARING','READY_FOR_HUB'),('READY_FOR_HUB','HANDED_TO_HUB'),('HANDED_TO_HUB','HUB_RECEIVED'),('HUB_RECEIVED','CONSOLIDATED'),('CONSOLIDATED','READY_TO_SHIP'),('READY_TO_SHIP','SHIPPED'),('SHIPPED','DELIVERED'));
  if not allowed and so.fulfillment_status=p_to_status then return so; end if;
  if not allowed then raise exception 'COMU_FULFILLMENT_TRANSITION_INVALID'; end if;
  update public.comu_order_suborders set fulfillment_status=p_to_status,status=case when p_to_status='HUB_RECEIVED' then 'AT_HUB' when p_to_status='SHIPPED' then 'SHIPPED' when p_to_status='DELIVERED' then 'DELIVERED' else status end,hub_handoff_token=case when p_to_status='READY_FOR_HUB' then encode(gen_random_bytes(18),'hex') else hub_handoff_token end,deadline_at=case when p_to_status='PREPARING' then public.comu_fulfillment_deadline_v1((select created_at from public.comu_orders where id=so.order_id)) else so.deadline_at end,updated_at=now() where id=so.id returning * into so;
  insert into public.comu_fulfillment_events(order_id,suborder_id,event_type,from_status,to_status,actor_type,actor_id,note) values(so.order_id,so.id,'SUBORDER_'||p_to_status,previous_status,p_to_status,p_actor_type,actor,p_note);
  if p_to_status='HUB_RECEIVED' then insert into public.comu_hub_receipts(suborder_id,receipt_token,received_by,expected_items,received_items) select so.id,so.hub_handoff_token,actor,coalesce(sum(i.quantity),0),coalesce(sum(i.quantity),0) from public.comu_order_items i where i.suborder_id=so.id on conflict (suborder_id) do nothing; end if;
  update public.comu_orders o set fulfillment_status=case when exists(select 1 from public.comu_order_suborders x where x.order_id=o.id and x.fulfillment_status in ('ISSUE','CANCELLED')) then 'ISSUE' when not exists(select 1 from public.comu_order_suborders x where x.order_id=o.id and x.fulfillment_status not in ('HUB_RECEIVED','CONSOLIDATED','READY_TO_SHIP','SHIPPED','DELIVERED')) then case when not exists(select 1 from public.comu_order_suborders x where x.order_id=o.id and x.fulfillment_status not in ('DELIVERED')) then 'DELIVERED' when exists(select 1 from public.comu_order_suborders x where x.order_id=o.id and x.fulfillment_status in ('SHIPPED','DELIVERED')) then 'SHIPPED' when exists(select 1 from public.comu_order_suborders x where x.order_id=o.id and x.fulfillment_status in ('READY_TO_SHIP','CONSOLIDATED')) then 'READY_TO_SHIP' else 'READY_FOR_CONSOLIDATION' end else 'WAITING_FOR_SELLERS' end,fulfillment_updated_at=now() where o.id=so.order_id;
  return so;
end $$;
grant execute on function public.comu_transition_suborder_fulfillment_v1(uuid,text,text,text) to authenticated,service_role;

create or replace function public.comu_consolidate_order_v1(p_order_id uuid)
returns public.comu_shipments language plpgsql security definer set search_path=public as $$
declare o public.comu_orders%rowtype; s public.comu_shipments%rowtype; x record;
begin
  if not public.is_cometa_admin() then raise exception 'COMU_HUB_ACCESS_DENIED'; end if;
  select * into o from public.comu_orders where id=p_order_id for update; if not found then raise exception 'COMU_ORDER_NOT_FOUND'; end if;
  if o.fulfillment_status not in ('READY_FOR_CONSOLIDATION','CONSOLIDATED') then raise exception 'COMU_ORDER_NOT_READY_FOR_CONSOLIDATION'; end if;
  select * into s from public.comu_shipments where master_order_id=o.id; if found then return s; end if;
  insert into public.comu_shipments(master_order_id,status,destination_snapshot) values(o.id,'READY_TO_SHIP',o.shipping_address_snapshot) returning * into s;
  for x in select id from public.comu_order_suborders where order_id=o.id and fulfillment_status='HUB_RECEIVED' loop insert into public.comu_shipment_suborders(shipment_id,suborder_id) values(s.id,x.id); update public.comu_order_suborders set fulfillment_status='CONSOLIDATED' where id=x.id; end loop;
  update public.comu_orders set fulfillment_status='CONSOLIDATED',fulfillment_updated_at=now() where id=o.id;
  insert into public.comu_fulfillment_events(order_id,event_type,actor_type,actor_id) values(o.id,'MASTER_CONSOLIDATED','ADMIN',auth.uid());
  return s;
end $$;
grant execute on function public.comu_consolidate_order_v1(uuid) to authenticated,service_role;
