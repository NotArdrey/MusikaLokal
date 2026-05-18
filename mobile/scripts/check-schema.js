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
        
        // Check if availability column exists
        const result = await client.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'studios'
              AND column_name IN ('availability', 'contract_url')
            ORDER BY column_name;
        `);
        
        if (result.rows.length === 0) {
        } else {
            result.rows.forEach(row => {
            });
        }
        
        // Check operating hours table
        const opHoursCheck = await client.query(`
            SELECT COUNT(*) as count FROM studio_operating_hours;
        `);
        
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
        
        studioCheck.rows.forEach(row => {
        });
        
    } catch (err) {
        if (err.code === 'ECONNREFUSED') {
        } else {
            console.error('Error:', err.message);
        }
    } finally {
        await client.end();
    }
}

checkSchema();
