import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { chromium } from "@playwright/test";

const requireMobile = createRequire(new URL("../mobile/package.json", import.meta.url));
const React = requireMobile("react");
const RN = requireMobile("react-native-web");
const { renderToStaticMarkup } = requireMobile("react-dom/server");
const h = React.createElement;
const theme = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../mobile/src/theme/tokens.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: theme });
const fontCss = Object.values(theme.typography).filter((value, index, fonts) => fonts.indexOf(value) === index).map(name => {
  const [family, weight] = name.split("_");
  const packageName = family === "Manrope" ? "manrope" : "space-grotesk";
  const file = new URL(`../mobile/node_modules/@expo-google-fonts/${packageName}/${weight}/${name}.ttf`, import.meta.url);
  return `@font-face{font-family:${name};src:url(data:font/ttf;base64,${readFileSync(file).toString("base64")})}`;
}).join("\n");
const source = readFileSync(new URL("../mobile/src/components/ApplicantDetailsModal.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const buttons = [];
const exports = {};
vm.runInNewContext(compiled, {
  exports, console, setTimeout, clearTimeout,
  require(name) {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return requireMobile(name);
    if (name === "react-native") return {
      ...RN,
      Modal: ({ visible, children }) => visible ? h(RN.View, { style: { flex: 1 } }, children) : null,
      TouchableOpacity: props => { buttons.push(props); return h(RN.TouchableOpacity, props); },
    };
    if (name === "react-native-safe-area-context") return { SafeAreaProvider: RN.View, SafeAreaView: RN.View };
    if (name === "expo-router") return { useRouter: () => ({ push() {} }) };
    if (name === "@expo/vector-icons") return { Ionicons: ({ size }) => h(RN.View, { style: { width: size, height: size, flexShrink: 0 } }) };
    if (name.includes("gigApplicantFilters")) return { isActiveApplication: () => true };
    if (name.includes("theme/tokens")) return theme;
    if (name.includes("ProfileAvatar")) return { __esModule: true, default: ({ size }) => h(RN.View, { style: { width: size, height: size, flexShrink: 0, borderRadius: size / 2, backgroundColor: "#cbd5e1" } }) };
    throw new Error(`Unexpected dependency ${name}`);
  },
});

const baseColors = { background: "#fff", surface: "#fff", inputBackground: "#eeede8", border: "#deddd7", primary: "#5546f4", text: "#121318", textSecondary: "#62646d" };
const memberNames = ["Jared Abad Abad Cariaso", "Neil Ardrey Payoyo Laza"];
const group = {
  id: "group-application", status: "pending", group: { name: "Malakas Band", group_type: "band", location: "Bulacan, Philippines" },
  applicant: { full_name: memberNames[0], is_verified: true, verification_status: "APPROVED" },
  video_url: "https://example.test/performance.mp4", ai_portfolio_review_consent: true,
  ai_recommendation: { score: 85, recommendation_status: "needs_review", criteria_snapshot: { requirement_results: [
    { key: "genre", label: "Genre fit", status: "met", detail: "The CV lists pop and rock performance experience." },
    { key: "portfolio", label: "Submitted performance evidence", status: "met", detail: "A performance video was submitted." },
  ] } },
  ai_portfolio_review: { status: "processing", source_summary: { cv_processing_status: "reviewed", video_processing_status: "processing", cv_name_check: { status: "match", summary: "The name on the CV matches the applicant's record." } } },
  member_cvs: memberNames.map((member_name, i) => ({ id: `cv-${i}`, member_name, role: i ? "Guitarist" : "Leader", cv_url: `https://example.test/member-${i}.pdf?token=private`, ai_review_status: "completed", ai_review_result: { classification: { summary: "CV reviewed successfully." } } })),
  member_verification: { status: "completed", result: "needs_review", expected_member_count: 2, verified_member_count: 0, reference_source: "verified_id_and_profile_photo", members: memberNames.map((member_name_snapshot, i) => ({ member_id: `member-${i}`, member_name_snapshot, status: "needs_review", profile_status: "needs_review", profile_issue_code: "identity_not_confirmed", reference_portrait_url: `https://example.test/portrait-${i}.jpg`, profile_photo_url: `https://example.test/profile-${i}.jpg` })) },
};
const solo = { ...group, id: "solo-application", group: null, member_cvs: [], cv_url: "https://example.test/solo.pdf?token=private" };
const noop = () => {};
function render(details, colors = baseColors, onOpenMedia = noop, onRetry = noop) {
  buttons.length = 0;
  return renderToStaticMarkup(h(exports.default, { visible: true, summary: details, details, colors, loading: false, error: null, onClose: noop, onRetry, onAccept: noop, onDecline: noop, onOpenMedia }));
}

test("every group member CV opens directly without expanding an evidence panel, including during video review", () => {
  const opened = [];
  render(group, baseColors, (...args) => opened.push(args));
  for (const member of group.member_cvs) {
    const button = buttons.find(props => props.accessibilityLabel === `View ${member.member_name} CV`);
    assert.ok(button, `${member.member_name}'s CV is available in the initial review`);
    button.onPress();
  }
  assert.deepEqual(opened, group.member_cvs.map(member => [member.cv_url, `${member.member_name} CV`]));
});

test("solo CV access remains available when optional review was not authorized", () => {
  const opened = [];
  render({ ...solo, ai_portfolio_review_consent: false, ai_portfolio_review: null }, baseColors, (...args) => opened.push(args));
  const button = buttons.find(props => props.accessibilityLabel === "View applicant CV");
  assert.ok(button);
  button.onPress();
  assert.deepEqual(opened, [[solo.cv_url, "Applicant CV"]]);
});

test("a member CV with an unavailable link explains how to recover without opening an empty URL", () => {
  const details = { ...group, member_cvs: [{ ...group.member_cvs[0], cv_url: null }] };
  let retries = 0;
  const html = render(details, baseColors, noop, () => retries++);
  assert.match(html, /This CV is temporarily unavailable/);
  assert.equal(buttons.some(props => props.accessibilityLabel === `View ${memberNames[0]} CV`), false);
  buttons.find(props => props.accessibilityLabel === `Refresh CV for ${memberNames[0]}`).onPress();
  assert.equal(retries, 1);
});

test("applicant CV and verification fit narrow screens, both themes, and enlarged text", { timeout: 120000 }, async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage();
  const output = "docs/testing/applicant-review-ui-2026-10-08";
  mkdirSync(output, { recursive: true });
  const results = [];
  try {
    for (const width of [320, 390, 430]) for (const dark of [false, true]) for (const scale of [1, 1.6]) for (const [kind, details] of [["group", group], ["solo", solo]]) {
      const colors = dark ? { ...baseColors, background: "#111218", surface: "#111218", border: "#34353f", text: "#f8f7f2", textSecondary: "#aaaab3" } : baseColors;
      const html = render(details, colors);
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(`<style>${fontCss}html,body{margin:0;height:100%}#root{height:900px;display:flex;flex-direction:column}${RN.StyleSheet.getSheet().textContent}</style><div id="root">${html}</div>`);
      await page.evaluate(() => document.fonts.ready);
      if (scale !== 1) await page.evaluate(scale => {
        for (const node of document.querySelectorAll('[dir="auto"]')) {
          const css = getComputedStyle(node);
          node.style.fontSize = `${parseFloat(css.fontSize) * scale}px`;
          node.style.lineHeight = `${parseFloat(css.lineHeight) * scale}px`;
        }
      }, scale);
      await page.getByRole("button", { name: kind === "group" ? `View ${memberNames[0]} CV` : "View applicant CV", exact: true }).scrollIntoViewIfNeeded();
      const overflow = await page.evaluate(() => [...document.querySelectorAll('[dir="auto"]')].filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.textContent));
      assert.deepEqual(overflow, [], `${kind}: ${width}px, scale ${scale}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.getByText("Government ID photo", { exact: true }).count(), 2);
      const verification = page.getByText("Registered member verification", { exact: true }).locator("../..");
      assert.equal(await verification.getByText("View evidence", { exact: true }).count(), 0);
      const metrics = await page.evaluate(() => {
        const text = [...document.querySelectorAll('[dir="auto"]')];
        return { minFont: Math.min(...text.map(node => parseFloat(getComputedStyle(node).fontSize))), shadows: [...document.querySelectorAll("#root *")].filter(node => getComputedStyle(node).boxShadow !== "none").length };
      });
      assert.ok(metrics.minFont >= 14 * scale - 0.1);
      assert.equal(metrics.shadows, 0);
      if (width === 320 && kind === "group") {
        const prefix = `${output}/${dark ? "dark" : "light"}-${scale}`;
        await page.screenshot({ path: `${prefix}-cv.png` });
        await page.getByText("Review Summary", { exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${prefix}-summary.png` });
        await verification.scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${prefix}-members.png` });
      }
      results.push({ width, dark, scale, kind, ...metrics, passed: true });
    }
  } finally { await browser.close(); }
  writeFileSync(`${output}/layouts.json`, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`${results.length} applicant review layouts passed; physical Android acceptance remains pending.`);
});
