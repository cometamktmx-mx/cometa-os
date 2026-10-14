begin;
-- Retry receipt for the existing canonical product creator. No channel stock.
create table public.pos_product_create_receipts (
  brand_slug text not null references public.brands(slug),
  request_id uuid not null,
  actor uuid not null references auth.users(id),
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(brand_slug,request_id)
);
alter table public.pos_product_create_receipts enable row level security;
revoke all on public.pos_product_create_receipts from public,anon,authenticated,service_role;

create function public.pos_create_product_delivery_v1(p_payload jsonb,p_request uuid,p_channels jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_brand text:=p_payload->>'p_brand_slug'; v_actor uuid:=(p_payload->>'p_user_id')::uuid;
 v_receipt public.pos_product_create_receipts%rowtype; v_result jsonb; v_channels jsonb;
 v_document jsonb; v_role text; v_admin boolean; v_id uuid;
begin
 if p_request is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'POS_VALIDATION_ERROR'; end if;
 select role='admin' into v_admin from public.user_profiles where user_id=v_actor and status='active' for share;
 if not found then raise exception 'POS_CHANNELS_DENIED' using errcode='42501'; end if;
 if not exists(select 1 from public.brands where slug=v_brand and id::text=p_payload->>'p_brand_id' and status='active') then
   raise exception 'POS_CHANNELS_DENIED' using errcode='42501';
 end if;
 if not v_admin then
   select access_role into v_role from public.user_brand_access where user_id=v_actor and brand_slug=v_brand and status='active' for share;
   if v_role is null or v_role not in ('owner','admin','manager','inventory') then raise exception 'POS_CHANNELS_DENIED' using errcode='42501'; end if;
 end if;
 if p_channels is not null and (
   jsonb_typeof(p_channels) is distinct from 'object' or
   jsonb_typeof(p_channels->'physicalRequested') is distinct from 'boolean' or
   jsonb_typeof(p_channels->'onlineRequested') is distinct from 'boolean' or
   exists(select 1 from jsonb_object_keys(p_channels) k where k not in ('physicalRequested','onlineRequested'))
 ) then raise exception 'POS_VALIDATION_ERROR'; end if;
 v_document:=jsonb_build_object('payload',p_payload,'channels',p_channels);
 perform pg_advisory_xact_lock(hashtextextended('product-create:'||v_brand||':'||p_request,0));
 select * into v_receipt from public.pos_product_create_receipts where brand_slug=v_brand and request_id=p_request;
 if found then
   if v_receipt.actor<>v_actor or v_receipt.payload<>v_document then raise exception 'POS_CREATE_RETRY_CONFLICT'; end if;
   return v_receipt.result;
 end if;
 v_result:=public.pos_create_product_v2(
   p_payload->>'p_brand_id',v_brand,(p_payload->>'p_location_id')::uuid,(p_payload->>'p_category_id')::uuid,
   p_payload->>'p_name',p_payload->>'p_description',p_payload->>'p_product_type',p_payload->>'p_inventory_mode',
   p_payload->>'p_default_unit_code',(p_payload->>'p_has_variants')::boolean,(p_payload->>'p_sellable')::boolean,
   (p_payload->>'p_purchasable')::boolean,(p_payload->>'p_tax_rate')::numeric,p_payload->>'p_image_url',
   coalesce(p_payload->'p_configuration','{}'::jsonb)||jsonb_build_object('requestedSalesChannels',p_channels),
   p_payload->'p_variants',v_actor,p_payload->>'p_product_code');
 v_id:=(v_result->>'id')::uuid;
 if p_channels is not null then
   begin
     v_channels:=public.pos_set_product_channels_m1(v_brand,v_id,v_actor,
       (p_channels->>'physicalRequested')::boolean,(p_channels->>'onlineRequested')::boolean,0);
     v_result:=v_result||jsonb_build_object('channelResult',jsonb_build_object('status','saved','channels',v_channels));
   exception when others then
     -- The product and desired selections survive a publication failure.
     v_result:=v_result||jsonb_build_object('channelResult',jsonb_build_object('status','pending','message',
       case when sqlerrm like '%DENIED%' then 'Sin permiso para cambiar estos canales.'
         when sqlerrm like '%SERVICE_DISABLED%' then 'La tienda propia no está habilitada.'
         else 'No se pudieron confirmar los canales. Revisa el producto y reintenta desde Canales.' end));
   end;
 end if;
 insert into public.pos_product_create_receipts(brand_slug,request_id,actor,payload,result)
 values(v_brand,p_request,v_actor,v_document,v_result);
 return v_result;
end $$;
revoke all on function public.pos_create_product_delivery_v1(jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pos_create_product_delivery_v1(jsonb,uuid,jsonb) to service_role;
commit;
