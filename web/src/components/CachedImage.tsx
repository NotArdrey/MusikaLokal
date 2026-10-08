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
  transform = false,
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
    return normalizeImageUriCandidate(uri);
  }, [uri]);

  const backupSourceUri = useMemo(() => {
    const raw = normalizeImageUriCandidate(fallbackUri);
    if (!raw || raw === primarySourceUri) return null;
    return raw;
  }, [fallbackUri, primarySourceUri]);

  const sourceUri = useMemo(() => {
    const raw = primarySourceUri || backupSourceUri;
    if (!raw) return null;
    return raw;
  }, [backupSourceUri, primarySourceUri]);

  const transformedUri = useMemo(() => {
    return optimizeSupabaseImageUrl(sourceUri, {
      transform,
      width,
      height,
      quality,
      resize,
      format,
      cacheVersion,
    });
  }, [cacheVersion, format, height, quality, resize, sourceUri, transform, width]);

  const imageSources = useMemo(() => Array.from(new Set([
    transformedUri, primarySourceUri, backupSourceUri,
  ])).filter((source): source is string => Boolean(source)),
  [transformedUri, primarySourceUri, backupSourceUri]);
  const [resolvedUri, setResolvedUri] = useState<string | null>(imageSources[0] || null);

  useEffect(() => {
    setResolvedUri(imageSources[0] || null);
  }, [imageSources]);

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
        setResolvedUri((current) => current === resolvedUri
          ? imageSources[imageSources.indexOf(current) + 1] || null
          : current);
      }}
    />
  );
};

export default CachedImage;
