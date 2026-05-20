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
    revokeOrphanSameRoleIdentityClaims,
    stripPrivateSessionFields,
    verifySessionNonce,
} from '../_shared/identityDuplicate.ts'
import {
    enforceRegistrationRateLimit,
    getRegistrationRateLimitStatus,
    markRegistrationAttempt,
} from '../_shared/registrationRateLimit.ts'
import {
    consumeMusicianVideoUpload,
    MUSICIAN_VIDEO_REVIEW_SOURCE,
} from '../_shared/musicianVideoProof.ts'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const allowedSignupRoles = new Set(['fan', 'musician'])
const PASSWORD_REQUIREMENT_ERROR = 'Password must be at least 8 characters and include uppercase, lowercase, a number, a symbol, and no spaces.'
const MISSING_DOCUMENT_FINGERPRINT_RETRY_REASON = 'MISSING_DOCUMENT_FINGERPRINT_RETRY_REQUIRED'
const MISSING_DOCUMENT_FINGERPRINT_RETRY_MESSAGE = 'We could not read the document number needed to verify this ID. Please repeat identity verification with a clear, valid ID.'

function getPasswordValidationError(value: unknown) {
    const password = String(value || '')
    if (
        password.length < 8 ||
        !/[A-Z]/.test(password) ||
        !/[a-z]/.test(password) ||
        !/[0-9]/.test(password) ||
        !/[^A-Za-z0-9\s]/.test(password) ||
        /\s/.test(password)
    ) {
        return PASSWORD_REQUIREMENT_ERROR
    }

    return ''
}

async function markDiditSessionRetryRequiredForMissingFingerprint(
    client: any,
    sessionRef: string,
    verificationData: Record<string, unknown> = {},
) {
    if (!sessionRef) return

    const existingVerificationData = verificationData && typeof verificationData === 'object'
        ? verificationData
        : {}

    await client
        .from('verification_sessions')
        .update({
            status: 'DECLINED',
            verification_data: {
                ...existingVerificationData,
                missing_document_fingerprint: true,
                retry_required: true,
                retry_reason: MISSING_DOCUMENT_FINGERPRINT_RETRY_REASON,
                retry_message: MISSING_DOCUMENT_FINGERPRINT_RETRY_MESSAGE,
                declined_at: new Date().toISOString(),
            },
        })
        .eq('session_ref', sessionRef)
}

async function markExistingSignupAccountDeclinedForMissingFingerprint(
    client: any,
    email: string,
    role: string,
    diditSessionId: string,
) {
    const normalizedEmail = String(email || '').trim().toLowerCase()
    if (!normalizedEmail) return

    const existingUser = await findAuthUserByEmail(client, normalizedEmail)
    if (!existingUser || existingUser.email_confirmed_at) return

    const { data: existingProfile } = await client
        .from('profiles')
        .select('role')
        .eq('id', existingUser.id)
        .maybeSingle()

    const existingRole = String(existingProfile?.role || existingUser.user_metadata?.role || '').trim().toLowerCase()
    if (existingRole && role && existingRole !== role) return

    const { error: profileError } = await client
        .from('profiles')
        .update({
            is_verified: false,
            verification_status: 'DECLINED',
            didit_session_id: null,
            id_verified_at: null,
        })
        .eq('id', existingUser.id)

    if (profileError) {
        console.error('missing_fingerprint_profile_decline_failed', profileError)
    }

    const { error: authUpdateError } = await client.auth.admin.updateUserById(existingUser.id, {
        user_metadata: {
            ...(existingUser.user_metadata || {}),
            role: role || existingRole || existingUser.user_metadata?.role || null,
            is_verified: false,
            verification_status: 'DECLINED',
            retry_required: true,
            retry_reason: MISSING_DOCUMENT_FINGERPRINT_RETRY_REASON,
            didit_session_id: null,
        },
    })

    if (authUpdateError) {
        console.error('missing_fingerprint_auth_decline_failed', authUpdateError)
    }

    const { error: notificationError } = await client
        .from('notifications')
        .insert({
            user_id: existingUser.id,
            type: 'warning',
            title: 'Identity Verification Retry Needed',
            message: MISSING_DOCUMENT_FINGERPRINT_RETRY_MESSAGE,
            meta: {
                verification_status: 'DECLINED',
                retry_required: true,
                retry_reason: MISSING_DOCUMENT_FINGERPRINT_RETRY_REASON,
                didit_session_id: diditSessionId,
            },
        })

    if (notificationError) {
        console.error('missing_fingerprint_notification_failed', notificationError)
    }
}

async function deleteRowsByIds(client: any, table: string, column: string, ids: string[]) {
    const uniqueIds = Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)))
    if (uniqueIds.length === 0) return

    const { error } = await client.from(table).delete().in(column, uniqueIds)
    if (error) throw error
}

async function nullProfileReference(client: any, table: string, column: string, userId: string) {
    const { error } = await client.from(table).update({ [column]: null }).eq(column, userId)
    if (error) throw error
}

async function cleanupStaleSignupUserRelations(client: any, userId: string) {
    const [
        { data: ownedGroups, error: ownedGroupsError },
        { data: ownedStudios, error: ownedStudiosError },
    ] = await Promise.all([
        client.from('groups').select('id').eq('owner_id', userId),
        client.from('studios').select('id').eq('owner_id', userId),
    ])

    if (ownedGroupsError) throw ownedGroupsError
    if (ownedStudiosError) throw ownedStudiosError

    const ownedGroupIds = (ownedGroups || []).map((item: any) => String(item?.id || '')).filter(Boolean)
    const ownedStudioIds = (ownedStudios || []).map((item: any) => String(item?.id || '')).filter(Boolean)

    const cleanupResults = await Promise.all([
        deleteRowsByIds(client, 'booking_requests', 'group_id', ownedGroupIds),
        deleteRowsByIds(client, 'booking_requests', 'studio_id', ownedStudioIds),
        client.from('booking_requests').delete().eq('sender_id', userId),
        client.from('booking_requests').delete().eq('receiver_id', userId),
        nullProfileReference(client, 'gigs', 'permit_reviewed_by', userId),
        nullProfileReference(client, 'studios', 'permit_reviewed_by', userId),
        nullProfileReference(client, 'withdrawal_requests', 'processed_by', userId),
    ])

    for (const result of cleanupResults.slice(2, 4)) {
        if (result?.error) throw result.error
    }
}

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

    if (!sessionData) {
        throw new Error('Didit session could not be validated. Please restart identity verification.')
    }

    const expectedHash = sessionData.verification_data?.session_nonce_hash
    if (expectedHash) {
        const validNonce = await verifySessionNonce(diditSessionId, sessionNonce, expectedHash)
        if (!validNonce) {
            throw new Error('Didit session could not be validated. Please restart identity verification.')
        }
    } else {
        console.warn('didit_session_legacy_nonce_missing', { diditSessionId })
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

async function mergeVerificationSessionData(
    client: any,
    sessionRef: string,
    updates: Record<string, unknown>,
) {
    if (!sessionRef) return

    const { data: existing } = await client
        .from('verification_sessions')
        .select('verification_data')
        .eq('session_ref', sessionRef)
        .maybeSingle()

    const existingVerificationData = existing?.verification_data && typeof existing.verification_data === 'object'
        ? existing.verification_data
        : {}

    await client
        .from('verification_sessions')
        .update({
            verification_data: {
                ...existingVerificationData,
                ...updates,
            },
        })
        .eq('session_ref', sessionRef)
}

async function sendMissingDocumentFingerprintRetryEmail(
    client: any,
    {
        email,
        displayName,
        diditSessionId,
    }: {
        email: string,
        displayName?: string,
        diditSessionId?: string,
    },
) {
    const recipientEmail = String(email || '').trim().toLowerCase()
    if (!recipientEmail) return { sent: false, queued: false, provider: 'none', skipped: true, error: 'Missing recipient email' }

    if (diditSessionId) {
        const { data: existing } = await client
            .from('verification_sessions')
            .select('verification_data')
            .eq('session_ref', diditSessionId)
            .maybeSingle()
        const existingData = existing?.verification_data && typeof existing.verification_data === 'object'
            ? existing.verification_data
            : {}
        if (existingData.missing_document_fingerprint_email_sent_at || existingData.missing_document_fingerprint_email_queued_at) {
            return { sent: false, queued: false, provider: 'dedupe', skipped: true }
        }
    }

    const safeName = escapeHtml(displayName || 'there')
    const safeMessage = escapeHtml(MISSING_DOCUMENT_FINGERPRINT_RETRY_MESSAGE)
    const subject = 'Identity Verification Retry Needed - MusikaLokal'
    const html = `
<h1>MusikaLokal</h1>
<p>Hi ${safeName},</p>
<p>${safeMessage}</p>
<p>Please start identity verification again and use a clear, readable government ID. Make sure the document number is visible and not covered by glare, blur, cropping, or a finger.</p>
<p>Your email is not blocked. You can retry registration with the same email address.</p>
<p>Thank you,<br>MusikaLokal Team</p>`.trim()

    const gmailDelivery = await sendEmailWithGmail({
        to: recipientEmail,
        subject,
        html,
        recipientName: displayName || 'User',
        source: 'missing-document-fingerprint-retry',
    })

    if (gmailDelivery.sent) {
        await mergeVerificationSessionData(client, String(diditSessionId || ''), {
            missing_document_fingerprint_email_sent_at: new Date().toISOString(),
            missing_document_fingerprint_email_provider: gmailDelivery.provider,
        })
        return { sent: true, queued: false, provider: gmailDelivery.provider }
    }

    const gmailError = gmailDelivery.error || 'Gmail sender is not configured'
    console.error('missing_document_fingerprint_retry_gmail_failed', {
        provider: gmailDelivery.provider,
        message: gmailError,
    })

    const { error: queueError } = await client.from('email_notifications').insert({
        recipient_email: recipientEmail,
        recipient_name: displayName || 'User',
        subject,
        html_content: html,
        template_type: 'identity_verification_retry_required',
        status: 'pending',
        created_at: new Date().toISOString(),
    })

    if (queueError) {
        console.error('missing_document_fingerprint_retry_queue_failed', { message: queueError.message })
        await mergeVerificationSessionData(client, String(diditSessionId || ''), {
            missing_document_fingerprint_email_error: `${gmailError}; ${queueError.message}`,
        })
        return { sent: false, queued: false, provider: 'email_notifications', error: `${gmailError}; ${queueError.message}` }
    }

    await mergeVerificationSessionData(client, String(diditSessionId || ''), {
        missing_document_fingerprint_email_queued_at: new Date().toISOString(),
        missing_document_fingerprint_email_provider: 'email_notifications',
    })
    return { sent: false, queued: true, provider: 'email_notifications', error: `${gmailError}; queued in email_notifications` }
}

function getConfirmationRedirect(rawRedirectTo: unknown) {
    const redirectTo = String(rawRedirectTo || '').trim()
    const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '')
    const redirectPageUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/login-redirect` : 'musikalokal://?verified=true'
    return redirectTo || Deno.env.get('EMAIL_CONFIRM_REDIRECT_TO') || redirectPageUrl
}

function normalizeVerificationStatus(value: unknown) {
    return String(value || '').trim().replace(/[\s-]+/g, '_').toUpperCase()
}

function normalizeDiditSignupStatus(value: unknown) {
    const normalized = normalizeVerificationStatus(value)
    if (['DECLINED', 'REJECTED', 'DENIED', 'FAILED', 'FAILURE', 'NOT_APPROVED', 'NOT_VERIFIED'].includes(normalized)) return 'DECLINED'
    if (['ABANDONED', 'EXPIRED', 'CANCELLED', 'CANCELED'].includes(normalized)) return 'ABANDONED'
    if ([
        'PENDING_REVIEW',
        'PENDING_REVIEW_REQUIRED',
        'IN_REVIEW',
        'REVIEW',
        'MANUAL_REVIEW',
        'PENDING_MANUAL_REVIEW',
    ].includes(normalized)) return 'PENDING_REVIEW'
    if (normalized === 'APPROVED') return 'APPROVED'
    if (['NOT_STARTED', 'IN_PROGRESS', 'PENDING', 'PROCESSING', 'SUBMITTED', 'CREATED', 'STARTED'].includes(normalized)) return 'PENDING'
    return normalized
}

function findDecisionObject(source: any) {
    const candidates = [
        source?.decision,
        source?.result,
        source?.session,
        source?.verification_data?.decision,
        source?.verification_data?.result,
        source?.verification_data?.session,
        source?.verification_data,
        source?.extracted_data?.decision,
        source?.extracted_data?.result,
        source?.extracted_data,
        source?.details?.decision,
        source?.details?.result,
        source?.details,
        source,
    ]

    return candidates.find((candidate) => (
        candidate &&
        typeof candidate === 'object' &&
        (Array.isArray(candidate.id_verifications) || Array.isArray(candidate.face_matches))
    )) || null
}

function collectDiditStatusValues(values: any[], seen = new Set<any>()) {
    const statuses: string[] = []

    for (const value of values) {
        if (typeof value === 'string' || typeof value === 'number') {
            const normalized = String(value).trim()
            if (normalized) statuses.push(normalized)
            continue
        }

        if (value && typeof value === 'object') {
            if (seen.has(value)) continue
            seen.add(value)
            statuses.push(...collectDiditStatusValues([
                value.status,
                value.verification_status,
                value.businessStatus,
                value.diditResolvedStatus,
                value.rawDiditStatus,
                value.result,
                value.outcome,
                value.state,
                value.verdict,
                value.decision,
            ], seen))
        }
    }

    return statuses
}

function resolveDiditStatusValue(values: any[]) {
    const statuses = collectDiditStatusValues(values).map(normalizeDiditSignupStatus).filter(Boolean)
    return statuses.find((status) => ['DECLINED', 'ABANDONED'].includes(status))
        || statuses.find((status) => status === 'PENDING_REVIEW')
        || statuses.find((status) => status === 'APPROVED')
        || statuses[0]
        || ''
}

function resolveSourceVerificationStatus(source: any) {
    if (!source) return ''
    if (typeof source === 'string' || typeof source === 'number') return normalizeDiditSignupStatus(source)
    if (typeof source !== 'object') return ''

    return resolveDiditStatusValue([
        source.status || source.verification_status || source.verification_data?.status,
        source.session?.status,
        source.session,
        source.result?.status,
        source.result,
        source.decision,
    ])
}

function shouldReviewMissingFaceMatch(sourceStatus: unknown) {
    const normalized = normalizeDiditSignupStatus(sourceStatus)
    return normalized === 'PENDING_REVIEW'
}

function resolveDiditFaceRequiredStatus(source: any) {
    const decision = findDecisionObject(source)
    if (!decision) return resolveSourceVerificationStatus(source)

    const sourceStatus = resolveSourceVerificationStatus(source)
    const idVerification = decision.id_verifications?.[0]
    const faceMatch = decision.face_matches?.[0]
    const idStatus = normalizeDiditSignupStatus(idVerification?.status)
    const faceStatus = normalizeDiditSignupStatus(faceMatch?.status)

    if (isFailedDiditSignupStatus(idStatus)) return idStatus
    if (isFailedDiditSignupStatus(faceStatus)) return faceStatus
    if (idStatus === 'APPROVED' && !faceMatch) {
        return 'PENDING'
    }
    if (idStatus === 'PENDING_REVIEW' || faceStatus === 'PENDING_REVIEW') return 'PENDING_REVIEW'
    if (idStatus === 'APPROVED' && faceStatus === 'APPROVED') return 'APPROVED'

    return sourceStatus || resolveDiditStatusValue([
        decision.status,
        decision.verification_status,
        decision.result,
        decision.outcome,
        decision.state,
        decision.verdict,
        decision.decision,
    ])
}

function isFailedDiditSignupStatus(value: unknown) {
    return ['DECLINED', 'ABANDONED'].includes(normalizeDiditSignupStatus(value))
}

function resolveDiditSignupStatus(...values: unknown[]) {
    const statuses = values.map(normalizeDiditSignupStatus).filter(Boolean)
    return statuses.find(isFailedDiditSignupStatus)
        || statuses.find((status) => status === 'PENDING_REVIEW' || status === 'IN_REVIEW' || status === 'PENDING_REVIEW_REQUIRED')
        || statuses.find((status) => status === 'APPROVED')
        || statuses[0]
        || ''
}

async function fetchLiveDiditFaceRequiredStatus(diditSessionId: string) {
    const diditApiKey = Deno.env.get('DIDIT_API_KEY') || ''
    if (!diditApiKey || !diditSessionId) return ''

    const statuses: string[] = []
    let hasApprovedRequiredChecks = false

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
            const decision = findDecisionObject(payload)
            const idStatus = normalizeDiditSignupStatus(decision?.id_verifications?.[0]?.status)
            const faceStatus = normalizeDiditSignupStatus(decision?.face_matches?.[0]?.status)
            if (idStatus === 'APPROVED' && faceStatus === 'APPROVED') {
                hasApprovedRequiredChecks = true
            }
            if (status) {
                statuses.push(status)
                if (isFailedDiditSignupStatus(status) && !hasApprovedRequiredChecks) break
            }
        } catch (error) {
            console.error('live_didit_face_status_lookup_failed', {
                diditSessionId,
                message: error instanceof Error ? error.message : String(error),
            })
        }
    }

    const resolvedStatus = resolveDiditSignupStatus(...statuses)
    if (hasApprovedRequiredChecks && isFailedDiditSignupStatus(resolvedStatus)) {
        return statuses.find((status) => status === 'PENDING_REVIEW') || 'APPROVED'
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
            const resendUrl = new URL(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/resend`)
            resendUrl.searchParams.set('redirect_to', redirectTo)

            const response = await fetch(resendUrl.toString(), {
                method: 'POST',
                headers: {
                    apikey: supabaseAnonKey,
                    Authorization: `Bearer ${supabaseAnonKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    type: 'signup',
                    email,
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
            musicVideoUploadId: musicVideoUploadIdInput,
            music_video_upload_id: musicVideoUploadIdSnake,
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

        const passwordValidationError = getPasswordValidationError(password)
        if (passwordValidationError) {
            return new Response(JSON.stringify({ error: passwordValidationError }), {
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
        const musicianVideoUploadId = String(musicVideoUploadIdInput || musicVideoUploadIdSnake || '').trim()
        const requiresMusicianVideoReview = normalizedRole === 'musician'
        if (requiresMusicianVideoReview && !musicianVideoUploadId) {
            return new Response(JSON.stringify({ error: 'Music video proof is required for musician signup.' }), {
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
                    musician_video_review_required: requiresMusicianVideoReview,
                    musician_video_upload_id: requiresMusicianVideoReview ? musicianVideoUploadId : null,
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
        const localDiditStatus = normalizeDiditSignupStatus(sessionData?.status)
        const liveFaceRequiredStatus = await fetchLiveDiditFaceRequiredStatus(diditSessionId)
        const localFaceRequiredStatus = resolveDiditFaceRequiredStatus(sessionData?.verification_data)
        resolvedDiditStatus = resolveDiditSignupStatus(liveFaceRequiredStatus, localFaceRequiredStatus, localDiditStatus)

        if (resolvedDiditStatus === 'APPROVED' && !liveFaceRequiredStatus && !localFaceRequiredStatus) {
            resolvedDiditStatus = 'PENDING_REVIEW'
        }

        if (resolvedDiditStatus && resolvedDiditStatus !== localDiditStatus && (isFailedDiditSignupStatus(resolvedDiditStatus) || localDiditStatus === 'APPROVED')) {
            await supabaseAdmin
                .from('verification_sessions')
                .update({
                    status: resolvedDiditStatus,
                })
                .eq('session_ref', diditSessionId)
        }

        let approvedByDidit = resolvedDiditStatus === 'APPROVED'
        let pendingByDidit = ['PENDING_REVIEW', 'IN_REVIEW', 'PENDING REVIEW'].includes(resolvedDiditStatus)

        if (!approvedByDidit && !pendingByDidit) {
            return new Response(JSON.stringify({ error: 'Didit verification is not approved or pending review yet. Please try again.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        diditVerificationData = sessionData?.verification_data || null
        const identityNameBirthDate = (approvedByDidit || pendingByDidit)
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

        const missingDuplicateIdentityKeyReviewRequired = Boolean((approvedByDidit || pendingByDidit) && !documentFingerprint && !identityNameBirthDate.hasNameBirthDate)
        if (missingDuplicateIdentityKeyReviewRequired) {
            resolvedDiditStatus = 'PENDING_REVIEW'
            approvedByDidit = false
            pendingByDidit = true
            diditVerificationData = {
                ...(sessionData?.verification_data && typeof sessionData.verification_data === 'object' ? sessionData.verification_data : {}),
                ...(diditVerificationData && typeof diditVerificationData === 'object' ? stripPrivateSessionFields(diditVerificationData) : {}),
                document_country: diditVerificationData?.document_country || 'PHL',
                document_type: selectedDocumentType,
                document_type_key: selectedDocumentTypeKey,
                source_session_status: localDiditStatus || liveFaceRequiredStatus || 'APPROVED',
                missing_document_fingerprint: !documentFingerprint,
                missing_name_birthdate_duplicate_key: !identityNameBirthDate.hasNameBirthDate,
                review_required: true,
                review_reason: 'MISSING_IDENTITY_DUPLICATE_KEY',
                matched_on: null,
            }

            await supabaseAdmin
                .from('verification_sessions')
                .update({
                    status: 'PENDING_REVIEW',
                    verification_data: diditVerificationData,
                })
                .eq('session_ref', diditSessionId)
        }

        if (documentFingerprint) {
            const revokedOrphanClaimCount = await revokeOrphanSameRoleIdentityClaims(supabaseAdmin, {
                documentFingerprint,
                role: normalizedRole,
            })
            if (revokedOrphanClaimCount > 0) {
                console.warn('identity_orphan_same_role_claims_revoked', {
                    role: normalizedRole,
                    count: revokedOrphanClaimCount,
                })
            }

        }

        if (documentFingerprint || identityNameBirthDate.hasNameBirthDate) {
            duplicateIdentityReview = await findSameRoleIdentityDuplicate(supabaseAdmin, {
                documentFingerprint,
                role: normalizedRole,
                email: normalizedEmail,
                normalizedFullLegalName: identityNameBirthDate.normalizedFullLegalName,
                birthDate: identityNameBirthDate.birthDate,
            })
        }

        const diditDuplicateFlag = Boolean(diditVerificationData?.duplicate_identity_review_required)
        const sameRoleDuplicateDetected = Boolean(duplicateIdentityReview?.hasDuplicate)
        const diditDuplicateFlagRequiresReview = diditDuplicateFlag && sameRoleDuplicateDetected
        const requiresDuplicateIdentityReview = Boolean(
            sameRoleDuplicateDetected ||
            diditDuplicateFlagRequiresReview ||
            missingDuplicateIdentityKeyReviewRequired
        )
        const effectiveVerificationStatus = requiresMusicianVideoReview
            ? 'PENDING_REVIEW'
            : approvedByDidit && !requiresDuplicateIdentityReview
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
            // Clear FK blockers first, then delete them to allow a fresh start.
            try {
                await cleanupStaleSignupUserRelations(supabaseAdmin, existingUser.id)
            } catch (cleanupError) {
                console.error('Failed to clean stale unverified user relations:', cleanupError)
                return new Response(JSON.stringify({ error: 'Failed to reset existing account. Please contact support.' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

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
            const duplicateReason = missingDuplicateIdentityKeyReviewRequired
                ? 'MISSING_IDENTITY_DUPLICATE_KEY'
                : getDuplicateIdentityReviewReason(normalizedRole)
            const reviewSource = missingDuplicateIdentityKeyReviewRequired ? DIDIT_PENDING_SOURCE : DUPLICATE_REVIEW_SOURCE
            const matchedOn = missingDuplicateIdentityKeyReviewRequired
                ? ''
                : duplicateIdentityReview?.matches?.[0]?.matched_on || diditVerificationData?.matched_on || (identityNameBirthDate.hasNameBirthDate ? 'NAME_BIRTHDATE' : 'DOCUMENT_FINGERPRINT')
            const duplicateMatchCount = missingDuplicateIdentityKeyReviewRequired
                ? 0
                : duplicateIdentityReview?.matches?.length || diditVerificationData?.duplicate_match_count || 1
            identityReviewRecord = await queueIdentityReview(supabaseAdmin, {
                userId,
                email: normalizedEmail,
                role: normalizedRole,
                documentType: selectedDocumentType,
                documentTypeKey: selectedDocumentTypeKey,
                documentCountry: diditVerificationData?.document_country || 'PHL',
                source: reviewSource,
                diditSessionId,
                documentFingerprint,
                duplicateReason,
                duplicateMatchCount,
                verifiedFullLegalName: identityNameBirthDate.fullLegalName,
                normalizedFullLegalName: identityNameBirthDate.normalizedFullLegalName,
                birthDate: identityNameBirthDate.birthDate,
                reviewReason: duplicateReason,
                matchedOn,
                metadata: {
                    didit_duplicate_flag: diditDuplicateFlag,
                    source_session_status: resolvedDiditStatus,
                    matched_on: matchedOn,
                    missing_document_fingerprint: !documentFingerprint,
                    missing_name_birthdate_duplicate_key: missingDuplicateIdentityKeyReviewRequired,
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
                source: reviewSource,
                status: 'PENDING_REVIEW',
                diditSessionId,
                manualReviewId: identityReviewRecord?.id || null,
                email: normalizedEmail,
                verifiedFullLegalName: identityNameBirthDate.fullLegalName,
                normalizedFullLegalName: identityNameBirthDate.normalizedFullLegalName,
                birthDate: identityNameBirthDate.birthDate,
                reviewReason: duplicateReason,
                matchedOn,
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
                const missingIdentityKeyReason = duplicateReason === 'MISSING_DOCUMENT_FINGERPRINT' || duplicateReason === 'MISSING_IDENTITY_DUPLICATE_KEY'
                const matchedOn = getApprovalClaimMatchedOn(
                    approvalClaim,
                    missingIdentityKeyReason ? '' : 'NAME_BIRTHDATE',
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
                    duplicateMatchCount: getApprovalClaimMatchCount(approvalClaim, missingIdentityKeyReason ? 0 : 1),
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

        let musicianVideoProof: any = null
        if (requiresMusicianVideoReview) {
            musicianVideoProof = await consumeMusicianVideoUpload(supabaseAdmin, musicianVideoUploadId, {
                userId,
                manualReviewId: identityReviewRecord?.id || null,
            })

            if (identityReviewRecord?.id) {
                const { data: existingReview } = await supabaseAdmin
                    .from('manual_identity_reviews')
                    .select('metadata')
                    .eq('id', identityReviewRecord.id)
                    .maybeSingle()
                const existingReviewMetadata = existingReview?.metadata && typeof existingReview.metadata === 'object'
                    ? existingReview.metadata
                    : {}
                const { error: videoReviewUpdateError } = await supabaseAdmin
                    .from('manual_identity_reviews')
                    .update({
                        ...musicianVideoProof.reviewColumns,
                        metadata: {
                            ...existingReviewMetadata,
                            musician_video_review_required: true,
                            musician_video_upload_id: musicianVideoProof.uploadId,
                        },
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', identityReviewRecord.id)
                if (videoReviewUpdateError) {
                    throw new Error(`Unable to attach music video proof to review: ${videoReviewUpdateError.message}`)
                }
            } else {
                identityReviewRecord = await queueIdentityReview(supabaseAdmin, {
                    userId,
                    email: normalizedEmail,
                    role: normalizedRole,
                    documentType: selectedDocumentType || 'Musician video proof',
                    documentTypeKey: selectedDocumentTypeKey,
                    documentCountry: diditVerificationData?.document_country || 'PHL',
                    source: MUSICIAN_VIDEO_REVIEW_SOURCE,
                    diditSessionId,
                    documentFingerprint,
                    verifiedFullLegalName: identityNameBirthDate.fullLegalName,
                    normalizedFullLegalName: identityNameBirthDate.normalizedFullLegalName,
                    birthDate: identityNameBirthDate.birthDate,
                    musicVideoPath: musicianVideoProof.objectPath,
                    musicVideoOriginalName: musicianVideoProof.originalName,
                    musicVideoMimeType: musicianVideoProof.mimeType,
                    musicVideoSizeBytes: musicianVideoProof.sizeBytes,
                    musicVideoUploadedAt: musicianVideoProof.uploadedAt,
                    metadata: {
                        musician_video_review_required: true,
                        musician_video_upload_id: musicianVideoProof.uploadId,
                        source_session_status: resolvedDiditStatus,
                    },
                })

                if (identityReviewRecord?.id) {
                    const { error: videoUploadLinkError } = await supabaseAdmin
                        .from('musician_verification_uploads')
                        .update({ manual_review_id: identityReviewRecord.id, updated_at: new Date().toISOString() })
                        .eq('id', musicianVideoProof.uploadId)
                    if (videoUploadLinkError) {
                        throw new Error(`Unable to link music video proof to review: ${videoUploadLinkError.message}`)
                    }
                }
            }

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
                    musician_video_review_required: true,
                    musician_video_upload_id: musicianVideoProof.uploadId,
                },
            })
            if (demotedUser?.user) {
                authUserForResponse = demotedUser.user
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
                musician_video_review_required: requiresMusicianVideoReview,
                musician_video_upload_id: musicianVideoProof?.uploadId || null,
            },
        })

        return new Response(JSON.stringify({
            user: authUserForResponse,
            emailConfirmationRequired,
            emailConfirmationDeferred: !emailConfirmationRequired,
            duplicateIdentityReview: finalDuplicateIdentityReview,
            identityReviewId: identityReviewRecord?.id || null,
            musicianVideoReviewRequired: requiresMusicianVideoReview,
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
