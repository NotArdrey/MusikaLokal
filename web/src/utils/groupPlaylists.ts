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
  owner_group_id?: string | null;
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
