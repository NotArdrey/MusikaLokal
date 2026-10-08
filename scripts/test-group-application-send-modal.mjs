import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import { chromium } from '@playwright/test';

const requireMobile = createRequire(new URL('../mobile/package.json', import.meta.url));
const React = requireMobile('react');
const RN = requireMobile('react-native-web');
const { renderToStaticMarkup } = requireMobile('react-dom/server');
const h = React.createElement;
const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const cvUtils = {};
vm.runInNewContext(compile(readFileSync('mobile/src/utils/groupApplicationCv.ts', 'utf8')), { exports: cvUtils });
let fixture, colors, nullStates;
const react = { ...React, useState(initial) {
  const state = React.useState(initial);
  if (initial === null && ++nullStates === 1) return [fixture, state[1]];
  if (initial === true) return [false, state[1]];
  return state;
} };

function load(file) {
  const exports = {};
  vm.runInNewContext(compile(readFileSync(file, 'utf8')), {
    exports, console,
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return requireMobile(name);
      if (name === 'react-native') return { ...RN, Modal: ({ visible, children }) => visible ? h(RN.View, { style: { flex: 1 } }, children) : null };
      if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 48, bottom: 34 }) };
      if (name === '@expo/vector-icons') return { Ionicons: ({ size }) => h(RN.View, { style: { width: size, height: size, flexShrink: 0 } }) };
      if (name === 'expo-router') return { useFocusEffect: () => {} };
      if (name === 'expo-document-picker') return {};
      if (name.includes('ThemeContext')) return { useTheme: () => ({ colors, isDark: colors.background === '#0f172a' }) };
      if (name.includes('AuthContext')) return { useAuth: () => ({ userId: 'leader', session: { user: { id: 'leader' } } }) };
      if (name.includes('groupApplicationCv')) return cvUtils;
      if (name.includes('theme/tokens')) return { radius: { card: 16 }, typography: { body: 'sans-serif', medium: 'sans-serif', semibold: 'sans-serif', heading: 'sans-serif', bold: 'sans-serif', title: 'sans-serif' } };
      if (name === './GroupApplicationCvForm') return { __esModule: true, default: load('mobile/src/components/GroupApplicationCvForm.tsx') };
      if (name === './DocumentUploader') return { __esModule: true, default: load('mobile/src/components/DocumentUploader.tsx') };
      if (name.endsWith('/CustomAlert')) return { __esModule: true, default: () => null };
      if (name.includes('supabase') || name.includes('storageUpload') || name.includes('e2eFixtures') || name.includes('cvDocument')) return {};
      throw Error(`Unexpected dependency ${name}`);
    },
  });
  return exports.default;
}

test('application upload modal fits narrow screens and large text in both themes', { timeout: 120000 }, async () => {
  const Modal = load('mobile/src/components/GroupApplicationSendModal.tsx');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const results = [];
  const output = 'docs/testing/application-send-modal-2026-10-08';
  mkdirSync(output, { recursive: true });
  try {
    for (const width of [320, 360, 430]) for (const dark of [false, true]) for (const fontScale of [1, 1.6]) for (const ready of [false, true]) {
      colors = { background: dark ? '#0f172a' : '#f8fafc', card: dark ? '#1e293b' : '#fff', text: dark ? '#f8fafc' : '#111827', textSecondary: dark ? '#94a3b8' : '#475569', border: dark ? '#334155' : '#d1d5db', primary: '#635bdb' };
      fixture = {
        can_finalize: ready,
        application: { status: 'pending', member_cv_status: ready ? 'ready' : 'collecting', member_cv_required_count: 2, member_cv_submitted_count: ready ? 2 : 1, group: { name: 'OneRoots' }, gig: { name: 'Bagsakan Bulacan gig application' } },
        members: [
          { id: 'leader', is_current_user: true, member_name: 'Jared Abad Abad Cariaso', role: 'Leader', cv_status: ready ? 'submitted' : 'pending' },
          { id: 'member', member_name: 'A group member with a longer name', role: 'Guitarist', cv_status: 'submitted' },
        ],
      };
      nullStates = 0;
      const html = renderToStaticMarkup(h(Modal, { applicationId: 'application', onClose: () => {}, onUpdated: () => {} }));
      await page.setViewportSize({ width, height: 780 });
      await page.setContent(`<style>html,body{margin:0;height:100%}#root{height:780px;display:flex;flex-direction:column}${RN.StyleSheet.getSheet().textContent}</style><div id="root">${html}</div>`);
      if (fontScale !== 1) await page.evaluate(scale => {
        for (const node of document.querySelectorAll('[dir="auto"]')) {
          const css = getComputedStyle(node);
          node.style.fontSize = `${parseFloat(css.fontSize) * scale}px`;
          if (Number.isFinite(parseFloat(css.lineHeight))) node.style.lineHeight = `${parseFloat(css.lineHeight) * scale}px`;
        }
      }, fontScale);
      await page.getByRole('heading', { name: 'Send application' }).waitFor();
      const close = await page.getByRole('button', { name: 'Close application' }).boundingBox();
      assert.ok(close.y >= 48 && close.y + close.height <= 746);
      const send = page.getByRole('button', { name: 'Send Application', exact: true });
      await send.scrollIntoViewIfNeeded();
      assert.equal(await send.isDisabled(), !ready);
      const overflow = await page.evaluate(() => [...document.querySelectorAll('[dir="auto"]')].filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.textContent));
      assert.deepEqual(overflow, [], `${width}px, scale ${fontScale}: text overflows`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (width === 320 && fontScale === 1.6) {
        await page.getByText('Your CV', { exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${output}/${dark ? 'dark' : 'light'}-${ready ? 'ready' : 'missing-cv'}.png` });
      }
      results.push({ width, dark, fontScale, ready, passed: true });
    }
  } finally { await browser.close(); }
  writeFileSync(`${output}/layouts.json`, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`${results.length} modal layouts passed; physical Android acceptance remains pending.`);
});
