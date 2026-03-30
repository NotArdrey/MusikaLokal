// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Create a Supabase client with the Auth context of the logged in user
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        )

        // Get the user from the JWT
        const {
            data: { user },
            error: userError,
        } = await supabaseClient.auth.getUser()

        if (userError || !user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            })
        }

        // Create a Supabase client with Admin context to perform deletion
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Check the user's current verification status in profiles
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('verification_status')
            .eq('id', user.id)
            .single()

        if (profileError) {
            // If profile doesn't exist, we can probably safely delete the auth user
            console.log('Profile not found, proceeding with auth deletion');
        } else {
            // ONLY allow deletion if not verified or authorized
            const allowedStatuses = ['NOT_STARTED', 'ABANDONED', 'DECLINED', 'PENDING'];
            if (!allowedStatuses.includes(profile.verification_status)) {
                return new Response(JSON.stringify({ error: 'Cannot delete account with current verification status' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                })
            }
        }

        // Delete the user from Auth (this usually cascades to tables if set up, or we delete manually)
        // We already checked logic above, so we proceed.
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(
            user.id
        )

        if (deleteError) {
            throw deleteError
        }

        return new Response(JSON.stringify({ message: 'Account deleted successfully' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
