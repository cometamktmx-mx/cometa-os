-- Payment allocation conservation is seller-merchandise plus master-order buyer shipping.
-- Buyer shipping is never copied into a seller allocation.
create or replace function public.comu_check_allocation_total() returns trigger
language plpgsql set search_path = public as $$
declare
  expected bigint;
  actual bigint;
  buyer_shipping bigint;
begin
  select p.amount_cents, coalesce(round(o.shipping_total * 100), 0)
    into strict expected, buyer_shipping
    from public.comu_payment_intents p
    join public.comu_orders o on o.id = p.order_id
   where p.id = new.payment_id;

  select coalesce(sum(gross_amount_cents), 0)
    into actual
    from public.comu_payment_allocations
   where payment_id = new.payment_id;

  -- If finalized economics exist, use the immutable order-time snapshot as the
  -- canonical shipping component; otherwise use the order checkout snapshot.
  select coalesce(se.buyer_shipping_paid_cents, buyer_shipping)
    into buyer_shipping
    from public.comu_payment_intents p
    join public.comu_orders o on o.id = p.order_id
    left join public.comu_order_shipping_economics se
      on se.order_id = o.id and se.payment_id = p.id
   where p.id = new.payment_id;

  if actual + coalesce(buyer_shipping, 0) is distinct from expected then
    raise exception 'COMU_ALLOCATION_TOTAL_MISMATCH';
  end if;
  return null;
end; $$;
