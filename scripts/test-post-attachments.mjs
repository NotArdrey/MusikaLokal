import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const read = file => readFileSync(file, 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
function initializer(file, name) {
  const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let result;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) result = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(result, name); return result;
}
function evaluate(file, name, scope) {
  return vm.runInNewContext(compile(`(${initializer(file, name)})`), scope);
}
const resolveUrl = value => typeof value === 'string' ? value.trim() : '';
const feedFile = 'mobile/app/(tabs)/feed.tsx';
function normalizer(workspace) {
  const exports = {};
  vm.runInNewContext(compile(read(`${workspace}/src/utils/postMedia.ts`)), { exports });
  return exports.normalizePostMedia;
}
const noAttachment = {
  id: 'text-only', content: 'A text-only announcement', post_type: 'Post', type: 'Post',
  author: { full_name: 'Neil', avatar_url: 'https://fixture.invalid/avatar.png' },
  image: 'https://fixture.invalid/avatar.png', images: ['https://fixture.invalid/stock.jpg'],
  image_url: 'https://fixture.invalid/stock.jpg', thumbnail_url: 'https://fixture.invalid/stock.jpg',
  media: [],
};

for (const workspace of ['mobile', 'web']) {
  test(`${workspace}: empty attachments stay empty despite stale image, stock-photo, and avatar fields`, () => {
    const normalizePostMedia = normalizer(workspace);
    for (const post of [noAttachment, { ...noAttachment, media: undefined },
      { ...noAttachment, media: [null, {}, { url: '' }] },
      { ...noAttachment, media: [], post_media: [{ url: 'https://fixture.invalid/stale.jpg' }] }]) {
      assert.equal(normalizePostMedia(post, resolveUrl).length, 0);
    }
    const attachments = normalizePostMedia({ media: [
      { id: 'video', storage_path: 'neil/video.mp4', thumbnail_path: 'neil/thumbnail.jpg', display_order: 2 },
      { id: 'photo', storage_path: 'neil/photo.jpg', display_order: 1 },
    ] }, resolveUrl);
    assert.deepEqual(Array.from(attachments, media => media.id), ['photo', 'video']);
    assert.equal(attachments[1].url, 'neil/video.mp4');
    assert.equal(attachments[1].thumbnail_url, 'neil/thumbnail.jpg');
    assert.equal(normalizePostMedia({ post_media: [{ public_url: 'attached.jpg' }] }, resolveUrl)[0].url, 'attached.jpg');
  });
}

test('feed post normalization and gallery preserve text-only posts while listing cards retain their image fallbacks', () => {
  const normalizePostMedia = normalizer('mobile');
  const normalizeFeedPost = evaluate(feedFile, 'normalizeFeedPost', { normalizePostMedia, resolveFeedMediaUrl: resolveUrl });
  const getFeedMediaUrls = evaluate(feedFile, 'getFeedMediaUrls', { resolveFeedMediaUrl: resolveUrl });
  const ensureFeedCardImage = evaluate(feedFile, 'ensureFeedCardImage', {
    normalizeFeedPost, getFeedFallbackImage: () => 'listing-fallback.jpg',
  });
  for (const post of [noAttachment, { ...noAttachment, __feedKind: 'ai_card' }]) {
    const normalized = normalizeFeedPost(post);
    assert.equal(normalized.image, null);
    assert.equal(normalized.images.length, 0);
    assert.equal(normalized.author_avatar, 'https://fixture.invalid/avatar.png');
    assert.equal(getFeedMediaUrls(normalized).length, 0);
    assert.equal(getFeedMediaUrls(post).length, 0, 'old cached post fields cannot populate a gallery');
    assert.equal(ensureFeedCardImage(post).image, null);
  }
  const imagePost = normalizeFeedPost({ ...noAttachment, media: [{ url: 'attached.jpg', media_type: 'image' }] });
  assert.deepEqual(Array.from(getFeedMediaUrls(imagePost)), ['attached.jpg']);
  const listing = ensureFeedCardImage({ id: 'listing', type: 'Group', images: [] });
  assert.equal(listing.image, 'listing-fallback.jpg');
  assert.deepEqual(Array.from(getFeedMediaUrls(listing)), ['listing-fallback.jpg']);
});

test('both post-details viewers use attached media exclusively', () => {
  const mobile = evaluate('mobile/src/components/PostDetailsModal.tsx', 'normalizePostDetailsPayload', {
    normalizeCommentPayload: item => item, normalizePostMedia: normalizer('mobile'), resolvePostMediaUrl: resolveUrl,
  });
  const web = evaluate('web/src/components/PostDetailsModal.tsx', 'normalizePostMediaItems', {
    normalizePostMedia: normalizer('web'), resolvePostMediaUrl: resolveUrl,
  });
  assert.equal(mobile(noAttachment).post.media.length, 0);
  assert.equal(web(noAttachment).length, 0);
  const attached = { ...noAttachment, media: [{ storage_path: 'attached.jpg' }] };
  assert.equal(mobile(attached).post.media[0].url, 'attached.jpg');
  assert.equal(web(attached)[0].url, 'attached.jpg');
});

for (const workspace of ['mobile', 'web']) {
  test(`${workspace}: Home backend never substitutes the post author avatar for empty attachments`, async () => {
    const exports = {};
    const client = { from(table) {
      const query = new Proxy({}, { get(_, method) {
        if (method === 'then') return resolve => resolve({ data: table === 'feed_posts' ? [
          { ...noAttachment, author: { ...noAttachment.author, is_verified: true, verification_status: 'APPROVED' } },
        ] : [], error: null });
        return () => query;
      } }); return query;
    }, rpc: async () => ({ data: [], error: null }) };
    vm.runInNewContext(compile(read(`${workspace}/supabase/functions/home-feed/index.ts`)) + '\nexports.fetchCandidates = fetchCandidates;', {
      exports, require: name => name.includes('/http/') ? { serve() {} } : { createClient: () => client },
      console, Deno: { env: { get: () => '' } },
    });
    const posts = (await exports.fetchCandidates(client, true)).filter(item => item.type === 'Post');
    assert.equal(posts.length, 1);
    assert.equal(posts[0].image, null);
    assert.equal(posts[0].images.length, 0);
    assert.equal(posts[0].media.length, 0);
    assert.equal(posts[0].author.avatar_url, 'https://fixture.invalid/avatar.png');
  });
}

test('successful submissions clear composer attachments while saving, the next text post has no media, and cancellation clears drafts', async () => {
  const requests = [], removed = [];
  const scope = {
    useCallback: fn => fn, postMutationInFlightRef: { current: false }, canCreatePosts: true,
    postBody: 'A photo post', postVisibility: 'public', editingPost: null,
    composerMediaDirty: false, postMedia: [{ id: 'draft-photo', uri: 'file:///photo.jpg' }],
    creating: false, mediaBusy: false, showCreate: true,
    normalizeVisibleInput: value => value.trim(),
    uploadComposerMedia: async () => [{ storage_path: 'neil/photo.jpg' }],
    clearComposerFocusTimer() {}, Keyboard: { dismiss() {} }, emitToast() {}, ensureFeedFresh() {},
    removePersistedUploadAsset: async item => removed.push(item.id),
    normalizeFeedPost: post => post, dedupeFeedItems: items => items, sortFeedItemsNewestFirst: items => items,
    queryClient: { setQueriesData() {} },
    feedCacheRef: { current: Object.fromEntries(['for_you', 'latest', 'following', 'talent'].map(tab => [tab, { posts: [] }])) },
    setPosts() {}, setAlert(value) { throw new Error(JSON.stringify(value)); },
    setCreating(value) { scope.creating = value; }, setEditingPost(value) { scope.editingPost = value; },
    setPostBody(value) { scope.postBody = value; }, setPostVisibility(value) { scope.postVisibility = value; },
    setPostMedia(value) { scope.postMedia = typeof value === 'function' ? value(scope.postMedia) : value; },
    setShowCreate(value) { scope.showCreate = value; }, setComposerMediaDirty() {}, setMediaStatus() {},
    supabase: { functions: { async invoke(_, { body }) {
      requests.push(body); return { data: { success: true, data: { id: 'saved-' + requests.length, content: body.content } }, error: null };
    } } },
  };
  const context = vm.createContext(scope);
  for (const name of ['resetComposer', 'dismissComposer', 'handleComposerClose', 'handleCreatePost']) {
    scope[name] = vm.runInContext(compile(`(${initializer(feedFile, name)})`), context);
  }
  await scope.handleCreatePost();
  assert.equal(scope.showCreate, false);
  assert.equal(scope.postMedia.length, 0);
  assert.equal(scope.postBody, '');
  assert.equal(scope.creating, false);
  assert.deepEqual(removed, ['draft-photo']);
  scope.postBody = 'A text-only follow-up'; scope.showCreate = true;
  await scope.handleCreatePost();
  assert.equal(requests[1].media.length, 0);
  scope.postMedia = [{ id: 'cancelled-draft' }, { id: 'saved-photo', existing: true }];
  scope.showCreate = true;
  scope.handleComposerClose();
  assert.equal(scope.postMedia.length, 0);
  assert.equal(scope.showCreate, false);
  assert.deepEqual(removed, ['draft-photo', 'cancelled-draft']);
  scope.creating = true; scope.showCreate = true; scope.postMedia = [{ id: 'in-flight' }];
  scope.handleComposerClose();
  assert.equal(scope.postMedia.length, 1, 'manual close cannot discard media while submission is pending');
});
