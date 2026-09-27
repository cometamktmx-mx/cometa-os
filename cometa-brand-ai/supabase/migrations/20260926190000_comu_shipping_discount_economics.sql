-- Marketplace shipping and discount economics. Additive, local-first, integer cents.
-- Finance migrations 1-8 remain immutable.

create table if not exists public.comu_order_shipping_economics (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.comu_orders(id) on delete cascade,
  payment_id uuid references public.comu_payment_intents(id) on delete set null,
  provider_shipping_cost_cents bigint not null check (provider_shipping_cost_cents >= 0),
  buyer_shipping_paid_cents bigint not null check (buyer_shipping_paid_cents >= 0),
  seller_funded_shipping_cents bigint not null default 0 check (seller_funded_shipping_cents >= 0),
  cometa_funded_shipping_cents bigint not null default 0 check (cometa_funded_shipping_cents >= 0),
  shipping_variance_cents bigint not null default 0,
  funding_status text not null default 'PENDING' check (funding_status in ('PENDING','FINALIZED','NOT_APPLICABLE')),
  source_quote_id uuid references public.comu_shipping_quotes(id) on delete set null,
  source_shipment_id uuid references public.comu_shipments(id) on delete set null,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (provider_shipping_cost_cents = buyer_shipping_paid_cents + seller_funded_shipping_cents + cometa_funded_shipping_cents + shipping_variance_cents),
  check ((funding_status = 'FINALIZED' and finalized_at is not null) or funding_status <> 'FINALIZED')
);

create table if not exists public.comu_order_discount_economics (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.comu_orders(id) on delete cascade,
  payment_id uuid references public.comu_payment_intents(id) on delete set null,
  discount_total_cents bigint not null default 0 check (discount_total_cents >= 0),
  seller_discount_funded_cents bigint not null default 0 check (seller_discount_funded_cents >= 0),
  cometa_discount_funded_cents bigint not null default 0 check (cometa_discount_funded_cents >= 0),
  embedded_price_discount_cents bigint not null default 0 check (embedded_price_discount_cents >= 0),
  funding_status text not null default 'UNKNOWN' check (funding_status in ('KNOWN','UNKNOWN','NOT_APPLICABLE')),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (seller_discount_funded_cents + cometa_discount_funded_cents <= discount_total_cents),
  check ((funding_status = 'KNOWN' and finalized_at is not null) or funding_status <> 'KNOWN')
);

alter table public.comu_payment_economics
  add column if not exists shipping_economics_id uuid references public.comu_order_shipping_economics(id),
  add column if not exists discount_economics_id uuid references public.comu_order_discount_economics(id),
  add column if not exists embedded_price_discount_cents bigint not null default 0 check (embedded_price_discount_cents >= 0),
  add column if not exists shipping_finance_ready boolean not null default false,
  add column if not exists discount_finance_ready boolean not null default false;
alter table public.comu_payment_economics alter column finance_ready set default false;
update public.comu_payment_economics
set finance_ready = false
where shipping_economics_id is null or discount_economics_id is null;

create index if not exists comu_order_shipping_economics_payment_idx on public.comu_order_shipping_economics(payment_id);
create index if not exists comu_order_discount_economics_payment_idx on public.comu_order_discount_economics(payment_id);
create index if not exists comu_payment_economics_shipping_idx on public.comu_payment_economics(shipping_economics_id);
create index if not exists comu_payment_economics_discount_idx on public.comu_payment_economics(discount_economics_id);

create or replace function public.comu_shipping_discount_immutable_v1()
returns trigger language plpgsql as $$
begin
  if old.funding_status = 'FINALIZED' and (
    new.provider_shipping_cost_cents is distinct from old.provider_shipping_cost_cents or
    new.buyer_shipping_paid_cents is distinct from old.buyer_shipping_paid_cents or
    new.seller_funded_shipping_cents is distinct from old.seller_funded_shipping_cents or
    new.cometa_funded_shipping_cents is distinct from old.cometa_funded_shipping_cents or
    new.shipping_variance_cents is distinct from old.shipping_variance_cents
  ) then raise exception 'COMU_SHIPPING_ECONOMICS_IMMUTABLE'; end if;
  return new;
end $$;
drop trigger if exists comu_order_shipping_economics_immutable on public.comu_order_shipping_economics;
create trigger comu_order_shipping_economics_immutable before update on public.comu_order_shipping_economics for each row execute function public.comu_shipping_discount_immutable_v1();

create or replace function public.comu_discount_economics_immutable_v1()
returns trigger language plpgsql as $$
begin
  if old.funding_status = 'KNOWN' and (
    new.discount_total_cents is distinct from old.discount_total_cents or
    new.seller_discount_funded_cents is distinct from old.seller_discount_funded_cents or
    new.cometa_discount_funded_cents is distinct from old.cometa_discount_funded_cents or
    new.embedded_price_discount_cents is distinct from old.embedded_price_discount_cents
  ) then raise exception 'COMU_DISCOUNT_ECONOMICS_IMMUTABLE'; end if;
  return new;
end $$;
drop trigger if exists comu_order_discount_economics_immutable on public.comu_order_discount_economics;
create trigger comu_order_discount_economics_immutable before update on public.comu_order_discount_economics for each row execute function public.comu_discount_economics_immutable_v1();

create or replace function public.comu_finalize_shipping_discount_economics(
  p_order_id uuid,
  p_payment_id uuid,
  p_shipping jsonb,
  p_discount jsonb,
  p_allocations jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_shipping public.comu_order_shipping_economics%rowtype;
  v_discount public.comu_order_discount_economics%rowtype;
  v_row jsonb;
  v_provider bigint := (p_shipping->>'providerShippingCostCents')::bigint;
  v_buyer bigint := (p_shipping->>'buyerShippingPaidCents')::bigint;
  v_seller bigint := coalesce((p_shipping->>'sellerFundedShippingCents')::bigint,0);
  v_cometa bigint := coalesce((p_shipping->>'cometaFundedShippingCents')::bigint,0);
  v_variance bigint := coalesce((p_shipping->>'shippingVarianceCents')::bigint,0);
  v_discount_total bigint := coalesce((p_discount->>'discountTotalCents')::bigint,0);
  v_discount_seller bigint := coalesce((p_discount->>'sellerDiscountFundedCents')::bigint,0);
  v_discount_cometa bigint := coalesce((p_discount->>'cometaDiscountFundedCents')::bigint,0);
  v_embedded bigint := coalesce((p_discount->>'embeddedPriceDiscountCents')::bigint,0);
  v_shipping_status text := coalesce(p_shipping->>'fundingStatus','PENDING');
  v_discount_status text := coalesce(p_discount->>'fundingStatus','UNKNOWN');
begin
  if v_provider < 0 or v_buyer < 0 or v_seller < 0 or v_cometa < 0 or v_discount_total < 0 or v_discount_seller < 0 or v_discount_cometa < 0 or v_embedded < 0 then raise exception 'COMU_ECONOMICS_AMOUNT_INVALID'; end if;
  if v_shipping_status = 'FINALIZED' and v_provider <> v_buyer + v_seller + v_cometa + v_variance then raise exception 'COMU_SHIPPING_CONSERVATION_FAILED'; end if;
  if v_discount_status = 'KNOWN' and v_discount_seller + v_discount_cometa > v_discount_total then raise exception 'COMU_DISCOUNT_CONSERVATION_FAILED'; end if;
  insert into public.comu_order_shipping_economics(order_id,payment_id,provider_shipping_cost_cents,buyer_shipping_paid_cents,seller_funded_shipping_cents,cometa_funded_shipping_cents,shipping_variance_cents,funding_status,source_quote_id,source_shipment_id,finalized_at,updated_at)
  values(p_order_id,p_payment_id,v_provider,v_buyer,v_seller,v_cometa,v_variance,v_shipping_status,nullif(p_shipping->>'sourceQuoteId','')::uuid,nullif(p_shipping->>'sourceShipmentId','')::uuid,case when v_shipping_status='FINALIZED' then now() end,now())
  on conflict(order_id) do update set payment_id=excluded.payment_id,provider_shipping_cost_cents=excluded.provider_shipping_cost_cents,buyer_shipping_paid_cents=excluded.buyer_shipping_paid_cents,seller_funded_shipping_cents=excluded.seller_funded_shipping_cents,cometa_funded_shipping_cents=excluded.cometa_funded_shipping_cents,shipping_variance_cents=excluded.shipping_variance_cents,funding_status=excluded.funding_status,source_quote_id=excluded.source_quote_id,source_shipment_id=excluded.source_shipment_id,finalized_at=case when excluded.funding_status='FINALIZED' then coalesce(public.comu_order_shipping_economics.finalized_at,now()) else null end,updated_at=now()
  returning * into v_shipping;
  insert into public.comu_order_discount_economics(order_id,payment_id,discount_total_cents,seller_discount_funded_cents,cometa_discount_funded_cents,embedded_price_discount_cents,funding_status,finalized_at,updated_at)
  values(p_order_id,p_payment_id,v_discount_total,v_discount_seller,v_discount_cometa,v_embedded,v_discount_status,case when v_discount_status='KNOWN' then now() end,now())
  on conflict(order_id) do update set payment_id=excluded.payment_id,discount_total_cents=excluded.discount_total_cents,seller_discount_funded_cents=excluded.seller_discount_funded_cents,cometa_discount_funded_cents=excluded.cometa_discount_funded_cents,embedded_price_discount_cents=excluded.embedded_price_discount_cents,funding_status=excluded.funding_status,finalized_at=case when excluded.funding_status='KNOWN' then coalesce(public.comu_order_discount_economics.finalized_at,now()) else null end,updated_at=now()
  returning * into v_discount;
  for v_row in select value from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) loop
    update public.comu_payment_economics set shipping_economics_id=v_shipping.id,discount_economics_id=v_discount.id,seller_shipping_liability_cents=coalesce((v_row->>'sellerFundedShippingCents')::bigint,0),seller_funded_shipping_cents=coalesce((v_row->>'sellerFundedShippingCents')::bigint,0),cometa_funded_shipping_cents=case when (v_row ? 'cometaFundedShippingCents') then coalesce((v_row->>'cometaFundedShippingCents')::bigint,0) else 0 end,seller_discount_liability_cents=coalesce((v_row->>'sellerDiscountFundedCents')::bigint,0),seller_funded_discount_cents=coalesce((v_row->>'sellerDiscountFundedCents')::bigint,0),embedded_price_discount_cents=coalesce((v_row->>'embeddedPriceDiscountCents')::bigint,0),shipping_finance_ready=(v_shipping.funding_status in ('FINALIZED','NOT_APPLICABLE')),discount_finance_ready=(v_discount.funding_status in ('KNOWN','NOT_APPLICABLE')),finance_ready=((select stripe_fee_finalized_at from public.comu_payment_intents where id=p_payment_id) is not null and v_shipping.funding_status in ('FINALIZED','NOT_APPLICABLE') and v_discount.funding_status in ('KNOWN','NOT_APPLICABLE')),updated_at=now()
    where allocation_id=(v_row->>'allocationId')::uuid and payment_id=p_payment_id;
    if not found then raise exception 'COMU_PAYMENT_ALLOCATION_NOT_FOUND'; end if;
  end loop;
  return jsonb_build_object('shippingEconomicsId',v_shipping.id,'discountEconomicsId',v_discount.id,'shippingStatus',v_shipping.funding_status,'discountStatus',v_discount.funding_status);
end $$;
revoke all on function public.comu_finalize_shipping_discount_economics(uuid,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.comu_finalize_shipping_discount_economics(uuid,uuid,jsonb,jsonb,jsonb) to service_role;

alter table public.comu_order_shipping_economics enable row level security;
alter table public.comu_order_discount_economics enable row level security;
revoke all on public.comu_order_shipping_economics,public.comu_order_discount_economics from anon,authenticated;
grant all on public.comu_order_shipping_economics,public.comu_order_discount_economics to service_role;
drop policy if exists comu_order_shipping_economics_seller on public.comu_order_shipping_economics;
create policy comu_order_shipping_economics_seller on public.comu_order_shipping_economics for select to authenticated using (exists(select 1 from public.comu_payment_allocations pa join public.comu_payment_economics pe on pe.allocation_id=pa.id join public.comu_seller_memberships sm on sm.seller_id=pe.seller_id where pa.order_id=comu_order_shipping_economics.order_id and sm.user_id=auth.uid() and sm.active));
drop policy if exists comu_order_discount_economics_seller on public.comu_order_discount_economics;
create policy comu_order_discount_economics_seller on public.comu_order_discount_economics for select to authenticated using (exists(select 1 from public.comu_payment_allocations pa join public.comu_payment_economics pe on pe.allocation_id=pa.id join public.comu_seller_memberships sm on sm.seller_id=pe.seller_id where pa.order_id=comu_order_discount_economics.order_id and sm.user_id=auth.uid() and sm.active));

create or replace view public.comu_marketplace_money_conservation_v1 as
select p.id as payment_id,p.order_id,p.amount_cents as buyer_total_cents,
  coalesce(sum(pe.economic_gross_cents),0)::bigint as seller_gross_cents,
  coalesce(max(se.buyer_shipping_paid_cents),0)::bigint as buyer_shipping_paid_cents,
  coalesce(max(se.provider_shipping_cost_cents),0)::bigint as provider_shipping_cost_cents,
  coalesce(max(se.seller_funded_shipping_cents),0)::bigint as seller_funded_shipping_cents,
  coalesce(max(se.cometa_funded_shipping_cents),0)::bigint as cometa_funded_shipping_cents,
  coalesce(max(se.shipping_variance_cents),0)::bigint as shipping_variance_cents,
  coalesce(max(de.discount_total_cents),0)::bigint as discount_total_cents,
  coalesce(max(de.seller_discount_funded_cents),0)::bigint as seller_discount_funded_cents,
  coalesce(max(de.cometa_discount_funded_cents),0)::bigint as cometa_discount_funded_cents,
  p.stripe_processing_fee_cents
from public.comu_payment_intents p left join public.comu_payment_economics pe on pe.payment_id=p.id left join public.comu_order_shipping_economics se on se.order_id=p.order_id left join public.comu_order_discount_economics de on de.order_id=p.order_id group by p.id,p.order_id,p.amount_cents,p.stripe_processing_fee_cents;
