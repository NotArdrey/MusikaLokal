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

    if (action === "admin_list_posts") {
      const search = typeof params.search === "string" ? params.search.trim() : "";
      const filter = typeof params.filter === "string" ? params.filter.trim() : "all";
      const pageSize = Math.min(Number(params.limit) || 100, 200);

      let query = supabaseAdmin
        .from("feed_posts")
        .select("id, author_id, content, post_type, visibility, is_reported, is_hidden, created_at, updated_at, author:profiles!author_id(id, full_name, email, avatar_url)")
        .order("created_at", { ascending: false })
        .limit(pageSize);

      if (filter === "reported") {
        query = query.eq("is_reported", true);
      } else if (filter === "hidden") {
        query = query.eq("is_hidden", true);
      }

      if (search) {
        query = query.ilike("content", `%${search}%`);
      }

      const { data, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 500);

      const rows = (data || []).map((post: any) => ({
        ...post,
        body: post.content,
        author_name: post.author?.full_name || null,
        author_email: post.author?.email || null,
        report_count: post.is_reported ? 1 : 0,
      }));

      return jsonResponse({ success: true, data: rows });
    }

    if (action === "admin_hide_post") {
      const { post_id } = params;
      if (!post_id) return jsonResponse({ error: "post_id is required" }, 400);

      const hidden = params.hidden !== false;
      const { data, error } = await supabaseAdmin
        .from("feed_posts")
        .update({ is_hidden: hidden })
        .eq("id", post_id)
        .select("id, author_id, is_hidden")
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);

      await supabaseAdmin.from("social_activity_events").insert({
        event_type: hidden ? "post_hidden" : "post_restored",
        actor_id: admin.userId,
        target_user_id: data?.author_id || null,
        post_id,
      });

      return jsonResponse({ success: true, data });
    }

    if (action === "delete_post") {
      const { post_id } = params;
      if (!post_id) return jsonResponse({ error: "post_id is required" }, 400);

      const { error } = await supabaseAdmin
        .from("feed_posts")
        .delete()
        .eq("id", post_id);

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: `Unsupported action: ${action}` }, 400);
  } catch (err: any) {
    console.error("admin-social-feed-management error:", err);
    return jsonResponse({ error: err.message || "Internal server error" }, 500);
  }
});
