import { evaluateConnectionApplicantRecommendation } from "../mobile/supabase/functions/_shared/connectionApplicantRecommendations.ts";

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
  }, "group", target);

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

  assertEquals(result.recommendation_status, "not_eligible");
  assertEquals(result.is_eligible, false);
  assertEquals(result.missing_criteria.length, 4);
  assertEquals(result.criteria_snapshot.requirement_results.map((row: any) => row.status), [
    "not_met",
    "not_met",
    "unclear",
    "not_met",
  ]);
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
