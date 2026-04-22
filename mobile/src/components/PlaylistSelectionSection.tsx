import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";

type PlaylistSelectionSectionProps = {
  colors: any;
  isDark: boolean;
  playlists: any[];
  selectedPlaylistIds: string[];
  loading: boolean;
  onTogglePlaylist: (playlistId: string) => void;
  onCreatePlaylist?: () => void;
  title?: string;
  subtitle?: string | null;
  emptyMessage?: string;
  createButtonLabel?: string;
  disabled?: boolean;
};

export default function PlaylistSelectionSection({
  colors,
  isDark,
  playlists,
  selectedPlaylistIds,
  loading,
  onTogglePlaylist,
  onCreatePlaylist,
  title = "Playlists",
  subtitle,
  emptyMessage = "No playlists yet. Create one first.",
  createButtonLabel = "New Playlist",
  disabled = false,
}: PlaylistSelectionSectionProps) {
  const selectedSet = new Set(selectedPlaylistIds);

  return (
    <View style={{ marginTop: 24, marginBottom: 12, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          <Text
            style={{
              fontSize: 13,
              fontFamily: "Poppins_600SemiBold",
              color: colors.textSecondary,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {title}
          </Text>
          {selectedPlaylistIds.length > 0 ? (
            <View
              style={{
                backgroundColor: colors.primary + "20",
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 999,
              }}
            >
              <Text
                style={{
                  color: colors.primary,
                  fontSize: 10,
                  fontFamily: "Poppins_600SemiBold",
                }}
              >
                {selectedPlaylistIds.length} linked
              </Text>
            </View>
          ) : null}
        </View>

        {onCreatePlaylist ? (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onCreatePlaylist}
            disabled={disabled}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 10,
              backgroundColor: disabled ? colors.border : colors.primary,
            }}
          >
            <Ionicons name="add" size={14} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 12, fontFamily: "Poppins_600SemiBold" }}>
              {createButtonLabel}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {subtitle ? (
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 11,
            lineHeight: 16,
            fontFamily: "Poppins_400Regular",
          }}
        >
          {subtitle}
        </Text>
      ) : null}

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
          <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular" }}>
            Loading playlists...
          </Text>
        </View>
      ) : playlists.length > 0 ? (
        <View style={{ gap: 10 }}>
          {playlists.map((playlist: any) => {
            const playlistId = String(playlist?.id || "").trim();
            if (!playlistId) {
              return null;
            }

            const isSelected = selectedSet.has(playlistId);
            const itemCount = Number(playlist?.track_count || playlist?.item_count || 0);

            return (
              <TouchableOpacity
                key={playlistId}
                activeOpacity={0.85}
                disabled={disabled}
                onPress={() => onTogglePlaylist(playlistId)}
                style={{
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: isSelected ? colors.primary : colors.border,
                  backgroundColor: isSelected
                    ? colors.primary + "12"
                    : (isDark ? "#111827" : "#FFFFFF"),
                  padding: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  opacity: disabled ? 0.65 : 1,
                }}
              >
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    backgroundColor: isSelected ? colors.primary : colors.primary + "18",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name={isSelected ? "checkmark" : "musical-notes-outline"}
                    size={18}
                    color={isSelected ? "#fff" : colors.primary}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        flex: 1,
                        color: colors.text,
                        fontSize: 14,
                        fontFamily: "Poppins_600SemiBold",
                      }}
                    >
                      {playlist.title || "Untitled Playlist"}
                    </Text>
                    {isSelected ? (
                      <View
                        style={{
                          backgroundColor: colors.primary,
                          paddingHorizontal: 7,
                          paddingVertical: 2,
                          borderRadius: 999,
                        }}
                      >
                        <Text style={{ color: "#fff", fontSize: 9, fontFamily: "Poppins_600SemiBold" }}>
                          LINKED
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {playlist.genre ? (
                    <Text
                      style={{
                        marginTop: 2,
                        color: colors.textSecondary,
                        fontSize: 12,
                        fontFamily: "Poppins_400Regular",
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
                      fontFamily: "Poppins_400Regular",
                    }}
                  >
                    {itemCount} track{itemCount === 1 ? "" : "s"} • {playlist.visibility === "private" ? "Private" : "Public"}
                  </Text>
                </View>

                <Ionicons
                  name={isSelected ? "remove-circle" : "add-circle"}
                  size={22}
                  color={isSelected ? colors.primary : colors.textSecondary}
                />
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
            gap: 8,
          }}
        >
          <Text style={{ color: colors.text, fontFamily: "Poppins_600SemiBold", fontSize: 14 }}>
            No playlists yet
          </Text>
          <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 12, lineHeight: 18 }}>
            {emptyMessage}
          </Text>
        </View>
      )}
    </View>
  );
}