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
        const itemRows = items.map((item: any, i: number) => ({
          playlist_id: playlist.id,
          title: item.title,
          artist_name: item.artist_name || null,
          duration_seconds: item.duration_seconds || null,
          position: i,
        }));
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
      const { playlist_id, title, artist_name, duration_seconds, teaser_asset_id, external_link_id } = params;
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

      const { data, error } = await supabaseAdmin
        .from("playlist_items")
        .insert({
          playlist_id,
          title,
          artist_name: artist_name || null,
          duration_seconds: duration_seconds || null,
          position: nextPos,
          teaser_asset_id: teaser_asset_id || null,
          external_link_id: external_link_id || null,
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
      const { name, description, genre, cover_image_url } = params;
      if (!name) return jsonResponse({ error: "name is required" }, 400);

      const { data, error } = await supabaseAdmin
        .from("stations")
        .insert({
          creator_id: uid,
          name,
          description: description || null,
          genre: genre || null,
          cover_image_url: cover_image_url || null,
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

      const allowed = ["name", "description", "genre", "cover_image_url", "is_active"];
      const patch: Record<string, any> = {};
      for (const key of allowed) {
        if (key in updates) patch[key] = updates[key];
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

      return jsonResponse({
        success: true,
        data: { ...station, slots: slots || [] },
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
      return jsonResponse({ success: true, data });
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

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err: any) {
    console.error("manage-playlists error:", err);
    return jsonResponse({ error: err.message || "Internal server error" }, 500);
  }
});
