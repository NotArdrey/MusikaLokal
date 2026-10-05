import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;

function groupConfirmation(action) {
  const source = ts.createSourceFile("manage_group.tsx", read("mobile/app/manage_group.tsx"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  const visit = (node) => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "Modal") {
      callback = node.attributes.properties.find((prop) => prop.name?.getText(source) === "onConfirm")?.initializer?.expression;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(callback, "Group review must have a confirmation handler");
  const exports = {};
  vm.runInNewContext(compile(`export const confirm = ${callback.getText(source)};`), { exports, modalAction: action });
  return exports.confirm;
}

function confirmationButton(onConfirm) {
  const react = {
    useState: (value) => [typeof value === "function" ? value() : value, () => {}],
    useRef: (value) => ({ current: value }),
    useEffect() {}, useLayoutEffect() {}, useCallback: (value) => value,
  };
  const exports = {};
  vm.runInNewContext(compile(read("mobile/src/components/Modal.tsx")), {
    exports,
    require: (name) => {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (name === "react-native") return { StyleSheet: { create: (value) => value, absoluteFillObject: {} }, TouchableOpacity: "TouchableOpacity" };
      if (name === "react-native-reanimated") return { useSharedValue: (value) => ({ value }), useAnimatedStyle: () => ({}) };
      if (name.endsWith("ThemeContext")) return { useTheme: () => ({ colors: {} }) };
      if (name.endsWith("e2eFixtures")) return { isE2EFixtureMode: () => false };
      if (name.endsWith("theme/tokens")) return { typography: {} };
      return {};
    },
  });
  const tree = exports.default({ visible: true, title: "Accept Group Application", buttonText: "Accept", onConfirm, onClose() {} });
  const buttons = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "TouchableOpacity" && node.props.onPress) buttons.push(node);
    const children = node.props?.children;
    for (const child of Array.isArray(children) ? children : [children]) visit(child);
  };
  visit(tree);
  return buttons.find((button) => JSON.stringify(button.props.children).includes('"Accept"'))?.props.onPress;
}

test("accepting a group application keeps repeated confirmation taps locked until the save completes", async () => {
  let requests = 0;
  let finish;
  const save = new Promise((resolve) => { finish = resolve; });
  const confirm = groupConfirmation(() => { requests += 1; return save; });
  const press = confirmationButton(confirm);
  assert.equal(typeof press, "function");
  press();
  press();
  await Promise.resolve();
  press();
  assert.equal(requests, 1);
  finish();
  await save;
});
