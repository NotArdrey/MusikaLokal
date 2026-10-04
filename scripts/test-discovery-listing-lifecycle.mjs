import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../mobile/package.json', import.meta.url));
const ts = require('typescript');
const read = (file) => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const compile = (code) => ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const declaration = (source, name) => {
  const file = ts.createSourceFile('test.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  const walk = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name) found = node.initializer.getText(file);
    ts.forEachChild(node, walk);
  };
  walk(file);
  assert.ok(found, `Missing ${name}`);
  return found;
};
const feedSource = read('mobile/app/(tabs)/feed.tsx');
const searchSource = read('mobile/src/components/SearchBottomSheet.tsx');
const feedGuard = vm.runInNewContext(compile('const guard = ' + declaration(feedSource, 'isOpenFeedRecommendation') + '; guard;'), {
  isFeedStudioAcceptingBookings: () => true, getGigEndTimestamp: () => Date.now() + 60_000, Date,
});
const searchGuard = vm.runInNewContext(compile('const guard = ' + declaration(searchSource, 'isOpenSearchResult') + '; guard;'), {
  getManilaDateKey: () => '2026-10-04', Date,
});
for (const type of ['Group', 'Duo', 'Production', 'Production Team', 'Studio', 'Venue', 'Gig']) {
  const base = { type, status: 'open', open_group_applications: true, open_production_applications: true, availability: [{ is_open: true }], featured_performers: [{}] };
  for (const guard of [feedGuard, searchGuard]) {
    assert.equal(guard({ ...base, management_status: 'active' }), true, `${type} remains discoverable when active`);
    assert.equal(guard({ ...base, management_status: 'inactive' }), false, `${type} must disappear when inactive`);
    assert.equal(guard({ ...base, management_status: 'done' }), false, `${type} must disappear when done`);
  }
}
assert.equal(feedGuard({ __feedKind: 'post', body: 'An ordinary post' }), true);
assert.equal(searchGuard({ type: 'Artist' }), true);
assert.equal(feedGuard({ type: 'Gig', status: 'closed', featured_performers: [{}], management_status: 'done' }), false, 'Featured performers cannot make completed gigs discoverable');

const productionCards = vm.runInNewContext(compile('const cards = ' + declaration(read('mobile/supabase/functions/home-feed/index.ts'), 'productionItems') + '; cards;'), {
  productionTeamsResult: { data: [{ id: 'production-id', management_status: 'active', open_production_applications: true }] },
});
assert.equal(productionCards[0].management_status, 'active', 'Recommendation mapping must preserve production availability');

// Test the actual sheet query and its request gates with controlled query states.
let queryState = { data: 'active', isFetching: false, isError: false };
let options;
let request;
let response = { data: { management_status: 'active' }, error: null };
const client = { from: (table) => {
  request = { table };
  const chain = { select: (columns) => { request.columns = columns; return chain; }, eq: (key, value) => { request[key] = value; return chain; }, single: async () => response };
  return chain;
} };
const module = { exports: {} };
vm.runInNewContext(compile(read('mobile/src/hooks/useListingLifecycle.ts')), {
  module, exports: module.exports,
  require: (name) => name === '@tanstack/react-query' ? { useQuery: (value) => { options = value; return queryState; } }
    : name === '../../lib/supabase' ? { supabase: client }
      : name === '../context/AuthContext' ? { useAuth: () => ({ userId: 'viewer' }) } : {},
});
const useLifecycle = module.exports.useListingLifecycle;
for (const [type, table] of [['Group', 'groups'], ['Duo', 'groups'], ['Studio', 'studios'], ['Venue', 'studios'], ['Gig', 'gigs'], ['Production', 'production_teams']]) {
  assert.equal(useLifecycle({ type, id: 'listing-id', enabled: true }).canAcceptNewRequests, true);
  assert.equal(options.enabled, true);
  assert.equal(options.staleTime, 0, 'A reopened sheet must verify current availability');
  assert.equal(await options.queryFn(), 'active');
  assert.deepEqual(request, { table, columns: 'management_status', id: 'listing-id' });
}
for (const state of [
  { data: 'inactive', isFetching: false, isError: false },
  { data: 'done', isFetching: false, isError: false },
  { data: 'active', isFetching: true, isError: false },
  { data: 'active', isFetching: false, isError: true },
  { data: undefined, isFetching: false, isError: false },
]) {
  queryState = state;
  assert.equal(useLifecycle({ type: 'Group', id: 'listing-id', enabled: true }).canAcceptNewRequests, false);
}
useLifecycle({ type: 'Group', id: 'listing-id', enabled: false });
assert.equal(options.enabled, false);
assert.equal(useLifecycle({ type: 'Artist', id: 'artist-id', enabled: true }).canAcceptNewRequests, true);
assert.equal(options.enabled, false, 'Artist profiles have no listing lifecycle');
response = { data: null, error: new Error('Unavailable') };
useLifecycle({ type: 'Studio', id: 'listing-id', enabled: true });
await assert.rejects(options.queryFn, /Unavailable/);

for (const file of ['mobile/app/(tabs)/feed.tsx', 'mobile/supabase/functions/manage-social-feed/index.ts']) {
  const fullSource = read(file);
  const source = file.includes('manage-social-feed')
    ? fullSource.slice(fullSource.indexOf('if (action === "get_feed")'), fullSource.indexOf('const enrichmentStartedAt'))
    : fullSource;
  const queries = [...source.matchAll(/\.from\("(groups_with_stats|studios_with_stats|gigs_with_stats|production_teams)"\)\s*\.select\([^\n]+\)/g)];
  assert.ok(queries.length >= 9, `${file}: check every Talent/Following/public listing source`);
  for (const query of queries) {
    const following = source.slice(query.index + query[0].length, query.index + query[0].length + 90);
    assert.match(following, /^\s*\.eq\("management_status", "active"\)/, `${file}: ${query[1]} must filter before ordering and pagination`);
  }
}
const parsedFeed = ts.createSourceFile('feed.tsx', feedSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let invalidateCallback;
const visit = (node) => {
  if (ts.isCallExpression(node) && node.expression.getText(parsedFeed) === 'queryClient.getQueryCache().subscribe') invalidateCallback = node.arguments[0].getText(parsedFeed);
  ts.forEachChild(node, visit);
};
visit(parsedFeed);
assert.ok(invalidateCallback);
const caches = { for_you: true, following: true, latest: true, talent: true };
let refreshes = 0;
const focused = { current: false };
const invalidate = vm.runInNewContext(compile('const callback = ' + invalidateCallback + '; callback;'), {
  feedCacheRef: { current: caches }, isFeedFocusedRef: focused,
  invalidateFeedCache: (tab) => { caches[tab] = false; },
  scheduleRealtimeFeedRefresh: () => { refreshes++; },
});
invalidate({ type: 'updated', action: { type: 'invalidate' }, query: { queryKey: ['feed'] } });
assert.ok(Object.values(caches).every((loaded) => !loaded), 'Hidden Feed tabs must not reuse snapshots after a listing changes');
assert.equal(refreshes, 0);
focused.current = true;
invalidate({ type: 'updated', action: { type: 'invalidate' }, query: { queryKey: ['feed'] } });
assert.equal(refreshes, 1, 'Talent needs refreshes too');
invalidate({ type: 'updated', action: { type: 'fetch' }, query: { queryKey: ['feed'] } });
assert.equal(refreshes, 1, 'Starting a fetch must not create a refresh loop');
console.log('PASS: discovery filters, completed featured gigs, fresh sheet checks, query errors, request gates and all Feed listing query paths.');
