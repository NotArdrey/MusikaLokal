import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from '../web/node_modules/dotenv/lib/main.js';
import { put } from '../web/node_modules/@vercel/blob/dist/index.js';
import { verifyAndroidApkDownload } from '../web/scripts/android-release-storage.mjs';
dotenv.config({path:'.env.local',quiet:true});
const apkPath='mobile/build/testing/musikalokal-testing.apk';
const metadata=JSON.parse((await readFile(apkPath+'.json','utf8')).replace(/^\uFEFF/,''));
const bytes=await readFile(apkPath);
const previous=JSON.parse(await readFile('web/public/android-release.json','utf8'));
assert.equal(metadata.sha256,createHash('sha256').update(bytes).digest('hex'));
assert.equal(metadata.sizeBytes,bytes.length);
assert.equal(metadata.certificateSha256,previous.certificateSha256);
assert.equal(metadata.packageId,previous.packageId);
assert.ok(metadata.testing && metadata.versionCode>previous.versionCode);
const blob=await put(`android/testing/${metadata.sha256}/musikalokal-testing.apk`,bytes,{
  access:'public',addRandomSuffix:false,contentType:'application/vnd.android.package-archive',multipart:true,
});
const release={...metadata,downloadUrl:blob.url+'?download=1'};
await verifyAndroidApkDownload(release.downloadUrl,metadata);
await writeFile('web/releases/'+metadata.sha256+'.json',JSON.stringify(release,null,2)+'\n');
await writeFile('web/public/android-release.json',JSON.stringify(release,null,2)+'\n');
console.log(JSON.stringify({uploadVerified:true,release},null,2));
