/**
 * Script to create required storage buckets in Supabase
 * Run: node scripts/setup-storage-buckets.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: Missing Supabase credentials');
  console.error('Please set EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const buckets = [
  { id: 'avatars', name: 'avatars', public: true },
  { id: 'portfolio', name: 'portfolio', public: true },
  { id: 'listings', name: 'listings', public: true },
  { id: 'documents', name: 'documents', public: false },
];

async function setupBuckets() {

  // List existing buckets
  const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();
  
  if (listError) {
    console.error('❌ Error listing buckets:', listError.message);
    process.exit(1);
  }


  // Create each bucket
  for (const bucket of buckets) {
    const exists = existingBuckets.some(b => b.name === bucket.name);
    
    if (exists) {
      continue;
    }

    const { data, error } = await supabase.storage.createBucket(bucket.id, {
      public: bucket.public,
      fileSizeLimit: 52428800, // 50MB
      allowedMimeTypes: bucket.public 
        ? ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'video/mp4', 'video/quicktime']
        : ['application/pdf', 'image/png', 'image/jpeg'],
    });

    if (error) {
      console.error(`❌ Error creating bucket "${bucket.name}":`, error.message);
    } else {
    }
  }

}

setupBuckets().catch(console.error);
