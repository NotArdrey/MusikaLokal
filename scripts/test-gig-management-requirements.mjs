import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
import * as matching from '../mobile/supabase/functions/_shared/gigMemberRequirementMatching.ts';
import * as genres from '../mobile/supabase/functions/_shared/submittedGenreFit.ts';
import * as routes from '../mobile/supabase/functions/_shared/notificationRoutes.ts';
import * as shareLinks from '../mobile/src/utils/shareLinks.ts';

const read = path => readFileSync(path, 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function loadBackend(root, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(compile(read(`${root}/supabase/functions/gig-applications/index.ts`) +
    '\nexport { evaluateGigApplication, normalizeRecommendationSettings, attachGigApplicationRecommendations, notifyGigFeatureConsentRequest };'), {
    exports, console, Deno: { serve() {}, env: { get() {} } },
    require: name => name.endsWith('gigMemberRequirementMatching.ts') ? matching
      : name.endsWith('submittedGenreFit.ts') ? genres
      : name.endsWith('notificationRoutes.ts') ? routes
      : dependencies[name.split('/').at(-1)] || {},
  });
  return exports;
}

for (const root of ['mobile', 'web']) {
  const helpers = loadBackend(root);
  const settings = helpers.normalizeRecommendationSettings({
    enabled: true, location_radius_km: null,
    criteria: { instruments: 'required', genres: 'ignore', portfolio: 'ignore', location: 'ignore' },
  });
  const application = profile => ({
    id: id(1), gig_id: id(2), status: 'pending', applicant: { skills: ['Guitar'], ...profile },
  });

  test(`${root}: only approved verified profiles matching required criteria are recommended; decisions stay manual`, () => {
    for (const status of ['APPROVED', 'verified', ' Approved ']) {
      const app = application({ is_verified: true, verification_status: status });
      const before = structuredClone(app);
      const result = helpers.evaluateGigApplication(app, { required_instruments: ['Guitar'] }, settings);
      assert.equal(result.recommendation_status, 'recommended');
      assert.equal(result.is_verified, true);
      assert.equal(result.is_eligible, true);
      assert.deepEqual(app, before);
    }
    for (const profile of [
      {}, { is_verified: false, verification_status: 'APPROVED' },
      { is_verified: true, verification_status: 'PENDING' },
      { is_verified: true, verification_status: 'REJECTED' },
    ]) {
      const result = helpers.evaluateGigApplication(application(profile), { required_instruments: ['Guitar'] }, settings);
      assert.equal(result.score, 100);
      assert.equal(result.is_eligible, false);
      assert.equal(result.recommendation_status, 'needs_review');
      assert.ok(result.criteria_snapshot.recommendation_reason_codes.includes('applicant_identity_not_verified'));
    }
    const mismatch = helpers.evaluateGigApplication(application({
      is_verified: true, verification_status: 'APPROVED',
    }), { required_instruments: ['Drums'] }, settings);
    assert.equal(mismatch.recommendation_status, 'not_eligible');
    assert.equal(mismatch.score, 0);
  });

  test(`${root}: media evidence cannot turn an unverified profile into a recommendation`, async () => {
    const genreSettings = helpers.normalizeRecommendationSettings({
      enabled: true, location_radius_km: null,
      criteria: { genres: 'required', instruments: 'ignore', location: 'ignore', portfolio: 'ignore' },
    });
    const item = helpers.evaluateGigApplication(application({}), { genres: ['Rock'] }, genreSettings);
    const finding = source => ({
      criterion: 'genre_requirement', source, result: 'supported',
      short_reason: 'Rock performance confirmed',
      evidence: [{ source, observation: 'Rock performance', timestamp_seconds: null }],
    });
    const review = { application_id: id(1), status: 'completed',
      cv_result: { evidence: [finding('cv')] },
      video_result: { evidence: [finding('performance_video')] } };
    const client = { from: () => ({ select: () => ({ in: async () => ({ data: [review], error: null }) }) }) };
    const [result] = await helpers.addAdvisoryMediaReviewSummaries(client, [item]);
    assert.equal(result.score, 100);
    assert.equal(result.recommendation_status, 'needs_review');
    assert.equal(result.is_eligible, false);
    assert.equal(result.criteria_snapshot.fit_recommendation_status, 'recommended');
  });

  test(`${root}: recommendation refresh only writes audit results, never acceptance`, async () => {
    const writes = [];
    const client = { from(table) {
      if (table === 'gig_requirements') return { select: () => ({ eq: async () => ({
        data: [
          { requirement_key: 'ai_recommendation_settings', requirement_value: settings },
          { requirement_key: 'required_instruments', requirement_value: ['Guitar'] },
        ], error: null,
      }) }) };
      if (table === 'gigs') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {}, error: null }) }) }) };
      if (table === 'gig_application_ai_reviews') return { select: () => ({ in: async () => ({ data: [], error: null }) }) };
      assert.equal(table, 'gig_application_recommendations');
      return { upsert: async rows => { writes.push(...rows); return { error: null }; } };
    }};
    const app = application({ is_verified: true, verification_status: 'APPROVED' });
    const [result] = await helpers.attachGigApplicationRecommendations(client, id(2), [app], false);
    assert.equal(result.status, 'pending');
    assert.equal(result.ai_recommendation.recommendation_status, 'recommended');
    assert.equal(writes.length, 1);
    assert.equal('status' in writes[0], false);
  });

  test(`${root}: applicant totals include decided submissions, omit preparations, and expose no private records`, async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create role anon; create role authenticated;
        create schema auth;
        create function auth.uid() returns uuid language sql stable as $$
          select nullif(current_setting('fixture.uid',true),'')::uuid $$;
        grant usage on schema public,auth to anon,authenticated;
        create table profiles(id uuid primary key,role text);
        create table gig_applications(id uuid primary key,gig_id uuid,status text,
          leader_approval_status text,member_cv_status text,cv_url text default 'private-cv');
        insert into profiles values('${id(3)}','musician'),('${id(4)}','fan');
        insert into gig_applications(id,gig_id,status,member_cv_status) values
          ${['pending','accepted','approved','rejected','declined','completed','fired','cancelled','resigned'].map((status,i) =>
            `('${id(10+i)}','${id(2)}','${status}','not_required')`).join(',')};
        insert into gig_applications(id,gig_id,status,leader_approval_status,member_cv_status) values
          ('${id(30)}','${id(2)}','pending','approved','complete'),
          ('${id(31)}','${id(2)}','pending','approved','collecting'),
          ('${id(32)}','${id(2)}','pending','approved','ready'),
          ('${id(33)}','${id(2)}','pending','pending','complete'),
          ('${id(34)}','${id(2)}','rejected','rejected','complete'),
          ('${id(35)}','${id(99)}','pending',null,'not_required');
      `);
      await db.exec(read(`${root}/supabase/migrations/20261008180000_count_submitted_gig_applications.sql`));
      await db.exec(`set fixture.uid='${id(3)}';set role authenticated;`);
      const counts = async () => (await db.query(
        'select * from get_visible_gig_application_counts($1)', [[id(2)]] )).rows;
      const [total] = await counts();
      assert.equal(Number(total.applicant_count), 10);
      assert.deepEqual(Object.keys(total).sort(), ['applicant_count','gig_id']);
      await assert.rejects(db.query('select * from gig_applications'), /permission denied/);
      await db.exec(`set fixture.uid='${id(4)}';`);
      assert.equal((await counts()).length, 0);
      await db.exec(`set fixture.uid='';`);
      assert.equal((await counts()).length, 0);
      await db.exec('reset role;set role anon;');
      await assert.rejects(counts(), /permission denied/);
    } finally { await db.close(); }
  });

  test(`${root}: consent notification reaches the accepted performer and group members with the correct response destination`, async () => {
    const notifications = [];
    const app = { id: id(1), gig_id: id(2), applicant_id: id(3), gig: { name: 'Company showcase' } };
    const h = loadBackend(root, {
      'gigApplicationAudience.ts': { resolveGigApplicationAudience: async () => ({
        application: app, audience: [
          { user_id: id(3), viewer_access: 'applicant' },
          { user_id: id(4), viewer_access: 'group_member' },
          { user_id: id(5), viewer_access: 'organizer' },
        ],
      }) },
      'coreActionEmail.ts': { scheduleCoreActionEmailForNotification() {} },
    });
    const client = { from(table) {
      if (table === 'notifications') return { insert: async payload => { notifications.push(payload); return { error: null }; } };
      assert.equal(table, 'gig_applications');
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: app, error: null }) }) }) };
    }};
    await h.notifyGigFeatureConsentRequest(client, app.id);
    assert.deepEqual(notifications.map(n => n.user_id), [id(3),id(4)]);
    for (const notification of notifications) {
      assert.equal(notification.meta.route, '/gig_feature_consent');
      assert.equal(notification.meta.route_params.applicationId, app.id);
      assert.equal(notification.meta.event_type, 'gig_feature_consent_requested');
      assert.match(notification.message, /Company showcase/);
    }
    assert.equal(app.show_on_gig_page, undefined);
  });
}

test('managed gigs share their public HTTPS link and title through the native social sharing menu', async () => {
  const calls = [];
  const exports = {};
  vm.runInNewContext(compile(read('mobile/src/utils/shareListing.ts')), {
    exports, require: name => name === 'react-native'
      ? { Share: { share: async payload => { calls.push(payload); } } } : shareLinks,
  });
  await exports.shareListing(id(2), 'Company showcase', 'Gig');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, shareLinks.buildListingShareUrl(id(2), 'gig'));
  assert.ok(calls[0].url.startsWith('https://'));
  assert.match(calls[0].message, /Company showcase/);
  assert.ok(calls[0].message.includes(calls[0].url));
});
