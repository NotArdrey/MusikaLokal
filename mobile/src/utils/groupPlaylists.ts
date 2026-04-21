import { supabase } from "../../lib/supabase";

export type LinkedGroupPlaylist = {
  link_id: string;
  playlist_id: string;
  position: number;
  title: string;
  description?: string | null;
  genre?: string | null;
  visibility?: string | null;
  cover_image_url?: string | null;
  track_count?: number | null;
  creator_id?: string | null;
};

const normalizeLinkedPlaylist = (row: any): LinkedGroupPlaylist | null => {
  const playlist = Array.isArray(row?.playlist) ? row.playlist[0] : row?.playlist;
  if (!playlist?.id) {
    return null;
  }

  return {
    ...playlist,
    link_id: row.id,
    playlist_id: playlist.id,
    position: Number(row.position || 0),
  };
};

export const fetchUserOwnedPlaylists = async (creatorId: string) => {
  const normalizedCreatorId = String(creatorId || "").trim();
  if (!normalizedCreatorId) {
    return [];
  }

  const { data, error } = await supabase
    .from("playlists")
    .select("*")
    .eq("creator_id", normalizedCreatorId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
};

export const fetchGroupLinkedPlaylists = async (groupId: string) => {
  const normalizedGroupId = String(groupId || "").trim();
  if (!normalizedGroupId) {
    return [];
  }

  const { data, error } = await supabase
    .from("group_playlists")
    .select("id, playlist_id, position, playlist:playlists!playlist_id(*)")
    .eq("group_id", normalizedGroupId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data || [])
    .map(normalizeLinkedPlaylist)
    .filter((playlist): playlist is LinkedGroupPlaylist => Boolean(playlist));
};

export const syncGroupLinkedPlaylists = async (
  groupId: string,
  playlistIds: string[],
) => {
  const normalizedGroupId = String(groupId || "").trim();
  if (!normalizedGroupId) {
    return;
  }

  const normalizedPlaylistIds = Array.from(
    new Set(
      (playlistIds || [])
        .map((playlistId) => String(playlistId || "").trim())
        .filter((playlistId) => playlistId.length > 0),
    ),
  );

  const { data: existingRows, error: existingError } = await supabase
    .from("group_playlists")
    .select("playlist_id")
    .eq("group_id", normalizedGroupId);

  if (existingError) {
    throw existingError;
  }

  const existingPlaylistIds = new Set(
    (existingRows || [])
      .map((row: any) => String(row?.playlist_id || "").trim())
      .filter((playlistId: string) => playlistId.length > 0),
  );

  const stalePlaylistIds = Array.from(existingPlaylistIds).filter(
    (playlistId) => !normalizedPlaylistIds.includes(playlistId),
  );

  if (stalePlaylistIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("group_playlists")
      .delete()
      .eq("group_id", normalizedGroupId)
      .in("playlist_id", stalePlaylistIds);

    if (deleteError) {
      throw deleteError;
    }
  }

  if (normalizedPlaylistIds.length === 0) {
    return;
  }

  const rows = normalizedPlaylistIds.map((playlistId, index) => ({
    group_id: normalizedGroupId,
    playlist_id: playlistId,
    position: index,
  }));

  const { error: upsertError } = await supabase
    .from("group_playlists")
    .upsert(rows, { onConflict: "group_id,playlist_id" });

  if (upsertError) {
    throw upsertError;
  }
};