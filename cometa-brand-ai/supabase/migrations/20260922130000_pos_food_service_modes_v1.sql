-- Additive Food service modes; same accounts, SEND, KDS and checkout.
begin;
alter table public.pos_food_checks add column order_number bigint generated always as identity;
create unique index pos_food_checks_order_number on public.pos_food_checks(order_number);
do $$ declare source text; old text; new text; begin
 source:=pg_get_functiondef('public.pos_food_command_legacy_v1(text,uuid,uuid,text,jsonb,uuid)'::regprocedure);
 old:='    select * into v_table from public.pos_food_tables where id=(p_payload->>''tableId'')::uuid and brand_slug=p_brand_slug for update;
    if not found then raise exception ''POS_FOOD_NOT_FOUND''; end if;
    v_location_id := v_table.location_id;';
 new:='    if coalesce(p_payload->>''serviceType'',''DINE_IN'')=''DINE_IN'' then
      select * into v_table from public.pos_food_tables where id=(p_payload->>''tableId'')::uuid and brand_slug=p_brand_slug for update;
      if not found then raise exception ''POS_FOOD_NOT_FOUND''; end if;
      v_location_id := v_table.location_id;
    elsif p_payload->>''serviceType'' in (''COUNTER'',''TAKEAWAY'') then
      if nullif(p_payload->>''tableId'','''') is not null then raise exception ''POS_FOOD_INVALID''; end if;
      v_location_id := (p_payload->>''locationId'')::uuid;
    else raise exception ''POS_FOOD_INVALID''; end if;';
 if position(old in source)=0 then raise exception 'FOOD_SERVICE_OPEN_ANCHOR'; end if;
 source:=replace(source,old,new);
 old:='insert into public.pos_food_checks(brand_slug,location_id,table_id,guests,customer_name,currency,prices_include_tax,opened_by,opened_at)';
 if position(old in source)=0 then raise exception 'FOOD_SERVICE_INSERT_ANCHOR'; end if;
 source:=replace(source,old,'insert into public.pos_food_checks(brand_slug,location_id,table_id,guests,customer_name,currency,prices_include_tax,opened_by,opened_at,service_type)');
 old:='v_location.currency,v_location.prices_include_tax,v_actor.id,v_time) returning * into v_check;';
 if position(old in source)=0 then raise exception 'FOOD_SERVICE_VALUES_ANCHOR'; end if;
 source:=replace(source,old,'v_location.currency,v_location.prices_include_tax,v_actor.id,v_time,coalesce(p_payload->>''serviceType'',''DINE_IN'')) returning * into v_check;');
 execute source;
end $$;
-- Rollback: stop creating non-table orders. Keep service_type/order_number and
-- finish their KDS/checkout through the unchanged engine; never erase history.
commit;
