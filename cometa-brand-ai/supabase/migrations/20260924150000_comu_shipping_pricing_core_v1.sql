-- COMU shipping pricing core V1. Additive only.
alter table public.comu_shipments add column if not exists service_code text;
alter table public.comu_shipments add column if not exists estimated_provider_cost numeric(14,2);
alter table public.comu_shipments add column if not exists final_provider_cost numeric(14,2);
alter table public.comu_shipments add column if not exists provider_request_key text;
alter table public.comu_shipments add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.comu_orders add column if not exists shipping_snapshot jsonb not null default '{}'::jsonb;
alter table public.comu_orders add column if not exists shipping_quote_id uuid;
alter table public.comu_orders add column if not exists shipping_mode text not null default 'STANDARD';

create table if not exists public.comu_shipping_policies (
  id uuid primary key default gen_random_uuid(), storefront_id uuid not null references public.comu_storefronts(id) on delete cascade,
  mode text not null default 'RETAIL' check (mode in ('RETAIL','WHOLESALE')),
  buyer_pays_percent numeric(7,4) not null default 100 check (buyer_pays_percent between 0 and 100),
  free_shipping_threshold numeric(14,2), seller_subsidy_percent numeric(7,4) not null default 0 check (seller_subsidy_percent between 0 and 100),
  seller_max_subsidy numeric(14,2), cometa_subsidy numeric(14,2) not null default 0 check (cometa_subsidy >= 0),
  active boolean not null default true, version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(storefront_id, mode)
);
create table if not exists public.comu_shipping_product_profiles (
  id uuid primary key default gen_random_uuid(), product_id uuid not null unique references public.pos_products(id) on delete cascade,
  profile text not null default 'CUSTOM', estimated_weight_g numeric(10,2) not null default 250 check (estimated_weight_g > 0), packing_factor numeric(8,4) not null default 1 check (packing_factor > 0),
  package_class text not null default 'TEXTILE_S', override_weight_g numeric(10,2), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.comu_shipping_webhook_events (
  id uuid primary key default gen_random_uuid(), provider text not null, provider_event_id text not null, shipment_id uuid references public.comu_shipments(id) on delete set null,
  event_type text not null, payload jsonb not null default '{}'::jsonb, processed_at timestamptz, created_at timestamptz not null default now(), unique(provider, provider_event_id)
);
create table if not exists public.comu_shipping_quotes (
  id uuid primary key default gen_random_uuid(), order_id uuid references public.comu_orders(id) on delete cascade, provider text not null, service_code text not null,
  estimated_eta_days integer, provider_cost numeric(14,2) not null check (provider_cost >= 0), baseline_cost numeric(14,2) not null check (baseline_cost >= 0), buyer_shipping_charge numeric(14,2) not null check (buyer_shipping_charge >= 0), seller_shipping_subsidy numeric(14,2) not null default 0 check (seller_shipping_subsidy >= 0), cometa_shipping_subsidy numeric(14,2) not null default 0 check (cometa_shipping_subsidy >= 0), policy_id uuid references public.comu_shipping_policies(id) on delete set null, package_estimate jsonb not null default '{}'::jsonb, selected boolean not null default false, created_at timestamptz not null default now()
);
alter table public.comu_shipping_policies enable row level security;
alter table public.comu_shipping_product_profiles enable row level security;
alter table public.comu_shipping_webhook_events enable row level security;
alter table public.comu_shipping_quotes enable row level security;
create index if not exists comu_shipping_policies_storefront_idx on public.comu_shipping_policies(storefront_id,mode);
create index if not exists comu_shipping_quotes_order_idx on public.comu_shipping_quotes(order_id,created_at);
create index if not exists comu_shipping_webhook_events_shipment_idx on public.comu_shipping_webhook_events(shipment_id,created_at);
