-- Run only in the confirmed isolated test backend, in the same transaction as
-- the two new migrations. The caller MUST end with ROLLBACK.
do $$
declare b uuid:=gen_random_uuid(); slug text:='retail-check-'||substr(b::text,1,8);
 host uuid; legacy_id uuid; admin_id uuid; session_id uuid:=gen_random_uuid(); other_id uuid; value jsonb; rejected boolean;
begin
 select user_id into host from user_brand_access where brand_slug='magenta-preview' and status='active' limit 1;
 if host is null then raise exception 'ISOLATED_PREVIEW_FIXTURE_REQUIRED';end if;
 insert into brands(id,slug,name) values(b,slug,'Rollback-only terminal fixture');
 insert into user_brand_access(user_id,brand_slug,access_role,status) values(host,slug,'owner','active');
 insert into pos_business_profiles(brand_id,brand_slug,profile_code,onboarding_status) values(b::text,slug,'retail','completed');
 insert into pos_staff(brand_id,brand_slug,name,role,pin_hash,created_by,updated_by) values(b::text,slug,'Legacy fixture','CASHIER','legacy-hash-preserved',host,host) returning id into legacy_id;
 value:=pos_retail_staff_save_v1(slug,host,null,null,jsonb_build_object('name','Admin fixture','role','ADMIN','pin_hash','test-only-not-a-login','retail_role','ADMIN','retail_permissions',jsonb_build_array('STAFF','SETTINGS','SELL')));
 admin_id:=(value->>'id')::uuid;
 if not exists(select 1 from pos_staff where id=legacy_id and pin_hash='legacy-hash-preserved' and role='CASHIER' and retail_permissions is null) then raise exception 'LEGACY_STAFF_CHANGED';end if;
 insert into pos_staff_sessions(id,token_hash,host_user_id,staff_id,brand_id,brand_slug,expires_at,last_human_at)
 values(session_id,encode(sha256(gen_random_uuid()::text::bytea),'hex'),host,admin_id,b::text,slug,now()+interval '1 hour',now());
 rejected:=false;
 begin perform pos_retail_staff_save_v1(slug,host,session_id,admin_id,'{"active":false}'); exception when others then if sqlerrm like '%POS_LAST_ADMIN_REQUIRED%' then rejected:=true;else raise;end if;end;
 if not rejected or not (select active from pos_staff where id=admin_id) then raise exception 'LAST_ADMIN_GUARD_FAILED';end if;
 value:=pos_retail_staff_save_v1(slug,host,session_id,null,jsonb_build_object('name','Inventory fixture','role','CASHIER','pin_hash','test-only-not-a-login','retail_role','INVENTORY','retail_permissions',jsonb_build_array('PRODUCTS_READ','PRODUCTS_WRITE','INVENTORY','IMPORT')));
 other_id:=(value->>'id')::uuid;
 if (select retail_permissions @> array['SELL'] from pos_staff where id=other_id) then raise exception 'INVENTORY_ESCALATION';end if;
 update pos_staff_sessions set last_human_at=now()-interval '3 minutes' where id=session_id;
 rejected:=false;
 begin perform pos_retail_staff_save_v1(slug,host,session_id,other_id,'{"name":"must not persist"}');exception when others then if sqlerrm like '%POS_STAFF_ADMIN_REQUIRED%' then rejected:=true;else raise;end if;end;
 if not rejected then raise exception 'EXPIRED_ADMIN_ACCEPTED';end if;
 for i in 1..5 loop if not pos_retail_pin_attempt_v1(slug,other_id) then raise exception 'EARLY_PIN_REJECTION';end if;end loop;
 if pos_retail_pin_attempt_v1(slug,other_id) then raise exception 'PIN_LIMIT_BYPASSED';end if;
 if pos_retail_pin_attempt_v1('another-brand',other_id) then raise exception 'PIN_BRAND_BYPASSED';end if;
 if has_table_privilege('authenticated','public.pos_terminal_print_jobs','INSERT') then raise exception 'PRINT_RLS_BYPASSED';end if;
 if has_function_privilege('authenticated','public.pos_retail_staff_save_v1(text,uuid,uuid,uuid,jsonb)','EXECUTE') then raise exception 'STAFF_RPC_PUBLIC';end if;
 if has_function_privilege('anon','public.pos_complete_sale_v4(text,uuid,uuid,uuid,uuid,jsonb,jsonb,text,uuid,uuid,uuid,uuid)','EXECUTE') or has_function_privilege('authenticated','public.pos_complete_sale_v4(text,uuid,uuid,uuid,uuid,jsonb,jsonb,text,uuid,uuid,uuid,uuid)','EXECUTE') then raise exception 'SALE_RPC_BYPASS';end if;
 insert into pos_terminal_print_settings(id,brand_slug,host_user_id,config) values(b,slug,host,'{}');
 insert into pos_terminal_print_jobs(brand_slug,terminal_id,host_user_id,staff_id,kind,dedupe_key,payload) values(slug,b,host,admin_id,'receipt','unique-sale-receipt','{}');
 rejected:=false;
 begin insert into pos_terminal_print_jobs(brand_slug,terminal_id,host_user_id,staff_id,kind,dedupe_key,payload) values(slug,b,host,admin_id,'receipt','unique-sale-receipt','{}');exception when unique_violation then rejected:=true;end;
 if not rejected then raise exception 'DUPLICATE_JOB_ACCEPTED';end if;
 update pos_terminal_print_jobs set status='dispatched' where brand_slug=slug and status='requested';
 update pos_terminal_print_jobs set status='dispatched' where brand_slug=slug and status='requested';
 if found then raise exception 'DISPATCH_REPEATED';end if;
end $$;
select 'PASS PostgreSQL: last admin, rollback, explicit permissions, expiry, PIN limit, brand isolation and restricted grants' as result;
