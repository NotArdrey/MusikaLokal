// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

type ReportStatus = "pending" | "resolved" | "dismissed";
type ReportModerationAction =
  | "none"
  | "warn_reporter"
  | "warn_target_owner"
  | "warn_both"
  | "manual_review";

type ReportEscalationStatus = "none" | "manual_review";

const reportModerationActions = new Set<ReportModerationAction>([
  "none",
  "warn_reporter",
  "warn_target_owner",
  "warn_both",
  "manual_review",
]);

const reportEscalationStatuses = new Set<ReportEscalationStatus>([
  "none",
  "manual_review",
]);

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractUserIdFromJwt(authHeader: string): string | null {
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const normalizedPayload = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const paddedPayload = normalizedPayload + "=".repeat((4 - (normalizedPayload.length % 4)) % 4);
    const payload = JSON.parse(atob(paddedPayload));
    const sub = String(payload?.sub || "").trim();
    return sub || null;
  } catch {
    return null;
  }
}

async function getAuthenticatedUserId(
  authHeader: string,
  supabaseUrl: string,
  anonKey: string,
) {
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const userIdFromJwt = extractUserIdFromJwt(authHeader);
  if (userIdFromJwt) return userIdFromJwt;

  const authClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(token);

  if (error || !user?.id) return null;
  return user.id;
}

function parseReportStatus(rawValue: unknown): ReportStatus | null {
  const value = String(rawValue || "").trim().toLowerCase();
  if (value === "pending" || value === "resolved" || value === "dismissed") {
    return value;
  }
  return null;
}

function parseReportModerationAction(rawValue: unknown): ReportModerationAction | null {
  const value = String(rawValue || "").trim().toLowerCase() as ReportModerationAction;
  if (reportModerationActions.has(value)) return value;
  return null;
}

function parseReportEscalationStatus(rawValue: unknown): ReportEscalationStatus | null {
  const value = String(rawValue || "").trim().toLowerCase() as ReportEscalationStatus;
  if (reportEscalationStatuses.has(value)) return value;
  return null;
}

function normalizeText(rawValue: unknown, maxLength: number): string | null {
  if (typeof rawValue !== "string") return null;
  const value = rawValue.trim();
  if (!value) return null;
  return value.slice(0, maxLength);
}

function isMissingColumnError(error: any) {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || "").toLowerCase();

  return (
    code === "42703" ||
    message.includes("does not exist") ||
    message.includes("unknown column")
  );
}

async function assertAdmin(client: any, userId: string) {
  const { data, error } = await client
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data || data.role !== "admin") {
    return false;
  }

  return true;
}

const reportTargetTableMap: Record<string, string> = {
  group: "groups",
  studio: "studios",
  venue: "studios",
  gig: "gigs",
  user: "profiles",
  profile: "profiles",
};

async function insertNotificationIfMissing(
  client: any,
  payload: {
    user_id: string;
    type: "success" | "info" | "warning" | "error";
    title: string;
    message: string;
    image?: string | null;
    meta?: Record<string, unknown>;
  },
) {
  const eventType = payload.meta?.event_type;
  const reportId = payload.meta?.report_id;

  if (typeof eventType === "string" && typeof reportId === "string") {
    const { data: existing } = await client
      .from("notifications")
      .select("id")
      .eq("user_id", payload.user_id)
      .contains("meta", { event_type: eventType, report_id: reportId })
      .limit(1);

    if (Array.isArray(existing) && existing.length > 0) return;
  }

  await client.from("notifications").insert({
    ...payload,
    read: false,
  });
}

async function fetchProfilesMap(client: any, profileIds: string[]) {
  if (profileIds.length === 0) {
    return {} as Record<string, { full_name: string; email: string }>;
  }

  const { data: profileRows, error: profileError } = await client
    .from("profiles")
    .select("id, full_name, email")
    .in("id", profileIds);

  if (profileError) throw profileError;

  return (profileRows || []).reduce(
    (
      acc: Record<string, { full_name: string; email: string }>,
      row: { id: string; full_name?: string | null; email?: string | null },
    ) => {
      acc[row.id] = {
        full_name: row.full_name || "Unknown",
        email: row.email || "",
      };
      return acc;
    },
    {},
  );
}

async function fetchReportTargetDetails(client: any, rawTargetType: unknown, rawTargetId: unknown) {
  const targetType = String(rawTargetType || "").trim().toLowerCase();
  const targetId = String(rawTargetId || "").trim();
  const table = reportTargetTableMap[targetType] || null;

  if (!targetId) {
    return {
      type: targetType,
      id: targetId,
      table,
      record: null,
      owner_profile: null,
    };
  }

  if (!table) {
    return {
      type: targetType,
      id: targetId,
      table: null,
      record: null,
      owner_profile: null,
    };
  }

  const { data: record, error: recordError } = await client
    .from(table)
    .select("*")
    .eq("id", targetId)
    .maybeSingle();

  if (recordError) throw recordError;

  const ownerId = String(
    record?.owner_id ||
    record?.organizer_id ||
    record?.user_id ||
    "",
  ).trim();

  let ownerProfile = null;
  if (ownerId) {
    const { data: ownerRow, error: ownerError } = await client
      .from("profiles")
      .select("*")
      .eq("id", ownerId)
      .maybeSingle();

    if (ownerError) throw ownerError;
    ownerProfile = ownerRow || null;
  }

  return {
    type: targetType,
    id: targetId,
    table,
    record: record || null,
    owner_profile: ownerProfile,
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ error: "Server misconfiguration" }, 500);
    }

    const userId = await getAuthenticatedUserId(authHeader, supabaseUrl, anonKey);
    if (!userId) {
      return jsonResponse({ error: "Invalid JWT" }, 401);
    }

    const client = createClient(supabaseUrl, serviceRoleKey);

    const isAdmin = await assertAdmin(client, userId);
    if (!isAdmin) {
      return jsonResponse({ error: "Forbidden: admin role required" }, 403);
    }

    const { action, ...params } = await req.json();

    if (action === "fetch_reports") {
      const statusFilter = String(params.statusFilter || "all").trim().toLowerCase();
      const escalationFilterRaw = String(params.escalationFilter || "all").trim().toLowerCase();
      const escalationFilter =
        escalationFilterRaw === "all" ? "all" : parseReportEscalationStatus(escalationFilterRaw);
      const pageSize = Math.max(1, Math.min(100, Number(params.limit || 50)));
      const fetchLimit = Math.min(200, pageSize + 1);
      const offset = Math.max(0, Number(params.offset || 0));

      if (escalationFilterRaw !== "all" && !escalationFilter) {
        return jsonResponse({ error: "Invalid escalation filter" }, 400);
      }

      const buildQuery = (columns: string, includeEscalationFilter: boolean) => {
        let query = client
          .from("reports")
          .select(columns)
          .order("created_at", { ascending: false })
          .range(offset, offset + fetchLimit - 1);

        if (["pending", "resolved", "dismissed"].includes(statusFilter)) {
          query = query.eq("status", statusFilter);
        }

        if (
          includeEscalationFilter &&
          escalationFilter &&
          (escalationFilter === "none" || escalationFilter === "manual_review")
        ) {
          query = query.eq("escalation_status", escalationFilter);
        }

        return query;
      };

      const selectWithModeration = [
        "id",
        "reporter_id",
        "target_type",
        "target_id",
        "reason",
        "details",
        "status",
        "created_at",
        "reviewed_by",
        "reviewed_at",
        "moderation_action",
        "moderation_notes",
        "escalation_status",
        "escalated_at",
        "escalation_reason",
      ].join(", ");

      const selectLegacy = "id, reporter_id, target_type, target_id, reason, details, status, created_at";

      let reports: any[] = [];
      let usedLegacy = false;

      {
        const { data, error } = await buildQuery(selectWithModeration, true);
        if (!error) {
          reports = Array.isArray(data) ? data : [];
        } else if (isMissingColumnError(error)) {
          usedLegacy = true;

          if (escalationFilter === "manual_review") {
            return jsonResponse({
              items: [],
              hasMore: false,
              nextOffset: null,
              usedLegacy: true,
            });
          }

          const legacy = await buildQuery(selectLegacy, false);
          if (legacy.error) throw legacy.error;
          reports = Array.isArray(legacy.data) ? legacy.data : [];
        } else {
          throw error;
        }
      }

      const hasMore = reports.length > pageSize;
      const pageRows = hasMore ? reports.slice(0, pageSize) : reports;

      const profileIds = Array.from(
        new Set(
          pageRows
            .flatMap((entry: any) => [entry.reporter_id, entry.reviewed_by])
            .filter(Boolean),
        ),
      );

      const profileMap = await fetchProfilesMap(client, profileIds);

      return jsonResponse({
        items: pageRows.map((entry: any) => ({
          ...entry,
          reporter_name: profileMap[entry.reporter_id]?.full_name || "Unknown",
          reporter_email: profileMap[entry.reporter_id]?.email || "",
          reviewer_name: profileMap[entry.reviewed_by]?.full_name || "",
          moderation_action: entry.moderation_action || "none",
          moderation_notes: entry.moderation_notes || null,
          escalation_status: entry.escalation_status || "none",
          escalated_at: entry.escalated_at || null,
          escalation_reason: entry.escalation_reason || null,
          reviewed_by: entry.reviewed_by || null,
          reviewed_at: entry.reviewed_at || null,
        })),
        hasMore,
        nextOffset: hasMore ? offset + pageSize : null,
        usedLegacy,
      });
    }

    if (action === "fetch_report_details") {
      const reportId = String(params.reportId || "").trim();

      if (!reportId) {
        return jsonResponse({ error: "Missing reportId" }, 400);
      }

      const { data: report, error: reportError } = await client
        .from("reports")
        .select("*")
        .eq("id", reportId)
        .maybeSingle();

      if (reportError) throw reportError;
      if (!report) {
        return jsonResponse({ error: "Report not found" }, 404);
      }

      let reporterProfile = null;
      if (report.reporter_id) {
        const { data: reporterRow, error: reporterError } = await client
          .from("profiles")
          .select("*")
          .eq("id", report.reporter_id)
          .maybeSingle();

        if (reporterError) throw reporterError;
        reporterProfile = reporterRow || null;
      }

      let reviewerProfile = null;
      if (report.reviewed_by) {
        const { data: reviewerRow, error: reviewerError } = await client
          .from("profiles")
          .select("*")
          .eq("id", report.reviewed_by)
          .maybeSingle();

        if (reviewerError) throw reviewerError;
        reviewerProfile = reviewerRow || null;
      }

      const targetDetails = await fetchReportTargetDetails(client, report.target_type, report.target_id);

      return jsonResponse({
        report: {
          ...report,
          reporter_name: reporterProfile?.full_name || "Unknown",
          reporter_email: reporterProfile?.email || "",
          reviewer_name: reviewerProfile?.full_name || "",
        },
        reporter_profile: reporterProfile,
        reviewer_profile: reviewerProfile,
        target: targetDetails,
      });
    }

    if (action === "update_report_status") {
      const reportId = String(params.reportId || "").trim();
      const nextStatus = parseReportStatus(params.nextStatus);
      const hasModerationActionParam =
        params.moderationAction !== undefined &&
        params.moderationAction !== null &&
        String(params.moderationAction).trim().length > 0;
      const moderationAction = hasModerationActionParam
        ? parseReportModerationAction(params.moderationAction)
        : ("none" as ReportModerationAction);
      const moderationNotes = normalizeText(params.moderationNotes, 2000);
      const escalationReason = normalizeText(params.escalationReason, 500);

      if (!reportId || !nextStatus || !moderationAction) {
        return jsonResponse({ error: "Missing required fields" }, 400);
      }

      if (moderationAction === "manual_review" && nextStatus !== "pending") {
        return jsonResponse(
          { error: "Manual review escalation requires pending status." },
          400,
        );
      }

      const { data: existingReport, error: existingReportError } = await client
        .from("reports")
        .select("id, status, reporter_id, target_type, target_id, escalation_status")
        .eq("id", reportId)
        .maybeSingle();

      if (existingReportError) throw existingReportError;
      if (!existingReport) {
        return jsonResponse({ error: "Report not found" }, 404);
      }

      const nowIso = new Date().toISOString();

      const updatePayload: Record<string, unknown> = {
        status: nextStatus,
        reviewed_by: userId,
        reviewed_at: nowIso,
        moderation_action: moderationAction,
        moderation_notes: moderationNotes,
      };

      if (moderationAction === "manual_review") {
        updatePayload.escalation_status = "manual_review";
        updatePayload.escalated_at = nowIso;
        updatePayload.escalation_reason =
          escalationReason || moderationNotes || "Escalated by admin for manual review.";
      } else {
        updatePayload.escalation_status = "none";

        if (nextStatus === "pending" || existingReport.escalation_status === "manual_review") {
          updatePayload.escalated_at = null;
          updatePayload.escalation_reason = null;
        } else {
          updatePayload.escalation_reason = escalationReason;
        }
      }

      let updatedReport: Record<string, unknown> | null = null;
      let usedLegacy = false;

      {
        const { data, error } = await client
          .from("reports")
          .update(updatePayload)
          .eq("id", reportId)
          .select(
            "id, status, target_type, target_id, reviewed_by, reviewed_at, moderation_action, moderation_notes, escalation_status, escalated_at, escalation_reason",
          )
          .maybeSingle();

        if (!error) {
          updatedReport = data;
        } else if (isMissingColumnError(error)) {
          const needsModerationColumns =
            moderationAction !== "none" ||
            moderationNotes !== null ||
            escalationReason !== null ||
            nextStatus === "pending";

          if (needsModerationColumns) {
            return jsonResponse(
              {
                error:
                  "Report moderation workflow requires the latest database migration. Apply the new reports moderation migration first.",
              },
              503,
            );
          }

          usedLegacy = true;

          const fallback = await client
            .from("reports")
            .update({ status: nextStatus })
            .eq("id", reportId)
            .select("id, status, target_type, target_id")
            .maybeSingle();

          if (fallback.error) throw fallback.error;
          updatedReport = fallback.data;
        } else {
          throw error;
        }
      }

      if (!updatedReport) {
        return jsonResponse({ error: "Report not found" }, 404);
      }

      const reporterId = String(existingReport.reporter_id || "").trim();
      let targetOwnerId = "";

      try {
        const targetDetails = await fetchReportTargetDetails(
          client,
          existingReport.target_type,
          existingReport.target_id,
        );

        const normalizedTargetType = String(existingReport.target_type || "").trim().toLowerCase();
        if (normalizedTargetType === "profile" || normalizedTargetType === "user") {
          targetOwnerId = String(existingReport.target_id || "").trim();
        } else {
          targetOwnerId = String(targetDetails?.owner_profile?.id || "").trim();
        }
      } catch {
        targetOwnerId = "";
      }

      const recipients = new Set<string>();

      if (moderationAction === "warn_reporter" || moderationAction === "warn_both") {
        if (reporterId) recipients.add(reporterId);
      }

      if (moderationAction === "warn_target_owner" || moderationAction === "warn_both") {
        if (targetOwnerId) recipients.add(targetOwnerId);
      }

      if (moderationAction === "manual_review") {
        if (reporterId) recipients.add(reporterId);
        if (targetOwnerId) recipients.add(targetOwnerId);
      }

      if (recipients.size > 0) {
        const notificationTitle =
          moderationAction === "manual_review"
            ? "Report Escalated"
            : "Report Moderation Update";

        const notificationMessage =
          moderationAction === "manual_review"
            ? "A report related to your account or content was escalated for manual review by an administrator."
            : `An administrator reviewed a report related to your account or content and set it to ${nextStatus}.`;

        const eventType =
          moderationAction === "manual_review"
            ? "report_manual_review_escalated"
            : "report_moderation_updated";

        for (const recipientId of recipients) {
          try {
            await insertNotificationIfMissing(client, {
              user_id: recipientId,
              type: moderationAction === "manual_review" ? "warning" : "info",
              title: notificationTitle,
              message: notificationMessage,
              image: null,
              meta: {
                report_id: reportId,
                target_type: existingReport.target_type,
                target_id: existingReport.target_id,
                next_status: nextStatus,
                moderation_action: moderationAction,
                event_type: eventType,
              },
            });
          } catch {
            // Do not block moderation if notification insert fails.
          }
        }
      }

      return jsonResponse({
        item: {
          ...updatedReport,
          moderation_action: updatedReport.moderation_action || moderationAction,
          moderation_notes:
            updatedReport.moderation_notes !== undefined
              ? updatedReport.moderation_notes
              : moderationNotes,
          escalation_status:
            updatedReport.escalation_status !== undefined
              ? updatedReport.escalation_status
              : (moderationAction === "manual_review" ? "manual_review" : "none"),
        },
        usedLegacy,
      });
    }

    return jsonResponse({ error: `Unsupported action: ${action}` }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
