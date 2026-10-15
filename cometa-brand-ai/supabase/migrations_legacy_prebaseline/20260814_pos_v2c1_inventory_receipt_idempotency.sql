-- COMETA POS V2C.1: idempotencia transaccional de recepciones de inventario.
-- No modifica la RPC v1 ni hace backfill de recepciones históricas.

ALTER TABLE public.pos_inventory_receipts
  ADD COLUMN IF NOT EXISTS idempotency_key uuid NULL,
  ADD COLUMN IF NOT EXISTS payload_fingerprint text NULL;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pos_inventory_receipts'::regclass
      AND conname = 'pos_inventory_receipts_payload_fingerprint_format'
  ) THEN
    ALTER TABLE public.pos_inventory_receipts
      ADD CONSTRAINT pos_inventory_receipts_payload_fingerprint_format
      CHECK (
        payload_fingerprint IS NULL
        OR payload_fingerprint ~ '^[0-9a-f]{64}$'
      );
  END IF;
END;
$constraint$;

CREATE UNIQUE INDEX IF NOT EXISTS pos_inventory_receipts_brand_idempotency_uidx
  ON public.pos_inventory_receipts (brand_slug, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.pos_complete_inventory_receipt_v2(
  p_brand_id text,
  p_brand_slug text,
  p_location_id uuid,
  p_supplier_name text,
  p_supplier_reference text,
  p_notes text,
  p_items jsonb,
  p_user_id uuid,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_fingerprint text;
  v_pgcrypto_schema text;
  v_normalized_items jsonb;
  v_existing public.pos_inventory_receipts%ROWTYPE;
  v_result jsonb;
  v_receipt_id uuid;
  v_replay_items jsonb;
BEGIN
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'POS_INVENTORY_IDEMPOTENCY_KEY_REQUIRED'
      USING ERRCODE = '22023';
  END IF;

  -- jsonb normaliza el orden de keys. El jsonb_agg ordenado elimina el orden
  -- accidental de las líneas sin alterar el payload que recibe la RPC v1.
  SELECT COALESCE(
    jsonb_agg(normalized.item ORDER BY normalized.item::text),
    '[]'::jsonb
  )
  INTO v_normalized_items
  FROM (
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'variant_id', lower(NULLIF(btrim(item ->> 'variant_id'), '')),
      'purchase_presentation_id', lower(NULLIF(btrim(item ->> 'purchase_presentation_id'), '')),
      'quantity_mode', lower(NULLIF(btrim(item ->> 'quantity_mode'), '')),
      'input_quantity', NULLIF(btrim(item ->> 'input_quantity'), ''),
      'input_unit_code', lower(NULLIF(btrim(item ->> 'input_unit_code'), '')),
      'conversion_factor', NULLIF(btrim(item ->> 'conversion_factor'), ''),
      'total_cost', NULLIF(btrim(item ->> 'total_cost'), ''),
      'scanned_code', NULLIF(btrim(item ->> 'scanned_code'), '')
    )) AS item
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS source(item)
  ) AS normalized;

  SELECT namespace.nspname
  INTO v_pgcrypto_schema
  FROM pg_extension extension_row
  JOIN pg_namespace namespace ON namespace.oid = extension_row.extnamespace
  WHERE extension_row.extname = 'pgcrypto';

  IF NOT FOUND OR v_pgcrypto_schema IS NULL THEN
    RAISE EXCEPTION 'La extensión pgcrypto no está disponible.';
  END IF;

  EXECUTE format(
    'SELECT encode(%I.digest(convert_to($1, ''UTF8''), ''sha256''), ''hex'')',
    v_pgcrypto_schema
  )
  INTO v_fingerprint
  USING jsonb_build_object(
    'brand_id', p_brand_id,
    'brand_slug', lower(btrim(COALESCE(p_brand_slug, ''))),
    'location_id', p_location_id,
    'supplier_name', NULLIF(btrim(p_supplier_name), ''),
    'supplier_reference', NULLIF(btrim(p_supplier_reference), ''),
    'notes', NULLIF(btrim(p_notes), ''),
    'items', v_normalized_items
  )::text;

  -- Serializa únicamente la misma operación lógica. La restricción UNIQUE
  -- parcial continúa siendo la invariante final frente a carreras.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      lower(btrim(COALESCE(p_brand_slug, ''))) || ':' || p_idempotency_key::text,
      0
    )
  );

  SELECT receipt.*
  INTO v_existing
  FROM public.pos_inventory_receipts AS receipt
  WHERE receipt.brand_slug = p_brand_slug
    AND receipt.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'POS_INVENTORY_IDEMPOTENCY_CONFLICT'
        USING ERRCODE = '23505';
    END IF;

    IF v_existing.status <> 'completed' THEN
      RAISE EXCEPTION 'POS_INVENTORY_IDEMPOTENCY_INCOMPLETE'
        USING ERRCODE = '55000';
    END IF;

    SELECT COALESCE(
      jsonb_agg(to_jsonb(receipt_item) ORDER BY receipt_item.id),
      '[]'::jsonb
    )
    INTO v_replay_items
    FROM public.pos_inventory_receipt_items AS receipt_item
    WHERE receipt_item.receipt_id = v_existing.id;

    RETURN jsonb_build_object(
      'receipt', to_jsonb(v_existing) - 'idempotency_key' - 'payload_fingerprint',
      'items', v_replay_items
    );
  END IF;

  -- v1 permanece como el único core de negocio: validaciones, conversiones,
  -- costos, locks, movimientos, partidas, numeración y totales no se duplican.
  v_result := public.pos_complete_inventory_receipt_v1(
    p_brand_id,
    p_brand_slug,
    p_location_id,
    p_supplier_name,
    p_supplier_reference,
    p_notes,
    p_items,
    p_user_id
  );

  v_receipt_id := NULLIF(v_result #>> '{receipt,id}', '')::uuid;

  IF v_receipt_id IS NULL THEN
    RAISE EXCEPTION 'La recepción v1 no devolvió receipt.id.';
  END IF;

  UPDATE public.pos_inventory_receipts AS receipt
  SET idempotency_key = p_idempotency_key,
      payload_fingerprint = v_fingerprint
  WHERE receipt.id = v_receipt_id
    AND receipt.brand_id = p_brand_id
    AND receipt.brand_slug = p_brand_slug
    AND receipt.status = 'completed'
  RETURNING receipt.* INTO v_existing;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La recepción idempotente no terminó en estado completed.';
  END IF;

  RETURN jsonb_set(
    v_result,
    '{receipt}',
    (v_result -> 'receipt') - 'idempotency_key' - 'payload_fingerprint'
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.pos_complete_inventory_receipt_v2(
  text, text, uuid, text, text, text, jsonb, uuid, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.pos_complete_inventory_receipt_v2(
  text, text, uuid, text, text, text, jsonb, uuid, uuid
) TO service_role;

COMMENT ON FUNCTION public.pos_complete_inventory_receipt_v2(
  text, text, uuid, text, text, text, jsonb, uuid, uuid
) IS 'Completa una recepción mediante el core v1 con idempotencia tenant-scoped y fingerprint de payload.';
