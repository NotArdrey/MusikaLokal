// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Didit Secret for Webhook Verification
const DIDIT_WEBHOOK_SECRET = 'NI3SI6-68go4my2TjpQOCyvNs90aZ9PLjZV-zB0Ed7w';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 1. Verify Request Source (Basic check)
        // Didit might send a signature header. For now, we'll proceed but logging headers is good practice.
        // const signature = req.headers.get('x-didit-signature'); 

        const payload = await req.json()
        console.log('Received Didit Webhook:', JSON.stringify(payload, null, 2))

        // 2. Extract User ID and Status
        // Based on standard Didit payloads, 'reference' usually holds the custom ID we passed
        const userId = payload.reference || payload.session?.reference;
        const decision = payload.decision || payload.session?.decision; // 'approved', 'declined', etc.

        if (!userId) {
            throw new Error('No user reference found in payload')
        }

        // 3. Update Supabase
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''; // MUST use Service Role to bypass RLS

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

        if (decision === 'approved') {
            const { error } = await supabaseAdmin
                .from('profiles')
                .update({ is_verified: true })
                .eq('id', userId)

            if (error) throw error;
            console.log(`User ${userId} marked as verified.`)
        } else {
            console.log(`User ${userId} verification decision: ${decision}. No change made.`)
        }

        return new Response(JSON.stringify({ received: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        console.error('Webhook Error:', error.message)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
