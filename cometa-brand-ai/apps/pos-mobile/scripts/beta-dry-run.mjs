import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const common={...process.env,VITE_POS_ENV:'beta',VITE_POS_BACKEND:'https://backend.beta.invalid',VITE_SUPABASE_URL:'https://database.beta.invalid',VITE_SUPABASE_ANON_KEY:'sb_publishable_fixture_public_key_only',VITE_POS_UPDATE_METADATA_URL:'https://backend.beta.invalid/mobile/releases/latest',VITE_POS_RELEASE:'0.1.0-beta.1-dry-run'};
const results=[];
for(const [name,patch] of [['unapproved-placeholders',{}],['local-backend',{VITE_POS_BACKEND:'http://127.0.0.1:3105'}],['production-database',{VITE_SUPABASE_URL:'https://zhtagqrzyovsrmsicaot.supabase.co'}],['missing-key',{VITE_SUPABASE_ANON_KEY:''}]]) {
  const r=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--mode','beta'],{env:{...common,...patch},encoding:'utf8',windowsHide:true,timeout:30000});
  assert.equal(r.status,1,`${name} must fail closed`);
  assert.match(r.stderr,/Beta targets have not been approved|Missing VITE_|Unapproved remote endpoint/);
  results.push({name,result:'PASS: build rejected'});
}
mkdirSync('artifacts/m2-7b',{recursive:true});writeFileSync('artifacts/m2-7b/beta-dry-run.json',JSON.stringify(results,null,2));
console.log(results);
// Deliberately never invokes build:production or Gradle release.
