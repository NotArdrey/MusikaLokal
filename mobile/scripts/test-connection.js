// Test Supabase connection with the new access token
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '..', '.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.');

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function testConnection() {
    
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('email, full_name, role, is_verified, verification_status')
            .in('email', [
                'musician2@test.com',
                'musician3@test.com',
                'studio2@test.com',
                'studio3@test.com',
                'venue2@test.com',
                'venue3@test.com'
            ])
            .order('email');
        
        if (error) {
        } else {
            data.forEach(p => {
                const verified = p.is_verified ? '✓' : '✗';
            });
        }
        
    } catch (err) {
        console.error('❌ Connection error:', err.message);
    }
}

testConnection();
