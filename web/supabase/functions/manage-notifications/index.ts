// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { withNotificationRouteMeta } from "../_shared/notificationRoutes.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
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

        // 0. UNREAD COUNT
        if (action === 'unread_count') {
            const { userId } = params

            const { count, error } = await supabaseClient
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('read', false)

            if (error) throw error

            return new Response(JSON.stringify({ count }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // 1. FETCH NOTIFICATIONS
        if (action === 'fetch') {
            const { userId } = params

            const { data, error } = await supabaseClient
                .from('notifications')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })

            if (error) throw error

            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // 2. MARK AS READ (Single or All)
        if (action === 'mark_read') {
            const { notificationId, userId, all } = params

            let query = supabaseClient.from('notifications').update({ read: true })

            if (all) {
                query = query.eq('user_id', userId)
            } else {
                query = query.eq('id', notificationId)
            }

            const { data, error } = await query.select()

            if (error) throw error

            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // 3. CREATE NOTIFICATION (Helper for demo/testing)
        if (action === 'create') {
            const { userId, title, message, type, image, meta } = params

            const { data, error } = await supabaseClient
                .from('notifications')
                .insert([{
                    user_id: userId,
                    title,
                    message,
                    type: type || 'info',
                    image,
                    meta: withNotificationRouteMeta(meta),
                    read: false
                }])
                .select()

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
