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
        const { userId } = params

        // FETCH MY GIGS (using view with computed stats)
        if (action === 'fetch_my_gigs') {
            const { data, error } = await supabaseClient
                .from('gigs_with_stats')
                .select('*')
                .eq('organizer_id', userId)
                .order('created_at', { ascending: false })

            if (error) throw error

            // View columns already named 'rating' and 'review_count'
            const mapped = (data || []).map((item: any) => ({
                ...item,
                rating: item.rating || 0,
                review_count: item.review_count || 0
            }))

            return new Response(JSON.stringify(mapped), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }

        // FETCH MY GROUPS (using view with computed stats)
        if (action === 'fetch_my_groups') {
            const { data, error } = await supabaseClient
                .from('groups_with_stats')
                .select('*')
                .eq('owner_id', userId)
                .order('created_at', { ascending: false })

            if (error) throw error

            // View columns already named 'rating' and 'review_count'
            const mapped = (data || []).map((item: any) => ({
                ...item,
                rating: item.rating || 0,
                review_count: item.review_count || 0
            }))

            return new Response(JSON.stringify(mapped), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }

        // FETCH MY STUDIOS (using view with computed stats)
        if (action === 'fetch_my_studios') {
            const { data, error } = await supabaseClient
                .from('studios_with_stats')
                .select('*')
                .eq('owner_id', userId)
                .order('created_at', { ascending: false })

            if (error) throw error

            // View columns already named 'rating' and 'review_count'
            const mapped = (data || []).map((item: any) => ({
                ...item,
                rating: item.rating || 0,
                review_count: item.review_count || 0
            }))

            return new Response(JSON.stringify(mapped), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }

        // FETCH SINGLE ENTITY (SECURE) - using view with computed stats
        if (action === 'fetch_one') {
            const { type, id } = params
            const viewName = type + 's_with_stats'
            const ownerField = type === 'gig' ? 'organizer_id' : 'owner_id'

            const { data, error } = await supabaseClient
                .from(viewName)
                .select('*')
                .eq('id', id)
                .eq(ownerField, userId)
                .single()

            if (error) throw error

            // View columns already named 'rating' and 'review_count'
            const mapped = {
                ...data,
                rating: data.rating || 0,
                review_count: data.review_count || 0
            }

            return new Response(JSON.stringify(mapped), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }

        // CREATE ENTITY (uses base table for inserts)
        if (action === 'create') {
            const { type, payload } = params
            const table = type + 's'
            const ownerField = type === 'gig' ? 'organizer_id' : 'owner_id'

            const { data, error } = await supabaseClient
                .from(table)
                .insert({ ...payload, [ownerField]: userId })
                .select()
                .single()

            if (error) throw error

            // Return with default stats for new entity
            return new Response(JSON.stringify({ ...data, rating: 0, review_count: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }

        // UPDATE ENTITY (uses base table for updates)
        if (action === 'update') {
            const { type, id, payload } = params
            const table = type + 's'
            const ownerField = type === 'gig' ? 'organizer_id' : 'owner_id'

            const { data, error } = await supabaseClient
                .from(table)
                .update(payload)
                .eq('id', id)
                .eq(ownerField, userId)
                .select()
                .single()

            if (error) throw error
            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }

        // DELETE ENTITY (uses base table for deletes)
        if (action === 'delete') {
            const { type, id } = params // type: 'gig', 'group', 'studio'
            const table = type + 's'

            const { error } = await supabaseClient
                .from(table)
                .delete()
                .eq('id', id)
                .eq(type === 'gig' ? 'organizer_id' : 'owner_id', userId) // Security check

            if (error) throw error
            return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }

        throw new Error('Invalid action')

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
