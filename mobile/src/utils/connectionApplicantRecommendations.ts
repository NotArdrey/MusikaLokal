export type ConnectionRecommendationStatus =
  | "recommended"
  | "needs_review"
  | "not_eligible"
  | "insufficient_data";

export type ConnectionApplicantRecommendation = {
  score: number | null;
  recommendation_status: ConnectionRecommendationStatus;
  matched_criteria: string[];
  missing_criteria: string[];
  explanation: string;
  criteria_snapshot?: Record<string, any>;
  model_provider: "rules" | "groq";
  model_version: string;
};

export const CONNECTION_APPLICATION_FILTERS = [
  "All",
  "Accepted",
  "Pending",
  "Declined",
  "Recommended",
  "Needs Review",
] as const;

export type ConnectionApplicationFilter = (typeof CONNECTION_APPLICATION_FILTERS)[number];

const normalizeStatus = (value: unknown) => String(value || "pending").trim().toLowerCase();

export const isConnectionApplication = (application: any) => {
  const eventDetails = application?.event_details && typeof application.event_details === "object"
    ? application.event_details
    : {};
  const requestDetails = eventDetails?.request_details && typeof eventDetails.request_details === "object"
    ? eventDetails.request_details
    : {};
  return String(application?.request_kind || requestDetails.request_kind || eventDetails.request_kind || "")
    .trim()
    .toLowerCase() === "application";
};

// Recommendations must come from the authenticated server function. This
// helper intentionally does not calculate a second client-only score.
export const attachConnectionApplicantRecommendation = (application: any, _target?: any) => ({ ...application });

export const matchesConnectionApplicationFilter = (
  application: any,
  filter: ConnectionApplicationFilter,
) => {
  const status = normalizeStatus(application?.status);
  const recommendationStatus = normalizeStatus(application?.ai_recommendation?.recommendation_status);
  if (filter === "Accepted") return ["accepted", "approved", "connected"].includes(status);
  if (filter === "Pending") return status === "pending";
  if (filter === "Declined") return ["declined", "rejected", "cancelled"].includes(status);
  if (filter === "Recommended") return recommendationStatus === "recommended";
  if (filter === "Needs Review") return ["needs_review", "not_eligible", "insufficient_data"].includes(recommendationStatus);
  return true;
};

export const getConnectionApplicationCounts = (applications: readonly any[]) =>
  Object.fromEntries(CONNECTION_APPLICATION_FILTERS.map((filter) => [
    filter,
    applications.filter((application) => matchesConnectionApplicationFilter(application, filter)).length,
  ])) as Record<ConnectionApplicationFilter, number>;

const recommendationRank = (application: any) => {
  const status = normalizeStatus(application?.ai_recommendation?.recommendation_status);
  if (status === "recommended") return 3;
  if (status === "needs_review") return 2;
  if (status === "not_eligible") return 1;
  return 0;
};

export const sortConnectionApplicationsByRecommendation = (applications: any[]) =>
  [...applications].sort((left, right) => {
    const rankDifference = recommendationRank(right) - recommendationRank(left);
    if (rankDifference !== 0) return rankDifference;
    const scoreDifference = Number(right?.ai_recommendation?.score || 0) - Number(left?.ai_recommendation?.score || 0);
    if (scoreDifference !== 0) return scoreDifference;
    return new Date(right?.created_at || 0).getTime() - new Date(left?.created_at || 0).getTime();
  });

export const filterConnectionApplications = (
  applications: readonly any[],
  filter: ConnectionApplicationFilter,
) => sortConnectionApplicationsByRecommendation(
  applications.filter((application) => matchesConnectionApplicationFilter(application, filter)),
);
