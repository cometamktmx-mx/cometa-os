-- POS theme preference lives with the existing branding source of truth.
alter table public.pos_branding
  add column if not exists theme_mode text not null default 'dark';

update public.pos_branding
set theme_mode = 'dark'
where theme_mode is null or theme_mode not in ('dark', 'light', 'system');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pos_branding'::regclass
      and conname = 'pos_branding_theme_mode_check'
  ) then
    alter table public.pos_branding
      add constraint pos_branding_theme_mode_check
      check (theme_mode in ('dark', 'light', 'system'));
  end if;
end $$;
