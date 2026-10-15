begin;

-- One identity/PIN. In V1 all assignments inherit the staff location scope;
-- no independent per-role location grants and no legacy fallback in Food.
create table public.pos_staff_roles (
  staff_id uuid not null,
  brand_slug text not null references public.brands(slug) on update cascade on delete restrict,
  role text not null check(role in ('ADMIN','MANAGER','CASHIER','WAITER','KITCHEN')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  primary key(staff_id,brand_slug,role),
  foreign key(staff_id,brand_slug) references public.pos_staff(id,brand_slug) on delete restrict
);
alter table public.pos_staff_roles enable row level security;
revoke all on public.pos_staff_roles from public,anon,authenticated;
grant all on public.pos_staff_roles to service_role;
insert into public.pos_staff_roles(staff_id,brand_slug,role,created_by)
select id,brand_slug,role,created_by from public.pos_staff;

-- Compatibility for new identities created by older clients. UPDATE does not
-- seed roles: a disabled assignment must never be resurrected by legacy role.
create function public.pos_staff_seed_role_v1() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.pos_staff_roles(staff_id,brand_slug,role,created_by) values(new.id,new.brand_slug,new.role,new.created_by);
  return new;
end $$;
create trigger pos_staff_seed_role after insert on public.pos_staff for each row execute function public.pos_staff_seed_role_v1();

create function public.pos_staff_has_any_role_v1(p_staff uuid,p_brand text,p_roles text[]) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.pos_staff s where s.id=p_staff and s.brand_slug=p_brand and s.active and
    case when exists(select 1 from public.pos_business_profiles b where b.brand_slug=p_brand and b.profile_code in ('restaurant','coffee_shop'))
      then exists(select 1 from public.pos_staff_roles r where r.staff_id=s.id and r.brand_slug=s.brand_slug and r.active and r.role=any(p_roles))
      else s.role=any(p_roles) end);
$$;

-- Resolve a real active role for an action, never synthesize ADMIN from a union.
create function public.pos_staff_effective_role_v1(p_staff uuid,p_brand text,p_roles text[]) returns text
language sql stable security definer set search_path=public as $$
  select role from unnest(p_roles) role where public.pos_staff_has_any_role_v1(p_staff,p_brand,array[role]) limit 1;
$$;

alter table public.pos_cash_sessions
  add column opening_staff_id uuid references public.pos_staff(id) on delete restrict,
  add column opening_role text,
  add column closed_by_staff_id uuid references public.pos_staff(id) on delete restrict;
alter table public.pos_cash_movements
  add column performed_by_staff_id uuid references public.pos_staff(id) on delete restrict,
  add column authorized_by_staff_id uuid references public.pos_staff(id) on delete restrict,
  add column request_key uuid;
create unique index pos_cash_movement_request on public.pos_cash_movements(brand_slug,request_key) where request_key is not null;
alter table public.pos_food_payments add column cash_session_id uuid references public.pos_cash_sessions(id) on delete restrict;
create index pos_food_payments_cash_session on public.pos_food_payments(cash_session_id,created_at);
-- Historical evidence comes from the actual payment command, not the final sale.
update public.pos_food_payments p set cash_session_id=c.id
from public.pos_food_events e,public.pos_cash_sessions c
where e.brand_slug=p.brand_slug and e.request_key=p.request_key and e.action='pay'
and e.payload->>'cashSessionId'=c.id::text and c.brand_slug=p.brand_slug and c.location_id=p.location_id;
-- Do not silently drop or invent historical cash attribution in reconciliation.
do $$ begin
 if exists(select 1 from public.pos_food_payments where cash_session_id is null) then
   raise exception 'POS_FOOD_PAYMENT_PROVENANCE_REQUIRED: historical payments lack verified original cash session';
 end if;
end $$;
update public.pos_cash_sessions c set opening_staff_id=e.actor_staff_id
from public.pos_staff_audit_events e where e.entity_id=c.id and e.brand_slug=c.brand_slug and e.action='CASH_SESSION_OPEN';
update public.pos_cash_sessions c set closed_by_staff_id=e.actor_staff_id
from public.pos_staff_audit_events e where e.entity_id=c.id and e.brand_slug=c.brand_slug and e.action='CASH_SESSION_CLOSE';

alter table public.pos_staff_audit_events
  add column request_key uuid,
  add column effective_role text,
  add column surface text,
  add column amount numeric(14,2),
  add column cash_session_id uuid references public.pos_cash_sessions(id) on delete restrict,
  add column sale_id uuid references public.pos_sales(id) on delete restrict,
  add column check_id uuid references public.pos_food_checks(id) on delete restrict,
  add column payment_id uuid references public.pos_food_payments(id) on delete restrict,
  add column reason text;
create unique index pos_staff_audit_request on public.pos_staff_audit_events(brand_slug,request_key,action) where request_key is not null;
alter table public.pos_food_events add column effective_role text, add column surface text;
do $$ declare expression text; begin
 select pg_get_expr(conbin,conrelid) into expression from pg_constraint where conrelid='public.pos_staff_audit_events'::regclass and conname='pos_staff_audit_events_action_check';
 alter table public.pos_staff_audit_events drop constraint pos_staff_audit_events_action_check;
 execute format('alter table public.pos_staff_audit_events add constraint pos_staff_audit_events_action_check check ((%s) or action in (''CASH_IN'',''CASH_OUT'',''CASH_COUNTED'',''CASH_DIFFERENCE'',''CASH_ADJUSTMENT'',''LOYALTY_REDEMPTION''))',expression);
end $$;

-- Patch authorization expressions only, including the Food-only session guard
-- inside V4. No sale arithmetic, rewards, stock or Retail branches are changed.
do $$ declare fn record; source text; updated text; alias text; begin
 for fn in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname like 'pos_food_%' or p.proname in
 ('pos_complete_sale_with_staff_v1','pos_open_cash_session_with_staff_v1','pos_close_cash_session_with_staff_v1','pos_complete_sale_v4')) loop
   source:=pg_get_functiondef(fn.oid); updated:=source;
   foreach alias in array array['actor','v_actor','st','v_cashier'] loop
     updated:=regexp_replace(updated,'\m'||alias||'\.role\s+not in\s*\(([^)]+)\)',
       'not public.pos_staff_has_any_role_v1('||alias||'.id,'||alias||'.brand_slug,array[\1])','g');
     updated:=regexp_replace(updated,'\m'||alias||'\.role\s+in\s*\(([^)]+)\)',
       'public.pos_staff_has_any_role_v1('||alias||'.id,'||alias||'.brand_slug,array[\1])','g');
     updated:=regexp_replace(updated,'\m'||alias||'\.role\s*<>\s*''ADMIN''',
       'not public.pos_staff_has_any_role_v1('||alias||'.id,'||alias||'.brand_slug,array[''ADMIN''])','g');
     updated:=regexp_replace(updated,'\m'||alias||'\.role\s*<>\s*''KITCHEN''',
       'public.pos_staff_has_any_role_v1('||alias||'.id,'||alias||'.brand_slug,array[''ADMIN'',''MANAGER'',''WAITER'',''CASHIER''])','g');
   end loop;
   updated:=replace(updated,'and role in (''CASHIER'',''MANAGER'',''ADMIN'')','and public.pos_staff_has_any_role_v1(id,brand_slug,array[''CASHIER'',''MANAGER'',''ADMIN''])');
   if updated<>source then execute updated; end if;
 end loop;
end $$;

-- Payment provenance is inserted with the payment, before final consolidation.
do $$ declare source text; begin
 source:=pg_get_functiondef('public.pos_food_payment_command_v1(text,uuid,uuid,jsonb,uuid)'::regprocedure);
 if position('check_id,cashier_staff_id,method' in source)=0 then raise exception 'MULTIROLE_PAYMENT_ANCHOR_MISSING'; end if;
 source:=replace(source,'check_id,cashier_staff_id,method','check_id,cashier_staff_id,cash_session_id,method');
 source:=replace(source,'location,c.id,actor.id,method','location,c.id,actor.id,cash.id,method');
 source:=replace(source,'reward_unlock_id,actor.id);','reward_unlock_id,c.opened_by,actor.id);');
 execute source;
end $$;
create function public.pos_food_payment_provenance_v1() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='UPDATE' then
   if new.cash_session_id is distinct from old.cash_session_id or new.cashier_staff_id is distinct from old.cashier_staff_id or new.amount is distinct from old.amount or new.method is distinct from old.method then
     raise exception 'POS_FOOD_PAYMENT_IMMUTABLE';
   end if;
 else
   if new.cash_session_id is null or not exists(select 1 from public.pos_cash_sessions c where c.id=new.cash_session_id and c.brand_slug=new.brand_slug and c.location_id=new.location_id and c.status='open') then raise exception 'POS_FOOD_CASH_REQUIRED'; end if;
 end if;
 return new;
end $$;
create trigger pos_food_payment_provenance before insert or update on public.pos_food_payments for each row execute function public.pos_food_payment_provenance_v1();

create function public.pos_food_event_context_v1() returns trigger language plpgsql security definer set search_path=public as $$
declare roles text[]; begin
 roles:=case when new.action in ('prepare','ready') then array['KITCHEN','MANAGER','ADMIN'] when new.action='pay' then array['CASHIER','MANAGER','ADMIN'] when new.action='table_create' then array['ADMIN'] else array['WAITER','MANAGER','ADMIN','CASHIER'] end;
 new.effective_role:=public.pos_staff_effective_role_v1(new.actor_id,new.brand_slug,roles);
 new.surface:=case when new.action in ('prepare','ready') then 'kitchen' when new.action='pay' then 'cash' else 'salon' end;
 return new;
end $$;
create trigger pos_food_event_context before insert on public.pos_food_events for each row execute function public.pos_food_event_context_v1();

-- Food receipts are the operational cash source, before AND after finalization.
-- Exclude their canonical sale copies so neither partials nor totals count twice.
create function public.pos_cash_payment_totals_v2(p_brand text,p_sessions uuid[])
returns table(cash_session_id uuid,method text,amount numeric) language sql stable security definer set search_path=public as $$
 select p.cash_session_id,p.method,sum(p.amount) from public.pos_food_payments p
 where p.brand_slug=p_brand and p.cash_session_id=any(p_sessions) group by p.cash_session_id,p.method
 union all
 select s.cash_session_id,p.payment_method,sum(p.amount) from public.pos_payments p join public.pos_sales s on s.id=p.sale_id
 where s.brand_slug=p_brand and s.cash_session_id=any(p_sessions) and s.status in ('completed','partially_refunded')
 and not exists(select 1 from public.pos_food_payments fp where fp.finalized_sale_id=s.id and fp.brand_slug=s.brand_slug)
 group by s.cash_session_id,p.payment_method;
$$;
-- Replace only the source of cash sums in the existing closing RPC and summary.
do $$ declare source text; old text; begin
 source:=pg_get_functiondef('public.pos_close_cash_session(text,uuid,numeric,uuid,text)'::regprocedure);
 old:=substring(source from '(?s)  select coalesce\(sum\(payment.amount\), 0\).*?payment.payment_method = ''cash'';');
 if old is null then raise exception 'MULTIROLE_CLOSE_ANCHOR_MISSING'; end if;
 source:=replace(source,old,'  select coalesce(sum(amount),0) into v_cash_sales from public.pos_cash_payment_totals_v2(p_brand_slug,array[v_session.id]) where method=''cash'';');
 execute source;
 source:=pg_get_functiondef('public.pos_get_cash_session_summaries_v1(text,uuid[],boolean)'::regprocedure);
 old:=substring(source from '(?s)payment_totals AS \(.*?\), movement_totals AS');
 if old is null then raise exception 'MULTIROLE_SUMMARY_ANCHOR_MISSING'; end if;
 source:=replace(source,old,'payment_totals AS (
 SELECT cash_session_id,coalesce(sum(amount) filter(where method=''cash''),0) cash_sales,
 coalesce(sum(amount) filter(where method=''card''),0) card_sales,
 coalesce(sum(amount) filter(where method=''transfer''),0) transfer_sales,
 coalesce(sum(amount) filter(where method=''wallet''),0) wallet_sales,
 coalesce(sum(amount) filter(where method=''other''),0) other_sales
 FROM public.pos_cash_payment_totals_v2(lower(btrim(p_brand_slug)),array(select id from scoped_sessions)) GROUP BY cash_session_id
 ), movement_totals AS');
 execute source;
end $$;

-- A command's original actor, input and result live in the existing audit table.
create function public.pos_cash_command_v2(p_brand_slug text,p_host_user_id uuid,p_session_id uuid,p_action text,p_payload jsonb,p_key uuid,p_authorization_hash text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor public.pos_staff; c public.pos_cash_sessions; m public.pos_cash_movements; a public.pos_staff_authorizations; prior public.pos_staff_audit_events;
 result jsonb; label text; role_name text; loc uuid; amount numeric; reason text; auth_id uuid; adjustment boolean;
begin
 actor:=public.pos_food_actor_v1(p_brand_slug,p_host_user_id,p_session_id);
 role_name:=public.pos_staff_effective_role_v1(actor.id,p_brand_slug,array['CASHIER','MANAGER','ADMIN']);
 if role_name is null then raise exception 'POS_STAFF_PERMISSION_REQUIRED'; end if;
 if p_key is null or p_action not in ('open','close','movement') or jsonb_typeof(p_payload)<>'object' then raise exception 'POS_VALIDATION_ERROR'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_brand_slug||':cash:'||p_key::text,0));
 label:=case p_action when 'open' then 'CASH_SESSION_OPEN' when 'close' then 'CASH_SESSION_CLOSE' else case when p_payload->>'adjustment'='true' then 'CASH_ADJUSTMENT' when p_payload->>'movementType' in ('income','deposit') then 'CASH_IN' else 'CASH_OUT' end end;
 select * into prior from public.pos_staff_audit_events where brand_slug=p_brand_slug and request_key=p_key and metadata ? 'payload' order by created_at limit 1;
 if found then
   if prior.action<>label or prior.actor_staff_id<>actor.id or prior.host_user_id<>p_host_user_id or prior.metadata->'payload'<>p_payload then raise exception 'POS_FOOD_CONFLICT'; end if;
   return prior.metadata->'result';
 end if;
 if p_action='open' then
   select location_id into loc from public.pos_registers where id=(p_payload->>'registerId')::uuid and brand_slug=p_brand_slug;
 else
   select * into c from public.pos_cash_sessions where id=(p_payload->>'sessionId')::uuid and brand_slug=p_brand_slug for update;
   if not found or c.status<>'open' then raise exception 'POS_CASH_SESSION_NOT_FOUND'; end if;
   loc:=c.location_id;
 end if;
 if loc is null or (actor.location_id is not null and actor.location_id<>loc) then raise exception 'POS_STAFF_LOCATION_FORBIDDEN'; end if;
 if p_action='open' then
   amount:=(p_payload->>'openingAmount')::numeric;
   if amount is null or amount<0 then raise exception 'POS_VALIDATION_ERROR'; end if;
   select * into c from public.pos_open_cash_session(p_brand_slug,(p_payload->>'registerId')::uuid,amount,p_host_user_id);
   update public.pos_cash_sessions set opening_staff_id=actor.id,opening_role=role_name where id=c.id returning * into c;
   result:=to_jsonb(c);
 elsif p_action='close' then
   amount:=(p_payload->>'countedCash')::numeric;
   if amount is null or amount<0 then raise exception 'POS_VALIDATION_ERROR'; end if;
   reason:=nullif(btrim(p_payload->>'notes'),'');
   select * into c from public.pos_close_cash_session(p_brand_slug,c.id,amount,p_host_user_id,reason);
   update public.pos_cash_sessions set closed_by_staff_id=actor.id where id=c.id returning * into c;
   result:=to_jsonb(c);
 else
   amount:=(p_payload->>'amount')::numeric; reason:=nullif(btrim(p_payload->>'reason'),'');
   if amount is null or amount<=0 or amount<>round(amount,2) or reason is null then raise exception 'POS_VALIDATION_ERROR'; end if;
   adjustment:=coalesce((p_payload->>'adjustment')::boolean,false);
   if adjustment and not public.pos_staff_has_any_role_v1(actor.id,p_brand_slug,array['ADMIN','MANAGER']) then
     select * into a from public.pos_staff_authorizations where token_hash=p_authorization_hash and brand_slug=p_brand_slug and host_user_id=p_host_user_id and requested_by_staff_id=actor.id and action='CASH_ADJUSTMENT' and entity_id=c.id and (location_id is null or location_id=loc) and consumed_at is null and expires_at>clock_timestamp() for update;
     if not found or not public.pos_staff_has_any_role_v1(a.authorized_by_staff_id,p_brand_slug,array['ADMIN','MANAGER']) or not exists(select 1 from public.pos_staff s where s.id=a.authorized_by_staff_id and (s.location_id is null or s.location_id=loc)) then raise exception 'POS_SUPERVISOR_AUTH_INVALID'; end if;
     update public.pos_staff_authorizations set consumed_at=clock_timestamp() where id=a.id;
     auth_id:=a.authorized_by_staff_id;
   end if;
   -- Insert all provenance at once: movement ledger is append-only.
   insert into public.pos_cash_movements(brand_id,brand_slug,cash_session_id,movement_type,amount,reason,created_by,performed_by_staff_id,authorized_by_staff_id,request_key)
   values(c.brand_id,p_brand_slug,c.id,p_payload->>'movementType',amount,reason,p_host_user_id,actor.id,auth_id,p_key) returning * into m;
   result:=to_jsonb(m);
 end if;
 insert into public.pos_staff_audit_events(brand_id,brand_slug,location_id,actor_staff_id,authorized_by_staff_id,host_user_id,action,entity_type,entity_id,request_key,effective_role,surface,amount,cash_session_id,reason,metadata)
 values(actor.brand_id,p_brand_slug,loc,actor.id,auth_id,p_host_user_id,label,case when p_action='movement' then 'cash_movement' else 'cash_session' end,case when p_action='movement' then m.id else c.id end,p_key,role_name,'cash',amount,c.id,reason,jsonb_build_object('payload',p_payload,'result',result));
 if p_action='close' then
   insert into public.pos_staff_audit_events(brand_id,brand_slug,location_id,actor_staff_id,host_user_id,action,entity_type,entity_id,request_key,effective_role,surface,amount,cash_session_id,reason)
   values(actor.brand_id,p_brand_slug,loc,actor.id,p_host_user_id,'CASH_COUNTED','cash_session',c.id,p_key,role_name,'cash',c.counted_cash,c.id,reason),
         (actor.brand_id,p_brand_slug,loc,actor.id,p_host_user_id,'CASH_DIFFERENCE','cash_session',c.id,p_key,role_name,'cash',c.difference,c.id,reason);
 end if;
 return result;
end $$;

-- Only service role may invoke these; application authorization precedes calls.
revoke all on function public.pos_staff_has_any_role_v1(uuid,text,text[]),public.pos_staff_effective_role_v1(uuid,text,text[]),public.pos_cash_payment_totals_v2(text,uuid[]),public.pos_cash_command_v2(text,uuid,uuid,text,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.pos_staff_has_any_role_v1(uuid,text,text[]),public.pos_staff_effective_role_v1(uuid,text,text[]),public.pos_cash_payment_totals_v2(text,uuid[]),public.pos_cash_command_v2(text,uuid,uuid,text,jsonb,uuid,text) to service_role;
-- Staff edits + assignments + revocation + audit commit together.
create function public.pos_staff_save_v2(p_brand_slug text,p_host_user_id uuid,p_session_id uuid,p_staff_id uuid,p_fields jsonb,p_roles text[] default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor public.pos_staff; target public.pos_staff; brand_key text; loc uuid; creating boolean:=p_staff_id is null; food boolean; begin
 perform pg_advisory_xact_lock(hashtextextended(p_brand_slug||':staff',0));
 select id::text into brand_key from public.brands where slug=p_brand_slug;
 if brand_key is null then raise exception 'POS_STAFF_NOT_FOUND'; end if;
 select exists(select 1 from public.pos_business_profiles where brand_slug=p_brand_slug and profile_code in ('restaurant','coffee_shop')) into food;
 if exists(select 1 from public.pos_staff where brand_slug=p_brand_slug and active) or not creating then
   select st.* into actor from public.pos_staff st join public.pos_staff_sessions se on se.staff_id=st.id and se.brand_slug=st.brand_slug
   where se.id=p_session_id and se.host_user_id=p_host_user_id and se.brand_slug=p_brand_slug and se.revoked_at is null and se.expires_at>clock_timestamp() and st.active;
   if not found or not public.pos_staff_has_any_role_v1(actor.id,p_brand_slug,array['ADMIN']) then raise exception 'POS_STAFF_ADMIN_REQUIRED'; end if;
 elsif not ('ADMIN'=any(coalesce(p_roles,array[p_fields->>'role']))) then raise exception 'POS_STAFF_FIRST_ROLE_INVALID'; end if;
 if p_roles is not null and (not food or cardinality(p_roles) not between 1 and 5 or exists(select 1 from unnest(p_roles) r where r is null or r not in ('ADMIN','MANAGER','CASHIER','WAITER','KITCHEN'))) then raise exception 'POS_STAFF_ROLE_INVALID'; end if;
 if p_fields ? 'location_id' then
   loc:=nullif(p_fields->>'location_id','')::uuid;
   if loc is not null and not exists(select 1 from public.pos_locations where id=loc and brand_slug=p_brand_slug) then raise exception 'POS_STAFF_LOCATION_INVALID'; end if;
 end if;
 if creating then
   insert into public.pos_staff(brand_id,brand_slug,location_id,name,role,pin_hash,created_by,updated_by)
   values(brand_key,p_brand_slug,loc,p_fields->>'name',coalesce(p_roles[1],p_fields->>'role'),p_fields->>'pin_hash',p_host_user_id,p_host_user_id) returning * into target;
   -- First-run staff creation has no prior session actor; the created identity
   -- is the only attributable actor available for the transactional audit.
   if actor.id is null then actor:=target; end if;
 else
   select * into target from public.pos_staff where id=p_staff_id and brand_slug=p_brand_slug for update;
   if not found then raise exception 'POS_STAFF_NOT_FOUND'; end if;
   update public.pos_staff set name=coalesce(p_fields->>'name',name),
     role=case when food then role else coalesce(p_fields->>'role',role) end,
     location_id=case when p_fields ? 'location_id' then loc else location_id end,
     active=coalesce((p_fields->>'active')::boolean,active),
     pin_hash=coalesce(p_fields->>'pin_hash',pin_hash),
     pin_changed_at=case when p_fields ? 'pin_hash' then clock_timestamp() else pin_changed_at end,
     failed_pin_attempts=case when p_fields ? 'pin_hash' then 0 else failed_pin_attempts end,
     locked_until=case when p_fields ? 'pin_hash' then null else locked_until end,updated_by=p_host_user_id
   where id=target.id returning * into target;
 end if;
 if food and p_roles is not null then
   update public.pos_staff_roles set active=false where staff_id=target.id and brand_slug=p_brand_slug;
   insert into public.pos_staff_roles(staff_id,brand_slug,role,created_by) select target.id,p_brand_slug,r,p_host_user_id from (select distinct unnest(p_roles) r) roles
   on conflict(staff_id,brand_slug,role) do update set active=true;
 end if;
 if not target.active or p_fields ? 'pin_hash' and not creating or p_fields ? 'location_id' and not creating then
   update public.pos_staff_sessions set revoked_at=clock_timestamp() where staff_id=target.id and brand_slug=p_brand_slug and revoked_at is null;
 end if;
 insert into public.pos_staff_audit_events(brand_id,brand_slug,location_id,actor_staff_id,host_user_id,action,entity_type,entity_id,metadata)
 values(brand_key,p_brand_slug,target.location_id,actor.id,p_host_user_id,case when creating then 'STAFF_CREATE' when p_fields ? 'pin_hash' then 'STAFF_PIN_RESET' else 'STAFF_UPDATE' end,'staff',target.id,jsonb_build_object('roles',p_roles));
 return jsonb_build_object('id',target.id,'name',target.name,'role',target.role,'location_id',target.location_id,'active',target.active);
end $$;
revoke all on function public.pos_staff_save_v2(text,uuid,uuid,uuid,jsonb,text[]) from public,anon,authenticated;
grant execute on function public.pos_staff_save_v2(text,uuid,uuid,uuid,jsonb,text[]) to service_role;

-- Direct sales use the existing audit ledger; retries do not duplicate SALE_CHARGE.
do $$ declare source text; begin
 source:=pg_get_functiondef('public.pos_complete_sale_with_staff_v1(text,uuid,uuid,uuid,uuid,jsonb,jsonb,text,uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure);
 source:=replace(source,'action,entity_type,entity_id)', 'action,entity_type,entity_id,request_key,effective_role,surface,amount,cash_session_id,sale_id)');
 source:=replace(source,'''SALE_CHARGE'',''sale'',id from public.pos_sales where id=v_sale_id;',
 '''SALE_CHARGE'',''sale'',id,p_idempotency_key,public.pos_staff_effective_role_v1(p_cashier_staff_id,p_brand_slug,array[''CASHIER'',''MANAGER'',''ADMIN'']),''cash'',total,p_cash_session_id,id from public.pos_sales where id=v_sale_id on conflict(brand_slug,request_key,action) where request_key is not null do nothing;');
 execute source;
end $$;
-- Read model only: original ledgers remain the source of truth.
create function public.pos_cash_history_v1(p_brand_slug text,p_host_user_id uuid,p_session_id uuid,p_cash_session_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor public.pos_staff; result jsonb; begin
 actor:=public.pos_food_actor_v1(p_brand_slug,p_host_user_id,p_session_id);
 if not public.pos_staff_has_any_role_v1(actor.id,p_brand_slug,array['ADMIN','MANAGER','CASHIER']) then raise exception 'POS_STAFF_PERMISSION_REQUIRED'; end if;
 if p_cash_session_id is null and not public.pos_staff_has_any_role_v1(actor.id,p_brand_slug,array['ADMIN','MANAGER']) then raise exception 'POS_STAFF_PERMISSION_REQUIRED'; end if;
 if p_cash_session_id is not null and not exists(select 1 from public.pos_cash_sessions c where c.id=p_cash_session_id and c.brand_slug=p_brand_slug and (actor.location_id is null or c.location_id=actor.location_id)) then raise exception 'POS_STAFF_LOCATION_FORBIDDEN'; end if;
 with events as (
   select 'staff:'||e.id::text id,e.created_at,case when e.action='FOOD_RECIPES_CONFIG' and e.metadata->>'command_action'='adjust' then 'INVENTORY_ADJUSTMENT' else e.action end action,e.actor_staff_id actor_id,e.authorized_by_staff_id,
   case when e.action='CASH_OUT' or e.action='CASH_ADJUSTMENT' and e.metadata->'payload'->>'movementType' in ('expense','withdrawal') then -e.amount else e.amount end amount,e.reason,e.effective_role,e.surface,
   coalesce(e.cash_session_id,case when e.entity_type='cash_session' then e.entity_id end) cash_session_id,
   e.location_id,e.sale_id,null::text method
   from public.pos_staff_audit_events e where e.brand_slug=p_brand_slug
   and e.action<>'SALE_CHARGE'
   union all
   select 'payment:'||p.id::text,p.created_at,'PAYMENT_COLLECTED',s.cashier_staff_id,null::uuid,p.amount,p.reference,null::text,'cash',s.cash_session_id,s.location_id,s.id,p.payment_method
   from public.pos_payments p join public.pos_sales s on s.id=p.sale_id and s.brand_slug=p.brand_slug
   where s.brand_slug=p_brand_slug and not exists(select 1 from public.pos_food_payments fp where fp.finalized_sale_id=s.id and fp.brand_slug=s.brand_slug)
   union all
   select 'movement:'||m.id::text,m.created_at,case when m.movement_type in ('income','deposit') then 'CASH_IN' else 'CASH_OUT' end,m.performed_by_staff_id,m.authorized_by_staff_id,
   case when m.movement_type in ('income','deposit') then m.amount else -m.amount end,m.reason,null::text,'cash',m.cash_session_id,c.location_id,null::uuid,null::text
   from public.pos_cash_movements m join public.pos_cash_sessions c on c.id=m.cash_session_id and c.brand_slug=m.brand_slug
   where m.brand_slug=p_brand_slug and not exists(select 1 from public.pos_staff_audit_events e where e.entity_id=m.id and e.brand_slug=m.brand_slug and e.entity_type='cash_movement')
   union all
   select 'food:'||e.id::text,e.created_at,
   case e.action when 'open' then 'CHECK_OPENED' when 'send' then 'ORDER_SENT' when 'prepare' then 'ORDER_PREPARATION_STARTED' when 'ready' then 'ORDER_READY' when 'serve' then 'ORDER_SERVED' when 'request_payment' then 'PAYMENT_REQUESTED' when 'customer_set' then 'CUSTOMER_CHANGED' when 'pay' then case when e.result->>'closed'='true' then 'PAYMENT_COLLECTED' else 'PARTIAL_PAYMENT_COLLECTED' end else e.action end,
   e.actor_id,null::uuid,p.amount,p.reference,e.effective_role,e.surface,p.cash_session_id,e.location_id,p.finalized_sale_id,p.method
   from public.pos_food_events e left join public.pos_food_payments p on p.brand_slug=e.brand_slug and p.request_key=e.request_key where e.brand_slug=p_brand_slug
   union all
   select 'loyalty:'||e.id::text,e.created_at,'LOYALTY_REDEMPTION',e.actor_id,null::uuid,null::numeric,null::text,e.effective_role,e.surface,p.cash_session_id,e.location_id,p.finalized_sale_id,p.method
   from public.pos_food_events e join public.pos_food_payments p on p.brand_slug=e.brand_slug and p.request_key=e.request_key
   where e.brand_slug=p_brand_slug and e.action='pay' and e.result->>'closed'='true' and (nullif(e.payload->>'rewardId','') is not null or nullif(e.payload->>'rewardUnlockId','') is not null)
 ), visible as (
 select e.*,coalesce(s.name,'Operador no registrado') actor_name,a.name authorized_name,r.name register_name,l.name location_name,l.currency,sale.sale_number
 from events e left join public.pos_staff s on s.id=e.actor_id and s.brand_slug=p_brand_slug
 left join public.pos_staff a on a.id=e.authorized_by_staff_id and a.brand_slug=p_brand_slug
 left join public.pos_cash_sessions c on c.id=e.cash_session_id and c.brand_slug=p_brand_slug
 left join public.pos_registers r on r.id=c.register_id and r.brand_slug=p_brand_slug
 left join public.pos_locations l on l.id=e.location_id and l.brand_slug=p_brand_slug
 left join public.pos_sales sale on sale.id=e.sale_id and sale.brand_slug=p_brand_slug
 where (actor.location_id is null or e.location_id=actor.location_id) and (p_cash_session_id is null or e.cash_session_id=p_cash_session_id)
 order by e.created_at desc,e.id desc limit 300
 ) select coalesce(jsonb_agg(to_jsonb(visible) order by created_at,id),'[]') into result from visible;
 return result;
end $$;
revoke all on function public.pos_cash_history_v1(text,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.pos_cash_history_v1(text,uuid,uuid,uuid) to service_role;
create function public.pos_staff_audit_context_v1() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.action in ('FOOD_RECIPES_CONFIG','FOOD_MODIFIERS_CONFIG') then
   new.request_key:=coalesce(new.request_key,new.id);
   new.effective_role:=public.pos_staff_effective_role_v1(new.actor_staff_id,new.brand_slug,array['ADMIN']);
   new.surface:='admin'; new.reason:=coalesce(new.reason,new.metadata->'payload'->>'notes');
 end if;
 return new;
end $$;
create trigger pos_staff_audit_context before insert on public.pos_staff_audit_events for each row execute function public.pos_staff_audit_context_v1();
commit;
