import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const settle = async () => {
  for (let index = 0; index < 4; index++) await new Promise(finish => setImmediate(finish));
};

export function loadSource(path, mocks = {}, globals = {}, modules = new Map()) {
  const absolute = resolve(root, path);
  if (modules.has(absolute)) return modules.get(absolute);
  const module = { exports: {} };
  const context = vm.createContext({
    module, exports: module.exports, console, URL, URLSearchParams, AbortController,
    setTimeout, clearTimeout, queueMicrotask, ...globals,
    require(name) {
      if (name in mocks) return mocks[name];
      if (name.startsWith('.')) {
        const target = resolve(dirname(absolute), name);
        const file = [target, `${target}.ts`, `${target}.tsx`].find(candidate => existsSync(candidate));
        if (file) return loadSource(file, mocks, globals, modules).exports;
      }
      throw new Error(`Unmocked import ${name} in ${path}`);
    },
  });
  const loaded = { exports: module.exports, context };
  modules.set(absolute, loaded);
  const output = ts.transpileModule(readFileSync(absolute, 'utf8'), {
    fileName: absolute,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
      esModuleInterop: true, jsx: ts.JsxEmit.React },
  }).outputText;
  vm.runInContext(output, context, { filename: absolute });
  return loaded;
}

export function fakeClock() {
  let now = 1_700_000_000_000;
  let nextId = 0;
  const timers = new Map();
  return {
    globals: {
      Date: class extends Date { static now() { return now; } },
      setTimeout: (callback, delay = 0) => {
        timers.set(++nextId, { callback, at: now + delay }); return nextId;
      },
      clearTimeout: id => { timers.delete(id); },
    },
    async advance(ms) {
      const target = now + ms;
      while (true) {
        const due = [...timers].filter(([, timer]) => timer.at <= target)
          .sort((left, right) => left[1].at - right[1].at)[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].callback();
        await settle();
      }
      now = target;
      await settle();
    },
    get pending() { return timers.size; },
  };
}

// A small hook harness: executes source effects and cleanup, with native focus
// events delivered independently of renders to exercise frozen-screen behavior.
export function hookHarness() {
  const slots = [];
  let cursor = 0;
  let dirty = true;
  let focused = true;
  let mounted = true;
  let hook;
  let args;
  let result;
  const same = (left, right) => left && right && left.length === right.length &&
    left.every((value, index) => Object.is(value, right[index]));
  const effect = (kind, callback, deps) => {
    const index = cursor++;
    const slot = slots[index] ||= { kind, deps: undefined, cleanup: null };
    slot.changed = !same(slot.deps, deps);
    slot.nextDeps = deps;
    slot.callback = callback;
  };
  const react = {
    useState(initial) {
      const index = cursor++;
      const slot = slots[index] ||= { kind: 'state', value: typeof initial === 'function' ? initial() : initial };
      return [slot.value, value => {
        if (!mounted) return;
        const next = typeof value === 'function' ? value(slot.value) : value;
        if (!Object.is(slot.value, next)) { slot.value = next; dirty = true; }
      }];
    },
    useRef(initial) {
      const index = cursor++;
      return (slots[index] ||= { kind: 'ref', value: { current: initial } }).value;
    },
    useMemo(factory, deps) {
      const index = cursor++;
      const slot = slots[index] ||= { kind: 'memo' };
      if (!same(slot.deps, deps)) { slot.value = factory(); slot.deps = deps; }
      return slot.value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(callback, deps) { effect('effect', callback, deps); },
    memo: component => component,
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  };
  const navigation = { useFocusEffect: callback => effect('focus', callback, [callback]) };
  const commit = () => {
    for (const slot of slots) {
      if (!['effect', 'focus'].includes(slot.kind) || !slot.changed) continue;
      slot.cleanup?.();
      slot.deps = slot.nextDeps;
      slot.changed = false;
      slot.cleanup = slot.kind === 'focus' && !focused ? null : slot.callback();
    }
  };
  return {
    react, navigation,
    render(nextHook, ...nextArgs) {
      hook = nextHook; args = nextArgs; dirty = false; cursor = 0;
      result = hook(...args); commit(); return result;
    },
    async flush() {
      for (let index = 0; index < 30; index++) {
        await settle();
        if (!dirty) return result;
        dirty = false; cursor = 0; result = hook(...args); commit();
      }
      throw new Error('Hook did not settle');
    },
    blur() {
      focused = false;
      for (const slot of slots) if (slot.kind === 'focus') { slot.cleanup?.(); slot.cleanup = null; }
    },
    focus() {
      focused = true;
      for (const slot of slots) if (slot.kind === 'focus') slot.cleanup = slot.callback();
    },
    unmount() {
      mounted = false;
      for (const slot of slots) slot.cleanup?.();
    },
    get result() { return result; },
  };
}

export function extractExpression(path, predicate) {
  const source = ts.createSourceFile(path, readFileSync(resolve(root, path), 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  const visit = node => {
    if (found) return;
    if (predicate(node, source)) { found = node; return; }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(found, `Expression not found in ${path}`);
  return { node: found, source, text: found.getText(source) };
}

export function evaluate(expression, globals) {
  const output = ts.transpileModule(`(${expression});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return vm.runInNewContext(output, globals);
}

export function storageMock(initial = []) {
  const data = new Map(initial);
  const writes = [];
  return { data, writes, api: {
    getItem: async key => data.get(key) ?? null,
    setItem: async (key, value) => { data.set(key, value); writes.push({ key, value }); },
    removeItem: async key => { data.delete(key); },
    getAllKeys: async () => [...data.keys()],
    multiGet: async keys => keys.map(key => [key, data.get(key) ?? null]),
    multiRemove: async keys => { keys.forEach(key => data.delete(key)); },
  } };
}
