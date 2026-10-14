begin;
-- LOCAL/PENDING PUBLICATION. Service-only; API additionally checks subscription,
-- entitlements, operator/device and settings + domain mutation permissions.
create table public.pos_import_runs (
 id uuid primary key default gen_random_uuid(), brand_slug text not null,
 actor uuid not null, kind text not null check(kind in ('products','inventory','customers')),
 location_id uuid, file_hash text not null, request_key uuid not null,
 status text not null check(status in ('done','reverted')), changes jsonb not null,
 after_token text not null, payload_token text not null, file_name text, row_count integer not null,
 created_at timestamptz not null default now(), reverted_at timestamptz,
 unique(brand_slug,request_key)
);
create unique index pos_import_active_file on public.pos_import_runs(brand_slug,kind,(coalesce(location_id::text,'')),file_hash) where status='done';
create table public.pos_import_customer_codes (
 brand_slug text not null, code text not null, customer_id uuid not null,
 primary key(brand_slug,code)
);
alter table public.pos_import_runs enable row level security;
alter table public.pos_import_customer_codes enable row level security;
revoke all on public.pos_import_runs,public.pos_import_customer_codes from public,anon,authenticated,service_role;
grant select on public.pos_import_runs to service_role;

-- Conservative rollback barrier: core records and every direct public FK
-- dependent, including sales, reservations and loyalty. xmin detects later
-- updates even when an operator restores the same values. No extra triggers.
create function public.pos_import_scope_v1() returns table(rel oid, predicate text)
language sql stable set search_path=public,pg_catalog as $$
 with core as (select unnest(array['public.pos_products'::regclass,'public.pos_product_variants'::regclass,
 'public.pos_inventory'::regclass,'public.pos_customers'::regclass])::oid id),
 scope as (
 select id rel, 't.brand_slug = $1' predicate from core
 union all
 select c.conrelid,format('exists(select 1 from %s p where p.brand_slug=$1 and p.%I=t.%I)',c.confrelid::regclass,pa.attname,ca.attname)
 from pg_constraint c join core on core.id=c.confrelid
 join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace
 join pg_attribute pa on pa.attrelid=c.confrelid and pa.attnum=c.confkey[1]
 join pg_attribute ca on ca.attrelid=c.conrelid and ca.attnum=c.conkey[1]
 where c.contype='f' and cardinality(c.conkey)=1 and n.nspname='public'
 union all select 'public.pos_import_customer_codes'::regclass::oid,'t.brand_slug=$1'
 ) select rel,string_agg('('||predicate||')',' or ' order by predicate) from scope group by rel
$$;
create function public.pos_import_token_v1(p_brand text) returns text
language plpgsql security definer set search_path=public,pg_catalog as $$
declare s record; part text; result text:='';
begin
 for s in select * from public.pos_import_scope_v1() order by rel loop
  execute format('select coalesce(string_agg(md5(to_jsonb(t)::text||t.xmin::text),'''' order by md5(to_jsonb(t)::text||t.xmin::text)),'''') from %s t where %s',s.rel::regclass,s.predicate) into part using p_brand;
  result:=result||s.rel::text||':'||md5(part)||';';
 end loop;
 return md5(result);
end $$;

create function public.pos_import_v1(p_brand text,p_actor uuid,p_kind text,p_location uuid,p_mode text,
 p_rows jsonb default '[]',p_request uuid default null,p_hash text default null,p_expected text default null,p_run uuid default null,p_file_name text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare b public.brands%rowtype; run public.pos_import_runs%rowtype; r jsonb; v jsonb; ids uuid[];
 outrows jsonb:='[]'; changes jsonb:='[]'; audit_changes jsonb:='[]'; errs jsonb; item jsonb; old jsonb; fresh jsonb;
 target uuid; product uuid; inv uuid; token text; is_admin boolean; role_name text; s record; tbl text;
 v_code text; decision text; new_run uuid:=gen_random_uuid(); seen uuid[]:='{}';
begin
 perform set_config('lock_timeout','5s',true);
 if p_kind is null or p_mode is null or p_kind not in ('products','inventory','customers') or p_mode not in ('preview','apply','revert') then raise exception 'POS_VALIDATION_ERROR'; end if;
 select role='admin' into is_admin from public.user_profiles where user_id=p_actor and status='active' for share;
 if not found then raise exception 'POS_PERMISSION_DENIED' using errcode='42501'; end if;
 select * into b from public.brands where slug=p_brand and status='active';
 if not found then raise exception 'POS_PERMISSION_DENIED' using errcode='42501'; end if;
 select access_role into role_name from public.user_brand_access where user_id=p_actor and brand_slug=b.slug and status='active' for share;
 if not is_admin and coalesce(role_name,'') not in ('owner','admin') then raise exception 'POS_PERMISSION_DENIED' using errcode='42501'; end if;
 if not exists(select 1 from public.pos_business_profiles where brand_slug=b.slug and profile_code not in ('restaurant','coffee_shop')) then raise exception 'POS_VALIDATION_ERROR'; end if;
 if p_kind='inventory' and not exists(select 1 from public.pos_locations where id=p_location and brand_slug=b.slug and brand_id=b.id::text and active) then raise exception 'POS_LOCATION_NOT_FOUND'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>500 then raise exception 'POS_VALIDATION_ERROR'; end if;
 -- Lock the exact same scope for preview/apply/revert. Prevent concurrent POS
 -- writes from slipping between duplicate detection, snapshot and mutation.
 perform pg_advisory_xact_lock(hashtextextended('pos-import:'||b.slug,0));
 for s in select * from public.pos_import_scope_v1() order by rel loop
  execute format('lock table %s in share row exclusive mode',s.rel::regclass);
 end loop;
 token:=public.pos_import_token_v1(b.slug);
 if p_mode='revert' then
  select * into run from public.pos_import_runs where id=p_run and brand_slug=b.slug and kind=p_kind for update;
  if not found then raise exception 'POS_NOT_FOUND'; end if;
  if run.location_id is distinct from p_location then raise exception 'POS_PERMISSION_DENIED' using errcode='42501'; end if;
  if run.status='reverted' then return jsonb_build_object('id',run.id,'status','reverted'); end if;
  if run.after_token<>token then raise exception 'POS_IMPORT_CONFLICT' using errcode='40001'; end if;
  for item in select value from jsonb_array_elements(run.changes) with ordinality e(value,n) order by n desc loop
   tbl:=item->>'table'; target:=(item->>'id')::uuid; old:=item->'before';
   if tbl='pos_import_customer_codes' then
    delete from public.pos_import_customer_codes where brand_slug=b.slug and code=item->>'code';
   elsif old='null'::jsonb then
    if tbl not in ('pos_products','pos_product_variants','pos_customers','pos_inventory') then raise exception 'POS_VALIDATION_ERROR'; end if;
    if tbl='pos_inventory' then
     perform public.pos_adjust_inventory(b.slug,run.location_id,(item->>'variant')::uuid,0,'adjustment','Reversión importación '||run.id,p_actor,true);
    end if;
    execute format('delete from public.%I where id=$1 and brand_slug=$2',tbl) using target,b.slug;
   elsif tbl='pos_products' then
    update public.pos_products set name=old->>'name',tax_rate=(old->>'tax_rate')::numeric where id=target and brand_slug=b.slug;
   elsif tbl='pos_product_variants' then
    update public.pos_product_variants set price=(old->>'price')::numeric,cost=(old->>'cost')::numeric where id=target and brand_slug=b.slug;
   elsif tbl='pos_customers' then
    update public.pos_customers set first_name=old->>'first_name',last_name=old->>'last_name',phone=old->>'phone',email=old->>'email',notes=old->>'notes' where id=target and brand_slug=b.slug;
   elsif tbl='pos_inventory' then
    perform public.pos_adjust_inventory(b.slug,run.location_id,(old->>'variant_id')::uuid,(old->>'quantity')::numeric,'adjustment','Reversión importación '||run.id,p_actor,true);
   end if;
  end loop;
  update public.pos_import_runs set status='reverted',reverted_at=now() where id=run.id;
  return jsonb_build_object('id',run.id,'status','reverted');
 end if;
 if p_mode='apply' then
  if p_request is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or jsonb_array_length(p_rows)=0 then raise exception 'POS_VALIDATION_ERROR'; end if;
  select * into run from public.pos_import_runs where brand_slug=b.slug and request_key=p_request;
  if found then
   if run.file_hash<>p_hash or run.kind<>p_kind or run.location_id is distinct from p_location or run.payload_token<>md5(p_rows::text) then raise exception 'POS_IMPORT_CONFLICT'; end if;
   return jsonb_build_object('id',run.id,'status',run.status,'replayed',true);
  end if;
  if exists(select 1 from public.pos_import_runs where brand_slug=b.slug and kind=p_kind and location_id is not distinct from p_location and file_hash=p_hash and status='done') then raise exception 'POS_IMPORT_ALREADY_APPLIED'; end if;
  if p_expected is distinct from token then raise exception 'POS_IMPORT_CONFLICT' using errcode='40001'; end if;
 end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  v:=r->'values'; v_code:=nullif(lower(btrim(v->>'code')),''); decision:=r->>'decision'; errs:=coalesce(r->'errors','[]'); ids:='{}'; old:=null; target:=null; product:=null;
  if decision='skip' and p_mode='apply' then continue; end if;
  if jsonb_typeof(v)<>'object' then raise exception 'POS_VALIDATION_ERROR'; end if;
  if p_kind='customers' then
   select array_agg(distinct c.id) into ids from public.pos_customers c where c.brand_slug=b.slug and c.brand_id=b.id::text and (
    (nullif(v->>'phone','') is not null and regexp_replace(c.phone,'[^0-9]','','g')=regexp_replace(v->>'phone','[^0-9]','','g')) or
    (nullif(v->>'email','') is not null and lower(btrim(c.email))=lower(btrim(v->>'email'))) or
    exists(select 1 from public.pos_import_customer_codes m where m.brand_slug=b.slug and m.code=v_code and m.customer_id=c.id));
  else
   select array_agg(distinct pv.id) into ids from public.pos_product_variants pv join public.pos_products p on p.id=pv.product_id
    where pv.brand_slug=b.slug and p.brand_slug=b.slug and pv.brand_id=b.id::text and p.brand_id=b.id::text and (lower(btrim(pv.sku))=v_code or lower(btrim(pv.barcode))=v_code or lower(btrim(p.product_code))=v_code);
   if v_code is null then errs:=errs||jsonb_build_array('Código requerido.'); end if;
  end if;
  ids:=coalesce(ids,'{}');
  if cardinality(ids)>1 then errs:=errs||jsonb_build_array('Varias coincidencias en la marca; resuelve la ambigüedad antes de importar.'); end if;
  if cardinality(ids)=1 then target:=ids[1]; end if;
  if p_kind='customers' and target is not null and exists(select 1 from public.pos_customers where id=target and not active) then errs:=errs||jsonb_build_array('Cliente inactivo: revisar desde Clientes antes de importar.'); end if;
  if p_kind in ('products','inventory') and target is not null and exists(select 1 from public.pos_product_variants pv join public.pos_products p on p.id=pv.product_id where pv.id=target and (not pv.active or not p.active or p.product_type<>'physical' or p.inventory_mode<>'direct')) then errs:=errs||jsonb_build_array('Producto inactivo o con inventario especial: revisar desde Productos.'); end if;
  if p_kind='products' and target is null and exists(select 1 from public.pos_products where brand_slug=b.slug and lower(btrim(product_code))=v_code) then errs:=errs||jsonb_build_array('El código existe pero no tiene una variante importable.'); end if;
  if target=any(seen) then errs:=errs||jsonb_build_array('Dos filas apuntan al mismo registro.'); end if;
  if target is not null then seen:=array_append(seen,target); end if;
  if p_kind='inventory' and target is null then errs:=errs||jsonb_build_array('Producto no encontrado. Importa primero Productos.'); end if;
  if p_kind='products' and target is not null and exists(select 1 from public.pos_product_variants pv join public.pos_products p on p.id=pv.product_id where pv.id=target and (p.has_variants or p.product_type<>'physical' or p.inventory_mode<>'direct')) then errs:=errs||jsonb_build_array('Producto con variantes o reglas especiales: editar desde Productos.'); end if;
  if target is null and p_kind='products' and (nullif(v->>'name','') is null or not(v?'price') or not(v?'cost')) then errs:=errs||jsonb_build_array('Para crear se requieren nombre, precio y costo explícitos.'); end if;
  if target is null and p_kind='products' and coalesce(v->>'tax_rate',v->>'creation_tax_rate') is null then errs:=errs||jsonb_build_array('Define el impuesto para productos nuevos.'); end if;
  if coalesce((v->>'tax_rate')::numeric,(v->>'creation_tax_rate')::numeric,0) not between 0 and 100 then errs:=errs||jsonb_build_array('Tasa de impuesto inválida.'); end if;
  if target is null and p_kind='customers' and (nullif(v->>'first_name','') is null or (nullif(v->>'phone','') is null and nullif(v->>'email','') is null)) then errs:=errs||jsonb_build_array('Para crear se requieren nombre y teléfono o correo.'); end if;
  if p_kind='inventory' and (not(v?'quantity') or (v->>'quantity')::numeric<0) then errs:=errs||jsonb_build_array('Existencia inválida.'); end if;
  if p_kind='inventory' and exists(select 1 from public.pos_inventory where brand_slug=b.slug and variant_id=target and location_id=p_location and reserved_quantity>(v->>'quantity')::numeric) then errs:=errs||jsonb_build_array('La existencia no puede ser menor que las unidades reservadas.'); end if;
  if (v?'price' and ((v->>'price')::numeric<0 or round((v->>'price')::numeric,2)<>(v->>'price')::numeric)) or (v?'cost' and (v->>'cost')::numeric<0) then errs:=errs||jsonb_build_array('Precio o costo inválido.'); end if;
  if p_mode='preview' then
   outrows:=outrows||jsonb_build_array(r||jsonb_build_object('matches',to_jsonb(ids),'errors',errs,'inventoryExists',exists(select 1 from public.pos_inventory where variant_id=target and location_id=p_location and brand_slug=b.slug))); continue;
  end if;
  if jsonb_array_length(errs)>0 or decision is null or decision not in ('create','update') then raise exception 'POS_VALIDATION_ERROR'; end if;
  if p_kind<>'inventory' and ((decision='create' and target is not null) or (decision='update' and target is null)) then raise exception 'POS_IMPORT_CONFLICT'; end if;
  if p_kind='customers' then
   if target is null then
    insert into public.pos_customers(brand_id,brand_slug,first_name,last_name,phone,email,notes,created_by)
    values(b.id::text,b.slug,v->>'first_name',v->>'last_name',v->>'phone',v->>'email',v->>'notes',p_actor) returning id into target;
   else
    select to_jsonb(c) into old from public.pos_customers c where id=target;
    update public.pos_customers set first_name=coalesce(v->>'first_name',first_name),last_name=coalesce(v->>'last_name',last_name),phone=coalesce(v->>'phone',phone),email=coalesce(v->>'email',email),notes=coalesce(v->>'notes',notes) where id=target;
   end if;
   changes:=changes||jsonb_build_array(jsonb_build_object('table','pos_customers','id',target,'before',old));
   if v_code is not null and not exists(select 1 from public.pos_import_customer_codes where brand_slug=b.slug and pos_import_customer_codes.code=v_code) then
    insert into public.pos_import_customer_codes values(b.slug,v_code,target);
    changes:=changes||jsonb_build_array(jsonb_build_object('table','pos_import_customer_codes','id',target,'code',v_code,'before',null));
   end if;
  elsif p_kind='products' then
   if target is null then
    -- A single base SKU required by POS, never inferred sizes/colors/photos.
    insert into public.pos_products(brand_id,brand_slug,name,product_code,tax_rate,created_by)
    values(b.id::text,b.slug,v->>'name',v->>'code',coalesce((v->>'tax_rate')::numeric,(v->>'creation_tax_rate')::numeric),p_actor) returning id into product;
    changes:=changes||jsonb_build_array(jsonb_build_object('table','pos_products','id',product,'before',null));
    insert into public.pos_product_variants(brand_id,brand_slug,product_id,sku,name,price,cost,is_default,variant_signature,created_by)
    values(b.id::text,b.slug,product,v->>'code','Única',(v->>'price')::numeric,(v->>'cost')::numeric,true,'default',p_actor) returning id into target;
   else
    select product_id,to_jsonb(pv) into product,old from public.pos_product_variants pv where id=target;
    if v?'name' or v?'tax_rate' then
     select to_jsonb(p) into fresh from public.pos_products p where id=product;
     changes:=changes||jsonb_build_array(jsonb_build_object('table','pos_products','id',product,'before',fresh));
     update public.pos_products set name=coalesce(v->>'name',name),tax_rate=coalesce((v->>'tax_rate')::numeric,tax_rate) where id=product;
    end if;
    update public.pos_product_variants set price=coalesce((v->>'price')::numeric,price),cost=coalesce((v->>'cost')::numeric,cost) where id=target;
   end if;
   changes:=changes||jsonb_build_array(jsonb_build_object('table','pos_product_variants','id',target,'before',old));
  else
   select id,to_jsonb(i) into inv,old from public.pos_inventory i where variant_id=target and location_id=p_location and brand_slug=b.slug;
   if (decision='create' and inv is not null) or (decision='update' and inv is null) then raise exception 'POS_IMPORT_CONFLICT'; end if;
   if coalesce((old->>'reserved_quantity')::numeric,0)>(v->>'quantity')::numeric then raise exception 'POS_INVENTORY_INSUFFICIENT'; end if;
   select id into inv from public.pos_adjust_inventory(b.slug,p_location,target,(v->>'quantity')::numeric,'adjustment','Importación ELEVENTA '||new_run,p_actor,true);
   changes:=changes||jsonb_build_array(jsonb_build_object('table','pos_inventory','id',inv,'variant',target,'before',old));
  end if;
 end loop;
 if p_mode='preview' then return jsonb_build_object('rows',outrows,'token',token); end if;
 if jsonb_array_length(changes)=0 then raise exception 'POS_VALIDATION_ERROR'; end if;
 for item in select value from jsonb_array_elements(changes) loop
  if item->>'table'='pos_import_customer_codes' then
   select to_jsonb(c) into fresh from public.pos_import_customer_codes c where brand_slug=b.slug and c.code=item->>'code';
  else
   execute format('select to_jsonb(t) from public.%I t where id=$1 and brand_slug=$2',item->>'table') into fresh using (item->>'id')::uuid,b.slug;
  end if;
  audit_changes:=audit_changes||jsonb_build_array(item||jsonb_build_object('after',fresh));
 end loop;
 insert into public.pos_import_runs(id,brand_slug,actor,kind,location_id,file_hash,request_key,status,changes,after_token,payload_token,file_name,row_count)
 values(new_run,b.slug,p_actor,p_kind,p_location,p_hash,p_request,'done',audit_changes,public.pos_import_token_v1(b.slug),md5(p_rows::text),left(p_file_name,255),(select count(*) from jsonb_array_elements(p_rows) e where e->>'decision'<>'skip'));
 return jsonb_build_object('id',new_run,'status','done');
end $$;
revoke all on function public.pos_import_scope_v1(),public.pos_import_token_v1(text),public.pos_import_v1(text,uuid,text,uuid,text,jsonb,uuid,text,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.pos_import_v1(text,uuid,text,uuid,text,jsonb,uuid,text,text,uuid,text) to service_role;
commit;
