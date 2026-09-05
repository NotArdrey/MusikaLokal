// Integration smoke test. Creates one tiny, unreferenced PNG per image bucket,
// exercises native-style HTTP upload plus SDK overwrite/download/removal, and
// deletes only those exact test paths. Uses service-role access; RLS ownership
// is tested separately by test-media-storage-policies.sql.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const envPath = fileURLToPath(new URL('../.env', import.meta.url));
  if (existsSync(envPath)) process.loadEnvFile(envPath);
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  assert(projectRef && projectUrl && (accessToken || process.env.SUPABASE_SERVICE_ROLE_KEY), 'Supabase environment is missing');
  assert.equal(new URL(projectUrl).hostname, `${projectRef}.supabase.co`, 'Project configuration mismatch');

  let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    const keyResponse = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert(keyResponse.ok, `Cannot obtain test credentials: HTTP ${keyResponse.status}. No test files were created.`);
    const keys = await keyResponse.json();
    serviceKey = keys.find((key) => key.name === 'service_role')?.api_key;
  }
  assert(serviceKey, 'Service-role test credential unavailable');
  const client = createClient(projectUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const buckets = ['avatars', 'portfolio', 'listings', 'documents', 'chat-attachments', 'identity-manual', 'post-media', 'playlist-assets'];
  const prefix = `__picture_upload_check/${randomUUID()}/`;
  const path = `${prefix}picture.png`;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const failures = [];

  for (const bucket of buckets) {
    try {
      const uploaded = await fetch(`${projectUrl}/storage/v1/object/${bucket}/${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`, apikey: serviceKey,
          'Content-Type': 'image/png', 'x-upsert': 'false',
        },
        body: png,
      });
      assert(uploaded.ok, `HTTP upload failed: ${uploaded.status}`);
      const overwritten = await client.storage.from(bucket).upload(path, png, { contentType: 'image/png', upsert: true });
      if (overwritten.error) throw overwritten.error;
      const downloaded = await client.storage.from(bucket).download(path);
      if (downloaded.error) throw downloaded.error;
      assert.deepEqual(Buffer.from(await downloaded.data.arrayBuffer()), png, 'Downloaded image differs');
      console.log(`PASS ${bucket}: upload, overwrite, image download`);
    } catch (error) {
      failures.push(`${bucket}: ${error.message}`);
    } finally {
      assert(path.startsWith(prefix), 'Refusing cleanup outside test prefix');
      const removed = await client.storage.from(bucket).remove([path]);
      if (removed.error) failures.push(`${bucket}: test file cleanup failed: ${removed.error.message}`);
      else {
        const remaining = await client.storage.from(bucket).list(prefix.slice(0, -1));
        if (remaining.error || remaining.data.some((item) => item.name === 'picture.png')) {
          failures.push(`${bucket}: could not verify test file removal at ${path}`);
        } else console.log(`PASS ${bucket}: test file removed`);
      }
    }
  }

  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  } else console.log(`All ${buckets.length} image buckets passed; no test files remain.`);

}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
