import type { SupabaseClient } from "@supabase/supabase-js";

// Only call after the database save/removal succeeds, for URLs no longer referenced.
export async function cleanupRemovedStorageObjects(
  client: Pick<SupabaseClient, "storage">,
  projectUrl: string,
  urls: string[],
) {
  const grouped = new Map<string, Set<string>>();
  const errors: string[] = [];

  for (const url of urls) {
    try {
      const parsed = new URL(url, projectUrl);
      if (parsed.origin !== new URL(projectUrl).origin) continue;
      const match = parsed.pathname.match(
        /^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/,
      );
      if (!match) continue;
      const bucket = decodeURIComponent(match[1]);
      const path = decodeURIComponent(match[2]);
      if (!grouped.has(bucket)) grouped.set(bucket, new Set());
      grouped.get(bucket)!.add(path);
    } catch {
      // External or malformed URLs are not Storage API cleanup targets.
    }
  }

  let deletedObjects = 0;
  for (const [bucket, paths] of grouped) {
    const uniquePaths = [...paths];
    for (let offset = 0; offset < uniquePaths.length; offset += 100) {
      try {
        const { data, error } = await client.storage
          .from(bucket)
          .remove(uniquePaths.slice(offset, offset + 100));
        if (error) errors.push(`${bucket}: ${error.message}`);
        else deletedObjects += data?.length || 0;
      } catch (error) {
        errors.push(`${bucket}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return { deletedObjects, errors };
}
