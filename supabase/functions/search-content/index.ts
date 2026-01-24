// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { query, type, genre, sortBy } = await req.json()

        const supabaseClient = createClient(
            // @ts-ignore
            Deno.env.get('SUPABASE_URL') ?? '',
            // @ts-ignore
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        let results: any[] = []
        const promises = []

        // 1. Search Groups (Music Group, Solo Artist) - using view with computed stats
        if (type === 'All' || type === 'Music Group' || type === 'Solo Artist') {
            let q = supabaseClient.from('groups_with_stats').select('*')
            if (query) q = q.ilike('name', `%${query}%`)
            if (genre && genre !== 'All') q = q.ilike('genre', `%${genre}%`)
            if (sortBy === 'Rating') q = q.order('rating', { ascending: false })
            else q = q.order('created_at', { ascending: false })

            promises.push(q.then(({ data }: { data: any }) => (data || []).map((i: any) => ({
                ...i,
                itemType: 'Music Group',
                rating: i.rating || 0,
                review_count: i.review_count || 0
            }))))
        }

        // 2. Search Studios (Studio, Venue) - using view with computed stats
        if (type === 'All' || type === 'Studio' || type === 'Venue') {
            let q = supabaseClient.from('studios_with_stats').select('*')
            if (query) q = q.ilike('name', `%${query}%`)
            // Studios don't have genre typically, unless handled in description or amenities. 
            // If genre is specific (e.g. Rock), maybe skip studios or check description?
            // For now, we ignore genre filter for studios or return empty if stricter?
            // Let's just Include studios even if genre is set, or filter by nothing.
            if (sortBy === 'Rating') q = q.order('rating', { ascending: false })
            else q = q.order('created_at', { ascending: false })

            promises.push(q.then(({ data }: { data: any }) => (data || []).map((i: any) => ({
                ...i,
                itemType: 'Studio',
                rating: i.rating || 0,
                review_count: i.review_count || 0
            }))))
        }

        const resultsArrays = await Promise.all(promises)
        results = resultsArrays.flat()

        // Client-side Sort (Merging the lists)
        if (sortBy === 'Rating') {
            results.sort((a, b) => (b.rating || 0) - (a.rating || 0))
        } else if (sortBy === 'Distance') {
            // Distance requires user coordinates, which we assume aren't passed yet.
            // Placeholder sort
        } else {
            // Default newer first
            results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        }

        return new Response(JSON.stringify(results), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
