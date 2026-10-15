-- Private storage bucket for Cometa marketing assets. Logical ownership remains mercury_content_assets.
insert into storage.buckets (id, name, public)
values ('brand-content', 'brand-content', false)
on conflict (id) do update set public = false;
