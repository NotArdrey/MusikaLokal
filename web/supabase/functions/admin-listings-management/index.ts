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

  return rows[0] || null;
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

    return jsonResponse({ error: `Unsupported action: ${action}` }, 400);
  } catch (err: any) {
    console.error("admin-listings-management error:", err);
    return jsonResponse({ error: err?.message || "Internal server error" }, 500);
  }
});
