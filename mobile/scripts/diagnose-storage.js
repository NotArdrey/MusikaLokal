/**
 * Diagnostic script to check storage configuration
 * Run: node scripts/diagnose-storage.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;


if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Error: Missing required Supabase credentials\n');
  process.exit(1);
}

async function diagnose() {
  // Test with anon key
  const anonClient = createClient(supabaseUrl, supabaseAnonKey);
  
  const { data: buckets, error: listError } = await anonClient.storage.listBuckets();
  
  if (listError) {
    console.error('❌ Cannot list buckets:', listError.message);
  } else if (buckets.length === 0) {
  } else {
    
    const required = ['avatars', 'portfolio', 'listings', 'documents'];
    const missing = required.filter(name => !buckets.some(b => b.name === name));
    
    if (missing.length > 0) {
    } else {
      
      // Test upload to listings bucket
      const testData = new Blob(['test'], { type: 'text/plain' });
      const { data, error } = await anonClient.storage
        .from('listings')
        .upload(`test-${Date.now()}.txt`, testData);
      
      if (error) {
        console.error('❌ Upload failed:', error.message);
      } else {
        // Clean up test file
        await anonClient.storage.from('listings').remove([data.path]);
      }
    }
  }
}

diagnose().catch(console.error);
