export type ConnectionApplicantRecommendation = {
  score: number;
  recommendation_status: "recommended" | "possible_match";
  matched_criteria: string[];
  missing_criteria: string[];
  explanation: string;
  model_provider: "rules";
  model_version: "connection-applicant-v1";
};

const asObject = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const asString = (value: unknown) => String(value ?? "").trim();

const stringValues = (...values: unknown[]): string[] => {
  const output: string[] = [];

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    const normalized = asString(value);
    if (!normalized) return;
    normalized
      .split(/[,/|]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => output.push(part));
  };

  values.forEach(visit);
  return Array.from(new Set(output.map((value) => value.toLowerCase())));
};

const normalizedWords = (value: unknown) =>
  new Set(
    asString(value)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 3),
  );

const hasKeywordOverlap = (expected: string[], actual: string[]) => {
  if (expected.length === 0 || actual.length === 0) return false;
  const actualWords = new Set(actual.flatMap((value) => [...normalizedWords(value)]));
  return expected.some((value) =>
    [...normalizedWords(value)].some((word) => actualWords.has(word)),
  );
};

export const isConnectionApplication = (application: any) => {
  const eventDetails = asObject(application?.event_details);
  const requestDetails = asObject(eventDetails.request_details);
  return asString(
    application?.request_kind ||
      requestDetails.request_kind ||
      eventDetails.request_kind,
  ).toLowerCase() === "application";
};

export const getConnectionApplicantProfile = (application: any) =>
  application?.applicant || application?.counterparty_profile || {};

export const evaluateConnectionApplicant = (
  application: any,
  target?: any,
): ConnectionApplicantRecommendation | null => {
  if (!isConnectionApplication(application)) return null;

  const eventDetails = asObject(application?.event_details);
  const requestDetails = asObject(eventDetails.request_details);
  const applicant = getConnectionApplicantProfile(application);
  const pitch = asString(
    application?.message ||
      application?.request_application_context ||
      requestDetails.pitch_message ||
      requestDetails.application_context ||
      eventDetails.pitch_message,
  );
  const cvUrl = asString(
    application?.request_cv_url || requestDetails.cv_url || application?.attachment_url,
  );
  const videoUrl = asString(
    application?.request_video_url || requestDetails.video_url || eventDetails.video_url,
  );
  const applicantSkills = stringValues(
    applicant?.skills,
    applicant?.instruments,
    applicant?.genres,
    application?.sender_group?.genre,
    application?.sender_group?.members,
  );
  const targetPreferences = stringValues(
    target?.genre,
    target?.genres,
    target?.group_type,
    target?.requirements,
  );
  const targetWords = [target?.description, target?.name]
    .map(asString)
    .filter(Boolean)
    .join(" ");
  const targetKeywordValues = [...targetPreferences, targetWords];

  const matched: string[] = [];
  const missing: string[] = [];
  let possiblePoints = 0;
  let earnedPoints = 0;

  const scoreCriterion = (
    available: boolean,
    label: string,
    missingLabel: string,
    points: number,
  ) => {
    possiblePoints += points;
    if (available) {
      earnedPoints += points;
      matched.push(label);
    } else {
      missing.push(missingLabel);
    }
  };

  scoreCriterion(pitch.length >= 20, "Application context provided", "Application context is too short", 20);
  scoreCriterion(Boolean(cvUrl), "CV or resume provided", "CV or resume not provided", 25);
  scoreCriterion(Boolean(videoUrl), "Performance video or reel provided", "Performance video or reel not provided", 25);
  scoreCriterion(
    applicantSkills.length > 0,
    "Applicant skills or genres available",
    "Applicant skills or genres unavailable",
    10,
  );

  if (targetKeywordValues.some(Boolean)) {
    scoreCriterion(
      hasKeywordOverlap(targetKeywordValues, applicantSkills),
      "Profile matches listing keywords",
      "No profile match found for the listing keywords",
      20,
    );
  }

  const score = possiblePoints > 0
    ? Math.max(0, Math.min(100, Math.round((earnedPoints / possiblePoints) * 100)))
    : 0;
  const recommendationStatus = score >= 75 ? "recommended" : "possible_match";

  return {
    score,
    recommendation_status: recommendationStatus,
    matched_criteria: matched,
    missing_criteria: missing,
    explanation:
      recommendationStatus === "recommended"
        ? `${score}% advisory fit based on the submitted application and listing details.`
        : `${score}% advisory fit. Review the missing or unclear items before deciding.`,
    model_provider: "rules",
    model_version: "connection-applicant-v1",
  };
};

export const attachConnectionApplicantRecommendation = (
  application: any,
  target?: any,
) => ({
  ...application,
  ai_recommendation:
    application?.ai_recommendation || evaluateConnectionApplicant(application, target),
});

export const sortConnectionApplicationsByRecommendation = (applications: any[]) =>
  [...applications].sort((left, right) => {
    const statusDifference =
      Number(right?.ai_recommendation?.recommendation_status === "recommended") -
      Number(left?.ai_recommendation?.recommendation_status === "recommended");
    if (statusDifference !== 0) return statusDifference;

    const scoreDifference =
      Number(right?.ai_recommendation?.score || 0) -
      Number(left?.ai_recommendation?.score || 0);
    if (scoreDifference !== 0) return scoreDifference;

    return new Date(right?.created_at || 0).getTime() - new Date(left?.created_at || 0).getTime();
  });
