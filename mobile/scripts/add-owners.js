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
    
    try {
        for (const user of users) {
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
            } else if (userData.user) {
            }
            
            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        users.forEach(user => undefined);
        
    } catch (err) {
        console.error('❌ Unexpected error:', err.message);
    }
}

addOwners();
