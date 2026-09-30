import {
    DeleteFacesCommand,
    DetectFacesCommand,
    GetFaceSearchCommand,
    IndexFacesCommand,
    RekognitionClient,
    StartFaceSearchCommand,
} from 'npm:@aws-sdk/client-rekognition@3'
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from 'npm:@aws-sdk/client-s3@3'
import {
    aggregateMemberFaceSearch,
    buildFaceSearchClientRequestToken,
    externalImageIdForMember,
    hashReferenceImage,
    inspectRekognitionVideo,
} from './gigMemberVerification.ts'
import {
    scheduleConnectionMemberVerificationWorker,
    scheduleGigMemberVerificationWorker,
} from './gigReviewWorkerDispatch.ts'

type VerificationTarget = 'gig' | 'connection'

const PORTRAIT_PREVIEW_BUCKET = 'member-verification-portraits'
const PORTRAIT_PREVIEW_TTL_SECONDS = 15 * 60

type VerificationConfig = {
    region: string
    collectionId: string
    bucket: string
    threshold?: number
    ambiguityDelta: number
    maxVideoBytes: number
    pollAttempts: number
    allowedMediaHosts: Set<string>
    diditApiKey: string
}

type RosterMember = {
    member_id: string
    reference_source: 'didit_portrait' | 'manual_id_front' | 'unavailable'
    reference_locator: string
    consented_at: string
}

const waitFor = (delayMs: number) => new Promise((resolve) => setTimeout(resolve, delayMs))
const clean = (value: unknown) => String(value || '').trim()

function readNumber(name: string, fallback: number) {
    const raw = clean(Deno.env.get(name))
    const parsed = Number(raw)
    return raw && Number.isFinite(parsed) ? parsed : fallback
}

function getConfig(): VerificationConfig {
    const region = clean(Deno.env.get('AWS_REGION'))
    const collectionId = clean(Deno.env.get('AWS_REKOGNITION_COLLECTION_ID'))
    const bucket = clean(Deno.env.get('AWS_REKOGNITION_VIDEO_BUCKET'))
    if (!region || !collectionId || !bucket) {
        throw new Error('member_verification_configuration_missing')
    }
    const thresholdValue = clean(Deno.env.get('AWS_FACE_MATCH_THRESHOLD'))
    const threshold = thresholdValue ? Number(thresholdValue) : undefined
    if (thresholdValue && (!Number.isFinite(threshold) || Number(threshold) < 0 || Number(threshold) > 100)) {
        throw new Error('member_verification_threshold_invalid')
    }
    const allowedMediaHosts = new Set(
        clean(Deno.env.get('MEMBER_VERIFICATION_ALLOWED_MEDIA_HOSTS'))
            .split(',')
            .map((host) => host.trim().toLowerCase())
            .filter(Boolean),
    )
    const supabaseUrl = clean(Deno.env.get('SUPABASE_URL'))
    if (supabaseUrl) allowedMediaHosts.add(new URL(supabaseUrl).hostname.toLowerCase())
    if (allowedMediaHosts.size === 0) throw new Error('member_verification_allowed_media_hosts_missing')
    return {
        region,
        collectionId,
        bucket,
        threshold,
        ambiguityDelta: Math.max(0, readNumber('AWS_FACE_MATCH_AMBIGUITY_DELTA', 1)),
        maxVideoBytes: Math.max(1, readNumber('AWS_REKOGNITION_MAX_VIDEO_BYTES', 250 * 1024 * 1024)),
        pollAttempts: Math.max(1, Math.min(8, Math.trunc(readNumber('AWS_REKOGNITION_POLL_ATTEMPTS', 5)))),
        allowedMediaHosts,
        diditApiKey: clean(Deno.env.get('DIDIT_API_KEY')),
    }
}

function awsCredentials() {
    const accessKeyId = clean(Deno.env.get('AWS_ACCESS_KEY_ID'))
    const secretAccessKey = clean(Deno.env.get('AWS_SECRET_ACCESS_KEY'))
    const sessionToken = clean(Deno.env.get('AWS_SESSION_TOKEN'))
    if (!accessKeyId || !secretAccessKey) throw new Error('member_verification_credentials_missing')
    return { accessKeyId, secretAccessKey, ...(sessionToken ? { sessionToken } : {}) }
}

function createAwsClients(config: VerificationConfig) {
    const credentials = awsCredentials()
    return {
        rekognition: new RekognitionClient({ region: config.region, credentials, maxAttempts: 4 }),
        s3: new S3Client({ region: config.region, credentials, maxAttempts: 4 }),
    }
}

function safeErrorCode(error: unknown) {
    const name = clean((error as any)?.name).toLowerCase()
    const message = clean((error as any)?.message).toLowerCase()
    if (name.includes('throttl') || message.includes('throttl')) return 'aws_throttled'
    if (name.includes('accessdenied') || message.includes('access denied')) return 'aws_access_denied'
    if (message.includes('configuration')) return 'configuration_missing'
    if (message.includes('credential')) return 'credentials_missing'
    if (message.includes('unsupported_')) return message.includes('codec') ? 'unsupported_video_codec' : 'unsupported_video_container'
    if (name.includes('invalidparameter')) return 'aws_invalid_input'
    return 'verification_unavailable'
}

async function fetchBytes(
    url: string,
    maxBytes: number,
    expected: 'image' | 'video',
    allowedMediaHosts: Set<string>,
) {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') throw new Error(`${expected}_url_unsupported`)
    if (!allowedMediaHosts.has(parsed.hostname.toLowerCase())) throw new Error(`${expected}_host_not_allowed`)
    const response = await fetch(parsed.toString(), {
        redirect: 'manual',
        signal: AbortSignal.timeout(90_000),
    })
    if (!response.ok) throw new Error(`${expected}_download_failed`)
    const contentLength = Number(response.headers.get('content-length') || 0)
    if (contentLength > maxBytes) throw new Error(`${expected}_too_large`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length === 0 || bytes.length > maxBytes) throw new Error(`${expected}_too_large`)
    return { bytes, contentType: clean(response.headers.get('content-type')).toLowerCase() }
}

function isJpegOrPng(bytes: Uint8Array) {
    const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    const png = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    return jpeg || png
}

async function attachIdentityDocumentReferences(
    client: any,
    members: Array<{ member_id: string; consented_at: string }>,
): Promise<RosterMember[]> {
    const memberIds = members.map((member) => clean(member.member_id)).filter(Boolean)
    if (memberIds.length === 0) return []
    const [{ data: profiles, error: profileError }, { data: manualReviews, error: manualError }] = await Promise.all([
        client.from('profiles')
            .select('id, is_verified, verification_status, didit_session_id')
            .in('id', memberIds),
        client.from('manual_identity_reviews')
            .select('user_id, front_image_path, status, updated_at')
            .in('user_id', memberIds)
            .eq('status', 'APPROVED')
            .order('updated_at', { ascending: false }),
    ])
    if (profileError) throw profileError
    if (manualError) throw manualError
    const profileById = new Map<string, any>((profiles || []).map((profile: any) => [clean(profile.id), profile]))
    const manualPathByUserId = new Map<string, string>()
    for (const review of manualReviews || []) {
        const userId = clean(review?.user_id)
        if (userId && !manualPathByUserId.has(userId) && clean(review?.front_image_path)) {
            manualPathByUserId.set(userId, clean(review.front_image_path))
        }
    }
    return members.map((member): RosterMember => {
        const memberId = clean(member.member_id)
        const profile = profileById.get(memberId)
        const verificationStatus = clean(profile?.verification_status).toLowerCase()
        const identityApproved = profile?.is_verified === true && ['approved', 'verified'].includes(verificationStatus)
        const diditSessionId = identityApproved ? clean(profile?.didit_session_id) : ''
        const manualPath = identityApproved ? clean(manualPathByUserId.get(memberId)) : ''
        return {
            member_id: memberId,
            reference_source: diditSessionId ? 'didit_portrait' : manualPath ? 'manual_id_front' : 'unavailable',
            reference_locator: diditSessionId || manualPath,
            consented_at: clean(member.consented_at),
        }
    }).filter((member) => Boolean(member.member_id))
}

async function loadRoster(client: any, application: any): Promise<RosterMember[]> {
    if (application.group_id) {
        const { data: members, error: memberError } = await client
            .from('gig_application_members')
            .select('user_id, member_verification_consent, member_verification_consented_at')
            .eq('application_id', application.id)
            .order('created_at', { ascending: true })
        if (memberError) throw memberError
        const memberIds = (members || []).map((member: any) => clean(member.user_id)).filter(Boolean)
        if (memberIds.length === 0) return []
        return attachIdentityDocumentReferences(client, (members || []).map((member: any) => ({
            member_id: clean(member.user_id),
            consented_at: member.member_verification_consent === true
                ? clean(member.member_verification_consented_at)
                : '',
        })))
    }

    let memberId = clean(application.applicant_id)
    if (application.production_roster_id) {
        const { data: roster, error: rosterError } = await client
            .from('production_team_roster')
            .select('profile_id')
            .eq('id', application.production_roster_id)
            .maybeSingle()
        if (rosterError) throw rosterError
        memberId = clean(roster?.profile_id) || memberId
    }
    if (!memberId) return []
    return attachIdentityDocumentReferences(client, [{
        member_id: memberId,
        consented_at: application.member_verification_consent === true
            ? clean(application.member_verification_consented_at)
            : '',
    }])
}

async function loadApplicationAndRoster(
    client: any,
    applicationId: string,
    target: VerificationTarget = 'gig',
): Promise<{ application: any; roster: RosterMember[] }> {
    if (target === 'connection') {
        const { data: request, error } = await client
            .from('booking_requests')
            .select('id, sender_id, group_id, event_details, member_verification_consent, member_verification_consented_at, created_at')
            .eq('id', applicationId)
            .maybeSingle()
        if (error) throw error
        if (!request) throw new Error('application_not_found')
        const details = request.event_details?.request_details && typeof request.event_details.request_details === 'object'
            ? request.event_details.request_details
            : {}
        const application = {
            id: request.id,
            applicant_id: request.sender_id,
            submitted_by_user_id: request.sender_id,
            group_id: null,
            production_roster_id: null,
            video_url: clean(details.video_url),
            member_verification_consent: request.member_verification_consent === true,
            member_verification_consented_at: request.member_verification_consented_at,
            updated_at: request.created_at,
        }
        const { data: snapshotMembers, error: snapshotError } = await client
            .from('connection_application_members')
            .select('user_id, member_verification_consent, member_verification_consented_at')
            .eq('booking_request_id', applicationId)
            .order('created_at', { ascending: true })
        if (snapshotError) throw snapshotError
        if ((snapshotMembers || []).length > 0) {
            const memberIds = (snapshotMembers || []).map((member: any) => clean(member.user_id)).filter(Boolean)
            return {
                application,
                roster: await attachIdentityDocumentReferences(client, (snapshotMembers || []).map((member: any) => ({
                    member_id: clean(member.user_id),
                    consented_at: member.member_verification_consent === true
                        ? clean(member.member_verification_consented_at)
                        : '',
                }))),
            }
        }
        return { application, roster: await loadRoster(client, application) }
    }
    const { data: application, error } = await client
        .from('gig_applications')
        .select('id, applicant_id, submitted_by_user_id, group_id, production_roster_id, video_url, member_verification_consent, member_verification_consented_at, updated_at')
        .eq('id', applicationId)
        .maybeSingle()
    if (error) throw error
    if (!application) throw new Error('application_not_found')
    return { application, roster: await loadRoster(client, application) }
}

async function queueMemberVerification(
    client: any,
    applicationId: string,
    target: VerificationTarget,
) {
    const { application, roster } = await loadApplicationAndRoster(client, applicationId, target)
    const targetColumn = target === 'connection' ? 'booking_request_id' : 'application_id'
    const allConsented = application.member_verification_consent === true &&
        Boolean(application.member_verification_consented_at) &&
        roster.length > 0 && roster.every((member) => Boolean(member.consented_at))
    const now = new Date().toISOString()
    const { data: existing, error: existingError } = await client
        .from('gig_application_member_verifications')
        .select('id, status, aws_job_id, client_request_token, reference_source')
        .eq(targetColumn, applicationId)
        .maybeSingle()
    if (existingError) throw existingError
    if (existing && ['queued', 'processing', 'completed'].includes(clean(existing.status))) return existing

    const payload = {
        application_id: target === 'gig' ? applicationId : null,
        booking_request_id: target === 'connection' ? applicationId : null,
        reference_source: 'verified_id_portrait',
        status: allConsented ? 'queued' : 'not_requested',
        result: !allConsented ? null : !clean(application.video_url) ? 'no_video' : null,
        expected_member_count: roster.length,
        verified_member_count: 0,
        roster_snapshot: roster.map((member) => ({ member_id: member.member_id })),
        consented_at: allConsented ? application.member_verification_consented_at : null,
        queued_at: allConsented ? now : null,
        started_at: null,
        completed_at: !allConsented ? now : !clean(application.video_url) ? now : null,
        error_code: null,
        error_message: null,
        updated_at: now,
    }
    if (allConsented && !clean(application.video_url)) payload.status = 'completed'
    const { data, error: upsertError } = await client
        .from('gig_application_member_verifications')
        .upsert(payload, { onConflict: targetColumn })
        .select('id, status, result')
        .single()
    if (upsertError) throw upsertError
    return data
}

export async function queueGigMemberVerification(client: any, applicationId: string) {
    return queueMemberVerification(client, applicationId, 'gig')
}

export async function queueConnectionMemberVerification(client: any, applicationId: string) {
    return queueMemberVerification(client, applicationId, 'connection')
}

function diditDecision(payload: any) {
    const candidates = [
        payload?.decision,
        payload?.verification_data?.decision,
        payload?.details?.decision,
        payload,
    ]
    return candidates.find((value) => value && typeof value === 'object' && (
        value.id_verification || value.idVerification || Array.isArray(value.id_verifications)
    )) || payload
}

function diditIdVerification(payload: any) {
    const decision = diditDecision(payload)
    const candidates = [
        decision?.id_verification,
        decision?.idVerification,
        decision?.id_verifications?.[0],
        payload?.verification_data?.id_verification,
        payload?.details?.id_verification,
    ]
    return candidates.find((value) => value && typeof value === 'object') || null
}

function isUnsafeTemporaryMediaHost(hostname: string) {
    const host = hostname.toLowerCase()
    return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' ||
        host === '::1' || host.endsWith('.local') || host.startsWith('10.') ||
        host.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
        host.startsWith('169.254.')
}

async function fetchDiditPortraitBytes(config: VerificationConfig, sessionId: string) {
    if (!config.diditApiKey || !sessionId) return null
    const response = await fetch(
        `https://verification.didit.me/v3/session/${encodeURIComponent(sessionId)}/decision/`,
        {
            headers: { 'Content-Type': 'application/json', 'x-api-key': config.diditApiKey },
            signal: AbortSignal.timeout(30_000),
        },
    )
    if (!response.ok) return null
    const payload = await response.json()
    const verification = diditIdVerification(payload)
    if (clean(verification?.status).toLowerCase() !== 'approved') return null
    const portraitUrl = clean(
        verification?.portrait_image ||
        verification?.portrait_image_url ||
        verification?.portraitImage ||
        verification?.portraitImageUrl,
    )
    if (!portraitUrl) return null
    const parsed = new URL(portraitUrl)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || isUnsafeTemporaryMediaHost(parsed.hostname)) {
        throw new Error('identity_portrait_url_unsupported')
    }
    return fetchBytes(portraitUrl, 15 * 1024 * 1024, 'image', new Set([parsed.hostname.toLowerCase()]))
}

async function loadIdentityDocumentImage(
    client: any,
    config: VerificationConfig,
    member: RosterMember,
) {
    if (member.reference_source === 'didit_portrait') {
        return fetchDiditPortraitBytes(config, member.reference_locator)
    }
    if (member.reference_source === 'manual_id_front' && member.reference_locator) {
        const { data, error } = await client.storage.from('identity-manual').download(member.reference_locator)
        if (error || !data) return null
        if (data.size === 0 || data.size > 15 * 1024 * 1024) throw new Error('identity_image_too_large')
        return {
            bytes: new Uint8Array(await data.arrayBuffer()),
            contentType: clean(data.type).toLowerCase(),
        }
    }
    return null
}

let imageMagickModulePromise: Promise<any> | null = null

async function getImageMagickModule() {
    if (!imageMagickModulePromise) {
        imageMagickModulePromise = (async () => {
            const module = await import('npm:@imagemagick/magick-wasm@0.0.43')
            const wasmUrl = new URL(import.meta.resolve('npm:@imagemagick/magick-wasm@0.0.43/magick.wasm'))
            await module.initializeImageMagick(await Deno.readFile(wasmUrl))
            return module
        })()
    }
    return imageMagickModulePromise
}

async function createFaceCroppedPortrait(bytes: Uint8Array, boundingBox: any) {
    const left = Number(boundingBox?.Left)
    const top = Number(boundingBox?.Top)
    const width = Number(boundingBox?.Width)
    const height = Number(boundingBox?.Height)
    if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
        throw new Error('identity_portrait_bounds_invalid')
    }
    const { ImageMagick, MagickFormat, MagickGeometry } = await getImageMagickModule()
    return ImageMagick.read(bytes, (image: any): Uint8Array => {
        image.autoOrient()
        const imageWidth = Number(image.width)
        const imageHeight = Number(image.height)
        const faceWidth = Math.max(1, width * imageWidth)
        const faceHeight = Math.max(1, height * imageHeight)
        const cropSide = Math.max(1, Math.min(
            imageWidth,
            imageHeight,
            Math.ceil(Math.max(faceWidth, faceHeight) * 1.8),
        ))
        const centerX = (left * imageWidth) + (faceWidth / 2)
        const centerY = (top * imageHeight) + (faceHeight * 0.48)
        const cropX = Math.max(0, Math.min(imageWidth - cropSide, Math.round(centerX - cropSide / 2)))
        const cropY = Math.max(0, Math.min(imageHeight - cropSide, Math.round(centerY - cropSide / 2)))
        image.crop(new MagickGeometry(cropX, cropY, cropSide, cropSide))
        image.resize(320, 320)
        image.quality = 82
        return image.write(MagickFormat.Jpeg, (output: Uint8Array) => Uint8Array.from(output))
    })
}

async function storePortraitPreview(
    client: any,
    memberId: string,
    referenceHash: string,
    bytes: Uint8Array,
    boundingBox: any,
) {
    try {
        const preview = await createFaceCroppedPortrait(bytes, boundingBox)
        if (!preview.length || preview.length > 1024 * 1024) throw new Error('identity_portrait_preview_too_large')
        const path = `${memberId}/${referenceHash}.jpg`
        const { error } = await client.storage.from(PORTRAIT_PREVIEW_BUCKET).upload(path, preview, {
            contentType: 'image/jpeg',
            cacheControl: '3600',
            upsert: true,
        })
        if (error) throw error
        return path
    } catch (error) {
        console.warn('member_verification_portrait_preview_failed', {
            memberId,
            errorCode: safeErrorCode(error),
        })
        return ''
    }
}

async function ensureReferenceFace(
    client: any,
    rekognition: RekognitionClient,
    config: VerificationConfig,
    member: RosterMember,
) {
    const identityImage = await loadIdentityDocumentImage(client, config, member)
    if (!identityImage) return { member_id: member.member_id, status: 'no_reference', faceId: '', hash: '' }
    const { bytes } = identityImage
    if (!isJpegOrPng(bytes)) return { member_id: member.member_id, status: 'reference_unusable', faceId: '', hash: '' }
    const hash = await hashReferenceImage(bytes)
    const { data: existing, error: existingError } = await client
        .from('member_verification_reference_faces')
        .select('id, face_id, reference_image_hash, status, reference_source, preview_storage_path')
        .eq('member_id', member.member_id)
        .eq('collection_id', config.collectionId)
        .maybeSingle()
    if (existingError) throw existingError
    if (existing?.status === 'indexed' && existing.reference_source === 'verified_id_portrait' && existing.reference_image_hash === hash && existing.face_id && existing.preview_storage_path) {
        return { member_id: member.member_id, status: 'indexed', faceId: clean(existing.face_id), hash, referenceId: existing.id }
    }

    const detected = await rekognition.send(new DetectFacesCommand({ Image: { Bytes: bytes }, Attributes: ['DEFAULT'] }))
    const faceCount = detected.FaceDetails?.length || 0
    if (faceCount !== 1) {
        const status = faceCount === 0 ? 'reference_unusable' : 'needs_review'
        const { data: saved, error: saveError } = await client.from('member_verification_reference_faces').upsert({
            member_id: member.member_id,
            collection_id: config.collectionId,
            external_image_id: externalImageIdForMember(member.member_id),
            reference_image_hash: hash,
            reference_source: 'verified_id_portrait',
            status,
            face_id: null,
            preview_storage_path: null,
            detected_face_count: faceCount,
            error_code: faceCount === 0 ? 'no_face' : 'multiple_faces',
            updated_at: new Date().toISOString(),
        }, { onConflict: 'member_id,collection_id' }).select('id').single()
        if (saveError) throw saveError
        const previousPreviewPath = clean(existing?.preview_storage_path)
        if (previousPreviewPath) await client.storage.from(PORTRAIT_PREVIEW_BUCKET).remove([previousPreviewPath])
        return { member_id: member.member_id, status, faceId: '', hash, referenceId: saved.id }
    }

    const previewStoragePath = await storePortraitPreview(
        client,
        member.member_id,
        hash,
        bytes,
        detected.FaceDetails?.[0]?.BoundingBox,
    )
    if (existing?.status === 'indexed' && existing.reference_source === 'verified_id_portrait' && existing.reference_image_hash === hash && existing.face_id) {
        if (previewStoragePath) {
            const { error: previewUpdateError } = await client.from('member_verification_reference_faces').update({
                preview_storage_path: previewStoragePath,
                updated_at: new Date().toISOString(),
            }).eq('id', existing.id)
            if (previewUpdateError) throw previewUpdateError
        }
        return { member_id: member.member_id, status: 'indexed', faceId: clean(existing.face_id), hash, referenceId: existing.id }
    }

    const indexed = await rekognition.send(new IndexFacesCommand({
        CollectionId: config.collectionId,
        Image: { Bytes: bytes },
        ExternalImageId: externalImageIdForMember(member.member_id),
        MaxFaces: 1,
        QualityFilter: 'AUTO',
        DetectionAttributes: ['DEFAULT'],
    }))
    const records = indexed.FaceRecords || []
    const faceId = clean(records[0]?.Face?.FaceId)
    if (records.length !== 1 || !faceId) throw new Error('reference_index_failed')

    const previousFaceId = clean(existing?.face_id)
    const indexedAt = new Date().toISOString()
    const { data: saved, error: saveError } = await client.from('member_verification_reference_faces').upsert({
        member_id: member.member_id,
        collection_id: config.collectionId,
        face_id: faceId,
        external_image_id: externalImageIdForMember(member.member_id),
        reference_image_hash: hash,
        reference_source: 'verified_id_portrait',
        preview_storage_path: previewStoragePath || null,
        status: 'indexed',
        detected_face_count: 1,
        error_code: null,
        indexed_at: indexedAt,
        deleted_at: null,
        updated_at: indexedAt,
    }, { onConflict: 'member_id,collection_id' }).select('id').single()
    if (saveError) throw saveError
    if (previousFaceId && previousFaceId !== faceId) {
        await rekognition.send(new DeleteFacesCommand({ CollectionId: config.collectionId, FaceIds: [previousFaceId] }))
    }
    const previousPreviewPath = clean(existing?.preview_storage_path)
    if (previousPreviewPath && previousPreviewPath !== previewStoragePath) {
        await client.storage.from(PORTRAIT_PREVIEW_BUCKET).remove([previousPreviewPath])
    }
    return { member_id: member.member_id, status: 'indexed', faceId, hash, referenceId: saved.id }
}

async function cleanupVideo(s3: S3Client, config: VerificationConfig, objectKey: string) {
    if (!objectKey) return
    try {
        await s3.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }))
    } catch (error) {
        console.warn('member_verification_video_cleanup_failed', { errorCode: safeErrorCode(error) })
    }
}

async function completeFaceSearch(
    client: any,
    rekognition: RekognitionClient,
    s3: S3Client,
    config: VerificationConfig,
    verification: any,
    references: any[],
) {
    let firstPage: any = null
    for (let attempt = 0; attempt < config.pollAttempts; attempt += 1) {
        if (attempt > 0) await waitFor(Math.min(16_000, 2_000 * 2 ** (attempt - 1)))
        firstPage = await rekognition.send(new GetFaceSearchCommand({
            JobId: verification.aws_job_id,
            MaxResults: 1000,
            SortBy: 'TIMESTAMP',
        }))
        const status = clean(firstPage.JobStatus)
        await client.from('gig_application_member_verifications').update({
            poll_attempt_count: Number(verification.poll_attempt_count || 0) + attempt + 1,
            next_poll_at: status === 'IN_PROGRESS' ? new Date(Date.now() + 60_000).toISOString() : null,
            updated_at: new Date().toISOString(),
        }).eq('id', verification.id)
        if (status !== 'IN_PROGRESS') break
    }
    if (!firstPage || clean(firstPage.JobStatus) === 'IN_PROGRESS') return { status: 'processing' }
    if (clean(firstPage.JobStatus) !== 'SUCCEEDED') throw new Error('rekognition_job_failed')

    const personMatches = [...(firstPage.Persons || [])]
    let nextToken = clean(firstPage.NextToken)
    while (nextToken) {
        const page = await rekognition.send(new GetFaceSearchCommand({
            JobId: verification.aws_job_id,
            MaxResults: 1000,
            NextToken: nextToken,
            SortBy: 'TIMESTAMP',
        }))
        personMatches.push(...(page.Persons || []))
        nextToken = clean(page.NextToken)
    }
    const expected = references.map((reference) => ({
        member_id: reference.member_id,
        external_image_id: externalImageIdForMember(reference.member_id),
        reference_face_ids: reference.faceId ? [reference.faceId] : [],
        reference_status: reference.status,
    }))
    const aggregate = aggregateMemberFaceSearch(expected, personMatches, {
        threshold: config.threshold,
        ambiguity_delta: config.ambiguityDelta,
    })
    const referenceByMemberId = new Map(references.map((reference) => [reference.member_id, reference]))
    const { error: deleteError } = await client.from('gig_application_member_verification_results')
        .delete().eq('verification_id', verification.id)
    if (deleteError) throw deleteError
    const { error: resultError } = await client.from('gig_application_member_verification_results').insert(
        aggregate.members.map((member) => ({
            verification_id: verification.id,
            application_id: verification.application_id || null,
            booking_request_id: verification.booking_request_id || null,
            member_id: member.member_id,
            reference_face_id: referenceByMemberId.get(member.member_id)?.referenceId || null,
            status: member.status,
            best_similarity: member.best_similarity,
            match_count: member.match_count,
            first_match_timestamp_ms: member.first_match_timestamp_ms,
            best_match_timestamp_ms: member.best_match_timestamp_ms,
            matched_person_indexes: member.matched_person_indexes,
            updated_at: new Date().toISOString(),
        })),
    )
    if (resultError) throw resultError
    const completedAt = new Date().toISOString()
    const { error: completionError } = await client.from('gig_application_member_verifications').update({
        status: 'completed',
        result: aggregate.result,
        verified_member_count: aggregate.verified_member_count,
        additional_people_detected: aggregate.additional_people_detected,
        next_poll_at: null,
        completed_at: completedAt,
        updated_at: completedAt,
    }).eq('id', verification.id)
    if (completionError) throw completionError
    await cleanupVideo(s3, config, clean(verification.video_object_key))
    return { status: 'completed', result: aggregate.result }
}

async function runMemberVerification(
    client: any,
    applicationId: string,
    target: VerificationTarget,
) {
    let config: VerificationConfig | null = null
    let s3: S3Client | null = null
    let verification: any = null
    let activeObjectKey = ''
    try {
        config = getConfig()
        const clients = createAwsClients(config)
        s3 = clients.s3
        const { application, roster } = await loadApplicationAndRoster(client, applicationId, target)
        const allConsented = application.member_verification_consent === true &&
            Boolean(application.member_verification_consented_at) && roster.length > 0 &&
            roster.every((member) => Boolean(member.consented_at))
        const { data: existing, error: verificationError } = await client
            .from('gig_application_member_verifications').select('*')
            .eq(target === 'connection' ? 'booking_request_id' : 'application_id', applicationId).maybeSingle()
        if (verificationError) throw verificationError
        verification = existing
        activeObjectKey = clean(verification?.video_object_key)
        if (!verification) throw new Error('verification_not_queued')
        if (!allConsented) {
            await client.from('gig_application_member_verifications').update({
                status: 'consent_revoked', result: null, completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            }).eq('id', verification.id)
            if (s3) await cleanupVideo(s3, config, clean(verification.video_object_key))
            return { status: 'consent_revoked' }
        }

        if (verification.aws_job_id) {
            const snapshot = Array.isArray(verification.roster_snapshot) ? verification.roster_snapshot : []
            const currentMemberIds = roster.map((member) => member.member_id).sort()
            const snapshotMemberIds = snapshot.map((member: any) => clean(member.member_id)).filter(Boolean).sort()
            const references = snapshot.map((member: any) => ({
                member_id: clean(member.member_id),
                status: clean(member.status),
                faceId: clean(member.face_id),
                hash: clean(member.reference_hash),
                referenceId: clean(member.reference_id) || undefined,
            })).filter((member: any) => member.member_id)
            if (
                references.length !== snapshot.length ||
                currentMemberIds.join('\n') !== snapshotMemberIds.join('\n') ||
                references.some((reference: any) => !reference.status)
            ) {
                throw new Error('verification_roster_snapshot_invalid')
            }
            return completeFaceSearch(client, clients.rekognition, clients.s3, config, verification, references)
        }

        const startedAt = new Date().toISOString()
        await client.from('gig_application_member_verifications').update({
            status: 'processing', reference_source: 'verified_id_portrait',
            started_at: verification.started_at || startedAt, updated_at: startedAt,
        }).eq('id', verification.id)
        const references = await Promise.all(
            roster.map((member) => ensureReferenceFace(client, clients.rekognition, config!, member)),
        )
        const rosterVersion = await hashReferenceImage(new TextEncoder().encode(
            references.map((reference) => `${reference.member_id}:${reference.hash}:${reference.faceId}`).sort().join('\n'),
        ))
        const video = await fetchBytes(clean(application.video_url), config.maxVideoBytes, 'video', config.allowedMediaHosts)
        const media = inspectRekognitionVideo(video.bytes)
        if (!media.supported) throw new Error(clean(media.reason))
        const videoVersion = await hashReferenceImage(video.bytes)
        const clientRequestToken = await buildFaceSearchClientRequestToken({
            application_id: target === 'connection' ? `connection-${applicationId}` : applicationId,
            video_version: videoVersion,
            roster_version: rosterVersion,
        })
        const objectKey = `rekognition-input/${target}/${applicationId}/${videoVersion}.mp4`
        activeObjectKey = objectKey
        await clients.s3.send(new PutObjectCommand({
            Bucket: config.bucket,
            Key: objectKey,
            Body: video.bytes,
            ContentType: video.contentType || 'video/mp4',
            ServerSideEncryption: 'AES256',
            Metadata: { application_id: applicationId },
        }))
        await clients.s3.send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }))
        const startInput: any = {
            CollectionId: config.collectionId,
            Video: { S3Object: { Bucket: config.bucket, Name: objectKey } },
            ClientRequestToken: clientRequestToken,
            JobTag: `application-${applicationId}`.slice(0, 64),
        }
        if (config.threshold !== undefined) startInput.FaceMatchThreshold = config.threshold
        const started = await clients.rekognition.send(new StartFaceSearchCommand(startInput))
        const jobId = clean(started.JobId)
        if (!jobId) throw new Error('start_face_search_missing_job_id')
        const { data: updated, error: updateError } = await client.from('gig_application_member_verifications').update({
            status: 'processing',
            reference_source: 'verified_id_portrait',
            aws_job_id: jobId,
            aws_collection_id: config.collectionId,
            video_object_key: objectKey,
            video_version: videoVersion,
            roster_version: rosterVersion,
            client_request_token: clientRequestToken,
            roster_snapshot: references.map((reference) => ({
                member_id: reference.member_id,
                status: reference.status,
                face_id: reference.faceId || null,
                reference_hash: reference.hash || null,
                reference_id: reference.referenceId || null,
            })),
            configured_face_match_threshold: config.threshold ?? null,
            poll_attempt_count: 0,
            updated_at: new Date().toISOString(),
        }).eq('id', verification.id).select('*').single()
        if (updateError) throw updateError
        verification = updated
        return completeFaceSearch(client, clients.rekognition, clients.s3, config, updated, references)
    } catch (error) {
        const errorCode = safeErrorCode(error)
        console.warn(`${target}_member_verification_failed`, { applicationId, errorCode })
        if (verification?.id) {
            const completedAt = new Date().toISOString()
            await client.from('gig_application_member_verifications').update({
                status: 'failed', result: 'unavailable', error_code: errorCode,
                error_message: clean((error as any)?.message).slice(0, 500),
                next_poll_at: null, completed_at: completedAt, updated_at: completedAt,
            }).eq('id', verification.id)
        }
        if (s3 && config && activeObjectKey) {
            await cleanupVideo(s3, config, activeObjectKey)
        }
        return { status: 'failed', result: 'unavailable', error_code: errorCode }
    }
}

export async function runGigMemberVerification(client: any, applicationId: string) {
    return runMemberVerification(client, applicationId, 'gig')
}

export async function runConnectionMemberVerification(client: any, applicationId: string) {
    return runMemberVerification(client, applicationId, 'connection')
}

export async function deleteMemberReferenceFaces(client: any, memberId: string) {
    const normalizedMemberId = clean(memberId)
    if (!normalizedMemberId) throw new Error('member_id_required')
    const { data: references, error } = await client
        .from('member_verification_reference_faces')
        .select('id, collection_id, face_id, preview_storage_path')
        .eq('member_id', normalizedMemberId)
    if (error) throw error
    if (!references?.length) return { deleted: 0 }

    const config = getConfig()
    const { rekognition } = createAwsClients(config)
    for (const reference of references) {
        const collectionId = clean(reference.collection_id)
        const faceId = clean(reference.face_id)
        if (collectionId && faceId) {
            await rekognition.send(new DeleteFacesCommand({ CollectionId: collectionId, FaceIds: [faceId] }))
        }
    }
    const previewPaths = references.map((reference: any) => clean(reference.preview_storage_path)).filter(Boolean)
    if (previewPaths.length > 0) {
        const { error: previewDeleteError } = await client.storage.from(PORTRAIT_PREVIEW_BUCKET).remove(previewPaths)
        if (previewDeleteError) throw previewDeleteError
    }
    const { error: deleteError } = await client
        .from('member_verification_reference_faces')
        .delete()
        .eq('member_id', normalizedMemberId)
    if (deleteError) throw deleteError
    return { deleted: references.length }
}

export async function scheduleGigMemberVerification(client: any, applicationId: string) {
    void client
    await scheduleGigMemberVerificationWorker(applicationId)
}

export async function scheduleConnectionMemberVerification(client: any, applicationId: string) {
    void client
    await scheduleConnectionMemberVerificationWorker(applicationId)
}

export async function attachGigMemberVerification(client: any, application: any) {
    return attachMemberVerification(client, application, 'gig')
}

export async function attachConnectionMemberVerification(client: any, application: any) {
    return attachMemberVerification(client, application, 'connection')
}

async function attachMemberVerification(client: any, application: any, target: VerificationTarget) {
    const targetColumn = target === 'connection' ? 'booking_request_id' : 'application_id'
    const { data: verification, error } = await client
        .from('gig_application_member_verifications')
        .select('id, application_id, booking_request_id, reference_source, status, result, expected_member_count, verified_member_count, additional_people_detected, created_at, updated_at, started_at, completed_at, next_poll_at')
        .eq(targetColumn, application.id)
        .maybeSingle()
    if (error || !verification) return { ...application, member_verification: null }
    const { data: members } = await client
        .from('gig_application_member_verification_results')
        .select('member_id, reference_face_id, status, best_similarity, match_count, first_match_timestamp_ms, best_match_timestamp_ms')
        .eq('verification_id', verification.id)
    const referenceIds = (members || []).map((member: any) => clean(member.reference_face_id)).filter(Boolean)
    const { data: referenceFaces } = referenceIds.length > 0
        ? await client.from('member_verification_reference_faces')
            .select('id, reference_source, preview_storage_path')
            .in('id', referenceIds)
        : { data: [] }
    const referenceById = new Map<string, any>((referenceFaces || []).map((reference: any) => [clean(reference.id), reference]))
    let attachedMembers = await Promise.all((members || []).map(async (member: any) => {
        const reference = referenceById.get(clean(member.reference_face_id))
        const previewPath = reference?.reference_source === 'verified_id_portrait'
            ? clean(reference?.preview_storage_path)
            : ''
        if (!previewPath) return { ...member, reference_portrait_url: null }
        const { data: signed, error: signedError } = await client.storage
            .from(PORTRAIT_PREVIEW_BUCKET)
            .createSignedUrl(previewPath, PORTRAIT_PREVIEW_TTL_SECONDS)
        return {
            ...member,
            reference_portrait_url: signedError ? null : signed?.signedUrl || null,
            reference_portrait_expires_in: signedError ? null : PORTRAIT_PREVIEW_TTL_SECONDS,
        }
    }))
    if (target === 'connection' && attachedMembers.length > 0) {
        const { data: snapshots } = await client
            .from('connection_application_members')
            .select('user_id, member_name_snapshot, role_snapshot')
            .eq('booking_request_id', application.id)
        const snapshotByUserId = new Map<string, any>((snapshots || []).map((member: any) => [clean(member.user_id), member]))
        attachedMembers = attachedMembers.map((member: any) => ({
            ...member,
            member_name_snapshot: snapshotByUserId.get(clean(member.member_id))?.member_name_snapshot || null,
            role_snapshot: snapshotByUserId.get(clean(member.member_id))?.role_snapshot || null,
        }))
    } else if (attachedMembers.length > 0) {
        const memberIds = attachedMembers.map((member: any) => clean(member.member_id)).filter(Boolean)
        const { data: profiles } = await client.from('profiles').select('id, full_name').in('id', memberIds)
        const profileById = new Map<string, any>((profiles || []).map((profile: any) => [clean(profile.id), profile]))
        attachedMembers = attachedMembers.map((member: any) => ({
            ...member,
            member_name_snapshot: clean(profileById.get(clean(member.member_id))?.full_name) || null,
        }))
    }
    return {
        ...application,
        member_verification: {
            reference_source: verification.reference_source,
            status: verification.status,
            result: verification.result,
            expected_member_count: verification.expected_member_count,
            verified_member_count: verification.verified_member_count,
            additional_people_detected: verification.additional_people_detected,
            started_at: verification.started_at,
            completed_at: verification.completed_at,
            next_poll_at: verification.next_poll_at,
            members: attachedMembers,
        },
    }
}

export function applyMemberVerificationRecommendationGate(application: any) {
    const verification = application?.member_verification
    const recommendation = application?.ai_recommendation
    if (!verification || !recommendation) return application
    const incomplete = verification.status === 'failed' || (
        verification.status === 'completed' &&
        ['partially_verified', 'needs_review', 'unavailable'].includes(clean(verification.result))
    )
    if (!incomplete) return application
    const reasonCode = verification.status === 'failed'
        ? 'member_verification_unavailable'
        : 'member_verification_incomplete'
    return {
        ...application,
        ai_recommendation: {
            ...recommendation,
            recommendation_status: 'needs_review',
            criteria_snapshot: {
                ...(recommendation.criteria_snapshot || {}),
                fit_recommendation_status: recommendation.criteria_snapshot?.fit_recommendation_status || recommendation.recommendation_status,
                recommendation_reason_codes: [
                    ...new Set([...(recommendation.criteria_snapshot?.recommendation_reason_codes || []), reasonCode]),
                ],
            },
        },
    }
}
