import React, { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import CachedImage from "../CachedImage";

const GALLERY_GAP = 3;
const VISIBLE_MEDIA_LIMIT = 4;

type FeedMediaGalleryProps = {
  mediaUrls: string[];
  mediaWidth: number;
  onPress: () => void;
};

function FeedMediaGalleryComponent({
  mediaUrls,
  mediaWidth,
  onPress,
}: FeedMediaGalleryProps) {
  const visibleMedia = mediaUrls.slice(0, VISIBLE_MEDIA_LIMIT);
  const remainingCount = Math.max(0, mediaUrls.length - visibleMedia.length);

  const renderImageCell = (
    uri: string,
    index: number,
    imageWidth: number,
    imageHeight: number,
    extraStyle?: object,
  ) => (
    <View key={`${uri}-${index}`} style={[styles.cell, extraStyle]}>
      <CachedImage
        uri={uri}
        style={styles.image}
        width={Math.round(imageWidth)}
        height={Math.round(imageHeight)}
        contentFit="cover"
        priority={index === 0 ? "normal" : "low"}
      />
      {index === visibleMedia.length - 1 && remainingCount > 0 ? (
        <View style={styles.moreOverlay}>
          <Text style={styles.moreText}>+{remainingCount}</Text>
        </View>
      ) : null}
    </View>
  );

  if (visibleMedia.length === 0) return null;

  const singleHeight = Math.min(240, Math.round(mediaWidth * 9 / 16));
  const halfWidth = (mediaWidth - GALLERY_GAP) / 2;
  let galleryContent: React.ReactNode;

  if (visibleMedia.length === 1) {
    galleryContent = renderImageCell(visibleMedia[0], 0, mediaWidth, singleHeight, {
      height: singleHeight,
    });
  } else if (visibleMedia.length === 2) {
    galleryContent = (
      <View style={[styles.row, { height: singleHeight }]}>
        {visibleMedia.map((uri, index) => renderImageCell(uri, index, halfWidth, singleHeight))}
      </View>
    );
  } else if (visibleMedia.length === 3) {
    const stackedHeight = (singleHeight - GALLERY_GAP) / 2;
    galleryContent = (
      <View style={[styles.row, { height: singleHeight }]}>
        {renderImageCell(visibleMedia[0], 0, halfWidth, singleHeight)}
        <View style={styles.column}>
          {renderImageCell(visibleMedia[1], 1, halfWidth, stackedHeight)}
          {renderImageCell(visibleMedia[2], 2, halfWidth, stackedHeight)}
        </View>
      </View>
    );
  } else {
    const rowHeight = Math.round((singleHeight - GALLERY_GAP) / 2);
    galleryContent = (
      <View style={styles.grid}>
        <View style={[styles.row, { height: rowHeight }]}>
          {visibleMedia.slice(0, 2).map((uri, index) =>
            renderImageCell(uri, index, halfWidth, rowHeight),
          )}
        </View>
        <View style={[styles.row, { height: rowHeight }]}>
          {visibleMedia.slice(2, 4).map((uri, index) =>
            renderImageCell(uri, index + 2, halfWidth, rowHeight),
          )}
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity activeOpacity={0.92} onPress={onPress} style={styles.wrap}>
      {galleryContent}
    </TouchableOpacity>
  );
}

export const FeedMediaGallery = memo(FeedMediaGalleryComponent);

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginTop: 0,
    overflow: "hidden",
    borderRadius: 12,
    backgroundColor: "#E2E8F0",
  },
  grid: { gap: GALLERY_GAP },
  row: { flexDirection: "row", gap: GALLERY_GAP },
  column: { flex: 1, gap: GALLERY_GAP },
  cell: { flex: 1, overflow: "hidden", backgroundColor: "#CBD5E1" },
  image: { width: "100%", height: "100%" },
  moreOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.56)",
  },
  moreText: { color: "#FFFFFF", fontSize: 28, fontFamily: "Poppins_700Bold" },
});
