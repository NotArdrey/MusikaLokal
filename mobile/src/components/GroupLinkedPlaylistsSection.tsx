import { managementCardStyles } from "../theme/managementCards";
import { typography } from "../theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";

type GroupLinkedPlaylistsSectionProps = {
  colors: any;
  isDark: boolean;
  playlists: any[];
  loading: boolean;
  onPlaylistPress: (playlistId: string) => void;
  onCreatePlaylist?: () => void;
  title?: string;
  emptyMessage?: string;
  createButtonLabel?: string;
};

export default function GroupLinkedPlaylistsSection({
  colors,
  isDark,
  playlists,
  loading,
  onPlaylistPress,
  onCreatePlaylist,
  title = "Playlists",
  emptyMessage = "No playlists linked yet.",
  createButtonLabel = "Upload Playlist",
}: GroupLinkedPlaylistsSectionProps) {
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 18, fontFamily: typography.semibold, flexShrink: 1 }}>
            {title}
          </Text>
          {playlists.length > 0 ? (
            <View
              style={{
                backgroundColor: colors.primary + "18",
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 999,
              }}
            >
              <Text style={{ color: colors.primary, fontSize: 10, fontFamily: typography.semibold }}>
                {playlists.length}
              </Text>
            </View>
          ) : null}
        </View>

        {onCreatePlaylist ? (
          <TouchableOpacity
            activeOpacity={1}
            onPress={onCreatePlaylist}
            disabled={loading}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 11,
              paddingVertical: 7,
              borderRadius: 10,
              backgroundColor: loading ? colors.border : colors.primary,
              opacity: loading ? 0.65 : 1,
            }}
          >
            <Ionicons name="cloud-upload-outline" size={14} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 11, fontFamily: typography.semibold }}>
              {createButtonLabel}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: isDark ? "#1F2937" : "#F8FAFC",
            padding: 18,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ color: colors.textSecondary, fontFamily: typography.body }}>
            Loading playlists...
          </Text>
        </View>
      ) : playlists.length > 0 ? (
        <View style={{ gap: 10 }}>
          {playlists.map((playlist: any) => {
            const playlistId = String(playlist?.playlist_id || playlist?.id || "").trim();
            if (!playlistId) {
              return null;
            }

            const itemCount = Number(playlist?.track_count || playlist?.item_count || 0);

            return (
              <TouchableOpacity
                key={playlistId}
                activeOpacity={1}
                onPress={() => onPlaylistPress(playlistId)}
                style={{
                  ...managementCardStyles.surface,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <View
                  style={{
                    ...managementCardStyles.thumbnail,
                    backgroundColor: colors.primary + "18",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="musical-notes-outline" size={18} color={colors.primary} />
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={2}
                    style={{
                      color: colors.text,
                      ...managementCardStyles.title,
                    }}
                  >
                    {playlist.title || "Untitled Playlist"}
                  </Text>
                  {playlist.genre ? (
                    <Text
                      style={{
                        marginTop: 2,
                        color: colors.textSecondary,
                        fontSize: 12,
                        fontFamily: typography.body,
                      }}
                    >
                      {playlist.genre}
                    </Text>
                  ) : null}
                  <Text
                    style={{
                      marginTop: 3,
                      color: colors.textSecondary,
                      fontSize: 11,
                      fontFamily: typography.body,
                    }}
                  >
                    {itemCount} track{itemCount === 1 ? "" : "s"}
                  </Text>
                </View>

                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <View
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: isDark ? "#1F2937" : "#F8FAFC",
            padding: 18,
          }}
        >
          <Text style={{ color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, lineHeight: 18 }}>
            {emptyMessage}
          </Text>
        </View>
      )}
    </View>
  );
}
