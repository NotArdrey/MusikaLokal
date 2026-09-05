const assert = require('node:assert/strict');
const { test } = require('node:test');

const project = 'https://test.supabase.co';
const url = (path, bucket = 'listings', mode = 'public') =>
  `${project}/storage/v1/object/${mode}/${bucket}/${path}`;

for (const app of ['mobile', 'web']) {
  const { cleanupRemovedStorageObjects } = require(`../${app}/src/utils/storageCleanup.ts`);
  const mock = (remove) => ({ storage: { from: (bucket) => ({ remove: (paths) => remove(bucket, paths) }) } });

  test(`${app}: cleanup decodes paths, deduplicates signed/public URLs and groups buckets`, async () => {
    const calls = [];
    const result = await cleanupRemovedStorageObjects(mock(async (bucket, paths) => {
      calls.push({ bucket, paths });
      return { data: paths, error: null };
    }), project, [
      url('owner/photo%20one.jpg'), url('owner/photo%20one.jpg', 'listings', 'sign') + '?token=abc',
      url('owner/permit%23one.pdf', 'documents', 'authenticated'),
      'https://external.example/storage/v1/object/public/listings/keep.jpg',
      url('bad%ZZ'), 'not-a-storage-url',
    ]);
    assert.deepEqual(calls, [
      { bucket: 'listings', paths: ['owner/photo one.jpg'] },
      { bucket: 'documents', paths: ['owner/permit#one.pdf'] },
    ]);
    assert.deepEqual(result, { deletedObjects: 2, errors: [] });
  });

  test(`${app}: cleanup reports API and network failures without throwing or skipping later buckets`, async () => {
    const result = await cleanupRemovedStorageObjects(mock(async (bucket, paths) => {
      if (bucket === 'listings') return { data: null, error: { message: 'permission denied' } };
      if (bucket === 'documents') throw new Error('network unavailable');
      return { data: paths, error: null };
    }), project, [url('old.jpg'), url('old.pdf', 'documents'), url('old.png', 'avatars')]);
    assert.equal(result.deletedObjects, 1);
    assert.deepEqual(result.errors, ['listings: permission denied', 'documents: network unavailable']);
  });

  test(`${app}: cleanup batches objects and empty removal lists do nothing`, async () => {
    const sizes = [];
    const client = mock(async (_bucket, paths) => {
      sizes.push(paths.length);
      return { data: paths, error: null };
    });
    assert.deepEqual(await cleanupRemovedStorageObjects(client, project, []), { deletedObjects: 0, errors: [] });
    const result = await cleanupRemovedStorageObjects(client, project,
      Array.from({ length: 205 }, (_, i) => url(`owner/${i}.jpg`)));
    assert.deepEqual(sizes, [100, 100, 5]);
    assert.equal(result.deletedObjects, 205);
  });
}
