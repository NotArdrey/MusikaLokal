import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../web/supabase/functions/admin-social-feed-management/index.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source.replace(/import \{ createClient \}[^\n]+\n/, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function createHandler({ role = 'admin', validToken = true, posts = [], comments = [] } = {}) {
  const queries = [];
  let handler;
  const client = {
    auth: { getUser: async () => ({ data: { user: validToken ? { id: 'admin-id' } : null }, error: null }) },
    from(table) {
      const calls = [];
      queries.push({ table, calls });
      const query = new Proxy({}, {
        get(_target, key) {
          if (key === 'then') return resolve => resolve({ data: table === 'profiles' ? { role } : table === 'feed_posts' ? posts : comments, error: null });
          return (...args) => { calls.push([key, ...args]); return query; };
        },
      });
      return query;
    },
  };
  vm.runInNewContext(compiled, {
    createClient: () => client, Response, console,
    Deno: { env: { get: () => 'test-only' }, serve: value => { handler = value; } },
  });
  return { queries, invoke: body => handler(new Request('https://test.invalid', { method: 'POST', headers: { Authorization: 'Bearer fixture-token' }, body: JSON.stringify(body) })) };
}

test('admin posts return image/video attachments in display order and comment counts', async () => {
  const { invoke, queries } = createHandler({ posts: [{ id: 'post', content: 'A performance', author: { full_name: 'Artist' }, comment_count: 2, media: [{ id: 'video', display_order: 1 }, { id: 'image', display_order: 0 }] }] });
  const response = await invoke({ action: 'admin_list_posts' });
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.deepEqual(data[0].media.map(media => media.id), ['image', 'video']);
  assert.equal(data[0].comment_count, 2);
  const select = queries.find(query => query.table === 'feed_posts').calls.find(call => call[0] === 'select')[1];
  assert.match(select, /media:post_media/);
  assert.match(select, /storage_path, thumbnail_path/);
});

test('viewing a post includes approved and hidden comments, scoped and paginated', async () => {
  const rows = [{ id: 'visible', is_hidden: false }, { id: 'hidden', is_hidden: true }];
  const { invoke, queries } = createHandler({ comments: rows });
  const response = await invoke({ action: 'admin_list_comments', filter: 'all', post_id: 'post-123', offset: 50, limit: 50 });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data.map(comment => comment.id), ['visible', 'hidden']);
  const { calls } = queries.find(query => query.table === 'post_comments');
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'post_id' && call[2] === 'post-123'));
  assert.ok(calls.some(call => call[0] === 'range' && call[1] === 50 && call[2] === 99));
  assert.ok(!calls.some(call => call[0] === 'or' || (call[0] === 'eq' && call[1] === 'is_hidden')));
});

test('review queue retains its moderation filters and all-comments requires a post', async () => {
  const { invoke, queries } = createHandler();
  assert.equal((await invoke({ action: 'admin_list_comments', filter: 'all' })).status, 400);
  await invoke({ action: 'admin_list_comments', filter: 'review' });
  const { calls } = queries.find(query => query.table === 'post_comments');
  assert.ok(calls.some(call => call[0] === 'or' && call[1].includes('moderation_status.eq.pending_review')));
});

test('media and comments require a verified administrator', async () => {
  for (const body of [{ action: 'admin_list_posts' }, { action: 'admin_list_comments', filter: 'all', post_id: 'post' }]) {
    const forbidden = createHandler({ role: 'fan' });
    assert.equal((await forbidden.invoke(body)).status, 403);
    assert.ok(!forbidden.queries.some(query => query.table !== 'profiles'));
    assert.equal((await createHandler({ validToken: false }).invoke(body)).status, 401);
  }
});
