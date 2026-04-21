const normalizeRelativeSupabaseStorageUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const envBase = (
    process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
  ).trim();

  if (!envBase) {
    return normalizedPath;
  }

  const base = envBase.endsWith("/") ? envBase.slice(0, -1) : envBase;
  return `${base}${normalizedPath}`;
};

export const resolveSupabaseMediaUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;

  const candidate = value.trim();
  if (!candidate) return null;

  if (candidate.startsWith("/storage/v1/") || candidate.startsWith("storage/v1/")) {
    return normalizeRelativeSupabaseStorageUrl(candidate);
  }

  if (candidate.includes("/storage/v1/object/avatars/")) {
    return candidate.replace(
      "/storage/v1/object/avatars/",
      "/storage/v1/object/public/avatars/",
    );
  }

  if (candidate.includes("/storage/v1/object/public/")) {
    return candidate.startsWith("/")
      ? normalizeRelativeSupabaseStorageUrl(candidate)
      : candidate;
  }

  if (/^(https?:\/\/|data:|file:\/\/)/i.test(candidate)) {
    return candidate;
  }

  return candidate;
};