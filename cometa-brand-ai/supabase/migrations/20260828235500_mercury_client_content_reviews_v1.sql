create table if not exists public.mercury_client_content_reviews (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null,
  calendar_id uuid,
  brand_slug text not null,
  status text not null check (status in ('pending','approved','changes_requested','cancelled')),
  submitted_at timestamptz not null default now(),
  submitted_by uuid not null,
  decided_at timestamptz,
  decided_by uuid,
  decision_comment text,
  asset_snapshot jsonb not null default '[]'::jsonb,
  content_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mercury_client_content_reviews_brand_idx on public.mercury_client_content_reviews (brand_slug);
create index if not exists mercury_client_content_reviews_item_idx on public.mercury_client_content_reviews (content_item_id);
create unique index if not exists mercury_client_content_reviews_pending_unique on public.mercury_client_content_reviews (content_item_id) where status = 'pending';
