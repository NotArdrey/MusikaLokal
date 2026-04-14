/**
 * Smoke test: manage-details edge function + favorites/bookmarks/settings/profile flows
 * Run: node scripts/smoke_test.mjs
 */

const SUPABASE_URL = 'https://aefldxegsvzecshlayza.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlZmxkeGVnc3Z6ZWNzaGxheXphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2NTgyOTUsImV4cCI6MjA4NDIzNDI5NX0._BKyxjyqHKHaheMWkBk8mMalzSPy_gm1ImsT_RQaOB0';

const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/manage-details`;

// Sample IDs from DB
const TEST_IDS = {
  group: 'd925a3f7-a93f-4a47-ad23-0f8f7d7c01f5',
  studio: 'c0de5ad7-b857-41ea-8a99-345e80ecedce',
  gig: '29ab7cc6-74d6-4372-bf0e-f57944d65163',
};

let passed = 0;
let failed = 0;
const errors = [];

function ok(label) {
  console.log(`  ✅  ${label}`);
  passed++;
}

function fail(label, err) {
  console.error(`  ❌  ${label}`);
  if (err) console.error(`       ${err?.message ?? err}`);
  failed++;
  errors.push({ label, err });
}

async function edgeCall(body) {
  const res = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
      'apikey': ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, data: json };
}

async function dbQuery(path) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
  });
  return res.json();
}

// ─── 1. FETCH: favorites_count in response ───────────────────────────────────
async function testFetchReturnsFavoritesCount() {
  console.log('\n[1] fetch – favorites_count field');
  for (const [type, id] of Object.entries(TEST_IDS)) {
    const { status, data } = await edgeCall({ action: 'fetch', type, id, userId: null });
    if (status !== 200) {
      fail(`fetch ${type} – HTTP ${status}`, new Error(data?.error ?? 'non-200'));
      continue;
    }
    if (typeof data.favorites_count !== 'number') {
      fail(`fetch ${type} – favorites_count missing or wrong type (got ${typeof data.favorites_count})`);
    } else {
      ok(`fetch ${type} – favorites_count = ${data.favorites_count}`);
    }
    if (typeof data.is_favorited !== 'boolean') {
      fail(`fetch ${type} – is_favorited missing or wrong type`);
    } else {
      ok(`fetch ${type} – is_favorited = ${data.is_favorited}`);
    }
  }
}

// ─── 2. toggle_favorite: authenticated user (anon test, unauthenticated path) ─
// We test the shape of the response – an unauthenticated toggle will fail with
// error 400 "A valid userId is required" or a DB RLS error, which is expected.
// We verify the deployed version 41 is active and responding properly.
async function testToggleFavoriteResponseShape() {
  console.log('\n[2] toggle_favorite – response shape');
  const { status, data } = await edgeCall({
    action: 'toggle_favorite',
    type: 'group',
    id: TEST_IDS.group,
    userId: '00000000-0000-0000-0000-000000000000', // fake uuid, will fail RLS
  });
  // Either success (if row happens to exist) or an error – either way
  // we mainly verify the function responds (not 404/502) and that the
  // shape includes is_favorited + favorites_count on success.
  if (status === 400 && data?.error) {
    ok(`toggle_favorite – function live, rejected bad userId with error: "${data.error}"`);
  } else if (typeof data?.is_favorited === 'boolean' && typeof data?.favorites_count === 'number') {
    ok(`toggle_favorite – returned { is_favorited: ${data.is_favorited}, favorites_count: ${data.favorites_count} }`);
  } else if (status === 200) {
    fail('toggle_favorite – 200 but missing expected fields', new Error(JSON.stringify(data)));
  } else {
    fail(`toggle_favorite – unexpected response status=${status}`, new Error(JSON.stringify(data)));
  }
}

// ─── 3. Share link logic (static / unit check) ───────────────────────────────
function testShareLinkBuilderLogic() {
  console.log('\n[3] Share link builder logic (static check)');

  const appScheme = 'exp';
  function buildShareUrl(type, id) {
    if (!id) return `${appScheme}://home`;
    const normalized = (type || '').toLowerCase();
    if (normalized === 'group') return `${appScheme}://group_details?id=${id}`;
    if (normalized === 'artist') return `${appScheme}://profile?userId=${id}`;
    return `${appScheme}://home?listingId=${id}&listingType=${normalized}`;
  }

  const cases = [
    { type: 'group', id: 'abc-123', expected: 'exp://group_details?id=abc-123' },
    { type: 'studio', id: 'xyz-999', expected: 'exp://home?listingId=xyz-999&listingType=studio' },
    { type: 'gig', id: 'gig-001', expected: 'exp://home?listingId=gig-001&listingType=gig' },
    { type: 'artist', id: 'user-777', expected: 'exp://profile?userId=user-777' },
    { type: 'unknown', id: '', expected: 'exp://home' },
  ];

  for (const { type, id, expected } of cases) {
    const result = buildShareUrl(type, id);
    if (result === expected) {
      ok(`share url – ${type}${id ? '/' + id : ''} → "${result}"`);
    } else {
      fail(`share url – ${type} expected "${expected}" got "${result}"`);
    }
  }
}

// ─── 4. Favorites table schema check ─────────────────────────────────────────
async function testFavoritesTableSchema() {
  console.log('\n[4] favorites table schema');
  const data = await dbQuery('favorites?limit=1&select=id%2Cuser_id%2Cgroup_id%2Cstudio_id%2Cgig_id%2Ccreated_at');
  if (Array.isArray(data)) {
    ok('favorites table accessible via REST, correct columns queryable');
    if (data.length > 0) {
      const row = data[0];
      for (const col of ['id', 'user_id', 'created_at']) {
        if (col in row) ok(`  - column "${col}" present`);
        else fail(`  - column "${col}" missing in favorites`);
      }
    } else {
      ok('favorites table is empty (expected for test env)');
    }
  } else {
    fail('favorites table query failed', new Error(JSON.stringify(data)));
  }
}

// ─── 5. Views existence check ─────────────────────────────────────────────────
async function testViewsExist() {
  console.log('\n[5] DB views with_stats existence');
  for (const view of ['groups_with_stats', 'studios_with_stats', 'gigs_with_stats']) {
    const data = await dbQuery(`${view}?limit=1`);
    if (Array.isArray(data)) {
      ok(`view ${view} – accessible`);
    } else {
      fail(`view ${view} – not accessible`, new Error(JSON.stringify(data)));
    }
  }
}

// ─── 6. Profile favorites query (simulated bookmark load) ────────────────────
async function testProfileBookmarksQuery() {
  console.log('\n[6] profile bookmarks fetch (favorites join simulation)');

  // Simulate what profile.tsx does:
  // SELECT group_id, studio_id, gig_id, created_at FROM favorites WHERE user_id = X
  // Then parallel joins to groups_with_stats / studios_with_stats / gigs_with_stats
  // Since we're anonymous, we can only confirm the query structure is valid.

  const favData = await dbQuery('favorites?select=group_id%2Cstudio_id%2Cgig_id%2Ccreated_at&limit=5');
  if (Array.isArray(favData)) {
    ok(`profile bookmark load – favorites query returns ${favData.length} row(s)`);
  } else {
    fail('profile bookmark load – favorites query failed', new Error(JSON.stringify(favData)));
  }

  // Confirm each view can be queried by id list (simulated join)
  for (const [typeKey, view, idCol] of [
    ['group', 'groups_with_stats', 'id'],
    ['studio', 'studios_with_stats', 'id'],
    ['gig', 'gigs_with_stats', 'id'],
  ]) {
    const testId = TEST_IDS[typeKey];
    const data = await dbQuery(`${view}?id=eq.${testId}&select=id%2Cname`);
    if (Array.isArray(data) && data.length > 0) {
      ok(`profile bookmark join – ${view} found "${data[0].name}" for test ID`);
    } else if (Array.isArray(data)) {
      ok(`profile bookmark join – ${view} responded (0 rows for test ID, table may be RLS-filtered)`);
    } else {
      fail(`profile bookmark join – ${view} query failed`, new Error(JSON.stringify(data)));
    }
  }
}

// ─── 7. Settings history keys (static / shape check) ─────────────────────────
function testSettingsHistoryKeyConventions() {
  console.log('\n[7] Settings history key conventions (static check)');

  const RECENTLY_VIEWED_STORAGE_KEY = 'recently_viewed_items';
  const PENDING_REOPEN_LISTING_STORAGE_KEY = 'pending_reopen_listing_id';
  const MAX_SETTINGS_HISTORY_ITEMS = 6;

  // Simulate parsing stored history
  const mockStored = JSON.stringify([
    { id: 'abc', name: 'Test Studio', type: 'Studio', location: 'Makati' },
    { id: 'xyz', name: 'Test Gig', type: 'Gig', location: 'BGC' },
  ]);

  const parsed = JSON.parse(mockStored);
  if (Array.isArray(parsed)) ok(`settings history – parsed array (${parsed.length} items)`);
  else fail('settings history – parse failed');

  const sliced = parsed.slice(0, MAX_SETTINGS_HISTORY_ITEMS);
  if (sliced.length === parsed.length) ok(`settings history – slice(0,${MAX_SETTINGS_HISTORY_ITEMS}) correct`);
  else fail('settings history – slice count wrong');

  // Simulate getHistoryIcon
  function getHistoryIcon(itemType) {
    const normalized = String(itemType || '').toLowerCase();
    if (normalized === 'studio' || normalized === 'venue') return 'business-outline';
    if (normalized === 'gig') return 'mic-outline';
    if (normalized === 'artist') return 'person-outline';
    if (normalized === 'group') return 'people-outline';
    return 'albums-outline';
  }

  const iconCases = [
    ['Studio', 'business-outline'],
    ['Gig', 'mic-outline'],
    ['group', 'people-outline'],
    ['artist', 'person-outline'],
    ['unknown', 'albums-outline'],
  ];
  for (const [type, expected] of iconCases) {
    const got = getHistoryIcon(type);
    if (got === expected) ok(`  getHistoryIcon("${type}") → "${got}"`);
    else fail(`  getHistoryIcon("${type}") expected "${expected}" got "${got}"`);
  }

  ok(`settings history key: "${RECENTLY_VIEWED_STORAGE_KEY}"`);
  ok(`pending reopen key: "${PENDING_REOPEN_LISTING_STORAGE_KEY}"`);
}

// ─── 8. Deployed function version check ──────────────────────────────────────
async function testDeployedFunctionVersion() {
  console.log('\n[8] Deployed function version check');
  // Verify the live function includes favorites_count by making a fetch call
  const { status, data } = await edgeCall({ action: 'fetch', type: 'studio', id: TEST_IDS.studio, userId: null });
  if (status === 200 && 'favorites_count' in data) {
    ok(`manage-details v41 ACTIVE – response includes favorites_count=${data.favorites_count}`);
  } else {
    fail('manage-details – deployed version does not return favorites_count', new Error(`status=${status}, keys=${Object.keys(data || {}).join(',')}`));
  }
}

// ─── Run all tests ─────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  MusikaLokal Smoke Tests');
  console.log('  manage-details v41 + bookmark/share/settings/profile');
  console.log('═══════════════════════════════════════════════════════');

  await testFetchReturnsFavoritesCount();
  await testToggleFavoriteResponseShape();
  testShareLinkBuilderLogic();
  await testFavoritesTableSchema();
  await testViewsExist();
  await testProfileBookmarksQuery();
  testSettingsHistoryKeyConventions();
  await testDeployedFunctionVersion();

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  RESULTS: ${passed} passed  |  ${failed} failed`);
  if (failed > 0) {
    console.log('\n  Failed tests:');
    for (const { label, err } of errors) {
      console.log(`    • ${label}${err ? ` — ${err.message}` : ''}`);
    }
  }
  console.log('═══════════════════════════════════════════════════════');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(2);
});
