begin;
create table public.pos_product_web_content (
 product_id uuid primary key references public.pos_products(id),
 brand_id uuid not null references public.brands(id),
 revision integer not null check(revision>0),
 draft jsonb not null check(jsonb_typeof(draft)='object'),
 published jsonb check(jsonb_typeof(published)='object'),
 published_revision integer,
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 published_at timestamptz,
 check((published is null and published_revision is null and published_at is null) or
       (published is not null and published_revision>0 and published_revision<=revision and published_at is not null))
);
alter table public.pos_product_web_content enable row level security;
revoke all on public.pos_product_web_content from public,anon,authenticated,service_role;
grant select on public.pos_product_web_content to service_role;

create function public.pos_save_product_web_m2(p_brand_slug text,p_product_id uuid,p_actor uuid,
 p_revision integer,p_document jsonb,p_publish boolean) returns jsonb
language plpgsql security definer set search_path=public as $$
declare b public.brands%rowtype; c public.pos_product_web_content%rowtype;
 is_admin boolean; role_name text; v_revision integer; color jsonb; ref text; paths text[]; seen uuid[]:='{}'; vid uuid;
begin
 select role='admin' into is_admin from public.user_profiles where user_id=p_actor and status='active' for share;
 if not found then raise exception 'POS_WEB_DENIED' using errcode='42501'; end if;
 select * into b from public.brands where slug=p_brand_slug for update;
 if not found then raise exception 'POS_WEB_NOT_FOUND'; end if;
 if not is_admin then
  select access_role into role_name from public.user_brand_access where user_id=p_actor and brand_slug=b.slug and status='active' for share;
  if role_name is null or role_name not in ('owner','admin') then raise exception 'POS_WEB_DENIED' using errcode='42501'; end if;
 end if;
 if not exists(select 1 from public.pos_business_profiles where brand_slug=b.slug and profile_code not in ('restaurant','coffee_shop')) then raise exception 'POS_WEB_RETAIL_ONLY'; end if;
 perform 1 from public.pos_products where id=p_product_id and brand_slug=b.slug and brand_id::text=b.id::text for update;
 if not found then raise exception 'POS_WEB_NOT_FOUND'; end if;
 select * into c from public.pos_product_web_content where product_id=p_product_id for update;
 v_revision:=coalesce(c.revision,0);
 if p_revision is null or p_revision<>v_revision then raise exception 'POS_WEB_CONFLICT' using errcode='40001'; end if;
 -- Draft preparation is permitted to A1 administrators even before enablement.
 -- Publishing a version requires the current commercial authority, never changes it.
 if p_publish is null then raise exception 'POS_WEB_INVALID'; end if;
 if p_publish and (b.status is distinct from 'active' or not exists(select 1 from public.brand_online_store_access where brand_id=b.id and status='enabled')) then raise exception 'POS_WEB_SERVICE_DISABLED'; end if;
 if p_document is null or jsonb_typeof(p_document)<>'object' or octet_length(p_document::text)>200000
 or jsonb_typeof(p_document->'colors') is distinct from 'array'
 or jsonb_typeof(p_document->'relatedIds') is distinct from 'array'
 or jsonb_array_length(p_document->'colors')>40 or jsonb_array_length(p_document->'relatedIds')>12 then raise exception 'POS_WEB_INVALID'; end if;
 -- Stable variant UUID references, explicit color grouping, never file-name inference.
 for color in select value from jsonb_array_elements(p_document->'colors') loop
  if jsonb_typeof(color->'variantIds') is distinct from 'array' or jsonb_array_length(color->'variantIds')=0 then raise exception 'POS_WEB_VARIANT_INVALID'; end if;
  for ref in select jsonb_array_elements_text(color->'variantIds') loop
   vid:=ref::uuid;
   if vid=any(seen) then raise exception 'POS_WEB_VARIANT_DUPLICATE'; end if;
   perform 1 from public.pos_product_variants where id=vid and product_id=p_product_id and brand_slug=b.slug for share;
   if not found then raise exception 'POS_WEB_VARIANT_INVALID'; end if;
   seen:=array_append(seen,vid);
  end loop;
 end loop;
 if (select count(*)<>count(distinct value) from jsonb_array_elements_text(p_document->'relatedIds')) then raise exception 'POS_WEB_RELATED_INVALID'; end if;
 for ref in select jsonb_array_elements_text(p_document->'relatedIds') loop
  if ref::uuid=p_product_id then raise exception 'POS_WEB_RELATED_INVALID'; end if;
  perform 1 from public.pos_products where id=ref::uuid and brand_slug=b.slug and brand_id::text=b.id::text for share;
  if not found then raise exception 'POS_WEB_RELATED_INVALID'; end if;
 end loop;
 select array_agg(distinct path) into paths from (
  select photo->>'path' path from jsonb_array_elements(p_document->'colors') col cross join lateral jsonb_array_elements(col->'photos') photo
  union all select col->>'swatchPath' from jsonb_array_elements(p_document->'colors') col
  union all select p_document->'guide'->>'imagePath'
 ) refs where coalesce(path,'')<>'';
 foreach ref in array coalesce(paths,'{}') loop
  if ref not like b.slug||'/web/%' or ref ~ '(^|/)\.\.?(/|$)' then raise exception 'POS_WEB_MEDIA_INVALID'; end if;
  perform 1 from storage.objects where bucket_id='pos-products' and name=ref for share;
  if not found then raise exception 'POS_WEB_MEDIA_INVALID'; end if;
 end loop;
 insert into public.pos_product_web_content(product_id,brand_id,revision,draft,published,published_revision,updated_by,published_at)
 values(p_product_id,b.id,v_revision+1,p_document,case when p_publish then p_document else null end,
 case when p_publish then v_revision+1 else null end,p_actor,case when p_publish then now() else null end)
 on conflict(product_id) do update set revision=excluded.revision,draft=excluded.draft,
 published=case when p_publish then excluded.draft else pos_product_web_content.published end,
 published_revision=case when p_publish then excluded.revision else pos_product_web_content.published_revision end,
 published_at=case when p_publish then now() else pos_product_web_content.published_at end,
 updated_by=p_actor,updated_at=now() returning * into c;
 return jsonb_build_object('revision',c.revision,'draft',c.draft,'published',c.published,'publishedRevision',c.published_revision);
end $$;
revoke all on function public.pos_save_product_web_m2(text,uuid,uuid,integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.pos_save_product_web_m2(text,uuid,uuid,integer,jsonb,boolean) to service_role;
commit;
