-- Transactional marketplace lifecycle. Migration 1-7 remain immutable.
alter table public.comu_payment_economics
  add column if not exists buyer_paid_shipping_cents bigint not null default 0 check (buyer_paid_shipping_cents >= 0),
  add column if not exists seller_funded_shipping_cents bigint not null default 0 check (seller_funded_shipping_cents >= 0),
  add column if not exists cometa_funded_shipping_cents bigint not null default 0 check (cometa_funded_shipping_cents >= 0),
  add column if not exists seller_funded_discount_cents bigint not null default 0 check (seller_funded_discount_cents >= 0),
  add column if not exists cometa_funded_discount_cents bigint not null default 0 check (cometa_funded_discount_cents >= 0),
  add column if not exists finance_ready boolean not null default true,
  add column if not exists attribution_note text;
alter table public.comu_dispute_allocations
  add column if not exists hold_id uuid references public.comu_seller_fund_holds(id),
  add column if not exists resolved_at timestamptz;
create index if not exists comu_dispute_allocations_hold_idx on public.comu_dispute_allocations(hold_id);

create or replace view public.comu_seller_negative_balances as
select seller_id, currency,
  greatest(0, sum(case when liability_owner = 'SELLER' and balance_effect = 'INCREASE' then amount_cents when liability_owner = 'SELLER' and balance_effect = 'DECREASE' then -amount_cents else 0 end))::bigint as balance_due_cents
from public.comu_seller_liability_events
group by seller_id, currency;

create or replace function public.comu_record_liability_event(
  p_seller_id uuid, p_amount_cents bigint, p_event_type text, p_balance_effect text,
  p_source_type text, p_source_id text, p_liability_owner text, p_reason_code text,
  p_idempotency_key text, p_master_order_id uuid default null, p_suborder_id uuid default null,
  p_note text default null, p_actor_id uuid default null
) returns public.comu_seller_liability_events
language plpgsql security definer set search_path = public as $$
declare v_event public.comu_seller_liability_events%rowtype;
begin
  insert into public.comu_seller_liability_events(seller_id,amount_cents,event_type,balance_effect,source_type,source_id,liability_owner,reason_code,idempotency_key,master_order_id,suborder_id,note,actor_id)
  values(p_seller_id,p_amount_cents,p_event_type,p_balance_effect,p_source_type,p_source_id,p_liability_owner,p_reason_code,p_idempotency_key,p_master_order_id,p_suborder_id,p_note,p_actor_id)
  on conflict(idempotency_key) do update set id=public.comu_seller_liability_events.id returning * into v_event;
  return v_event;
end; $$;

create or replace function public.comu_open_dispute(
  p_stripe_dispute_id text,
  p_payment_id uuid,
  p_stripe_charge_id text,
  p_amount_cents bigint,
  p_currency text,
  p_reason text,
  p_allocation_exposure jsonb,
  p_idempotency_key text,
  p_actor_id uuid default null
) returns public.comu_disputes
language plpgsql security definer set search_path=public as $$
declare d public.comu_disputes%rowtype; row jsonb; a public.comu_payment_allocations%rowtype; h public.comu_seller_fund_holds%rowtype;
begin
  select * into d from public.comu_disputes where stripe_dispute_id=p_stripe_dispute_id for update;
  if found then return d; end if;
  if p_amount_cents <= 0 then raise exception 'COMU_DISPUTE_AMOUNT_INVALID'; end if;
  insert into public.comu_disputes(stripe_dispute_id,stripe_charge_id,payment_id,amount_cents,currency,reason,status)
    values(p_stripe_dispute_id,p_stripe_charge_id,p_payment_id,p_amount_cents,upper(p_currency),p_reason,'OPEN') returning * into d;
  for row in select value from jsonb_array_elements(coalesce(p_allocation_exposure,'[]'::jsonb)) loop
    select * into strict a from public.comu_payment_allocations where id=(row->>'allocationId')::uuid and payment_id=p_payment_id for update;
    insert into public.comu_dispute_allocations(dispute_id,payment_allocation_id,seller_id,exposed_principal_cents,liability_owner,attribution_status)
      values(d.id,a.id,a.seller_id,(row->>'exposedCents')::bigint,'SELLER','ATTRIBUTION_REQUIRED');
    select * into h from public.comu_set_fund_hold(a.id,false,'DISPUTE_EXPOSURE',p_actor_id);
    update public.comu_dispute_allocations set hold_id=h.id where dispute_id=d.id and payment_allocation_id=a.id;
  end loop;
  insert into public.comu_financial_events(seller_id,event_type,actor_id,idempotency_key,payload)
    select a.seller_id,'DISPUTE_OPENED',p_actor_id,coalesce(p_idempotency_key,d.id::text)||':'||a.id::text,jsonb_build_object('dispute_id',d.id)
    from public.comu_dispute_allocations da join public.comu_payment_allocations pa on pa.id=da.payment_allocation_id where da.dispute_id=d.id
    on conflict(idempotency_key) do nothing;
  return d;
end; $$;

create or replace function public.comu_resolve_dispute(
  p_dispute_id uuid,
  p_outcome text,
  p_liability_owner text,
  p_reason_code text,
  p_note text,
  p_actual_cost_cents bigint default 0,
  p_actor_id uuid default null,
  p_idempotency_key text default null
) returns public.comu_disputes
language plpgsql security definer set search_path=public as $$
declare d public.comu_disputes%rowtype; da record; owner text;
begin
  select * into strict d from public.comu_disputes where id=p_dispute_id for update;
  if d.status in ('WON','LOST','CLOSED') then return d; end if;
  if p_outcome not in ('WON','LOST') then raise exception 'COMU_DISPUTE_OUTCOME_INVALID'; end if;
  if p_outcome='LOST' and p_liability_owner not in ('SELLER','COMETA') then raise exception 'COMU_DISPUTE_OWNER_REQUIRED'; end if;
  if p_actual_cost_cents < 0 then raise exception 'COMU_DISPUTE_COST_INVALID'; end if;
  update public.comu_disputes set status=p_outcome, outcome=p_outcome, resolved_at=now(), actual_dispute_cost_cents=p_actual_cost_cents, updated_at=now() where id=d.id returning * into d;
  for da in select * from public.comu_dispute_allocations where dispute_id=d.id for update loop
    if da.hold_id is not null then perform public.comu_set_fund_hold(da.payment_allocation_id,true,'DISPUTE_RESOLVED',p_actor_id); end if;
    if p_outcome='WON' then
      update public.comu_dispute_allocations set attribution_status='NONE',permanent_liability_cents=0,dispute_cost_share_cents=0,resolved_at=now() where id=da.id;
    else
      owner:=p_liability_owner;
      update public.comu_dispute_allocations set liability_owner=owner,attribution_status=owner,permanent_liability_cents=case when owner='SELLER' then exposed_principal_cents else 0 end,dispute_cost_share_cents=case when owner='SELLER' then coalesce(p_actual_cost_cents,0) else 0 end,admin_actor_id=p_actor_id,admin_reason=p_reason_code,resolved_at=now() where id=da.id;
      if owner='SELLER' then
        perform public.comu_record_liability_event(da.seller_id,da.exposed_principal_cents+coalesce(p_actual_cost_cents,0),'LIABILITY_CREATED','INCREASE','DISPUTE',d.id::text,'SELLER',p_reason_code,coalesce(p_idempotency_key,d.id::text||':seller:'||da.id::text),null,(select suborder_id from public.comu_payment_allocations where id=da.payment_allocation_id),p_note,p_actor_id);
      else
        insert into public.comu_financial_events(seller_id,event_type,actor_id,idempotency_key,payload) values(da.seller_id,'COMETA_LIABILITY_ASSIGNED',p_actor_id,coalesce(p_idempotency_key,d.id::text||':cometa:'||da.id::text),jsonb_build_object('dispute_id',d.id,'reason_code',p_reason_code,'note',p_note)) on conflict do nothing;
      end if;
    end if;
  end loop;
  insert into public.comu_financial_events(seller_id,event_type,actor_id,idempotency_key,payload)
    select da.seller_id,case when p_outcome='WON' then 'DISPUTE_WON' else 'DISPUTE_LOST' end,p_actor_id,coalesce(p_idempotency_key,d.id::text||':'||lower(p_outcome)),jsonb_build_object('dispute_id',d.id,'owner',p_liability_owner,'reason_code',p_reason_code)
    from public.comu_dispute_allocations x where x.dispute_id=d.id on conflict do nothing;
  return d;
end; $$;

create or replace function public.comu_set_financial_liability_owner(
  p_dispute_allocation_id uuid,
  p_liability_owner text,
  p_reason_code text,
  p_note text,
  p_actor_id uuid,
  p_idempotency_key text
) returns public.comu_dispute_allocations
language plpgsql security definer set search_path=public as $$
declare da public.comu_dispute_allocations%rowtype;
begin
  if p_liability_owner not in ('SELLER','COMETA') or p_reason_code not in ('COMETA_DUPLICATE_CHARGE','COMETA_INCORRECT_AMOUNT','COMETA_SYSTEM_ERROR','ADMIN_CORRECTION') then raise exception 'COMU_LIABILITY_OVERRIDE_INVALID'; end if;
  select * into strict da from public.comu_dispute_allocations where id=p_dispute_allocation_id for update;
  if da.attribution_status not in ('ATTRIBUTION_REQUIRED','SELLER','COMETA') then raise exception 'COMU_LIABILITY_OVERRIDE_NOT_ALLOWED'; end if;
  update public.comu_dispute_allocations set liability_owner=p_liability_owner,attribution_status=p_liability_owner,admin_actor_id=p_actor_id,admin_reason=p_reason_code where id=da.id returning * into da;
  insert into public.comu_financial_events(seller_id,event_type,actor_id,idempotency_key,payload) values(da.seller_id,'LIABILITY_OWNER_OVERRIDE',p_actor_id,p_idempotency_key,jsonb_build_object('dispute_allocation_id',da.id,'owner',p_liability_owner,'reason_code',p_reason_code,'note',p_note)) on conflict do nothing;
  return da;
end; $$;

create or replace function public.comu_request_refund(
  p_payment_id uuid, p_master_order_id uuid, p_amount_cents bigint, p_reason text, p_idempotency_key text, p_allocations jsonb
) returns public.comu_refunds
language plpgsql security definer set search_path=public as $$
declare r public.comu_refunds%rowtype; row jsonb; total bigint:=0; a public.comu_payment_allocations%rowtype;
begin
  select * into r from public.comu_refunds where idempotency_key=p_idempotency_key for update;
  if found then return r; end if;
  if p_amount_cents<=0 then raise exception 'COMU_REFUND_AMOUNT_INVALID'; end if;
  for row in select value from jsonb_array_elements(p_allocations) loop
    total:=total+(row->>'principalCents')::bigint+(coalesce((row->>'shippingCents')::bigint,0));
    select * into strict a from public.comu_payment_allocations where id=(row->>'allocationId')::uuid and payment_id=p_payment_id for update;
  end loop;
  if total<>p_amount_cents then raise exception 'COMU_REFUND_ALLOCATION_MISMATCH'; end if;
  insert into public.comu_refunds(payment_id,master_order_id,amount_cents,reason,idempotency_key) values(p_payment_id,p_master_order_id,p_amount_cents,p_reason,p_idempotency_key) returning * into r;
  for row in select value from jsonb_array_elements(p_allocations) loop
    select * into strict a from public.comu_payment_allocations where id=(row->>'allocationId')::uuid;
    insert into public.comu_refund_allocations(refund_id,payment_allocation_id,seller_id,principal_cents,shipping_cents,liability_owner) values(r.id,a.id,a.seller_id,(row->>'principalCents')::bigint,coalesce((row->>'shippingCents')::bigint,0),'SELLER');
  end loop;
  return r;
end; $$;

create or replace function public.comu_finalize_refund_success(p_refund_id uuid,p_stripe_refund_id text,p_actor_id uuid default null) returns public.comu_refunds
language plpgsql security definer set search_path=public as $$
declare r public.comu_refunds%rowtype; ra record; transferred boolean;
begin
  select * into strict r from public.comu_refunds where id=p_refund_id for update;
  if r.status='SUCCEEDED' then return r; end if;
  update public.comu_refunds set status='SUCCEEDED',stripe_refund_id=p_stripe_refund_id,finalized_at=now() where id=r.id returning * into r;
  for ra in select * from public.comu_refund_allocations where refund_id=r.id for update loop
    select exists(select 1 from public.comu_payment_allocations where id=ra.payment_allocation_id and status='TRANSFERRED') into transferred;
    if transferred then
      insert into public.comu_transfer_reversals(stripe_transfer_id,seller_id,master_order_id,refund_id,amount_cents,reason,idempotency_key) select coalesce(s.stripe_transfer_id,''),ra.seller_id,r.master_order_id,r.id,ra.principal_cents+ra.shipping_cents,'REFUND',r.id::text||':'||ra.id::text from public.comu_seller_settlement_items si join public.comu_seller_settlements s on s.id=si.settlement_id where si.allocation_id=ra.payment_allocation_id;
      insert into public.comu_financial_events(seller_id,event_type,actor_id,idempotency_key,payload) values(ra.seller_id,'REVERSAL_REQUIRED',p_actor_id,r.id::text||':reversal:'||ra.id::text,jsonb_build_object('refund_id',r.id,'amount_cents',ra.principal_cents+ra.shipping_cents)) on conflict do nothing;
    else
      update public.comu_payment_economics set refund_liability_cents=refund_liability_cents+ra.principal_cents+ra.shipping_cents,updated_at=now() where allocation_id=ra.payment_allocation_id;
      update public.comu_payment_allocations set status='REFUNDED' where id=ra.payment_allocation_id and status<>'TRANSFERRED';
    end if;
    update public.comu_refund_allocations set status='FINALIZED' where id=ra.id;
  end loop;
  return r;
end; $$;

create or replace function public.comu_finalize_refund_failure(p_refund_id uuid,p_reason text,p_actor_id uuid default null) returns public.comu_refunds
language plpgsql security definer set search_path=public as $$
declare r public.comu_refunds%rowtype;
begin
  select * into strict r from public.comu_refunds where id=p_refund_id for update;
  if r.status='SUCCEEDED' then return r; end if;
  update public.comu_refunds set status='FAILED',reason=left(coalesce(p_reason,reason),240) where id=r.id returning * into r;
  insert into public.comu_financial_events(seller_id,event_type,actor_id,idempotency_key,payload)
    select ra.seller_id,'REFUND_FAILED',p_actor_id,r.id::text||':failed:'||ra.id::text,jsonb_build_object('refund_id',r.id) from public.comu_refund_allocations ra where ra.refund_id=r.id on conflict do nothing;
  return r;
end; $$;

create or replace function public.comu_recover_seller_liability(p_seller_id uuid,p_settlement_cents bigint,p_idempotency_key text,p_actor_id uuid default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare due bigint:=0; recover bigint:=0; v record;
begin
  select coalesce(balance_due_cents,0) into due from public.comu_seller_negative_balances where seller_id=p_seller_id and currency='MXN';
  recover:=least(greatest(due,0),greatest(p_settlement_cents,0));
  if recover>0 then perform public.comu_record_liability_event(p_seller_id,recover,'LIABILITY_RECOVERED','DECREASE','SETTLEMENT',p_idempotency_key,'SELLER','SETTLEMENT_RECOVERY',p_idempotency_key,null,null,null,p_actor_id); end if;
  return jsonb_build_object('recovered_cents',recover,'transfer_candidate_cents',greatest(p_settlement_cents,0)-recover,'remaining_balance_due_cents',greatest(due-recover,0));
end; $$;

revoke all on function public.comu_open_dispute(text,uuid,text,bigint,text,text,jsonb,text,uuid),public.comu_resolve_dispute(uuid,text,text,text,text,bigint,uuid,text),public.comu_set_financial_liability_owner(uuid,text,text,text,uuid,text),public.comu_request_refund(uuid,uuid,bigint,text,text,jsonb),public.comu_finalize_refund_success(uuid,text,uuid),public.comu_finalize_refund_failure(uuid,text,uuid),public.comu_recover_seller_liability(uuid,bigint,text,uuid) from public,anon,authenticated;
grant execute on function public.comu_open_dispute(text,uuid,text,bigint,text,text,jsonb,text,uuid),public.comu_resolve_dispute(uuid,text,text,text,text,bigint,uuid,text),public.comu_set_financial_liability_owner(uuid,text,text,text,uuid,text),public.comu_request_refund(uuid,uuid,bigint,text,text,jsonb),public.comu_finalize_refund_success(uuid,text,uuid),public.comu_finalize_refund_failure(uuid,text,uuid),public.comu_recover_seller_liability(uuid,bigint,text,uuid) to service_role;

create policy comu_refunds_seller on public.comu_refunds for select to authenticated using (public.is_cometa_admin() or exists(select 1 from public.comu_payment_allocations a join public.comu_refund_allocations ra on ra.payment_allocation_id=a.id join public.comu_seller_memberships m on m.seller_id=a.seller_id where ra.refund_id=comu_refunds.id and m.user_id=auth.uid() and m.active));
create policy comu_disputes_seller on public.comu_disputes for select to authenticated using (public.is_cometa_admin() or exists(select 1 from public.comu_dispute_allocations da join public.comu_seller_memberships m on m.seller_id=da.seller_id where da.dispute_id=comu_disputes.id and m.user_id=auth.uid() and m.active));
