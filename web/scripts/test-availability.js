// Test availability functionality
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

async function testAvailability() {
    console.log('\n🧪 Testing Availability Functionality\n');
    
    // 1. Check if availability column exists
    console.log('1️⃣ Checking if availability column exists in studios table...');
    try {
        const { data, error } = await supabase
            .from('studios')
            .select('id, name, availability')
            .limit(1);
        
        if (error) {
            if (error.code === 'PGRST204' || error.message.includes('availability')) {
                console.log('❌ AVAILABILITY COLUMN DOES NOT EXIST!');
                console.log('\n📋 Please run this SQL in Supabase Dashboard:');
                console.log('   https://supabase.com/dashboard/project/aefldxegsvzecshlayza/sql/new\n');
                console.log('   ALTER TABLE studios ADD COLUMN IF NOT EXISTS availability JSONB DEFAULT \'[]\'::jsonb;');
                console.log('   ALTER TABLE studios ADD COLUMN IF NOT EXISTS contract_url TEXT;');
                return;
            }
            console.log('❌ Error:', error.message);
            return;
        }
        
        console.log('✅ Availability column exists!');
        console.log('📊 Sample data:', data);
        
    } catch (err) {
        console.log('❌ Error checking column:', err.message);
        return;
    }
    
    // 2. Test creating a studio with availability
    console.log('\n2️⃣ Testing studio creation with availability...');
    try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            console.log('⚠️  Not logged in. Please log in to test studio creation.');
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
        
        console.log('📤 Sending payload:', JSON.stringify(testPayload, null, 2));
        
        const { data, error } = await supabase.functions.invoke('manage-listings', {
            body: {
                action: 'create',
                type: 'studio',
                userId: user.id,
                payload: testPayload
            }
        });
        
        if (error) {
            console.log('❌ Error creating studio:', error);
            return;
        }
        
        console.log('✅ Studio created successfully!');
        console.log('📍 Studio ID:', data.id);
        
        // 3. Test fetching the studio to verify availability was saved
        console.log('\n3️⃣ Fetching studio to verify availability...');
        const { data: fetchedStudio, error: fetchError } = await supabase.functions.invoke('manage-listings', {
            body: {
                action: 'fetch_one',
                type: 'studio',
                id: data.id,
                userId: user.id
            }
        });
        
        if (fetchError) {
            console.log('❌ Error fetching studio:', fetchError);
            return;
        }
        
        console.log('✅ Studio fetched successfully!');
        console.log('📅 Availability data:', JSON.stringify(fetchedStudio.availability, null, 2));
        
        if (fetchedStudio.availability && fetchedStudio.availability.length > 0) {
            console.log('✅ AVAILABILITY IS WORKING! ✨');
        } else {
            console.log('⚠️  Availability is empty or not properly saved');
        }
        
        // Cleanup - delete test studio
        console.log('\n🧹 Cleaning up test studio...');
        await supabase.functions.invoke('manage-listings', {
            body: {
                action: 'delete',
                type: 'studio',
                id: data.id,
                userId: user.id
            }
        });
        console.log('✅ Test studio deleted');
        
    } catch (err) {
        console.log('❌ Error during test:', err.message);
    }
    
    console.log('\n✨ Test complete!\n');
}

testAvailability();
