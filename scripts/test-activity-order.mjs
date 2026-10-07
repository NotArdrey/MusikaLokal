import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const read = file => readFileSync(file, 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const load = file => {
  const exports = {};
  vm.runInNewContext(compile(read(file)), { exports });
  return exports;
};
const order = load('mobile/src/utils/activityOrder.ts');
const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const schema = `
  set timezone = 'UTC';
  create role anon; create role authenticated;
  create table studio_bookings (
    id uuid primary key, user_id uuid, studio_id uuid, created_at timestamptz,
    updated_at timestamptz, booking_date date, start_time time, end_time time,
    status text, payment_status text, payment_amount numeric, remaining_balance numeric,
    paid_at timestamptz, refund_amount numeric, refunded_at timestamptz,
    check_in_time timestamptz, relocation_requested_at timestamptz,
    payout_hold_at timestamptz, payout_released_at timestamptz,
    reviewed_by_customer boolean default false, reviewed_by_owner boolean default false,
    cancellation_reason text, notes text
  );
  create table gig_applications (
    id uuid primary key, applicant_id uuid, gig_id uuid, group_id uuid,
    created_at timestamptz, updated_at timestamptz, status text,
    rejected_at timestamptz, fired_at timestamptz, leader_reviewed_at timestamptz,
    reconfirmation_required_at timestamptz, feature_consent_responded_at timestamptz,
    member_cv_completed_at timestamptz, leader_approval_status text,
    reviewed_by_applicant boolean default false, reviewed_by_organizer boolean default false,
    video_copyright_status text, video_copyright_metadata jsonb, ai_review_frame_urls jsonb,
    cancellation_reason text, note text
  );
  create table booking_requests (id uuid primary key, created_at timestamptz,
    status text, message text, attachment_url text, event_details jsonb);
  create table reviews (id uuid primary key, author_id uuid,
    studio_booking_id uuid references studio_bookings, gig_application_id uuid references gig_applications,
    created_at timestamptz default now());
  create function is_user_represented_by_gig_application(actor uuid, application uuid)
  returns boolean language sql stable as $$ select applicant_id = actor from gig_applications where id = application $$;
  create table audit_sentinel (id int);
  create function audit_sentinel_capture() returns trigger language plpgsql as $$
  begin insert into audit_sentinel values (1); new.updated_at := statement_timestamp(); return new; end $$;
  create trigger audit_before before update on gig_applications for each row execute function audit_sentinel_capture();
  create trigger replica_before before update on gig_applications for each row execute function audit_sentinel_capture();
  alter table gig_applications enable replica trigger replica_before;
  create trigger disabled_before before update on gig_applications for each row execute function audit_sentinel_capture();
  alter table gig_applications disable trigger disabled_before;
  create publication supabase_realtime;
  alter table studio_bookings enable row level security;
  grant select, update on studio_bookings to authenticated;
  create policy own_bookings on studio_bookings to authenticated
    using (user_id::text = current_setting('test.actor', true))
    with check (user_id::text = current_setting('test.actor', true));
`;

async function database(workspace) {
  const db = new PGlite();
  await db.exec(schema);
  await db.exec(`
    insert into studio_bookings (id, user_id, created_at, updated_at, booking_date, status, paid_at)
    values ('${id(1)}', '${id(10)}', '2026-10-01', '2026-10-06', '2099-10-22', 'pending', '2026-10-03');
    insert into gig_applications (id, applicant_id, created_at, updated_at, status, leader_reviewed_at)
    values ('${id(2)}', '${id(10)}', '2026-10-02', '2026-10-06', 'accepted', '2026-10-04');
    insert into booking_requests (id, created_at, status) values ('${id(3)}', '2026-10-01', 'pending');
    insert into reviews (id, author_id, gig_application_id, created_at)
    values ('${id(4)}', '${id(10)}', '${id(2)}', '2026-10-05');
  `);
  const migration = read(`${workspace}/supabase/migrations/20261007140000_persist_business_activity_order.sql`)
    + '\n' + read(`${workspace}/supabase/migrations/20261007143000_record_each_review_activity.sql`);
  await db.exec(migration);
  return { db, migration, row: async (table, value) => (await db.query(`select * from ${table} where id = $1`, [id(value)])).rows[0] };
}

for (const workspace of ['mobile', 'web']) {
  test(`${workspace}: migration backfills real actions, preserves trigger states and metadata, and is idempotent`, async () => {
    const { db, migration, row } = await database(workspace);
    try {
      assert.equal((await row('studio_bookings', 1)).activity_at.toISOString(), '2026-10-03T00:00:00.000Z');
      const gig = await row('gig_applications', 2);
      assert.equal(gig.activity_at.toISOString(), '2026-10-05T00:00:00.000Z');
      assert.equal(gig.updated_at.toISOString(), '2026-10-06T00:00:00.000Z');
      assert.equal((await db.query('select count(*)::int as count from audit_sentinel')).rows[0].count, 0);
      const states = await db.query(`select tgname, tgenabled from pg_trigger where tgname in ('audit_before', 'replica_before', 'disabled_before') order by tgname`);
      assert.deepEqual(states.rows.map(value => value.tgenabled), ['O', 'D', 'R']);
      const publications = await db.query(`select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename`);
      assert.deepEqual(publications.rows.map(value => value.tablename), ['booking_requests', 'gig_applications', 'studio_bookings']);
      await db.exec(migration);
      assert.equal((await row('gig_applications', 2)).activity_at.toISOString(), gig.activity_at.toISOString());
      assert.equal((await db.query('select count(*)::int as count from audit_sentinel')).rows[0].count, 0);
    } finally { await db.close(); }
  });

  test(`${workspace}: confirmed payment, acceptance, cancellation, and request actions advance activity while retries and AI updates do not`, async () => {
    const { db, row } = await database(workspace);
    try {
      await db.exec(`update studio_bookings set payment_status='partial', payment_amount=3000, remaining_balance=3000 where id='${id(1)}';
        update gig_applications set status='completed' where id='${id(2)}';
        update booking_requests set status='accepted' where id='${id(3)}';`);
      const paid = await row('studio_bookings', 1), completed = await row('gig_applications', 2);
      assert.ok(paid.activity_at > new Date('2026-10-03'));
      assert.ok(completed.activity_at > new Date('2026-10-05'));
      assert.ok((await row('booking_requests', 3)).activity_at > new Date('2026-10-01'));
      await db.exec(`update gig_applications set status='pending' where id='${id(2)}'`);
      const pendingActivity = (await row('gig_applications', 2)).activity_at;
      await db.exec(`update gig_applications set status='accepted' where id='${id(2)}'`);
      assert.ok((await row('gig_applications', 2)).activity_at >= pendingActivity);
      const acceptedActivity = (await row('gig_applications', 2)).activity_at;
      await db.exec(`update studio_bookings set payment_status='partial', activity_at='2099-01-01' where id='${id(1)}';
        update gig_applications set updated_at='2099-01-01', video_copyright_status='approved',
        video_copyright_metadata='{"score":90}', ai_review_frame_urls='["new-frame"]', activity_at='2099-01-01' where id='${id(2)}';`);
      assert.equal((await row('studio_bookings', 1)).activity_at.toISOString(), paid.activity_at.toISOString());
      assert.equal((await row('gig_applications', 2)).activity_at.toISOString(), acceptedActivity.toISOString());
      await db.exec(`update studio_bookings set status='cancelled', cancellation_reason='Customer cancelled' where id='${id(1)}';`);
      assert.ok((await row('studio_bookings', 1)).activity_at > paid.activity_at);
      // The scheduled date remains the same; it never becomes an activity time.
      assert.equal((await row('studio_bookings', 1)).booking_date.toISOString().slice(0, 10), '2099-10-22');
    } finally { await db.close(); }
  });

  test(`${workspace}: server stamps new rows and rolls activity back together with failed actions`, async () => {
    const { db, row } = await database(workspace);
    try {
      await db.exec(`insert into booking_requests (id, created_at, activity_at, status)
        values ('${id(5)}', '2099-01-01', '2099-01-01', 'pending')`);
      assert.ok((await row('booking_requests', 5)).activity_at < new Date('2099-01-01'));
      const before = await row('studio_bookings', 1);
      await db.exec('begin');
      await db.exec(`update studio_bookings set payment_status='paid', remaining_balance=0 where id='${id(1)}'`);
      await db.exec('rollback');
      const after = await row('studio_bookings', 1);
      assert.equal(after.activity_at.toISOString(), before.activity_at.toISOString());
      assert.equal(after.payment_status, before.payment_status);
    } finally { await db.close(); }
  });

  test(`${workspace}: reviews update related flags and activity atomically, with unchanged RLS`, async () => {
    const { db, row } = await database(workspace);
    try {
      await db.exec(`insert into reviews (id, author_id, studio_booking_id) values ('${id(6)}', '${id(10)}', '${id(1)}');
        insert into reviews (id, author_id, gig_application_id) values ('${id(7)}', '${id(10)}', '${id(2)}');`);
      assert.equal((await row('studio_bookings', 1)).reviewed_by_customer, true);
      assert.equal((await row('studio_bookings', 1)).reviewed_by_owner, false);
      assert.equal((await row('gig_applications', 2)).reviewed_by_applicant, true);
      // Several manager/group participants can review the same booking. Each
      // inserted review is activity even after its shared boolean is already true.
      await db.exec(`insert into reviews (id, author_id, gig_application_id) values ('${id(12)}', '${id(11)}', '${id(2)}')`);
      const firstManagerReview = await row('gig_applications', 2);
      await db.exec(`insert into reviews (id, author_id, gig_application_id) values ('${id(13)}', '${id(12)}', '${id(2)}')`);
      const nextManagerReview = await row('gig_applications', 2);
      assert.equal(nextManagerReview.reviewed_by_organizer, true);
      assert.ok(nextManagerReview.last_reviewed_at > firstManagerReview.last_reviewed_at);
      assert.ok(nextManagerReview.activity_at > firstManagerReview.activity_at);
      const before = await row('studio_bookings', 1);
      await db.exec('begin');
      await db.exec(`insert into reviews (id, author_id, studio_booking_id) values ('${id(8)}', '${id(11)}', '${id(1)}')`);
      assert.equal((await row('studio_bookings', 1)).reviewed_by_owner, true);
      await db.exec('rollback');
      assert.equal((await row('studio_bookings', 1)).reviewed_by_owner, false);
      assert.equal((await row('studio_bookings', 1)).activity_at.toISOString(), before.activity_at.toISOString());
      await db.exec(`set role authenticated; set test.actor='${id(11)}';`);
      assert.equal((await db.query('select * from studio_bookings')).rows.length, 0);
      await db.exec(`update studio_bookings set notes='unauthorized' where id='${id(1)}'`);
      await db.exec(`set test.actor='${id(10)}';`);
      assert.equal((await db.query('select * from studio_bookings')).rows.length, 1);
      await db.exec(`update studio_bookings set activity_at='2099-01-01' where id='${id(1)}'`);
      assert.equal((await row('studio_bookings', 1)).activity_at.toISOString(), before.activity_at.toISOString());
      assert.equal((await row('studio_bookings', 1)).notes, null);
    } finally { await db.close(); }
  });
}

test('newer studio actions appear before older gigs regardless of schedules, updated_at, or AI ranking', () => {
  const items = [
    { id: 'gig', type_id: 'gig_application', activity_at: '2026-10-01T08:00:00Z', raw_date: '2099-10-22', updated_at: '2099-10-22' },
    { id: 'studio', type_id: 'studio_booking', activity_at: '2026-10-07T08:00:00Z', raw_date: '2026-10-10' },
  ];
  assert.deepEqual(items.sort(order.compareActivityItems).map(row => row.id), ['studio', 'gig']);
  const old = { created_at: '2026-10-01', paid_at: '2026-10-03', updated_at: '2099-01-01', raw_date: '2100-01-01' };
  assert.equal(order.getActivityTimestamp(old), Date.parse('2026-10-03'));
  assert.equal(order.getActivityTimestamp({ activity_at: 'bad', created_at: 'bad', raw_date: '2100-01-01' }), 0);
  assert.equal(order.getActivityTimestamp({ activity_at: null, created_at: '', paid_at: null }), 0);
  assert.deepEqual([{ id: 'b', type_id: 'gig_application' }, { id: 'a', type_id: 'gig_application' }]
    .sort(order.compareActivityItems).map(row => row.id), ['a', 'b']);
  for (const file of ['mobile/supabase/functions/_shared/activityOrder.ts', 'web/supabase/functions/_shared/activityOrder.ts']) {
    assert.equal(read(file), read('mobile/src/utils/activityOrder.ts'));
  }
});

function handlerFixture(workspace, role = 'musician') {
  const calls = [];
  const user = 'viewer';
  const studio = { id: 'studio', owner_id: user, name: 'Studio', studio_media: [] };
  const gig = { id: 'gig', name: 'Gig', event_date: '2099-10-22', organizer_id: user, gig_media: [] };
  const tables = {
    profiles: [{ id: user, role }], studios: [studio], gigs: [gig], groups: [], group_members: [],
    production_team_roster: [], booking_incidents: [], booking_attendance_events: [],
    gig_applications: [{ id: 'old-gig', applicant_id: user, gig_id: 'gig', gig,
      status: 'pending', group_id: null, production_team_id: null, leader_approval_status: 'approved',
      created_at: '2026-10-02T00:00:00Z', activity_at: '2026-10-03T00:00:00Z' }],
    studio_bookings: [{ id: 'new-studio', user_id: user, studio_id: 'studio', studio,
      status: 'pending', booking_date: '2099-01-01', start_time: '10:00:00', end_time: '12:00:00',
      created_at: '2026-10-01T00:00:00Z', activity_at: '2026-10-07T00:00:00Z' }],
    booking_requests: [{ id: 'request', sender_id: user, receiver_id: 'other', created_at: '2026-10-01', activity_at: '2026-10-07', status: 'pending' }],
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: user } }, error: null }) },
    from(table) {
      assert.ok(table in tables, `Unexpected table ${table}`);
      const filters = [], record = { table };
      let single = false, limit = Infinity;
      const query = {
        select(columns) { record.columns = columns; return query; },
        eq(column, value) { filters.push(row => row[column] === value); return query; },
        neq(column, value) { filters.push(row => row[column] !== value); return query; },
        in(column, values) { filters.push(row => values.includes(row[column])); return query; },
        is(column, value) { filters.push(row => (row[column] ?? null) === value); return query; },
        or(expression) {
          filters.push(row => expression.split(',').some(part => {
            const [column, op, value] = part.split('.');
            return op === 'is' ? (row[column] ?? null) === null : row[column] === value;
          })); return query;
        },
        order() { return query; }, limit(value) { limit = value; return query; },
        single() { single = true; return query; }, maybeSingle() { single = true; return query; },
        then(resolve) {
          calls.push(record);
          const rows = tables[table].filter(row => filters.every(matches => matches(row))).slice(0, limit);
          resolve({ data: single ? rows[0] || null : rows, error: null });
        },
      }; return query;
    },
  };
  let handler;
  const audience = load(`${workspace}/supabase/functions/_shared/gigApplicationAudience.ts`);
  vm.runInNewContext(compile(read(`${workspace}/supabase/functions/manage-bookings/index.ts`)), {
    exports: {}, console, Response,
    require: name => name.includes('/http/') ? { serve: value => { handler = value; } }
      : name.includes('supabase-js') ? { createClient: () => client }
        : name.includes('gigApplicationAudience') ? audience
          : name.includes('activityOrder') ? order : {},
    Deno: { env: { get: () => 'fixture' } },
  });
  return { tables, calls, invoke: (extra = {}) => handler(new Request('https://fixture.invalid', {
    method: 'POST', headers: { Authorization: 'Bearer fixture' },
    body: JSON.stringify({ action: 'fetch', ...extra }),
  })) };
}

for (const workspace of ['mobile', 'web']) {
  test(`${workspace}: real musician handler preserves timestamps and sorts mixed activity newest first`, async () => {
    const fixture = handlerFixture(workspace);
    const response = await fixture.invoke({ includeScreenPayload: true });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data.Pending.map(row => row.id), ['new-studio', 'old-gig']);
    assert.equal(data.Pending[1].created_at, '2026-10-02T00:00:00Z');
    assert.equal(data.Pending[1].activity_at, '2026-10-03T00:00:00Z');
    assert.equal(data.connectionRequests[0].activity_at, '2026-10-07');
    assert.match(fixture.calls.find(call => call.table === 'booking_requests').columns, /activity_at/);
    fixture.tables.studio_bookings[0].status = 'completed';
    fixture.tables.studio_bookings[0].reviewed_by_customer = true;
    const refreshed = await (await fixture.invoke()).json();
    assert.equal(refreshed.Review[0].id, 'new-studio', 'reviewed bookings remain available for History');
    assert.equal(refreshed.Review[0].reviewed_by_customer, true);
  });

  test(`${workspace}: studio and gig managers receive each application's persisted activity`, async () => {
    const owner = handlerFixture(workspace, 'studio-owner');
    const studioData = await (await owner.invoke()).json();
    assert.equal(studioData.Pending[0].activity_at, '2026-10-07T00:00:00Z');
    const venue = handlerFixture(workspace, 'venue-owner');
    const gigData = await (await venue.invoke()).json();
    assert.equal(gigData.Pending[0].activity_at, '2026-10-03T00:00:00Z');
  });
}

const bookings = read('mobile/app/(tabs)/bookings.tsx');
const ast = ts.createSourceFile('bookings.tsx', bookings, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate) {
  let result;
  function visit(node) { if (predicate(node)) result = node; ts.forEachChild(node, visit); }
  visit(ast); assert.ok(result); return result;
}
test('real activity view and multi-slot batches preserve activity while keeping slot order', () => {
  const merge = find(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === 'mergePendingStudioBookingBatch');
  const scope = { compareActivityItems: order.compareActivityItems,
    toPaymentAmount: value => Number(value) || 0, getPaymentItemDueAmount: () => 0, getBookingPaymentStatus: () => 'unpaid' };
  const mergeBatch = vm.runInNewContext(compile(`(${merge.initializer.getText(ast)})`), scope);
  const items = [
    { id: 'later-slot', activity_at: '2026-10-07', start_time: '14:00', end_time: '16:00' },
    { id: 'first-slot', activity_at: '2026-10-01', start_time: '10:00', end_time: '12:00' },
  ];
  const result = mergeBatch(items);
  assert.equal(result.activity_at, '2026-10-07');
  assert.equal(result.start_time, '10:00');
  assert.deepEqual(Array.from(result.booking_ids), ['first-slot', 'later-slot']);
  assert.equal(items[0].id, 'later-slot', 'source data is not mutated');
  const current = find(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === 'sortedCurrentItems').initializer.arguments[0];
  const sorted = vm.runInNewContext(compile(`(${current.getText(ast)})()`), { currentItems: items, compareActivityItems: order.compareActivityItems });
  assert.equal(sorted[0].id, 'later-slot');
  // Every displayed business list uses the shared comparator.
  for (const name of ['pendingItems', 'historyItems', 'unreviewedItems', 'appliedApps', 'acceptedApps', 'completedApps']) {
    const call = find(node => ts.isCallExpression(node) && node.expression.getText(ast) === `${name}.sort`);
    const rows = [{ id: 'old', activity_at: '2026-10-01' }, { id: 'new', activity_at: '2026-10-07' }];
    vm.runInNewContext(compile(call.getText(ast)), { [name]: rows, compareActivityItems: order.compareActivityItems });
    assert.equal(rows[0].id, 'new');
  }
});

test('activity invalidation covers saved actions, channel reconnection, app resume, and cleanup', async () => {
  const effects = [], slots = [], timers = new Map(), events = new Map(), invalidations = [];
  let onAppState, onStatus, removed = 0, cursor = 0;
  const channel = { on(_event, options, callback) { events.set(options.table, callback); return channel; },
    subscribe(callback) { onStatus = callback; return channel; } };
  const exports = {};
  vm.runInNewContext(compile(read('mobile/src/data/realtime.ts')), {
    exports,
    setTimeout(fn) { const key = timers.size + 1; timers.set(key, fn); return key; },
    clearTimeout(key) { timers.delete(key); },
    require: name => name === 'react' ? {
      useRef(initial) { return slots[cursor++] ??= { current: initial }; },
      useEffect(fn) { effects.push(fn); },
    } : name === 'react-native' ? { AppState: { currentState: 'active', addEventListener(_event, callback) {
      onAppState = callback; return { remove() {} };
    } } } : name.includes('/supabase') ? { prepareRealtimeAuth: async () => true,
      supabase: { channel: () => channel, removeChannel() { removed++; } } }
      : name === './queryKeys' ? { queryKeys: { bookings: { summary: user => ['bookings', 'summary', user] },
        wallet: { summary: user => ['wallet', user] }, notifications: { list: user => ['notifications', user] } } }
        : { createRealtimeChannelTopic: value => value },
  });
  exports.useGlobalRealtimeInvalidation({ invalidateQueries: options => invalidations.push(options.queryKey) }, 'neil');
  const cleanups = effects.map(fn => fn());
  await new Promise(resolve => setImmediate(resolve));
  onStatus('SUBSCRIBED');
  assert.equal(invalidations.filter(value => value[0] === 'bookings').length, 1);
  for (const table of ['studio_bookings', 'gig_applications', 'booking_requests']) {
    events.get(table)();
    for (const callback of timers.values()) callback();
    timers.clear();
  }
  assert.equal(invalidations.filter(value => value[0] === 'bookings').length, 4);
  onAppState('background'); onAppState('active');
  assert.equal(invalidations.filter(value => value[0] === 'bookings').length, 5);
  onStatus('SUBSCRIBED');
  assert.equal(invalidations.filter(value => value[0] === 'bookings').length, 6);
  cleanups.forEach(fn => fn?.());
  onStatus('SUBSCRIBED');
  assert.equal(invalidations.filter(value => value[0] === 'bookings').length, 6);
  assert.equal(removed, 1);
});
