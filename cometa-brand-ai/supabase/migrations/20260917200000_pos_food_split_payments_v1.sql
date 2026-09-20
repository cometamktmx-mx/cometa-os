-- Food-only split payments. Retail and pos_complete_sale_v4 remain unchanged.
create table if not exists public.pos_food_payments (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  brand_slug text not null references public.brands(slug) on delete restrict,
  location_id uuid not null,
  check_id uuid not null,
  cashier_staff_id uuid not null,
  method text not null check(method in ('cash','card','other')),
  amount numeric(14,2) not null check(amount > 0),
  amount_received numeric(14,2) not null check(amount_received >= amount),
  change_amount numeric(14,2) not null default 0 check(change_amount >= 0),
  reference text null,
  request_key uuid not null,
  created_at timestamptz not null default now(),
  finalized_sale_id uuid null references public.pos_sales(id) on delete restrict,
  finalized_at timestamptz null,
  unique(brand_slug, request_key),
  foreign key(brand_id,brand_slug) references public.brands(id,slug) on delete restrict,
  foreign key(location_id,brand_slug) references public.pos_locations(id,brand_slug) on delete restrict,
  foreign key(check_id,brand_slug,location_id) references public.pos_food_checks(id,brand_slug,location_id) on delete restrict,
  foreign key(cashier_staff_id,brand_slug) references public.pos_staff(id,brand_slug) on delete restrict,
  check((method='cash' and change_amount=round(amount_received-amount,2)) or (method<>'cash' and amount_received=amount and change_amount=0)),
  check((finalized_sale_id is null) = (finalized_at is null))
);
create index if not exists pos_food_payments_check on public.pos_food_payments(check_id,created_at);

create table if not exists public.pos_food_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  brand_slug text not null,
  location_id uuid not null,
  check_id uuid not null,
  payment_id uuid not null,
  food_item_id uuid not null,
  quantity numeric(14,3) not null check(quantity > 0),
  amount numeric(14,2) not null check(amount > 0),
  created_at timestamptz not null default now(),
  unique(payment_id,food_item_id),
  foreign key(brand_id,brand_slug) references public.brands(id,slug) on delete restrict,
  foreign key(location_id,brand_slug) references public.pos_locations(id,brand_slug) on delete restrict,
  foreign key(payment_id) references public.pos_food_payments(id) on delete restrict,
  foreign key(food_item_id) references public.pos_food_items(id) on delete restrict
);
create index if not exists pos_food_payment_allocations_item on public.pos_food_payment_allocations(food_item_id,check_id);

-- Defense in depth: allocations must carry the same tenant, location and check
-- identity as both the payment and the item.  The RPC validates these values,
-- while these composite keys make the relationship enforceable by PostgreSQL.
create unique index if not exists pos_food_payments_identity_key
  on public.pos_food_payments(id,brand_slug,location_id,check_id);
create unique index if not exists pos_food_items_identity_key
  on public.pos_food_items(id,brand_slug,check_id);
do $$ begin
  if not exists (select 1 from pg_constraint where conname='pos_food_payment_allocations_payment_identity_fkey') then
    alter table public.pos_food_payment_allocations
      add constraint pos_food_payment_allocations_payment_identity_fkey
      foreign key(payment_id,brand_slug,location_id,check_id)
      references public.pos_food_payments(id,brand_slug,location_id,check_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname='pos_food_payment_allocations_item_identity_fkey') then
    alter table public.pos_food_payment_allocations
      add constraint pos_food_payment_allocations_item_identity_fkey
      foreign key(food_item_id,brand_slug,check_id)
      references public.pos_food_items(id,brand_slug,check_id) on delete restrict;
  end if;
end $$;
alter table public.pos_food_payments enable row level security;
alter table public.pos_food_payment_allocations enable row level security;
revoke all on public.pos_food_payments,public.pos_food_payment_allocations from public,anon,authenticated;
grant all on public.pos_food_payments,public.pos_food_payment_allocations to service_role;

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
    result:=public.pos_complete_sale_with_staff_v1(p_brand_slug,location,cash.register_id,cash.id,null,items,payment_rows,'Food check '||c.id::text,p_host_user_id,null,c.id,null,null,actor.id);
    final_sale:=(result->>'id')::uuid;
    update public.pos_food_payments p set finalized_sale_id=final_sale,finalized_at=t where p.check_id=c.id and p.finalized_sale_id is null;
    update public.pos_food_items fi set inventory_committed_at=clock_timestamp() where fi.check_id=c.id and fi.voided_at is null and fi.track_inventory and fi.inventory_committed_at is null;
    update public.pos_food_checks fc set status='CLOSED',closed_at=t,closed_by=actor.id,cashier_id=actor.id,sale_id=final_sale,version=version+1 where fc.id=c.id;
    result:=jsonb_build_object('checkId',c.id,'saleId',final_sale,'total',total,'paid',paid,'balance',0,'closed',true);
  else
    update public.pos_food_checks fc set version=fc.version+1 where fc.id=c.id;
    result:=jsonb_build_object('checkId',c.id,'paymentId',payment.id,'total',total,'paid',paid,'balance',round(total-paid,2),'closed',false);
  end if;
  insert into public.pos_food_events(brand_id,brand_slug,location_id,check_id,actor_id,host_user_id,action,request_key,payload,result,created_at)
    values(c.brand_id,p_brand_slug,location,c.id,actor.id,p_host_user_id,'pay',p_key,p_payload,result,t);
  return result;
end $$;

alter function public.pos_food_command_v1(text,uuid,uuid,text,jsonb,uuid) rename to pos_food_command_legacy_v1;
create or replace function public.pos_food_command_v1(p_brand_slug text,p_host_user_id uuid,p_session_id uuid,p_action text,p_payload jsonb,p_key uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.pos_food_checks%rowtype; n integer;
begin
  if p_action='pay' then return public.pos_food_payment_command_v1(p_brand_slug,p_host_user_id,p_session_id,p_payload,p_key); end if;
  if p_action='resume' then
    select * into c from public.pos_food_checks where id=(p_payload->>'checkId')::uuid and brand_slug=p_brand_slug;
    select count(*) into n from public.pos_food_payments where check_id=c.id;
    if n>0 then raise exception 'POS_FOOD_RESUME_BLOCKED_PAYMENTS'; end if;
  end if;
  return public.pos_food_command_legacy_v1(p_brand_slug,p_host_user_id,p_session_id,p_action,p_payload,p_key);
end $$;

alter function public.pos_food_snapshot_v1(text,uuid,uuid,uuid) rename to pos_food_snapshot_legacy_v1;
create or replace function public.pos_food_snapshot_v1(p_brand_slug text,p_host_user_id uuid,p_session_id uuid,p_location_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare base jsonb; actor public.pos_staff%rowtype; location uuid;
begin
  base:=public.pos_food_snapshot_legacy_v1(p_brand_slug,p_host_user_id,p_session_id,p_location_id);
  actor:=public.pos_food_actor_v1(p_brand_slug,p_host_user_id,p_session_id);
  location:=coalesce(actor.location_id,p_location_id);
  return base||jsonb_build_object(
    'payments',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from public.pos_food_payments p where p.brand_slug=p_brand_slug and (location is null or p.location_id=location)),'[]'::jsonb),
    'payment_allocations',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.pos_food_payment_allocations a where a.brand_slug=p_brand_slug and (location is null or a.location_id=location)),'[]'::jsonb),
    'payment_item_status',coalesce((select jsonb_agg(jsonb_build_object(
      'food_item_id',i.id,'check_id',i.check_id,'quantity_total',i.quantity,
      'quantity_paid',coalesce((select sum(a.quantity) from public.pos_food_payment_allocations a where a.food_item_id=i.id),0),
      'quantity_pending',greatest(0,i.quantity-coalesce((select sum(a.quantity) from public.pos_food_payment_allocations a where a.food_item_id=i.id),0))
    ) order by i.created_at) from public.pos_food_items i join public.pos_food_checks ic on ic.id=i.check_id and ic.brand_slug=i.brand_slug where i.brand_slug=p_brand_slug and (location is null or ic.location_id=location)),'[]'::jsonb));
end $$;

revoke all on function public.pos_food_command_legacy_v1(text,uuid,uuid,text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.pos_food_payment_command_v1(text,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.pos_food_command_v1(text,uuid,uuid,text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.pos_food_snapshot_legacy_v1(text,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.pos_food_snapshot_v1(text,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.pos_food_command_v1(text,uuid,uuid,text,jsonb,uuid) to service_role;
grant execute on function public.pos_food_snapshot_v1(text,uuid,uuid,uuid) to service_role;
