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

        // 1. FETCH DETAILS
        if (action === 'fetch') {
            const table = type + 's' // groups, studios, gigs

            // Fetch Main Entity
            const { data: entity, error: entityError } = await supabaseClient
                .from(table)
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

            // Fetch Reviews (Simple version: just get top 5 recent)
            const { data: reviews } = await supabaseClient
                .from('reviews')
                .select('*, profiles(full_name, avatar_url)')
                .eq(type + '_id', id)
                .order('created_at', { ascending: false })
                .limit(5)

            return new Response(JSON.stringify({
                ...entity,
                is_owner: isOwner,
                is_favorited: isFavorited,
                reviews: reviews || []
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
