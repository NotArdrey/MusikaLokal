import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(PROJECT_ROOT, ".env");
const REPORT_PATH = resolve(PROJECT_ROOT, "docs", "storage-cleanup-result-2026-05-19.json");
const SHOULD_DELETE = process.argv.includes("--delete");

const PUBLIC_TABLES = [
  "verification_sessions",
  "stations",
  "profile_genres",
  "leadership_transfer_requests",
  "booking_penalty_events",
  "profile_portfolio_urls",
  "gig_requirements",
  "gig_media",
  "studio_owner_penalties",
  "address_verification_sessions",
  "profile_skills",
  "booking_cancellation_policies",
  "studio_deletion_audit",
  "gig_deletion_audit",
  "email_notifications",
  "didit_webhook_events",
  "registration_attempts",
  "gig_availability_slots",
  "studio_amenities",
  "wallet_deposits",
  "studio_types",
  "group_media",
  "group_roster_members",
  "studio_media",
  "studio_instruments",
  "studio_availability_slots",
  "studio_open_dates",
  "studio_bookings",
  "studio_booking_slots",
  "group_deletion_audit",
  "products",
  "product_variants",
  "group_availability_slots",
  "normalization_exceptions",
  "booking_incidents",
  "wallet_transactions",
  "gig_slot_fill_summary",
  "conversations",
  "messages",
  "studio_date_overrides",
  "studio_settings",
  "subscription_plans",
  "subscriptions",
  "subscription_payments",
  "gig_slot_fill_applicants",
  "production_team_members",
  "conversation_participants",
  "message_reactions",
  "studios",
  "gigs",
  "booking_attendance_events",
  "production_teams",
  "studio_operating_hours",
  "booking_holds",
  "payout_methods",
  "wallets",
  "studio_promotions",
  "booking_requests",
  "reviews",
  "review_likes",
  "permit_audit_log",
  "withdrawal_requests",
  "notifications",
  "gig_applications",
  "notification_preferences",
  "groups",
  "profiles",
  "group_members",
  "reports",
  "post_reactions",
  "follows",
  "feed_posts",
  "post_media",
  "favorites",
  "identity_document_claims",
  "playlists",
  "playlist_items",
  "playlist_teaser_assets",
  "external_platform_links",
  "station_playlist_slots",
  "playlist_play_events",
  "post_comments",
  "social_activity_events",
  "product_media",
  "shipping_profiles",
  "orders",
  "order_items",
  "order_fulfillments",
  "group_playlists",
  "push_notification_devices",
  "production_team_roster",
  "manual_identity_reviews",
];

const PROTECTED_BUCKETS = new Set([
  "identity-manual",
  "public-assets",
]);

const loadEnv = () => {
  try {
    const env = readFileSync(ENV_PATH, "utf8");
    for (const line of env.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const equalsIndex = trimmed.indexOf("=");
      if (equalsIndex === -1) continue;
      const key = trimmed.slice(0, equalsIndex).trim();
      const value = trimmed.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // Environment variables may already be provided by the caller.
  }
};

const getServiceRoleKey = () => {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  const projectRef = process.env.SUPABASE_PROJECT_REF;
  if (!projectRef) {
    throw new Error("Missing SUPABASE_PROJECT_REF.");
  }

  const output = process.platform === "win32"
    ? execFileSync(
      "cmd.exe",
      ["/d", "/s", "/c", `npx supabase projects api-keys --project-ref ${projectRef} -o json`],
      {
        cwd: resolve(PROJECT_ROOT, "web"),
        env: process.env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    )
    : execFileSync(
      "npx",
      ["supabase", "projects", "api-keys", "--project-ref", projectRef, "-o", "json"],
      {
        cwd: resolve(PROJECT_ROOT, "web"),
        env: process.env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  const keys = JSON.parse(output);
  const service = keys.find((key) => key.id === "service_role" || key.name === "service_role");
  if (!service?.api_key) {
    throw new Error("Could not retrieve service_role API key.");
  }
  return service.api_key;
};

const pagedSelect = async (queryBuilder, pageSize = 1000) => {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await queryBuilder.range(from, to);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
};

const listBucketObjects = async (bucketId, prefix = "") => {
  const objects = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(bucketId).list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    const items = data || [];
    for (const item of items) {
      const name = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id && item.metadata) {
        objects.push({
          bucket_id: bucketId,
          name,
          metadata: item.metadata,
          created_at: item.created_at,
          last_accessed_at: item.last_accessed_at,
        });
      } else {
        objects.push(...await listBucketObjects(bucketId, name));
      }
    }
    if (items.length < 1000) break;
  }
  return objects;
};

const pathVariants = (bucketId, name) => {
  const encodedName = name
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return [
    name,
    `${bucketId}/${name}`,
    encodedName,
    `${bucketId}/${encodedName}`,
    `/storage/v1/object/public/${bucketId}/${name}`,
    `/storage/v1/object/public/${bucketId}/${encodedName}`,
    `/storage/v1/object/sign/${bucketId}/${name}`,
    `/storage/v1/object/sign/${bucketId}/${encodedName}`,
  ];
};

const summarize = (objects) => {
  const summary = new Map();
  for (const object of objects) {
    const current = summary.get(object.bucket_id) || { bucket: object.bucket_id, count: 0, bytes: 0 };
    current.count += 1;
    current.bytes += object.bytes;
    summary.set(object.bucket_id, current);
  }
  return [...summary.values()].sort((a, b) => b.bytes - a.bytes);
};

loadEnv();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = getServiceRoleKey();

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase URL or service role key.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
if (bucketError) throw bucketError;

const storageObjects = [];
for (const bucket of buckets || []) {
  storageObjects.push(...await listBucketObjects(bucket.id));
}

const rowTexts = [];
for (const table of PUBLIC_TABLES) {
  const rows = await pagedSelect(supabase.from(table).select("*"));
  for (const row of rows) {
    rowTexts.push(JSON.stringify(row));
  }
}

const referenced = new Set();
for (const object of storageObjects) {
  const variants = pathVariants(object.bucket_id, object.name);
  if (rowTexts.some((text) => variants.some((variant) => text.includes(variant)))) {
    referenced.add(`${object.bucket_id}\n${object.name}`);
  }
}

const candidates = storageObjects
  .map((object) => ({
    bucket_id: object.bucket_id,
    name: object.name,
    bytes: Number(object.metadata?.size || 0),
    mime_type: object.metadata?.mimetype || null,
    created_at: object.created_at,
    last_accessed_at: object.last_accessed_at,
  }))
  .filter((object) => !PROTECTED_BUCKETS.has(object.bucket_id))
  .filter((object) => !referenced.has(`${object.bucket_id}\n${object.name}`));

const beforeSummary = summarize(candidates);
const deleted = [];
const failed = [];

if (SHOULD_DELETE) {
  for (const bucket of [...new Set(candidates.map((object) => object.bucket_id))]) {
    const paths = candidates.filter((object) => object.bucket_id === bucket).map((object) => object.name);
    for (let index = 0; index < paths.length; index += 100) {
      const chunk = paths.slice(index, index + 100);
      const { data, error } = await supabase.storage.from(bucket).remove(chunk);
      if (error) {
        failed.push({ bucket, paths: chunk, error: error.message });
        continue;
      }
      const removedNames = new Set((data || []).map((item) => item.name || item.path).filter(Boolean));
      for (const path of chunk) {
        deleted.push({ bucket_id: bucket, name: path });
        if (removedNames.size > 0 && !removedNames.has(path)) {
          failed.push({ bucket, paths: [path], error: "Storage API did not echo this path in the response." });
        }
      }
    }
  }
}

const deletedSet = new Set(deleted.map((object) => `${object.bucket_id}\n${object.name}`));
const deletedObjects = candidates.filter((object) => deletedSet.has(`${object.bucket_id}\n${object.name}`));
const result = {
  generated_at: new Date().toISOString(),
  mode: SHOULD_DELETE ? "delete" : "dry-run",
  protected_buckets: [...PROTECTED_BUCKETS],
  scanned: {
    storage_objects: storageObjects.length,
    public_tables: PUBLIC_TABLES.length,
    public_rows: rowTexts.length,
    referenced_objects: referenced.size,
  },
  deletion_candidates: {
    count: candidates.length,
    bytes: candidates.reduce((sum, object) => sum + object.bytes, 0),
    by_bucket: beforeSummary,
  },
  deleted: {
    count: deletedObjects.length,
    bytes: deletedObjects.reduce((sum, object) => sum + object.bytes, 0),
    by_bucket: summarize(deletedObjects),
  },
  failed,
};

mkdirSync(dirname(REPORT_PATH), { recursive: true });
writeFileSync(REPORT_PATH, `${JSON.stringify(result, null, 2)}\n`);

console.log(JSON.stringify({
  scanned: result.scanned,
  deletion_candidates: result.deletion_candidates,
  deleted: result.deleted,
  failed_count: failed.length,
  report_path: REPORT_PATH,
}, null, 2));
