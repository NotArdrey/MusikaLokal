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
        const supabaseClient = createClient(
            // @ts-ignore
            Deno.env.get('SUPABASE_URL') ?? '',
            // @ts-ignore
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        // Fetch Featured Gigs with computed stats (using view)
        const { data: featuredGigs, error: gigsError } = await supabaseClient
            .from('gigs_with_stats')
            .select('*, organizers:profiles(full_name, avatar_url)')
            .order('created_at', { ascending: false })
            .limit(5)

        // Fetch Featured Studios with computed stats (using view)
        const { data: featuredStudios, error: studiosError } = await supabaseClient
            .from('studios_with_stats')
            .select('*')
            .order('rating', { ascending: false })
            .limit(5)

        // Fetch New Arrivals (newly created groups) with computed stats
        const { data: newArrivals, error: groupsError } = await supabaseClient
            .from('groups_with_stats')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5)

        if (gigsError || studiosError || groupsError) {
            throw new Error('Failed to fetch data');
        }

        // Map computed fields to expected field names for frontend compatibility
        const featured = [
            ...(featuredGigs || []).map((item: any) => ({
                ...item,
                type: 'Gig',
                rating: item.rating || 0,
                review_count: item.review_count || 0
            })),
            ...(featuredStudios || []).map((item: any) => ({
                ...item,
                type: 'Studio',
                rating: item.rating || 0,
                review_count: item.review_count || 0
            }))
        ].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 10);

        // Map new arrivals with computed stats
        const mappedNewArrivals = (newArrivals || []).map((item: any) => ({
            ...item,
            rating: item.rating || 0,
            review_count: item.review_count || 0
        }));

        return new Response(JSON.stringify({ featured, newArrivals: mappedNewArrivals }), {
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
