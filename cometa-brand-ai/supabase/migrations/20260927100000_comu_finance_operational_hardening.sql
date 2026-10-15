-- Block 3B.7: additive operational hardening; migrations 1-10 remain immutable.
alter table public.stripe_webhook_events
  add column if not exists attempt_count integer not null default 0 check (attempt_count >= 0),
  add column if not exists last_attempt_at timestamptz,
  add column if not exists next_retry_at timestamptz,
  add column if not exists processing_started_at timestamptz,
  add column if not exists manual_review_required boolean not null default false,
  add column if not exists manual_review_reason text;
create index if not exists stripe_webhook_events_retry_idx on public.stripe_webhook_events(status, manual_review_required, next_retry_at);
create index if not exists stripe_webhook_events_processing_idx on public.stripe_webhook_events(status, processing_started_at);

create or replace function public.comu_claim_stripe_webhook_event(
  p_stripe_event_id text,
  p_livemode boolean,
  p_claimed_at timestamptz,
  p_stale_before timestamptz,
  p_max_attempts integer
) returns text
language plpgsql security definer set search_path=public as $$
declare r public.stripe_webhook_events%rowtype;
begin
  if p_max_attempts < 1 then raise exception 'COMU_WEBHOOK_MAX_ATTEMPTS_INVALID'; end if;
  select * into r from public.stripe_webhook_events
    where stripe_event_id=p_stripe_event_id and livemode=p_livemode for update;
  if not found then return 'MISSING'; end if;
  if r.status='processed' then return 'ALREADY_PROCESSED'; end if;
  if r.manual_review_required then return 'MANUAL_REVIEW'; end if;
  if r.status='received' and r.processed_at is not null and r.processed_at >= p_stale_before then return 'ALREADY_PROCESSING'; end if;
  if coalesce(r.attempt_count,0) >= p_max_attempts then
    update public.stripe_webhook_events set manual_review_required=true, manual_review_reason='WEBHOOK_RETRY_EXHAUSTED', next_retry_at=null where stripe_event_id=p_stripe_event_id and livemode=p_livemode;
    return 'MANUAL_REVIEW';
  end if;
  update public.stripe_webhook_events set status='received', processed_at=p_claimed_at, processing_started_at=p_claimed_at, last_attempt_at=p_claimed_at, attempt_count=coalesce(attempt_count,0)+1, next_retry_at=null, error_message=null where stripe_event_id=p_stripe_event_id and livemode=p_livemode;
  return case when r.status='failed' then 'CLAIMED_RETRY' else 'CLAIMED_NEW' end;
end; $$;
revoke all on function public.comu_claim_stripe_webhook_event(text,boolean,timestamptz,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.comu_claim_stripe_webhook_event(text,boolean,timestamptz,timestamptz,integer) to service_role;

alter table public.comu_shipments
  add column if not exists final_provider_cost_cents bigint check (final_provider_cost_cents is null or final_provider_cost_cents >= 0),
  add column if not exists final_provider_cost_finalized_at timestamptz,
  add column if not exists final_provider_cost_source text,
  add column if not exists final_provider_cost_idempotency_key text unique;

alter table public.comu_order_shipping_economics
  add column if not exists quoted_provider_cost_cents bigint check (quoted_provider_cost_cents is null or quoted_provider_cost_cents >= 0),
  add column if not exists final_provider_cost_cents bigint check (final_provider_cost_cents is null or final_provider_cost_cents >= 0),
  add column if not exists provider_cost_status text not null default 'ESTIMATED' check (provider_cost_status in ('ESTIMATED','FINALIZED','REVIEW')),
  add column if not exists final_cost_idempotency_key text unique;

create or replace function public.comu_ingest_final_provider_shipping_cost(
  p_shipment_id uuid,
  p_final_provider_cost_cents bigint,
  p_source text,
  p_idempotency_key text
) returns public.comu_order_shipping_economics
language plpgsql security definer set search_path=public as $$
declare s public.comu_shipments%rowtype; e public.comu_order_shipping_economics%rowtype;
begin
  if p_final_provider_cost_cents < 0 or p_source is null or p_idempotency_key is null then raise exception 'COMU_FINAL_PROVIDER_COST_INVALID'; end if;
  select * into strict s from public.comu_shipments where id=p_shipment_id for update;
  select * into strict e from public.comu_order_shipping_economics where source_shipment_id=p_shipment_id for update;
  if e.provider_cost_status='FINALIZED' then
    if e.final_provider_cost_cents is distinct from p_final_provider_cost_cents or e.final_cost_idempotency_key is distinct from p_idempotency_key then raise exception 'COMU_FINAL_PROVIDER_COST_IMMUTABLE'; end if;
    return e;
  end if;
  if e.funding_status='FINALIZED' and e.provider_shipping_cost_cents is distinct from p_final_provider_cost_cents then
    raise exception 'COMU_FINAL_PROVIDER_COST_LATE_REVIEW';
  end if;
  update public.comu_shipments set final_provider_cost_cents=p_final_provider_cost_cents, final_provider_cost_finalized_at=now(), final_provider_cost_source=p_source, final_provider_cost_idempotency_key=p_idempotency_key, updated_at=now() where id=p_shipment_id;
  update public.comu_order_shipping_economics set quoted_provider_cost_cents=coalesce(quoted_provider_cost_cents,provider_shipping_cost_cents), final_provider_cost_cents=p_final_provider_cost_cents, provider_shipping_cost_cents=p_final_provider_cost_cents, shipping_variance_cents=p_final_provider_cost_cents-buyer_shipping_paid_cents-seller_funded_shipping_cents-cometa_funded_shipping_cents, provider_cost_status='FINALIZED', final_cost_idempotency_key=p_idempotency_key, finalized_at=coalesce(finalized_at,now()), updated_at=now() where id=e.id returning * into e;
  update public.comu_payment_economics pe
    set shipping_finance_ready=true,
        finance_ready=(pi.stripe_fee_finalized_at is not null and pe.discount_finance_ready),
        updated_at=now()
    from public.comu_payment_intents pi
    where pe.shipping_economics_id=e.id and pi.id=pe.payment_id;
  return e;
end; $$;
revoke all on function public.comu_ingest_final_provider_shipping_cost(uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.comu_ingest_final_provider_shipping_cost(uuid,bigint,text,text) to service_role;
