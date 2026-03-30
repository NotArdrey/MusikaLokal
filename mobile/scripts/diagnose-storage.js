/**
 * Diagnostic script to check storage configuration
 * Run: node scripts/diagnose-storage.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔍 Supabase Storage Diagnostics\n');
console.log('Configuration:');
console.log('  URL:', supabaseUrl ? '✓ Set' : '✗ Missing');
console.log('  Anon Key:', supabaseAnonKey ? '✓ Set' : '✗ Missing');
console.log('  Service Key:', supabaseServiceKey && supabaseServiceKey !== 'your_service_role_key_here' ? '✓ Set' : '✗ Not set');
console.log('');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Error: Missing required Supabase credentials\n');
  process.exit(1);
}

async function diagnose() {
  // Test with anon key
  console.log('Testing with anon key...');
  const anonClient = createClient(supabaseUrl, supabaseAnonKey);
  
  const { data: buckets, error: listError } = await anonClient.storage.listBuckets();
  
  if (listError) {
    console.error('❌ Cannot list buckets:', listError.message);
    console.log('\n💡 This usually means:');
    console.log('   1. Storage buckets have not been created yet');
    console.log('   2. You need to create them in Supabase Dashboard > Storage\n');
  } else if (buckets.length === 0) {
    console.log('⚠️  No storage buckets found\n');
    console.log('📋 You need to create these buckets in Supabase Dashboard:');
    console.log('   • avatars (public)');
    console.log('   • portfolio (public)');
    console.log('   • listings (public)');
    console.log('   • documents (private)\n');
    console.log('🔗 Go to: ' + supabaseUrl.replace('//', '//app.') + '/project/_/storage/buckets\n');
  } else {
    console.log('✓ Found buckets:', buckets.map(b => b.name).join(', '));
    console.log('');
    
    const required = ['avatars', 'portfolio', 'listings', 'documents'];
    const missing = required.filter(name => !buckets.some(b => b.name === name));
    
    if (missing.length > 0) {
      console.log('⚠️  Missing required buckets:', missing.join(', '));
      console.log('   Create them in Supabase Dashboard > Storage\n');
    } else {
      console.log('✅ All required buckets exist!\n');
      
      // Test upload to listings bucket
      console.log('Testing upload to "listings" bucket...');
      const testData = new Blob(['test'], { type: 'text/plain' });
      const { data, error } = await anonClient.storage
        .from('listings')
        .upload(`test-${Date.now()}.txt`, testData);
      
      if (error) {
        console.error('❌ Upload failed:', error.message);
        console.log('\n💡 This might be due to:');
        console.log('   1. Storage policies not configured (RLS)');
        console.log('   2. Authentication required');
        console.log('   3. Network/CORS issues\n');
      } else {
        console.log('✅ Upload successful!');
        // Clean up test file
        await anonClient.storage.from('listings').remove([data.path]);
        console.log('✓ Test file cleaned up\n');
        console.log('🎉 Storage is working correctly!');
      }
    }
  }
}

diagnose().catch(console.error);
