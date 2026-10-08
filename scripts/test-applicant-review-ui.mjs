import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { chromium } from "@playwright/test";
import * as cvApplicantName from "../mobile/supabase/functions/_shared/cvApplicantName.ts";

const requireMobile = createRequire(new URL("../mobile/package.json", import.meta.url));
const React = requireMobile("react");
const RN = requireMobile("react-native-web");
const { renderToStaticMarkup } = requireMobile("react-dom/server");
const h = React.createElement;
const theme = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../mobile/src/theme/tokens.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: theme });
const iconDirectory = new URL("../mobile/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/", import.meta.url);
const iconGlyphs = JSON.parse(readFileSync(new URL("glyphmaps/Ionicons.json", iconDirectory), "utf8"));
const fontCss = Object.values(theme.typography).filter((value, index, fonts) => fonts.indexOf(value) === index).map(name => {
  const [family, weight] = name.split("_");
  const packageName = family === "Manrope" ? "manrope" : "space-grotesk";
  const file = new URL(`../mobile/node_modules/@expo-google-fonts/${packageName}/${weight}/${name}.ttf`, import.meta.url);
  return `@font-face{font-family:${name};src:url(data:font/ttf;base64,${readFileSync(file).toString("base64")})}`;
}).join("\n") + `\n@font-face{font-family:Ionicons;src:url(data:font/ttf;base64,${readFileSync(new URL("Fonts/Ionicons.ttf", iconDirectory)).toString("base64")})}`;
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
    if (name === "@expo/vector-icons") return { Ionicons: ({ name, size, color }) => h("span", {
      "aria-hidden": true,
      style: { display: "inline-flex", fontFamily: "Ionicons", fontSize: size, lineHeight: `${size}px`, width: size, height: size, flexShrink: 0, color },
    }, String.fromCodePoint(iconGlyphs[name])) };
    if (name.includes("gigApplicantFilters")) return { isActiveApplication: () => true };
    if (name.includes("cvApplicantName")) return cvApplicantName;
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
const screenshotApplicant = {
  ...solo, applicant: { ...solo.applicant, full_name: "Bea Navarro" }, member_verification: null,
  ai_recommendation: { ...solo.ai_recommendation, criteria_snapshot: { requirement_results: [
    { key: "genres", label: "Music genre", status: "met", source: "cv_and_performance_video", source_results: [
      { source: "cv", status: "met", detail: "The CV lists Pop and Rock genres explicitly.", evidence: [{ source: "cv", observation: "Genres listed in the CV include Pop and Rock." }] },
      { source: "performance_video", status: "met", detail: "The video demonstrates a Rock arrangement.", evidence: [{ source: "performance_video", observation: "Rock guitar accompaniment is heard in the performance." }] },
    ] },
    { key: "portfolio", label: "Performance evidence", status: "met", source: "performance_video", detail: "The submitted performance video contains direct performance evidence." },
  ] } },
  ai_portfolio_review: { status: "completed", source_summary: {
    cv_processing_status: "reviewed", cv_document_classification: { status: "cv" },
    cv_name_check: { status: "mismatch", extracted_name: "JARED CARIASO", confidence: 0.99 },
  } },
};
const noop = () => {};
function render(details, colors = baseColors, onOpenMedia = noop, onRetry = noop) {
  buttons.length = 0;
  return renderToStaticMarkup(h(exports.default, { visible: true, summary: details, details, colors, loading: false, error: null, onClose: noop, onRetry, onAccept: noop, onDecline: noop, onOpenMedia }));
}

function renderAllSections(details, colors = baseColors) {
  const originalUseState = React.useState;
  let falseStates = 0;
  React.useState = initial => originalUseState(initial === false && falseStates++ > 0 ? true : initial);
  try { return render(details, colors); } finally { React.useState = originalUseState; }
}

test("applicant review has no score, confirmed-requirements dropdown, or evidence controls", () => {
  for (const score of [null, 0, 85, 100, "invalid"]) {
    const details = { ...solo, ai_recommendation: { ...solo.ai_recommendation, score } };
    for (const html of [render(details), renderAllSections(details)]) {
      assert.match(html, /Review Summary/);
      assert.doesNotMatch(html, /\b\d+(?:\.\d+)?%|match score|EVIDENCE SOURCE|RELEVANT EXTRACT|REVIEW ANALYSIS|View evidence|Hide evidence|\d+ requirements? confirmed|File review details/);
    }
  }
});

for (const kind of ["duo", "band"]) {
  test(`${kind} CVs are checked against their members and ignore a stale group-name warning`, () => {
    const details = {
      ...group, group: { ...group.group, name: "Fantastic duo", group_type: kind }, cv_url: "https://example.test/legacy.pdf",
      ai_portfolio_review: { status: "completed", source_summary: { cv_name_check: { status: "mismatch", extracted_name: "Jared Cariaso", confidence: 0.99 } } },
      member_cvs: group.member_cvs.map((member, index) => ({ ...member, ai_review_result: {
        name_check: { status: "mismatch", extracted_name: index ? "Neil Laza" : "Jared Cariaso", confidence: 0.99 },
      } })),
    };
    const html = render(details);
    assert.doesNotMatch(html, /Needs attention/);
    assert.equal((html.match(/CV name matches this member/g) || []).length, 2);
    assert.doesNotMatch(html, /CV identity mismatch|application belongs to Fantastic duo/);
    assert.equal(buttons.some(props => props.accessibilityLabel === "View applicant CV"), false);
  });
}

test("a different person's CV is flagged for the correct member even after the first CV matches", () => {
  const details = { ...group, member_cvs: group.member_cvs.map((member, index) => ({ ...member, ai_review_result: {
    name_check: { status: "match", extracted_name: index ? "Bea Navarro" : "Jared Cariaso", confidence: 0.99 },
  } })) };
  const html = render(details);
  assert.match(html, /CV name does not match this member/);
  assert.match(html, /registered member is Neil Ardrey Payoyo Laza/);
  assert.doesNotMatch(html, /application belongs to Malakas Band/);
});

test("video genre and singing observations are shown independently of CV claims", () => {
  const html = render({ ...solo, ai_portfolio_review: { status: "completed", source_summary: { video_structured_output: {
    singing_present: true, detected_genres: [{ genre: "Rock", observation: "Rock rhythm", timestamp_seconds: 4 }],
    vocal_performance: { status: "unclear", short_reason: "The mouth is obscured.", evidence: [] },
  } } } });
  assert.match(html, /Genre heard in video/);
  assert.match(html, /Singing heard/);
  assert.match(html, /Visible singing and audio need manual review/);
  assert.match(html, /cannot prove live singing or rule out lip-syncing/);
});

test("skipped member CVs prevent the group from appearing fully confirmed", () => {
  const check = cvApplicantName.summarizeMemberCvNameChecks([
    { member_name: "Jared Cariaso", name_check: cvApplicantName.compareCvApplicantName("Jared Cariaso", ["Jared Cariaso"], 0.99) },
    { member_name: "Neil Laza" },
  ]);
  assert.equal(check.status, "unclear");
  assert.match(check.summary, /1 of 2/);
});

test("member CV findings remain with their named documents and skipped reviews are not shown", () => {
  const details = { ...group, member_cvs: group.member_cvs.map((member, index) => ({ ...member, ai_review_consent: !index,
    ai_review_result: { findings: [{ criterion: "instrument_requirement", result: "supported", short_reason: index ? "A skipped member's old finding" : "Jared's CV lists guitar experience.", source: "cv", evidence: [] }] },
  })) };
  const html = render(details);
  assert.match(html, /Jared&#x27;s CV lists guitar experience/);
  assert.doesNotMatch(html, /A skipped member&#x27;s old finding/);
  assert.equal((html.match(/data-testid="cv-review"/g) || []).length, 1);
  assert.equal((html.match(/View CV/g) || []).length, 2);
});

test("CV and performance findings are visible in their own sections without evidence controls", async () => {
  const weakVideo = { ...screenshotApplicant, ai_recommendation: { ...screenshotApplicant.ai_recommendation, criteria_snapshot: {
    requirement_results: screenshotApplicant.ai_recommendation.criteria_snapshot.requirement_results.map(item => item.key !== "genres" ? item : {
      ...item, source_results: item.source_results.map(check => check.source === "cv" ? check : { ...check, status: "unclear", detail: "Genre could not be confirmed from the video.", evidence: [] }),
    }),
  } } };
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage();
  const output = "docs/testing/applicant-grouped-review-2026-10-08";
  mkdirSync(output, { recursive: true });
  const results = [];
  try {
    for (const width of [320, 390, 430]) for (const dark of [false, true]) for (const scale of [1, 1.6]) for (const [kind, details] of [["matched", screenshotApplicant], ["weak-video", weakVideo]]) {
      const colors = dark ? { ...baseColors, background: "#111218", surface: "#111218", border: "#34353f", text: "#f8f7f2", textSecondary: "#aaaab3" } : baseColors;
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(`<style>${fontCss}html,body{margin:0;height:100%}#root{height:900px;display:flex;flex-direction:column}${RN.StyleSheet.getSheet().textContent}</style><div id="root">${render(details, colors)}</div>`);
      await page.evaluate(() => document.fonts.ready);
      if (scale !== 1) await page.evaluate(scale => {
        for (const node of document.querySelectorAll('[dir="auto"]')) {
          const css = getComputedStyle(node);
          node.style.fontSize = `${parseFloat(css.fontSize) * scale}px`;
          node.style.lineHeight = `${parseFloat(css.lineHeight) * scale}px`;
        }
      }, scale);
      const cv = page.getByTestId("cv-review"), performance = page.getByTestId("performance-review");
      assert.equal(await cv.count(), 1);
      assert.equal(await performance.count(), 1);
      assert.equal(await page.getByTestId("confirmed-requirements").count(), 0);
      assert.equal(await page.getByRole("button", { name: /evidence/i }).count(), 0);
      assert.equal(await page.getByText("File review details", { exact: true }).count(), 0);
      assert.equal(await cv.getByText("CV identity mismatch", { exact: true }).count(), 1);
      assert.equal(await page.getByText("CV identity mismatch", { exact: true }).count(), 1);
      assert.equal(await cv.getByText("The CV lists Pop and Rock genres explicitly.", { exact: true }).count(), 1);
      assert.equal(await performance.getByText(/The CV lists/).count(), 0);
      assert.equal(await cv.getByText(/The video demonstrates|Genre could not be confirmed from the video/).count(), 0);
      assert.equal(await cv.getByRole("button", { name: "View applicant CV", exact: true }).count(), 1);
      assert.equal(await performance.getByRole("button", { name: "Watch performance", exact: true }).count(), 1);
      const genre = performance.getByTestId("finding-video-genre_requirement");
      assert.equal(await genre.getByText(kind === "matched" ? "Confirmed from video" : "Couldn't confirm", { exact: true }).count(), 1);
      const metrics = await page.evaluate(() => {
        const cv = document.querySelector('[data-testid="cv-review"]');
        const performance = document.querySelector('[data-testid="performance-review"]');
        const cvDescription = cv.lastElementChild.children[1];
        const videoDescription = performance.lastElementChild.children[1];
        const typography = node => { const css = getComputedStyle(node); return { family: css.fontFamily, size: css.fontSize, lineHeight: css.lineHeight }; };
        const sourceFindings = [...document.querySelectorAll('[data-testid^="finding-cv-"], [data-testid^="finding-video-"]')];
        return {
          cvBody: typography(cvDescription), videoBody: typography(videoDescription),
          cvBorder: parseFloat(getComputedStyle(cv).borderTopWidth), performanceBorder: parseFloat(getComputedStyle(performance).borderTopWidth),
          findingBorders: sourceFindings.map(node => parseFloat(getComputedStyle(node).borderTopWidth)),
          findingAlignment: sourceFindings.map(node => Math.abs(node.getBoundingClientRect().left - cvDescription.getBoundingClientRect().left)),
          cvBeforePerformance: Boolean(cv.compareDocumentPosition(performance) & Node.DOCUMENT_POSITION_FOLLOWING),
          overflow: [...document.querySelectorAll('[dir="auto"]')].filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.textContent),
        };
      });
      assert.deepEqual(metrics.cvBody, metrics.videoBody);
      assert.ok(Math.abs(parseFloat(metrics.cvBody.size) - 16 * scale) < 0.1);
      assert.equal(metrics.cvBorder, 0);
      assert.equal(metrics.performanceBorder, 1);
      assert.ok(metrics.findingBorders.every(width => width === 0));
      assert.ok(metrics.findingAlignment.every(offset => offset <= 1));
      assert.equal(metrics.cvBeforePerformance, true);
      assert.deepEqual(metrics.overflow, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (kind === "matched" && ((width === 390 && scale === 1) || (width === 320 && scale === 1.6))) {
        await page.getByText("Qualification Review", { exact: true }).evaluate(node => node.scrollIntoView({ block: "start" }));
        await page.screenshot({ path: `${output}/${width}-${dark ? "dark" : "light"}-${scale}-cv.png` });
        await performance.locator('[dir="auto"]').first().evaluate(node => node.scrollIntoView({ block: "start" }));
        await page.screenshot({ path: `${output}/${width}-${dark ? "dark" : "light"}-${scale}-performance.png` });
      }
      results.push({ width, dark, scale, kind, ...metrics, passed: true });
    }
  } finally { await browser.close(); }
  writeFileSync(`${output}/source-layouts.json`, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`${results.length} grouped CV and performance layouts passed.`);
});

test("legacy combined CV support does not confirm contradictory video findings", () => {
  const html = render({ ...solo, ai_recommendation: { criteria_snapshot: { requirement_results: [{ key: "genres", status: "met", source: "cv_and_performance_video" }] } },
    ai_portfolio_review: { status: "completed", evidence: [{ criterion: "genre_requirement", result: "supported", source: "cv_and_performance_video", short_reason: "CV and video were reviewed.", evidence: [
      { source: "cv", observation: "The CV lists Rock." },
      { source: "performance_video", observation: "The video did not demonstrate Rock." },
    ] }] },
  });
  assert.match(html, /Not demonstrated in video/);
  assert.doesNotMatch(html, /Confirmed from video/);
});

test("every group member CV opens directly in the CV section, including during video review", () => {
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
  const output = "docs/testing/applicant-grouped-review-2026-10-08";
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
  writeFileSync(`${output}/review-layouts.json`, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`${results.length} applicant review layouts passed; physical Android acceptance remains pending.`);
});
