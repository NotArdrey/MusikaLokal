// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
}

type NormalizedReportTargetType = 'group' | 'studio' | 'gig' | 'profile' | 'product' | 'project' | 'playlist'
type FavoriteTargetType = 'group' | 'studio' | 'gig' | 'profile'

const reportTargetTableMap: Record<NormalizedReportTargetType, string> = {
    group: 'groups',
    studio: 'studios',
    gig: 'gigs',
    profile: 'profiles',
    product: 'products',
    project: 'producer_projects',
    playlist: 'playlists',
}

const favoriteTargetColumnMap: Record<FavoriteTargetType, string> = {
    group: 'group_id',
    studio: 'studio_id',
    gig: 'gig_id',
    profile: 'profile_id',
}

const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const isUuid = (value: string): boolean => uuidPattern.test(value)

const normalizeReportTargetType = (rawType: unknown): NormalizedReportTargetType | null => {
    const value = String(rawType || '').trim().toLowerCase()

    if (value === 'venue') return 'studio'
    if (value === 'artist' || value === 'user') return 'profile'
    if (value === 'producer project' || value === 'producer_project') return 'project'
    if (value === 'music') return 'playlist'
    if (
        value === 'group' ||
        value === 'studio' ||
        value === 'gig' ||
        value === 'profile' ||
        value === 'product' ||
        value === 'project' ||
        value === 'playlist'
    ) {
        return value
    }

    return null
}

const normalizeFavoriteTargetType = (rawType: unknown): FavoriteTargetType | null => {
    const value = String(rawType || '').trim().toLowerCase()

    if (value === 'venue') return 'studio'
    if (value === 'artist' || value === 'user') return 'profile'
    if (value === 'group' || value === 'studio' || value === 'gig' || value === 'profile') {
        return value
    }

    return null
}

const getFavoriteTargetColumn = (type: FavoriteTargetType): string => favoriteTargetColumnMap[type]

const normalizeRequiredText = (rawValue: unknown, maxLength: number): string => {
    const value = typeof rawValue === 'string' ? rawValue.trim() : ''
    if (!value) return ''
    return value.slice(0, maxLength)
}

const normalizeOptionalText = (rawValue: unknown, maxLength: number): string | null => {
    if (typeof rawValue !== 'string') return null
    const value = rawValue.trim()
    if (!value) return null
    return value.slice(0, maxLength)
}

const getFavoritesCount = async (
    client: any,
    type: FavoriteTargetType,
    id: string,
): Promise<number> => {
    const { count, error } = await client
        .from('favorites')
        .select('id', { count: 'exact', head: true })
        .eq(getFavoriteTargetColumn(type), id)

    if (error) throw error
    return count || 0
}

const assertReportTargetExists = async (
    client: any,
    targetType: NormalizedReportTargetType,
    targetId: string,
) => {
    const tableName = reportTargetTableMap[targetType]

    const { data, error } = await client
        .from(tableName)
        .select('id')
        .eq('id', targetId)
        .maybeSingle()

    if (error) throw error
    if (!data) {
        throw new Error(`Cannot report missing ${targetType}.`)
    }
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseClient = createClient(
            // @ts-ignore
            Deno.env.get('SUPABASE_URL') ?? '',
            // @ts-ignore
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        const { action, ...params } = await req.json()
        const { userId, type, id } = params // type: 'group' | 'studio' | 'gig'

        // 1. FETCH DETAILS (using views with computed stats)
        if (action === 'fetch') {
            const viewName = type + 's_with_stats' // groups_with_stats, studios_with_stats, gigs_with_stats

            // Fetch Main Entity from view with computed stats
            const { data: entity, error: entityError } = await supabaseClient
                .from(viewName)
                .select('*')
                .eq('id', id)
                .single()

            if (entityError) throw entityError

            if (type === 'group') {
                const { data: mediaRows, error: mediaError } = await supabaseClient
                    .from('group_media')
                    .select('media_url, sort_order, created_at')
                    .eq('group_id', id)
                    .eq('media_type', 'image')
                    .order('sort_order', { ascending: true })
                    .order('created_at', { ascending: true })

                if (!mediaError) {
                    const mediaImages = (mediaRows || [])
                        .map((row: any) => row.media_url)
                        .filter((url: any) => typeof url === 'string' && url.trim().length > 0)

                    if (mediaImages.length > 0) {
                        entity.images = mediaImages
                    } else if (!Array.isArray(entity.images)) {
                        entity.images = []
                    }
                } else if (!Array.isArray(entity.images)) {
                    entity.images = []
                }
            }

            // Check Ownership
            let isOwner = false
            if (type === 'gig') {
                isOwner = entity.organizer_id === userId
            } else {
                isOwner = entity.owner_id === userId
            }

            // Check if Favorited for current viewer
            let isFavorited = false
            if (userId) {
                const { count, error: favoriteCheckError } = await supabaseClient
                    .from('favorites')
                    .select('id', { count: 'exact', head: true })
                    .eq('user_id', userId)
                    .eq(type + '_id', id)

                if (favoriteCheckError) throw favoriteCheckError
                isFavorited = (count || 0) > 0
            }

            const favoritesCount = await getFavoritesCount(supabaseClient, type, id)

            // Fetch Reviews with computed likes count (using view)
            const { data: reviews } = await supabaseClient
                .from('reviews_with_stats')
                .select('*, profiles(full_name, avatar_url)')
                .eq(type + '_id', id)
                .order('created_at', { ascending: false })
                .limit(5)

            // Map computed fields to expected names for frontend compatibility
            const mappedReviews = (reviews || []).map((r: any) => ({
                ...r,
                likes_count: r.computed_likes_count || 0
            }))

            return new Response(JSON.stringify({
                ...entity,
                rating: entity.computed_rating || 0,
                review_count: entity.computed_review_count || 0,
                is_owner: isOwner,
                is_favorited: isFavorited,
                favorites_count: favoritesCount,
                reviews: mappedReviews
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // 2. TOGGLE FAVORITE
        if (action === 'toggle_favorite') {
            const normalizedType = normalizeFavoriteTargetType(type)
            if (!normalizedType) {
                throw new Error('Invalid favorite target type.')
            }

            const favoriteColumn = getFavoriteTargetColumn(normalizedType)

            // Check if exists
            const { data: existing, error: existingError } = await supabaseClient
                .from('favorites')
                .select('id')
                .eq('user_id', userId)
                .eq(favoriteColumn, id)
                .maybeSingle()

            if (existingError) throw existingError

            if (existing) {
                // Remove
                const { error: deleteError } = await supabaseClient.from('favorites').delete().eq('id', existing.id)
                if (deleteError) throw deleteError

                const favoritesCount = await getFavoritesCount(supabaseClient, normalizedType, id)
                return new Response(
                    JSON.stringify({ is_favorited: false, favorites_count: favoritesCount }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
                )
            } else {
                // Add
                const payload: any = { user_id: userId }
                payload[favoriteColumn] = id

                const { error: insertError } = await supabaseClient.from('favorites').insert(payload)
                if (insertError) throw insertError

                const favoritesCount = await getFavoritesCount(supabaseClient, normalizedType, id)
                return new Response(
                    JSON.stringify({ is_favorited: true, favorites_count: favoritesCount }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
                )
            }
        }

        // 3. SUBMIT REVIEW
        if (action === 'review') {
            const { rating, content } = params
            const payload: any = {
                author_id: userId,
                rating,
                content
            }
            payload[type + '_id'] = id

            const { data, error } = await supabaseClient.from('reviews').insert(payload).select()
            if (error) throw error

            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // 4. REPORT
        if (action === 'report') {
            const normalizedUserId = String(userId || '').trim()
            const normalizedTargetType = normalizeReportTargetType(type)
            const normalizedTargetId = String(id || '').trim()
            const normalizedReason = normalizeRequiredText(params.reason, 180)
            const normalizedDetails = normalizeOptionalText(params.details, 1000)

            if (!normalizedUserId || !isUuid(normalizedUserId)) {
                throw new Error('A valid userId is required to submit a report.')
            }

            if (!normalizedTargetType) {
                throw new Error('Invalid report target type.')
            }

            if (!normalizedTargetId || !isUuid(normalizedTargetId)) {
                throw new Error('Invalid report target id.')
            }

            if (!normalizedReason) {
                throw new Error('Report reason is required.')
            }

            if (normalizedTargetType === 'profile' && normalizedTargetId === normalizedUserId) {
                throw new Error('You cannot report your own profile.')
            }

            await assertReportTargetExists(
                supabaseClient,
                normalizedTargetType,
                normalizedTargetId,
            )

            const { data: existingPendingReport, error: existingPendingReportError } = await supabaseClient
                .from('reports')
                .select('id')
                .eq('reporter_id', normalizedUserId)
                .eq('target_type', normalizedTargetType)
                .eq('target_id', normalizedTargetId)
                .eq('reason', normalizedReason)
                .eq('status', 'pending')
                .limit(1)
                .maybeSingle()

            if (existingPendingReportError) throw existingPendingReportError

            if (existingPendingReport?.id) {
                return new Response(
                    JSON.stringify({
                        id: existingPendingReport.id,
                        already_reported: true,
                    }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
                )
            }

            const { data, error } = await supabaseClient
                .from('reports')
                .insert({
                    reporter_id: normalizedUserId,
                    target_type: normalizedTargetType,
                    target_id: normalizedTargetId,
                    reason: normalizedReason,
                    details: normalizedDetails,
                })
                .select()

            if (error) {
                const errorCode = String(error?.code || '').toUpperCase()

                if (errorCode === '23505') {
                    throw new Error('You already have a pending report for this target and reason.')
                }

                if (errorCode === '23503') {
                    throw new Error('This target no longer exists. Please refresh and try again.')
                }

                throw error
            }

            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        throw new Error('Invalid action')

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
