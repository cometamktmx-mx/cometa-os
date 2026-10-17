import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
export function testCertificate(){
 const root=path.resolve('build/qz-test-private');fs.mkdirSync(root,{recursive:true});
 const dir=fs.mkdtempSync(path.join(root,'fixture-'));
 try {
  const executable=process.platform==='win32'?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl';
  execFileSync(executable,['req','-x509','-newkey','rsa:2048','-nodes','-days','2','-subj','/CN=LOCAL TEST ONLY','-keyout',path.join(dir,'key.pem'),'-out',path.join(dir,'cert.pem')],{stdio:'ignore'});
  return {key:fs.readFileSync(path.join(dir,'key.pem'),'utf8'),certificate:fs.readFileSync(path.join(dir,'cert.pem'),'utf8')};
 } finally {if(!dir.startsWith(root+path.sep))throw Error('Invalid fixture path');fs.rmSync(dir,{recursive:true});}
}
