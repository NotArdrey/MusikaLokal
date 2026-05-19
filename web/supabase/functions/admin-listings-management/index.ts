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

type ResourceType = "studio" | "venue" | "production";
type RelatedActivityKind = "gig_application" | "booking_request" | "studio_booking";

type RelatedActivityAction = {
  key: string;
  label: string;
  next_status?: string;
  tone: "primary" | "success" | "warning" | "danger";
};

type AuditContext = {
  actorUserId: string;
  actorRole: string;
  source: string;
};

function jsonResponse(body: unknown, status = 200) {
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

function createServiceClient(supabaseUrl: string, serviceRoleKey: string, auditContext?: AuditContext) {
  const headers = auditContext
    ? {
        "x-audit-actor-user-id": auditContext.actorUserId,
        "x-audit-actor-role": auditContext.actorRole,
        "x-audit-source": auditContext.source,
      }
    : undefined;

  return createClient(
    supabaseUrl,
    serviceRoleKey,
    headers
      ? {
          global: {
            headers,
          },
        }
      : undefined,
  );
}

function parseResourceType(rawValue: unknown): ResourceType | null {
  const value = String(rawValue || "").trim().toLowerCase();
  if (value === "studio") return "studio";
  if (value === "venue" || value === "gig") return "venue";
  if (value === "production" || value === "production_team") return "production";
  return null;
}

function nullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function requiredText(value: unknown, label: string): string {
  const text = nullableText(value);
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function integerOrNull(value: unknown): number | null {
  const numberValue = numberOrNull(value);
  return numberValue === null ? null : Math.trunc(numberValue);
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => nullableText(item))
      .filter((item): item is string => Boolean(item));
  }

  if (typeof value === "string") {
    return value
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function normalizePermitStatus(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["pending_review", "approved", "rejected", "resubmitted"].includes(normalized)
    ? normalized
    : "approved";
}

function normalizeGigStatus(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["open", "closed", "cancelled"].includes(normalized) ? normalized : "open";
}

function normalizeStudioTypes(value: unknown): string[] {
  const rawTypes = Array.isArray(value) ? value : stringList(value);
  const normalized = rawTypes
    .map((item) => String(item || "").trim().toLowerCase())
    .flatMap((item) => {
      if (item === "both" || item === "rehearsal & recording") return ["Rehearsal", "Recording"];
      if (item === "recording") return ["Recording"];
      if (item === "rehearsal") return ["Rehearsal"];
      return [];
    });

  const unique = Array.from(new Set(normalized));
  return unique.length > 0 ? unique : ["Rehearsal"];
}

function studioTypeLabel(types: string[]) {
  const normalized = normalizeStudioTypes(types);
  if (normalized.includes("Rehearsal") && normalized.includes("Recording")) return "Both";
  return normalized[0] || "Rehearsal";
}

function normalizeImages(value: unknown): string[] {
  return stringList(value).filter((url) => /^https?:\/\//i.test(url) || /^data:image\//i.test(url));
}

function normalizeInstruments(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return { name: item.trim(), image: null };
        const record = objectValue(item);
        return {
          name: nullableText(record.name ?? record.instrument_name),
          image: nullableText(record.image ?? record.image_url),
        };
      })
      .filter((item) => Boolean(item.name));
  }

  return stringList(value).map((name) => ({ name, image: null }));
}

function buildGigRequirements(payload: Record<string, unknown>) {
  const directRequirements = objectValue(payload.requirements);
  if (Object.keys(directRequirements).length > 0) return directRequirements;

  return {
    genres: stringList(payload.genres),
    instruments: stringList(payload.instruments),
    experience_level: nullableText(payload.experience_level),
    event_start_time: nullableText(payload.event_start_time),
    event_end_time: nullableText(payload.event_end_time),
    musician_type: nullableText(payload.musician_type) || "both",
  };
}

function ownerFromRelation(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function normalizeStatus(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function formatPerson(profile: any, fallbackId?: string | null) {
  if (!profile) {
    return {
      id: fallbackId || null,
      name: fallbackId ? "Unknown user" : null,
      email: null,
      role: null,
    };
  }

  return {
    id: profile.id || fallbackId || null,
    name: profile.full_name || profile.email || profile.id || fallbackId || "Unknown user",
    email: profile.email || null,
    role: profile.role || null,
  };
}

async function fetchProfilesByIds(client: any, ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const profilesById = new Map<string, any>();
  if (uniqueIds.length === 0) return profilesById;

  const { data, error } = await client
    .from("profiles")
    .select("id, full_name, email, role")
    .in("id", uniqueIds);

  if (error) throw error;
  for (const profile of data || []) {
    if (profile?.id) profilesById.set(profile.id, profile);
  }

  return profilesById;
}

async function fetchGroupsByIds(client: any, ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const groupsById = new Map<string, any>();
  if (uniqueIds.length === 0) return groupsById;

  const { data, error } = await client
    .from("groups")
    .select("id, name, owner_id, group_type")
    .in("id", uniqueIds);

  if (error) throw error;
  for (const group of data || []) {
    if (group?.id) groupsById.set(group.id, group);
  }

  return groupsById;
}

async function fetchGigsByIds(client: any, ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const gigsById = new Map<string, any>();
  if (uniqueIds.length === 0) return gigsById;

  const { data, error } = await client
    .from("gigs")
    .select("id, organizer_id, name, location, event_date, budget, status")
    .in("id", uniqueIds);

  if (error) throw error;
  for (const gig of data || []) {
    if (gig?.id) gigsById.set(gig.id, gig);
  }

  return gigsById;
}

function getGigApplicationActions(row: any): RelatedActivityAction[] {
  const status = normalizeStatus(row?.status);
  const leaderStatus = normalizeStatus(row?.leader_approval_status);
  const actions: RelatedActivityAction[] = [];

  if (leaderStatus === "pending") {
    actions.push(
      { key: "approve_leader", label: "Approve", tone: "success" },
      { key: "reject_leader", label: "Reject", tone: "danger" },
    );
    return actions;
  }

  if (status === "pending") {
    return [
      { key: "accept", label: "Accept", next_status: "accepted", tone: "success" },
      { key: "decline", label: "Decline", next_status: "rejected", tone: "danger" },
    ];
  }

  if (status === "accepted" || status === "approved") {
    return [
      { key: "complete", label: "Complete", next_status: "completed", tone: "success" },
      { key: "fire", label: "Fire", next_status: "fired", tone: "danger" },
      { key: "cancel", label: "Cancel", next_status: "cancelled", tone: "warning" },
    ];
  }

  return actions;
}

function getBookingRequestActions(row: any): RelatedActivityAction[] {
  return normalizeStatus(row?.status) === "pending"
    ? [
        { key: "accept", label: "Accept", next_status: "accepted", tone: "success" },
        { key: "decline", label: "Decline", next_status: "declined", tone: "danger" },
      ]
    : [];
}

function getStudioBookingActions(row: any): RelatedActivityAction[] {
  const status = normalizeStatus(row?.status);
  if (status === "pending") {
    return [
      { key: "confirm", label: "Confirm", next_status: "confirmed", tone: "success" },
      { key: "cancel", label: "Cancel", next_status: "cancelled", tone: "danger" },
    ];
  }

  if (status === "confirmed" || status === "checked_in" || status === "pending_relocation") {
    return [
      { key: "complete", label: "Complete", next_status: "completed", tone: "success" },
      { key: "cancel", label: "Cancel", next_status: "cancelled", tone: "danger" },
    ];
  }

  return [];
}

function buildRequestTitle(row: any) {
  const details = row?.event_details && typeof row.event_details === "object" ? row.event_details : {};
  const requestKind = String(details.request_kind || details.request_details?.request_kind || "request")
    .replace(/_/g, " ")
    .trim();
  const sender = details.sender_entity_name || "Sender";
  const receiver = details.receiver_entity_name || "Receiver";
  return `${requestKind || "Request"}: ${sender} to ${receiver}`;
}

function buildRelatedActivityRows(input: {
  gigApplications: any[];
  bookingRequests: any[];
  studioBookings: any[];
  profilesById: Map<string, any>;
  groupsById: Map<string, any>;
  gigsById: Map<string, any>;
}) {
  const activities: any[] = [];

  for (const row of input.gigApplications) {
    const applicant = formatPerson(input.profilesById.get(row.applicant_id), row.applicant_id);
    const submittedBy = formatPerson(input.profilesById.get(row.submitted_by_user_id), row.submitted_by_user_id);
    const group = row.group_id ? input.groupsById.get(row.group_id) : null;
    const gig = input.gigsById.get(row.gig_id);
    const performerSnapshot =
      row.performer_snapshot && typeof row.performer_snapshot === "object"
        ? row.performer_snapshot
        : {};
    const performerName =
      group?.name ||
      performerSnapshot.name ||
      performerSnapshot.display_name ||
      applicant.name ||
      "Applicant";

    activities.push({
      kind: "gig_application",
      id: row.id,
      title: `Gig application from ${performerName}`,
      status: row.status || "pending",
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
      primary_person: applicant,
      secondary_person: row.submitted_by_user_id && row.submitted_by_user_id !== row.applicant_id
        ? submittedBy
        : null,
      group: group
        ? {
            id: group.id,
            name: group.name,
            group_type: group.group_type,
          }
        : null,
      listing: gig
        ? {
            id: gig.id,
            name: gig.name,
            date: gig.event_date,
            location: gig.location,
            budget: gig.budget,
            status: gig.status,
          }
        : null,
      message: row.pitch_message || row.note || null,
      note: row.note || null,
      video_url: row.video_url || null,
      cv_url: row.cv_url || null,
      cancellation_reason: row.cancellation_reason || null,
      slot_type: row.slot_type || (row.is_solo_application ? "solo" : null),
      leader_approval_status: row.leader_approval_status || null,
      production_team_id: row.production_team_id || null,
      available_actions: getGigApplicationActions(row),
    });
  }

  for (const row of input.bookingRequests) {
    const details = row?.event_details && typeof row.event_details === "object" ? row.event_details : {};
    const requestDetails =
      details.request_details && typeof details.request_details === "object"
        ? details.request_details
        : {};
    const sender = formatPerson(input.profilesById.get(row.sender_id), row.sender_id);
    const receiver = formatPerson(input.profilesById.get(row.receiver_id), row.receiver_id);
    const group = row.group_id ? input.groupsById.get(row.group_id) : null;

    activities.push({
      kind: "booking_request",
      id: row.id,
      title: buildRequestTitle(row),
      status: row.status || "pending",
      created_at: row.created_at || null,
      updated_at: null,
      primary_person: sender,
      secondary_person: receiver,
      group: group
        ? {
            id: group.id,
            name: group.name,
            group_type: group.group_type,
          }
        : null,
      request_kind: details.request_kind || requestDetails.request_kind || null,
      sender_entity_type: details.sender_entity_type || null,
      sender_entity_name: details.sender_entity_name || null,
      receiver_entity_type: details.receiver_entity_type || null,
      receiver_entity_name: details.receiver_entity_name || null,
      message: requestDetails.pitch_message || row.message || null,
      note: requestDetails.application_context || null,
      attachment_url: row.attachment_url || requestDetails.cv_url || requestDetails.contract_url || null,
      studio_id: row.studio_id || null,
      production_team_id: details.production_team_id || null,
      event_details: details,
      available_actions: getBookingRequestActions(row),
    });
  }

  for (const row of input.studioBookings) {
    const customer = formatPerson(input.profilesById.get(row.user_id), row.user_id);

    activities.push({
      kind: "studio_booking",
      id: row.id,
      title: `Studio booking by ${customer.name || "customer"}`,
      status: row.status || "pending",
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
      primary_person: customer,
      secondary_person: null,
      booking_date: row.booking_date || null,
      start_time: row.start_time || null,
      end_time: row.end_time || null,
      session_type: row.session_type || null,
      hours: row.hours ?? null,
      final_price: row.final_price ?? null,
      payment_status: row.payment_status || null,
      payment_type: row.payment_type || null,
      remaining_balance: row.remaining_balance ?? null,
      notes: row.notes || null,
      proof_url: row.proof_url || null,
      cancellation_reason: row.cancellation_reason || null,
      available_actions: getStudioBookingActions(row),
    });
  }

  return activities.sort((a, b) =>
    String(b.created_at || b.updated_at || "").localeCompare(String(a.created_at || a.updated_at || "")),
  );
}

async function fetchAllStudioBookingsForStudio(client: any, studioId: string) {
  const pageSize = 1000;
  const rows: any[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await client
      .from("studio_bookings")
      .select(
        "id, user_id, studio_id, booking_date, start_time, end_time, base_rate, hours, subtotal, final_price, notes, status, created_at, updated_at, proof_url, reviewed_by_customer, reviewed_by_owner, cancellation_reason, check_in_time, payment_status, payment_amount, payment_type, remaining_balance, session_type",
      )
      .eq("studio_id", studioId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

async function fetchRelatedActivity(client: any, resourceType: ResourceType, resource: any) {
  const rowId = resource?.id;
  if (!rowId) return [];

  let gigApplications: any[] = [];
  let bookingRequests: any[] = [];
  let studioBookings: any[] = [];

  if (resourceType === "studio") {
    const [bookingRows, requestsResult] = await Promise.all([
      fetchAllStudioBookingsForStudio(client, rowId),
      client
        .from("booking_requests")
        .select("id, created_at, sender_id, receiver_id, group_id, message, status, event_details, attachment_url, studio_id")
        .eq("studio_id", rowId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (requestsResult.error) throw requestsResult.error;
    studioBookings = bookingRows;
    bookingRequests = requestsResult.data || [];
  } else if (resourceType === "venue") {
    const [applicationsResult, directRequestsResult, senderRequestsResult] = await Promise.all([
      client
        .from("gig_applications")
        .select(
          "id, applicant_id, group_id, gig_id, pitch_message, video_url, status, created_at, reviewed_by_applicant, reviewed_by_organizer, cancellation_reason, note, cv_url, is_solo_application, rejected_at, slot_type, submitted_by_user_id, leader_approval_status, leader_reviewed_at, production_team_id, production_roster_id, updated_at, performer_snapshot",
        )
        .eq("gig_id", rowId)
        .order("created_at", { ascending: false })
        .limit(75),
      client
        .from("booking_requests")
        .select("id, created_at, sender_id, receiver_id, group_id, message, status, event_details, attachment_url, studio_id")
        .contains("event_details", { listing_id: rowId })
        .order("created_at", { ascending: false })
        .limit(50),
      client
        .from("booking_requests")
        .select("id, created_at, sender_id, receiver_id, group_id, message, status, event_details, attachment_url, studio_id")
        .contains("event_details", { sender_entity_id: rowId })
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (applicationsResult.error) throw applicationsResult.error;
    if (directRequestsResult.error) throw directRequestsResult.error;
    if (senderRequestsResult.error) throw senderRequestsResult.error;
    gigApplications = applicationsResult.data || [];
    const requestsById = new Map<string, any>();
    for (const row of [...(directRequestsResult.data || []), ...(senderRequestsResult.data || [])]) {
      if (row?.id) requestsById.set(row.id, row);
    }
    bookingRequests = Array.from(requestsById.values());
  } else {
    const [applicationsResult, requestsResult] = await Promise.all([
      client
        .from("gig_applications")
        .select(
          "id, applicant_id, group_id, gig_id, pitch_message, video_url, status, created_at, reviewed_by_applicant, reviewed_by_organizer, cancellation_reason, note, cv_url, is_solo_application, rejected_at, slot_type, submitted_by_user_id, leader_approval_status, leader_reviewed_at, production_team_id, production_roster_id, updated_at, performer_snapshot",
        )
        .eq("production_team_id", rowId)
        .order("created_at", { ascending: false })
        .limit(75),
      client
        .from("booking_requests")
        .select("id, created_at, sender_id, receiver_id, group_id, message, status, event_details, attachment_url, studio_id")
        .contains("event_details", { production_team_id: rowId })
        .order("created_at", { ascending: false })
        .limit(75),
    ]);

    if (applicationsResult.error) throw applicationsResult.error;
    if (requestsResult.error) throw requestsResult.error;
    gigApplications = applicationsResult.data || [];
    bookingRequests = requestsResult.data || [];
  }

  const profileIds = [
    ...gigApplications.flatMap((row) => [row.applicant_id, row.submitted_by_user_id]),
    ...bookingRequests.flatMap((row) => [row.sender_id, row.receiver_id]),
    ...studioBookings.map((row) => row.user_id),
  ].filter(Boolean);
  const groupIds = [
    ...gigApplications.map((row) => row.group_id),
    ...bookingRequests.map((row) => row.group_id),
  ].filter(Boolean);
  const gigIds = gigApplications.map((row) => row.gig_id).filter(Boolean);

  const [profilesById, groupsById, gigsById] = await Promise.all([
    fetchProfilesByIds(client, profileIds),
    fetchGroupsByIds(client, groupIds),
    fetchGigsByIds(client, gigIds),
  ]);

  return buildRelatedActivityRows({
    gigApplications,
    bookingRequests,
    studioBookings,
    profilesById,
    groupsById,
    gigsById,
  });
}

function matchesSearch(item: any, searchTerm: string) {
  if (!searchTerm) return true;
  const haystack = [
    item.name,
    item.description,
    item.address,
    item.location,
    item.owner_name,
    item.owner_email,
    item.resource_type,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  return haystack.includes(searchTerm);
}

async function fetchStudioRows(client: any, limit: number, exactIds?: string[]) {
  let query = client
    .from("studios")
    .select(
      "id, owner_id, name, address, description, hourly_rate, rehearsal_rate, recording_rate, pax, contract_url, business_permit_url, latitude, longitude, permit_status, permit_rejection_reason, studio_type, created_at, owner:profiles!owner_id(id, full_name, email, role)",
    )
    .order("created_at", { ascending: false });

  query = exactIds && exactIds.length > 0 ? query.in("id", exactIds) : query.limit(limit);

  const { data, error } = await query;

  if (error) throw error;
  const rows = data || [];
  const rowIds = rows.map((item: any) => item.id).filter(Boolean);
  if (rowIds.length === 0) return [];

  const [typesResult, amenitiesResult, mediaResult, instrumentsResult] = await Promise.all([
    client.from("studio_types").select("studio_id, studio_type").in("studio_id", rowIds),
    client.from("studio_amenities").select("studio_id, amenity").in("studio_id", rowIds),
    client
      .from("studio_media")
      .select("studio_id, media_url, sort_order, created_at")
      .in("studio_id", rowIds)
      .eq("media_type", "image")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    client.from("studio_instruments").select("studio_id, instrument_name, image_url").in("studio_id", rowIds),
  ]);

  if (typesResult.error) throw typesResult.error;
  if (amenitiesResult.error) throw amenitiesResult.error;
  if (mediaResult.error) throw mediaResult.error;
  if (instrumentsResult.error) throw instrumentsResult.error;

  const byStudio = (sourceRows: any[], key: string) => {
    const result = new Map<string, any[]>();
    for (const row of sourceRows || []) {
      const studioId = row?.studio_id;
      if (!studioId) continue;
      if (!result.has(studioId)) result.set(studioId, []);
      result.get(studioId)?.push(row[key]);
    }
    return result;
  };

  const typesByStudio = byStudio(typesResult.data || [], "studio_type");
  const amenitiesByStudio = byStudio(amenitiesResult.data || [], "amenity");
  const imagesByStudio = byStudio(mediaResult.data || [], "media_url");
  const instrumentsByStudio = new Map<string, any[]>();
  for (const row of instrumentsResult.data || []) {
    if (!row?.studio_id || !row?.instrument_name) continue;
    if (!instrumentsByStudio.has(row.studio_id)) instrumentsByStudio.set(row.studio_id, []);
    instrumentsByStudio.get(row.studio_id)?.push({
      name: row.instrument_name,
      image: row.image_url || null,
    });
  }

  return rows.map((item: any) => {
    const owner = ownerFromRelation(item.owner);
    const types = typesByStudio.get(item.id) || normalizeStudioTypes(item.studio_type);
    const images = imagesByStudio.get(item.id) || [];

    return {
      ...item,
      resource_type: "studio",
      owner_name: owner?.full_name || "Unknown owner",
      owner_email: owner?.email || "",
      owner_role: owner?.role || "",
      studio_type: studioTypeLabel(types),
      studio_types: normalizeStudioTypes(types),
      amenities: amenitiesByStudio.get(item.id) || [],
      images,
      instruments: instrumentsByStudio.get(item.id) || [],
      location_label: item.address || "",
      primary_image_url: images[0] || null,
    };
  });
}

async function fetchVenueRows(client: any, limit: number, exactIds?: string[]) {
  let query = client
    .from("gigs")
    .select(
      "id, organizer_id, name, location, description, budget, event_date, status, contract_url, business_permit_url, latitude, longitude, permit_status, permit_rejection_reason, reapplication_cooldown_days, created_at, organizer:profiles!organizer_id(id, full_name, email, role)",
    )
    .order("created_at", { ascending: false });

  query = exactIds && exactIds.length > 0 ? query.in("id", exactIds) : query.limit(limit);

  const { data, error } = await query;

  if (error) throw error;
  const rows = data || [];
  const rowIds = rows.map((item: any) => item.id).filter(Boolean);
  if (rowIds.length === 0) return [];

  const [requirementsResult, mediaResult] = await Promise.all([
    client.from("gig_requirements").select("gig_id, requirement_key, requirement_value").in("gig_id", rowIds),
    client
      .from("gig_media")
      .select("gig_id, media_type, media_url, sort_order, created_at")
      .in("gig_id", rowIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (requirementsResult.error) throw requirementsResult.error;
  if (mediaResult.error) throw mediaResult.error;

  const requirementsByGig = new Map<string, Record<string, unknown>>();
  for (const row of requirementsResult.data || []) {
    if (!row?.gig_id || !row?.requirement_key) continue;
    if (!requirementsByGig.has(row.gig_id)) requirementsByGig.set(row.gig_id, {});
    requirementsByGig.get(row.gig_id)![row.requirement_key] = row.requirement_value;
  }

  const mediaByGig = new Map<string, { images: string[]; documents: string[] }>();
  for (const row of mediaResult.data || []) {
    if (!row?.gig_id || !row?.media_url) continue;
    if (!mediaByGig.has(row.gig_id)) mediaByGig.set(row.gig_id, { images: [], documents: [] });
    const target = row.media_type === "document" ? "documents" : "images";
    mediaByGig.get(row.gig_id)![target].push(row.media_url);
  }

  return rows.map((item: any) => {
    const owner = ownerFromRelation(item.organizer);
    const media = mediaByGig.get(item.id) || { images: [], documents: [] };

    return {
      ...item,
      resource_type: "venue",
      owner_id: item.organizer_id,
      owner_name: owner?.full_name || "Unknown owner",
      owner_email: owner?.email || "",
      owner_role: owner?.role || "",
      requirements: requirementsByGig.get(item.id) || {},
      images: media.images,
      documents: media.documents,
      location_label: item.location || "",
      primary_image_url: media.images[0] || null,
    };
  });
}

async function fetchProductionRows(client: any, limit: number, exactIds?: string[]) {
  let query = client
    .from("production_teams")
    .select(
      "id, owner_id, name, description, logo_url, open_production_applications, created_at, updated_at, owner:profiles!owner_id(id, full_name, email, role)",
    )
    .order("created_at", { ascending: false });

  query = exactIds && exactIds.length > 0 ? query.in("id", exactIds) : query.limit(limit);

  const { data, error } = await query;

  if (error) throw error;
  const rows = data || [];
  const rowIds = rows.map((item: any) => item.id).filter(Boolean);

  let memberCountByTeam = new Map<string, number>();
  if (rowIds.length > 0) {
    const { data: members, error: memberError } = await client
      .from("production_team_members")
      .select("team_id")
      .in("team_id", rowIds);
    if (memberError) throw memberError;
    memberCountByTeam = (members || []).reduce((acc: Map<string, number>, row: any) => {
      const teamId = row?.team_id;
      if (!teamId) return acc;
      acc.set(teamId, (acc.get(teamId) || 0) + 1);
      return acc;
    }, new Map<string, number>());
  }

  return rows.map((item: any) => {
    const owner = ownerFromRelation(item.owner);
    return {
      ...item,
      resource_type: "production",
      owner_name: owner?.full_name || "Unknown owner",
      owner_email: owner?.email || "",
      owner_role: owner?.role || "",
      member_count: memberCountByTeam.get(item.id) || 0,
      location_label: "Production team",
      primary_image_url: item.logo_url || null,
    };
  });
}

async function listResources(client: any, params: Record<string, unknown>) {
  const requestedType = parseResourceType(params.resource_type ?? params.resourceType);
  const searchTerm = String(params.search || "").trim().toLowerCase();
  const perTypeLimit = Math.min(Number(params.limit) || 150, 300);

  const loaders: Promise<any[]>[] = [];
  if (!requestedType || requestedType === "studio") loaders.push(fetchStudioRows(client, perTypeLimit));
  if (!requestedType || requestedType === "venue") loaders.push(fetchVenueRows(client, perTypeLimit));
  if (!requestedType || requestedType === "production") loaders.push(fetchProductionRows(client, perTypeLimit));

  const rows = (await Promise.all(loaders))
    .flat()
    .filter((item) => matchesSearch(item, searchTerm))
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));

  return rows;
}

async function getResource(client: any, resourceType: ResourceType, id: string) {
  const rows =
    resourceType === "studio"
      ? await fetchStudioRows(client, 1, [id])
      : resourceType === "venue"
        ? await fetchVenueRows(client, 1, [id])
        : await fetchProductionRows(client, 1, [id]);

  const item = rows[0] || null;
  if (!item) return null;

  return {
    ...item,
    related_activity: await fetchRelatedActivity(client, resourceType, item),
  };
}

async function replaceStudioChildren(client: any, studioId: string, payload: Record<string, unknown>) {
  if (payload.studio_type !== undefined || payload.studio_types !== undefined || payload.type !== undefined) {
    const types = normalizeStudioTypes(payload.studio_types ?? payload.studio_type ?? payload.type);
    const { error: deleteError } = await client.from("studio_types").delete().eq("studio_id", studioId);
    if (deleteError) throw deleteError;
    const { error } = await client
      .from("studio_types")
      .insert(types.map((studio_type) => ({ studio_id: studioId, studio_type })));
    if (error) throw error;
  }

  if (payload.amenities !== undefined) {
    const amenities = stringList(payload.amenities);
    const { error: deleteError } = await client.from("studio_amenities").delete().eq("studio_id", studioId);
    if (deleteError) throw deleteError;
    if (amenities.length > 0) {
      const { error } = await client
        .from("studio_amenities")
        .insert(amenities.map((amenity) => ({ studio_id: studioId, amenity })));
      if (error) throw error;
    }
  }

  if (payload.images !== undefined) {
    const images = normalizeImages(payload.images);
    const { error: deleteError } = await client
      .from("studio_media")
      .delete()
      .eq("studio_id", studioId)
      .eq("media_type", "image");
    if (deleteError) throw deleteError;
    if (images.length > 0) {
      const { error } = await client.from("studio_media").insert(
        images.map((media_url, index) => ({
          studio_id: studioId,
          media_type: "image",
          media_url,
          sort_order: index,
        })),
      );
      if (error) throw error;
    }
  }

  if (payload.instruments !== undefined) {
    const instruments = normalizeInstruments(payload.instruments);
    const { error: deleteError } = await client.from("studio_instruments").delete().eq("studio_id", studioId);
    if (deleteError) throw deleteError;
    if (instruments.length > 0) {
      const { error } = await client.from("studio_instruments").insert(
        instruments.map((instrument) => ({
          studio_id: studioId,
          instrument_name: instrument.name,
          image_url: instrument.image || null,
        })),
      );
      if (error) throw error;
    }
  }
}

async function replaceGigChildren(client: any, gigId: string, payload: Record<string, unknown>) {
  if (
    payload.requirements !== undefined ||
    payload.genres !== undefined ||
    payload.instruments !== undefined ||
    payload.event_start_time !== undefined ||
    payload.event_end_time !== undefined ||
    payload.experience_level !== undefined ||
    payload.musician_type !== undefined
  ) {
    const requirements = buildGigRequirements(payload);
    const { error: deleteError } = await client.from("gig_requirements").delete().eq("gig_id", gigId);
    if (deleteError) throw deleteError;

    const rows = Object.entries(requirements)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([requirement_key, requirement_value]) => ({
        gig_id: gigId,
        requirement_key,
        requirement_value,
      }));

    if (rows.length > 0) {
      const { error } = await client.from("gig_requirements").insert(rows);
      if (error) throw error;
    }
  }

  if (payload.images !== undefined) {
    const images = normalizeImages(payload.images);
    const { error: deleteError } = await client
      .from("gig_media")
      .delete()
      .eq("gig_id", gigId)
      .eq("media_type", "image");
    if (deleteError) throw deleteError;
    if (images.length > 0) {
      const { error } = await client.from("gig_media").insert(
        images.map((media_url, index) => ({
          gig_id: gigId,
          media_type: "image",
          media_url,
          sort_order: index,
        })),
      );
      if (error) throw error;
    }
  }

  if (payload.documents !== undefined) {
    const documents = stringList(payload.documents);
    const { error: deleteError } = await client
      .from("gig_media")
      .delete()
      .eq("gig_id", gigId)
      .eq("media_type", "document");
    if (deleteError) throw deleteError;
    if (documents.length > 0) {
      const { error } = await client.from("gig_media").insert(
        documents.map((media_url, index) => ({
          gig_id: gigId,
          media_type: "document",
          media_url,
          sort_order: index,
        })),
      );
      if (error) throw error;
    }
  }
}

async function createDefaultStudioSettings(client: any, studioId: string, studioType: string) {
  const { error: settingsError } = await client.from("studio_settings").upsert(
    {
      studio_id: studioId,
      min_booking_duration_hours: studioType === "Recording" || studioType === "Both" ? 3 : 2,
      recording_songs_per_block: 1,
      recording_hours_per_block: 3,
      recording_rate_negotiable: false,
      weekly_schedule_scope: "indefinite",
      weekly_schedule_dates: [],
      buffer_minutes: 30,
      bulk_discount_threshold_hours: 10,
      bulk_discount_percentage: 0,
    },
    { onConflict: "studio_id" },
  );
  if (settingsError) throw settingsError;

  const { data: existingHours, error: existingHoursError } = await client
    .from("studio_operating_hours")
    .select("id")
    .eq("studio_id", studioId)
    .limit(1);
  if (existingHoursError) throw existingHoursError;
  if (existingHours?.length) return;

  const hours = Array.from({ length: 7 }, (_, day) => ({
    studio_id: studioId,
    day_of_week: day,
    is_open: true,
    open_time: "09:00",
    close_time: "22:00",
    slot_order: 0,
    weekly_schedule_scope: "indefinite",
    weekly_schedule_dates: [],
    reason: "Weekly schedule [session_type:both]",
  }));

  const { error: hoursError } = await client.from("studio_operating_hours").insert(hours);
  if (hoursError) throw hoursError;
}

async function createResource(client: any, resourceType: ResourceType, payload: Record<string, unknown>) {
  const ownerId = requiredText(payload.owner_id ?? payload.ownerId, "Owner");
  const name = requiredText(payload.name, "Name");

  if (resourceType === "studio") {
    const types = normalizeStudioTypes(payload.studio_types ?? payload.studio_type ?? payload.type);
    const typeLabel = studioTypeLabel(types);
    const basePayload = {
      owner_id: ownerId,
      name,
      description: nullableText(payload.description),
      address: nullableText(payload.address),
      hourly_rate: numberOrNull(payload.hourly_rate),
      rehearsal_rate: numberOrNull(payload.rehearsal_rate),
      recording_rate: numberOrNull(payload.recording_rate),
      pax: integerOrNull(payload.pax),
      contract_url: nullableText(payload.contract_url),
      business_permit_url: nullableText(payload.business_permit_url),
      latitude: numberOrNull(payload.latitude),
      longitude: numberOrNull(payload.longitude),
      permit_status: normalizePermitStatus(payload.permit_status),
      studio_type: typeLabel,
    };

    const { data, error } = await client.from("studios").insert(basePayload).select().single();
    if (error) throw error;
    await replaceStudioChildren(client, data.id, { ...payload, studio_types: types });
    await createDefaultStudioSettings(client, data.id, typeLabel);
    return data;
  }

  if (resourceType === "venue") {
    const basePayload = {
      organizer_id: ownerId,
      name,
      description: nullableText(payload.description),
      location: nullableText(payload.location ?? payload.address),
      budget: numberOrNull(payload.budget),
      event_date: nullableText(payload.event_date),
      status: normalizeGigStatus(payload.status),
      contract_url: nullableText(payload.contract_url),
      business_permit_url: nullableText(payload.business_permit_url),
      latitude: numberOrNull(payload.latitude),
      longitude: numberOrNull(payload.longitude),
      reapplication_cooldown_days: integerOrNull(payload.reapplication_cooldown_days) ?? 30,
      permit_status: normalizePermitStatus(payload.permit_status),
    };

    const { data, error } = await client.from("gigs").insert(basePayload).select().single();
    if (error) throw error;
    await replaceGigChildren(client, data.id, payload);
    return data;
  }

  const { data, error } = await client
    .from("production_teams")
    .insert({
      owner_id: ownerId,
      name,
      description: nullableText(payload.description),
      logo_url: nullableText(payload.logo_url),
      open_production_applications: payload.open_production_applications !== false,
    })
    .select()
    .single();

  if (error) throw error;
  const { error: memberError } = await client.from("production_team_members").upsert(
    {
      team_id: data.id,
      user_id: ownerId,
      role: "owner",
    },
    { onConflict: "team_id,user_id" },
  );
  if (memberError) throw memberError;
  return data;
}

async function updateResource(client: any, resourceType: ResourceType, id: string, payload: Record<string, unknown>) {
  if (!id) throw new Error("id is required");
  const nextName = nullableText(payload.name);

  if (resourceType === "studio") {
    const types = payload.studio_type !== undefined || payload.studio_types !== undefined || payload.type !== undefined
      ? normalizeStudioTypes(payload.studio_types ?? payload.studio_type ?? payload.type)
      : null;
    const updatePayload: Record<string, unknown> = {
      ...(nextName ? { name: nextName } : {}),
      ...(payload.owner_id !== undefined ? { owner_id: requiredText(payload.owner_id, "Owner") } : {}),
      ...(payload.description !== undefined ? { description: nullableText(payload.description) } : {}),
      ...(payload.address !== undefined ? { address: nullableText(payload.address) } : {}),
      ...(payload.hourly_rate !== undefined ? { hourly_rate: numberOrNull(payload.hourly_rate) } : {}),
      ...(payload.rehearsal_rate !== undefined ? { rehearsal_rate: numberOrNull(payload.rehearsal_rate) } : {}),
      ...(payload.recording_rate !== undefined ? { recording_rate: numberOrNull(payload.recording_rate) } : {}),
      ...(payload.pax !== undefined ? { pax: integerOrNull(payload.pax) } : {}),
      ...(payload.contract_url !== undefined ? { contract_url: nullableText(payload.contract_url) } : {}),
      ...(payload.business_permit_url !== undefined ? { business_permit_url: nullableText(payload.business_permit_url) } : {}),
      ...(payload.latitude !== undefined ? { latitude: numberOrNull(payload.latitude) } : {}),
      ...(payload.longitude !== undefined ? { longitude: numberOrNull(payload.longitude) } : {}),
      ...(payload.permit_status !== undefined ? { permit_status: normalizePermitStatus(payload.permit_status) } : {}),
      ...(types ? { studio_type: studioTypeLabel(types) } : {}),
    };

    const { data, error } = await client.from("studios").update(updatePayload).eq("id", id).select().single();
    if (error) throw error;
    await replaceStudioChildren(client, id, types ? { ...payload, studio_types: types } : payload);
    if (types) await createDefaultStudioSettings(client, id, studioTypeLabel(types));
    return data;
  }

  if (resourceType === "venue") {
    const updatePayload: Record<string, unknown> = {
      ...(nextName ? { name: nextName } : {}),
      ...(payload.owner_id !== undefined ? { organizer_id: requiredText(payload.owner_id, "Owner") } : {}),
      ...(payload.description !== undefined ? { description: nullableText(payload.description) } : {}),
      ...(payload.location !== undefined || payload.address !== undefined
        ? { location: nullableText(payload.location ?? payload.address) }
        : {}),
      ...(payload.budget !== undefined ? { budget: numberOrNull(payload.budget) } : {}),
      ...(payload.event_date !== undefined ? { event_date: nullableText(payload.event_date) } : {}),
      ...(payload.status !== undefined ? { status: normalizeGigStatus(payload.status) } : {}),
      ...(payload.contract_url !== undefined ? { contract_url: nullableText(payload.contract_url) } : {}),
      ...(payload.business_permit_url !== undefined ? { business_permit_url: nullableText(payload.business_permit_url) } : {}),
      ...(payload.latitude !== undefined ? { latitude: numberOrNull(payload.latitude) } : {}),
      ...(payload.longitude !== undefined ? { longitude: numberOrNull(payload.longitude) } : {}),
      ...(payload.reapplication_cooldown_days !== undefined
        ? { reapplication_cooldown_days: integerOrNull(payload.reapplication_cooldown_days) ?? 30 }
        : {}),
      ...(payload.permit_status !== undefined ? { permit_status: normalizePermitStatus(payload.permit_status) } : {}),
    };

    const { data, error } = await client.from("gigs").update(updatePayload).eq("id", id).select().single();
    if (error) throw error;
    await replaceGigChildren(client, id, payload);
    return data;
  }

  const nextOwnerId = nullableText(payload.owner_id);
  const updatePayload: Record<string, unknown> = {
    ...(nextName ? { name: nextName } : {}),
    ...(nextOwnerId ? { owner_id: nextOwnerId } : {}),
    ...(payload.description !== undefined ? { description: nullableText(payload.description) } : {}),
    ...(payload.logo_url !== undefined ? { logo_url: nullableText(payload.logo_url) } : {}),
    ...(payload.open_production_applications !== undefined
      ? { open_production_applications: payload.open_production_applications === true }
      : {}),
  };

  const { data, error } = await client.from("production_teams").update(updatePayload).eq("id", id).select().single();
  if (error) throw error;

  if (nextOwnerId) {
    const { error: memberError } = await client.from("production_team_members").upsert(
      {
        team_id: id,
        user_id: nextOwnerId,
        role: "owner",
      },
      { onConflict: "team_id,user_id" },
    );
    if (memberError) throw memberError;
  }

  return data;
}

async function deleteResource(client: any, resourceType: ResourceType, id: string, reason: string, adminUserId: string) {
  if (!id) throw new Error("id is required");

  if (resourceType === "studio") {
    const { count, error: countError } = await client
      .from("studio_bookings")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", id)
      .in("status", ["pending", "confirmed", "checked_in", "pending_relocation"]);
    if (countError) throw countError;
    if ((count || 0) > 0) {
      return jsonResponse({
        success: false,
        code: "ACTIVE_BOOKINGS_EXIST",
        message: "Resolve active bookings before deleting this studio.",
        active_booking_count: count,
      }, 409);
    }

    await client.from("booking_requests").update({ studio_id: null }).eq("studio_id", id);
    const { error } = await client.from("studios").delete().eq("id", id);
    if (error) throw error;
    return jsonResponse({ success: true });
  }

  if (resourceType === "venue") {
    const { data: gig, error: gigError } = await client
      .from("gigs")
      .select("id, name")
      .eq("id", id)
      .maybeSingle();
    if (gigError) throw gigError;
    if (!gig) return jsonResponse({ error: "Venue not found" }, 404);

    const { data: applications, error: applicationsError } = await client
      .from("gig_applications")
      .select("applicant_id, status")
      .eq("gig_id", id)
      .in("status", ["pending", "accepted"]);
    if (applicationsError) throw applicationsError;

    const notifications = (applications || [])
      .filter((application: any) => application?.applicant_id)
      .map((application: any) => ({
        user_id: application.applicant_id,
        type: application.status === "accepted" ? "error" : "warning",
        title: "Venue gig removed",
        message: `${gig.name || "A venue gig"} was removed by admin. ${reason}`.trim(),
        read: false,
        meta: {
          type: "admin_listing_deleted",
          resource_type: "venue",
          gig_id: id,
          deleted_by: adminUserId,
        },
      }));

    if (notifications.length > 0) {
      const { error: notifyError } = await client.from("notifications").insert(notifications);
      if (notifyError) console.error("Failed to notify venue applicants", notifyError);
    }

    const { error } = await client.from("gigs").delete().eq("id", id);
    if (error) throw error;
    return jsonResponse({ success: true });
  }

  const { error: clearError } = await client
    .from("gig_applications")
    .update({ production_team_id: null, production_roster_id: null })
    .eq("production_team_id", id);
  if (clearError) throw clearError;

  const { error } = await client.from("production_teams").delete().eq("id", id);
  if (error) throw error;
  return jsonResponse({ success: true });
}

function parseRelatedActivityKind(value: unknown): RelatedActivityKind | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "gig_application") return "gig_application";
  if (normalized === "booking_request") return "booking_request";
  if (normalized === "studio_booking") return "studio_booking";
  return null;
}

function getNegativeActionReason(params: Record<string, unknown>) {
  return nullableText(params.reason) || "Updated by admin from Manage.";
}

async function updateGigApplicationActivity(client: any, id: string, action: string, params: Record<string, unknown>) {
  const { data: existing, error: existingError } = await client
    .from("gig_applications")
    .select("id, status, leader_approval_status")
    .eq("id", id)
    .maybeSingle();

  if (existingError) throw existingError;
  if (!existing) return jsonResponse({ error: "Application not found" }, 404);

  const status = normalizeStatus(existing.status);
  const leaderStatus = normalizeStatus(existing.leader_approval_status);
  const updatePayload: Record<string, unknown> = {};

  if (action === "approve_leader" || action === "reject_leader") {
    if (leaderStatus !== "pending") {
      return jsonResponse({ error: "This leader confirmation is no longer pending." }, 409);
    }
    updatePayload.leader_approval_status = action === "approve_leader" ? "approved" : "rejected";
    updatePayload.leader_reviewed_at = new Date().toISOString();
  } else if (action === "accept" || action === "decline") {
    if (status !== "pending") {
      return jsonResponse({ error: "Only pending applications can be accepted or declined." }, 409);
    }
    updatePayload.status = action === "accept" ? "accepted" : "rejected";
    if (action === "decline") updatePayload.cancellation_reason = getNegativeActionReason(params);
  } else if (action === "complete" || action === "fire" || action === "cancel") {
    if (status !== "accepted" && status !== "approved") {
      return jsonResponse({ error: "Only active applications can be completed, fired, or cancelled." }, 409);
    }
    updatePayload.status =
      action === "complete" ? "completed" : action === "fire" ? "fired" : "cancelled";
    if (action !== "complete") updatePayload.cancellation_reason = getNegativeActionReason(params);
  } else {
    return jsonResponse({ error: "Unsupported application action" }, 400);
  }

  const { data, error } = await client
    .from("gig_applications")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) return jsonResponse({ error: "Application was not updated" }, 404);
  return jsonResponse({ success: true, data });
}

async function updateBookingRequestActivity(client: any, id: string, action: string) {
  if (action !== "accept" && action !== "decline") {
    return jsonResponse({ error: "Unsupported request action" }, 400);
  }

  const nextStatus = action === "accept" ? "accepted" : "declined";
  const { data, error } = await client
    .from("booking_requests")
    .update({ status: nextStatus })
    .eq("id", id)
    .eq("status", "pending")
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) return jsonResponse({ error: "This request is no longer pending." }, 409);
  return jsonResponse({ success: true, data });
}

async function updateStudioBookingActivity(client: any, id: string, action: string, params: Record<string, unknown>) {
  const { data: existing, error: existingError } = await client
    .from("studio_bookings")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (existingError) throw existingError;
  if (!existing) return jsonResponse({ error: "Booking not found" }, 404);

  const status = normalizeStatus(existing.status);
  const updatePayload: Record<string, unknown> = {};

  if (action === "confirm") {
    if (status !== "pending") return jsonResponse({ error: "Only pending bookings can be confirmed." }, 409);
    updatePayload.status = "confirmed";
  } else if (action === "complete") {
    if (status !== "confirmed" && status !== "checked_in") {
      return jsonResponse({ error: "Only active bookings can be completed." }, 409);
    }
    updatePayload.status = "completed";
  } else if (action === "cancel") {
    if (!["pending", "confirmed", "checked_in", "pending_relocation"].includes(status)) {
      return jsonResponse({ error: "This booking can no longer be cancelled." }, 409);
    }
    updatePayload.status = "cancelled";
    updatePayload.cancellation_reason = getNegativeActionReason(params);
  } else {
    return jsonResponse({ error: "Unsupported booking action" }, 400);
  }

  const { data, error } = await client
    .from("studio_bookings")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) return jsonResponse({ error: "Booking was not updated" }, 404);
  return jsonResponse({ success: true, data });
}

async function updateRelatedActivity(client: any, params: Record<string, unknown>) {
  const kind = parseRelatedActivityKind(params.kind ?? params.activity_kind ?? params.type_id);
  const id = requiredText(params.id ?? params.activity_id, "activity id");
  const action = String(params.activity_action ?? params.next_action ?? params.action_key ?? "")
    .trim()
    .toLowerCase();

  if (!kind) return jsonResponse({ error: "Unsupported activity kind" }, 400);
  if (!action) return jsonResponse({ error: "activity_action is required" }, 400);

  if (kind === "gig_application") {
    return await updateGigApplicationActivity(client, id, action, params);
  }

  if (kind === "booking_request") {
    return await updateBookingRequestActivity(client, id, action);
  }

  return await updateStudioBookingActivity(client, id, action, params);
}

async function ownerOptions(client: any, params: Record<string, unknown>) {
  const resourceType = parseResourceType(params.resource_type ?? params.resourceType);
  const expectedRole =
    resourceType === "studio"
      ? "studio-owner"
      : resourceType === "venue"
        ? "venue-owner"
        : resourceType === "production"
          ? "producer"
          : null;
  const searchTerm = String(params.search || "").trim().toLowerCase();

  let query = client
    .from("profiles")
    .select("id, full_name, email, role")
    .order("full_name", { ascending: true })
    .limit(100);

  if (expectedRole) query = query.eq("role", expectedRole);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data || []).filter((profile: any) => {
    if (!searchTerm) return true;
    return [profile.full_name, profile.email, profile.id]
      .map((value) => String(value || "").toLowerCase())
      .join(" ")
      .includes(searchTerm);
  });

  return rows;
}

serve(async (req: Request) => {
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

    const authAdmin = createServiceClient(supabaseUrl, serviceRoleKey);
    const admin = await requireAdmin(authAdmin, accessToken);
    if (admin.error) return admin.error;

    const supabaseAdmin = createServiceClient(supabaseUrl, serviceRoleKey, {
      actorUserId: admin.userId,
      actorRole: "admin",
      source: "admin-listings-management",
    });

    const { action, ...params } = await req.json();
    const resourceType = parseResourceType(params.resource_type ?? params.resourceType);

    if (action === "admin_list_resources") {
      const data = await listResources(supabaseAdmin, params);
      return jsonResponse({ success: true, data });
    }

    if (action === "admin_get_resource") {
      if (!resourceType) return jsonResponse({ error: "Unsupported resource type" }, 400);
      const id = requiredText(params.id, "id");
      const item = await getResource(supabaseAdmin, resourceType, id);
      if (!item) return jsonResponse({ error: "Resource not found" }, 404);
      return jsonResponse({ success: true, data: item });
    }

    if (action === "admin_owner_options") {
      const data = await ownerOptions(supabaseAdmin, params);
      return jsonResponse({ success: true, data });
    }

    if (action === "admin_create_resource") {
      if (!resourceType) return jsonResponse({ error: "Unsupported resource type" }, 400);
      const data = await createResource(supabaseAdmin, resourceType, objectValue(params.payload));
      return jsonResponse({ success: true, data });
    }

    if (action === "admin_update_resource") {
      if (!resourceType) return jsonResponse({ error: "Unsupported resource type" }, 400);
      const data = await updateResource(
        supabaseAdmin,
        resourceType,
        requiredText(params.id, "id"),
        objectValue(params.payload),
      );
      return jsonResponse({ success: true, data });
    }

    if (action === "admin_delete_resource") {
      if (!resourceType) return jsonResponse({ error: "Unsupported resource type" }, 400);
      return await deleteResource(
        supabaseAdmin,
        resourceType,
        requiredText(params.id, "id"),
        nullableText(params.reason) || "Deleted by admin.",
        admin.userId,
      );
    }

    if (action === "admin_update_related_activity") {
      return await updateRelatedActivity(supabaseAdmin, params);
    }

    return jsonResponse({ error: `Unsupported action: ${action}` }, 400);
  } catch (err: any) {
    console.error("admin-listings-management error:", err);
    return jsonResponse({ error: err?.message || "Internal server error" }, 500);
  }
});
