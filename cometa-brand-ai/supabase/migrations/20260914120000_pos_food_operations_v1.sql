begin;

-- Local migration only. Food owns service history; sales/payments remain canonical.
-- Composite targets preserve the canonical schema while preventing cross-tenant references.
create unique index if not exists pos_food_brands_identity on public.brands(id,slug);
create unique index if not exists pos_food_locations_identity on public.pos_locations(id,brand_slug);
create unique index if not exists pos_food_products_identity on public.pos_products(id,brand_slug);
create unique index if not exists pos_food_variants_identity on public.pos_product_variants(id,brand_slug);
create unique index if not exists pos_food_sales_identity on public.pos_sales(id,brand_slug);

create or replace function public.pos_food_brand_identity_v1() returns trigger
language plpgsql set search_path=public as $$
declare v_brand_id uuid;
begin
  select id into v_brand_id from public.brands where slug=new.brand_slug;
  if not found or (new.brand_id is not null and new.brand_id<>v_brand_id) then raise exception 'POS_FOOD_FORBIDDEN'; end if;
  new.brand_id:=v_brand_id;
  return new;
end $$;

create table if not exists public.pos_food_tables (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  brand_slug text not null references public.brands(slug) on update cascade on delete restrict,
  location_id uuid not null references public.pos_locations(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  unique(id, brand_slug, location_id),
  foreign key(brand_id,brand_slug) references public.brands(id,slug) on delete restrict,
  foreign key(location_id,brand_slug) references public.pos_locations(id,brand_slug) on delete restrict
);
create unique index if not exists pos_food_table_name on public.pos_food_tables(brand_slug, location_id, lower(btrim(name)));

create table if not exists public.pos_food_checks (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  brand_slug text not null references public.brands(slug) on update cascade on delete restrict,
  location_id uuid not null references public.pos_locations(id) on delete restrict,
  table_id uuid null,
  service_type text not null default 'DINE_IN' check(service_type in ('DINE_IN','COUNTER','TAKEAWAY','PICKUP')),
  status text not null default 'OPEN' check(status in ('OPEN','PAYMENT_PENDING','CLOSED')),
  guests integer not null check(guests between 1 and 100),
  customer_name text null check(char_length(customer_name) <= 120),
  currency text not null,
  prices_include_tax boolean not null,
  opened_at timestamptz not null default now(), opened_by uuid not null,
  payment_requested_at timestamptz null, payment_requested_by uuid null,
  closed_at timestamptz null, closed_by uuid null, cashier_id uuid null,
  sale_id uuid null unique references public.pos_sales(id) on delete restrict,
  version integer not null default 0 check(version >= 0),
  unique(id, brand_slug),
  unique(id,brand_slug,location_id),
  foreign key(brand_id,brand_slug) references public.brands(id,slug) on delete restrict,
  foreign key(location_id,brand_slug) references public.pos_locations(id,brand_slug) on delete restrict,
  foreign key(sale_id,brand_slug) references public.pos_sales(id,brand_slug) on delete restrict,
  foreign key(table_id, brand_slug, location_id) references public.pos_food_tables(id, brand_slug, location_id) on delete restrict,
  foreign key(opened_by, brand_slug) references public.pos_staff(id, brand_slug) on delete restrict,
  foreign key(payment_requested_by, brand_slug) references public.pos_staff(id, brand_slug) on delete restrict,
  foreign key(closed_by, brand_slug) references public.pos_staff(id, brand_slug) on delete restrict,
  foreign key(cashier_id, brand_slug) references public.pos_staff(id, brand_slug) on delete restrict,
  check(service_type <> 'DINE_IN' or table_id is not null),
  check((status='CLOSED') = (closed_at is not null and closed_by is not null and cashier_id is not null and sale_id is not null))
);
create unique index if not exists pos_food_one_open_check on public.pos_food_checks(table_id) where status <> 'CLOSED';
create index if not exists pos_food_checks_location on public.pos_food_checks(brand_slug, location_id, status, opened_at);

create table if not exists public.pos_food_tickets (
  id uuid primary key default gen_random_uuid(), brand_slug text not null,
  brand_id uuid not null,
  check_id uuid not null, sequence integer not null check(sequence > 0),
  station_code text null, -- Reserved for future station routing, not inferred from product category.
  status text not null default 'PENDING' check(status in ('PENDING','PREPARING','READY')),
  sent_at timestamptz not null default now(), sent_by uuid not null,
  preparing_at timestamptz null, preparing_by uuid null,
  ready_at timestamptz null, ready_by uuid null,
  served_at timestamptz null, served_by uuid null,
  unique(id, check_id, brand_slug), unique(check_id, sequence),
  foreign key(brand_id,brand_slug) references public.brands(id,slug) on delete restrict,
  foreign key(check_id, brand_slug) references public.pos_food_checks(id, brand_slug) on delete restrict,
  foreign key(sent_by, brand_slug) references public.pos_staff(id, brand_slug) on delete restrict,
  foreign key(preparing_by, brand_slug) references public.pos_staff(id, brand_slug) on delete restrict,
  foreign key(ready_by, brand_slug) references public.pos_staff(id, brand_slug) on delete restrict,
  foreign key(served_by, brand_slug) references public.pos_staff(id, brand_slug) on delete restrict,
  check((preparing_at is null) = (preparing_by is null)),
  check((ready_at is null) = (ready_by is null)),
  check((served_at is null) = (served_by is null)),
  check(status='PENDING' or preparing_at is not null),
  check((status='READY') = (ready_at is not null)),
  check(served_at is null or status='READY'),
  check(preparing_at >= sent_at), check(ready_at >= preparing_at), check(served_at >= ready_at)
);
create index if not exists pos_food_kds_queue on public.pos_food_tickets(brand_slug, sent_at) where served_at is null;

create table if not exists public.pos_food_items (
  id uuid primary key default gen_random_uuid(), brand_slug text not null, check_id uuid not null,
  brand_id uuid not null,
  ticket_id uuid null, variant_id uuid not null references public.pos_product_variants(id) on delete restrict,
  product_id uuid not null, sku text null, unit_code text not null,
  unit_cost numeric(18,6) not null check(unit_cost>=0),
  track_inventory boolean not null,
  -- Records a successful canonical checkout, never a kitchen send or reservation.
  inventory_committed_at timestamptz null,
  discount_amount numeric(14,2) not null default 0 check(discount_amount=0),
  product_name text not null, variant_name text not null,
  quantity numeric(14,3) not null check(quantity > 0), unit_price numeric(14,2) not null check(unit_price >= 0),
  tax_rate numeric(7,4) not null check(tax_rate between 0 and 100),
  subtotal numeric(14,2) not null check(subtotal >= 0), tax_amount numeric(14,2) not null check(tax_amount >= 0),
  line_total numeric(14,2) not null check(line_total >= 0),
  notes text null check(char_length(notes) <= 500),
  configuration jsonb not null default '{}' check(jsonb_typeof(configuration)='object'),
  created_at timestamptz not null default now(), created_by uuid not null,
  updated_at timestamptz not null default now(), updated_by uuid not null,
  voided_at timestamptz null, voided_by uuid null,
  version integer not null default 0 check(version >= 0),
  foreign key(brand_id,brand_slug) references public.brands(id,slug) on delete restrict,
  foreign key(product_id,brand_slug) references public.pos_products(id,brand_slug) on delete restrict,
  foreign key(variant_id,brand_slug) references public.pos_product_variants(id,brand_slug) on delete restrict,
  foreign key(check_id, brand_slug) references public.pos_food_checks(id, brand_slug) on delete restrict,
  foreign key(ticket_id, check_id, brand_slug) references public.pos_food_tickets(id, check_id, brand_slug) on delete restrict,
  foreign key(created_by, brand_slug) references public.pos_staff(id, brand_slug) on delete restrict,
  foreign key(updated_by, brand_slug) references public.pos_staff(id, brand_slug) on delete restrict,
  foreign key(voided_by, brand_slug) references public.pos_staff(id, brand_slug) on delete restrict,
  check((voided_at is null) = (voided_by is null)), check(voided_at is null or ticket_id is null),
  check(inventory_committed_at is null or (ticket_id is not null and track_inventory))
);
create index if not exists pos_food_check_items on public.pos_food_items(check_id, created_at);
create index if not exists pos_food_ticket_items on public.pos_food_items(ticket_id) where ticket_id is not null;

-- Append-only action ledger: audit and idempotency commit with the domain mutation.
create table if not exists public.pos_food_events (
  id uuid primary key default gen_random_uuid(), brand_slug text not null references public.brands(slug) on delete restrict,
  brand_id uuid not null,
  location_id uuid not null references public.pos_locations(id) on delete restrict,
  check_id uuid null, actor_id uuid not null,
  host_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check(action in ('table_create','open','item_add','item_update','send','prepare','ready','serve','request_payment','resume','pay')),
  request_key uuid not null, payload jsonb not null, result jsonb not null,
  created_at timestamptz not null default now(),
  unique(brand_slug, request_key),
  foreign key(brand_id,brand_slug) references public.brands(id,slug) on delete restrict,
  foreign key(location_id,brand_slug) references public.pos_locations(id,brand_slug) on delete restrict,
  foreign key(check_id,brand_slug,location_id) references public.pos_food_checks(id,brand_slug,location_id) on delete restrict,
  foreign key(check_id, brand_slug) references public.pos_food_checks(id, brand_slug) on delete restrict,
  foreign key(actor_id, brand_slug) references public.pos_staff(id, brand_slug) on delete restrict
);
create index if not exists pos_food_events_check on public.pos_food_events(check_id, created_at);

create or replace trigger pos_food_tables_brand before insert or update on public.pos_food_tables for each row execute function public.pos_food_brand_identity_v1();
create or replace trigger pos_food_checks_brand before insert or update on public.pos_food_checks for each row execute function public.pos_food_brand_identity_v1();
create or replace trigger pos_food_tickets_brand before insert or update on public.pos_food_tickets for each row execute function public.pos_food_brand_identity_v1();
create or replace trigger pos_food_items_brand before insert or update on public.pos_food_items for each row execute function public.pos_food_brand_identity_v1();
create or replace trigger pos_food_events_brand before insert or update on public.pos_food_events for each row execute function public.pos_food_brand_identity_v1();

alter table public.pos_food_tables enable row level security;
alter table public.pos_food_checks enable row level security;
alter table public.pos_food_tickets enable row level security;
alter table public.pos_food_items enable row level security;
alter table public.pos_food_events enable row level security;
revoke all on public.pos_food_tables, public.pos_food_checks, public.pos_food_tickets, public.pos_food_items, public.pos_food_events from public, anon, authenticated;
grant all on public.pos_food_tables, public.pos_food_checks, public.pos_food_tickets, public.pos_food_items, public.pos_food_events to service_role;

create or replace function public.pos_food_actor_v1(p_brand_slug text, p_host_user_id uuid, p_session_id uuid)
returns public.pos_staff language plpgsql security definer set search_path=public as $$
declare v_staff public.pos_staff%rowtype;
begin
  -- API authenticates host + membership + commercial access before calling this service-only RPC.
  -- Recheck PIN session inside the transaction; a client can never supply actor_id.
  select st.* into v_staff from public.pos_staff st join public.pos_staff_sessions se
    on se.staff_id=st.id and se.brand_slug=st.brand_slug
    where se.id=p_session_id and se.host_user_id=p_host_user_id and se.brand_slug=p_brand_slug
    and se.revoked_at is null and se.expires_at > clock_timestamp() and st.active
    and se.location_id is not distinct from st.location_id for share of st,se;
  if not found then raise exception 'POS_FOOD_SESSION_REQUIRED'; end if;
  if not exists(select 1 from public.pos_business_profiles where brand_slug=p_brand_slug and profile_code in ('restaurant','coffee_shop')) then
    raise exception 'POS_FOOD_FORBIDDEN';
  end if;
  return v_staff;
end $$;

create or replace function public.pos_food_command_v1(
  p_brand_slug text, p_host_user_id uuid, p_session_id uuid, p_action text, p_payload jsonb, p_key uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_actor public.pos_staff%rowtype; v_table public.pos_food_tables%rowtype;
  v_check public.pos_food_checks%rowtype; v_ticket public.pos_food_tickets%rowtype;
  v_item public.pos_food_items%rowtype; v_old public.pos_food_events%rowtype;
  v_location public.pos_locations%rowtype; v_cash public.pos_cash_sessions%rowtype;
  v_variant record; v_id uuid; v_location_id uuid; v_quantity numeric;
  v_inventory public.pos_inventory%rowtype; v_stock record;
  v_subtotal numeric(14,2); v_tax numeric(14,2); v_total numeric(14,2);
  v_items jsonb; v_result jsonb; v_time timestamptz; v_sequence integer;
begin
  v_actor := public.pos_food_actor_v1(p_brand_slug,p_host_user_id,p_session_id);
  if p_action is null or p_action not in ('table_create','open','item_add','item_update','send','prepare','ready','serve','request_payment','resume','pay') then raise exception 'POS_FOOD_INVALID'; end if;
  if (p_action='table_create' and v_actor.role <> 'ADMIN')
    or (p_action in ('open','item_add','item_update','send','serve','request_payment','resume') and v_actor.role not in ('ADMIN','MANAGER','WAITER'))
    or (p_action in ('prepare','ready') and v_actor.role not in ('ADMIN','MANAGER','KITCHEN'))
    or (p_action='pay' and v_actor.role not in ('ADMIN','MANAGER','CASHIER')) then raise exception 'POS_FOOD_FORBIDDEN'; end if;
  if p_key is null or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'POS_FOOD_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_brand_slug || ':' || p_key::text, 0));
  select * into v_old from public.pos_food_events where brand_slug=p_brand_slug and request_key=p_key;
  if found then
    if v_old.action<>p_action or v_old.payload<>p_payload or v_old.actor_id<>v_actor.id or v_old.host_user_id<>p_host_user_id
      or (v_actor.location_id is not null and v_actor.location_id<>v_old.location_id) then raise exception 'POS_FOOD_CONFLICT'; end if;
    return v_old.result || jsonb_build_object('replayed',true);
  end if;

  if p_action='table_create' then
    v_location_id := (p_payload->>'locationId')::uuid;
  elsif p_action='open' then
    select * into v_table from public.pos_food_tables where id=(p_payload->>'tableId')::uuid and brand_slug=p_brand_slug for update;
    if not found then raise exception 'POS_FOOD_NOT_FOUND'; end if;
    v_location_id := v_table.location_id;
  else
    -- Single lock order for every account mutation, including KDS and checkout.
    select * into v_check from public.pos_food_checks where id=(p_payload->>'checkId')::uuid and brand_slug=p_brand_slug for update;
    if not found then raise exception 'POS_FOOD_NOT_FOUND'; end if;
    v_location_id := v_check.location_id;
  end if;
  select * into v_location from public.pos_locations where id=v_location_id and brand_slug=p_brand_slug and active for share;
  if not found then raise exception 'POS_FOOD_NOT_FOUND'; end if;
  if v_actor.location_id is not null and v_actor.location_id<>v_location_id then raise exception 'POS_FOOD_FORBIDDEN'; end if;
  v_time := clock_timestamp();
  if v_check.id is not null and v_check.status='CLOSED' then raise exception 'POS_FOOD_CONFLICT'; end if;

  if p_action='table_create' then
    if coalesce(char_length(btrim(p_payload->>'name')),0) not between 1 and 60 then raise exception 'POS_FOOD_INVALID'; end if;
    begin
      insert into public.pos_food_tables(brand_slug,location_id,name) values(p_brand_slug,v_location_id,btrim(p_payload->>'name')) returning id into v_id;
    exception when unique_violation then raise exception 'POS_FOOD_DUPLICATE_TABLE'; end;
    v_result := jsonb_build_object('tableId',v_id);
  elsif p_action='open' then
    if exists(select 1 from public.pos_food_checks where table_id=v_table.id and status<>'CLOSED') then raise exception 'POS_FOOD_TABLE_OCCUPIED'; end if;
    if coalesce((p_payload->>'guests')::numeric,0) not between 1 and 100 or (p_payload->>'guests')::numeric<>trunc((p_payload->>'guests')::numeric)
      or char_length(p_payload->>'customerName')>120 then raise exception 'POS_FOOD_INVALID'; end if;
    insert into public.pos_food_checks(brand_slug,location_id,table_id,guests,customer_name,currency,prices_include_tax,opened_by,opened_at)
      values(p_brand_slug,v_location_id,v_table.id,(p_payload->>'guests')::integer,nullif(btrim(p_payload->>'customerName'),''),v_location.currency,v_location.prices_include_tax,v_actor.id,v_time) returning * into v_check;
    v_result := jsonb_build_object('checkId',v_check.id);
  elsif p_action in ('item_add','item_update') then
    if v_check.status<>'OPEN' then raise exception 'POS_FOOD_CONFLICT'; end if;
    v_quantity := (p_payload->>'quantity')::numeric;
    if v_quantity is null or v_quantity<0 or v_quantity>999 or v_quantity<>trunc(v_quantity) or char_length(p_payload->>'notes')>500 then raise exception 'POS_FOOD_INVALID'; end if;
    if p_action='item_update' then
      select * into v_item from public.pos_food_items where id=(p_payload->>'itemId')::uuid and check_id=v_check.id and brand_slug=p_brand_slug and voided_at is null;
      if not found then raise exception 'POS_FOOD_NOT_FOUND'; end if;
      if v_item.ticket_id is not null or v_item.version is distinct from (p_payload->>'version')::integer then raise exception 'POS_FOOD_CONFLICT'; end if;
    else
      if v_quantity=0 then raise exception 'POS_FOOD_INVALID'; end if;
      if (select count(*) from public.pos_food_items where check_id=v_check.id and voided_at is null)>=250 then raise exception 'POS_FOOD_INVALID'; end if;
      select v.*, p.name product_name, p.tax_rate, p.track_inventory, p.inventory_mode, p.configuration product_configuration
        into v_variant from public.pos_product_variants v join public.pos_products p on p.id=v.product_id and p.brand_slug=v.brand_slug
        where v.id=(p_payload->>'variantId')::uuid and v.brand_slug=p_brand_slug and v.active and p.active and p.sellable and p.inventory_mode in ('direct','none') for share of v,p;
      if not found then raise exception 'POS_FOOD_CATALOG_UNAVAILABLE'; end if;
      if v_variant.track_inventory and not exists(select 1 from public.pos_inventory where brand_slug=p_brand_slug and location_id=v_location_id and variant_id=v_variant.id and quantity-reserved_quantity>=v_quantity) then raise exception 'POS_FOOD_CATALOG_UNAVAILABLE'; end if;
      v_item.variant_id:=v_variant.id; v_item.unit_price:=v_variant.price; v_item.tax_rate:=v_variant.tax_rate;
      v_item.product_name:=v_variant.product_name; v_item.variant_name:=v_variant.name;
      v_item.configuration:=jsonb_build_object('variant',v_variant.configuration,'attributes',v_variant.attributes,'modifiers','[]'::jsonb);
    end if;
    v_subtotal:=round(v_item.unit_price*v_quantity,2);
    v_tax:=case when v_check.prices_include_tax then round(v_subtotal-v_subtotal/(1+v_item.tax_rate/100),2) else round(v_subtotal*v_item.tax_rate/100,2) end;
    v_total:=v_subtotal+case when v_check.prices_include_tax then 0 else v_tax end;
    if p_action='item_add' then
      insert into public.pos_food_items(brand_slug,check_id,variant_id,product_id,sku,unit_code,unit_cost,track_inventory,product_name,variant_name,quantity,unit_price,tax_rate,subtotal,tax_amount,line_total,notes,configuration,created_by,updated_by,created_at,updated_at)
        values(p_brand_slug,v_check.id,v_item.variant_id,v_variant.product_id,v_variant.sku,v_variant.unit_code,v_variant.cost,v_variant.track_inventory,v_item.product_name,v_item.variant_name,v_quantity,v_item.unit_price,v_item.tax_rate,v_subtotal,v_tax,v_total,nullif(btrim(p_payload->>'notes'),''),v_item.configuration,v_actor.id,v_actor.id,v_time,v_time) returning id into v_id;
    elsif v_quantity=0 then
      update public.pos_food_items set voided_at=v_time,voided_by=v_actor.id,updated_by=v_actor.id,updated_at=v_time,version=version+1 where id=v_item.id;
      v_id:=v_item.id;
    else
      update public.pos_food_items set quantity=v_quantity,subtotal=v_subtotal,tax_amount=v_tax,line_total=v_total,notes=nullif(btrim(p_payload->>'notes'),''),updated_by=v_actor.id,updated_at=v_time,version=version+1 where id=v_item.id;
      v_id:=v_item.id;
    end if;
    v_result:=jsonb_build_object('checkId',v_check.id,'itemId',v_id);
  elsif p_action='send' then
    if v_check.status<>'OPEN' or v_check.version is distinct from (p_payload->>'version')::integer then raise exception 'POS_FOOD_CONFLICT'; end if;
    if not exists(select 1 from public.pos_food_items where check_id=v_check.id and ticket_id is null and voided_at is null) then raise exception 'POS_FOOD_DRAFT_REQUIRED'; end if;
    select coalesce(max(sequence),0)+1 into v_sequence from public.pos_food_tickets where check_id=v_check.id;
    insert into public.pos_food_tickets(brand_slug,check_id,sequence,sent_by,sent_at) values(p_brand_slug,v_check.id,v_sequence,v_actor.id,v_time) returning id into v_id;
    -- Availability check only: SEND neither consumes nor reserves inventory.
    -- Aggregate duplicate variants in this round. V4 rechecks stock at checkout;
    -- another sale can consume it while this account is still unpaid.
    for v_stock in select variant_id,sum(quantity) quantity from public.pos_food_items
      where check_id=v_check.id and ticket_id is null and voided_at is null and track_inventory group by variant_id order by variant_id
    loop
      select * into v_inventory from public.pos_inventory where brand_slug=p_brand_slug and location_id=v_location_id and variant_id=v_stock.variant_id;
      if not found or v_inventory.quantity-v_inventory.reserved_quantity<v_stock.quantity then raise exception 'POS_FOOD_STOCK_UNAVAILABLE'; end if;
    end loop;
    update public.pos_food_items set ticket_id=v_id,updated_at=v_time,updated_by=v_actor.id,version=version+1 where check_id=v_check.id and ticket_id is null and voided_at is null;
    v_result:=jsonb_build_object('checkId',v_check.id,'ticketId',v_id);
  elsif p_action in ('prepare','ready','serve') then
    select * into v_ticket from public.pos_food_tickets where id=(p_payload->>'ticketId')::uuid and check_id=v_check.id and brand_slug=p_brand_slug;
    if not found then raise exception 'POS_FOOD_NOT_FOUND'; end if;
    if (p_action='prepare' and v_ticket.status<>'PENDING') or (p_action='ready' and v_ticket.status<>'PREPARING')
      or (p_action='serve' and (v_ticket.status<>'READY' or v_ticket.served_at is not null)) then raise exception 'POS_FOOD_CONFLICT'; end if;
    if p_action='prepare' then update public.pos_food_tickets set status='PREPARING',preparing_at=v_time,preparing_by=v_actor.id where id=v_ticket.id;
    elsif p_action='ready' then update public.pos_food_tickets set status='READY',ready_at=v_time,ready_by=v_actor.id where id=v_ticket.id;
    else update public.pos_food_tickets set served_at=v_time,served_by=v_actor.id where id=v_ticket.id; end if;
    v_result:=jsonb_build_object('checkId',v_check.id,'ticketId',v_ticket.id);
  elsif p_action in ('request_payment','resume') then
    if v_check.version is distinct from (p_payload->>'version')::integer or (p_action='request_payment' and v_check.status<>'OPEN') or (p_action='resume' and v_check.status<>'PAYMENT_PENDING') then raise exception 'POS_FOOD_CONFLICT'; end if;
    if p_action='request_payment' then
      if not exists(select 1 from public.pos_food_items where check_id=v_check.id and voided_at is null)
        or exists(select 1 from public.pos_food_items where check_id=v_check.id and ticket_id is null and voided_at is null)
        or exists(select 1 from public.pos_food_tickets where check_id=v_check.id and served_at is null) then raise exception 'POS_FOOD_SERVICE_INCOMPLETE'; end if;
      update public.pos_food_checks set status='PAYMENT_PENDING',payment_requested_at=v_time,payment_requested_by=v_actor.id where id=v_check.id;
    else update public.pos_food_checks set status='OPEN' where id=v_check.id; end if;
    v_result:=jsonb_build_object('checkId',v_check.id);
  elsif p_action='pay' then
    if v_check.status<>'PAYMENT_PENDING' or v_check.version is distinct from (p_payload->>'version')::integer then raise exception 'POS_FOOD_CONFLICT'; end if;
    if p_payload->>'method' is null or p_payload->>'method' not in ('cash','card','other') then raise exception 'POS_FOOD_INVALID'; end if;
    select * into v_cash from public.pos_cash_sessions where id=(p_payload->>'cashSessionId')::uuid and brand_slug=p_brand_slug and location_id=v_location_id and status='open' for update;
    if not found then raise exception 'POS_FOOD_CASH_REQUIRED'; end if;
    -- Only server-owned item IDs enter the canonical engine. No client price or inventory overrides.
    select jsonb_agg(jsonb_build_object('food_item_id',id,'variant_id',variant_id,'quantity',quantity,'discount_amount',discount_amount) order by variant_id,id),sum(line_total)
      into v_items,v_total from public.pos_food_items where check_id=v_check.id and voided_at is null;
    if v_total is null or v_total<=0 then raise exception 'POS_FOOD_INVALID'; end if;
    v_result:=public.pos_complete_sale_with_staff_v1(p_brand_slug,v_location_id,v_cash.register_id,v_cash.id,null,v_items,
      jsonb_build_array(jsonb_build_object('method',p_payload->>'method','amount',v_total,'tendered_amount',v_total)),
      'Food check ' || v_check.id::text,p_host_user_id,null,v_check.id,null,null,v_actor.id);
    if (v_result->>'id') is null or (v_result->>'total')::numeric is distinct from v_total then raise exception 'POS_FOOD_CONFLICT'; end if;
    -- V4 owns the only stock deduction and movement. This marker, account close
    -- and audit commit with that sale; any subsequent error rolls all of it back.
    update public.pos_food_items set inventory_committed_at=clock_timestamp()
      where check_id=v_check.id and voided_at is null and track_inventory and inventory_committed_at is null;
    update public.pos_food_checks set status='CLOSED',closed_at=v_time,closed_by=v_actor.id,cashier_id=v_actor.id,sale_id=(v_result->>'id')::uuid where id=v_check.id;
    v_result:=jsonb_build_object('checkId',v_check.id,'saleId',v_result->>'id','total',v_total,'closed',true);
  end if;
  if v_check.id is not null and p_action<>'open' then update public.pos_food_checks set version=version+1 where id=v_check.id; end if;
  insert into public.pos_food_events(brand_slug,location_id,check_id,actor_id,host_user_id,action,request_key,payload,result,created_at)
    values(p_brand_slug,v_location_id,v_check.id,v_actor.id,p_host_user_id,p_action,p_key,p_payload,v_result,v_time);
  return v_result;
end $$;

create or replace function public.pos_food_snapshot_v1(p_brand_slug text,p_host_user_id uuid,p_session_id uuid,p_location_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_actor public.pos_staff%rowtype; v_location public.pos_locations%rowtype; v_locations jsonb; v_result jsonb;
begin
  v_actor:=public.pos_food_actor_v1(p_brand_slug,p_host_user_id,p_session_id);
  if v_actor.location_id is not null and p_location_id is not null and v_actor.location_id<>p_location_id then raise exception 'POS_FOOD_FORBIDDEN'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'currency',currency,'prices_include_tax',prices_include_tax) order by name),'[]') into v_locations
    from public.pos_locations where brand_slug=p_brand_slug and active and (v_actor.location_id is null or id=v_actor.location_id);
  if coalesce(v_actor.location_id,p_location_id) is null and jsonb_array_length(v_locations)<>1 then
    return jsonb_build_object('locations',v_locations,'location',null,'tables','[]'::jsonb,'checks','[]'::jsonb,'tickets','[]'::jsonb,'items','[]'::jsonb,'products','[]'::jsonb,'staff','[]'::jsonb,'cash_sessions','[]'::jsonb);
  end if;
  select * into v_location from public.pos_locations where brand_slug=p_brand_slug and active and id=coalesce(v_actor.location_id,p_location_id,(v_locations->0->>'id')::uuid);
  if not found then raise exception 'POS_FOOD_NOT_FOUND'; end if;
  -- One SQL statement gives a consistent snapshot of checks, drafts and tickets.
  with checks as (select * from public.pos_food_checks where brand_slug=p_brand_slug and location_id=v_location.id and status<>'CLOSED'),
  tickets as (select t.* from public.pos_food_tickets t join checks c on c.id=t.check_id where t.brand_slug=p_brand_slug),
  items as (select i.* from public.pos_food_items i join checks c on c.id=i.check_id where i.brand_slug=p_brand_slug and i.voided_at is null),
  products as (
    select v.id,p.name product_name,v.name,coalesce(c.name,'Sin categoría') category,v.price,p.tax_rate,
      case when p.track_inventory then greatest(coalesce(inv.quantity-inv.reserved_quantity,0),0) else null end available
    from public.pos_product_variants v join public.pos_products p on p.id=v.product_id and p.brand_slug=v.brand_slug
    left join public.pos_categories c on c.id=p.category_id and c.brand_slug=p_brand_slug
    left join public.pos_inventory inv on inv.variant_id=v.id and inv.location_id=v_location.id and inv.brand_slug=p_brand_slug
    where v.brand_slug=p_brand_slug and v.active and p.active and p.sellable and p.inventory_mode in ('direct','none')
  )
  select jsonb_build_object(
    'locations',v_locations,'location',jsonb_build_object('id',v_location.id,'name',v_location.name,'currency',v_location.currency,'prices_include_tax',v_location.prices_include_tax),
    'tables',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.pos_food_tables where brand_slug=p_brand_slug and location_id=v_location.id),'[]'),
    'checks',coalesce((select jsonb_agg(to_jsonb(c) order by opened_at) from checks c),'[]'),
    'tickets',coalesce((select jsonb_agg(to_jsonb(t) order by sent_at) from tickets t),'[]'),
    'items',coalesce((select jsonb_agg(to_jsonb(i) order by created_at,id) from items i where v_actor.role<>'KITCHEN' or i.ticket_id is not null),'[]'),
    'staff',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from public.pos_staff where brand_slug=p_brand_slug),'[]'),
    'products',case when v_actor.role in ('ADMIN','MANAGER','WAITER') then coalesce((select jsonb_agg(to_jsonb(p) order by product_name,name) from products p),'[]') else '[]'::jsonb end,
    'cash_sessions',case when v_actor.role in ('ADMIN','MANAGER','CASHIER') then coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'register_name',r.name) order by r.name) from public.pos_cash_sessions s join public.pos_registers r on r.id=s.register_id and r.brand_slug=s.brand_slug where s.brand_slug=p_brand_slug and s.location_id=v_location.id and s.status='open' and r.status='available'),'[]') else '[]'::jsonb end
  ) into v_result;
  return v_result;
end $$;

revoke all on function public.pos_food_actor_v1(text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.pos_food_command_v1(text,uuid,uuid,text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.pos_food_snapshot_v1(text,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.pos_food_actor_v1(text,uuid,uuid) to service_role;
grant execute on function public.pos_food_command_v1(text,uuid,uuid,text,jsonb,uuid) to service_role;
grant execute on function public.pos_food_snapshot_v1(text,uuid,uuid,uuid) to service_role;
revoke all on function public.pos_food_brand_identity_v1() from public,anon,authenticated;
commit;
