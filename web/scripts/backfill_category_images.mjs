import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.",
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const STUDIO_IMAGES = [
  "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=1400&q=80",
];

const GIG_IMAGES = [
  "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1460723237483-7a6dc9d0b212?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1400&q=80",
];

const MUSICIAN_IMAGES = [
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1488161628813-04466f872be2?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=1200&q=80",
];

const BAND_IMAGES = [
  "https://images.unsplash.com/photo-1521335629791-ce4aec67dd47?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?auto=format&fit=crop&w=1400&q=80",
];

const PAGE_SIZE = 1000;

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
};

const pickByIndex = (arr, index) => arr[index % arr.length];

const fetchAllPaged = async (buildQuery) => {
  const rows = [];
  let from = 0;

  while (true) {
    let query = buildQuery();
    query = query.range(from, from + PAGE_SIZE - 1);

    const { data, error } = await query;
    if (error) throw error;

    const page = data || [];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
};

const replaceMediaRows = async ({
  table,
  idColumn,
  entityIds,
  images,
}) => {
  let deleted = 0;
  let inserted = 0;

  const idChunks = chunk(entityIds, 200);
  let offset = 0;

  for (const ids of idChunks) {
    if (ids.length === 0) continue;

    const { error: deleteError, count: deleteCount } = await supabase
      .from(table)
      .delete({ count: "exact" })
      .eq("media_type", "image")
      .in(idColumn, ids);

    if (deleteError) throw deleteError;
    deleted += deleteCount || 0;

    const rows = ids.map((entityId, localIndex) => ({
      [idColumn]: entityId,
      media_type: "image",
      media_url: pickByIndex(images, offset + localIndex),
      sort_order: 0,
    }));

    const { error: insertError } = await supabase.from(table).insert(rows);
    if (insertError) throw insertError;

    inserted += rows.length;
    offset += rows.length;
  }

  return { deleted, inserted };
};

const updateMusicianAvatars = async (profiles) => {
  let updated = 0;
  const profileChunks = chunk(profiles, 200);
  let offset = 0;

  for (const group of profileChunks) {
    const operations = group.map(async (profile, localIndex) => {
      const avatar_url = pickByIndex(MUSICIAN_IMAGES, offset + localIndex);
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url })
        .eq("id", profile.id);

      if (error) throw error;
      return 1;
    });

    const results = await Promise.all(operations);
    updated += results.reduce((sum, value) => sum + value, 0);
    offset += group.length;
  }

  return updated;
};

const now = new Date();
const stamp = now.toISOString().replace(/[T:.]/g, "-").slice(0, 19);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backupPath = path.join(__dirname, `image-backup-${stamp}.json`);

const main = async () => {
  console.log("Starting category image backfill...");

  const musicians = await fetchAllPaged(() =>
    supabase
      .from("profiles")
      .select("id, role, avatar_url")
      .eq("role", "musician")
      .order("id", { ascending: true }),
  );

  const studios = await fetchAllPaged(() =>
    supabase.from("studios").select("id").order("id", { ascending: true }),
  );

  const gigs = await fetchAllPaged(() =>
    supabase.from("gigs").select("id").order("id", { ascending: true }),
  );

  const groups = await fetchAllPaged(() =>
    supabase.from("groups").select("id").order("id", { ascending: true }),
  );

  const studioMediaBefore = await fetchAllPaged(() =>
    supabase
      .from("studio_media")
      .select("studio_id, media_type, media_url, sort_order")
      .eq("media_type", "image")
      .order("studio_id", { ascending: true }),
  );

  const gigMediaBefore = await fetchAllPaged(() =>
    supabase
      .from("gig_media")
      .select("gig_id, media_type, media_url, sort_order")
      .eq("media_type", "image")
      .order("gig_id", { ascending: true }),
  );

  const groupMediaBefore = await fetchAllPaged(() =>
    supabase
      .from("group_media")
      .select("group_id, media_type, media_url, sort_order")
      .eq("media_type", "image")
      .order("group_id", { ascending: true }),
  );

  const backup = {
    createdAt: now.toISOString(),
    projectUrl: SUPABASE_URL,
    counts: {
      musicians: musicians.length,
      studios: studios.length,
      gigs: gigs.length,
      groups: groups.length,
      studioMediaRows: studioMediaBefore.length,
      gigMediaRows: gigMediaBefore.length,
      groupMediaRows: groupMediaBefore.length,
    },
    musicians,
    studioMediaBefore,
    gigMediaBefore,
    groupMediaBefore,
  };

  await fs.writeFile(backupPath, JSON.stringify(backup, null, 2), "utf8");
  console.log(`Backup written to ${backupPath}`);

  const musicianUpdated = await updateMusicianAvatars(musicians);

  const studioResult = await replaceMediaRows({
    table: "studio_media",
    idColumn: "studio_id",
    entityIds: studios.map((row) => row.id),
    images: STUDIO_IMAGES,
  });

  const gigResult = await replaceMediaRows({
    table: "gig_media",
    idColumn: "gig_id",
    entityIds: gigs.map((row) => row.id),
    images: GIG_IMAGES,
  });

  const groupResult = await replaceMediaRows({
    table: "group_media",
    idColumn: "group_id",
    entityIds: groups.map((row) => row.id),
    images: BAND_IMAGES,
  });

  const [{ data: studioSample }, { data: gigSample }, { data: groupSample }, { data: musicianSample }] = await Promise.all([
    supabase.from("studios_with_stats").select("id,name,images").limit(3),
    supabase.from("gigs_with_stats").select("id,name,images").limit(3),
    supabase.from("groups_with_stats").select("id,name,images").limit(3),
    supabase.from("profiles").select("id,full_name,avatar_url").eq("role", "musician").limit(3),
  ]);

  console.log("Backfill completed.");
  console.log(
    JSON.stringify(
      {
        musicianUpdated,
        studio: studioResult,
        gig: gigResult,
        group: groupResult,
        samples: {
          studioSample: studioSample || [],
          gigSample: gigSample || [],
          groupSample: groupSample || [],
          musicianSample: musicianSample || [],
        },
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error("Image backfill failed:", error?.message || error);
  process.exit(1);
});
