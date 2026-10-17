begin read only;
with expected as (
 select o.brand_slug,o.location_id,(line->>'variant_id')::uuid variant_id,sum((line->>'quantity')::numeric) expected
 from public.pos_retail_orders o cross join lateral jsonb_array_elements(o.quote->'items') line
 where o.state='active' and coalesce((line->>'track_inventory')::boolean,false)
 group by 1,2,3
), inspected as (
 select i.brand_slug,i.location_id,i.variant_id,i.quantity,i.reserved_quantity,coalesce(e.expected,0) expected
 from public.pos_inventory i full join expected e using(brand_slug,location_id,variant_id)
 where coalesce(i.brand_slug,e.brand_slug)='magenta-fitwear'
)
select jsonb_build_object(
 'activeOrders',(select count(*) from public.pos_retail_orders where brand_slug='magenta-fitwear' and state='active'),
 'expiredStillActive',(select count(*) from public.pos_retail_orders where brand_slug='magenta-fitwear' and state='active' and expires_at<clock_timestamp()),
 'stockConflicts',coalesce((select jsonb_agg(to_jsonb(i)) from inspected i where quantity is null or reserved_quantity<expected or reserved_quantity>quantity or reserved_quantity<0),'[]'::jsonb),
 'otherOrUnattributedReservations',coalesce((select jsonb_agg(to_jsonb(i)) from inspected i where reserved_quantity>expected),'[]'::jsonb),
 'paymentsMismatch',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'folio',o.folio,'paid',o.paid,'ledger',p.amount)) from public.pos_retail_orders o left join lateral(select coalesce(sum(amount),0) amount from public.pos_retail_order_payments p where p.order_id=o.id and p.brand_slug=o.brand_slug) p on true where o.brand_slug='magenta-fitwear' and o.paid<>p.amount),'[]'::jsonb),
 'duplicateActivation',coalesce((select jsonb_agg(to_jsonb(d)) from(select order_id,count(*) from public.pos_retail_order_events where brand_slug='magenta-fitwear' and action='activate' group by order_id having count(*)>1)d),'[]'::jsonb),
 'expiryJob',(select jsonb_agg(jsonb_build_object('active',active,'schedule',schedule)) from cron.job where jobname='pos-retail-expiry-v1')
) audit;
commit;
