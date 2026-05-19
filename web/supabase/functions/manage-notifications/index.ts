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
            { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
        )

        const { action, ...params } = await req.json()

        const {
            data: { user },
            error: authError,
        } = await supabaseClient.auth.getUser()

        if (authError || !user?.id) {
            return new Response(JSON.stringify({ error: 'Authentication required' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            })
        }

        const authenticatedUserId = user.id

        // 0. UNREAD COUNT
        if (action === 'unread_count') {
            const { count, error } = await supabaseClient
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', authenticatedUserId)
                .eq('read', false)

            if (error) throw error

            return new Response(JSON.stringify({ count }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // 1. FETCH NOTIFICATIONS
        if (action === 'fetch') {
            const { limit, cursor } = params
            const pageSize = Math.max(1, Math.min(Number(limit) || 30, 60))

            let query = supabaseClient
                .from('notifications')
                .select('*')
                .eq('user_id', authenticatedUserId)
                .order('created_at', { ascending: false })
                .limit(pageSize + 1)

            if (typeof cursor === 'string' && cursor.trim().length > 0) {
                query = query.lt('created_at', cursor)
            }

            const { data, error } = await query

            if (error) throw error

            const rows = data || []
            const items = rows.slice(0, pageSize)
            const nextCursor =
                rows.length > pageSize
                    ? items[items.length - 1]?.created_at || null
                    : null

            const { count: unreadCount, error: unreadError } = await supabaseClient
                .from('notifications')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', authenticatedUserId)
                .eq('read', false)

            if (unreadError) throw unreadError

            const responsePayload = {
                items,
                data: items,
                nextCursor,
                unreadCount: unreadCount || 0,
            }

            return new Response(JSON.stringify(responsePayload), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // 2. MARK AS READ (Single or All)
        if (action === 'mark_read') {
            const { notificationId, all } = params

            let query = supabaseClient.from('notifications').update({ read: true })

            if (all) {
                query = query.eq('user_id', authenticatedUserId)
            } else {
                query = query.eq('id', notificationId).eq('user_id', authenticatedUserId)
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
            const { title, message, type, image, meta } = params

            const { data, error } = await supabaseClient
                .from('notifications')
                .insert([{
                    user_id: authenticatedUserId,
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
