// @ts-ignore
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

const MAX_PLAYLIST_TRACK_DURATION_SECONDS = 300;
const DEFAULT_STATION_ROTATION_INTERVAL_MINUTES = 15;
const MIN_STATION_ROTATION_INTERVAL_MINUTES = 5;
const MAX_STATION_ROTATION_INTERVAL_MINUTES = 120;
const DEFAULT_STATION_CONCURRENT_SLOT_LIMIT = 4;
const MAX_STATION_CONCURRENT_SLOT_LIMIT = 4;
const ADMIN_STATION_SOURCE_PLAYLIST_LIMIT = 500;

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

const PUBLIC_ACTIONS = new Set([
  "browse_playlists",
  "browse_stations",
  "get_playlist_details",
  "get_station_details",
  "list_user_playlists",
  "list_user_stations",
  "record_play_event",
]);

function normalizeOptionalDurationSeconds(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("duration_seconds must be a number greater than zero");
  }

  if (parsed > MAX_PLAYLIST_TRACK_DURATION_SECONDS) {
    throw new Error(`Tracks must be ${MAX_PLAYLIST_TRACK_DURATION_SECONDS} seconds or less`);
  }

  return Math.round(parsed);
}

function normalizeOptionalAudioUrl(value: unknown): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch (_) {
    throw new Error("audio_url must be a valid http or https URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("audio_url must be a valid http or https URL");
  }

  return trimmed;
}

function normalizePositiveInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(parsed), minimum), maximum);
}

function readTimestampMs(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const timestampMs = Date.parse(value);
  if (!Number.isFinite(timestampMs)) {
    return null;
  }

  return timestampMs;
}

function getStationRotationIntervalMinutes(station: any) {
  return normalizePositiveInteger(
    station?.rotation_interval_minutes,
    DEFAULT_STATION_ROTATION_INTERVAL_MINUTES,
    MIN_STATION_ROTATION_INTERVAL_MINUTES,
    MAX_STATION_ROTATION_INTERVAL_MINUTES,
  );
}

function normalizeStationRotationIntervalMinutes(value: unknown) {
  return normalizePositiveInteger(
    value,
    DEFAULT_STATION_ROTATION_INTERVAL_MINUTES,
    MIN_STATION_ROTATION_INTERVAL_MINUTES,
    MAX_STATION_ROTATION_INTERVAL_MINUTES,
  );
}

function getStationConcurrentSlotLimit(station: any) {
  return normalizePositiveInteger(
    station?.concurrent_slot_limit,
    DEFAULT_STATION_CONCURRENT_SLOT_LIMIT,
    1,
    MAX_STATION_CONCURRENT_SLOT_LIMIT,
  );
}

function getStationRotationBaseTimestampMs(station: any, slots: any[]) {
  const slotTimestamps = slots
    .flatMap((slot: any) => [slot?.updated_at, slot?.created_at, slot?.starts_at])
    .map(readTimestampMs)
    .filter((value): value is number => value !== null);

  const stationTimestamps = [station?.updated_at, station?.created_at]
    .map(readTimestampMs)
    .filter((value): value is number => value !== null);

  const candidateTimestamps = [...slotTimestamps, ...stationTimestamps];
  if (candidateTimestamps.length === 0) {
    return null;
  }

  return Math.max(...candidateTimestamps);
}

async function getRequesterRole(supabaseAdmin: any, authUser: any, uid: string) {
  const metadataRole = typeof authUser?.user_metadata?.role === "string"
    ? authUser.user_metadata.role.trim().toLowerCase()
    : typeof authUser?.app_metadata?.role === "string"
      ? authUser.app_metadata.role.trim().toLowerCase()
      : null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", uid)
    .maybeSingle();

  const profileRole = typeof profile?.role === "string"
    ? profile.role.trim().toLowerCase()
    : null;

  return profileRole || metadataRole;
}

function normalizeProfileId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveManagedProfileId(
  requesterRole: string | null,
  uid: string,
  rawManagedProfileId: unknown,
) {
  const normalized = normalizeProfileId(rawManagedProfileId);

  if (requesterRole === "admin") {
    return normalized || uid;
  }

  return uid;
}

async function transferManagedProfileStationsToAdmin(
  supabaseAdmin: any,
  adminUserId: string,
  managedProfileId: string,
) {
  const { error } = await supabaseAdmin
    .from("stations")
    .update({ creator_id: adminUserId, managed_profile_id: managedProfileId })
    .eq("managed_profile_id", managedProfileId)
    .neq("creator_id", adminUserId);

  if (error) {
    throw error;
  }
}

async function getPrimaryManagedStation(supabaseAdmin: any, managedProfileId: string) {
  const { data, error } = await supabaseAdmin
    .from("stations")
    .select("id, creator_id, managed_profile_id")
    .eq("managed_profile_id", managedProfileId)
    .is("managed_group_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function getPrimaryManagedSourceStation(
  supabaseAdmin: any,
  sourceKind: "profile" | "group",
  sourceId: string,
  managedProfileId?: string | null,
) {
  let query = supabaseAdmin
    .from("stations")
    .select("id, creator_id, managed_profile_id, managed_group_id, is_active, is_featured")
    .order("created_at", { ascending: false })
    .limit(1);

  if (sourceKind === "group") {
    query = query.eq("managed_group_id", sourceId);
  } else {
    query = query.eq("managed_profile_id", managedProfileId || sourceId).is("managed_group_id", null);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw error;
  }

  return data;
}

async function transferStationToAdminIfNeeded(
  supabaseAdmin: any,
  station: { id?: string | null; creator_id?: string | null; managed_profile_id?: string | null },
  adminUserId: string,
) {
  const stationId = typeof station?.id === "string" ? station.id : null;
  const managedProfileId = station?.managed_profile_id || station?.creator_id || null;

  if (!stationId || !managedProfileId || station?.creator_id === adminUserId) {
    return;
  }

  const { error } = await supabaseAdmin
    .from("stations")
    .update({ creator_id: adminUserId, managed_profile_id: managedProfileId })
    .eq("id", stationId);

  if (error) {
    throw error;
  }
}

function getProfileDisplayName(profile: any) {
  const fullName = typeof profile?.full_name === "string" ? profile.full_name.trim() : "";
  return fullName || "Unknown artist";
}

function getGroupDisplayName(group: any) {
  const name = typeof group?.name === "string" ? group.name.trim() : "";
  return name || "Untitled group";
}

function getGroupTypeLabel(groupType: unknown) {
  const normalized = typeof groupType === "string" ? groupType.toLowerCase() : "";
  if (normalized === "duo") return "Duo";
  if (normalized === "solo") return "Solo";
  return "Group";
}

function getFirstImage(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const first = value.find((item) => typeof item === "string" && item.trim().length > 0);
  return typeof first === "string" ? first.trim() : null;
}

function filterPublicVisiblePlaylists(query: any) {
  return query
    .eq("visibility", "public")
    .or("is_hidden.is.false,is_hidden.is.null");
}

function getSourceStationSummary(stationsBySourceKey: Map<string, any>, sourceKey: string) {
  const station = stationsBySourceKey.get(sourceKey);
  if (!station) {
    return null;
  }

  return {
    id: station.id,
    name: station.name,
    description: station.description,
    genre: station.genre,
    cover_image_url: station.cover_image_url,
    is_active: station.is_active,
    is_featured: station.is_featured,
    rotation_interval_minutes: station.rotation_interval_minutes,
    slot_count: station.slot_count || 0,
    slot_playlist_ids: station.slot_playlist_ids || [],
  };
}

async function getStationPlaylistIdsByStationId(supabaseAdmin: any, stationIds: string[]) {
  const result = new Map<string, string[]>();

  if (stationIds.length === 0) {
    return result;
  }

  const { data, error } = await supabaseAdmin
    .from("station_playlist_slots")
    .select("station_id, playlist_id, position")
    .in("station_id", stationIds)
    .order("position");

  if (error) {
    throw error;
  }

  for (const row of data || []) {
    const stationId = typeof row?.station_id === "string" ? row.station_id : "";
    const playlistId = typeof row?.playlist_id === "string" ? row.playlist_id : "";
    if (!stationId || !playlistId) {
      continue;
    }

    const next = result.get(stationId) || [];
    next.push(playlistId);
    result.set(stationId, next);
  }

  return result;
}

async function listAdminStationSources(supabaseAdmin: any) {
  const { data: playlists, error: playlistError } = await filterPublicVisiblePlaylists(
    supabaseAdmin
      .from("playlists")
      .select("id, creator_id, title, description, genre, cover_image_url, track_count, created_at, creator:profiles!creator_id(id, full_name, avatar_url, role)"),
  )
    .order("created_at", { ascending: false })
    .limit(ADMIN_STATION_SOURCE_PLAYLIST_LIMIT);

  if (playlistError) {
    throw playlistError;
  }

  const playlistRows = playlists || [];
  const playlistIds = playlistRows
    .map((playlist: any) => (typeof playlist?.id === "string" ? playlist.id : ""))
    .filter((playlistId: string) => playlistId.length > 0);

  const [{ data: groupLinks, error: groupLinksError }, { data: stations, error: stationsError }] = await Promise.all([
    playlistIds.length > 0
      ? supabaseAdmin
          .from("group_playlists")
          .select("group_id, playlist_id, position")
          .in("playlist_id", playlistIds)
      : Promise.resolve({ data: [], error: null }),
    supabaseAdmin
      .from("stations")
      .select("id, creator_id, name, description, genre, cover_image_url, is_active, is_featured, rotation_interval_minutes, managed_profile_id, managed_group_id"),
  ]);

  if (groupLinksError) {
    throw groupLinksError;
  }

  if (stationsError) {
    throw stationsError;
  }

  const stationIds = (stations || [])
    .map((station: any) => (typeof station?.id === "string" ? station.id : ""))
    .filter((stationId: string) => stationId.length > 0);
  const stationPlaylistIds = await getStationPlaylistIdsByStationId(supabaseAdmin, stationIds);

  const stationsBySourceKey = new Map<string, any>();
  for (const station of stations || []) {
    if (typeof station?.id !== "string") {
      continue;
    }

    station.slot_playlist_ids = stationPlaylistIds.get(station.id) || [];
    station.slot_count = station.slot_playlist_ids.length;

    if (typeof station?.managed_group_id === "string" && station.managed_group_id) {
      stationsBySourceKey.set(`group:${station.managed_group_id}`, station);
      continue;
    }

    const profileStationId = typeof station?.managed_profile_id === "string" && station.managed_profile_id
      ? station.managed_profile_id
      : typeof station?.creator_id === "string" && station.creator_id
        ? station.creator_id
        : "";

    if (profileStationId) {
      stationsBySourceKey.set(`profile:${profileStationId}`, station);
    }
  }

  const groupIds = Array.from(new Set(
    (groupLinks || [])
      .map((row: any) => (typeof row?.group_id === "string" ? row.group_id : ""))
      .filter((groupId: string) => groupId.length > 0),
  ));
  const groupLinkedPlaylistIds = new Set(
    (groupLinks || [])
      .map((row: any) => (typeof row?.playlist_id === "string" ? row.playlist_id : ""))
      .filter((playlistId: string) => playlistId.length > 0),
  );

  let groupsById = new Map<string, any>();
  if (groupIds.length > 0) {
    const { data: groups, error: groupsError } = await supabaseAdmin
      .from("groups_with_stats")
      .select("id, owner_id, name, group_type, genre, images")
      .in("id", groupIds);

    if (groupsError) {
      throw groupsError;
    }

    groupsById = new Map(
      (groups || [])
        .filter((group: any) => typeof group?.id === "string")
        .map((group: any) => [group.id, group]),
    );
  }

  const playlistsByProfileId = new Map<string, any[]>();
  const playlistsByGroupId = new Map<string, any[]>();
  const playlistById = new Map<string, any>(
    playlistRows
      .filter((playlist: any) => typeof playlist?.id === "string")
      .map((playlist: any) => [playlist.id, playlist]),
  );

  for (const playlist of playlistRows) {
    const profileId = typeof playlist?.creator_id === "string" ? playlist.creator_id : "";
    if (!profileId || groupLinkedPlaylistIds.has(playlist.id)) {
      continue;
    }

    const next = playlistsByProfileId.get(profileId) || [];
    next.push(playlist);
    playlistsByProfileId.set(profileId, next);
  }

  for (const link of groupLinks || []) {
    const groupId = typeof link?.group_id === "string" ? link.group_id : "";
    const playlistId = typeof link?.playlist_id === "string" ? link.playlist_id : "";
    const playlist = playlistById.get(playlistId);
    if (!groupId || !playlist || !groupsById.has(groupId)) {
      continue;
    }

    const next = playlistsByGroupId.get(groupId) || [];
    next.push(playlist);
    playlistsByGroupId.set(groupId, next);
  }

  const profileSources = Array.from(playlistsByProfileId.entries())
    .map(([profileId, sourcePlaylists]) => {
      const firstPlaylist = sourcePlaylists[0] || {};
      const profile = firstPlaylist.creator || {};
      const profileRole = typeof profile?.role === "string" ? profile.role.toLowerCase() : "";
      if (profileRole && profileRole !== "musician") {
        return null;
      }

      const stationKey = `profile:${profileId}`;
      return {
        key: stationKey,
        kind: "profile",
        id: profileId,
        owner_profile_id: profileId,
        name: getProfileDisplayName(profile),
        subtitle: "Artist",
        genre: firstPlaylist.genre || null,
        cover_image_url: profile?.avatar_url || firstPlaylist.cover_image_url || null,
        playlist_count: sourcePlaylists.length,
        track_count: sourcePlaylists.reduce((sum, playlist) => sum + Number(playlist?.track_count || 0), 0),
        playlists: sourcePlaylists,
        station: getSourceStationSummary(stationsBySourceKey, stationKey),
      };
    })
    .filter(Boolean);

  const groupSources = Array.from(playlistsByGroupId.entries())
    .map(([groupId, sourcePlaylists]) => {
      const group = groupsById.get(groupId);
      if (!group?.owner_id) {
        return null;
      }

      const stationKey = `group:${groupId}`;
      const groupTypeLabel = getGroupTypeLabel(group.group_type);
      return {
        key: stationKey,
        kind: "group",
        id: groupId,
        owner_profile_id: group.owner_id,
        name: getGroupDisplayName(group),
        subtitle: groupTypeLabel,
        genre: group.genre || sourcePlaylists[0]?.genre || null,
        cover_image_url: getFirstImage(group.images) || sourcePlaylists[0]?.cover_image_url || null,
        playlist_count: sourcePlaylists.length,
        track_count: sourcePlaylists.reduce((sum, playlist) => sum + Number(playlist?.track_count || 0), 0),
        playlists: sourcePlaylists,
        station: getSourceStationSummary(stationsBySourceKey, stationKey),
      };
    })
    .filter(Boolean);

  return [...groupSources, ...profileSources].sort((left: any, right: any) => {
    const leftHasStation = left.station ? 1 : 0;
    const rightHasStation = right.station ? 1 : 0;
    if (leftHasStation !== rightHasStation) {
      return leftHasStation - rightHasStation;
    }

    return String(left.name || "").localeCompare(String(right.name || ""));
  });
}

async function getEligibleStationSource(
  supabaseAdmin: any,
  sourceKind: "profile" | "group",
  sourceId: string,
) {
  if (sourceKind === "profile") {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, avatar_url, role")
      .eq("id", sourceId)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (!profile) {
      throw new Error("Artist not found");
    }

    const { data: playlists, error: playlistError } = await filterPublicVisiblePlaylists(
      supabaseAdmin
        .from("playlists")
        .select("id, title, description, genre, cover_image_url, track_count, creator_id")
        .eq("creator_id", sourceId),
    )
      .order("created_at", { ascending: false });

    if (playlistError) {
      throw playlistError;
    }

    const playlistIds = (playlists || [])
      .map((playlist: any) => (typeof playlist?.id === "string" ? playlist.id : ""))
      .filter((playlistId: string) => playlistId.length > 0);
    let groupLinkedPlaylistIds = new Set<string>();
    if (playlistIds.length > 0) {
      const { data: groupLinks, error: groupLinksError } = await supabaseAdmin
        .from("group_playlists")
        .select("playlist_id")
        .in("playlist_id", playlistIds);

      if (groupLinksError) {
        throw groupLinksError;
      }

      groupLinkedPlaylistIds = new Set(
        (groupLinks || [])
          .map((row: any) => (typeof row?.playlist_id === "string" ? row.playlist_id : ""))
          .filter((playlistId: string) => playlistId.length > 0),
      );
    }

    const soloPlaylists = (playlists || []).filter((playlist: any) => !groupLinkedPlaylistIds.has(playlist.id));

    return {
      source: profile,
      managedProfileId: profile.id,
      managedGroupId: null,
      defaultName: `${getProfileDisplayName(profile)} Radio`,
      defaultGenre: soloPlaylists?.[0]?.genre || null,
      defaultCoverImageUrl: profile.avatar_url || soloPlaylists?.[0]?.cover_image_url || null,
      playlists: soloPlaylists,
    };
  }

  const { data: group, error: groupError } = await supabaseAdmin
    .from("groups_with_stats")
    .select("id, owner_id, name, group_type, genre, images")
    .eq("id", sourceId)
    .maybeSingle();

  if (groupError) {
    throw groupError;
  }

  if (!group?.owner_id) {
    throw new Error("Group not found");
  }

  const { data: links, error: linksError } = await supabaseAdmin
    .from("group_playlists")
    .select("playlist_id, position")
    .eq("group_id", sourceId)
    .order("position");

  if (linksError) {
    throw linksError;
  }

  const playlistIds = (links || [])
    .map((link: any) => (typeof link?.playlist_id === "string" ? link.playlist_id : ""))
    .filter((playlistId: string) => playlistId.length > 0);

  let playlists: any[] = [];
  if (playlistIds.length > 0) {
    const { data, error } = await filterPublicVisiblePlaylists(
      supabaseAdmin
        .from("playlists")
        .select("id, title, description, genre, cover_image_url, track_count, creator_id")
        .in("id", playlistIds),
    );

    if (error) {
      throw error;
    }

    const positionByPlaylistId = new Map<string, number>(
      (links || []).map((link: any) => [link.playlist_id, Number(link.position || 0)]),
    );
    playlists = (data || []).sort((left: any, right: any) => {
      return (positionByPlaylistId.get(left.id) || 0) - (positionByPlaylistId.get(right.id) || 0);
    });
  }

  return {
    source: group,
    managedProfileId: group.owner_id,
    managedGroupId: group.id,
    defaultName: `${getGroupDisplayName(group)} Radio`,
    defaultGenre: group.genre || playlists?.[0]?.genre || null,
    defaultCoverImageUrl: getFirstImage(group.images) || playlists?.[0]?.cover_image_url || null,
    playlists,
  };
}

async function upsertStationFromSource(
  supabaseAdmin: any,
  adminUserId: string,
  sourceKind: "profile" | "group",
  sourceId: string,
  params: Record<string, any>,
) {
  const sourceInfo = await getEligibleStationSource(supabaseAdmin, sourceKind, sourceId);
  const eligiblePlaylists = sourceInfo.playlists || [];
  const eligiblePlaylistIds = new Set(
    eligiblePlaylists
      .map((playlist: any) => (typeof playlist?.id === "string" ? playlist.id : ""))
      .filter((playlistId: string) => playlistId.length > 0),
  );

  const requestedPlaylistIds = Array.isArray(params.playlist_ids)
    ? params.playlist_ids
        .map((playlistId: unknown) => (typeof playlistId === "string" ? playlistId.trim() : ""))
        .filter((playlistId: string) => playlistId.length > 0)
    : [];
  const selectedPlaylistIds = (requestedPlaylistIds.length > 0
    ? requestedPlaylistIds
    : Array.from(eligiblePlaylistIds)
  ).filter((playlistId: string, index: number, list: string[]) => {
    return list.indexOf(playlistId) === index && eligiblePlaylistIds.has(playlistId);
  });

  if (selectedPlaylistIds.length === 0) {
    throw new Error("Select at least one eligible public playlist for this station.");
  }

  const existingStation = await getPrimaryManagedSourceStation(
    supabaseAdmin,
    sourceKind,
    sourceId,
    sourceInfo.managedProfileId,
  );

  const stationPatch = {
    creator_id: adminUserId,
    managed_profile_id: sourceInfo.managedProfileId,
    managed_group_id: sourceInfo.managedGroupId,
    name: params.name || sourceInfo.defaultName,
    description: params.description || null,
    genre: params.genre || sourceInfo.defaultGenre || null,
    cover_image_url: params.cover_image_url || sourceInfo.defaultCoverImageUrl || null,
    is_active: "is_active" in params ? params.is_active !== false : existingStation?.is_active ?? true,
    is_featured: "is_featured" in params ? params.is_featured === true : existingStation?.is_featured ?? false,
    rotation_interval_minutes: normalizeStationRotationIntervalMinutes(params.rotation_interval_minutes),
  };

  let station: any;
  if (existingStation?.id) {
    const { data, error } = await supabaseAdmin
      .from("stations")
      .update(stationPatch)
      .eq("id", existingStation.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    station = data;
  } else {
    const { data, error } = await supabaseAdmin
      .from("stations")
      .insert(stationPatch)
      .select()
      .single();

    if (error) {
      throw error;
    }

    station = data;
  }

  const { error: deleteSlotsError } = await supabaseAdmin
    .from("station_playlist_slots")
    .delete()
    .eq("station_id", station.id);

  if (deleteSlotsError) {
    throw deleteSlotsError;
  }

  const slotRows = selectedPlaylistIds.map((playlistId: string, index: number) => ({
    station_id: station.id,
    playlist_id: playlistId,
    position: index,
    is_active: true,
  }));

  const { error: insertSlotsError } = await supabaseAdmin
    .from("station_playlist_slots")
    .insert(slotRows);

  if (insertSlotsError) {
    throw insertSlotsError;
  }

  return {
    ...station,
    slot_count: selectedPlaylistIds.length,
    slot_playlist_ids: selectedPlaylistIds,
  };
}

function isSlotScheduledForNow(slot: any, nowMs: number) {
  const startMs = readTimestampMs(slot?.starts_at);
  const endMs = readTimestampMs(slot?.ends_at);

  if (startMs === null && endMs === null) {
    return false;
  }

  if (startMs !== null && nowMs < startMs) {
    return false;
  }

  if (endMs !== null && nowMs >= endMs) {
    return false;
  }

  return true;
}

function getWrappedSlotWindow(slots: any[], startIndex: number, limit: number) {
  if (slots.length === 0 || limit <= 0) {
    return [];
  }

  const normalizedStart = ((startIndex % slots.length) + slots.length) % slots.length;
  const liveSlots = [];

  for (let offset = 0; offset < Math.min(limit, slots.length); offset += 1) {
    liveSlots.push(slots[(normalizedStart + offset) % slots.length]);
  }

  return liveSlots;
}

function getStationLiveSlotState(station: any, slots: any[]) {
  const normalizedSlots = slots.filter((slot: any) => slot?.is_active !== false);
  const rotationIntervalMinutes = getStationRotationIntervalMinutes(station);
  const concurrentSlotLimit = getStationConcurrentSlotLimit(station);
  const nowMs = Date.now();

  if (normalizedSlots.length === 0) {
    return {
      concurrentSlotLimit,
      liveAnchorAt: station?.updated_at || station?.created_at || new Date(nowMs).toISOString(),
      liveSlots: [],
      rotationIntervalMinutes,
    };
  }

  const scheduledSlots = normalizedSlots.filter((slot: any) => isSlotScheduledForNow(slot, nowMs));
  if (scheduledSlots.length > 0) {
    const limitedScheduledSlots = scheduledSlots.slice(0, concurrentSlotLimit);
    const scheduleAnchorMs = limitedScheduledSlots
      .map((slot: any) => readTimestampMs(slot?.starts_at))
      .filter((value): value is number => value !== null)
      .sort((left, right) => right - left)[0] ?? nowMs;

    return {
      concurrentSlotLimit,
      liveAnchorAt: new Date(scheduleAnchorMs).toISOString(),
      liveSlots: limitedScheduledSlots,
      rotationIntervalMinutes,
    };
  }

  const baseTimestampMs = getStationRotationBaseTimestampMs(station, normalizedSlots) ?? nowMs;
  const intervalMs = rotationIntervalMinutes * 60 * 1000;
  const elapsedIntervals = baseTimestampMs >= nowMs
    ? 0
    : Math.floor((nowMs - baseTimestampMs) / intervalMs);
  const windowStartIndex = (elapsedIntervals * concurrentSlotLimit) % normalizedSlots.length;

  return {
    concurrentSlotLimit,
    liveAnchorAt: new Date(baseTimestampMs + (elapsedIntervals * intervalMs)).toISOString(),
    liveSlots: getWrappedSlotWindow(normalizedSlots, windowStartIndex, concurrentSlotLimit),
    rotationIntervalMinutes,
  };
}

function getUniqueStringValues(values: unknown[]) {
  return Array.from(new Set(
    values
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter((value) => value.length > 0),
  ));
}

function createGroupedRowMap(rows: any[], keyName: string, orderedKeys: string[]) {
  const grouped = new Map<string, any[]>(
    orderedKeys.map((key) => [key, []]),
  );

  for (const row of rows || []) {
    const key = typeof row?.[keyName] === "string" ? row[keyName] : "";
    if (!key) continue;

    const current = grouped.get(key) || [];
    current.push(row);
    grouped.set(key, current);
  }

  return grouped;
}

async function attachPlaylistItemsToSlots(supabaseAdmin: any, slots: any[], itemLimit?: number) {
  const playlistIds = getUniqueStringValues(
    (slots || []).map((slot: any) => slot?.playlist?.id),
  );

  if (playlistIds.length === 0) {
    return (slots || []).map((slot: any) => {
      if (slot?.playlist) {
        slot.playlist.items = [];
      }
      return slot;
    });
  }

  const { data: items, error } = await supabaseAdmin
    .from("playlist_items")
    .select("*, teaser:playlist_teaser_assets!teaser_asset_id(*)")
    .in("playlist_id", playlistIds)
    .order("playlist_id", { ascending: true })
    .order("position", { ascending: true });

  if (error) {
    console.warn("Unable to load playlist items for station slots:", error);
  }

  const itemsByPlaylistId = new Map<string, any[]>(
    playlistIds.map((playlistId) => [playlistId, []]),
  );

  for (const item of items || []) {
    const playlistId = typeof item?.playlist_id === "string" ? item.playlist_id : "";
    if (!playlistId) continue;

    const current = itemsByPlaylistId.get(playlistId) || [];
    if (typeof itemLimit === "number" && current.length >= itemLimit) {
      continue;
    }

    current.push(item);
    itemsByPlaylistId.set(playlistId, current);
  }

  return (slots || []).map((slot: any) => {
    if (slot?.playlist?.id) {
      slot.playlist.items = itemsByPlaylistId.get(slot.playlist.id) || [];
    }
    return slot;
  });
}

async function fetchStationSlotsByStation(supabaseAdmin: any, stationIds: string[], options: { includeItems?: boolean; itemLimit?: number } = {}) {
  const uniqueStationIds = getUniqueStringValues(stationIds);
  if (uniqueStationIds.length === 0) {
    return new Map<string, any[]>();
  }

  const { data: slots, error } = await supabaseAdmin
    .from("station_playlist_slots")
    .select("*, playlist:playlists!playlist_id(id, title, cover_image_url, track_count)")
    .in("station_id", uniqueStationIds)
    .order("station_id", { ascending: true })
    .order("position", { ascending: true });

  if (error) {
    throw error;
  }

  const enrichedSlots = options.includeItems
    ? await attachPlaylistItemsToSlots(supabaseAdmin, slots || [], options.itemLimit)
    : (slots || []).map((slot: any) => {
        if (slot?.playlist) {
          slot.playlist.items = [];
        }
        return slot;
      });

  return createGroupedRowMap(enrichedSlots, "station_id", uniqueStationIds);
}

async function enrichStationSlots(supabaseAdmin: any, slots: any[], itemLimit?: number) {
  return attachPlaylistItemsToSlots(supabaseAdmin, slots || [], itemLimit);
}

async function fetchStationSlotSummariesByStation(supabaseAdmin: any, stationIds: string[]) {
  const uniqueStationIds = getUniqueStringValues(stationIds);
  if (uniqueStationIds.length === 0) {
    return new Map<string, any[]>();
  }

  const { data: slots, error } = await supabaseAdmin
    .from("station_playlist_slots")
    .select("id, station_id, playlist_id, is_active, position, starts_at, ends_at, created_at")
    .in("station_id", uniqueStationIds)
    .order("station_id", { ascending: true })
    .order("position", { ascending: true });

  if (error) {
    throw error;
  }

  return createGroupedRowMap(slots || [], "station_id", uniqueStationIds);
}

function attachStationSlotSummary(station: any, slots: any[]) {
  const liveSlotState = getStationLiveSlotState(station, slots || []);
  station.slot_count = (slots || []).length;
  station.slot_playlist_ids = (slots || []).map((slot: any) => slot.playlist_id);
  station.live_slot_count = liveSlotState.liveSlots.length;
  station.live_slot_playlist_ids = liveSlotState.liveSlots.map((slot: any) => slot.playlist_id);
  station.rotation_interval_minutes = liveSlotState.rotationIntervalMinutes;
  station.concurrent_slot_limit = liveSlotState.concurrentSlotLimit;
  station.live_anchor_at = liveSlotState.liveAnchorAt;
  return station;
}

function decorateStationWithLiveRotation(station: any, enrichedSlots: any[]) {
  const liveSlotState = getStationLiveSlotState(station, enrichedSlots);

  return {
    ...station,
    concurrent_slot_limit: liveSlotState.concurrentSlotLimit,
    live_anchor_at: liveSlotState.liveAnchorAt,
    live_slot_count: liveSlotState.liveSlots.length,
    live_slots: liveSlotState.liveSlots,
    rotation_interval_minutes: liveSlotState.rotationIntervalMinutes,
    slot_count: enrichedSlots.length,
    slots: enrichedSlots,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const accessToken = extractAccessToken(authHeader);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Server misconfiguration" }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const requestBody = await req.json();
    const { action: rawAction, ...params } = requestBody ?? {};
    const action = typeof rawAction === "string" ? rawAction.trim() : "";

    if (!action) {
      return jsonResponse({ error: "action is required" }, 400);
    }

    const requiresAuth = !PUBLIC_ACTIONS.has(action);
    let authUser: any = null;

    if (accessToken) {
      const {
        data: { user },
        error: authErr,
      } = await supabaseAdmin.auth.getUser(accessToken);

      if (authErr || !user) {
        if (requiresAuth) {
          return jsonResponse({ error: "Invalid token" }, 401);
        }
      } else {
        authUser = user;
      }
    } else if (requiresAuth) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    if (requiresAuth && !authUser) {
      return jsonResponse({ error: "Invalid token" }, 401);
    }

    const uid = authUser?.id ?? null;
    const requesterRole = authUser && uid
      ? await getRequesterRole(supabaseAdmin, authUser, uid)
      : null;
    const stationAdminActions = new Set([
      "admin_list_stations",
      "admin_list_station_sources",
      "admin_upsert_station_from_source",
      "admin_auto_create_stations",
      "create_station",
      "delete_station",
      "update_station",
      "add_station_slot",
      "remove_station_slot",
      "toggle_radio_slot",
    ]);

    if (stationAdminActions.has(action)) {
      if (requesterRole !== "admin") {
        return jsonResponse({ error: "Stations are managed by admins." }, 403);
      }
    }

    // ── create_playlist ─────────────────────────────────────────────
    if (action === "create_playlist") {
      const { title, description, visibility, genre, cover_image_url, items } = params;
      if (!title) return jsonResponse({ error: "title is required" }, 400);

      const { data: playlist, error: plErr } = await supabaseAdmin
        .from("playlists")
        .insert({
          creator_id: uid,
          title,
          description: description || null,
          visibility: visibility || "public",
          genre: genre || null,
          cover_image_url: cover_image_url || null,
        })
        .select()
        .single();

      if (plErr) return jsonResponse({ error: plErr.message }, 500);

      // Bulk insert items if provided
      if (items && Array.isArray(items) && items.length > 0) {
        let itemRows;
        try {
          itemRows = items.map((item: any, i: number) => ({
            playlist_id: playlist.id,
            title: String(item?.title || "").trim(),
            artist_name: item?.artist_name ? String(item.artist_name).trim() : null,
            audio_url: normalizeOptionalAudioUrl(item?.audio_url),
            duration_seconds: normalizeOptionalDurationSeconds(item?.duration_seconds),
            teaser_asset_id: item?.teaser_asset_id || null,
            position: i,
          }));
        } catch (validationError: any) {
          return jsonResponse({ error: validationError.message || "Invalid track data" }, 400);
        }

        if (itemRows.some((item: any) => !item.title)) {
          return jsonResponse({ error: "Each playlist item requires a title" }, 400);
        }

        await supabaseAdmin.from("playlist_items").insert(itemRows);
      }

      return jsonResponse({ success: true, data: playlist });
    }

    // ── update_playlist ─────────────────────────────────────────────
    if (action === "update_playlist") {
      const { playlist_id, ...updates } = params;
      if (!playlist_id) return jsonResponse({ error: "playlist_id is required" }, 400);

      const { data: existing } = await supabaseAdmin
        .from("playlists")
        .select("creator_id")
        .eq("id", playlist_id)
        .single();

      if (!existing) return jsonResponse({ error: "Playlist not found" }, 404);
      if (existing.creator_id !== uid) return jsonResponse({ error: "Forbidden" }, 403);

      const allowed = ["title", "description", "visibility", "genre", "cover_image_url", "is_featured"];
      const patch: Record<string, any> = {};
      for (const key of allowed) {
        if (key in updates) patch[key] = updates[key];
      }

      const { data, error } = await supabaseAdmin
        .from("playlists")
        .update(patch)
        .eq("id", playlist_id)
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── delete_playlist ─────────────────────────────────────────────
    if (action === "delete_playlist") {
      const { playlist_id } = params;
      if (!playlist_id) return jsonResponse({ error: "playlist_id is required" }, 400);

      const { data: existing } = await supabaseAdmin
        .from("playlists")
        .select("creator_id")
        .eq("id", playlist_id)
        .single();

      if (!existing) return jsonResponse({ error: "Playlist not found" }, 404);
      if (existing.creator_id !== uid) return jsonResponse({ error: "Forbidden" }, 403);

      let { error } = await supabaseAdmin.from("playlists").delete().eq("id", playlist_id);
      const shouldRetryWithItemCleanup = error && /constraint|foreign key|referenced|trigger|tuple|cascade/i.test(error.message || "");

      if (shouldRetryWithItemCleanup) {
        console.warn("manage-playlists delete_playlist retrying after item cleanup", {
          playlist_id,
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });

        const { error: itemDeleteError } = await supabaseAdmin
          .from("playlist_items")
          .delete()
          .eq("playlist_id", playlist_id);

        if (itemDeleteError) {
          return jsonResponse({
            error: itemDeleteError.message,
            original_error: error.message,
            code: itemDeleteError.code,
            details: itemDeleteError.details,
            hint: itemDeleteError.hint,
          }, 500);
        }

        ({ error } = await supabaseAdmin.from("playlists").delete().eq("id", playlist_id));
      }

      if (error) {
        console.error("manage-playlists delete_playlist failed", {
          playlist_id,
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });

        return jsonResponse({
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        }, 500);
      }

      return jsonResponse({ success: true });
    }

    // ── get_playlist_details ────────────────────────────────────────
    if (action === "get_playlist_details") {
      const { playlist_id } = params;
      if (!playlist_id) return jsonResponse({ error: "playlist_id is required" }, 400);

      const { data: playlist, error: plErr } = await supabaseAdmin
        .from("playlists")
        .select("*, creator:profiles!creator_id(id, full_name, avatar_url)")
        .eq("id", playlist_id)
        .single();

      if (plErr || !playlist) return jsonResponse({ error: "Playlist not found" }, 404);

      const { data: items } = await supabaseAdmin
        .from("playlist_items")
        .select("*, teaser:playlist_teaser_assets!teaser_asset_id(*), external_link:external_platform_links!external_link_id(*)")
        .eq("playlist_id", playlist_id)
        .order("position");

      return jsonResponse({
        success: true,
        data: { ...playlist, items: items || [] },
      });
    }

    // ── list_my_playlists ───────────────────────────────────────────
    if (action === "list_my_playlists") {
      const { data, error } = await supabaseAdmin
        .from("playlists")
        .select("*")
        .eq("creator_id", uid)
        .order("created_at", { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── list_user_playlists ──────────────────────────────────────────
    if (action === "list_user_playlists") {
      const { user_id } = params;
      if (!user_id) return jsonResponse({ error: "user_id is required" }, 400);

      const isOwnProfile = user_id === uid || requesterRole === "admin";
      let query = supabaseAdmin
        .from("playlists")
        .select("*")
        .eq("creator_id", user_id);

      // Non-owners only see public playlists
      if (!isOwnProfile) {
        query = filterPublicVisiblePlaylists(query);
      }

      query = query.order("created_at", { ascending: false });

      const { data, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── browse_playlists ────────────────────────────────────────────
    if (action === "browse_playlists") {
      const { genre, featured_only, limit: lim } = params;
      let query = filterPublicVisiblePlaylists(
        supabaseAdmin
          .from("playlists")
          .select("*, creator:profiles!creator_id(id, full_name, avatar_url)"),
      )
        .order("created_at", { ascending: false });

      if (genre) query = query.eq("genre", genre);
      if (featured_only) query = query.eq("is_featured", true);
      if (lim) query = query.limit(Number(lim));

      const { data, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── add_playlist_item ───────────────────────────────────────────
    if (action === "add_playlist_item") {
      const { playlist_id, title, artist_name, duration_seconds, teaser_asset_id, external_link_id, audio_url } = params;
      if (!playlist_id || !title) return jsonResponse({ error: "playlist_id and title are required" }, 400);

      const { data: pl } = await supabaseAdmin.from("playlists").select("creator_id").eq("id", playlist_id).single();
      if (!pl || pl.creator_id !== uid) return jsonResponse({ error: "Forbidden" }, 403);

      // Get next position
      const { data: lastItem } = await supabaseAdmin
        .from("playlist_items")
        .select("position")
        .eq("playlist_id", playlist_id)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextPos = (lastItem?.position ?? -1) + 1;

      let normalizedDuration: number | null;
      let normalizedAudioUrl: string | null;
      try {
        normalizedDuration = normalizeOptionalDurationSeconds(duration_seconds);
        normalizedAudioUrl = normalizeOptionalAudioUrl(audio_url);
      } catch (validationError: any) {
        return jsonResponse({ error: validationError.message || "Invalid track data" }, 400);
      }

      const { data, error } = await supabaseAdmin
        .from("playlist_items")
        .insert({
          playlist_id,
          title,
          artist_name: artist_name || null,
          duration_seconds: normalizedDuration,
          position: nextPos,
          teaser_asset_id: teaser_asset_id || null,
          external_link_id: external_link_id || null,
          audio_url: normalizedAudioUrl,
        })
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── update_playlist_item ───────────────────────────────────────
    if (action === "update_playlist_item") {
      const { item_id, title, artist_name, duration_seconds, teaser_asset_id, external_link_id, audio_url } = params;
      if (!item_id || !title) return jsonResponse({ error: "item_id and title are required" }, 400);

      const { data: item } = await supabaseAdmin
        .from("playlist_items")
        .select("playlist_id")
        .eq("id", item_id)
        .single();

      if (!item) return jsonResponse({ error: "Item not found" }, 404);

      const { data: pl } = await supabaseAdmin
        .from("playlists")
        .select("creator_id")
        .eq("id", item.playlist_id)
        .single();

      if (!pl || pl.creator_id !== uid) return jsonResponse({ error: "Forbidden" }, 403);

      let normalizedDuration: number | null;
      let normalizedAudioUrl: string | null;
      try {
        normalizedDuration = normalizeOptionalDurationSeconds(duration_seconds);
        normalizedAudioUrl = normalizeOptionalAudioUrl(audio_url);
      } catch (validationError: any) {
        return jsonResponse({ error: validationError.message || "Invalid track data" }, 400);
      }

      const { data, error } = await supabaseAdmin
        .from("playlist_items")
        .update({
          title,
          artist_name: artist_name || null,
          duration_seconds: normalizedDuration,
          teaser_asset_id: teaser_asset_id || null,
          external_link_id: external_link_id || null,
          audio_url: normalizedAudioUrl,
        })
        .eq("id", item_id)
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── remove_playlist_item ────────────────────────────────────────
    if (action === "remove_playlist_item") {
      const { item_id, playlist_id } = params;
      if (!item_id) return jsonResponse({ error: "item_id is required" }, 400);

      if (playlist_id) {
        const { data: pl, error: playlistError } = await supabaseAdmin
          .from("playlists")
          .select("creator_id")
          .eq("id", playlist_id)
          .maybeSingle();

        if (playlistError) return jsonResponse({ error: playlistError.message }, 500);
        if (!pl) return jsonResponse({ error: "Playlist not found" }, 404);
        if (pl.creator_id !== uid) return jsonResponse({ error: "Forbidden" }, 403);

        const { data: deletedItem, error: deleteError } = await supabaseAdmin
          .from("playlist_items")
          .delete()
          .eq("id", item_id)
          .eq("playlist_id", playlist_id)
          .select("id")
          .maybeSingle();

        if (deleteError) return jsonResponse({ error: deleteError.message }, 500);
        return jsonResponse({ success: true, already_removed: !deletedItem });
      }

      const { data: item } = await supabaseAdmin
        .from("playlist_items")
        .select("playlist_id")
        .eq("id", item_id)
        .maybeSingle();

      if (!item) return jsonResponse({ error: "Item not found" }, 404);

      const { data: pl } = await supabaseAdmin.from("playlists").select("creator_id").eq("id", item.playlist_id).single();
      if (!pl || pl.creator_id !== uid) return jsonResponse({ error: "Forbidden" }, 403);

      const { error } = await supabaseAdmin.from("playlist_items").delete().eq("id", item_id);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // ── upload_teaser_asset ─────────────────────────────────────────
    if (action === "upload_teaser_asset") {
      const { playlist_id, asset_type, storage_path, mime_type, duration_seconds, file_size_bytes } = params;
      if (!playlist_id || !storage_path) return jsonResponse({ error: "playlist_id and storage_path are required" }, 400);

      const { data: pl } = await supabaseAdmin.from("playlists").select("creator_id").eq("id", playlist_id).single();
      if (!pl || pl.creator_id !== uid) return jsonResponse({ error: "Forbidden" }, 403);

      const { data, error } = await supabaseAdmin
        .from("playlist_teaser_assets")
        .insert({
          playlist_id,
          uploader_id: uid,
          asset_type: asset_type || "teaser_clip",
          storage_path,
          mime_type: mime_type || null,
          duration_seconds: duration_seconds || null,
          file_size_bytes: file_size_bytes || null,
          screen_result: "pending",
        })
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── add_external_link ───────────────────────────────────────────
    if (action === "add_external_link") {
      const { platform, url, label, linked_playlist_id, linked_item_id } = params;
      if (!platform || !url) return jsonResponse({ error: "platform and url are required" }, 400);

      const { data, error } = await supabaseAdmin
        .from("external_platform_links")
        .insert({
          owner_id: uid,
          platform,
          url,
          label: label || null,
          linked_playlist_id: linked_playlist_id || null,
          linked_item_id: linked_item_id || null,
        })
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── record_play_event ───────────────────────────────────────────
    if (action === "record_play_event") {
      const { playlist_id, item_id, station_id, event_type, platform } = params;
      if (!event_type) return jsonResponse({ error: "event_type is required" }, 400);

      const { data, error } = await supabaseAdmin
        .from("playlist_play_events")
        .insert({
          playlist_id: playlist_id || null,
          item_id: item_id || null,
          station_id: station_id || null,
          user_id: uid,
          event_type,
          platform: platform || null,
        })
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);

      // Increment click count for external links if outbound_click
      if (event_type === "outbound_click" && item_id) {
        const { data: item } = await supabaseAdmin
          .from("playlist_items")
          .select("external_link_id")
          .eq("id", item_id)
          .single();
        if (item?.external_link_id) {
          const { data: link } = await supabaseAdmin
            .from("external_platform_links")
            .select("click_count")
            .eq("id", item.external_link_id)
            .single();
          if (link) {
            await supabaseAdmin
              .from("external_platform_links")
              .update({ click_count: (link.click_count || 0) + 1 })
              .eq("id", item.external_link_id);
          }
        }
      }

      return jsonResponse({ success: true, data });
    }

    // ── create_station ──────────────────────────────────────────────
    if (action === "create_station") {
      const {
        name,
        description,
        genre,
        cover_image_url,
        rotation_interval_minutes,
        managed_profile_id,
      } = params;
      if (!name) return jsonResponse({ error: "name is required" }, 400);

      const managedProfileId = resolveManagedProfileId(requesterRole, uid, managed_profile_id);

      await transferManagedProfileStationsToAdmin(supabaseAdmin, uid, managedProfileId);

      const existingManagedStation = await getPrimaryManagedStation(
        supabaseAdmin,
        managedProfileId,
      );

      if (existingManagedStation?.id) {
        const { data, error } = await supabaseAdmin
          .from("stations")
          .update({
            creator_id: uid,
            managed_profile_id: managedProfileId,
            name,
            description: description || null,
            genre: genre || null,
            cover_image_url: cover_image_url || null,
            rotation_interval_minutes: normalizeStationRotationIntervalMinutes(rotation_interval_minutes),
          })
          .eq("id", existingManagedStation.id)
          .select()
          .single();

        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse({ success: true, data });
      }

      const { data, error } = await supabaseAdmin
        .from("stations")
        .insert({
          creator_id: uid,
          managed_profile_id: managedProfileId,
          managed_group_id: null,
          name,
          description: description || null,
          genre: genre || null,
          cover_image_url: cover_image_url || null,
          rotation_interval_minutes: normalizeStationRotationIntervalMinutes(rotation_interval_minutes),
        })
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    if (action === "admin_list_station_sources") {
      const sources = await listAdminStationSources(supabaseAdmin);
      return jsonResponse({ success: true, data: sources });
    }

    if (action === "admin_upsert_station_from_source") {
      const { source_kind, source_id } = params;
      const sourceKind = source_kind === "group" ? "group" : "profile";
      const sourceId = typeof source_id === "string" ? source_id.trim() : "";
      if (!sourceId) return jsonResponse({ error: "source_id is required" }, 400);

      try {
        const station = await upsertStationFromSource(
          supabaseAdmin,
          uid,
          sourceKind,
          sourceId,
          params,
        );

        return jsonResponse({ success: true, data: station });
      } catch (error: any) {
        return jsonResponse({ error: error.message || "Unable to save station" }, 400);
      }
    }

    if (action === "admin_auto_create_stations") {
      const sources = await listAdminStationSources(supabaseAdmin);
      const created: any[] = [];
      const skipped: any[] = [];

      for (const source of sources) {
        if (source?.station?.id) {
          skipped.push({ key: source.key, reason: "station_exists" });
          continue;
        }

        const playlistIds = Array.isArray(source?.playlists)
          ? source.playlists
              .map((playlist: any) => (typeof playlist?.id === "string" ? playlist.id : ""))
              .filter((playlistId: string) => playlistId.length > 0)
          : [];

        if (playlistIds.length === 0) {
          skipped.push({ key: source.key, reason: "no_playlists" });
          continue;
        }

        try {
          const station = await upsertStationFromSource(
            supabaseAdmin,
            uid,
            source.kind === "group" ? "group" : "profile",
            source.id,
            {
              playlist_ids: playlistIds,
              name: `${source.name || "Artist"} Radio`,
              description: `Auto-created from ${source.playlist_count || playlistIds.length} public playlist${playlistIds.length === 1 ? "" : "s"}.`,
              genre: source.genre || null,
              cover_image_url: source.cover_image_url || null,
              rotation_interval_minutes: DEFAULT_STATION_ROTATION_INTERVAL_MINUTES,
              is_active: true,
              is_featured: false,
            },
          );
          created.push(station);
        } catch (error: any) {
          skipped.push({
            key: source.key,
            reason: error.message || "create_failed",
          });
        }
      }

      return jsonResponse({
        success: true,
        data: {
          created,
          skipped,
          created_count: created.length,
          skipped_count: skipped.length,
        },
      });
    }

    // ── update_station ──────────────────────────────────────────────
    if (action === "update_station") {
      const { station_id, ...updates } = params;
      if (!station_id) return jsonResponse({ error: "station_id is required" }, 400);

      const { data: existing } = await supabaseAdmin
        .from("stations")
        .select("id, creator_id, managed_profile_id, managed_group_id")
        .eq("id", station_id)
        .single();

      if (!existing) return jsonResponse({ error: "Station not found" }, 404);

      await transferStationToAdminIfNeeded(supabaseAdmin, existing, uid);

      const allowed = ["name", "description", "genre", "cover_image_url", "is_active", "is_featured", "rotation_interval_minutes"];
      const patch: Record<string, any> = {};
      for (const key of allowed) {
        if (key in updates) patch[key] = updates[key];
      }

      patch.creator_id = uid;
      patch.managed_profile_id = existing.managed_profile_id || existing.creator_id;
      patch.managed_group_id = existing.managed_group_id || null;

      if ("rotation_interval_minutes" in patch) {
        patch.rotation_interval_minutes = normalizeStationRotationIntervalMinutes(
          patch.rotation_interval_minutes,
        );
      }

      const { data, error } = await supabaseAdmin
        .from("stations")
        .update(patch)
        .eq("id", station_id)
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    if (action === "delete_station") {
      const { station_id } = params;
      if (!station_id) return jsonResponse({ error: "station_id is required" }, 400);

      const { error } = await supabaseAdmin
        .from("stations")
        .delete()
        .eq("id", station_id);

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // ── get_station_details ─────────────────────────────────────────
    if (action === "get_station_details") {
      const { station_id } = params;
      if (!station_id) return jsonResponse({ error: "station_id is required" }, 400);

      const { data: station, error: stErr } = await supabaseAdmin
        .from("stations")
        .select("*, creator:profiles!creator_id(id, full_name, avatar_url), managed_profile:profiles!managed_profile_id(id, full_name, avatar_url), managed_group:groups!managed_group_id(id, name, group_type, genre)")
        .eq("id", station_id)
        .single();

      if (stErr || !station) return jsonResponse({ error: "Station not found" }, 404);

      const slotsByStationId = await fetchStationSlotsByStation(supabaseAdmin, [station_id], { includeItems: true });
      const enrichedSlots = slotsByStationId.get(station_id) || [];

      return jsonResponse({
        success: true,
        data: decorateStationWithLiveRotation(station, enrichedSlots),
      });
    }

    // ── list_my_stations ────────────────────────────────────────────
    if (action === "list_my_stations") {
      const { data, error } = await supabaseAdmin
        .from("stations")
        .select("*")
        .eq("creator_id", uid)
        .order("created_at", { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── list_user_stations ───────────────────────────────────────────
    if (action === "admin_list_stations") {
      const { data: stations, error } = await supabaseAdmin
        .from("stations")
        .select("*, creator:profiles!creator_id(id, full_name, avatar_url), managed_profile:profiles!managed_profile_id(id, full_name, avatar_url), managed_group:groups!managed_group_id(id, name, group_type, genre)")
        .order("created_at", { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500);

      const stationRows = stations || [];
      const slotsByStationId = await fetchStationSlotSummariesByStation(
        supabaseAdmin,
        stationRows.map((st: any) => st.id),
      );

      return jsonResponse({
        success: true,
        data: stationRows.map((st: any) => attachStationSlotSummary(st, slotsByStationId.get(st.id) || [])),
      });
    }

    if (action === "list_user_stations") {
      const { user_id } = params;
      if (!user_id) return jsonResponse({ error: "user_id is required" }, 400);

      const isOwnProfile = user_id === uid || requesterRole === "admin";
      let query = supabaseAdmin
        .from("stations")
        .select("*, creator:profiles!creator_id(id, full_name, avatar_url), managed_profile:profiles!managed_profile_id(id, full_name, avatar_url), managed_group:groups!managed_group_id(id, name, group_type, genre)")
        .eq("managed_profile_id", user_id)
        .order("created_at", { ascending: false });

      // Non-owners only see active stations
      if (!isOwnProfile) {
        query = query.eq("is_active", true);
      }

      const { data: stations, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 500);

      const stationRows = stations || [];
      const slotsByStationId = await fetchStationSlotSummariesByStation(
        supabaseAdmin,
        stationRows.map((st: any) => st.id),
      );

      return jsonResponse({
        success: true,
        data: stationRows.map((st: any) => attachStationSlotSummary(st, slotsByStationId.get(st.id) || [])),
      });
    }

    // ── browse_stations ─────────────────────────────────────────────
    if (action === "browse_stations") {
      const { genre, featured_only, include_items, limit: lim } = params;
      let query = supabaseAdmin
        .from("stations")
        .select("*, creator:profiles!creator_id(id, full_name, avatar_url), managed_profile:profiles!managed_profile_id(id, full_name, avatar_url), managed_group:groups!managed_group_id(id, name, group_type, genre)")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (genre) query = query.eq("genre", genre);
      if (featured_only) query = query.eq("is_featured", true);
      if (lim) query = query.limit(Number(lim));

      const { data, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 500);

      const stationRows = data || [];
      const shouldIncludeItems = include_items === true;
      const slotsByStationId = await fetchStationSlotsByStation(
        supabaseAdmin,
        stationRows.map((st: any) => st.id),
        { includeItems: shouldIncludeItems, itemLimit: 3 },
      );

      const enriched = stationRows.map((st: any) => ({
        ...decorateStationWithLiveRotation(st, slotsByStationId.get(st.id) || []),
        __queueReady: shouldIncludeItems,
      }));

      return jsonResponse({ success: true, data: enriched });
    }

    // ── add_station_slot ────────────────────────────────────────────
    if (action === "add_station_slot") {
      const { station_id, playlist_id, label, starts_at, ends_at } = params;
      if (!station_id || !playlist_id) return jsonResponse({ error: "station_id and playlist_id are required" }, 400);

      const { data: st } = await supabaseAdmin
        .from("stations")
        .select("id, creator_id, managed_profile_id, managed_group_id")
        .eq("id", station_id)
        .single();
      if (!st) return jsonResponse({ error: "Station not found" }, 404);

      await transferStationToAdminIfNeeded(supabaseAdmin, st, uid);

      const stationProfileId = st.managed_profile_id || st.creator_id;
      const { data: playlist } = await supabaseAdmin
        .from("playlists")
        .select("creator_id")
        .eq("id", playlist_id)
        .single();

      if (!playlist) return jsonResponse({ error: "Playlist not found" }, 404);
      let playlistAllowed = playlist.creator_id === stationProfileId;
      if (!playlistAllowed && st.managed_group_id) {
        const { data: groupLink } = await supabaseAdmin
          .from("group_playlists")
          .select("id")
          .eq("group_id", st.managed_group_id)
          .eq("playlist_id", playlist_id)
          .maybeSingle();
        playlistAllowed = !!groupLink;
      }

      if (!playlistAllowed) {
        return jsonResponse({ error: "Playlist must belong to the profile this station represents." }, 403);
      }

      const { data: lastSlot } = await supabaseAdmin
        .from("station_playlist_slots")
        .select("position")
        .eq("station_id", station_id)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextPos = (lastSlot?.position ?? -1) + 1;

      const { data, error } = await supabaseAdmin
        .from("station_playlist_slots")
        .insert({
          station_id,
          playlist_id,
          position: nextPos,
          label: label || null,
          starts_at: starts_at || null,
          ends_at: ends_at || null,
        })
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── remove_station_slot ─────────────────────────────────────────
    if (action === "remove_station_slot") {
      const { slot_id } = params;
      if (!slot_id) return jsonResponse({ error: "slot_id is required" }, 400);

      const { data: slot } = await supabaseAdmin
        .from("station_playlist_slots")
        .select("station_id")
        .eq("id", slot_id)
        .single();

      if (!slot) return jsonResponse({ error: "Slot not found" }, 404);

      const { data: st } = await supabaseAdmin
        .from("stations")
        .select("id, creator_id, managed_profile_id, managed_group_id")
        .eq("id", slot.station_id)
        .single();
      if (!st) return jsonResponse({ error: "Station not found" }, 404);

      await transferStationToAdminIfNeeded(supabaseAdmin, st, uid);

      const { error } = await supabaseAdmin.from("station_playlist_slots").delete().eq("id", slot_id);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // ── toggle_radio_slot ──────────────────────────────────────────
    // Toggles a playlist on/off the managed profile's radio station.
    // Admin station ownership is preserved even when managing another profile.
    if (action === "toggle_radio_slot") {
      const { playlist_id, user_id } = params;
      if (!playlist_id) return jsonResponse({ error: "playlist_id is required" }, 400);

      const managedProfileId = resolveManagedProfileId(requesterRole, uid, user_id);

      // Verify playlist exists and belongs to the profile being managed
      const { data: playlist } = await supabaseAdmin
        .from("playlists")
        .select("id, creator_id")
        .eq("id", playlist_id)
        .single();
      if (!playlist) return jsonResponse({ error: "Playlist not found" }, 404);
      if (playlist.creator_id !== managedProfileId) return jsonResponse({ error: "Forbidden" }, 403);

      await transferManagedProfileStationsToAdmin(supabaseAdmin, uid, managedProfileId);

      const existingManagedStation = await getPrimaryManagedStation(
        supabaseAdmin,
        managedProfileId,
      );

      let stationId: string;
      if (!existingManagedStation) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("id", managedProfileId)
          .single();
        const stationName = `${profile?.full_name || "My"}'s Radio`;
        const { data: newStation, error: createErr } = await supabaseAdmin
          .from("stations")
          .insert({
            creator_id: uid,
            managed_profile_id: managedProfileId,
            managed_group_id: null,
            name: stationName,
            is_active: true,
          })
          .select("id")
          .single();
        if (createErr) return jsonResponse({ error: createErr.message }, 500);
        stationId = newStation.id;
      } else {
        stationId = existingManagedStation.id;
      }

      // Check if slot already exists for this playlist
      const { data: existingSlot } = await supabaseAdmin
        .from("station_playlist_slots")
        .select("id")
        .eq("station_id", stationId)
        .eq("playlist_id", playlist_id)
        .maybeSingle();

      if (existingSlot) {
        // Remove from radio
        await supabaseAdmin.from("station_playlist_slots").delete().eq("id", existingSlot.id);
        return jsonResponse({ success: true, on_radio: false, station_id: stationId });
      } else {
        // Add to radio at next position
        const { data: lastSlot } = await supabaseAdmin
          .from("station_playlist_slots")
          .select("position")
          .eq("station_id", stationId)
          .order("position", { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextPos = (lastSlot?.position ?? -1) + 1;

        const { data: newSlot, error: slotErr } = await supabaseAdmin
          .from("station_playlist_slots")
          .insert({ station_id: stationId, playlist_id, position: nextPos, is_active: true })
          .select("id")
          .single();
        if (slotErr) return jsonResponse({ error: slotErr.message }, 500);
        return jsonResponse({ success: true, on_radio: true, station_id: stationId, slot_id: newSlot.id });
      }
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err: any) {
    console.error("manage-playlists error:", err);
    return jsonResponse({ error: err.message || "Internal server error" }, 500);
  }
});
