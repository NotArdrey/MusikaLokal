export const APPLICATION_FILTERS = [
  "All", "Accepted", "Pending", "Fired", "Done Contract", "Declined", "Recommended",
] as const;
export type ApplicationFilter = (typeof APPLICATION_FILTERS)[number];

type Application = {
  id?: string;
  status?: unknown;
  created_at?: string | null;
  ai_recommendation?: { recommendation_status?: string } | null;
};

export const normalizeApplicationStatus = (status: unknown) =>
  String(status || "pending").trim().toLowerCase();

export const isActiveApplication = (status: unknown) =>
  ["accepted", "approved"].includes(normalizeApplicationStatus(status));

export const matchesApplicationFilter = (app: Application, filter: ApplicationFilter) => {
  const status = normalizeApplicationStatus(app.status);
  switch (filter) {
    case "Accepted": return isActiveApplication(status);
    case "Pending": return status === "pending";
    case "Fired": return status === "fired";
    case "Done Contract": return status === "completed";
    case "Declined": return status === "rejected" || status === "declined";
    case "Recommended": return app.ai_recommendation?.recommendation_status === "recommended";
    default: return true;
  }
};

export const getApplicationCounts = (applications: readonly Application[]) =>
  Object.fromEntries(APPLICATION_FILTERS.map((filter) => [
    filter, applications.filter((app) => matchesApplicationFilter(app, filter)).length,
  ])) as Record<ApplicationFilter, number>;

const applicationPriority = (app: Application) =>
  isActiveApplication(app.status) ? 0 : normalizeApplicationStatus(app.status) === "pending" ? 1 : 2;
const applicationTimestamp = (app: Application) => {
  const timestamp = Date.parse(app.created_at || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const filterAndSortApplications = <T extends Application>(
  applications: readonly T[], filter: ApplicationFilter,
): T[] => applications.filter((app) => matchesApplicationFilter(app, filter)).sort((a, b) =>
  applicationPriority(a) - applicationPriority(b) ||
  applicationTimestamp(b) - applicationTimestamp(a) ||
  String(a.id || "").localeCompare(String(b.id || "")),
);
