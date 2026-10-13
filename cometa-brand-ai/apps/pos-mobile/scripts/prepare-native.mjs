import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const platform=process.argv[2];
if(!['android','ios'].includes(platform)) throw new Error('Usage: node scripts/prepare-native.mjs android|ios');
if(!existsSync('dist/index.html')) throw new Error('Run npm run build first.');
const cli=path.resolve('node_modules/@capacitor/cli/bin/capacitor');
const args=existsSync(platform)?['sync',platform]:['add',platform,...(platform==='ios'?['--packagemanager','SPM']:[])];
const result=spawnSync(process.execPath,[cli,...args],{stdio:'inherit',windowsHide:true,env:{...process.env,CAPACITOR_TELEMETRY_DISABLED:'1'}});
if(result.status!==0)process.exit(result.status||1);
if(platform==='android') {
 // Cleartext is allowed ONLY in debug: M2 loopback/LAN APIs. Release stays HTTPS-only.
 mkdirSync('android/app/src/debug',{recursive:true});
 writeFileSync('android/app/src/debug/AndroidManifest.xml','<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools"><application android:usesCleartextTraffic="true" tools:replace="android:usesCleartextTraffic" /></manifest>\n');
}
console.log(`${platform} prepared; no native build or release signing performed.`);
