// Reuses the disposable B1/O1 harness; never applies migrations to principal or remote.
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
let source=fs.readFileSync('scripts/test-comu-buyer-privacy-b1-local.mjs','utf8');
source=source.replace("import('./test-comu-buyer-orders-b1-http.mjs')", "import('./test-comu-buyer-orders-b2-http.mjs')");
// The nested replacement in the B1 runner is a literal string.
source=source.replace("\"import('./test-comu-buyer-orders-b1-http.mjs')\"", "\"import('./test-comu-buyer-orders-b2-http.mjs')\"");
source=source.replace("path.resolve('scripts',file)",`path.resolve(${JSON.stringify(path.resolve('scripts'))},file)`);
if(!source.includes('test-comu-buyer-orders-b2-http'))throw Error('B1 harness layout changed');
const result=spawnSync(process.execPath,['--input-type=module','-','--o1-only','--http'],{input:source,encoding:'utf8',windowsHide:true,stdio:['pipe','inherit','inherit']});
if(result.error)throw result.error;
process.exitCode=result.status||0;
