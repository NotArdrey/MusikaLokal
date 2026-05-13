// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendEmailWithGmail } from '../_shared/gmailEmail.ts'
import {
    buildIdentityDocumentFingerprint,
    DIDIT_PENDING_SOURCE,
    DUPLICATE_REVIEW_SOURCE,
    findSameRoleIdentityDuplicate,
    getDuplicateIdentityReviewReason,
    normalizeIdentityEmail,
    prepareIdentityNameBirthDateDuplicateInput,
    queueIdentityReview,
    recordIdentityDocumentClaim,
    stripPrivateSessionFields,
    verifySessionNonce,
} from '../_shared/identityDuplicate.ts'
import {
    enforceRegistrationRateLimit,
    getRegistrationRateLimitStatus,
    markRegistrationAttempt,
} from '../_shared/registrationRateLimit.ts'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const allowedSignupRoles = new Set(['fan', 'musician'])

async function findAuthUserByEmail(supabaseAdmin: any, email: string) {
    const normalizedEmail = normalizeIdentityEmail(email)
    const perPage = 1000

    for (let page = 1; page <= 20; page += 1) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
        if (error) throw error

        const matchedUser = (data?.users || []).find((user: any) => normalizeIdentityEmail(user?.email) === normalizedEmail)
        if (matchedUser) return matchedUser

        if ((data?.users || []).length < perPage) break
    }

    return null
}

async function getValidatedDiditSession(
    supabaseAdmin: any,
    diditSessionId: string,
    sessionNonce: unknown,
) {
    if (!diditSessionId) return null

    const { data: sessionData, error } = await supabaseAdmin
        .from('verification_sessions')
        .select('status, verification_data')
        .eq('session_ref', diditSessionId)
        .maybeSingle()

    if (error) {
        throw new Error(`Failed to load Didit session: ${error.message}`)
    }

    const expectedHash = sessionData?.verification_data?.session_nonce_hash
    const validNonce = await verifySessionNonce(diditSessionId, sessionNonce, expectedHash)
    if (!sessionData || !validNonce) {
        throw new Error('Didit session could not be validated. Please restart identity verification.')
    }

    return {
        status: String(sessionData.status || '').replace(/[\s-]+/g, '_').toUpperCase(),
        verification_data: stripPrivateSessionFields(sessionData.verification_data || {}),
    }
}

function getDefaultDisplayNameForRole(role: unknown) {
    return String(role || '').trim().toLowerCase() === 'fan' ? 'Fan' : 'Musician'
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

function normalizeVerificationStatus(value: unknown) {
    return String(value || '').trim().replace(/[\s-]+/g, '_').toUpperCase()
}

function findDecisionObject(source: any) {
    const candidates = [
        source?.decision,
        source?.verification_data?.decision,
        source?.details?.decision,
        source,
    ]

    return candidates.find((candidate) => (
        candidate &&
        typeof candidate === 'object' &&
        (Array.isArray(candidate.id_verifications) || Array.isArray(candidate.face_matches))
    )) || null
}

function resolveSourceVerificationStatus(source: any) {
    if (!source || typeof source !== 'object') return ''

    return normalizeVerificationStatus(
        source.status ||
        source.verification_status ||
        source.verification_data?.status ||
        source.session?.status ||
        source.result?.status ||
        source.decision?.status,
    )
}

function shouldReviewMissingFaceMatch(sourceStatus: unknown) {
    const normalized = normalizeVerificationStatus(sourceStatus)
    return normalized === 'PENDING_REVIEW'
}

function resolveDiditFaceRequiredStatus(source: any) {
    const decision = findDecisionObject(source)
    if (!decision) return ''

    const sourceStatus = resolveSourceVerificationStatus(source)
    const idVerification = decision.id_verifications?.[0]
    const faceMatch = decision.face_matches?.[0]
    const idStatus = normalizeVerificationStatus(idVerification?.status)
    const faceStatus = normalizeVerificationStatus(faceMatch?.status)

    if (idStatus === 'DECLINED' || faceStatus === 'DECLINED') return 'DECLINED'
    if (idStatus === 'ABANDONED' || faceStatus === 'ABANDONED') return 'ABANDONED'
    if (idStatus === 'APPROVED' && !faceMatch) {
        return shouldReviewMissingFaceMatch(sourceStatus) ? 'PENDING_REVIEW' : 'PENDING'
    }
    if (idStatus === 'PENDING_REVIEW' || faceStatus === 'PENDING_REVIEW') return 'PENDING_REVIEW'
    if (idStatus === 'APPROVED' && faceStatus === 'APPROVED') return 'APPROVED'

    return sourceStatus || normalizeVerificationStatus(decision.status)
}

async function fetchLiveDiditFaceRequiredStatus(diditSessionId: string) {
    const diditApiKey = Deno.env.get('DIDIT_API_KEY') || ''
    if (!diditApiKey || !diditSessionId) return ''

    let resolvedStatus = ''

    for (const url of [
        `https://verification.didit.me/v3/session/${diditSessionId}/decision/`,
        `https://verification.didit.me/v3/session/${diditSessionId}`,
    ]) {
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json', 'x-api-key': diditApiKey },
            })

            if (!response.ok) continue

            const payload = await response.json()
            const status = resolveDiditFaceRequiredStatus(payload)
            if (status) {
                resolvedStatus = status
                if (status !== 'PENDING') break
            }
        } catch (error) {
            console.error('live_didit_face_status_lookup_failed', {
                diditSessionId,
                message: error instanceof Error ? error.message : String(error),
            })
        }
    }

    return resolvedStatus
}

function buildDeferredEmailDelivery(identityStatus: string) {
    return {
        sent: false,
        queued: false,
        provider: 'identity_review',
        skipped: true,
        reason: identityStatus === 'PENDING_REVIEW'
            ? 'identity_pending_review'
            : 'identity_not_approved',
    }
}

function getApprovalClaimReviewReason(approvalClaim: any, role: string) {
    return String(approvalClaim?.review_reason || approvalClaim?.reason || '').trim() || getDuplicateIdentityReviewReason(role)
}

function getApprovalClaimMatchedOn(approvalClaim: any, fallback = 'DOCUMENT_FINGERPRINT') {
    return String(approvalClaim?.matched_on || approvalClaim?.match_type || fallback).trim().toUpperCase()
}

function getApprovalClaimMatchCount(approvalClaim: any, fallback = 1) {
    const count = Number(approvalClaim?.duplicate_count || approvalClaim?.match_count || approvalClaim?.matches?.length || fallback)
    return Number.isFinite(count) ? count : fallback
}

async function getEmailConfirmationGate(supabaseAdmin: any, user: any) {
    const metadataStatus = normalizeVerificationStatus(user?.user_metadata?.verification_status)
    const { data: profile, error } = await supabaseAdmin
        .from('profiles')
        .select('is_verified, verification_status')
        .eq('id', user.id)
        .maybeSingle()

    if (error) {
        console.error('email_confirmation_gate_profile_lookup_failed', {
            userId: user?.id || null,
            message: error.message,
        })
    }

    const profileStatus = normalizeVerificationStatus(profile?.verification_status)
    const status = profileStatus || metadataStatus || 'PENDING'
    const canSend = profile?.is_verified === true || status === 'APPROVED'

    return { canSend, status }
}

async function sendEmailConfirmationLink(
    supabaseAdmin: any,
    email: string,
    displayName: string,
    redirectTo: string,
    identityStatus: string = 'APPROVED',
) {
    const normalizedIdentityStatus = normalizeVerificationStatus(identityStatus) || 'APPROVED'
    if (normalizedIdentityStatus !== 'APPROVED') {
        return buildDeferredEmailDelivery(normalizedIdentityStatus)
    }

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
                is_verified: normalizedIdentityStatus === 'APPROVED',
                verification_status: normalizedIdentityStatus,
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
    const statusCopy = normalizedIdentityStatus === 'PENDING_REVIEW'
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

    const gmailDelivery = await sendEmailWithGmail({
        to: email,
        subject,
        html,
        recipientName: displayName || 'User',
        source: 'create-unverified-user',
    })

    if (gmailDelivery.sent) {
        return { sent: true, queued: false, provider: gmailDelivery.provider, supabaseAuthError }
    }

    const gmailError = gmailDelivery.error || 'Gmail sender is not configured'
    console.error('email_confirmation_gmail_failed', {
        provider: gmailDelivery.provider,
        message: gmailError,
    })

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
        return { sent: false, queued: false, provider: 'email_notifications', error: `${gmailError}; ${queueError.message}`, supabaseAuthError }
    }

    return { sent: false, queued: true, provider: 'email_notifications', error: `${gmailError}; queued in email_notifications`, supabaseAuthError }
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
            diditSessionId,
            sessionNonce,
            selectedDocumentType,
            selectedDocumentTypeKey,
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

            const existingUser = await findAuthUserByEmail(supabaseAdmin, normalizedEmail)
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

            const confirmationGate = await getEmailConfirmationGate(supabaseAdmin, existingUser)
            if (!confirmationGate.canSend) {
                return new Response(JSON.stringify({
                    message: 'Email confirmation will be sent after identity review is approved.',
                    emailConfirmationDeferred: true,
                    identityStatus: confirmationGate.status,
                    emailDelivery: buildDeferredEmailDelivery(confirmationGate.status),
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200,
                })
            }

            const emailDelivery = await sendEmailConfirmationLink(
                supabaseAdmin,
                normalizedEmail,
                existingUser.user_metadata?.full_name || existingUser.user_metadata?.name || normalizedEmail.split('@')[0] || getDefaultDisplayNameForRole(existingUser.user_metadata?.role),
                getConfirmationRedirect(redirectTo),
                confirmationGate.status,
            )

            return new Response(JSON.stringify({ emailDelivery }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: emailDelivery.sent || emailDelivery.queued ? 200 : 500,
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
        if (!allowedSignupRoles.has(normalizedRole)) {
            return new Response(JSON.stringify({ error: 'Invalid signup role.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        const fallbackName = String(fullName || normalizedEmail.split('@')[0] || getDefaultDisplayNameForRole(normalizedRole)).trim()

        let diditVerificationData: any = null
        let documentFingerprint: string | null = null
        let duplicateIdentityReview: any = null
        let resolvedDiditStatus = ''
        let registrationAttemptId: string | null = null

        if (!diditSessionId) {
            return new Response(JSON.stringify({ error: 'Didit session is required for Didit account creation.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        try {
            const registrationAttempt = await enforceRegistrationRateLimit(supabaseAdmin, req, {
                action: 'create_unverified_user',
                email: normalizedEmail,
                diditSessionId,
                metadata: {
                    role: normalizedRole,
                    verification_mode: verificationMode || null,
                },
            })
            registrationAttemptId = registrationAttempt?.attemptId || null
        } catch (rateLimitError) {
            const status = getRegistrationRateLimitStatus(rateLimitError)
            if (status) {
                return new Response(JSON.stringify({ error: rateLimitError.message }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status,
                })
            }
            throw rateLimitError
        }

        const sessionData = await getValidatedDiditSession(supabaseAdmin, diditSessionId, sessionNonce)
        const localDiditStatus = String(sessionData?.status || '').toUpperCase()
        const liveFaceRequiredStatus = await fetchLiveDiditFaceRequiredStatus(diditSessionId)
        const localFaceRequiredStatus = resolveDiditFaceRequiredStatus(sessionData?.verification_data)
        resolvedDiditStatus = liveFaceRequiredStatus || localFaceRequiredStatus || localDiditStatus

        if (resolvedDiditStatus === 'APPROVED' && !liveFaceRequiredStatus && !localFaceRequiredStatus) {
            resolvedDiditStatus = 'PENDING_REVIEW'
        }

        if (localDiditStatus === 'APPROVED' && resolvedDiditStatus !== 'APPROVED') {
            await supabaseAdmin
                .from('verification_sessions')
                .update({
                    status: resolvedDiditStatus,
                })
                .eq('session_ref', diditSessionId)
        }

        const approvedByDidit = resolvedDiditStatus === 'APPROVED'
        const pendingByDidit = ['PENDING_REVIEW', 'IN_REVIEW', 'PENDING REVIEW'].includes(resolvedDiditStatus)

        if (!approvedByDidit && !pendingByDidit) {
            return new Response(JSON.stringify({ error: 'Didit verification is not approved or pending review yet. Please try again.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        diditVerificationData = sessionData?.verification_data || null
        const identityNameBirthDate = approvedByDidit
            ? prepareIdentityNameBirthDateDuplicateInput(diditVerificationData?.raw_data || diditVerificationData, {
                fullLegalName: diditVerificationData?.verified_full_legal_name || diditVerificationData?.full_legal_name || diditVerificationData?.full_name,
                normalizedFullLegalName: diditVerificationData?.normalized_full_legal_name,
                birthDate: diditVerificationData?.birth_date || diditVerificationData?.date_of_birth,
            })
            : {
                fullLegalName: null,
                normalizedFullLegalName: null,
                birthDate: null,
                hasNameBirthDate: false,
            }
        const diditEmail = String(diditVerificationData?.email || '').trim().toLowerCase()
        if (diditEmail && diditEmail !== normalizedEmail) {
            return new Response(JSON.stringify({ error: 'Didit verification email does not match this signup email.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        documentFingerprint = diditVerificationData?.document_fingerprint || await buildIdentityDocumentFingerprint(
            diditVerificationData?.raw_data || diditVerificationData,
            {
                documentType: selectedDocumentType,
                documentTypeKey: selectedDocumentTypeKey,
                documentCountry: diditVerificationData?.document_country,
            },
        )

        if (documentFingerprint) {
            duplicateIdentityReview = await findSameRoleIdentityDuplicate(supabaseAdmin, {
                documentFingerprint,
                role: normalizedRole,
                email: normalizedEmail,
            })
        }

        const diditDuplicateFlag = Boolean(diditVerificationData?.duplicate_identity_review_required)
        const sameRoleDuplicateDetected = Boolean(duplicateIdentityReview?.hasDuplicate)
        const diditDuplicateFlagRequiresReview = diditDuplicateFlag && (!documentFingerprint || sameRoleDuplicateDetected)
        const requiresDuplicateIdentityReview = Boolean(sameRoleDuplicateDetected || diditDuplicateFlagRequiresReview)
        const effectiveVerificationStatus = approvedByDidit && !requiresDuplicateIdentityReview
            ? 'APPROVED'
            : (pendingByDidit || requiresDuplicateIdentityReview) ? 'PENDING_REVIEW' : 'PENDING'
        const effectiveIsVerified = effectiveVerificationStatus === 'APPROVED'
        // 1. Check if user already exists in Auth
        let existingUser = await findAuthUserByEmail(supabaseAdmin, normalizedEmail)

        let authUserForResponse: any = null
        let userId = ''
        let createdNewUser = false

        if (existingUser) {

            // If they are already confirmed, STOP.
            if (existingUser.email_confirmed_at) {
                return new Response(JSON.stringify({ error: 'This email is already registered and verified. Please login.' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            // If they are NOT confirmed, this is a stalled/failed signup.
            // DELETE them to allow a fresh start.
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

        }

        // 2. Create Fresh User
        // Didit approval verifies identity only. The Supabase auth email must
        // still be confirmed before password login is allowed.
        const { data: user, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: normalizedEmail,
            password,
            email_confirm: false,
            user_metadata: {
                is_verified: effectiveIsVerified,
                role: normalizedRole,
                verification_status: effectiveVerificationStatus,
                didit_session_id: diditSessionId || null,
                selected_document_type: selectedDocumentType || null,
                selected_document_type_key: selectedDocumentTypeKey || null,
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

        authUserForResponse = user.user
        userId = user.user.id
        createdNewUser = true

        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .upsert({
                id: userId,
                email: normalizedEmail,
                full_name: fallbackName,
                role: normalizedRole,
                is_verified: false,
                verification_status: effectiveVerificationStatus,
                didit_session_id: diditSessionId || null,
                id_document_expiry: diditVerificationData?.id_document_expiry || null,
                id_verified_at: null,
            })

        if (profileError) {
            console.error('Profile creation error:', profileError)
            if (createdNewUser) {
                await supabaseAdmin.auth.admin.deleteUser(userId)
            }
            throw new Error('Failed to create profile: ' + profileError.message)
        }

        let identityReviewRecord = null
        let finalVerificationStatus = effectiveVerificationStatus
        let finalDuplicateIdentityReview = requiresDuplicateIdentityReview
        if (requiresDuplicateIdentityReview) {
            const duplicateReason = getDuplicateIdentityReviewReason(normalizedRole)
            identityReviewRecord = await queueIdentityReview(supabaseAdmin, {
                userId,
                email: normalizedEmail,
                role: normalizedRole,
                documentType: selectedDocumentType,
                documentTypeKey: selectedDocumentTypeKey,
                documentCountry: diditVerificationData?.document_country || 'PHL',
                source: DUPLICATE_REVIEW_SOURCE,
                diditSessionId,
                documentFingerprint,
                duplicateReason,
                duplicateMatchCount: duplicateIdentityReview?.matches?.length || diditVerificationData?.duplicate_match_count || 1,
                verifiedFullLegalName: identityNameBirthDate.fullLegalName,
                normalizedFullLegalName: identityNameBirthDate.normalizedFullLegalName,
                birthDate: identityNameBirthDate.birthDate,
                reviewReason: duplicateReason,
                matchedOn: 'DOCUMENT_FINGERPRINT',
                metadata: {
                    didit_duplicate_flag: diditDuplicateFlag,
                    source_session_status: resolvedDiditStatus,
                    matched_on: 'DOCUMENT_FINGERPRINT',
                    duplicate_matches: duplicateIdentityReview?.matches || [],
                },
            })
            await recordIdentityDocumentClaim(supabaseAdmin, {
                userId,
                role: normalizedRole,
                documentFingerprint,
                documentType: selectedDocumentType,
                documentTypeKey: selectedDocumentTypeKey,
                documentCountry: diditVerificationData?.document_country || 'PHL',
                source: DUPLICATE_REVIEW_SOURCE,
                status: 'PENDING_REVIEW',
                diditSessionId,
                manualReviewId: identityReviewRecord?.id || null,
                email: normalizedEmail,
                verifiedFullLegalName: identityNameBirthDate.fullLegalName,
                normalizedFullLegalName: identityNameBirthDate.normalizedFullLegalName,
                birthDate: identityNameBirthDate.birthDate,
                reviewReason: duplicateReason,
                matchedOn: 'DOCUMENT_FINGERPRINT',
            })
        } else if (pendingByDidit) {
            identityReviewRecord = await queueIdentityReview(supabaseAdmin, {
                userId,
                email: normalizedEmail,
                role: normalizedRole,
                documentType: selectedDocumentType,
                documentTypeKey: selectedDocumentTypeKey,
                documentCountry: diditVerificationData?.document_country || 'PHL',
                source: DIDIT_PENDING_SOURCE,
                diditSessionId,
                documentFingerprint,
                verifiedFullLegalName: identityNameBirthDate.fullLegalName,
                normalizedFullLegalName: identityNameBirthDate.normalizedFullLegalName,
                birthDate: identityNameBirthDate.birthDate,
                metadata: {
                    source_session_status: resolvedDiditStatus,
                },
            })
            await recordIdentityDocumentClaim(supabaseAdmin, {
                userId,
                role: normalizedRole,
                documentFingerprint,
                documentType: selectedDocumentType,
                documentTypeKey: selectedDocumentTypeKey,
                documentCountry: diditVerificationData?.document_country || 'PHL',
                source: DIDIT_PENDING_SOURCE,
                status: 'PENDING_REVIEW',
                diditSessionId,
                manualReviewId: identityReviewRecord?.id || null,
                email: normalizedEmail,
                verifiedFullLegalName: identityNameBirthDate.fullLegalName,
                normalizedFullLegalName: identityNameBirthDate.normalizedFullLegalName,
                birthDate: identityNameBirthDate.birthDate,
            })
        } else if (approvedByDidit) {
            const approvalClaim = await recordIdentityDocumentClaim(supabaseAdmin, {
                userId,
                role: normalizedRole,
                documentFingerprint,
                documentType: selectedDocumentType,
                documentTypeKey: selectedDocumentTypeKey,
                documentCountry: diditVerificationData?.document_country || 'PHL',
                source: 'DIDIT',
                status: 'APPROVED',
                diditSessionId,
                email: normalizedEmail,
                verifiedFullLegalName: identityNameBirthDate.fullLegalName,
                normalizedFullLegalName: identityNameBirthDate.normalizedFullLegalName,
                birthDate: identityNameBirthDate.birthDate,
            })

            if (approvalClaim?.decision === 'PENDING_REVIEW' || approvalClaim?.decision === 'EXISTING_ACCOUNT') {
                const duplicateReason = getApprovalClaimReviewReason(approvalClaim, normalizedRole)
                const matchedOn = getApprovalClaimMatchedOn(
                    approvalClaim,
                    duplicateReason === 'MISSING_DOCUMENT_FINGERPRINT' ? '' : 'DOCUMENT_FINGERPRINT',
                )
                identityReviewRecord = await queueIdentityReview(supabaseAdmin, {
                    userId,
                    email: normalizedEmail,
                    role: normalizedRole,
                    documentType: selectedDocumentType,
                    documentTypeKey: selectedDocumentTypeKey,
                    documentCountry: diditVerificationData?.document_country || 'PHL',
                    source: DUPLICATE_REVIEW_SOURCE,
                    diditSessionId,
                    documentFingerprint,
                    duplicateReason,
                    duplicateMatchCount: getApprovalClaimMatchCount(approvalClaim, duplicateReason === 'MISSING_DOCUMENT_FINGERPRINT' ? 0 : 1),
                    verifiedFullLegalName: identityNameBirthDate.fullLegalName,
                    normalizedFullLegalName: identityNameBirthDate.normalizedFullLegalName,
                    birthDate: identityNameBirthDate.birthDate,
                    reviewReason: duplicateReason,
                    matchedOn,
                    metadata: {
                        didit_duplicate_flag: diditDuplicateFlag,
                        source_session_status: resolvedDiditStatus,
                        matched_on: matchedOn,
                        approval_claim_result: approvalClaim,
                    },
                })

                await recordIdentityDocumentClaim(supabaseAdmin, {
                    userId,
                    role: normalizedRole,
                    documentFingerprint,
                    documentType: selectedDocumentType,
                    documentTypeKey: selectedDocumentTypeKey,
                    documentCountry: diditVerificationData?.document_country || 'PHL',
                    source: DUPLICATE_REVIEW_SOURCE,
                    status: 'PENDING_REVIEW',
                    diditSessionId,
                    manualReviewId: identityReviewRecord?.id || null,
                    email: normalizedEmail,
                    verifiedFullLegalName: identityNameBirthDate.fullLegalName,
                    normalizedFullLegalName: identityNameBirthDate.normalizedFullLegalName,
                    birthDate: identityNameBirthDate.birthDate,
                    reviewReason: duplicateReason,
                    matchedOn,
                    metadata: {
                        matched_on: matchedOn,
                        approval_claim_result: approvalClaim,
                    },
                })

                finalVerificationStatus = 'PENDING_REVIEW'
                finalDuplicateIdentityReview = true

                await supabaseAdmin
                    .from('profiles')
                    .update({
                        verification_status: 'PENDING_REVIEW',
                        is_verified: false,
                        id_verified_at: null,
                    })
                    .eq('id', userId)

                const { data: demotedUser } = await supabaseAdmin.auth.admin.updateUserById(userId, {
                    user_metadata: {
                        ...(authUserForResponse?.user_metadata || {}),
                        is_verified: false,
                        verification_status: 'PENDING_REVIEW',
                    },
                })
                if (demotedUser?.user) {
                    authUserForResponse = demotedUser.user
                }
            }
        }

        const emailConfirmationRequired = finalVerificationStatus === 'APPROVED'
        const emailDelivery = emailConfirmationRequired
            ? await sendEmailConfirmationLink(
                supabaseAdmin,
                normalizedEmail,
                fallbackName,
                getConfirmationRedirect(redirectTo),
                finalVerificationStatus,
            )
            : buildDeferredEmailDelivery(finalVerificationStatus)

        await markRegistrationAttempt(supabaseAdmin, registrationAttemptId, {
            success: true,
            user_id: userId,
            didit_session_id: diditSessionId,
            metadata: {
                role: normalizedRole,
                verification_status: finalVerificationStatus,
                duplicate_identity_review: finalDuplicateIdentityReview,
            },
        })

        return new Response(JSON.stringify({
            user: authUserForResponse,
            emailConfirmationRequired,
            emailConfirmationDeferred: !emailConfirmationRequired,
            duplicateIdentityReview: finalDuplicateIdentityReview,
            identityReviewId: identityReviewRecord?.id || null,
            emailDelivery,
            message: finalVerificationStatus === 'APPROVED'
                ? 'User created with verified identity; email confirmation required'
                : finalVerificationStatus === 'PENDING_REVIEW'
                    ? 'User created with identity pending review; email confirmation will be sent after approval'
                : 'User created (unverified); email confirmation required'
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error) {
        const status = getRegistrationRateLimitStatus(error) || 400
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status,
        })
    }
})
