// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
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

function toNonEmptyString(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeRouteParams(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== null && entryValue !== undefined)
    .map(([key, entryValue]) => [key, String(entryValue)]);

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries) as Record<string, string>;
}

function buildListingRequestEventDetails(params: Record<string, unknown>) {
  const senderEntityType =
    toNonEmptyString(params.senderEntityType ?? params.sender_entity_type) ||
    "musician";
  const senderEntityName =
    toNonEmptyString(params.senderEntityName ?? params.sender_entity_name) ||
    "User";
  const receiverEntityType =
    toNonEmptyString(params.receiverEntityType ?? params.receiver_entity_type) ||
    "musician";
  const receiverEntityName =
    toNonEmptyString(params.receiverEntityName ?? params.receiver_entity_name) ||
    "User";
  const routePath = toNonEmptyString(params.routePath ?? params.route_path) || undefined;
  const routeParams = normalizeRouteParams(params.routeParams ?? params.route_params);
  const extraMeta =
    params.extraMeta && typeof params.extraMeta === "object" && !Array.isArray(params.extraMeta)
      ? params.extraMeta
      : params.extra_meta && typeof params.extra_meta === "object" && !Array.isArray(params.extra_meta)
        ? params.extra_meta
        : {};

  return {
    type: "listing_connection_request",
    sender_entity_type: senderEntityType,
    sender_entity_id: toNonEmptyString(params.senderEntityId ?? params.sender_entity_id),
    sender_entity_name: senderEntityName,
    receiver_entity_type: receiverEntityType,
    receiver_entity_id: toNonEmptyString(params.receiverEntityId ?? params.receiver_entity_id),
    receiver_entity_name: receiverEntityName,
    production_team_id: toNonEmptyString(params.productionTeamId ?? params.production_team_id),
    route: routePath,
    route_params: routeParams,
    ...(extraMeta as Record<string, unknown>),
  };
}

async function getGroupOwnerContext(
  supabaseAdmin: any,
  groupId: string | null,
) {
  if (!groupId) {
    return null;
  }

  const { data: groupData, error: groupError } = await supabaseAdmin
    .from("groups")
    .select("id, owner_id, name, group_type")
    .eq("id", groupId)
    .maybeSingle();

  if (groupError) {
    throw groupError;
  }

  return groupData || null;
}

function getListingRequestKind(eventDetails: any) {
  const requestDetails =
    eventDetails?.request_details && typeof eventDetails.request_details === "object"
      ? eventDetails.request_details
      : {};

  return String(
    requestDetails?.request_kind || eventDetails?.request_kind || "",
  )
    .trim()
    .toLowerCase();
}

function isProductionTeamInviteRequest(request: any) {
  const eventDetails =
    request?.event_details && typeof request.event_details === "object"
      ? request.event_details
      : {};

  const senderEntityType = String(eventDetails?.sender_entity_type || "")
    .trim()
    .toLowerCase();

  return (
    senderEntityType === "production_team" &&
    getListingRequestKind(eventDetails) === "invite"
  );
}


serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return jsonResponse({ code: 401, message: "Missing Authorization header" }, 401);
    }

    const supabaseClient = createClient(
      // @ts-ignore
      Deno.env.get("SUPABASE_URL") ?? "",
      // @ts-ignore
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const supabaseAdmin = createClient(
      // @ts-ignore
      Deno.env.get("SUPABASE_URL") ?? "",
      // @ts-ignore
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const {
      data: { user: authUser },
      error: authUserError,
    } = await supabaseClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));

    if (authUserError || !authUser) {
      return jsonResponse({ code: 401, message: "Invalid JWT" }, 401);
    }

    const { action, ...params } = await req.json();

    if (action === "create_listing_request") {
      const receiverUserId =
        toNonEmptyString(params.receiverUserId ?? params.receiver_user_id);
      const message = toNonEmptyString(params.message);
      const notificationTitle =
        toNonEmptyString(params.notificationTitle ?? params.notification_title) ||
        "New request";
      const notificationMessage =
        toNonEmptyString(params.notificationMessage ?? params.notification_message) ||
        message ||
        "You received a new request.";
      const notificationImage =
        toNonEmptyString(params.notificationImage ?? params.notification_image);
      const groupId = toNonEmptyString(params.groupId ?? params.group_id);
      const studioId = toNonEmptyString(params.studioId ?? params.studio_id);

      if (!receiverUserId || !message) {
        return jsonResponse({ error: "receiverUserId and message are required" }, 400);
      }

      const eventDetails = buildListingRequestEventDetails(params);

      const { data: requestRow, error: requestError } = await supabaseAdmin
        .from("booking_requests")
        .insert({
          sender_id: authUser.id,
          receiver_id: receiverUserId,
          group_id: groupId,
          studio_id: studioId,
          message,
          status: "pending",
          attachment_url: toNonEmptyString(params.attachmentUrl ?? params.attachment_url),
          event_details: eventDetails,
        })
        .select("id, created_at, sender_id, receiver_id, group_id, studio_id, status, event_details, attachment_url")
        .single();

      if (requestError) {
        return jsonResponse({ error: requestError.message }, 500);
      }

      try {
        await insertNotification(supabaseAdmin, {
          user_id: receiverUserId,
          type: "info",
          title: notificationTitle,
          message: notificationMessage,
          image: notificationImage,
          meta: {
            type: "listing_connection_request",
            request_id: requestRow?.id || null,
            sender_entity_type: eventDetails.sender_entity_type || null,
            sender_entity_id: eventDetails.sender_entity_id || null,
            sender_entity_name: eventDetails.sender_entity_name || null,
            receiver_entity_type: eventDetails.receiver_entity_type || null,
            receiver_entity_id: eventDetails.receiver_entity_id || null,
            receiver_entity_name: eventDetails.receiver_entity_name || null,
            group_id: groupId,
            studio_id: studioId,
            production_team_id: eventDetails.production_team_id || null,
            route: eventDetails.route || null,
            route_params: eventDetails.route_params || null,
          },
        });
      } catch (notificationError) {
        console.error("Failed to send listing request notification:", notificationError);
      }

      return jsonResponse({ success: true, request: requestRow });
    }

    if (action === "respond_to_listing_request") {
      const requestId = toNonEmptyString(params.request_id ?? params.requestId);
      const decision = String(params.decision || "").trim().toLowerCase();

      if (!requestId) {
        return jsonResponse({ error: "request_id is required" }, 400);
      }

      if (!["accepted", "declined"].includes(decision)) {
        return jsonResponse({ error: "decision must be accepted or declined" }, 400);
      }

      const { data: requestRow, error: requestError } = await supabaseAdmin
        .from("booking_requests")
        .select("id, sender_id, receiver_id, group_id, status, event_details")
        .eq("id", requestId)
        .maybeSingle();

      if (requestError) {
        return jsonResponse({ error: requestError.message }, 500);
      }

      if (!requestRow) {
        return jsonResponse({ error: "Request not found" }, 404);
      }

      if (isProductionTeamInviteRequest(requestRow)) {
        return jsonResponse(
          { error: "Use respond_to_production_team_invite for production team invites" },
          400,
        );
      }

      if (requestRow.status !== "pending") {
        return jsonResponse({ error: "This request is no longer pending" }, 409);
      }

      const groupRecord = await getGroupOwnerContext(
        supabaseAdmin,
        toNonEmptyString(requestRow.group_id),
      );

      const canRespond =
        requestRow.receiver_id === authUser.id ||
        (groupRecord?.owner_id && groupRecord.owner_id === authUser.id);

      if (!canRespond) {
        return jsonResponse({ error: "Only the request recipient can respond" }, 403);
      }

      const { data: updatedRequest, error: updateError } = await supabaseAdmin
        .from("booking_requests")
        .update({ status: decision })
        .eq("id", requestId)
        .eq("status", "pending")
        .select("id, status")
        .maybeSingle();

      if (updateError) {
        return jsonResponse({ error: updateError.message }, 500);
      }

      if (!updatedRequest) {
        return jsonResponse({ error: "This request is no longer pending" }, 409);
      }

      const eventDetails =
        requestRow.event_details && typeof requestRow.event_details === "object"
          ? requestRow.event_details
          : {};
      const responderName =
        toNonEmptyString(eventDetails.receiver_entity_name) ||
        groupRecord?.name ||
        "The recipient";
      const requestTypeLabel = String(
        eventDetails.sender_entity_type && eventDetails.receiver_entity_type
          ? `${eventDetails.sender_entity_type} request`
          : "connection request",
      ).toLowerCase();

      try {
        await insertNotification(supabaseAdmin, {
          user_id: requestRow.sender_id,
          type: "info",
          title: `${responderName} ${decision === "accepted" ? "accepted" : "declined"} your request`,
          message: `Your ${requestTypeLabel} was ${decision === "accepted" ? "accepted" : "declined"} by ${responderName}.`,
          meta: {
            type: "listing_connection_request_status",
            request_id: requestId,
            request_status: decision,
            sender_entity_type: eventDetails.sender_entity_type || null,
            sender_entity_name: eventDetails.sender_entity_name || null,
            receiver_entity_type: eventDetails.receiver_entity_type || null,
            receiver_entity_name: responderName,
            listing_id: eventDetails.listing_id || null,
            listing_type: eventDetails.listing_type || null,
            production_team_id: eventDetails.production_team_id || null,
            route: eventDetails.route || null,
            route_params: eventDetails.route_params || null,
          },
        });
      } catch (notificationError) {
        console.error(
          "Failed to send listing request status notification:",
          notificationError,
        );
      }

      return jsonResponse({ success: true, request: updatedRequest });
    }

    // ================================================================
    // PRODUCTION TEAM ACTIONS
    // ================================================================

    if (action === "create_production_team") {
      const { name, description, logo_url } = params;
      if (!name?.trim()) return jsonResponse({ error: "Team name is required" }, 400);

      const { data: team, error: teamErr } = await supabaseAdmin
        .from("production_teams")
        .insert({ owner_id: authUser.id, name: name.trim(), description, logo_url })
        .select()
        .single();

      if (teamErr) return jsonResponse({ error: teamErr.message }, 500);

      // Auto-add owner as member
      await supabaseAdmin.from("production_team_members").insert({
        team_id: team.id,
        user_id: authUser.id,
        role: "owner",
      });

      return jsonResponse({ success: true, team });
    }

    if (action === "add_team_member") {
      const { team_id, user_id, role } = params;
      if (!team_id || !user_id) return jsonResponse({ error: "team_id and user_id are required" }, 400);

      // Verify caller is owner/manager
      const { data: callerMember } = await supabaseAdmin
        .from("production_team_members")
        .select("role")
        .eq("team_id", team_id)
        .eq("user_id", authUser.id)
        .in("role", ["owner", "manager"])
        .maybeSingle();

      if (!callerMember) return jsonResponse({ error: "Only team owners or managers can add members" }, 403);

      const memberRole = role || "member";
      if (!["owner", "manager", "member"].includes(memberRole)) {
        return jsonResponse({ error: "Invalid role" }, 400);
      }

      const { data: member, error: memberErr } = await supabaseAdmin
        .from("production_team_members")
        .insert({ team_id, user_id, role: memberRole })
        .select()
        .single();

      if (memberErr) {
        if (memberErr.code === "23505") return jsonResponse({ error: "User is already a team member" }, 409);
        return jsonResponse({ error: memberErr.message }, 500);
      }

      return jsonResponse({ success: true, member });
    }

    if (action === "remove_team_member") {
      const { team_id, user_id } = params;
      if (!team_id || !user_id) return jsonResponse({ error: "team_id and user_id are required" }, 400);

      // Verify caller is owner/manager
      const { data: callerMember } = await supabaseAdmin
        .from("production_team_members")
        .select("role")
        .eq("team_id", team_id)
        .eq("user_id", authUser.id)
        .in("role", ["owner", "manager"])
        .maybeSingle();

      if (!callerMember) return jsonResponse({ error: "Only team owners or managers can remove members" }, 403);

      // Cannot remove the team owner
      const { data: targetMember } = await supabaseAdmin
        .from("production_team_members")
        .select("role")
        .eq("team_id", team_id)
        .eq("user_id", user_id)
        .maybeSingle();

      if (targetMember?.role === "owner") return jsonResponse({ error: "Cannot remove the team owner" }, 403);

      await supabaseAdmin
        .from("production_team_members")
        .delete()
        .eq("team_id", team_id)
        .eq("user_id", user_id);

      return jsonResponse({ success: true });
    }

    if (action === "respond_to_production_team_invite") {
      const request_id = params.request_id || params.requestId;
      const decision = String(params.decision || "").trim().toLowerCase();

      if (!request_id) {
        return jsonResponse({ error: "request_id is required" }, 400);
      }

      if (!["accepted", "declined"].includes(decision)) {
        return jsonResponse({ error: "decision must be accepted or declined" }, 400);
      }

      const { data: requestRow, error: requestError } = await supabaseAdmin
        .from("booking_requests")
        .select("id, sender_id, receiver_id, group_id, status, event_details")
        .eq("id", request_id)
        .maybeSingle();

      if (requestError) {
        return jsonResponse({ error: requestError.message }, 500);
      }

      if (!requestRow) {
        return jsonResponse({ error: "Invite request not found" }, 404);
      }

      if (!isProductionTeamInviteRequest(requestRow)) {
        return jsonResponse({ error: "Request is not a production team invite" }, 400);
      }

      if (requestRow.status !== "pending") {
        return jsonResponse({ error: "This invite is no longer pending" }, 409);
      }

      const eventDetails =
        requestRow.event_details && typeof requestRow.event_details === "object"
          ? requestRow.event_details
          : {};

      const productionTeamId =
        typeof eventDetails.production_team_id === "string" && eventDetails.production_team_id.length > 0
          ? eventDetails.production_team_id
          : typeof eventDetails.sender_entity_id === "string" && eventDetails.sender_entity_id.length > 0
            ? eventDetails.sender_entity_id
            : null;

      if (!productionTeamId) {
        return jsonResponse({ error: "Invite is missing a production team reference" }, 400);
      }

      let groupRecord: any = null;
      if (requestRow.group_id) {
        const { data: groupData, error: groupError } = await supabaseAdmin
          .from("groups")
          .select("id, owner_id, name, group_type")
          .eq("id", requestRow.group_id)
          .maybeSingle();

        if (groupError) {
          return jsonResponse({ error: groupError.message }, 500);
        }

        if (!groupData) {
          return jsonResponse({ error: "Invite group not found" }, 404);
        }

        groupRecord = groupData;
      }

      const canRespond =
        requestRow.receiver_id === authUser.id ||
        (groupRecord?.owner_id && groupRecord.owner_id === authUser.id);

      if (!canRespond) {
        return jsonResponse({ error: "Only the invite recipient can respond" }, 403);
      }

      let receiverProfile: any = null;
      let rosterAdded = false;
      let alreadyOnRoster = false;

      if (decision === "accepted") {
        if (requestRow.group_id) {
          const rosterKind = groupRecord?.group_type === "duo" ? "duo" : "group";

          const { error: rosterInsertError } = await supabaseAdmin
            .from("production_team_roster")
            .insert({
              team_id: productionTeamId,
              entity_kind: rosterKind,
              group_id: requestRow.group_id,
              added_by_user_id: authUser.id,
            });

          if (rosterInsertError) {
            if (rosterInsertError.code === "23505") {
              alreadyOnRoster = true;
            } else {
              return jsonResponse({ error: rosterInsertError.message }, 500);
            }
          } else {
            rosterAdded = true;
          }
        } else {
          const { data: profileData, error: profileError } = await supabaseAdmin
            .from("profiles")
            .select("id, full_name, role")
            .eq("id", requestRow.receiver_id)
            .maybeSingle();

          if (profileError) {
            return jsonResponse({ error: profileError.message }, 500);
          }

          if (!profileData) {
            return jsonResponse({ error: "Invitee profile not found" }, 404);
          }

          if ((profileData.role || "").toLowerCase() !== "musician") {
            return jsonResponse({ error: "Only musician profiles can accept solo invites" }, 400);
          }

          receiverProfile = profileData;

          const { error: rosterInsertError } = await supabaseAdmin
            .from("production_team_roster")
            .insert({
              team_id: productionTeamId,
              entity_kind: "musician",
              profile_id: requestRow.receiver_id,
              added_by_user_id: authUser.id,
            });

          if (rosterInsertError) {
            if (rosterInsertError.code === "23505") {
              alreadyOnRoster = true;
            } else {
              return jsonResponse({ error: rosterInsertError.message }, 500);
            }
          } else {
            rosterAdded = true;
          }
        }
      }

      const { data: updatedRequest, error: updateError } = await supabaseAdmin
        .from("booking_requests")
        .update({ status: decision })
        .eq("id", request_id)
        .eq("status", "pending")
        .select("id, status")
        .maybeSingle();

      if (updateError) {
        return jsonResponse({ error: updateError.message }, 500);
      }

      if (!updatedRequest) {
        return jsonResponse({ error: "This invite is no longer pending" }, 409);
      }

      const responderName =
        String(eventDetails.receiver_entity_name || "").trim() ||
        groupRecord?.name ||
        receiverProfile?.full_name ||
        "The recipient";

      await insertNotification(supabaseAdmin, {
        user_id: requestRow.sender_id,
        type: "info",
        title: `${responderName} ${decision === "accepted" ? "accepted" : "declined"} your request`,
        message: `Your production team invite was ${decision === "accepted" ? "accepted" : "declined"} by ${responderName}.`,
        meta: {
          type: "listing_connection_request_status",
          request_id,
          request_status: decision,
          sender_entity_type: eventDetails.sender_entity_type || null,
          sender_entity_name: eventDetails.sender_entity_name || null,
          receiver_entity_type: eventDetails.receiver_entity_type || null,
          receiver_entity_name: responderName,
          production_team_id: productionTeamId,
          route: "/production_team",
          route_params: { teamId: productionTeamId },
        },
      });

      return jsonResponse({
        success: true,
        request: updatedRequest,
        roster_added: rosterAdded,
        already_on_roster: alreadyOnRoster,
      });
    }

    if (action === "list_my_teams") {
      const { data: teams, error } = await supabaseAdmin
        .from("production_team_members")
        .select(`
          team_id,
          role,
          production_teams (
            id, name, description, logo_url, owner_id, created_at
          )
        `)
        .eq("user_id", authUser.id);

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ teams: teams?.map((t: any) => ({ ...t.production_teams, member_role: t.role })) || [] });
    }


    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (error: any) {
    console.error("[manage-production] Unhandled action error", {
      message: error?.message,
      stack: error?.stack,
    });
    return jsonResponse({ error: error?.message || "Internal server error" }, 500);
  }
});
