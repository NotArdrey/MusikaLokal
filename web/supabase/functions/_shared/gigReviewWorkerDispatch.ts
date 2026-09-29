type WorkerName = 'gig-cv-review' | 'gig-video-review' | 'gig-member-verification'

const clean = (value: unknown) => String(value || '').trim()

async function invokeWorker(workerName: WorkerName, applicationId: string, supabaseUrl: string) {
    const serviceRoleKey = clean(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))
    const baseUrl = clean(supabaseUrl || Deno.env.get('SUPABASE_URL')).replace(/\/$/, '')
    if (!serviceRoleKey || !baseUrl) throw new Error('Worker dispatch is not configured')

    const response = await fetch(`${baseUrl}/functions/v1/${workerName}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ applicationId }),
    })
    if (!response.ok) {
        throw new Error(`${workerName} returned HTTP ${response.status}`)
    }
}

export function scheduleGigReviewWorkers(applicationId: string, supabaseUrl: string) {
    const work = Promise.allSettled([
        invokeWorker('gig-cv-review', applicationId, supabaseUrl),
        invokeWorker('gig-video-review', applicationId, supabaseUrl),
    ]).then((results) => {
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.warn('gig_review_worker_dispatch_failed', {
                    applicationId,
                    worker: index === 0 ? 'cv' : 'video',
                    message: clean(result.reason?.message || result.reason).slice(0, 300),
                })
            }
        })
    })

    const edgeRuntime = (globalThis as any)?.EdgeRuntime
    if (typeof edgeRuntime?.waitUntil === 'function') {
        edgeRuntime.waitUntil(work)
        return
    }
    return work
}

export function scheduleGigMemberVerificationWorker(applicationId: string, supabaseUrl = '') {
    const work = invokeWorker('gig-member-verification', applicationId, supabaseUrl).catch((error) => {
        console.warn('gig_member_verification_worker_dispatch_failed', {
            applicationId,
            message: clean(error?.message || error).slice(0, 300),
        })
    })
    const edgeRuntime = (globalThis as any)?.EdgeRuntime
    if (typeof edgeRuntime?.waitUntil === 'function') {
        edgeRuntime.waitUntil(work)
        return
    }
    return work
}

