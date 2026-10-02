begin;
-- Baseline 20260828233603 grants these SECURITY DEFINER mutations to anon and
-- authenticated, bypassing API/operator/device checks. Current POS consumers
-- use Next route handlers and service_role; no browser RPC consumer was found.
do $$ declare routine regprocedure; begin
  for routine in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(array[
      'pos_adjust_inventory','pos_close_cash_session','pos_complete_inventory_receipt_v1',
      'pos_complete_sale','pos_configure_business_profile','pos_create_product','pos_create_product_v2',
      'pos_loyalty_adjust_points','pos_open_cash_session','pos_register_loyalty_member',
      'pos_save_branding','pos_set_subscription_offer','pos_sync_product_attributes_from_profile'
    ]) loop
    execute format('revoke execute on function %s from public,anon,authenticated',routine);
    execute format('grant execute on function %s to service_role',routine);
  end loop;
end $$;
-- Existing membership-only write policies cannot authorize a local operator or
-- a revoked device. Preserve SELECT/RLS and require the authenticated API for
-- these proven direct-write surfaces; do not rewrite policies or business SQL.
revoke insert,update,delete,truncate,references,trigger on
  public.pos_cash_movements,public.pos_cash_sessions,public.pos_categories,
  public.pos_customers,public.pos_inventory,public.pos_inventory_movements,
  public.pos_locations,public.pos_loyalty_members,public.pos_loyalty_programs,
  public.pos_loyalty_redemptions,public.pos_loyalty_rewards,public.pos_loyalty_tiers,
  public.pos_loyalty_transactions,public.pos_payments,public.pos_product_variants,
  public.pos_products,public.pos_registers,public.pos_sale_items,public.pos_sales,
  public.pos_wallet_passes
from public,anon,authenticated;
commit;
