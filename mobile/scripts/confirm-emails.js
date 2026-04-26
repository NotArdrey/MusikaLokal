// Confirm all test user emails by updating the database directly
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

const emails = [
    'musician2@test.com',
    'musician3@test.com',
    'studio2@test.com',
    'studio3@test.com',
    'venue2@test.com',
    'venue3@test.com'
];

async function confirmEmails() {
    
    // Try to update via RPC or direct query
    const sqlQuery = `
-- Confirm all test user emails
UPDATE auth.users 
SET email_confirmed_at = NOW(),
    confirmed_at = NOW()
WHERE email IN (
    'musician2@test.com',
    'musician3@test.com',
    'studio2@test.com',
    'studio3@test.com',
    'venue2@test.com',
    'venue3@test.com'
)
AND email_confirmed_at IS NULL;

-- Verify confirmation
SELECT email, email_confirmed_at IS NOT NULL as confirmed
FROM auth.users
WHERE email IN (
    'musician2@test.com',
    'musician3@test.com',
    'studio2@test.com',
    'studio3@test.com',
    'venue2@test.com',
    'venue3@test.com'
);
    `.trim();
    
    
    // Also try to check current users
    const { data, error } = await supabase
        .from('profiles')
        .select('email, full_name, role')
        .in('email', emails);
    
    if (!error && data) {
        data.forEach(profile => {
        });
    }
}

confirmEmails();
