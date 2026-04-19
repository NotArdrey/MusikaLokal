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

async function insertNotification(
  supabaseAdmin: any,
  payload: {
    user_id: string;
    type: string;
    title: string;
    message: string;
    image?: string | null;
    meta?: Record<string, any>;
  },
) {
  await supabaseAdmin.from("notifications").insert({
    ...payload,
    read: false,
  });
}

async function recordActivityEvent(
  supabaseAdmin: any,
  event: {
    event_type: string;
    project_id?: string;
    actor_id: string;
    target_id?: string;
    application_id?: string;
    invite_id?: string;
    metadata?: Record<string, any>;
  },
) {
  await supabaseAdmin.from("producer_match_activity_events").insert(event);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const accessToken = extractAccessToken(authHeader);

    if (!accessToken) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Server misconfiguration" }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user: authUser },
      error: authErr,
    } = await supabaseAdmin.auth.getUser(accessToken);

    if (authErr || !authUser) {
      return jsonResponse({ error: "Invalid token" }, 401);
    }

    const uid = authUser.id;
    const { action, ...params } = await req.json();

    // ── create_project ──────────────────────────────────────────────
    if (action === "create_project") {
      const { title, description, genre, location, budget_range, start_date, end_date, team_id, max_roles, is_remote, cover_image_url, roles } = params;
      if (!title) return jsonResponse({ error: "title is required" }, 400);

      const { data: project, error: projErr } = await supabaseAdmin
        .from("producer_projects")
        .insert({
          owner_id: uid,
          title,
          description: description || null,
          genre: genre || null,
          location: location || null,
          budget_range: budget_range || null,
          start_date: start_date || null,
          end_date: end_date || null,
          team_id: team_id || null,
          max_roles: max_roles || 10,
          is_remote: is_remote || false,
          cover_image_url: cover_image_url || null,
          status: "draft",
        })
        .select()
        .single();

      if (projErr) return jsonResponse({ error: projErr.message }, 500);

      // Bulk insert roles if provided
      if (roles && Array.isArray(roles) && roles.length > 0) {
        const roleRows = roles.map((r: any) => ({
          project_id: project.id,
          role_title: r.role_title,
          role_type: r.role_type || "instrument",
          description: r.description || null,
          is_required: r.is_required !== false,
          max_slots: r.max_slots || 1,
        }));
        await supabaseAdmin.from("producer_project_roles").insert(roleRows);
      }

      return jsonResponse({ success: true, data: project });
    }

    // ── update_project ──────────────────────────────────────────────
    if (action === "update_project") {
      const { project_id, ...updates } = params;
      if (!project_id) return jsonResponse({ error: "project_id is required" }, 400);

      const { data: existing } = await supabaseAdmin
        .from("producer_projects")
        .select("owner_id")
        .eq("id", project_id)
        .single();

      if (!existing) return jsonResponse({ error: "Project not found" }, 404);
      if (existing.owner_id !== uid) {
        // Check team membership
        const { data: teamCheck } = await supabaseAdmin
          .from("production_team_members")
          .select("role")
          .eq("team_id", existing.team_id)
          .eq("user_id", uid)
          .in("role", ["owner", "manager"])
          .maybeSingle();
        if (!teamCheck) return jsonResponse({ error: "Forbidden" }, 403);
      }

      const allowed = ["title", "description", "genre", "location", "budget_range", "start_date", "end_date", "max_roles", "is_remote", "cover_image_url"];
      const patch: Record<string, any> = {};
      for (const key of allowed) {
        if (key in updates) patch[key] = updates[key];
      }

      const { data, error } = await supabaseAdmin
        .from("producer_projects")
        .update(patch)
        .eq("id", project_id)
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── publish_project ─────────────────────────────────────────────
    if (action === "publish_project") {
      const { project_id } = params;
      if (!project_id) return jsonResponse({ error: "project_id is required" }, 400);

      const { data: proj } = await supabaseAdmin
        .from("producer_projects")
        .select("owner_id, status, title")
        .eq("id", project_id)
        .single();

      if (!proj) return jsonResponse({ error: "Project not found" }, 404);
      if (proj.owner_id !== uid) return jsonResponse({ error: "Forbidden" }, 403);
      if (proj.status !== "draft") return jsonResponse({ error: "Only draft projects can be published" }, 400);

      const { data, error } = await supabaseAdmin
        .from("producer_projects")
        .update({ status: "published" })
        .eq("id", project_id)
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);

      await recordActivityEvent(supabaseAdmin, {
        event_type: "project_published",
        project_id,
        actor_id: uid,
      });

      return jsonResponse({ success: true, data });
    }

    // ── archive_project ─────────────────────────────────────────────
    if (action === "archive_project") {
      const { project_id } = params;
      if (!project_id) return jsonResponse({ error: "project_id is required" }, 400);

      const { data: proj } = await supabaseAdmin
        .from("producer_projects")
        .select("owner_id")
        .eq("id", project_id)
        .single();

      if (!proj) return jsonResponse({ error: "Project not found" }, 404);
      if (proj.owner_id !== uid) return jsonResponse({ error: "Forbidden" }, 403);

      const { data, error } = await supabaseAdmin
        .from("producer_projects")
        .update({ status: "archived" })
        .eq("id", project_id)
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);

      await recordActivityEvent(supabaseAdmin, {
        event_type: "project_archived",
        project_id,
        actor_id: uid,
      });

      return jsonResponse({ success: true, data });
    }

    // ── list_my_projects ────────────────────────────────────────────
    if (action === "list_my_projects") {
      const { data, error } = await supabaseAdmin
        .from("producer_projects_with_summary")
        .select("*")
        .eq("owner_id", uid)
        .order("created_at", { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── get_project_details ─────────────────────────────────────────
    if (action === "get_project_details") {
      const { project_id } = params;
      if (!project_id) return jsonResponse({ error: "project_id is required" }, 400);

      const { data: project, error: projErr } = await supabaseAdmin
        .from("producer_projects_with_summary")
        .select("*")
        .eq("id", project_id)
        .single();

      if (projErr || !project) return jsonResponse({ error: "Project not found" }, 404);

      const { data: roles } = await supabaseAdmin
        .from("producer_project_roles")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at");

      const { data: applications } = await supabaseAdmin
        .from("producer_project_applications")
        .select("*, applicant:profiles!applicant_id(id, full_name, avatar_url)")
        .eq("project_id", project_id)
        .order("created_at", { ascending: false });

      const { data: invites } = await supabaseAdmin
        .from("producer_talent_invites")
        .select("*, invitee:profiles!invitee_id(id, full_name, avatar_url)")
        .eq("project_id", project_id)
        .order("created_at", { ascending: false });

      return jsonResponse({
        success: true,
        data: { ...project, roles: roles || [], applications: applications || [], invites: invites || [] },
      });
    }

    // ── apply_to_project ────────────────────────────────────────────
    if (action === "apply_to_project") {
      const { project_id, role_id, cover_message } = params;
      if (!project_id) return jsonResponse({ error: "project_id is required" }, 400);

      const { data: proj } = await supabaseAdmin
        .from("producer_projects")
        .select("owner_id, status, title")
        .eq("id", project_id)
        .single();

      if (!proj) return jsonResponse({ error: "Project not found" }, 404);
      if (proj.status !== "published") return jsonResponse({ error: "Project is not open for applications" }, 400);
      if (proj.owner_id === uid) return jsonResponse({ error: "Cannot apply to your own project" }, 400);

      const { data: app, error: appErr } = await supabaseAdmin
        .from("producer_project_applications")
        .insert({
          project_id,
          role_id: role_id || null,
          applicant_id: uid,
          cover_message: cover_message || null,
          status: "pending",
        })
        .select()
        .single();

      if (appErr) {
        if (appErr.code === "23505") return jsonResponse({ error: "You have already applied to this project" }, 409);
        return jsonResponse({ error: appErr.message }, 500);
      }

      // Get applicant name for notification
      const { data: applicant } = await supabaseAdmin.from("profiles").select("full_name, avatar_url").eq("id", uid).single();

      await recordActivityEvent(supabaseAdmin, {
        event_type: "application_submitted",
        project_id,
        actor_id: uid,
        target_id: proj.owner_id,
        application_id: app.id,
      });

      await insertNotification(supabaseAdmin, {
        user_id: proj.owner_id,
        type: "producer_application",
        title: "New Application",
        message: `${applicant?.full_name || "A musician"} applied to your project "${proj.title}"`,
        image: applicant?.avatar_url || null,
        meta: { event_type: "application_submitted", project_id, application_id: app.id },
      });

      return jsonResponse({ success: true, data: app });
    }

    // ── withdraw_application ────────────────────────────────────────
    if (action === "withdraw_application") {
      const { application_id } = params;
      if (!application_id) return jsonResponse({ error: "application_id is required" }, 400);

      const { data: app } = await supabaseAdmin
        .from("producer_project_applications")
        .select("applicant_id, project_id, status")
        .eq("id", application_id)
        .single();

      if (!app) return jsonResponse({ error: "Application not found" }, 404);
      if (app.applicant_id !== uid) return jsonResponse({ error: "Forbidden" }, 403);
      if (app.status !== "pending") return jsonResponse({ error: "Can only withdraw pending applications" }, 400);

      const { data, error } = await supabaseAdmin
        .from("producer_project_applications")
        .update({ status: "withdrawn" })
        .eq("id", application_id)
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);

      await recordActivityEvent(supabaseAdmin, {
        event_type: "application_withdrawn",
        project_id: app.project_id,
        actor_id: uid,
        application_id,
      });

      return jsonResponse({ success: true, data });
    }

    // ── review_application (accept/reject) ──────────────────────────
    if (action === "review_application") {
      const { application_id, decision } = params;
      if (!application_id || !decision) return jsonResponse({ error: "application_id and decision are required" }, 400);
      if (!["accepted", "rejected"].includes(decision)) return jsonResponse({ error: "decision must be accepted or rejected" }, 400);

      const { data: app } = await supabaseAdmin
        .from("producer_project_applications")
        .select("applicant_id, project_id, status, role_id")
        .eq("id", application_id)
        .single();

      if (!app) return jsonResponse({ error: "Application not found" }, 404);
      if (app.status !== "pending") return jsonResponse({ error: "Application is not pending" }, 400);

      const { data: proj } = await supabaseAdmin
        .from("producer_projects")
        .select("owner_id, title")
        .eq("id", app.project_id)
        .single();

      if (!proj || proj.owner_id !== uid) return jsonResponse({ error: "Forbidden" }, 403);

      const { data, error } = await supabaseAdmin
        .from("producer_project_applications")
        .update({ status: decision, reviewed_at: new Date().toISOString(), reviewed_by: uid })
        .eq("id", application_id)
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);

      // Increment filled_slots if accepted
      if (decision === "accepted" && app.role_id) {
        await supabaseAdmin.rpc("", {}).catch(() => {}); // no-op placeholder
        await supabaseAdmin
          .from("producer_project_roles")
          .update({ filled_slots: supabaseAdmin.rpc ? undefined : undefined })
          .eq("id", app.role_id);
        // Use raw SQL increment
        await supabaseAdmin.rpc("exec_sql", { sql: "" }).catch(() => {});
        // Simpler: re-read and update
        const { data: role } = await supabaseAdmin
          .from("producer_project_roles")
          .select("filled_slots")
          .eq("id", app.role_id)
          .single();
        if (role) {
          await supabaseAdmin
            .from("producer_project_roles")
            .update({ filled_slots: (role.filled_slots || 0) + 1 })
            .eq("id", app.role_id);
        }
      }

      await recordActivityEvent(supabaseAdmin, {
        event_type: decision === "accepted" ? "application_accepted" : "application_rejected",
        project_id: app.project_id,
        actor_id: uid,
        target_id: app.applicant_id,
        application_id,
      });

      await insertNotification(supabaseAdmin, {
        user_id: app.applicant_id,
        type: "producer_application",
        title: decision === "accepted" ? "Application Accepted!" : "Application Update",
        message: decision === "accepted"
          ? `Your application to "${proj.title}" has been accepted!`
          : `Your application to "${proj.title}" was not selected.`,
        meta: { event_type: `application_${decision}`, project_id: app.project_id, application_id },
      });

      return jsonResponse({ success: true, data });
    }

    // ── invite_musician ─────────────────────────────────────────────
    if (action === "invite_musician") {
      const { project_id, role_id, invitee_id, message } = params;
      if (!project_id || !invitee_id) return jsonResponse({ error: "project_id and invitee_id are required" }, 400);

      const { data: proj } = await supabaseAdmin
        .from("producer_projects")
        .select("owner_id, status, title")
        .eq("id", project_id)
        .single();

      if (!proj) return jsonResponse({ error: "Project not found" }, 404);
      if (proj.owner_id !== uid) return jsonResponse({ error: "Forbidden" }, 403);
      if (proj.status !== "published") return jsonResponse({ error: "Project must be published to send invites" }, 400);
      if (invitee_id === uid) return jsonResponse({ error: "Cannot invite yourself" }, 400);

      const { data: invite, error: invErr } = await supabaseAdmin
        .from("producer_talent_invites")
        .insert({
          project_id,
          role_id: role_id || null,
          inviter_id: uid,
          invitee_id,
          message: message || null,
          status: "pending",
        })
        .select()
        .single();

      if (invErr) {
        if (invErr.code === "23505") return jsonResponse({ error: "Musician already invited to this project" }, 409);
        return jsonResponse({ error: invErr.message }, 500);
      }

      const { data: inviter } = await supabaseAdmin.from("profiles").select("full_name, avatar_url").eq("id", uid).single();

      await recordActivityEvent(supabaseAdmin, {
        event_type: "invite_sent",
        project_id,
        actor_id: uid,
        target_id: invitee_id,
        invite_id: invite.id,
      });

      await insertNotification(supabaseAdmin, {
        user_id: invitee_id,
        type: "producer_invite",
        title: "Project Invitation",
        message: `${inviter?.full_name || "A producer"} invited you to "${proj.title}"`,
        image: inviter?.avatar_url || null,
        meta: { event_type: "invite_sent", project_id, invite_id: invite.id },
      });

      return jsonResponse({ success: true, data: invite });
    }

    // ── accept_invite ───────────────────────────────────────────────
    if (action === "accept_invite") {
      const { invite_id } = params;
      if (!invite_id) return jsonResponse({ error: "invite_id is required" }, 400);

      const { data: invite } = await supabaseAdmin
        .from("producer_talent_invites")
        .select("invitee_id, inviter_id, project_id, status, role_id")
        .eq("id", invite_id)
        .single();

      if (!invite) return jsonResponse({ error: "Invite not found" }, 404);
      if (invite.invitee_id !== uid) return jsonResponse({ error: "Forbidden" }, 403);
      if (invite.status !== "pending") return jsonResponse({ error: "Invite is not pending" }, 400);

      const { data, error } = await supabaseAdmin
        .from("producer_talent_invites")
        .update({ status: "accepted", responded_at: new Date().toISOString() })
        .eq("id", invite_id)
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);

      // Increment filled slot if role_id set
      if (invite.role_id) {
        const { data: role } = await supabaseAdmin
          .from("producer_project_roles")
          .select("filled_slots")
          .eq("id", invite.role_id)
          .single();
        if (role) {
          await supabaseAdmin
            .from("producer_project_roles")
            .update({ filled_slots: (role.filled_slots || 0) + 1 })
            .eq("id", invite.role_id);
        }
      }

      const { data: proj } = await supabaseAdmin
        .from("producer_projects")
        .select("title")
        .eq("id", invite.project_id)
        .single();

      const { data: musician } = await supabaseAdmin.from("profiles").select("full_name, avatar_url").eq("id", uid).single();

      await recordActivityEvent(supabaseAdmin, {
        event_type: "invite_accepted",
        project_id: invite.project_id,
        actor_id: uid,
        target_id: invite.inviter_id,
        invite_id,
      });

      await insertNotification(supabaseAdmin, {
        user_id: invite.inviter_id,
        type: "producer_invite",
        title: "Invite Accepted!",
        message: `${musician?.full_name || "A musician"} accepted your invite to "${proj?.title || "your project"}"`,
        image: musician?.avatar_url || null,
        meta: { event_type: "invite_accepted", project_id: invite.project_id, invite_id },
      });

      return jsonResponse({ success: true, data });
    }

    // ── reject_invite ───────────────────────────────────────────────
    if (action === "reject_invite") {
      const { invite_id } = params;
      if (!invite_id) return jsonResponse({ error: "invite_id is required" }, 400);

      const { data: invite } = await supabaseAdmin
        .from("producer_talent_invites")
        .select("invitee_id, inviter_id, project_id, status")
        .eq("id", invite_id)
        .single();

      if (!invite) return jsonResponse({ error: "Invite not found" }, 404);
      if (invite.invitee_id !== uid) return jsonResponse({ error: "Forbidden" }, 403);
      if (invite.status !== "pending") return jsonResponse({ error: "Invite is not pending" }, 400);

      const { data, error } = await supabaseAdmin
        .from("producer_talent_invites")
        .update({ status: "rejected", responded_at: new Date().toISOString() })
        .eq("id", invite_id)
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);

      await recordActivityEvent(supabaseAdmin, {
        event_type: "invite_rejected",
        project_id: invite.project_id,
        actor_id: uid,
        target_id: invite.inviter_id,
        invite_id,
      });

      return jsonResponse({ success: true, data });
    }

    // ── save_talent ─────────────────────────────────────────────────
    if (action === "save_talent") {
      const { talent_id, note } = params;
      if (!talent_id) return jsonResponse({ error: "talent_id is required" }, 400);
      if (talent_id === uid) return jsonResponse({ error: "Cannot save yourself" }, 400);

      const { data, error } = await supabaseAdmin
        .from("saved_talent")
        .insert({ saver_id: uid, talent_id, note: note || null })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") return jsonResponse({ error: "Talent already saved" }, 409);
        return jsonResponse({ error: error.message }, 500);
      }

      await recordActivityEvent(supabaseAdmin, {
        event_type: "talent_saved",
        actor_id: uid,
        target_id: talent_id,
      });

      return jsonResponse({ success: true, data });
    }

    // ── unsave_talent ───────────────────────────────────────────────
    if (action === "unsave_talent") {
      const { talent_id } = params;
      if (!talent_id) return jsonResponse({ error: "talent_id is required" }, 400);

      const { error } = await supabaseAdmin
        .from("saved_talent")
        .delete()
        .eq("saver_id", uid)
        .eq("talent_id", talent_id);

      if (error) return jsonResponse({ error: error.message }, 500);

      await recordActivityEvent(supabaseAdmin, {
        event_type: "talent_unsaved",
        actor_id: uid,
        target_id: talent_id,
      });

      return jsonResponse({ success: true });
    }

    // ── list_saved_talent ───────────────────────────────────────────
    if (action === "list_saved_talent") {
      const { data, error } = await supabaseAdmin
        .from("saved_talent")
        .select("*, talent:profiles!talent_id(id, full_name, avatar_url, role)")
        .eq("saver_id", uid)
        .order("created_at", { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── list_matches ────────────────────────────────────────────────
    if (action === "list_matches") {
      const { role: viewRole } = params;

      // For producers: show applications to their projects + sent invites
      // For musicians: show their applications + received invites
      const { data, error } = await supabaseAdmin
        .from("producer_matches_with_summary")
        .select("*")
        .or(viewRole === "producer" ? `producer_id.eq.${uid}` : `musician_id.eq.${uid}`)
        .order("created_at", { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── browse_projects (discovery) ─────────────────────────────────
    if (action === "browse_projects") {
      const { genre, location, limit: lim } = params;
      let query = supabaseAdmin
        .from("producer_projects_with_summary")
        .select("*")
        .eq("status", "published")
        .order("created_at", { ascending: false });

      if (genre) query = query.eq("genre", genre);
      if (location) query = query.ilike("location", `%${location}%`);
      if (lim) query = query.limit(Number(lim));

      const { data, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err: any) {
    console.error("manage-producer-network error:", err);
    return jsonResponse({ error: err.message || "Internal server error" }, 500);
  }
});
