begin;
-- Preserve existing businesses and historical snapshots. Configure discount mode explicitly.
alter table public.pos_retail_rules add column pricing_mode text not null default 'factory_price' check(pricing_mode in ('factory_price','per_piece_discount')), add column per_piece_discount numeric(14,2) not null default 0 check(per_piece_discount>=0 and per_piece_discount<1000000);
create or replace function public.pos_retail_quote_v1(p_brand text,p_location uuid,p_items jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare rules public.pos_retail_rules%rowtype; loc public.pos_locations%rowtype; i jsonb; v record;
 qty numeric; grouped numeric; unit_price numeric; factory numeric; discount numeric; subtotal numeric; tax numeric; amount numeric;
 lines jsonb:='[]'; total numeric:=0; sub numeric:=0; taxes numeric:=0; discounts numeric:=0;
begin
 select * into loc from pos_locations where id=p_location and brand_slug=p_brand and active;
 if not found then raise exception 'POS_LOCATION_INVALID'; end if;
 select * into rules from pos_retail_rules where brand_slug=p_brand;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 250 then raise exception 'POS_ITEMS_INVALID';end if;
 if (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct x->>'variant_id') from jsonb_array_elements(p_items) x) then raise exception 'POS_DUPLICATE_VARIANT';end if;
 for i in select value from jsonb_array_elements(p_items) loop
  qty:=(i->>'quantity')::numeric;discount:=coalesce((i->>'discount_amount')::numeric,0);
  if qty is null or qty<=0 or qty>100000 or qty<>round(qty,3) or discount<0 or discount<>round(discount,2) then raise exception 'POS_QUANTITY_OR_DISCOUNT_INVALID';end if;
  select pv.*,p.name product_name,p.tax_rate,p.track_inventory into v from pos_product_variants pv join pos_products p on p.id=pv.product_id and p.brand_slug=p_brand where pv.id=(i->>'variant_id')::uuid and pv.brand_slug=p_brand and pv.active and p.active and p.sellable;
  if not found then raise exception 'POS_PRODUCT_UNAVAILABLE';end if;
  if rules.wholesale_enabled and v.unit_code='piece' and qty<>trunc(qty) then raise exception 'POS_WHOLE_PIECES_REQUIRED';end if;
  select sum((x->>'quantity')::numeric) into grouped from jsonb_array_elements(p_items) x join pos_product_variants pv on pv.id=(x->>'variant_id')::uuid and pv.brand_slug=p_brand
   where case when rules.grouping='product' and rules.combine_variants then pv.product_id=v.product_id else pv.id=v.id end and pv.unit_code='piece';
  factory:=null;
  if rules.wholesale_enabled and rules.pricing_mode='factory_price' and v.unit_code='piece' and qty=trunc(qty) then
   select fp.price into factory from pos_factory_prices fp where fp.brand_slug=p_brand and fp.product_id=v.product_id and (fp.variant_id=v.id or fp.variant_id is null) order by (fp.variant_id is not null) desc limit 1;
  end if;
  unit_price:=case when rules.wholesale_enabled and rules.pricing_mode='per_piece_discount' and v.unit_code='piece' and coalesce(grouped,0)>=rules.minimum_pieces then greatest(v.price-rules.per_piece_discount,0) when rules.wholesale_enabled and coalesce(grouped,0)>=rules.minimum_pieces and factory is not null then least(factory,v.price) else v.price end;
  subtotal:=round(unit_price*qty,2);
  if discount>subtotal then raise exception 'POS_DISCOUNT_EXCEEDS_SUBTOTAL';end if;
  tax:=case when loc.prices_include_tax then round((subtotal-discount)-(subtotal-discount)/(1+v.tax_rate/100),2) else round((subtotal-discount)*v.tax_rate/100,2) end;
  amount:=subtotal-discount+case when loc.prices_include_tax then 0 else tax end;
  lines:=lines||jsonb_build_array(jsonb_build_object('variant_id',v.id,'product_id',v.product_id,'product_name',v.product_name,'variant_name',v.name,'sku',v.sku,'quantity',qty,'unit_price',unit_price,'regular_price',v.price,'discount_amount',discount,'tax_amount',tax,'line_total',amount,'track_inventory',v.track_inventory,'model_quantity',coalesce(grouped,0),'remaining',greatest(coalesce(rules.minimum_pieces,50)-coalesce(grouped,0),0),'bulk_discount_amount',round((v.price-unit_price)*qty,2),'pricing_mode',rules.pricing_mode,'factory_applied',unit_price<v.price,'factory_missing',coalesce(rules.wholesale_enabled,false) and v.unit_code='piece' and rules.pricing_mode='factory_price' and factory is null));
  total:=total+amount;sub:=sub+subtotal+case when rules.pricing_mode='per_piece_discount' then round((v.price-unit_price)*qty,2) else 0 end;taxes:=taxes+tax;discounts:=discounts+discount+case when rules.pricing_mode='per_piece_discount' then round((v.price-unit_price)*qty,2) else 0 end;
 end loop;
 return jsonb_build_object('items',lines,'total',total,'subtotal',sub,'tax_total',taxes,'discount_total',discounts,'currency',loc.currency,'pricing_mode',coalesce(rules.pricing_mode,'factory_price'),'wholesale_enabled',coalesce(rules.wholesale_enabled,false));
end $$;

create or replace function public.pos_complete_retail_sale_v1(p_brand_slug text,p_location_id uuid,p_register_id uuid,p_cash_session_id uuid,p_customer_id uuid,p_items jsonb,p_payments jsonb,p_notes text,p_user_id uuid,p_reward_id uuid,p_idempotency_key uuid,p_reward_unlock_id uuid default null,p_served_by_staff_id uuid default null,p_cashier_staff_id uuid default null,p_expected_quote jsonb default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare q jsonb;r jsonb;normalized jsonb;payload jsonb;saved pos_retail_sale_requests%rowtype;saving numeric;
begin
 if p_idempotency_key is null then raise exception 'POS_IDEMPOTENCY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('retail-sale:'||p_brand_slug||p_idempotency_key,0));
 payload:=jsonb_build_object('location',p_location_id,'register',p_register_id,'session',p_cash_session_id,'customer',p_customer_id,'items',p_items,'payments',p_payments,'notes',p_notes,'reward',p_reward_id,'unlock',p_reward_unlock_id,'staff',p_cashier_staff_id);
 select * into saved from pos_retail_sale_requests where brand_slug=p_brand_slug and request_key=p_idempotency_key;
 if found then if saved.payload<>payload then raise exception 'POS_IDEMPOTENCY_CONFLICT';end if;return saved.result;end if;
 -- A retry of a sale finalized before this release must use its original
 -- fingerprint and snapshots, never today's factory rules.
 if exists(select 1 from pos_sales where brand_slug=p_brand_slug and idempotency_key=p_idempotency_key) then
  return pos_complete_sale_with_staff_v1(p_brand_slug,p_location_id,p_register_id,p_cash_session_id,p_customer_id,p_items,p_payments,p_notes,p_user_id,p_reward_id,p_idempotency_key,p_reward_unlock_id,p_served_by_staff_id,p_cashier_staff_id);
 end if;
 -- Consistent price/settings snapshot while completing the sale.
 perform 1 from pos_retail_rules where brand_slug=p_brand_slug for share;
 perform 1 from pos_product_variants where brand_slug=p_brand_slug and id in(select (x->>'variant_id')::uuid from jsonb_array_elements(p_items)x) order by id for share;
 perform 1 from pos_factory_prices where brand_slug=p_brand_slug order by id for share;
 q:=pos_retail_quote_v1(p_brand_slug,p_location_id,p_items);
 if p_expected_quote is not null and q<>p_expected_quote then raise exception 'POS_PRICES_CHANGED';end if;
 if (q->>'wholesale_enabled')::boolean and p_expected_quote is null then raise exception 'POS_QUOTE_REQUIRED';end if;
 select jsonb_agg(jsonb_build_object('variant_id',x->'variant_id','quantity',x->'quantity','discount_amount',(x->>'discount_amount')::numeric+round(((x->>'regular_price')::numeric-(x->>'unit_price')::numeric)*(x->>'quantity')::numeric,2)) order by x->>'variant_id'),sum(round(((x->>'regular_price')::numeric-(x->>'unit_price')::numeric)*(x->>'quantity')::numeric,2)) into normalized,saving from jsonb_array_elements(q->'items')x;
 r:=pos_complete_sale_with_staff_v1(p_brand_slug,p_location_id,p_register_id,p_cash_session_id,p_customer_id,normalized,p_payments,p_notes,p_user_id,p_reward_id,p_idempotency_key,p_reward_unlock_id,p_served_by_staff_id,p_cashier_staff_id);
 if saving>0 and q->>'pricing_mode'='factory_price' then
  update pos_sale_items si set unit_price=(x->>'unit_price')::numeric,discount_amount=si.discount_amount-round(((x->>'regular_price')::numeric-(x->>'unit_price')::numeric)*(x->>'quantity')::numeric,2) from jsonb_array_elements(q->'items')x where si.sale_id=(r->>'id')::uuid and si.brand_slug=p_brand_slug and si.variant_id=(x->>'variant_id')::uuid;
  update pos_sales set subtotal=subtotal-saving,discount_total=discount_total-saving where id=(r->>'id')::uuid and brand_slug=p_brand_slug;
  r:=r||(select jsonb_build_object('subtotal',subtotal,'discount_total',discount_total) from pos_sales where id=(r->>'id')::uuid and brand_slug=p_brand_slug);
  update pos_sale_loyalty_visit_snapshots set response_json=r where sale_id=(r->>'id')::uuid;
 end if;
 insert into pos_retail_sale_requests values(p_brand_slug,p_idempotency_key,payload,r);
 return r;
end $$;

create or replace function public.pos_retail_rules_save_v1(p_brand text,p_actor uuid,p_body jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r pos_retail_rules%rowtype;product uuid;variant uuid;amount numeric;
begin
 insert into pos_retail_rules(brand_slug) values(p_brand) on conflict do nothing;
 select * into r from pos_retail_rules where brand_slug=p_brand for update;
 if p_body->>'action'='price' then
  product:=(p_body->>'product_id')::uuid;variant:=nullif(p_body->>'variant_id','')::uuid;amount:=(p_body->>'price')::numeric;
  if not exists(select 1 from pos_products where id=product and brand_slug=p_brand) or (variant is not null and not exists(select 1 from pos_product_variants where id=variant and product_id=product and brand_slug=p_brand)) then raise exception 'POS_PRODUCT_UNAVAILABLE';end if;
  if amount is null or amount<=0 or amount<>round(amount,2) then raise exception 'POS_PRICE_INVALID';end if;
  update pos_factory_prices set price=amount,updated_at=now(),updated_by=p_actor where brand_slug=p_brand and product_id=product and variant_id is not distinct from variant;
  if not found then insert into pos_factory_prices(brand_slug,product_id,variant_id,price,updated_by) values(p_brand,product,variant,amount,p_actor);end if;
 else
  if length(coalesce(p_body->>'policy','')) not between 10 and 1500 then raise exception 'POS_POLICY_REQUIRED';end if;
  update pos_retail_rules set pricing_mode=coalesce(p_body->>'pricing_mode',r.pricing_mode),per_piece_discount=coalesce((p_body->>'per_piece_discount')::numeric,r.per_piece_discount),wholesale_enabled=(p_body->>'wholesale_enabled')::boolean,minimum_pieces=(p_body->>'minimum_pieces')::integer,grouping=p_body->>'grouping',combine_variants=(p_body->>'combine_variants')::boolean,orders_enabled=(p_body->>'orders_enabled')::boolean,minimum_deposit=(p_body->>'minimum_deposit')::numeric,validity_days=(p_body->>'validity_days')::integer,retained_deposit=(p_body->>'retained_deposit')::numeric,policy=p_body->>'policy',updated_at=now(),updated_by=p_actor where brand_slug=p_brand returning * into r;
 end if;
 return to_jsonb(r);
end $$;
commit;
