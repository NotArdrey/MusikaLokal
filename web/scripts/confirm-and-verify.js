// Confirm emails and verify all test accounts using service role
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '..', '.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlZmxkeGVnc3Z6ZWNzaGxheXphIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODY1ODI5NSwiZXhwIjoyMDg0MjM0Mjk1fQ.ZS98ixQ1mRA2JsWE0FGHQx6mcEaZDzrLKlWKnuwGVIo';

const supabase = createClient(supabaseUrl, serviceRoleKey);

const emails = [
    'musician2@test.com',
    'musician3@test.com',
    'studio2@test.com',
    'studio3@test.com',
    'venue2@test.com',
    'venue3@test.com'
];

async function confirmAndVerify() {
    console.log('\n✉️  Confirming emails and verifying accounts...\n');
    
    try {
        // Confirm all emails using admin API
        for (const email of emails) {
            const { data: users } = await supabase.auth.admin.listUsers();
            const user = users.users.find(u => u.email === email);
            
            if (user && !user.email_confirmed_at) {
                const { error } = await supabase.auth.admin.updateUserById(user.id, {
                    email_confirm: true
                });
                
                if (error) {
                    console.log(`❌ Error confirming ${email}:`, error.message);
                } else {
                    console.log(`✅ Confirmed email: ${email}`);
                }
            }
        }
        
        // Update profiles
        const { error: profileError } = await supabase
            .from('profiles')
            .update({
                is_verified: true,
                verification_status: 'APPROVED'
            })
            .in('email', emails);
        
        if (profileError) {
            console.log('\n❌ Error updating profiles:', profileError.message);
        } else {
            console.log('\n✅ All profiles verified!');
        }
        
        // Verify results
        const { data: profiles } = await supabase
            .from('profiles')
            .select('email, full_name, role, is_verified, verification_status')
            .in('email', emails)
            .order('email');
        
        console.log('\n📋 Account Status:');
        console.log('━'.repeat(80));
        profiles?.forEach(p => {
            console.log(`✓ ${p.email.padEnd(25)} | ${p.role.padEnd(15)} | Verified: ${p.is_verified}`);
        });
        console.log('\n🎉 All accounts are ready to use with password: pass123\n');
        
    } catch (err) {
        console.error('❌ Unexpected error:', err.message);
    }
}

confirmAndVerify();
