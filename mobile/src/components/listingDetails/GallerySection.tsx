import React from "react";
import { FlashList } from "@shopify/flash-list";
import { Text, View } from "react-native";
import CachedImage from "../CachedImage";

interface GallerySectionProps {
  group: any;
  colors: any;
  styles: any;
}

const GallerySection = ({ group, colors, styles }: GallerySectionProps) => {
  if (!group.images || group.images.length === 0) return null;

  const renderGalleryImage = ({ item, index }: { item: string; index: number }) => (
    <CachedImage
      uri={item}
      style={styles.galleryImage}
      width={640}
      height={360}
      cacheVersion={group.updated_at || group.created_at || group.id}
    />
  );

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Gallery</Text>
      <FlashList
        data={group.images}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.galleryContainer}
        drawDistance={360}
        keyExtractor={(item, index) => `${item}-${index}`}
        renderItem={renderGalleryImage}
      />
    </View>
  );
};

export default GallerySection;
