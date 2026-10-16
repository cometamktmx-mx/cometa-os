begin;
alter table public.pos_staff add column retail_role text check(retail_role in ('ADMIN','SALES','INVENTORY')),
 add column retail_permissions text[];
alter table public.pos_staff_sessions add column last_human_at timestamptz not null default now();
-- The only application caller is the authenticated sales route; Food wrappers
-- also use the service role. Do not expose the financial engine around PIN RBAC.
revoke all on function public.pos_complete_sale_v4(text,uuid,uuid,uuid,uuid,jsonb,jsonb,text,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.pos_complete_sale_v4(text,uuid,uuid,uuid,uuid,jsonb,jsonb,text,uuid,uuid,uuid,uuid) to service_role;

-- Additive columns: existing roles, PINs, memberships and Food assignments stay intact.
create function public.pos_retail_staff_save_v1(p_brand text,p_host uuid,p_session uuid,p_staff uuid,p_fields jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; target uuid; permissions text[]; bootstrap boolean; brand_key text; begin
 perform pg_advisory_xact_lock(hashtextextended(p_brand||':staff',0));
 if not exists(select 1 from pos_business_profiles where brand_slug=p_brand and profile_code not in ('restaurant','coffee_shop')) then raise exception 'POS_RETAIL_REQUIRED'; end if;
 select not exists(select 1 from pos_staff where brand_slug=p_brand and active and role='ADMIN' and (retail_permissions is null or retail_permissions @> array['STAFF','SETTINGS'])) into bootstrap;
 if not bootstrap then
   if not exists(select 1 from pos_staff_sessions s join pos_staff st on st.id=s.staff_id and st.brand_slug=s.brand_slug
    where s.id=p_session and s.brand_slug=p_brand and s.host_user_id=p_host and s.revoked_at is null and s.expires_at>clock_timestamp()
    and s.last_human_at>clock_timestamp()-interval '3 minutes' and st.active and st.role='ADMIN'
    and (st.retail_permissions is null or 'STAFF'=any(st.retail_permissions))) then raise exception 'POS_STAFF_ADMIN_REQUIRED'; end if;
 else
   if p_staff is not null or (p_fields->>'role') is distinct from 'ADMIN' or not (
    exists(select 1 from user_brand_access where user_id=p_host and brand_slug=p_brand and status='active' and access_role in ('owner','admin'))
    or exists(select 1 from user_profiles where user_id=p_host and role='admin' and status='active')) then raise exception 'POS_STAFF_ADMIN_REQUIRED';end if;
 end if;
 if bootstrap then
   select id::text into brand_key from brands where slug=p_brand;
   if nullif(p_fields->>'location_id','') is not null and not exists(select 1 from pos_locations where id=(p_fields->>'location_id')::uuid and brand_slug=p_brand) then raise exception 'POS_STAFF_LOCATION_INVALID';end if;
   insert into pos_staff(brand_id,brand_slug,name,role,pin_hash,location_id,created_by,updated_by)
   values(brand_key,p_brand,p_fields->>'name','ADMIN',p_fields->>'pin_hash',nullif(p_fields->>'location_id','')::uuid,p_host,p_host) returning id into target;
   insert into pos_staff_audit_events(brand_id,brand_slug,actor_staff_id,host_user_id,action,entity_type,entity_id)
   values(brand_key,p_brand,target,p_host,'STAFF_CREATE','staff',target);
   select jsonb_build_object('id',id,'name',name,'role',role,'location_id',location_id,'active',active) into result from pos_staff where id=target;
 else
   result:=pos_staff_save_v2(p_brand,p_host,p_session,p_staff,p_fields,null);
 end if;
 target:=(result->>'id')::uuid;
 if p_fields ? 'retail_permissions' then
   select coalesce(array_agg(value),'{}') into permissions from jsonb_array_elements_text(p_fields->'retail_permissions');
   if not permissions <@ array['SELL','PRODUCTS_READ','DISCOUNT','PRICE_CHANGE','CANCEL','REFUND','REPRINT','DRAWER','CASH','PRODUCTS_WRITE','INVENTORY','IMPORT','CUSTOMERS','REPORTS','STAFF','SETTINGS']::text[] then raise exception 'POS_PERMISSION_REQUIRED'; end if;
   update pos_staff set retail_permissions=permissions where id=target and brand_slug=p_brand;
 end if;
 if p_fields ? 'retail_role' then update pos_staff set retail_role=p_fields->>'retail_role' where id=target and brand_slug=p_brand; end if;
 if p_fields ? 'active' then update pos_staff set active=(p_fields->>'active')::boolean where id=target and brand_slug=p_brand; end if;
 if not exists(select 1 from pos_staff where brand_slug=p_brand and active and role='ADMIN' and (retail_permissions is null or retail_permissions @> array['STAFF','SETTINGS'])) then raise exception 'POS_LAST_ADMIN_REQUIRED'; end if;
 if p_staff is not null then update pos_staff_sessions set revoked_at=clock_timestamp() where staff_id=target and brand_slug=p_brand and revoked_at is null; end if;
 return result;
end $$;
revoke all on function public.pos_retail_staff_save_v1(text,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pos_retail_staff_save_v1(text,uuid,uuid,uuid,jsonb) to service_role;

create function public.pos_retail_pin_attempt_v1(p_brand text,p_staff uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare st pos_staff; attempts integer; begin
 select * into st from pos_staff where id=p_staff and brand_slug=p_brand and active for update;
 if not found or st.locked_until>clock_timestamp() then return false; end if;
 attempts:=case when st.locked_until is not null then 1 else st.failed_pin_attempts+1 end;
 update pos_staff set failed_pin_attempts=attempts,locked_until=case when attempts>=5 then clock_timestamp()+interval '5 minutes' else null end where id=st.id;
 return true;
end $$;
revoke all on function public.pos_retail_pin_attempt_v1(text,uuid) from public,anon,authenticated;
grant execute on function public.pos_retail_pin_attempt_v1(text,uuid) to service_role;
commit;
