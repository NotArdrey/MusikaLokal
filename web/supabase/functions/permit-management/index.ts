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

type PermitStatus = "pending_review" | "approved" | "rejected" | "resubmitted";

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
  } = await authClient.auth.getUser();

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

      return jsonResponse({
        item: {
          ...updatedItem,
          entity_type: entityType,
          permit_status: normalizePermitStatus(updatedItem.permit_status),
        },
      });
    }

    if (action === "fetch_metrics") {
      const [
        usersCount,
        studiosCount,
        gigsCount,
        pendingStudios,
        pendingGigs,
        approvedStudios,
        approvedGigs,
        rejectedStudios,
        rejectedGigs,
        auditCount,
      ] = await Promise.all([
        client.from("profiles").select("id", { count: "exact", head: true }),
        client.from("studios").select("id", { count: "exact", head: true }),
        client.from("gigs").select("id", { count: "exact", head: true }),
        client
          .from("studios")
          .select("id", { count: "exact", head: true })
          .in("permit_status", ["pending_review", "pending"]),
        client
          .from("gigs")
          .select("id", { count: "exact", head: true })
          .in("permit_status", ["pending_review", "pending"]),
        client
          .from("studios")
          .select("id", { count: "exact", head: true })
          .eq("permit_status", "approved"),
        client
          .from("gigs")
          .select("id", { count: "exact", head: true })
          .eq("permit_status", "approved"),
        client
          .from("studios")
          .select("id", { count: "exact", head: true })
          .eq("permit_status", "rejected"),
        client
          .from("gigs")
          .select("id", { count: "exact", head: true })
          .eq("permit_status", "rejected"),
        client.from("permit_audit_log").select("id", { count: "exact", head: true }),
      ]);

      return jsonResponse({
        totalUsers: usersCount.count || 0,
        totalStudios: studiosCount.count || 0,
        totalGigs: gigsCount.count || 0,
        pendingPermits: (pendingStudios.count || 0) + (pendingGigs.count || 0),
        approvedPermits: (approvedStudios.count || 0) + (approvedGigs.count || 0),
        rejectedPermits: (rejectedStudios.count || 0) + (rejectedGigs.count || 0),
        recentActions: auditCount.count || 0,
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
