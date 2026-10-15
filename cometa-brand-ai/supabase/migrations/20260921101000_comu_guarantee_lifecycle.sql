alter table public.comu_order_suborders add column delivered_at timestamptz;
alter table public.comu_order_suborders add column guarantee_expires_at timestamptz;

create function public.comu_stamp_delivery_guarantee() returns trigger
language plpgsql set search_path = public as $$
declare v_days integer;
begin
  if old.delivered_at is not null and (new.delivered_at,new.guarantee_expires_at) is distinct from (old.delivered_at,old.guarantee_expires_at) then
    raise exception 'COMU_DELIVERY_SNAPSHOT_IMMUTABLE';
  end if;
  if new.status = 'DELIVERED' and old.delivered_at is null then
    select guarantee_days into strict v_days from public.comu_orders where id=new.order_id;
    new.delivered_at := now();
    new.guarantee_expires_at := new.delivered_at + make_interval(days => v_days);
  end if;
  return new;
end; $$;
create trigger comu_suborder_guarantee before update on public.comu_order_suborders for each row execute function public.comu_stamp_delivery_guarantee();

-- Only the service role may execute; the application requires a COMETA admin and test mode.
create function public.comu_admin_deliver_suborder(p_suborder_id uuid, p_actor_id uuid) returns public.comu_order_suborders
language plpgsql security definer set search_path = public as $$
declare v_sub public.comu_order_suborders%rowtype;
begin
  select * into strict v_sub from public.comu_order_suborders where id=p_suborder_id for update;
  if not exists(select 1 from public.comu_payment_intents where order_id=v_sub.order_id and status='SUCCEEDED') then raise exception 'COMU_PAYMENT_NOT_SUCCEEDED'; end if;
  if v_sub.status = 'DELIVERED' then return v_sub; end if;
  if v_sub.status <> 'PREPARING' then raise exception 'COMU_DELIVERY_NOT_ALLOWED'; end if;
  update public.comu_order_suborders set status='DELIVERED',updated_at=now() where id=p_suborder_id returning * into v_sub;
  insert into public.comu_order_events(order_id,suborder_id,event_type,actor_type,actor_id,payload)
  values(v_sub.order_id,v_sub.id,'DELIVERED','COMETA_ADMIN',p_actor_id,jsonb_build_object('guarantee_expires_at',v_sub.guarantee_expires_at));
  return v_sub;
end; $$;
revoke all on function public.comu_admin_deliver_suborder(uuid,uuid) from public,anon,authenticated;
grant execute on function public.comu_admin_deliver_suborder(uuid,uuid) to service_role;
