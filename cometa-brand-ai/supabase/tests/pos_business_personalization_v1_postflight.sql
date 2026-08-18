WITH checks AS (
  SELECT 1 test_no, 'personalization columns exist and remain nullable' test_name,
    (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='pos_branding' AND column_name IN ('legal_name','tax_id','phone','email','instagram','facebook','tiktok','receipt_message','return_policy') AND is_nullable='YES') = 9 passed,
    jsonb_build_object('expected_columns',9) details
  UNION ALL
  SELECT 2, 'existing branding columns remain present',
    (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='pos_branding' AND column_name IN ('display_name','logo_url','primary_color','whatsapp','website','ticket_footer')) = 6,
    jsonb_build_object('preserved',jsonb_build_array('display_name','logo_url','primary_color','whatsapp','website','ticket_footer'))
  UNION ALL
  SELECT 3, 'brand and location authorities remain installed',
    to_regclass('public.brands') IS NOT NULL AND to_regclass('public.pos_locations') IS NOT NULL,
    jsonb_build_object('brand_table','public.brands','location_table','public.pos_locations')
  UNION ALL
  SELECT 4, 'brand asset bucket exists',
    EXISTS (SELECT 1 FROM storage.buckets WHERE id='pos-brand-assets'),
    jsonb_build_object('bucket','pos-brand-assets')
)
SELECT test_no,test_name,passed,details FROM checks ORDER BY test_no;
