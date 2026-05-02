import { Image as ExpoImage, ImageContentFit } from "expo-image";
import React, { memo, useEffect, useMemo, useState } from "react";
import { ImageStyle, StyleProp, StyleSheet } from "react-native";
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
  disableRecyclingKey?: boolean;
  priority?: "low" | "normal" | "high";
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})?$/i;

const normalizeImageUriCandidate = (value?: string | null) => {
  const raw = (value || "").trim();
  if (!raw) return null;

  if (DATE_ONLY_PATTERN.test(raw) || ISO_TIMESTAMP_PATTERN.test(raw)) {
    return null;
  }

  const hasKnownScheme = /^(https?:|data:|file:|content:|blob:|asset:|ph:)/i.test(raw);
  const isSupabaseRelativePath = raw.startsWith("/storage/v1/");
  const hasPathSeparator = raw.includes("/");
  const hasFileLikeSuffix = /\.[a-z0-9]{2,5}(\?|#|$)/i.test(raw);

  if (!hasKnownScheme && !isSupabaseRelativePath && !hasPathSeparator && !hasFileLikeSuffix) {
    return null;
  }

  return raw;
};

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
  disableRecyclingKey = false,
  priority = "normal",
}: CachedImageProps) => {
  const flattenedStyle = useMemo(() => StyleSheet.flatten(style) || {}, [style]);
  const inferredWidth = typeof flattenedStyle.width === "number" ? flattenedStyle.width : undefined;
  const inferredHeight = typeof flattenedStyle.height === "number" ? flattenedStyle.height : undefined;
  const targetWidth = width || inferredWidth;
  const targetHeight = height || inferredHeight;

  const primarySourceUri = useMemo(() => {
    return normalizeImageUriCandidate(uri);
  }, [uri]);

  const backupSourceUri = useMemo(() => {
    const raw = normalizeImageUriCandidate(fallbackUri);
    if (!raw || raw === primarySourceUri) return null;
    return raw;
  }, [fallbackUri, primarySourceUri]);

  const transformedPrimaryUri = useMemo(() => {
    return optimizeSupabaseImageUrl(primarySourceUri, {
      width: targetWidth,
      height: targetHeight,
      quality,
      resize,
      format,
      cacheVersion,
    });
  }, [cacheVersion, format, primarySourceUri, quality, resize, targetHeight, targetWidth]);

  const transformedBackupUri = useMemo(() => {
    return optimizeSupabaseImageUrl(backupSourceUri, {
      width: targetWidth,
      height: targetHeight,
      quality,
      resize,
      format,
      cacheVersion,
    });
  }, [backupSourceUri, cacheVersion, format, quality, resize, targetHeight, targetWidth]);

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
      priority={priority}
      allowDownscaling
      enforceEarlyResizing
      recyclingKey={disableRecyclingKey ? undefined : resolvedUri}
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
          return;
        }

        setResolvedUri(null);
      }}
    />
  );
};

export default memo(CachedImage);
