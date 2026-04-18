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
  const primarySourceUri = useMemo(() => {
    const raw = (uri || "").trim();
    if (!raw) return null;
    return raw;
  }, [uri]);

  const backupSourceUri = useMemo(() => {
    const raw = (fallbackUri || "").trim();
    if (!raw || raw === primarySourceUri) return null;
    return raw;
  }, [fallbackUri, primarySourceUri]);

  const transformedPrimaryUri = useMemo(() => {
    return optimizeSupabaseImageUrl(primarySourceUri, {
      width,
      height,
      quality,
      resize,
      format,
      cacheVersion,
    });
  }, [cacheVersion, format, height, primarySourceUri, quality, resize, width]);

  const transformedBackupUri = useMemo(() => {
    return optimizeSupabaseImageUrl(backupSourceUri, {
      width,
      height,
      quality,
      resize,
      format,
      cacheVersion,
    });
  }, [backupSourceUri, cacheVersion, format, height, quality, resize, width]);

  const [resolvedUri, setResolvedUri] = useState<string | null>(transformedPrimaryUri || transformedBackupUri);

  useEffect(() => {
    setResolvedUri(transformedPrimaryUri || transformedBackupUri);
  }, [transformedBackupUri, transformedPrimaryUri]);

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
        if (primarySourceUri && resolvedUri !== primarySourceUri) {
          setResolvedUri(primarySourceUri);
          return;
        }

        if (transformedBackupUri && resolvedUri !== transformedBackupUri) {
          setResolvedUri(transformedBackupUri);
          return;
        }

        if (backupSourceUri && resolvedUri !== backupSourceUri) {
          setResolvedUri(backupSourceUri);
        }
      }}
    />
  );
};

export default CachedImage;
