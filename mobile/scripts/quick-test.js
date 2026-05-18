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
    
    // Check auth
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        return;
    }
    
    
    // Try to read from studios table
    const { data, error } = await supabase
        .from('studios')
        .select('id, name, availability')
        .limit(1);
    
    if (error) {
        if (error.code === 'PGRST204') {
        } else {
        }
        return;
    }
    
    
    // Now test in the app
}

quickTest();
