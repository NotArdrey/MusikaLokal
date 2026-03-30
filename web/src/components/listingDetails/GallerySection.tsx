import React from "react";
import { ScrollView, Text, View } from "react-native";
import CachedImage from "../CachedImage";

interface GallerySectionProps {
  group: any;
  colors: any;
  styles: any;
}

const GallerySection = ({ group, colors, styles }: GallerySectionProps) => {
  if (!group.images || group.images.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Gallery</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.galleryContainer}
      >
        {group.images.map((img: string, i: number) => (
          <CachedImage
            key={i}
            uri={img}
            style={styles.galleryImage}
            width={640}
            height={360}
            cacheVersion={group.updated_at || group.created_at || group.id}
          />
        ))}
      </ScrollView>
    </View>
  );
};

export default GallerySection;
