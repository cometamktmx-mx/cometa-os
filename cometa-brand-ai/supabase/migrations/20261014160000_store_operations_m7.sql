begin;
-- Own-store operations only. M6 remains the canonical reserve/payment authority.
create table public.store_settings (
 brand_id uuid primary key references public.brands(id), revision integer not null check(revision>0),
 document jsonb not null check(jsonb_typeof(document)='object'),
 updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now()
);
alter table public.store_orders add column payment_method text not null default 'STRIPE' check(payment_method in ('STRIPE','WHATSAPP'));
alter table public.store_orders add column delivery_method text not null default 'SHIPPING' check(delivery_method in ('SHIPPING','PICKUP'));
alter table public.store_orders add column delivery_snapshot jsonb not null default '{}';
alter table public.store_orders add column preparation_status text not null default 'NEW' check(preparation_status in ('NEW','PREPARING','READY','CANCELLED'));
alter table public.store_orders add column delivery_status text not null default 'PENDING' check(delivery_status in ('PENDING','SHIPPED','DELIVERED','CANCELLED'));
alter table public.store_orders add column tracking text;
alter table public.store_orders add column refund_required boolean not null default false;
alter table public.store_orders add column operation_revision integer not null default 0;
create table public.store_order_events (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.store_orders(id),
 brand_id uuid not null references public.brands(id), kind text not null, actor uuid references auth.users(id),
 detail jsonb not null, created_at timestamptz not null default now()
);
create table public.store_notifications (
 event_id uuid not null references public.store_order_events(id), recipient uuid not null references auth.users(id),
 read_at timestamptz, primary key(event_id,recipient)
);
create index store_order_events_brand_time on public.store_order_events(brand_id,created_at desc,id);
create index store_notifications_recipient on public.store_notifications(recipient,read_at);
alter table public.store_settings enable row level security;
alter table public.store_order_events enable row level security;
alter table public.store_notifications enable row level security;
revoke all on public.store_settings,public.store_order_events,public.store_notifications from public,anon,authenticated,service_role;
grant select on public.store_settings,public.store_order_events,public.store_notifications to service_role;

create function public.store_actor_m7(p_brand uuid,p_actor uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from user_profiles u where u.user_id=p_actor and u.status='active' and
 (u.role='admin' or exists(select 1 from user_brand_access a join brands b on b.slug=a.brand_slug
 where b.id=p_brand and a.user_id=p_actor and a.status='active' and a.access_role in ('owner','admin'))))
 then raise exception 'POS_WEB_DENIED' using errcode='42501';end if;
 if not exists(select 1 from brands where id=p_brand and status='active') then raise exception 'POS_WEB_DENIED';end if;
end $$;

create function public.store_settings_save_m7(p_brand text,p_actor uuid,p_revision integer,p_document jsonb,p_stripe_account text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b brands%rowtype;s store_settings%rowtype;l pos_locations%rowtype;t jsonb;r text;
begin
 select * into b from brands where slug=p_brand for update;
 perform store_actor_m7(b.id,p_actor);
 select * into s from store_settings where brand_id=b.id for update;
 if p_revision is null or coalesce(s.revision,0)<>p_revision then raise exception 'POS_WEB_CONFLICT';end if;
 if jsonb_typeof(p_document) is distinct from 'object' or octet_length(p_document::text)>60000
 or p_document->>'status' not in ('OPEN','CLOSED') or length(trim(p_document->>'name')) not between 1 and 100
 or p_document->>'currency' not in ('MXN','USD','EUR')
 or jsonb_typeof(p_document->'shipping'->'enabled') is distinct from 'boolean'
 or jsonb_typeof(p_document->'pickup'->'enabled') is distinct from 'boolean'
 or jsonb_typeof(p_document->'payments'->'stripe') is distinct from 'boolean'
 or jsonb_typeof(p_document->'payments'->'whatsapp') is distinct from 'boolean'
 or jsonb_typeof(p_document->'recipients') is distinct from 'array'
 or jsonb_typeof(p_document->'tiers') is distinct from 'array' then raise exception 'POS_VALIDATION_ERROR';end if;
 select * into l from pos_locations where id=(p_document->>'locationId')::uuid and brand_slug=b.slug and active for share;
 if not found or l.currency<>p_document->>'currency' then raise exception 'POS_VALIDATION_ERROR';end if;
 if (p_document->'payments'->>'stripe')::boolean and (p_stripe_account is null or p_stripe_account !~ '^acct_[A-Za-z0-9]+$') then raise exception 'STORE_STRIPE_TEST_REQUIRED';end if;
 if (p_document->'payments'->>'whatsapp')::boolean and coalesce(p_document->>'whatsapp','') !~ '^[1-9][0-9]{7,14}$' then raise exception 'POS_VALIDATION_ERROR';end if;
 if (p_document->'shipping'->>'feeCents')::bigint<0 or (p_document->'shipping'->>'freeFromCents')::bigint<0
 or (p_document->'shipping'->>'minDays')::integer<0 or (p_document->'shipping'->>'maxDays')::integer<(p_document->'shipping'->>'minDays')::integer then raise exception 'POS_VALIDATION_ERROR';end if;
 for r in select jsonb_array_elements_text(p_document->'recipients') loop perform store_actor_m7(b.id,r::uuid);end loop;
 for t in select value from jsonb_array_elements(p_document->'tiers') loop
  if (t->>'minQuantity')::integer not between 1 and 9900 or t->>'mode' not in ('UNIT_PRICE','AMOUNT_OFF','PERCENT_OFF')
  or (t->>'value')::numeric<0 or round((t->>'value')::numeric,2)<>(t->>'value')::numeric
  or (t->>'mode'='PERCENT_OFF' and (t->>'value')::numeric>=100) then raise exception 'POS_VALIDATION_ERROR';end if;
  if nullif(t->>'productId','') is not null and not exists(select 1 from pos_products where id=(t->>'productId')::uuid and brand_slug=b.slug) then raise exception 'POS_WEB_DENIED';end if;
 end loop;
 insert into store_settings values(b.id,p_revision+1,p_document,p_actor,now()) on conflict(brand_id) do update set revision=excluded.revision,document=excluded.document,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 insert into store_checkout_configuration values(b.id,l.id,'RETAIL_GROSS',p_document->>'currency',coalesce(p_stripe_account,'WHATSAPP_PENDING'),now(),p_actor)
 on conflict(brand_id) do update set location_id=excluded.location_id,currency=excluded.currency,stripe_account_ref=excluded.stripe_account_ref,reviewed_at=excluded.reviewed_at,reviewed_by=excluded.reviewed_by;
 return jsonb_build_object('revision',p_revision+1,'document',p_document);
end $$;

create function public.store_public_settings_m7(p_brand text) returns jsonb language sql stable security definer set search_path=public as $$
 select s.document-'recipients' from store_settings s join brands b on b.id=s.brand_id where b.slug=p_brand and brand_storefront_home_m3(p_brand) is not null;
$$;

-- Same tier modes/threshold precedence as the existing wholesale engine, with
-- own-store rules and numeric half-up rounding; never read COMU seller settings.
create function public.store_cart_m7(p_brand text,p_lines jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare c jsonb;d jsonb;x jsonb;t jsonb;items jsonb:='[]';n integer;u bigint;retail bigint:=0;subtotal bigint:=0;quantity integer;
begin
 select document into d from store_settings s join brands b on b.id=s.brand_id where b.slug=p_brand;
 if d is null or d->>'status'<>'OPEN' then raise exception 'STORE_CONFIGURATION_REQUIRED';end if;
 c:=store_cart_m6(p_brand,p_lines);
 for x in select value from jsonb_array_elements(c->'items') loop
  n:=(x->>'quantity')::integer;u:=(x->>'unitCents')::bigint;retail:=retail+u*n;
  select coalesce(sum((e->>'quantity')::integer),0) into quantity from jsonb_array_elements(c->'items') e
   where (d->>'mixProducts')::boolean or e->>'productId'=x->>'productId';
  select value into t from jsonb_array_elements(d->'tiers') where (nullif(value->>'productId','') is null or value->>'productId'=x->>'productId')
   and (value->>'minQuantity')::integer<=quantity order by (nullif(value->>'productId','') is not null) desc,(value->>'minQuantity')::integer desc limit 1;
  if t is not null then
   if t->>'mode'='UNIT_PRICE' then u:=round((t->>'value')::numeric*100);
   elsif t->>'mode'='AMOUNT_OFF' then u:=u-round((t->>'value')::numeric*100);
   else u:=round(u*(100-(t->>'value')::numeric)/100);end if;
  end if;
  if u<=0 or u>(x->>'unitCents')::bigint then raise exception 'STORE_PRICE_UNAVAILABLE';end if;
  items:=items||jsonb_build_array(x||jsonb_build_object('retailUnitCents',x->'unitCents','unitCents',u,'totalCents',u*n,'tier',t));subtotal:=subtotal+u*n;
 end loop;
 return c||jsonb_build_object('items',items,'subtotalCents',subtotal,'discountCents',retail-subtotal,'retailSubtotalCents',retail);
end $$;

create function public.store_quote_m7(p_brand text,p_owner text,p_lines jsonb,p_contact jsonb,p_delivery text,p_method text,p_hash text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s store_settings%rowtype;c jsonb;q uuid;fee bigint;shipping jsonb;
begin
 select s0.* into s from store_settings s0 join brands b on b.id=s0.brand_id where b.slug=p_brand for share of s0;
 if s.brand_id is null or p_owner !~ '^[0-9a-f]{64}$' or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'STORE_CONFIGURATION_REQUIRED';end if;
 if p_method not in ('STRIPE','WHATSAPP') or not coalesce((s.document->'payments'->>lower(p_method))::boolean,false) then raise exception 'STORE_PAYMENT_UNAVAILABLE';end if;
 if p_delivery not in ('SHIPPING','PICKUP') or not coalesce((s.document->lower(p_delivery)->>'enabled')::boolean,false) then raise exception 'STORE_SHIPPING_REQUIRED';end if;
 c:=store_cart_m7(p_brand,p_lines);shipping:=s.document->'shipping';
 if p_delivery='SHIPPING' then
  if p_contact->>'country' is distinct from shipping->>'country' or not exists(select 1 from jsonb_array_elements_text(shipping->'postalPrefixes') p where left(p_contact->>'postalCode',length(p))=p) then raise exception 'STORE_OUTSIDE_COVERAGE';end if;
  fee:=(shipping->>'feeCents')::bigint;
  if shipping->>'freeFromCents' is not null and (c->>'subtotalCents')::bigint>=(shipping->>'freeFromCents')::bigint then fee:=0;end if;
 else fee:=0;end if;
 insert into store_shipping_quotes(brand_id,owner_hash,request_hash,location_id,currency,amount_cents,provider,provider_reference,verified_at,expires_at)
 values(s.brand_id,p_owner,p_hash,(s.document->>'locationId')::uuid,s.document->>'currency',fee,'MERCHANT_POLICY',s.revision::text,clock_timestamp(),clock_timestamp()+interval '10 minutes') returning id into q;
 return c||jsonb_build_object('quoteId',q,'shippingCents',fee,'totalCents',(c->>'subtotalCents')::bigint+fee,'ready',true,'blockers','[]'::jsonb);
end $$;

create function public.store_order_create_m7(p_brand text,p_owner text,p_attempt uuid,p_lines jsonb,p_contact jsonb,p_delivery text,p_method text,p_hash text)
returns public.store_orders language plpgsql security definer set search_path=public as $$
declare o store_orders%rowtype;s store_settings%rowtype;q jsonb;x jsonb;
begin
 if p_owner is null or p_owner !~ '^[0-9a-f]{64}$' or p_attempt is null or p_method not in ('STRIPE','WHATSAPP') or p_delivery not in ('SHIPPING','PICKUP') then raise exception 'STORE_UNAUTHORIZED';end if;
 perform id from brands where slug=p_brand for share;
 select s0.* into s from store_settings s0 join brands b on b.id=s0.brand_id where b.slug=p_brand for share of s0;
 if not found then raise exception 'STORE_CONFIGURATION_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('store:m6:owner:'||s.brand_id||':'||p_owner,0));
 select * into o from store_orders where brand_id=s.brand_id and attempt_id=p_attempt;
 if found then
  if o.owner_hash<>p_owner or o.request->'lines' is distinct from (select jsonb_agg(value order by value->>'variantId') from jsonb_array_elements(p_lines)) or o.contact<>p_contact or o.delivery_method<>p_delivery or o.payment_method<>p_method then raise exception 'STORE_IDEMPOTENCY_CONFLICT';end if;
  return o;
 end if;
 perform v.id from pos_product_variants v join pos_products p on p.id=v.product_id where v.brand_slug=p_brand and v.id in(select (value->>'variantId')::uuid from jsonb_array_elements(p_lines)) order by v.id for share of v,p;
 q:=store_quote_m7(p_brand,p_owner,p_lines,p_contact,p_delivery,p_method,p_hash);
 o:=store_order_create_m6(p_brand,p_owner,p_attempt,p_lines,p_contact,(q->>'quoteId')::uuid,p_hash);
 for x in select value from jsonb_array_elements(q->'items') loop
  update store_order_items set unit_cents=(x->>'unitCents')::bigint,snapshot=x where order_id=o.id and variant_id=(x->>'variantId')::uuid;
 end loop;
 update store_orders set subtotal_cents=(q->>'subtotalCents')::bigint,total_cents=(q->>'totalCents')::bigint,payment_method=p_method,delivery_method=p_delivery,
 delivery_snapshot=jsonb_build_object('method',p_delivery,'contact',p_contact,'pickup',case when p_delivery='PICKUP' then s.document->'pickup' end,'shipping',case when p_delivery='SHIPPING' then s.document->'shipping' end,'settingsRevision',s.revision)
 where id=o.id returning * into o;
 return o;
end $$;

create function public.store_event_m7() returns trigger language plpgsql security definer set search_path=public as $$
declare event uuid;kind text;r text;d jsonb;
begin
 if TG_OP='INSERT' then kind:='CREATED';
 elsif new.status is distinct from old.status then kind:='PAYMENT_'||new.status;
 elsif new.operation_revision is distinct from old.operation_revision then kind:=case when new.delivery_status<>old.delivery_status then new.delivery_status else new.preparation_status end;
 else return new;end if;
 insert into store_order_events(order_id,brand_id,kind,actor,detail) values(new.id,new.brand_id,kind,nullif(current_setting('store.actor',true),'')::uuid,
 jsonb_build_object('payment',new.status,'preparation',new.preparation_status,'delivery',new.delivery_status,'tracking',new.tracking,'refundRequired',new.refund_required)) returning id into event;
 select document into d from store_settings where brand_id=new.brand_id;
 for r in select jsonb_array_elements_text(coalesce(d->'recipients','[]')) loop
  insert into store_notifications values(event,r::uuid,null) on conflict do nothing;
 end loop;
 return new;
end $$;
create trigger store_order_event_m7 after insert or update on public.store_orders for each row execute function public.store_event_m7();

create function public.store_order_action_m7(p_brand text,p_actor uuid,p_order uuid,p_revision integer,p_action text,p_tracking text default null)
returns public.store_orders language plpgsql security definer set search_path=public as $$
declare o store_orders%rowtype;b uuid;i record;inv pos_inventory%rowtype;
begin
 select id into b from brands where slug=p_brand;perform store_actor_m7(b,p_actor);
 select * into o from store_orders where id=p_order and brand_id=b for update;
 if not found then raise exception 'STORE_ORDER_NOT_FOUND';end if;
 if p_revision is null or o.operation_revision<>p_revision then raise exception 'POS_WEB_CONFLICT';end if;
 perform set_config('store.actor',p_actor::text,true);
 if o.delivery_status in ('DELIVERED','CANCELLED') then raise exception 'STORE_TRANSITION_INVALID';end if;
 if p_action='CANCEL' then
  if o.delivery_status='SHIPPED' or o.status='PAYMENT_REVIEW' then raise exception 'STORE_TRANSITION_INVALID';end if;
  if o.status='PENDING' then o:=store_order_resolve_m6(o.id,'CANCELLED');
  elsif o.status='PAID' then
   for i in select * from store_order_items where order_id=o.id order by variant_id loop
    select * into inv from pos_inventory where location_id=o.location_id and variant_id=i.variant_id for update;
    if not found then raise exception 'STORE_INVENTORY_INVARIANT';end if;
    update pos_inventory set quantity=quantity+i.quantity,updated_at=now() where id=inv.id;
    insert into pos_inventory_movements(brand_id,brand_slug,location_id,variant_id,movement_type,quantity_delta,quantity_before,quantity_after,reference_type,reference_id,notes,created_by)
    values(inv.brand_id,inv.brand_slug,inv.location_id,inv.variant_id,'adjustment',i.quantity,inv.quantity,inv.quantity+i.quantity,'store_order_cancel',o.id,'Cancelación antes de entrega; reembolso pendiente',p_actor);
   end loop;
  end if;
  update store_orders set preparation_status='CANCELLED',delivery_status='CANCELLED',refund_required=(status='PAID'),operation_revision=operation_revision+1 where id=o.id returning * into o;
 else
  if o.status<>'PAID' then raise exception 'STORE_PAYMENT_REQUIRED';end if;
  if p_action='PREPARE' and o.preparation_status='NEW' then update store_orders set preparation_status='PREPARING',operation_revision=operation_revision+1 where id=o.id returning * into o;
  elsif p_action='READY' and o.preparation_status='PREPARING' then update store_orders set preparation_status='READY',operation_revision=operation_revision+1 where id=o.id returning * into o;
  elsif p_action='SHIP' and o.preparation_status='READY' and o.delivery_method='SHIPPING' and o.delivery_status='PENDING' and length(trim(p_tracking)) between 3 and 200 then update store_orders set delivery_status='SHIPPED',tracking=trim(p_tracking),operation_revision=operation_revision+1 where id=o.id returning * into o;
  elsif p_action='DELIVER' and ((o.delivery_method='PICKUP' and o.preparation_status='READY') or o.delivery_status='SHIPPED') then update store_orders set delivery_status='DELIVERED',operation_revision=operation_revision+1 where id=o.id returning * into o;
  else raise exception 'STORE_TRANSITION_INVALID';end if;
 end if;
 return o;
end $$;

create function public.store_notification_read_m7(p_brand text,p_actor uuid,p_event uuid) returns void language plpgsql security definer set search_path=public as $$
declare b uuid;
begin
 select id into b from brands where slug=p_brand;perform store_actor_m7(b,p_actor);
 update store_notifications n set read_at=coalesce(read_at,now()) where n.recipient=p_actor and n.event_id=p_event and exists(select 1 from store_order_events e where e.id=n.event_id and e.brand_id=b);
end $$;
create function public.store_notification_list_m7(p_brand text,p_actor uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare b uuid;result jsonb;total bigint;
begin
 select id into b from brands where slug=p_brand;perform store_actor_m7(b,p_actor);
 select count(*) into total from store_notifications n join store_order_events e on e.id=n.event_id where n.recipient=p_actor and n.read_at is null and e.brand_id=b;
 select coalesce(jsonb_agg(row_to_json(x)),'[]') into result from (
  select n.event_id,jsonb_build_object('order_id',e.order_id,'kind',e.kind,'created_at',e.created_at) as store_order_events
  from store_notifications n join store_order_events e on e.id=n.event_id where n.recipient=p_actor and n.read_at is null and e.brand_id=b order by e.created_at desc,e.id desc limit 100
 ) x;
 return jsonb_build_object('count',total,'notifications',result);
end $$;
revoke all on function public.store_notification_list_m7(text,uuid) from public,anon,authenticated;
grant execute on function public.store_notification_list_m7(text,uuid) to service_role;
revoke all on function public.store_actor_m7(uuid,uuid),public.store_settings_save_m7(text,uuid,integer,jsonb,text),public.store_public_settings_m7(text),public.store_cart_m7(text,jsonb),public.store_quote_m7(text,text,jsonb,jsonb,text,text,text),public.store_order_create_m7(text,text,uuid,jsonb,jsonb,text,text,text),public.store_event_m7(),public.store_order_action_m7(text,uuid,uuid,integer,text,text),public.store_notification_read_m7(text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.store_settings_save_m7(text,uuid,integer,jsonb,text),public.store_cart_m7(text,jsonb),public.store_quote_m7(text,text,jsonb,jsonb,text,text,text),public.store_order_create_m7(text,text,uuid,jsonb,jsonb,text,text,text),public.store_order_action_m7(text,uuid,uuid,integer,text,text),public.store_notification_read_m7(text,uuid,uuid) to service_role;
grant execute on function public.store_public_settings_m7(text) to anon,authenticated,service_role;
commit;
