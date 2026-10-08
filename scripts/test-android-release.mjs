import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAndroidRelease } from '../web/src/utils/androidRelease.ts';

const release = {
  downloadUrl: 'https://test.public.blob.vercel-storage.com/android/testing/app.apk?download=1',
  packageId: 'com.anonymous.musikalokal', versionName: '1.0.0', versionCode: 1,
  sizeBytes: 100000, minSdk: 24, testing: true, builtAt: '2026-10-05T00:00:00Z',
  sha256: 'a'.repeat(64), certificateSha256: 'b'.repeat(64),
};

test('a verified public testing release is downloadable', () => {
  assert.deepEqual(parseAndroidRelease(release), release);
});

test('the project APK bucket is downloadable with a matching immutable checksum path', () => {
  const supabaseRelease = { ...release, downloadUrl: `https://aefldxegsvzecshlayza.supabase.co/storage/v1/object/public/android-releases/android/testing/${release.sha256}/musikalokal-testing.apk?download=MusikaLokal.apk` };
  assert.deepEqual(parseAndroidRelease(supabaseRelease), supabaseRelease);
  for (const downloadUrl of [
    supabaseRelease.downloadUrl.replace('aefldxegsvzecshlayza', 'anotherproject'),
    supabaseRelease.downloadUrl.replace('supabase.co/', 'supabase.co.evil.example/'),
    supabaseRelease.downloadUrl.replace('android-releases', 'documents'),
    supabaseRelease.downloadUrl.replace('/public/', '/sign/'),
    supabaseRelease.downloadUrl.replace(release.sha256, 'c'.repeat(64)),
    supabaseRelease.downloadUrl.replace('musikalokal-testing.apk', 'other.apk'),
    supabaseRelease.downloadUrl.replace('https:', 'http:'),
    supabaseRelease.downloadUrl.replace('https://', 'https://user:password@'),
  ]) assert.equal(parseAndroidRelease({ ...release, downloadUrl }), null);
});

test('missing, incomplete and non-testing manifests never enable downloads', () => {
  for (const value of [null, {}, [], { ...release, testing: false }, { ...release, sha256: '' },
    { ...release, sizeBytes: 0 }, { ...release, minSdk: 0 }, { ...release, builtAt: 'invalid' },
    { ...release, packageId: 'another.app' }, { ...release, certificateSha256: 'invalid' }]) {
    assert.equal(parseAndroidRelease(value), null);
  }
});

test('download metadata rejects script URLs, HTTP and unrelated hosts', () => {
  for (const downloadUrl of ['javascript:alert(1)', 'http://test.public.blob.vercel-storage.com/app.apk',
    'https://example.com/app.apk', 'https://test.public.blob.vercel-storage.com.evil.example/app.apk',
    'https://user:password@test.public.blob.vercel-storage.com/app.apk']) {
    assert.equal(parseAndroidRelease({ ...release, downloadUrl }), null);
  }
});
