import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const read = path => readFileSync(path, 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const plain = value => JSON.parse(JSON.stringify(value));
function declaration(file, name) {
  const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let result;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) result = node.parent.parent.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(result, name);
  return result;
}
function functions(file, names, scope) {
  return vm.runInNewContext(compile(names.map(name => declaration(file, name)).join('\n')) +
    `\n({${names.join(',')}});`, scope);
}

function signupFixture() {
  const state = { Step: 'verification', Email: 'fixture@example.test', Password: 'fixture-password', SelectedRole: 'musician' };
  const current = { current: { id: 'approved-attempt', nonce: 'approved-nonce' } };
  const alerts = [], calls = [], saved = new Map([['signup_current_session', 'completed attempt']]);
  const stops = [];
  let signupError = { status: 409, responseBody: { duplicateIdentityRejected: true } };
  const noop = () => {};
  const scope = {
    useCallback: fn => fn, currentDiditAttemptRef: current, signupCancellationVersionRef: { current: 0 },
    diditMonitorRef: { current: { stop: () => stops.push(true) } }, diditVerificationReturnHandledRef: { current: false },
    finishAccountCreationRef: { current: false }, email: state.Email, password: state.Password, selectedRole: state.SelectedRole,
    sessionNonce: 'approved-nonce', sessionId: 'approved-attempt', tempSessionRef: '', verificationUrl: 'https://verify.didit.me/approved',
    verificationMode: 'didit', selectedDocumentOption: { key: 'passport', label: 'Passport' }, musicianVideoProof: { uploadId: 'proof' },
    isAllowedSignupRole: () => true, isAdminRole: () => false,
    getDiditFlowStatusFromSession: data => data?.status,
    isFailedDiditFlowStatus: () => false, isSupersededVerificationStatus: () => false,
    isApprovedDiditFlowStatus: status => status === 'APPROVED', isPendingReviewDiditFlowStatus: () => false,
    diditSessionHasApprovedFaceMatch: () => ({ approved: true }), isDiditAccountCreationStatusRejection: () => false,
    createEmailConfirmationRedirectUrl: () => 'https://fixture.invalid/registration-confirmation',
    maskEmailForLog: noop, summarizeErrorForDiditEmailLog: noop, summarizeAuthUserForDiditEmailLog: noop,
    logDiditEmailFlow: noop, logDiditEmailFlowError: noop, logSignupFlow: noop, logSignupFlowError: noop,
    Platform: { OS: 'android' }, router: { setParams: noop, replace: target => calls.push({ redirect: target }) },
    Alert: { alert: (...args) => alerts.push(args) },
    AsyncStorage: { removeItem: async key => saved.delete(key) },
    supabase: { functions: { invoke: async (name, { body }) => {
      calls.push({ name, body });
      if (name === 'create-didit-session') return { data: body.action === 'get_session' ? { status: 'APPROVED', derived: { fullName: 'Fixture' } } : { success: true } };
      return signupError ? { error: signupError } : { data: { user: { id: 'created-user' } } };
    } } },
  };
  for (const key of ['Step', 'Errors', 'Loading', 'VerificationUrl', 'SessionId', 'SessionNonce', 'TempSessionRef', 'DiditCreationError']) {
    scope['set' + key] = value => { state[key] = typeof value === 'function' ? value(state[key] || {}) : value; };
  }
  const production = functions('mobile/app/signup.tsx', ['getFunctionsErrorPayload', 'isDuplicateIdentityRejection',
    'clearDiditSignupSession', 'resetDiditVerificationReturnState', 'finishAccountCreation'], scope);
  return { production, state, current, scope, alerts, calls, saved, stops, setError: error => { signupError = error; } };
}

test('approved Didit followed by duplicate identity returns to details, preserves inputs, and cannot replay account creation', async () => {
  const f = signupFixture();
  await f.production.finishAccountCreation();
  assert.equal(f.state.Step, 'details');
  assert.match(f.state.Errors.role, /another musician account/);
  assert.equal(f.state.Email, 'fixture@example.test');
  assert.equal(f.state.Password, 'fixture-password');
  assert.equal(f.state.SelectedRole, 'musician');
  assert.equal(f.state.VerificationUrl, '');
  assert.equal(f.state.SessionId, '');
  assert.equal(f.state.SessionNonce, '');
  assert.equal(f.saved.size, 0);
  assert.equal(f.stops.length, 1);
  assert.equal(f.scope.diditVerificationReturnHandledRef.current, true);
  assert.equal(f.alerts[0][0], 'Account Exists');
  assert.equal(f.alerts[0][2][0].text, 'OK');
  assert.ok(f.calls.some(call => call.body?.action === 'cancel_session'));
  const before = f.calls.length;
  await f.production.finishAccountCreation();
  assert.equal(f.calls.length, before, 'completed attempt cannot call signup again');
  f.current.current = { id: 'fresh-attempt', nonce: 'fresh-nonce' };
  f.setError(null);
  await f.production.finishAccountCreation();
  assert.equal(f.calls.at(-1).redirect.pathname, '/');
  assert.equal(f.calls.at(-1).redirect.params.accountCreated, 'true');
});

test('ordinary network rejection leaves verification available for an explicit retry', async () => {
  const f = signupFixture();
  f.setError(new Error('Offline'));
  await f.production.finishAccountCreation();
  assert.equal(f.state.Step, 'verification');
  assert.equal(f.current.current.id, 'approved-attempt');
  assert.equal(f.saved.size, 1);
  assert.equal(f.stops.length, 0);
  assert.equal(f.alerts[0][0], 'Creation Failed');
  assert.equal(f.state.Loading, false);
});

const feedFile = 'mobile/app/(tabs)/feed.tsx';
const resolveFeedMediaUrl = value => typeof value === 'string' ? value.trim() : '';
const mediaExports = {};
vm.runInNewContext(compile(read('mobile/src/utils/postMedia.ts')), { exports: mediaExports });
const feed = functions(feedFile, ['FEED_FALLBACK_IMAGES', 'getFeedFallbackImage', 'getFeedImageIdentityKey',
  'getDistinctFeedFallbackImage', 'getDistinctFeedCardImages', 'ensureFeedCardImage', 'normalizeFeedPost',
  'isFeedVenueLikeStudio', 'normalizeFeedAiRecommendationCard', 'getFeedMediaUrls', 'getFeedUploaderAvatarUri'],
{ resolveFeedMediaUrl, normalizePostMedia: mediaExports.normalizePostMedia });

test('AI and local Artist cards retain their profile photo; absent photos and stale stock fields produce no body image', () => {
  const avatar = 'https://fixture.invalid/actual-musician.jpg';
  assert.deepEqual(plain(feed.getDistinctFeedCardImages('Artist', 'artist', [avatar], [avatar])), [avatar]);
  for (const type of ['Artist', 'Profile', 'Musician']) {
    const artist = feed.normalizeFeedAiRecommendationCard({ id: 'artist', type, name: 'Musician', avatar_url: avatar, image: 'old-stock.jpg' });
    assert.equal(artist.image, avatar);
    assert.equal(artist.uploader_avatar, avatar);
    assert.deepEqual(plain(feed.getFeedMediaUrls(artist)), [avatar]);
    const empty = feed.normalizeFeedAiRecommendationCard({ id: 'empty', type, image: 'old-stock.jpg', images: ['old-stock.jpg'] });
    assert.equal(empty.image, null);
    assert.equal(feed.getFeedMediaUrls(empty).length, 0);
    const fallback = feed.ensureFeedCardImage({ id: 'artist', type, uploader_avatar: avatar, images: ['old-stock.jpg'] });
    assert.equal(fallback.image, avatar);
    assert.equal(feed.ensureFeedCardImage({ id: 'empty', type, images: [] }).image, null);
  }
});

test('AI Post cards keep ordered attachments and never synthesize galleries from author avatars', () => {
  const base = { type: 'Post', id: 'post', author: { avatar_url: 'author.jpg' }, image: 'stale.jpg', images: ['stock.jpg'] };
  assert.equal(feed.normalizeFeedAiRecommendationCard({ ...base, media: [] }).images.length, 0);
  const post = feed.normalizeFeedAiRecommendationCard({ ...base, media: [
    { id: 'video', storage_path: 'video.mp4', thumbnail_path: 'video.jpg', display_order: 2 },
    { id: 'photo', storage_path: 'photo.jpg', display_order: 1 },
  ] });
  assert.deepEqual(plain(post.media.map(item => item.id)), ['photo', 'video']);
  assert.deepEqual(plain(feed.getFeedMediaUrls(post)), ['photo.jpg', 'video.jpg']);
});

for (const workspace of ['mobile', 'web']) test(`${workspace}: ranked listing candidates and client headers use their actual uploader, including avatar changes`, async () => {
  let avatar = 'owner-v1.jpg';
  const queried = [];
  const client = { from(table) {
    const filters = [];
    const query = new Proxy({}, { get(_, method) {
      if (method === 'then') return resolve => {
        queried.push({ table, filters });
        const sources = {
          groups_with_stats: [{ id: 'group', owner_id: 'owner', images: ['group-cover.jpg'] }],
          groups: [{ id: 'group' }],
          studios_with_stats: [{ id: 'studio', owner_id: 'owner', type: 'venue', availability: [{ is_open: true }], images: ['studio-cover.jpg'] }],
          gigs_with_stats: [{ id: 'gig', organizer_id: 'organizer', event_date: '2099-01-01', status: 'open', images: ['gig-cover.jpg'] }],
          production_teams: [{ id: 'production', owner_id: 'owner', logo_url: 'team-logo.jpg', open_production_applications: true }],
          profiles: filters.some(([method, key]) => method === 'in' && key === 'id')
            ? [{ id: 'owner', full_name: 'Studio Owner', avatar_url: avatar }, { id: 'organizer', full_name: 'Gig Organizer', avatar_url: 'organizer.jpg' }]
            : [{ id: 'artist', full_name: 'Musician', avatar_url: 'artist.jpg' }],
        };
        resolve({ data: sources[table] || [], error: null });
      };
      return (...args) => { filters.push([method, ...args]); return query; };
    } });
    return query;
  }, rpc: async () => ({ data: [], error: null }) };
  const exports = {};
  vm.runInNewContext(compile(read(`${workspace}/supabase/functions/home-feed/index.ts`)) + '\nexports.fetchCandidates = fetchCandidates;', {
    exports, require: name => name.includes('/http/') ? { serve() {} } : { createClient: () => client }, console,
    Deno: { env: { get: () => '' } },
  });
  async function verify(expected) {
    const candidates = await exports.fetchCandidates(client, true);
    for (const id of ['group', 'studio', 'gig', 'production']) {
      const item = candidates.find(item => item.id === id);
      assert.ok(item, id);
      const card = feed.normalizeFeedAiRecommendationCard(item);
      assert.equal(card.uploader_id, id === 'gig' ? 'organizer' : 'owner');
      assert.equal(feed.getFeedUploaderAvatarUri(card), id === 'gig' ? 'organizer.jpg' : expected);
      assert.equal(card.uploader_name, id === 'gig' ? 'Gig Organizer' : 'Studio Owner');
      assert.ok(!card.images.includes(expected), 'owner photo cannot become the listing body');
    }
    assert.ok(queried.some(query => query.table === 'profiles' && query.filters.some(filter => filter[0] === 'select' && filter[1] === 'id, full_name, avatar_url')));
  }
  await verify('owner-v1.jpg');
  avatar = 'owner-v2.jpg';
  await verify('owner-v2.jpg');
});

for (const workspace of ['mobile', 'web']) test(`${workspace}: Pay Now dismisses the listing and opens Wallet without creating a checkout`, () => {
  const events = [];
  const production = functions(`${workspace}/src/components/listingDetails/StudioBookTab.tsx`, ['openOutstandingWallet'], {
    paymentEligibility: { bookings: [{ id: 'blocking-booking' }] },
    sheetRef: { current: { dismiss: () => events.push('dismiss') } },
    router: { push: target => events.push(plain(target)) },
  });
  production.openOutstandingWallet();
  assert.equal(events[0], 'dismiss');
  assert.equal(events[1].pathname, '/wallet');
  assert.equal(events[1].params.section, 'outstanding');
  assert.equal(events[1].params.bookingId, 'blocking-booking');
  events.length = 0;
  production.openOutstandingWallet([{ id: 'a' }, { id: 'b' }]);
  assert.equal(events[1].params.bookingId, undefined, 'multiple debts remain visible together');
});

test('Wallet explicitly opens full checkout for unpaid bookings and balance checkout after confirmed downpayment', async () => {
  const calls = [], opened = [];
  const production = functions('mobile/app/wallet.tsx', ['handlePayBalance'], {
    setPayingBookingId() {},
    supabase: { auth: { getUser: async () => ({ data: { user: { id: 'payer' } } }) },
      functions: { invoke: async (name, { body }) => { calls.push(body); return { data: { checkout_url: 'https://fixture.invalid/checkout' } }; } } },
    ExpoLinking: { createURL: (route, { queryParams }) => `${route}?${new URLSearchParams(queryParams)}` },
    Linking: { canOpenURL: async () => true, openURL: async url => opened.push(url) },
    Alert: { alert: (...args) => assert.fail(JSON.stringify(args)) },
  });
  assert.equal(calls.length, 0);
  await production.handlePayBalance({ id: 'initial', remaining_balance: 500, final_price: 500 });
  await production.handlePayBalance({ id: 'partial', remaining_balance: 300, final_price: 500, paid_at: '2026-10-07' });
  assert.equal(calls[0].payment_type, 'full');
  assert.equal(calls[1].payment_type, 'balance');
  assert.equal(calls[1].amount, 300);
  assert.match(calls[0].redirect_url, /booking_id=initial/);
  assert.equal(opened.length, 2);
});

test('Wallet waits for the refreshed summary before scrolling to the outstanding section and refetches on focus', () => {
  const file = 'mobile/app/wallet.tsx';
  const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const screen = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'WalletContent');
  const effects = screen.body.statements.filter(ts.isExpressionStatement);
  const scroll = effects.find(node => node.getText(ast).startsWith('useEffect(') && node.getText(ast).includes('scrollRef.current?.scrollTo'));
  const focus = effects.find(node => node.getText(ast).startsWith('useFocusEffect('));
  assert.ok(scroll);
  assert.ok(focus);
  const calls = [];
  const scope = { useEffect: fn => fn(), useCallback: fn => fn, useFocusEffect: fn => fn(),
    walletSection: 'outstanding', outstandingSectionY: 280, walletRefreshKey: 'fresh', loading: false,
    walletSummaryQuery: { isFetching: true }, scrollRef: { current: { scrollTo: target => calls.push(plain(target)) } },
    userId: 'payer', refetchWalletSummary: () => calls.push('refresh'),
  };
  vm.runInNewContext(compile(scroll.getText(ast)), scope);
  assert.equal(calls.length, 0);
  scope.walletSummaryQuery.isFetching = false;
  vm.runInNewContext(compile(scroll.getText(ast)), scope);
  assert.deepEqual(calls[0], { y: 280, animated: true });
  scope.walletSection = undefined;
  vm.runInNewContext(compile(scroll.getText(ast)), scope);
  assert.equal(calls.length, 1);
  vm.runInNewContext(compile(focus.getText(ast)), scope);
  assert.equal(calls.at(-1), 'refresh');
});
