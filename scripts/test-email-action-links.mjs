import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as actions from '../mobile/src/utils/actionLinks.ts';
import * as shares from '../mobile/src/utils/shareLinks.ts';
import * as recovery from '../mobile/src/utils/passwordRecovery.ts';

const id = '9d28c58a-7f1e-4fcb-8091-b8f1b65f79cc';
const compile = file => ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const load = (file, imports = {}, extra = {}) => {
  const exports = {};
  vm.runInNewContext(compile(file), { exports, URL, URLSearchParams,
    require: name => { assert.ok(name in imports, name); return imports[name]; }, ...extra });
  return exports;
};
const appLinks = load('mobile/src/utils/appLinks.ts', { './actionLinks': actions, './shareLinks': shares });
const tick = () => new Promise(resolve => setImmediate(resolve));
const cases = [
  ['/feed', {}], ['/account_details', {}],
  ['/group_application_cv', { applicationId: id }],
  ['/gig_feature_consent', { applicationId: id }], ['/manage_gig', { id, tab: 'Applicants' }],
  ['/bookings', { tab: 'Pending' }], ['/bookings', { tab: 'History' }],
  ['/bookings', { tab: 'Applicants' }],
  ['/bookings', { tab: 'Active Musicians' }],
  ['/production_team', { teamId: id, tab: 'Applications' }],
  ['/wallet', { section: 'outstanding', bookingId: id }], ['/notifications', {}],
  ['/orders', {}], ['/feed', { postId: id }],
  ['/feed', { listingId: id, listingType: 'studio' }],
  ['/group_details', { id }], ['/profile', { userId: id }],
  ['/post_details', { post_id: id }], ['/product_details', { product_id: id }],
  ['/playlist_details', { playlist_id: id }], ['/station_details', { station_id: id }],
];

test('every ordinary action destination survives the HTTPS gateway, native handoff and saved destination', () => {
  for (const [route, params] of cases) {
    const target = route + (Object.keys(params).length ? `?${new URLSearchParams(params)}` : '');
    const link = actions.buildActionEmailUrl({ route, route_params: params });
    assert.equal(new URL(link).protocol, 'https:');
    assert.equal(appLinks.getAppLinkDestination(link), target);
    const native = `musikalokal://action?${new URLSearchParams({ destination: target })}`;
    assert.equal(appLinks.getAppLinkDestination(native), target);
    const saved = appLinks.getAppLinkDestination(target);
    assert.ok(saved);
    if (route === '/production_team') assert.equal(saved, target, 'Applications must survive sign-in');
    assert.ok(!/[#]|token|password|redirect_to/.test(link));
  }
});

test('untrusted, malformed, duplicate, credential-bearing and unsupported action links are rejected', () => {
  for (const target of ['/admin', '//evil.example/x', '/\\evil.example/x', '/group_application_cv',
    '/group_application_cv?applicationId=bad', `/group_application_cv?applicationId=${id}&applicationId=${id}`,
    '/bookings?tab=Admin', '/bookings?retry_payment=' + id, '/notifications?access_token=secret',
    '/wallet#token_hash=secret', '/action?destination=/notifications',
    'https://musika-lokal.vercel.app/bookings', '/password_recovery?token_hash=secret&type=recovery',
    '/feed?listingId=' + id, `/feed?listingId=${id}&listingType=admin`]) {
    assert.equal(actions.normalizeActionDestination(target), null, target);
    const link = `https://musika-lokal.vercel.app/action?${new URLSearchParams({ destination: target })}`;
    assert.equal(appLinks.getAppLinkDestination(link), null, link);
  }
  for (const link of ['https://evil.example/action?destination=/notifications',
    'https://user:pass@musika-lokal.vercel.app/action?destination=/notifications',
    'http://musika-lokal.vercel.app/action?destination=/notifications',
    'https://musika-lokal.vercel.app:8443/action?destination=/notifications',
    '/action?destination=/notifications&destination=/wallet', '/action?destination=/wallet&access_token=secret',
    '/action?destination=/wallet#token_hash=secret', '/action', 'javascript:alert(1)']) {
    assert.equal(appLinks.getAppLinkDestination(link), null, link);
  }
  for (const gateway of ['musikalokal://notifications', 'javascript:alert(1)', 'https://evil.example/action']) {
    assert.equal(new URL(actions.buildActionEmailUrl({ route: '/wallet' }, gateway)).origin, 'https://musika-lokal.vercel.app');
  }
  assert.equal(new URL(actions.buildActionEmailUrl({ route: '/wallet' }, 'https://musikalokal.app')).origin, 'https://musikalokal.app');
});

for (const workspace of ['mobile', 'web']) {
  test(`${workspace}: identity-success sent and queued emails use the authenticated HTTPS entry`, async () => {
    const source = readFileSync(`${workspace}/supabase/functions/didit-webhook/index.ts`, 'utf8');
    const ast = ts.createSourceFile('webhook.ts', source, ts.ScriptTarget.Latest, true);
    const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'sendVerificationEmail');
    assert.ok(declaration);
    const delivered = [], queued = [];
    let sent = true;
    const run = vm.runInNewContext(ts.transpileModule(declaration.getText(ast) + '\nsendVerificationEmail;', {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText, {
      Deno: { env: { get: () => undefined } }, console: { log() {}, error() {} },
      buildActionEmailUrl: actions.buildActionEmailUrl,
      sendEmailWithGmail: async payload => { delivered.push(payload); return { sent }; },
    });
    const admin = { from: () => ({ insert: async payload => { queued.push(payload); return {}; } }) };
    for (const available of [true, false]) {
      sent = available;
      assert.equal(await run(admin, 'fixture@musikalokal.test', 'Fixture', 'Fixture Artist'), true);
    }
    for (const html of [...delivered.map(item => item.html), ...queued.map(item => item.html_content)]) {
      const link = html.match(/href="([^"]+)"/)[1].replaceAll('&amp;', '&');
      assert.equal(new URL(link).protocol, 'https:');
      assert.equal(appLinks.getAppLinkDestination(link), '/feed');
    }
    assert.equal(queued.length, 1);
  });

  test(`${workspace}: production email HTML keeps explicit and inferred action targets in sent and queued messages`, async () => {
    const routes = load(`${workspace}/supabase/functions/_shared/notificationRoutes.ts`);
    const delivered = [], queued = [];
    let gmailSent = true;
    const sender = load(`${workspace}/supabase/functions/_shared/coreActionEmail.ts`, {
      './actionLinks.ts': actions, './notificationRoutes.ts': routes,
      './gmailEmail.ts': { sendEmailWithGmail: async payload => { delivered.push(payload); return { sent: gmailSent, provider: 'gmail_http', error: 'Stubbed unavailable' }; } },
    }, { Deno: { env: { get: key => key === 'CORE_ACTION_EMAIL_APP_URL' ? 'musikalokal://notifications' : undefined } }, console: { error() {} } });
    const client = { from(table) {
      return table === 'profiles' ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { email: 'fixture@musikalokal.test', full_name: 'Fixture' }, error: null }) }) }) }
        : { insert: async payload => { assert.equal(table, 'email_notifications'); queued.push(payload); return { error: null }; } };
    } };
    for (const [route, params] of cases) {
      const result = await sender.sendCoreActionEmailForNotification(client, { user_id: id, title: 'Update', meta: { route, route_params: params } });
      assert.equal(result.sent, true);
      const link = delivered.at(-1).html.match(/href="([^"]+)"/)[1].replaceAll('&amp;', '&');
      assert.equal(appLinks.getAppLinkDestination(link), route + (Object.keys(params).length ? `?${new URLSearchParams(params)}` : ''));
    }
    for (const event_type of ['group_application_member_cv_required', 'group_application_ready_for_leader']) {
      await sender.sendCoreActionEmailForNotification(client, { user_id: id, meta: { event_type, application_id: id } });
      const link = delivered.at(-1).html.match(/href="([^"]+)"/)[1];
      assert.equal(actions.getActionDestination(link), `/group_application_cv?applicationId=${id}`);
    }
    await sender.sendCoreActionEmailForNotification(client, { user_id: id, title: 'Removed from Gig',
      meta: { route: '/bookings', event_type: 'gig_application_fired', status: 'fired', booking_id: id } });
    const removedLink = delivered.at(-1).html.match(/href="([^"]+)"/)[1].replaceAll('&amp;', '&');
    assert.equal(actions.getActionDestination(removedLink), '/bookings?tab=History');
    gmailSent = false;
    const queuedResult = await sender.sendCoreActionEmailForNotification(client, { user_id: id, meta: { route: '/wallet' } });
    assert.equal(queuedResult.queued, true);
    assert.equal(queued.length, 1);
    assert.match(queued[0].html_content, /destination=%2Fwallet/);
  });
}

test('cold and warm ordinary links persist before sign-in while recovery callbacks remain separate', async () => {
  const saved = new Map();
  const intent = load('mobile/app/+native-intent.tsx', {
    '../src/utils/appLinks': appLinks, '../src/utils/passwordRecovery': recovery,
    '@react-native-async-storage/async-storage': { __esModule: true, default: { setItem: async (key, value) => saved.set(key, value) } },
  });
  const link = actions.buildActionEmailUrl({ route: '/group_application_cv', route_params: { applicationId: id } });
  for (const initial of [true, false]) {
    const output = await intent.redirectSystemPath({ path: link, initial });
    assert.equal(saved.get(shares.PENDING_SHARE_STORAGE_KEY), `/group_application_cv?applicationId=${id}`);
    assert.equal(new URL(output, actions.ACTION_GATEWAY_URL).pathname, '/shared');
    const beforeRecovery = saved.size;
    assert.match(await intent.redirectSystemPath({ path: 'https://musika-lokal.vercel.app/recovery#token_hash=stub&type=recovery', initial }), /^\/password_recovery\?/);
    assert.equal(saved.size, beforeRecovery);
  }
});

function authEntry() {
  const effects = [], routes = [], removals = [];
  let auth, destination;
  const screen = load('mobile/app/shared.tsx', {
    react: { useEffect: fn => effects.push(fn) },
    'react/jsx-runtime': { jsx() {} },
    'expo-router': { router: { replace: value => routes.push(value) }, useLocalSearchParams: () => ({ destination }) },
    '@react-native-async-storage/async-storage': { __esModule: true, default: { removeItem: async key => removals.push(key) } },
    '../src/context/AuthContext': { useAuth: () => auth },
    '../src/utils/appLinks': appLinks, '../src/components/LoadingState': { default() {} },
  });
  return { routes, removals, render(value, target) { auth = value; destination = target; effects.length = 0; screen.default(); effects.forEach(fn => fn()); } };
}

test('logged-out and identity-gated destinations survive until the authenticated entry opens them', async () => {
  const view = authEntry();
  const target = `/group_application_cv?applicationId=${id}`;
  const auth = { loading: false, session: { user: { id } }, roleResolved: true, identityChecked: true, identityRequired: false };
  view.render({ ...auth, session: null }, target); assert.equal(view.routes.at(-1), '/');
  view.render({ ...auth, identityRequired: true }, target); assert.equal(view.routes.at(-1), '/identity_verification');
  assert.equal(view.removals.length, 0, 'an unready user cannot consume the saved destination');
  view.render(auth, target); await tick();
  assert.equal(view.routes.at(-1), target);
  assert.equal(view.removals.at(-1), shares.PENDING_SHARE_STORAGE_KEY);
});

test('client, server and standalone gateway copies share the same allowlist and no signup sender changed', () => {
  const source = readFileSync('mobile/src/utils/actionLinks.ts', 'utf8');
  for (const file of ['web/src/utils/actionLinks.ts', 'mobile/supabase/functions/_shared/actionLinks.ts', 'web/supabase/functions/_shared/actionLinks.ts']) {
    assert.equal(readFileSync(file, 'utf8'), source, file);
  }
  const gateway = readFileSync('web/public/share/actionLinks.js', 'utf8');
  assert.equal(gateway, ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
  const mobile = JSON.parse(readFileSync('mobile/app.json'));
  const web = JSON.parse(readFileSync('web/vercel.json'));
  assert.ok(mobile.expo.android.intentFilters.some(filter => filter.autoVerify && filter.data.some(entry => entry.path === '/action')));
  assert.ok(web.rewrites.some(entry => entry.source === '/action' && entry.destination === '/share/index.html'));
  for (const workspace of ['mobile', 'web']) {
    assert.doesNotMatch(readFileSync(`${workspace}/supabase/functions/create-unverified-user/index.ts`, 'utf8'), /actionLinks|buildActionEmailUrl/);
  }
});
