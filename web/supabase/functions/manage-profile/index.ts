// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
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

const replaceProfilePortfolioUrls = async (client: any, profileId: string, portfolioUrls: string[]) => {
    const { error: deleteError } = await client.from('profile_portfolio_urls').delete().eq('profile_id', profileId)
    if (deleteError) throw deleteError

    const payload = (portfolioUrls || [])
        .map((portfolioUrl) => (portfolioUrl ?? '').trim())
        .filter((portfolioUrl) => portfolioUrl.length > 0)
        .map((portfolioUrl, index) => ({
            profile_id: profileId,
            portfolio_url: portfolioUrl,
            sort_order: index,
        }))

    if (payload.length > 0) {
        const { error: insertError } = await client.from('profile_portfolio_urls').insert(payload)
        if (insertError) throw insertError
    }
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { action, ...params } = await req.json()

        // Log authorization header for debugging (remove in production)
        const authHeader = req.headers.get('Authorization')
        console.log('Authorization header present:', !!authHeader)
        console.log('Action requested:', action)

        // Allow 'create' action without auth header (for signup flow)
        // The create action uses service role key anyway
        if (action !== 'create' && !authHeader) {
            return new Response(JSON.stringify({ error: 'No authorization header provided' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            })
        }

        // Only create supabaseClient if we have auth header (not needed for create action)
        const supabaseClient = authHeader ? createClient(
            // @ts-ignore
            Deno.env.get('SUPABASE_URL') ?? '',
            // @ts-ignore
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        ) : null

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
            if (avatar_url !== undefined) updateData.avatar_url = avatar_url
            if (location !== undefined) updateData.location = location
            if (location !== undefined) updateData.location = location
            if (params.contact_number !== undefined) updateData.contact_number = params.contact_number
            if (params.address !== undefined) updateData.address = params.address

            const { data, error } = await supabaseClient
                .from('profiles')
                .update(updateData)
                .eq('id', userId)
                .select()
                .single()

            if (error) throw error

            if (skills !== undefined) {
                await replaceProfileSkills(supabaseClient, userId, skills)
            }

            if (genres !== undefined) {
                await replaceProfileGenres(supabaseClient, userId, genres)
            }

            if (portfolio_urls !== undefined) {
                await replaceProfilePortfolioUrls(supabaseClient, userId, portfolio_urls)
            }

            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // 3. ADD MEDIA TO PORTFOLIO
        if (action === 'add_media') {
            const { userId, mediaUrl } = params

            const { data: lastPortfolioRow, error: fetchError } = await supabaseClient
                .from('profile_portfolio_urls')
                .select('sort_order')
                .eq('profile_id', userId)
                .order('sort_order', { ascending: false })
                .limit(1)
                .maybeSingle()

            if (fetchError) throw fetchError

            const nextSortOrder = lastPortfolioRow?.sort_order !== undefined && lastPortfolioRow?.sort_order !== null
                ? Number(lastPortfolioRow.sort_order) + 1
                : 0

            const { data, error } = await supabaseClient
                .from('profile_portfolio_urls')
                .insert({
                    profile_id: userId,
                    portfolio_url: mediaUrl,
                    sort_order: nextSortOrder,
                })
                .select()
                .single()

            if (error) throw error

            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // 4. CREATE PROFILE (Bypass RLS for signup)
        if (action === 'create') {
            const { userId, email, full_name, role, is_verified, verification_status, didit_session_id } = params

            // Validate required parameters
            if (!userId || !email || !role) {
                return new Response(JSON.stringify({ error: 'Missing required parameters: userId, email, role' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            // Initialize Admin Client to bypass RLS
            const supabaseAdmin = createClient(
                // @ts-ignore
                Deno.env.get('SUPABASE_URL') ?? '',
                // @ts-ignore
                Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
            )

            // Verify the user exists in auth.users before creating profile
            const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId)
            if (authError || !authUser?.user) {
                console.error('User verification failed:', authError)
                return new Response(JSON.stringify({ error: 'User not found in auth system' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 404,
                })
            }

            console.log('Creating profile for user:', userId, email)

            const { data, error } = await supabaseAdmin
                .from('profiles')
                .upsert({
                    id: userId,
                    email,
                    full_name,
                    role,
                    is_verified,
                    verification_status,
                    didit_session_id
                })
                .select()
                .single()

            if (error) {
                console.error('Profile creation error:', error)
                throw error
            }

            console.log('Profile created successfully:', data?.id)

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
