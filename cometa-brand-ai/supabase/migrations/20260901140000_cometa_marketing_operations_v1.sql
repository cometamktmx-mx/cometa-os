create table if not exists public.cometa_marketing_strategies (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id),
  brand_slug text not null,
  period_year integer not null check (period_year between 2024 and 2100),
  period_month integer not null check (period_month between 1 and 12),
  version integer not null check (version >= 1),
  status text not null check (status in ('draft','published','superseded')),
  source text not null check (source in ('manual','ai')),
  objective_primary text,
  objectives_secondary jsonb not null default '[]'::jsonb check (jsonb_typeof(objectives_secondary) = 'array'),
  target_audience text,
  offer_focus text,
  strategic_focus text,
  content_pillars jsonb not null default '[]'::jsonb check (jsonb_typeof(content_pillars) = 'array'),
  channels jsonb not null default '[]'::jsonb check (jsonb_typeof(channels) = 'array'),
  cadence text,
  tone text,
  campaigns jsonb not null default '[]'::jsonb check (jsonb_typeof(campaigns) = 'array'),
  primary_cta text,
  success_metrics jsonb not null default '[]'::jsonb check (jsonb_typeof(success_metrics) = 'array'),
  next_milestone text,
  notes_internal text,
  created_by uuid,
  published_by uuid,
  published_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, period_year, period_month, version)
);
create unique index if not exists cometa_marketing_strategies_one_published
  on public.cometa_marketing_strategies (brand_id, period_year, period_month)
  where status = 'published';
alter table public.cometa_marketing_strategies enable row level security;
revoke all on public.cometa_marketing_strategies from anon, authenticated;

create or replace function public.cometa_marketing_strategy_publish_v1(p_strategy_id uuid, p_actor_user_id uuid)
returns public.cometa_marketing_strategies
language plpgsql security definer set search_path = public
as $$
declare target public.cometa_marketing_strategies; prior public.cometa_marketing_strategies;
begin
  if not exists (select 1 from public.user_profiles where user_id = p_actor_user_id and role = 'admin' and status = 'active') then
    raise exception 'ADMIN_REQUIRED';
  end if;
  select * into target from public.cometa_marketing_strategies where id = p_strategy_id for update;
  if not found then raise exception 'STRATEGY_NOT_FOUND'; end if;
  if target.status = 'published' then return target; end if;
  if target.status <> 'draft' then raise exception 'STRATEGY_NOT_DRAFT'; end if;
  perform 1 from public.cometa_marketing_strategies where brand_id = target.brand_id and period_year = target.period_year and period_month = target.period_month for update;
  select * into prior from public.cometa_marketing_strategies where brand_id = target.brand_id and period_year = target.period_year and period_month = target.period_month and status = 'published' and id <> target.id for update;
  if prior.id is not null then update public.cometa_marketing_strategies set status='superseded', superseded_at=now(), updated_at=now() where id=prior.id; end if;
  update public.cometa_marketing_strategies set status='published', published_by=p_actor_user_id, published_at=now(), updated_at=now() where id=target.id returning * into target;
  return target;
end;
$$;
revoke all on function public.cometa_marketing_strategy_publish_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cometa_marketing_strategy_publish_v1(uuid, uuid) to service_role;
