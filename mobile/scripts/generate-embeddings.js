
const { createClient } = require('@supabase/supabase-js');
const { pipeline } = require('@xenova/transformers');
require('dotenv').config();

// Configuration
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Error: EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function generateEmbeddings() {
    console.log('Loading AI Model (all-MiniLM-L6-v2)...');
    // Singleton for feature extraction
    const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

    console.log('Model loaded. Processing listings...');

    // 1. Groups
    await processTable('groups', extractor, (item) => {
        return `${item.name} ${item.genre || ''} ${item.description || ''} ${item.location || ''}`;
    });

    // 2. Studios
    await processTable('studios', extractor, (item) => {
        return `${item.name} ${item.amenities ? item.amenities.join(' ') : ''} ${item.description || ''} ${item.address || ''}`;
    });

    // 3. Gigs
    await processTable('gigs', extractor, (item) => {
        return `${item.name} ${item.requirements ? JSON.stringify(item.requirements) : ''} ${item.description || ''} ${item.location || ''}`;
    });

    console.log('Done generating embeddings!');
}

async function processTable(tableName, extractor, textFn) {
    console.log(`\n--- Processing ${tableName} ---`);

    // Fetch items with NULL embeddings
    // Note: We select * to get fields for text generation
    const { data: items, error } = await supabase
        .from(tableName)
        .select('*')
        .is('embedding', null);

    if (error) {
        console.error(`Error fetching ${tableName}:`, error);
        return;
    }

    if (!items || items.length === 0) {
        console.log(`No items in ${tableName} need embeddings.`);
        return;
    }

    console.log(`Found ${items.length} items to process.`);

    for (const item of items) {
        const textToEmbed = textFn(item).replace(/\n/g, ' ').trim();

        if (!textToEmbed) {
            console.log(`Skipping ${item.id} (empty text)`);
            continue;
        }

        try {
            const output = await extractor(textToEmbed, { pooling: 'mean', normalize: true });
            const embedding = Array.from(output.data);

            const { error: updateError } = await supabase
                .from(tableName)
                .update({ embedding })
                .eq('id', item.id);

            if (updateError) {
                console.error(`Failed to update ${item.id}:`, updateError);
            } else {
                console.log(`Updated embedding for: ${item.name}`);
            }
        } catch (e) {
            console.error(`Error processing ${item.id}:`, e);
        }
    }
}

generateEmbeddings();
