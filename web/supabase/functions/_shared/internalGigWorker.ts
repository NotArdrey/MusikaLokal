import { createClient } from 'npm:@supabase/supabase-js@2'

const APPLICATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function bearerToken(request: Request) {
    const header = String(request.headers.get('Authorization') || '').trim()
    return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
}

export async function handleInternalGigWorker(
    request: Request,
    run: (client: any, applicationId: string, supabaseUrl: string) => Promise<unknown>,
) {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
        })
    }

    const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').trim()
    const serviceRoleKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim()
    if (!supabaseUrl || !serviceRoleKey) {
        return new Response(JSON.stringify({ error: 'Worker is not configured' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
        })
    }
    if (bearerToken(request) !== serviceRoleKey) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
        })
    }

    let body: any
    try {
        body = await request.json()
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        })
    }
    const applicationId = String(body?.applicationId || '').trim()
    if (!APPLICATION_ID_PATTERN.test(applicationId)) {
        return new Response(JSON.stringify({ error: 'A valid applicationId is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        })
    }

    const client = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
    const work = run(client, applicationId, supabaseUrl).catch((error) => {
        console.warn('internal_gig_worker_failed', {
            applicationId,
            message: String(error?.message || error).slice(0, 300),
        })
        throw error
    })
    const edgeRuntime = (globalThis as any)?.EdgeRuntime
    if (typeof edgeRuntime?.waitUntil === 'function') {
        edgeRuntime.waitUntil(work)
        return new Response(JSON.stringify({ application_id: applicationId, status: 'accepted' }), {
            status: 202,
            headers: { 'Content-Type': 'application/json' },
        })
    }

    const result = await work
    return new Response(JSON.stringify({ application_id: applicationId, result }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    })
}
