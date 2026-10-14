begin;
-- Presentation metadata only. Existing rows are not rewritten. Monetary snapshots,
-- inventory, payment transitions and authorization remain in their existing RPCs.
create function public.store_item_presentation_m8() returns trigger
language plpgsql security definer set search_path=public as $$
declare v pos_product_variants%rowtype;b text;colour jsonb;details jsonb;
begin
 if TG_OP='UPDATE' then
  if old.snapshot ? 'presentationVersion' then
   new.snapshot:=new.snapshot || jsonb_build_object('presentationVersion',old.snapshot->'presentationVersion','sku',old.snapshot->'sku','barcode',old.snapshot->'barcode','options',old.snapshot->'options','colorName',old.snapshot->'colorName','imagePath',old.snapshot->'imagePath');
  end if;
  return new;
 end if;
 select brands.slug into b from store_orders o join brands on brands.id=o.brand_id where o.id=new.order_id;
 select * into v from pos_product_variants where id=new.variant_id and product_id=new.product_id and brand_slug=b;
 if not found then return new;end if;
 select c into colour from pos_product_web_content w cross join lateral jsonb_array_elements(coalesce(w.published->'colors','[]')) c
 where w.product_id=new.product_id and w.brand_id=(select brand_id from store_orders where id=new.order_id) and c->'variantIds' ? new.variant_id::text limit 1;
 select coalesce(jsonb_object_agg(key,value),'{}') into details from jsonb_each(coalesce(v.attributes,'{}')) where jsonb_typeof(value) in ('string','number') and length(key)<=80 and length(value::text)<=160;
 new.snapshot:=new.snapshot||jsonb_build_object('presentationVersion',1,'sku',v.sku,'barcode',v.barcode,'options',details,'colorName',colour->>'name','imagePath',colour->'photos'->0->>'path');
 return new;
end $$;
revoke all on function public.store_item_presentation_m8() from public,anon,authenticated,service_role;
create trigger store_item_presentation_m8 before insert or update of snapshot on public.store_order_items for each row execute function public.store_item_presentation_m8();

create function public.store_delivery_presentation_m8() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if old.delivery_snapshot='{}'::jsonb and new.delivery_snapshot<>'{}'::jsonb and new.created_at>=transaction_timestamp() then
  new.delivery_snapshot:=new.delivery_snapshot||jsonb_build_object('locationName',(select name from pos_locations where id=new.location_id and brand_id=new.brand_id::text));
 end if;
 return new;
end $$;
revoke all on function public.store_delivery_presentation_m8() from public,anon,authenticated,service_role;
create trigger store_delivery_presentation_m8 before update of delivery_snapshot on public.store_orders for each row execute function public.store_delivery_presentation_m8();
create function public.store_notification_history_m8(p_brand text,p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare b uuid;result jsonb;total bigint;
begin
 select id into b from brands where slug=p_brand;perform store_actor_m7(b,p_actor);
 select count(*) into total from store_notifications n join store_order_events e on e.id=n.event_id where n.recipient=p_actor and n.read_at is null and e.brand_id=b;
 select coalesce(jsonb_agg(row_to_json(x)),'[]') into result from (
  select n.event_id,n.read_at,jsonb_build_object('order_id',e.order_id,'kind',e.kind,'created_at',e.created_at) as store_order_events
  from store_notifications n join store_order_events e on e.id=n.event_id where n.recipient=p_actor and e.brand_id=b order by e.created_at desc,e.id desc limit 100
 ) x;
 return jsonb_build_object('count',total,'notifications',result);
end $$;
revoke all on function public.store_notification_history_m8(text,uuid) from public,anon,authenticated;
grant execute on function public.store_notification_history_m8(text,uuid) to service_role;
commit;
