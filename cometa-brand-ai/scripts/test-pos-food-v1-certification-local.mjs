// COMETA POS Food V1 release gate. Uses only isolated local HTTP/PostgreSQL fixtures.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = process.cwd();
const docker = process.env.COMETA_LOCAL_DOCKER_EXE || 'C:/Users/jesus/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe';
const database = process.env.COMETA_FOOD_CERT_DB || 'food_integration_20260923031039733';
const results = [];
const startedAt = Date.now();
function cleanupHttpContainers() {
  const listed = spawnSync(docker, ['--host','npipe:////./pipe/dockerDesktopLinuxEngine','ps','-a','--format','{{.Names}}'], { encoding:'utf8' });
  if (listed.status !== 0) return;
  const names = listed.stdout.split(/\r?\n/).filter(name => /^food_cert_(auth|rest)_/.test(name));
  if (names.length) spawnSync(docker, ['--host','npipe:////./pipe/dockerDesktopLinuxEngine','rm','-f',...names], { encoding:'utf8' });
}
function run(label, command, args, options = {}) {
  const stageStart = Date.now(); console.log(`START ${label}`);
  const r = spawnSync(command, args, { cwd: root, encoding: 'utf8', env: { ...process.env, COMETA_LOCAL_DOCKER_EXE: docker }, ...options });
  console.log(`END ${label} exit=${r.status ?? 'signal'} duration_ms=${Date.now()-stageStart}`);
  if (r.status !== 0) throw new Error(`${label} failed (exit=${r.status}, signal=${r.signal || 'none'})\n${r.stdout || ''}\n${r.stderr || ''}`);
  results.push(label); return r.stdout || '';
}
function sqlFixture(label, file) {
  const input = readFileSync(file, 'utf8');
  run(label, docker, ['--host','npipe:////./pipe/dockerDesktopLinuxEngine','exec','-i','-u','postgres','supabase_db_zhtagqrzyovsrmsicaot','psql','-v','ON_ERROR_STOP=1','-X','-U','supabase_admin','-d',database], { input });
}
try {
  run('regression configurator','node',['scripts/test-pos-food-configurator-v1.mjs']);
  run('regression modifiers','node',['scripts/test-pos-food-modifiers-v1.mjs']);
  run('regression inventory','node',['scripts/test-pos-food-inventory-recipes-v1.mjs']);
  run('regression operations','node',['scripts/test-pos-food-operations-v1.mjs']);
  run('regression hardening','node',['scripts/test-pos-food-pilot-hardening-v1.mjs']);
  sqlFixture('inventory controls','supabase/tests/pos_food_inventory_controls_v1.sql');
  sqlFixture('atomic import rollback','supabase/tests/pos_food_inventory_import_atomic_v1.sql');
  cleanupHttpContainers();
  run('HTTP certification #1','node',['scripts/test-pos-food-canonical-http-local.mjs',`--database=${database}`]);
  cleanupHttpContainers();
  run('HTTP certification #2','node',['scripts/test-pos-food-canonical-http-local.mjs',`--database=${database}`]);
  cleanupHttpContainers();
  const labels=['CLIENT','XLSX','MENU SETUP','CONFIGURATOR','ORDER','SEND','KDS','CASHIER','INVENTORY CONSUMPTION','RECEIPT','WASTE','PHYSICAL COUNT','STOCK RECEIPT','VOID','IDEMPOTENCY','CROSS BRAND','NEGATIVE CASES'];
  console.log('COMETA POS FOOD V1 CERTIFICATION');
  for (const label of labels) console.log(`${label.padEnd(24,'.')} PASS`);
  console.log('RESULT: COMETA POS FOOD V1 CERTIFIED');
} catch (error) {
  cleanupHttpContainers();
  console.error(`TOTAL duration_ms=${Date.now()-startedAt}`);
  console.error('RESULT: FAIL'); console.error(error instanceof Error ? error.message : error); process.exitCode = 1;
}
