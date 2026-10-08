import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import { chromium } from '@playwright/test';
const read = file => readFileSync(file, 'utf8');
const compile = code => ts.transpileModule(code, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React,
} }).outputText;
const wallet = ts.createSourceFile('wallet.tsx', read('mobile/app/wallet.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(ast, predicate) {
  let found;
  const visit = node => { if (!found && predicate(node)) found = node; ts.forEachChild(node, visit); };
  visit(ast);
  assert.ok(found, 'Test target exists');
  return found;
}
function walletHandler(scope) {
  const node = find(wallet, n => ts.isVariableDeclaration(n) && n.name.getText(wallet) === 'handlePayBalance');
  return vm.runInNewContext(compile(`(${node.initializer.getText(wallet)})`), scope);
}
const booking = { id: 'booking', studio: { name: 'Root Studio C' }, remaining_balance: 750, final_price: 1500, paid_at: '2026-10-06', booking_date: '2026-10-20' };

function paymentScope(invoke) {
  const alerts = [], states = [], opened = [];
  let timer;
  const scope = {
    userId: 'payer', balanceCheckoutRef: { current: null }, AbortController, URL,
    setTimeout: fn => { timer = fn; return 1; }, clearTimeout: () => {},
    setPayingBookingId: id => states.push(id), Alert: { alert: (...args) => alerts.push(args) },
    ExpoLinking: { createURL: () => 'musikalokal://payment-result' },
    Linking: { openURL: async url => opened.push(url) }, supabase: { functions: { invoke } },
  };
  return { scope, alerts, states, opened, timeout: () => timer() };
}

test('wallet checkout timeout cancels the request, releases the spinner and permits retry', async () => {
  let signal;
  const harness = paymentScope((_, options) => { signal = options.signal; return new Promise(() => {}); });
  const pay = walletHandler(harness.scope);
  const pending = pay(booking);
  harness.timeout();
  await pending;
  assert.equal(signal.aborted, true);
  assert.equal(harness.scope.balanceCheckoutRef.current, null);
  assert.deepEqual(harness.states, ['booking', null]);
  assert.match(harness.alerts[0][1], /took too long/);
  assert.deepEqual(harness.opened, []);
  harness.scope.supabase.functions.invoke = async () => ({ data: { checkout_url: 'https://checkout.paymongo.com/session' } });
  await pay(booking);
  assert.deepEqual(harness.opened, ['https://checkout.paymongo.com/session']);
});

test('wallet double taps cannot start concurrent checkouts and incomplete responses show an error', async () => {
  let finish, calls = 0;
  const harness = paymentScope(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const pay = walletHandler(harness.scope);
  const first = pay(booking);
  await pay({ ...booking, id: 'another-booking' });
  assert.equal(calls, 1);
  finish({ data: {} });
  await first;
  assert.match(harness.alerts[0][1], /unavailable/);
  assert.equal(harness.states.at(-1), null);
});

test('radio upcoming queue excludes the playing song and artist stations use their managed artist', () => {
  const exports = {};
  vm.runInNewContext(compile(read('mobile/src/utils/stationPresentation.ts')), { exports });
  assert.equal(exports.getStationArtistName({ managed_profile: { full_name: 'Neil' }, creator: { full_name: 'Admin' } }), 'Neil');
  assert.equal(exports.getStationArtwork({ cover_image_url: 'cover.jpg', creator: { avatar_url: 'admin.jpg' } }), 'cover.jpg');
  assert.deepEqual(Array.from(exports.getStationUpcomingEntries(['a', 'b', 'c'], 1)), ['c', 'a']);
  assert.deepEqual(Array.from(exports.getStationUpcomingEntries(['Red'], 0)), []);
});

test('radio detail title follows the actual player, and a paused station can resume', async () => {
  const ast = ts.createSourceFile('station.tsx', read('mobile/app/station_details.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const title = find(ast, n => ts.isVariableDeclaration(n) && n.name.getText(ast) === 'playerTrackTitle');
  const result = vm.runInNewContext(compile(`(${title.initializer.getText(ast)})`), {
    isActiveStation: true, currentTrack: { title: 'Playing song' }, liveCurrentItem: { title: 'Different scheduled song' },
  });
  assert.equal(result, 'Playing song');
  const handler = find(ast, n => ts.isVariableDeclaration(n) && n.name.getText(ast) === 'handleListenOrMute');
  const calls = [];
  const scope = {
    useCallback: fn => fn, station: { id: 'station' }, isActiveStation: true, isPlaying: false,
    tuneIn: async () => calls.push('resume'), toggleMute: async () => calls.push('mute'), setAlert: alert => calls.push(alert),
  };
  await vm.runInNewContext(compile(`(${handler.initializer.getText(ast)})`), scope)();
  assert.deepEqual(calls, ['resume']);
  scope.tuneIn = async () => { throw new Error('Audio unavailable'); };
  await vm.runInNewContext(compile(`(${handler.initializer.getText(ast)})`), scope)();
  assert.equal(calls.at(-1).title, 'Unable to Play Radio');
});

test('wallet amounts and checkout labels fit narrow screens in both themes with large text', { timeout: 120000 }, async () => {
  const requireMobile = createRequire(new URL('../mobile/package.json', import.meta.url));
  const React = requireMobile('react'), RN = requireMobile('react-native-web');
  const { renderToStaticMarkup } = requireMobile('react-dom/server');
  const typography = Object.fromEntries(['body', 'heading', 'medium', 'semibold', 'bold'].map(name => [name, 'sans-serif']));
  const stylesNode = find(wallet, n => ts.isVariableDeclaration(n) && n.name.getText(wallet) === 'styles');
  const styles = vm.runInNewContext(compile(`(${stylesNode.initializer.getText(wallet)})`), { StyleSheet: RN.StyleSheet, typography, Platform: { OS: 'android' } });
  const unpaid = find(wallet, n => ts.isJsxElement(n) && n.openingElement.getText(wallet).includes('styles.unpaidSection'));
  const transaction = find(wallet, n => ts.isJsxElement(n) && n.openingElement.getText(wallet).includes('styles.transactionItem'));
  const browser = await chromium.launch(), page = await browser.newPage();
  const output = 'docs/testing/wallet-radio-ui-2026-10-08';
  mkdirSync(output, { recursive: true });
  let count = 0;
  try {
    for (const width of [320, 430]) for (const dark of [false, true]) for (const fontScale of [1, 1.6]) for (const loading of [false, true]) {
      const colors = { primary: '#635bdb', background: dark ? '#0f172a' : '#fff', border: dark ? '#334155' : '#d1d5db', text: dark ? '#f8fafc' : '#111827', textSecondary: dark ? '#94a3b8' : '#475569' };
      const scope = {
        React, styles, typography, colors, isDark: dark, View: RN.View, Text: RN.Text, Image: () => React.createElement(RN.View, { style: styles.unpaidImage }), TouchableOpacity: RN.TouchableOpacity,
        ActivityIndicator: RN.ActivityIndicator, Ionicons: ({ size }) => React.createElement(RN.View, { style: { width: size, height: size } }),
        unpaidBookings: [booking], focusedBookingId: 'booking', payingBookingId: loading ? 'booking' : null,
        handlePayBalance: () => {}, formatFriendlyDateTime: () => 'Oct 20',
        tx: { id: 'payment', amount: 1500, is_credit: false, created_at: '2026-10-06' }, index: 0, filteredTransactions: [1], txAmount: 1500, txCategoryLabel: 'Full payment',
        getTransactionTitle: () => 'Payment', getTransactionCategory: () => 'payment', getTransactionCategoryLabel: () => 'Full payment', getExternalPaymentLabel: () => 'Historical record · Paid via QR Ph',
      };
      const card = vm.runInNewContext(compile(`(${unpaid.getText(wallet)})`), scope);
      const history = vm.runInNewContext(compile(`(${transaction.getText(wallet)})`), scope);
      const html = renderToStaticMarkup(React.createElement(RN.View, { style: { padding: 20, gap: 24, backgroundColor: colors.background } }, card, history));
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(`<style>html,body{margin:0}${RN.StyleSheet.getSheet().textContent}</style>${html}`);
      if (fontScale !== 1) await page.evaluate(scale => {
        for (const node of document.querySelectorAll('[dir="auto"]')) {
          const css = getComputedStyle(node); node.style.fontSize = `${parseFloat(css.fontSize) * scale}px`;
          if (Number.isFinite(parseFloat(css.lineHeight))) node.style.lineHeight = `${parseFloat(css.lineHeight) * scale}px`;
        }
      }, fontScale);
      await page.getByText(loading ? 'Opening…' : 'Pay Now', { exact: true }).waitFor();
      const overflow = await page.evaluate(() => [...document.querySelectorAll('[dir="auto"]')].filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.textContent));
      assert.deepEqual(overflow, [], `${width}px with scale ${fontScale}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (width === 320 && fontScale === 1.6) await page.screenshot({ path: `${output}/${dark ? 'dark' : 'light'}-${loading ? 'opening' : 'pay-now'}.png`, fullPage: true });
      count++;
    }
  } finally { await browser.close(); }
  console.log(`${count} wallet layouts passed.`);
});
