const IDENTITY_BUCKET = 'identity-manual'
const IDENTITY_URL_TTL_SECONDS = 10 * 60

export type IdentityDocumentReference = {
    url: string | null
    source: 'manual_upload' | 'didit' | 'unavailable'
    document_type: string | null
    limitation: string
}

const firstNonEmptyString = (...values: unknown[]) => values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => typeof value === 'string' ? value.trim() : '')
    .find(Boolean) || ''

const firstObject = (...values: unknown[]) => values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .find((value) => value && typeof value === 'object') as any || null

function findDecisionPayload(source: any) {
    const candidates = [source?.decision, source?.verification_data?.decision, source?.details?.decision, source]
    return candidates.find((candidate) => candidate && typeof candidate === 'object' && (
        Array.isArray(candidate.id_verifications) || candidate.id_verification || candidate.idVerification
    )) || source
}

export function extractDiditDocumentFrontImageUrl(payload: any) {
    const decision = findDecisionPayload(payload)
    const verification = firstObject(decision?.id_verifications, decision?.id_verification, decision?.idVerification)
    return firstNonEmptyString(
        decision?.full_front_image, decision?.full_front_image_url, decision?.front_image, decision?.front_image_url,
        decision?.document_front_image, decision?.document_front_image_url,
        decision?.raw_data?.full_front_image, decision?.raw_data?.full_front_image_url,
        decision?.raw_data?.front_image, decision?.raw_data?.front_image_url,
        decision?.verification_data?.raw_data?.full_front_image,
        decision?.verification_data?.raw_data?.full_front_image_url,
        decision?.verification_data?.raw_data?.front_image,
        decision?.verification_data?.raw_data?.front_image_url,
        verification?.full_front_image, verification?.full_front_image_url,
        verification?.front_image, verification?.front_image_url,
        verification?.document_front_image, verification?.document_front_image_url,
        verification?.images?.front, verification?.images?.front_image, verification?.document?.front_image,
    ) || null
}

function safeProviderUrl(value: unknown) {
    try {
        const url = new URL(String(value || ''))
        if (url.protocol !== 'https:') return null
        url.hash = ''
        return url.toString()
    } catch {
        return null
    }
}

async function fetchDiditDocumentReference(sessionId: string): Promise<IdentityDocumentReference> {
    const apiKey = String(Deno.env.get('DIDIT_API_KEY') || '').trim()
    if (!apiKey) return { url: null, source: 'unavailable', document_type: null, limitation: 'The approved identity provider image is unavailable because Didit is not configured.' }
    try {
        const response = await fetch(`https://verification.didit.me/v3/session/${encodeURIComponent(sessionId)}/decision/`, { headers: { 'x-api-key': apiKey } })
        if (!response.ok) return { url: null, source: 'unavailable', document_type: null, limitation: 'The approved identity provider image could not be retrieved.' }
        const payload = await response.json()
        const url = safeProviderUrl(extractDiditDocumentFrontImageUrl(payload))
        const decision = findDecisionPayload(payload)
        const verification = firstObject(decision?.id_verifications, decision?.id_verification, decision?.idVerification)
        return {
            url,
            source: url ? 'didit' : 'unavailable',
            document_type: firstNonEmptyString(verification?.document_type, verification?.documentType, verification?.type) || null,
            limitation: url ? '' : 'Didit did not return an approved front-of-ID image.',
        }
    } catch {
        return { url: null, source: 'unavailable', document_type: null, limitation: 'The approved identity provider image could not be retrieved.' }
    }
}

export async function resolveApprovedIdentityDocumentReference(client: any, profile: any): Promise<IdentityDocumentReference> {
    if (!profile?.id || profile?.is_verified !== true || String(profile?.verification_status || '').toUpperCase() !== 'APPROVED') {
        return { url: null, source: 'unavailable', document_type: null, limitation: 'No approved identity verification is available for this applicant.' }
    }
    const { data: manualReview, error: manualReviewError } = await client
        .from('manual_identity_reviews')
        .select('front_image_path, document_type')
        .eq('user_id', profile.id)
        .eq('status', 'APPROVED')
        .not('front_image_path', 'is', null)
        .order('reviewed_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()
    if (!manualReviewError && manualReview?.front_image_path) {
        const { data: signed, error: signedError } = await client.storage.from(IDENTITY_BUCKET).createSignedUrl(String(manualReview.front_image_path), IDENTITY_URL_TTL_SECONDS)
        const url = signedError ? null : safeProviderUrl(signed?.signedUrl)
        if (url) return { url, source: 'manual_upload', document_type: firstNonEmptyString(manualReview.document_type) || null, limitation: '' }
    }
    const { data: identityClaim } = await client
        .from('identity_document_claims')
        .select('didit_session_id, document_type')
        .eq('user_id', profile.id)
        .eq('status', 'APPROVED')
        .not('didit_session_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    const diditSessionId = String(identityClaim?.didit_session_id || profile?.didit_session_id || '').trim()
    if (diditSessionId) {
        const reference = await fetchDiditDocumentReference(diditSessionId)
        return {
            ...reference,
            document_type: reference.document_type || firstNonEmptyString(identityClaim?.document_type) || null,
        }
    }
    return {
        url: null,
        source: 'unavailable',
        document_type: null,
        limitation: manualReviewError ? 'The approved ID image could not be loaded.' : 'No retained approved front-of-ID image is available for this applicant.',
    }
}
