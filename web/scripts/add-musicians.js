// Add musician2@test.com and musician3@test.com
// This script uses signUp which doesn't require admin privileges
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

async function addMusicians() {
    console.log('\n🎵 Adding musician2@test.com and musician3@test.com\n');
    console.log('⚠️  Note: You will need to confirm these emails in the Supabase Dashboard');
    console.log('   Go to: Authentication > Users > Click the user > Confirm email\n');
    
    try {
        // Create musician2@test.com using signUp
        console.log('Creating musician2@test.com...');
        const { data: user2Data, error: error2 } = await supabase.auth.signUp({
            email: 'musician2@test.com',
            password: 'pass123',
            options: {
                data: {
                    full_name: 'Jazz Musician',
                    role: 'musician'
                }
            }
        });
        
        if (error2) {
            console.log('❌ Error creating musician2:', error2.message);
        } else if (user2Data.user) {
            console.log('✅ Created musician2@test.com with ID:', user2Data.user.id);
            console.log('   Email confirmation required');
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Create musician3@test.com using signUp
        console.log('\nCreating musician3@test.com...');
        const { data: user3Data, error: error3 } = await supabase.auth.signUp({
            email: 'musician3@test.com',
            password: 'pass123',
            options: {
                data: {
                    full_name: 'Rock Musician',
                    role: 'musician'
                }
            }
        });
        
        if (error3) {
            console.log('❌ Error creating musician3:', error3.message);
        } else if (user3Data.user) {
            console.log('✅ Created musician3@test.com with ID:', user3Data.user.id);
            console.log('   Email confirmation required');
        }
        
        console.log('\n📋 Next Steps:');
        console.log('1. Go to your Supabase Dashboard');
        console.log('2. Navigate to: Authentication > Users');
        console.log('3. For each new user, click on them and confirm their email');
        console.log('4. Then they can log in with:');
        console.log('   • musician2@test.com / pass123');
        console.log('   • musician3@test.com / pass123');
        
        console.log('\n💡 Alternative: Run the SQL file I created:');
        console.log('   Open add_musicians.sql in Supabase SQL Editor and execute it');
        
    } catch (err) {
        console.error('❌ Unexpected error:', err.message);
    }
}

addMusicians();
