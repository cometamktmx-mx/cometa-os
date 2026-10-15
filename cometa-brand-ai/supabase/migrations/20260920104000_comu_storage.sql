insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comu-products', 'comu-products', true, 5242880, array['image/jpeg','image/png','image/webp']::text[])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy comu_products_public_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'comu-products');

-- Writes are performed by the authenticated, brand-authorized COMU API with the service role.
-- No client-side insert policy is granted, preventing arbitrary uploads from bypassing seller checks.
