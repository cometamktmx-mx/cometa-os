begin;
-- Product UUID -> replacement per-piece discount. The business threshold and
-- grouping still apply; omitted products keep the existing business rule.
alter table public.pos_retail_rules add column product_discounts jsonb not null default '{}'::jsonb
 check (jsonb_typeof(product_discounts)='object' and not jsonb_path_exists(product_discounts,'$.* ? (@.type() != "number" || @ < 0 || @ >= 1000000)'));

do $migration$ declare body text; anchor text; replacement text; begin
 body:=pg_get_functiondef('public.pos_retail_quote_v1(text,uuid,jsonb)'::regprocedure);
 anchor:='greatest(v.price-rules.per_piece_discount,0)';
 if (length(body)-length(replace(body,anchor,'')))/length(anchor)<>1 then raise exception 'PRODUCT_DISCOUNT_QUOTE_ANCHOR_MISSING';end if;
 body:=replace(body,anchor,'greatest(v.price-coalesce((rules.product_discounts->>v.product_id::text)::numeric,rules.per_piece_discount),0)');
 execute body;

 -- Reuse existing SETTINGS authorization and serialize on the same rules row
 -- locked by sales/order writes. No new public execute privileges or RLS changes.
 body:=pg_get_functiondef('public.pos_retail_rules_save_v1(text,uuid,jsonb)'::regprocedure);
 anchor:='if p_body->>''action''=''price'' then';
 if strpos(body,anchor)=0 then raise exception 'PRODUCT_DISCOUNT_SAVE_ANCHOR_MISSING';end if;
 replacement:=$code$if p_body->>'action'='product-discount' then
  product:=(p_body->>'product_id')::uuid;
  if product is null or not exists(select 1 from pos_products where id=product and brand_slug=p_brand and active) then raise exception 'POS_PRODUCT_UNAVAILABLE';end if;
  if p_body->'discount'='null'::jsonb then
   update pos_retail_rules set product_discounts=product_discounts-product::text,updated_at=clock_timestamp(),updated_by=p_actor where brand_slug=p_brand returning * into r;
  else
   if jsonb_typeof(p_body->'discount') is distinct from 'number' then raise exception 'POS_PRICE_INVALID';end if;
   amount:=(p_body->>'discount')::numeric;
   if amount is null or amount<0 or amount>=1000000 or amount<>round(amount,2) then raise exception 'POS_PRICE_INVALID';end if;
   update pos_retail_rules set product_discounts=jsonb_set(product_discounts,array[product::text],to_jsonb(amount)),updated_at=clock_timestamp(),updated_by=p_actor where brand_slug=p_brand returning * into r;
  end if;
 elsif p_body->>'action'='price' then$code$;
 body:=replace(body,anchor,replacement);execute body;

 -- A newly computed quote may be displayed automatically, but accepting a
 -- different stored agreement must be explicit and match the server quote.
 body:=pg_get_functiondef('public.pos_retail_order_action_v1(text,uuid,uuid,uuid,text,uuid,jsonb)'::regprocedure);
 anchor:='q:=pos_retail_order_quote_v1(p_brand,location,p_body->''items'',case when o.state=''active'' then o.open_box else rules.open_box end);';
 if strpos(body,anchor)=0 then raise exception 'PRODUCT_DISCOUNT_ORDER_SAVE_ANCHOR_MISSING';end if;
 body:=replace(body,anchor,anchor||$code$
  if o.id is not null and q is distinct from o.quote and p_body->'confirmed_quote' is distinct from q then
   return jsonb_build_object('prices_changed',true,'quote',q,'id',o.id);
  end if;$code$);
 anchor:='if p_body->''expected_quote'' is null or q<>p_body->''expected_quote'' then';
 if strpos(body,anchor)=0 then raise exception 'PRODUCT_DISCOUNT_ORDER_PAYMENT_ANCHOR_MISSING';end if;
 body:=replace(body,anchor,'if (q is distinct from o.quote and p_body->''confirmed_quote'' is distinct from q) or p_body->''expected_quote'' is null or q<>p_body->''expected_quote'' then');
 execute body;
end $migration$;

-- Explicitly authorized catalog identity, never a fuzzy name match. No updates
-- to prices, saved quotes, policy snapshots, sales, payments or inventory.
do $seed$ begin
 if exists(select 1 from public.brands where slug='magenta-fitwear') then
  perform public.pos_require_retail_profile_v1('magenta-fitwear');
  if not exists(select 1 from public.pos_products where brand_slug='magenta-fitwear' and id='4d1afc58-fd94-447c-8619-352969374124' and name='Banditas' and active)
   or not exists(select 1 from public.pos_product_variants where brand_slug='magenta-fitwear' and product_id='4d1afc58-fd94-447c-8619-352969374124' and active)
   or exists(select 1 from public.pos_product_variants where brand_slug='magenta-fitwear' and product_id='4d1afc58-fd94-447c-8619-352969374124' and active and (price<>15 or unit_code<>'piece')) then raise exception 'BANDITAS_CATALOG_CONFIRMATION_CHANGED';end if;
  if not exists(select 1 from public.pos_retail_rules where brand_slug='magenta-fitwear' and wholesale_enabled and pricing_mode='per_piece_discount' and per_piece_discount=10 and minimum_pieces=50 and grouping='product' and combine_variants) then raise exception 'BANDITAS_BUSINESS_RULE_CHANGED';end if;
  update public.pos_retail_rules set product_discounts=jsonb_build_object('4d1afc58-fd94-447c-8619-352969374124',5) where brand_slug='magenta-fitwear';
 end if;
end $seed$;
commit;
