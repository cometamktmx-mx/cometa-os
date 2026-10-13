begin;
create table public.brand_storefront_appearance (
 brand_id uuid primary key references public.brands(id),
 revision integer not null check(revision>0), draft jsonb not null,
 published jsonb, published_revision integer,
 updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now(),
 published_at timestamptz,
 check(jsonb_typeof(draft)='object'),
 check((published is null and published_revision is null and published_at is null) or
 (jsonb_typeof(published)='object' and published_revision>0 and published_revision<=revision and published_at is not null))
);
alter table public.brand_storefront_appearance enable row level security;
revoke all on public.brand_storefront_appearance from public,anon,authenticated,service_role;
grant select on public.brand_storefront_appearance to service_role;

create function public.brand_storefront_save_m3(p_brand_slug text,p_actor uuid,p_revision integer,p_document jsonb,p_publish boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b public.brands%rowtype; c public.brand_storefront_appearance%rowtype; admin_user boolean; member_role text; ref text; r integer;
begin
 select role='admin' into admin_user from public.user_profiles where user_id=p_actor and status='active' for share;
 if not found then raise exception 'APPEARANCE_DENIED' using errcode='42501'; end if;
 select * into b from public.brands where slug=p_brand_slug for update;
 if not found then raise exception 'APPEARANCE_NOT_FOUND'; end if;
 if not admin_user then
  select access_role into member_role from public.user_brand_access where user_id=p_actor and brand_slug=b.slug and status='active' for share;
  if member_role is null or member_role not in ('owner','admin') then raise exception 'APPEARANCE_DENIED' using errcode='42501'; end if;
 end if;
 if not exists(select 1 from public.pos_business_profiles where brand_slug=b.slug and profile_code not in ('restaurant','coffee_shop')) then raise exception 'APPEARANCE_RETAIL_ONLY'; end if;
 select * into c from public.brand_storefront_appearance where brand_id=b.id for update;
 r:=coalesce(c.revision,0);
 if p_revision is null or p_revision<>r then raise exception 'APPEARANCE_CONFLICT' using errcode='40001'; end if;
 if p_publish is null then raise exception 'APPEARANCE_INVALID'; end if;
 if p_publish and (b.status is distinct from 'active' or not exists(select 1 from public.brand_online_store_access where brand_id=b.id and status='enabled')) then raise exception 'APPEARANCE_SERVICE_DISABLED'; end if;
 if p_document is null or jsonb_typeof(p_document)<>'object' or octet_length(p_document::text)>100000
 or jsonb_typeof(p_document->'sections') is distinct from 'array' or jsonb_array_length(p_document->'sections')<>11 then raise exception 'APPEARANCE_INVALID'; end if;
 if (select count(distinct s->>'kind') from jsonb_array_elements(p_document->'sections') s)<>11
 or exists(select 1 from jsonb_array_elements(p_document->'sections') s where s->>'kind' not in ('hero','marquee','categories','featured','look','videos','testimonials','benefits','wholesale','faq','newsletter') or jsonb_typeof(s->'entries') is distinct from 'array' or jsonb_array_length(s->'entries')>12) then raise exception 'APPEARANCE_INVALID'; end if;
 for ref in select distinct e->>'productId' from jsonb_array_elements(p_document->'sections') s cross join lateral jsonb_array_elements(s->'entries') e where coalesce(e->>'productId','')<>'' loop
  perform 1 from public.pos_products where id=ref::uuid and brand_slug=b.slug and brand_id::text=b.id::text for share;
  if not found then raise exception 'APPEARANCE_PRODUCT_INVALID'; end if;
 end loop;
 for ref in select distinct path from (
  select p_document->>'logo' path union all
  select s->>'image' from jsonb_array_elements(p_document->'sections') s union all
  select e->>'image' from jsonb_array_elements(p_document->'sections') s cross join lateral jsonb_array_elements(s->'entries') e
 ) x where coalesce(path,'')<>'' loop
  if ref not like b.slug||'/web/%' or ref ~ '(^|/)\.\.?(/|$)' then raise exception 'APPEARANCE_MEDIA_INVALID'; end if;
  perform 1 from storage.objects where bucket_id='pos-products' and name=ref for share;
  if not found then raise exception 'APPEARANCE_MEDIA_INVALID'; end if;
 end loop;
 insert into public.brand_storefront_appearance(brand_id,revision,draft,published,published_revision,updated_by,published_at)
 values(b.id,r+1,p_document,case when p_publish then p_document end,case when p_publish then r+1 end,p_actor,case when p_publish then now() end)
 on conflict(brand_id) do update set revision=excluded.revision,draft=excluded.draft,
 published=case when p_publish then excluded.draft else brand_storefront_appearance.published end,
 published_revision=case when p_publish then excluded.revision else brand_storefront_appearance.published_revision end,
 published_at=case when p_publish then now() else brand_storefront_appearance.published_at end,
 updated_by=p_actor,updated_at=now() returning * into c;
 return jsonb_build_object('revision',c.revision,'draft',c.draft,'published',c.published,'publishedRevision',c.published_revision);
end $$;
revoke all on function public.brand_storefront_save_m3(text,uuid,integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.brand_storefront_save_m3(text,uuid,integer,jsonb,boolean) to service_role;

-- Internal projection used by public read and authenticated administrative preview.
-- It never returns M2 documents, variant internals, stock counts or drafts.
create function public.brand_storefront_cards_m3(p_brand_slug text,p_ids uuid[]) returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(card order by card->>'id'),'[]'::jsonb) from (
 select jsonb_build_object('id',p.id,'name',p.name,
 'price',(select min(v.price) from pos_product_variants v where v.product_id=p.id and v.brand_slug=b.slug and v.active),
 'currency',(select case when count(distinct currency)=1 then min(currency) end from pos_locations where brand_slug=b.slug),
 'soldOut',not exists(select 1 from pos_inventory i join pos_product_variants v on v.id=i.variant_id where v.product_id=p.id and v.active and v.brand_slug=b.slug and i.brand_slug=b.slug and i.quantity-i.reserved_quantity>0),
 'image',(select photo->>'path' from jsonb_array_elements(w.published->'colors') col cross join lateral jsonb_array_elements(col->'photos') photo
 where photo->>'path' like b.slug||'/web/%' and exists(select 1 from pos_product_variants v where v.product_id=p.id and v.brand_slug=b.slug and v.active and col->'variantIds' ? v.id::text) limit 1)) card
 from brands b join brand_online_store_access a on a.brand_id=b.id and a.status='enabled'
 join pos_products p on p.brand_slug=b.slug and p.brand_id::text=b.id::text
 join pos_product_sales_channels ch on ch.product_id=p.id and ch.online_requested
 join pos_product_web_content w on w.product_id=p.id and w.brand_id=b.id and w.published is not null
 where b.slug=p_brand_slug and b.status='active' and p.active and p.sellable and p.product_type='physical' and p.inventory_mode='direct'
 and p.id=any(p_ids)
 and exists(select 1 from pos_product_variants v where v.product_id=p.id and v.brand_slug=b.slug and v.active)
 ) cards;
$$;
revoke all on function public.brand_storefront_cards_m3(text,uuid[]) from public,anon,authenticated;
grant execute on function public.brand_storefront_cards_m3(text,uuid[]) to service_role;

create function public.brand_storefront_home_m3(p_brand_slug text) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare doc jsonb; ids uuid[];
begin
 select c.published into doc from brands b join brand_online_store_access a on a.brand_id=b.id and a.status='enabled'
 join brand_storefront_appearance c on c.brand_id=b.id
 where b.slug=p_brand_slug and b.status='active' and c.published is not null;
 if doc is null then return null; end if;
 select array_agg(distinct (e->>'productId')::uuid) into ids from jsonb_array_elements(doc->'sections') s cross join lateral jsonb_array_elements(s->'entries') e
 where coalesce(e->>'productId','')<>'' and (s->>'enabled')::boolean;
 return jsonb_build_object('appearance',doc,'products',public.brand_storefront_cards_m3(p_brand_slug,coalesce(ids,'{}')));
end $$;
revoke all on function public.brand_storefront_home_m3(text) from public;
grant execute on function public.brand_storefront_home_m3(text) to anon,authenticated,service_role;
commit;
