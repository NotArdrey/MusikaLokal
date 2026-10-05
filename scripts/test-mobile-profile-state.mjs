import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const profileSource = await readFile(new URL('../mobile/app/(tabs)/profile.tsx', import.meta.url), 'utf8');
const navbarSource = await readFile(new URL('../mobile/src/components/navbar.tsx', import.meta.url), 'utf8');

// Execute the production callbacks with controlled navigation and network timing.
function callback(source, name, scope) {
  const ast = ts.createSourceFile('screen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) {
      expression = node.initializer.arguments[0].getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(expression, `Missing callback: ${name}`);
  const compiled = ts.transpileModule(`(${expression})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return runInNewContext(compiled, scope);
}

function followFocusCallback(scope) {
  const ast = ts.createSourceFile('profile.tsx', profileSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useFocusEffect' &&
        node.getText(ast).includes('loadProfileFollowState')) {
      expression = node.arguments[0].arguments[0].getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(expression, 'Follow state must refresh on profile focus');
  return runInNewContext(ts.transpileModule(`(${expression})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, scope);
}

function navigationFixture({ activeTab = 'profile', native = true } = {}) {
  const calls = [];
  const state = { routes: [{ name: 'profile', key: 'profile-tab', params: {
    userId: 'neil', refresh: 'old-refresh', returnToHome: '1',
    returnListingId: 'studio-listing', returnToProfileId: 'another-profile',
  } }] };
  const scope = {
    activeTab, session: { user: { id: 'oneroots' } }, state: native ? state : undefined,
    navigation: native ? {
      emit: () => ({ defaultPrevented: false }),
      navigate: (name, params) => calls.push({ name, params }),
    } : undefined,
    router: { replace: (destination) => calls.push(destination) },
    navigationFrameRef: { current: null }, pendingTabResetTimerRef: { current: null },
    tabPressTimingRef: { current: null }, setPendingTab() {},
    requestAnimationFrame: (fn) => { fn(); return 1; }, cancelAnimationFrame() {},
    setTimeout: () => 1, clearTimeout() {},
  };
  return { calls, press: callback(navbarSource, 'handleNavPress', scope) };
}

for (const activeTab of ['profile', 'home']) {
  test(`Profile tab opens the signed-in studio from ${activeTab}, clearing visitor parameters`, () => {
    const { calls, press } = navigationFixture({ activeTab });
    press({ id: 'profile', routeName: 'profile', route: '/profile' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'profile');
    assert.equal(calls[0].params.userId, 'oneroots');
    for (const key of ['refresh', 'returnToHome', 'returnListingId', 'returnToProfileId']) {
      assert.equal(calls[0].params[key], undefined);
    }
  });
}

test('the fallback navbar also returns to the signed-in profile while Profile is active', () => {
  const { calls, press } = navigationFixture({ native: false });
  press({ id: 'profile', routeName: 'profile', route: '/profile' });
  assert.equal(calls[0].pathname, '/profile');
  assert.equal(calls[0].params.userId, 'oneroots');
});

function followFixture() {
  const queries = [];
  const mutations = [];
  const toasts = [];
  const scope = {
    currentUserId: 'oneroots', viewedProfileId: 'neil', profileFollowKey: 'oneroots:neil',
    canFollowProfile: true, isProfileFollowing: false, isProfileFollowReady: false,
    isProfileFollowBusy: false, isProfileFollowLoading: false, profileFollowerCount: 1,
    resolvedProfileFollowKey: null,
    profileFollowRequestIdRef: { current: 0 }, profileFollowTargetRef: { current: 'oneroots:neil' },
    profileScreenCache: new Map([['oneroots', {}], ['neil', {}]]),
    refreshes: 0,
    fetchProfile: () => { scope.refreshes += 1; },
    emitToast: (toast) => toasts.push(toast),
  };
  scope.setIsProfileFollowing = (value) => { scope.isProfileFollowing = value; };
  scope.setResolvedProfileFollowKey = (value) => {
    scope.resolvedProfileFollowKey = value;
    scope.isProfileFollowReady = value === scope.profileFollowKey;
  };
  scope.setIsProfileFollowLoading = (value) => { scope.isProfileFollowLoading = value; };
  scope.setIsProfileFollowBusy = (value) => { scope.isProfileFollowBusy = value; };
  scope.setProfileFollowerCount = (value) => {
    scope.profileFollowerCount = typeof value === 'function' ? value(scope.profileFollowerCount) : value;
  };
  scope.supabase = {
    from(table) {
      const query = { table, filters: {} };
      const builder = {
        select() { return builder; },
        eq(key, value) { query.filters[key] = value; return builder; },
        maybeSingle() {
          queries.push(query);
          return scope.readResult();
        },
      };
      return builder;
    },
    functions: { invoke: async (name, { body }) => {
      mutations.push(body);
      return scope.mutationResult;
    } },
  };
  scope.readResult = async () => ({ data: { id: 'follow-row' }, error: null });
  scope.mutationResult = { error: null };
  scope.loadProfileFollowState = callback(profileSource, 'loadProfileFollowState', scope);
  const toggle = callback(profileSource, 'handleProfileFollowToggle', scope);
  return { scope, queries, mutations, toasts, toggle };
}

test('an existing follow resolves for the viewer and target, so the next action is Unfollow', async () => {
  const { scope, queries, mutations, toggle } = followFixture();
  await scope.loadProfileFollowState();
  assert.equal(scope.isProfileFollowing, true);
  assert.equal(scope.isProfileFollowReady, true);
  assert.deepEqual(queries[0], { table: 'follows', filters: {
    follower_id: 'oneroots', followed_id: 'neil', followed_type: 'profile',
  } });
  await toggle();
  assert.equal(mutations[0].action, 'unfollow');
  assert.equal(scope.profileScreenCache.size, 0);
});

test('an unresolved follow status cannot send a duplicate follow mutation', async () => {
  const { scope, mutations, toggle } = followFixture();
  await toggle();
  assert.equal(mutations.length, 0);
  assert.equal(scope.isProfileFollowing, true);
});

test('a delayed response for Neil cannot overwrite the next profile or a changed session', async () => {
  for (const newKey of ['oneroots:other', 'other-viewer:neil']) {
    const { scope } = followFixture();
    let resolveRead;
    scope.readResult = () => new Promise((resolve) => { resolveRead = resolve; });
    const pending = scope.loadProfileFollowState();
    scope.profileFollowTargetRef.current = newKey;
    resolveRead({ data: { id: 'old-follow' }, error: null });
    assert.equal(await pending, null);
    assert.equal(scope.isProfileFollowing, false);
    assert.equal(scope.resolvedProfileFollowKey, null);
  }
});

test('a newer lookup wins even if an older request finishes last', async () => {
  const { scope } = followFixture();
  let resolveOld;
  scope.readResult = () => new Promise((resolve) => { resolveOld = resolve; });
  const old = scope.loadProfileFollowState();
  scope.readResult = async () => ({ data: null, error: null });
  await scope.loadProfileFollowState();
  resolveOld({ data: { id: 'old-follow' }, error: null });
  await old;
  assert.equal(scope.isProfileFollowReady, true);
  assert.equal(scope.isProfileFollowing, false);
});

test('returning to the same cached profile refreshes a relationship changed elsewhere', async () => {
  const { scope, queries } = followFixture();
  const focus = followFocusCallback(scope);
  const blur = focus();
  await new Promise(setImmediate);
  assert.equal(scope.isProfileFollowing, true);
  blur();
  scope.readResult = async () => ({ data: null, error: null });
  focus();
  await new Promise(setImmediate);
  assert.equal(queries.length, 2);
  assert.equal(scope.isProfileFollowing, false);
  assert.equal(scope.isProfileFollowReady, true);
});

test('a follow mutation completed after leaving the profile cannot update the next screen', async () => {
  const { scope, toasts, toggle } = followFixture();
  scope.isProfileFollowReady = true;
  let resolveMutation;
  scope.supabase.functions.invoke = () => new Promise((resolve) => { resolveMutation = resolve; });
  const pending = toggle();
  scope.profileFollowRequestIdRef.current += 1;
  scope.profileFollowTargetRef.current = 'oneroots:other';
  scope.profileFollowerCount = 42;
  resolveMutation({ error: null });
  await pending;
  assert.equal(scope.profileFollowerCount, 42);
  assert.equal(scope.refreshes, 0);
  assert.equal(toasts.length, 0);
});

test('Already following reconciles the button with the saved relationship', async () => {
  const { scope, toasts, toggle } = followFixture();
  scope.isProfileFollowReady = true;
  scope.mutationResult = { error: new Error('Already following') };
  await toggle();
  assert.equal(scope.isProfileFollowing, true);
  assert.equal(scope.isProfileFollowReady, true);
  assert.equal(scope.isProfileFollowBusy, false);
  assert.equal(scope.profileScreenCache.size, 0);
  assert.equal(scope.refreshes, 1);
  assert.equal(toasts.length, 0);
});

test('failed relationship reads remain unresolved and permit a retry without mutating', async () => {
  const { scope, mutations, toggle } = followFixture();
  scope.readResult = async () => ({ data: null, error: new Error('Network unavailable') });
  await scope.loadProfileFollowState();
  assert.equal(scope.isProfileFollowReady, false);
  assert.equal(scope.isProfileFollowLoading, false);
  await toggle();
  assert.equal(mutations.length, 0);
});
