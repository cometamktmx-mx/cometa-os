BEGIN;

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
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_product public.pos_products%ROWTYPE;
  v_variant jsonb;
  v_variant_id uuid;
  v_default_variant_id uuid;
  v_name text;
  v_sku text;
  v_barcode text;
  v_active boolean;
  v_created_variant_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NULLIF(trim(p_brand_slug), '') IS NULL THEN
    RAISE EXCEPTION 'La marca es obligatoria.';
  END IF;

  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'El producto es obligatorio.';
  END IF;

  IF NULLIF(trim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'El nombre del producto es obligatorio.';
  END IF;

  IF p_inventory_mode NOT IN ('direct', 'none') THEN
    RAISE EXCEPTION 'El modo de inventario no es válido.';
  END IF;

  IF p_tax_rate IS NULL OR p_tax_rate < 0 OR p_tax_rate > 100 THEN
    RAISE EXCEPTION 'La tasa de impuesto no es válida.';
  END IF;

  IF jsonb_typeof(p_variants) <> 'array'
     OR jsonb_array_length(p_variants) = 0 THEN
    RAISE EXCEPTION 'El producto debe contener al menos una variante.';
  END IF;

  SELECT *
  INTO v_product
  FROM public.pos_products
  WHERE id = p_product_id
    AND brand_id = p_brand_id
    AND brand_slug = p_brand_slug
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El producto no existe o pertenece a otra marca.';
  END IF;

  IF p_category_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.pos_categories
       WHERE id = p_category_id
         AND brand_slug = p_brand_slug
     ) THEN
    RAISE EXCEPTION 'La categoría no existe o pertenece a otra marca.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_variants) item
    WHERE NULLIF(item ->> 'id', '') IS NOT NULL
      AND (item ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION 'El identificador de una variante no es válido.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_variants) item
    WHERE NULLIF(item ->> 'id', '') IS NOT NULL
    GROUP BY item ->> 'id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'El payload contiene variantes duplicadas.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_variants) item
    LEFT JOIN public.pos_product_variants variant
      ON variant.id = (item ->> 'id')::uuid
     AND variant.product_id = p_product_id
     AND variant.brand_id = p_brand_id
     AND variant.brand_slug = p_brand_slug
    WHERE NULLIF(item ->> 'id', '') IS NOT NULL
      AND variant.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Una variante no existe o pertenece a otro producto o marca.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_variants) item
    WHERE COALESCE((item ->> 'active')::boolean, true) = true
  ) THEN
    RAISE EXCEPTION 'El producto debe conservar al menos una variante activa.';
  END IF;

  UPDATE public.pos_products
  SET
    category_id = p_category_id,
    name = trim(p_name),
    description = p_description,
    product_type = p_product_type,
    inventory_mode = p_inventory_mode,
    track_inventory = p_inventory_mode = 'direct',
    default_unit_code = p_default_unit_code,
    has_variants = p_has_variants,
    sellable = p_sellable,
    purchasable = p_purchasable,
    tax_rate = p_tax_rate,
    image_url = p_image_url,
    configuration = COALESCE(p_configuration, '{}'::jsonb),
    updated_at = now()
  WHERE id = p_product_id
    AND brand_id = p_brand_id
    AND brand_slug = p_brand_slug;

  -- Compatibilidad: una variante existente omitida se retira, nunca se borra.
  UPDATE public.pos_product_variants existing
  SET
    active = false,
    is_default = false,
    updated_at = now()
  WHERE existing.product_id = p_product_id
    AND existing.brand_id = p_brand_id
    AND existing.brand_slug = p_brand_slug
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_variants) item
      WHERE NULLIF(item ->> 'id', '') IS NOT NULL
        AND (item ->> 'id')::uuid = existing.id
    );

  FOR v_variant IN
    SELECT value
    FROM jsonb_array_elements(p_variants)
  LOOP
    v_variant_id := NULLIF(v_variant ->> 'id', '')::uuid;
    v_name := NULLIF(trim(v_variant ->> 'name'), '');
    v_sku := NULLIF(trim(v_variant ->> 'sku'), '');
    v_barcode := NULLIF(trim(v_variant ->> 'barcode'), '');
    v_active := COALESCE((v_variant ->> 'active')::boolean, true);

    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Cada variante necesita un nombre.';
    END IF;

    IF COALESCE((v_variant ->> 'price')::numeric, 0) < 0 THEN
      RAISE EXCEPTION 'El precio de una variante no puede ser negativo.';
    END IF;

    IF COALESCE((v_variant ->> 'cost')::numeric, 0) < 0 THEN
      RAISE EXCEPTION 'El costo de una variante no puede ser negativo.';
    END IF;

    IF v_sku IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM public.pos_product_variants existing
         WHERE existing.brand_slug = p_brand_slug
           AND lower(existing.sku) = lower(v_sku)
           AND existing.id <> COALESCE(v_variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
       ) THEN
      RAISE EXCEPTION 'Ya existe una variante con ese SKU.';
    END IF;

    IF v_barcode IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM public.pos_product_variants existing
         WHERE existing.brand_slug = p_brand_slug
           AND existing.barcode = v_barcode
           AND existing.id <> COALESCE(v_variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
       ) THEN
      RAISE EXCEPTION 'Ya existe una variante con ese código de barras.';
    END IF;

    IF v_variant_id IS NOT NULL THEN
      UPDATE public.pos_product_variants
      SET
        name = v_name,
        sku = v_sku,
        barcode = v_barcode,
        price = COALESCE((v_variant ->> 'price')::numeric, 0),
        cost = COALESCE((v_variant ->> 'cost')::numeric, 0),
        attributes = COALESCE(v_variant -> 'attributes', '{}'::jsonb),
        unit_code = COALESCE(NULLIF(v_variant ->> 'unit_code', ''), p_default_unit_code),
        image_url = NULLIF(trim(v_variant ->> 'image_url'), ''),
        active = v_active,
        sort_order = COALESCE((v_variant ->> 'sort_order')::integer, 0),
        configuration = COALESCE(v_variant -> 'configuration', '{}'::jsonb),
        updated_at = now()
      WHERE id = v_variant_id
        AND product_id = p_product_id
        AND brand_id = p_brand_id
        AND brand_slug = p_brand_slug;
    ELSE
      INSERT INTO public.pos_product_variants (
        brand_id,
        brand_slug,
        product_id,
        name,
        sku,
        barcode,
        price,
        cost,
        attributes,
        active,
        created_by,
        unit_code,
        is_default,
        sort_order,
        image_url,
        configuration
      )
      VALUES (
        p_brand_id,
        p_brand_slug,
        p_product_id,
        v_name,
        v_sku,
        v_barcode,
        COALESCE((v_variant ->> 'price')::numeric, 0),
        COALESCE((v_variant ->> 'cost')::numeric, 0),
        COALESCE(v_variant -> 'attributes', '{}'::jsonb),
        v_active,
        p_user_id,
        COALESCE(NULLIF(v_variant ->> 'unit_code', ''), p_default_unit_code),
        false,
        COALESCE((v_variant ->> 'sort_order')::integer, 0),
        NULLIF(trim(v_variant ->> 'image_url'), ''),
        COALESCE(v_variant -> 'configuration', '{}'::jsonb)
      )
      RETURNING id INTO v_variant_id;

      v_created_variant_ids := array_append(v_created_variant_ids, v_variant_id);
    END IF;
  END LOOP;

  -- En modo directo toda variante, nueva o preexistente, debe tener inventario cero
  -- en cada sucursal activa. No se genera movimiento porque no hubo recepción.
  IF p_inventory_mode = 'direct' THEN
    INSERT INTO public.pos_inventory (
      brand_id,
      brand_slug,
      location_id,
      variant_id,
      quantity,
      reserved_quantity,
      minimum_quantity
    )
    SELECT
      p_brand_id,
      p_brand_slug,
      location.id,
      variant.id,
      0,
      0,
      0
    FROM public.pos_locations location
    CROSS JOIN public.pos_product_variants variant
    WHERE location.brand_id = p_brand_id
      AND location.brand_slug = p_brand_slug
      AND location.active = true
      AND variant.product_id = p_product_id
      AND variant.brand_id = p_brand_id
      AND variant.brand_slug = p_brand_slug
    ON CONFLICT (location_id, variant_id) DO NOTHING;
  END IF;

  UPDATE public.pos_product_variants
  SET is_default = false
  WHERE product_id = p_product_id
    AND brand_id = p_brand_id
    AND brand_slug = p_brand_slug;

  SELECT id
  INTO v_default_variant_id
  FROM public.pos_product_variants
  WHERE product_id = p_product_id
    AND brand_id = p_brand_id
    AND brand_slug = p_brand_slug
    AND active = true
  ORDER BY sort_order, created_at, id
  LIMIT 1;

  IF v_default_variant_id IS NULL THEN
    RAISE EXCEPTION 'El producto debe conservar al menos una variante activa.';
  END IF;

  UPDATE public.pos_product_variants
  SET is_default = true
  WHERE id = v_default_variant_id;

  RETURN jsonb_build_object(
    'id', p_product_id,
    'updated', true,
    'createdVariantIds', to_jsonb(v_created_variant_ids),
    'inventoryMode', p_inventory_mode
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.pos_update_product_v2(
  text, text, uuid, uuid, text, text, text, text, text,
  boolean, boolean, boolean, numeric, text, jsonb, jsonb, uuid
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.pos_update_product_v2(
  text, text, uuid, uuid, text, text, text, text, text,
  boolean, boolean, boolean, numeric, text, jsonb, jsonb, uuid
) FROM anon;

REVOKE ALL ON FUNCTION public.pos_update_product_v2(
  text, text, uuid, uuid, text, text, text, text, text,
  boolean, boolean, boolean, numeric, text, jsonb, jsonb, uuid
) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.pos_update_product_v2(
  text, text, uuid, uuid, text, text, text, text, text,
  boolean, boolean, boolean, numeric, text, jsonb, jsonb, uuid
) TO service_role;

COMMIT;
