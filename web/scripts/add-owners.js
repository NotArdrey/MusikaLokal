// Add studio2, studio3, venue2, venue3 accounts
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

const users = [
    {
        email: 'studio2@test.com',
        full_name: 'Studio Owner 2',
        role: 'studio-owner',
        location: 'Quezon City'
    },
    {
        email: 'studio3@test.com',
        full_name: 'Studio Owner 3',
        role: 'studio-owner',
        location: 'Pasig City'
    },
    {
        email: 'venue2@test.com',
        full_name: 'Venue Owner 2',
        role: 'venue-owner',
        location: 'Manila City'
    },
    {
        email: 'venue3@test.com',
        full_name: 'Venue Owner 3',
        role: 'venue-owner',
        location: 'Taguig City'
    }
];

async function addOwners() {
    console.log('\n🏢 Adding studio and venue owner accounts\n');
    console.log('⚠️  Note: You will need to confirm these emails in the Supabase Dashboard');
    console.log('   Go to: Authentication > Users > Click the user > Confirm email\n');
    
    try {
        for (const user of users) {
            console.log(`Creating ${user.email}...`);
            const { data: userData, error } = await supabase.auth.signUp({
                email: user.email,
                password: 'pass123',
                options: {
                    data: {
                        full_name: user.full_name,
                        role: user.role
                    }
                }
            });
            
            if (error) {
                console.log(`❌ Error creating ${user.email}:`, error.message);
            } else if (userData.user) {
                console.log(`✅ Created ${user.email} with ID:`, userData.user.id);
                console.log('   Email confirmation required');
            }
            
            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log('\n📋 Next Steps:');
        console.log('1. Go to your Supabase Dashboard');
        console.log('2. Navigate to: Authentication > Users');
        console.log('3. For each new user, click on them and confirm their email');
        console.log('4. Then they can log in with password: pass123');
        console.log('\n📧 New accounts created:');
        users.forEach(user => console.log(`   • ${user.email} (${user.role})`));
        
    } catch (err) {
        console.error('❌ Unexpected error:', err.message);
    }
}

addOwners();
