begin;
-- sellable remains global eligibility (also used by COMU/Food). These are
-- independent Retail channel selections, never stock or commercial enablement.
create table public.pos_product_sales_channels (
  product_id uuid primary key references public.pos_products(id),
  physical_requested boolean not null default true,
  online_requested boolean not null default false,
  revision integer not null check(revision>0),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.pos_product_sales_channels enable row level security;
revoke all on public.pos_product_sales_channels from public,anon,authenticated,service_role;
grant select on public.pos_product_sales_channels to service_role;

create function public.pos_set_product_channels_m1(p_brand_slug text,p_product_id uuid,
 p_actor uuid,p_physical boolean,p_online boolean,p_revision integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b public.brands%rowtype; p public.pos_products%rowtype;
 c public.pos_product_sales_channels%rowtype; role_name text; is_admin boolean;
 old_online boolean; old_physical boolean; v_revision integer;
begin
 select role='admin' into is_admin from public.user_profiles where user_id=p_actor and status='active' for share;
 if not found then raise exception 'POS_CHANNELS_DENIED' using errcode='42501'; end if;
 select * into b from public.brands where slug=p_brand_slug for update;
 if not found then raise exception 'POS_PRODUCT_NOT_FOUND'; end if;
 if not is_admin then
   select access_role into role_name from public.user_brand_access
     where user_id=p_actor and brand_slug=b.slug and status='active' for share;
   if role_name is null or role_name not in ('owner','admin','manager','inventory') then
     raise exception 'POS_CHANNELS_DENIED' using errcode='42501';
   end if;
 end if;
 if not exists(select 1 from public.pos_business_profiles where brand_slug=b.slug
   and profile_code not in ('restaurant','coffee_shop')) then raise exception 'POS_CHANNELS_RETAIL_ONLY'; end if;
 select * into p from public.pos_products where id=p_product_id and brand_slug=b.slug and brand_id::text=b.id::text for update;
 if not found then raise exception 'POS_PRODUCT_NOT_FOUND'; end if;
 if p_physical is null or p_online is null or p_revision is null or p_revision<0 then raise exception 'POS_CHANNELS_INVALID'; end if;
 select * into c from public.pos_product_sales_channels where product_id=p.id for update;
 v_revision:=coalesce(c.revision,0);old_online:=coalesce(c.online_requested,false);old_physical:=coalesce(c.physical_requested,true);
 if p_revision<>v_revision then raise exception 'POS_CHANNELS_CONFLICT' using errcode='40001'; end if;
 if p_online<>old_online then
   if not is_admin and role_name not in ('owner','admin') then raise exception 'POS_ONLINE_CHANNEL_DENIED' using errcode='42501'; end if;
   if p_online and (b.status is distinct from 'active' or not exists(
     select 1 from public.brand_online_store_access where brand_id=b.id and status='enabled'
   )) then raise exception 'POS_ONLINE_SERVICE_DISABLED'; end if;
 end if;
 if old_online=p_online and old_physical=p_physical then
   return jsonb_build_object('physical_requested',old_physical,'online_requested',old_online,'revision',v_revision);
 end if;
 insert into public.pos_product_sales_channels(product_id,physical_requested,online_requested,revision,updated_by)
 values(p.id,p_physical,p_online,v_revision+1,p_actor)
 on conflict(product_id) do update set physical_requested=excluded.physical_requested,
 online_requested=excluded.online_requested,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now()
 returning * into c;
 return to_jsonb(c);
end $$;
revoke all on function public.pos_set_product_channels_m1(text,uuid,uuid,boolean,boolean,integer) from public,anon,authenticated;
grant execute on function public.pos_set_product_channels_m1(text,uuid,uuid,boolean,boolean,integer) to service_role;
commit;
