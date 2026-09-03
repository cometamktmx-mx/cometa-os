create table if not exists public.cometa_brand_diagnoses (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id),
  brand_slug text not null,
  legacy_analysis_id uuid references public.brand_analysis(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','collecting','completed','failed')),
  requested_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cometa_brand_diagnoses_brand_created_idx on public.cometa_brand_diagnoses(brand_id, created_at desc);

create table if not exists public.cometa_brand_context (
  brand_id uuid primary key references public.brands(id) on delete cascade,
  brand_slug text not null,
  latest_diagnosis_id uuid references public.cometa_brand_diagnoses(id) on delete set null,
  context_claims jsonb not null default '{}'::jsonb check (jsonb_typeof(context_claims) = 'object'),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cometa_marketing_packages (
  code text primary key,
  name text not null,
  organic_reels_per_week integer not null check (organic_reels_per_week >= 0),
  organic_posts_per_week integer not null check (organic_posts_per_week >= 0),
  organic_stories_per_week integer not null check (organic_stories_per_week >= 0),
  paid_base_reels integer not null check (paid_base_reels >= 0),
  paid_base_carousels integer not null check (paid_base_carousels >= 0),
  paid_base_posts integer not null check (paid_base_posts >= 0),
  paid_review_interval_days integer not null check (paid_review_interval_days > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.cometa_marketing_packages(code,name,organic_reels_per_week,organic_posts_per_week,organic_stories_per_week,paid_base_reels,paid_base_carousels,paid_base_posts,paid_review_interval_days)
values
 ('BASIC','Básico',2,1,4,2,2,1,10),
 ('INTERMEDIATE','Intermedio',3,2,5,2,2,1,10),
 ('COMPLETE','Completo',4,3,7,2,2,1,10)
on conflict (code) do update set name=excluded.name, organic_reels_per_week=excluded.organic_reels_per_week, organic_posts_per_week=excluded.organic_posts_per_week, organic_stories_per_week=excluded.organic_stories_per_week, paid_base_reels=excluded.paid_base_reels, paid_base_carousels=excluded.paid_base_carousels, paid_base_posts=excluded.paid_base_posts, paid_review_interval_days=excluded.paid_review_interval_days, updated_at=now();

create table if not exists public.cometa_brand_marketing_packages (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  brand_slug text not null,
  package_code text not null references public.cometa_marketing_packages(code),
  package_snapshot jsonb not null check (jsonb_typeof(package_snapshot) = 'object'),
  effective_from date not null,
  effective_to date,
  confirmed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);
create unique index if not exists cometa_brand_marketing_packages_current_uidx on public.cometa_brand_marketing_packages(brand_id) where effective_to is null;

alter table public.mercury_content_items add column if not exists distribution_type text;
alter table public.mercury_content_items drop constraint if exists mercury_content_items_distribution_type_check;
alter table public.mercury_content_items add constraint mercury_content_items_distribution_type_check check (distribution_type is null or distribution_type in ('organic','paid','organic_paid'));

alter table public.cometa_brand_diagnoses enable row level security;
alter table public.cometa_brand_context enable row level security;
alter table public.cometa_marketing_packages enable row level security;
alter table public.cometa_brand_marketing_packages enable row level security;
revoke all on public.cometa_brand_diagnoses, public.cometa_brand_context, public.cometa_marketing_packages, public.cometa_brand_marketing_packages from anon, authenticated;
