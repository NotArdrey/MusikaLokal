/**
 * Script to apply storage policies
 * Run: node scripts/apply-storage-policies.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const serviceKey = supabaseServiceKey && supabaseServiceKey !== 'your_service_role_key_here' 
  ? supabaseServiceKey 
  : supabaseAnonKey;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Error: Missing Supabase credentials\n');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

const policies = [
  {
    name: 'Users can upload avatars',
    table: 'storage.objects',
    definition: `
      CREATE POLICY "Users can upload avatars"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'avatars' AND auth.uid()::TEXT = (storage.foldername(name))[1]);
    `
  },
  {
    name: 'Avatars are publicly viewable',
    table: 'storage.objects',
    definition: `
      CREATE POLICY "Avatars are publicly viewable"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'avatars');
    `
  },
  {
    name: 'Users can upload portfolio',
    table: 'storage.objects',
    definition: `
      CREATE POLICY "Users can upload portfolio"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'portfolio' AND auth.uid()::TEXT = (storage.foldername(name))[1]);
    `
  },
  {
    name: 'Portfolio is publicly viewable',
    table: 'storage.objects',
    definition: `
      CREATE POLICY "Portfolio is publicly viewable"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'portfolio');
    `
  },
  {
    name: 'Users can upload listings',
    table: 'storage.objects',
    definition: `
      CREATE POLICY "Users can upload listings"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'listings');
    `
  },
  {
    name: 'Listings are publicly viewable',
    table: 'storage.objects',
    definition: `
      CREATE POLICY "Listings are publicly viewable"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'listings');
    `
  },
  {
    name: 'Users can delete their own avatars',
    table: 'storage.objects',
    definition: `
      CREATE POLICY "Users can delete their own avatars"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'avatars' AND auth.uid()::TEXT = (storage.foldername(name))[1]);
    `
  },
  {
    name: 'Users can update their own avatars',
    table: 'storage.objects',
    definition: `
      CREATE POLICY "Users can update their own avatars"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'avatars' AND auth.uid()::TEXT = (storage.foldername(name))[1]);
    `
  }
];

async function applyPolicies() {
  console.log('🔐 Applying storage policies...\n');

  for (const policy of policies) {
    console.log(`Applying: ${policy.name}`);
    
    // Drop policy if exists
    const dropQuery = `DROP POLICY IF EXISTS "${policy.name}" ON ${policy.table};`;
    const { error: dropError } = await supabase.rpc('exec_sql', { sql: dropQuery }).catch(() => ({ error: null }));
    
    // Create policy
    const { error } = await supabase.rpc('exec_sql', { sql: policy.definition }).catch(() => ({ error: null }));
    
    if (error) {
      console.log(`  ⚠️  Could not apply via RPC:`, error.message);
    } else {
      console.log(`  ✓ Applied`);
    }
  }

  console.log('\n📝 Note: If policies could not be applied via API, you need to:');
  console.log('   1. Go to Supabase Dashboard > SQL Editor');
  console.log('   2. Run the storage policy SQL from schema.sql (lines 880-920)');
  console.log('   3. Or go to Storage > Policies to add them manually\n');
}

applyPolicies().catch(console.error);
