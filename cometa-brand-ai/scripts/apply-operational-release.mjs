// Explicitly authorized 2026-10-11 operational release. No glob/db push.
// Original SQL files are passed directly to the CLI; ledger is a separate call.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const ref = 'zhtagqrzyovsrmsicaot';
assert.equal(process.argv[2], '--authorized-operational-release');
const dir = '.next/release-private-20261011';
const evidence = JSON.parse(fs.readFileSync(dir + '/restore-evidence.json', 'utf8'));
for (const [file, expected] of [['schema.sql', evidence.schemaHash], ['data.sql', evidence.dataHash]]) {
  assert.equal(createHash('sha256').update(fs.readFileSync(dir + '/' + file)).digest('hex'), expected);
}
const rehearsal = fs.readFileSync(dir + '/rehearsal-final.log');
assert.ok(/PASS seller-only SQL boundary/.test(rehearsal.toString(rehearsal[0] === 255 ? 'utf16le' : 'utf8')), 'Final rehearsal must pass');
const files = [
 '20260928180000_comu_buyer_experience_v1.sql',
 '20261002120000_pos_device_foundation_v1.sql',
 '20261002121000_pos_mutation_api_boundary_v1.sql',
 '20261003130000_comu_seller_approval_v1.sql',
 '20261003150000_comu_seller_catalog_v1.sql',
 '20261003170000_comu_shared_variant_contract_v1.sql',
 '20261005120000_comu_order_contract_state_safety_v1.sql',
 '20261005150000_comu_notifications_v1.sql',
 '20261005170000_comu_buyer_order_read_privacy_v1.sql',
 '20261010120000_comu_reservation_lifecycle_m0.sql',
 '20261010160000_brand_online_store_access_a1.sql',
 '20261010180000_pos_product_sales_channels_m1.sql',
 '20261010200000_pos_product_web_content_m2.sql',
 '20261011100000_brand_storefront_appearance_m3.sql',
 '20261011120000_storefront_catalog_m4.sql',
 '20261011140000_storefront_product_m5.sql',
 '20261011160000_storefront_checkout_m6.sql',
 '20261011180000_comu_seller_release_purchase_boundary.sql',
];
const cli = path.resolve('node_modules/@supabase/cli-windows-x64/bin/supabase.exe');
function query(args) {
  // Explicit project-ref is required on every invocation, independent of local link.
  const result = execFileSync(cli, ['db','query','--linked','--project-ref', ref, ...args], {encoding:'utf8',timeout:180000,stdio:['ignore','pipe','pipe'],maxBuffer:8*1024*1024});
  return JSON.parse(result);
}
const log = [];
for (const file of files) {
  const version = file.split('_')[0], name = file.slice(15,-4);
  const pre = query([`begin read only; select current_database() as db, exists(select 1 from supabase_migrations.schema_migrations where version='${version}') as installed; commit;`]).rows[0];
  assert.equal(pre.db,'postgres');
  if(pre.installed) {console.log('Already registered',file);continue;}
  const source = path.resolve('supabase/migrations', file);
  const sha256 = createHash('sha256').update(fs.readFileSync(source)).digest('hex');
  console.log('Applying original file', ref, file, sha256);
  query(['--file',source]);
  // Confirmed successful execution before registering; never claim failed SQL installed.
  query([`insert into supabase_migrations.schema_migrations(version,name) values ('${version}','${name}');`]);
  const verified = query([`begin read only; select version from supabase_migrations.schema_migrations where version='${version}'; commit;`]);
  assert.equal(verified.rows[0].version,version);
  log.push({file,sha256,appliedAt:new Date().toISOString()});
  fs.writeFileSync(dir+'/applied-migrations.json',JSON.stringify(log,null,2));
  console.log('PASS applied + registered',file);
}
query(["notify pgrst, 'reload schema';"]);
console.log('PASS explicit migration chain; schema cache reload requested. No workers invoked.');
