begin;

-- Food customer identity and declared memory. Reuses canonical pos_customers and pos_sales.
alter table public.pos_food_checks add column if not exists customer_id uuid null;
create index if not exists pos_food_checks_customer on public.pos_food_checks(brand_slug, customer_id, opened_at desc) where customer_id is not null;

create or replace function public.pos_food_customer_brand_identity_v1() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.customer_id is not null and not exists (select 1 from public.pos_customers c where c.id=new.customer_id and c.brand_slug=new.brand_slug and c.active) then
    raise exception 'POS_CUSTOMER_NOT_FOUND';
  end if;
  return new;
end $$;
create or replace trigger pos_food_checks_customer_brand before insert or update on public.pos_food_checks for each row execute function public.pos_food_customer_brand_identity_v1();
alter table public.pos_food_events drop constraint if exists pos_food_events_action_check;
alter table public.pos_food_events add constraint pos_food_events_action_check check(action in ('table_create','open','item_add','item_update','send','prepare','ready','serve','request_payment','resume','pay','customer_set'));

create table if not exists public.pos_customer_food_profiles (
  id uuid primary key default gen_random_uuid(),
  brand_slug text not null references public.brands(slug) on delete cascade,
  customer_id uuid not null references public.pos_customers(id) on delete cascade,
  allergy_tags jsonb not null default '[]'::jsonb check (jsonb_typeof(allergy_tags)='array'),
  restriction_note text null check (char_length(restriction_note) <= 500),
  confirmed_at timestamptz null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(brand_slug, customer_id)
);
create index if not exists pos_customer_food_profiles_brand on public.pos_customer_food_profiles(brand_slug, updated_at desc);
create or replace trigger pos_customer_food_profiles_brand before insert or update on public.pos_customer_food_profiles for each row execute function public.pos_food_customer_brand_identity_v1();
alter table public.pos_customer_food_profiles enable row level security;
revoke all on public.pos_customer_food_profiles from public, anon, authenticated;
grant all on public.pos_customer_food_profiles to service_role;

-- Customer association is a Food operation, not a second identity system.
create or replace function public.pos_food_command_v1(p_brand_slug text,p_host_user_id uuid,p_session_id uuid,p_action text,p_payload jsonb,p_key uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor public.pos_staff%rowtype; c public.pos_food_checks%rowtype; old_event public.pos_food_events%rowtype; customer public.pos_customers%rowtype; result jsonb; location uuid; v_customer_id uuid;
begin
  if p_action='pay' then return public.pos_food_payment_command_v1(p_brand_slug,p_host_user_id,p_session_id,p_payload,p_key); end if;
  if p_action='resume' then
    select * into c from public.pos_food_checks where id=(p_payload->>'checkId')::uuid and brand_slug=p_brand_slug;
    if found and exists(select 1 from public.pos_food_payments where check_id=c.id) then raise exception 'POS_FOOD_RESUME_BLOCKED_PAYMENTS'; end if;
  end if;
  if p_action <> 'customer_set' then return public.pos_food_command_legacy_v1(p_brand_slug,p_host_user_id,p_session_id,p_action,p_payload,p_key); end if;
  actor:=public.pos_food_actor_v1(p_brand_slug,p_host_user_id,p_session_id);
  if actor.role not in ('ADMIN','MANAGER','WAITER','CASHIER') then raise exception 'POS_FOOD_FORBIDDEN'; end if;
  if p_key is null or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'POS_FOOD_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_brand_slug||':'||p_key::text,0));
  select e.* into old_event from public.pos_food_events e where e.brand_slug=p_brand_slug and e.request_key=p_key;
  if found then
    if old_event.action<>p_action or old_event.payload<>p_payload or old_event.actor_id<>actor.id or old_event.host_user_id<>p_host_user_id then raise exception 'POS_FOOD_CONFLICT'; end if;
    return old_event.result||jsonb_build_object('replayed',true);
  end if;
  select * into c from public.pos_food_checks where id=(p_payload->>'checkId')::uuid and brand_slug=p_brand_slug for update;
  if not found or c.status='CLOSED' then raise exception 'POS_FOOD_CONFLICT'; end if;
  location:=c.location_id;
  if actor.location_id is not null and actor.location_id<>location then raise exception 'POS_STAFF_LOCATION_FORBIDDEN'; end if;
  v_customer_id:=nullif(p_payload->>'customerId','')::uuid;
  if v_customer_id is not null then
    select * into customer from public.pos_customers where id=v_customer_id and brand_slug=p_brand_slug and active for share;
    if not found then raise exception 'POS_CUSTOMER_NOT_FOUND'; end if;
  end if;
  update public.pos_food_checks fc set customer_id=v_customer_id, customer_name=case when v_customer_id is null then null else nullif(btrim(customer.first_name||' '||coalesce(customer.last_name,'')),'') end, version=fc.version+1 where fc.id=c.id;
  result:=jsonb_build_object('checkId',c.id,'customerId',v_customer_id,'customerName',case when v_customer_id is null then null else nullif(btrim(customer.first_name||' '||coalesce(customer.last_name,'')),'') end);
  insert into public.pos_food_events(brand_id,brand_slug,location_id,check_id,actor_id,host_user_id,action,request_key,payload,result,created_at)
    values(c.brand_id,p_brand_slug,location,c.id,actor.id,p_host_user_id,p_action,p_key,p_payload,result,clock_timestamp());
  return result;
end $$;
create or replace function public.pos_food_payment_command_v1(
  p_brand_slug text,p_host_user_id uuid,p_session_id uuid,p_payload jsonb,p_key uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  actor public.pos_staff%rowtype; c public.pos_food_checks%rowtype; cash public.pos_cash_sessions%rowtype;
  payment public.pos_food_payments%rowtype; old_event public.pos_food_events%rowtype; item public.pos_food_items%rowtype;
  allocation jsonb; payment_rows jsonb; items jsonb; result jsonb; total numeric(14,2); paid numeric(14,2); balance numeric(14,2);
  amount numeric(14,2); received numeric(14,2); change numeric(14,2); alloc_qty numeric(14,3); alloc_amount numeric(14,2); allocated_total numeric(14,2):=0; existing_qty numeric(14,3);
  final_sale uuid; t timestamptz := clock_timestamp(); method text; reference text; location uuid;
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
  if amount<=0 or amount>balance then raise exception 'POS_FOOD_PAYMENT_EXCEEDS_BALANCE'; end if;
  if method='cash' then
    received:=coalesce((p_payload->>'amountReceived')::numeric,amount);
    if received<amount then raise exception 'POS_FOOD_CASH_INSUFFICIENT'; end if;
    change:=round(received-amount,2);
  else received:=amount; change:=0; end if;
  reference:=nullif(btrim(p_payload->>'reference'),'');
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
    result:=public.pos_complete_sale_with_staff_v1(p_brand_slug,location,cash.register_id,cash.id,c.customer_id,items,payment_rows,'Food check '||c.id::text,p_host_user_id,null,c.id,null,null,actor.id);
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
-- Preserve the certified split-payment function; only pass the check customer to canonical sale completion.
commit;
