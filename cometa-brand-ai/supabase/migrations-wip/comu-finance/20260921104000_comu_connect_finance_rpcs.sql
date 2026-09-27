create function public.comu_release_eligible_seller_funds(p_seller_id uuid) returns integer
language plpgsql security definer set search_path=public as $$
declare a public.comu_payment_allocations%rowtype; n integer:=0;
begin
  for a in select * from public.comu_payment_allocations where seller_id=p_seller_id and status='HELD' order by id for update loop
    if exists(select 1 from public.comu_payment_intents p join public.comu_order_suborders s on s.order_id=p.order_id
      where p.id=a.payment_id and p.status='SUCCEEDED' and s.id=a.suborder_id and s.status='DELIVERED' and s.guarantee_expires_at<=now())
      and not exists(select 1 from public.comu_seller_fund_holds where allocation_id=a.id and status='ACTIVE') then
      insert into public.comu_seller_ledger_entries(seller_id,payment_id,allocation_id,entry_type,amount_cents,currency)
        select a.seller_id,a.payment_id,a.id,'SALE_AVAILABLE',a.seller_net_amount_cents,currency from public.comu_payment_intents where id=a.payment_id
        on conflict(allocation_id,entry_type) do nothing;
      update public.comu_payment_allocations set status='AVAILABLE' where id=a.id;
      insert into public.comu_financial_events(seller_id,allocation_id,event_type,idempotency_key) values(a.seller_id,a.id,'SALE_AVAILABLE',a.id::text||':available') on conflict do nothing;
      n:=n+1;
    end if;
  end loop;
  return n;
end; $$;

create function public.comu_create_daily_settlements(p_seller_id uuid) returns public.comu_seller_settlements
language plpgsql security definer set search_path=public as $$
declare account public.comu_seller_payment_accounts%rowtype; s public.comu_seller_settlements%rowtype; ids uuid[]; total bigint; day date:=(now() at time zone 'America/Mexico_City')::date;
begin
  -- Account lock serializes daily creation for a seller; allocation locks serialize holds/releases.
  select * into strict account from public.comu_seller_payment_accounts where seller_id=p_seller_id for update;
  select * into s from public.comu_seller_settlements where seller_id=p_seller_id and settlement_day=day and currency='MXN';
  if found then return s; end if;
  if account.onboarding_status<>'COMPLETE' or not account.transfers_enabled or account.financial_suspended or account.stripe_account_id is null
    or not exists(select 1 from public.comu_sellers where id=p_seller_id and status='ACTIVE') then raise exception 'COMU_SELLER_NOT_SETTLEABLE'; end if;
  select array_agg(id),sum(seller_net_amount_cents) into ids,total from (
    select a.id,a.seller_net_amount_cents from public.comu_payment_allocations a
    join public.comu_payment_intents p on p.id=a.payment_id
    where a.seller_id=p_seller_id and a.status='AVAILABLE' and p.status='SUCCEEDED' and p.currency='MXN'
    and not exists(select 1 from public.comu_seller_fund_holds h where h.allocation_id=a.id and h.status='ACTIVE')
    order by a.id for update of a) eligible;
  if coalesce(total,0)<=0 then return null; end if;
  -- Recheck after acquiring locks in case a hold committed while we waited.
  if exists(select 1 from public.comu_seller_fund_holds where allocation_id=any(ids) and status='ACTIVE') then raise exception 'COMU_FUNDS_FROZEN'; end if;
  insert into public.comu_seller_settlements(seller_id,settlement_day,currency,amount_cents,stripe_account_id)
    values(p_seller_id,day,'MXN',total,account.stripe_account_id) returning * into s;
  insert into public.comu_seller_settlement_items(settlement_id,allocation_id,seller_id,amount_cents)
    select s.id,id,seller_id,seller_net_amount_cents from public.comu_payment_allocations where id=any(ids);
  update public.comu_payment_allocations set status='PENDING_TRANSFER' where id=any(ids);
  insert into public.comu_financial_events(seller_id,settlement_id,event_type,idempotency_key) values(p_seller_id,s.id,'SETTLEMENT_CREATED',s.id::text||':created');
  return s;
end; $$;

create function public.comu_claim_transfer(p_settlement_id uuid) returns public.comu_seller_settlements
language plpgsql security definer set search_path=public as $$
declare s public.comu_seller_settlements%rowtype;
begin
  select * into strict s from public.comu_seller_settlements where id=p_settlement_id for update;
  if s.status='TRANSFERRED' then return s; end if;
  if s.status='CANCELLED' or not s.retryable then raise exception 'COMU_SETTLEMENT_NOT_RETRYABLE'; end if;
  -- Stripe retains idempotency keys at least 24 hours. Never blindly retry past that window.
  if s.first_attempt_at < now()-interval '23 hours' then raise exception 'COMU_TRANSFER_RECONCILIATION_REQUIRED'; end if;
  if s.status='PROCESSING' and s.updated_at>now()-interval '2 minutes' then raise exception 'COMU_TRANSFER_IN_PROGRESS'; end if;
  if not exists(select 1 from public.comu_seller_payment_accounts a join public.comu_sellers seller on seller.id=a.seller_id
    where a.seller_id=s.seller_id and a.stripe_account_id=s.stripe_account_id and a.onboarding_status='COMPLETE' and a.transfers_enabled and not a.financial_suspended and seller.status='ACTIVE') then raise exception 'COMU_SELLER_NOT_SETTLEABLE'; end if;
  if exists(select 1 from public.comu_seller_settlement_items i join public.comu_payment_allocations a on a.id=i.allocation_id
    join public.comu_payment_intents p on p.id=a.payment_id where i.settlement_id=s.id and (a.status<>'PENDING_TRANSFER' or p.status<>'SUCCEEDED')) then raise exception 'COMU_SETTLEMENT_FUNDS_CHANGED'; end if;
  if exists(select 1 from public.comu_seller_settlement_items i join public.comu_seller_fund_holds h on h.allocation_id=i.allocation_id where i.settlement_id=s.id and h.status='ACTIVE') then raise exception 'COMU_FUNDS_FROZEN'; end if;
  update public.comu_seller_settlements set status='PROCESSING',first_attempt_at=coalesce(first_attempt_at,now()),attempt_count=attempt_count+1,updated_at=now() where id=s.id returning * into s;
  insert into public.comu_financial_events(seller_id,settlement_id,event_type,idempotency_key) values(s.seller_id,s.id,'TRANSFER_CREATED',s.id::text||':attempt:'||s.attempt_count);
  return s;
end; $$;

create function public.comu_finish_transfer(p_settlement_id uuid,p_transfer_id text,p_amount_cents bigint,p_currency text,p_destination text) returns public.comu_seller_settlements
language plpgsql security definer set search_path=public as $$
declare s public.comu_seller_settlements%rowtype;
begin
  select * into strict s from public.comu_seller_settlements where id=p_settlement_id for update;
  if p_amount_cents<>s.amount_cents or upper(p_currency)<>s.currency or p_destination<>s.stripe_account_id or p_transfer_id is null then raise exception 'COMU_TRANSFER_MISMATCH'; end if;
  if s.status='TRANSFERRED' then
    if s.stripe_transfer_id<>p_transfer_id then raise exception 'COMU_TRANSFER_MISMATCH'; end if;
    return s;
  end if;
  if s.status not in ('PROCESSING','FAILED') then raise exception 'COMU_TRANSFER_NOT_STARTED'; end if;
  insert into public.comu_seller_ledger_entries(seller_id,payment_id,allocation_id,settlement_id,entry_type,amount_cents,currency)
    select a.seller_id,a.payment_id,a.id,s.id,'TRANSFER',i.amount_cents,s.currency from public.comu_seller_settlement_items i join public.comu_payment_allocations a on a.id=i.allocation_id where i.settlement_id=s.id
    on conflict(allocation_id,entry_type) do nothing;
  update public.comu_payment_allocations set status='TRANSFERRED' where id in (select allocation_id from public.comu_seller_settlement_items where settlement_id=s.id);
  update public.comu_seller_settlements set status='TRANSFERRED',stripe_transfer_id=p_transfer_id,last_error=null,retryable=false,updated_at=now() where id=s.id returning * into s;
  insert into public.comu_financial_events(seller_id,settlement_id,event_type,idempotency_key) values(s.seller_id,s.id,'TRANSFER_SUCCEEDED',s.id::text||':succeeded') on conflict do nothing;
  return s;
end; $$;

create function public.comu_fail_transfer(p_settlement_id uuid,p_reason text,p_retryable boolean) returns void
language plpgsql security definer set search_path=public as $$
declare s public.comu_seller_settlements%rowtype;
begin
  select * into strict s from public.comu_seller_settlements where id=p_settlement_id for update;
  if s.status='TRANSFERRED' then return; end if;
  update public.comu_seller_settlements set status='FAILED',last_error=left(p_reason,100),retryable=p_retryable,updated_at=now() where id=s.id;
  insert into public.comu_financial_events(seller_id,settlement_id,event_type,idempotency_key,payload) values(s.seller_id,s.id,'TRANSFER_FAILED',s.id::text||':failed:'||s.attempt_count,jsonb_build_object('reason',left(p_reason,100))) on conflict do nothing;
end; $$;

revoke all on function public.comu_release_eligible_seller_funds(uuid),public.comu_create_daily_settlements(uuid),public.comu_claim_transfer(uuid),public.comu_finish_transfer(uuid,text,bigint,text,text),public.comu_fail_transfer(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.comu_release_eligible_seller_funds(uuid),public.comu_create_daily_settlements(uuid),public.comu_claim_transfer(uuid),public.comu_finish_transfer(uuid,text,bigint,text,text),public.comu_fail_transfer(uuid,text,boolean) to service_role;
