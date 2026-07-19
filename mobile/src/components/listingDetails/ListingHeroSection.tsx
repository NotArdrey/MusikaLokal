import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import CachedImage from "../CachedImage";

const GIG_FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1000&q=75",
  "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1000&q=75",
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1000&q=75",
];

const getGigFallbackImage = (group: any) => {
  if (group?.type !== "Gig") return null;

  const seed = String(group?.id || group?.name || "Gig")
    .split("")
    .reduce((sum, character) => sum + character.charCodeAt(0), 0);

  return GIG_FALLBACK_IMAGES[seed % GIG_FALLBACK_IMAGES.length];
};

interface ListingHeroSectionProps {
  group: any;
  colors: any;
  styles: any;
  isFavorited: boolean;
  favoriteCount?: number;
  showFavoriteButton?: boolean;
  showReportButton?: boolean;
  onClose: () => void;
  onToggleFavorite: () => void;
  onReport?: () => void;
  onShare?: () => void;
  onChat?: () => void;
}

const ListingHeroSection = ({
  group,
  colors,
  styles,
  isFavorited,
  favoriteCount = 0,
  showFavoriteButton = true,
  showReportButton = false,
  onClose,
  onToggleFavorite,
  onReport,
  onShare,
  onChat,
}: ListingHeroSectionProps) => {
  const actionIconStyle = {
    lineHeight: 22,
    includeFontPadding: false,
  } as const;

  return (
  <View style={styles.imageContainer}>
    <CachedImage
      uri={(group.images && group.images[0]) || group.image || null}
      fallbackUri={getGigFallbackImage(group)}
      style={[styles.image, { backgroundColor: colors.border }]}
      width={1080}
      height={680}
      cacheVersion={group.updated_at || group.created_at || group.id}
    />
    <LinearGradient
      colors={["rgba(0,0,0,0.5)", "transparent", "rgba(0,0,0,0.6)"]}
      style={styles.gradient}
    />

    <View style={styles.headerActions}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.roundBtn}>
        <Ionicons name="close" size={22} color="#000" style={actionIconStyle} />
      </TouchableOpacity>

      <View style={styles.rightActions}>
        {showReportButton && onReport ? (
          <TouchableOpacity
            activeOpacity={1}
            onPress={onReport}
            testID="listing-report-button"
            accessibilityLabel="listing-report-button"
            style={styles.roundBtn}
          >
            <Ionicons
              name="flag-outline"
              size={22}
              color="#EF4444"
              style={actionIconStyle}
            />
          </TouchableOpacity>
        ) : null}
        {onChat ? (
          <TouchableOpacity activeOpacity={1} onPress={onChat} style={styles.roundBtn}>
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={22}
              color="#000"
              style={actionIconStyle}
            />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity activeOpacity={1} onPress={onShare} style={styles.roundBtn}>
          <Ionicons
            name="share-outline"
            size={22}
            color="#000"
            style={actionIconStyle}
          />
        </TouchableOpacity>
        {showFavoriteButton ? (
          <TouchableOpacity activeOpacity={1} onPress={onToggleFavorite} style={styles.roundBtn}>
            <Ionicons
              name={isFavorited ? "bookmark" : "bookmark-outline"}
              size={22}
              color={isFavorited ? colors.primary : "#000"}
              style={actionIconStyle}
            />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>

    <View style={styles.heroIdentity}>
      <View style={styles.statusRow} />
      <Text style={styles.heroTitle}>{group.name}</Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginTop: 4,
        }}
      >
        <Ionicons name="location" size={14} color="#FFF" />
        <Text style={styles.heroLocation}>{group.location || "Manila"}</Text>
        <Text style={[styles.heroLocation, { marginLeft: 12 }]}>• {group.genre || "Music"}</Text>
      </View>
      {showFavoriteButton ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: 4,
          }}
        >
          <Ionicons name="bookmark" size={13} color="#FFF" />
          <Text style={[styles.heroLocation, { marginLeft: 6 }]}> 
            {favoriteCount} bookmarked
          </Text>
        </View>
      ) : null}
    </View>
  </View>
  );
};

export default ListingHeroSection;
