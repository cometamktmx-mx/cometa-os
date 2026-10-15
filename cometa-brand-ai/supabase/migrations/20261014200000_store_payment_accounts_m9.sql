begin;
create table public.store_payment_accounts (
 brand_id uuid not null references public.brands(id),mode text not null check(mode in ('test','live')),
 country text not null check(country ~ '^[A-Z]{2}$'),stripe_account_id text unique check(stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
 request_key uuid not null default gen_random_uuid(),request_started_at timestamptz not null default now(),
 charges_enabled boolean not null default false,payouts_enabled boolean not null default false,details_submitted boolean not null default false,
 active boolean not null default false,updated_at timestamptz not null default now(),primary key(brand_id,mode)
);
alter table public.store_payment_accounts enable row level security;
revoke all on public.store_payment_accounts from public,anon,authenticated,service_role;
grant select on public.store_payment_accounts to service_role;
create function public.store_payment_prepare_m9(p_brand text,p_actor uuid,p_mode text,p_country text) returns public.store_payment_accounts
language plpgsql security definer set search_path=public as $$
declare b uuid;r store_payment_accounts%rowtype;
begin
 select id into b from brands where slug=p_brand;perform store_actor_m7(b,p_actor);
 if p_mode not in ('test','live') or p_country !~ '^[A-Z]{2}$' then raise exception 'POS_VALIDATION_ERROR';end if;
 insert into store_payment_accounts(brand_id,mode,country) values(b,p_mode,p_country) on conflict(brand_id,mode) do nothing;
 select * into r from store_payment_accounts where brand_id=b and mode=p_mode for update;
 if r.country<>p_country then raise exception 'STORE_CONNECT_COUNTRY_CONFLICT';end if;
 return r;
end $$;
create function public.store_payment_bind_m9(p_brand text,p_actor uuid,p_mode text,p_request uuid,p_account text) returns public.store_payment_accounts
language plpgsql security definer set search_path=public as $$
declare b uuid;r store_payment_accounts%rowtype;
begin
 select id into b from brands where slug=p_brand;perform store_actor_m7(b,p_actor);
 select * into r from store_payment_accounts where brand_id=b and mode=p_mode for update;
 if not found or p_request is null or r.request_key<>p_request or p_account is null or p_account !~ '^acct_[A-Za-z0-9]+$' or (r.stripe_account_id is not null and r.stripe_account_id<>p_account) then raise exception 'STORE_CONNECT_BINDING_CONFLICT';end if;
 update store_payment_accounts set stripe_account_id=p_account,updated_at=now() where brand_id=b and mode=p_mode returning * into r;return r;
end $$;
-- Service-only provider capability synchronization. It cannot bind or switch accounts.
create function public.store_payment_sync_m9(p_brand uuid,p_mode text,p_account text,p_charges boolean,p_payouts boolean,p_details boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
 update store_payment_accounts set charges_enabled=p_charges,payouts_enabled=p_payouts,details_submitted=p_details,updated_at=now()
 where brand_id=p_brand and mode=p_mode and stripe_account_id=p_account;
 if not found then raise exception 'STORE_CONNECT_ACCOUNT_MISMATCH';end if;
end $$;
create function public.store_payment_activate_m9(p_brand text,p_actor uuid,p_mode text) returns void
language plpgsql security definer set search_path=public as $$
declare b uuid;r store_payment_accounts%rowtype;
begin
 select id into b from brands where slug=p_brand for update;perform store_actor_m7(b,p_actor);
 select * into r from store_payment_accounts where brand_id=b and mode=p_mode for update;
 if not found or r.stripe_account_id is null or not r.charges_enabled or not r.payouts_enabled or not r.details_submitted then raise exception 'STORE_CONNECT_NOT_READY';end if;
 update store_checkout_configuration set stripe_account_ref=r.stripe_account_id,reviewed_at=now(),reviewed_by=p_actor where brand_id=b;
 if not found then raise exception 'STORE_CONFIGURATION_REQUIRED';end if;
 update store_payment_accounts set active=true,updated_at=now() where brand_id=b and mode=p_mode;
end $$;
revoke all on function public.store_payment_prepare_m9(text,uuid,text,text),public.store_payment_bind_m9(text,uuid,text,uuid,text),public.store_payment_sync_m9(uuid,text,text,boolean,boolean,boolean),public.store_payment_activate_m9(text,uuid,text) from public,anon,authenticated;
grant execute on function public.store_payment_prepare_m9(text,uuid,text,text),public.store_payment_bind_m9(text,uuid,text,uuid,text),public.store_payment_sync_m9(uuid,text,text,boolean,boolean,boolean),public.store_payment_activate_m9(text,uuid,text) to service_role;
commit;
