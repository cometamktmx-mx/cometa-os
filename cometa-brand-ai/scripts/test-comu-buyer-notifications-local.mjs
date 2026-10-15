// Only the existing disposable B1/O1 harness; zero real provider delivery.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
let source=fs.readFileSync('scripts/test-comu-buyer-privacy-b1-local.mjs','utf8');
source=source.replaceAll('test-comu-buyer-orders-b1-http.mjs','test-comu-buyer-notifications-http.mjs');
source=source.replace("path.resolve('scripts',file)",`path.resolve(${JSON.stringify(path.resolve('scripts'))},file)`);
const result=spawnSync(process.execPath,['--input-type=module','-','--o1-only','--http'],{input:source,encoding:'utf8',windowsHide:true,stdio:['pipe','inherit','inherit']});
if(result.error)throw result.error;
process.exitCode=result.status||0;
