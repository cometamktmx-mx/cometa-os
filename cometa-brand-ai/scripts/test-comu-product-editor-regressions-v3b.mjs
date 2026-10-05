// Run unchanged V1/V2 visual tests, directing evidence to this block only.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
for(const [script,folder] of [['scripts/test-comu-seller-visual-local.mjs','v1'],['scripts/test-comu-seller-products-visual-local.mjs','v2']]) {
  let source=fs.readFileSync(script,'utf8');
  source=source.replace(/const output = '[^']+';/,`const output = 'docs/visual-evidence/comu-product-editor-v3b/regression-${folder}';`);
  execFileSync(process.execPath,['--input-type=module','--eval',source],{stdio:'inherit',windowsHide:true});
}
