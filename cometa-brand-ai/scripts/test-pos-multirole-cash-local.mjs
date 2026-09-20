// Only the isolated local database created by test-pos-food-integration-v1.
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
const database=process.argv.find(arg=>arg.startsWith('--database='))?.slice(11);
assert.match(database || '',/^food_integration_\d+$/);
const docker=process.env.COMETA_LOCAL_DOCKER_EXE || 'C:/Users/jesus/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe';
const container='supabase_db_zhtagqrzyovsrmsicaot';
function sql(source) {
 const result=spawnSync(docker,['--host','npipe:////./pipe/dockerDesktopLinuxEngine','exec','-i','-u','postgres',container,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d',database,'-f','-'],{input:source,encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true});
 if(result.error||result.status!==0) throw new Error(result.error?.message||result.stderr);
 console.log(result.stdout);console.log(result.stderr);
}
if(process.argv.includes('--apply')) sql(readFileSync('supabase/migrations/20260919120000_pos_staff_multirole_cash_audit_v1.sql','utf8'));
for(const name of ['pos_food_operations_v1','pos_food_modifiers_v1','pos_food_split_payments_v1','pos_food_inventory_recipes_v1','pos_staff_multirole_cash_audit_v1']) {
 const file=`supabase/tests/${name}.sql`;
 assert.ok(existsSync(file),`Missing required suite: ${file}`);
 sql(readFileSync(file,'utf8')); console.log(`PASS ${name}`);
}
