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

type VerificationConfig = {
    region: string
    collectionId: string
    bucket: string
    threshold?: number
    ambiguityDelta: number
    maxVideoBytes: number
    pollAttempts: number
    allowedMediaHosts: Set<string>
}

type RosterMember = {
    member_id: string
    reference_url: string
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
        const { data: profiles, error: profileError } = await client
            .from('profiles')
            .select('id, avatar_url')
            .in('id', memberIds)
        if (profileError) throw profileError
        const avatarById = new Map((profiles || []).map((profile: any) => [clean(profile.id), clean(profile.avatar_url)]))
        return (members || []).map((member: any) => ({
            member_id: clean(member.user_id),
            reference_url: avatarById.get(clean(member.user_id)) || '',
            consented_at: member.member_verification_consent === true
                ? clean(member.member_verification_consented_at)
                : '',
        })).filter((member: RosterMember) => member.member_id)
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
    const { data: profile, error: profileError } = await client
        .from('profiles')
        .select('id, avatar_url')
        .eq('id', memberId)
        .maybeSingle()
    if (profileError) throw profileError
    return [{
        member_id: memberId,
        reference_url: clean(profile?.avatar_url),
        consented_at: application.member_verification_consent === true
            ? clean(application.member_verification_consented_at)
            : '',
    }]
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
            const { data: profiles, error: profileError } = await client
                .from('profiles')
                .select('id, avatar_url')
                .in('id', memberIds)
            if (profileError) throw profileError
            const avatarById = new Map((profiles || []).map((profile: any) => [clean(profile.id), clean(profile.avatar_url)]))
            return {
                application,
                roster: (snapshotMembers || []).map((member: any) => ({
                    member_id: clean(member.user_id),
                    reference_url: avatarById.get(clean(member.user_id)) || '',
                    consented_at: member.member_verification_consent === true
                        ? clean(member.member_verification_consented_at)
                        : '',
                })).filter((member: RosterMember) => member.member_id),
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
        .select('id, status, aws_job_id, client_request_token')
        .eq(targetColumn, applicationId)
        .maybeSingle()
    if (existingError) throw existingError
    if (existing && ['queued', 'processing', 'completed'].includes(clean(existing.status))) return existing

    const payload = {
        application_id: target === 'gig' ? applicationId : null,
        booking_request_id: target === 'connection' ? applicationId : null,
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

async function ensureReferenceFace(
    client: any,
    rekognition: RekognitionClient,
    config: VerificationConfig,
    member: RosterMember,
) {
    if (!member.reference_url) return { member_id: member.member_id, status: 'no_reference', faceId: '', hash: '' }
    const { bytes } = await fetchBytes(member.reference_url, 15 * 1024 * 1024, 'image', config.allowedMediaHosts)
    if (!isJpegOrPng(bytes)) return { member_id: member.member_id, status: 'reference_unusable', faceId: '', hash: '' }
    const hash = await hashReferenceImage(bytes)
    const { data: existing, error: existingError } = await client
        .from('member_verification_reference_faces')
        .select('id, face_id, reference_image_hash, status')
        .eq('member_id', member.member_id)
        .eq('collection_id', config.collectionId)
        .maybeSingle()
    if (existingError) throw existingError
    if (existing?.status === 'indexed' && existing.reference_image_hash === hash && existing.face_id) {
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
            status,
            face_id: null,
            detected_face_count: faceCount,
            error_code: faceCount === 0 ? 'no_face' : 'multiple_faces',
            updated_at: new Date().toISOString(),
        }, { onConflict: 'member_id,collection_id' }).select('id').single()
        if (saveError) throw saveError
        return { member_id: member.member_id, status, faceId: '', hash, referenceId: saved.id }
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
            status: 'processing', started_at: verification.started_at || startedAt, updated_at: startedAt,
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
        .select('id, collection_id, face_id')
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
        .select('id, application_id, booking_request_id, status, result, expected_member_count, verified_member_count, additional_people_detected, created_at, updated_at, started_at, completed_at, next_poll_at')
        .eq(targetColumn, application.id)
        .maybeSingle()
    if (error || !verification) return { ...application, member_verification: null }
    const { data: members } = await client
        .from('gig_application_member_verification_results')
        .select('member_id, status, best_similarity, match_count, first_match_timestamp_ms, best_match_timestamp_ms')
        .eq('verification_id', verification.id)
    let attachedMembers = members || []
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
    }
    return {
        ...application,
        member_verification: {
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
