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

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function decodeJwtPayload(token: string): { sub?: string } | null {
  try {
    const parts = token.replace("Bearer ", "").split(".");
    if (parts.length !== 3) return null;

    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }

    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

function parseReportStatus(rawValue: unknown): ReportStatus | null {
  const value = String(rawValue || "").trim().toLowerCase();
  if (value === "pending" || value === "resolved" || value === "dismissed") {
    return value;
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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    const jwtPayload = decodeJwtPayload(authHeader);
    if (!jwtPayload?.sub) {
      return jsonResponse({ error: "Invalid authorization token" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Server misconfiguration" }, 500);
    }

    const client = createClient(supabaseUrl, serviceRoleKey);

    const isAdmin = await assertAdmin(client, jwtPayload.sub);
    if (!isAdmin) {
      return jsonResponse({ error: "Forbidden: admin role required" }, 403);
    }

    const { action, ...params } = await req.json();

    if (action === "fetch_reports") {
      const statusFilter = String(params.statusFilter || "all").trim().toLowerCase();
      const limit = Math.max(1, Math.min(200, Number(params.limit || 100)));

      let reportsQuery = client
        .from("reports")
        .select("id, reporter_id, target_type, target_id, reason, details, status, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (["pending", "resolved", "dismissed"].includes(statusFilter)) {
        reportsQuery = reportsQuery.eq("status", statusFilter);
      }

      const { data: reports, error: reportsError } = await reportsQuery;
      if (reportsError) throw reportsError;

      const reporterIds = Array.from(
        new Set((reports || []).map((entry: any) => entry.reporter_id).filter(Boolean)),
      );

      let reporterMap: Record<string, { full_name: string; email: string }> = {};
      if (reporterIds.length > 0) {
        const { data: reporterRows, error: reporterError } = await client
          .from("profiles")
          .select("id, full_name, email")
          .in("id", reporterIds);

        if (reporterError) throw reporterError;

        reporterMap = (reporterRows || []).reduce(
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

      return jsonResponse({
        items: (reports || []).map((entry: any) => ({
          ...entry,
          reporter_name: reporterMap[entry.reporter_id]?.full_name || "Unknown",
          reporter_email: reporterMap[entry.reporter_id]?.email || "",
        })),
      });
    }

    if (action === "update_report_status") {
      const reportId = String(params.reportId || "").trim();
      const nextStatus = parseReportStatus(params.nextStatus);

      if (!reportId || !nextStatus) {
        return jsonResponse({ error: "Missing required fields" }, 400);
      }

      if (nextStatus !== "resolved" && nextStatus !== "dismissed") {
        return jsonResponse({ error: "Unsupported report status transition" }, 400);
      }

      const { data: updatedReport, error: updateError } = await client
        .from("reports")
        .update({ status: nextStatus })
        .eq("id", reportId)
        .select("id, status, target_type, target_id")
        .maybeSingle();

      if (updateError) throw updateError;
      if (!updatedReport) {
        return jsonResponse({ error: "Report not found" }, 404);
      }

      return jsonResponse({ item: updatedReport });
    }

    return jsonResponse({ error: `Unsupported action: ${action}` }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
