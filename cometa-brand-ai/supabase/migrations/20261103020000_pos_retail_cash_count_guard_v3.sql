begin;
-- A metadata-only default: no financial backfill or UPDATE of historical cuts.
alter table public.pos_cash_sessions add column cash_activity_revision bigint not null default 0;
create table public.pos_retail_cash_counts (
 id uuid primary key default gen_random_uuid(), brand_slug text not null references public.brands(slug),
 cash_session_id uuid not null references public.pos_cash_sessions(id),
 host_user_id uuid not null, staff_id uuid not null references public.pos_staff(id),
 staff_session_id uuid not null references public.pos_staff_sessions(id),
 request_key uuid not null, activity_revision bigint not null,
 started_at timestamptz not null default clock_timestamp(), consumed_at timestamptz,
 unique(brand_slug,request_key)
);
alter table public.pos_retail_cash_counts enable row level security;
revoke all on public.pos_retail_cash_counts from public,anon,authenticated,service_role;

-- Every cash-affecting writer serializes on the same cash-session row as close.
-- The revision is private: only an opaque count UUID is returned to a cashier.
create function public.pos_retail_cash_activity_v3() returns trigger language plpgsql security definer set search_path=public as $$
declare n jsonb; o jsonb; affected uuid[]; session_row pos_cash_sessions;
begin
 if tg_op<>'DELETE' then n:=to_jsonb(new);end if;
 if tg_op<>'INSERT' then o:=to_jsonb(old);end if;
 if tg_op='UPDATE' and n=o then return new;end if;
 if tg_table_name='pos_payments' then
  select array_agg(distinct s.cash_session_id) into affected from pos_sales s
  where (s.id=(n->>'sale_id')::uuid and n->>'payment_method'='cash')
     or (s.id=(o->>'sale_id')::uuid and o->>'payment_method'='cash');
 elsif tg_table_name='pos_sales' then
  if tg_op='UPDATE' and row(n->>'cash_session_id',n->>'brand_slug') is not distinct from row(o->>'cash_session_id',o->>'brand_slug') then return new;end if;
  if not exists(select 1 from pos_payments where sale_id=(o->>'id')::uuid and payment_method='cash') then if tg_op='DELETE' then return old;end if;return new;end if;
  affected:=array[(n->>'cash_session_id')::uuid,(o->>'cash_session_id')::uuid];
 elsif tg_table_name='pos_retail_order_payments' then
  affected:=array[case when n->>'method'='cash' then (n->>'cash_session_id')::uuid end,case when o->>'method'='cash' then (o->>'cash_session_id')::uuid end];
 else
  affected:=array[(n->>'cash_session_id')::uuid,(o->>'cash_session_id')::uuid];
 end if;
 for session_row in select c.* from pos_cash_sessions c where c.id=any(affected) order by c.id for update loop
  if not exists(select 1 from pos_business_profiles p where p.brand_slug=session_row.brand_slug and nullif(btrim(p.profile_code),'') is not null and p.profile_code not in ('restaurant','coffee_shop')) then continue;end if;
  if session_row.status<>'open' then raise exception 'POS_CASH_SESSION_NOT_OPEN';end if;
  update pos_cash_sessions set cash_activity_revision=cash_activity_revision+1 where id=session_row.id;
 end loop;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function public.pos_retail_cash_activity_v3() from public,anon,authenticated,service_role;
create trigger pos_cash_movement_revision_v3 after insert or update or delete on public.pos_cash_movements for each row execute function public.pos_retail_cash_activity_v3();
create trigger pos_payment_revision_v3 after insert or update or delete on public.pos_payments for each row execute function public.pos_retail_cash_activity_v3();
create trigger pos_order_payment_revision_v3 after insert or update or delete on public.pos_retail_order_payments for each row execute function public.pos_retail_cash_activity_v3();
create trigger pos_sale_revision_v3 before update or delete on public.pos_sales for each row execute function public.pos_retail_cash_activity_v3();

create function public.pos_retail_cash_count_start_v3(p_brand_slug text,p_host_user_id uuid,p_staff_session_id uuid,p_cash_session_id uuid,p_key uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor pos_staff; c pos_cash_sessions; prior pos_retail_cash_counts; reg uuid;
begin
 perform pos_require_retail_profile_v1(p_brand_slug);
 select st.* into actor from pos_staff st join pos_staff_sessions ss on ss.staff_id=st.id and ss.brand_slug=st.brand_slug
 where ss.id=p_staff_session_id and ss.brand_slug=p_brand_slug and ss.host_user_id=p_host_user_id and ss.revoked_at is null and ss.expires_at>clock_timestamp()
 and ss.last_human_at>clock_timestamp()-interval '3 minutes' and st.active;
 if not found or not(coalesce(actor.retail_permissions,case when actor.role='ADMIN' then array['CASH','SETTINGS'] when actor.role in ('CASHIER','MANAGER') then array['CASH'] else array[]::text[] end) @> array['CASH']) then raise exception 'POS_STAFF_PERMISSION_REQUIRED';end if;
 if p_key is null then raise exception 'POS_VALIDATION_ERROR';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_brand_slug||':cash-count:'||p_key::text,0));
 select * into prior from pos_retail_cash_counts where brand_slug=p_brand_slug and request_key=p_key;
 if found then
  if prior.cash_session_id<>p_cash_session_id or prior.host_user_id<>p_host_user_id or prior.staff_id<>actor.id or prior.staff_session_id<>p_staff_session_id then raise exception 'POS_IDEMPOTENCY_CONFLICT';end if;
 else
  select r.id into reg from pos_registers r join pos_cash_sessions cs on cs.register_id=r.id where cs.id=p_cash_session_id and cs.brand_slug=p_brand_slug and r.brand_slug=p_brand_slug for update of r;
  if reg is null then raise exception 'POS_CASH_SESSION_NOT_FOUND';end if;
  select * into c from pos_cash_sessions where id=p_cash_session_id and brand_slug=p_brand_slug and status='open' for update;
  if not found then raise exception 'POS_CASH_SESSION_NOT_FOUND';end if;
  if actor.location_id is not null and actor.location_id<>c.location_id then raise exception 'POS_STAFF_LOCATION_FORBIDDEN';end if;
  insert into pos_retail_cash_counts(brand_slug,cash_session_id,host_user_id,staff_id,staff_session_id,request_key,activity_revision)
   values(p_brand_slug,c.id,p_host_user_id,actor.id,p_staff_session_id,p_key,c.cash_activity_revision) returning * into prior;
 end if;
 return jsonb_build_object('countId',prior.id,'cashSessionId',prior.cash_session_id,'startedAt',prior.started_at);
end $$;
revoke all on function public.pos_retail_cash_count_start_v3(text,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.pos_retail_cash_count_start_v3(text,uuid,uuid,uuid,uuid) to service_role;

alter function public.pos_retail_cash_command_v1(text,uuid,uuid,text,jsonb,uuid,text) rename to pos_retail_cash_allocation_v2;
revoke all on function public.pos_retail_cash_allocation_v2(text,uuid,uuid,text,jsonb,uuid,text) from public,anon,authenticated,service_role;
create function public.pos_retail_cash_command_v1(p_brand_slug text,p_host_user_id uuid,p_session_id uuid,p_action text,p_payload jsonb,p_key uuid,p_authorization_hash text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor pos_staff;c pos_cash_sessions;count_row pos_retail_cash_counts;reg uuid;result jsonb;
begin
 if p_action is distinct from 'close' then return pos_retail_cash_allocation_v2(p_brand_slug,p_host_user_id,p_session_id,p_action,p_payload,p_key,p_authorization_hash);end if;
 perform pos_require_retail_profile_v1(p_brand_slug);
 select st.* into actor from pos_staff st join pos_staff_sessions ss on ss.staff_id=st.id and ss.brand_slug=st.brand_slug
 where ss.id=p_session_id and ss.brand_slug=p_brand_slug and ss.host_user_id=p_host_user_id and ss.revoked_at is null and ss.expires_at>clock_timestamp()
 and ss.last_human_at>clock_timestamp()-interval '3 minutes' and st.active;
 if not found or not(coalesce(actor.retail_permissions,case when actor.role='ADMIN' then array['CASH','SETTINGS'] when actor.role in ('CASHIER','MANAGER') then array['CASH'] else array[]::text[] end) @> array['CASH']) then raise exception 'POS_STAFF_PERMISSION_REQUIRED';end if;
 if p_key is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'POS_VALIDATION_ERROR';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_brand_slug||':cash:'||p_key::text,0));
 -- A committed close is replayed before checking current state. The v2 engine
 -- still validates actor/host/action/full payload, including countId.
 if exists(select 1 from pos_retail_cash_requests_v2 where brand_slug=p_brand_slug and request_key=p_key) then
  return pos_retail_cash_allocation_v2(p_brand_slug,p_host_user_id,p_session_id,p_action,p_payload,p_key,p_authorization_hash);
 end if;
 select r.id into reg from pos_registers r join pos_cash_sessions cs on cs.register_id=r.id where cs.id=(p_payload->>'sessionId')::uuid and cs.brand_slug=p_brand_slug and r.brand_slug=p_brand_slug for update of r;
 if reg is null then raise exception 'POS_CASH_SESSION_NOT_FOUND';end if;
 select * into c from pos_cash_sessions where id=(p_payload->>'sessionId')::uuid and brand_slug=p_brand_slug and status='open' for update;
 if not found then raise exception 'POS_CASH_SESSION_NOT_FOUND';end if;
 if actor.location_id is not null and actor.location_id<>c.location_id then raise exception 'POS_STAFF_LOCATION_FORBIDDEN';end if;
 select * into count_row from pos_retail_cash_counts where id=(p_payload->>'countId')::uuid and brand_slug=p_brand_slug and cash_session_id=c.id
 and host_user_id=p_host_user_id and staff_id=actor.id and staff_session_id=p_session_id and consumed_at is null for update;
 if not found then raise exception 'POS_CASH_COUNT_REQUIRED';end if;
 if count_row.activity_revision<>c.cash_activity_revision then raise exception 'POS_CASH_CHANGED_RECOUNT_REQUIRED';end if;
 result:=pos_retail_cash_allocation_v2(p_brand_slug,p_host_user_id,p_session_id,p_action,p_payload,p_key,p_authorization_hash);
 update pos_retail_cash_counts set consumed_at=clock_timestamp() where id=count_row.id;
 return result;
end $$;
revoke all on function public.pos_retail_cash_command_v1(text,uuid,uuid,text,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.pos_retail_cash_command_v1(text,uuid,uuid,text,jsonb,uuid,text) to service_role;
create or replace function public.pos_retail_cash_contract_v2() returns integer language sql immutable as $$ select 3 $$;
notify pgrst, 'reload schema';
commit;
