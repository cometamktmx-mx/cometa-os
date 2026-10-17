// Explicit operator invocation only. Uses stdin for secrets, never shell arguments.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createPrivateKey,createPublicKey,X509Certificate} from 'node:crypto';
const [authorization,custodyArg,brand,origin]=process.argv.slice(2);
assert.equal(authorization,'--authorized-configure');
assert.ok(custodyArg&&brand&&origin);
assert.equal(new URL(origin).protocol,'https:');assert.equal(new URL(origin).origin,origin);
const custody=path.resolve(custodyArg),git=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
assert.ok(path.relative(git,custody).startsWith('..'+path.sep),'Custody must be outside Git');
const certificate=fs.readFileSync(path.join(custody,'cometa-signer.crt'),'utf8');
const cert=new X509Certificate(certificate),root=new X509Certificate(fs.readFileSync(path.join(custody,'cometa-root.crt')));
assert.ok(cert.verify(root.publicKey));assert.ok(Date.now()<Date.parse(cert.validTo));
const encrypted=fs.readFileSync(path.join(custody,'signer.dpapi'),'utf8');
let key;
try {key=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Console]::Out.Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))"],{input:encrypted,encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true});}catch{throw Error('DPAPI unlock failed; use the original Windows custody account');}
assert.ok(createPublicKey(createPrivateKey(key)).equals(cert.publicKey));
const cli=path.join(process.env.APPDATA,'npm/node_modules/vercel/dist/index.js');
const values={POS_QZ_MANAGED_BRAND:brand,POS_QZ_MANAGED_ORIGIN:origin,POS_QZ_TRUST_MODE:'managed-root',POS_QZ_CERTIFICATE:certificate,POS_QZ_PRIVATE_KEY:key};
// No --force: a pre-existing value must be reviewed, never silently replaced.
for(const [name,value] of Object.entries(values)) {
 try {execFileSync(process.execPath,[cli,'env','add',name,'production','--sensitive','--yes','--scope','cometa-os-s-projects'],{input:value,encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true,timeout:60000});}
 catch {throw Error('Failed to add '+name+'; inspect variable names in Vercel. Existing values were not forcibly overwritten. No secrets printed.');}
 console.log('Configured sensitive production variable:',name);
}
key='';console.log('Redeploy verified scoped signing code before enabling terminal automation. No private key written to the repository.');
