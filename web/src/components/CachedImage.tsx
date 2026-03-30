import { Image as ExpoImage, ImageContentFit } from "expo-image";
import React, { useEffect, useMemo, useState } from "react";
import { ImageStyle, StyleProp } from "react-native";
import {
    optimizeSupabaseImageUrl,
    SupabaseTransformOptions,
} from "../utils/imageOptimization";

interface CachedImageProps extends SupabaseTransformOptions {
  uri?: string | null;
  fallbackUri?: string | null;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  transition?: number;
  cachePolicy?: "none" | "disk" | "memory" | "memory-disk";
}

const CachedImage = ({
  uri,
  fallbackUri,
  style,
  width,
  height,
  quality = 72,
  resize = "cover",
  format = "origin",
  cacheVersion,
  contentFit = "cover",
  transition = 0,
  cachePolicy = "memory-disk",
}: CachedImageProps) => {
  const sourceUri = useMemo(() => {
    const raw = (uri || fallbackUri || "").trim();
    if (!raw) return null;
    return raw;
  }, [fallbackUri, uri]);

  const transformedUri = useMemo(() => {
    return optimizeSupabaseImageUrl(sourceUri, {
      width,
      height,
      quality,
      resize,
      format,
      cacheVersion,
    });
  }, [cacheVersion, format, height, quality, resize, sourceUri, width]);

  const [resolvedUri, setResolvedUri] = useState<string | null>(transformedUri);

  useEffect(() => {
    setResolvedUri(transformedUri);
  }, [transformedUri]);

  if (!resolvedUri) return null;

  return (
    <ExpoImage
      source={{ uri: resolvedUri }}
      style={style}
      contentFit={contentFit}
      transition={transition}
      cachePolicy={cachePolicy}
      recyclingKey={resolvedUri}
      onError={() => {
        if (sourceUri && resolvedUri !== sourceUri) {
          setResolvedUri(sourceUri);
        }
      }}
    />
  );
};

export default CachedImage;
