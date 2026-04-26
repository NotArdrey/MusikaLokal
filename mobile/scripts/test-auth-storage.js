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

  // Test 1: Check current session
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  if (sessionError) {
    console.error('❌ Error getting session:', sessionError.message);
  } else if (!session) {
    
    // Try to sign in with test user
    const { data, error } = await supabase.auth.signInWithPassword({
      email: 'musician@tet.com',
      password: 'pass123',
    });
    
    if (error) {
      console.error('❌ Login failed:', error.message);
      return;
    } else {
    }
  } else {
  }

  // Test 2: Try to upload a test file
  const testData = new Blob(['test content'], { type: 'text/plain' });
  const testFileName = `test-upload-${Date.now()}.txt`;
  
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('listings')
    .upload(testFileName, testData);

  if (uploadError) {
    console.error('❌ Upload failed:', uploadError.message);
  } else {
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('listings')
      .getPublicUrl(uploadData.path);
    
    // Clean up
    await supabase.storage.from('listings').remove([uploadData.path]);
  }

}

testAuthAndStorage().catch(console.error);
