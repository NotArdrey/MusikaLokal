import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const bucket = 'android-releases';
const contentType = 'application/vnd.android.package-archive';

export async function getAndroidReleaseStorage() {
  dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
  const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!url || new URL(url).origin !== 'https://aefldxegsvzecshlayza.supabase.co') {
    throw new Error('APK publishing requires the MusikaLokal Supabase project URL.');
  }
  let key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key && process.env.SUPABASE_ACCESS_TOKEN) {
    const response = await fetch('https://api.supabase.com/v1/projects/aefldxegsvzecshlayza/api-keys', {
      headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Cannot retrieve server-side upload credentials (${response.status}).`);
    const keys = await response.json();
    key = keys.find((entry) => entry.name === 'service_role')?.api_key
      || keys.find((entry) => entry.type === 'secret')?.api_key;
  }
  if (!key) throw new Error('Set a server-only Supabase secret/service-role key or SUPABASE_ACCESS_TOKEN before publishing.');
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(300000) }) },
  });
  return client.storage.from(bucket);
}

export async function verifyAndroidApkDownload(downloadUrl, metadata) {
  const response = await fetch(downloadUrl, { signal: AbortSignal.timeout(300000) });
  if (!response.ok || !response.body) throw new Error(`APK download verification failed (${response.status}).`);
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of response.body) {
    hash.update(chunk);
    size += chunk.length;
  }
  if (size !== metadata.sizeBytes || hash.digest('hex') !== metadata.sha256) {
    throw new Error('Published APK does not match the verified build size/checksum.');
  }
}

export async function uploadAndroidApk(apkPath, metadata) {
  const bytes = await readFile(apkPath);
  if (bytes.length !== metadata.sizeBytes || createHash('sha256').update(bytes).digest('hex') !== metadata.sha256) {
    throw new Error('APK does not match its build metadata.');
  }
  const storage = await getAndroidReleaseStorage();
  const pathname = `android/testing/${metadata.sha256}/musikalokal-testing.apk`;
  const { error } = await storage.upload(pathname, bytes, { contentType, cacheControl: '31536000', upsert: false });
  if (error && error.statusCode !== '409' && error.statusCode !== 409) throw error;
  const { data } = storage.getPublicUrl(pathname, { download: 'MusikaLokal.apk' });
  // Verify the complete public file before publishing or reusing an immutable path.
  await verifyAndroidApkDownload(data.publicUrl, metadata);
  return data.publicUrl;
}
