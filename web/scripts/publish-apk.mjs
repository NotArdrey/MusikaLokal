import { createReadStream } from 'node:fs';
import { readFile, stat, mkdir, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { put } from '@vercel/blob';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apkPath = resolve(process.argv[2] || resolve(webRoot, '../mobile/build/testing/musikalokal-testing.apk'));

try {
  const metadata = JSON.parse((await readFile(`${apkPath}.json`, 'utf8')).replace(/^\uFEFF/, ''));
  const file = await stat(apkPath);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(apkPath)) hash.update(chunk);
  const sha256 = hash.digest('hex');
  if (metadata.packageId !== 'com.anonymous.musikalokal' || metadata.testing !== true ||
      metadata.sha256 !== sha256 || metadata.sizeBytes !== file.size ||
      !/^[a-f0-9]{64}$/.test(metadata.certificateSha256) || metadata.minSdk < 24) {
    throw new Error('APK verification metadata is missing or does not match the APK. Rebuild with android:apk:test.');
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
    throw new Error('Authenticate the connected Blob store with Vercel CLI/environment credentials before uploading.');
  }
  const blob = await put(`android/testing/${sha256}/musikalokal-testing.apk`, createReadStream(apkPath), {
    access: 'public', contentType: 'application/vnd.android.package-archive',
    multipart: true, addRandomSuffix: false, allowOverwrite: false,
  });
  // Only publish the new manifest after the complete APK is available.
  const release = { ...metadata, downloadUrl: blob.downloadUrl };
  const historyRoot = resolve(webRoot, 'releases');
  await mkdir(historyRoot, { recursive: true });
  await writeFile(resolve(historyRoot, `${sha256}.json`), `${JSON.stringify(release, null, 2)}\n`);
  const publicRoot = resolve(webRoot, 'public');
  await mkdir(publicRoot, { recursive: true });
  const manifest = resolve(publicRoot, 'android-release.json');
  const temporary = `${manifest}.tmp`;
  await writeFile(temporary, `${JSON.stringify(release, null, 2)}\n`);
  await rename(temporary, manifest);
  const associationRoot = resolve(publicRoot, '.well-known');
  await mkdir(associationRoot, { recursive: true });
  const certificate = metadata.certificateSha256.match(/.{2}/g).join(':').toUpperCase();
  await writeFile(resolve(associationRoot, 'assetlinks.json'), `${JSON.stringify([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app', package_name: metadata.packageId,
      sha256_cert_fingerprints: [certificate],
    },
  }], null, 2)}\n`);
  console.log(`Uploaded verified testing APK: ${blob.downloadUrl}`);
  console.log(`SHA-256: ${sha256}`);
  console.log('Release manifest updated. Rebuild and deploy the website to publish this release.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'APK upload failed.');
  process.exitCode = 1;
}
