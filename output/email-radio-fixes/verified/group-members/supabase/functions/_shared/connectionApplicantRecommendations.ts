import { attachConnectionGenreReviews } from "./connectionGenreReview.ts";
import { submittedGenreFit } from "./submittedGenreFit.ts";

type CriterionMode = "required" | "ignore";
type TargetType = "group" | "production_team";

const MODEL_VERSION = "connection-fit-v3-submitted-genres";

const uniqueStrings = (values: unknown[]): string[] => {
  const output: string[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== "string") return;
    value.split(/[,/|]/).map((item) => item.trim()).filter(Boolean).forEach((item) => output.push(item));
  };
  values.forEach(visit);
  return Array.from(new Set(output));
};

const normalizeValue = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bmusic\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^r and b$/, "rnb")
    .replace(/^rhythm and blues$/, "rnb")
    .replace(/^hip hop$/, "hiphop")
    .replace(/^electronic dance(?: music)?$/, "edm")
    .replace(/^original pilipino(?: music)?$/, "opm");

const valuesOverlap = (expected: string[], actual: string[]) => {
  const normalizedActual = actual.map(normalizeValue).filter(Boolean);
  return expected.some((expectedValue) => {
    const normalizedExpected = normalizeValue(expectedValue);
    if (!normalizedExpected) return false;
    return normalizedActual.some((actualValue) =>
      actualValue === normalizedExpected ||
      actualValue.includes(normalizedExpected) ||
      normalizedExpected.includes(actualValue)
    );
  });
};

const readMode = (value: unknown, fallback: CriterionMode): CriterionMode =>
  value === "required" || value === "ignore" ? value : fallback;

const normalizeSettings = (target: any, targetType: TargetType) => {
  const value = target?.ai_recommendation_settings && typeof target.ai_recommendation_settings === "object"
    ? target.ai_recommendation_settings
    : {};
  const parsedRadius = Number(value.location_radius_km);
  const defaultGenres = targetType === "group" ? uniqueStrings([target?.genre]) : [];
  const configuredGenres = uniqueStrings([value.required_genres]);

  return {
    enabled: value.enabled !== false,
    location_radius_km:
      value.location_radius_km === null || value.location_radius_km === "any"
        ? null
        : [5, 10, 25, 50, 100].includes(parsedRadius)
          ? parsedRadius
          : null,
    criteria: {
      genres: readMode(value?.criteria?.genres, defaultGenres.length > 0 ? "required" : "ignore"),
      instruments: readMode(value?.criteria?.instruments, "ignore"),
      location: readMode(value?.criteria?.location, "ignore"),
      portfolio: readMode(value?.criteria?.portfolio, "required"),
    },
    required_genres: configuredGenres.length > 0 ? configuredGenres : defaultGenres,
    required_instruments: uniqueStrings([value.required_instruments]),
  };
};

const readCoordinates = (value: any) => {
  if (value?.latitude === null || value?.latitude === undefined || value?.latitude === "") return null;
  if (value?.longitude === null || value?.longitude === undefined || value?.longitude === "") return null;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
};

const distanceKm = (
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) => {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLatitude = radians(to.latitude - from.latitude);
  const deltaLongitude = radians(to.longitude - from.longitude);
  const latitude1 = radians(from.latitude);
  const latitude2 = radians(to.latitude);
  const a = Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const requestDetails = (application: any) => {
  const eventDetails = application?.event_details && typeof application.event_details === "object"
    ? application.event_details
    : {};
  return eventDetails?.request_details && typeof eventDetails.request_details === "object"
    ? eventDetails.request_details
    : {};
};

const getPerformer = (application: any) => {
  const profile = application?.applicant || null;
  const group = application?.sender_group || null;
  const details = requestDetails(application);
  const groupMemberValues = Array.isArray(group?.members)
    ? group.members.flatMap((member: any) => [member?.instrument, member?.member_role, member?.role, member?.skills])
    : [];
  return {
    genres: uniqueStrings([profile?.genres, group?.genre]),
    instruments: uniqueStrings([profile?.skills, profile?.instruments, groupMemberValues]),
    coordinates: readCoordinates(group) || readCoordinates(profile),
    has_portfolio: Boolean(details.video_url),
    verified:
      profile?.is_verified === true &&
      String(profile?.verification_status || "").trim().toUpperCase() === "APPROVED",
  };
};

const evaluate = (application: any, targetType: TargetType, target: any, settings: ReturnType<typeof normalizeSettings>, genreReview?: any) => {
  const performer = getPerformer(application);
  const matched: string[] = [];
  const missing: string[] = [];
  const requirementResults: Array<Record<string, unknown>> = [];
  let earnedPoints = 0;
  let possiblePoints = 0;
  let missingRequired = false;
  let genreNeedsReview = false;

  const valueCriterion = (
    key: "genres" | "instruments",
    label: string,
    weight: number,
    expected: string[],
    actual: string[],
    source: string,
  ) => {
    if (settings.criteria[key] === "ignore" || expected.length === 0) return;
    possiblePoints += weight;
    const met = actual.length > 0 && valuesOverlap(expected, actual);
    if (met) {
      earnedPoints += weight;
      matched.push(label);
    } else {
      missing.push(actual.length > 0 ? label : `${label} unavailable on the applicant profile or roster`);
      missingRequired = true;
    }
    requirementResults.push({
      key,
      label,
      status: met ? "met" : actual.length > 0 ? "not_met" : "unclear",
      source,
      detail: met
        ? `${label} matches the saved ${targetType === "group" ? "group" : "production team"} requirement.`
        : actual.length > 0
          ? `${label} does not match the saved requirement.`
          : `The applicant profile does not contain enough information to confirm ${label.toLowerCase()}.`,
    });
  };

  valueCriterion("instruments", "Instrument or role fit", 30, settings.required_instruments, performer.instruments, application?.sender_group ? "group_roster" : "profile");
  if (settings.criteria.genres !== "ignore" && settings.required_genres.length > 0) {
    possiblePoints += 25;
    const result = submittedGenreFit(genreReview?.cv, genreReview?.video);
    requirementResults.push(result);
    if (result.status === "met") {
      earnedPoints += 25;
      matched.push("Genre fit");
    } else {
      missing.push(result.status === "unclear" ? "Genre fit could not be confirmed from the CV and performance video" : "Genre fit");
      missingRequired = true;
      genreNeedsReview = result.status === "unclear";
    }
  }

  let applicantDistanceKm: number | null = null;
  if (settings.criteria.location !== "ignore" && settings.location_radius_km !== null) {
    possiblePoints += 10;
    const targetCoordinates = readCoordinates(target);
    applicantDistanceKm = targetCoordinates && performer.coordinates
      ? distanceKm(targetCoordinates, performer.coordinates)
      : null;
    const met = applicantDistanceKm !== null && applicantDistanceKm <= settings.location_radius_km;
    if (met) {
      earnedPoints += 10;
      matched.push(`Within ${settings.location_radius_km} km location range`);
    } else {
      missing.push(applicantDistanceKm === null ? "Location distance unavailable" : `Outside ${settings.location_radius_km} km required range`);
      missingRequired = true;
    }
    requirementResults.push({
      key: "location",
      label: "Location range",
      status: met ? "met" : applicantDistanceKm === null ? "unclear" : "not_met",
      source: "stored_coordinates",
      detail: met
        ? `Stored coordinates place the applicant within ${settings.location_radius_km} km.`
        : applicantDistanceKm === null
          ? "Stored coordinates are unavailable, so the location range could not be confirmed."
          : `Stored coordinates place the applicant outside the ${settings.location_radius_km} km range.`,
    });
  }

  if (settings.criteria.portfolio !== "ignore") {
    possiblePoints += 15;
    if (performer.has_portfolio) {
      earnedPoints += 15;
      matched.push("Performance video or reel submitted");
    } else {
      missing.push("Performance video or reel not provided");
      missingRequired = true;
    }
    requirementResults.push({
      key: "portfolio",
      label: "Performance video or reel",
      status: performer.has_portfolio ? "met" : "not_met",
      source: "performance_video",
      detail: performer.has_portfolio
        ? "A performance video or reel was submitted and remains subject to manual review."
        : "No performance video or reel was submitted.",
    });
  }

  const hasCriteria = possiblePoints > 0;
  const score = hasCriteria ? Math.max(0, Math.min(100, Math.round((earnedPoints / possiblePoints) * 100))) : null;
  const recommendationStatus = !hasCriteria ? "insufficient_data" : genreNeedsReview ? "needs_review" : missingRequired ? "not_eligible" : "recommended";
  const explanation = recommendationStatus === "recommended"
    ? `Meets the configured ${targetType === "group" ? "group" : "production team"} criteria. Review the ${score}% advisory fit before deciding.`
    : recommendationStatus === "not_eligible" || recommendationStatus === "needs_review"
      ? "At least one required criterion could not be confirmed. Review every application before deciding."
      : "No applicable applicant match criteria are configured.";

  return {
    application_id: application.id,
    target_type: targetType,
    target_id: target.id,
    score,
    is_verified: performer.verified,
    is_eligible: recommendationStatus === "recommended",
    recommendation_status: recommendationStatus,
    matched_criteria: matched,
    missing_criteria: missing,
    explanation,
    criteria_snapshot: {
      settings,
      requirements: {
        genres: settings.required_genres,
        instruments: settings.required_instruments,
      },
      performer: {
        genres: performer.genres,
        instruments: performer.instruments,
        has_portfolio: performer.has_portfolio,
      },
      requirement_results: requirementResults,
      genre_review_status: genreReview?.status || "unavailable",
      distance_km: applicantDistanceKm === null ? null : Number(applicantDistanceKm.toFixed(1)),
      score_breakdown: { earned_points: earnedPoints, possible_points: possiblePoints },
    },
    model_provider: "rules",
    model_version: MODEL_VERSION,
  };
};

export function evaluateConnectionApplicantRecommendation(
  application: any,
  targetType: TargetType,
  target: any,
  genreReview?: any,
) {
  return evaluate(application, targetType, target, normalizeSettings(target, targetType), genreReview);
}

const addGroqExplanations = async (evaluations: any[]) => {
  const apiKeys = Array.from(new Set([
    Deno.env.get("GROQ_API_KEY"),
    Deno.env.get("GROQ_FALLBACK_API_KEY"),
  ].filter((key): key is string => typeof key === "string" && key.trim().length > 0).map((key) => key.trim())));
  if (apiKeys.length === 0 || evaluations.length === 0) return evaluations;
  const models = Array.from(new Set([
    Deno.env.get("GROQ_TEXT_MODEL"),
    Deno.env.get("GROQ_MODEL"),
    Deno.env.get("GROQ_TEXT_FALLBACK_MODEL"),
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
  ].filter((model): model is string => typeof model === "string" && model.trim().length > 0).map((model) => model.trim())));
  const messages = [
    {
      role: "system",
      content: "Explain structured applicant-fit results. Never accept or reject applicants. Return JSON only as {\"recommendations\":[{\"application_id\":\"uuid\",\"explanation\":\"one concise neutral sentence\"}]}. Do not infer protected or personal traits.",
    },
    {
      role: "user",
      content: JSON.stringify(evaluations.map((item) => ({
        application_id: item.application_id,
        score: item.score,
        status: item.recommendation_status,
        matched: item.matched_criteria,
        missing: item.missing_criteria,
      }))),
    },
  ];

  for (const model of models) {
    for (const [keyIndex, apiKey] of apiKeys.entries()) {
      try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, temperature: 0.1, response_format: { type: "json_object" }, messages }),
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) {
          console.warn("connection_recommendation_ai_model_failed", { model, key_slot: keyIndex + 1, status: response.status });
          continue;
        }
        const payload = await response.json();
        const content = payload?.choices?.[0]?.message?.content;
        const parsed = typeof content === "string" ? JSON.parse(content) : null;
        const explanationById = new Map(
          (Array.isArray(parsed?.recommendations) ? parsed.recommendations : [])
            .filter((item: any) => typeof item?.application_id === "string" && typeof item?.explanation === "string")
            .map((item: any) => [item.application_id, item.explanation.trim()]),
        );
        return evaluations.map((item) => ({
          ...item,
          explanation: explanationById.get(item.application_id) || item.explanation,
          model_provider: explanationById.has(item.application_id) ? "groq" : item.model_provider,
        }));
      } catch (error) {
        console.warn("connection_recommendation_ai_model_failed", {
          model,
          key_slot: keyIndex + 1,
          message: String((error as any)?.message || error),
        });
      }
    }
  }
  return evaluations;
};

const rank = (recommendation: any) => {
  const status = String(recommendation?.recommendation_status || "");
  if (status === "recommended") return 3;
  if (status === "needs_review") return 2;
  if (status === "not_eligible") return 1;
  return 0;
};

export function sortConnectionApplicantRecommendations(applications: any[]) {
  return [...applications].sort((left, right) => {
    const recommendationDifference = rank(right.ai_recommendation) - rank(left.ai_recommendation);
    if (recommendationDifference !== 0) return recommendationDifference;
    const scoreDifference = Number(right.ai_recommendation?.score || 0) - Number(left.ai_recommendation?.score || 0);
    if (scoreDifference !== 0) return scoreDifference;
    return new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime();
  });
}

export async function attachConnectionApplicantRecommendations(
  supabaseAdmin: any,
  applications: any[],
  targetType: TargetType,
  target: any,
) {
  const settings = normalizeSettings(target, targetType);
  if (!settings.enabled) {
    return applications.map((application) => ({ ...application, ai_recommendation: null }));
  }

  const genreReviews = settings.criteria.genres !== "ignore"
    ? await attachConnectionGenreReviews(supabaseAdmin, applications, settings.required_genres)
    : new Map<string, any>();
  let evaluations = applications.map((application) => evaluate(application, targetType, target, settings, genreReviews.get(application.id)));
  evaluations = await addGroqExplanations(evaluations);

  if (evaluations.length > 0) {
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from("connection_application_recommendations").upsert(
      evaluations.map((item) => ({ ...item, generated_at: now, updated_at: now })),
      { onConflict: "application_id" },
    );
    if (error) {
      console.warn("connection_recommendation_audit_upsert_failed", { message: error.message });
    }
  }

  const byId = new Map(evaluations.map((item) => [item.application_id, item]));
  return sortConnectionApplicantRecommendations(
    applications.map((application) => ({ ...application, ai_recommendation: byId.get(application.id) || null })),
  );
}
