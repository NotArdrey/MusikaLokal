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

        const { action, ...params } = await req.json()

        // 1. FETCH PROFILE
        if (action === 'fetch') {
            let { userId } = params

            // If no userId provided, use the authenticated user
            if (!userId) {
                const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
                if (authError || !user) throw new Error('Unauthorized');
                userId = user.id
            }

            // Fetch Profile
            const { data: profile, error } = await supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single()

            if (error) throw error

            // Calculate Stats
            // Gigs Count
            const { count: gigsCount, error: gigsError } = await supabaseClient
                .from('gigs')
                .select('*', { count: 'exact', head: true })
                .eq('organizer_id', userId)

            // Active Groups
            const { count: groupsCount } = await supabaseClient
                .from('groups')
                .select('*', { count: 'exact', head: true })
                .eq('owner_id', userId)

            // Active Studios
            const { count: studiosCount } = await supabaseClient
                .from('studios')
                .select('*', { count: 'exact', head: true })
                .eq('owner_id', userId)

            const activeCount = (groupsCount || 0) + (studiosCount || 0)

            return new Response(JSON.stringify({
                ...profile,
                gigs_count: gigsCount || 0,
                active_count: activeCount
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // 2. UPDATE PROFILE
        if (action === 'update') {
            const { userId, full_name, bio, location, genres, skills } = params

            // Security check: Ensure userId matches auth user
            const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
            if (authError || !user || user.id !== userId) throw new Error('Unauthorized update');

            const updates: any = {}
            if (full_name !== undefined) updates.full_name = full_name
            if (bio !== undefined) updates.bio = bio
            if (location !== undefined) updates.location = location
            if (genres !== undefined) updates.genres = genres
            if (skills !== undefined) updates.skills = skills

            const { data, error } = await supabaseClient
                .from('profiles')
                .update(updates)
                .eq('id', userId)
                .select()
                .single()

            if (error) throw error

            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        throw new Error('Invalid action')

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
