-- COMU direct shipping V1. Additive compatibility update for the existing
-- fulfillment transition function; no inventory writes and no destructive SQL.
create or replace function public.comu_transition_suborder_fulfillment_v1(
  p_suborder_id uuid,
  p_to_status text,
  p_actor_type text,
  p_note text default null
)
returns public.comu_order_suborders
language plpgsql
security definer
set search_path=public
as $$
declare
  so public.comu_order_suborders%rowtype;
  previous_status text;
  allowed boolean := false;
  actor uuid := auth.uid();
begin
  select * into so from public.comu_order_suborders where id=p_suborder_id for update;
  if not found then raise exception 'COMU_SUBORDER_NOT_FOUND'; end if;
  if p_actor_type='SELLER' and not exists (
    select 1 from public.comu_seller_memberships m
    where m.seller_id=so.seller_id and m.user_id=auth.uid() and m.active
  ) then raise exception 'COMU_SELLER_ACCESS_DENIED'; end if;
  if p_actor_type in ('HUB','ADMIN') and not public.is_cometa_admin() then raise exception 'COMU_HUB_ACCESS_DENIED'; end if;
  if p_actor_type not in ('SELLER','HUB','ADMIN') then raise exception 'COMU_ACTOR_INVALID'; end if;
  previous_status := so.fulfillment_status;
  if p_actor_type='SELLER' and p_to_status not in ('PREPARING','READY_FOR_HUB','HANDED_TO_HUB','READY_TO_SHIP','SHIPPED','DELIVERED') then
    raise exception 'COMU_SELLER_FULFILLMENT_FORBIDDEN';
  end if;
  if p_actor_type='HUB' and p_to_status <> 'HUB_RECEIVED' then raise exception 'COMU_HUB_FULFILLMENT_FORBIDDEN'; end if;
  allowed := (so.fulfillment_route='DIRECT' and (previous_status,p_to_status) in (
    ('PAID','PREPARING'),('PREPARING','READY_TO_SHIP'),('READY_TO_SHIP','SHIPPED'),('SHIPPED','DELIVERED')
  )) or (so.fulfillment_route<>'DIRECT' and (previous_status,p_to_status) in (
    ('PAID','PREPARING'),('PREPARING','READY_FOR_HUB'),('READY_FOR_HUB','HANDED_TO_HUB'),
    ('HANDED_TO_HUB','HUB_RECEIVED'),('HUB_RECEIVED','CONSOLIDATED'),('CONSOLIDATED','READY_TO_SHIP'),
    ('READY_TO_SHIP','SHIPPED'),('SHIPPED','DELIVERED')
  ));
  if not allowed and so.fulfillment_status=p_to_status then return so; end if;
  if not allowed then raise exception 'COMU_FULFILLMENT_TRANSITION_INVALID'; end if;
  update public.comu_order_suborders
  set fulfillment_status=p_to_status,
      status=case when p_to_status='HUB_RECEIVED' then 'AT_HUB' when p_to_status in ('SHIPPED','DELIVERED') then p_to_status else status end,
      hub_handoff_token=case when p_to_status='READY_FOR_HUB' then encode(extensions.gen_random_bytes(18),'hex') else hub_handoff_token end,
      deadline_at=case when p_to_status='PREPARING' then public.comu_fulfillment_deadline_v1((select created_at from public.comu_orders where id=so.order_id)) else so.deadline_at end,
      updated_at=now()
  where id=so.id returning * into so;
  insert into public.comu_fulfillment_events(order_id,suborder_id,event_type,from_status,to_status,actor_type,actor_id,note)
  values(so.order_id,so.id,'SUBORDER_'||p_to_status,previous_status,p_to_status,p_actor_type,actor,p_note)
  on conflict (suborder_id,event_type,to_status) do nothing;
  if p_to_status='HUB_RECEIVED' then
    insert into public.comu_hub_receipts(suborder_id,receipt_token,received_by,expected_items,received_items)
    select so.id,so.hub_handoff_token,actor,coalesce(sum(i.quantity),0),coalesce(sum(i.quantity),0)
    from public.comu_order_items i where i.suborder_id=so.id
    on conflict (suborder_id) do nothing;
  end if;
  update public.comu_orders o set
    fulfillment_status=case
      when exists(select 1 from public.comu_order_suborders x where x.order_id=o.id and x.fulfillment_status in ('ISSUE','CANCELLED')) then 'ISSUE'
      when not exists(select 1 from public.comu_order_suborders x where x.order_id=o.id and x.fulfillment_status not in ('HUB_RECEIVED','CONSOLIDATED','READY_TO_SHIP','SHIPPED','DELIVERED')) then
        case when not exists(select 1 from public.comu_order_suborders x where x.order_id=o.id and x.fulfillment_status not in ('DELIVERED')) then 'DELIVERED'
        when exists(select 1 from public.comu_order_suborders x where x.order_id=o.id and x.fulfillment_status in ('SHIPPED','DELIVERED')) then 'SHIPPED'
        when exists(select 1 from public.comu_order_suborders x where x.order_id=o.id and x.fulfillment_status in ('READY_TO_SHIP','CONSOLIDATED')) then 'READY_TO_SHIP'
        else 'READY_FOR_CONSOLIDATION' end
      else 'WAITING_FOR_SELLERS' end,
    fulfillment_updated_at=now()
  where o.id=so.order_id;
  return so;
end $$;
grant execute on function public.comu_transition_suborder_fulfillment_v1(uuid,text,text,text) to authenticated,service_role;
