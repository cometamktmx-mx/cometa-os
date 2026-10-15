BEGIN;

ALTER TABLE public.pos_branding
  ADD COLUMN IF NOT EXISTS legal_name text NULL,
  ADD COLUMN IF NOT EXISTS tax_id text NULL,
  ADD COLUMN IF NOT EXISTS phone text NULL,
  ADD COLUMN IF NOT EXISTS email text NULL,
  ADD COLUMN IF NOT EXISTS instagram text NULL,
  ADD COLUMN IF NOT EXISTS facebook text NULL,
  ADD COLUMN IF NOT EXISTS tiktok text NULL,
  ADD COLUMN IF NOT EXISTS receipt_message text NULL,
  ADD COLUMN IF NOT EXISTS return_policy text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.pos_branding'::regclass
      AND conname = 'pos_branding_personalization_lengths_ck'
  ) THEN
    ALTER TABLE public.pos_branding
      ADD CONSTRAINT pos_branding_personalization_lengths_ck CHECK (
        (legal_name IS NULL OR char_length(legal_name) <= 180) AND
        (tax_id IS NULL OR char_length(tax_id) <= 40) AND
        (phone IS NULL OR char_length(phone) <= 40) AND
        (email IS NULL OR char_length(email) <= 180) AND
        (instagram IS NULL OR char_length(instagram) <= 300) AND
        (facebook IS NULL OR char_length(facebook) <= 300) AND
        (tiktok IS NULL OR char_length(tiktok) <= 300) AND
        (receipt_message IS NULL OR char_length(receipt_message) <= 240) AND
        (return_policy IS NULL OR char_length(return_policy) <= 1000)
      );
  END IF;
END
$$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pos-brand-assets',
  'pos-brand-assets',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
