begin;
-- Seller-only release. Public clients must not bypass the closed HTTP checkout.
-- Do not revoke cancel/release/expiry or payment resolution of existing orders.
revoke execute on function public.comu_reserve_inventory(uuid,text,text,jsonb),
 public.comu_create_order_from_reservation(uuid,text,jsonb,text)
 from public,anon,authenticated;
-- Service-only callers retain access for controlled operational recovery.
-- Reopening public purchase requires a reviewed release, not an automatic grant.
commit;
