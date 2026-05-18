// Comprehensive diagnostic for availability issues
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

async function diagnose() {
    
    // 1. Check if user is logged in
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return;
    }
    
    // 2. Check studios table structure
    const { data: studioSample, error: studioError } = await supabase
        .from('studios')
        .select('*')
        .limit(1);
    
    if (studioError) {
        if (studioError.message.includes('availability')) {
        }
    } else {
        if (studioSample && studioSample.length > 0) {
            const columns = Object.keys(studioSample[0]);
            if (columns.includes('availability')) {
            } else {
            }
        }
    }
    
    // 3. Check studio_operating_hours table
    const { data: opHours, error: opError } = await supabase
        .from('studio_operating_hours')
        .select('*')
        .limit(5);
    
    if (opError) {
    } else {
        if (opHours && opHours.length > 0) {
        }
    }
    
    // 4. Check user's studios
    const { data: userStudios, error: userStudioError } = await supabase
        .from('studios')
        .select('id, name, availability')
        .eq('owner_id', user.id);
    
    if (userStudioError) {
    } else {
        userStudios?.forEach((studio, i) => {
        });
    }
    
    // 5. Check operating hours for user's studios
    if (userStudios && userStudios.length > 0) {
        const studioIds = userStudios.map(s => s.id);
        const { data: hours, error: hoursError } = await supabase
            .from('studio_operating_hours')
            .select('*')
            .in('studio_id', studioIds);
        
        if (hoursError) {
        } else {
            hours?.forEach(h => {
            });
        }
    }
    
    // 6. Test Edge Function
    if (userStudios && userStudios.length > 0) {
        const testStudioId = userStudios[0].id;
        
        const { data: edgeData, error: edgeError } = await supabase.functions.invoke('manage-listings', {
            body: { 
                action: 'fetch_one', 
                type: 'studio', 
                id: testStudioId,
                userId: user.id 
            }
        });
        
        if (edgeError) {
        } else {
            if (edgeData?.availability) {
            }
        }
    }
    
    // 7. Summary and recommendations
    
    if (studioError && studioError.message.includes('availability')) {
    } else if (!userStudios || userStudios.length === 0) {
    } else if (userStudios.every(s => !s.availability || (Array.isArray(s.availability) && s.availability.length === 0))) {
    } else {
    }
    
}

diagnose().catch(err => {
    console.error('❌ Diagnostic failed:', err.message);
});
