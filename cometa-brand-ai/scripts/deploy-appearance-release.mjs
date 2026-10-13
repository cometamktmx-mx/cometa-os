// Deploy only a previously reviewed source copy; no Git operations or project relinking.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
assert.equal(process.argv[2],'--authorized-editor-release');
const copy=path.resolve(process.argv[3] || '');
assert.ok(copy.startsWith(path.resolve('.next/magenta-preview-preparation')+path.sep));
assert.ok(fs.existsSync(path.join(copy,'manifest.json')));
const args=['deploy','--yes','--prod','--scope=cometa-os-s-projects','--cwd='+path.join(copy,'cometa-os')];
for(const pair of ['COMU_ENABLED=true','COMU_SELLER_ONBOARDING_ENABLED=true','COMU_CATALOG_ENABLED=true','COMU_BUYER_FOUNDATION_ENABLED=true','COMU_PUBLIC_PURCHASES_ENABLED=false','COMU_NOTIFICATIONS_EMAIL_ENABLED=false','COMU_OUTBOUND_MONEY_ENABLED=false','OWN_STOREFRONT_URLS='+JSON.stringify({'magenta-fitwear':'https://magenta-controlled-preview.vercel.app'})])args.push('--env',pair);
args.push('--build-env','NEXT_PUBLIC_COMU_PURCHASES_ENABLED=false');
const cli=path.join(process.env.APPDATA,'npm/node_modules/vercel/dist/index.js');assert.ok(fs.existsSync(cli));
const child=spawn(process.execPath,[cli,...args],{stdio:'inherit',windowsHide:true,env:{...process.env,VERCEL_ORG_ID:'team_3f4DG9ZeW7C3cLQw5J05a5xX',VERCEL_PROJECT_ID:'prj_ecEVtItINKExbKMjTCfterMj1tJy'}});
child.on('exit',code=>{process.exitCode=code??1;});
