-- Canonical POS branding storage. This is intentionally independent from the
-- legacy personalization migration and leaves all other buckets untouched.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pos-brand-assets',
  'pos-brand-assets',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
