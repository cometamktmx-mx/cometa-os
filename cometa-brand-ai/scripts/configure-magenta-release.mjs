// Configures only the independently created storefront project. Never prints values.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
assert.equal(process.argv[2], '--authorized-release');
const project='prj_MOOHfmywnzMF83PxRtqpDk1fvAqE';
const dir='.next/release-private-20261011';
const b=fs.readFileSync(dir+'/api-keys.private.json');
const keys=JSON.parse(b.toString(b[0]===255?'utf16le':'utf8').replace(/^\uFEFF/,''));
const values={
 STOREFRONT_SUPABASE_URL:'https://zhtagqrzyovsrmsicaot.supabase.co',
 STOREFRONT_SUPABASE_ANON_KEY:keys.find(k=>k.name==='anon').api_key,
 STOREFRONT_SUPABASE_SERVICE_ROLE_KEY:keys.find(k=>k.name==='service_role').api_key,
 STOREFRONT_ORIGIN:'https://magenta-controlled-preview.vercel.app',
};
// Brand binding requires the user's choice between the two existing identities.
if(process.argv[3]){assert.ok(['magenta-fitwear','magenta-fit-wear'].includes(process.argv[3]));values.STOREFRONT_BRAND_SLUG=process.argv[3];}
for(const [name,value] of Object.entries(values)){
 const result=spawnSync('cmd.exe',['/d','/s','/c',`vercel.cmd env add ${name} production,preview --project=${project} --scope=cometa-os-s-projects --yes --sensitive --force`],{input:value,encoding:'utf8',timeout:90000});
 if(result.status!==0){fs.writeFileSync(dir+'/store-env-error.private.txt',String(result.stdout)+String(result.stderr));throw Error('Configuration failed for '+name+'; inspect private diagnostics');}
 console.log('Configured server-only',name);
}
console.log('No Stripe keys, shipping rates or workers configured.');
