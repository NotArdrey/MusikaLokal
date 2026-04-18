// Add availability column to remote Supabase database
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

console.log('🔗 Connecting to:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey);

async function addAvailabilityColumn() {
  console.log('\n📝 Adding availability column to studios table...\n');
  
  try {
    // Use RPC to execute raw SQL (requires a database function)
    // Since we might not have a function, let's try the REST API approach
    
    const sql = `ALTER TABLE studios ADD COLUMN IF NOT EXISTS availability JSONB DEFAULT '[]'::jsonb;`;
    
    console.log('⚠️  Note: This script requires database admin access.');
    console.log('📋 Please run the following SQL in your Supabase SQL Editor:\n');
    console.log('-----------------------------------------------------------');
    console.log(readFileSync(join(__dirname, '..', 'add-availability-column.sql'), 'utf8'));
    console.log('-----------------------------------------------------------\n');
    console.log('📍 Steps:');
    console.log('   1. Go to: https://supabase.com/dashboard/project/aefldxegsvzecshlayza/sql/new');
    console.log('   2. Paste the SQL above');
    console.log('   3. Click "Run" button');
    console.log('   4. Wait 2-3 minutes for schema cache to refresh');
    console.log('   5. Try updating the studio again\n');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

addAvailabilityColumn();
