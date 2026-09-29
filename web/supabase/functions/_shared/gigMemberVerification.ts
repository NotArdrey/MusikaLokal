export type MemberVerificationResult =
    | 'verified'
    | 'partially_verified'
    | 'needs_review'
    | 'unavailable'
    | 'no_reference'
    | 'no_video'

export type ExpectedVerificationMember = {
    member_id: string
    external_image_id?: string | null
    reference_face_ids?: string[]
    reference_status?: 'indexed' | 'no_reference' | 'reference_unusable' | 'needs_review'
}

export type RekognitionFaceMatch = {
    Similarity?: number
    Face?: {
        FaceId?: string
        ExternalImageId?: string
    }
}

export type RekognitionPersonMatch = {
    Timestamp?: number
    Person?: { Index?: number }
    FaceMatches?: RekognitionFaceMatch[]
}

export type AggregatedMemberVerification = {
    result: MemberVerificationResult
    expected_member_count: number
    verified_member_count: number
    additional_people_detected: boolean
    ambiguous_person_indexes: number[]
    members: Array<{
        member_id: string
        status: 'verified' | 'needs_review' | 'no_reference' | 'reference_unusable'
        best_similarity: number | null
        match_count: number
        first_match_timestamp_ms: number | null
        best_match_timestamp_ms: number | null
        matched_person_indexes: number[]
    }>
}

const clean = (value: unknown) => String(value || '').trim()

export function externalImageIdForMember(memberId: string) {
    const normalized = clean(memberId).replace(/[^A-Za-z0-9_.-]/g, '_')
    if (!normalized) throw new Error('memberId is required')
    return `member_${normalized}`.slice(0, 255)
}

function findMemberId(
    face: RekognitionFaceMatch['Face'],
    faceIdToMemberId: Map<string, string>,
    externalIdToMemberId: Map<string, string>,
) {
    const faceId = clean(face?.FaceId)
    if (faceId && faceIdToMemberId.has(faceId)) return faceIdToMemberId.get(faceId) || null
    const externalImageId = clean(face?.ExternalImageId)
    return externalIdToMemberId.get(externalImageId) || null
}

export function aggregateMemberFaceSearch(
    expectedMembers: ExpectedVerificationMember[],
    personMatches: RekognitionPersonMatch[],
    options: { threshold?: number; ambiguity_delta?: number } = {},
): AggregatedMemberVerification {
    const threshold = Number.isFinite(options.threshold) ? Number(options.threshold) : null
    const ambiguityDelta = Number.isFinite(options.ambiguity_delta)
        ? Math.max(0, Number(options.ambiguity_delta))
        : 1
    const expected = expectedMembers.filter((member) => clean(member.member_id))
    const expectedIds = new Set(expected.map((member) => clean(member.member_id)))
    const faceIdToMemberId = new Map<string, string>()
    const externalIdToMemberId = new Map<string, string>()

    for (const member of expected) {
        const memberId = clean(member.member_id)
        externalIdToMemberId.set(clean(member.external_image_id) || externalImageIdForMember(memberId), memberId)
        for (const faceId of member.reference_face_ids || []) {
            if (clean(faceId)) faceIdToMemberId.set(clean(faceId), memberId)
        }
    }

    const evidenceByMember = new Map<string, Array<{ similarity: number; timestamp: number; personIndex: number }>>()
    const candidateEventsByPerson = new Map<number, Map<string, Array<{ similarity: number; timestamp: number; personIndex: number }>>>()
    const ambiguousPersonIndexes = new Set<number>()
    let additionalPeopleDetected = false

    for (const personMatch of personMatches || []) {
        const personIndex = Number(personMatch?.Person?.Index)
        if (!Number.isInteger(personIndex) || personIndex < 0) continue
        const timestamp = Number.isFinite(personMatch?.Timestamp) ? Number(personMatch.Timestamp) : 0
        const strongestByMember = new Map<string, number>()

        for (const faceMatch of personMatch.FaceMatches || []) {
            const similarity = Number(faceMatch?.Similarity)
            if (!Number.isFinite(similarity) || (threshold !== null && similarity < threshold)) continue
            const memberId = findMemberId(faceMatch?.Face, faceIdToMemberId, externalIdToMemberId)
            if (!memberId || !expectedIds.has(memberId)) continue
            const previous = strongestByMember.get(memberId)
            if (previous === undefined || similarity > previous) strongestByMember.set(memberId, similarity)
        }

        if (strongestByMember.size === 0) {
            additionalPeopleDetected = true
            continue
        }

        const candidatesForPerson = candidateEventsByPerson.get(personIndex) ||
            new Map<string, Array<{ similarity: number; timestamp: number; personIndex: number }>>()
        for (const [memberId, similarity] of strongestByMember) {
            const events = candidatesForPerson.get(memberId) || []
            const existing = events.find((item) => item.timestamp === timestamp)
            if (existing) {
                existing.similarity = Math.max(existing.similarity, similarity)
            } else {
                events.push({ similarity, timestamp, personIndex })
            }
            candidatesForPerson.set(memberId, events)
        }
        candidateEventsByPerson.set(personIndex, candidatesForPerson)
    }

    for (const [personIndex, memberEvents] of candidateEventsByPerson) {
        const candidates = [...memberEvents.entries()]
            .map(([memberId, events]) => ({
                memberId,
                events,
                bestSimilarity: Math.max(...events.map((event) => event.similarity)),
            }))
            .sort((left, right) => right.bestSimilarity - left.bestSimilarity)
        if (candidates.length > 1 && candidates[0].bestSimilarity - candidates[1].bestSimilarity < ambiguityDelta) {
            ambiguousPersonIndexes.add(personIndex)
            continue
        }
        const winner = candidates[0]
        const evidence = evidenceByMember.get(winner.memberId) || []
        evidence.push(...winner.events)
        evidenceByMember.set(winner.memberId, evidence)
    }

    const members = expected.map((member) => {
        const memberId = clean(member.member_id)
        const referenceFaceIds = (member.reference_face_ids || []).filter((value) => clean(value))
        const hasReference = referenceFaceIds.length > 0
        const missingReferenceStatus = member.reference_status === 'reference_unusable'
            ? 'reference_unusable' as const
            : member.reference_status === 'needs_review'
            ? 'needs_review' as const
            : 'no_reference' as const
        const evidence = evidenceByMember.get(memberId) || []
        const strongest = [...evidence].sort((left, right) => right.similarity - left.similarity)[0]
        const timestamps = evidence.map((item) => item.timestamp)
        return {
            member_id: memberId,
            status: !hasReference ? missingReferenceStatus : evidence.length > 0 ? 'verified' as const : 'needs_review' as const,
            best_similarity: strongest?.similarity ?? null,
            match_count: evidence.length,
            first_match_timestamp_ms: evidence.length > 0 ? Math.min(...timestamps) : null,
            best_match_timestamp_ms: strongest?.timestamp ?? null,
            matched_person_indexes: [...new Set(evidence.map((item) => item.personIndex))].sort((a, b) => a - b),
        }
    })
    const verifiedMemberCount = members.filter((member) => member.status === 'verified').length
    const noReferenceCount = members.filter((member) => member.status === 'no_reference').length
    const result: MemberVerificationResult = expected.length === 0
        ? 'unavailable'
        : noReferenceCount === expected.length
        ? 'no_reference'
        : verifiedMemberCount === expected.length
        ? 'verified'
        : verifiedMemberCount > 0
        ? 'partially_verified'
        : 'needs_review'

    return {
        result,
        expected_member_count: expected.length,
        verified_member_count: verifiedMemberCount,
        additional_people_detected: additionalPeopleDetected,
        ambiguous_person_indexes: [...ambiguousPersonIndexes].sort((a, b) => a - b),
        members,
    }
}

async function sha256Hex(value: Uint8Array) {
    const stableBytes = new Uint8Array(value.length)
    stableBytes.set(value)
    const digest = await crypto.subtle.digest('SHA-256', stableBytes.buffer)
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function buildFaceSearchClientRequestToken(input: {
    application_id: string
    video_version: string
    roster_version: string
}) {
    const payload = [input.application_id, input.video_version, input.roster_version]
        .map((value) => clean(value))
        .join('\n')
    if (!payload.replace(/\n/g, '')) throw new Error('Idempotency token input is required')
    return sha256Hex(new TextEncoder().encode(payload))
}

export async function hashReferenceImage(bytes: Uint8Array) {
    return sha256Hex(bytes)
}

function containsBytes(source: Uint8Array, needle: number[]) {
    outer: for (let offset = 0; offset <= source.length - needle.length; offset += 1) {
        for (let index = 0; index < needle.length; index += 1) {
            if (source[offset + index] !== needle[index]) continue outer
        }
        return true
    }
    return false
}

export function inspectRekognitionVideo(bytes: Uint8Array) {
    const ftyp = [0x66, 0x74, 0x79, 0x70]
    const avc1 = [0x61, 0x76, 0x63, 0x31]
    const avc3 = [0x61, 0x76, 0x63, 0x33]
    const container_supported = bytes.length >= 12 && containsBytes(bytes.subarray(0, Math.min(bytes.length, 64)), ftyp)
    const codec_supported = containsBytes(bytes, avc1) || containsBytes(bytes, avc3)
    return {
        container_supported,
        codec_supported,
        supported: container_supported && codec_supported,
        reason: !container_supported
            ? 'unsupported_container'
            : !codec_supported
            ? 'unsupported_video_codec'
            : null,
    }
}
