// Operator-only issuance. Private material never enters the repository or package.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {generateKeyPairSync,X509Certificate,createPrivateKey,createPublicKey,sign,verify} from 'node:crypto';
const [custodyArg,outputArg]=process.argv.slice(2);
assert.equal(process.platform,'win32','Windows DPAPI custody required');
assert.ok(custodyArg&&outputArg,'Usage: node scripts/prepare-qz-managed-root.mjs EXTERNAL_CUSTODY NEW_PUBLIC_OUTPUT');
const custody=path.resolve(custodyArg),output=path.resolve(outputArg);
const git=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
assert.ok(!path.relative(git,custody).split(path.sep).every(p=>p!=='..'),'Custody must be outside Git');
assert.ok(!fs.existsSync(custody)&&!fs.existsSync(output),'Use fresh directories; existing keys are never replaced');
const ps=(script,input='')=>execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true}).trim();
const quote=s=>"'"+s.replaceAll("'","''")+"'";
ps(`$ErrorActionPreference='Stop'; $p=${quote(custody)}; New-Item -ItemType Directory -Path $p | Out-Null; $acl=New-Object Security.AccessControl.DirectorySecurity; $acl.SetAccessRuleProtection($true,$false); foreach($sid in @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18')) { $rule=New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($sid)),'FullControl','ContainerInherit,ObjectInherit','None','Allow'); $acl.AddAccessRule($rule) }; Set-Acl -LiteralPath $p -AclObject $acl`);
fs.mkdirSync(output,{recursive:true});
const openssl='C:/Program Files/Git/usr/bin/openssl.exe';
const run=args=>{try {return execFileSync(openssl,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true});}catch{throw Error('OpenSSL issuance failed; no private diagnostic printed');}};
const protect=key=>ps("Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))",Buffer.from(key).toString('base64'));
const temporary=[];
try {
 for(const name of ['root','signer']) {
  const key=generateKeyPairSync('rsa',{modulusLength:name==='root'?4096:2048}).privateKey.export({type:'pkcs8',format:'pem'});
  fs.writeFileSync(path.join(custody,name+'.dpapi'),protect(key),{flag:'wx'});
  const file=path.join(custody,name+'.key');temporary.push(file);fs.writeFileSync(file,key,{flag:'wx'});
 }
 const root=path.join(output,'cometa-root.crt'),leaf=path.join(output,'cometa-signer.crt');
 run(['req','-x509','-new','-key',path.join(custody,'root.key'),'-sha256','-days','1095','-subj','/O=COMETA/CN=COMETA Managed QZ Root','-addext','basicConstraints=critical,CA:TRUE,pathlen:0','-addext','keyUsage=critical,keyCertSign,cRLSign','-out',root]);
 const csr=path.join(custody,'signer.csr'),ext=path.join(custody,'signer.ext');temporary.push(csr,ext);
 run(['req','-new','-key',path.join(custody,'signer.key'),'-subj','/O=COMETA/CN=COMETA POS Magenta','-out',csr]);
 fs.writeFileSync(ext,'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n');
 run(['x509','-req','-in',csr,'-CA',root,'-CAkey',path.join(custody,'root.key'),'-set_serial','0x'+Date.now().toString(16),'-days','365','-sha256','-extfile',ext,'-out',leaf]);
 run(['verify','-CAfile',root,leaf]);
 const cert=new X509Certificate(fs.readFileSync(leaf)),ca=new X509Certificate(fs.readFileSync(root));
 assert.ok(cert.verify(ca.publicKey));assert.equal(cert.ca,false);assert.equal(ca.ca,true);
 const key=createPrivateKey(fs.readFileSync(path.join(custody,'signer.key')));
 assert.ok(createPublicKey(key).equals(cert.publicKey));
 const digest=Buffer.from('a'.repeat(64));assert.ok(verify('SHA512',digest,cert.publicKey,sign('SHA512',digest,key)));
 const manifest={rootSha256:ca.fingerprint256.replaceAll(':',''),rootValidTo:ca.validTo,signerSha256:cert.fingerprint256,signerSha1:cert.fingerprint.replaceAll(':','').toLowerCase(),signerValidTo:cert.validTo,createdAt:new Date().toISOString(),brand:'magenta-fitwear',origin:'https://app.cometaos.com',custody:'Windows DPAPI CurrentUser; root key never uploaded'};
 fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
 fs.copyFileSync(root,path.join(custody,'cometa-root.crt'));fs.copyFileSync(leaf,path.join(custody,'cometa-signer.crt'));
 for(const file of ['cometa-qz-trust.ps1'])fs.copyFileSync('scripts/windows/'+file,path.join(output,file));
 fs.copyFileSync('docs/pos-qz-managed-root.md',path.join(output,'LEEME.md'));
 fs.writeFileSync(path.join(output,'INSTALAR.txt'),`Cierre QZ. Abra PowerShell como administrador en esta carpeta.\r\n.\\cometa-qz-trust.ps1 -Action Install -ExpectedRootSha256 ${manifest.rootSha256}\r\n\r\nPara retirar: mismo comando con -Action Uninstall.\r\nNo cambie la politica de ejecucion del equipo. Si el archivo esta bloqueado tras descargar, revise su contenido y use Unblock-File solo sobre cometa-qz-trust.ps1. Si una politica corporativa exige firma, el administrador debe firmarlo.\r\nAbra QZ normalmente y visite https://app.cometaos.com/brand/magenta-fitwear/pos/settings/terminal\r\n`);
 console.log(JSON.stringify({output,custody,...manifest}));
} finally {
 for(const file of temporary){assert.equal(path.dirname(file),custody);if(fs.existsSync(file))fs.unlinkSync(file);}
}
