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
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

type PermitEntityType = "studio" | "gig";
type ReviewAction = "approve" | "reject";
type MetricsDateRange = "7d" | "30d" | "all";
type IncidentCategory = "booking" | "profile" | "other";
type QueryHealthTracker = { missingSchemaDetected: boolean };

type RevenueTrendBucket = {
  label: string;
  startMs: number;
  endMs: number;
  gross: number;
  payoutDeductions: number;
  refunds: number;
};

type PermitStatus = "pending_review" | "approved" | "rejected" | "resubmitted";

const METRICS_CACHE_TTL_MS = 15_000;
const metricsResponseCache = new Map<string, { timestamp: number; payload: unknown }>();

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getAuthenticatedUserId(
  authHeader: string,
  supabaseUrl: string,
  anonKey: string,
) {
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

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

function normalizePermitStatus(rawStatus?: string | null): PermitStatus {
  const status = (rawStatus || "").trim().toLowerCase();

  if (status === "pending" || status === "pending_review") return "pending_review";
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "resubmitted") return "resubmitted";

  return "pending_review";
}

function parseEntityType(rawValue: unknown): PermitEntityType | null {
  const value = String(rawValue || "").trim().toLowerCase();
  if (value === "studio" || value === "gig") return value;
  return null;
}

function parseReviewAction(rawValue: unknown): ReviewAction | null {
  const value = String(rawValue || "").trim().toLowerCase();
  if (value === "approve" || value === "reject") return value;
  return null;
}

function normalizeMetricsDateRange(rawValue: unknown): MetricsDateRange {
  const value = String(rawValue || "").trim().toLowerCase();
  if (value === "7d" || value === "30d" || value === "all") return value;
  return "30d";
}

function getRangeStartMs(dateRange: MetricsDateRange): number | null {
  const now = Date.now();

  if (dateRange === "7d") return now - 7 * 24 * 60 * 60 * 1000;
  if (dateRange === "30d") return now - 30 * 24 * 60 * 60 * 1000;
  return null;
}

function toTimestampMs(rawValue: unknown): number | null {
  if (!rawValue) return null;
  const value = String(rawValue).trim();
  if (!value) return null;

  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : null;
}

function isInRange(rawValue: unknown, rangeStartMs: number | null): boolean {
  if (!rangeStartMs) return true;
  const ts = toTimestampMs(rawValue);
  return ts !== null && ts >= rangeStartMs;
}

function normalizeSubscriptionStatus(rawValue: unknown): string {
  const status = String(rawValue || "").trim().toLowerCase();
  if (status === "canceled") return "cancelled";
  return status;
}

function isActiveSubscriptionInRange(subscription: any, rangeStartMs: number | null, nowMs: number): boolean {
  const status = normalizeSubscriptionStatus(subscription?.status);
  if (!["active", "trialing"].includes(status)) return false;
  if (!rangeStartMs) return true;

  const activeStartMs = toTimestampMs(subscription?.current_period_start) ?? toTimestampMs(subscription?.created_at);
  const activeEndMs = toTimestampMs(subscription?.current_period_end);

  if (activeStartMs !== null && activeStartMs > nowMs) return false;
  if (activeEndMs !== null && activeEndMs < rangeStartMs) return false;

  return true;
}

function getSubscriptionChurnTimestampMs(subscription: any): number | null {
  return (
    toTimestampMs(subscription?.cancelled_at) ??
    toTimestampMs(subscription?.current_period_end) ??
    toTimestampMs(subscription?.created_at)
  );
}

function toNumber(rawValue: unknown): number {
  const value = Number(rawValue || 0);
  return Number.isFinite(value) ? value : 0;
}

function roundTo(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function isMissingSchemaError(error: any) {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();

  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST116" ||
    message.includes("does not exist") ||
    message.includes("relation") ||
    message.includes("column") ||
    details.includes("does not exist")
  );
}

async function safeCount(queryPromise: Promise<any>, tracker?: QueryHealthTracker) {
  const result = await queryPromise;
  if (result?.error) {
    if (isMissingSchemaError(result.error)) {
      if (tracker) tracker.missingSchemaDetected = true;
      return 0;
    }
    throw result.error;
  }

  return toNumber(result?.count);
}

async function safeRows<T = any>(queryPromise: Promise<any>, tracker?: QueryHealthTracker): Promise<T[]> {
  const result = await queryPromise;
  if (result?.error) {
    if (isMissingSchemaError(result.error)) {
      if (tracker) tracker.missingSchemaDetected = true;
      return [];
    }
    throw result.error;
  }

  return Array.isArray(result?.data) ? (result.data as T[]) : [];
}

function getMetricsCacheKey(dateRange: MetricsDateRange, searchTerm: string) {
  return `${dateRange}:${searchTerm}`;
}

function readMetricsCache(cacheKey: string) {
  const cached = metricsResponseCache.get(cacheKey);
  if (!cached) return null;

  if (Date.now() - cached.timestamp > METRICS_CACHE_TTL_MS) {
    metricsResponseCache.delete(cacheKey);
    return null;
  }

  return cached.payload;
}

function writeMetricsCache(cacheKey: string, payload: unknown) {
  metricsResponseCache.set(cacheKey, {
    timestamp: Date.now(),
    payload,
  });
}

function clearMetricsCache() {
  metricsResponseCache.clear();
}

function categorizeIncidentType(rawIssueType: unknown): IncidentCategory {
  const issueType = String(rawIssueType || "").trim().toLowerCase();

  if (
    issueType.includes("booking") ||
    issueType.includes("attendance") ||
    issueType.includes("refund") ||
    issueType.includes("payment") ||
    issueType.includes("late") ||
    issueType.includes("no_show") ||
    issueType.includes("no-show")
  ) {
    return "booking";
  }

  if (
    issueType.includes("profile") ||
    issueType.includes("identity") ||
    issueType.includes("fake") ||
    issueType.includes("imperson") ||
    issueType.includes("user")
  ) {
    return "profile";
  }

  return "other";
}

function formatIncidentLabel(rawIssueType: unknown): string {
  const issueType = String(rawIssueType || "").trim();
  if (!issueType) return "Unspecified";

  return issueType
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function fetchAuthActivityMetrics(client: any) {
  const nowMs = Date.now();
  const dayAgoMs = nowMs - 24 * 60 * 60 * 1000;
  const monthAgoMs = nowMs - 30 * 24 * 60 * 60 * 1000;

  let dau = 0;
  let mau = 0;

  const perPage = 200;

  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) throw error;

    const users = Array.isArray(data?.users) ? data.users : [];

    for (const user of users) {
      const lastSignInMs = toTimestampMs(user?.last_sign_in_at);
      if (lastSignInMs === null) continue;

      if (lastSignInMs >= dayAgoMs) dau += 1;
      if (lastSignInMs >= monthAgoMs) mau += 1;
    }

    if (users.length < perPage) break;
  }

  return { dau, mau };
}

function sanitizeSearchTerm(rawValue: unknown) {
  return String(rawValue || "")
    .trim()
    .toLowerCase()
    .replace(/[,%]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildRevenueTrendBuckets(
  dateRange: MetricsDateRange,
  nowMs: number,
  rangeStartMs: number | null,
): RevenueTrendBucket[] {
  const dayMs = 24 * 60 * 60 * 1000;

  let bucketCount = 6;
  let trendStartMs = nowMs - 180 * dayMs;
  let labelMode: "daily" | "window" | "monthly" = "monthly";

  if (dateRange === "7d") {
    bucketCount = 7;
    trendStartMs = nowMs - 7 * dayMs;
    labelMode = "daily";
  } else if (dateRange === "30d") {
    bucketCount = 6;
    trendStartMs = rangeStartMs ?? nowMs - 30 * dayMs;
    labelMode = "window";
  }

  if (trendStartMs >= nowMs) {
    trendStartMs = nowMs - dayMs;
  }

  const intervalMs = Math.max(1, Math.floor((nowMs - trendStartMs) / bucketCount));

  const buckets: RevenueTrendBucket[] = [];
  for (let i = 0; i < bucketCount; i += 1) {
    const startMs = trendStartMs + i * intervalMs;
    const endMs = i === bucketCount - 1 ? nowMs + 1 : trendStartMs + (i + 1) * intervalMs;

    let label = "-";
    if (labelMode === "daily") {
      label = new Date(startMs).toLocaleDateString("en-US", {
        weekday: "short",
        timeZone: "UTC",
      });
    } else if (labelMode === "window") {
      const startLabel = new Date(startMs).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
      const endLabel = new Date(Math.max(startMs, endMs - 1)).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
      label = `${startLabel} - ${endLabel}`;
    } else {
      label = new Date(startMs).toLocaleDateString("en-US", {
        month: "short",
        timeZone: "UTC",
      });
    }

    buckets.push({
      label,
      startMs,
      endMs,
      gross: 0,
      payoutDeductions: 0,
      refunds: 0,
    });
  }

  return buckets;
}

function findRevenueTrendBucket(
  tsMs: number | null,
  buckets: RevenueTrendBucket[],
): RevenueTrendBucket | null {
  if (tsMs === null) return null;

  for (const bucket of buckets) {
    if (tsMs >= bucket.startMs && tsMs < bucket.endMs) {
      return bucket;
    }
  }

  return null;
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

function applyPermitStatusFilter(query: any, permitStatus: string) {
  const normalized = String(permitStatus || "all").trim().toLowerCase();

  if (normalized === "all") return query;

  if (normalized === "pending_review" || normalized === "pending") {
    return query.in("permit_status", ["pending_review", "pending"]);
  }

  if (["approved", "rejected", "resubmitted"].includes(normalized)) {
    return query.eq("permit_status", normalized);
  }

  return query;
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

    if (action === "fetch_queue") {
      const entityType = String(params.entityType || "all").toLowerCase();
      const permitStatus = String(params.permitStatus || "all");

      let studioQuery = client
        .from("studios")
        .select(
          "id, name, permit_status, business_permit_url, created_at, permit_reviewed_at, permit_rejection_reason, permit_admin_notes, owner:profiles!owner_id(id, full_name, email)",
        )
        .order("created_at", { ascending: false });

      let gigQuery = client
        .from("gigs")
        .select(
          "id, name, permit_status, business_permit_url, created_at, permit_reviewed_at, permit_rejection_reason, permit_admin_notes, organizer:profiles!organizer_id(id, full_name, email)",
        )
        .order("created_at", { ascending: false });

      studioQuery = applyPermitStatusFilter(studioQuery, permitStatus);
      gigQuery = applyPermitStatusFilter(gigQuery, permitStatus);

      const [studioResult, gigResult] = await Promise.all([
        entityType === "gig" ? Promise.resolve({ data: [] as any[], error: null }) : studioQuery,
        entityType === "studio" ? Promise.resolve({ data: [] as any[], error: null }) : gigQuery,
      ]);

      if (studioResult.error) throw studioResult.error;
      if (gigResult.error) throw gigResult.error;

      const items = [
        ...(studioResult.data || []).map((item: any) => ({
          id: item.id,
          name: item.name,
          entity_type: "studio",
          permit_status: normalizePermitStatus(item.permit_status),
          business_permit_url: item.business_permit_url,
          owner_id: item.owner?.id || "",
          owner_name: item.owner?.full_name || "Unknown",
          owner_email: item.owner?.email || "",
          created_at: item.created_at,
          permit_reviewed_at: item.permit_reviewed_at,
          permit_rejection_reason: item.permit_rejection_reason,
          permit_admin_notes: item.permit_admin_notes,
        })),
        ...(gigResult.data || []).map((item: any) => ({
          id: item.id,
          name: item.name,
          entity_type: "gig",
          permit_status: normalizePermitStatus(item.permit_status),
          business_permit_url: item.business_permit_url,
          owner_id: item.organizer?.id || "",
          owner_name: item.organizer?.full_name || "Unknown",
          owner_email: item.organizer?.email || "",
          created_at: item.created_at,
          permit_reviewed_at: item.permit_reviewed_at,
          permit_rejection_reason: item.permit_rejection_reason,
          permit_admin_notes: item.permit_admin_notes,
        })),
      ];

      items.sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
      );

      return jsonResponse({ items });
    }

    if (action === "fetch_owner_details") {
      const targetUserId = String(params.userId || "").trim();

      if (!targetUserId) {
        return jsonResponse({ error: "Missing userId" }, 400);
      }

      const { data, error } = await client
        .from("profiles")
        .select("*")
        .eq("id", targetUserId)
        .maybeSingle();

      if (error) throw error;

      return jsonResponse({ item: data || null });
    }

    if (action === "fetch_listing_details") {
      const entityType = parseEntityType(params.entityType);
      const entityId = String(params.entityId || "").trim();

      if (!entityType || !entityId) {
        return jsonResponse({ error: "Missing required fields" }, 400);
      }

      const table = entityType === "studio" ? "studios" : "gigs";
      const ownerField = entityType === "studio" ? "owner_id" : "organizer_id";
      const ownerAlias = entityType === "studio" ? "owner" : "organizer";

      const { data, error } = await client
        .from(table)
        .select(`*, ${ownerAlias}:profiles!${ownerField}(id, full_name, email, role, is_verified, created_at)`)
        .eq("id", entityId)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return jsonResponse({ error: "Listing not found" }, 404);
      }

      const owner = entityType === "studio" ? data.owner : data.organizer;

      return jsonResponse({
        item: data,
        owner: owner || null,
      });
    }

    if (action === "review_permit") {
      const entityType = parseEntityType(params.entityType);
      const entityId = String(params.entityId || "").trim();
      const reviewAction = parseReviewAction(params.reviewAction);
      const rejectionReason = String(params.rejectionReason || "").trim();
      const adminNotes = String(params.adminNotes || "").trim();

      if (!entityType || !entityId || !reviewAction) {
        return jsonResponse({ error: "Missing required fields" }, 400);
      }

      if (reviewAction === "reject" && !rejectionReason) {
        return jsonResponse({ error: "Rejection reason is required" }, 400);
      }

      const table = entityType === "studio" ? "studios" : "gigs";
      const ownerField = entityType === "studio" ? "owner_id" : "organizer_id";

      const { data: currentItem, error: currentError } = await client
        .from(table)
        .select(`id, name, permit_status, ${ownerField}`)
        .eq("id", entityId)
        .maybeSingle();

      if (currentError) throw currentError;
      if (!currentItem) {
        return jsonResponse({ error: "Listing not found" }, 404);
      }

      const previousStatus = normalizePermitStatus(currentItem.permit_status);
      const nextStatus: PermitStatus = reviewAction === "approve" ? "approved" : "rejected";

      const updatePayload: Record<string, unknown> = {
        permit_status: nextStatus,
        permit_reviewed_by: userId,
        permit_reviewed_at: new Date().toISOString(),
        permit_admin_notes: adminNotes || null,
        permit_rejection_reason: reviewAction === "reject" ? rejectionReason : null,
      };

      const { data: updatedItem, error: updateError } = await client
        .from(table)
        .update(updatePayload)
        .eq("id", entityId)
        .select(
          `id, name, permit_status, business_permit_url, created_at, permit_reviewed_at, permit_rejection_reason, permit_admin_notes, ${ownerField}`,
        )
        .single();

      if (updateError) throw updateError;

      const modernAuditPayload = {
        entity_type: entityType,
        entity_id: entityId,
        action: reviewAction === "approve" ? "approved" : "rejected",
        performed_by: userId,
        previous_status: previousStatus,
        new_status: nextStatus,
        rejection_reason: reviewAction === "reject" ? rejectionReason : null,
        admin_notes: adminNotes || null,
        metadata: {
          entity_name: currentItem.name,
          owner_id: currentItem[ownerField],
        },
      };

      const { error: modernAuditError } = await client
        .from("permit_audit_log")
        .insert(modernAuditPayload);

      if (modernAuditError) {
        const legacyAuditPayload = {
          entity_type: entityType,
          entity_id: entityId,
          action: reviewAction === "approve" ? "approved" : "rejected",
          performed_by: userId,
          reason: reviewAction === "reject" ? rejectionReason : null,
          notes: adminNotes || null,
          metadata: {
            entity_name: currentItem.name,
            owner_id: currentItem[ownerField],
            previous_status: previousStatus,
            new_status: nextStatus,
          },
        };

        const { error: legacyAuditError } = await client
          .from("permit_audit_log")
          .insert(legacyAuditPayload);

        if (legacyAuditError) throw legacyAuditError;
      }

      const ownerId = String((currentItem as any)?.[ownerField] || "").trim();
      if (ownerId) {
        const isApproved = reviewAction === "approve";
        const listingLabel = entityType === "studio" ? "studio" : "gig";
        const notificationTitle = isApproved ? "Permit Approved" : "Permit Rejected";
        const notificationMessage = isApproved
          ? `Your ${listingLabel} "${currentItem.name}" is now approved and visible in Home.`
          : `Your ${listingLabel} "${currentItem.name}" was rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : " Update details and reapply to continue review."}`;

        const { error: notificationError } = await client
          .from("notifications")
          .insert({
            user_id: ownerId,
            type: isApproved ? "success" : "warning",
            title: notificationTitle,
            message: notificationMessage,
            read: false,
            meta: {
              event_type: "permit_review",
              entity_type: entityType,
              entity_id: entityId,
              permit_status: nextStatus,
              reviewed_by: userId,
              reviewed_at: updatePayload.permit_reviewed_at,
              rejection_reason: reviewAction === "reject" ? rejectionReason : null,
            },
          });

        if (notificationError) {
          console.error("permit-management notification insert error:", notificationError);
        }
      }

      clearMetricsCache();

      return jsonResponse({
        item: {
          ...updatedItem,
          entity_type: entityType,
          permit_status: normalizePermitStatus(updatedItem.permit_status),
        },
      });
    }

    if (action === "fetch_metrics") {
      const dateRange = normalizeMetricsDateRange(params.dateRange);
      const rangeStartMs = getRangeStartMs(dateRange);
      const rangeStartIso = rangeStartMs ? new Date(rangeStartMs).toISOString() : null;
      const nowMs = Date.now();
      const oneDayAgoMs = nowMs - 24 * 60 * 60 * 1000;
      const oneDayAgoIso = new Date(oneDayAgoMs).toISOString();
      const searchTerm = sanitizeSearchTerm(params.searchQuery);
      const metricsCacheKey = getMetricsCacheKey(dateRange, searchTerm);
      const queryHealthTracker: QueryHealthTracker = { missingSchemaDetected: false };
      const revenueTrendBuckets = buildRevenueTrendBuckets(dateRange, nowMs, rangeStartMs);

      const cachedMetrics = readMetricsCache(metricsCacheKey);
      if (cachedMetrics) {
        return jsonResponse(cachedMetrics);
      }

      const [
        totalUsers,
        totalStudios,
        totalGigs,
        pendingStudios,
        pendingGigs,
        approvedStudios,
        approvedGigs,
        rejectedStudios,
        rejectedGigs,
        recentActions,
        totalReports,
        pendingReports,
        escalatedReports,
        openIncidents,
        resolvedIncidents,
        profileRows,
        subscriptionRows,
        reportRows,
        incidentRows,
        bookingRows,
        withdrawalRows,
        subscriptionPaymentRows,
        subscriptionPlanRows,
      ] = await Promise.all([
        safeCount(client.from("profiles").select("id", { count: "exact", head: true }), queryHealthTracker),
        safeCount(client.from("studios").select("id", { count: "exact", head: true }), queryHealthTracker),
        safeCount(client.from("gigs").select("id", { count: "exact", head: true }), queryHealthTracker),
        safeCount(
          client
            .from("studios")
            .select("id", { count: "exact", head: true })
            .in("permit_status", ["pending_review", "pending"]),
          queryHealthTracker,
        ),
        safeCount(
          client
            .from("gigs")
            .select("id", { count: "exact", head: true })
            .in("permit_status", ["pending_review", "pending"]),
          queryHealthTracker,
        ),
        safeCount(
          client
            .from("studios")
            .select("id", { count: "exact", head: true })
            .eq("permit_status", "approved"),
          queryHealthTracker,
        ),
        safeCount(
          client
            .from("gigs")
            .select("id", { count: "exact", head: true })
            .eq("permit_status", "approved"),
          queryHealthTracker,
        ),
        safeCount(
          client
            .from("studios")
            .select("id", { count: "exact", head: true })
            .eq("permit_status", "rejected"),
          queryHealthTracker,
        ),
        safeCount(
          client
            .from("gigs")
            .select("id", { count: "exact", head: true })
            .eq("permit_status", "rejected"),
          queryHealthTracker,
        ),
        safeCount(client.from("permit_audit_log").select("id", { count: "exact", head: true }), queryHealthTracker),
        safeCount(client.from("reports").select("id", { count: "exact", head: true }), queryHealthTracker),
        safeCount(
          client
            .from("reports")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending"),
          queryHealthTracker,
        ),
        safeCount(
          client
            .from("reports")
            .select("id", { count: "exact", head: true })
            .eq("escalation_status", "manual_review"),
          queryHealthTracker,
        ),
        safeCount(
          client
            .from("booking_incidents")
            .select("id", { count: "exact", head: true })
            .in("status", ["open", "responded", "manual_review"]),
          queryHealthTracker,
        ),
        safeCount(
          client
            .from("booking_incidents")
            .select("id", { count: "exact", head: true })
            .in("status", ["resolved_refund", "resolved_no_refund"]),
          queryHealthTracker,
        ),
        safeRows(
          client
            .from("profiles")
            .select("id, created_at")
            .gte("created_at", oneDayAgoIso),
          queryHealthTracker,
        ),
        safeRows(
          client
            .from("subscriptions")
            .select("id, user_id, plan_id, status, current_period_start, current_period_end, cancelled_at, created_at"),
          queryHealthTracker,
        ),
        safeRows(
          (() => {
            let query = client
              .from("reports")
              .select("id, reason, details, status, created_at, reviewed_at")
              .neq("status", "pending");

            if (rangeStartIso) {
              query = query.gte("created_at", rangeStartIso);
            }

            return query;
          })(),
          queryHealthTracker,
        ),
        safeRows(
          (() => {
            let query = client
              .from("booking_incidents")
              .select("id, issue_type, status, created_at, resolved_at, reporter_notes, resolution");

            if (rangeStartIso) {
              query = query.gte("created_at", rangeStartIso);
            }

            return query;
          })(),
          queryHealthTracker,
        ),
        safeRows(
          client
            .from("studio_bookings")
            .select("id, booking_date, start_time, created_at, paid_at, payment_status, payment_amount, final_price"),
          queryHealthTracker,
        ),
        safeRows(
          client
            .from("withdrawal_requests")
            .select("id, status, amount, net_amount, created_at, reference_number, notes, payout_account_name"),
          queryHealthTracker,
        ),
        safeRows(
          client
            .from("subscription_payments")
            .select("id, amount, status, paid_at, created_at"),
          queryHealthTracker,
        ),
        safeRows(
          client
            .from("subscription_plans")
            .select("id, name"),
          queryHealthTracker,
        ),
      ]);

      let dau = 0;
      let mau = 0;
      let authMetricsHealthy = true;

      try {
        const authActivity = await fetchAuthActivityMetrics(client);
        dau = authActivity.dau;
        mau = authActivity.mau;
      } catch {
        authMetricsHealthy = false;
      }

      const newSignups24h = (profileRows as any[]).reduce((count, row) => {
        const createdAtMs = toTimestampMs(row?.created_at);
        if (createdAtMs !== null && createdAtMs >= oneDayAgoMs) {
          return count + 1;
        }
        return count;
      }, 0);

      const activeSubscriptionRows = (subscriptionRows as any[]).filter((row) =>
        isActiveSubscriptionInRange(row, rangeStartMs, nowMs)
      );

      const activeSubscriptionUserIds = new Set<string>();
      for (const subscription of activeSubscriptionRows) {
        const userIdKey = String(subscription?.user_id || subscription?.id || "").trim();
        if (userIdKey) {
          activeSubscriptionUserIds.add(userIdKey);
        }
      }

      const activeSubscriptions = activeSubscriptionUserIds.size;

      const churnedSubscriptionUserIds = new Set<string>();
      for (const subscription of subscriptionRows as any[]) {
        const status = normalizeSubscriptionStatus(subscription?.status);
        if (!["cancelled", "expired", "past_due"].includes(status)) continue;

        const churnAtMs = getSubscriptionChurnTimestampMs(subscription);
        if (rangeStartMs && (churnAtMs === null || churnAtMs < rangeStartMs)) continue;

        const userIdKey = String(subscription?.user_id || subscription?.id || "").trim();
        if (userIdKey) {
          churnedSubscriptionUserIds.add(userIdKey);
        }
      }

      const churnedSubscriptions = churnedSubscriptionUserIds.size;

      const churnBase = activeSubscriptions + churnedSubscriptions;
      const churnRatePercent = churnBase > 0
        ? roundTo((churnedSubscriptions / churnBase) * 100, 1)
        : 0;

      const planNameById = new Map<string, string>();
      for (const plan of subscriptionPlanRows as any[]) {
        const id = String(plan?.id || "").trim();
        if (!id) continue;
        planNameById.set(id, String(plan?.name || "").trim().toLowerCase());
      }

      let subscriptionTierBasic = 0;
      let subscriptionTierPro = 0;
      let subscriptionTierOther = 0;

      for (const subscription of activeSubscriptionRows) {
        const planId = String(subscription?.plan_id || "").trim();
        const normalizedPlan = (planNameById.get(planId) || planId).toLowerCase();

        if (
          normalizedPlan.includes("pro") ||
          normalizedPlan.includes("premium") ||
          normalizedPlan.includes("plus")
        ) {
          subscriptionTierPro += 1;
        } else if (
          normalizedPlan.includes("basic") ||
          normalizedPlan.includes("starter") ||
          normalizedPlan.includes("free")
        ) {
          subscriptionTierBasic += 1;
        } else {
          subscriptionTierOther += 1;
        }
      }

      let grossBookingRevenue = 0;
      let refundedBookingRevenue = 0;
      let paidPaymentEvents = 0;
      let failedPaymentEvents = 0;

      const bookingSlotCounter = new Map<string, number>();

      for (const booking of bookingRows as any[]) {
        const activityDate = booking?.paid_at || booking?.created_at || booking?.booking_date;
        if (!isInRange(activityDate, rangeStartMs)) continue;

        const activityTsMs = toTimestampMs(activityDate);
        const trendBucket = findRevenueTrendBucket(activityTsMs, revenueTrendBuckets);

        const paymentStatus = String(booking?.payment_status || "").trim().toLowerCase();
        const amount = toNumber(booking?.payment_amount) || toNumber(booking?.final_price);

        if (["paid", "partial", "refunded", "refund_pending"].includes(paymentStatus)) {
          grossBookingRevenue += amount;
          if (trendBucket) trendBucket.gross += amount;
        }

        if (["refunded", "refund_pending"].includes(paymentStatus)) {
          refundedBookingRevenue += amount;
          if (trendBucket) trendBucket.refunds += amount;
        }

        if (["paid", "partial"].includes(paymentStatus)) {
          paidPaymentEvents += 1;
        }

        if (paymentStatus === "failed") {
          failedPaymentEvents += 1;
        }

        const bookingDate = String(booking?.booking_date || "").trim();
        const startTime = String(booking?.start_time || "").trim();
        if (!bookingDate || !startTime) continue;

        const day = new Date(`${bookingDate}T00:00:00Z`).toLocaleDateString("en-US", {
          weekday: "short",
          timeZone: "UTC",
        });
        const hour = startTime.slice(0, 2).padStart(2, "0");
        const slotLabel = `${day} ${hour}:00`;

        bookingSlotCounter.set(slotLabel, (bookingSlotCounter.get(slotLabel) || 0) + 1);
      }

      let grossSubscriptionRevenue = 0;
      for (const payment of subscriptionPaymentRows as any[]) {
        const paidAt = payment?.paid_at || payment?.created_at;
        if (!isInRange(paidAt, rangeStartMs)) continue;

        const paidAtMs = toTimestampMs(paidAt);
        const trendBucket = findRevenueTrendBucket(paidAtMs, revenueTrendBuckets);

        const status = String(payment?.status || "").trim().toLowerCase();
        if (status !== "paid") continue;

        const amount = toNumber(payment?.amount);
        grossSubscriptionRevenue += amount;
        if (trendBucket) trendBucket.gross += amount;
      }

      let pendingPayouts = 0;
      let completedPayoutsInRange = 0;
      for (const withdrawal of withdrawalRows as any[]) {
        const status = String(withdrawal?.status || "").trim().toLowerCase();
        const amount = toNumber(withdrawal?.net_amount) || toNumber(withdrawal?.amount);
        const withdrawalTsMs = toTimestampMs(withdrawal?.created_at);
        const trendBucket = findRevenueTrendBucket(withdrawalTsMs, revenueTrendBuckets);

        if (["pending", "processing"].includes(status)) {
          pendingPayouts += amount;
        }

        if (status === "completed" && isInRange(withdrawal?.created_at, rangeStartMs)) {
          completedPayoutsInRange += amount;
          if (trendBucket) trendBucket.payoutDeductions += amount;
        }
      }

      const grossRevenue = roundTo(grossBookingRevenue + grossSubscriptionRevenue, 2);
      const netRevenue = roundTo(
        Math.max(grossRevenue - completedPayoutsInRange - refundedBookingRevenue, 0),
        2,
      );

      const revenueTrend = revenueTrendBuckets.map((bucket) => {
        const gross = roundTo(bucket.gross, 2);
        const net = roundTo(
          Math.max(bucket.gross - bucket.refunds - bucket.payoutDeductions, 0),
          2,
        );

        return {
          label: bucket.label,
          gross,
          net,
        };
      });

      let reportResolutionTotalHours = 0;
      let reportResolutionCount = 0;

      for (const report of reportRows as any[]) {
        const status = String(report?.status || "").trim().toLowerCase();
        if (status === "pending") continue;
        if (!isInRange(report?.created_at, rangeStartMs)) continue;

        const createdAtMs = toTimestampMs(report?.created_at);
        const reviewedAtMs = toTimestampMs(report?.reviewed_at);

        if (createdAtMs === null || reviewedAtMs === null || reviewedAtMs <= createdAtMs) {
          continue;
        }

        reportResolutionTotalHours += (reviewedAtMs - createdAtMs) / (1000 * 60 * 60);
        reportResolutionCount += 1;
      }

      const incidentBreakdownMap = new Map<
        string,
        {
          key: string;
          label: string;
          category: IncidentCategory;
          total: number;
          open: number;
          resolutionHoursTotal: number;
          resolutionCount: number;
        }
      >();

      let incidentResolutionTotalHours = 0;
      let incidentResolutionCount = 0;
      let openIncidentsInRange = 0;
      let resolvedIncidentsInRange = 0;

      for (const incident of incidentRows as any[]) {
        if (!isInRange(incident?.created_at, rangeStartMs)) continue;

        const issueTypeRaw = String(incident?.issue_type || "").trim().toLowerCase() || "unspecified";
        const status = String(incident?.status || "").trim().toLowerCase();

        const existing = incidentBreakdownMap.get(issueTypeRaw) || {
          key: issueTypeRaw,
          label: formatIncidentLabel(issueTypeRaw),
          category: categorizeIncidentType(issueTypeRaw),
          total: 0,
          open: 0,
          resolutionHoursTotal: 0,
          resolutionCount: 0,
        };

        existing.total += 1;

        if (["open", "responded", "manual_review"].includes(status)) {
          existing.open += 1;
          openIncidentsInRange += 1;
        }

        if (["resolved_refund", "resolved_no_refund", "dismissed"].includes(status)) {
          resolvedIncidentsInRange += 1;

          const createdAtMs = toTimestampMs(incident?.created_at);
          const resolvedAtMs = toTimestampMs(incident?.resolved_at);

          if (createdAtMs !== null && resolvedAtMs !== null && resolvedAtMs > createdAtMs) {
            const durationHours = (resolvedAtMs - createdAtMs) / (1000 * 60 * 60);
            existing.resolutionHoursTotal += durationHours;
            existing.resolutionCount += 1;
            incidentResolutionTotalHours += durationHours;
            incidentResolutionCount += 1;
          }
        }

        incidentBreakdownMap.set(issueTypeRaw, existing);
      }

      const incidentTypeBreakdown = Array.from(incidentBreakdownMap.values())
        .map((entry) => ({
          key: entry.key,
          label: entry.label,
          category: entry.category,
          total: entry.total,
          open: entry.open,
          avgResolutionHours: entry.resolutionCount > 0
            ? roundTo(entry.resolutionHoursTotal / entry.resolutionCount, 2)
            : 0,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 8);

      const peakActivitySlots = Array.from(bookingSlotCounter.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

      let searchUsers = 0;
      let searchReports = 0;
      let searchIncidents = 0;
      let searchTransactions = 0;

      if (searchTerm.length >= 2) {
        const ilikePattern = `%${searchTerm}%`;

        [
          searchUsers,
          searchReports,
          searchIncidents,
          searchTransactions,
        ] = await Promise.all([
          safeCount(
            client
              .from("profiles")
              .select("id", { count: "exact", head: true })
              .or(`full_name.ilike.${ilikePattern},email.ilike.${ilikePattern}`),
            queryHealthTracker,
          ),
          safeCount(
            client
              .from("reports")
              .select("id", { count: "exact", head: true })
              .or(`reason.ilike.${ilikePattern},details.ilike.${ilikePattern}`),
            queryHealthTracker,
          ),
          safeCount(
            client
              .from("booking_incidents")
              .select("id", { count: "exact", head: true })
              .or(`issue_type.ilike.${ilikePattern},reporter_notes.ilike.${ilikePattern},resolution.ilike.${ilikePattern}`),
            queryHealthTracker,
          ),
          safeCount(
            client
              .from("withdrawal_requests")
              .select("id", { count: "exact", head: true })
              .or(`reference_number.ilike.${ilikePattern},notes.ilike.${ilikePattern},payout_account_name.ilike.${ilikePattern}`),
            queryHealthTracker,
          ),
        ]);
      }

      const paymentAttempts = paidPaymentEvents + failedPaymentEvents;
      const paymongoSuccessRate = paymentAttempts > 0
        ? roundTo((paidPaymentEvents / paymentAttempts) * 100, 1)
        : 100;
      const paymongoHealthy = paymentAttempts === 0 ? true : paymongoSuccessRate >= 60;

      const avgReportResolutionHours = reportResolutionCount > 0
        ? roundTo(reportResolutionTotalHours / reportResolutionCount, 2)
        : 0;
      const avgIncidentResolutionHours = incidentResolutionCount > 0
        ? roundTo(incidentResolutionTotalHours / incidentResolutionCount, 2)
        : 0;

      const dbHealthy = !queryHealthTracker.missingSchemaDetected;
      const apiHealthy = dbHealthy && authMetricsHealthy;

      const responsePayload = {
        dateRange,
        rangeStart: rangeStartIso,
        totalUsers,
        totalStudios,
        totalGigs,
        pendingPermits: pendingStudios + pendingGigs,
        approvedPermits: approvedStudios + approvedGigs,
        rejectedPermits: rejectedStudios + rejectedGigs,
        recentActions,
        totalReports,
        pendingReports,
        escalatedReports,
        openIncidents,
        resolvedIncidents,
        openIncidentsInRange,
        resolvedIncidentsInRange,
        activeSubscriptions,
        churnRatePercent,
        dau,
        mau,
        newSignups24h,
        grossRevenue,
        netRevenue,
        pendingPayouts: roundTo(pendingPayouts, 2),
        avgReportResolutionHours,
        avgIncidentResolutionHours,
        paymongoSuccessRate,
        dbHealthy,
        apiHealthy,
        paymongoHealthy,
        subscriptionTierBasic,
        subscriptionTierPro,
        subscriptionTierOther,
        revenueTrend,
        incidentTypeBreakdown,
        peakActivitySlots,
        searchSummary: {
          users: searchUsers,
          reports: searchReports,
          incidents: searchIncidents,
          transactions: searchTransactions,
          total: searchUsers + searchReports + searchIncidents + searchTransactions,
        },
      };

      writeMetricsCache(metricsCacheKey, responsePayload);
      return jsonResponse(responsePayload);
    }

    if (action === "fetch_audit") {
      const limit = Math.max(1, Math.min(200, Number(params.limit || 100)));

      const { data, error } = await client
        .from("permit_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      const performerIds = Array.from(
        new Set((data || []).map((entry: any) => entry.performed_by).filter(Boolean)),
      );

      let performerMap: Record<string, string> = {};
      if (performerIds.length > 0) {
        const { data: performerRows } = await client
          .from("profiles")
          .select("id, full_name")
          .in("id", performerIds);

        performerMap = (performerRows || []).reduce(
          (acc: Record<string, string>, row: any) => {
            acc[row.id] = row.full_name || "System";
            return acc;
          },
          {},
        );
      }

      return jsonResponse({
        items: (data || []).map((entry: any) => ({
          ...entry,
          previous_status: entry.previous_status || entry.metadata?.previous_status || null,
          new_status: entry.new_status || entry.metadata?.new_status || null,
          rejection_reason: entry.rejection_reason || entry.reason || null,
          admin_notes: entry.admin_notes || entry.notes || null,
          performer_name: performerMap[entry.performed_by] || "System",
        })),
      });
    }

    return jsonResponse({ error: `Unsupported action: ${action}` }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
