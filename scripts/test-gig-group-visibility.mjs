import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const compile = path => ts.transpileModule(readFileSync(path, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

for (const app of ['mobile', 'web']) {
  const backend = compile(`${app}/supabase/functions/gig-applications/index.ts`);
  function handler({ user = 'owner', staffLevel = null, validToken = true } = {}) {
    const rows = [
      { id: 'duo', gig_id: 'gig', gig: { organizer_id: 'owner' }, group_id: 'group', status: 'pending', member_cv_status: 'ready', member_cv_submitted_count: 2, member_cv_required_count: 2, leader_approval_status: 'approved', group: { name: 'Fantastic duo' }, cv_url: 'private-cv', video_url: 'private-video' },
      { id: 'solo', gig_id: 'gig', status: 'pending', member_cv_status: 'not_required', applicant: { full_name: 'Bea Navarro' } },
      { id: 'collecting', gig_id: 'gig', status: 'pending', group_id: 'other-group', member_cv_status: 'collecting', leader_approval_status: 'approved' },
    ];
    let invoke;
    let ranked = [];
    const client = {
      auth: { getUser: async () => ({ data: { user: validToken ? { id: user } : null } }) },
      rpc: async () => ({ data: staffLevel, error: null }),
      from(table) {
        const filters = [];
        let single = false;
        const query = new Proxy({}, { get(_, method) {
          if (method === 'then') return resolve => {
            let data = table === 'gigs' ? { id: 'gig', organizer_id: 'owner' }
              : table === 'staff_listing_access' ? (staffLevel ? { access_level: staffLevel } : null)
              : table === 'profiles' ? { role: 'venue-owner' }
              : table === 'gig_applications' ? rows.filter(row => filters.every(([field, values]) => values.includes(row[field]))) : [];
            if (single && Array.isArray(data)) data = data[0] || null;
            resolve({ data, error: null });
          };
          return (...args) => {
            if (method === 'eq') filters.push([args[0], [args[1]]]);
            if (method === 'in') filters.push(args);
            if (method === 'single' || method === 'maybeSingle') single = true;
            return query;
          };
        } });
        return query;
      },
    };
    vm.runInNewContext(backend + `
      hydrateLegacyApplicationFields = async (_, data) => data;
      attachGigApplicationRecommendations = async (_, __, data) => { recordRanked(data); return data; };
      attachPriorApplicationCounts = async (_, __, data) => data;
    `, {
      exports: {}, require: () => ({ createClient: () => client }), console, Response,
      recordRanked: data => { ranked = data; },
      Deno: { env: { get: key => key === 'AI_REVIEW_ADMIN_SECRET' ? '' : 'fixture' }, serve: value => { invoke = value; } },
    });
    return { ranked: () => ranked, invoke: body => invoke(new Request('https://fixture.invalid', {
      method: 'POST', headers: { Authorization: 'Bearer test-token' }, body: JSON.stringify(body),
    })) };
  }

  test(`${app}: organizer sees ready and collecting groups without private documents or premature scoring`, async () => {
    const fixture = handler();
    const response = await fixture.invoke({ action: 'fetch_gig_applications', gigId: 'gig' });
    assert.equal(response.status, 200);
    const rows = await response.json();
    assert.deepEqual(rows.map(row => row.id), ['duo', 'solo', 'collecting']);
    assert.equal(rows[0].group.name, 'Fantastic duo');
    assert.equal(rows[0].member_cv_submitted_count, 2);
    assert.equal(rows[0].ai_recommendation, null);
    assert.deepEqual(Array.from(fixture.ranked(), row => row.id), ['solo']);
    for (const row of rows) {
      assert.ok(!('cv_url' in row));
      assert.ok(!('video_url' in row));
    }
    assert.equal((await fixture.invoke({ action: 'fetch_gig_application_details', applicationId: 'duo' })).status, 409);
    assert.equal((await fixture.invoke({ action: 'update_application_status', applicationId: 'duo', status: 'accepted' })).status, 409);
  });

  test(`${app}: applicant summaries remain restricted to organizer or authorized venue staff`, async () => {
    for (const options of [{ user: 'stranger' }, { user: 'staff', staffLevel: 3 }]) {
      assert.equal((await handler(options).invoke({ action: 'fetch_gig_applications', gigId: 'gig' })).status, 403);
    }
    assert.equal((await handler({ validToken: false }).invoke({ action: 'fetch_gig_applications', gigId: 'gig' })).status, 401);
    assert.equal((await handler({ user: 'staff', staffLevel: 2 }).invoke({ action: 'fetch_gig_applications', gigId: 'gig' })).status, 200);
  });

  function hookFixture() {
    const pending = [];
    const state = [];
    let stateIndex = 0;
    let effect;
    let cleanup;
    let dependencies;
    let foreground;
    const exports = {};
    const React = {
      useState(initial) {
        const index = stateIndex++;
        if (!(index in state)) state[index] = initial;
        return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
      },
      useEffect(callback, nextDependencies) {
        if (!dependencies || nextDependencies.some((value, i) => value !== dependencies[i])) {
          effect = callback; dependencies = nextDependencies;
        }
      },
    };
    const query = new Proxy({}, { get(_, method) {
      if (method === 'maybeSingle') return () => new Promise(resolve => pending.push(resolve));
      return () => query;
    } });
    vm.runInNewContext(compile(`${app}/src/hooks/useGroupGigApplication.ts`), {
      exports, require: name => name === 'react' ? React : name === 'react-native'
        ? { AppState: { addEventListener: (_, listener) => { foreground = listener; return { remove() {} }; } } }
        : { supabase: { from: () => query } },
    });
    const render = (groupId = 'group') => {
      stateIndex = 0;
      const value = exports.useGroupGigApplication('gig', groupId, 'me');
      if (effect) { cleanup?.(); cleanup = effect(); effect = null; }
      return value;
    };
    return { pending, render, foreground: () => foreground('active') };
  }
  const flush = () => new Promise(resolve => setImmediate(resolve));

  test(`${app}: same submitter and other members both see Group Already Applied`, async () => {
    for (const applicant_id of ['me', 'other-member']) {
      const fixture = hookFixture();
      assert.equal(fixture.render().groupApplicationChecking, true);
      fixture.pending.shift()({ data: { id: 'application', applicant_id, status: 'pending', profiles: { full_name: 'Member' } }, error: null });
      await flush();
      assert.equal(fixture.render().groupAlreadyApplied, true);
      assert.equal(fixture.render().groupApplicationBy, applicant_id === 'me' ? 'you' : 'Member');
      fixture.render('different-group');
      assert.equal(fixture.render('different-group').groupAlreadyApplied, false);
      assert.equal(fixture.render('different-group').groupApplicationChecking, true);
    }
  });

  test(`${app}: switching groups ignores stale checks; errors and foreground refresh block submission during checking`, async () => {
    const fixture = hookFixture();
    fixture.render('first');
    assert.equal(fixture.render('second').groupApplicationChecking, true);
    fixture.pending.shift()({ data: { id: 'stale', applicant_id: 'me' }, error: null });
    await flush();
    assert.equal(fixture.render('second').groupAlreadyApplied, false);
    assert.equal(fixture.render('second').groupApplicationChecking, true);
    fixture.pending.shift()({ data: null, error: new Error('offline') });
    await flush();
    assert.ok(fixture.render('second').groupApplicationCheckError);
    fixture.foreground();
    assert.equal(fixture.render('second').groupApplicationChecking, true);
    fixture.pending.shift()({ data: null, error: null });
    await flush();
    assert.equal(fixture.render('second').groupApplicationChecking, false);
    assert.equal(fixture.render('second').groupApplicationCheckError, null);
  });
}
