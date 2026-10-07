import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const read = file => readFileSync(file, 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function fixture(workspace, { user = 'jared', validToken = true, membershipError = false } = {}) {
  const calls = [];
  const gig = { id: 'gig', name: 'One roots heavy bagsakan', event_date: '2026-10-22', status: 'closed',
    gig_availability_slots: [{ slot_date: '2026-10-22', start_time: '08:00:00', end_time: '12:00:00' }] };
  const group = { id: 'duo', name: 'Fantastic duo', owner_id: 'neil' };
  const app = { id: 'accepted', status: 'accepted', applicant_id: 'neil', submitted_by_user_id: 'neil',
    gig_id: 'gig', group_id: 'duo', production_team_id: null, production_roster_id: null,
    leader_approval_status: 'approved', show_on_profile: false, feature_consent_status: 'pending',
    feature_consent_requested_at: '2026-10-01T10:00:00Z',
    cv_url: 'private-cv', video_url: 'private-video', gig, group };
  const tables = {
    groups: [group], group_members: [{ group_id: 'duo', user_id: 'jared' }], production_team_roster: [],
    gig_applications: [app,
      { ...app, id: 'completed', status: 'completed', gig_id: 'past', gig: { ...gig, id: 'past', event_date: '2026-10-01' } },
      { ...app, id: 'pending', status: 'pending' }, { ...app, id: 'cancelled', status: 'cancelled' },
      { ...app, id: 'cancelled-before-acceptance', status: 'cancelled', feature_consent_requested_at: null },
      { ...app, id: 'other-group', group_id: 'unrelated', applicant_id: 'someone', submitted_by_user_id: 'someone' },
    ],
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: validToken ? { id: user } : null }, error: null }) },
    from(table) {
      assert.ok(table in tables, table);
      const filters = [], record = { table, filters };
      let single = false;
      const query = {
        select(columns) { record.columns = columns; return query; },
        eq(column, value) { filters.push(row => row[column] === value); return query; },
        in(column, values) { filters.push(row => values.includes(row[column])); return query; },
        is(column, value) { filters.push(row => (row[column] ?? null) === value); return query; },
        order() { return query; },
        maybeSingle() { single = true; return query; },
        then(resolve) {
          calls.push(record);
          const rows = tables[table].filter(row => filters.every(matches => matches(row)));
          resolve({ data: single ? rows[0] || null : rows,
            error: membershipError && table === 'group_members' ? new Error('Membership unavailable') : null });
        },
      }; return query;
    },
  };
  const audience = {};
  vm.runInNewContext(compile(read(`${workspace}/supabase/functions/_shared/gigApplicationAudience.ts`)), { exports: audience });
  let handler;
  vm.runInNewContext(compile(read(`${workspace}/supabase/functions/manage-bookings/index.ts`)), {
    exports: {}, console, Response,
    require: name => name.includes('/http/') ? { serve: value => { handler = value; } }
      : name.includes('supabase-js') ? { createClient: () => client }
        : name.includes('gigApplicationAudience') ? audience : {},
    Deno: { env: { get: () => 'fixture' } },
  });
  return { tables, calls, invoke: (body = {}, authenticated = true) => handler(new Request('https://fixture.invalid', {
    method: 'POST', headers: authenticated ? { Authorization: 'Bearer fixture' } : {},
    body: JSON.stringify({ action: 'fetch_profile_gig_timeline', ...body }),
  })) };
}

for (const workspace of ['mobile', 'web']) {
  test(`${workspace}: Jared and Neil each receive their accepted private duo gig, including completed history`, async () => {
    for (const user of ['jared', 'neil']) {
      const { invoke, calls } = fixture(workspace, { user });
      const response = await invoke({ userId: user });
      assert.equal(response.status, 200);
      const rows = await response.json();
      assert.deepEqual(rows.map(row => row.id), ['accepted', 'completed', 'cancelled']);
      assert.equal(rows.filter(row => row.id === 'accepted').length, 1);
      assert.equal(rows[0].group_name, 'Fantastic duo');
      assert.equal(rows[0].group_id, 'duo');
      assert.equal(rows[0].gigs.status, 'closed');
      assert.equal(rows[0].gigs.gig_availability_slots[0].start_time, '08:00:00');
      for (const row of rows) {
        assert.ok(!('cv_url' in row)); assert.ok(!('video_url' in row));
        assert.ok(!('applicant_id' in row)); assert.ok(!('show_on_profile' in row));
      }
      for (const query of calls.filter(call => call.table === 'gig_applications')) {
        assert.doesNotMatch(query.columns, /\*|cv_url|video_url/);
      }
    }
  });

  test(`${workspace}: unauthenticated and cross-user private timeline reads are rejected`, async () => {
    const own = fixture(workspace);
    assert.equal((await own.invoke({ userId: 'neil' })).status, 403);
    assert.equal(own.calls.length, 0);
    assert.equal((await own.invoke({}, false)).status, 401);
    assert.equal((await fixture(workspace, { validToken: false }).invoke()).status, 401);
    const stranger = fixture(workspace, { user: 'stranger' });
    assert.deepEqual(await (await stranger.invoke()).json(), []);
  });

  test(`${workspace}: removed members lose private group gigs and membership failures do not fall back to public or unrelated data`, async () => {
    const former = fixture(workspace);
    former.tables.group_members.length = 0;
    assert.deepEqual(await (await former.invoke()).json(), []);
    const failed = await fixture(workspace, { membershipError: true }).invoke();
    assert.equal(failed.status, 400);
    assert.equal((await failed.json()).error, 'Membership unavailable');
  });
}

const profile = read('mobile/app/(tabs)/profile.tsx');
const ast = ts.createSourceFile('profile.tsx', profile, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate) {
  let found;
  function visit(node) { if (predicate(node)) found = node; ts.forEachChild(node, visit); }
  visit(ast); assert.ok(found); return found;
}
test('profile chooses private participant gigs only for its owner, with errors preserved', async () => {
  const ownerBranch = find(node => ts.isIfStatement(node) && node.expression.getText(ast) === 'ownership' &&
    node.getText(ast).includes('fetch_profile_gig_timeline'));
  const calls = [], scope = { ownership: true, targetId: 'jared', soloApplications: [], groupApplications: [],
    supabase: { functions: { invoke: async (name, options) => {
      calls.push({ name, ...options }); return { data: [{ id: 'accepted', group_id: 'duo', group_name: 'Fantastic duo' }], error: null };
    } } },
  };
  const run = () => vm.runInNewContext(compile(`(async () => { ${ownerBranch.thenStatement.getText(ast)} })()`), scope);
  await run();
  assert.equal(calls[0].name, 'manage-bookings');
  assert.equal(calls[0].body.action, 'fetch_profile_gig_timeline');
  assert.equal(calls[0].body.userId, 'jared');
  assert.equal(scope.soloApplications[0].group_name, 'Fantastic duo');
  assert.equal(scope.groupApplications.length, 0);
  scope.supabase.functions.invoke = async () => ({ data: null, error: new Error('Offline') });
  await assert.rejects(run, /Offline/);
});

test('profile hides private timeline state immediately after sign-out or a change of viewer', () => {
  const callback = find(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === 'filteredGigTimeline')
    .initializer.arguments[0].getText(ast);
  const data = { active: [], upcoming: [{ id: 'private-gig' }], done: [] };
  const scope = { currentUserId: 'jared', gigTimelineViewerId: 'jared', gigSearchQuery: '', gigTimeline: data };
  const evaluate = () => vm.runInNewContext(compile(`(${callback})()`), scope);
  assert.equal(evaluate().upcoming[0].id, 'private-gig');
  for (const user of [null, 'stranger']) {
    scope.currentUserId = user;
    assert.equal(evaluate().upcoming.length, 0);
  }
});

test('profile rejects cached timeline data from another viewer', () => {
  const declaration = find(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === 'cached' &&
    node.getText(ast).includes('cacheCandidate?.viewerId'));
  const expression = declaration.initializer.getText(ast);
  const scope = { cacheCandidate: { viewerId: 'jared', gigTimeline: { upcoming: [{ id: 'private' }] } }, currentUserId: 'jared' };
  const evaluate = () => vm.runInNewContext(compile(`(${expression})`), scope);
  assert.equal(evaluate(), scope.cacheCandidate);
  for (const user of [null, 'stranger']) {
    scope.currentUserId = user; assert.equal(evaluate(), null);
  }
});

test('a delayed private profile response is rejected after switching viewers or starting a newer request', () => {
  const declaration = find(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === 'shouldApplyFetchResult');
  const scope = { profileFetchRequestIdRef: { current: 1 }, requestId: 1,
    currentProfileViewerRef: { current: 'jared' }, currentUserId: 'jared' };
  const evaluate = () => vm.runInNewContext(compile(`(${declaration.initializer.getText(ast)})()`), scope);
  assert.equal(evaluate(), true);
  scope.currentProfileViewerRef.current = 'neil'; assert.equal(evaluate(), false);
  scope.currentProfileViewerRef.current = null; assert.equal(evaluate(), false);
  scope.currentProfileViewerRef.current = 'jared'; scope.profileFetchRequestIdRef.current = 2;
  assert.equal(evaluate(), false);
});

test('profile shows one duo card when multiple applications reference the same performance', () => {
  const callback = find(node => ts.isCallExpression(node) && node.expression.getText(ast).endsWith('.forEach') &&
    node.getText(ast).startsWith('[...(soloApplications')).getText(ast);
  const helpers = {};
  vm.runInNewContext(compile(read('mobile/src/utils/gigTimeline.ts')), { exports: helpers });
  const app = { status: 'accepted', group_id: 'duo', group_name: 'Fantastic duo',
    gigs: { id: 'gig', name: 'One roots heavy bagsakan', event_date: '2099-10-22', status: 'closed' } };
  const scope = { getGigTimelineBucket: helpers.getGigTimelineBucket, seenGigIds: new Set(), groupNameById: new Map(),
    stats: { active: 0, upcoming: 0, done: 0 }, timelineBuckets: { active: [], upcoming: [], done: [] },
    soloApplications: [app, { ...app, status: 'approved' }], groupApplications: [app],
  };
  vm.runInNewContext(compile(callback), scope);
  assert.equal(scope.stats.upcoming, 1);
  assert.equal(scope.timelineBuckets.upcoming.length, 1);
  assert.equal(scope.timelineBuckets.upcoming[0].performer_label, 'As Fantastic duo');
});
