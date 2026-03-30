/**
 * Test authentication and storage access
 * Run: node scripts/test-auth-storage.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testAuthAndStorage() {
  console.log('🧪 Testing Authentication and Storage Access\n');

  // Test 1: Check current session
  console.log('1. Checking current session...');
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  if (sessionError) {
    console.error('❌ Error getting session:', sessionError.message);
  } else if (!session) {
    console.log('⚠️  No active session found');
    console.log('\n💡 Solution: You need to log in first!');
    console.log('   Test login with: musician@tet.com / pass123\n');
    
    // Try to sign in with test user
    console.log('2. Attempting to sign in with test user...');
    const { data, error } = await supabase.auth.signInWithPassword({
      email: 'musician@tet.com',
      password: 'pass123',
    });
    
    if (error) {
      console.error('❌ Login failed:', error.message);
      console.log('\n💡 Make sure you have run the seed data SQL in your Supabase dashboard');
      return;
    } else {
      console.log('✅ Logged in successfully!');
      console.log('   User ID:', data.user.id);
      console.log('   Email:', data.user.email);
    }
  } else {
    console.log('✅ Active session found');
    console.log('   User ID:', session.user.id);
    console.log('   Email:', session.user.email);
  }

  // Test 2: Try to upload a test file
  console.log('\n3. Testing file upload to listings bucket...');
  const testData = new Blob(['test content'], { type: 'text/plain' });
  const testFileName = `test-upload-${Date.now()}.txt`;
  
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('listings')
    .upload(testFileName, testData);

  if (uploadError) {
    console.error('❌ Upload failed:', uploadError.message);
    console.log('\n💡 Possible causes:');
    console.log('   1. Storage policies not applied');
    console.log('   2. Bucket does not exist');
    console.log('   3. Not authenticated');
  } else {
    console.log('✅ Upload successful!');
    console.log('   Path:', uploadData.path);
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('listings')
      .getPublicUrl(uploadData.path);
    console.log('   Public URL:', publicUrl);
    
    // Clean up
    await supabase.storage.from('listings').remove([uploadData.path]);
    console.log('   ✓ Test file cleaned up');
  }

  console.log('\n✅ Test complete!');
}

testAuthAndStorage().catch(console.error);
