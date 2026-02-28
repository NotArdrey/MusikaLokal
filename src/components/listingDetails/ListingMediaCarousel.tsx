import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import CachedImage from "../CachedImage";

interface ListingMediaCarouselProps {
  mediaItems: string[];
  colors: any;
  isDark: boolean;
  styles: any;
  cacheVersion?: string | number | Date;
}

const ListingMediaCarousel = ({
  mediaItems,
  colors,
  isDark,
  styles,
  cacheVersion,
}: ListingMediaCarouselProps) => {
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);

  useEffect(() => {
    setActiveMediaIndex(0);
  }, [mediaItems.length]);

  useEffect(() => {
    if (mediaItems.length <= 1) return;

    const timer = setInterval(() => {
      setActiveMediaIndex((prev) => (prev + 1) % mediaItems.length);
    }, 2800);

    return () => clearInterval(timer);
  }, [mediaItems.length]);

  const goToPreviousMedia = () => {
    if (mediaItems.length <= 1) return;
    setActiveMediaIndex((prev) =>
      prev === 0 ? mediaItems.length - 1 : prev - 1,
    );
  };

  const goToNextMedia = () => {
    if (mediaItems.length <= 1) return;
    setActiveMediaIndex((prev) => (prev + 1) % mediaItems.length);
  };

  if (mediaItems.length === 0) {
    return (
      <View
        style={{
          paddingVertical: 28,
          alignItems: "center",
          borderWidth: 1,
          borderStyle: "dashed",
          borderRadius: 16,
          borderColor: colors.border,
          backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
        }}
      >
        <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_500Medium" }}>
          No media uploaded yet
        </Text>
      </View>
    );
  }

  return (
    <>
      <View
        style={{
          borderRadius: 16,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
          position: "relative",
        }}
      >
        <CachedImage
          uri={mediaItems[activeMediaIndex]}
          style={[
            styles.galleryImage,
            {
              width: "100%",
              height: 220,
              marginRight: 0,
              backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
            },
          ]}
          width={900}
          height={520}
          cacheVersion={cacheVersion}
        />

        {mediaItems.length > 1 && (
          <>
            <TouchableOpacity activeOpacity={1}
              onPress={goToPreviousMedia}
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                marginTop: -18,
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: "rgba(0,0,0,0.35)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="chevron-back" size={20} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={1}
              onPress={goToNextMedia}
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                marginTop: -18,
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: "rgba(0,0,0,0.35)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </TouchableOpacity>
          </>
        )}
      </View>

      {mediaItems.length > 1 && (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            marginTop: 10,
            gap: 6,
          }}
        >
          {mediaItems.map((_, index) => (
            <View
              key={`carousel-dot-${index}`}
              style={{
                width: index === activeMediaIndex ? 14 : 6,
                height: 6,
                borderRadius: 999,
                backgroundColor:
                  index === activeMediaIndex
                    ? colors.primary
                    : colors.border,
              }}
            />
          ))}
        </View>
      )}
    </>
  );
};

export default ListingMediaCarousel;