// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

        console.log('Webhook type:', webhookType, 'Status:', status, 'Session:', sessionId);

        // When verification starts ("Not Started"), link session to most recent pending signup
        if (status === 'Not Started' && webhookType === 'status.updated') {
            // Find the most recent pending signup without a session_id
            const { data: pending, error } = await supabaseAdmin
                .from('pending_signups')
                .select('*')
                .is('didit_session_id', null)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (pending && !error) {
                // Link this session to the pending signup
                await supabaseAdmin
                    .from('pending_signups')
                    .update({ didit_session_id: sessionId })
                    .eq('id', pending.id);
                console.log(`Linked session ${sessionId} to pending signup ${pending.id}`);
            } else {
                console.log('No pending signup to link or error:', error?.message);
            }

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

            if (isApproved) {
                // Find pending signup by session_id
                const { data: pending, error: fetchError } = await supabaseAdmin
                    .from('pending_signups')
                    .select('*')
                    .eq('didit_session_id', sessionId)
                    .single();

                if (fetchError || !pending) {
                    console.log('Pending signup not found for session:', sessionId, fetchError?.message);
                    // Return success anyway - might be a duplicate webhook
                    return new Response(JSON.stringify({ received: true }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 200,
                    });
                }

                // Extract ID document data
                const firstName = idVerification?.first_name || '';
                const lastName = idVerification?.last_name || idVerification?.extra_fields?.first_surname || '';
                const fullName = firstName && lastName ? `${firstName} ${lastName}` : (firstName || lastName || '');
                const documentExpiry = idVerification?.expiration_date || null;

                console.log('Extracted document data:', { fullName, documentExpiry });

                // First, try to invite the user (this actually sends an email)
                const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(pending.email, {
                    redirectTo: 'https://musikalokal-redirection.vercel.app/',
                    data: {
                        full_name: fullName,
                        is_verified: true,
                    }
                });

                if (inviteError) {
                    // If invite fails (user might already exist), try creating user directly
                    console.log('Invite failed, trying createUser:', inviteError.message);

                    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
                        email: pending.email,
                        password: pending.password_hash,
                        email_confirm: true, // Mark as confirmed since Didit verified
                    });

                    if (createError) {
                        console.log('Failed to create user:', createError.message);
                        throw new Error('Failed to create user account: ' + createError.message);
                    }

                    const newUserId = userData.user.id;
                    console.log(`User ${newUserId} created with password for email ${pending.email}`);

                    // Create profile
                    await supabaseAdmin
                        .from('profiles')
                        .upsert({
                            id: newUserId,
                            email: pending.email,
                            full_name: fullName || null,
                            is_verified: true,
                            id_document_expiry: documentExpiry,
                            id_verified_at: new Date().toISOString(),
                            created_at: new Date().toISOString(),
                        });
                } else {
                    // Invite succeeded - user will set password via email link
                    const newUserId = inviteData.user.id;
                    console.log(`User ${newUserId} invited via email to ${pending.email}`);

                    // Update the user with the password they provided during signup
                    await supabaseAdmin.auth.admin.updateUserById(newUserId, {
                        password: pending.password_hash,
                    });

                    // Create profile
                    await supabaseAdmin
                        .from('profiles')
                        .upsert({
                            id: newUserId,
                            email: pending.email,
                            full_name: fullName || null,
                            is_verified: true,
                            id_document_expiry: documentExpiry,
                            id_verified_at: new Date().toISOString(),
                            created_at: new Date().toISOString(),
                        });

                    console.log(`Invitation email sent to ${pending.email}`);
                }

                // Delete pending signup
                await supabaseAdmin
                    .from('pending_signups')
                    .delete()
                    .eq('id', pending.id);

                console.log(`Account created and pending signup deleted for ${pending.email}`);
            } else {
                console.log('Verification not approved. Face match status:', faceMatch?.status);
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

