// @ts-ignore
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function extractAccessToken(authHeader: string): string | null {
  const trimmed = (authHeader || "").trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase().startsWith("bearer ")) {
    const token = trimmed.slice(7).trim();
    return token || null;
  }
  return trimmed;
}

function toNumber(value: unknown): number | null {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function normalizeProductRecord(product: any) {
  if (!product) return product;

  const basePrice = toNumber(product.price ?? product.base_price) ?? 0;
  const coverImageUrl = typeof product?.cover_image_url === "string" && product.cover_image_url.trim().length > 0
    ? product.cover_image_url
    : typeof product?.primary_image === "string" && product.primary_image.trim().length > 0
      ? product.primary_image
      : null;

  return {
    ...product,
    price: basePrice,
    base_price: basePrice,
    cover_image_url: coverImageUrl,
    primary_image: coverImageUrl,
  };
}

async function requireAdmin(supabaseAdmin: any, accessToken: string) {
  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (authError || !user) {
    return { error: jsonResponse({ error: "Invalid token" }, 401), userId: null };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return { error: jsonResponse({ error: profileError.message }, 500), userId: null };
  }

  if (profile?.role !== "admin") {
    return { error: jsonResponse({ error: "Forbidden" }, 403), userId: null };
  }

  return { error: null, userId: user.id };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Server misconfiguration" }, 500);
    }

    const accessToken = extractAccessToken(req.headers.get("Authorization") || "");
    if (!accessToken) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const admin = await requireAdmin(supabaseAdmin, accessToken);
    if (admin.error) return admin.error;

    const { action, ...params } = await req.json();

    if (action === "admin_list_products") {
      const search = typeof params.search === "string" ? params.search.trim() : "";
      const status = typeof params.status === "string" ? params.status.trim() : "";
      const pageSize = Math.min(Number(params.limit) || 100, 200);

      let query = supabaseAdmin
        .from("products_with_summary")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(pageSize);

      if (status && status !== "reported") {
        query = query.eq("status", status);
      }

      if (search) {
        query = query.ilike("title", `%${search}%`);
      }

      const { data, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 500);

      let rows = (data || []).map((item: any) => normalizeProductRecord(item));

      const productIds = rows
        .map((item: any) => item?.id)
        .filter((value: any): value is string => typeof value === "string" && value.length > 0);

      if (productIds.length > 0) {
        const { data: reports } = await supabaseAdmin
          .from("reports")
          .select("target_id")
          .eq("target_type", "product")
          .in("target_id", productIds);

        const reportCountByProduct = new Map<string, number>();
        for (const report of reports || []) {
          const targetId = String(report?.target_id || "");
          if (!targetId) continue;
          reportCountByProduct.set(targetId, (reportCountByProduct.get(targetId) || 0) + 1);
        }

        rows = rows.map((item: any) => ({
          ...item,
          report_count: reportCountByProduct.get(item.id) || 0,
        }));
      }

      if (status === "reported") {
        rows = rows.filter((item: any) => Number(item.report_count || 0) > 0);
      }

      return jsonResponse({ success: true, data: rows });
    }

    if (action === "update_product") {
      const { product_id, status } = params;
      if (!product_id) return jsonResponse({ error: "product_id is required" }, 400);
      if (!["draft", "active", "sold_out", "archived", "suspended"].includes(String(status))) {
        return jsonResponse({ error: "Unsupported product status" }, 400);
      }

      const { data, error } = await supabaseAdmin
        .from("products")
        .update({ status })
        .eq("id", product_id)
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data: normalizeProductRecord(data) });
    }

    return jsonResponse({ error: `Unsupported action: ${action}` }, 400);
  } catch (err: any) {
    console.error("admin-marketplace-management error:", err);
    return jsonResponse({ error: err.message || "Internal server error" }, 500);
  }
});
