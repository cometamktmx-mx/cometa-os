-- Food-only modifiers. No inventory for options; canonical V4 consumes the base product once.
begin;

create table public.pos_food_modifier_groups (
  id uuid primary key default gen_random_uuid(),
  brand_slug text not null references public.brands(slug) on delete restrict,
  name text not null check(char_length(btrim(name)) between 1 and 100),
  required boolean not null default false,
  min_selections integer not null default 0,
  max_selections integer not null default 1,
  selection_mode text not null default 'single' check(selection_mode in ('single','multiple')),
  display_order integer not null default 0 check(display_order >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,brand_slug),
  check(min_selections between 0 and 100 and max_selections between 1 and 100 and min_selections <= max_selections),
  check(not required or min_selections >= 1),
  check(selection_mode <> 'single' or max_selections = 1)
);
create index pos_food_modifier_groups_brand on public.pos_food_modifier_groups(brand_slug,display_order,id);
create table public.pos_food_modifier_options (
  id uuid primary key default gen_random_uuid(), brand_slug text not null,
  group_id uuid not null,
  name text not null check(char_length(btrim(name)) between 1 and 100),
  price_delta numeric(14,2) not null default 0,
  type text not null default 'choice' check(type in ('choice','add','remove')),
  display_order integer not null default 0 check(display_order >= 0), active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,brand_slug),
  foreign key(group_id,brand_slug) references public.pos_food_modifier_groups(id,brand_slug) on delete restrict,
  -- Reductions require an explicitly configured removal; there is no implicit discount.
  check(price_delta >= 0 or type='remove')
);
create index pos_food_modifier_options_group on public.pos_food_modifier_options(brand_slug,group_id,display_order,id);
create table public.pos_food_product_modifier_groups (
  brand_slug text not null, product_id uuid not null, group_id uuid not null,
  primary key(brand_slug,product_id,group_id),
  foreign key(product_id,brand_slug) references public.pos_products(id,brand_slug) on delete restrict,
  foreign key(group_id,brand_slug) references public.pos_food_modifier_groups(id,brand_slug) on delete restrict
);
create index pos_food_product_modifier_groups_group on public.pos_food_product_modifier_groups(brand_slug,group_id,product_id);
alter table public.pos_food_modifier_groups enable row level security;
alter table public.pos_food_modifier_options enable row level security;
alter table public.pos_food_product_modifier_groups enable row level security;
revoke all on public.pos_food_modifier_groups,public.pos_food_modifier_options,public.pos_food_product_modifier_groups from public,anon,authenticated;
grant all on public.pos_food_modifier_groups,public.pos_food_modifier_options,public.pos_food_product_modifier_groups to service_role;

create function public.pos_food_product_modifiers_v1(p_brand_slug text,p_product_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',g.id,'name',g.name,'required',g.required,'min_selections',g.min_selections,
    'max_selections',g.max_selections,'selection_mode',g.selection_mode,'display_order',g.display_order,
    'options',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'price_delta',o.price_delta,'type',o.type,'display_order',o.display_order) order by o.display_order,o.id)
      from public.pos_food_modifier_options o where o.group_id=g.id and o.brand_slug=p_brand_slug and o.active),'[]'::jsonb)
  ) order by g.display_order,g.id),'[]'::jsonb)
  from public.pos_food_modifier_groups g join public.pos_food_product_modifier_groups a on a.group_id=g.id and a.brand_slug=g.brand_slug
  where a.brand_slug=p_brand_slug and a.product_id=p_product_id and g.active
$$;

create function public.pos_food_resolve_modifiers_v1(p_brand_slug text,p_product_id uuid,p_ids jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare g public.pos_food_modifier_groups%rowtype; o public.pos_food_modifier_options%rowtype;
  ids uuid[]; n integer; result jsonb:='[]';
begin
  if p_ids is null or jsonb_typeof(p_ids)<>'array' or jsonb_array_length(p_ids)>100 then raise exception 'POS_FOOD_MODIFIERS_INVALID'; end if;
  begin select coalesce(array_agg(value::uuid),'{}'::uuid[]) into ids from jsonb_array_elements_text(p_ids);
  exception when invalid_text_representation then raise exception 'POS_FOOD_MODIFIERS_INVALID'; end;
  if cardinality(ids)<>(select count(distinct id) from unnest(ids) id) then raise exception 'POS_FOOD_MODIFIERS_INVALID'; end if;
  -- SHARE locks keep the selected definition stable until item + audit commit.
  for g in select gr.* from public.pos_food_modifier_groups gr join public.pos_food_product_modifier_groups a on a.group_id=gr.id and a.brand_slug=gr.brand_slug
    where a.brand_slug=p_brand_slug and a.product_id=p_product_id and gr.active order by gr.id for share of gr,a
  loop
    select count(*) into n from public.pos_food_modifier_options where id=any(ids) and group_id=g.id and brand_slug=p_brand_slug and active;
    if ((g.required or n>0) and n<g.min_selections) or n>g.max_selections or (g.selection_mode='single' and n>1) then raise exception 'POS_FOOD_MODIFIERS_SELECTION'; end if;
  end loop;
  for o in select * from public.pos_food_modifier_options where id=any(ids) order by id for share
  loop
    select gr.* into g from public.pos_food_modifier_groups gr join public.pos_food_product_modifier_groups a on a.group_id=gr.id and a.brand_slug=gr.brand_slug
      where gr.id=o.group_id and gr.brand_slug=p_brand_slug and a.product_id=p_product_id and a.brand_slug=p_brand_slug and gr.active;
    if not found or not o.active or o.brand_slug<>p_brand_slug then raise exception 'POS_FOOD_MODIFIERS_INVALID'; end if;
    result:=result||jsonb_build_array(jsonb_build_object('group_id',g.id,'group_name',g.name,'group_order',g.display_order,
      'option_id',o.id,'name',o.name,'price_delta',o.price_delta,'type',o.type,'display_order',o.display_order));
  end loop;
  if jsonb_array_length(result)<>cardinality(ids) then raise exception 'POS_FOOD_MODIFIERS_INVALID'; end if;
  select coalesce(jsonb_agg(value order by (value->>'group_order')::integer,value->>'group_id',(value->>'display_order')::integer,value->>'option_id'),'[]') into result from jsonb_array_elements(result);
  return result;
end $$;

create function public.pos_food_modifiers_catalog_v1(p_brand_slug text,p_host_user_id uuid,p_session_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor public.pos_staff%rowtype;
begin
  actor:=public.pos_food_actor_v1(p_brand_slug,p_host_user_id,p_session_id);
  if actor.role<>'ADMIN' then raise exception 'POS_FOOD_FORBIDDEN'; end if;
  return jsonb_build_object(
    'groups',coalesce((select jsonb_agg(to_jsonb(g) order by display_order,id) from public.pos_food_modifier_groups g where brand_slug=p_brand_slug),'[]'),
    'options',coalesce((select jsonb_agg(to_jsonb(o) order by display_order,id) from public.pos_food_modifier_options o where brand_slug=p_brand_slug),'[]'),
    'associations',coalesce((select jsonb_agg(to_jsonb(a)) from public.pos_food_product_modifier_groups a where brand_slug=p_brand_slug),'[]'),
    'products',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.pos_products where brand_slug=p_brand_slug and active),'[]'));
end $$;

create function public.pos_food_modifiers_admin_v1(p_brand_slug text,p_host_user_id uuid,p_session_id uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor public.pos_staff%rowtype; v_id uuid; v_group uuid; v_product uuid; v_ids uuid[]; v_brand uuid;
begin
  actor:=public.pos_food_actor_v1(p_brand_slug,p_host_user_id,p_session_id);
  if actor.role<>'ADMIN' then raise exception 'POS_FOOD_FORBIDDEN'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'POS_FOOD_MODIFIERS_INVALID'; end if;
  v_id:=coalesce((p_payload->>'id')::uuid,gen_random_uuid());
  if p_action='group_save' then
    if exists(select 1 from public.pos_food_modifier_groups where id=v_id and brand_slug<>p_brand_slug) then raise exception 'POS_FOOD_FORBIDDEN'; end if;
    insert into public.pos_food_modifier_groups(id,brand_slug,name,required,min_selections,max_selections,selection_mode,display_order,active)
    values(v_id,p_brand_slug,btrim(p_payload->>'name'),(p_payload->>'required')::boolean,(p_payload->>'min_selections')::integer,(p_payload->>'max_selections')::integer,p_payload->>'selection_mode',(p_payload->>'display_order')::integer,(p_payload->>'active')::boolean)
    on conflict(id) do update set name=excluded.name,required=excluded.required,min_selections=excluded.min_selections,max_selections=excluded.max_selections,selection_mode=excluded.selection_mode,display_order=excluded.display_order,active=excluded.active,updated_at=clock_timestamp() where pos_food_modifier_groups.brand_slug=p_brand_slug;
    if not found then raise exception 'POS_FOOD_FORBIDDEN'; end if;
  elsif p_action='option_save' then
    v_group:=(p_payload->>'group_id')::uuid;
    if not exists(select 1 from public.pos_food_modifier_groups where id=v_group and brand_slug=p_brand_slug) or exists(select 1 from public.pos_food_modifier_options where id=v_id and brand_slug<>p_brand_slug) then raise exception 'POS_FOOD_FORBIDDEN'; end if;
    insert into public.pos_food_modifier_options(id,brand_slug,group_id,name,price_delta,type,display_order,active)
    values(v_id,p_brand_slug,v_group,btrim(p_payload->>'name'),(p_payload->>'price_delta')::numeric,p_payload->>'type',(p_payload->>'display_order')::integer,(p_payload->>'active')::boolean)
    on conflict(id) do update set group_id=excluded.group_id,name=excluded.name,price_delta=excluded.price_delta,type=excluded.type,display_order=excluded.display_order,active=excluded.active,updated_at=clock_timestamp() where pos_food_modifier_options.brand_slug=p_brand_slug;
    if not found then raise exception 'POS_FOOD_FORBIDDEN'; end if;
  elsif p_action='product_groups_save' then
    v_product:=(p_payload->>'product_id')::uuid;
    perform 1 from public.pos_products where id=v_product and brand_slug=p_brand_slug for update;
    if not found then raise exception 'POS_FOOD_FORBIDDEN'; end if;
    if jsonb_typeof(p_payload->'group_ids') is distinct from 'array' or jsonb_array_length(p_payload->'group_ids')>100 then raise exception 'POS_FOOD_MODIFIERS_INVALID'; end if;
    select coalesce(array_agg(value::uuid),'{}'::uuid[]) into v_ids from jsonb_array_elements_text(p_payload->'group_ids');
    if cardinality(v_ids)<>(select count(distinct id) from unnest(v_ids) id) or exists(select 1 from unnest(v_ids) id where not exists(select 1 from public.pos_food_modifier_groups g where g.id=id and g.brand_slug=p_brand_slug)) then raise exception 'POS_FOOD_FORBIDDEN'; end if;
    delete from public.pos_food_product_modifier_groups where product_id=v_product and brand_slug=p_brand_slug;
    insert into public.pos_food_product_modifier_groups(brand_slug,product_id,group_id) select p_brand_slug,v_product,id from unnest(v_ids) id;
    v_id:=v_product;
  else raise exception 'POS_FOOD_MODIFIERS_INVALID'; end if;
  select id into v_brand from public.brands where slug=p_brand_slug;
  insert into public.pos_staff_audit_events(brand_id,brand_slug,location_id,actor_staff_id,host_user_id,action,entity_type,entity_id,metadata)
    values(v_brand::text,p_brand_slug,actor.location_id,actor.id,p_host_user_id,'FOOD_MODIFIERS_CONFIG','food_modifiers',v_id,jsonb_build_object('action',p_action,'payload',p_payload));
  return jsonb_build_object('id',v_id);
exception when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then raise exception 'POS_FOOD_MODIFIERS_INVALID';
end $$;

-- Database-owned snapshot + protected action ledger are its provenance, not a client flag.
create function public.pos_food_modifier_proof_v1(p_configuration jsonb,p_price numeric,p_tax numeric)
returns text language sql immutable set search_path=public as $$
  select encode(sha256(convert_to(jsonb_build_object('configuration',p_configuration,'unit_price',p_price,'tax_rate',p_tax)::text,'UTF8')),'hex')
$$;
create function public.pos_food_modifiers_immutable_v1() returns trigger language plpgsql set search_path=public as $$
begin
  if old.ticket_id is not null and new.configuration is distinct from old.configuration then raise exception 'POS_FOOD_MODIFIERS_FROZEN'; end if;
  return new;
end $$;
create trigger pos_food_modifiers_immutable before update on public.pos_food_items for each row execute function public.pos_food_modifiers_immutable_v1();

-- Only this helper knows how a Food checkout is authorized; V4's existing engine remains canonical.
create function public.pos_food_checkout_context_v1(p_brand_slug text,p_location_id uuid,p_register_id uuid,p_cash_session_id uuid,p_user_id uuid,p_key uuid,p_items jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.pos_food_checks%rowtype; i public.pos_food_items%rowtype; payload jsonb; config jsonb; proof text;
  price numeric; tax numeric; extra numeric; subtotal numeric; total numeric; expected_total numeric:=0; result jsonb:='{}'; ids uuid[];
begin
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'POS_FOOD_CHECKOUT_INVALID'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) v where not (v ? 'food_item_id') or nullif(v->>'food_item_id','') is null) then raise exception 'POS_FOOD_CHECKOUT_INVALID'; end if;
  select * into c from public.pos_food_checks where id=p_key and brand_slug=p_brand_slug and location_id=p_location_id for update;
  if not found or c.status not in ('PAYMENT_PENDING','CLOSED') then raise exception 'POS_FOOD_CHECKOUT_INVALID'; end if;
  if c.status='CLOSED' then
    if not exists(select 1 from public.pos_sales s where s.id=c.sale_id and s.brand_slug=p_brand_slug and s.idempotency_key=p_key and s.location_id=p_location_id and s.register_id=p_register_id and s.cash_session_id=p_cash_session_id and s.sold_by=p_user_id) then raise exception 'POS_FOOD_CHECKOUT_INVALID'; end if;
  else
    if not exists(select 1 from public.pos_cash_sessions where id=p_cash_session_id and register_id=p_register_id and location_id=p_location_id and brand_slug=p_brand_slug and status='open')
      or not exists(select 1 from public.pos_staff_sessions se join public.pos_staff st on st.id=se.staff_id and st.brand_slug=se.brand_slug
        where se.brand_slug=p_brand_slug and se.host_user_id=p_user_id and se.revoked_at is null and se.expires_at>clock_timestamp() and st.active and st.role in ('ADMIN','MANAGER','CASHIER') and (st.location_id is null or st.location_id=p_location_id)) then raise exception 'POS_FOOD_CHECKOUT_INVALID'; end if;
  end if;
  select array_agg((value->>'food_item_id')::uuid) into ids from jsonb_array_elements(p_items);
  if cardinality(ids)<>(select count(distinct id) from unnest(ids) id) or cardinality(ids)<>(select count(*) from public.pos_food_items where check_id=c.id and brand_slug=p_brand_slug and voided_at is null) then raise exception 'POS_FOOD_CHECKOUT_INVALID'; end if;
  for payload in select value from jsonb_array_elements(p_items) loop
    select * into i from public.pos_food_items where id=(payload->>'food_item_id')::uuid and check_id=c.id and brand_slug=p_brand_slug and voided_at is null for share;
    if not found or i.ticket_id is null or not exists(select 1 from public.pos_food_tickets where id=i.ticket_id and check_id=c.id and brand_slug=p_brand_slug and served_at is not null)
      or i.variant_id is distinct from (payload->>'variant_id')::uuid or i.quantity is distinct from (payload->>'quantity')::numeric or coalesce((payload->>'discount_amount')::numeric,0)<>i.discount_amount then raise exception 'POS_FOOD_CHECKOUT_INVALID'; end if;
    config:=i.configuration;
    if jsonb_typeof(config->'modifiers') is distinct from 'array' then raise exception 'POS_FOOD_CHECKOUT_INVALID'; end if;
    proof:=public.pos_food_modifier_proof_v1(config,i.unit_price,i.tax_rate);
    if config ? 'modifier_snapshot_version' then
      if config->>'modifier_snapshot_version'<>'1' or not exists(select 1 from public.pos_food_events e where e.brand_slug=p_brand_slug and e.check_id=c.id and e.action in ('item_add','item_update') and e.result->>'itemId'=i.id::text and e.result->>'modifierProof'=proof) then raise exception 'POS_FOOD_CHECKOUT_INVALID'; end if;
    elsif config->'modifiers'<>'[]'::jsonb then raise exception 'POS_FOOD_CHECKOUT_INVALID'; end if;
    select coalesce(sum((value->>'price_delta')::numeric),0) into extra from jsonb_array_elements(config->'modifiers');
    if c.status='CLOSED' then
      -- Replay uses the completed immutable snapshot even if the catalog changes later.
      price:=i.unit_price; tax:=i.tax_rate;
    else
      select v.price,p.tax_rate into price,tax from public.pos_product_variants v join public.pos_products p on p.id=v.product_id and p.brand_slug=v.brand_slug
        where v.id=i.variant_id and v.product_id=i.product_id and v.brand_slug=p_brand_slug and v.active and p.active and p.sellable for share of v,p;
      if not found then raise exception 'POS_FOOD_CATALOG_UNAVAILABLE'; end if;
      price:=round(price+extra,2);
    end if;
    subtotal:=round(price*i.quantity,2);
    total:=subtotal+case when c.prices_include_tax then 0 else round(subtotal*tax/100,2) end;
    -- Keep existing base-price-change behavior: V4 validates payment coverage and Food
    -- reconciles its total atomically. This feature freezes extras, not base catalog pricing.
    if price<0 then raise exception 'POS_FOOD_CHECKOUT_INVALID'; end if;
    expected_total:=expected_total+total;
    result:=result||jsonb_build_object(i.id::text,jsonb_build_object('unit_price',price,'proof',proof));
  end loop;
  return result;
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'POS_FOOD_CHECKOUT_INVALID';
end $$;

-- Guarded, exact amendments of installed functions, not copies of the shared engine.
-- Every expected anchor is verified. An unfamiliar deployed body aborts the migration.
create function pg_temp.food_patch(source text,anchor text,replacement text,expected integer default 1)
returns text language plpgsql as $$
begin
  -- pg_get_functiondef preserves the installed body (including Windows CRLF).
  if position(E'\r\n' in source)>0 then
    anchor:=replace(replace(anchor,E'\r\n',E'\n'),E'\n',E'\r\n');
    replacement:=replace(replace(replacement,E'\r\n',E'\n'),E'\n',E'\r\n');
  end if;
  if (length(source)-length(replace(source,anchor,'')))/length(anchor)<>expected then raise exception 'MODIFIERS_EXTENSION_ANCHOR_MISMATCH: %',anchor; end if;
  return replace(source,anchor,replacement);
end $$;
do $patch$
declare definition text; anchor text; original text;
begin
  select pg_get_functiondef('public.pos_food_command_v1(text,uuid,uuid,text,jsonb,uuid)'::regprocedure) into definition;
  definition:=pg_temp.food_patch(definition,'v_items jsonb; v_result jsonb;', 'v_modifiers jsonb; v_extra numeric; v_items jsonb; v_result jsonb;');
  anchor:='v_item.configuration:=jsonb_build_object(''variant'',v_variant.configuration,''attributes'',v_variant.attributes,''modifiers'',''[]''::jsonb);';
  definition:=pg_temp.food_patch(definition,anchor,$code$
      v_modifiers:=public.pos_food_resolve_modifiers_v1(p_brand_slug,v_variant.product_id,coalesce(p_payload->'modifierOptionIds','[]'::jsonb));
      select coalesce(sum((value->>'price_delta')::numeric),0) into v_extra from jsonb_array_elements(v_modifiers);
      v_item.unit_price:=round(v_variant.price+v_extra,2);
      if v_item.unit_price<0 then raise exception 'POS_FOOD_MODIFIERS_INVALID'; end if;
      v_item.configuration:=jsonb_build_object('variant',v_variant.configuration,'attributes',v_variant.attributes,'modifiers',v_modifiers,'modifier_snapshot_version',1);
  $code$);
  anchor:='    v_subtotal:=round(v_item.unit_price*v_quantity,2);';
  definition:=pg_temp.food_patch(definition,anchor,$code$
    if p_action='item_update' and p_payload ? 'modifierOptionIds' then
      v_modifiers:=public.pos_food_resolve_modifiers_v1(p_brand_slug,v_item.product_id,p_payload->'modifierOptionIds');
      select coalesce(sum((value->>'price_delta')::numeric),0) into v_extra from jsonb_array_elements(v_modifiers);
      select price into v_extra from (select price+v_extra as price from public.pos_product_variants where id=v_item.variant_id and brand_slug=p_brand_slug) priced;
      v_item.unit_price:=round(v_extra,2);
      if v_item.unit_price<0 then raise exception 'POS_FOOD_MODIFIERS_INVALID'; end if;
      v_item.configuration:=v_item.configuration||jsonb_build_object('modifiers',v_modifiers,'modifier_snapshot_version',1);
    end if;
    v_subtotal:=round(v_item.unit_price*v_quantity,2);
  $code$);
  definition:=pg_temp.food_patch(definition,'update public.pos_food_items set quantity=v_quantity,subtotal=v_subtotal,','update public.pos_food_items set configuration=v_item.configuration,unit_price=v_item.unit_price,quantity=v_quantity,subtotal=v_subtotal,');
  definition:=pg_temp.food_patch(definition,'v_result:=jsonb_build_object(''checkId'',v_check.id,''itemId'',v_id);',
    'v_result:=jsonb_build_object(''checkId'',v_check.id,''itemId'',v_id,''modifierProof'',public.pos_food_modifier_proof_v1(v_item.configuration,v_item.unit_price,v_item.tax_rate));');
  execute definition;
  select pg_get_functiondef('public.pos_food_snapshot_v1(text,uuid,uuid,uuid)'::regprocedure) into definition;
  definition:=pg_temp.food_patch(definition,'v.price,p.tax_rate,','v.price,p.tax_rate,public.pos_food_product_modifiers_v1(p_brand_slug,p.id) modifier_groups,');
  execute definition;

  select pg_get_functiondef('public.pos_complete_sale_v4(text,uuid,uuid,uuid,uuid,jsonb,jsonb,text,uuid,uuid,uuid,uuid)'::regprocedure) into original;
  definition:=pg_temp.food_patch(original,'  v_canonical_items jsonb;', '  v_food_context jsonb; -- Food-only validated prices; NULL for unchanged Retail.
  v_canonical_items jsonb;');
  anchor:=E'  SELECT COALESCE(\n    jsonb_agg(canonical_item ORDER BY canonical_item::text),';
  definition:=pg_temp.food_patch(definition,anchor,$code$
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) value WHERE value ? 'food_item_id') THEN
    v_food_context:=public.pos_food_checkout_context_v1(p_brand_slug,p_location_id,p_register_id,p_cash_session_id,p_user_id,p_idempotency_key,p_items);
  END IF;
  SELECT COALESCE(
    jsonb_agg(canonical_item ORDER BY canonical_item::text),$code$);
  definition:=pg_temp.food_patch(definition,'    ) AS canonical_item', $code$    ) || CASE WHEN v_food_context IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(
      'food_item_id',item.value->'food_item_id','food_proof',v_food_context->(item.value->>'food_item_id')->>'proof') END AS canonical_item$code$);
  anchor:=E'    v_line_subtotal :=\n      round(v_variant.price * v_quantity, 2);';
  definition:=pg_temp.food_patch(definition,anchor,E'    IF v_food_context IS NOT NULL THEN\n      v_variant.price:=(v_food_context->(v_item->>''food_item_id'')->>''unit_price'')::numeric;\n    END IF;\n'||anchor);
  anchor:=E'      v_line_subtotal :=\n        round(v_variant.price * v_quantity, 2);';
  definition:=pg_temp.food_patch(definition,anchor,E'      IF v_food_context IS NOT NULL THEN\n        v_variant.price:=(v_food_context->(v_item->>''food_item_id'')->>''unit_price'')::numeric;\n      END IF;\n'||anchor);
  execute definition;
end $patch$;

revoke all on function public.pos_food_product_modifiers_v1(text,uuid),public.pos_food_resolve_modifiers_v1(text,uuid,jsonb),public.pos_food_modifiers_catalog_v1(text,uuid,uuid),public.pos_food_modifiers_admin_v1(text,uuid,uuid,text,jsonb),public.pos_food_checkout_context_v1(text,uuid,uuid,uuid,uuid,uuid,jsonb),public.pos_food_modifier_proof_v1(jsonb,numeric,numeric),public.pos_food_modifiers_immutable_v1() from public,anon,authenticated;
grant execute on function public.pos_food_product_modifiers_v1(text,uuid),public.pos_food_modifiers_catalog_v1(text,uuid,uuid),public.pos_food_modifiers_admin_v1(text,uuid,uuid,text,jsonb) to service_role;
commit;
