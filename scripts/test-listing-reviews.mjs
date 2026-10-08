import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const read = file => readFileSync(file, 'utf8');
const compile = file => ts.transpileModule(read(file), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));

test('the mobile detail query opts out of duplicate reviews without changing notification requests', async () => {
  const calls = [], exports = {};
  vm.runInNewContext(compile('mobile/src/data/hooks.ts'), {
    exports, require: name => name === '@tanstack/react-query'
      ? { useQuery: value => value, useInfiniteQuery: value => value }
      : name === './api' ? { invokeEdgeFunction: async (name, payload) => { calls.push({ name, ...payload }); } }
        : name === './queryKeys' ? { queryKeys: { details: { listing: () => [] }, notifications: { list: () => [] } } }
          : { logLoadTime() {} },
  });
  await exports.useListingDetailsQuery({ id: 'studio', type: 'Studio' }).queryFn();
  await exports.useNotificationsQuery('neil').queryFn({ pageParam: null });
  assert.equal(calls[0].name, 'manage-details');
  assert.equal(calls[0].body.includeReviews, false);
  assert.equal(calls[1].name, 'manage-notifications');
  assert.ok(!('includeReviews' in calls[1].body));
});

function fixture(workspace, initialType = 'Studio', initialId = 'studio-a') {
  const slots = [], requests = [];
  let cursor = 0, effects = [], params = [initialType, initialId];
  const react = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: initial };
      return [slots[index].value, value => { slots[index].value = value; }];
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useCallback(fn) { cursor++; return fn; },
    useEffect(fn, deps) {
      const index = cursor++;
      const slot = slots[index] ??= {};
      if (!slot.deps || deps.some((value, i) => value !== slot.deps[i])) {
        slot.cleanup?.(); slot.deps = deps; effects.push(() => { slot.cleanup = fn(); });
      }
    },
  };
  const supabase = { from(table) {
    assert.equal(table, 'reviews');
    const record = {};
    const query = {
      select(columns) { record.columns = columns; return query; },
      eq(column, id) { record.column = column; record.id = id; return query; },
      order() { return query; }, limit() { return query; },
      abortSignal(signal) { record.signal = signal; return query; },
      then(resolve) {
        // Match the deployed profiles schema, which has no updated_at column.
        const fields = record.columns.match(/profiles![^(]+\(([^)]+)\)/)?.[1].split(',').map(field => field.trim()) || [];
        const missing = fields.find(field => !['id', 'full_name', 'avatar_url', 'created_at'].includes(field));
        requests.push({ ...record, resolve: response => resolve(missing
          ? { data: null, error: { code: '42703', message: `column profiles.${missing} does not exist` } }
          : response) });
      },
    }; return query;
  } };
  const exports = {};
  vm.runInNewContext(compile(`${workspace}/src/hooks/useListingReviews.ts`), {
    exports, AbortController, require: name => name === 'react' ? react : { supabase },
  });
  const result = {
    requests,
    render(next = params) {
      params = next; cursor = 0; effects = [];
      const state = exports.useListingReviews(...params); effects.forEach(fn => fn()); return state;
    },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
  result.render(); return result;
}

for (const workspace of ['mobile', 'web']) {
  test(`${workspace}: detail fetches can skip duplicate review reads while preserving the response for existing clients`, async () => {
    let handler, reviewReads = 0;
    const client = { from(table) {
      let single = false;
      const query = new Proxy({}, { get(_, method) {
        if (method === 'then') return resolve => {
          if (table === 'reviews') reviewReads++;
          const data = table === 'studios_with_stats' ? { id: 'studio', owner_id: 'owner', rating: 4.5 }
            : table === 'reviews' ? [{ id: 'review', comment: 'Great studio!' }]
              : single ? null : [];
          resolve({ data, error: null, count: 0 });
        };
        return () => { if (method === 'single' || method === 'maybeSingle') single = true; return query; };
      } }); return query;
    } };
    vm.runInNewContext(compile(`${workspace}/supabase/functions/manage-details/index.ts`), {
      exports: {}, require: name => name.includes('/http/') ? { serve: fn => { handler = fn; } } : { createClient: () => client },
      console, Response, Deno: { env: { get: () => 'fixture' } },
    });
    const invoke = body => handler(new Request('https://fixture.invalid', { method: 'POST',
      body: JSON.stringify({ action: 'fetch', type: 'studio', id: 'studio', ...body }) }));
    const legacy = await invoke({}); assert.equal(legacy.status, 200);
    assert.equal((await legacy.json()).reviews[0].content, 'Great studio!');
    const current = await invoke({ includeReviews: false }); assert.equal(current.status, 200);
    assert.equal((await current.json()).reviews.length, 0);
    assert.equal(reviewReads, 1);
  });

  test(`${workspace}: one stable listing query preserves reviews during refresh and errors, then accepts empty results`, async () => {
    const view = fixture(workspace);
    assert.equal(view.render().loading, true);
    await tick();
    assert.equal(view.requests.length, 1);
    assert.equal(view.requests[0].column, 'studio_id');
    view.requests[0].resolve({ data: [{ id: 'review', comment: ' Great studio! ', profiles: { full_name: 'Neil' } }], error: null });
    await tick();
    assert.equal(view.render().reviews[0].content, 'Great studio!');
    assert.equal(view.render().reviews[0].author.full_name, 'Neil');
    for (let i = 0; i < 5; i++) view.render();
    assert.equal(view.requests.length, 1, 'unrelated component renders do not refetch');
    const refresh = view.render().refresh(); await tick();
    assert.equal(view.render().loading, true);
    assert.equal(view.render().reviews.length, 1, 'refresh keeps existing reviews visible');
    view.requests[1].resolve({ data: null, error: { message: 'Network failed' } }); await refresh;
    assert.equal(view.render().reviews.length, 1, 'refresh failure retains saved reviews');
    assert.ok(view.render().error);
    assert.equal(view.render().loading, false);
    const retry = view.render().refresh(); await tick();
    assert.equal(view.render().error, null);
    view.requests[2].resolve({ data: [], error: null }); await retry;
    assert.equal(view.render().reviews.length, 0, 'a successful empty response clears removed reviews');
    assert.equal(view.render().error, null);
    view.unmount();
  });

  test(`${workspace}: changing listing ID or type rejects delayed responses and cancels old requests`, async () => {
    const view = fixture(workspace);
    await tick();
    view.render(['Studio', 'studio-b']); await tick();
    assert.equal(view.requests[0].signal.aborted, true);
    view.requests[1].resolve({ data: [{ id: 'new-review' }], error: null }); await tick();
    view.requests[0].resolve({ data: [{ id: 'old-review' }], error: null }); await tick();
    assert.equal(view.render().reviews[0].id, 'new-review');
    assert.equal(view.render(['Gig', 'studio-b']).reviews.length, 0, 'same ID with different listing type has separate state');
    await tick();
    assert.equal(view.requests[2].column, 'gig_id');
    view.requests[2].resolve({ data: [], error: { message: 'Denied' } }); await tick();
    assert.ok(view.render().error);
    assert.equal(view.render().reviews.length, 0);
    view.render([null, null]); await tick();
    assert.equal(view.render().loading, false);
    assert.equal(view.render().error, null);
    view.unmount();
  });

  test(`${workspace}: a superseded refresh cannot overwrite the most recent successful response`, async () => {
    const view = fixture(workspace, 'Artist', 'neil'); await tick();
    assert.equal(view.requests[0].column, 'user_id');
    const first = view.render().refresh(); await tick();
    const second = view.render().refresh(); await tick();
    view.requests[2].resolve({ data: [{ id: 'latest' }], error: null }); await second;
    view.requests[1].resolve({ data: [], error: { message: 'late error' } }); await first;
    view.requests[0].resolve({ data: [{ id: 'old' }], error: null }); await tick();
    assert.equal(view.render().reviews[0].id, 'latest');
    assert.equal(view.render().error, null);
    view.unmount();
  });

  test(`${workspace}: review UI distinguishes loading/error/empty states and retains cards while refreshing`, () => {
    const require = createRequire(path.resolve('mobile/package.json'));
    const React = require('react');
    const nativeWeb = require('react-native-web');
    const { renderToStaticMarkup } = require('react-dom/server');
    const exports = {};
    vm.runInNewContext(compile(`${workspace}/src/components/listingDetails/ReviewsTab.tsx`), {
      exports, require: name => name === 'react' ? React : name === 'react-native' ? nativeWeb
        : name === '@expo/vector-icons' ? { Ionicons: () => null }
        : name.includes('friendlyDateTime') ? { formatDashedNumericDate: () => '10-07-2026' }
          : { __esModule: true, default: () => null },
    });
    const props = { group: { rating: 4.5, review_count: 4 }, colors: {}, styles: {}, reviews: [], onRetry() {} };
    const render = extra => renderToStaticMarkup(React.createElement(exports.default, { ...props, ...extra }));
    assert.match(render({}), /No reviews yet/);
    assert.doesNotMatch(render({ loading: true }), /No reviews yet/);
    const failed = render({ error: 'Reviews could not be loaded' });
    assert.match(failed, /Reviews could not be loaded/); assert.match(failed, /Retry/);
    assert.doesNotMatch(failed, /No reviews yet/);
    const refresh = render({ loading: true, reviews: [{ id: 'review', content: 'Great studio!' }] });
    assert.match(refresh, /Great studio!/); assert.doesNotMatch(refresh, /No reviews yet/);
    assert.doesNotMatch(read(`${workspace}/src/hooks/useListingSheetEffects.ts`), /setReviews|from\(["']reviews/);
  });
}
