import { reviewConnectionGenres } from './gigPortfolioReview.ts'

const VERSION = 'submitted-genres-v1'

export function connectionGenreReviewKey(application: any, genres: string[]) {
    const details = application?.event_details?.request_details || {}
    return JSON.stringify([VERSION, genres, details.cv_url || application.attachment_url || null,
        details.video_url || null, details.video_copyright_metadata || {}, details.ai_portfolio_review_consent ?? null])
}

async function schedule(applicationId: string) {
    const url = Deno.env.get('SUPABASE_URL') || ''
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    if (!url || !key) return
    const task = fetch(`${url}/functions/v1/connection-genre-review`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId }),
    }).then((response) => {
        if (!response.ok) console.warn('connection_genre_review_schedule_failed', { applicationId, status: response.status })
    }).catch(() => console.warn('connection_genre_review_schedule_failed', { applicationId }))
    const runtime = (globalThis as any).EdgeRuntime
    if (typeof runtime?.waitUntil === 'function') runtime.waitUntil(task)
    else await task
}

export async function attachConnectionGenreReviews(client: any, applications: any[], genres: string[]) {
    if (!applications.length || !genres.length) return new Map<string, any>()
    const { data, error } = await client.from('connection_application_genre_reviews')
        .select('application_id, cache_key, status, result, updated_at')
        .in('application_id', applications.map((application) => application.id))
    if (error) {
        console.warn('connection_genre_reviews_unavailable', { message: error.message })
        return new Map<string, any>()
    }
    const byId = new Map<string, any>((data || []).map((row: any) => [row.application_id, row]))
    const results = new Map<string, any>()
    for (const application of applications) {
        const cacheKey = connectionGenreReviewKey(application, genres)
        const stored = byId.get(application.id)
        if (stored?.cache_key === cacheKey) {
            results.set(application.id, { ...stored.result, status: stored.status })
            if (['queued', 'processing'].includes(stored.status) && Date.parse(stored.updated_at) < Date.now() - 5 * 60_000) {
                await client.from('connection_application_genre_reviews').update({ status: 'queued', updated_at: new Date().toISOString() })
                    .eq('application_id', application.id).eq('cache_key', cacheKey).eq('updated_at', stored.updated_at)
                await schedule(application.id)
            }
            continue
        }
        const queued = {
            application_id: application.id, cache_key: cacheKey, required_genres: genres,
            status: 'queued', result: {}, updated_at: new Date().toISOString(),
        }
        const { error: queueError } = stored
            ? await client.from('connection_application_genre_reviews').update(queued)
                .eq('application_id', application.id).eq('cache_key', stored.cache_key)
            : await client.from('connection_application_genre_reviews').upsert(queued,
                { onConflict: 'application_id', ignoreDuplicates: true })
        results.set(application.id, { status: queueError ? 'failed' : 'queued' })
        if (!queueError) await schedule(application.id)
    }
    return results
}

export async function runConnectionGenreReview(client: any, applicationId: string, supabaseUrl: string) {
    const { data: job, error } = await client.from('connection_application_genre_reviews')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('application_id', applicationId).eq('status', 'queued').select('*').maybeSingle()
    if (error) throw error
    if (!job) return { status: 'skipped' }
    try {
        const { data: application, error: readError } = await client.from('booking_requests')
            .select('id, sender_id, attachment_url, event_details').eq('id', applicationId).single()
        if (readError) throw readError
        if (connectionGenreReviewKey(application, job.required_genres) !== job.cache_key) {
            await client.from('connection_application_genre_reviews').delete()
                .eq('application_id', applicationId).eq('cache_key', job.cache_key)
            return { status: 'stale' }
        }
        const result = await reviewConnectionGenres(application, job.required_genres, supabaseUrl)
        const { error: saveError } = await client.from('connection_application_genre_reviews')
            .update({ status: 'completed', result, updated_at: new Date().toISOString() })
            .eq('application_id', applicationId).eq('cache_key', job.cache_key)
        if (saveError) throw saveError
        return { status: 'completed' }
    } catch (error) {
        await client.from('connection_application_genre_reviews')
            .update({ status: 'failed', result: {}, updated_at: new Date().toISOString() })
            .eq('application_id', applicationId).eq('cache_key', job.cache_key)
        throw error
    }
}
