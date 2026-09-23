begin;
do $$
declare b uuid:=gen_random_uuid(); slug text:='controls-'||replace(gen_random_uuid()::text,'-',''); host uuid:=gen_random_uuid(); staff uuid:=gen_random_uuid(); session uuid:=gen_random_uuid(); loc uuid:=gen_random_uuid(); product uuid:=gen_random_uuid(); variant uuid:=gen_random_uuid(); r jsonb; first jsonb; second jsonb; import_key uuid:=gen_random_uuid();
begin
 insert into auth.users(id) values(host);
 insert into public.brands(id,slug,name) values(b,slug,'Controls fixture');
 insert into public.pos_business_profiles(brand_id,brand_slug,profile_code) values(b::text,slug,'coffee_shop');
 insert into public.pos_locations(id,brand_id,brand_slug,name,code,currency,prices_include_tax) values(loc,b::text,slug,'Controls','CTL','MXN',false);
 insert into public.pos_staff(id,brand_id,brand_slug,location_id,name,role,pin_hash) values(staff,b::text,slug,loc,'Controls','ADMIN','synthetic');
 insert into public.pos_staff_sessions(id,token_hash,host_user_id,staff_id,brand_id,brand_slug,location_id,expires_at) values(session,encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'),host,staff,b::text,slug,loc,now()+interval '1 hour');
 insert into public.pos_products(id,brand_id,brand_slug,name,product_type,track_inventory,inventory_mode,default_unit_code,active,sellable,purchasable) values(product,b::text,slug,'Leche','ingredient',true,'direct','ml',true,false,true);
 insert into public.pos_product_variants(id,product_id,brand_id,brand_slug,name,unit_code,active) values(variant,product,b::text,slug,'Leche','ml',true);
 perform public.pos_adjust_inventory(slug,loc,variant,5000,'initial','fixture',host,true);
 first:=public.pos_food_inventory_loss_v1(slug,host,session,loc,variant,300,'ml','Derrame','fixture',null,gen_random_uuid());
 if (first->>'after')::numeric<>4700 then raise exception 'loss failed'; end if;
 second:=public.pos_food_inventory_count_v1(slug,host,session,loc,variant,4500,'ml','Conteo',gen_random_uuid());
 if (second->>'variance')::numeric<>-200 then raise exception 'count negative failed'; end if;
 second:=public.pos_food_inventory_count_v1(slug,host,session,loc,variant,4600,'ml','Conteo',gen_random_uuid());
 if (second->>'variance')::numeric<>100 then raise exception 'count positive failed'; end if;
 first:=public.pos_food_inventory_import_mark_v1(slug,host,session,loc,import_key,jsonb_build_object('status','done','processed',3));
 second:=public.pos_food_inventory_import_mark_v1(slug,host,session,loc,import_key,jsonb_build_object('status','changed'));
 if second->>'status' <> 'done' or (second->>'processed')::numeric<>3 then raise exception 'import retry failed'; end if;
 raise notice 'PASS inventory controls';
end $$;
rollback;
