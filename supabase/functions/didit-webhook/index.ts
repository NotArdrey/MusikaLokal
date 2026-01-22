// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Didit Webhook Handler (3NF Normalized)
 * 
 * This webhook now works with the Supabase auth system directly.
 * The 'reference' parameter in Didit verification URL should be the user's auth.uid
 * (obtained after they complete signup via Supabase auth).
 * 
 * Flow:
 * 1. User signs up via Supabase auth (gets unverified profile)
 * 2. User completes Didit verification with their user ID as reference
 * 3. This webhook updates their profile to is_verified = true
 */
serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const payload = await req.json()
        console.log('Received Didit Webhook:', JSON.stringify(payload, null, 2))

        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

        // Extract session info from Didit payload
        const sessionId = payload.session_id;
        const status = payload.status;
        const webhookType = payload.webhook_type;
        const decision = payload.decision;
        // The reference should be the user's UUID (passed during verification initiation)
        const userReference = payload.reference || payload.vendor_data;

        console.log('Webhook type:', webhookType, 'Status:', status, 'Session:', sessionId, 'Reference:', userReference);

        // When verification starts, just acknowledge
        if (status === 'Not Started' && webhookType === 'status.updated') {
            console.log(`Verification started for session ${sessionId}`);
            return new Response(JSON.stringify({ received: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // When decision is made, check if approved
        if (decision) {
            // Get the overall status from id_verifications
            const idVerification = decision.id_verifications?.[0];
            const faceMatch = decision.face_matches?.[0];
            const isApproved = faceMatch?.status === 'Approved';

            if (isApproved && userReference) {
                // Extract ID document data
                const firstName = idVerification?.first_name || '';
                const lastName = idVerification?.last_name || idVerification?.extra_fields?.first_surname || '';
                const fullName = firstName && lastName ? `${firstName} ${lastName}` : (firstName || lastName || '');
                const documentExpiry = idVerification?.expiration_date || null;

                console.log('Extracted document data:', { fullName, documentExpiry, userId: userReference });

                // Update the user's profile to mark as verified
                const { data: profile, error: profileError } = await supabaseAdmin
                    .from('profiles')
                    .update({
                        full_name: fullName || undefined, // Only update if we have a value
                        is_verified: true,
                        id_document_expiry: documentExpiry,
                        id_verified_at: new Date().toISOString(),
                    })
                    .eq('id', userReference)
                    .select()
                    .single();

                if (profileError) {
                    console.log('Failed to update profile:', profileError.message);
                    // Profile might not exist yet, try to create it
                    const { error: upsertError } = await supabaseAdmin
                        .from('profiles')
                        .upsert({
                            id: userReference,
                            full_name: fullName || null,
                            is_verified: true,
                            id_document_expiry: documentExpiry,
                            id_verified_at: new Date().toISOString(),
                            created_at: new Date().toISOString(),
                        });

                    if (upsertError) {
                        console.log('Failed to upsert profile:', upsertError.message);
                        throw new Error('Failed to update user profile: ' + upsertError.message);
                    }
                }

                console.log(`Profile verified for user ${userReference}`);

                // Send notification to user
                await supabaseAdmin
                    .from('notifications')
                    .insert({
                        user_id: userReference,
                        type: 'success',
                        title: 'Identity Verified',
                        message: 'Your identity has been successfully verified. You now have full access to all features.',
                    });

            } else if (!isApproved) {
                console.log('Verification not approved. Face match status:', faceMatch?.status);
                
                // Optionally notify user of failed verification
                if (userReference) {
                    await supabaseAdmin
                        .from('notifications')
                        .insert({
                            user_id: userReference,
                            type: 'error',
                            title: 'Verification Failed',
                            message: 'Your identity verification was not successful. Please try again or contact support.',
                        });
                }
            }
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

