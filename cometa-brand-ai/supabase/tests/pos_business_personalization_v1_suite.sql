BEGIN;

CREATE TEMP TABLE personalization_results(test_no integer primary key,test_name text,passed boolean,details jsonb) ON COMMIT DROP;

INSERT INTO personalization_results VALUES
(1,'new personalization fields are nullable',
 (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='pos_branding' AND column_name IN ('legal_name','tax_id','phone','email','instagram','facebook','tiktok','receipt_message','return_policy') AND is_nullable='YES')=9,
 jsonb_build_object('fields',9)),
(2,'existing identity authority is preserved',
 to_regclass('public.pos_branding') IS NOT NULL AND to_regclass('public.brands') IS NOT NULL,
 jsonb_build_object('authority','pos_branding + brands.name')),
(3,'location data remains separate',
 to_regclass('public.pos_locations') IS NOT NULL,
 jsonb_build_object('location_authority','pos_locations')),
(4,'branding storage is tenant-ready',
 EXISTS (SELECT 1 FROM storage.buckets WHERE id='pos-brand-assets'),
 jsonb_build_object('bucket','pos-brand-assets')),
(5,'no duplicate document logo columns introduced',
 NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pos_branding' AND column_name IN ('logo_ticket','logo_pdf','logo_receipt','brand_color','document_footer')),
 jsonb_build_object('single_logo_authority','logo_url'));

INSERT INTO personalization_results
SELECT 99,'SUMMARY all_checks_passed',bool_and(passed),jsonb_build_object('passed_count',count(*) FILTER(WHERE passed),'failed_count',count(*) FILTER(WHERE NOT passed),'all_checks_passed',bool_and(passed))
FROM personalization_results;

SELECT test_no,test_name,passed,details FROM personalization_results ORDER BY test_no;
ROLLBACK;
