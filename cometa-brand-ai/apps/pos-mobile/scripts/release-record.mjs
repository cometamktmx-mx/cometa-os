// Local record only; does not sign, upload or publish metadata.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const [apk,certificateSha256,sourceSnapshotSha256,backendCompatibility]=process.argv.slice(2);
const release=JSON.parse(readFileSync('release.json','utf8'));
if(!release.beta.distributionHistoryConfirmed)throw Error('Distribution history must be confirmed first');
if(!apk?.endsWith('.apk') || !/^[a-f0-9]{64}$/i.test(certificateSha256||'') || !/^[a-f0-9]{64}$/i.test(sourceSnapshotSha256||'') || !backendCompatibility)throw Error('APK, verified certificate fingerprint, reviewed source snapshot digest and backend compatibility required');
const data=readFileSync(apk);
const sourceRevision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim();
const record={applicationId:release.applicationId,channel:'beta',versionName:release.beta.versionName,versionCode:release.beta.versionCode,publishedAt:null,builtAt:new Date().toISOString(),sha256:createHash('sha256').update(data).digest('hex'),sizeBytes:data.length,certificateSha256,sourceRevision,sourceSnapshotSha256,backendCompatibility,objectPath:`/android/beta/${release.beta.versionCode}/cometa-pos-${release.beta.versionName}.apk`};
writeFileSync(apk+'.release.json',JSON.stringify(record,null,2));
console.log('Local release record prepared. Signature must be checked with apksigner before distribution.');
