// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Log authorization header for debugging (remove in production)
        const authHeader = req.headers.get('Authorization')
        console.log('Authorization header present:', !!authHeader)

        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'No authorization header provided' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            })
        }

        const supabaseClient = createClient(
            // @ts-ignore
            Deno.env.get('SUPABASE_URL') ?? '',
            // @ts-ignore
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        )

        const { action, ...params } = await req.json()

        // 1. FETCH PROFILE (using view with computed stats)
        if (action === 'fetch') {
            const { userId } = params

            const { data: profile, error } = await supabaseClient
                .from('profiles_with_stats')
                .select('*')
                .eq('id', userId)
                .maybeSingle()

            if (error) throw error

            if (!profile) {
                return new Response(JSON.stringify({ error: 'Profile not found' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 404,
                })
            }

            // Map computed fields to expected names for frontend compatibility
            const mappedProfile = {
                ...profile,
                // View columns are already named 'rating' and 'review_count'
                // No mapping needed, kept for backwards compatibility
            }

            return new Response(JSON.stringify(mappedProfile), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // 2. UPDATE PROFILE (uses base table for updates)
        if (action === 'update') {
            const { userId, full_name, bio, skills, genres, avatar_url, location, portfolio_urls } = params

            const updateData: any = {}
            if (full_name !== undefined) updateData.full_name = full_name
            if (bio !== undefined) updateData.bio = bio
            if (skills !== undefined) updateData.skills = skills
            if (genres !== undefined) updateData.genres = genres
            if (avatar_url !== undefined) updateData.avatar_url = avatar_url
            if (location !== undefined) updateData.location = location
            if (location !== undefined) updateData.location = location
            if (portfolio_urls !== undefined) updateData.portfolio_urls = portfolio_urls
            if (params.contact_number !== undefined) updateData.contact_number = params.contact_number
            if (params.address !== undefined) updateData.address = params.address

            const { data, error } = await supabaseClient
                .from('profiles')
                .update(updateData)
                .eq('id', userId)
                .select()
                .single()

            if (error) throw error

            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // 3. ADD MEDIA TO PORTFOLIO
        if (action === 'add_media') {
            const { userId, mediaUrl } = params

            // First fetch current portfolio
            const { data: profile, error: fetchError } = await supabaseClient
                .from('profiles')
                .select('portfolio_urls')
                .eq('id', userId)
                .single()

            if (fetchError) throw fetchError

            const currentUrls = profile?.portfolio_urls || []
            const updatedUrls = [...currentUrls, mediaUrl]

            const { data, error } = await supabaseClient
                .from('profiles')
                .update({ portfolio_urls: updatedUrls })
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
