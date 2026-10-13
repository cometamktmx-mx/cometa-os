// Local-only preview of the exact download component, no Next backend or credentials.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import ts from 'typescript';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),module={exports:{}};
const code=ts.transpileModule(readFileSync('src/components/pos-mobile-download.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
new Function('require','module','exports',code)(require,module,module.exports);
const release={applicationId:'com.cometaos.pos',channel:'beta',versionName:'0.1.0-beta.1',versionCode:2,minimumSupportedVersionCode:2,downloadUrl:'https://download.beta.invalid/android/beta/2/cometa-pos-0.1.0-beta.1.apk',sha256:'a'.repeat(64),sizeBytes:16048649,publishedAt:'2026-10-03T00:00:00Z'};
function html(ready){return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>COMETA POS Beta - local preview</title><style>body{margin:0}*{box-sizing:border-box}li{margin:12px 0}a{color:inherit}button{font:inherit}</style></head><body>'+renderToStaticMarkup(createElement(module.exports.PosMobileDownload,{release:ready?release:null}))+'</body></html>';}
assert.match(html(false),/disabled/);assert.ok(!html(false).includes('href="https://download'));
assert.match(html(true),/cometa-pos-0.1.0-beta.1.apk/);assert.match(html(true),/SHA-256/);
if(process.argv.includes('--test')) console.log('PASS: unpublished and populated download component states');
else createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(html(req.url?.includes('fixture=release')));}).listen(5194,'127.0.0.1',()=>console.log('Local preview http://127.0.0.1:5194/android (fixture=release uses a nonresolving .invalid download)'));
