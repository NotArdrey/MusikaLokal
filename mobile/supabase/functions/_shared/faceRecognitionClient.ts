export type FaceSimilarityStatus = 'likely_same_person' | 'likely_different_person' | 'unclear' | 'not_run'

export type FaceMatchSubject = {
    id: string
    reference_image_url: string
}

export type FaceFrameResult = {
    frame: number
    frame_url: string
    outcome: 'matched' | 'different' | 'unclear' | 'no_face' | 'processing_error'
    verified: boolean | null
    distance: number | null
    threshold: number | null
    faces_detected: number
    error: string | null
}

export type FaceMatchResult = {
    status: FaceSimilarityStatus
    confidence: number | null
    similarity: number | null
    distance: number | null
    threshold: number | null
    summary: string
    frames_compared: number
    sampled_frames: number
    usable_frames: number
    matched_frames: number
    match_rate: number
    no_face_frames: number
    multiple_people_frames: number
    processing_failure_frames: number
    provider: 'deepface_arcface'
    model: 'ArcFace'
    detector_backend: string
    distance_metric: string
    alignment: boolean
    aggregation_strategy: string
    service_version: string
    deepface_version: string
    frames: FaceFrameResult[]
    limitation: string
    error: string | null
}

export type FaceServiceMetadata = {
    status?: string
    provider?: string
    engine?: string
    service_version?: string
    deepface_version?: string
    model?: string
    detector_backend?: string
    distance_metric?: string
    threshold?: number | null
    threshold_source?: string
    alignment?: boolean
    aggregation_strategy?: string
    frame_configuration?: string
}

export type FaceServiceClientOptions = {
    serviceUrl: string
    apiKey?: string
    timeoutMs?: number
    fetchImpl?: typeof fetch
}

const DEFAULT_TIMEOUT_MS = 60_000
const MAX_FRAMES = 3

const finiteNumber = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

const boundedInteger = (value: unknown, fallback = 0) => {
    const parsed = finiteNumber(value)
    return parsed === null ? fallback : Math.max(0, Math.floor(parsed))
}

const boundedRate = (value: unknown) => {
    const parsed = finiteNumber(value)
    return parsed === null ? 0 : Math.max(0, Math.min(1, parsed))
}

const cleanText = (value: unknown, maxLength = 500) => String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)

export function unavailableFaceMatch(summary: string, limitation = '', error: string | null = null): FaceMatchResult {
    return {
        status: 'not_run',
        confidence: null,
        similarity: null,
        distance: null,
        threshold: null,
        summary,
        frames_compared: 0,
        sampled_frames: 0,
        usable_frames: 0,
        matched_frames: 0,
        match_rate: 0,
        no_face_frames: 0,
        multiple_people_frames: 0,
        processing_failure_frames: 0,
        provider: 'deepface_arcface',
        model: 'ArcFace',
        detector_backend: '',
        distance_metric: 'cosine',
        alignment: true,
        aggregation_strategy: 'at_least_2_usable_frames_and_2_verified_matches',
        service_version: '',
        deepface_version: '',
        frames: [],
        limitation,
        error,
    }
}

function normalizeFrame(value: any, index: number): FaceFrameResult {
    const allowedOutcomes = new Set(['matched', 'different', 'unclear', 'no_face', 'processing_error'])
    const outcome = allowedOutcomes.has(String(value?.outcome))
        ? String(value.outcome) as FaceFrameResult['outcome']
        : 'processing_error'
    return {
        frame: boundedInteger(value?.frame, index + 1),
        frame_url: cleanText(value?.frame_url, 2_000),
        outcome,
        verified: typeof value?.verified === 'boolean' ? value.verified : null,
        distance: finiteNumber(value?.distance),
        threshold: finiteNumber(value?.threshold),
        faces_detected: boundedInteger(value?.faces_detected),
        error: cleanText(value?.error, 300) || null,
    }
}

function normalizeResult(value: any): FaceMatchResult {
    const allowedStatuses = new Set<FaceSimilarityStatus>([
        'likely_same_person',
        'likely_different_person',
        'unclear',
        'not_run',
    ])
    const rawStatus = String(value?.status || '') as FaceSimilarityStatus
    const status = allowedStatuses.has(rawStatus) ? rawStatus : 'unclear'
    const frames = (Array.isArray(value?.frames) ? value.frames : []).slice(0, MAX_FRAMES).map(normalizeFrame)
    return {
        status,
        // DeepFace distance is not converted into a made-up percentage. These legacy
        // compatibility fields remain nullable until a calibrated mapping is approved.
        confidence: finiteNumber(value?.confidence),
        similarity: finiteNumber(value?.similarity),
        distance: finiteNumber(value?.distance),
        threshold: finiteNumber(value?.threshold),
        summary: cleanText(value?.summary, 700) || 'Face comparison completed without a summary.',
        frames_compared: boundedInteger(value?.frames_compared ?? value?.usable_frames),
        sampled_frames: boundedInteger(value?.sampled_frames),
        usable_frames: boundedInteger(value?.usable_frames),
        matched_frames: boundedInteger(value?.matched_frames),
        match_rate: boundedRate(value?.match_rate),
        no_face_frames: boundedInteger(value?.no_face_frames),
        multiple_people_frames: boundedInteger(value?.multiple_people_frames),
        processing_failure_frames: boundedInteger(value?.processing_failure_frames),
        provider: 'deepface_arcface',
        model: 'ArcFace',
        detector_backend: cleanText(value?.detector_backend, 80),
        distance_metric: cleanText(value?.distance_metric, 40) || 'cosine',
        alignment: value?.alignment !== false,
        aggregation_strategy: cleanText(value?.aggregation_strategy, 160)
            || 'at_least_2_usable_frames_and_2_verified_matches',
        service_version: cleanText(value?.service_version, 80),
        deepface_version: cleanText(value?.deepface_version, 80),
        frames,
        limitation: cleanText(value?.limitation, 700),
        error: cleanText(value?.error, 500) || null,
    }
}

function endpoint(serviceUrl: string, path: string) {
    return `${serviceUrl.trim().replace(/\/+$/, '')}${path}`
}

// PRODUCTION PARITY:
// This client is the single integration point for the production DeepFace/ArcFace
// service. The face benchmark imports this same client instead of implementing its
// own request or result-normalization logic.
export async function compareApplicantFacesWithDeepFace(
    subjects: FaceMatchSubject[],
    frameUrls: string[],
    options: FaceServiceClientOptions,
): Promise<Map<string, FaceMatchResult>> {
    const results = new Map<string, FaceMatchResult>()
    if (subjects.length === 0) return results

    const selectedFrames = frameUrls.filter(Boolean).slice(0, MAX_FRAMES)
    if (selectedFrames.length === 0) {
        subjects.forEach((subject) => results.set(subject.id, unavailableFaceMatch(
            'No representative performance-video frames were available.',
            'Face matching was not run because no sampled video frames were uploaded.',
        )))
        return results
    }

    const serviceUrl = cleanText(options.serviceUrl, 2_000)
    if (!serviceUrl) {
        subjects.forEach((subject) => results.set(subject.id, unavailableFaceMatch(
            'DeepFace/ArcFace face matching is not configured.',
            'Set FACE_RECOGNITION_URL as a server-side Edge Function secret.',
            'missing_face_service_url',
        )))
        return results
    }

    const timeoutMs = Math.max(5_000, Math.min(120_000, boundedInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS)))
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (options.apiKey) headers['X-Face-Service-Key'] = options.apiKey

    try {
        const response = await (options.fetchImpl || fetch)(endpoint(serviceUrl, '/v1/face-match/batch'), {
            method: 'POST',
            headers,
            body: JSON.stringify({ subjects, frame_urls: selectedFrames }),
            signal: AbortSignal.timeout(timeoutMs),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
            throw new Error(`DeepFace/ArcFace service returned ${response.status}${payload?.detail ? `: ${cleanText(payload.detail, 220)}` : ''}`)
        }

        const returned = new Map<string, FaceMatchResult>(
            (Array.isArray(payload?.results) ? payload.results : [])
                .filter((item: any) => item?.subject_id)
                .map((item: any) => [String(item.subject_id), normalizeResult({ ...payload, ...item })]),
        )
        subjects.forEach((subject) => {
            results.set(subject.id, returned.get(subject.id) || unavailableFaceMatch(
                'DeepFace/ArcFace face matching did not return a result.',
                'The face service response was incomplete.',
                'missing_subject_result',
            ))
        })
    } catch (caught) {
        const detail = cleanText((caught as any)?.message || caught, 300)
        subjects.forEach((subject) => results.set(subject.id, unavailableFaceMatch(
            'DeepFace/ArcFace face matching was unavailable.',
            `DeepFace/ArcFace face matching was unavailable: ${detail}`,
            detail || 'face_service_unavailable',
        )))
    }
    return results
}

export async function getFaceServiceMetadata(options: FaceServiceClientOptions): Promise<FaceServiceMetadata> {
    const response = await (options.fetchImpl || fetch)(endpoint(options.serviceUrl, '/version'), {
        headers: options.apiKey ? { 'X-Face-Service-Key': options.apiKey } : undefined,
        signal: AbortSignal.timeout(Math.max(5_000, Math.min(30_000, options.timeoutMs || 10_000))),
    })
    if (!response.ok) throw new Error(`Face service version request returned ${response.status}`)
    return await response.json()
}
