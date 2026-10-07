import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const compile = file => ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
const config = { url: 'https://fixture.supabase.co', anonKey: 'public-fixture' };
const jwt = (claims = {}) => `header.${Buffer.from(JSON.stringify({
  sub: 'reset-user', iss: config.url + '/auth/v1', exp: Math.floor(Date.now()/1000) + 3600,
  amr: [{ method: 'otp' }], ...claims,
})).toString('base64url')}.signature`;

function load(workspace, fetch) {
  const exports = {};
  vm.runInNewContext(compile(`${workspace}/src/utils/passwordRecovery.ts`), { exports, URL, URLSearchParams, fetch, atob, Date });
  return exports;
}

for (const workspace of ['mobile', 'web']) {
  test(`${workspace}: query, fragment, split fields and legacy callbacks normalize without trusting the recovery marker`, () => {
    const flow = load(workspace);
    for (const raw of [
      'https://musika-lokal.vercel.app/recovery#token_hash=abc&type=recovery',
      'https://musika-lokal.vercel.app/recovery?token_hash=abc&type=recovery',
      'musikalokal://change_password?type=recovery#token_hash=abc',
      'musikalokal:///password_recovery?token_hash=abc&type=recovery',
    ]) assert.equal(flow.parseRecoveryUrl(raw).tokenHash, 'abc');
    const pair = flow.parseRecoveryUrl('musikalokal://change_password#access_token=one&refresh_token=two&type=recovery');
    assert.equal(pair.accessToken, 'one'); assert.equal(pair.refreshToken, 'two');
    for (const fields of ['type=recovery', 'type=recovery&access_token=a', 'type=recovery&error=expired',
      'type=recovery&type=signup&token_hash=abc', 'type=recovery&token_hash=a&access_token=b&refresh_token=c', 'type=recovery&code=unknown']) {
      assert.equal(flow.parseRecoveryUrl(`https://musika-lokal.vercel.app/recovery?${fields}`).kind, 'invalid');
    }
    for (const raw of ['https://evil.example/recovery?type=recovery&token_hash=x',
      'https://musika-lokal.vercel.app.evil.example/recovery?type=recovery&token_hash=x',
      'https://user:pass@musika-lokal.vercel.app/recovery?type=recovery&token_hash=x',
      'https://musika-lokal.vercel.app:8443/recovery?type=recovery&token_hash=x',
      'musikalokal://payment-result?type=recovery', 'musikalokal://change_password', '/feed?postId=one']) {
      assert.equal(flow.getPasswordRecoveryRoute(raw), null);
    }
  });

  test(`${workspace}: hash verification establishes a server-validated isolated session and rejects reused links`, async () => {
    const calls = []; let used = false;
    const flow = load(workspace, async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/verify')) {
        assert.deepEqual(JSON.parse(options.body), { token_hash: 'once', type: 'recovery' });
        if (used) return Response.json({}, { status: 403 });
        used = true; return Response.json({ access_token: jwt() });
      }
      return Response.json({ id: 'reset-user', email: 'fixture@musikalokal.test' });
    });
    const session = await flow.establishRecoverySession(config, { kind: 'hash', tokenHash: 'once' });
    assert.equal(session.userId, 'reset-user'); assert.equal(calls.length, 2);
    assert.ok(calls[1].options.headers.Authorization.startsWith('Bearer header.'));
    await assert.rejects(flow.establishRecoverySession(config, { kind: 'hash', tokenHash: 'once' }), /invalid, expired, or already used/);
    await assert.rejects(flow.establishRecoverySession(config, { kind: 'invalid' }), /invalid, expired, or already used/);
    assert.equal(calls.length, 3, 'a recovery marker alone makes no auth call');
  });

  test(`${workspace}: implicit callbacks require server validation and a signed email credential, excluding ordinary logins`, async () => {
    const flow = load(workspace, async () => Response.json({ id: 'reset-user' }));
    const token = accessToken => ({ kind: 'tokens', accessToken, refreshToken: 'refresh' });
    assert.equal((await flow.establishRecoverySession(config, token(jwt()))).userId, 'reset-user');
    for (const claims of [{ amr: [{ method: 'password' }] }, { amr: [] }, { sub: 'other-user' },
      { iss: 'https://evil.example/auth/v1' }, { exp: 1 }]) {
      await assert.rejects(flow.establishRecoverySession(config, token(jwt(claims))), /invalid, expired, or already used/);
    }
    const rejected = load(workspace, async () => Response.json({}, { status: 401 }));
    await assert.rejects(rejected.establishRecoverySession(config, token(jwt())), /invalid, expired, or already used/);
  });

  test(`${workspace}: mismatches never update a password; successful updates revoke recovery sessions`, async () => {
    const calls = [];
    const flow = load(workspace, async (url, options) => { calls.push({ url, options });
      return options.method === 'POST' ? new Response(null, { status: 204 }) : Response.json({ id: 'reset-user' }); });
    const session = { accessToken: jwt(), userId: 'reset-user' };
    await assert.rejects(flow.updateRecoveryPassword(config, session, '123', '123'), /at least 6/);
    await assert.rejects(flow.updateRecoveryPassword(config, session, '123456', '654321'), /do not match/);
    assert.equal(calls.length, 0);
    await flow.updateRecoveryPassword(config, session, 'new-password', 'new-password');
    await flow.signOutRecoverySession(config, session);
    assert.equal(calls[0].options.method, 'PUT'); assert.deepEqual(JSON.parse(calls[0].options.body), { password: 'new-password' });
    assert.ok(calls[1].url.endsWith('/logout?scope=global'));
    assert.equal(calls[0].options.headers.Authorization, calls[1].options.headers.Authorization);
  });

  test(`${workspace}: transient errors preserve the distinction from invalid credentials`, async () => {
    for (const [status, message] of [[429, /Too many attempts/], [503, /unavailable/]]) {
      const flow = load(workspace, async () => Response.json({}, { status }));
      await assert.rejects(flow.establishRecoverySession(config, { kind: 'hash', tokenHash: 'x' }), message);
    }
  });

  test(`${workspace}: password-policy errors preserve the valid recovery form`, async () => {
    for (const [code,message] of [['weak_password',/stronger password/],['same_password',/different from your current/]]) {
      const flow=load(workspace,async()=>Response.json({code},{status:422}));
      await assert.rejects(flow.updateRecoveryPassword(config,{accessToken:jwt(),userId:'reset-user'},'new-password','new-password'),message);
    }
  });

  test(`${workspace}: reset-email handler pins the published callback and puts only a hash in the fragment`, async () => {
    let handler, generated, delivered;
    const admin = { auth: { admin: {
      listUsers: async () => ({ data: { users: [{ email: 'fixture@musikalokal.test' }] }, error: null }),
      generateLink: async options => { generated = options; return { data: { properties: { hashed_token: 'one-time-hash', action_link: 'https://wrong.example' } }, error: null }; },
    } } };
    vm.runInNewContext(compile(`${workspace}/supabase/functions/account-email/index.ts`), {
      exports: {}, Response, URLSearchParams, console: { log() {}, error() {} }, Deno: { env: { get: () => 'fixture' } },
      require: name => name.includes('/http/') ? { serve: value => { handler = value; } }
        : name.includes('gmailEmail') ? { sendEmailWithGmail: async options => { delivered = options; return { sent: true, provider: 'fixture' }; } }
          : { createClient: () => admin },
    });
    const response = await handler(new Request('https://fixture.invalid', { method: 'POST', body: JSON.stringify({
      action: 'send_password_reset', email: 'fixture@musikalokal.test', redirectTo: 'https://evil.example',
    }) }));
    assert.equal(response.status, 200);
    assert.equal(generated.options.redirectTo, 'https://musika-lokal.vercel.app/recovery');
    assert.ok(delivered.html.includes('https://musika-lokal.vercel.app/recovery#token_hash=one-time-hash&amp;type=recovery'));
    assert.ok(!delivered.html.includes('https://wrong.example'));
    assert.ok(!delivered.html.includes('https://evil.example'));
  });
}

test('native cold and warm callbacks enter the dedicated recovery screen without persisting credentials', async () => {
  const flow = load('mobile'); const exports = {};
  vm.runInNewContext(compile('mobile/app/+native-intent.tsx'), {
    exports, require: name => name.includes('passwordRecovery') ? flow : name.includes('shareLinks') ? { getShareDestination: () => null }
      : { default: { setItem() { throw new Error('Recovery must not persist credentials'); } } },
  });
  for (const initial of [true, false]) {
    for (const prefix of ['https://musika-lokal.vercel.app/recovery', 'musikalokal://change_password']) {
      const route = await exports.redirectSystemPath({ path: prefix + '#token_hash=fresh&type=recovery', initial });
      assert.equal(route, '/password_recovery?type=recovery&token_hash=fresh');
    }
  }
});

const tick = () => new Promise(resolve => setImmediate(resolve));

function nativeScreen() {
  const slots = [], requests = [], updates = [], signouts = [], routes = [];
  let cursor = 0, effects = [], params = { type: 'recovery', token_hash: 'first' }, updateGate;
  const react = {
    createElement(type, props, ...children) { return { type, props: { ...props, children } }; },
    useState(initial) { const index = cursor++; slots[index] ??= { value: initial }; return [slots[index].value, value => { slots[index].value = value; }]; },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useEffect(fn, deps) {
      const index = cursor++; const slot = slots[index] ??= {};
      if (!slot.deps || deps.some((v,i) => v !== slot.deps[i])) {
        slot.cleanup?.(); slot.deps = deps; slot.effect = fn; effects.push(() => { slot.cleanup = fn(); });
      }
    },
  };
  const utils = load('mobile');
  const flow = { ...utils,
    establishRecoverySession(_config, credential, signal) {
      return new Promise((resolve, reject) => requests.push({ credential, signal, resolve, reject }));
    },
    async updateRecoveryPassword(_config, session, password, confirmation) { updates.push({ session, password, confirmation }); if (updateGate) await updateGate; },
    async signOutRecoverySession(_config, session) { signouts.push(session); },
  };
  const exports = {};
  vm.runInNewContext(compile('mobile/app/password_recovery.tsx'), {
    exports, URLSearchParams, AbortController,
    require: name => name === 'react' ? react
      : name === 'expo-router' ? { useLocalSearchParams: () => params, router: { replace: route => routes.push(route) } }
      : name === 'react-native' ? { StyleSheet: { create: value => value }, ActivityIndicator: 'Spinner', ScrollView: 'Scroll', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button', View: 'View' }
      : name.includes('safe-area') ? { SafeAreaView: 'SafeArea' }
      : name.includes('ThemeContext') ? { useTheme: () => ({ colors: {} }) }
      : name.includes('/tokens') ? { typography: {} }
      : name.includes('passwordRecovery') ? flow
      : { supabaseUrl: config.url, supabaseAnonKey: config.anonKey,
        supabase: { auth: { async signOut(options) { signouts.push(options); return {}; } } },
        async clearSupabaseAuthStorage() { signouts.push('local-storage-cleared'); } },
  });
  function flatten(node) {
    if (Array.isArray(node)) return node.flatMap(flatten);
    if (!node || typeof node !== 'object') return [];
    return [node, ...flatten(node.props?.children)];
  }
  return {
    requests, updates, signouts, routes,
    holdUpdate(promise) { updateGate=promise; },
    render(next = params) { params = next; cursor = 0; effects = []; const tree = exports.default(); effects.forEach(fn=>fn()); return flatten(tree); },
    replayEffects() { for (const slot of slots.filter(slot=>slot?.effect)) { slot.cleanup?.(); slot.cleanup=slot.effect(); } },
    unmount() { slots.forEach(slot=>slot?.cleanup?.()); },
  };
}

test('native effect replay verifies once; superseded callbacks and unmounted screens cannot restore recovery', async () => {
  const view = nativeScreen(); view.render();
  view.replayEffects(); assert.equal(view.requests.length, 1);
  view.render({ type: 'recovery', token_hash: 'second' });
  assert.equal(view.requests[0].signal.aborted, true);
  view.requests[0].resolve({ userId: 'old-user' }); await tick();
  assert.equal(view.render().filter(n=>n.type==='Input').length, 0);
  view.requests[1].resolve({ userId: 'reset-user' }); await tick();
  assert.equal(view.render().filter(n=>n.type==='Input').length, 2);
  view.render({ type: 'recovery', token_hash: 'third' }); view.unmount();
  view.requests[2].resolve({ userId: 'unmounted-user' }); await tick();
  assert.equal(view.updates.length, 0);
});

test('native invalid recovery cannot use another signed-in session; a successful reset signs out locally', async () => {
  const view = nativeScreen(); view.render({ type: 'recovery' });
  assert.equal(view.requests[0].credential.kind, 'invalid');
  view.requests[0].reject(new Error(RECOVERY_LINK_ERROR)); await tick();
  assert.equal(view.render().filter(n=>n.type==='Input').length, 0);
  assert.equal(view.signouts.length, 0);
  view.render({ type: 'recovery', token_hash: 'valid' });
  view.requests[1].resolve({ userId: 'reset-user', accessToken: 'isolated-token' }); await tick();
  const inputs = view.render().filter(n=>n.type==='Input');
  inputs[0].props.onChangeText('new-password'); inputs[1].props.onChangeText('new-password');
  const button = view.render().find(n=>n.type==='Button');
  const first=button.props.onPress(); const duplicate=button.props.onPress();
  await Promise.all([first,duplicate]);
  assert.equal(view.updates.length, 1);
  assert.equal(view.updates[0].session.userId, 'reset-user');
  assert.equal(view.signouts[0].userId, 'reset-user');
  assert.equal(view.signouts[1].scope, 'local');
  assert.equal(view.signouts[2], 'local-storage-cleared');
  assert.equal(view.render().filter(n=>n.type==='Input').length, 0);
  view.render().find(n=>n.type==='Button').props.onPress();
  assert.deepEqual(view.routes, ['/']);
});

test('a superseded native save releases its busy state without signing out the newer recovery session', async () => {
  const view=nativeScreen();view.render();view.requests[0].resolve({userId:'first-user'});await tick();
  const inputs=view.render().filter(n=>n.type==='Input');
  inputs.forEach(n=>n.props.onChangeText('new-password'));
  let release;view.holdUpdate(new Promise(resolve=>{release=resolve;}));
  const pending=view.render().find(n=>n.type==='Button').props.onPress();
  view.render({type:'recovery',token_hash:'second'});view.requests[1].resolve({userId:'second-user'});await tick();
  release();await pending;
  assert.equal(view.render().find(n=>n.type==='Button').props.disabled,false);
  assert.equal(view.signouts.length,0,'an old save cannot sign out the newer recovery');
});

const RECOVERY_LINK_ERROR = load('mobile').RECOVERY_LINK_ERROR;

test('recovery and new-link screens run before saved-share, identity and role routing with another signed-in user', () => {
  const source=readFileSync('mobile/app/_layout.tsx','utf8');
  const sections=[
    source.slice(source.indexOf('// Resume shared content'),source.indexOf('// Handle global identity gate')),
    source.slice(source.indexOf('// Handle global identity gate'),source.indexOf('// Handle deep links for payment redirects')),
  ];
  for(const screen of ['password_recovery','forget_password']) {
    const effects=[],routes=[];
    for(const section of sections) {
      vm.runInNewContext(ts.transpileModule(section,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,{
        useEffect:fn=>effects.push(fn),session:{user:{id:'other-user'}},loading:false,roleResolved:true,
        segments:[screen],identityChecked:true,identityRequired:true,userRole:'fan',isFanUserRole:()=>true,
        router:{replace:route=>routes.push(route)},
        AsyncStorage:{getItem(){throw new Error('Recovery cannot resume an unrelated saved share.');}},
      });
    }
    effects.forEach(fn=>fn());assert.deepEqual(routes,[]);
  }
});
