-- Audited cancellation, never deletion. Local validation only before deployment.
begin;
alter table public.pos_food_checks drop constraint pos_food_checks_status_check;
alter table public.pos_food_checks add constraint pos_food_checks_status_check check(status in ('OPEN','PAYMENT_PENDING','CLOSED','CANCELLED'));
drop index public.pos_food_one_open_check;
create unique index pos_food_one_open_check on public.pos_food_checks(table_id) where status not in ('CLOSED','CANCELLED');
alter table public.pos_food_tickets add column cancelled_at timestamptz null;
do $$ declare n text; begin
 select conname into strict n from pg_constraint where conrelid='public.pos_food_items'::regclass and contype='c' and pg_get_constraintdef(oid) like '%voided_at IS NULL%ticket_id IS NULL%';
 execute format('alter table public.pos_food_items drop constraint %I',n);
end $$;
create table public.pos_food_item_voids (
 food_item_id uuid primary key, brand_slug text not null, check_id uuid not null, location_id uuid not null,
 actor_id uuid not null, authorizer_id uuid not null, host_user_id uuid not null,
 reason text not null check(char_length(btrim(reason)) between 1 and 500), preparation_state text not null,
 restock boolean not null, movements jsonb not null, request_key uuid not null unique,
 created_at timestamptz not null default now(),
 foreign key(food_item_id,brand_slug,check_id) references public.pos_food_items(id,brand_slug,check_id),
 foreign key(check_id,brand_slug,location_id) references public.pos_food_checks(id,brand_slug,location_id),
 foreign key(actor_id,brand_slug) references public.pos_staff(id,brand_slug),
 foreign key(authorizer_id,brand_slug) references public.pos_staff(id,brand_slug)
);
alter table public.pos_food_item_voids enable row level security;
revoke all on public.pos_food_item_voids from public,anon,authenticated;
grant all on public.pos_food_item_voids to service_role;
create trigger pos_food_voids_immutable before update or delete on public.pos_food_item_voids for each row execute function public.pos_food_recipe_immutable_v1();
create function public.pos_food_void_guard_v1() returns trigger language plpgsql set search_path=public as $$
begin
 if old.ticket_id is not null and new.voided_at is distinct from old.voided_at then
  if old.voided_at is not null or not exists(select 1 from public.pos_food_item_voids where food_item_id=old.id and brand_slug=old.brand_slug and actor_id=new.voided_by) then raise exception 'POS_FOOD_RECIPE_FROZEN'; end if;
 end if;
 return new;
end $$;
create trigger pos_food_void_guard before update on public.pos_food_items for each row execute function public.pos_food_void_guard_v1();

create function public.pos_food_void_item_v1(brand text, host uuid, session uuid, account uuid, item uuid, reason text, restock boolean, key uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
#variable_conflict use_variable
declare actor public.pos_staff%rowtype; c public.pos_food_checks%rowtype; i public.pos_food_items%rowtype; t public.pos_food_tickets%rowtype;
 prior public.pos_food_item_voids%rowtype; consumed record; inv public.pos_inventory%rowtype; movement uuid; movements jsonb:='[]';
begin
 actor:=public.pos_food_actor_v1(brand,host,session);
 if not public.pos_staff_has_any_role_v1(actor.id,brand,array['ADMIN','MANAGER']) then raise exception 'POS_FOOD_FORBIDDEN'; end if;
 if key is null or restock is null or coalesce(char_length(btrim(reason)),0) not between 1 and 500 then raise exception 'POS_FOOD_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended(brand||':food-void:'||key::text,0));
 select * into prior from public.pos_food_item_voids where request_key=key;
 if found then
  if prior.brand_slug<>brand or prior.food_item_id<>item or prior.check_id<>account or prior.actor_id<>actor.id or prior.host_user_id<>host or prior.reason<>btrim(reason) or prior.restock<>restock then raise exception 'POS_FOOD_CONFLICT'; end if;
  return jsonb_build_object('checkId',account,'itemId',item,'replayed',true);
 end if;
 select * into c from public.pos_food_checks where id=account and brand_slug=brand for update;
 if not found or (actor.location_id is not null and actor.location_id<>c.location_id) then raise exception 'POS_FOOD_FORBIDDEN'; end if;
 -- Payments need a refund workflow; never silently reduce a paid allocation or balance.
 if c.status not in ('OPEN','PAYMENT_PENDING') or exists(select 1 from public.pos_food_payments where check_id=account) then raise exception 'POS_FOOD_CONFLICT'; end if;
 select * into i from public.pos_food_items where id=item and brand_slug=brand and check_id=account for update;
 if not found or i.ticket_id is null or i.voided_at is not null then raise exception 'POS_FOOD_CONFLICT'; end if;
 select * into t from public.pos_food_tickets where id=i.ticket_id for update;
 if restock then
  for consumed in select * from public.pos_food_send_consumptions where food_item_id=item and brand_slug=brand order by ingredient_variant_id loop
   select * into inv from public.pos_inventory where variant_id=consumed.ingredient_variant_id and location_id=c.location_id and brand_slug=brand for update;
   if not found then raise exception 'POS_FOOD_STOCK_UNAVAILABLE'; end if;
   update public.pos_inventory set quantity=pos_inventory.quantity+consumed.base_quantity where id=inv.id;
   insert into public.pos_inventory_movements(brand_id,brand_slug,location_id,variant_id,movement_type,quantity_delta,quantity_before,quantity_after,reference_type,reference_id,notes,created_by)
   values(inv.brand_id,brand,c.location_id,inv.variant_id,'return',consumed.base_quantity,inv.quantity,inv.quantity+consumed.base_quantity,'food_void',item,btrim(reason),host) returning id into movement;
   movements:=movements||jsonb_build_array(movement);
  end loop;
 end if;
 insert into public.pos_food_item_voids(food_item_id,brand_slug,check_id,location_id,actor_id,authorizer_id,host_user_id,reason,preparation_state,restock,movements,request_key)
 values(item,brand,account,c.location_id,actor.id,actor.id,host,btrim(reason),case when t.served_at is not null then 'SERVED' else t.status end,restock,movements,key);
 update public.pos_food_items set voided_at=clock_timestamp(),voided_by=actor.id,updated_by=actor.id,updated_at=clock_timestamp(),version=version+1 where id=item;
 if not exists(select 1 from public.pos_food_items where ticket_id=t.id and voided_at is null) then update public.pos_food_tickets set cancelled_at=clock_timestamp() where id=t.id; end if;
 update public.pos_food_checks set version=version+1 where id=account;
 if not exists(select 1 from public.pos_food_items where check_id=account and voided_at is null) then
  update public.pos_food_checks set status='CANCELLED',closed_at=clock_timestamp(),closed_by=actor.id where id=account;
 end if;
 return jsonb_build_object('checkId',account,'itemId',item);
end $$;
revoke all on function public.pos_food_void_item_v1(text,uuid,uuid,uuid,uuid,text,boolean,uuid) from public,anon,authenticated;
grant execute on function public.pos_food_void_item_v1(text,uuid,uuid,uuid,uuid,text,boolean,uuid) to service_role;
do $$ declare source text; begin
 source:=pg_get_functiondef('public.pos_food_command_legacy_v1(text,uuid,uuid,text,jsonb,uuid)'::regprocedure);
 if position('v_check.status=''CLOSED''' in source)=0 or position('table_id=v_table.id and status<>''CLOSED''' in source)=0 then raise exception 'FOOD_VOID_COMMAND_ANCHOR'; end if;
 source:=replace(source,'v_check.status=''CLOSED''','v_check.status in (''CLOSED'',''CANCELLED'')');
 source:=replace(source,'table_id=v_table.id and status<>''CLOSED''','table_id=v_table.id and status not in (''CLOSED'',''CANCELLED'')');
 source:=replace(source,'where check_id=v_check.id and served_at is null','where check_id=v_check.id and served_at is null and cancelled_at is null');
 execute source;
end $$;
-- Rollback: hide cancellation controls; retain audit, return movements and CANCELLED
-- accounts. Do not restore the old uniqueness/check constraints over retained history.
commit;
