begin;

-- N1 stores delivery intent, never order state. No historical backfill.
create table public.comu_notifications (
 id uuid primary key default gen_random_uuid(),
 recipient_user_id uuid not null references auth.users(id),
 audience text not null check (audience in ('SELLER','BUYER')),
 order_id uuid not null references public.comu_orders(id),
 suborder_id uuid references public.comu_order_suborders(id),
 seller_id uuid references public.comu_sellers(id),
 source_table text not null check (source_table in ('order','fulfillment')),
 source_event_id uuid not null,
 event_kind text not null,
 dedupe_key text not null unique,
 title text not null, body text not null, deep_link text not null,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), read_at timestamptz,
 visibility text not null default 'VISIBLE' check (visibility in ('VISIBLE','HIDDEN')),
 check ((audience='SELLER' and seller_id is not null and suborder_id is not null) or audience='BUYER')
);
create index comu_notifications_recipient_n1 on public.comu_notifications(recipient_user_id,created_at desc,id desc);
create index comu_notifications_unread_n1 on public.comu_notifications(recipient_user_id) where read_at is null and visibility='VISIBLE';

create table public.comu_notification_outbox (
 id uuid primary key default gen_random_uuid(),
 source_table text not null check (source_table in ('order','fulfillment')),
 source_event_id uuid not null,
 recipient_user_id uuid references auth.users(id),
 notification_id uuid references public.comu_notifications(id),
 channel text not null check (channel in ('EVENT','IN_APP','EMAIL')),
 dedupe_key text not null unique,
 status text not null default 'PENDING' check (status in ('PENDING','PROCESSING','RETRY','DELIVERED','SUPPRESSED','FAILED')),
 attempt_count integer not null default 0 check (attempt_count>=0),
 next_attempt_at timestamptz not null default now(),
 claimed_at timestamptz, lease_until timestamptz, claim_token uuid,
 first_send_at timestamptz, delivered_at timestamptz, last_error text,
 email_payload jsonb,
 created_at timestamptz not null default now(),
 check ((channel='EVENT' and recipient_user_id is null and notification_id is null) or
        (channel in ('IN_APP','EMAIL') and recipient_user_id is not null and notification_id is not null)),
 unique(notification_id,channel)
);
create unique index comu_notification_source_delivery_n1 on public.comu_notification_outbox(source_table,source_event_id,recipient_user_id,channel,notification_id);
create index comu_notification_due_n1 on public.comu_notification_outbox(next_attempt_at,created_at) where status in ('PENDING','RETRY','PROCESSING');
create index comu_n1_order_source on public.comu_order_events(created_at,id) where event_type='ORDER_PAID';
create index comu_n1_fulfillment_source on public.comu_fulfillment_events(created_at,id)
 where event_type in ('SUBORDER_PREPARING','SUBORDER_READY_FOR_HUB','SUBORDER_READY_TO_SHIP','SUBORDER_SHIPPED','SUBORDER_DELIVERED','SUBORDER_ISSUE','INCIDENT_RECORDED');
alter table public.comu_notifications enable row level security;
alter table public.comu_notification_outbox enable row level security;
revoke all on public.comu_notifications,public.comu_notification_outbox from anon,authenticated;
grant select on public.comu_notifications to authenticated;
grant all on public.comu_notifications,public.comu_notification_outbox to service_role;

-- Immutable activation timestamp, written once by this migration. No control table.
do $$ begin
 execute format('create function public.comu_n1_cutover() returns timestamptz language sql immutable as %L',
   'select '||quote_literal(clock_timestamp())||'::timestamptz');
end $$;

create function public.comu_n1_recipient_allowed(p_user uuid,p_audience text,p_order uuid,p_seller uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.user_profiles where user_id=p_user and status='active')
 and exists(select 1 from auth.users where id=p_user)
 and case when p_audience='BUYER' then exists(
  select 1 from public.comu_orders o join public.comu_buyers b on b.id=o.buyer_id where o.id=p_order and b.user_id=p_user)
 when p_audience='SELLER' then exists(
  select 1 from public.comu_seller_memberships m join public.comu_sellers s on s.id=m.seller_id
  where m.user_id=p_user and m.seller_id=p_seller and m.active and m.role in ('OWNER','ADMIN','ORDER_MANAGER')
   and exists(select 1 from public.comu_order_suborders where order_id=p_order and seller_id=p_seller)
   and s.verification_status='VERIFIED' and (
    (s.approval_origin='LEGACY' and s.status in ('VERIFIED','ACTIVE')) or
    (s.approval_origin='C1' and s.status in ('PREPARING','ACTIVE') and exists(
     select 1 from public.comu_seller_applications a where a.id=s.approval_application_id and a.seller_id=s.id
     and a.brand_id::text=s.brand_id::text and a.status='APPROVED' and a.decision='APPROVED'
     and a.reviewed_by is not null and a.reviewed_at is not null))))
 else false end
$$;
create function public.comu_n1_visible(p_user uuid,p_audience text,p_order uuid,p_seller uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid()=p_user and public.comu_n1_recipient_allowed(p_user,p_audience,p_order,p_seller)
$$;
create policy comu_notifications_owner_n1 on public.comu_notifications for select to authenticated
 using (visibility='VISIBLE' and public.comu_n1_visible(recipient_user_id,audience,order_id,seller_id));

-- Only the two canonical event streams. O1 reconciles carrier IN_TRANSIT into
-- SUBORDER_SHIPPED; listening to both would duplicate the same business update.
create function public.comu_n1_capture() returns trigger
language plpgsql security definer set search_path=public as $$
declare source text;
begin
 source:=case when tg_table_name='comu_order_events' then 'order' else 'fulfillment' end;
 if new.created_at<public.comu_n1_cutover() or
  not ((source='order' and new.event_type='ORDER_PAID') or
       (source='fulfillment' and new.event_type in ('SUBORDER_PREPARING','SUBORDER_READY_FOR_HUB','SUBORDER_READY_TO_SHIP','SUBORDER_SHIPPED','SUBORDER_DELIVERED','SUBORDER_ISSUE','INCIDENT_RECORDED'))) then return new; end if;
 insert into public.comu_notification_outbox(source_table,source_event_id,channel,dedupe_key)
 values(source,new.id,'EVENT','event:'||source||':'||new.id) on conflict(dedupe_key) do nothing;
 return new;
exception when others then
 -- The canonical event remains durable. Reconcile repairs a missed capture.
 -- Never leak event payload or SQL error details and never block fulfillment.
 raise warning 'COMU_N1_CAPTURE_RETRY_REQUIRED';
 return new;
end $$;
create trigger comu_n1_order_event after insert on public.comu_order_events for each row execute function public.comu_n1_capture();
create trigger comu_n1_fulfillment_event after insert on public.comu_fulfillment_events for each row execute function public.comu_n1_capture();

create function public.comu_n1_reconcile() returns integer
language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 insert into public.comu_notification_outbox(source_table,source_event_id,channel,dedupe_key)
 select e.source,e.id,'EVENT','event:'||e.source||':'||e.id from (
  select 'order' source,id,created_at from public.comu_order_events where created_at>=public.comu_n1_cutover() and event_type='ORDER_PAID'
  union all select 'fulfillment',id,created_at from public.comu_fulfillment_events where created_at>=public.comu_n1_cutover()
   and event_type in ('SUBORDER_PREPARING','SUBORDER_READY_FOR_HUB','SUBORDER_READY_TO_SHIP','SUBORDER_SHIPPED','SUBORDER_DELIVERED','SUBORDER_ISSUE','INCIDENT_RECORDED')
 )e where not exists(select 1 from public.comu_notification_outbox b where b.dedupe_key='event:'||e.source||':'||e.id)
 order by e.created_at,e.id limit 200 on conflict(dedupe_key) do nothing;
 get diagnostics n=row_count; return n;
end $$;

create function public.comu_n1_emit(p_source text,p_event uuid,p_kind text,p_order uuid,p_suborder uuid,p_seller uuid,p_user uuid,p_audience text,p_email boolean) returns void
language plpgsql security definer set search_path=public as $$
declare key text; nid uuid; folio text; headline text; message text; link text; slug text; quantity numeric;
begin
 if not public.comu_n1_recipient_allowed(p_user,p_audience,p_order,p_seller) then return; end if;
 -- Semantic identity also reconciles duplicated ORDER_PAID rows with different IDs.
 key:=p_kind||':'||coalesce(p_suborder,p_order)::text||':'||p_audience||':'||p_user::text||case when p_kind='ISSUE' then ':'||p_event::text else '' end;
 select order_number::text into folio from public.comu_orders where id=p_order;
 headline:=case p_kind when 'ORDER_PAID' then case when p_audience='SELLER' then 'Nuevo pedido' else 'Pedido confirmado' end
  when 'PREPARING' then 'Pedido en preparación' when 'READY_FOR_HUB' then 'Tu pedido avanza' when 'READY_TO_SHIP' then 'Pedido listo para envío'
  when 'IN_TRANSIT' then 'Pedido en tránsito' when 'DELIVERED' then 'Pedido entregado' else 'Actualización importante de tu pedido' end;
 message:=case p_kind when 'ORDER_PAID' then case when p_audience='SELLER' then 'Tienes un nuevo pedido listo para preparar.' else 'Confirmamos el pago de tu pedido.' end
  when 'PREPARING' then 'Los productos se están preparando.' when 'READY_FOR_HUB' then 'Los productos están listos para la siguiente etapa de envío.'
  when 'READY_TO_SHIP' then 'Los productos están listos para salir.' when 'IN_TRANSIT' then 'Los productos de esta parte de tu pedido están en camino.'
  when 'DELIVERED' then 'Se confirmó la entrega de esta parte de tu pedido.' else 'Hay una incidencia. Consulta el pedido para conocer su estado.' end;
 if p_kind='ORDER_PAID' then
  select sum(i.quantity) into quantity from public.comu_order_items i where i.order_id=p_order and (p_suborder is null or i.suborder_id=p_suborder);
  if quantity>0 then message:=message||' Cantidad de productos: '||trim_scale(quantity)::text||'.'; end if;
 end if;
 if p_audience='SELLER' then
  select brand_slug into slug from public.comu_sellers where id=p_seller;
  -- Slugs are existing route identifiers; unsafe path characters fail closed.
  if slug is null or slug !~ '^[A-Za-z0-9_-]+$' then raise exception 'COMU_N1_LINK_INVALID'; end if;
  link:='/comu/seller/'||slug||'/orders?selected='||p_suborder;
 else link:='/comu/account/orders/'||p_order||'?view=detail'; end if;
 insert into public.comu_notifications(recipient_user_id,audience,order_id,suborder_id,seller_id,source_table,source_event_id,event_kind,dedupe_key,title,body,deep_link,metadata)
 values(p_user,p_audience,p_order,p_suborder,p_seller,p_source,p_event,p_kind,key,headline,'Pedido #'||folio||'. '||message,link,
  jsonb_build_object('orderNumber',folio,'scope',case when p_suborder is null then 'MASTER' else 'SUBORDER' end))
 on conflict(dedupe_key) do nothing returning id into nid;
 if nid is null then return; end if;
 insert into public.comu_notification_outbox(source_table,source_event_id,recipient_user_id,notification_id,channel,dedupe_key,status,delivered_at)
 values(p_source,p_event,p_user,nid,'IN_APP','in-app:'||key,'DELIVERED',now());
 if p_email then
  insert into public.comu_notification_outbox(source_table,source_event_id,recipient_user_id,notification_id,channel,dedupe_key)
  values(p_source,p_event,p_user,nid,'EMAIL','email:'||key);
 end if;
end $$;

create function public.comu_n1_expand(p_id uuid,p_token uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare b public.comu_notification_outbox%rowtype; oid uuid; sid uuid; kind text; buyer uuid; s record; member record; seller_email boolean:=false;
begin
 select * into b from public.comu_notification_outbox where id=p_id and claim_token=p_token and status='PROCESSING' and lease_until>now() and channel='EVENT' for update;
 if not found then return false; end if;
 if b.source_table='order' then
  select order_id,suborder_id,event_type into oid,sid,kind from public.comu_order_events where id=b.source_event_id;
 else
  select order_id,suborder_id,event_type into oid,sid,kind from public.comu_fulfillment_events where id=b.source_event_id;
 end if;
 kind:=case kind when 'SUBORDER_SHIPPED' then 'IN_TRANSIT' when 'INCIDENT_RECORDED' then 'ISSUE' else replace(kind,'SUBORDER_','') end;
 if oid is null or kind is null then raise exception 'COMU_N1_SOURCE_MISSING'; end if;
 select u.user_id into buyer from public.comu_orders o join public.comu_buyers u on u.id=o.buyer_id where o.id=oid;
 seller_email:=kind='ORDER_PAID' or (kind='ISSUE' and exists(
  select 1 from public.comu_fulfillment_events e join public.comu_fulfillment_incidents i on i.id::text=e.payload->>'incidentId'
  where e.id=b.source_event_id and i.incident_type in ('INCOMPLETE_PACKAGE','WRONG_PRODUCT','DAMAGED_PACKAGE')));
 -- A recorded incident on an already delivered/cancelled order is not an active ISSUE.
 if kind='ISSUE' and not exists(select 1 from public.comu_order_suborders where id=sid and fulfillment_status='ISSUE') then
  update public.comu_notification_outbox set status='SUPPRESSED',last_error='ISSUE_NO_LONGER_ACTIVE',claim_token=null,lease_until=null where id=b.id; return true;
 end if;
 if buyer is not null then perform public.comu_n1_emit(b.source_table,b.source_event_id,kind,oid,sid,null,buyer,'BUYER',kind in ('ORDER_PAID','IN_TRANSIT','DELIVERED','ISSUE')); end if;
 for s in select id,seller_id from public.comu_order_suborders where order_id=oid and (sid is null or id=sid) loop
  for member in select user_id from public.comu_seller_memberships where seller_id=s.seller_id and active and role in ('OWNER','ADMIN','ORDER_MANAGER') loop
   perform public.comu_n1_emit(b.source_table,b.source_event_id,kind,oid,s.id,s.seller_id,member.user_id,'SELLER',seller_email);
  end loop;
 end loop;
 update public.comu_notification_outbox set status='DELIVERED',delivered_at=now(),claim_token=null,lease_until=null,last_error=null where id=b.id;
 return true;
end $$;

create function public.comu_n1_claim(p_size integer default 10) returns setof public.comu_notification_outbox
language plpgsql security definer set search_path=public as $$
begin
 if p_size is null or p_size<1 or p_size>20 then raise exception 'COMU_N1_BATCH_INVALID'; end if;
 -- A timed-out send might have succeeded: do not retry beyond provider dedupe window.
 update public.comu_notification_outbox set status='FAILED',last_error='DELIVERY_REVIEW_REQUIRED',claim_token=null,lease_until=null
 where status in ('PENDING','RETRY','PROCESSING') and (lease_until is null or lease_until<=now())
 and (attempt_count>=6 or (first_send_at is not null and first_send_at<now()-interval '23 hours'));
 return query with due as (
  select id from public.comu_notification_outbox where channel in ('EVENT','EMAIL') and attempt_count<6
   and ((status in ('PENDING','RETRY') and next_attempt_at<=now()) or (status='PROCESSING' and lease_until<=now()))
  order by next_attempt_at,created_at,id for update skip locked limit p_size
 ) update public.comu_notification_outbox b set status='PROCESSING',attempt_count=b.attempt_count+1,
   claimed_at=now(),lease_until=now()+interval '120 seconds',claim_token=gen_random_uuid()
 from due where b.id=due.id returning b.*;
end $$;

create function public.comu_n1_prepare_email(p_id uuid,p_token uuid,p_from text,p_origin text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare b public.comu_notification_outbox%rowtype; n public.comu_notifications%rowtype; email text; payload jsonb;
begin
 select * into b from public.comu_notification_outbox where id=p_id and claim_token=p_token and status='PROCESSING' and lease_until>now() and channel='EMAIL' for update;
 if not found then return null; end if;
 select * into n from public.comu_notifications where id=b.notification_id;
 if not public.comu_n1_recipient_allowed(b.recipient_user_id,n.audience,n.order_id,n.seller_id) or n.visibility<>'VISIBLE' then
  update public.comu_notification_outbox set status='SUPPRESSED',last_error='RECIPIENT_REVOKED',claim_token=null,lease_until=null where id=b.id; return null;
 end if;
 select u.email into email from auth.users u where u.id=b.recipient_user_id;
 if email is null or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'COMU_N1_EMAIL_UNAVAILABLE'; end if;
 if b.email_payload is not null and b.email_payload->'to'->>0 is distinct from email then
  update public.comu_notification_outbox set status='FAILED',last_error='RECIPIENT_CHANGED_REVIEW',claim_token=null,lease_until=null where id=b.id; return null;
 end if;
 if p_from is null or p_origin is null or p_origin !~ '^https?://[^/[:space:]]+$' then raise exception 'COMU_N1_EMAIL_CONFIG_INVALID'; end if;
 payload:=coalesce(b.email_payload,jsonb_build_object('from','COMU <'||p_from||'>','to',jsonb_build_array(email),
  'subject','COMU · '||n.title,'text','COMU'||E'\n\n'||n.title||E'\n\n'||n.body||E'\n\nVer pedido: '||p_origin||n.deep_link));
 update public.comu_notification_outbox set email_payload=payload,first_send_at=coalesce(first_send_at,now()) where id=b.id;
 return payload;
end $$;

create function public.comu_n1_finish(p_id uuid,p_token uuid,p_ok boolean,p_error text default null) returns boolean
language plpgsql security definer set search_path=public as $$
begin
 update public.comu_notification_outbox set
 status=case when p_ok then 'DELIVERED' when attempt_count>=6 or first_send_at<now()-interval '23 hours' then 'FAILED' else 'RETRY' end,
 delivered_at=case when p_ok then now() else null end,
 next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,attempt_count-1)::integer)),
 last_error=case when p_ok then null when p_error in ('PROVIDER_UNAVAILABLE','PROVIDER_REJECTED','CONFIGURATION','DISPATCH_FAILED') then p_error else 'DISPATCH_FAILED' end,
 claim_token=null,lease_until=null
 where id=p_id and claim_token=p_token and status='PROCESSING' and lease_until>now();
 return found;
end $$;

create function public.comu_notifications_read_n1(p_audience text default 'SELLER',p_seller uuid default null,p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb; unread bigint;
begin
 if auth.uid() is null then raise exception 'COMU_UNAUTHORIZED'; end if;
 if p_audience is null or p_audience not in ('SELLER','BUYER') or p_limit is null or p_limit<1 or p_limit>50 then raise exception 'COMU_N1_INPUT_INVALID'; end if;
 select count(*) into unread from public.comu_notifications n where n.recipient_user_id=auth.uid() and n.audience=p_audience
  and (p_seller is null or n.seller_id=p_seller) and n.read_at is null and n.visibility='VISIBLE'
  and public.comu_n1_recipient_allowed(auth.uid(),n.audience,n.order_id,n.seller_id);
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc),'[]'::jsonb) into result from (
  select id,audience,seller_id,source_table,source_event_id,event_kind,title,body,deep_link,metadata,created_at,read_at from public.comu_notifications n
  where n.recipient_user_id=auth.uid() and n.audience=p_audience and (p_seller is null or n.seller_id=p_seller)
   and n.visibility='VISIBLE' and public.comu_n1_recipient_allowed(auth.uid(),n.audience,n.order_id,n.seller_id)
  order by created_at desc,id desc limit p_limit
 )q;
 return jsonb_build_object('notifications',result,'unreadCount',unread);
end $$;
create function public.comu_notifications_mark_n1(p_id uuid default null,p_audience text default 'SELLER',p_seller uuid default null) returns integer
language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 if auth.uid() is null then raise exception 'COMU_UNAUTHORIZED'; end if;
 if p_audience is null or p_audience not in ('SELLER','BUYER') then raise exception 'COMU_N1_INPUT_INVALID'; end if;
 if p_id is not null and not exists(select 1 from public.comu_notifications where id=p_id and recipient_user_id=auth.uid()
  and audience=p_audience and (p_seller is null or seller_id=p_seller) and visibility='VISIBLE'
  and public.comu_n1_recipient_allowed(auth.uid(),audience,order_id,seller_id)) then raise exception 'COMU_NOTIFICATION_NOT_FOUND'; end if;
 update public.comu_notifications set read_at=coalesce(read_at,now()) where recipient_user_id=auth.uid()
  and audience=p_audience and (p_seller is null or seller_id=p_seller) and (p_id is null or id=p_id) and read_at is null
  and visibility='VISIBLE' and public.comu_n1_recipient_allowed(auth.uid(),audience,order_id,seller_id);
 get diagnostics n=row_count; return n;
end $$;

-- Revoke PostgreSQL's default function grants, including Supabase default ACLs.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and (p.proname like 'comu_n1_%' or p.proname in ('comu_notifications_read_n1','comu_notifications_mark_n1')) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
grant execute on function public.comu_n1_visible(uuid,text,uuid,uuid),public.comu_notifications_read_n1(text,uuid,integer),public.comu_notifications_mark_n1(uuid,text,uuid) to authenticated;
grant execute on function public.comu_n1_reconcile(),public.comu_n1_claim(integer),public.comu_n1_expand(uuid,uuid),public.comu_n1_prepare_email(uuid,uuid,text,text),public.comu_n1_finish(uuid,uuid,boolean,text) to service_role;
commit;
