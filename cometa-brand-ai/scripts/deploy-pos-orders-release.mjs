// Existing repository snapshot workflow; preserve all project environment values.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawn,execFileSync} from 'node:child_process';
assert.equal(process.argv[2],'--authorized-release');
const copy=path.resolve(process.argv[3]||'');
assert.ok(copy.startsWith(path.resolve('.next/magenta-preview-preparation')+path.sep));
assert.ok(fs.existsSync(path.join(copy,'manifest.json')));
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const cli=path.join(process.env.APPDATA,'npm/node_modules/vercel/dist/index.js');assert.ok(fs.existsSync(cli));
const child=spawn(process.execPath,[cli,'deploy','--yes','--prod','--skip-domain','--scope=cometa-os-s-projects','--cwd='+path.join(copy,'cometa-os'),'--meta','githubCommitSha='+commit],{stdio:'inherit',windowsHide:true,env:{...process.env,VERCEL_ORG_ID:'team_3f4DG9ZeW7C3cLQw5J05a5xX',VERCEL_PROJECT_ID:'prj_ecEVtItINKExbKMjTCfterMj1tJy'}});
child.on('exit',code=>{process.exitCode=code??1;});
