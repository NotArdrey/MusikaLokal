type CacheVersion = string | number | Date | null | undefined;

export interface SupabaseTransformOptions {
  width?: number;
  height?: number;
  quality?: number;
  resize?: "cover" | "contain" | "fill";
  format?: "origin" | "webp" | "avif";
  cacheVersion?: CacheVersion;
}

const OBJECT_PUBLIC_SEGMENT = "/storage/v1/object/public/";
const RENDER_PUBLIC_SEGMENT = "/storage/v1/render/image/public/";

const getSupabaseBaseUrl = () => {
  const envBase =
    typeof process !== "undefined"
      ? process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
      : undefined;

  if (!envBase) return null;
  return envBase.endsWith("/") ? envBase.slice(0, -1) : envBase;
};

const normalizePossibleRelativeSupabaseUrl = (rawUrl: string) => {
  const trimmed = rawUrl.trim();
  const hasKnownScheme = /^(https?:|data:|file:|content:|blob:|asset:|ph:)/i.test(trimmed);

  if (hasKnownScheme) return trimmed;

  const base = getSupabaseBaseUrl();
  if (!base) return trimmed;

  if (trimmed.startsWith("/storage/v1/")) {
    return `${base}${trimmed}`;
  }

  if (trimmed.startsWith("storage/v1/")) {
    return `${base}/${trimmed}`;
  }

  if (trimmed.includes("/") && !trimmed.startsWith("/")) {
    return `${base}${OBJECT_PUBLIC_SEGMENT}${trimmed.replace(/^\/+/, "")}`;
  }

  return trimmed;
};

const normalizeDimension = (value?: number) => {
  if (!value || Number.isNaN(value)) return undefined;
  return Math.max(16, Math.round(value));
};

const normalizeQuality = (value?: number) => {
  if (!value || Number.isNaN(value)) return undefined;
  return Math.max(20, Math.min(100, Math.round(value)));
};

export const normalizeCacheVersion = (value?: CacheVersion) => {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return String(value.getTime());
  const raw = String(value).trim();
  if (!raw) return undefined;

  const parsedDate = new Date(raw);
  if (!Number.isNaN(parsedDate.getTime())) {
    return String(parsedDate.getTime());
  }

  return raw;
};

const applyTransformParams = (
  params: URLSearchParams,
  options: SupabaseTransformOptions,
) => {
  const width = normalizeDimension(options.width);
  const height = normalizeDimension(options.height);
  const quality = normalizeQuality(options.quality);

  if (width) params.set("width", String(width));
  if (height) params.set("height", String(height));
  if (quality) params.set("quality", String(quality));

  if (options.resize) params.set("resize", options.resize);
  if (options.format) params.set("format", options.format);

  const version = normalizeCacheVersion(options.cacheVersion);
  if (version) params.set("v", version);
};

export const optimizeSupabaseImageUrl = (
  rawUrl?: string | null,
  options: SupabaseTransformOptions = {},
) => {
  if (!rawUrl) return null;

  const trimmed = normalizePossibleRelativeSupabaseUrl(rawUrl.trim());
  if (!trimmed) return null;

  if (
    trimmed.startsWith("data:") ||
    trimmed.startsWith("file:") ||
    trimmed.startsWith("content:")
  ) {
    return trimmed;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return trimmed;
  }

  const pathname = parsed.pathname;

  if (pathname.includes(OBJECT_PUBLIC_SEGMENT)) {
    const publicPath = pathname.split(OBJECT_PUBLIC_SEGMENT)[1];
    if (!publicPath) return trimmed;

    const renderUrl = new URL(`${parsed.origin}${RENDER_PUBLIC_SEGMENT}${publicPath}`);
    parsed.searchParams.forEach((value, key) => {
      renderUrl.searchParams.set(key, value);
    });

    applyTransformParams(renderUrl.searchParams, options);
    return renderUrl.toString();
  }

  if (pathname.includes(RENDER_PUBLIC_SEGMENT)) {
    const renderUrl = new URL(trimmed);
    applyTransformParams(renderUrl.searchParams, options);
    return renderUrl.toString();
  }

  const version = normalizeCacheVersion(options.cacheVersion);
  if (version) {
    parsed.searchParams.set("v", version);
    return parsed.toString();
  }

  return trimmed;
};
