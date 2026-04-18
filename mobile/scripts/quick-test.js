// Quick test - create a studio with availability
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '..', '.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function quickTest() {
    console.log('\n⚡ Quick Availability Test\n');
    
    // Check auth
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        console.log('⚠️  Not logged in. Please:');
        console.log('   1. Open the app');
        console.log('   2. Log in as studio@test.com');
        console.log('   3. Try creating/editing a studio with availability times');
        console.log('   4. Check the console logs for the emoji markers (📅, 🕐)');
        return;
    }
    
    console.log('✅ Logged in as:', session.user.email);
    
    // Try to read from studios table
    console.log('\n📊 Testing direct database access...');
    const { data, error } = await supabase
        .from('studios')
        .select('id, name, availability')
        .limit(1);
    
    if (error) {
        if (error.code === 'PGRST204') {
            console.log('❌ Schema cache not refreshed yet!');
            console.log('⏳ Wait 2-3 more minutes and try again');
            console.log('   Or manually refresh: Dashboard > Settings > API > Reload schema');
        } else {
            console.log('❌ Error:', error.message);
        }
        return;
    }
    
    console.log('✅ Database access working!');
    console.log('📋 Sample studio:', data);
    
    // Now test in the app
    console.log('\n📱 NOW TEST IN THE APP:');
    console.log('   1. Go to Add Studio or Edit Studio');
    console.log('   2. Set availability times (e.g., Monday 9:00 AM - 5:00 PM)');
    console.log('   3. Save the studio');
    console.log('   4. Open the studio card');
    console.log('   5. Check console for these logs:');
    console.log('      📅 Fetching studio operating hours...');
    console.log('      📅 Operating hours fetched: [...]');
    console.log('      📅 Converted availability: [...]');
    console.log('      📅 Processing availability for calendar...');
    console.log('      🕐 fetchAvailableSlots called for date: ...');
    console.log('\n✨ If you see these logs, availability is WORKING!\n');
}

quickTest();
