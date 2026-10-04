import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../mobile/package.json', import.meta.url));
const ts = require('typescript');
const read = (file) => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const compile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
let role = 'musician';
let pathname = '/my_group';
let assignments = [{ entity_type: 'venue' }];
let destinations = [];
let hooks = [];
let cursor = 0;
let effects = [];
const react = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  createContext: () => ({ Provider: 'HistoryProvider' }),
  useContext: () => null,
  useCallback: (callback) => callback,
  useMemo: (callback) => callback(),
  useEffect: () => {},
  useRef: (value) => {
    const index = cursor++;
    if (!(index in hooks)) hooks[index] = { current: value };
    return hooks[index];
  },
  useState: (value) => {
    const index = cursor++;
    if (!(index in hooks)) hooks[index] = typeof value === 'function' ? value() : value;
    return [hooks[index], (next) => { hooks[index] = typeof next === 'function' ? next(hooks[index]) : next; }];
  },
};
const dependencies = {
  react,
  'react-native': { StyleSheet: { create: (styles) => styles }, View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', ScrollView: 'ScrollView', RefreshControl: 'RefreshControl' },
  'expo-router': { router: { replace: (route) => destinations.push(route) }, usePathname: () => pathname, useFocusEffect: (callback) => effects.push(callback) },
};
const load = (file, overrides = {}) => {
  const module = { exports: {} };
  vm.runInNewContext(compile(read(file)), { module, exports: module.exports, require: (name) => {
    if (name in overrides) return overrides[name];
    if (name in dependencies) return dependencies[name];
    if (name.endsWith('/AuthContext')) return { useAuth: () => ({ userId: 'viewer', userRole: role }), useRequireAuth: () => ({ userId: 'viewer' }) };
    if (name.endsWith('/ThemeContext')) return { useTheme: () => ({ colors: {} }) };
    if (name.endsWith('/staffAccess')) return { getCachedActiveStaffAssignments: () => assignments, fetchActiveStaffAssignments: async () => assignments };
    if (name.endsWith('/roleRouting')) return routing;
    if (name.endsWith('/useBottomBarClearance')) return { useBottomBarClearance: () => ({ contentBottomPadding: 24 }) };
    if (name.endsWith('/supabase')) return { supabase: {} };
    if (name.endsWith('/ManagedListingContent')) return { HistoryRefreshContext: { Provider: 'HistoryProvider' }, HistoryListStateContext: { Provider: 'HistoryStateProvider' } };
    if (name.endsWith('/tokens')) return { typography: { semibold: 'Manrope' } };
    return name.split('/').at(-1);
  } });
  return module.exports;
};
const routing = load('mobile/src/utils/roleRouting.ts');
const render = (component, props = {}, reset = true) => {
  cursor = 0;
  effects = [];
  if (reset) hooks = [];
  return component(props);
};
const findAll = (tree, type) => {
  if (!tree || typeof tree !== 'object') return [];
  return [...(tree.type === type ? [tree.props] : []), ...(tree.props?.children || []).flat(Infinity).flatMap((child) => findAll(child, type))];
};

const musicianTabs = load('mobile/src/components/MusicianWorkspaceTabs.tsx').default;
let tabs = render(musicianTabs, { activeKey: 'group' }).props;
assert.deepEqual(Array.from(tabs.tabs, (tab) => tab.label), ['My Group', 'My Production', 'My Gig', 'My History']);
tabs.onChange('history');
assert.equal(destinations.at(-1), '/my_history');
pathname = '/my_history';
tabs = render(musicianTabs, { activeKey: 'history' }).props;
assert.equal(tabs.activeKey, 'history');
tabs.onChange('venue');
assert.equal(destinations.at(-1), '/my_venue');

const staffTabs = load('mobile/src/components/StaffWorkspaceTabs.tsx').default;
role = 'staff';
tabs = render(staffTabs, { activeKey: 'history' }).props;
assert.deepEqual(Array.from(tabs.tabs, (tab) => tab.label), ['Gigs', 'My History'], 'Single-workspace staff still receive History');
tabs.onChange('venue');
assert.equal(destinations.at(-1), '/my_venue');
pathname = '/my_venue';
tabs = render(staffTabs, { activeKey: 'venue' }).props;
tabs.onChange('history');
assert.equal(destinations.at(-1), '/my_history');

const ownerTabs = load('mobile/src/components/ManageWorkspaceTabs.tsx').default;
for (const [owner, label, route] of [['studio-owner', 'My Studio', '/my_studio'], ['venue-owner', 'My Gig', '/my_venue'], ['producer', 'My Production', '/my_production']]) {
  role = owner;
  tabs = render(ownerTabs, { activeKey: 'history' }).props;
  assert.deepEqual(Array.from(tabs.tabs, (tab) => tab.label), [label, 'My History']);
  assert.equal(tabs.activeKey, 'history');
  tabs.onChange('listings');
  assert.equal(destinations.at(-1), route);
}

const history = load('mobile/app/(tabs)/my_history.tsx').default;
role = 'musician';
let tree = render(history);
for (const name of ['my_group', 'my_production', 'my_venue']) {
  const [section] = findAll(tree, name);
  assert.equal(section.historyOnly, true);
  assert.equal(section.embedded, true);
}
assert.equal(findAll(tree, 'my_studio').length, 0);
const reportState = findAll(tree, 'HistoryStateProvider')[0].value;
reportState('group', { loading: false, itemCount: 0, error: null });
reportState('production', { loading: false, itemCount: 0, error: null });
reportState('gig', { loading: false, itemCount: 1, error: null });
tree = render(history, {}, false);
assert.equal(findAll(tree, 'TouchableOpacity').filter((button) => button.accessibilityState.selected)[0].testID, 'history-filter-all');
assert.equal(findAll(tree, 'Text').filter((text) => text.testID === 'history-empty').length, 0, 'Empty categories cannot add empty panels to All');
findAll(tree, 'TouchableOpacity').find((button) => button.testID === 'history-filter-group').onPress();
tree = render(history, {}, false);
assert.equal(findAll(tree, 'Text').filter((text) => text.testID === 'history-empty').length, 1, 'A filter has one compact empty message');
assert.equal(findAll(tree, 'View').find((view) => view.testID === 'history-list-gig').style.display, 'none');
assert.equal(findAll(tree, 'my_venue').length, 1, 'Changing filters retains loaded listings and refresh handlers');
findAll(tree, 'TouchableOpacity').find((button) => button.testID === 'history-filter-gig').onPress();
tree = render(history, {}, false);
assert.equal(findAll(tree, 'View').find((view) => view.testID === 'history-list-gig').style, undefined);
findAll(tree, 'TouchableOpacity').find((button) => button.testID === 'history-filter-all').onPress();
reportState('gig', { loading: false, itemCount: 0, error: null });
tree = render(history, {}, false);
assert.equal(findAll(tree, 'Text').filter((text) => text.testID === 'history-empty').length, 1, 'All-empty history has one message');
reportState('group', { loading: false, itemCount: 0, error: 'Cannot load groups' });
tree = render(history, {}, false);
assert.equal(findAll(tree, 'InlineErrorBanner')[0].message, 'Cannot load groups', 'Hidden empty categories must not hide fetch errors');
assert.equal(findAll(tree, 'Text').filter((text) => text.testID === 'history-empty').length, 0);
reportState('group', { loading: true, itemCount: 0, error: null });
tree = render(history, {}, false);
assert.equal(findAll(tree, 'Text').filter((text) => text.testID === 'history-empty').length, 0, 'Loading is not an empty result');
const register = findAll(tree, 'HistoryProvider')[0].value;
let release;
let refreshed = 0;
const unregister = register(() => new Promise((resolve) => { release = () => { refreshed++; resolve(); }; }));
const refresh = findAll(tree, 'ScrollView')[0].refreshControl.props.onRefresh;
const pending = refresh();
tree = render(history, {}, false);
assert.equal(findAll(tree, 'ScrollView')[0].refreshControl.props.refreshing, true, 'History waits for its listing queries');
release();
await pending;
assert.equal(refreshed, 1);
unregister();
await refresh();
assert.equal(refreshed, 1, 'Unmounted sections cannot fetch');

role = 'staff';
assignments = [{ entity_type: 'venue' }];
render(history);
effects.forEach((effect) => effect());
await new Promise((resolve) => setTimeout(resolve, 0));
tree = render(history, {}, false);
assert.equal(findAll(tree, 'my_venue').length, 1);
assert.equal(findAll(tree, 'my_studio').length, 0);
assert.equal(findAll(tree, 'my_production').length, 0);
role = 'studio-owner';
tree = render(history);
assert.equal(findAll(tree, 'my_studio')[0].historyOnly, true);
assert.deepEqual(findAll(tree, 'TouchableOpacity').map((button) => button.testID), ['history-filter-all', 'history-filter-studio']);

let contentModule;
const reported = [];
contentModule = load('mobile/src/components/ManagedListingContent.tsx', {
  react: { ...react, useEffect: (callback) => callback(), useContext: (context) => context === contentModule.HistoryListStateContext
    ? (type, state) => reported.push({ type, state }) : () => () => {} },
});
assert.equal(render(contentModule.default, { embedded: true, listingType: 'group', loading: false, itemCount: 0, children: 'Old empty panel' }), null);
assert.equal(reported[0].state.itemCount, 0);
assert.equal(render(contentModule.default, { embedded: true, listingType: 'group', loading: true, itemCount: 0 }), null);
assert.equal(render(contentModule.default, { embedded: true, listingType: 'group', loading: false, itemCount: 1 }).type, 'View');
assert.equal(render(contentModule.default, { embedded: false, itemCount: 0 }).type, 'ScrollView', 'Normal listing pages retain their existing states');

const parsed = (file) => ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const walk = (node, visit) => { visit(node); ts.forEachChild(node, (child) => walk(child, visit)); };
const cardFiles = ['my_group', 'my_studio', 'my_venue', 'my_production'];
for (const name of cardFiles) {
  const file = parsed(`mobile/app/(tabs)/${name}.tsx`);
  walk(file, (node) => {
    if (ts.isJsxSelfClosingElement(node)) assert.notEqual(node.tagName.getText(file), 'ListingLifecycleAction', 'Lifecycle actions belong inside Manage');
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(file) === 'TouchableOpacity' && node.openingElement.getText(file).includes('styles.manageBtn')) {
      assert.ok(!node.getText(file).includes('<Ionicons'), 'Manage/View navigation uses a text button');
    }
  });
}
for (const [name, entity] of [['manage_group', 'group'], ['manage_studio', 'studio'], ['manage_gig', 'gig'], ['production_team', 'selectedTeam']]) {
  const file = parsed(`mobile/app/${name}.tsx`);
  let action;
  walk(file, (node) => { if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === 'ListingLifecycleAction') action = node; });
  assert.ok(action, name);
  assert.ok(action.getText(file).includes(`id={${entity}.id}`), 'The relocated action retains its listing ID');
  let container = action;
  while (!ts.isJsxExpression(container)) container = container.parent;
  const evaluate = (allowed) => {
    let state = { id: 'listing-id', name: 'Listing', owner_id: allowed ? 'viewer' : 'other', member_role: allowed ? 'manager' : 'musician', management_status: 'inactive' };
    const update = (callback) => { state = callback(state); };
    const context = {
      React: react, View: 'View', ListingLifecycleAction: 'Lifecycle',
      [entity]: state, currentUserId: 'viewer', canChangeLifecycle: allowed,
      canMarkGigDone: () => true, selectedStaffPermissions: { canEditListing: false },
      setGroup: update, setStudio: update, setGig: update, setSelectedTeam: update,
      setTeams: (callback) => callback([state]),
    };
    const result = vm.runInNewContext(compile('const result = ' + container.expression.getText(file) + '; result;'), context);
    if (!allowed) {
      assert.equal(result, null, 'View access alone must not allow lifecycle changes');
    } else {
      const control = findAll(result, 'Lifecycle')[0];
      assert.equal(control.id, 'listing-id');
      control.onChanged('active');
      assert.equal(state.id, 'listing-id');
      assert.equal(state.management_status, 'active', 'Successful changes update the managed record');
    }
  };
  evaluate(false);
  evaluate(true);
  if (name !== 'production_team') assert.match(read(`mobile/app/${name}.tsx`), /navigateButton: \{[^}]*minHeight: 44[^}]*borderRadius: 12/s);
}
console.log('PASS: workspace routing, combined history, role filters, shared loading/empty/error states, retained refresh handlers and Manage action IDs.');
