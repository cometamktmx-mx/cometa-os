begin;
create table public.pos_customer_factory_benefits (
 customer_id uuid primary key references public.pos_customers(id),brand_slug text not null,enabled boolean not null default false,
 updated_by uuid not null,staff_id uuid not null references public.pos_staff(id),updated_at timestamptz not null default clock_timestamp()
);
create table public.pos_customer_factory_benefit_events (
 id uuid primary key default gen_random_uuid(),customer_id uuid not null references public.pos_customers(id),brand_slug text not null,
 previous_value boolean not null,new_value boolean not null,host_user_id uuid not null,staff_id uuid not null references public.pos_staff(id),created_at timestamptz not null default clock_timestamp()
);
alter table public.pos_customer_factory_benefits enable row level security;
alter table public.pos_customer_factory_benefit_events enable row level security;
revoke all on public.pos_customer_factory_benefits,public.pos_customer_factory_benefit_events from public,anon,authenticated;
grant all on public.pos_customer_factory_benefits,public.pos_customer_factory_benefit_events to service_role;
alter table public.pos_retail_rules add column customer_benefit_exclusions jsonb not null default '[]' check(jsonb_typeof(customer_benefit_exclusions)='array');
alter table public.pos_sales add column retail_pricing_snapshot jsonb;

create function public.pos_retail_customer_save_v1(p_brand text,p_actor uuid,p_session uuid,p_customer uuid,p_fields jsonb,p_benefit boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare st pos_staff%rowtype;c pos_customers%rowtype;previous boolean;brand_key text;
begin
 perform pos_require_retail_profile_v1(p_brand);
 select s.* into st from pos_staff s join pos_staff_sessions sess on sess.staff_id=s.id and sess.brand_slug=s.brand_slug
 where sess.id=p_session and sess.brand_slug=p_brand and sess.host_user_id=p_actor and sess.revoked_at is null and sess.expires_at>clock_timestamp()
 and sess.last_human_at>clock_timestamp()-interval '3 minutes' and s.active
 and (s.retail_permissions @> array['SETTINGS'] or (s.retail_permissions is null and s.role='ADMIN'));
 if not found then raise exception 'POS_STAFF_PERMISSION_REQUIRED';end if;
 if p_benefit is null or jsonb_typeof(p_fields) is distinct from 'object' then raise exception 'POS_VALIDATION_ERROR';end if;
 if p_customer is null then
  select id::text into brand_key from brands where slug=p_brand;
  if length(btrim(coalesce(p_fields->>'first_name',''))) not between 1 and 100 then raise exception 'POS_VALIDATION_ERROR';end if;
  insert into pos_customers(brand_id,brand_slug,first_name,last_name,phone,email,birthday,marketing_consent,wallet_consent,notes,tags,active,created_by)
  values(brand_key,p_brand,p_fields->>'first_name',p_fields->>'last_name',p_fields->>'phone',p_fields->>'email',nullif(p_fields->>'birthday','')::date,
  coalesce((p_fields->>'marketing_consent')::boolean,false),coalesce((p_fields->>'wallet_consent')::boolean,false),p_fields->>'notes',coalesce(p_fields->'tags','[]'),true,p_actor) returning * into c;
 else
  select * into c from pos_customers where id=p_customer and brand_slug=p_brand and active for update;
  if not found then raise exception 'POS_CUSTOMER_INVALID';end if;
  update pos_customers set first_name=case when p_fields?'first_name' then p_fields->>'first_name' else first_name end,
   last_name=case when p_fields?'last_name' then p_fields->>'last_name' else last_name end,
   phone=case when p_fields?'phone' then p_fields->>'phone' else phone end,email=case when p_fields?'email' then p_fields->>'email' else email end,
   notes=case when p_fields?'notes' then p_fields->>'notes' else notes end where id=c.id returning * into c;
 end if;
 if nullif(btrim(c.first_name),'') is null or (nullif(btrim(c.phone),'') is null and nullif(btrim(c.email),'') is null) then raise exception 'POS_CUSTOMER_CONTACT_REQUIRED';end if;
 select enabled into previous from pos_customer_factory_benefits where customer_id=c.id and brand_slug=p_brand for update;
 previous:=coalesce(previous,false);
 if previous is distinct from p_benefit then
  insert into pos_customer_factory_benefits(customer_id,brand_slug,enabled,updated_by,staff_id) values(c.id,p_brand,p_benefit,p_actor,st.id)
  on conflict(customer_id) do update set enabled=excluded.enabled,updated_by=excluded.updated_by,staff_id=excluded.staff_id,updated_at=clock_timestamp();
  insert into pos_customer_factory_benefit_events(customer_id,brand_slug,previous_value,new_value,host_user_id,staff_id) values(c.id,p_brand,previous,p_benefit,p_actor,st.id);
 end if;
 return to_jsonb(c)||jsonb_build_object('factory_price_benefit',p_benefit);
end $$;
revoke all on function public.pos_retail_customer_save_v1(text,uuid,uuid,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.pos_retail_customer_save_v1(text,uuid,uuid,uuid,jsonb,boolean) to service_role;

-- Move the current quote implementation to a customer-aware entry point. The
-- compatibility wrapper below preserves every existing three-argument caller.
do $patch$
declare definition text; original text; needle text;
begin
 select pg_get_functiondef('public.pos_retail_quote_v1(text,uuid,jsonb)'::regprocedure) into original;
 definition:=replace(original,'public.pos_retail_quote_v1(','public.pos_retail_quote_customer_v1(');
 definition:=replace(definition,'p_items jsonb)','p_items jsonb, p_customer uuid)');
 definition:=replace(definition,'declare rules','declare benefit boolean:=false; rules');
 needle:=' select * into loc from pos_locations';
 if position(needle in definition)=0 then raise exception 'CUSTOMER_QUOTE_LOCATION_ANCHOR';end if;
 definition:=replace(definition,needle,$code$
 perform pos_require_retail_profile_v1(p_brand);
 if p_customer is not null then
  perform 1 from pos_customers where id=p_customer and brand_slug=p_brand and active for share;
  if not found then raise exception 'POS_CUSTOMER_INVALID';end if;
  select enabled into benefit from pos_customer_factory_benefits where customer_id=p_customer and brand_slug=p_brand;
  benefit:=coalesce(benefit,false);
 end if;
 select * into loc from pos_locations$code$);
 needle:='coalesce(grouped,0)>=rules.minimum_pieces';
 if position(needle in definition)=0 then raise exception 'CUSTOMER_QUOTE_THRESHOLD_ANCHOR';end if;
 definition:=replace(definition,needle,'(coalesce(grouped,0)>=rules.minimum_pieces or (benefit and not rules.customer_benefit_exclusions ? v.product_id::text))');
 needle:='  subtotal:=round(unit_price*qty,2);';
 if position(needle in definition)=0 then raise exception 'CUSTOMER_QUOTE_TRACE_ANCHOR';end if;
 -- Trace is appended only for opted-in customers, leaving ordinary saved quotes equal.
 definition:=replace(definition,'  total:=total+amount;',E'  if benefit then lines:=jsonb_set(lines,array[(jsonb_array_length(lines)-1)::text],(lines->(jsonb_array_length(lines)-1))||jsonb_build_object(''factory_source'',case when unit_price<v.price and not rules.customer_benefit_exclusions ? v.product_id::text then ''customer'' when unit_price<v.price then ''volume'' else ''regular'' end));end if;\n  total:=total+amount;');
 definition:=replace(definition,$old$'wholesale_enabled',coalesce(rules.wholesale_enabled,false));$old$,$new$'wholesale_enabled',coalesce(rules.wholesale_enabled,false))||case when benefit then jsonb_build_object('customer_factory_benefit',true,'pricing_customer_id',p_customer) else '{}'::jsonb end;$new$);
 execute definition;
end $patch$;
revoke all on function public.pos_retail_quote_customer_v1(text,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.pos_retail_quote_customer_v1(text,uuid,jsonb,uuid) to service_role;
create or replace function public.pos_retail_quote_v1(p_brand text,p_location uuid,p_items jsonb) returns jsonb
language sql security definer set search_path=public as $$select pos_retail_quote_customer_v1(p_brand,p_location,p_items,null)$$;

create function public.pos_retail_order_quote_customer_v1(p_brand text,p_location uuid,p_items jsonb,p_allow_empty boolean,p_customer uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if jsonb_typeof(p_items)='array' and jsonb_array_length(p_items)>0 then return pos_retail_quote_customer_v1(p_brand,p_location,p_items,p_customer);end if;
 return pos_retail_order_quote_v1(p_brand,p_location,p_items,p_allow_empty);
end $$;
revoke all on function public.pos_retail_order_quote_customer_v1(text,uuid,jsonb,boolean,uuid) from public,anon,authenticated;
grant execute on function public.pos_retail_order_quote_customer_v1(text,uuid,jsonb,boolean,uuid) to service_role;

do $patch$
declare definition text;needle text;
begin
 select pg_get_functiondef('public.pos_complete_retail_sale_v1(text,uuid,uuid,uuid,uuid,jsonb,jsonb,text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb)'::regprocedure) into definition;
 needle:='q:=pos_retail_quote_v1(p_brand_slug,p_location_id,p_items);';
 if position(needle in definition)=0 then raise exception 'CUSTOMER_SALE_QUOTE_ANCHOR';end if;
 definition:=replace(definition,needle,'q:=pos_retail_quote_customer_v1(p_brand_slug,p_location_id,p_items,p_customer_id);');
 needle:='insert into pos_retail_sale_requests values(p_brand_slug,p_idempotency_key,payload,r);';
 if position(needle in definition)=0 then raise exception 'CUSTOMER_SALE_SNAPSHOT_ANCHOR';end if;
 definition:=replace(definition,needle,$code$update pos_sales set retail_pricing_snapshot=q where id=(r->>'id')::uuid and brand_slug=p_brand_slug;
 $code$||needle);execute definition;
 select pg_get_functiondef('public.pos_retail_order_action_v1(text,uuid,uuid,uuid,text,uuid,jsonb)'::regprocedure) into definition;
 needle:='q:=pos_retail_order_quote_v1(p_brand,location,p_body->''items'',case when o.state=''active'' then o.open_box else rules.open_box end);';
 if position(needle in definition)=0 then raise exception 'CUSTOMER_ORDER_SAVE_ANCHOR';end if;
 definition:=replace(definition,needle,'q:=pos_retail_order_quote_customer_v1(p_brand,location,p_body->''items'',case when o.state=''active'' then o.open_box else rules.open_box end,customer);');
 needle:='q:=pos_retail_order_quote_v1(p_brand,o.location_id,o.items,case when o.state=''active'' then o.open_box else rules.open_box end);';
 if position(needle in definition)=0 then raise exception 'CUSTOMER_ORDER_PAY_ANCHOR';end if;
 definition:=replace(definition,needle,'q:=pos_retail_order_quote_customer_v1(p_brand,o.location_id,o.items,case when o.state=''active'' then o.open_box else rules.open_box end,o.customer_id);');execute definition;
end $patch$;
-- Exact authorized product identity. This excludes only the new customer
-- threshold waiver; its existing catalog and volume configuration are untouched.
do $seed$ begin
 if exists(select 1 from brands where slug='magenta-fitwear') then
  if not exists(select 1 from pos_products p join pos_product_variants v on v.product_id=p.id and v.brand_slug=p.brand_slug where p.id='22873a43-aee6-4313-b110-38262c80b907' and p.brand_slug='magenta-fitwear' and p.name='Banditas Mayoreo' and v.price=10 and v.active) then raise exception 'MAYOREO_CATALOG_CHANGED';end if;
  update pos_retail_rules set customer_benefit_exclusions=customer_benefit_exclusions||'"22873a43-aee6-4313-b110-38262c80b907"'::jsonb where brand_slug='magenta-fitwear';
 end if;
end $seed$;
commit;
