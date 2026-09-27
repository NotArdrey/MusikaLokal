// Confirm emails and verify all test accounts using service role
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

const emails = [
    'musician2@test.com',
    'musician3@test.com',
    'studio2@test.com',
    'studio3@test.com',
    'venue2@test.com',
    'venue3@test.com'
];

async function confirmAndVerify() {
    
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
                } else {
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
        } else {
        }
        
        // Verify results
        const { data: profiles } = await supabase
            .from('profiles')
            .select('email, full_name, role, is_verified, verification_status')
            .in('email', emails)
            .order('email');
        
        profiles?.forEach(p => {
        });
        
    } catch (err) {
        console.error('❌ Unexpected error:', err.message);
    }
}

confirmAndVerify();
