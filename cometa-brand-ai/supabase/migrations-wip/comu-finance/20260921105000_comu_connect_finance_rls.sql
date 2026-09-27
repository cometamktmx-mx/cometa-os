create function public.comu_financial_append_only() returns trigger language plpgsql as $$
begin raise exception 'COMU_FINANCIAL_APPEND_ONLY'; end; $$;
create trigger comu_ledger_append_only before update or delete on public.comu_seller_ledger_entries for each row execute function public.comu_financial_append_only();
create trigger comu_financial_events_append_only before update or delete on public.comu_financial_events for each row execute function public.comu_financial_append_only();

create function public.comu_check_allocation_total() returns trigger
language plpgsql set search_path=public as $$
declare expected bigint; actual bigint;
begin
  select amount_cents into strict expected from public.comu_payment_intents where id=new.payment_id;
  select sum(gross_amount_cents) into actual from public.comu_payment_allocations where payment_id=new.payment_id;
  if actual is distinct from expected then raise exception 'COMU_ALLOCATION_TOTAL_MISMATCH'; end if;
  return null;
end; $$;
create constraint trigger comu_allocation_total after insert on public.comu_payment_allocations deferrable initially deferred for each row execute function public.comu_check_allocation_total();
create function public.comu_allocation_immutable() returns trigger language plpgsql as $$
begin
  if (new.payment_id,new.order_id,new.suborder_id,new.seller_id,new.gross_amount_cents,new.platform_fee_cents,new.seller_net_amount_cents)
    is distinct from (old.payment_id,old.order_id,old.suborder_id,old.seller_id,old.gross_amount_cents,old.platform_fee_cents,old.seller_net_amount_cents) then raise exception 'COMU_ALLOCATION_IMMUTABLE'; end if;
  return new;
end; $$;
create trigger comu_allocation_immutable before update on public.comu_payment_allocations for each row execute function public.comu_allocation_immutable();

alter table public.comu_financial_settings enable row level security;
alter table public.comu_seller_fund_holds enable row level security;
alter table public.comu_financial_events enable row level security;
alter table public.comu_seller_settlements enable row level security;
alter table public.comu_seller_settlement_items enable row level security;
alter table public.comu_connect_webhook_events enable row level security;
revoke all on public.comu_financial_settings,public.comu_seller_fund_holds,public.comu_financial_events,public.comu_seller_settlements,public.comu_seller_settlement_items,public.comu_connect_webhook_events from anon,authenticated;
grant all on public.comu_financial_settings,public.comu_seller_fund_holds,public.comu_financial_events,public.comu_seller_settlements,public.comu_seller_settlement_items,public.comu_connect_webhook_events to service_role;
grant select on public.comu_financial_settings,public.comu_seller_fund_holds,public.comu_financial_events,public.comu_seller_settlement_items to authenticated;
grant select(id,seller_id,settlement_day,currency,amount_cents,status,retryable,created_at,updated_at) on public.comu_seller_settlements to authenticated;
create policy comu_financial_settings_admin on public.comu_financial_settings for select to authenticated using (public.is_cometa_admin());
create policy comu_holds_seller on public.comu_seller_fund_holds for select to authenticated using (public.is_cometa_admin() or exists(select 1 from public.comu_seller_memberships m where m.seller_id=comu_seller_fund_holds.seller_id and m.user_id=auth.uid() and m.active));
create policy comu_financial_events_admin on public.comu_financial_events for select to authenticated using (public.is_cometa_admin());
create policy comu_settlements_seller on public.comu_seller_settlements for select to authenticated using (public.is_cometa_admin() or exists(select 1 from public.comu_seller_memberships m where m.seller_id=comu_seller_settlements.seller_id and m.user_id=auth.uid() and m.active));
create policy comu_settlement_items_seller on public.comu_seller_settlement_items for select to authenticated using (public.is_cometa_admin() or exists(select 1 from public.comu_seller_memberships m where m.seller_id=comu_seller_settlement_items.seller_id and m.user_id=auth.uid() and m.active));

-- Connected-account IDs and durable request keys are server-only.
revoke select on public.comu_seller_payment_accounts from authenticated;
grant select(id,seller_id,account_type,onboarding_status,details_submitted,charges_enabled,payouts_enabled,transfers_enabled,requirements_due,financial_suspended,created_at,updated_at) on public.comu_seller_payment_accounts to authenticated;
