import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { root, loadSource, hookHarness, fakeClock, settle, storageMock,
  extractExpression, evaluate } from './helpers/performance-runtime.mjs';

const requireMobile = createRequire(resolve(root, 'mobile/package.json'));
const core = requireMobile('@tanstack/query-core');
const measurements = {};
const plain = value => JSON.parse(JSON.stringify(value));

for (const workspace of ['mobile', 'web']) {
  test(`${workspace}: image failures stop, duplicate errors are ignored, and a new URL can load`, async () => {
    const harness = hookHarness();
    const loaded = loadSource(`${workspace}/src/components/CachedImage.tsx`, {
      react: harness.react, 'expo-image': { Image: 'Image' },
      'react-native': { StyleSheet: { flatten: value => value || {} } },
    });
    const component = loaded.exports.default;
    const props = { uri: 'https://example.invalid/original.jpg', fallbackUri: 'https://example.invalid/fallback.jpg' };
    harness.render(component, props);
    let view = await harness.flush();
    const originalError = view.props.onError;
    originalError();
    view = await harness.flush();
    assert.equal(view.props.source.uri, props.fallbackUri);
    originalError();
    view = await harness.flush();
    assert.equal(view.props.source.uri, props.fallbackUri);
    view.props.onError();
    assert.equal(await harness.flush(), null);
    harness.render(component, { ...props, uri: 'https://example.invalid/new.jpg' });
    view = await harness.flush();
    assert.equal(view.props.source.uri, 'https://example.invalid/new.jpg');
    originalError();
    assert.equal((await harness.flush()).props.source.uri, 'https://example.invalid/new.jpg');
    harness.unmount();
    measurements[`${workspace}ImageFailureAttempts`] = 2;
  });
}

test('detail caches evict older entries and expire without being reread individually', async () => {
  const clock = fakeClock();
  const loaded = loadSource('mobile/src/utils/listingDetailsCache.ts', {}, clock.globals);
  for (let index = 0; index < 1000; index++) loaded.exports.setListingDetailsCacheEntry(String(index), {
    data: { id: index }, existingBookings: [], fetchedAt: clock.globals.Date.now(),
  });
  const cache = loaded.context;
  const size = evaluate('listingDetailsCache.size', cache);
  assert.equal(size, 40);
  assert.equal(loaded.exports.getListingDetailsCacheEntry('0'), null);
  assert.equal(loaded.exports.getListingDetailsCacheEntry('999').data.id, 999);
  await clock.advance(60_001);
  assert.equal(evaluate('listingDetailsCache.size', cache), 0);
  measurements.listingCache = { distinctEntries: 1000, maximumRetained: size, retainedAfterExpiry: 0 };
});

test('cache reads promote a useful entry and do not refresh its expiry', async () => {
  const clock = fakeClock();
  const { BoundedCache } = loadSource('mobile/src/utils/BoundedCache.ts', {}, clock.globals).exports;
  const cache = new BoundedCache(2, 1000);
  cache.set('a', 1).set('b', 2);
  assert.equal(cache.get('a'), 1);
  cache.set('c', 3);
  assert.equal(cache.has('b'), false);
  assert.equal(cache.get('a'), 1);
  await clock.advance(1001);
  assert.equal(cache.size, 0);
});

test('admin session caches stay bounded without removing login/session storage', () => {
  const data = new Map([['login-session', 'preserve']]);
  const sessionStorage = {
    get length() { return data.size; },
    key: index => [...data.keys()][index] ?? null,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: key => { data.delete(key); },
  };
  const loaded = loadSource('web/src/admin/cache.ts', {}, { window: { sessionStorage } });
  for (let index = 0; index < 300; index++) loaded.exports.writeAdminPageCache(`page:${index}`, { index });
  assert.equal(evaluate('memoryCache.size', loaded.context), 40);
  assert.equal(data.size, 41);
  assert.equal(data.get('login-session'), 'preserve');
  assert.equal(loaded.exports.readAdminPageCache('page:299', 60_000).index, 299);
});

test('screen cache stays bounded under concurrent writes and preserves unrelated storage', async () => {
  const clock = fakeClock();
  const storage = storageMock([['auth-token', 'preserve'], ['saved-upload', 'preserve']]);
  const loaded = loadSource('mobile/src/utils/screenCache.ts', {
    '@react-native-async-storage/async-storage': storage.api,
  }, clock.globals);
  await Promise.all(Array.from({ length: 300 }, (_, index) =>
    loaded.exports.writeScreenCache(`chat:${index}`, [{ id: index }])));
  assert.equal(evaluate('memoryCache.size', loaded.context), 40);
  assert.equal(storage.data.size, 82);
  assert.equal((await loaded.exports.readScreenCache('chat:299', 60_000))[0].id, 299);
  await clock.advance(24 * 60 * 60_000);
  assert.equal(await loaded.exports.readScreenCache('chat:299', 60_000), null);
  assert.equal(evaluate('memoryCache.size', loaded.context), 0);
  assert.equal(storage.data.size, 2);
  assert.equal(storage.data.get('auth-token'), 'preserve');
  assert.equal(storage.data.get('saved-upload'), 'preserve');
  measurements.screenCache = { distinctKeys: 300, maximumMemoryEntries: 40, maximumStorageEntries: 80,
    retainedAfterExpiry: 0, unrelatedStoragePreserved: true };
});

test('oversized/corrupt legacy caches and write failures remain disposable', async () => {
  const storage = storageMock([
    ['mobile-screen-cache:v1:corrupt', '{'],
    ['mobile-screen-cache:v1:oversized', 'x'.repeat(300_000)],
    ['auth-token', 'preserve'],
  ]);
  const loaded = loadSource('mobile/src/utils/screenCache.ts', {
    '@react-native-async-storage/async-storage': storage.api,
  });
  assert.equal(await loaded.exports.readScreenCache('missing', 60_000), null);
  assert.equal(storage.data.size, 1);
  await loaded.exports.writeScreenCache('large', 'x'.repeat(300_000));
  assert.equal(await loaded.exports.readScreenCache('large', 60_000), null);
  storage.api.setItem = async () => { throw new Error('Storage unavailable'); };
  await assert.doesNotReject(loaded.exports.writeScreenCache('small', { ok: true }));
  assert.equal(loaded.exports.peekScreenCache('small', 60_000).ok, true);
});

test('invalidation cannot be undone by a delayed storage restore', async () => {
  const storage = storageMock();
  const loaded = loadSource('mobile/src/utils/screenCache.ts', {
    '@react-native-async-storage/async-storage': storage.api,
  });
  await loaded.exports.writeScreenCache('chat:old', { old: true });
  evaluate('memoryCache.clear()', loaded.context);
  const originalGet = storage.api.getItem;
  let complete;
  storage.api.getItem = async key => {
    const value = await originalGet(key);
    await new Promise(finish => { complete = finish; });
    return value;
  };
  const restore = loaded.exports.readScreenCache('chat:old', 60_000);
  await settle();
  const invalidate = loaded.exports.invalidateScreenCache('chat:');
  complete();
  assert.equal(await restore, null);
  await invalidate;
  assert.equal(loaded.exports.peekScreenCache('chat:old', 60_000), null);
  assert.equal(storage.data.size, 0);
});

test('public persisted queries have page, entry and payload limits without mutating live data', () => {
  let persisterOptions;
  const loaded = loadSource('mobile/src/data/queryClient.ts', {
    '@react-native-async-storage/async-storage': {},
    '@tanstack/query-async-storage-persister': { createAsyncStoragePersister: options => { persisterOptions = options; return {}; } },
    '@tanstack/react-query': { QueryClient: core.QueryClient, focusManager: { setEventListener() {} } },
    'react-native': { AppState: {} },
  });
  const client = { timestamp: 1, buster: 'fixture', clientState: { mutations: [], queries:
    Array.from({ length: 100 }, (_, index) => ({ queryKey: ['search', index], state: {
      dataUpdatedAt: index, data: { pages: Array.from({ length: 50 }, () => ['synthetic']),
        pageParams: Array.from({ length: 50 }, (_, page) => page) },
    } })) } };
  const saved = JSON.parse(persisterOptions.serialize(client));
  assert.equal(saved.clientState.queries.length, 40);
  assert.equal(saved.clientState.queries[0].queryKey[1], 99);
  assert.equal(saved.clientState.queries[0].state.data.pages.length, 3);
  assert.equal(client.clientState.queries[0].state.data.pages.length, 50);
  client.clientState.queries[99].state.data = 'x'.repeat(1_100_000);
  assert.ok(persisterOptions.serialize(client).length < 1_010_000);
  loaded.exports.queryClient.clear();
  measurements.persistedQueries = { maximumQueries: 40, maximumPagesPerQuery: 3, characterBudget: 1_000_000 };
});

test('a 50-page feed refresh uses one request, keeps failures intact and continues pagination', async () => {
  const client = new core.QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  let requests = 0;
  let fail = false;
  const loaded = loadSource('mobile/src/data/hooks.ts', {
    '@tanstack/react-query': { keepPreviousData: data => data, useQueryClient: () => client,
      useInfiniteQuery: options => options, useQuery: options => options },
    './api': { async invokeEdgeFunction(_name, { body, signal }) {
      assert.ok(signal instanceof AbortSignal);
      requests++;
      if (fail) throw new Error('Network unavailable');
      const page = Number(body.cursor) || 0;
      return { items: Array.from({ length: 12 }, (_, index) => ({ id: `${page}:${index}` })), nextCursor: String(page + 1) };
    } },
    '../utils/loadTimeLogger': { logLoadTime() {} },
  });
  const params = { enabled: false, feedTab: 'for_you', feedType: 'for_you', limit: 12, userId: 'fixture' };
  const options = loaded.exports.feedQueryOptions(params);
  const observer = new core.InfiniteQueryObserver(client, options);
  const unsubscribe = observer.subscribe(() => {});
  await observer.refetch();
  for (let page = 1; page < 50; page++) await observer.fetchNextPage();
  const oldData = client.getQueryData(options.queryKey);
  assert.equal(oldData.pages.length, 50);
  const query = loaded.exports.useFeedQuery(params);
  requests = 0; fail = true;
  const failed = await query.refreshFirstPage();
  assert.ok(failed.error);
  assert.equal(client.getQueryData(options.queryKey), oldData);
  assert.equal(requests, 1);
  requests = 0; fail = false;
  const fresh = await query.refreshFirstPage();
  assert.equal(fresh.error, null);
  assert.equal(fresh.data.pages.length, 1);
  assert.equal(requests, 1);
  await observer.fetchNextPage();
  assert.equal(observer.getCurrentResult().data.pages.length, 2);
  assert.equal(new Set(observer.getCurrentResult().data.pages.flatMap(page => page.items.map(item => item.id))).size, 24);
  unsubscribe(); observer.destroy(); client.clear();
  measurements.feed = { previouslyLoadedPages: 50, refreshRequests: 1, retainedPagesAfterRefresh: 1,
    paginationContinues: true, failedRefreshPreservesData: true };
});

test('frozen inactive queries become stale without fetching and refresh when reentered', async () => {
  const client = new core.QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  let requests = 0;
  const focus = { current: true };
  const loaded = loadSource('mobile/src/data/hooks.ts', {
    '@tanstack/react-query': { keepPreviousData: data => data, useQuery: options => options },
    './api': { invokeEdgeFunction: async () => { requests++; return { bookings: [] }; } },
    '../utils/loadTimeLogger': { logLoadTime() {} },
  });
  const options = loaded.exports.useBookingsSummaryQuery('fixture', { focused: focus });
  const observer = new core.QueryObserver(client, options);
  const unsubscribe = observer.subscribe(() => {});
  await settle();
  requests = 0; focus.current = false;
  await client.invalidateQueries({ queryKey: options.queryKey });
  assert.equal(requests, 0);
  assert.equal(client.getQueryState(options.queryKey).isInvalidated, true);
  focus.current = true;
  await observer.refetch();
  assert.equal(requests, 1);
  unsubscribe(); observer.destroy(); client.clear();
  measurements.inactiveBookingRefreshes = 0;
});

test('refresh event bursts coalesce, wait for running requests and stop after cleanup', async () => {
  const clock = fakeClock();
  const loaded = loadSource('mobile/src/utils/refreshScheduler.ts', {}, clock.globals);
  let complete;
  let calls = 0;
  const refresh = loaded.exports.createRefreshScheduler(async () => {
    calls++;
    if (calls === 1) await new Promise(finish => { complete = finish; });
  });
  for (let index = 0; index < 100; index++) refresh.schedule();
  await clock.advance(300);
  assert.equal(calls, 1);
  for (let index = 0; index < 100; index++) refresh.schedule();
  await clock.advance(300);
  assert.equal(calls, 1);
  complete(); await settle(); await clock.advance(300);
  assert.equal(calls, 2);
  refresh.schedule(); refresh.cancel(); await clock.advance(300);
  assert.equal(calls, 2);
});

test('header listeners clean up on blur, coalesce messages and ignore late auth completion', async () => {
  const file = 'mobile/src/components/header.tsx';
  const callback = extractExpression(file, node => ts.isVariableDeclaration(node) && node.name.getText() === 'checkUnreadChats');
  const effect = extractExpression(file, node => ts.isCallExpression(node) &&
    node.expression.getText() === 'useFocusEffect' && node.getText().includes('header-messages:'));
  const clock = fakeClock();
  const channels = new Set();
  let reads = 0;
  const globals = { ...clock.globals, userId: 'fixture', isFan: false, isGuest: false,
    unreadChatRequestRef: { current: 0 }, setChatUnreadState() {}, checkUnreadNotifications() {},
    AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    runAfterUIIdle: callback => { callback(); return { cancel() {} }; },
    prepareRealtimeAuth: async () => true, createRealtimeChannelTopic: name => name,
    supabase: {
      from(table) {
        reads++;
        const response = table === 'conversation_participants' ? { data: [{ conversation_id: 'fixture' }] } : { count: 1 };
        const chain = { select() { return chain; }, eq() { return chain; }, in() { return chain; },
          neq() { return chain; }, is() { return chain; }, then(finish) { return Promise.resolve(response).then(finish); } };
        return chain;
      },
      channel() {
        const channel = { on(_kind, _filter, handler) { channel.handler = handler; return channel; },
          subscribe() { channels.add(channel); return channel; } };
        return channel;
      }, removeChannel: channel => { channels.delete(channel); },
    },
  };
  globals.checkUnreadChats = evaluate(callback.node.initializer.arguments[0].getText(callback.source), globals);
  const mount = evaluate(effect.node.arguments[0].arguments[0].getText(effect.source), globals);
  const cleanup = mount(); await settle(); reads = 0;
  for (let index = 0; index < 100; index++) [...channels][0].handler();
  await clock.advance(300);
  assert.equal(reads, 2);
  assert.equal(channels.size, 1);
  cleanup(); assert.equal(channels.size, 0);
  let authComplete;
  globals.prepareRealtimeAuth = () => new Promise(finish => { authComplete = finish; });
  const delayedMount = evaluate(effect.node.arguments[0].arguments[0].getText(effect.source), globals);
  const delayedCleanup = delayedMount(); delayedCleanup(); authComplete(true); await settle();
  assert.equal(channels.size, 0);
  measurements.header = { messageEvents: 100, readsForBatch: 2, activeChannels: 1, remainingAfterBlur: 0 };
});

function chatBackend(count = 150) {
  const channels = new Set();
  const requests = [];
  let gate = null;
  const uuid = index => `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
  const rows = Array.from({ length: count }, (_, index) => ({ id: uuid(index + 1),
    conversation_id: 'conversation-a', sender_id: 'sender', created_at: '2026-10-07T00:00:00.123456+00:00',
    content: `message ${index + 1}`, message_type: 'text', read_at: null,
    sender: { id: 'sender', full_name: 'Fixture', avatar_url: null }, reactions: [] }));
  const api = {
    from(table) {
      const request = { table, equal: {}, order: [], limit: null, before: null, signal: null };
      const chain = {
        select() { return chain; }, eq(key, value) { request.equal[key] = value; return chain; },
        order(key, options) { request.order.push({ key, ...options }); return chain; },
        limit(value) { request.limit = value; return chain; },
        or(filter) { request.before = filter.match(/id\.lt\.([0-9a-f-]+)/i)?.[1]; return chain; },
        abortSignal(signal) { request.signal = signal; return chain; },
        async single() { return { data: { id: request.equal.id, full_name: 'Fixture' } }; },
        async then(finish, reject) {
          requests.push(request);
          const wait = gate; gate = null;
          if (wait) await wait;
          const data = rows.filter(row => row.conversation_id === request.equal.conversation_id &&
            (!request.before || row.id < request.before)).sort((left, right) => right.id.localeCompare(left.id))
            .slice(0, request.limit ?? rows.length);
          return Promise.resolve({ data }).then(finish, reject);
        },
      };
      return chain;
    },
    channel() {
      const channel = { handlers: [], on(_kind, filter, handler) { channel.handlers.push({ filter, handler }); return channel; },
        subscribe() { channels.add(channel); return channel; } };
      return channel;
    },
    removeChannel: channel => { channels.delete(channel); },
  };
  return { api, rows, requests, channels, uuid,
    pauseNext() { let finish; gate = new Promise(resolveGate => { finish = resolveGate; }); return () => finish(); },
  };
}

test('chat keyset pages retrieve every same-timestamp message without gaps or duplicates', async () => {
  const backend = chatBackend();
  const loaded = loadSource('mobile/src/data/chatMessages.ts', { '../../lib/supabase': { supabase: backend.api } });
  let before = null;
  const ids = [];
  let hasMore = true;
  while (hasMore) {
    const page = await loaded.exports.fetchChatMessagesPage('conversation-a', before);
    assert.ok(page.messages.length <= 50);
    ids.push(...page.messages.map(message => message.id));
    before = page.oldest; hasMore = page.hasMore;
  }
  assert.equal(ids.length, 150);
  assert.equal(new Set(ids).size, 150);
  assert.equal(backend.requests.length, 3);
  assert.ok(backend.requests.every(request => request.limit === 51 && request.equal.conversation_id === 'conversation-a'));
  await assert.rejects(loaded.exports.fetchChatMessagesPage('conversation-a', { id: 'bad', created_at: 'bad' }));
  measurements.chatPagination = { totalMessages: 150, initialMessages: 50, pages: 3, uniqueMessages: 150 };
});

function chatHarness(backend, clock, cachedMessages = null) {
  const harness = hookHarness();
  const writes = [];
  const loaded = loadSource('mobile/src/hooks/useChat.ts', {
    react: harness.react, 'expo-router': harness.navigation,
    '../../lib/supabase': { supabase: backend.api },
    '../events/toastBus': { emitToast() {} },
    '../utils/screenCache': { getScreenCacheKey: (scope, params) => `${scope}:${JSON.stringify(params)}`,
      readScreenCache: async () => cachedMessages,
      writeScreenCache: async (key, messages) => { writes.push({ key, messages: plain(messages) }); } },
  }, clock.globals);
  return { harness, writes, hook: loaded.exports.useChat };
}

test('chat preserves PostgreSQL sub-millisecond ordering and moves retried messages correctly', () => {
  const loaded = loadSource('mobile/src/hooks/useChat.ts', {
    react: {}, 'expo-router': {}, '../../lib/supabase': {}, '../events/toastBus': {}, '../utils/screenCache': {},
  });
  const sort = evaluate('sortMessagesChronologically', loaded.context);
  const upsert = evaluate('upsertMessage', loaded.context);
  const later = { id: 'a', created_at: '2026-10-07T00:00:00.123999Z' };
  const earlier = { id: 'z', created_at: '2026-10-07T00:00:00.123001Z' };
  assert.deepEqual(plain(sort([later, earlier])).map(message => message.id), ['z', 'a']);
  const appended = upsert([earlier, later], { id: 'm', created_at: '2026-10-07T00:00:00.123500Z' });
  assert.deepEqual(plain(appended).map(message => message.id), ['z', 'm', 'a']);
  const retried = upsert(appended, { ...earlier, created_at: '2026-10-07T00:00:01.000Z' });
  assert.deepEqual(plain(retried).map(message => message.id), ['m', 'a', 'z']);
});

test('chat batches cache writes for long histories and flushes only recent messages', async () => {
  const backend = chatBackend(1000);
  const clock = fakeClock();
  const { harness, writes, hook } = chatHarness(backend, clock);
  harness.render(hook, 'conversation-a', 'viewer-a');
  await harness.flush();
  assert.equal(harness.result.messages.length, 50);
  while (harness.result.hasOlderMessages) {
    await harness.result.loadOlderMessages(); await harness.flush();
  }
  assert.equal(harness.result.messages.length, 1000);
  assert.equal(writes.length, 0);
  await clock.advance(500); await harness.flush();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].messages.length, 50);
  const handler = [...backend.channels][0].handlers.find(entry => entry.filter.event === 'UPDATE').handler;
  for (let index = 0; index < 100; index++) handler({ new: { ...backend.rows[999], content: `updated ${index}` } });
  await harness.flush(); await clock.advance(500); await harness.flush();
  assert.equal(writes.length, 2);
  assert.equal(writes[1].messages.length, 50);
  assert.equal(writes[1].messages[49].content, 'updated 99');
  harness.unmount();
  measurements.chatCache = { loadedMessages: 1000, messagesPerWrite: 50, writesFor100Updates: 1 };
});

test('an older failed local message survives the recent-history cache window', async () => {
  const backend = chatBackend();
  const clock = fakeClock();
  const failed = { ...backend.rows[0], id: backend.uuid(0), sender_id: 'viewer-a',
    local_status: 'failed', local_error: 'Offline', content: 'Unsent fixture message' };
  const { harness, writes, hook } = chatHarness(backend, clock, [failed]);
  harness.render(hook, 'conversation-a', 'viewer-a'); await harness.flush();
  assert.equal(harness.result.messages.find(message => message.id === failed.id).local_status, 'failed');
  await clock.advance(500);
  assert.equal(writes[0].messages.length, 51);
  assert.equal(writes[0].messages.find(message => message.id === failed.id).content, failed.content);
  harness.unmount();
});

test('older-page races are cancelled on account/conversation changes and screen blur', async () => {
  const backend = chatBackend();
  const clock = fakeClock();
  const { harness, hook } = chatHarness(backend, clock);
  harness.render(hook, 'conversation-a', 'viewer-a'); await harness.flush();
  const finishOldPage = backend.pauseNext();
  const pending = harness.result.loadOlderMessages(); await settle();
  harness.render(hook, 'conversation-b', 'viewer-b'); await harness.flush();
  assert.equal(harness.result.messages.length, 0);
  finishOldPage(); await pending; await harness.flush();
  assert.equal(harness.result.messages.length, 0);
  assert.ok(backend.requests.find(request => request.before).signal.aborted);
  harness.render(hook, 'conversation-a', 'viewer-a'); await harness.flush();
  const finishBlurredPage = backend.pauseNext();
  const blurred = harness.result.loadOlderMessages(); await settle();
  harness.blur();
  assert.equal(backend.channels.size, 0);
  finishBlurredPage(); await blurred; await harness.flush();
  assert.equal(harness.result.messages.length, 50);
  harness.unmount();
});

test('personal realtime tables are filtered while public listing invalidation remains', async () => {
  const clock = fakeClock();
  const harness = hookHarness();
  const channels = new Set();
  const invalidated = [];
  const supabase = { channel() {
    const channel = { handlers: [], on(_kind, filter, handler) { channel.handlers.push({ filter, handler }); return channel; },
      subscribe(callback) { channels.add(channel); callback('SUBSCRIBED'); return channel; } }; return channel;
  }, removeChannel: channel => { channels.delete(channel); } };
  const loaded = loadSource('mobile/src/data/realtime.ts', {
    react: harness.react, 'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    '../../lib/supabase': { supabase, prepareRealtimeAuth: async () => true },
  }, clock.globals);
  harness.render(loaded.exports.useGlobalRealtimeInvalidation,
    { invalidateQueries: ({ queryKey }) => { invalidated.push(plain(queryKey)); } }, 'viewer-a');
  await harness.flush();
  const handlers = [...channels][0].handlers;
  for (const table of ['notifications', 'payout_methods', 'withdrawal_requests', 'studio_payment_events']) {
    assert.equal(handlers.find(entry => entry.filter.table === table).filter.filter, 'user_id=eq.viewer-a');
  }
  invalidated.length = 0;
  handlers.find(entry => entry.filter.table === 'gigs').handler({ new: { id: 'public-gig' } });
  await clock.advance(600);
  assert.ok(invalidated.some(([prefix]) => prefix === 'feed'));
  assert.ok(invalidated.some(([prefix]) => prefix === 'bookings'));
  harness.unmount(); assert.equal(channels.size, 0);
  measurements.filteredPersonalTables = 4;
});

after(() => {
  const sourceFiles = ['mobile/src/components/CachedImage.tsx', 'web/src/components/CachedImage.tsx',
    'mobile/src/utils/BoundedCache.ts', 'mobile/src/utils/listingDetailsCache.ts', 'mobile/src/utils/screenCache.ts',
    'mobile/src/data/hooks.ts', 'mobile/src/data/queryClient.ts', 'mobile/src/data/chatMessages.ts',
    'mobile/src/data/realtime.ts', 'mobile/src/hooks/useChat.ts', 'mobile/src/components/header.tsx',
    'mobile/src/hooks/useQueryScreenFocus.ts', 'mobile/src/utils/refreshScheduler.ts',
    'mobile/app/(tabs)/marketplace.tsx', 'mobile/app/(tabs)/bookings.tsx', 'mobile/app/(tabs)/feed.tsx'];
  const report = { date: '2026-10-07', timezone: 'Asia/Manila',
    scope: 'Offline source execution with mocked Supabase/storage and the installed query core. Native device profiling remains pending.',
    productionNetworkRequests: 0, measurements,
    sourceSha256: Object.fromEntries(sourceFiles.map(file => [file, createHash('sha256')
      .update(readFileSync(resolve(root, file))).digest('hex')])) };
  writeFileSync(resolve(root, 'docs/testing/session-performance-fixes-2026-10-07.json'), `${JSON.stringify(report, null, 2)}\n`);
});
