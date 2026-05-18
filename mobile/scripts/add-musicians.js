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
    
    try {
        // Create musician2@test.com using signUp
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
        } else if (user2Data.user) {
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Create musician3@test.com using signUp
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
        } else if (user3Data.user) {
        }
        
        
        
    } catch (err) {
        console.error('❌ Unexpected error:', err.message);
    }
}

addMusicians();
