begin;
do $$
declare b uuid:=gen_random_uuid(); slug text:='atomic-'||replace(gen_random_uuid()::text,'-',''); host uuid:=gen_random_uuid(); staff uuid:=gen_random_uuid(); session uuid:=gen_random_uuid(); loc uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); rows jsonb; result jsonb; failed boolean:=false; count_rows integer;
begin
 insert into auth.users(id) values(host);
 insert into public.brands(id,slug,name) values(b,slug,'Atomic import fixture');
 insert into public.pos_business_profiles(brand_id,brand_slug,profile_code) values(b::text,slug,'coffee_shop');
 insert into public.pos_locations(id,brand_id,brand_slug,name,code,currency,prices_include_tax) values(loc,b::text,slug,'Atomic','ATM','MXN',false);
 insert into public.pos_staff(id,brand_id,brand_slug,location_id,name,role,pin_hash) values(staff,b::text,slug,loc,'Atomic','ADMIN','synthetic');
 insert into public.pos_staff_sessions(id,token_hash,host_user_id,staff_id,brand_id,brand_slug,location_id,expires_at) values(session,encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'),host,staff,b::text,slug,loc,now()+interval '1 hour');
 rows:=jsonb_build_array(
  jsonb_build_object('rowNumber',2,'decision','create','name','Leche','category','food','controlUnit','ml','packageQuantity',1000,'packageUnit','ml','packageCost',29,'initialStock',1000,'minimumStock',0,'active',true,'errors','[]'::jsonb),
  jsonb_build_object('rowNumber',3,'decision','create','name','CafÃ©','category','food','controlUnit','g','packageQuantity',1000,'packageUnit','g','packageCost',80,'initialStock',1000,'minimumStock',0,'active',true,'errors','[]'::jsonb),
  jsonb_build_object('rowNumber',4,'decision','create','name','Vainilla','category','food','controlUnit','ml','packageQuantity',1000,'packageUnit','bad','packageCost',50,'initialStock',1000,'minimumStock',0,'active',true,'errors','[]'::jsonb),
  jsonb_build_object('rowNumber',5,'decision','create','name','Hielo','category','food','controlUnit','g','packageQuantity',1000,'packageUnit','g','packageCost',10,'initialStock',1000,'minimumStock',0,'active',true,'errors','[]'::jsonb));
 begin perform public.pos_food_inventory_import_apply_v1(slug,host,session,loc,req,rows); exception when others then failed:=true; end;
 if not failed then raise exception 'expected induced import failure'; end if;
 select count(*) into count_rows from public.pos_products where brand_slug=slug and name in ('Leche','CafÃ©','Vainilla','Hielo');
 if count_rows<>0 then raise exception 'partial rows remained after rollback'; end if;
 rows:=jsonb_set(rows,'{2,packageUnit}','"ml"'::jsonb);
 result:=public.pos_food_inventory_import_apply_v1(slug,host,session,loc,req,rows);
 if result->>'status'<>'done' or (result->>'processed')::integer<>4 then raise exception 'retry did not complete'; end if;
 result:=public.pos_food_inventory_import_apply_v1(slug,host,session,loc,req,rows);
 if result->>'status'<>'done' or (result->>'processed')::integer<>4 then raise exception 'completed retry changed result'; end if;
 raise notice 'PASS atomic import rollback and retry';
end $$;
rollback;
