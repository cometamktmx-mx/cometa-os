-- Food loyalty redemption adapter: route existing reward IDs through the canonical sale close.
create or replace function public.pos_food_payment_command_v1(
  p_brand_slug text,p_host_user_id uuid,p_session_id uuid,p_payload jsonb,p_key uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  actor public.pos_staff%rowtype; c public.pos_food_checks%rowtype; cash public.pos_cash_sessions%rowtype;
  payment public.pos_food_payments%rowtype; old_event public.pos_food_events%rowtype; item public.pos_food_items%rowtype;
  allocation jsonb; payment_rows jsonb; items jsonb; result jsonb; total numeric(14,2); paid numeric(14,2); balance numeric(14,2);
  amount numeric(14,2); received numeric(14,2); change numeric(14,2); reward_value numeric(14,2) := 0; alloc_qty numeric(14,3); alloc_amount numeric(14,2); allocated_total numeric(14,2):=0; existing_qty numeric(14,3);
  final_sale uuid; t timestamptz := clock_timestamp(); method text; reference text; location uuid; reward_id uuid; reward_unlock_id uuid;
begin
  actor:=public.pos_food_actor_v1(p_brand_slug,p_host_user_id,p_session_id);
  if actor.role not in ('ADMIN','MANAGER','CASHIER') then raise exception 'POS_FOOD_FORBIDDEN'; end if;
  if p_key is null or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'POS_FOOD_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_brand_slug||':'||p_key::text,0));
  select e.* into old_event from public.pos_food_events e where e.brand_slug=p_brand_slug and e.request_key=p_key;
  if found then
    if old_event.action<>'pay' or old_event.payload<>p_payload or old_event.actor_id<>actor.id or old_event.host_user_id<>p_host_user_id then raise exception 'POS_FOOD_CONFLICT'; end if;
    return old_event.result||jsonb_build_object('replayed',true);
  end if;
  select fc.* into c from public.pos_food_checks fc where fc.id=(p_payload->>'checkId')::uuid and fc.brand_slug=p_brand_slug for update;
  if not found or c.status<>'PAYMENT_PENDING' then raise exception 'POS_FOOD_CONFLICT'; end if;
  if actor.location_id is not null and actor.location_id<>c.location_id then raise exception 'POS_STAFF_LOCATION_FORBIDDEN'; end if;
  location:=c.location_id;
  select cs.* into cash from public.pos_cash_sessions cs where cs.id=(p_payload->>'cashSessionId')::uuid and cs.brand_slug=p_brand_slug and cs.location_id=location and cs.status='open' for update;
  if not found then raise exception 'POS_FOOD_CASH_REQUIRED'; end if;
  method:=p_payload->>'method';
  if method not in ('cash','card','other') then raise exception 'POS_FOOD_INVALID'; end if;
  select coalesce(sum(fi.line_total),0) into total from public.pos_food_items fi where fi.check_id=c.id and fi.brand_slug=p_brand_slug and fi.voided_at is null;
  select coalesce(sum(p.amount),0) into paid from public.pos_food_payments p where p.check_id=c.id and p.brand_slug=p_brand_slug;
  balance:=round(total-paid,2);
  amount:=coalesce((p_payload->>'amount')::numeric,balance);
  if reward_id is not null then
    select round(r.reward_value,2) into reward_value
    from public.pos_loyalty_rewards r
    where r.id=reward_id and r.brand_slug=p_brand_slug;
    amount:=round(amount-coalesce(reward_value,0),2);
  elsif reward_unlock_id is not null then
    select round(u.reward_value,2) into reward_value
    from public.pos_loyalty_reward_unlocks u
    where u.id=reward_unlock_id and u.brand_slug=p_brand_slug;
    amount:=round(amount-coalesce(reward_value,0),2);
  end if;
  if amount<=0 or amount>balance then raise exception 'POS_FOOD_PAYMENT_EXCEEDS_BALANCE'; end if;
  if method='cash' then
    received:=coalesce((p_payload->>'amountReceived')::numeric,amount);
    if received<amount then raise exception 'POS_FOOD_CASH_INSUFFICIENT'; end if;
    change:=round(received-amount,2);
  else received:=amount; change:=0; end if;
  reference:=nullif(btrim(p_payload->>'reference'),'');
  reward_id:=nullif(p_payload->>'rewardId','')::uuid;
  reward_unlock_id:=nullif(p_payload->>'rewardUnlockId','')::uuid;
  if reward_id is not null and reward_unlock_id is not null then raise exception 'POS_FOOD_INVALID'; end if;
  if method='card' and reference is null then raise exception 'POS_FOOD_PAYMENT_REFERENCE_REQUIRED'; end if;
  insert into public.pos_food_payments(brand_id,brand_slug,location_id,check_id,cashier_staff_id,method,amount,amount_received,change_amount,reference,request_key,created_at)
    values(c.brand_id,p_brand_slug,location,c.id,actor.id,method,round(amount,2),round(received,2),change,reference,p_key,t) returning * into payment;
  if jsonb_typeof(p_payload->'allocations')='array' then
    for allocation in select value from jsonb_array_elements(p_payload->'allocations') loop
      select fi.* into item from public.pos_food_items fi where fi.id=(allocation->>'foodItemId')::uuid and fi.check_id=c.id and fi.brand_slug=p_brand_slug and fi.voided_at is null for update;
      if not found then raise exception 'POS_FOOD_ALLOCATION_INVALID'; end if;
      alloc_qty:=(allocation->>'quantity')::numeric;
      if alloc_qty<=0 then raise exception 'POS_FOOD_ALLOCATION_INVALID'; end if;
      select coalesce(sum(pa.quantity),0) into existing_qty from public.pos_food_payment_allocations pa where pa.food_item_id=item.id;
      if existing_qty+alloc_qty>item.quantity then raise exception 'POS_FOOD_ALLOCATION_EXCEEDS_ITEM'; end if;
      alloc_amount:=round(item.line_total*alloc_qty/item.quantity,2);
      allocated_total:=allocated_total+alloc_amount;
      insert into public.pos_food_payment_allocations(brand_id,brand_slug,location_id,check_id,payment_id,food_item_id,quantity,amount)
        values(c.brand_id,p_brand_slug,location,c.id,payment.id,item.id,alloc_qty,alloc_amount);
    end loop;
    if round(allocated_total,2)<>round(amount,2) then raise exception 'POS_FOOD_ALLOCATION_AMOUNT_MISMATCH'; end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('method',p.method,'amount',p.amount,'tendered_amount',p.amount_received,'reference',p.reference) order by p.created_at),'[]') into payment_rows from public.pos_food_payments p where p.check_id=c.id;
  select jsonb_agg(jsonb_build_object('food_item_id',fi.id,'variant_id',fi.variant_id,'quantity',fi.quantity,'discount_amount',fi.discount_amount) order by fi.variant_id,fi.id) into items from public.pos_food_items fi where fi.check_id=c.id and fi.voided_at is null;
  select coalesce(sum(p.amount),0) into paid from public.pos_food_payments p where p.check_id=c.id;
  if round(paid,2)=round(total,2) then
    result:=public.pos_complete_sale_with_staff_v1(p_brand_slug,location,cash.register_id,cash.id,c.customer_id,items,payment_rows,'Food check '||c.id::text,p_host_user_id,reward_id,c.id,reward_unlock_id,actor.id);
    final_sale:=(result->>'id')::uuid;
    update public.pos_food_payments p set finalized_sale_id=final_sale,finalized_at=t where p.check_id=c.id and p.finalized_sale_id is null;
    update public.pos_food_items fi set inventory_committed_at=clock_timestamp() where fi.check_id=c.id and fi.voided_at is null and fi.track_inventory and fi.inventory_committed_at is null;
    update public.pos_food_checks fc set status='CLOSED',closed_at=t,closed_by=actor.id,cashier_id=actor.id,sale_id=final_sale,version=version+1 where fc.id=c.id;
    result:=result||jsonb_build_object('checkId',c.id,'saleId',final_sale,'total',total,'paid',paid,'balance',0,'closed',true);
  else
    update public.pos_food_checks fc set version=fc.version+1 where fc.id=c.id;
    result:=jsonb_build_object('checkId',c.id,'paymentId',payment.id,'total',total,'paid',paid,'balance',round(total-paid,2),'closed',false);
  end if;
  insert into public.pos_food_events(brand_id,brand_slug,location_id,check_id,actor_id,host_user_id,action,request_key,payload,result,created_at)
    values(c.brand_id,p_brand_slug,location,c.id,actor.id,p_host_user_id,'pay',p_key,p_payload,result,t);
  return result;
end $$;


