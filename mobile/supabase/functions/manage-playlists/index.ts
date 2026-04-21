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

async function enrichStationSlots(supabaseAdmin: any, slots: any[], itemLimit?: number) {
  const enrichedSlots = [];

  for (const slot of (slots || [])) {
    if (slot.playlist?.id) {
      let itemsQuery = supabaseAdmin
        .from("playlist_items")
        .select("*, teaser:playlist_teaser_assets!teaser_asset_id(*)")
        .eq("playlist_id", slot.playlist.id)
        .order("position");

      if (typeof itemLimit === "number") {
        itemsQuery = itemsQuery.limit(itemLimit);
      }

      const { data: items } = await itemsQuery;
      slot.playlist.items = items || [];
    }

    enrichedSlots.push(slot);
  }

  return enrichedSlots;
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

      const { error } = await supabaseAdmin.from("playlists").delete().eq("id", playlist_id);
      if (error) return jsonResponse({ error: error.message }, 500);
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

      const isOwnProfile = user_id === uid;
      let query = supabaseAdmin
        .from("playlists")
        .select("*")
        .eq("creator_id", user_id)
        .order("created_at", { ascending: false });

      // Non-owners only see public playlists
      if (!isOwnProfile) {
        query = query.eq("visibility", "public");
      }

      const { data, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── browse_playlists ────────────────────────────────────────────
    if (action === "browse_playlists") {
      const { genre, featured_only, limit: lim } = params;
      let query = supabaseAdmin
        .from("playlists")
        .select("*, creator:profiles!creator_id(id, full_name, avatar_url)")
        .eq("visibility", "public")
        .eq("is_hidden", false)
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

    // ── remove_playlist_item ────────────────────────────────────────
    if (action === "remove_playlist_item") {
      const { item_id } = params;
      if (!item_id) return jsonResponse({ error: "item_id is required" }, 400);

      const { data: item } = await supabaseAdmin
        .from("playlist_items")
        .select("playlist_id")
        .eq("id", item_id)
        .single();

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
      const { name, description, genre, cover_image_url, rotation_interval_minutes } = params;
      if (!name) return jsonResponse({ error: "name is required" }, 400);

      const { data, error } = await supabaseAdmin
        .from("stations")
        .insert({
          creator_id: uid,
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

    // ── update_station ──────────────────────────────────────────────
    if (action === "update_station") {
      const { station_id, ...updates } = params;
      if (!station_id) return jsonResponse({ error: "station_id is required" }, 400);

      const { data: existing } = await supabaseAdmin
        .from("stations")
        .select("creator_id")
        .eq("id", station_id)
        .single();

      if (!existing) return jsonResponse({ error: "Station not found" }, 404);
      if (existing.creator_id !== uid) return jsonResponse({ error: "Forbidden" }, 403);

      const allowed = ["name", "description", "genre", "cover_image_url", "is_active", "rotation_interval_minutes"];
      const patch: Record<string, any> = {};
      for (const key of allowed) {
        if (key in updates) patch[key] = updates[key];
      }

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

    // ── get_station_details ─────────────────────────────────────────
    if (action === "get_station_details") {
      const { station_id } = params;
      if (!station_id) return jsonResponse({ error: "station_id is required" }, 400);

      const { data: station, error: stErr } = await supabaseAdmin
        .from("stations")
        .select("*, creator:profiles!creator_id(id, full_name, avatar_url)")
        .eq("id", station_id)
        .single();

      if (stErr || !station) return jsonResponse({ error: "Station not found" }, 404);

      const { data: slots } = await supabaseAdmin
        .from("station_playlist_slots")
        .select("*, playlist:playlists!playlist_id(id, title, cover_image_url, track_count)")
        .eq("station_id", station_id)
        .order("position");

      const enrichedSlots = await enrichStationSlots(supabaseAdmin, slots || []);

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
    if (action === "list_user_stations") {
      const { user_id } = params;
      if (!user_id) return jsonResponse({ error: "user_id is required" }, 400);

      const isOwnProfile = user_id === uid;
      let query = supabaseAdmin
        .from("stations")
        .select("*, creator:profiles!creator_id(id, full_name, avatar_url)")
        .eq("creator_id", user_id)
        .order("created_at", { ascending: false });

      // Non-owners only see active stations
      if (!isOwnProfile) {
        query = query.eq("is_active", true);
      }

      const { data: stations, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 500);

      // Attach slot count and slot playlist IDs for profile-card rendering
      if (stations && stations.length > 0) {
        for (const st of stations) {
          const { data: slots, count } = await supabaseAdmin
            .from("station_playlist_slots")
            .select("id, playlist_id, is_active, position, starts_at, ends_at, created_at", { count: "exact" })
            .eq("station_id", st.id);

          const liveSlotState = getStationLiveSlotState(st, slots || []);
          st.slot_count = count || 0;
          st.slot_playlist_ids = (slots || []).map((s: any) => s.playlist_id);
          st.live_slot_count = liveSlotState.liveSlots.length;
          st.live_slot_playlist_ids = liveSlotState.liveSlots.map((slot: any) => slot.playlist_id);
          st.rotation_interval_minutes = liveSlotState.rotationIntervalMinutes;
          st.concurrent_slot_limit = liveSlotState.concurrentSlotLimit;
          st.live_anchor_at = liveSlotState.liveAnchorAt;
        }
      }

      return jsonResponse({ success: true, data: stations });
    }

    // ── browse_stations ─────────────────────────────────────────────
    if (action === "browse_stations") {
      const { genre, featured_only, limit: lim } = params;
      let query = supabaseAdmin
        .from("stations")
        .select("*, creator:profiles!creator_id(id, full_name, avatar_url)")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (genre) query = query.eq("genre", genre);
      if (featured_only) query = query.eq("is_featured", true);
      if (lim) query = query.limit(Number(lim));

      const { data, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 500);

      // Enrich each station with slots + teaser data for feed playback
      const enriched = [];
      for (const st of (data || [])) {
        const { data: slots } = await supabaseAdmin
          .from("station_playlist_slots")
          .select("*, playlist:playlists!playlist_id(id, title, cover_image_url, track_count)")
          .eq("station_id", st.id)
          .order("position");

        const enrichedSlots = await enrichStationSlots(supabaseAdmin, slots || [], 3);
        enriched.push(decorateStationWithLiveRotation(st, enrichedSlots));
      }

      return jsonResponse({ success: true, data: enriched });
    }

    // ── add_station_slot ────────────────────────────────────────────
    if (action === "add_station_slot") {
      const { station_id, playlist_id, label, starts_at, ends_at } = params;
      if (!station_id || !playlist_id) return jsonResponse({ error: "station_id and playlist_id are required" }, 400);

      const { data: st } = await supabaseAdmin.from("stations").select("creator_id").eq("id", station_id).single();
      if (!st || st.creator_id !== uid) return jsonResponse({ error: "Forbidden" }, 403);

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

      const { data: st } = await supabaseAdmin.from("stations").select("creator_id").eq("id", slot.station_id).single();
      if (!st || st.creator_id !== uid) return jsonResponse({ error: "Forbidden" }, 403);

      const { error } = await supabaseAdmin.from("station_playlist_slots").delete().eq("id", slot_id);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // ── toggle_radio_slot ──────────────────────────────────────────
    // Toggles a playlist on/off the user's radio station.
    // Auto-creates a station if the user doesn't have one yet.
    if (action === "toggle_radio_slot") {
      const { playlist_id } = params;
      if (!playlist_id) return jsonResponse({ error: "playlist_id is required" }, 400);

      // Verify playlist exists and belongs to user
      const { data: playlist } = await supabaseAdmin
        .from("playlists")
        .select("id, creator_id")
        .eq("id", playlist_id)
        .single();
      if (!playlist) return jsonResponse({ error: "Playlist not found" }, 404);
      if (playlist.creator_id !== uid) return jsonResponse({ error: "Forbidden" }, 403);

      // Get or auto-create user's station
      let { data: stations } = await supabaseAdmin
        .from("stations")
        .select("id")
        .eq("creator_id", uid)
        .order("created_at")
        .limit(1);

      let stationId: string;
      if (!stations || stations.length === 0) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("id", uid)
          .single();
        const stationName = `${profile?.full_name || "My"}'s Radio`;
        const { data: newStation, error: createErr } = await supabaseAdmin
          .from("stations")
          .insert({ creator_id: uid, name: stationName, is_active: true })
          .select("id")
          .single();
        if (createErr) return jsonResponse({ error: createErr.message }, 500);
        stationId = newStation.id;
      } else {
        stationId = stations[0].id;
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
