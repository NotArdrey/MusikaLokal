// Test availability functionality
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

async function testAvailability() {
    
    // 1. Check if availability column exists
    try {
        const { data, error } = await supabase
            .from('studios')
            .select('id, name, availability')
            .limit(1);
        
        if (error) {
            if (error.code === 'PGRST204' || error.message.includes('availability')) {
                return;
            }
            return;
        }
        
        
    } catch (err) {
        return;
    }
    
    // 2. Test creating a studio with availability
    try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            return;
        }
        
        const testPayload = {
            name: 'Test Studio - Availability Check',
            description: 'Testing availability storage',
            address: 'Test Address',
            hourly_rate: 500,
            amenities: ['Test'],
            images: [],
            contract_url: null,
            availability: [
                {
                    day: 'Monday',
                    slots: [{ start: '09:00', end: '17:00' }]
                },
                {
                    day: 'Tuesday',
                    slots: [{ start: '09:00', end: '17:00' }]
                }
            ],
            latitude: 14.5995,
            longitude: 120.9842
        };
        
        
        const { data, error } = await supabase.functions.invoke('manage-listings', {
            body: {
                action: 'create',
                type: 'studio',
                userId: user.id,
                payload: testPayload
            }
        });
        
        if (error) {
            return;
        }
        
        
        // 3. Test fetching the studio to verify availability was saved
        const { data: fetchedStudio, error: fetchError } = await supabase.functions.invoke('manage-listings', {
            body: {
                action: 'fetch_one',
                type: 'studio',
                id: data.id,
                userId: user.id
            }
        });
        
        if (fetchError) {
            return;
        }
        
        
        if (fetchedStudio.availability && fetchedStudio.availability.length > 0) {
        } else {
        }
        
        // Cleanup - delete test studio
        await supabase.functions.invoke('manage-listings', {
            body: {
                action: 'delete',
                type: 'studio',
                id: data.id,
                userId: user.id
            }
        });
        
    } catch (err) {
    }
    
}

testAvailability();
