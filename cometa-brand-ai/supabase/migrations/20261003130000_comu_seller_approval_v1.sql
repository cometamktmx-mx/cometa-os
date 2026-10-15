-- C1: LOCAL preparation only. Requires 20260928180000_comu_buyer_experience_v1.
-- No POS grants, subscriptions, inventory writes, historical reviews or remote execution.
begin;

alter table public.comu_sellers drop constraint comu_sellers_status_ck;
alter table public.comu_sellers add constraint comu_sellers_status_ck check(status in
 ('DRAFT','PENDING_VERIFICATION','VERIFIED','PREPARING','ACTIVE','SUSPENDED','PAUSED','CLOSED'));
alter table public.comu_storefronts drop constraint comu_storefronts_status_ck;
alter table public.comu_storefronts add constraint comu_storefronts_status_ck check(status in
 ('DRAFT','PREPARING','PUBLISHED','ACTIVE','SUSPENDED'));
-- Existing records retain their exact status, verification, timestamps and memberships.
alter table public.comu_sellers add column approval_origin text not null default 'LEGACY'
 check(approval_origin in ('LEGACY','C1'));
alter table public.comu_sellers alter column approval_origin set default 'C1';
alter table public.comu_sellers add column approval_application_id uuid unique
 references public.comu_seller_applications(id);
alter table public.comu_seller_applications
 add column reviewed_by uuid references auth.users(id),
 add column reviewed_at timestamptz,
 add column decision text check(decision in ('APPROVED','REJECTED')),
 add column review_note text check(length(review_note)<=2000),
 add column brand_id uuid references public.brands(id),
 add column seller_id uuid references public.comu_sellers(id);

create function public.comu_c1_is_admin() returns boolean
 language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.user_profiles where user_id=auth.uid() and role='admin' and status='active');
$$;
revoke all on function public.comu_c1_is_admin() from public;
grant execute on function public.comu_c1_is_admin() to authenticated,service_role;

-- The only activation policy. Both the API and protected state transitions use it.
create function public.comu_seller_activation_check_v1(p_seller_id uuid) returns jsonb
 language plpgsql security definer set search_path=public as $$
declare s public.comu_sellers%rowtype; sf public.comu_storefronts%rowtype; n integer:=0; reason text;
begin
 select * into s from public.comu_sellers where id=p_seller_id;
 select * into sf from public.comu_storefronts where seller_id=p_seller_id;
 select count(distinct l.product_id) into n
 from public.comu_product_listings l join public.pos_products p on p.id=l.product_id
 where l.seller_id=s.id and l.storefront_id=sf.id and l.status='PUBLISHED'
 and p.brand_id=s.brand_id and p.brand_slug=s.brand_slug and p.active and p.sellable
 and exists(select 1 from public.comu_variant_listings vl join public.pos_product_variants v on v.id=vl.variant_id
   where vl.listing_id=l.id and vl.enabled and v.active and v.product_id=p.id and v.brand_slug=s.brand_slug
     and coalesce(vl.price_override,l.retail_price_override,v.price,0)>0);
 if s.id is null then reason:='SELLER_NOT_FOUND';
 elsif s.verification_status<>'VERIFIED' or not (
   s.approval_origin='LEGACY' or exists(select 1 from public.comu_seller_applications a
   where a.id=s.approval_application_id and a.seller_id=s.id and a.status='APPROVED'
     and a.decision='APPROVED' and a.reviewed_by is not null and a.reviewed_at is not null)
 ) then reason:='SELLER_NOT_VERIFIED';
 elsif sf.id is null or btrim(coalesce(sf.name,''))='' or btrim(coalesce(sf.slug,''))=''
   or btrim(coalesce(sf.description,''))='' then reason:='STOREFRONT_REQUIRED';
 elsif n<10 then reason:='MINIMUM_LISTINGS_REQUIRED';
 elsif not exists(select 1 from public.comu_seller_payment_accounts a where a.seller_id=s.id
   and a.stripe_account_id is not null and a.onboarding_status='COMPLETE'
   and a.transfers_enabled and a.payouts_enabled and not a.financial_suspended)
 then reason:='COMU_CONNECT_REQUIRED';
 end if;
 return jsonb_build_object('ok',reason is null,'reason',reason,'publishedListings',n,'minimumListings',10);
end; $$;
revoke all on function public.comu_seller_activation_check_v1(uuid) from public,anon,authenticated;
grant execute on function public.comu_seller_activation_check_v1(uuid) to service_role;

create function public.comu_c1_protect_seller() returns trigger
 language plpgsql security definer set search_path=public as $$
begin
 if TG_OP='INSERT' then
   if not public.comu_c1_is_admin() or new.approval_origin<>'C1' or new.approval_application_id is null
     or new.status<>'PREPARING' or new.verification_status<>'VERIFIED'
   then raise exception 'COMU_APPROVAL_REQUIRED'; end if;
 elsif row(new.id,new.brand_id,new.brand_slug,new.status,new.verification_status,new.verified_at,new.activated_at,new.approval_origin,new.approval_application_id)
   is distinct from row(old.id,old.brand_id,old.brand_slug,old.status,old.verification_status,old.verified_at,old.activated_at,old.approval_origin,old.approval_application_id) then
   if not public.comu_c1_is_admin() then raise exception 'COMU_ADMIN_REQUIRED'; end if;
   if row(new.id,new.brand_id,new.brand_slug,new.approval_origin,new.approval_application_id)
     is distinct from row(old.id,old.brand_id,old.brand_slug,old.approval_origin,old.approval_application_id)
   then raise exception 'COMU_APPROVAL_IDENTITY_IMMUTABLE'; end if;
   if new.status='ACTIVE' and old.status<>'ACTIVE' and not (public.comu_seller_activation_check_v1(old.id)->>'ok')::boolean
   then raise exception 'COMU_ACTIVATION_NOT_ELIGIBLE'; end if;
 end if;
 return new;
end; $$;
create trigger comu_c1_seller_guard before insert or update on public.comu_sellers
 for each row execute function public.comu_c1_protect_seller();

create function public.comu_c1_protect_storefront() returns trigger
 language plpgsql security definer set search_path=public as $$
begin
 if TG_OP='INSERT' then
   if not public.comu_c1_is_admin() or new.status<>'PREPARING' then raise exception 'COMU_APPROVAL_REQUIRED'; end if;
 elsif row(new.id,new.seller_id,new.status) is distinct from row(old.id,old.seller_id,old.status) then
   if not public.comu_c1_is_admin() then raise exception 'COMU_ADMIN_REQUIRED'; end if;
   if new.id<>old.id or new.seller_id<>old.seller_id then raise exception 'COMU_APPROVAL_IDENTITY_IMMUTABLE'; end if;
   if new.status in ('ACTIVE','PUBLISHED') and new.status<>old.status and
     (not (public.comu_seller_activation_check_v1(new.seller_id)->>'ok')::boolean or not exists(
       select 1 from public.comu_sellers where id=new.seller_id and status='ACTIVE' and verification_status='VERIFIED'))
   then raise exception 'COMU_ACTIVATION_NOT_ELIGIBLE'; end if;
 end if;
 return new;
end; $$;
create trigger comu_c1_storefront_guard before insert or update on public.comu_storefronts
 for each row execute function public.comu_c1_protect_storefront();

-- Direct authenticated SQL cannot decide applications or create ownership.
revoke insert,update,delete on public.comu_sellers,public.comu_seller_memberships from authenticated,anon;
revoke update,delete on public.comu_seller_applications from authenticated,anon;
drop policy comu_application_admin on public.comu_seller_applications;
drop policy comu_application_insert on public.comu_seller_applications;
create policy comu_application_insert on public.comu_seller_applications for insert to authenticated
 with check(user_id=auth.uid() and status='PENDING' and reviewed_by is null and reviewed_at is null
 and decision is null and review_note is null and brand_id is null and seller_id is null);
-- Column grants preserve operational edits, never identity or commercial status.
revoke insert,update,delete on public.comu_storefronts from authenticated,anon;
grant update(name,slug,headline,description,logo_url,cover_url,theme_config,updated_at)
 on public.comu_storefronts to authenticated;
drop policy comu_storefronts_member_write on public.comu_storefronts;
create policy comu_storefronts_member_update on public.comu_storefronts for update to authenticated
 using(public.comu_c1_is_admin() or exists(select 1 from public.comu_seller_memberships m
   where m.seller_id=comu_storefronts.seller_id and m.user_id=auth.uid() and m.active and m.role in ('OWNER','ADMIN')))
 with check(public.comu_c1_is_admin() or exists(select 1 from public.comu_seller_memberships m
   where m.seller_id=comu_storefronts.seller_id and m.user_id=auth.uid() and m.active and m.role in ('OWNER','ADMIN')));

create function public.comu_review_seller_application_v1(p_application_id uuid,p_decision text,p_note text default null,p_brand_id uuid default null)
 returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.comu_seller_applications%rowtype; b public.brands%rowtype; s public.comu_sellers%rowtype;
 actor uuid:=auth.uid(); email_value text; identifier uuid;
begin
 if not public.comu_c1_is_admin() then raise exception 'COMU_ADMIN_REQUIRED'; end if;
 if p_decision is null or p_decision not in ('APPROVED','REJECTED') or length(coalesce(p_note,''))>2000
   or (p_decision='REJECTED' and btrim(coalesce(p_note,''))='') then raise exception 'COMU_DECISION_INVALID'; end if;
 select * into a from public.comu_seller_applications where id=p_application_id for update;
 if a.id is null then raise exception 'COMU_APPLICATION_NOT_FOUND'; end if;
 if a.user_id=actor then raise exception 'COMU_SELF_APPROVAL_DENIED'; end if;
 if a.status in ('APPROVED','REJECTED') then
   if a.decision is distinct from p_decision or (p_brand_id is not null and a.brand_id is distinct from p_brand_id)
     then raise exception 'COMU_DECISION_CONFLICT'; end if;
   return to_jsonb(a);
 end if;
 if p_decision='REJECTED' then
   update public.comu_seller_applications set status='REJECTED',decision=p_decision,reviewed_by=actor,
     reviewed_at=now(),review_note=btrim(p_note),updated_at=now() where id=a.id returning * into a;
   return to_jsonb(a);
 end if;
 -- Serialize all approvals for an identity. Never modify existing account roles/status.
 select email into email_value from auth.users where id=a.user_id for update;
 if email_value is null then raise exception 'COMU_APPLICANT_NOT_FOUND'; end if;
 insert into public.user_profiles(user_id,email,role,status) values(a.user_id,email_value,'client','active')
   on conflict(user_id) do nothing;
 if not exists(select 1 from public.user_profiles where user_id=a.user_id and status='active')
   then raise exception 'COMU_ACCOUNT_INACTIVE'; end if;
 if p_brand_id is not null then
   select * into b from public.brands where id=p_brand_id and status='active' for update;
   if b.id is null or not exists(select 1 from public.user_brand_access where user_id=a.user_id
     and brand_slug=b.slug and status='active' and access_role='owner')
   then raise exception 'COMU_BRAND_ACCESS_DENIED'; end if;
 else
   identifier:=gen_random_uuid();
   insert into public.brands(id,slug,name,created_by) values(identifier,'comu-'||replace(identifier::text,'-',''),a.business_name,actor)
     returning * into b;
 end if;
 select * into s from public.comu_sellers where brand_id=b.id::text for update;
 if found then
   if not exists(select 1 from public.comu_seller_memberships where seller_id=s.id and user_id=a.user_id and role='OWNER' and active)
     then raise exception 'COMU_BRAND_ACCESS_DENIED'; end if;
   -- Legacy seller state/permissions remain untouched; the real decision links to it.
 else
   insert into public.comu_sellers(brand_id,brand_slug,public_name,slug,city,status,verification_status,verified_at,approval_origin,approval_application_id)
     values(b.id::text,b.slug,a.business_name,b.slug,a.city,'PREPARING','VERIFIED',now(),'C1',a.id) returning * into s;
   insert into public.comu_storefronts(seller_id,name,slug,status) values(s.id,a.business_name,b.slug,'PREPARING');
   insert into public.comu_seller_memberships(seller_id,user_id,role,active) values(s.id,a.user_id,'OWNER',true);
 end if;
 update public.comu_seller_applications set status='APPROVED',decision=p_decision,reviewed_by=actor,
   reviewed_at=now(),review_note=nullif(btrim(p_note),''),brand_id=b.id,seller_id=s.id,updated_at=now()
   where id=a.id returning * into a;
 return to_jsonb(a);
end; $$;
revoke all on function public.comu_review_seller_application_v1(uuid,text,text,uuid) from public,anon,service_role;
grant execute on function public.comu_review_seller_application_v1(uuid,text,text,uuid) to authenticated;

create function public.comu_admin_seller_state_v1(p_seller_id uuid,p_action text) returns jsonb
 language plpgsql security definer set search_path=public as $$
declare s public.comu_sellers%rowtype; eligibility jsonb; target text;
begin
 if not public.comu_c1_is_admin() then raise exception 'COMU_ADMIN_REQUIRED'; end if;
 select * into s from public.comu_sellers where id=p_seller_id for update;
 if s.id is null then raise exception 'COMU_SELLER_NOT_FOUND'; end if;
 if exists(select 1 from public.comu_seller_memberships where seller_id=s.id and user_id=auth.uid() and active)
 then raise exception 'COMU_SELF_APPROVAL_DENIED'; end if;
 if p_action='activate' then
   eligibility:=public.comu_seller_activation_check_v1(s.id);
   if not (eligibility->>'ok')::boolean then return eligibility; end if;
   update public.comu_sellers set status='ACTIVE',activated_at=coalesce(activated_at,now()),updated_at=now() where id=s.id returning * into s;
   update public.comu_storefronts set status='ACTIVE',updated_at=now() where seller_id=s.id;
 else
   target:=case p_action when 'pause' then 'PAUSED' when 'suspend' then 'SUSPENDED' when 'close' then 'CLOSED' end;
   if target is null then raise exception 'COMU_SELLER_ACTION_INVALID'; end if;
   update public.comu_sellers set status=target,updated_at=now() where id=s.id returning * into s;
 end if;
 return jsonb_build_object('ok',true,'seller',to_jsonb(s));
end; $$;
revoke all on function public.comu_admin_seller_state_v1(uuid,text) from public,anon,service_role;
grant execute on function public.comu_admin_seller_state_v1(uuid,text) to authenticated;
revoke all on function public.comu_c1_protect_seller(),public.comu_c1_protect_storefront() from public;

-- A member must not attach another seller's storefront/product/variant by direct SQL.
create function public.comu_c1_catalog_identity() returns trigger
 language plpgsql security definer set search_path=public as $$
begin
 if TG_TABLE_NAME='comu_product_listings' then
   if TG_OP='UPDATE' and row(new.id,new.seller_id,new.storefront_id,new.product_id)
     is distinct from row(old.id,old.seller_id,old.storefront_id,old.product_id)
   then raise exception 'COMU_PRODUCT_BRAND_MISMATCH'; end if;
   if not exists(select 1 from public.comu_sellers s join public.comu_storefronts sf on sf.seller_id=s.id
     join public.pos_products p on p.brand_id=s.brand_id and p.brand_slug=s.brand_slug
     where s.id=new.seller_id and sf.id=new.storefront_id and p.id=new.product_id)
   then raise exception 'COMU_PRODUCT_BRAND_MISMATCH'; end if;
 else
   if TG_OP='UPDATE' and row(new.id,new.listing_id,new.variant_id) is distinct from row(old.id,old.listing_id,old.variant_id)
   then raise exception 'COMU_PRODUCT_BRAND_MISMATCH'; end if;
   if not exists(select 1 from public.comu_product_listings l join public.comu_sellers s on s.id=l.seller_id
     join public.pos_product_variants v on v.product_id=l.product_id and v.brand_slug=s.brand_slug
     where l.id=new.listing_id and v.id=new.variant_id)
   then raise exception 'COMU_PRODUCT_BRAND_MISMATCH'; end if;
 end if;
 return new;
end; $$;
revoke all on function public.comu_c1_catalog_identity() from public;
create trigger comu_c1_listing_identity before insert or update on public.comu_product_listings
 for each row execute function public.comu_c1_catalog_identity();
create trigger comu_c1_variant_identity before insert or update on public.comu_variant_listings
 for each row execute function public.comu_c1_catalog_identity();
commit;
