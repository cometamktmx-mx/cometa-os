create or replace function public.comu_mark_payment_succeeded(
  p_stripe_payment_intent_id text,
  p_amount_cents bigint,
  p_currency text,
  p_event_id text default null,
  p_payload jsonb default '{}'::jsonb
) returns public.comu_payment_intents
language plpgsql security definer set search_path = public as $$
declare
  v_payment public.comu_payment_intents%rowtype;
  v_order public.comu_orders%rowtype;
  v_res public.comu_inventory_reservations%rowtype;
  v_suborder record;
  v_allocation public.comu_payment_allocations%rowtype;
begin
  select * into v_payment from public.comu_payment_intents where stripe_payment_intent_id=p_stripe_payment_intent_id for update;
  if not found then raise exception 'COMU_PAYMENT_NOT_FOUND'; end if;
  if v_payment.status = 'SUCCEEDED' then return v_payment; end if;
  if v_payment.amount_cents <> p_amount_cents or v_payment.currency <> upper(p_currency) then raise exception 'COMU_PAYMENT_AMOUNT_CURRENCY_MISMATCH'; end if;
  select * into v_order from public.comu_orders where id=v_payment.order_id for update;
  select * into v_res from public.comu_inventory_reservations where id=v_order.reservation_id for update;
  if v_order.status <> 'PAYMENT_PENDING' or v_res.status <> 'COMMITTED' or v_res.expires_at <= now() then
    update public.comu_payment_intents set status='PAYMENT_RECEIVED_AFTER_EXPIRY', updated_at=now(), last_error='Reservation/order expired before payment confirmation' where id=v_payment.id returning * into v_payment;
    insert into public.comu_payment_transactions(payment_id,stripe_event_id,type,status,amount_cents,currency,payload) values(v_payment.id,p_event_id,'PAYMENT_RECEIVED_AFTER_EXPIRY','REQUIRES_REVIEW',p_amount_cents,upper(p_currency),p_payload) on conflict do nothing;
    return v_payment;
  end if;
  update public.comu_payment_intents set status='SUCCEEDED', updated_at=now(), last_error=null where id=v_payment.id returning * into v_payment;
  update public.comu_orders set status='PAID', updated_at=now() where id=v_order.id;
  update public.comu_order_suborders set status='PREPARING', updated_at=now() where order_id=v_order.id and status='PREPARING';
  for v_suborder in select * from public.comu_order_suborders where order_id=v_order.id loop
    insert into public.comu_payment_allocations(payment_id,order_id,suborder_id,seller_id,gross_amount_cents,platform_fee_cents,seller_net_amount_cents,status)
    values(v_payment.id,v_order.id,v_suborder.id,v_suborder.seller_id,round(v_suborder.grand_total*100),0,round(v_suborder.grand_total*100),'HELD')
    on conflict (payment_id,suborder_id) do update set status='HELD' returning * into v_allocation;
    insert into public.comu_seller_ledger_entries(seller_id,payment_id,allocation_id,entry_type,amount_cents,currency)
    values(v_allocation.seller_id,v_payment.id,v_allocation.id,'SALE_HELD',v_allocation.seller_net_amount_cents,v_payment.currency)
    on conflict (allocation_id,entry_type) do nothing;
  end loop;
  insert into public.comu_payment_transactions(payment_id,stripe_event_id,type,status,amount_cents,currency,payload) values(v_payment.id,p_event_id,'PAYMENT_SUCCEEDED','SUCCEEDED',p_amount_cents,upper(p_currency),p_payload) on conflict do nothing;
  insert into public.comu_order_events(order_id,event_type,actor_type,payload) values(v_order.id,'PAYMENT_SUCCEEDED','STRIPE',jsonb_build_object('paymentIntentId',p_stripe_payment_intent_id)),(v_order.id,'ORDER_PAID','STRIPE','{}'::jsonb);
  return v_payment;
end; $$;

create or replace function public.comu_mark_payment_failed(p_stripe_payment_intent_id text, p_message text default null, p_event_id text default null, p_payload jsonb default '{}'::jsonb) returns public.comu_payment_intents
language plpgsql security definer set search_path = public as $$
declare v_payment public.comu_payment_intents%rowtype;
begin
  select * into v_payment from public.comu_payment_intents where stripe_payment_intent_id=p_stripe_payment_intent_id for update;
  if not found then raise exception 'COMU_PAYMENT_NOT_FOUND'; end if;
  if v_payment.status in ('SUCCEEDED','CANCELLED','REFUNDED','PARTIALLY_REFUNDED') then return v_payment; end if;
  update public.comu_payment_intents set status='FAILED',last_error=left(p_message,240),updated_at=now() where id=v_payment.id returning * into v_payment;
  insert into public.comu_payment_transactions(payment_id,stripe_event_id,type,status,amount_cents,currency,payload) values(v_payment.id,p_event_id,'PAYMENT_FAILED','FAILED',v_payment.amount_cents,v_payment.currency,p_payload) on conflict do nothing;
  return v_payment;
end; $$;

revoke all on function public.comu_mark_payment_succeeded(text,bigint,text,text,jsonb) from public;
grant execute on function public.comu_mark_payment_succeeded(text,bigint,text,text,jsonb) to service_role;
revoke all on function public.comu_mark_payment_failed(text,text,text,jsonb) from public;
grant execute on function public.comu_mark_payment_failed(text,text,text,jsonb) to service_role;
