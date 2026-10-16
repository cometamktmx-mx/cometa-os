begin;
create table public.pos_terminal_print_settings (
 id uuid primary key, brand_slug text not null references public.brands(slug), host_user_id uuid not null references auth.users(id),
 config jsonb not null, updated_at timestamptz not null default now(), unique(id,brand_slug)
);
create table public.pos_terminal_print_jobs (
 id uuid primary key default gen_random_uuid(), brand_slug text not null references public.brands(slug),
 terminal_id uuid not null, host_user_id uuid not null references auth.users(id), staff_id uuid not null references public.pos_staff(id),
 sale_id uuid references public.pos_sales(id), cash_session_id uuid references public.pos_cash_sessions(id),
 kind text not null check(kind in ('receipt','drawer','test','reprint')), reason text,
 dedupe_key text not null, payload jsonb not null,
 status text not null default 'requested' check(status in ('requested','dispatched','spooled','failed','uncertain')),
 created_at timestamptz not null default now(), dispatched_at timestamptz, completed_at timestamptz,
 unique(brand_slug,dedupe_key), foreign key(terminal_id,brand_slug) references public.pos_terminal_print_settings(id,brand_slug)
);
alter table public.pos_terminal_print_settings enable row level security;
alter table public.pos_terminal_print_jobs enable row level security;
revoke all on public.pos_terminal_print_settings,public.pos_terminal_print_jobs from public,anon,authenticated;
grant all on public.pos_terminal_print_settings,public.pos_terminal_print_jobs to service_role;
commit;
