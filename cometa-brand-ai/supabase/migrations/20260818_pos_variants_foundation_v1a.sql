BEGIN;

ALTER TABLE public.pos_product_variants
  ADD COLUMN IF NOT EXISTS variant_signature text;

CREATE OR REPLACE FUNCTION public.pos_normalize_variant_attributes_v1(
  p_attributes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path TO public
AS $function$
DECLARE
  item record;
  normalized jsonb := '{}'::jsonb;
  normalized_key text;
  normalized_value text;
BEGIN
  IF jsonb_typeof(p_attributes) <> 'object' THEN
    RAISE EXCEPTION 'POS_VARIANT_ATTRIBUTES_OBJECT_REQUIRED';
  END IF;

  FOR item IN
    SELECT key, value
    FROM jsonb_each(p_attributes)
  LOOP
    normalized_key := lower(btrim(item.key));

    IF normalized_key = '' THEN
      RAISE EXCEPTION 'POS_VARIANT_ATTRIBUTE_KEY_REQUIRED';
    END IF;

    IF normalized ? normalized_key THEN
      RAISE EXCEPTION 'POS_VARIANT_ATTRIBUTE_KEY_COLLISION';
    END IF;

    IF jsonb_typeof(item.value) = 'string' THEN
      normalized_value := lower(btrim(item.value #>> '{}'));
      normalized := normalized || jsonb_build_object(normalized_key, normalized_value);
    ELSE
      normalized := normalized || jsonb_build_object(normalized_key, item.value);
    END IF;
  END LOOP;

  RETURN normalized;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pos_variant_signature_v1(
  p_attributes jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path TO public
AS $function$
  SELECT public.pos_normalize_variant_attributes_v1(COALESCE(p_attributes, '{}'::jsonb))::text;
$function$;

CREATE OR REPLACE FUNCTION public.pos_product_variants_set_signature_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
  NEW.variant_signature := public.pos_variant_signature_v1(COALESCE(NEW.attributes, '{}'::jsonb));
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS pos_product_variants_signature_v1
  ON public.pos_product_variants;

CREATE TRIGGER pos_product_variants_signature_v1
BEFORE INSERT OR UPDATE
ON public.pos_product_variants
FOR EACH ROW
EXECUTE FUNCTION public.pos_product_variants_set_signature_v1();

UPDATE public.pos_product_variants
SET variant_signature = public.pos_variant_signature_v1(COALESCE(attributes, '{}'::jsonb))
WHERE variant_signature IS DISTINCT FROM public.pos_variant_signature_v1(COALESCE(attributes, '{}'::jsonb));

DO $duplicates$
DECLARE
  duplicate_rows jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'product_id', product_id,
      'variant_signature', variant_signature,
      'variant_ids', variant_ids,
      'count', duplicate_count
    )
    ORDER BY product_id, variant_signature
  )
  INTO duplicate_rows
  FROM (
    SELECT
      product_id,
      variant_signature,
      jsonb_agg(id ORDER BY id) AS variant_ids,
      count(*) AS duplicate_count
    FROM public.pos_product_variants
    GROUP BY product_id, variant_signature
    HAVING count(*) > 1
  ) duplicates;

  IF duplicate_rows IS NOT NULL THEN
    RAISE EXCEPTION 'POS_VARIANT_SIGNATURE_DUPLICATES'
      USING DETAIL = duplicate_rows::text;
  END IF;
END
$duplicates$;

CREATE UNIQUE INDEX IF NOT EXISTS pos_product_variants_product_signature_uidx
  ON public.pos_product_variants (product_id, variant_signature);

CREATE UNIQUE INDEX IF NOT EXISTS pos_product_variants_brand_sku_uidx
  ON public.pos_product_variants (brand_slug, lower(btrim(sku)))
  WHERE sku IS NOT NULL AND btrim(sku) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS pos_product_variants_brand_barcode_uidx
  ON public.pos_product_variants (brand_slug, lower(btrim(barcode)))
  WHERE barcode IS NOT NULL AND btrim(barcode) <> '';

ALTER TABLE public.pos_product_variants
  ALTER COLUMN variant_signature SET NOT NULL;

REVOKE ALL ON FUNCTION public.pos_normalize_variant_attributes_v1(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pos_variant_signature_v1(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pos_product_variants_set_signature_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_product_variants_set_signature_v1() TO service_role;

COMMIT;
