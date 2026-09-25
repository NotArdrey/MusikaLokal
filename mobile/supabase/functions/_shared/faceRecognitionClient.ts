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
    confidence: number | null
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
    threshold_tier: string
    summary: string
    frames_compared: number
    sampled_frames: number
    usable_frames: number
    matched_frames: number
    match_rate: number
    no_face_frames: number
    multiple_people_frames: number
    processing_failure_frames: number
    provider: 'faceplusplus_compare'
    model: 'Face++ Compare API'
    aggregation_strategy: string
    frames: FaceFrameResult[]
    limitation: string
    error: string | null
}

export type FacePlusPlusClientOptions = {
    apiKey: string
    apiSecret: string
    apiBaseUrl?: string
    thresholdTier?: string
    timeoutMs?: number
    maxConcurrencyRetries?: number
    retryBaseDelayMs?: number
    fetchImpl?: typeof fetch
    sleepImpl?: (delayMs: number) => Promise<void>
}

const DEFAULT_API_BASE_URL = 'https://api-us.faceplusplus.com'
const DEFAULT_THRESHOLD_TIER = '1e-5'
const DEFAULT_TIMEOUT_MS = 20_000
const DEFAULT_MAX_CONCURRENCY_RETRIES = 3
const DEFAULT_RETRY_BASE_DELAY_MS = 1_000
const MAX_FRAMES = 3
const AGGREGATION_STRATEGY = 'two_frame_consensus_or_single_clear_frame'

const finiteNumber = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

const cleanText = (value: unknown, maxLength = 500) => String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)

const normalizeThresholdTier = (value: unknown) => {
    const tier = cleanText(value, 20).toLowerCase()
    return ['1e-3', '1e-4', '1e-5'].includes(tier) ? tier : DEFAULT_THRESHOLD_TIER
}

const compareEndpoint = (baseUrl: string) =>
    `${baseUrl.trim().replace(/\/+$/, '') || DEFAULT_API_BASE_URL}/facepp/v3/compare`

const median = (values: number[]) => {
    if (values.length === 0) return null
    const sorted = [...values].sort((left, right) => left - right)
    const midpoint = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0
        ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
        : sorted[midpoint]
}

export function unavailableFaceMatch(summary: string, limitation = '', error: string | null = null): FaceMatchResult {
    return {
        status: 'not_run',
        confidence: null,
        similarity: null,
        distance: null,
        threshold: null,
        threshold_tier: '',
        summary,
        frames_compared: 0,
        sampled_frames: 0,
        usable_frames: 0,
        matched_frames: 0,
        match_rate: 0,
        no_face_frames: 0,
        multiple_people_frames: 0,
        processing_failure_frames: 0,
        provider: 'faceplusplus_compare',
        model: 'Face++ Compare API',
        aggregation_strategy: AGGREGATION_STRATEGY,
        frames: [],
        limitation,
        error,
    }
}

const isNoFaceError = (message: string) => /NO_FACE_FOUND|FACE_NOT_FOUND/i.test(message)
const isConcurrencyLimitError = (message: string) => /CONCURRENCY_LIMIT_EXCEEDED/i.test(message)

const boundedInteger = (value: unknown, fallback: number, minimum: number, maximum: number) => {
    const parsed = finiteNumber(value)
    return parsed === null ? fallback : Math.max(minimum, Math.min(maximum, Math.floor(parsed)))
}

const wait = (delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs))

const retryDelayMs = (response: Response, attempt: number, baseDelayMs: number) => {
    const retryAfterSeconds = finiteNumber(response.headers?.get?.('retry-after'))
    if (retryAfterSeconds !== null && retryAfterSeconds > 0) {
        return Math.min(10_000, Math.ceil(retryAfterSeconds * 1_000))
    }

    const exponentialDelay = baseDelayMs * (2 ** attempt)
    const jitter = Math.floor(Math.random() * Math.min(250, baseDelayMs))
    return Math.min(10_000, exponentialDelay + jitter)
}

async function compareFrame(
    subject: FaceMatchSubject,
    frameUrl: string,
    frameIndex: number,
    options: FacePlusPlusClientOptions,
    thresholdTier: string,
): Promise<FaceFrameResult> {
    const maxConcurrencyRetries = boundedInteger(
        options.maxConcurrencyRetries,
        DEFAULT_MAX_CONCURRENCY_RETRIES,
        0,
        5,
    )
    const baseDelayMs = boundedInteger(
        options.retryBaseDelayMs,
        DEFAULT_RETRY_BASE_DELAY_MS,
        250,
        5_000,
    )
    const sleep = options.sleepImpl || wait

    for (let attempt = 0; attempt <= maxConcurrencyRetries; attempt += 1) {
        const body = new FormData()
        body.set('api_key', options.apiKey)
        body.set('api_secret', options.apiSecret)
        body.set('image_url1', subject.reference_image_url)
        body.set('image_url2', frameUrl)

        try {
            const timeoutMs = Math.max(5_000, Math.min(60_000, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS))
            const response = await (options.fetchImpl || fetch)(
                compareEndpoint(options.apiBaseUrl || DEFAULT_API_BASE_URL),
                { method: 'POST', body, signal: AbortSignal.timeout(timeoutMs) },
            )
            const payload = await response.json().catch(() => ({}))
            const apiError = cleanText(payload?.error_message || (!response.ok ? `HTTP ${response.status}` : ''), 300)
            const facesDetected = Array.isArray(payload?.faces2) ? payload.faces2.length : 0
            if (apiError) {
                if (isConcurrencyLimitError(apiError) && attempt < maxConcurrencyRetries) {
                    await sleep(retryDelayMs(response, attempt, baseDelayMs))
                    continue
                }

                return {
                    frame: frameIndex + 1,
                    frame_url: frameUrl,
                    outcome: isNoFaceError(apiError) ? 'no_face' : 'processing_error',
                    verified: null,
                    confidence: null,
                    threshold: null,
                    faces_detected: facesDetected,
                    error: apiError,
                }
            }

            const confidence = finiteNumber(payload?.confidence)
            const threshold = finiteNumber(payload?.thresholds?.[thresholdTier])
            if (confidence === null || threshold === null) {
                return {
                    frame: frameIndex + 1,
                    frame_url: frameUrl,
                    outcome: facesDetected === 0 ? 'no_face' : 'processing_error',
                    verified: null,
                    confidence,
                    threshold,
                    faces_detected: facesDetected,
                    error: facesDetected === 0 ? 'Face++ found no comparable face.' : 'Face++ returned no usable confidence threshold.',
                }
            }

            const verified = confidence >= threshold
            return {
                frame: frameIndex + 1,
                frame_url: frameUrl,
                outcome: verified ? 'matched' : 'different',
                verified,
                confidence,
                threshold,
                faces_detected: facesDetected,
                error: null,
            }
        } catch (caught) {
            return {
                frame: frameIndex + 1,
                frame_url: frameUrl,
                outcome: 'processing_error',
                verified: null,
                confidence: null,
                threshold: null,
                faces_detected: 0,
                error: cleanText((caught as any)?.message || caught, 300) || 'Face++ request failed.',
            }
        }
    }

    throw new Error('Face++ retry loop ended unexpectedly.')
}

function aggregateResult(frames: FaceFrameResult[], thresholdTier: string): FaceMatchResult {
    const usable = frames.filter((frame) => frame.outcome === 'matched' || frame.outcome === 'different')
    const matched = usable.filter((frame) => frame.outcome === 'matched')
    const noFaceCount = frames.filter((frame) => frame.outcome === 'no_face').length
    const failureFrames = frames.filter((frame) => frame.outcome === 'processing_error')
    const confidence = median(usable.flatMap((frame) => frame.confidence === null ? [] : [frame.confidence]))
    const threshold = median(usable.flatMap((frame) => frame.threshold === null ? [] : [frame.threshold]))
    const status: FaceSimilarityStatus = usable.length >= 2 && matched.length >= 2
        ? 'likely_same_person'
        : usable.length >= 2 && matched.length === 0
            ? 'likely_different_person'
            : 'unclear'
    const summary = status === 'likely_same_person'
        ? `Face++ matched ${matched.length} of ${usable.length} clear representative video frames.`
        : status === 'likely_different_person'
            ? `Face++ did not match the profile photo in ${usable.length} clear representative video frames.`
            : usable.length === 1 && matched.length === 1
                ? 'Face++ matched the only clear representative video frame, so the evidence is limited.'
                : usable.length === 0
                    ? 'Face++ could not find a usable face comparison in the representative video frames.'
                    : 'Face++ returned mixed or insufficient face-comparison evidence.'
    const firstFailure = failureFrames.find((frame) => frame.error)?.error || null

    return {
        status: usable.length === 0 && failureFrames.length === frames.length ? 'not_run' : status,
        confidence,
        similarity: confidence === null ? null : confidence / 100,
        distance: null,
        threshold,
        threshold_tier: thresholdTier,
        summary,
        frames_compared: usable.length,
        sampled_frames: frames.length,
        usable_frames: usable.length,
        matched_frames: matched.length,
        match_rate: usable.length > 0 ? matched.length / usable.length : 0,
        no_face_frames: noFaceCount,
        multiple_people_frames: frames.filter((frame) => frame.faces_detected > 1).length,
        processing_failure_frames: failureFrames.length,
        provider: 'faceplusplus_compare',
        model: 'Face++ Compare API',
        aggregation_strategy: AGGREGATION_STRATEGY,
        frames,
        limitation: usable.length < 2
            ? 'Fewer than two clear representative video frames were available; review the original photo and video.'
            : '',
        error: firstFailure,
    }
}

export async function compareApplicantFacesWithFacePlusPlus(
    subjects: FaceMatchSubject[],
    frameUrls: string[],
    options: FacePlusPlusClientOptions,
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

    if (!cleanText(options.apiKey) || !cleanText(options.apiSecret)) {
        subjects.forEach((subject) => results.set(subject.id, unavailableFaceMatch(
            'Face++ face matching is not configured.',
            'Set FACEPP_API_KEY and FACEPP_API_SECRET as Supabase Edge Function secrets.',
            'missing_facepp_credentials',
        )))
        return results
    }

    const thresholdTier = normalizeThresholdTier(options.thresholdTier)
    for (const subject of subjects) {
        const frames: FaceFrameResult[] = []
        for (const [frameIndex, frameUrl] of selectedFrames.entries()) {
            frames.push(await compareFrame(subject, frameUrl, frameIndex, options, thresholdTier))
        }
        results.set(subject.id, aggregateResult(frames, thresholdTier))
    }
    return results
}
