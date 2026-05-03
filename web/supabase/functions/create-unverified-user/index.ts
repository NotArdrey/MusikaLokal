// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function escapeHtml(value: unknown) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function getConfirmationRedirect(rawRedirectTo: unknown) {
    const redirectTo = String(rawRedirectTo || '').trim()
    return redirectTo || Deno.env.get('EMAIL_CONFIRM_REDIRECT_TO') || 'musikalokal://?verified=true'
}

async function sendEmailConfirmationLink(
    supabaseAdmin: any,
    email: string,
    displayName: string,
    redirectTo: string,
    identityStatus: string = 'APPROVED',
) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    let supabaseAuthError: string | null = null

    if (supabaseUrl && supabaseAnonKey) {
        try {
            const response = await fetch(`${supabaseUrl}/auth/v1/resend`, {
                method: 'POST',
                headers: {
                    apikey: supabaseAnonKey,
                    Authorization: `Bearer ${supabaseAnonKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    type: 'signup',
                    email,
                    options: {
                        email_redirect_to: redirectTo,
                    },
                }),
            })

            if (response.ok) {
                return { sent: true, queued: false, provider: 'supabase_auth' }
            }

            const errorText = await response.text().catch(() => '')
            supabaseAuthError = `Supabase Auth ${response.status}: ${errorText.slice(0, 500)}`
            console.error('email_confirmation_supabase_auth_failed', { status: response.status, body: errorText.slice(0, 500) })
        } catch (authEmailError) {
            supabaseAuthError = authEmailError instanceof Error ? authEmailError.message : String(authEmailError)
            console.error('email_confirmation_supabase_auth_exception', { message: supabaseAuthError })
        }
    } else {
        supabaseAuthError = 'Missing SUPABASE_URL or SUPABASE_ANON_KEY'
    }

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: {
            redirectTo,
            data: {
                is_verified: identityStatus === 'APPROVED',
                verification_status: identityStatus,
            },
        },
    })

    if (error) {
        console.error('email_confirmation_link_failed', { email, message: error.message })
        return { sent: false, queued: false, provider: 'supabase_auth', error: error.message, supabaseAuthError }
    }

    const actionLink = String(data?.properties?.action_link || '').trim()
    if (!actionLink) {
        return { sent: false, queued: false, provider: 'supabase_auth', error: 'Generated confirmation link was empty', supabaseAuthError }
    }

    const safeName = escapeHtml(displayName || 'there')
    const safeLink = escapeHtml(actionLink)
    const subject = 'Confirm your email - MusikaLokal'
    const statusCopy = identityStatus === 'PENDING_REVIEW'
        ? 'Your ID scan is still being reviewed by Didit. Please confirm your email address now so your account is ready after approval.'
        : 'Your ID scan was approved. Please confirm your email address before logging in.'
    const html = `
<h1>MusikaLokal</h1>
<p>Hi ${safeName},</p>
<p>${statusCopy}</p>
<p><a href="${safeLink}" style="display:inline-block;background:#5546FF;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700;">Confirm Email</a></p>
<p>If the button does not work, open this link:</p>
<p><a href="${safeLink}">${safeLink}</a></p>
<p>After confirming your email, return to MusikaLokal and log in.</p>`.trim()

    const { error: queueError } = await supabaseAdmin.from('email_notifications').insert({
        recipient_email: email,
        recipient_name: displayName || 'User',
        subject,
        html_content: html,
        template_type: 'signup_email_confirmation',
        status: 'pending',
        created_at: new Date().toISOString(),
    })

    if (queueError) {
        console.error('email_confirmation_queue_failed', { message: queueError.message })
        return { sent: false, queued: false, provider: 'email_notifications', error: queueError.message, supabaseAuthError }
    }

    return { sent: false, queued: true, provider: 'email_notifications', supabaseAuthError }
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const {
            email,
            password,
            role,
            fullName,
            isVerified = false,
            verificationStatus,
            diditSessionId,
            selectedDocumentType,
            verificationMode,
            redirectTo,
            action,
        } = await req.json()

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        if (action === 'resend_confirmation_email') {
            const normalizedEmail = String(email || '').trim().toLowerCase()
            if (!normalizedEmail) {
                return new Response(JSON.stringify({ error: 'Email required' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers()
            if (listError) throw listError

            const existingUser = listData?.users.find(u => u.email?.toLowerCase() === normalizedEmail)
            if (!existingUser) {
                return new Response(JSON.stringify({ error: 'Account not found' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 404,
                })
            }

            if (existingUser.email_confirmed_at) {
                return new Response(JSON.stringify({ message: 'Email is already confirmed', alreadyConfirmed: true }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200,
                })
            }

            const emailDelivery = await sendEmailConfirmationLink(
                supabaseAdmin,
                normalizedEmail,
                existingUser.user_metadata?.full_name || existingUser.user_metadata?.name || normalizedEmail.split('@')[0] || 'Musician',
                getConfirmationRedirect(redirectTo),
                String(existingUser.user_metadata?.verification_status || 'APPROVED').toUpperCase(),
            )

            return new Response(JSON.stringify({ emailDelivery }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: emailDelivery.sent ? 200 : 500,
            })
        }

        if (!email || !password) {
            return new Response(JSON.stringify({ error: 'Email and password required' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        const normalizedEmail = String(email).trim().toLowerCase()
        const normalizedRole = String(role || 'musician').trim().toLowerCase()
        const normalizedVerificationStatus = String(verificationStatus || '').trim().toUpperCase()
        const approvedByDidit = Boolean(isVerified) || normalizedVerificationStatus === 'APPROVED'
        const pendingByDidit = normalizedVerificationStatus === 'PENDING_REVIEW'
        const fallbackName = String(fullName || normalizedEmail.split('@')[0] || 'Musician').trim()

        let diditVerificationData: any = null

        if (approvedByDidit || pendingByDidit) {
            if (!diditSessionId) {
                return new Response(JSON.stringify({ error: 'Didit session is required for Didit account creation.' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            let { data: sessionData } = await supabaseAdmin
                .from('verification_sessions')
                .select('status, verification_data')
                .eq('session_ref', diditSessionId)
                .maybeSingle()

            if (!sessionData && String(diditSessionId).startsWith('TEMP_')) {
                const { data: userRefSessionData } = await supabaseAdmin
                    .from('verification_sessions')
                    .select('status, verification_data')
                    .eq('verification_data->>user_ref', diditSessionId)
                    .maybeSingle()

                sessionData = userRefSessionData
            }

            if (!sessionData) {
                const diditApiKey = Deno.env.get('DIDIT_API_KEY') || ''
                if (diditApiKey) {
                    try {
                        const decisionResponse = await fetch(`https://verification.didit.me/v3/session/${diditSessionId}/decision/`, {
                            method: 'GET',
                            headers: { 'Content-Type': 'application/json', 'X-Api-Key': diditApiKey },
                        })

                        if (decisionResponse.ok) {
                            const decisionPayload = await decisionResponse.json()
                            const decision = decisionPayload?.decision || decisionPayload
                            const idVerification = decision?.id_verifications?.[0] || decisionPayload?.id_verifications?.[0]
                            const faceMatch = decision?.face_matches?.[0] || decisionPayload?.face_matches?.[0]
                            const idStatus = idVerification?.status
                            const faceStatus = faceMatch?.status || (idStatus === 'Approved' ? 'Approved' : undefined)

                            if (idStatus === 'Approved' && (faceStatus === 'Approved' || !faceMatch)) {
                                sessionData = {
                                    status: 'APPROVED',
                                    verification_data: {
                                        full_name: fallbackName,
                                        email: normalizedEmail,
                                    },
                                }
                            } else if (idStatus === 'In Review' || faceStatus === 'In Review' || idStatus === 'Pending Review' || faceStatus === 'Pending Review') {
                                sessionData = { status: 'PENDING_REVIEW', verification_data: { email: normalizedEmail } }
                            }
                        }
                    } catch (diditError) {
                        console.error('Didit approval fallback failed:', diditError)
                    }
                }
            }

            const resolvedDiditStatus = String(sessionData?.status || '').toUpperCase()
            if (approvedByDidit && resolvedDiditStatus !== 'APPROVED') {
                return new Response(JSON.stringify({ error: 'Didit verification is not approved yet. Please try again.' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            if (pendingByDidit && !['PENDING_REVIEW', 'PENDING REVIEW', 'IN REVIEW'].includes(resolvedDiditStatus)) {
                return new Response(JSON.stringify({ error: 'Didit verification is not pending review. Please try again.' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            diditVerificationData = sessionData?.verification_data || null
            const diditEmail = String(diditVerificationData?.email || '').trim().toLowerCase()
            if (diditEmail && diditEmail !== normalizedEmail) {
                return new Response(JSON.stringify({ error: 'Didit verification email does not match this signup email.' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }
        }

        // 1. Check if user already exists in Auth
        const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers()

        if (listError) {
            throw listError
        }

        // Find existing user by email
        let existingUser = listData?.users.find(u => u.email?.toLowerCase() === normalizedEmail)

        if (existingUser) {
            console.log('Found existing user:', existingUser.id)

            // If they are already confirmed, STOP.
            if (existingUser.email_confirmed_at) {
                return new Response(JSON.stringify({ error: 'This email is already registered and verified. Please login.' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            // If they are NOT confirmed, this is a stalled/failed signup.
            // DELETE them to allow a fresh start.
            console.log('User is unverified. Deleting to allow fresh signup...')
            const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(existingUser.id)

            if (deleteError) {
                console.error('Failed to delete unverified user:', deleteError)
                return new Response(JSON.stringify({ error: 'Failed to reset existing account. Please contact support.' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            // Also clean up profile if it exists
            await supabaseAdmin.from('profiles').delete().eq('id', existingUser.id)

            console.log('Existing unverified user deleted.')
        }

        // 2. Create Fresh User
        // Didit approval verifies identity only. The Supabase auth email must
        // still be confirmed before password login is allowed.
        const { data: user, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: normalizedEmail,
            password,
            email_confirm: false,
            user_metadata: {
                is_verified: approvedByDidit,
                role: normalizedRole,
                verification_status: approvedByDidit ? 'APPROVED' : pendingByDidit ? 'PENDING_REVIEW' : 'PENDING',
                didit_session_id: diditSessionId || null,
                selected_document_type: selectedDocumentType || null,
                verification_mode: verificationMode || null,
                full_name: fallbackName,
                display_name: fallbackName,
                name: fallbackName,
            }
        })

        if (createError) {
            return new Response(JSON.stringify({ error: createError.message }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        if (!user.user) {
            throw new Error('User creation failed');
        }

        const userId = user.user.id;

        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .upsert({
                id: userId,
                email: normalizedEmail,
                full_name: fallbackName,
                role: normalizedRole,
                is_verified: false,
                verification_status: approvedByDidit ? 'APPROVED' : pendingByDidit ? 'PENDING_REVIEW' : 'PENDING',
                didit_session_id: diditSessionId || null,
                id_document_expiry: diditVerificationData?.id_document_expiry || null,
                id_verified_at: null,
            })

        if (profileError) {
            console.error('Profile creation error:', profileError)
            await supabaseAdmin.auth.admin.deleteUser(userId)
            throw new Error('Failed to create profile: ' + profileError.message)
        }

        const emailDelivery = await sendEmailConfirmationLink(
            supabaseAdmin,
            normalizedEmail,
            fallbackName,
            getConfirmationRedirect(redirectTo),
            approvedByDidit ? 'APPROVED' : pendingByDidit ? 'PENDING_REVIEW' : 'PENDING',
        )

        return new Response(JSON.stringify({
            user: user.user,
            emailConfirmationRequired: true,
            emailDelivery,
            message: approvedByDidit
                ? 'User created with verified identity; email confirmation required'
                : pendingByDidit
                    ? 'User created with Didit identity pending review; email confirmation required'
                : 'User created (unverified); email confirmation required'
        }), {
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
