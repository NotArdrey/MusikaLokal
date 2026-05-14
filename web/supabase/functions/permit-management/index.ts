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
  providerEarnings: number;
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
    code === "PGRST204" ||
    code === "PGRST205" ||
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
      providerEarnings: 0,
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

function isNotificationTypeConstraintError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  const constraint = String(error?.constraint || "").toLowerCase();

  return (
    message.includes("check constraint") ||
    message.includes("violates check") ||
    details.includes("check constraint") ||
    constraint.includes("type")
  );
}

async function insertNotificationWithFallback(
  client: any,
  payload: {
    user_id: string;
    type: string;
    title: string;
    message: string;
    read?: boolean;
    image?: string | null;
    meta?: Record<string, unknown>;
  },
) {
  const tryInsert = async (attemptPayload: Record<string, unknown>) =>
    client.from("notifications").insert(attemptPayload);

  // Primary insert: full modern payload.
  const { error: primaryError } = await tryInsert(payload);
  if (!primaryError) return null;

  // Fallback 1: some environments may enforce a stricter type enum.
  if (isNotificationTypeConstraintError(primaryError)) {
    const { error: typeFallbackError } = await tryInsert({
      ...payload,
      type: "info",
    });
    if (!typeFallbackError) return null;

    if (!isMissingSchemaError(typeFallbackError)) {
      return typeFallbackError;
    }
  } else if (!isMissingSchemaError(primaryError)) {
    return primaryError;
  }

  // Fallback 2: legacy schema variant without `meta`.
  const { meta, ...withoutMeta } = payload;
  const { error: noMetaError } = await tryInsert(withoutMeta);
  if (!noMetaError) return null;

  // Fallback 3: legacy schema variant without both `meta` and `read`.
  if (isMissingSchemaError(noMetaError)) {
    const { read, ...minimalPayload } = withoutMeta;
    const { error: minimalError } = await tryInsert(minimalPayload);
    if (!minimalError) return null;
    return minimalError;
  }

  return noMetaError;
}

const paymentStatusFilters = new Set([
  "all",
  "paid",
  "partial",
  "pending",
  "failed",
  "cancelled",
  "refunded",
  "refund_pending",
]);

function normalizePaymentStatusFilter(rawValue: unknown) {
  const value = String(rawValue || "all").trim().toLowerCase();
  return paymentStatusFilters.has(value) ? value : "all";
}

function getPaymentAuditAction(booking: any, refundAmount: number) {
  const paymentStatus = String(booking?.payment_status || "").trim().toLowerCase();
  const bookingStatus = String(booking?.status || "").trim().toLowerCase();

  if (paymentStatus === "refund_pending") return "payment_refund_pending";
  if (
    paymentStatus === "refunded" ||
    refundAmount > 0 ||
    booking?.refunded_at ||
    booking?.refund_id
  ) {
    return "payment_refunded";
  }
  if (bookingStatus === "cancelled") return "payment_cancelled";
  if (paymentStatus === "paid") return "payment_paid";
  if (paymentStatus === "partial") return "payment_partial";
  if (paymentStatus === "pending") return "payment_pending";
  if (paymentStatus === "failed") return "payment_failed";

  return "payment_unpaid";
}

function getPaymentEventAt(booking: any, action: string) {
  if (action === "payment_refunded" || action === "payment_refund_pending") {
    return booking?.refunded_at || booking?.updated_at || booking?.paid_at || booking?.created_at || null;
  }

  if (action === "payment_cancelled") {
    return booking?.updated_at || booking?.created_at || null;
  }

  if (action === "payment_paid" || action === "payment_partial") {
    return booking?.paid_at || booking?.updated_at || booking?.created_at || null;
  }

  return booking?.updated_at || booking?.created_at || null;
}

function matchesPaymentStatusFilter(transaction: any, statusFilter: string) {
  if (statusFilter === "all") return true;

  const action = String(transaction?.action || "").trim().toLowerCase();
  const paymentStatus = String(transaction?.payment_status || "").trim().toLowerCase();
  const bookingStatus = String(transaction?.booking_status || "").trim().toLowerCase();

  if (statusFilter === "cancelled") {
    return bookingStatus === "cancelled" || action === "payment_cancelled";
  }

  if (statusFilter === "refunded") {
    return action === "payment_refunded" || paymentStatus === "refunded";
  }

  if (statusFilter === "refund_pending") {
    return action === "payment_refund_pending" || paymentStatus === "refund_pending";
  }

  return paymentStatus === statusFilter || action === `payment_${statusFilter}`;
}

function paymentTransactionMatchesSearch(transaction: any, searchTerm: string) {
  if (searchTerm.length < 2) return true;

  const haystack = [
    transaction?.booking_id,
    transaction?.action,
    transaction?.booking_status,
    transaction?.payment_status,
    transaction?.payment_type,
    transaction?.payment_method,
    transaction?.customer_name,
    transaction?.customer_email,
    transaction?.studio_name,
    transaction?.owner_name,
    transaction?.owner_email,
    transaction?.checkout_session_id,
    transaction?.payment_intent_id,
    transaction?.refund_id,
    transaction?.reference,
    transaction?.cancellation_reason,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  return haystack.includes(searchTerm);
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

      const ownerId = String(
        (currentItem as any)?.[ownerField] || (updatedItem as any)?.[ownerField] || "",
      ).trim();
      if (ownerId) {
        const isApproved = reviewAction === "approve";
        const listingLabel = entityType === "studio" ? "studio" : "gig";
        const notificationTitle = isApproved ? "Permit Approved" : "Permit Rejected";
        const notificationMessage = isApproved
          ? `Your ${listingLabel} "${currentItem.name}" is now approved and visible in Home.`
          : `Your ${listingLabel} "${currentItem.name}" was rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : " Update details and reapply to continue review."}`;

        const notificationError = await insertNotificationWithFallback(client, {
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
      } else {
        console.warn("permit-management missing owner id for permit review notification", {
          entityType,
          entityId,
          reviewAction,
        });
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
        reportRows,
        incidentRows,
        bookingRows,
        withdrawalRows,
        walletTransactionRows,
        platformWithdrawalRows,
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
            .select("id, booking_date, start_time, created_at, paid_at, payment_status, payment_amount, final_price, checkout_session_id, payment_intent_id"),
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
            .from("wallet_transactions")
            .select("id, amount, type, reference_type, is_credit, status, created_at, reference_id"),
          queryHealthTracker,
        ),
        safeRows(
          client
            .from("platform_withdrawals")
            .select("id, amount, status, created_at"),
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

      let grossBookingRevenue = 0;
      let allTimeGrossBookingRevenue = 0;
      let refundedBookingRevenue = 0;
      let allTimeRefundedBookingRevenue = 0;
      let paidPaymentEvents = 0;
      let failedPaymentEvents = 0;
      let paymongoLinkedPaymentEvents = 0;

      const bookingSlotCounter = new Map<string, number>();

      for (const booking of bookingRows as any[]) {
        const activityDate = booking?.paid_at || booking?.created_at || booking?.booking_date;
        const paymentStatus = String(booking?.payment_status || "").trim().toLowerCase();
        const amount = toNumber(booking?.payment_amount) || toNumber(booking?.final_price);

        if (["paid", "partial", "refunded", "refund_pending"].includes(paymentStatus)) {
          allTimeGrossBookingRevenue += amount;
        }

        if (["refunded", "refund_pending"].includes(paymentStatus)) {
          allTimeRefundedBookingRevenue += amount;
        }

        if (!isInRange(activityDate, rangeStartMs)) continue;

        const activityTsMs = toTimestampMs(activityDate);
        const trendBucket = findRevenueTrendBucket(activityTsMs, revenueTrendBuckets);

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
          if (booking?.checkout_session_id || booking?.payment_intent_id) {
            paymongoLinkedPaymentEvents += 1;
          }
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

      let pendingPayouts = 0;
      for (const withdrawal of withdrawalRows as any[]) {
        const status = String(withdrawal?.status || "").trim().toLowerCase();
        const amount = toNumber(withdrawal?.net_amount) || toNumber(withdrawal?.amount);

        if (["pending", "processing"].includes(status)) {
          pendingPayouts += amount;
        }
      }

      let providerEarningsInRange = 0;
      let allTimeProviderEarnings = 0;
      const bookingEarningReferenceTypes = new Set([
        "",
        "booking",
        "booking_payment",
        "booking_downpayment",
        "booking_balance",
      ]);

      for (const transaction of walletTransactionRows as any[]) {
        if (!isInRange(transaction?.created_at, rangeStartMs)) continue;

        const type = String(transaction?.type || "").trim().toLowerCase();
        const status = String(transaction?.status || "").trim().toLowerCase();
        const referenceType = String(transaction?.reference_type || "").trim().toLowerCase();
        const isCredit = transaction?.is_credit !== false;

        if (
          type === "earning" &&
          status === "completed" &&
          isCredit &&
          bookingEarningReferenceTypes.has(referenceType)
        ) {
          const amount = toNumber(transaction?.amount);
          allTimeProviderEarnings += amount;

          if (!isInRange(transaction?.created_at, rangeStartMs)) continue;

          providerEarningsInRange += amount;

          const transactionTsMs = toTimestampMs(transaction?.created_at);
          const trendBucket = findRevenueTrendBucket(transactionTsMs, revenueTrendBuckets);
          if (trendBucket) trendBucket.providerEarnings += amount;
        }
      }

      const platformWithdrawn = (platformWithdrawalRows as any[]).reduce((sum, withdrawal) => {
        const status = String(withdrawal?.status || "").trim().toLowerCase();
        if (status !== "completed") return sum;
        return sum + toNumber(withdrawal?.amount);
      }, 0);
      const grossRevenue = roundTo(grossBookingRevenue, 2);
      const netRevenue = roundTo(
        Math.max(grossRevenue - providerEarningsInRange - refundedBookingRevenue, 0),
        2,
      );
      const allTimePlatformNet = roundTo(
        Math.max(allTimeGrossBookingRevenue - allTimeProviderEarnings - allTimeRefundedBookingRevenue, 0),
        2,
      );
      const platformAvailable = roundTo(
        Math.max(allTimePlatformNet - platformWithdrawn, 0),
        2,
      );

      const revenueTrend = revenueTrendBuckets.map((bucket) => {
        const gross = roundTo(bucket.gross, 2);
        const net = roundTo(
          Math.max(bucket.gross - bucket.refunds - bucket.providerEarnings, 0),
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
      const paymongoLinkedPaymentRate = paidPaymentEvents > 0
        ? roundTo((paymongoLinkedPaymentEvents / paidPaymentEvents) * 100, 1)
        : 100;

      const avgReportResolutionHours = reportResolutionCount > 0
        ? roundTo(reportResolutionTotalHours / reportResolutionCount, 2)
        : 0;
      const avgIncidentResolutionHours = incidentResolutionCount > 0
        ? roundTo(incidentResolutionTotalHours / incidentResolutionCount, 2)
        : 0;

      const dbHealthy = !queryHealthTracker.missingSchemaDetected;
      const apiHealthy = dbHealthy && authMetricsHealthy;

      const responsePayload = {
        generatedAt: new Date(nowMs).toISOString(),
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
        dau,
        mau,
        newSignups24h,
        grossRevenue,
        netRevenue,
        allTimePlatformNet,
        platformWithdrawn: roundTo(platformWithdrawn, 2),
        platformAvailable,
        providerEarnings: roundTo(providerEarningsInRange, 2),
        pendingPayouts: roundTo(pendingPayouts, 2),
        avgReportResolutionHours,
        avgIncidentResolutionHours,
        paymongoSuccessRate,
        paymentAttempts,
        paidPaymentEvents,
        failedPaymentEvents,
        paymongoLinkedPaymentEvents,
        paymongoLinkedPaymentRate,
        dbHealthy,
        apiHealthy,
        paymongoHealthy,
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

    if (action === "admin_record_platform_withdrawal") {
      const amount = toNumber(params.amount);
      const notes = String(params.notes || "").trim();

      if (!Number.isFinite(amount) || amount < 100) {
        return jsonResponse({ error: "Minimum withdrawal amount is PHP 100" }, 400);
      }

      const { data, error } = await client.rpc("process_platform_manual_withdrawal", {
        p_admin_user_id: userId,
        p_amount: amount,
        p_notes: notes || null,
      });

      if (error) {
        return jsonResponse({
          error: error.message || "Unable to record platform withdrawal",
          details: error.details,
          hint: error.hint,
          code: error.code,
        }, 400);
      }

      clearMetricsCache();

      return jsonResponse({
        success: true,
        ...(data || {}),
      });
    }

    if (action === "admin_fetch_withdrawals") {
      const allowedStatuses = new Set(["pending", "processing", "completed", "failed", "cancelled"]);
      const statusFilter = String(params.status || "all").trim().toLowerCase();
      const searchTerm = sanitizeSearchTerm(params.searchQuery);
      const limit = Math.max(1, Math.min(50, Number(params.limit || 10)));
      const offset = Math.max(0, Number(params.offset || 0));

      const applyWithdrawalFilters = (query: any) => {
        let nextQuery = query;

        if (allowedStatuses.has(statusFilter)) {
          nextQuery = nextQuery.eq("status", statusFilter);
        }

        if (searchTerm.length >= 2) {
          const ilikePattern = `%${searchTerm}%`;
          nextQuery = nextQuery.or(
            `reference_number.ilike.${ilikePattern},notes.ilike.${ilikePattern},payout_account_name.ilike.${ilikePattern},payout_account_number.ilike.${ilikePattern},payout_bank_name.ilike.${ilikePattern}`,
          );
        }

        return nextQuery;
      };

      const listQuery = applyWithdrawalFilters(
        client
          .from("withdrawal_requests")
          .select(
            "id,user_id,wallet_id,payout_method_id,amount,fee,net_amount,status,payout_type,payout_account_name,payout_account_number,payout_bank_name,reference_number,notes,processed_at,processed_by,failure_reason,created_at,updated_at,user:profiles!withdrawal_requests_user_id_fkey(id,full_name,email,role)",
            { count: "exact" },
          ),
      )
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      const totalsQuery = applyWithdrawalFilters(
        client
          .from("withdrawal_requests")
          .select("id,amount,net_amount,status,reference_number,notes"),
      );

      let platformListQuery = client
        .from("platform_withdrawals")
        .select("id,amount,status,reference_number,notes,processed_at,processed_by,created_at,updated_at,available_before,available_after,payment_count");

      let platformTotalsQuery = client
        .from("platform_withdrawals")
        .select("id,amount,status,reference_number,notes");

      if (allowedStatuses.has(statusFilter)) {
        platformListQuery = platformListQuery.eq("status", statusFilter);
        platformTotalsQuery = platformTotalsQuery.eq("status", statusFilter);
      }

      if (searchTerm.length >= 2) {
        const ilikePattern = `%${searchTerm}%`;
        platformListQuery = platformListQuery.or(
          `reference_number.ilike.${ilikePattern},notes.ilike.${ilikePattern}`,
        );
        platformTotalsQuery = platformTotalsQuery.or(
          `reference_number.ilike.${ilikePattern},notes.ilike.${ilikePattern}`,
        );
      }

      const [listResult, totalsResult, platformListRows, platformTotalRows] = await Promise.all([
        listQuery,
        totalsQuery,
        safeRows(platformListQuery.order("created_at", { ascending: false }).limit(50)),
        safeRows(platformTotalsQuery),
      ]);

      if (listResult.error) throw listResult.error;
      if (totalsResult.error) throw totalsResult.error;

      const totals = (totalsResult.data || []).reduce(
        (acc: any, withdrawal: any) => {
          const status = String(withdrawal?.status || "").trim().toLowerCase();
          const amount = toNumber(withdrawal?.amount);
          const netAmount = toNumber(withdrawal?.net_amount) || amount;
          const reference = String(withdrawal?.reference_number || "").trim().toLowerCase();
          const notes = String(withdrawal?.notes || "").trim().toLowerCase();

          acc.count += 1;
          acc.totalAmount += amount;
          acc.totalNetAmount += netAmount;

          if (status === "completed") {
            acc.completedAmount += netAmount;
          }

          if (status === "pending" || status === "processing") {
            acc.pendingAmount += netAmount;
          }

          if (reference.startsWith("mock_wd_") || notes.includes("mock cashout")) {
            acc.mockCount += 1;
          }

          return acc;
        },
        {
          count: 0,
          totalAmount: 0,
          totalNetAmount: 0,
          completedAmount: 0,
          pendingAmount: 0,
          mockCount: 0,
        },
      );

      const platformTotals = (platformTotalRows as any[]).reduce(
        (acc: any, withdrawal: any) => {
          const status = String(withdrawal?.status || "").trim().toLowerCase();
          const amount = toNumber(withdrawal?.amount);

          acc.count += 1;
          acc.totalAmount += amount;
          acc.totalNetAmount += amount;

          if (status === "completed") {
            acc.completedAmount += amount;
          }

          acc.platformCount += 1;
          return acc;
        },
        {
          count: 0,
          totalAmount: 0,
          totalNetAmount: 0,
          completedAmount: 0,
          pendingAmount: 0,
          platformCount: 0,
        },
      );

      const providerWithdrawals = (listResult.data || []).map((withdrawal: any) => ({
        ...withdrawal,
        source_type: "provider",
      }));

      const platformWithdrawals = (platformListRows as any[]).map((withdrawal: any) => ({
        id: withdrawal.id,
        user_id: null,
        wallet_id: null,
        payout_method_id: null,
        amount: withdrawal.amount,
        fee: 0,
        net_amount: withdrawal.amount,
        status: withdrawal.status,
        payout_type: "manual",
        payout_account_name: "Platform cashout",
        payout_account_number: withdrawal.reference_number,
        payout_bank_name: "Internal ledger",
        reference_number: withdrawal.reference_number,
        notes: withdrawal.notes || `Manual platform withdrawal linked to ${withdrawal.payment_count || 0} payment rows.`,
        processed_at: withdrawal.processed_at,
        processed_by: withdrawal.processed_by,
        failure_reason: null,
        created_at: withdrawal.created_at,
        updated_at: withdrawal.updated_at,
        user: {
          id: withdrawal.processed_by,
          full_name: "Platform",
          email: null,
          role: "admin",
        },
        source_type: "platform",
      }));

      const mergedWithdrawals = [...providerWithdrawals, ...platformWithdrawals]
        .sort((a: any, b: any) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
        )
        .slice(0, limit);

      return jsonResponse({
        success: true,
        withdrawals: mergedWithdrawals,
        totals: {
          count: totals.count + platformTotals.count,
          totalAmount: roundTo(totals.totalAmount + platformTotals.totalAmount, 2),
          totalNetAmount: roundTo(totals.totalNetAmount + platformTotals.totalNetAmount, 2),
          completedAmount: roundTo(totals.completedAmount + platformTotals.completedAmount, 2),
          pendingAmount: roundTo(totals.pendingAmount, 2),
          mockCount: totals.mockCount,
          platformCount: platformTotals.platformCount,
        },
        count: (listResult.count || 0) + platformTotals.count,
        hasMore: offset + limit < ((listResult.count || 0) + platformTotals.count),
      });
    }

    if (action === "admin_fetch_payment_transactions") {
      const statusFilter = normalizePaymentStatusFilter(params.status);
      const searchTerm = sanitizeSearchTerm(params.searchQuery);
      const dateRange = normalizeMetricsDateRange(params.dateRange);
      const rangeStartMs = getRangeStartMs(dateRange);
      const limit = Math.max(1, Math.min(1000, Number(params.limit || 50)));
      const offset = Math.max(0, Number(params.offset || 0));
      const candidateLimit = Math.min(1000, Math.max(offset + limit * 4, limit, 200));

      const { data: bookingRows, error: bookingError } = await client
        .from("studio_bookings")
        .select(
          "id,user_id,studio_id,booking_date,start_time,end_time,status,cancellation_reason,payment_status,payment_amount,final_price,payment_type,remaining_balance,payment_method,payment_intent_id,checkout_session_id,paid_at,refund_amount,refund_id,refunded_at,created_at,updated_at",
        )
        .order("updated_at", { ascending: false })
        .limit(candidateLimit);

      if (bookingError) throw bookingError;

      const bookings = Array.isArray(bookingRows) ? bookingRows : [];
      const bookingIds = Array.from(new Set(
        bookings.map((booking: any) => String(booking?.id || "")).filter(Boolean),
      ));
      const studioIds = Array.from(new Set(
        bookings.map((booking: any) => String(booking?.studio_id || "")).filter(Boolean),
      ));

      const studioRows = studioIds.length > 0
        ? await safeRows(
          client
            .from("studios")
            .select("id,name,owner_id")
            .in("id", studioIds),
        )
        : [];

      const studioMap = (studioRows as any[]).reduce((acc: Record<string, any>, studio: any) => {
        if (studio?.id) acc[String(studio.id)] = studio;
        return acc;
      }, {});

      const profileIds = Array.from(new Set([
        ...bookings.map((booking: any) => String(booking?.user_id || "")).filter(Boolean),
        ...(studioRows as any[]).map((studio: any) => String(studio?.owner_id || "")).filter(Boolean),
      ]));

      const [profileRows, walletTransactionRows, penaltyRows] = await Promise.all([
        profileIds.length > 0
          ? safeRows(
            client
              .from("profiles")
              .select("id,full_name,email")
              .in("id", profileIds),
          )
          : Promise.resolve([]),
        bookingIds.length > 0
          ? safeRows(
            client
              .from("wallet_transactions")
              .select("id,amount,type,description,reference_id,is_credit,status,created_at,reference_type")
              .in("reference_id", bookingIds)
              .order("created_at", { ascending: false })
              .limit(3000),
          )
          : Promise.resolve([]),
        bookingIds.length > 0
          ? safeRows(
            client
              .from("booking_penalty_events")
              .select("id,booking_id,penalty_amount,refund_amount,wallet_transaction_id,refund_transaction_id,notes,created_at")
              .in("booking_id", bookingIds),
          )
          : Promise.resolve([]),
      ]);

      const profileMap = (profileRows as any[]).reduce((acc: Record<string, any>, profile: any) => {
        if (profile?.id) acc[String(profile.id)] = profile;
        return acc;
      }, {});

      const walletTransactionsByBooking = (walletTransactionRows as any[]).reduce(
        (acc: Record<string, any[]>, transaction: any) => {
          const referenceId = String(transaction?.reference_id || "");
          if (!referenceId) return acc;
          acc[referenceId] = [...(acc[referenceId] || []), transaction];
          return acc;
        },
        {},
      );

      const penaltiesByBooking = (penaltyRows as any[]).reduce(
        (acc: Record<string, any>, penalty: any) => {
          const bookingId = String(penalty?.booking_id || "");
          if (!bookingId) return acc;

          const nextPenalty = acc[bookingId] || {
            refundAmount: 0,
            penaltyAmount: 0,
            refundTransactionIds: [] as string[],
            walletTransactionIds: [] as string[],
          };

          nextPenalty.refundAmount += toNumber(penalty?.refund_amount);
          nextPenalty.penaltyAmount += toNumber(penalty?.penalty_amount);

          if (penalty?.refund_transaction_id) {
            nextPenalty.refundTransactionIds.push(String(penalty.refund_transaction_id));
          }

          if (penalty?.wallet_transaction_id) {
            nextPenalty.walletTransactionIds.push(String(penalty.wallet_transaction_id));
          }

          acc[bookingId] = nextPenalty;
          return acc;
        },
        {},
      );

      const transactions = bookings.map((booking: any) => {
        const bookingId = String(booking?.id || "");
        const studio = studioMap[String(booking?.studio_id || "")] || null;
        const customer = profileMap[String(booking?.user_id || "")] || null;
        const owner = studio?.owner_id ? profileMap[String(studio.owner_id)] : null;
        const bookingWalletTransactions = walletTransactionsByBooking[bookingId] || [];
        const penaltySummary = penaltiesByBooking[bookingId] || {
          refundAmount: 0,
          penaltyAmount: 0,
          refundTransactionIds: [],
          walletTransactionIds: [],
        };

        const amount = toNumber(booking?.payment_amount) || toNumber(booking?.final_price);
        const refundAmount = toNumber(booking?.refund_amount) || toNumber(penaltySummary.refundAmount);
        const providerEarningAmount = bookingWalletTransactions.reduce((sum: number, transaction: any) => {
          const type = String(transaction?.type || "").trim().toLowerCase();
          const status = String(transaction?.status || "").trim().toLowerCase();
          if (type !== "earning" || status !== "completed" || transaction?.is_credit === false) {
            return sum;
          }
          return sum + toNumber(transaction?.amount);
        }, 0);
        const actionName = getPaymentAuditAction(booking, refundAmount);
        const eventAt = getPaymentEventAt(booking, actionName);
        const reference = String(
          booking?.payment_intent_id ||
          booking?.checkout_session_id ||
          booking?.refund_id ||
          penaltySummary.refundTransactionIds[0] ||
          bookingWalletTransactions[0]?.id ||
          "",
        ).trim() || null;

        return {
          id: bookingId,
          booking_id: bookingId,
          action: actionName,
          event_at: eventAt,
          booking_status: String(booking?.status || ""),
          payment_status: String(booking?.payment_status || ""),
          payment_type: booking?.payment_type || null,
          payment_method: booking?.payment_method || null,
          amount: roundTo(amount, 2),
          refund_amount: roundTo(refundAmount, 2),
          net_amount: roundTo(Math.max(amount - refundAmount, 0), 2),
          remaining_balance: roundTo(toNumber(booking?.remaining_balance), 2),
          provider_earning_amount: roundTo(providerEarningAmount, 2),
          wallet_transaction_count: bookingWalletTransactions.length,
          customer_name: customer?.full_name || null,
          customer_email: customer?.email || null,
          studio_name: studio?.name || null,
          owner_name: owner?.full_name || null,
          owner_email: owner?.email || null,
          booking_date: booking?.booking_date || null,
          start_time: booking?.start_time || null,
          end_time: booking?.end_time || null,
          paid_at: booking?.paid_at || null,
          refunded_at: booking?.refunded_at || null,
          created_at: booking?.created_at || null,
          updated_at: booking?.updated_at || null,
          checkout_session_id: booking?.checkout_session_id || null,
          payment_intent_id: booking?.payment_intent_id || null,
          refund_id: booking?.refund_id || null,
          cancellation_reason: booking?.cancellation_reason || null,
          reference,
        };
      });

      const filteredTransactions = transactions
        .filter((transaction: any) => String(transaction?.action || "").trim().toLowerCase() !== "payment_unpaid")
        .filter((transaction: any) => matchesPaymentStatusFilter(transaction, statusFilter))
        .filter((transaction: any) => isInRange(transaction?.event_at, rangeStartMs))
        .filter((transaction: any) => paymentTransactionMatchesSearch(transaction, searchTerm))
        .sort((a: any, b: any) =>
          new Date(b.event_at || b.updated_at || b.created_at || 0).getTime() -
          new Date(a.event_at || a.updated_at || a.created_at || 0).getTime(),
        );

      const totals = filteredTransactions.reduce(
        (acc: any, transaction: any) => {
          const paymentStatus = String(transaction?.payment_status || "").trim().toLowerCase();
          const bookingStatus = String(transaction?.booking_status || "").trim().toLowerCase();
          const actionName = String(transaction?.action || "").trim().toLowerCase();

          acc.count += 1;

          if (["paid", "partial", "refunded", "refund_pending"].includes(paymentStatus)) {
            acc.grossAmount += toNumber(transaction?.amount);
          }

          acc.refundedAmount += toNumber(transaction?.refund_amount);
          acc.netAmount += toNumber(transaction?.net_amount);

          if (paymentStatus === "paid") acc.paidCount += 1;
          if (paymentStatus === "partial") acc.partialCount += 1;
          if (paymentStatus === "pending") acc.pendingCount += 1;
          if (paymentStatus === "failed") acc.failedCount += 1;
          if (bookingStatus === "cancelled" || actionName === "payment_cancelled") acc.cancelledCount += 1;
          if (actionName === "payment_refunded" || actionName === "payment_refund_pending") acc.refundedCount += 1;

          return acc;
        },
        {
          count: 0,
          grossAmount: 0,
          refundedAmount: 0,
          netAmount: 0,
          paidCount: 0,
          partialCount: 0,
          pendingCount: 0,
          failedCount: 0,
          cancelledCount: 0,
          refundedCount: 0,
        },
      );

      return jsonResponse({
        success: true,
        transactions: filteredTransactions.slice(offset, offset + limit),
        totals: {
          count: totals.count,
          grossAmount: roundTo(totals.grossAmount, 2),
          refundedAmount: roundTo(totals.refundedAmount, 2),
          netAmount: roundTo(totals.netAmount, 2),
          paidCount: totals.paidCount,
          partialCount: totals.partialCount,
          pendingCount: totals.pendingCount,
          failedCount: totals.failedCount,
          cancelledCount: totals.cancelledCount,
          refundedCount: totals.refundedCount,
        },
        count: filteredTransactions.length,
        hasMore: offset + limit < filteredTransactions.length,
      });
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
