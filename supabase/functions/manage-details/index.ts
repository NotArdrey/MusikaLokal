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
        const { userId, type, id } = params // type: 'group' | 'studio' | 'gig'

        // 1. FETCH DETAILS (using views with computed stats)
        if (action === 'fetch') {
            const viewName = type + 's_with_stats' // groups_with_stats, studios_with_stats, gigs_with_stats

            // Fetch Main Entity from view with computed stats
            const { data: entity, error: entityError } = await supabaseClient
                .from(viewName)
                .select('*')
                .eq('id', id)
                .single()

            if (entityError) throw entityError

            // Check Ownership
            let isOwner = false
            if (type === 'gig') {
                isOwner = entity.organizer_id === userId
            } else {
                isOwner = entity.owner_id === userId
            }

            // Check if Favorited
            const { count } = await supabaseClient
                .from('favorites')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq(type + '_id', id)

            const isFavorited = count ? count > 0 : false

            // Fetch Reviews with computed likes count (using view)
            const { data: reviews } = await supabaseClient
                .from('reviews_with_stats')
                .select('*, profiles(full_name, avatar_url)')
                .eq(type + '_id', id)
                .order('created_at', { ascending: false })
                .limit(5)

            // Map computed fields to expected names for frontend compatibility
            const mappedReviews = (reviews || []).map((r: any) => ({
                ...r,
                likes_count: r.computed_likes_count || 0
            }))

            return new Response(JSON.stringify({
                ...entity,
                rating: entity.computed_rating || 0,
                review_count: entity.computed_review_count || 0,
                is_owner: isOwner,
                is_favorited: isFavorited,
                reviews: mappedReviews
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // 2. TOGGLE FAVORITE
        if (action === 'toggle_favorite') {
            // Check if exists
            const { data: existing } = await supabaseClient
                .from('favorites')
                .select('id')
                .eq('user_id', userId)
                .eq(type + '_id', id)
                .single()

            if (existing) {
                // Remove
                await supabaseClient.from('favorites').delete().eq('id', existing.id)
                return new Response(JSON.stringify({ is_favorited: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            } else {
                // Add
                const payload: any = { user_id: userId }
                payload[type + '_id'] = id

                await supabaseClient.from('favorites').insert(payload)
                return new Response(JSON.stringify({ is_favorited: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            }
        }

        // 3. SUBMIT REVIEW
        if (action === 'review') {
            const { rating, content } = params
            const payload: any = {
                author_id: userId,
                rating,
                content
            }
            payload[type + '_id'] = id

            const { data, error } = await supabaseClient.from('reviews').insert(payload).select()
            if (error) throw error

            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // 4. REPORT
        if (action === 'report') {
            const { reason, details } = params

            const { data, error } = await supabaseClient
                .from('reports')
                .insert({
                    reporter_id: userId,
                    target_type: type,
                    target_id: id,
                    reason,
                    details
                })
                .select()

            if (error) throw error
            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        throw new Error('Invalid action')

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
