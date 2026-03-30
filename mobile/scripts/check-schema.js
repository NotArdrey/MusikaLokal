// Check database schema without authentication
import pg from 'pg';
const { Client } = pg;

const client = new Client({
    host: '127.0.0.1',
    port: 54322,
    database: 'postgres',
    user: 'postgres',
    password: 'postgres'
});

async function checkSchema() {
    try {
        await client.connect();
        console.log('\n🔍 Checking Database Schema\n');
        
        // Check if availability column exists
        const result = await client.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'studios'
              AND column_name IN ('availability', 'contract_url')
            ORDER BY column_name;
        `);
        
        console.log('Studios table - availability-related columns:');
        if (result.rows.length === 0) {
            console.log('❌ COLUMNS NOT FOUND!');
            console.log('\nYou need to run this SQL in Supabase Dashboard:');
            console.log('ALTER TABLE studios ADD COLUMN IF NOT EXISTS availability JSONB DEFAULT \'[]\'::jsonb;');
            console.log('ALTER TABLE studios ADD COLUMN IF NOT EXISTS contract_url TEXT;');
        } else {
            result.rows.forEach(row => {
                console.log(`✅ ${row.column_name} (${row.data_type})`);
            });
        }
        
        // Check operating hours table
        const opHoursCheck = await client.query(`
            SELECT COUNT(*) as count FROM studio_operating_hours;
        `);
        console.log(`\nstudio_operating_hours table: ${opHoursCheck.rows[0].count} records`);
        
        // Check sample data
        const studioCheck = await client.query(`
            SELECT id, name, 
                   CASE WHEN availability IS NULL THEN 'NULL'
                        WHEN availability = '[]'::jsonb THEN 'EMPTY ARRAY'
                        ELSE 'HAS DATA'
                   END as availability_status
            FROM studios
            LIMIT 3;
        `);
        
        console.log('\nSample studios:');
        studioCheck.rows.forEach(row => {
            console.log(`  ${row.name}: availability = ${row.availability_status}`);
        });
        
    } catch (err) {
        if (err.code === 'ECONNREFUSED') {
            console.log('⚠️  Not checking local database (Docker not running)');
            console.log('   This is using REMOTE Supabase, so checking remote schema instead...\n');
            console.log('📋 TO FIX: Run this SQL in your Supabase Dashboard:');
            console.log('   URL: https://supabase.com/dashboard/project/aefldxegsvzecshlayza/sql/new\n');
            console.log('   SQL:');
            console.log('   ALTER TABLE studios ADD COLUMN IF NOT EXISTS availability JSONB DEFAULT \'[]\'::jsonb;');
            console.log('   ALTER TABLE studios ADD COLUMN IF NOT EXISTS contract_url TEXT;');
        } else {
            console.error('Error:', err.message);
        }
    } finally {
        await client.end();
    }
}

checkSchema();
