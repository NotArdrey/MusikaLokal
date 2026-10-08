type ApplicationState = {
  raw_status?: string;
  status?: string;
  member_cv_status?: string;
  member_cv_required_count?: number;
  member_cv_submitted_count?: number;
  system_status_reason?: string;
  completion_rate_penalty?: boolean;
};

export function isGroupApplicationCollectingCvs(application: ApplicationState | null | undefined) {
  const status = String(application?.raw_status || application?.status || "").trim().toLowerCase();
  return status === "pending" && ["collecting", "ready"].includes(application?.member_cv_status || "");
}

export function getGroupApplicationCvStatusLabel(
  application: ApplicationState,
  task?: { cv_status?: string; can_finalize?: boolean } | null,
) {
  const status = String(application.raw_status || application.status || "").trim().toLowerCase();
  if (application.status === "Expired") return "Expired";
  if (["accepted", "approved"].includes(status) && application.status === "Happening Now") return "Happening Now";
  if (status === "cancelled") {
    return application.system_status_reason === "application_withdrawn" || application.completion_rate_penalty === true || application.status === "Withdrawn"
      ? "Withdrawn" : "Cancelled";
  }
  const labels: Record<string, string> = {
    resigned: "Withdrawn", rejected: "Declined",
    completed: "Completed", fired: "Fired", accepted: "Accepted", approved: "Accepted",
  };
  if (labels[status]) return labels[status];
  if (!isGroupApplicationCollectingCvs(application) || !task) {
    if (application.status === "pending") return application.member_cv_status === "complete" ? "Application sent" : "Applied";
    return application.status || "Applied";
  }
  if (task.cv_status !== "submitted") return "Your CV required";
  if (task.can_finalize === true) return "Ready to send";
  const remaining = Math.max(0, Number(application.member_cv_required_count || 0) - Number(application.member_cv_submitted_count || 0));
  return remaining > 0
    ? `Waiting for ${remaining} ${remaining === 1 ? "member" : "members"}`
    : "Waiting for members";
}
