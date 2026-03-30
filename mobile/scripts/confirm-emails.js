// Confirm all test user emails by updating the database directly
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

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
    console.log('\n✉️  Attempting to confirm user emails...\n');
    
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
    
    console.log('📋 SQL Query to confirm emails:');
    console.log('━'.repeat(60));
    console.log(sqlQuery);
    console.log('━'.repeat(60));
    console.log('\n📌 To confirm the emails:');
    console.log('1. Copy the SQL query above');
    console.log('2. Go to your Supabase Dashboard');
    console.log('3. Click "SQL Editor" in the left sidebar');
    console.log('4. Paste and run the query');
    console.log('\nOr you can run this command:');
    console.log('   node scripts/confirm-emails-sql.js > confirm.sql');
    console.log('   Then copy confirm.sql contents to Supabase SQL Editor\n');
    
    // Also try to check current users
    const { data, error } = await supabase
        .from('profiles')
        .select('email, full_name, role')
        .in('email', emails);
    
    if (!error && data) {
        console.log('✅ Found profiles for:');
        data.forEach(profile => {
            console.log(`   • ${profile.email} - ${profile.full_name} (${profile.role})`);
        });
    }
}

confirmEmails();
