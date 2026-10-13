import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const [mode, action] = process.argv.slice(2);
if (!['development', 'beta'].includes(mode)) throw Error('Unknown or disabled profile; Production is not enabled');
if (process.env.VITE_POS_ENV && process.env.VITE_POS_ENV !== mode) throw Error('Profile mismatch');
const env = { ...process.env, VITE_POS_ENV: mode };
function run(args) { const r = spawnSync(process.execPath, args, { env, stdio: 'inherit', windowsHide: true }); if (r.status !== 0) process.exit(r.status || 1); }
if (action === 'dev') run(['node_modules/vite/bin/vite.js', '--mode', mode, '--host', '127.0.0.1', ...process.argv.slice(4)]);
else {
  run(['node_modules/typescript/bin/tsc', '--noEmit', '--incremental', 'false', '--pretty', 'false']);
  run(['node_modules/vite/bin/vite.js', 'build', '--mode', mode]);
  const release = JSON.parse(readFileSync('release.json', 'utf8'));
  writeFileSync('dist/mobile-build.json', JSON.stringify({applicationId:release.applicationId,channel:mode,...release[mode],builtAt:new Date().toISOString()},null,2));
  run(['scripts/scan-bundle.mjs', mode]);
}
