import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const read = path => readFileSync(path, 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText;
const bookingsFile = 'mobile/app/(tabs)/bookings.tsx';
function findNode(file, predicate) {
  const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  const visit = node => { if (!found && predicate(node, ast)) found = node; ts.forEachChild(node, visit); };
  visit(ast);
  assert.ok(found, `Missing test target in ${file}`);
  return { node: found, ast };
}
function expression(name, scope, file = bookingsFile) {
  const { node, ast } = findNode(file, n => ts.isVariableDeclaration(n) && n.name.getText() === name);
  return vm.runInNewContext(compile(`(${node.initializer.getText(ast)})`), scope);
}
function moduleExports(file) {
  const exports = {};
  vm.runInNewContext(compile(read(file)), { exports });
  return exports;
}

function edgeHandler(file, client) {
  let handler;
  const dependency = {
    createClient: () => client, serve: fn => { handler = fn; },
    withNotificationSeverityType: x => x, withNotificationRouteMeta: x => x,
    buildNotificationRouteMeta: (route, params, meta) => ({ route, params, ...meta }),
    resolveGigApplicationAudience: async (_, app) => ({ application: typeof app === 'object' ? app : client.tables.gig_applications[0], audience: [] }),
    scheduleCoreActionEmailForNotification: () => {},
    queueGigPortfolioReview: async () => {}, scheduleGigPortfolioReview: async () => {},
    queueGigMemberVerification: async () => {}, scheduleGigMemberVerification: async () => {},
  };
  vm.runInNewContext(compile(read(file)), {
    exports: {}, require: () => dependency, Request, Response, Date, console,
    Deno: { env: { get: () => 'test-setting' }, serve: fn => { handler = fn; } },
  });
  assert.ok(handler);
  return handler;
}
function memoryClient(actor, status = 'pending') {
  const app = {
    id: 'application', applicant_id: 'submitter', submitted_by_user_id: 'submitter',
    group_id: 'group', production_team_id: null, status, gig_id: 'gig', member_cv_status: 'ready',
    member_cv_required_count: 3, member_cv_submitted_count: 3, leader_approval_status: 'pending',
    group: { id: 'group', owner_id: 'leader', name: 'Band' }, gig: { id: 'gig', name: 'Gig', organizer_id: 'organizer', event_date: '2099-01-01' },
  };
  const tables = {
    gig_applications: [app], groups: [{ id: 'group', owner_id: 'leader' }],
    group_members: [{ group_id: 'group', user_id: 'member' }],
    profiles: ['leader', 'submitter', 'member', 'stranger', 'former-leader'].map(id => ({ id, role: 'musician' })),
    gigs: [app.gig], notifications: [], gigs_with_stats: [app.gig],
    gig_application_members: ['leader', 'submitter', 'member'].map(user_id => ({ id: user_id, user_id, application_id: app.id, cv_status: 'submitted', cv_storage_path: 'private.pdf' })),
  };
  const client = {
    tables, writes: 0, refreshes: 0,
    auth: { getUser: async () => ({ data: { user: { id: actor } }, error: null }) },
    functions: { invoke: async () => ({ data: null, error: null }) },
    rpc: async name => { if (name === 'refresh_gig_slot_counts') client.refreshes++; return { data: null, error: null }; },
    from(table) {
      const filters = [];
      let update, insert, single = false, head = false;
      const query = {
        select(_, opts) { head = opts?.head; return this; },
        eq(k, v) { filters.push(r => r[k] === v); return this; },
        neq(k, v) { filters.push(r => r[k] !== v); return this; },
        in(k, values) { filters.push(r => values.includes(r[k])); return this; },
        is(k, v) { filters.push(r => (r[k] ?? null) === v); return this; },
        gte() { return this; }, order() { return this; }, limit() { return this; },
        update(values) { update = values; return this; },
        insert(values) { insert = values; return this; },
        maybeSingle() { single = true; return this; }, single() { single = true; return this; },
        then(resolve, reject) {
          return Promise.resolve().then(async () => {
            if (update && client.beforeWrite) await client.beforeWrite();
            const rows = (tables[table] || []).filter(r => filters.every(f => f(r)));
            if (update) { rows.forEach(r => Object.assign(r, update)); client.writes += rows.length; }
            if (insert) tables[table].push(insert);
            return { data: head ? null : structuredClone(single ? rows[0] || null : rows), error: null, count: rows.length };
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return client;
}
const request = body => new Request('https://fixture.invalid/function', { method: 'POST', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const withdraw = handler => handler(request({ action: 'update_status', type_id: 'gig_application', booking_id: 'application', new_status: 'resigned' }));

const db = new PGlite();
after(() => db.close());
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create table gig_applications(id uuid primary key, status text, member_cv_status text, member_cv_required_count int, member_cv_submitted_count int);
  create table gig_application_members(id uuid primary key, application_id uuid, user_id uuid, cv_storage_bucket text, cv_storage_path text,
    cv_filename text, cv_status text default 'pending', ai_review_consent bool, member_verification_consent bool, cv_submitted_at timestamptz, updated_at timestamptz);
  insert into gig_applications values('${uid(10)}','pending','collecting',3,0);
  insert into gig_application_members(id,application_id,user_id) values
    ('${uid(20)}','${uid(10)}','${uid(1)}'),('${uid(21)}','${uid(10)}','${uid(2)}'),('${uid(22)}','${uid(10)}','${uid(3)}');
`);
const migration = 'supabase/migrations/20261007190000_serialize_group_member_cv_submissions.sql';
assert.equal(read(`mobile/${migration}`), read(`web/${migration}`));
await db.exec(read(`mobile/${migration}`));
const submit = (actor, path = `${actor}/gig-applications/${uid(10)}/cv.pdf`) => db.query('select public.submit_group_application_member_cv($1,$2,$3,$4,true,true) as result', [uid(10), actor, path, 'cv.pdf']);

for (const workspace of ['mobile', 'web']) {
  for (const actor of ['leader', 'submitter', 'member', 'stranger', 'former-leader']) {
    test(`${workspace}: pending withdrawal by ${actor} uses authenticated authority`, async () => {
      const client = memoryClient(actor);
      const handler = edgeHandler(`${workspace}/supabase/functions/manage-bookings/index.ts`, client);
      const response = await withdraw(handler);
      const authorized = ['leader', 'submitter'].includes(actor);
      assert.equal(response.status, authorized ? 200 : 403, await response.text());
      assert.equal(client.tables.gig_applications[0].status, authorized ? 'resigned' : 'pending');
      assert.equal(client.writes, authorized ? 1 : 0);
    });
  }
  test(`${workspace}: duplicate and concurrent withdrawal changes the row only once`, async () => {
    const client = memoryClient('leader');
    const handler = edgeHandler(`${workspace}/supabase/functions/manage-bookings/index.ts`, client);
    const results = await Promise.all([withdraw(handler), withdraw(handler)]);
    assert.deepEqual(results.map(r => r.status), [200, 200]);
    assert.equal(client.writes, 1);
    assert.equal(client.refreshes, 1);
    assert.equal((await withdraw(handler)).status, 200);
    assert.equal(client.writes, 1);
  });
  test(`${workspace}: a concurrent acceptance is never overwritten by a pending leader withdrawal`, async () => {
    const client = memoryClient('leader');
    client.beforeWrite = () => { client.tables.gig_applications[0].status = 'accepted'; };
    assert.equal((await withdraw(edgeHandler(`${workspace}/supabase/functions/manage-bookings/index.ts`, client))).status, 409);
    assert.equal(client.writes, 0);
    assert.equal(client.tables.gig_applications[0].status, 'accepted');
  });
  test(`${workspace}: completed applications cannot be withdrawn`, async () => {
    const client = memoryClient('submitter', 'completed');
    assert.equal((await withdraw(edgeHandler(`${workspace}/supabase/functions/manage-bookings/index.ts`, client))).status, 403);
    assert.equal(client.writes, 0);
  });
  test(`${workspace}: accepted applicant withdrawal retains the completion penalty`, async () => {
    const client = memoryClient('submitter', 'accepted');
    const handler = edgeHandler(`${workspace}/supabase/functions/manage-bookings/index.ts`, client);
    const response = await handler(request({ action: 'update_status', type_id: 'gig_application', booking_id: 'application', new_status: 'cancelled' }));
    assert.equal(response.status, 200, await response.text());
    assert.equal(client.tables.gig_applications[0].completion_rate_penalty, true);
    const leader = memoryClient('leader', 'accepted');
    assert.equal((await withdraw(edgeHandler(`${workspace}/supabase/functions/manage-bookings/index.ts`, leader))).status, 403);
  });
  test(`${workspace}: legacy cancellation delegates authenticated withdrawal and sends no second notification`, async () => {
    const client = memoryClient('leader');
    const calls = [];
    client.functions.invoke = async (name, options) => { calls.push({ name, options }); return { data: {}, error: null }; };
    const response = await edgeHandler(`${workspace}/supabase/functions/gig-applications/index.ts`, client)(request({ action: 'cancel_application', applicationId: 'application' }));
    assert.equal(response.status, 200, await response.text());
    assert.equal(calls[0].name, 'manage-bookings');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer fixture');
    assert.equal(calls[0].options.body.new_status, 'cancelled');
    assert.equal(client.writes, 0);
    assert.equal(client.tables.notifications.length, 0);
  });
  test(`${workspace}: withdrawn CV details remain visible but cannot be finalized`, async () => {
    const client = memoryClient('leader', 'resigned');
    const response = await edgeHandler(`${workspace}/supabase/functions/gig-applications/index.ts`, client)(request({ action: 'fetch_group_application_cv_status', applicationId: 'application' }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.can_finalize, false);
    assert.equal(body.members[0].is_current_user, true);
    assert.equal(body.members[1].cv_filename, null);
  });
  test(`${workspace}: incomplete leader submission and non-leader finalization remain blocked`, async () => {
    for (const actor of ['leader', 'member']) {
      const client = memoryClient(actor);
      client.tables.gig_application_members[0].cv_status = 'pending';
      client.tables.gig_application_members[0].cv_storage_path = null;
      const response = await edgeHandler(`${workspace}/supabase/functions/gig-applications/index.ts`, client)(request({ action: 'finalize_group_application', applicationId: 'application' }));
      assert.equal(response.status, actor === 'leader' ? 409 : 403, await response.text());
      assert.equal(client.writes, 0);
    }
  });
  test(`${workspace}: leader can send the complete roster; concurrent withdrawal prevents sending`, async () => {
    for (const concurrentWithdrawal of [false, true]) {
      const client = memoryClient('leader');
      if (concurrentWithdrawal) client.beforeWrite = () => { client.tables.gig_applications[0].status = 'resigned'; };
      const response = await edgeHandler(`${workspace}/supabase/functions/gig-applications/index.ts`, client)(request({ action: 'finalize_group_application', applicationId: 'application' }));
      assert.equal(response.status, concurrentWithdrawal ? 409 : 200, await response.text());
      assert.equal(client.tables.gig_applications[0].member_cv_status, concurrentWithdrawal ? 'ready' : 'complete');
      assert.equal(client.tables.notifications.length, concurrentWithdrawal ? 0 : 2);
    }
  });
  test(`${workspace}: unrelated musicians cannot read the group CV roster`, async () => {
    const client = memoryClient('stranger');
    const response = await edgeHandler(`${workspace}/supabase/functions/gig-applications/index.ts`, client)(request({ action: 'fetch_group_application_cv_status', applicationId: 'application' }));
    assert.equal(response.status, 403);
    assert.equal(client.writes, 0);
  });
  test(`${workspace}: terminal status always wins over stale ready CV tasks`, () => {
    const { getGroupApplicationCvStatusLabel: label, isGroupApplicationCollectingCvs: collecting } = moduleExports(`${workspace}/src/utils/groupApplicationCv.ts`);
    for (const [status, expected] of [['resigned', 'Withdrawn'], ['cancelled', 'Withdrawn'], ['rejected', 'Declined'], ['completed', 'Completed'], ['fired', 'Fired']]) {
      const app = { raw_status: status, status, member_cv_status: 'ready', system_status_reason: 'application_withdrawn' };
      assert.equal(label(app, { can_finalize: true, cv_status: 'submitted' }), expected);
      assert.equal(collecting(app), false);
    }
    assert.equal(label({ raw_status: 'cancelled', status: 'Expired', member_cv_status: 'ready' }), 'Expired');
    assert.equal(label({ raw_status: 'cancelled', status: 'Cancelled', system_status_reason: 'gig_cancelled_by_organizer', member_cv_status: 'ready' }), 'Cancelled');
    assert.equal(label({ raw_status: 'accepted', status: 'Happening Now', member_cv_status: 'complete' }), 'Happening Now');
    const pending = { status: 'pending', member_cv_status: 'collecting', member_cv_required_count: 3, member_cv_submitted_count: 2 };
    assert.equal(label(pending, { cv_status: 'pending', can_finalize: true }), 'Your CV required');
    assert.equal(label(pending, { cv_status: 'submitted' }), 'Waiting for 1 member');
  });
}

const cvUtils = moduleExports('mobile/src/utils/groupApplicationCv.ts');
test('Activity keeps CV-only members read-only and opens the leader CV destination', () => {
  assert.equal(expression('isReadOnlyApplication', { item: { viewer_can_act: false }, isReadOnlyBookingItem: item => !item.viewer_can_act }), true);
  const destinations = [];
  const scope = { memberCvTask: null, isLeaderConfirmation: true, collectingMemberCvs: true, item: { id: 'application' }, router: { push: route => destinations.push(route) }, handleDetailsPress: () => assert.fail('Leader CV review bypassed') };
  expression('openApplicationDetails', scope)();
  assert.equal(destinations[0].pathname, '/group_application_cv');
  assert.equal(destinations[0].params.applicationId, 'application');
});
const cvFormFile = 'mobile/src/components/GroupApplicationCvForm.tsx';
test('leader Send opens the upload modal even with incomplete CVs, without submitting', () => {
  const { node, ast } = findNode(bookingsFile, (n, ast) => ts.isJsxAttribute(n) && n.name.text === 'onPress' && n.initializer?.getText(ast).includes('setSendApplicationId(String(item.id))'));
  const calls = [];
  const click = vm.runInNewContext(compile(`(${node.initializer.expression.getText(ast)})`), {
    collectingMemberCvs: true, item: { id: 'application', member_cv_status: 'collecting' },
    setSendApplicationId: id => calls.push(id),
    setSelectedItem: () => assert.fail('Bypassed CV upload modal'),
    setModalMode: () => assert.fail('Opened direct approval'),
    setModalVisible: () => assert.fail('Opened direct approval'),
  });
  click();
  assert.deepEqual(calls, ['application']);
});

test('modal submission stays disabled for missing CVs, unsaved files, and refreshes', () => {
  const { node, ast } = findNode(cvFormFile, (n, ast) => ts.isJsxAttribute(n) && n.name.text === 'disabled' && n.initializer?.getText(ast).includes('details.can_finalize'));
  const code = node.initializer.expression.getText(ast);
  for (const [can_finalize, file, loading, submitting, expected] of [
    [false, null, false, false, true], [true, {}, false, false, true],
    [true, null, true, false, true], [true, null, false, true, true],
    [true, null, false, false, false],
  ]) {
    assert.equal(vm.runInNewContext(compile(`(${code})`), { details: { can_finalize }, file, loading, submitting }), expected);
  }
});
test('late CV details from a previous application cannot replace current details', async () => {
  let resolveOld;
  let calls = 0;
  const old = new Promise(resolve => { resolveOld = resolve; });
  const values = [];
  const scope = {
    useCallback: fn => fn, applicationId: 'application', isAuthenticated: true, userId: 'leader',
    detailsRequestRef: { current: 0 }, setLoading: () => {}, setDetails: value => values.push(value),
    showAlert: () => assert.fail('Stale request produced an alert'),
    supabase: { functions: { invoke: () => ++calls === 1 ? old : Promise.resolve({ data: { application: { status: 'resigned' } } }) } },
  };
  const load = expression('loadDetails', scope, cvFormFile);
  const oldLoad = load();
  await load();
  resolveOld({ data: { application: { status: 'pending', member_cv_status: 'ready' } } });
  await oldLoad;
  assert.equal(values.length, 1);
  assert.equal(values[0].application.status, 'resigned');
});

test('CV upload in the modal saves only the signed-in member and refreshes Activity', async () => {
  const calls = [];
  const lock = { current: false };
  const scope = {
    isCollecting: true, ownMember: { id: 'leader' }, submittingRef: lock,
    file: { name: 'resume.pdf', uri: 'file:///resume.pdf' }, userId: 'leader', applicationId: 'application',
    assertCvDocument: () => 'application/pdf', sanitizeStorageFileName: value => value,
    setSubmitting: busy => calls.push(['busy', busy]), setFile: file => calls.push(['file', file]),
    setUploaderKey: () => {}, onUpdated: () => calls.push(['activity']),
    loadDetails: async () => calls.push(['refresh']), showAlert: (...args) => calls.push(['alert', ...args]),
    uploadStorageObject: async options => { calls.push(['upload', options]); return { data: { path: options.path }, error: null }; },
    supabase: { functions: { invoke: async (name, options) => { calls.push(['invoke', name, options.body]); return { data: { status: 'ready' }, error: null }; } } },
  };
  await expression('uploadCv', scope, cvFormFile)();
  const upload = calls.find(c => c[0] === 'upload')[1];
  assert.equal(upload.bucket, 'application-cvs');
  assert.equal(upload.documentOnly, true);
  assert.match(upload.path, /^leader\/gig-applications\/application\//);
  const body = calls.find(c => c[0] === 'invoke')[2];
  assert.equal(body.action, 'submit_member_cv');
  assert.equal(body.userId, 'leader');
  assert.equal(body.cvStoragePath, upload.path);
  assert.equal(calls.filter(c => c[0] === 'activity').length, 1);
  assert.equal(lock.current, false);
  assert.equal(calls.at(-1)[1], false);
});

test('modal finalization prevents duplicate sends and releases its lock after a network failure', async () => {
  let resolveSend;
  const send = new Promise(resolve => { resolveSend = resolve; });
  let count = 0;
  const lock = { current: false };
  const alerts = [];
  const scope = {
    isCollecting: true, details: { can_finalize: true }, submittingRef: lock, loading: false, file: null,
    applicationId: 'application', userId: 'leader', setSubmitting: () => {},
    supabase: { functions: { invoke: () => { count++; return send; } } },
    onUpdated: () => {}, loadDetails: async () => {}, showAlert: (...args) => alerts.push(args),
  };
  const finalize = expression('finalizeApplication', scope, cvFormFile);
  const first = finalize();
  await finalize();
  assert.equal(count, 1);
  resolveSend({ data: { status: 'complete' }, error: null });
  await first;
  assert.equal(lock.current, false);
  assert.equal(alerts[0][1], 'Application Sent');
  scope.supabase.functions.invoke = async () => { throw new Error('Network unavailable'); };
  await finalize();
  assert.equal(lock.current, false);
  assert.equal(alerts.at(-1)[1], 'Application Not Sent');
});

test('database submits only the actor CV and serializes roster counts to readiness', async () => {
  const results = await Promise.all([submit(uid(1)), submit(uid(2)), submit(uid(3))]);
  assert.equal(results.filter(r => r.rows[0].result.became_ready).length, 1);
  const state = (await db.query('select * from gig_applications')).rows[0];
  assert.equal(state.member_cv_status, 'ready');
  assert.equal(state.member_cv_submitted_count, 3);
  assert.equal((await submit(uid(1))).rows[0].result.became_ready, false);
  await assert.rejects(submit(uid(4)), /not a member/);
  await assert.rejects(submit(uid(1), `${uid(2)}/gig-applications/${uid(10)}/cv.pdf`), /must belong/);
  await assert.rejects(submit(uid(1), `${uid(1)}/gig-applications/${uid(11)}/cv.pdf`), /must belong/);
});
test('database rejects CV writes after withdrawal or finalization without changing member data', async () => {
  for (const [status, cvStatus] of [['resigned', 'ready'], ['cancelled', 'collecting'], ['pending', 'complete']]) {
    await db.query('update gig_applications set status=$1,member_cv_status=$2', [status, cvStatus]);
    const before = (await db.query('select * from gig_application_members')).rows;
    await assert.rejects(submit(uid(1)), /no longer collecting/);
    assert.deepEqual((await db.query('select * from gig_application_members')).rows, before);
  }
});
test('database CV submission RPC is callable only by the server role', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(submit(uid(1)), /permission denied/);
    await db.exec('reset role');
  }
  const result = await db.query("select has_function_privilege('service_role','public.submit_group_application_member_cv(uuid,uuid,text,text,boolean,boolean)','execute') as allowed");
  assert.equal(result.rows[0].allowed, true);
});
test('organizer visibility and private CV ownership policies still protect incomplete applications', async () => {
  await db.exec(`
    create schema auth; create schema storage;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
    create function staff_can_read_gig(uuid,uuid) returns boolean language sql stable as $$ select false $$;
    create function staff_can_read_production(uuid,uuid) returns boolean language sql stable as $$ select false $$;
    create function staff_can_manage_gig_applications(uuid,uuid) returns boolean language sql stable as $$ select false $$;
    create function staff_can_manage_production_applications(uuid,uuid) returns boolean language sql stable as $$ select false $$;
    create table groups(id uuid primary key,owner_id uuid);
    create table gigs(id uuid primary key,organizer_id uuid);
    create table storage.buckets(id text primary key,name text,public bool,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key,bucket_id text,name text);
    alter table storage.objects enable row level security;
    alter table gig_application_members add column created_at timestamptz default now();
    alter table gig_applications add column gig_id uuid, add column production_team_id uuid;
    alter table gig_applications enable row level security;
    grant usage on schema auth,storage to authenticated;
    grant select on gig_applications,gig_application_members,gigs,storage.objects to authenticated;
    insert into gigs values('${uid(30)}','${uid(4)}');
    insert into storage.objects values('${uid(40)}','application-cvs','${uid(1)}/cv.pdf'),('${uid(41)}','application-cvs','${uid(2)}/cv.pdf');
    update gig_applications set gig_id='${uid(30)}',status='pending',member_cv_status='ready';
  `);
  await db.exec(read('mobile/supabase/migrations/20260928150000_add_group_application_member_cvs.sql'));
  assert.equal((await db.query("select public from storage.buckets where id='application-cvs'")).rows[0].public, false);
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid(4)]);
  assert.equal((await db.query('select * from gig_applications')).rows.length, 0);
  assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid(1)]);
  assert.equal((await db.query('select * from storage.objects')).rows.length, 1);
  await db.exec('reset role');
  await db.exec("update gig_applications set member_cv_status='complete'");
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid(4)]);
  assert.equal((await db.query('select * from gig_applications')).rows.length, 1);
  await db.exec('reset role');
});
