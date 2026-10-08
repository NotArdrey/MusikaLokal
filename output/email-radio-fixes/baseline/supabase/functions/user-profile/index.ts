// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const replaceProfileSkills = async (client: any, profileId: string, skills: string[]) => {
    const { error: deleteError } = await client.from('profile_skills').delete().eq('profile_id', profileId)
    if (deleteError) throw deleteError

    const payload = (skills || [])
        .map((skill) => (skill ?? '').trim())
        .filter((skill) => skill.length > 0)
        .map((skill) => ({ profile_id: profileId, skill }))

    if (payload.length > 0) {
        const { error: insertError } = await client.from('profile_skills').insert(payload)
        if (insertError) throw insertError
    }
}

const replaceProfileGenres = async (client: any, profileId: string, genres: string[]) => {
    const { error: deleteError } = await client.from('profile_genres').delete().eq('profile_id', profileId)
    if (deleteError) throw deleteError

    const payload = (genres || [])
        .map((genre) => (genre ?? '').trim())
        .filter((genre) => genre.length > 0)
        .map((genre) => ({ profile_id: profileId, genre }))

    if (payload.length > 0) {
        const { error: insertError } = await client.from('profile_genres').insert(payload)
        if (insertError) throw insertError
    }
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

        const _authToken = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')

        const { action, ...params } = await req.json()

        // 1. FETCH PROFILE
        if (action === 'fetch') {
            let { userId } = params

            // If no userId provided, use the authenticated user
            if (!userId) {
                const { data: { user }, error: authError } = await supabaseClient.auth.getUser(_authToken)
                if (authError || !user) throw new Error('Unauthorized');
                userId = user.id
            }

            // Fetch Profile
            const { data: profile, error } = await supabaseClient
                .from('profiles_with_stats')
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
            const { data: { user }, error: authError } = await supabaseClient.auth.getUser(_authToken)
            if (authError || !user || user.id !== userId) throw new Error('Unauthorized update');

            const updates: any = {}
            if (full_name !== undefined) updates.full_name = full_name
            if (bio !== undefined) updates.bio = bio
            if (location !== undefined) updates.location = location

            let data: any = null
            if (Object.keys(updates).length > 0) {
                const { data: updatedProfile, error } = await supabaseClient
                    .from('profiles')
                    .update(updates)
                    .eq('id', userId)
                    .select()
                    .single()

                if (error) throw error
                data = updatedProfile
            }

            if (skills !== undefined) {
                await replaceProfileSkills(supabaseClient, userId, skills)
            }

            if (genres !== undefined) {
                await replaceProfileGenres(supabaseClient, userId, genres)
            }

            const { data: profileWithStats, error: profileError } = await supabaseClient
                .from('profiles_with_stats')
                .select('*')
                .eq('id', userId)
                .maybeSingle()

            if (profileError) throw profileError

            return new Response(JSON.stringify(profileWithStats || data), {
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
