import { evaluateConnectionApplicantRecommendation } from "../mobile/supabase/functions/_shared/connectionApplicantRecommendations.ts";
import { submittedGenreFit } from "../mobile/supabase/functions/_shared/submittedGenreFit.ts";
import { connectionGenreReviewKey } from "../mobile/supabase/functions/_shared/connectionGenreReview.ts";

const assertEquals = (actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
};

const target = {
  id: "00000000-0000-4000-8000-000000000001",
  genre: "Rock",
  latitude: 14.8527,
  longitude: 120.816,
  ai_recommendation_settings: {
    enabled: true,
    location_radius_km: 25,
    criteria: {
      genres: "required",
      instruments: "required",
      location: "required",
      portfolio: "required",
    },
    required_genres: ["Rock"],
    required_instruments: ["Lead guitar"],
  },
};

const finding = (source: string, result = "supported") => ({
  source, result, short_reason: `Rock ${result} by submitted evidence`,
  evidence: [{ source, observation: "Rock performance evidence", timestamp_seconds: null }],
});

Deno.test("connection matching recommends an applicant who meets every configured requirement", () => {
  const result = evaluateConnectionApplicantRecommendation({
    id: "00000000-0000-4000-8000-000000000010",
    applicant: {
      genres: ["Rock"],
      skills: ["Lead Guitar"],
      latitude: 14.85,
      longitude: 120.82,
      is_verified: true,
      verification_status: "APPROVED",
    },
    event_details: { request_details: { video_url: "https://example.test/performance.mp4" } },
  }, "group", target, { cv: finding("cv"), video: finding("performance_video"), status: "completed" });

  assertEquals(result.recommendation_status, "recommended");
  assertEquals(result.score, 100);
  assertEquals(result.is_eligible, true);
  assertEquals(result.criteria_snapshot.requirement_results.length, 4);
});

Deno.test("connection matching keeps a required mismatch visible for manual review", () => {
  const result = evaluateConnectionApplicantRecommendation({
    id: "00000000-0000-4000-8000-000000000011",
    applicant: {
      genres: ["Jazz"],
      skills: ["Drums"],
      latitude: null,
      longitude: null,
    },
    event_details: { request_details: { video_url: null } },
  }, "group", target);

  assertEquals(result.recommendation_status, "needs_review");
  assertEquals(result.is_eligible, false);
  assertEquals(result.missing_criteria.length, 4);
  assertEquals(result.criteria_snapshot.requirement_results.map((row: any) => row.status), [
    "not_met",
    "unclear",
    "unclear",
    "not_met",
  ]);
});

for (const targetType of ["group", "production_team"] as const) {
  Deno.test(`${targetType} genre fit ignores profile genres without submitted evidence`, () => {
    const result = evaluateConnectionApplicantRecommendation({
      id: "profile-only", applicant: { genres: ["Rock"], skills: ["Lead Guitar"], latitude: 14.85, longitude: 120.82 },
      event_details: { request_details: { video_url: "https://example.test/performance.mp4" } },
    }, targetType, target);
    assertEquals(result.matched_criteria.includes("Genre fit"), false);
    assertEquals(result.recommendation_status, "needs_review");
    const genre = result.criteria_snapshot.requirement_results.find((row: any) => row.key === "genres");
    assertEquals(genre?.source, "cv_and_performance_video");
  });
  Deno.test(`${targetType} accepts submitted genre evidence even when the profile differs`, () => {
    const result = evaluateConnectionApplicantRecommendation({
      id: "submitted", applicant: { genres: ["Jazz"] },
    }, targetType, target, { cv: finding("cv"), video: finding("performance_video"), status: "completed" });
    assertEquals(result.matched_criteria.includes("Genre fit"), true);
  });
}

Deno.test("genre fit preserves conflicting CV and video findings for review", () => {
  const result = submittedGenreFit(finding("cv"), finding("performance_video", "not_supported"));
  assertEquals(result.status, "unclear");
  assertEquals(result.conflict, true);
  assertEquals(result.source_results.map((check) => check.status), ["met", "not_met"]);
});

Deno.test("genre fit accepts video-only or CV-only evidence and keeps the other source unclear", () => {
  assertEquals(submittedGenreFit(null, finding("recognized_audio")).status, "met");
  assertEquals(submittedGenreFit(finding("cv"), null).source_results.map((check) => check.status), ["met", "unclear"]);
});

Deno.test("genre fit cannot be supported by unsourced or profile evidence", () => {
  assertEquals(submittedGenreFit({ result: "supported", evidence: [] }, finding("profile")).status, "unclear");
});

Deno.test("genre review cache changes when requirements, files or permission change", () => {
  const application = { event_details: { request_details: { cv_url: "cv1", video_url: "video1" } } };
  const first = connectionGenreReviewKey(application, ["Rock"]);
  assertEquals(first === connectionGenreReviewKey(application, ["Jazz"]), false);
  assertEquals(first === connectionGenreReviewKey({ event_details: { request_details: { cv_url: "cv2", video_url: "video1" } } }, ["Rock"]), false);
  assertEquals(first === connectionGenreReviewKey({ event_details: { request_details: { cv_url: "cv1", video_url: "video2" } } }, ["Rock"]), false);
  assertEquals(first === connectionGenreReviewKey({ event_details: { request_details: { cv_url: "cv1", video_url: "video1", ai_portfolio_review_consent: false } } }, ["Rock"]), false);
});

Deno.test("connection matching reports insufficient data when every criterion is ignored", () => {
  const result = evaluateConnectionApplicantRecommendation({
    id: "00000000-0000-4000-8000-000000000012",
    applicant: {},
    event_details: {},
  }, "production_team", {
    id: "00000000-0000-4000-8000-000000000002",
    ai_recommendation_settings: {
      enabled: true,
      criteria: {
        genres: "ignore",
        instruments: "ignore",
        location: "ignore",
        portfolio: "ignore",
      },
    },
  });

  assertEquals(result.recommendation_status, "insufficient_data");
  assertEquals(result.score, null);
});
