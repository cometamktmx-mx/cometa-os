BEGIN;

ALTER TABLE public.pos_products
  ADD COLUMN IF NOT EXISTS product_code text NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.pos_products
    WHERE NULLIF(btrim(product_code), '') IS NOT NULL
    GROUP BY brand_slug, lower(btrim(product_code))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'POS_PRODUCT_CODE_DUPLICATES_EXIST';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS pos_products_brand_product_code_uidx
  ON public.pos_products (brand_slug, lower(btrim(product_code)))
  WHERE product_code IS NOT NULL
    AND btrim(product_code) <> '';

CREATE OR REPLACE FUNCTION public.pos_create_product_v2(
  p_brand_id text,
  p_brand_slug text,
  p_location_id uuid,
  p_category_id uuid,
  p_name text,
  p_description text,
  p_product_type text,
  p_inventory_mode text,
  p_default_unit_code text,
  p_has_variants boolean,
  p_sellable boolean,
  p_purchasable boolean,
  p_tax_rate numeric,
  p_image_url text,
  p_configuration jsonb,
  p_variants jsonb,
  p_user_id uuid,
  p_product_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_result jsonb;
  v_product_id uuid;
  v_code text := NULLIF(btrim(p_product_code), '');
BEGIN
  IF v_code IS NOT NULL AND v_code !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' THEN
    RAISE EXCEPTION 'POS_PRODUCT_CODE_INVALID';
  END IF;

  v_result := public.pos_create_product_v2(
    p_brand_id, p_brand_slug, p_location_id, p_category_id, p_name,
    p_description, p_product_type, p_inventory_mode, p_default_unit_code,
    p_has_variants, p_sellable, p_purchasable, p_tax_rate, p_image_url,
    p_configuration, p_variants, p_user_id
  );

  v_product_id := NULLIF(v_result ->> 'id', '')::uuid;
  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'POS_PRODUCT_CREATE_RESULT_INVALID';
  END IF;

  UPDATE public.pos_products
  SET product_code = v_code,
      updated_at = now()
  WHERE id = v_product_id
    AND brand_id = p_brand_id
    AND brand_slug = p_brand_slug;

  RETURN v_result || jsonb_build_object('product_code', v_code);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pos_update_product_v2(
  p_brand_id text,
  p_brand_slug text,
  p_product_id uuid,
  p_category_id uuid,
  p_name text,
  p_description text,
  p_product_type text,
  p_inventory_mode text,
  p_default_unit_code text,
  p_has_variants boolean,
  p_sellable boolean,
  p_purchasable boolean,
  p_tax_rate numeric,
  p_image_url text,
  p_configuration jsonb,
  p_variants jsonb,
  p_user_id uuid,
  p_product_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_result jsonb;
  v_code text := NULLIF(btrim(p_product_code), '');
BEGIN
  IF v_code IS NOT NULL AND v_code !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' THEN
    RAISE EXCEPTION 'POS_PRODUCT_CODE_INVALID';
  END IF;

  v_result := public.pos_update_product_v2(
    p_brand_id, p_brand_slug, p_product_id, p_category_id, p_name,
    p_description, p_product_type, p_inventory_mode, p_default_unit_code,
    p_has_variants, p_sellable, p_purchasable, p_tax_rate, p_image_url,
    p_configuration, p_variants, p_user_id
  );

  UPDATE public.pos_products
  SET product_code = v_code,
      updated_at = now()
  WHERE id = p_product_id
    AND brand_id = p_brand_id
    AND brand_slug = p_brand_slug;

  RETURN v_result || jsonb_build_object('product_code', v_code);
END;
$function$;

REVOKE ALL ON FUNCTION public.pos_create_product_v2(
  text,text,uuid,uuid,text,text,text,text,text,boolean,boolean,boolean,numeric,text,jsonb,jsonb,uuid,text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_create_product_v2(
  text,text,uuid,uuid,text,text,text,text,text,boolean,boolean,boolean,numeric,text,jsonb,jsonb,uuid,text
) TO service_role;

REVOKE ALL ON FUNCTION public.pos_update_product_v2(
  text,text,uuid,uuid,text,text,text,text,text,boolean,boolean,boolean,numeric,text,jsonb,jsonb,uuid,text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_update_product_v2(
  text,text,uuid,uuid,text,text,text,text,text,boolean,boolean,boolean,numeric,text,jsonb,jsonb,uuid,text
) TO service_role;

COMMIT;
