begin;

create table if not exists public.pos_food_inventory_requests (
  brand_slug text not null,
  location_id uuid not null,
  request_key uuid not null,
  request_type text not null check (request_type in ('LOSS','COUNT','IMPORT')),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid not null,
  primary key (brand_slug, location_id, request_key)
);
alter table public.pos_food_inventory_requests enable row level security;
revoke all on public.pos_food_inventory_requests from public, anon, authenticated;
grant select,insert,update on public.pos_food_inventory_requests to service_role;

create or replace function public.pos_food_inventory_loss_v1(
  p_brand text,p_host uuid,p_session uuid,p_location uuid,p_variant uuid,
  p_quantity numeric,p_unit text,p_reason text,p_notes text,p_reference text,p_request uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v numeric; before_qty numeric; after_qty numeric; cached jsonb; staff uuid;
begin
  select staff_id into staff from public.pos_staff_sessions where id=p_session and brand_slug=p_brand and expires_at>now();
  if not public.pos_staff_has_any_role_v1(staff,p_brand,array['ADMIN','MANAGER','INVENTORY']) then raise exception 'POS_FOOD_FORBIDDEN'; end if;
  select result into cached from public.pos_food_inventory_requests where brand_slug=p_brand and location_id=p_location and request_key=p_request and request_type='LOSS' for update;
  if cached is not null then return cached; end if;
  if p_quantity is null or p_quantity<=0 or nullif(btrim(p_reason),'') is null then raise exception 'POS_FOOD_INVALID'; end if;
  v:=public.pos_food_convert_quantity_v1(p_quantity,p_unit,(select pv.unit_code from pos_product_variants pv where pv.id=p_variant and pv.brand_slug=p_brand));
  if v is null or v<=0 then raise exception 'POS_FOOD_INVALID'; end if;
  select quantity into before_qty from public.pos_inventory where brand_slug=p_brand and location_id=p_location and variant_id=p_variant for update;
  if coalesce(before_qty,0)<v then raise exception 'POS_FOOD_INSUFFICIENT_STOCK'; end if;
  perform public.pos_adjust_inventory(p_brand,p_location,p_variant,-v,'loss',concat('[',p_reason,'] ',coalesce(nullif(btrim(p_notes),''),''),case when p_reference is not null then concat(' ref:',p_reference) else '' end),p_host,false);
  select quantity into after_qty from public.pos_inventory where brand_slug=p_brand and location_id=p_location and variant_id=p_variant;
  insert into public.pos_food_inventory_requests values(p_brand,p_location,p_request,'LOSS',jsonb_build_object('before',before_qty,'after',after_qty,'quantity',v),now(),p_host);
  return jsonb_build_object('before',before_qty,'after',after_qty,'quantity',v);
end $$;

create or replace function public.pos_food_inventory_count_v1(
  p_brand text,p_host uuid,p_session uuid,p_location uuid,p_variant uuid,
  p_counted numeric,p_unit text,p_notes text,p_request uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare before_qty numeric; counted numeric; variance numeric; cached jsonb; staff uuid;
begin
  select staff_id into staff from public.pos_staff_sessions where id=p_session and brand_slug=p_brand and expires_at>now();
  if not public.pos_staff_has_any_role_v1(staff,p_brand,array['ADMIN','MANAGER','INVENTORY']) then raise exception 'POS_FOOD_FORBIDDEN'; end if;
  select result into cached from public.pos_food_inventory_requests where brand_slug=p_brand and location_id=p_location and request_key=p_request and request_type='COUNT' for update;
  if cached is not null then return cached; end if;
  counted:=public.pos_food_convert_quantity_v1(p_counted,p_unit,(select pv.unit_code from pos_product_variants pv where pv.id=p_variant and pv.brand_slug=p_brand));
  if counted is null or counted<0 then raise exception 'POS_FOOD_INVALID'; end if;
  select quantity into before_qty from public.pos_inventory where brand_slug=p_brand and location_id=p_location and variant_id=p_variant for update;
  before_qty:=coalesce(before_qty,0); variance:=counted-before_qty;
  if variance<>0 then perform public.pos_adjust_inventory(p_brand,p_location,p_variant,variance,'adjustment',coalesce(nullif(btrim(p_notes),''),'Conteo físico'),p_host,false); end if;
  insert into public.pos_food_inventory_requests values(p_brand,p_location,p_request,'COUNT',jsonb_build_object('system_quantity_before',before_qty,'counted_quantity',counted,'variance',variance),now(),p_host);
  return jsonb_build_object('system_quantity_before',before_qty,'counted_quantity',counted,'variance',variance);
end $$;

create or replace function public.pos_food_inventory_import_mark_v1(p_brand text,p_host uuid,p_session uuid,p_location uuid,p_request uuid,p_result jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare cached jsonb; staff uuid;
begin
  select staff_id into staff from public.pos_staff_sessions where id=p_session and brand_slug=p_brand and expires_at>now();
  if not public.pos_staff_has_any_role_v1(staff,p_brand,array['ADMIN','MANAGER','INVENTORY']) then raise exception 'POS_FOOD_FORBIDDEN'; end if;
  select result into cached from public.pos_food_inventory_requests where brand_slug=p_brand and location_id=p_location and request_key=p_request and request_type='IMPORT' for update;
  if cached is not null and coalesce(cached->>'status','')='done' then return cached; end if;
  if cached is not null then update public.pos_food_inventory_requests set result=p_result where brand_slug=p_brand and location_id=p_location and request_key=p_request and request_type='IMPORT'; return p_result; end if;
  insert into public.pos_food_inventory_requests values(p_brand,p_location,p_request,'IMPORT',p_result,now(),p_host);
  return p_result;
end $$;

create or replace function public.pos_food_inventory_import_apply_v1(p_brand text,p_host uuid,p_session uuid,p_location uuid,p_request uuid,p_rows jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare staff uuid; cached jsonb; row jsonb; payload jsonb; decision text; processed integer:=0;
begin
  select staff_id into staff from public.pos_staff_sessions where id=p_session and brand_slug=p_brand and expires_at>now();
  if not public.pos_staff_has_any_role_v1(staff,p_brand,array['ADMIN','MANAGER','INVENTORY']) then raise exception 'POS_FOOD_FORBIDDEN'; end if;
  select result into cached from public.pos_food_inventory_requests where brand_slug=p_brand and location_id=p_location and request_key=p_request and request_type='IMPORT' for update;
  if cached is not null and cached->>'status'='done' then return cached; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'POS_FOOD_INVALID'; end if;
  for row in select value from jsonb_array_elements(p_rows) loop
    if coalesce(jsonb_array_length(coalesce(row->'errors','[]'::jsonb)),0)>0 then continue; end if;
    decision:=coalesce(row->>'decision',row->>'proposed','create');
    if decision='ignore' then continue; end if;
    if decision in ('use_existing','update') then
      if nullif(row->>'existingId','') is null then raise exception 'POS_FOOD_INVALID'; end if;
      payload:=jsonb_build_object('id',(row->>'existingId')::uuid);
    else payload:='{}'::jsonb; end if;
    payload:=payload || jsonb_build_object('name',row->>'name','category',coalesce(nullif(row->>'category',''),'food'),'unit_code',row->>'controlUnit','initial_quantity',case when decision in ('use_existing','update') then 0 else coalesce((row->>'initialStock')::numeric,0) end,'minimum_quantity',coalesce((row->>'minimumStock')::numeric,0),'waste_percent',0,'supplier_name',nullif(row->>'supplier',''),'active',coalesce((row->>'active')::boolean,true),'presentations',jsonb_build_array(jsonb_build_object('name',coalesce(row->>'packageQuantity','1')||' '||coalesce(row->>'packageUnit',row->>'controlUnit'),'content',(row->>'packageQuantity')::numeric,'unit_code',row->>'packageUnit','cost',coalesce((row->>'packageCost')::numeric,0),'supplier_name',nullif(row->>'supplier',''),'active',true)));
    perform public.pos_food_recipes_admin_v1(p_brand,p_host,p_session,p_location,'ingredient_save',payload);
    processed:=processed+1;
  end loop;
  cached:=jsonb_build_object('status','done','processed',processed,'requestKey',p_request);
  insert into public.pos_food_inventory_requests values(p_brand,p_location,p_request,'IMPORT',cached,now(),p_host);
  return cached;
end $$;
revoke all on function public.pos_food_inventory_loss_v1(text,uuid,uuid,uuid,uuid,numeric,text,text,text,text,uuid), public.pos_food_inventory_count_v1(text,uuid,uuid,uuid,uuid,numeric,text,text,uuid), public.pos_food_inventory_import_mark_v1(text,uuid,uuid,uuid,uuid,jsonb) from public;
revoke all on function public.pos_food_inventory_import_apply_v1(text,uuid,uuid,uuid,uuid,jsonb) from public;
grant execute on function public.pos_food_inventory_loss_v1(text,uuid,uuid,uuid,uuid,numeric,text,text,text,text,uuid), public.pos_food_inventory_count_v1(text,uuid,uuid,uuid,uuid,numeric,text,text,uuid), public.pos_food_inventory_import_mark_v1(text,uuid,uuid,uuid,uuid,jsonb), public.pos_food_inventory_import_apply_v1(text,uuid,uuid,uuid,uuid,jsonb) to service_role;
commit;
