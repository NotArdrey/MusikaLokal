// Force Supabase PostgREST to reload schema cache
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function reloadSchema() {
  
  try {
    // Make a simple query to force schema reload
    const { data, error } = await supabase
      .from('studios')
      .select('id, availability')
      .limit(1);
    
    if (error) {
      // If we get PGRST204, the schema cache is still stale
      if (error.code === 'PGRST204') {
      } else {
        console.error('❌ Error:', error);
      }
    } else {
    }
  } catch (err) {
    console.error('❌ Failed to reload schema:', err.message);
  }
}

reloadSchema();
