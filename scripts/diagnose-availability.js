// Comprehensive diagnostic for availability issues
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

async function diagnose() {
    console.log('\n🔍 AVAILABILITY DIAGNOSTIC REPORT\n');
    console.log('═'.repeat(50));
    
    // 1. Check if user is logged in
    console.log('\n1️⃣ Checking authentication...');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        console.log('❌ Not authenticated. Please log in first.');
        console.log('   Run the app and log in as studio@test.com');
        return;
    }
    console.log('✅ Authenticated as:', user.email);
    
    // 2. Check studios table structure
    console.log('\n2️⃣ Checking studios table structure...');
    const { data: studioSample, error: studioError } = await supabase
        .from('studios')
        .select('*')
        .limit(1);
    
    if (studioError) {
        console.log('❌ Error accessing studios table:', studioError.message);
        if (studioError.message.includes('availability')) {
            console.log('\n⚠️  AVAILABILITY COLUMN MISSING!');
            console.log('\n📋 Run this SQL in Supabase Dashboard:');
            console.log('   ALTER TABLE studios ADD COLUMN IF NOT EXISTS availability JSONB DEFAULT \'[]\'::jsonb;');
        }
    } else {
        console.log('✅ Studios table accessible');
        if (studioSample && studioSample.length > 0) {
            const columns = Object.keys(studioSample[0]);
            console.log('📊 Columns:', columns.join(', '));
            if (columns.includes('availability')) {
                console.log('✅ availability column EXISTS');
            } else {
                console.log('❌ availability column MISSING');
            }
        }
    }
    
    // 3. Check studio_operating_hours table
    console.log('\n3️⃣ Checking studio_operating_hours table...');
    const { data: opHours, error: opError } = await supabase
        .from('studio_operating_hours')
        .select('*')
        .limit(5);
    
    if (opError) {
        console.log('❌ Error:', opError.message);
    } else {
        console.log('✅ Table accessible');
        console.log('📊 Operating hours records:', opHours?.length || 0);
        if (opHours && opHours.length > 0) {
            console.log('📋 Sample record:', opHours[0]);
        }
    }
    
    // 4. Check user's studios
    console.log('\n4️⃣ Checking your studios...');
    const { data: userStudios, error: userStudioError } = await supabase
        .from('studios')
        .select('id, name, availability')
        .eq('owner_id', user.id);
    
    if (userStudioError) {
        console.log('❌ Error:', userStudioError.message);
    } else {
        console.log('✅ Found', userStudios?.length || 0, 'studios');
        userStudios?.forEach((studio, i) => {
            console.log(`\n   Studio ${i + 1}: ${studio.name}`);
            console.log(`   ID: ${studio.id}`);
            console.log(`   Availability:`, studio.availability || 'null/undefined');
        });
    }
    
    // 5. Check operating hours for user's studios
    if (userStudios && userStudios.length > 0) {
        console.log('\n5️⃣ Checking operating hours for your studios...');
        const studioIds = userStudios.map(s => s.id);
        const { data: hours, error: hoursError } = await supabase
            .from('studio_operating_hours')
            .select('*')
            .in('studio_id', studioIds);
        
        if (hoursError) {
            console.log('❌ Error:', hoursError.message);
        } else {
            console.log('✅ Found', hours?.length || 0, 'operating hours records');
            hours?.forEach(h => {
                console.log(`   Studio: ${h.studio_id}, Day: ${h.day_of_week}, ${h.open_time}-${h.close_time}`);
            });
        }
    }
    
    // 6. Test Edge Function
    console.log('\n6️⃣ Testing Edge Function (fetch_one)...');
    if (userStudios && userStudios.length > 0) {
        const testStudioId = userStudios[0].id;
        console.log('   Testing with studio:', userStudios[0].name);
        
        const { data: edgeData, error: edgeError } = await supabase.functions.invoke('manage-listings', {
            body: { 
                action: 'fetch_one', 
                type: 'studio', 
                id: testStudioId,
                userId: user.id 
            }
        });
        
        if (edgeError) {
            console.log('❌ Error:', edgeError.message);
        } else {
            console.log('✅ Edge Function response received');
            console.log('📊 Has availability?', !!edgeData?.availability);
            if (edgeData?.availability) {
                console.log('📅 Availability:', JSON.stringify(edgeData.availability, null, 2));
            }
        }
    }
    
    // 7. Summary and recommendations
    console.log('\n' + '═'.repeat(50));
    console.log('📋 SUMMARY & RECOMMENDATIONS:\n');
    
    if (studioError && studioError.message.includes('availability')) {
        console.log('❌ PRIMARY ISSUE: availability column does not exist');
        console.log('   👉 SOLUTION: Run the SQL in Supabase Dashboard');
        console.log('   👉 URL: https://supabase.com/dashboard/project/aefldxegsvzecshlayza/sql/new');
        console.log('   👉 SQL: ALTER TABLE studios ADD COLUMN IF NOT EXISTS availability JSONB DEFAULT \'[]\'::jsonb;');
    } else if (!userStudios || userStudios.length === 0) {
        console.log('⚠️  No studios found for your account');
        console.log('   👉 Create a studio first using the Add Studio page');
    } else if (userStudios.every(s => !s.availability || (Array.isArray(s.availability) && s.availability.length === 0))) {
        console.log('⚠️  Studios exist but have no availability data');
        console.log('   👉 Edit a studio and set availability times');
        console.log('   👉 Or check if operating_hours table has data');
    } else {
        console.log('✅ Everything looks good!');
        console.log('   Check the app logs for detailed availability processing');
    }
    
    console.log('\n' + '═'.repeat(50) + '\n');
}

diagnose().catch(err => {
    console.error('❌ Diagnostic failed:', err.message);
});
