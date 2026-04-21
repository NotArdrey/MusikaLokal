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

/** Get or create a contextual 1-on-1 conversation linked to a deal, then insert a system message. */
async function insertDealSystemMessage(
  supabaseAdmin: any,
  dealId: string,
  userIdA: string,
  userIdB: string,
  messageContent: string,
) {
  // Find existing conversation for this deal
  let conversationId: string | null = null;

  const { data: existing } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("deal_id", dealId)
    .eq("is_group", false)
    .limit(1)
    .maybeSingle();

  if (existing) {
    conversationId = existing.id;
  } else {
    // Create a new conversation tied to this deal
    const newId = crypto.randomUUID();
    const { error: convErr } = await supabaseAdmin
      .from("conversations")
      .insert({ id: newId, is_group: false, deal_id: dealId });

    if (!convErr) {
      conversationId = newId;
      // Add both participants
      await supabaseAdmin.from("conversation_participants").upsert([
        { conversation_id: newId, user_id: userIdA, role: "owner" },
        { conversation_id: newId, user_id: userIdB, role: "member" },
      ], { onConflict: "conversation_id,user_id" });
    }
  }

  if (conversationId) {
    await supabaseAdmin.from("messages").insert({
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      sender_id: userIdA,
      content: messageContent,
      message_type: "system",
    });
  }
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

    // ================================================================
    // VENUE PARTNERSHIP DEAL ACTIONS
    // ================================================================

    if (action === "create_venue_partnership_deal") {
      const {
        venue_owner_id, production_team_id, gig_id, title,
        revenue_split_venue_pct, revenue_split_production_pct,
        fixed_fee, deposit_amount, event_date, event_notes,
        cancellation_notice_days, cancellation_penalty_pct, additional_terms,
      } = params;

      if (!venue_owner_id || !production_team_id || !title?.trim()) {
        return jsonResponse({ error: "venue_owner_id, production_team_id, and title are required" }, 400);
      }

      if (revenue_split_venue_pct == null || revenue_split_production_pct == null) {
        return jsonResponse({ error: "Revenue split percentages are required" }, 400);
      }

      if (Number(revenue_split_venue_pct) + Number(revenue_split_production_pct) !== 100) {
        return jsonResponse({ error: "Revenue split must total 100%" }, 400);
      }

      // Verify caller is team owner/manager or the venue owner
      const { data: teamMember } = await supabaseAdmin
        .from("production_team_members")
        .select("role")
        .eq("team_id", production_team_id)
        .eq("user_id", authUser.id)
        .in("role", ["owner", "manager"])
        .maybeSingle();

      const isVenueOwner = authUser.id === venue_owner_id;
      if (!teamMember && !isVenueOwner) {
        return jsonResponse({ error: "You must be a team manager/owner or the venue owner to create a deal" }, 403);
      }

      // Create the deal
      const { data: deal, error: dealErr } = await supabaseAdmin
        .from("venue_partnership_deals")
        .insert({
          venue_owner_id,
          production_team_id,
          gig_id: gig_id || null,
          title: title.trim(),
          status: "proposed",
          proposed_by_user_id: authUser.id,
        })
        .select()
        .single();

      if (dealErr) return jsonResponse({ error: dealErr.message }, 500);

      // Create the first term version
      const { data: termVersion, error: tvErr } = await supabaseAdmin
        .from("deal_term_versions")
        .insert({
          deal_id: deal.id,
          version_number: 1,
          revenue_split_venue_pct: Number(revenue_split_venue_pct),
          revenue_split_production_pct: Number(revenue_split_production_pct),
          fixed_fee: Number(fixed_fee || 0),
          deposit_amount: Number(deposit_amount || 0),
          event_date: event_date || null,
          event_notes: event_notes || null,
          cancellation_notice_days: cancellation_notice_days ?? 7,
          cancellation_penalty_pct: Number(cancellation_penalty_pct || 0),
          additional_terms: additional_terms || {},
          proposed_by_user_id: authUser.id,
        })
        .select()
        .single();

      if (tvErr) return jsonResponse({ error: tvErr.message }, 500);

      // Record proposal event
      await supabaseAdmin.from("deal_negotiation_events").insert({
        deal_id: deal.id,
        event_type: "proposal",
        actor_user_id: authUser.id,
        term_version_id: termVersion.id,
        notes: "Initial proposal",
      });

      // Notify the other party
      const notifyUserId = isVenueOwner ? null : venue_owner_id;
      if (notifyUserId) {
        await insertNotification(supabaseAdmin, {
          user_id: notifyUserId,
          type: "info",
          title: "New Partnership Proposal",
          message: `You received a venue partnership proposal: "${title.trim()}"`,
          meta: { event_type: "deal_proposal", deal_id: deal.id },
        });
      }

      // Create conversation with system message
      await insertDealSystemMessage(
        supabaseAdmin,
        deal.id,
        authUser.id,
        venue_owner_id,
        `📋 New partnership proposal: "${title.trim()}" — Revenue split: Venue ${revenue_split_venue_pct}% / Production ${revenue_split_production_pct}%`,
      );

      return jsonResponse({ success: true, deal, term_version: termVersion });
    }

    if (action === "counter_venue_partnership_deal") {
      const {
        deal_id, revenue_split_venue_pct, revenue_split_production_pct,
        fixed_fee, deposit_amount, event_date, event_notes,
        cancellation_notice_days, cancellation_penalty_pct, additional_terms, notes,
      } = params;

      if (!deal_id) return jsonResponse({ error: "deal_id is required" }, 400);

      // Fetch the deal
      const { data: deal, error: dealErr } = await supabaseAdmin
        .from("venue_partnership_deals")
        .select("*")
        .eq("id", deal_id)
        .single();

      if (dealErr || !deal) return jsonResponse({ error: "Deal not found" }, 404);

      if (!["proposed", "countered"].includes(deal.status)) {
        return jsonResponse({ error: "Deal is not in a negotiable state" }, 400);
      }

      // Verify participation
      const { data: teamMember } = await supabaseAdmin
        .from("production_team_members")
        .select("role")
        .eq("team_id", deal.production_team_id)
        .eq("user_id", authUser.id)
        .in("role", ["owner", "manager"])
        .maybeSingle();

      const isVenueOwner = authUser.id === deal.venue_owner_id;
      if (!teamMember && !isVenueOwner) {
        return jsonResponse({ error: "Not authorized to counter this deal" }, 403);
      }

      if (Number(revenue_split_venue_pct) + Number(revenue_split_production_pct) !== 100) {
        return jsonResponse({ error: "Revenue split must total 100%" }, 400);
      }

      // Get next version number
      const { data: maxVersion } = await supabaseAdmin
        .from("deal_term_versions")
        .select("version_number")
        .eq("deal_id", deal_id)
        .order("version_number", { ascending: false })
        .limit(1)
        .single();

      const nextVersion = (maxVersion?.version_number || 0) + 1;

      // Create new term version
      const { data: termVersion, error: tvErr } = await supabaseAdmin
        .from("deal_term_versions")
        .insert({
          deal_id,
          version_number: nextVersion,
          revenue_split_venue_pct: Number(revenue_split_venue_pct),
          revenue_split_production_pct: Number(revenue_split_production_pct),
          fixed_fee: Number(fixed_fee || 0),
          deposit_amount: Number(deposit_amount || 0),
          event_date: event_date || null,
          event_notes: event_notes || null,
          cancellation_notice_days: cancellation_notice_days ?? 7,
          cancellation_penalty_pct: Number(cancellation_penalty_pct || 0),
          additional_terms: additional_terms || {},
          proposed_by_user_id: authUser.id,
        })
        .select()
        .single();

      if (tvErr) return jsonResponse({ error: tvErr.message }, 500);

      // Update deal status
      await supabaseAdmin
        .from("venue_partnership_deals")
        .update({ status: "countered" })
        .eq("id", deal_id);

      // Record event
      await supabaseAdmin.from("deal_negotiation_events").insert({
        deal_id,
        event_type: "counteroffer",
        actor_user_id: authUser.id,
        term_version_id: termVersion.id,
        notes: notes || "Counteroffer submitted",
      });

      // Notify other party
      const notifyUserId = isVenueOwner
        ? null // If venue owner is countering, notify production team
        : deal.venue_owner_id;
      // For team-side counter, notify venue owner
      if (!isVenueOwner) {
        await insertNotification(supabaseAdmin, {
          user_id: deal.venue_owner_id,
          type: "info",
          title: "Deal Counteroffer",
          message: `A counteroffer was submitted for deal: "${deal.title}"`,
          meta: { event_type: "deal_counteroffer", deal_id },
        });
      }
      // For venue-side counter, notify production team owner
      if (isVenueOwner) {
        const { data: teamOwner } = await supabaseAdmin
          .from("production_teams")
          .select("owner_id")
          .eq("id", deal.production_team_id)
          .single();

        if (teamOwner) {
          await insertNotification(supabaseAdmin, {
            user_id: teamOwner.owner_id,
            type: "info",
            title: "Deal Counteroffer",
            message: `The venue owner submitted a counteroffer for: "${deal.title}"`,
            meta: { event_type: "deal_counteroffer", deal_id },
          });
        }
      }

      return jsonResponse({ success: true, term_version: termVersion });
    }

    if (action === "accept_venue_partnership_deal") {
      const { deal_id, term_version_id } = params;
      if (!deal_id || !term_version_id) {
        return jsonResponse({ error: "deal_id and term_version_id are required" }, 400);
      }

      // Use the database function for safe acceptance
      const { data, error } = await supabaseAdmin.rpc("mark_deal_terms_accepted", {
        p_deal_id: deal_id,
        p_term_version_id: term_version_id,
        p_accepted_by_user_id: authUser.id,
      });

      if (error) return jsonResponse({ error: error.message }, 500);
      if (data?.error) return jsonResponse({ error: data.error }, 400);

      // Fetch deal for notification
      const { data: deal } = await supabaseAdmin
        .from("venue_partnership_deals")
        .select("*, production_teams(owner_id)")
        .eq("id", deal_id)
        .single();

      if (deal) {
        // Notify both parties
        const notifyUsers = [deal.venue_owner_id, deal.production_teams?.owner_id].filter(
          (uid: string) => uid && uid !== authUser.id,
        );
        for (const uid of notifyUsers) {
          await insertNotification(supabaseAdmin, {
            user_id: uid,
            type: "success",
            title: "Deal Accepted",
            message: `Partnership deal "${deal.title}" has been accepted!`,
            meta: { event_type: "deal_accepted", deal_id },
          });
        }

        // System message in deal conversation
        const otherPartyId = deal.venue_owner_id === authUser.id
          ? deal.production_teams?.owner_id
          : deal.venue_owner_id;
        if (otherPartyId) {
          await insertDealSystemMessage(
            supabaseAdmin,
            deal_id,
            authUser.id,
            otherPartyId,
            `✅ Deal "${deal.title}" has been accepted! Terms are now locked.`,
          );
        }
      }

      return jsonResponse({ success: true, ...data });
    }

    if (action === "reject_venue_partnership_deal") {
      const { deal_id, notes } = params;
      if (!deal_id) return jsonResponse({ error: "deal_id is required" }, 400);

      const { data: deal } = await supabaseAdmin
        .from("venue_partnership_deals")
        .select("*")
        .eq("id", deal_id)
        .single();

      if (!deal) return jsonResponse({ error: "Deal not found" }, 404);

      if (!["proposed", "countered"].includes(deal.status)) {
        return jsonResponse({ error: "Deal cannot be rejected in its current state" }, 400);
      }

      // Verify participation
      const { data: teamMember } = await supabaseAdmin
        .from("production_team_members")
        .select("role")
        .eq("team_id", deal.production_team_id)
        .eq("user_id", authUser.id)
        .in("role", ["owner", "manager"])
        .maybeSingle();

      const isVenueOwner = authUser.id === deal.venue_owner_id;
      if (!teamMember && !isVenueOwner) {
        return jsonResponse({ error: "Not authorized to reject this deal" }, 403);
      }

      await supabaseAdmin
        .from("venue_partnership_deals")
        .update({ status: "rejected" })
        .eq("id", deal_id);

      await supabaseAdmin.from("deal_negotiation_events").insert({
        deal_id,
        event_type: "rejection",
        actor_user_id: authUser.id,
        notes: notes || "Deal rejected",
      });

      // Notify other party
      const { data: teamOwner } = await supabaseAdmin
        .from("production_teams")
        .select("owner_id")
        .eq("id", deal.production_team_id)
        .single();

      const notifyUsers = [deal.venue_owner_id, teamOwner?.owner_id].filter(
        (uid: string) => uid && uid !== authUser.id,
      );
      for (const uid of notifyUsers) {
        await insertNotification(supabaseAdmin, {
          user_id: uid,
          type: "warning",
          title: "Deal Rejected",
          message: `Partnership deal "${deal.title}" was rejected.`,
          meta: { event_type: "deal_rejected", deal_id },
        });
      }

      return jsonResponse({ success: true });
    }

    // ================================================================
    // RECORDING DEAL ACTIONS
    // ================================================================

    if (action === "create_recording_deal") {
      const { studio_id, counterparty_id, title, valid_from, valid_until, notes, packages } = params;

      if (!studio_id || !counterparty_id || !title?.trim()) {
        return jsonResponse({ error: "studio_id, counterparty_id, and title are required" }, 400);
      }

      // Verify caller owns the studio or is the counterparty
      const { data: studio } = await supabaseAdmin
        .from("studios")
        .select("owner_id")
        .eq("id", studio_id)
        .single();

      if (!studio) return jsonResponse({ error: "Studio not found" }, 404);

      const isStudioOwner = studio.owner_id === authUser.id;
      const isCounterparty = counterparty_id === authUser.id;

      if (!isStudioOwner && !isCounterparty) {
        return jsonResponse({ error: "You must be the studio owner or the counterparty" }, 403);
      }

      const { data: deal, error: dealErr } = await supabaseAdmin
        .from("studio_recording_deals")
        .insert({
          studio_id,
          counterparty_id,
          title: title.trim(),
          proposed_by_user_id: authUser.id,
          valid_from: valid_from || null,
          valid_until: valid_until || null,
          notes: notes || null,
        })
        .select()
        .single();

      if (dealErr) return jsonResponse({ error: dealErr.message }, 500);

      // Add packages if provided
      if (Array.isArray(packages) && packages.length > 0) {
        const packageRows = packages.map((pkg: any, idx: number) => ({
          deal_id: deal.id,
          name: pkg.name || `Package ${idx + 1}`,
          hours_included: Number(pkg.hours_included),
          songs_included: pkg.songs_included ? Number(pkg.songs_included) : null,
          price: Number(pkg.price),
          max_sessions: pkg.max_sessions ? Number(pkg.max_sessions) : null,
          description: pkg.description || null,
          sort_order: idx,
        }));

        await supabaseAdmin.from("recording_deal_packages").insert(packageRows);
      }

      // Notify the other party
      const notifyUserId = isStudioOwner ? counterparty_id : studio.owner_id;
      await insertNotification(supabaseAdmin, {
        user_id: notifyUserId,
        type: "info",
        title: "New Recording Deal Proposal",
        message: `You received a recording deal proposal: "${title.trim()}"`,
        meta: { event_type: "recording_deal_proposal", deal_id: deal.id },
      });

      return jsonResponse({ success: true, deal });
    }

    if (action === "add_recording_package") {
      const { deal_id, name, hours_included, songs_included, price, max_sessions, description } = params;

      if (!deal_id || !name?.trim() || !hours_included || price == null) {
        return jsonResponse({ error: "deal_id, name, hours_included, and price are required" }, 400);
      }

      // Verify caller owns the studio for this deal
      const { data: deal } = await supabaseAdmin
        .from("studio_recording_deals")
        .select("studio_id, studios(owner_id)")
        .eq("id", deal_id)
        .single();

      if (!deal) return jsonResponse({ error: "Deal not found" }, 404);
      if ((deal as any).studios?.owner_id !== authUser.id) {
        return jsonResponse({ error: "Only the studio owner can add packages" }, 403);
      }

      // Get next sort order
      const { data: maxSort } = await supabaseAdmin
        .from("recording_deal_packages")
        .select("sort_order")
        .eq("deal_id", deal_id)
        .order("sort_order", { ascending: false })
        .limit(1)
        .single();

      const { data: pkg, error: pkgErr } = await supabaseAdmin
        .from("recording_deal_packages")
        .insert({
          deal_id,
          name: name.trim(),
          hours_included: Number(hours_included),
          songs_included: songs_included ? Number(songs_included) : null,
          price: Number(price),
          max_sessions: max_sessions ? Number(max_sessions) : null,
          description: description || null,
          sort_order: (maxSort?.sort_order ?? -1) + 1,
        })
        .select()
        .single();

      if (pkgErr) return jsonResponse({ error: pkgErr.message }, 500);
      return jsonResponse({ success: true, package: pkg });
    }

    if (action === "accept_recording_deal") {
      const { deal_id } = params;
      if (!deal_id) return jsonResponse({ error: "deal_id is required" }, 400);

      const { data: deal } = await supabaseAdmin
        .from("studio_recording_deals")
        .select("*, studios(owner_id)")
        .eq("id", deal_id)
        .single();

      if (!deal) return jsonResponse({ error: "Deal not found" }, 404);
      if (deal.status !== "proposed") return jsonResponse({ error: "Deal is not in proposed state" }, 400);

      // Must be accepted by the other party (not the proposer)
      if (deal.proposed_by_user_id === authUser.id) {
        return jsonResponse({ error: "Cannot accept your own proposal" }, 400);
      }

      const isStudioOwner = (deal as any).studios?.owner_id === authUser.id;
      const isCounterparty = deal.counterparty_id === authUser.id;

      if (!isStudioOwner && !isCounterparty) {
        return jsonResponse({ error: "Not authorized to accept this deal" }, 403);
      }

      await supabaseAdmin
        .from("studio_recording_deals")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", deal_id);

      // Notify the proposer
      await insertNotification(supabaseAdmin, {
        user_id: deal.proposed_by_user_id,
        type: "success",
        title: "Recording Deal Accepted",
        message: `Your recording deal "${deal.title}" has been accepted!`,
        meta: { event_type: "recording_deal_accepted", deal_id },
      });

      return jsonResponse({ success: true });
    }

    // ================================================================
    // DEAL LISTING AND DETAIL ACTIONS
    // ================================================================

    if (action === "list_my_deals") {
      const { deal_type, status } = params;

      const results: Record<string, any> = {};

      // Venue partnership deals
      if (!deal_type || deal_type === "venue_partnership") {
        let query = supabaseAdmin
          .from("venue_partnership_deals")
          .select(`
            *, production_teams(id, name, logo_url),
            deal_term_versions(id, version_number, revenue_split_venue_pct, revenue_split_production_pct, fixed_fee, deposit_amount, event_date, created_at)
          `)
          .or(`venue_owner_id.eq.${authUser.id},production_team_id.in.(${
            `SELECT team_id FROM production_team_members WHERE user_id = '${authUser.id}'`
          })`)
          .order("updated_at", { ascending: false });

        if (status) query = query.eq("status", status);

        // Fallback: query by venue owner and by team membership separately
        const { data: venueDeals } = await supabaseAdmin
          .from("venue_partnership_deals")
          .select(`
            *, production_teams(id, name, logo_url)
          `)
          .eq("venue_owner_id", authUser.id)
          .order("updated_at", { ascending: false });

        const { data: myTeams } = await supabaseAdmin
          .from("production_team_members")
          .select("team_id")
          .eq("user_id", authUser.id);

        const teamIds = myTeams?.map((t: any) => t.team_id) || [];

        let teamDeals: any[] = [];
        if (teamIds.length > 0) {
          const { data: tDeals } = await supabaseAdmin
            .from("venue_partnership_deals")
            .select(`
              *, production_teams(id, name, logo_url)
            `)
            .in("production_team_id", teamIds)
            .order("updated_at", { ascending: false });
          teamDeals = tDeals || [];
        }

        // Merge and deduplicate
        const allDeals = [...(venueDeals || []), ...teamDeals];
        const seen = new Set<string>();
        const deduped = allDeals.filter((d: any) => {
          if (seen.has(d.id)) return false;
          seen.add(d.id);
          return status ? d.status === status : true;
        });

        results.venue_partnerships = deduped;
      }

      // Recording deals
      if (!deal_type || deal_type === "recording") {
        const { data: studioIds } = await supabaseAdmin
          .from("studios")
          .select("id")
          .eq("owner_id", authUser.id);

        const sIds = studioIds?.map((s: any) => s.id) || [];

        let ownerDeals: any[] = [];
        if (sIds.length > 0) {
          const { data: oDeals } = await supabaseAdmin
            .from("studio_recording_deals")
            .select(`
              *, studios(id, name), recording_deal_packages(id, name, hours_included, songs_included, price)
            `)
            .in("studio_id", sIds)
            .order("updated_at", { ascending: false });
          ownerDeals = oDeals || [];
        }

        const { data: counterpartyDeals } = await supabaseAdmin
          .from("studio_recording_deals")
          .select(`
            *, studios(id, name), recording_deal_packages(id, name, hours_included, songs_included, price)
          `)
          .eq("counterparty_id", authUser.id)
          .order("updated_at", { ascending: false });

        const allRecDeals = [...ownerDeals, ...(counterpartyDeals || [])];
        const seenRec = new Set<string>();
        const dedupedRec = allRecDeals.filter((d: any) => {
          if (seenRec.has(d.id)) return false;
          seenRec.add(d.id);
          return status ? d.status === status : true;
        });

        results.recording_deals = dedupedRec;
      }

      return jsonResponse({ success: true, deals: results });
    }

    if (action === "get_deal_details") {
      const { deal_id, deal_type } = params;
      if (!deal_id) return jsonResponse({ error: "deal_id is required" }, 400);

      if (deal_type === "recording") {
        const { data: deal, error } = await supabaseAdmin
          .from("studio_recording_deals")
          .select(`
            *,
            studios(id, name, hourly_rate, owner_id),
            recording_deal_packages(*)
          `)
          .eq("id", deal_id)
          .single();

        if (error || !deal) return jsonResponse({ error: "Deal not found" }, 404);

        // Get counterparty profile
        const { data: counterparty } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, avatar_url")
          .eq("id", deal.counterparty_id)
          .single();

        return jsonResponse({
          success: true,
          deal: { ...deal, counterparty },
          deal_type: "recording",
        });
      }

      // Default: venue partnership
      const { data: deal, error } = await supabaseAdmin
        .from("venue_partnership_deals")
        .select(`
          *,
          production_teams(id, name, logo_url, owner_id),
          deal_term_versions(*),
          deal_negotiation_events(*)
        `)
        .eq("id", deal_id)
        .single();

      if (error || !deal) return jsonResponse({ error: "Deal not found" }, 404);

      // Get venue owner profile
      const { data: venueOwner } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, avatar_url")
        .eq("id", deal.venue_owner_id)
        .single();

      // Get team members
      const { data: teamMembers } = await supabaseAdmin
        .from("production_team_members")
        .select("user_id, role, profiles(id, full_name, avatar_url)")
        .eq("team_id", deal.production_team_id);

      return jsonResponse({
        success: true,
        deal: { ...deal, venue_owner: venueOwner, team_members: teamMembers },
        deal_type: "venue_partnership",
      });
    }

    // ================================================================
    // SETTLEMENT AND DISPUTE ACTIONS
    // ================================================================

    if (action === "mark_settlement_paid") {
      const { deal_id, gross_revenue, notes } = params;
      if (!deal_id || gross_revenue == null) {
        return jsonResponse({ error: "deal_id and gross_revenue are required" }, 400);
      }

      const { data: deal } = await supabaseAdmin
        .from("venue_partnership_deals")
        .select("*, production_teams(owner_id)")
        .eq("id", deal_id)
        .single();

      if (!deal) return jsonResponse({ error: "Deal not found" }, 404);
      if (deal.status !== "accepted") return jsonResponse({ error: "Deal must be accepted to settle" }, 400);

      // Only venue owner can mark as settled
      if (deal.venue_owner_id !== authUser.id) {
        return jsonResponse({ error: "Only the venue owner can mark settlement as paid" }, 403);
      }

      // Calculate settlement
      const { data: settlement, error: settErr } = await supabaseAdmin.rpc("calculate_deal_settlement", {
        p_deal_id: deal_id,
        p_deal_type: "venue_partnership",
        p_gross_revenue: Number(gross_revenue),
      });

      if (settErr) return jsonResponse({ error: settErr.message }, 500);
      if (settlement?.error) return jsonResponse({ error: settlement.error }, 400);

      // Update deal status
      await supabaseAdmin
        .from("venue_partnership_deals")
        .update({ status: "settled", settled_at: new Date().toISOString() })
        .eq("id", deal_id);

      // Record event
      await supabaseAdmin.from("deal_negotiation_events").insert({
        deal_id,
        event_type: "settlement_update",
        actor_user_id: authUser.id,
        notes: notes || "Settlement marked as paid",
        metadata: settlement,
      });

      // Notify production team owner
      const productionOwnerId = deal.production_teams?.owner_id;
      if (productionOwnerId && productionOwnerId !== authUser.id) {
        await insertNotification(supabaseAdmin, {
          user_id: productionOwnerId,
          type: "success",
          title: "Settlement Paid",
          message: `The settlement for "${deal.title}" has been marked as paid.`,
          meta: { event_type: "deal_settled", deal_id },
        });

        // System message in deal conversation
        await insertDealSystemMessage(
          supabaseAdmin,
          deal_id,
          authUser.id,
          productionOwnerId,
          `💰 Settlement for "${deal.title}" marked as paid. Gross revenue: ₱${Number(gross_revenue).toLocaleString()}`,
        );
      }

      return jsonResponse({ success: true, settlement });
    }

    if (action === "raise_deal_dispute") {
      const { deal_id, notes } = params;
      if (!deal_id) return jsonResponse({ error: "deal_id is required" }, 400);

      const { data: deal } = await supabaseAdmin
        .from("venue_partnership_deals")
        .select("*, production_teams(owner_id)")
        .eq("id", deal_id)
        .single();

      if (!deal) return jsonResponse({ error: "Deal not found" }, 404);
      if (!["accepted", "settled"].includes(deal.status)) {
        return jsonResponse({ error: "Can only dispute accepted or settled deals" }, 400);
      }

      // Verify deal participant
      const { data: teamMember } = await supabaseAdmin
        .from("production_team_members")
        .select("role")
        .eq("team_id", deal.production_team_id)
        .eq("user_id", authUser.id)
        .maybeSingle();

      if (!teamMember && authUser.id !== deal.venue_owner_id) {
        return jsonResponse({ error: "Not authorized" }, 403);
      }

      await supabaseAdmin
        .from("venue_partnership_deals")
        .update({ status: "disputed" })
        .eq("id", deal_id);

      await supabaseAdmin.from("deal_negotiation_events").insert({
        deal_id,
        event_type: "dispute_raised",
        actor_user_id: authUser.id,
        notes: notes || "Dispute raised",
      });

      // Notify all parties
      const notifyUsers = [deal.venue_owner_id, deal.production_teams?.owner_id].filter(
        (uid: string) => uid && uid !== authUser.id,
      );
      for (const uid of notifyUsers) {
        await insertNotification(supabaseAdmin, {
          user_id: uid,
          type: "error",
          title: "Deal Disputed",
          message: `A dispute was raised for deal: "${deal.title}"`,
          meta: { event_type: "deal_disputed", deal_id },
        });
      }

      return jsonResponse({ success: true });
    }

    // ================================================================
    // CANCELLATION POLICY ACTIONS
    // ================================================================

    if (action === "create_cancellation_policy") {
      const {
        studio_id, name, full_refund_hours_before, partial_refund_hours_before,
        partial_refund_pct, no_show_penalty_pct, late_cancel_penalty_pct,
      } = params;

      if (!studio_id) return jsonResponse({ error: "studio_id is required" }, 400);

      // Verify studio ownership
      const { data: studio } = await supabaseAdmin
        .from("studios")
        .select("owner_id")
        .eq("id", studio_id)
        .single();

      if (!studio || studio.owner_id !== authUser.id) {
        return jsonResponse({ error: "Not authorized" }, 403);
      }

      // Deactivate other policies for this studio
      await supabaseAdmin
        .from("booking_cancellation_policies")
        .update({ is_active: false })
        .eq("studio_id", studio_id)
        .eq("is_active", true);

      const { data: policy, error: pErr } = await supabaseAdmin
        .from("booking_cancellation_policies")
        .insert({
          studio_id,
          name: name || "Standard Policy",
          full_refund_hours_before: full_refund_hours_before ?? 48,
          partial_refund_hours_before: partial_refund_hours_before ?? 24,
          partial_refund_pct: partial_refund_pct ?? 50,
          no_show_penalty_pct: no_show_penalty_pct ?? 100,
          late_cancel_penalty_pct: late_cancel_penalty_pct ?? 50,
          is_active: true,
        })
        .select()
        .single();

      if (pErr) return jsonResponse({ error: pErr.message }, 500);
      return jsonResponse({ success: true, policy });
    }

    if (action === "get_cancellation_policy") {
      const { studio_id } = params;
      if (!studio_id) return jsonResponse({ error: "studio_id is required" }, 400);

      const { data: policy } = await supabaseAdmin
        .from("booking_cancellation_policies")
        .select("*")
        .eq("studio_id", studio_id)
        .eq("is_active", true)
        .maybeSingle();

      return jsonResponse({ success: true, policy });
    }

    if (action === "calculate_cancellation_preview") {
      const { booking_id } = params;
      if (!booking_id) return jsonResponse({ error: "booking_id is required" }, 400);

      const { data: result, error } = await supabaseAdmin.rpc(
        "calculate_booking_cancellation_penalty",
        { p_booking_id: booking_id },
      );

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, ...result });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err: any) {
    return jsonResponse({ error: err?.message || "Internal server error" }, 500);
  }
});
