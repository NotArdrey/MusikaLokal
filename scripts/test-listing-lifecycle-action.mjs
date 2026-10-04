import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../mobile/package.json', import.meta.url));
const ts = require('typescript');
const source = fs.readFileSync(new URL('../mobile/src/components/ListingLifecycleAction.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
let hooks = [];
let cursor = 0;
let calls = [];
let invalidations = [];
let changes = [];
let rpc;
const react = {
  Fragment: 'Fragment',
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  useState: (initial) => {
    const index = cursor++;
    if (!(index in hooks)) hooks[index] = initial;
    return [hooks[index], (value) => { hooks[index] = value; }];
  },
  useRef: (initial) => {
    const index = cursor++;
    if (!(index in hooks)) hooks[index] = { current: initial };
    return hooks[index];
  },
};
const dependencies = {
  react,
  'react-native': { StyleSheet: { create: (styles) => styles }, Text: 'Text', TouchableOpacity: 'TouchableOpacity' },
  '@expo/vector-icons': { Ionicons: 'Icon' },
  '../../lib/supabase': { supabase: { rpc: (...args) => { calls.push(args); return rpc(...args); } } },
  '../context/AuthContext': { useAuth: () => ({ userId: 'owner' }) },
  '../context/ThemeContext': { useTheme: () => ({ colors: { primary: 'purple', border: 'gray' } }) },
  '../utils/actionError': { getActionErrorMessage: (error, fallback) => error?.message || fallback },
  '../utils/listingCacheInvalidation': { invalidateListingCaches: (...args) => invalidations.push(args) },
  '../theme/tokens': { typography: { semibold: 'Manrope' } },
  './CustomAlert': 'Alert',
  './modal': 'Modal',
};
const module = { exports: {} };
vm.runInNewContext(code, { module, exports: module.exports, require: (name) => {
  if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
  return dependencies[name];
}, Error });
const component = module.exports.default;
const find = (node, type) => {
  if (!node || typeof node !== 'object') return null;
  if (node.type === type) return node.props;
  return (node.props?.children || []).flat(Infinity).map((child) => find(child, type)).find(Boolean);
};
const render = (overrides = {}) => {
  cursor = 0;
  return component({ type: 'group', id: 'group-id', name: 'My group', status: 'active', onChanged: (state) => changes.push(state), ...overrides });
};
const reset = () => { hooks = []; calls = []; invalidations = []; changes = []; };

let release;
rpc = () => new Promise((resolve) => { release = resolve; });
let tree = render();
assert.equal(find(tree, 'Modal').visible, false);
find(tree, 'TouchableOpacity').onPress();
assert.equal(find(render(), 'Modal').visible, true, 'A confirmation is required before writing');
const save = find(render(), 'Modal').onConfirm();
await find(render(), 'Modal').onConfirm();
assert.equal(calls.length, 1, 'Repeated presses must not create duplicate writes');
assert.equal(find(render(), 'TouchableOpacity').disabled, true);
assert.equal(find(render(), 'Modal').confirmDisabled, true);
assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), ['set_listing_lifecycle', { p_type: 'group', p_id: 'group-id', p_status: 'inactive', p_expected_status: 'active' }]);
release({ data: { management_status: 'inactive' }, error: null });
await save;
assert.deepEqual(changes, ['inactive']);
assert.equal(find(render(), 'Modal').visible, false);
assert.deepEqual(JSON.parse(JSON.stringify(invalidations)), [['owner', ['details', 'feed', 'home', 'search']]]);

reset();
rpc = async () => ({ error: { message: 'Permission denied' }, data: null });
find(render(), 'TouchableOpacity').onPress();
await find(render(), 'Modal').onConfirm();
tree = render();
assert.equal(changes.length, 0, 'A failed write must not move the listing');
assert.equal(invalidations.length, 0);
assert.equal(find(tree, 'Modal').visible, true);
assert.equal(find(tree, 'Alert').message, 'Permission denied');
assert.equal(find(tree, 'TouchableOpacity').disabled, false);

reset();
rpc = async () => ({ data: { management_status: 'active' }, error: null });
await find(render({ status: 'inactive' }), 'Modal').onConfirm();
assert.equal(calls[0][1].p_status, 'active');
assert.equal(calls[0][1].p_expected_status, 'inactive');
assert.deepEqual(changes, ['active']);

reset();
rpc = async () => ({ data: { management_status: 'done' }, error: null });
await find(render({ type: 'gig' }), 'Modal').onConfirm();
assert.equal(calls[0][1].p_type, 'gig');
assert.equal(calls[0][1].p_status, 'done');
assert.deepEqual(changes, ['done']);
console.log('PASS: confirmation, correct IDs/statuses, duplicate protection, loading, failures, cache invalidation, activation and completion.');
