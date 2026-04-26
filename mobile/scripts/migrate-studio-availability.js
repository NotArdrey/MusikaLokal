const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function migrateStudioAvailability() {

    try {
        // Step 1: Check if slot_order column exists
        const { data: columns, error: columnsError } = await supabase
            .from('studio_operating_hours')
            .select('*')
            .limit(1);

        if (columnsError) {
            console.error('❌ Error checking columns:', columnsError);
            throw columnsError;
        }

        // Step 2: Add slot_order column if it doesn't exist
        const { error: alterError } = await supabase.rpc('exec_sql', {
            sql: `
                -- Add slot_order column if it doesn't exist
                ALTER TABLE studio_operating_hours 
                ADD COLUMN IF NOT EXISTS slot_order INTEGER DEFAULT 0;

                -- Drop the unique constraint if it exists
                ALTER TABLE studio_operating_hours 
                DROP CONSTRAINT IF EXISTS studio_operating_hours_studio_id_day_of_week_key;

                -- Create index for faster lookups
                CREATE INDEX IF NOT EXISTS idx_studio_operating_hours_lookup 
                ON studio_operating_hours(studio_id, day_of_week, slot_order);

                -- Update existing rows to have slot_order = 0
                UPDATE studio_operating_hours SET slot_order = 0 WHERE slot_order IS NULL;
            `
        });

        if (alterError) {
            // If rpc doesn't work, we need to execute via raw query
            // This will require using the postgres connection directly
        } else {
        }

        // Step 3: Verify the changes
        const { data: studios, error: studiosError } = await supabase
            .from('studio_operating_hours')
            .select('*')
            .limit(5);

        if (studiosError) {
            console.error('❌ Error verifying:', studiosError);
            throw studiosError;
        }


    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

migrateStudioAvailability();
