begin;
-- Additive: never infer or backfill historical allocations.
alter table public.pos_cash_sessions
 add column reserved_cash numeric(14,2), add column declared_delivery numeric(14,2),
 add column source_cash_session_id uuid references public.pos_cash_sessions(id),
 add column received_cash numeric(14,2), add column receipt_difference numeric(14,2), add column receipt_reason text,
 add column additional_cash numeric(14,2), add column additional_cash_reason text,
 add constraint pos_cash_allocation_v2 check ((reserved_cash is null and declared_delivery is null) or
 (reserved_cash is not null and declared_delivery is not null and counted_cash is not null and reserved_cash>=0 and declared_delivery>=0 and reserved_cash+declared_delivery=counted_cash)),
 add constraint pos_cash_receipt_v2 check ((received_cash is null or received_cash>=0) and (additional_cash is null or additional_cash>=0));
create unique index pos_cash_one_source_reserve_v2 on public.pos_cash_sessions(source_cash_session_id) where source_cash_session_id is not null;
create table public.pos_retail_cash_reserves (
 source_session_id uuid primary key references public.pos_cash_sessions(id), brand_slug text not null references public.brands(slug),
 register_id uuid not null references public.pos_registers(id), location_id uuid not null references public.pos_locations(id),
 reserved_amount numeric(14,2) not null check(reserved_amount>=0), declared_at timestamptz not null, declared_by uuid not null references public.pos_staff(id),
 target_session_id uuid unique references public.pos_cash_sessions(id), received_amount numeric(14,2), discrepancy numeric(14,2), reason text,
 received_at timestamptz, received_by uuid references public.pos_staff(id),
 check ((target_session_id is null and received_amount is null and discrepancy is null and received_at is null and received_by is null) or
 (target_session_id is not null and received_amount is not null and discrepancy is not null and received_amount>=0 and discrepancy=received_amount-reserved_amount and received_at is not null and received_by is not null and (discrepancy=0 or length(btrim(reason))>=3)))
);
create unique index pos_retail_one_pending_reserve on public.pos_retail_cash_reserves(register_id) where target_session_id is null;
create table public.pos_retail_cash_documents (
 session_id uuid primary key references public.pos_cash_sessions(id),brand_slug text not null references public.brands(slug),document jsonb not null check(document->>'version'='2')
);
create table public.pos_retail_cash_requests_v2 (
 brand_slug text not null references public.brands(slug),request_key uuid not null,host_user_id uuid not null,staff_id uuid not null,
 action text not null,payload jsonb not null,result jsonb not null,primary key(brand_slug,request_key)
);
alter table public.pos_retail_cash_reserves enable row level security;
alter table public.pos_retail_cash_documents enable row level security;
alter table public.pos_retail_cash_requests_v2 enable row level security;
revoke all on public.pos_retail_cash_reserves,public.pos_retail_cash_documents,public.pos_retail_cash_requests_v2 from public,anon,authenticated,service_role;
grant select on public.pos_retail_cash_reserves,public.pos_retail_cash_documents to service_role;
create function public.pos_retail_cash_protect_v2() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='DELETE' and pg_trigger_depth()>1 then return old;end if;
 if tg_table_name='pos_cash_sessions' then
  if old.status='closed' and row(new.reserved_cash,new.declared_delivery,new.source_cash_session_id,new.received_cash,new.receipt_difference,new.receipt_reason,new.additional_cash,new.additional_cash_reason) is distinct from row(old.reserved_cash,old.declared_delivery,old.source_cash_session_id,old.received_cash,old.receipt_difference,old.receipt_reason,old.additional_cash,old.additional_cash_reason) then raise exception 'POS_CLOSED_CASH_IMMUTABLE';end if;
 elsif tg_table_name='pos_retail_cash_reserves' and tg_op='UPDATE' then
  if old.target_session_id is not null or new.target_session_id is null or
   (to_jsonb(new)-array['target_session_id','received_amount','discrepancy','reason','received_at','received_by']) is distinct from
   (to_jsonb(old)-array['target_session_id','received_amount','discrepancy','reason','received_at','received_by']) then raise exception 'POS_CASH_RESERVE_IMMUTABLE';end if;
 else raise exception 'POS_CASH_DOCUMENT_IMMUTABLE';end if;
 return new;
end $$;
create trigger pos_retail_closed_fields_v2 before update on public.pos_cash_sessions for each row execute function public.pos_retail_cash_protect_v2();
create trigger pos_retail_reserve_guard_v2 before update or delete on public.pos_retail_cash_reserves for each row execute function public.pos_retail_cash_protect_v2();
create trigger pos_retail_document_guard_v2 before update or delete on public.pos_retail_cash_documents for each row execute function public.pos_retail_cash_protect_v2();
-- Keep the existing monetary engine internal; API and reversals keep their public signature.
alter function public.pos_retail_cash_command_v1(text,uuid,uuid,text,jsonb,uuid,text) rename to pos_retail_cash_command_internal_v1;
revoke all on function public.pos_retail_cash_command_internal_v1(text,uuid,uuid,text,jsonb,uuid,text) from public,anon,authenticated,service_role;
create function public.pos_retail_cash_command_v1(p_brand_slug text,p_host_user_id uuid,p_session_id uuid,p_action text,p_payload jsonb,p_key uuid,p_authorization_hash text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor pos_staff;c pos_cash_sessions;pending pos_retail_cash_reserves;prior pos_retail_cash_requests_v2;reg pos_registers;
 result jsonb;inner_payload jsonb;counted numeric;reserve numeric;received numeric;additional numeric;delta numeric;receipt_note text;extra_reason text;source uuid;summary jsonb;totals jsonb;doc jsonb;transfers jsonb;
begin
 perform pos_require_retail_profile_v1(p_brand_slug);
 select st.* into actor from pos_staff st join pos_staff_sessions ss on ss.staff_id=st.id and ss.brand_slug=st.brand_slug
 where ss.id=p_session_id and ss.brand_slug=p_brand_slug and ss.host_user_id=p_host_user_id and ss.revoked_at is null and ss.expires_at>clock_timestamp()
 and ss.last_human_at>clock_timestamp()-interval '3 minutes' and st.active;
 if not found or not(coalesce(actor.retail_permissions,case when actor.role='ADMIN' then array['CASH','SETTINGS'] when actor.role in ('CASHIER','MANAGER') then array['CASH'] else array[]::text[] end) @> array['CASH']) then raise exception 'POS_STAFF_PERMISSION_REQUIRED';end if;
 if p_key is null or p_action not in ('open','close','movement') or jsonb_typeof(p_payload)<>'object' then raise exception 'POS_VALIDATION_ERROR';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_brand_slug||':cash:'||p_key::text,0));
 select * into prior from pos_retail_cash_requests_v2 where brand_slug=p_brand_slug and request_key=p_key;
 if found then
  if prior.staff_id<>actor.id or prior.host_user_id<>p_host_user_id or prior.action<>p_action or prior.payload<>p_payload then raise exception 'POS_IDEMPOTENCY_CONFLICT';end if;
  return prior.result;
 end if;
 if p_action='movement' then
  if p_payload->>'movementType' in ('income','deposit') and not coalesce((p_payload->>'adjustment')::boolean,false)
   and coalesce((p_payload->>'physicalContributionConfirmed')::boolean,false) is not true then raise exception 'POS_CASH_PHYSICAL_CONTRIBUTION_REQUIRED';end if;
  result:=pos_retail_cash_command_internal_v1(p_brand_slug,p_host_user_id,p_session_id,p_action,p_payload,p_key,p_authorization_hash);
 else
  -- One lock order for open/close: physical register, then turn/reserve.
  if p_action='open' then select * into reg from pos_registers where id=(p_payload->>'registerId')::uuid and brand_slug=p_brand_slug for update;
  else select r.* into reg from pos_registers r join pos_cash_sessions cs on cs.register_id=r.id where cs.id=(p_payload->>'sessionId')::uuid and cs.brand_slug=p_brand_slug and r.brand_slug=p_brand_slug for update of r;end if;
  if not found or (actor.location_id is not null and actor.location_id<>reg.location_id) then raise exception 'POS_STAFF_LOCATION_FORBIDDEN';end if;
  if p_action='open' then
   if exists(select 1 from pos_cash_sessions where register_id=reg.id and status='open') then raise exception 'POS_REGISTER_ALREADY_OPEN';end if;
   select * into pending from pos_retail_cash_reserves where register_id=reg.id and brand_slug=p_brand_slug and target_session_id is null for update;
   source:=nullif(p_payload->>'reserveSessionId','')::uuid;received:=(p_payload->>'receivedCash')::numeric;additional:=(p_payload->>'additionalCash')::numeric;
   receipt_note:=nullif(btrim(p_payload->>'receiptReason'),'');extra_reason:=nullif(btrim(p_payload->>'additionalReason'),'');
   if additional is null or additional<0 or additional>999999999999.99 or additional<>round(additional,2) or (additional>0 and coalesce(length(extra_reason),0)<3) then raise exception 'POS_CASH_ADDITIONAL_INVALID';end if;
   if pending.source_session_id is not null then
    if source is distinct from pending.source_session_id or received is null or received<0 or received>999999999999.99 or received<>round(received,2) then raise exception 'POS_CASH_RESERVE_RECEIPT_REQUIRED';end if;
    delta:=received-pending.reserved_amount;
    if delta<>0 and coalesce(length(receipt_note),0)<3 then raise exception 'POS_CASH_RECEIPT_REASON_REQUIRED';end if;
   else
    if source is not null then raise exception 'POS_CASH_RESERVE_NOT_PENDING';end if;
    -- Explicit independent opening observation, never an inferred historical transfer.
    if received is not null and (received<0 or received>999999999999.99 or received<>round(received,2) or (received>0 and coalesce(length(receipt_note),0)<3)) then raise exception 'POS_CASH_RECEIPT_REASON_REQUIRED';end if;
   end if;
   inner_payload:=jsonb_build_object('registerId',reg.id,'openingAmount',coalesce(received,0)+additional);
   result:=pos_retail_cash_command_internal_v1(p_brand_slug,p_host_user_id,p_session_id,'open',inner_payload,p_key);
   update pos_cash_sessions set source_cash_session_id=source,received_cash=received,receipt_difference=delta,receipt_reason=receipt_note,additional_cash=additional,additional_cash_reason=extra_reason where id=(result->>'id')::uuid returning * into c;
   if source is not null then
    update pos_retail_cash_reserves set target_session_id=c.id,received_amount=received,discrepancy=delta,reason=receipt_note,received_at=clock_timestamp(),received_by=actor.id where source_session_id=source and target_session_id is null;
    if not found then raise exception 'POS_CASH_RESERVE_NOT_PENDING';end if;
   end if;
   result:=to_jsonb(c);
  else
   select * into c from pos_cash_sessions where id=(p_payload->>'sessionId')::uuid and brand_slug=p_brand_slug and status='open' for update;
   if not found then raise exception 'POS_CASH_SESSION_NOT_FOUND';end if;
   counted:=(p_payload->>'countedCash')::numeric;reserve:=(p_payload->>'reservedCash')::numeric;
   if counted is null or counted<0 or counted>999999999999.99 or counted<>round(counted,2) or reserve is null or reserve<0 or reserve>counted or reserve<>round(reserve,2) then raise exception 'POS_CASH_ALLOCATION_INVALID';end if;
   update pos_cash_sessions set counted_cash=counted,reserved_cash=reserve,declared_delivery=counted-reserve where id=c.id;
   inner_payload:=jsonb_build_object('sessionId',c.id,'countedCash',counted,'notes',nullif(btrim(p_payload->>'notes'),''));
   result:=pos_retail_cash_command_internal_v1(p_brand_slug,p_host_user_id,p_session_id,'close',inner_payload,p_key);
   select cs.* into c from pos_cash_sessions cs where cs.id=(result->>'id')::uuid;
   insert into pos_retail_cash_reserves(source_session_id,brand_slug,register_id,location_id,reserved_amount,declared_at,declared_by) values(c.id,p_brand_slug,c.register_id,c.location_id,reserve,c.closed_at,actor.id);
   select to_jsonb(s)-'cash_session_id' into summary from pos_get_cash_session_summaries_v1(p_brand_slug,array[c.id],true) s;
   totals:=pos_retail_cash_totals_v1(p_brand_slug,array[c.id])->0;summary:=summary||(totals-array['id','expected']);
   select jsonb_build_object('verified',coalesce(sum(m.amount) filter(where v.verified),0),'pending',coalesce(sum(m.amount) filter(where not coalesce(v.verified,false)),0)) into transfers
   from pos_retail_money_v1 m left join lateral (select verified from pos_retail_verifications v where v.brand_slug=p_brand_slug and v.source=m.source and v.payment_id=m.id and v.created_at<=c.closed_at order by created_at desc,id desc limit 1) v on true
   where m.brand_slug=p_brand_slug and m.cash_session_id=c.id and m.method='transfer' and m.effective_at<=c.closed_at;
   select jsonb_build_object('version',2,'sessionId',c.id,'brand',coalesce(pb.display_name,b.name),'location',l.name,'register',reg.name,'operator',actor.name,'openingOperator',coalesce(st.name,'No registrado'),
   'openedAt',c.opened_at,'closedAt',c.closed_at,'currency',l.currency,'timezone',l.timezone,'opening',c.opening_amount,'expected',c.expected_cash,'counted',c.counted_cash,'difference',c.difference,
   'reservedCash',c.reserved_cash,'declaredDelivery',c.declared_delivery,'deliveryStatus','declared','summary',summary,'transfers',transfers,
   'fundReceipt',jsonb_build_object('sourceSessionId',c.source_cash_session_id,'receivedCash',c.received_cash,'difference',c.receipt_difference,'reason',c.receipt_reason,'additionalCash',c.additional_cash,'additionalReason',c.additional_cash_reason)) into doc
   from brands b join pos_locations l on l.id=c.location_id left join pos_branding pb on pb.brand_slug=b.slug left join pos_staff st on st.id=c.opening_staff_id where b.slug=p_brand_slug;
   insert into pos_retail_cash_documents values(c.id,p_brand_slug,doc);
  end if;
 end if;
 insert into pos_retail_cash_requests_v2 values(p_brand_slug,p_key,p_host_user_id,actor.id,p_action,p_payload,result);
 return result;
end $$;
revoke all on function public.pos_retail_cash_command_v1(text,uuid,uuid,text,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.pos_retail_cash_command_v1(text,uuid,uuid,text,jsonb,uuid,text) to service_role;
do $$ declare body text;begin
 body:=pg_get_functiondef('public.pos_retail_report_v1(text,date,date,uuid,uuid,uuid,uuid,text)'::regprocedure);
 if strpos(body,'c.opened_at>=start_at and c.opened_at<end_at or exists')=0 then raise exception 'POS_RETAIL_REPORT_ANCHOR_MISSING';end if;
 body:=replace(body,'select c.*,c.opening_amount','select c.*,(select d.document from pos_retail_cash_documents d where d.session_id=c.id and d.brand_slug=p_brand) close_snapshot,(select to_jsonb(r) from pos_retail_cash_reserves r where r.source_session_id=c.id and r.brand_slug=p_brand) reserve_receipt,c.opening_amount');
 body:=replace(body,'c.opened_at>=start_at and c.opened_at<end_at or exists','c.opened_at>=start_at and c.opened_at<end_at or c.closed_at>=start_at and c.closed_at<end_at or exists');execute body;
end $$;
-- Fail closed if new application code reaches a database not migrated yet.
create function public.pos_retail_cash_contract_v2() returns integer language sql immutable as $$ select 2 $$;
revoke all on function public.pos_retail_cash_contract_v2() from public,anon,authenticated;
grant execute on function public.pos_retail_cash_contract_v2() to service_role;
notify pgrst, 'reload schema';
-- Host-authenticated direct reads cannot bypass PIN-aware API redaction.
-- Existing clients read these ledgers through server routes, including FOOD.
revoke select on public.pos_cash_sessions,public.pos_cash_movements,public.pos_payments from public,anon,authenticated;
grant select on public.pos_cash_sessions,public.pos_cash_movements,public.pos_payments to service_role;
commit;
