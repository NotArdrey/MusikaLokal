export type AndroidRelease = {
  downloadUrl: string;
  packageId: string;
  versionName: string;
  versionCode: number;
  sizeBytes: number;
  sha256: string;
  minSdk: number;
  builtAt: string;
  certificateSha256: string;
  testing: true;
};

export function parseAndroidRelease(value: unknown): AndroidRelease | null {
  if (!value || typeof value !== "object") return null;
  const release = value as Partial<AndroidRelease>;
  let url: URL;
  try { url = new URL(release.downloadUrl || ""); } catch { return null; }
  const isBlob = url.hostname.endsWith(".public.blob.vercel-storage.com");
  const isSupabase = url.origin === "https://aefldxegsvzecshlayza.supabase.co"
    && url.pathname === `/storage/v1/object/public/android-releases/android/testing/${release.sha256}/musikalokal-testing.apk`;
  if (url.protocol !== "https:" || (!isBlob && !isSupabase) || url.username || url.password) return null;
  if (release.packageId !== "com.anonymous.musikalokal" || release.testing !== true) return null;
  if (typeof release.versionName !== "string" || !/^\d+\.\d+\.\d+$/.test(release.versionName)) return null;
  if (!Number.isSafeInteger(release.versionCode) || release.versionCode! < 1) return null;
  if (!Number.isSafeInteger(release.sizeBytes) || release.sizeBytes! <= 0) return null;
  if (!Number.isSafeInteger(release.minSdk) || release.minSdk! < 24) return null;
  if (typeof release.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(release.sha256)) return null;
  if (typeof release.certificateSha256 !== "string" || !/^[a-f0-9]{64}$/.test(release.certificateSha256)) return null;
  if (typeof release.builtAt !== "string" || !Number.isFinite(Date.parse(release.builtAt))) return null;
  return release as AndroidRelease;
}
