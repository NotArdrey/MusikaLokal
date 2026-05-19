/**
 * Script to create or update required storage buckets in Supabase.
 * Run: node scripts/setup-storage-buckets.js
 */

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Error: Missing Supabase credentials");
  console.error("Please set EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const buckets = [
  { id: "avatars", name: "avatars", public: true },
  { id: "portfolio", name: "portfolio", public: true },
  { id: "listings", name: "listings", public: true },
  { id: "playlist-assets", name: "playlist-assets", public: true },
  { id: "documents", name: "documents", public: false },
];

const getAllowedMimeTypes = (bucket) => {
  if (bucket.id === "playlist-assets") {
    return ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp", "image/heic", "image/heif", "video/mp4", "video/quicktime", "video/webm", "audio/mpeg", "audio/mp3"];
  }

  return bucket.public
    ? ["image/png", "image/jpeg", "image/jpg", "image/gif", "video/mp4", "video/quicktime"]
    : ["application/pdf", "image/png", "image/jpeg", "image/jpg", "audio/mpeg", "audio/mp3"];
};

async function setupBuckets() {
  const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();

  if (listError) {
    console.error("Error listing buckets:", listError.message);
    process.exit(1);
  }

  for (const bucket of buckets) {
    const exists = existingBuckets.some((existingBucket) => existingBucket.name === bucket.name);
    const bucketOptions = {
      public: bucket.public,
      fileSizeLimit: 52428800,
      allowedMimeTypes: getAllowedMimeTypes(bucket),
    };
    const bucketUpdateOptions = {
      fileSizeLimit: bucketOptions.fileSizeLimit,
      allowedMimeTypes: bucketOptions.allowedMimeTypes,
    };

    if (exists) {
      const { error } = await supabase.storage.updateBucket(bucket.id, bucketUpdateOptions);
      if (error) {
        console.error(`Error updating bucket "${bucket.name}":`, error.message);
      }
      continue;
    }

    const { error } = await supabase.storage.createBucket(bucket.id, bucketOptions);
    if (error) {
      console.error(`Error creating bucket "${bucket.name}":`, error.message);
    }
  }
}

setupBuckets().catch(console.error);
