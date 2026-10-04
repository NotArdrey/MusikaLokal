import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { submittedGenreFit } from "../mobile/supabase/functions/_shared/submittedGenreFit.ts";
import * as memberMatching from "../mobile/supabase/functions/_shared/gigMemberRequirementMatching.ts";

function loadGigReview(root) {
  const source = readFileSync(new URL(`../${root}/supabase/functions/gig-applications/index.ts`, import.meta.url), "utf8");
  const exports = {};
  const javascript = ts.transpileModule(`${source}\nexport { evaluateGigApplication, normalizeRecommendationSettings };`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(javascript, {
    exports, console, Deno: { serve() {}, env: { get() {} } },
    require: (name) => name.endsWith("submittedGenreFit.ts") ? { submittedGenreFit }
      : name.endsWith("gigMemberRequirementMatching.ts") ? memberMatching
      : {},
  });
  return exports;
}

const finding = (source, result = "supported") => ({
  criterion: "genre_requirement", source, result,
  short_reason: `${source} genre evidence: ${result}`,
  evidence: [{ source, observation: `Rock ${result}`, timestamp_seconds: null }],
});

for (const root of ["mobile", "web"]) {
  const helpers = loadGigReview(root);
  const settings = helpers.normalizeRecommendationSettings({
    enabled: true, location_radius_km: null,
    criteria: { genres: "required", instruments: "ignore", location: "ignore", portfolio: "ignore" },
  });
  const base = () => helpers.evaluateGigApplication({
    id: "app", gig_id: "gig", applicant: { genres: ["Rock"] }, slot_type: "solo",
  }, { genres: ["Rock"] }, settings);
  const withReview = async (review) => {
    const client = { from: () => ({ select: () => ({ in: async () => ({ data: [{ application_id: "app", status: "completed", ...review }], error: null }) }) }) };
    return (await helpers.addAdvisoryMediaReviewSummaries(client, [base()]))[0];
  };

  test(`${root}: matching profile genres do not earn gig genre points`, () => {
    assert.equal(base().score, 0);
    assert.equal(base().matched_criteria.includes("Genre fit"), false);
    assert.equal(base().recommendation_status, "needs_review");
  });
  test(`${root}: CV and video genre evidence earn the gig genre score`, async () => {
    const result = await withReview({ cv_result: { evidence: [finding("cv")] }, video_result: { evidence: [finding("performance_video")] } });
    assert.equal(result.score, 100);
    assert.equal(result.recommendation_status, "recommended");
    assert.equal(result.criteria_snapshot.requirement_results[0].source, "cv_and_performance_video");
    assert.equal(result.criteria_snapshot.requirement_results[0].source_results.length, 2);
  });
  test(`${root}: contradictory video cannot be hidden by a supported combined CV finding`, async () => {
    const result = await withReview({
      evidence: [finding("cv")], cv_result: { evidence: [finding("cv")] },
      video_result: { evidence: [finding("performance_video", "not_supported")] },
    });
    assert.equal(result.score, 0);
    assert.equal(result.recommendation_status, "needs_review");
    assert.equal(result.criteria_snapshot.requirement_results[0].conflict, true);
  });
  test(`${root}: legacy combined CV support cannot confirm an unclear video`, async () => {
    const combined = finding("cv");
    combined.evidence.push({ source: "performance_video", observation: "Genre cannot be determined", timestamp_seconds: null });
    const result = await withReview({ evidence: [combined] });
    const checks = result.criteria_snapshot.requirement_results[0].source_results;
    assert.equal(checks[0].status, "met");
    assert.equal(checks[1].status, "unclear");
  });
}
