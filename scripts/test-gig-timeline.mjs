import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const read = path => readFileSync(path, 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
const now = new Date('2026-10-07T10:00:00+08:00');
class FixtureDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now.getTime()])); }
  static now() { return now.getTime(); }
}
function timeline(workspace) {
  const exports = {};
  vm.runInNewContext(compile(read(`${workspace}/src/utils/gigTimeline.ts`)), { exports, Date: FixtureDate });
  return exports;
}
const gig = { id: 'october-22', name: 'One roots heavy bag', status: 'closed', event_date: '2026-10-22' };
const tick = () => new Promise(resolve => setImmediate(resolve));

for (const workspace of ['mobile', 'web']) {
  const helpers = timeline(workspace);
  test(`${workspace}: closing applications does not complete the October 22 performance`, () => {
    assert.equal(helpers.getGigTimelineBucket(gig, now), 'upcoming');
    assert.equal(helpers.getGigTimelineLabel(gig, now), 'Upcoming');
    assert.equal(helpers.getGigTimelineBucket({ ...gig, application_status: 'completed' }, now), 'upcoming');
    assert.equal(helpers.getGigTimelineBucket({ ...gig, event_date: null }, now), 'upcoming');
    assert.equal(helpers.getGigTimelineBucket({ ...gig, event_date: 'invalid' }, now), 'upcoming');
    assert.equal(helpers.getGigTimelineBucket({ ...gig, event_date: '2026-02-30' }, now), 'upcoming');
  });

  test(`${workspace}: calendar-day fallback follows Manila midnight in any device timezone`, () => {
    const target = { ...gig, event_date: '2026-10-07' };
    assert.equal(helpers.getGigTimelineBucket(target, new Date('2026-10-06T15:59:59Z')), 'upcoming');
    assert.equal(helpers.getGigTimelineBucket(target, new Date('2026-10-06T16:00:00Z')), 'active');
    assert.equal(helpers.getGigTimelineBucket(target, new Date('2026-10-07T15:59:59.999Z')), 'active');
    assert.equal(helpers.getGigTimelineBucket(target, new Date('2026-10-07T16:00:00Z')), 'done');
    assert.equal(helpers.getGigTimelineBucket({ ...target, event_date: '2026-10-06T17:00:00Z' }, now), 'active');
  });

  test(`${workspace}: schedules control start/end, multiple dates, gaps, and overnight performances`, () => {
    const target = { ...gig, gig_availability_slots: [
      { slot_date: '2026-10-22', start_time: '18:00:00', end_time: '20:00:00' },
      { slot_date: '2026-10-24', start_time: '22:00', end_time: '01:00' },
    ] };
    for (const [timestamp, expected] of [
      ['2026-10-22T17:59:59+08:00', 'upcoming'],
      ['2026-10-22T18:00:00+08:00', 'active'],
      ['2026-10-22T20:00:00+08:00', 'upcoming'],
      ['2026-10-23T12:00:00+08:00', 'upcoming'],
      ['2026-10-25T00:59:59+08:00', 'active'],
      ['2026-10-25T01:00:00+08:00', 'done'],
    ]) assert.equal(helpers.getGigTimelineBucket(target, new Date(timestamp)), expected, timestamp);
    assert.equal(helpers.getGigTimelineBucket({ ...gig, gig_availability_slots: [
      { slot_date: '2026-10-01', start_time: '25:00', end_time: '26:00' },
    ] }, now), 'upcoming');
  });

  test(`${workspace}: completed performances stay in history and cancellations have an accurate label`, () => {
    const cancelled = { ...gig, id: 'cancelled', status: 'cancelled' };
    const rows = helpers.buildGigTimeline([
      { status: 'accepted', gigs: gig }, { status: 'approved', gigs: gig },
      { status: 'completed', gigs: { ...gig, id: 'history', event_date: '2026-10-01' } },
      { status: 'accepted', gigs: cancelled }, { gigs: null },
    ], now);
    assert.equal(rows.upcoming.length, 1);
    assert.equal(rows.done.length, 2);
    assert.equal(helpers.getGigTimelineLabel(cancelled, now), 'Cancelled');
    assert.equal(helpers.getGigTimelineLabel({ ...gig, application_status: 'cancelled' }, now), 'Cancelled');
    assert.equal(helpers.getGigTimelineLabel(rows.done.find(row => row.id === 'history'), now), 'Done');
  });

  test(`${workspace}: migration retains existing completed consent and enforces public privacy with real RLS`, async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create role anon; create role authenticated;
        create table public.gig_applications (
          id text primary key, status text, feature_consent_status text default 'not_requested',
          show_on_profile boolean default false, show_on_gig_page boolean default false,
          feature_consent_requested_at timestamptz, feature_consent_responded_at timestamptz
        );
        alter table gig_applications enable row level security;
        grant select on gig_applications to anon, authenticated;
      `);
      const oldMigration = read(`${workspace}/supabase/migrations/20260715120000_gig_applicant_recommendations_and_feature_consent.sql`);
      await db.exec(oldMigration.slice(oldMigration.indexOf('create or replace function public.prepare_gig_feature_consent()'), oldMigration.indexOf('create index if not exists idx_gig_applications_gig_countable')));
      await db.exec(`
        insert into gig_applications (id, status) values ('previously-revoked', 'accepted');
        update gig_applications set feature_consent_status = 'accepted', show_on_profile = true where id = 'previously-revoked';
        update gig_applications set status = 'completed' where id = 'previously-revoked';
      `);
      const migration = read(`${workspace}/supabase/migrations/20261007120000_preserve_completed_gig_timeline_consent.sql`);
      await db.exec(migration);
      await db.exec(migration); // Reapplying must not fabricate or erase consent.
      await db.exec(`
        insert into gig_applications (id, status) values ('public', 'accepted'), ('private', 'approved'), ('cancelled', 'accepted');
        update gig_applications set feature_consent_status = 'accepted', show_on_profile = true,
          show_on_gig_page = true, feature_consent_responded_at = '2026-10-01T10:00:00Z'
          where id in ('public', 'cancelled');
        update gig_applications set status = 'completed' where id in ('public', 'private');
        update gig_applications set status = 'cancelled' where id = 'cancelled';
      `);
      const { rows } = await db.query('select * from gig_applications order by id');
      const completed = rows.find(row => row.id === 'public');
      assert.equal(completed.feature_consent_status, 'accepted');
      assert.equal(completed.show_on_profile, true);
      assert.equal(completed.show_on_gig_page, true);
      assert.equal(completed.feature_consent_responded_at.toISOString(), '2026-10-01T10:00:00.000Z');
      assert.equal(rows.find(row => row.id === 'private').show_on_profile, false);
      assert.equal(rows.find(row => row.id === 'cancelled').feature_consent_status, 'revoked');
      assert.equal(rows.find(row => row.id === 'previously-revoked').show_on_profile, false);
      for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`);
        assert.deepEqual((await db.query('select id from gig_applications')).rows.map(row => row.id), ['public']);
        await db.exec('reset role');
      }
      await db.exec(`update gig_applications set status = 'pending' where id = 'public';
        update gig_applications set status = 'accepted' where id = 'public';`);
      const renewed = (await db.query("select * from gig_applications where id = 'public'")).rows[0];
      assert.equal(renewed.feature_consent_status, 'pending');
      assert.equal(renewed.show_on_profile, false);
    } finally { await db.close(); }
  });

  test(`${workspace}: rendered group/artist timelines request completed public gigs and ignore superseded reads`, async () => {
    const slots = [], requests = [];
    let cursor = 0, effects = [];
    const React = {
      createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
      useState(initial) {
        const index = cursor++;
        slots[index] ??= { value: initial };
        return [slots[index].value, value => { slots[index].value = value; }];
      },
      useMemo: fn => fn(),
      useEffect(fn, deps) {
        const index = cursor++;
        const slot = slots[index] ??= {};
        if (!slot.deps || deps.some((value, i) => value !== slot.deps[i])) {
          slot.cleanup?.(); slot.deps = deps; effects.push(() => { slot.cleanup = fn(); });
        }
      },
    };
    const supabase = { rpc(name, params) {
      assert.equal(name, 'get_public_performer_gig_timeline');
      return new Promise(resolve => requests.push({ params, resolve }));
    } };
    const exports = {};
    vm.runInNewContext(compile(read(`${workspace}/src/components/listingDetails/GroupTimelineTab.tsx`)), {
      exports, Date: FixtureDate,
      require: name => name === 'react' ? React : name === 'react-native' ? { Text: 'Text', View: 'View' }
        : name.includes('gigTimeline') ? helpers : name.includes('supabase') ? { supabase }
          : name.includes('tokens') ? { typography: {} } : { Ionicons: 'Icon' },
    });
    const render = group => {
      cursor = 0; effects = [];
      const tree = exports.default({ group, colors: {}, styles: {}, width: 320 });
      effects.forEach(fn => fn()); return tree;
    };
    const text = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree)
      : Array.isArray(tree) ? tree.map(text).join(' ') : tree?.props ? text(tree.props.children) : '';
    const group = { id: 'band', type: 'Group' };
    render(group); await tick();
    const first = requests.shift();
    assert.equal(first.params.p_target_id, 'band');
    assert.equal(first.params.p_target_type, 'group');
    first.resolve({ data: [
      { status: 'accepted', gigs: gig }, { status: 'approved', gigs: gig },
      { status: 'completed', gigs: { ...gig, id: 'past', name: 'Past performance', event_date: '2026-10-01' } },
      { status: 'accepted', gigs: { ...gig, id: 'cancelled', name: 'Cancelled performance', status: 'cancelled' } },
    ], error: null });
    await tick();
    const rendered = text(render(group));
    assert.match(rendered, /Upcoming\s+\( 1 \)/);
    assert.match(rendered, /Done\s+\( 2 \)/);
    assert.match(rendered, /UPCOMING/); assert.match(rendered, /CANCELLED/);
    render({ id: 'other', type: 'Group' }); await tick();
    const stale = requests.shift();
    render({ id: 'other', type: 'Artist' }); await tick();
    const artist = requests.shift();
    assert.equal(artist.params.p_target_id, 'other');
    assert.equal(artist.params.p_target_type, 'artist');
    artist.resolve({ data: [{ status: 'accepted', gigs: { ...gig, name: 'Current artist' } }], error: null });
    await tick();
    stale.resolve({ data: [{ status: 'accepted', gigs: { ...gig, name: 'Stale group' } }], error: null });
    await tick();
    assert.match(text(render({ id: 'other', type: 'Artist' })), /Current artist/);
    assert.doesNotMatch(text(render({ id: 'other', type: 'Artist' })), /Stale group/);
  });
}

test('profile production queries and bucketing include completed consented performances', () => {
  const source = read('mobile/app/(tabs)/profile.tsx');
  const ast = ts.createSourceFile('profile.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const expressions = [];
  let callback;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'supabase.rpc' &&
      node.arguments[0]?.getText(ast).includes('get_public_performer_gig_timeline')) expressions.push(node.getText(ast));
    if (ts.isCallExpression(node) && node.expression.getText(ast).endsWith('.forEach') &&
      node.getText(ast).startsWith('[...(soloApplications')) callback = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(expressions.length, 1);
  const calls = [], helpers = timeline('mobile');
  const query = new Proxy({}, { get(_, name) { return (...args) => { calls.push([name, ...args]); return query; }; } });
  for (const expression of expressions) {
    calls.length = 0;
    vm.runInNewContext(compile(expression), { supabase: query, targetId: 'musician' });
    assert.equal(calls[0][0], 'rpc');
    assert.equal(calls[0][1], 'get_public_performer_gig_timeline');
    assert.equal(calls[0][2].p_target_id, 'musician');
    assert.equal(calls[0][2].p_target_type, 'artist');
  }
  assert.ok(callback);
  const scope = { getGigTimelineBucket: helpers.getGigTimelineBucket, seenGigIds: new Set(),
    stats: { active: 0, upcoming: 0, done: 0 }, timelineBuckets: { active: [], upcoming: [], done: [] },
    groupNameById: new Map([['band', 'The Band']]),
    soloApplications: [{ status: 'accepted', gigs: gig }],
    groupApplications: [{ status: 'completed', group_id: 'band', gigs: { ...gig, id: 'past', event_date: '2026-10-01' } }],
  };
  vm.runInNewContext(compile(callback), scope);
  assert.equal(scope.stats.upcoming, 1); assert.equal(scope.stats.done, 1);
  assert.equal(scope.timelineBuckets.done[0].performer_label, 'As The Band');
  assert.equal(scope.timelineBuckets.done[0].application_status, 'completed');
});
