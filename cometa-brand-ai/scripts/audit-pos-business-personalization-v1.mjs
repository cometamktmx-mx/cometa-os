import fs from "node:fs";

const files = {
  migration: "supabase/migrations/20260821_pos_business_personalization_v1.sql",
  helper: "src/lib/pos/business-document-profile.ts",
  api: "src/app/api/pos/business-personalization/route.ts",
  logo: "src/app/api/pos/business-personalization/logo/route.ts",
  page: "src/app/brand/[brandSlug]/pos/settings/personalization/page.tsx",
  settings: "src/app/brand/[brandSlug]/pos/settings/page.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key,file])=>[key,fs.readFileSync(file,"utf8")]));
const checks = [
 ["migration extends pos_branding only", /ALTER TABLE public\.pos_branding/.test(source.migration) && !/CREATE TABLE public\.business/.test(source.migration)],
 ["required nullable fields exist", /legal_name text NULL/.test(source.migration) && /receipt_message text NULL/.test(source.migration) && /return_policy text NULL/.test(source.migration)],
 ["dedicated brand assets bucket and tenant path", /pos-brand-assets/.test(source.migration) && /\$\{context\.brand\.slug\}\/logo/.test(source.logo)],
 ["read model combines brands branding and locations", /from\("brands"\)/.test(source.helper) && /from\("pos_branding"\)/.test(source.helper) && /from\("pos_locations"\)/.test(source.helper)],
 ["write route requires settings permission", /pos\.settings\.manage/.test(source.api) && /requirePosPermission/.test(source.api)],
 ["logo route requires settings permission and validates signatures", /pos\.settings\.manage/.test(source.logo) && /detect\(/.test(source.logo) && /MAX_SIZE/.test(source.logo)],
 ["external logo URLs are preserved unless owned", /ownedPath/.test(source.logo)],
 ["personalization UI has four sections", /Identidad/.test(source.page) && /Contacto/.test(source.page) && /Redes sociales/.test(source.page) && /Documentos/.test(source.page)],
 ["settings links to personalization", /settings\/personalization/.test(source.settings)],
 ["no document consumers implemented", !/ticket profesional|PDF export|CSV export/i.test(source.page + source.api + source.logo)],
];
let failed=0;for(const[name,passed]of checks){console.log(`${passed?"PASS":"FAIL"} ${name}`);if(!passed)failed++;}console.log(JSON.stringify({checks:checks.length,failed,passed:failed===0}));process.exitCode=failed?1:0;
