-- Local fixtures only. Run after M1 migrations; every fixture rolls back.
begin;
create function pg_temp.m1_assert(condition boolean, label text) returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception 'FAIL: %',label; end if;
  raise notice 'PASS: %',label;
end $$;
do $$
declare
  host uuid:=gen_random_uuid(); other_host uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
  slug text:='m1-test-'||replace(gen_random_uuid()::text,'-','');
  loc uuid:=gen_random_uuid(); other_loc uuid:=gen_random_uuid(); device uuid:=gen_random_uuid();
  staff uuid:=gen_random_uuid(); session uuid:=gen_random_uuid(); auth_session uuid:=gen_random_uuid();
  actor public.pos_staff; denied boolean;
begin
  perform pg_temp.m1_assert((select relrowsecurity from pg_class where oid='public.pos_devices'::regclass),'device RLS enabled');
  perform pg_temp.m1_assert(not has_table_privilege('anon','public.pos_devices','SELECT') and not has_table_privilege('authenticated','public.pos_devices','SELECT'),'no client device/token reads');
  perform pg_temp.m1_assert(not has_function_privilege('authenticated','public.pos_revoke_device_v1(text,uuid,uuid)','EXECUTE'),'revoke RPC service only');
  perform pg_temp.m1_assert(not has_function_privilege('anon','public.pos_adjust_inventory(text,uuid,uuid,numeric,text,text,uuid,boolean)','EXECUTE'),'anonymous inventory RPC bypass closed');
  perform pg_temp.m1_assert(not has_table_privilege('authenticated','public.pos_inventory','UPDATE'),'membership-only direct inventory write bypass closed');
  perform pg_temp.m1_assert(has_table_privilege('service_role','public.pos_inventory','UPDATE'),'backend inventory privilege preserved');
  insert into auth.users(id) values(host),(other_host);
  insert into public.brands(id,slug,name) values(b,slug,'M1 synthetic fixture');
  insert into public.pos_business_profiles(brand_id,brand_slug,profile_code) values(b::text,slug,'restaurant');
  insert into public.pos_locations(id,brand_id,brand_slug,name,code) values(loc,b::text,slug,'Branch A','A'),(other_loc,b::text,slug,'Branch B','B');
  insert into public.pos_devices(id,host_user_id,auth_session_id,brand_id,brand_slug,location_id,label,token_hash,expires_at)
    values(device,host,auth_session,b::text,slug,loc,'Terminal',repeat('a',64),now()+interval '90 days');
  denied:=false;
  begin
    insert into public.pos_devices(host_user_id,auth_session_id,brand_id,brand_slug,location_id,label,token_hash,expires_at)
      values(host,auth_session,b::text,slug,loc,'Duplicate',repeat('b',64),now()+interval '90 days');
  exception when unique_violation then denied:=true; end;
  perform pg_temp.m1_assert(denied,'one device binding per Supabase auth session');
  denied:=false;
  begin update public.pos_devices set location_id=other_loc where id=device;
  exception when raise_exception then if sqlerrm='POS_DEVICE_IDENTITY_IMMUTABLE' then denied:=true; else raise; end if; end;
  perform pg_temp.m1_assert(denied,'device branch cannot be switched by update');
  insert into public.pos_staff(id,brand_id,brand_slug,name,role,pin_hash)
    values(staff,b::text,slug,'Global operator','ADMIN','synthetic-not-a-pin');
  insert into public.pos_staff_sessions(id,host_user_id,staff_id,brand_id,brand_slug,location_id,device_id,token_hash,expires_at)
    values(session,host,staff,b::text,slug,loc,device,repeat('c',64),now()+interval '1 hour');
  actor:=public.pos_food_actor_v1(slug,host,session);
  perform pg_temp.m1_assert(actor.id=staff and actor.location_id=loc,'global operator is narrowed to enrolled device branch inside Food transaction');
  denied:=false;
  begin
    insert into public.pos_staff_sessions(host_user_id,staff_id,brand_id,brand_slug,location_id,device_id,token_hash,expires_at)
      values(other_host,staff,b::text,slug,loc,device,repeat('d',64),now()+interval '1 hour');
  exception when raise_exception then if sqlerrm='POS_DEVICE_SESSION_INVALID' then denied:=true; else raise; end if; end;
  perform pg_temp.m1_assert(denied,'operator session cannot borrow a device owned by another account');
  perform pg_temp.m1_assert(not public.pos_revoke_device_v1('other-brand',device,host),'cross-brand revocation rejected');
  perform pg_temp.m1_assert(public.pos_revoke_device_v1(slug,device,host),'owner device revocation succeeds');
  perform pg_temp.m1_assert((select status='REVOKED' and revoked_at is not null from public.pos_devices where id=device),'revoked device tombstone persists');
  perform pg_temp.m1_assert((select revoked_at is not null from public.pos_staff_sessions where id=session),'revocation invalidates linked PIN session atomically');
  perform pg_temp.m1_assert(public.pos_revoke_device_v1(slug,device,host),'revocation is idempotent');
  denied:=false;
  begin perform public.pos_food_actor_v1(slug,host,session);
  exception when raise_exception then if sqlerrm='POS_FOOD_SESSION_REQUIRED' then denied:=true; else raise; end if; end;
  perform pg_temp.m1_assert(denied,'revoked device cannot operate inside Food RPC');
  denied:=false;
  begin
    insert into public.pos_staff_sessions(host_user_id,staff_id,brand_id,brand_slug,location_id,device_id,token_hash,expires_at)
      values(host,staff,b::text,slug,loc,device,repeat('e',64),now()+interval '1 hour');
  exception when raise_exception then if sqlerrm='POS_DEVICE_SESSION_INVALID' then denied:=true; else raise; end if; end;
  perform pg_temp.m1_assert(denied,'revoked device rejects new PIN sessions');
  denied:=false;
  begin update public.pos_devices set status='ACTIVE',revoked_at=null where id=device;
  exception when raise_exception then if sqlerrm='POS_DEVICE_REVOKED' then denied:=true; else raise; end if; end;
  perform pg_temp.m1_assert(denied,'revoked device cannot be reactivated');
end $$;
rollback;
