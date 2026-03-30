// @ts-nocheck - This file runs on Deno (Supabase Edge Functions), not Node.js
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        const { action, userId } = await req.json()

        // 1. Verify User
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
        if (userError || !user) throw new Error('Unauthorized')

        if (action === 'create_session') {
            // Didit Verification Integration
            // Didit Verification Integration
            const DIDIT_CLIENT_ID = 'fe4e28a0-fa8e-48c0-b499-d776834c425e' // App ID
            const DIDIT_VERIFICATION_URL = 'https://verify.didit.me/verify/kxYhKHgC1LESNW-TQEmPcw' // Workflow URL

            console.log('Creating Didit session for user:', userId, 'App ID:', DIDIT_CLIENT_ID)

            // Didit "No-Code" Flow: Redirect user to the workflow URL with reference
            const verificationUrl = `${DIDIT_VERIFICATION_URL}?reference=${userId}`

            // TODO: If Didit requires API-based session creation, you would call:
            // const response = await fetch('https://verification.didit.me/v2/session/', {
            //     method: 'POST',
            //     headers: {
            //         'Authorization': `Bearer ${DIDIT_API_KEY}`,
            //         'Content-Type': 'application/json'
            //     },
            //     body: JSON.stringify({ reference: userId, workflow_id: 'your_workflow_id' })
            // })

            return new Response(JSON.stringify({
                url: verificationUrl,
                clientId: DIDIT_CLIENT_ID,
                reference: userId
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        if (action === 'check_status') {
            // Check if verification is done
            // Update user profile if verified
            return new Response(JSON.stringify({ status: 'pending' }), {
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
