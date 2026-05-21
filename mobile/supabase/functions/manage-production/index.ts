// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  withNotificationRouteMeta,
  withNotificationSeverityType,
} from "../_shared/notificationRoutes.ts";
import { scheduleCoreActionEmailForNotification } from "../_shared/coreActionEmail.ts";

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

async function getProfileRole(supabaseAdmin: any, userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  return typeof data?.role === "string" ? data.role.trim().toLowerCase() : null;
}

function isMissingTableError(error: any, tableName: string) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  const normalizedTable = tableName.toLowerCase();

  return (
    (code === "42P01" && message.includes(normalizedTable)) ||
    (code === "PGRST205" && message.includes(normalizedTable))
  );
}

async function getProductionStaffAccessLevel(supabaseAdmin: any, teamId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("staff_listing_access")
    .select("access_level")
    .eq("staff_user_id", userId)
    .eq("entity_type", "production")
    .eq("production_team_id", teamId)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error, "staff_listing_access")) return null;
    throw error;
  }

  return data?.access_level ? Number(data.access_level) : null;
}

async function getProductionEditorAccess(supabaseAdmin: any, teamId: string, userId: string) {
  const membership = await getTeamManagerMembership(supabaseAdmin, teamId, userId);
  if (membership) return { role: membership.role || "manager", staff_access_level: null };

  const staffAccessLevel = await getProductionStaffAccessLevel(supabaseAdmin, teamId, userId);
  if (staffAccessLevel === 1) {
    return { role: "staff_level_1", staff_access_level: staffAccessLevel };
  }

  return null;
}

async function getTeamManagerMembership(supabaseAdmin: any, teamId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from("production_team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .in("role", ["owner", "manager"])
    .maybeSingle();

  if (data) {
    return data;
  }

  const { data: ownedTeam, error: ownedTeamError } = await supabaseAdmin
    .from("production_teams")
    .select("id")
    .eq("id", teamId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (ownedTeamError) {
    throw ownedTeamError;
  }

  return ownedTeam ? { role: "owner" } : null;
}

async function getTeamRosterEntries(supabaseAdmin: any, teamId: string) {
  const { data, error } = await supabaseAdmin
    .from("production_team_roster")
    .select(`
      id,
      team_id,
      entity_kind,
      profile_id,
      group_id,
      created_at,
      profile:profile_id(id, full_name, avatar_url, role, email),
      group:group_id(id, name, group_type, genre, owner_id)
    `)
    .eq("team_id", teamId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  const groupIds = Array.from(
    new Set(
      (data || [])
        .map((entry: any) => entry.group_id)
        .filter((groupId: unknown): groupId is string => typeof groupId === "string" && groupId.length > 0),
    ),
  );
  const groupImagesById = new Map<string, string[]>();

  if (groupIds.length > 0) {
    const { data: groupProjections, error: groupProjectionError } = await supabaseAdmin
      .from("groups_legacy_projection")
      .select("id, images")
      .in("id", groupIds);

    if (groupProjectionError) {
      throw groupProjectionError;
    }

    (groupProjections || []).forEach((groupProjection: any) => {
      groupImagesById.set(
        groupProjection.id,
        Array.isArray(groupProjection.images) ? groupProjection.images : [],
      );
    });
  }

  return (data || []).map((entry: any) => {
    const groupImages = groupImagesById.get(entry.group_id) || [];
    const group = entry.group ? { ...entry.group, images: groupImages } : null;

    return {
      id: entry.id,
      team_id: entry.team_id,
      entity_kind: entry.entity_kind,
      profile_id: entry.profile_id,
      group_id: entry.group_id,
      created_at: entry.created_at,
      profile: entry.profile || null,
      group,
      display_name:
        entry.profile?.full_name || group?.name || "Unknown performer",
      avatar_url:
        entry.profile?.avatar_url || groupImages[0] || null,
      group_type: group?.group_type || null,
    };
  });
}

async function getGroupIdsOwnedByUser(supabaseAdmin: any, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("groups")
    .select("id")
    .eq("owner_id", userId);

  if (error) {
    throw error;
  }

  return (data || [])
    .map((group: any) => toNonEmptyString(group?.id))
    .filter((groupId: string | null): groupId is string => Boolean(groupId));
}

async function removeProductionRosterForFiredMember(
  supabaseAdmin: any,
  params: {
    teamId: string;
    userId: string;
    ownedGroupIds: string[];
    reason?: string | null;
  },
) {
  const { teamId, userId, ownedGroupIds, reason } = params;
  const rosterIdsToRemove: string[] = [];

  const { data: soloRows, error: soloSelectError } = await supabaseAdmin
    .from("production_team_roster")
    .select("id")
    .eq("team_id", teamId)
    .eq("profile_id", userId);

  if (soloSelectError) {
    throw soloSelectError;
  }

  rosterIdsToRemove.push(
    ...(soloRows || [])
      .map((row: any) => toNonEmptyString(row?.id))
      .filter((id: string | null): id is string => Boolean(id)),
  );

  if (ownedGroupIds.length > 0) {
    const { data: groupRows, error: groupSelectError } = await supabaseAdmin
      .from("production_team_roster")
      .select("id")
      .eq("team_id", teamId)
      .in("group_id", ownedGroupIds);

    if (groupSelectError) {
      throw groupSelectError;
    }

    rosterIdsToRemove.push(
      ...(groupRows || [])
        .map((row: any) => toNonEmptyString(row?.id))
        .filter((id: string | null): id is string => Boolean(id)),
    );
  }

  const uniqueRosterIds = Array.from(new Set(rosterIdsToRemove));
  const firedApplicationCount = await fireActiveProductionRosterApplications(
    supabaseAdmin,
    {
      teamId,
      rosterIds: uniqueRosterIds,
      reason,
    },
  );

  let removedCount = 0;

  if (uniqueRosterIds.length > 0) {
    const { data: removedRows, error: deleteError } = await supabaseAdmin
      .from("production_team_roster")
      .delete()
      .eq("team_id", teamId)
      .in("id", uniqueRosterIds)
      .select("id");

    if (deleteError) {
      throw deleteError;
    }

    removedCount = removedRows?.length || 0;
  }

  return { removedCount, firedApplicationCount };
}

async function fireActiveProductionRosterApplications(
  supabaseAdmin: any,
  params: {
    teamId: string;
    rosterIds: string[];
    reason?: string | null;
  },
) {
  const { teamId, rosterIds, reason } = params;
  const uniqueRosterIds = Array.from(new Set(rosterIds.filter(Boolean)));

  if (uniqueRosterIds.length === 0) {
    return 0;
  }

  const cancellationReason =
    toNonEmptyString(reason) || "Removed from production roster by the production team.";

  const { data, error } = await supabaseAdmin
    .from("gig_applications")
    .update({
      status: "fired",
      cancellation_reason: cancellationReason,
      updated_at: new Date().toISOString(),
    })
    .eq("production_team_id", teamId)
    .in("production_roster_id", uniqueRosterIds)
    .eq("status", "accepted")
    .select("id");

  if (error) {
    throw error;
  }

  return data?.length || 0;
}

async function retireAcceptedProductionInviteRequests(
  supabaseAdmin: any,
  params: {
    teamId: string;
    profileId?: string | null;
    groupIds?: string[];
  },
) {
  const { teamId, profileId, groupIds = [] } = params;
  let retiredCount = 0;
  const retiredStatuses = ["accepted", "approved", "connected"];
  const inviteDetails = {
    production_team_id: teamId,
    sender_entity_type: "production_team",
    request_kind: "invite",
  };

  if (profileId) {
    const { data: retiredProfileRows, error: profileUpdateError } = await supabaseAdmin
      .from("booking_requests")
      .update({ status: "cancelled" })
      .eq("receiver_id", profileId)
      .is("group_id", null)
      .in("status", retiredStatuses)
      .contains("event_details", inviteDetails)
      .select("id");

    if (profileUpdateError) {
      throw profileUpdateError;
    }

    retiredCount += retiredProfileRows?.length || 0;
  }

  if (groupIds.length > 0) {
    const { data: retiredGroupRows, error: groupUpdateError } = await supabaseAdmin
      .from("booking_requests")
      .update({ status: "cancelled" })
      .in("group_id", groupIds)
      .in("status", retiredStatuses)
      .contains("event_details", inviteDetails)
      .select("id");

    if (groupUpdateError) {
      throw groupUpdateError;
    }

    retiredCount += retiredGroupRows?.length || 0;
  }

  return retiredCount;
}

async function ensureAccessibleGroupForRoster(
  supabaseAdmin: any,
  groupId: string,
  userId: string,
) {
  const { data: group, error: groupError } = await supabaseAdmin
    .from("groups")
    .select("id, name, owner_id, group_type")
    .eq("id", groupId)
    .maybeSingle();

  if (groupError) {
    throw groupError;
  }

  if (!group) {
    return { error: "Selected group was not found", status: 404 };
  }

  if (!["duo", "band"].includes(group.group_type || "")) {
    return { error: "Only duo or group profiles can be added to the production roster", status: 400 };
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError) {
    throw membershipError;
  }

  if (group.owner_id !== userId && !membership) {
    return {
      error: "You can only add groups or duos that you own or are already a member of",
      status: 403,
    };
  }

  return { group };
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
  const notificationPayload = {
    ...payload,
    meta: withNotificationRouteMeta(payload.meta),
    read: false,
  };
  const safeNotificationPayload = withNotificationSeverityType(notificationPayload);

  const { error } = await supabaseAdmin.from("notifications").insert(safeNotificationPayload);
  if (error) {
    console.error("manage_production_notification_failed", { message: error.message });
    return;
  }
  scheduleCoreActionEmailForNotification(supabaseAdmin, safeNotificationPayload, { source: "manage-production" });
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

const ACTIVE_LISTING_REQUEST_STATUSES = [
  "pending",
  "accepted",
  "approved",
  "connected",
];

function readEventString(eventDetails: any, key: string) {
  const requestDetails =
    eventDetails?.request_details && typeof eventDetails.request_details === "object"
      ? eventDetails.request_details
      : {};

  return toNonEmptyString(eventDetails?.[key]) || toNonEmptyString(requestDetails?.[key]);
}

function valuesConflict(expected: unknown, actual: unknown) {
  const normalizedExpected = toNonEmptyString(expected);
  const normalizedActual = toNonEmptyString(actual);

  return Boolean(
    normalizedExpected &&
      normalizedActual &&
      normalizedExpected !== normalizedActual,
  );
}

function isDuplicateListingRequestEvent(existingDetails: any, expectedDetails: any) {
  const actualDetails =
    existingDetails && typeof existingDetails === "object" && !Array.isArray(existingDetails)
      ? existingDetails
      : {};
  const expectedKind = readEventString(expectedDetails, "request_kind");
  const actualKind = readEventString(actualDetails, "request_kind");

  if (expectedKind && actualKind && expectedKind !== actualKind) {
    return false;
  }

  if (
    valuesConflict(expectedDetails.sender_entity_type, actualDetails.sender_entity_type) ||
    valuesConflict(expectedDetails.receiver_entity_type, actualDetails.receiver_entity_type) ||
    valuesConflict(expectedDetails.sender_entity_id, actualDetails.sender_entity_id) ||
    valuesConflict(expectedDetails.receiver_entity_id, actualDetails.receiver_entity_id) ||
    valuesConflict(expectedDetails.production_team_id, actualDetails.production_team_id)
  ) {
    return false;
  }

  return true;
}

async function validateActiveListingRequestDuplicate(
  supabaseAdmin: any,
  params: {
    eventDetails: any;
    groupId: string | null;
    studioId: string | null;
    receiverUserId: string;
    actorUserId: string;
  },
) {
  const { eventDetails, groupId, studioId, receiverUserId, actorUserId } = params;

  let query = supabaseAdmin
    .from("booking_requests")
    .select("id, status, event_details")
    .eq("sender_id", actorUserId)
    .eq("receiver_id", receiverUserId)
    .in(
      "status",
      isProductionTeamInviteEvent(eventDetails)
        ? ["pending"]
        : ACTIVE_LISTING_REQUEST_STATUSES,
    );

  query = groupId ? query.eq("group_id", groupId) : query.is("group_id", null);
  query = studioId ? query.eq("studio_id", studioId) : query.is("studio_id", null);

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    throw error;
  }

  const duplicate = (data || []).find((request: any) =>
    isDuplicateListingRequestEvent(request?.event_details, eventDetails),
  );

  if (!duplicate) {
    return null;
  }

  return { error: "An active request already exists for this listing.", status: 409 };
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

function isProductionTeamInviteEvent(eventDetails: any) {
  const senderEntityType = String(eventDetails?.sender_entity_type || "")
    .trim()
    .toLowerCase();

  return (
    senderEntityType === "production_team" &&
    getListingRequestKind(eventDetails) === "invite"
  );
}

function isProductionTeamApplicationEvent(eventDetails: any) {
  const receiverEntityType = String(eventDetails?.receiver_entity_type || "")
    .trim()
    .toLowerCase();

  return (
    receiverEntityType === "production_team" &&
    getListingRequestKind(eventDetails) === "application"
  );
}

function normalizeConnectionEntityType(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function isGroupMemberInviteEvent(eventDetails: any) {
  return (
    normalizeConnectionEntityType(eventDetails?.sender_entity_type) === "group" &&
    normalizeConnectionEntityType(eventDetails?.receiver_entity_type) === "musician" &&
    getListingRequestKind(eventDetails) === "invite" &&
    normalizeConnectionEntityType(readEventString(eventDetails, "application_scope")) === "group_member"
  );
}

async function validateGroupMemberInviteAvailability(
  supabaseAdmin: any,
  params: {
    eventDetails: any;
    groupId: string | null;
    receiverUserId: string;
    actorUserId: string;
  },
) {
  const { eventDetails, groupId, receiverUserId, actorUserId } = params;

  if (!isGroupMemberInviteEvent(eventDetails)) {
    return null;
  }

  const inviteGroupId =
    groupId ||
    readEventString(eventDetails, "group_id") ||
    readEventString(eventDetails, "sender_entity_id");
  const targetUserId = readEventString(eventDetails, "receiver_entity_id") || receiverUserId;

  if (!inviteGroupId) {
    return { error: "Group invite is missing a group reference", status: 400 };
  }

  if (!targetUserId) {
    return { error: "Group invite is missing a musician reference", status: 400 };
  }

  const group = await getGroupOwnerContext(supabaseAdmin, inviteGroupId);
  if (!group) {
    return { error: "Group not found", status: 404 };
  }

  if (group.owner_id !== actorUserId) {
    const { data: actorMembership, error: actorMembershipError } = await supabaseAdmin
      .from("group_members")
      .select("id, role")
      .eq("group_id", inviteGroupId)
      .eq("user_id", actorUserId)
      .maybeSingle();

    if (actorMembershipError) {
      throw actorMembershipError;
    }

    if (!actorMembership || !["owner", "admin"].includes(actorMembership.role)) {
      return { error: "Only group owners or admins can send group invites", status: 403 };
    }
  }

  const { data: existingMember, error: existingMemberError } = await supabaseAdmin
    .from("group_members")
    .select("id")
    .eq("group_id", inviteGroupId)
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (existingMemberError) {
    throw existingMemberError;
  }

  if (existingMember) {
    return { error: "This musician is already in this group.", status: 409 };
  }

  const { data: existingInvite, error: existingInviteError } = await supabaseAdmin
    .from("booking_requests")
    .select("id")
    .eq("group_id", inviteGroupId)
    .eq("receiver_id", targetUserId)
    .eq("status", "pending")
    .contains("event_details", {
      sender_entity_type: "group",
      request_kind: "invite",
      application_scope: "group_member",
    })
    .limit(1)
    .maybeSingle();

  if (existingInviteError) {
    throw existingInviteError;
  }

  if (existingInvite) {
    return { error: "This musician already has a pending invite to this group.", status: 409 };
  }

  return null;
}

function isVenueGigInviteEvent(eventDetails: any) {
  const senderEntityType = normalizeConnectionEntityType(eventDetails?.sender_entity_type);
  const listingType = normalizeConnectionEntityType(readEventString(eventDetails, "listing_type"));
  const requestKind = getListingRequestKind(eventDetails);

  return (
    senderEntityType === "venue" &&
    requestKind === "invite" &&
    (listingType === "gig" || Boolean(getVenueGigInviteGigId(eventDetails)))
  );
}

function getVenueGigInviteGigId(eventDetails: any) {
  const senderEntityType = normalizeConnectionEntityType(eventDetails?.sender_entity_type);
  const listingType = normalizeConnectionEntityType(readEventString(eventDetails, "listing_type"));

  return (
    readEventString(eventDetails, "gig_id") ||
    (listingType === "gig" ? readEventString(eventDetails, "listing_id") : null) ||
    (senderEntityType === "venue" ? readEventString(eventDetails, "sender_entity_id") : null)
  );
}

function getVenueGigInviteSlotType(eventDetails: any, groupRecord: any) {
  const rawSlotType =
    readEventString(eventDetails, "slot_type") ||
    readEventString(eventDetails, "roster_entry_kind") ||
    (groupRecord?.group_type === "duo" ? "duo" : groupRecord?.id ? "band" : "solo");
  const normalizedSlotType = String(rawSlotType || "").trim().toLowerCase();

  if (normalizedSlotType === "duo") return "duo";
  if (normalizedSlotType === "group" || normalizedSlotType === "band") return "band";
  return "solo";
}

async function materializeAcceptedVenueGigInvite(
  supabaseAdmin: any,
  requestRow: any,
  groupRecord: any,
) {
  const eventDetails =
    requestRow?.event_details && typeof requestRow.event_details === "object"
      ? requestRow.event_details
      : {};

  if (!isVenueGigInviteEvent(eventDetails)) {
    return null;
  }

  const gigId = getVenueGigInviteGigId(eventDetails);
  if (!gigId) {
    throw new Error("Gig invite is missing a gig reference");
  }

  const receiverEntityType = normalizeConnectionEntityType(eventDetails.receiver_entity_type);
  const receiverEntityId = readEventString(eventDetails, "receiver_entity_id");
  const groupId =
    requestRow.group_id ||
    (receiverEntityType === "group" ? receiverEntityId : null);
  const applicantId =
    groupId
      ? groupRecord?.owner_id || requestRow.receiver_id
      : receiverEntityId || requestRow.receiver_id;

  if (!applicantId) {
    throw new Error("Gig invite is missing an invited performer");
  }

  const slotType = getVenueGigInviteSlotType(eventDetails, groupRecord);
  const pitchMessage =
    readEventString(eventDetails, "pitch_message") ||
    toNonEmptyString(requestRow.message) ||
    "Accepted gig invite.";

  let existingQuery = supabaseAdmin
    .from("gig_applications")
    .select("id, status, group_id")
    .eq("gig_id", gigId)
    .is("production_team_id", null);

  existingQuery = groupId
    ? existingQuery.or(`group_id.eq.${groupId},applicant_id.eq.${applicantId}`)
    : existingQuery.eq("applicant_id", applicantId);

  const { data: existingApplication, error: existingError } = await existingQuery
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existingApplication?.id) {
    if (existingApplication.status === "accepted" || existingApplication.status === "approved") {
      return { application: existingApplication, created: false };
    }

    const { data: updatedApplication, error: updateError } = await supabaseAdmin
      .from("gig_applications")
      .update({
        status: "accepted",
        pitch_message: pitchMessage,
        slot_type: slotType,
        submitted_by_user_id: requestRow.receiver_id,
        leader_approval_status: groupId || existingApplication.group_id ? "approved" : null,
        is_solo_application: !(groupId || existingApplication.group_id),
        ...(groupId && !existingApplication.group_id ? { group_id: groupId } : {}),
      })
      .eq("id", existingApplication.id)
      .select("id, status")
      .maybeSingle();

    if (updateError) throw updateError;
    return { application: updatedApplication || existingApplication, created: false };
  }

  const insertPayload: Record<string, unknown> = {
    gig_id: gigId,
    applicant_id: applicantId,
    group_id: groupId,
    status: "accepted",
    pitch_message: pitchMessage,
    slot_type: slotType,
    submitted_by_user_id: requestRow.receiver_id,
    leader_approval_status: groupId ? "approved" : null,
    is_solo_application: !groupId,
    show_on_profile: true,
  };

  const { data: insertedApplication, error: insertError } = await supabaseAdmin
    .from("gig_applications")
    .insert(insertPayload)
    .select("id, status")
    .maybeSingle();

  if (insertError) {
    throw insertError;
  }

  return { application: insertedApplication, created: true };
}

function isMissingOpenProductionApplicationsColumnError(error: any) {
  const message = String(error?.message || error?.details || "").toLowerCase();
  return (
    (error?.code === "42703" || error?.code === "PGRST204") &&
    message.includes("open_production_applications")
  );
}

async function validateProductionTeamApplicationAvailability(
  supabaseAdmin: any,
  eventDetails: any,
) {
  if (!isProductionTeamApplicationEvent(eventDetails)) {
    return null;
  }

  const productionTeamId = toNonEmptyString(
    eventDetails.production_team_id || eventDetails.receiver_entity_id,
  );

  if (!productionTeamId) {
    return { error: "Production team application is missing a team reference", status: 400 };
  }

  const { data: team, error: teamError } = await supabaseAdmin
    .from("production_teams")
    .select("*")
    .eq("id", productionTeamId)
    .maybeSingle();

  if (teamError && isMissingOpenProductionApplicationsColumnError(teamError)) {
    return null;
  }

  if (teamError) {
    throw teamError;
  }

  if (!team) {
    return { error: "Production team not found", status: 404 };
  }

  if (team.open_production_applications === false) {
    return { error: "This production team is not accepting applications right now.", status: 403 };
  }

  return null;
}

async function validateProductionTeamInviteAvailability(
  supabaseAdmin: any,
  params: {
    eventDetails: any;
    groupId: string | null;
    receiverUserId: string;
    actorUserId: string;
  },
) {
  const { eventDetails, groupId, receiverUserId, actorUserId } = params;

  if (!isProductionTeamInviteEvent(eventDetails)) {
    return null;
  }

  const productionTeamId = toNonEmptyString(
    eventDetails.production_team_id || eventDetails.sender_entity_id,
  );

  if (!productionTeamId) {
    return { error: "Production team invite is missing a team reference", status: 400 };
  }

  const managerMembership = await getTeamManagerMembership(
    supabaseAdmin,
    productionTeamId,
    actorUserId,
  );

  if (!managerMembership) {
    return { error: "Only team owners or managers can send production invites", status: 403 };
  }

  if (groupId) {
    const { data: rosterEntry, error: rosterError } = await supabaseAdmin
      .from("production_team_roster")
      .select("id")
      .eq("team_id", productionTeamId)
      .eq("group_id", groupId)
      .maybeSingle();

    if (rosterError) {
      throw rosterError;
    }

    if (rosterEntry) {
      return { error: "This band or duo is already in this production team.", status: 409 };
    }

    const { data: existingInvite, error: inviteError } = await supabaseAdmin
      .from("booking_requests")
      .select("id, status")
      .eq("group_id", groupId)
      .eq("status", "pending")
      .contains("event_details", {
        production_team_id: productionTeamId,
        sender_entity_type: "production_team",
        request_kind: "invite",
      })
      .limit(1)
      .maybeSingle();

    if (inviteError) {
      throw inviteError;
    }

    if (existingInvite) {
      return {
        error:
          existingInvite.status === "accepted"
            ? "This band or duo has already accepted an invite to this production team."
            : "This band or duo already has a pending invite to this production team.",
        status: 409,
      };
    }

    return null;
  }

  const profileId = toNonEmptyString(eventDetails.receiver_entity_id) || receiverUserId;

  const { data: rosterEntry, error: rosterError } = await supabaseAdmin
    .from("production_team_roster")
    .select("id")
    .eq("team_id", productionTeamId)
    .eq("profile_id", profileId)
    .maybeSingle();

  if (rosterError) {
    throw rosterError;
  }

  if (rosterEntry) {
    return { error: "This musician is already in this production team.", status: 409 };
  }

  const { data: existingInvite, error: inviteError } = await supabaseAdmin
    .from("booking_requests")
    .select("id, status")
    .eq("receiver_id", profileId)
    .is("group_id", null)
    .eq("status", "pending")
    .contains("event_details", {
      production_team_id: productionTeamId,
      sender_entity_type: "production_team",
      request_kind: "invite",
    })
    .limit(1)
    .maybeSingle();

  if (inviteError) {
    throw inviteError;
  }

  if (existingInvite) {
    return {
      error:
        existingInvite.status === "accepted"
          ? "This musician has already accepted an invite to this production team."
          : "This musician already has a pending invite to this production team.",
      status: 409,
    };
  }

  const { data: memberEntry, error: memberError } = await supabaseAdmin
    .from("production_team_members")
    .select("id")
    .eq("team_id", productionTeamId)
    .eq("user_id", profileId)
    .maybeSingle();

  if (memberError) {
    throw memberError;
  }

  if (memberEntry) {
    return { error: "This musician has already joined this production team.", status: 409 };
  }

  return null;
}

function isProductionTeamApplicationRequest(request: any) {
  const eventDetails =
    request?.event_details && typeof request.event_details === "object"
      ? request.event_details
      : {};

  const receiverEntityType = String(eventDetails?.receiver_entity_type || "")
    .trim()
    .toLowerCase();

  return (
    receiverEntityType === "production_team" &&
    getListingRequestKind(eventDetails) === "application"
  );
}

function getProductionTeamIdFromRequest(request: any) {
  const eventDetails =
    request?.event_details && typeof request.event_details === "object"
      ? request.event_details
      : {};

  const directTeamId = toNonEmptyString(eventDetails.production_team_id);
  if (directTeamId) return directTeamId;

  const senderEntityType = String(eventDetails.sender_entity_type || "")
    .trim()
    .toLowerCase();
  const receiverEntityType = String(eventDetails.receiver_entity_type || "")
    .trim()
    .toLowerCase();

  if (senderEntityType === "production_team") {
    return toNonEmptyString(eventDetails.sender_entity_id);
  }

  if (receiverEntityType === "production_team") {
    return toNonEmptyString(eventDetails.receiver_entity_id);
  }

  return null;
}

async function addProductionTeamMember(
  supabaseAdmin: any,
  teamId: string,
  userId: string,
) {
  const { error } = await supabaseAdmin
    .from("production_team_members")
    .insert({
      team_id: teamId,
      user_id: userId,
      role: "member",
    });

  if (error) {
    if (error.code === "23505") {
      return { added: false, alreadyMember: true };
    }
    throw error;
  }

  return { added: true, alreadyMember: false };
}

async function addAcceptedProductionRosterAndMembership(
  supabaseAdmin: any,
  requestRow: any,
  productionTeamId: string,
) {
  let rosterAdded = false;
  let alreadyOnRoster = false;
  let memberAdded = false;
  let alreadyMember = false;

  const eventDetails =
    requestRow?.event_details && typeof requestRow.event_details === "object"
      ? requestRow.event_details
      : {};
  const senderEntityType = String(eventDetails.sender_entity_type || "")
    .trim()
    .toLowerCase();

  if (requestRow.group_id) {
    const { data: groupData, error: groupError } = await supabaseAdmin
      .from("groups")
      .select("id, owner_id, name, group_type")
      .eq("id", requestRow.group_id)
      .maybeSingle();

    if (groupError) {
      throw groupError;
    }

    if (!groupData) {
      throw new Error("Invite group not found");
    }

    const rosterKind = groupData.group_type === "duo" ? "duo" : "group";

    const { error: rosterInsertError } = await supabaseAdmin
      .from("production_team_roster")
      .insert({
        team_id: productionTeamId,
        entity_kind: rosterKind,
        group_id: requestRow.group_id,
        added_by_user_id: requestRow.sender_id,
      });

    if (rosterInsertError) {
      if (rosterInsertError.code === "23505") {
        alreadyOnRoster = true;
      } else {
        throw rosterInsertError;
      }
    } else {
      rosterAdded = true;
    }

    if (groupData.owner_id) {
      const memberResult = await addProductionTeamMember(
        supabaseAdmin,
        productionTeamId,
        groupData.owner_id,
      );
      memberAdded = memberResult.added;
      alreadyMember = memberResult.alreadyMember;
    }
  } else {
    const profileId =
      senderEntityType === "production_team"
        ? requestRow.receiver_id
        : requestRow.sender_id;

    const { data: profileData, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", profileId)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (!profileData) {
      throw new Error("Musician profile not found");
    }

    if ((profileData.role || "").toLowerCase() !== "musician") {
      throw new Error("Only musician profiles can join a production team");
    }

    const { error: rosterInsertError } = await supabaseAdmin
      .from("production_team_roster")
      .insert({
        team_id: productionTeamId,
        entity_kind: "musician",
        profile_id: profileId,
        added_by_user_id: requestRow.sender_id,
      });

    if (rosterInsertError) {
      if (rosterInsertError.code === "23505") {
        alreadyOnRoster = true;
      } else {
        throw rosterInsertError;
      }
    } else {
      rosterAdded = true;
    }

    const memberResult = await addProductionTeamMember(
      supabaseAdmin,
      productionTeamId,
      profileId,
    );
    memberAdded = memberResult.added;
    alreadyMember = memberResult.alreadyMember;
  }

  return {
    rosterAdded,
    alreadyOnRoster,
    memberAdded,
    alreadyMember,
  };
}


serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let actionForLog = "unknown";

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
    actionForLog = typeof action === "string" && action.trim() ? action.trim() : "unknown";

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

      try {
        const groupMemberInviteValidation = await validateGroupMemberInviteAvailability(
          supabaseAdmin,
          {
            eventDetails,
            groupId,
            receiverUserId,
            actorUserId: authUser.id,
          },
        );

        if (groupMemberInviteValidation?.error) {
          return jsonResponse(
            { error: groupMemberInviteValidation.error },
            groupMemberInviteValidation.status || 400,
          );
        }

        const validationResult = await validateProductionTeamInviteAvailability(supabaseAdmin, {
          eventDetails,
          groupId,
          receiverUserId,
          actorUserId: authUser.id,
        });

        if (validationResult?.error) {
          return jsonResponse({ error: validationResult.error }, validationResult.status || 400);
        }

        const applicationAvailability = await validateProductionTeamApplicationAvailability(
          supabaseAdmin,
          eventDetails,
        );

        if (applicationAvailability?.error) {
          return jsonResponse(
            { error: applicationAvailability.error },
            applicationAvailability.status || 400,
          );
        }

        const duplicateValidation = await validateActiveListingRequestDuplicate(supabaseAdmin, {
          eventDetails,
          groupId,
          studioId,
          receiverUserId,
          actorUserId: authUser.id,
        });

        if (duplicateValidation?.error) {
          return jsonResponse(
            { error: duplicateValidation.error },
            duplicateValidation.status || 409,
          );
        }
      } catch (validationError: any) {
        return jsonResponse(
          { error: validationError?.message || "Failed to validate listing request" },
          500,
        );
      }

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
            request_kind: eventDetails.request_kind || null,
            request_details: eventDetails.request_details || null,
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
        .select("id, sender_id, receiver_id, group_id, message, status, event_details")
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

      const isProductionTeamApplication = isProductionTeamApplicationRequest(requestRow);
      const productionTeamApplicationId = isProductionTeamApplication
        ? getProductionTeamIdFromRequest(requestRow)
        : null;

      if (isProductionTeamApplication && !productionTeamApplicationId) {
        return jsonResponse({ error: "Application is missing a production team reference" }, 400);
      }

      const productionTeamManager = productionTeamApplicationId
        ? await getTeamManagerMembership(supabaseAdmin, productionTeamApplicationId, authUser.id)
        : null;
      const canRespond = productionTeamApplicationId
        ? requestRow.receiver_id === authUser.id || !!productionTeamManager
        : requestRow.receiver_id === authUser.id ||
          (groupRecord?.owner_id && groupRecord.owner_id === authUser.id);

      if (!canRespond) {
        return jsonResponse({ error: "Only the request recipient can respond" }, 403);
      }

      let productionAcceptanceResult: any = null;
      if (decision === "accepted" && productionTeamApplicationId) {
        const productionTeamId = productionTeamApplicationId;

        try {
          productionAcceptanceResult = await addAcceptedProductionRosterAndMembership(
            supabaseAdmin,
            requestRow,
            productionTeamId,
          );
        } catch (acceptanceError: any) {
          return jsonResponse(
            { error: acceptanceError.message || "Failed to add applicant to production team" },
            acceptanceError.message === "Invite group not found" ||
              acceptanceError.message === "Musician profile not found"
              ? 404
              : 500,
          );
        }
      }

      let venueGigAcceptanceResult: any = null;
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

      if (decision === "accepted" && isVenueGigInviteEvent(eventDetails)) {
        try {
          venueGigAcceptanceResult = await materializeAcceptedVenueGigInvite(
            supabaseAdmin,
            requestRow,
            groupRecord,
          );
        } catch (acceptanceError: any) {
          console.error("Failed to create accepted gig application for gig invite:", acceptanceError);
          await supabaseAdmin
            .from("booking_requests")
            .update({ status: "pending" })
            .eq("id", requestId)
            .eq("status", "accepted");

          return jsonResponse(
            {
              error:
                acceptanceError?.message ||
                "Invite could not be accepted because the gig application could not be created.",
            },
            500,
          );
        }
      }

      const responderName =
        toNonEmptyString(eventDetails.receiver_entity_name) ||
        groupRecord?.name ||
        "The recipient";
      const requestTypeLabel = String(
        eventDetails.sender_entity_type && eventDetails.receiver_entity_type
          ? `${eventDetails.sender_entity_type} request`
          : "connection request",
      ).toLowerCase();
      const statusRouteParams = { tab: decision === "pending" ? "Pending" : "History" };

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
            status: decision,
            sender_entity_type: eventDetails.sender_entity_type || null,
            sender_entity_name: eventDetails.sender_entity_name || null,
            receiver_entity_type: eventDetails.receiver_entity_type || null,
            receiver_entity_name: responderName,
            listing_id: eventDetails.listing_id || null,
            listing_type: eventDetails.listing_type || null,
            production_team_id: eventDetails.production_team_id || null,
            route: "/bookings",
            route_params: statusRouteParams,
          },
        });
      } catch (notificationError) {
        console.error(
          "Failed to send listing request status notification:",
          notificationError,
        );
      }

      return jsonResponse({
        success: true,
        request: updatedRequest,
        ...(productionAcceptanceResult
          ? {
              roster_added: productionAcceptanceResult.rosterAdded,
              already_on_roster: productionAcceptanceResult.alreadyOnRoster,
              member_added: productionAcceptanceResult.memberAdded,
              already_member: productionAcceptanceResult.alreadyMember,
            }
          : {}),
        ...(venueGigAcceptanceResult
          ? {
              gig_application: venueGigAcceptanceResult.application || null,
              gig_application_created: venueGigAcceptanceResult.created === true,
            }
          : {}),
      });
    }

    // ================================================================
    // PRODUCTION TEAM ACTIONS
    // ================================================================

    if (action === "create_production_team") {
      const { name, description, logo_url } = params;
      if (!name?.trim()) return jsonResponse({ error: "Team name is required" }, 400);

      const callerRole = await getProfileRole(supabaseAdmin, authUser.id);
      if (callerRole !== "producer") {
        return jsonResponse({ error: "Only production users can create a production team" }, 403);
      }

      const { data: team, error: teamErr } = await supabaseAdmin
        .from("production_teams")
        .insert({ owner_id: authUser.id, name: name.trim(), description, logo_url })
        .select()
        .single();

      if (teamErr) return jsonResponse({ error: teamErr.message }, 500);

      // Auto-add owner as member
      const { error: ownerMemberError } = await supabaseAdmin
        .from("production_team_members")
        .upsert({
          team_id: team.id,
          user_id: authUser.id,
          role: "owner",
        }, { onConflict: "team_id,user_id" });

      if (ownerMemberError) {
        console.error("[manage-production] Failed to attach owner membership", {
          team_id: team.id,
          user_id: authUser.id,
          message: ownerMemberError.message,
          code: ownerMemberError.code,
          details: ownerMemberError.details,
          hint: ownerMemberError.hint,
        });

        await supabaseAdmin
          .from("production_teams")
          .delete()
          .eq("id", team.id)
          .eq("owner_id", authUser.id);

        return jsonResponse({
          error: `Failed to create production team membership: ${ownerMemberError.message}`,
        }, 500);
      }

      return jsonResponse({ success: true, team });
    }

    if (action === "update_production_team") {
      const { team_id, name, description, logo_url, open_production_applications } = params;
      if (!team_id) return jsonResponse({ error: "team_id is required" }, 400);
      if (!name?.trim()) return jsonResponse({ error: "Team name is required" }, 400);

      const { data: existingTeam, error: existingTeamError } = await supabaseAdmin
        .from("production_teams")
        .select("id, owner_id")
        .eq("id", team_id)
        .maybeSingle();

      if (existingTeamError) return jsonResponse({ error: existingTeamError.message }, 500);
      if (!existingTeam) return jsonResponse({ error: "Production team not found" }, 404);

      const editorAccess = await getProductionEditorAccess(supabaseAdmin, team_id, authUser.id);

      if (!editorAccess) {
        return jsonResponse({ error: "Only team owners, managers, or level 1 staff can update this team" }, 403);
      }

      const { data: team, error: teamErr } = await supabaseAdmin
        .from("production_teams")
        .update({
          name: name.trim(),
          description: description?.trim() || null,
          logo_url: logo_url || null,
          ...(typeof open_production_applications === "boolean"
            ? { open_production_applications }
            : {}),
        })
        .eq("id", team_id)
        .select()
        .single();

      if (teamErr) return jsonResponse({ error: teamErr.message }, 500);

      return jsonResponse({ success: true, team });
    }

    if (action === "delete_production_team") {
      const { team_id } = params;
      if (!team_id) return jsonResponse({ error: "team_id is required" }, 400);

      const { data: team } = await supabaseAdmin
        .from("production_teams")
        .select("id, owner_id, name")
        .eq("id", team_id)
        .maybeSingle();

      if (!team) return jsonResponse({ error: "Production team not found" }, 404);
      if (team.owner_id !== authUser.id) {
        return jsonResponse({ error: "Only the team owner can delete this team" }, 403);
      }


      const { error: memberDeleteError } = await supabaseAdmin
        .from("production_team_members")
        .delete()
        .eq("team_id", team_id);

      if (memberDeleteError) return jsonResponse({ error: memberDeleteError.message }, 500);

      const { error: applicationClearError } = await supabaseAdmin
        .from("gig_applications")
        .update({
          production_team_id: null,
          production_roster_id: null,
        })
        .eq("production_team_id", team_id);

      if (applicationClearError) return jsonResponse({ error: applicationClearError.message }, 500);

      const { error: teamDeleteError } = await supabaseAdmin
        .from("production_teams")
        .delete()
        .eq("id", team_id)
        .eq("owner_id", authUser.id);

      if (teamDeleteError) return jsonResponse({ error: teamDeleteError.message }, 500);

      return jsonResponse({ success: true, team: { id: team.id, name: team.name } });
    }

    if (action === "add_team_member") {
      const { team_id, user_id, role } = params;
      if (!team_id || !user_id) return jsonResponse({ error: "team_id and user_id are required" }, 400);

      const callerAccess = await getProductionEditorAccess(supabaseAdmin, team_id, authUser.id);
      if (!callerAccess) return jsonResponse({ error: "Only team owners, managers, or level 1 staff can add members" }, 403);

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
      const reason = toNonEmptyString(
        params.reason ?? params.removal_reason ?? params.fire_reason,
      ) || "No reason provided.";
      if (!team_id || !user_id) return jsonResponse({ error: "team_id and user_id are required" }, 400);

      const { data: team, error: teamError } = await supabaseAdmin
        .from("production_teams")
        .select("id, name, logo_url")
        .eq("id", team_id)
        .maybeSingle();

      if (teamError) return jsonResponse({ error: teamError.message }, 500);
      if (!team) return jsonResponse({ error: "Production team not found" }, 404);

      const callerMember = await getProductionEditorAccess(supabaseAdmin, team_id, authUser.id);
      if (!callerMember) return jsonResponse({ error: "Only team owners, managers, or level 1 staff can remove members" }, 403);

      // Cannot remove the team owner
      const { data: targetMember } = await supabaseAdmin
        .from("production_team_members")
        .select("role")
        .eq("team_id", team_id)
        .eq("user_id", user_id)
        .maybeSingle();

      if (!targetMember) return jsonResponse({ error: "Member not found" }, 404);
      if (targetMember?.role === "owner") return jsonResponse({ error: "Cannot remove the team owner" }, 403);

      const { data: targetProfile } = await supabaseAdmin
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", user_id)
        .maybeSingle();

      let ownedGroupIds: string[] = [];
      try {
        ownedGroupIds = await getGroupIdsOwnedByUser(supabaseAdmin, user_id);
      } catch (groupLookupError: any) {
        return jsonResponse({ error: groupLookupError.message || "Failed to check owned groups" }, 500);
      }

      const { error: deleteError } = await supabaseAdmin
        .from("production_team_members")
        .delete()
        .eq("team_id", team_id)
        .eq("user_id", user_id);

      if (deleteError) return jsonResponse({ error: deleteError.message }, 500);

      let removedRosterEntries = 0;
      let firedApplications = 0;
      let retiredInviteRequests = 0;
      try {
        const rosterCleanup = await removeProductionRosterForFiredMember(supabaseAdmin, {
          teamId: team_id,
          userId: user_id,
          ownedGroupIds,
          reason,
        });
        removedRosterEntries = rosterCleanup.removedCount;
        firedApplications = rosterCleanup.firedApplicationCount;
        retiredInviteRequests = await retireAcceptedProductionInviteRequests(supabaseAdmin, {
          teamId: team_id,
          profileId: user_id,
          groupIds: ownedGroupIds,
        });
      } catch (cleanupError: any) {
        return jsonResponse({ error: cleanupError.message || "Failed to clean up production roster" }, 500);
      }

      let notificationSent = false;
      try {
        await insertNotification(supabaseAdmin, {
          user_id,
          type: "warning",
          title: "Removed from production team",
          message: `${team.name} removed you from their production team. Reason: ${reason}`,
          image: team.logo_url || targetProfile?.avatar_url || null,
          meta: {
            type: "production_team_member_removed",
            team_id,
            team_name: team.name,
            removed_by_user_id: authUser.id,
            removed_member_role: targetMember.role || null,
            removed_member_name: targetProfile?.full_name || null,
            reason,
            route: "/notifications",
          },
        });
        notificationSent = true;
      } catch (notificationError) {
        console.error("Failed to send production team removal notification:", notificationError);
      }

      return jsonResponse({
        success: true,
        notification_sent: notificationSent,
        roster_entries_removed: removedRosterEntries,
        fired_applications_updated: firedApplications,
        invite_requests_retired: retiredInviteRequests,
      });
    }

    if (action === "list_team_roster") {
      const team_id = params.team_id || params.teamId;
      if (!team_id) return jsonResponse({ error: "team_id is required" }, 400);

      const { data: membership } = await supabaseAdmin
        .from("production_team_members")
        .select("role")
        .eq("team_id", team_id)
        .eq("user_id", authUser.id)
        .maybeSingle();

      const staffAccessLevel = membership ? null : await getProductionStaffAccessLevel(supabaseAdmin, team_id, authUser.id);
      if (!membership && !staffAccessLevel) {
        return jsonResponse({ error: "Only team members can view this roster" }, 403);
      }

      try {
        const roster = await getTeamRosterEntries(supabaseAdmin, team_id);
        return jsonResponse({ success: true, roster });
      } catch (error: any) {
        return jsonResponse({ error: error.message || "Failed to load roster" }, 500);
      }
    }

    if (action === "add_team_roster_profile") {
      const team_id = params.team_id || params.teamId;
      const profile_id = params.profile_id || params.profileId;
      if (!team_id || !profile_id) {
        return jsonResponse({ error: "team_id and profile_id are required" }, 400);
      }

      const membership = await getProductionEditorAccess(supabaseAdmin, team_id, authUser.id);
      if (!membership) {
        return jsonResponse({ error: "Only team owners, managers, or level 1 staff can update the roster" }, 403);
      }

      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", profile_id)
        .maybeSingle();

      if (profileError) {
        return jsonResponse({ error: profileError.message }, 500);
      }

      if (!profile) {
        return jsonResponse({ error: "Selected musician was not found" }, 404);
      }

      if ((profile.role || "").toLowerCase() !== "musician") {
        return jsonResponse({ error: "Only registered musician profiles can be added to the roster" }, 400);
      }

      const { error: insertError } = await supabaseAdmin
        .from("production_team_roster")
        .insert({
          team_id,
          entity_kind: "musician",
          profile_id,
          added_by_user_id: authUser.id,
        });

      if (insertError) {
        if (insertError.code === "23505") {
          return jsonResponse({ error: "This musician is already in the production roster" }, 409);
        }
        return jsonResponse({ error: insertError.message }, 500);
      }

      const roster = await getTeamRosterEntries(supabaseAdmin, team_id);
      return jsonResponse({ success: true, roster });
    }

    if (action === "add_team_roster_group") {
      const team_id = params.team_id || params.teamId;
      const group_id = params.group_id || params.groupId;
      if (!team_id || !group_id) {
        return jsonResponse({ error: "team_id and group_id are required" }, 400);
      }

      const membership = await getProductionEditorAccess(supabaseAdmin, team_id, authUser.id);
      if (!membership) {
        return jsonResponse({ error: "Only team owners, managers, or level 1 staff can update the roster" }, 403);
      }

      let groupResult: any;
      try {
        groupResult = await ensureAccessibleGroupForRoster(supabaseAdmin, group_id, authUser.id);
      } catch (error: any) {
        return jsonResponse({ error: error.message || "Failed to validate group access" }, 500);
      }

      if (groupResult?.error) {
        return jsonResponse({ error: groupResult.error }, groupResult.status || 400);
      }

      const rosterKind = groupResult.group.group_type === "duo" ? "duo" : "group";

      const { error: insertError } = await supabaseAdmin
        .from("production_team_roster")
        .insert({
          team_id,
          entity_kind: rosterKind,
          group_id,
          added_by_user_id: authUser.id,
        });

      if (insertError) {
        if (insertError.code === "23505") {
          return jsonResponse({ error: "This group or duo is already in the production roster" }, 409);
        }
        return jsonResponse({ error: insertError.message }, 500);
      }

      const roster = await getTeamRosterEntries(supabaseAdmin, team_id);
      return jsonResponse({ success: true, roster });
    }

    if (action === "remove_team_roster_entry") {
      const team_id = params.team_id || params.teamId;
      const roster_id = params.roster_id || params.rosterId;
      if (!team_id || !roster_id) {
        return jsonResponse({ error: "team_id and roster_id are required" }, 400);
      }

      const membership = await getProductionEditorAccess(supabaseAdmin, team_id, authUser.id);
      if (!membership) {
        return jsonResponse({ error: "Only team owners, managers, or level 1 staff can update the roster" }, 403);
      }

      const { data: rosterEntry, error: rosterEntryError } = await supabaseAdmin
        .from("production_team_roster")
        .select("id")
        .eq("id", roster_id)
        .eq("team_id", team_id)
        .maybeSingle();

      if (rosterEntryError) {
        return jsonResponse({ error: rosterEntryError.message }, 500);
      }

      if (!rosterEntry) {
        return jsonResponse({ error: "Roster entry not found" }, 404);
      }

      const firedApplications = await fireActiveProductionRosterApplications(
        supabaseAdmin,
        {
          teamId: team_id,
          rosterIds: [roster_id],
          reason: toNonEmptyString(params.reason ?? params.removal_reason) ||
            "Removed from production roster by the production team.",
        },
      );

      const { error: deleteError } = await supabaseAdmin
        .from("production_team_roster")
        .delete()
        .eq("id", roster_id)
        .eq("team_id", team_id);

      if (deleteError) {
        return jsonResponse({ error: deleteError.message }, 500);
      }

      const roster = await getTeamRosterEntries(supabaseAdmin, team_id);
      return jsonResponse({ success: true, roster, fired_applications_updated: firedApplications });
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
      let memberAdded = false;
      let alreadyMember = false;

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

          if (groupRecord?.owner_id) {
            const memberResult = await addProductionTeamMember(
              supabaseAdmin,
              productionTeamId,
              groupRecord.owner_id,
            );
            memberAdded = memberResult.added;
            alreadyMember = memberResult.alreadyMember;
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

          const memberResult = await addProductionTeamMember(
            supabaseAdmin,
            productionTeamId,
            requestRow.receiver_id,
          );
          memberAdded = memberResult.added;
          alreadyMember = memberResult.alreadyMember;
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
          status: decision,
          sender_entity_type: eventDetails.sender_entity_type || null,
          sender_entity_name: eventDetails.sender_entity_name || null,
          receiver_entity_type: eventDetails.receiver_entity_type || null,
          receiver_entity_name: responderName,
          production_team_id: productionTeamId,
          route: "/bookings",
          route_params: { tab: decision === "pending" ? "Pending" : "History" },
        },
      });

      return jsonResponse({
        success: true,
        request: updatedRequest,
        roster_added: rosterAdded,
        already_on_roster: alreadyOnRoster,
        member_added: memberAdded,
        already_member: alreadyMember,
      });
    }

    if (action === "list_my_teams") {
      const { data: memberships, error } = await supabaseAdmin
        .from("production_team_members")
        .select(`
          team_id,
          role,
          production_teams (
            *
          )
        `)
        .eq("user_id", authUser.id);

      if (error) return jsonResponse({ error: error.message }, 500);

      const { data: ownedTeams, error: ownedTeamsError } = await supabaseAdmin
        .from("production_teams")
        .select("*")
        .eq("owner_id", authUser.id);

      if (ownedTeamsError) return jsonResponse({ error: ownedTeamsError.message }, 500);

      const userRole = await getProfileRole(supabaseAdmin, authUser.id);
      let staffTeamRows: any[] = [];
      if (userRole === "staff") {
        const { data: staffAssignments, error: staffAssignmentsError } = await supabaseAdmin
          .from("staff_listing_access")
          .select("access_level, production_team:production_team_id(*)")
          .eq("staff_user_id", authUser.id)
          .eq("entity_type", "production")
          .is("revoked_at", null);

        if (staffAssignmentsError) {
          if (!isMissingTableError(staffAssignmentsError, "staff_listing_access")) {
            return jsonResponse({ error: staffAssignmentsError.message }, 500);
          }
        } else {
          staffTeamRows = staffAssignments || [];
        }
      }

      const teamsById = new Map<string, any>();
      (memberships || []).forEach((membershipRow: any) => {
        const teamRecord = Array.isArray(membershipRow.production_teams)
          ? membershipRow.production_teams[0]
          : membershipRow.production_teams;

        if (teamRecord?.id) {
          teamsById.set(teamRecord.id, {
            ...teamRecord,
            member_role: membershipRow.role,
          });
        }
      });

      for (const ownedTeam of ownedTeams || []) {
        const { error: repairError } = await supabaseAdmin
          .from("production_team_members")
          .upsert({
            team_id: ownedTeam.id,
            user_id: authUser.id,
            role: "owner",
          }, { onConflict: "team_id,user_id" });

        if (repairError) {
          console.error("[manage-production] Failed to repair owner membership while listing teams", {
            team_id: ownedTeam.id,
            user_id: authUser.id,
            message: repairError.message,
            code: repairError.code,
            details: repairError.details,
            hint: repairError.hint,
          });
        }

        teamsById.set(ownedTeam.id, {
          ...ownedTeam,
          member_role: "owner",
        });
      }

      for (const staffRow of staffTeamRows) {
        const teamRecord = Array.isArray(staffRow.production_team)
          ? staffRow.production_team[0]
          : staffRow.production_team;
        if (!teamRecord?.id) continue;

        teamsById.set(teamRecord.id, {
          ...teamRecord,
          member_role: `staff-level-${staffRow.access_level}`,
          staff_access_level: Number(staffRow.access_level),
          staff_can_edit: Number(staffRow.access_level) === 1,
          staff_can_manage_bookings: Number(staffRow.access_level) <= 2,
        });
      }

      const teams = Array.from(teamsById.values()).sort((a: any, b: any) =>
        String(b.created_at || "").localeCompare(String(a.created_at || "")),
      );

      return jsonResponse({ teams });
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
