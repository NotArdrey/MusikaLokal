// @ts-ignore
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildNotificationRouteMeta } from "../_shared/notificationRoutes.ts";
import {
    buildGigApplicationAudienceMeta,
    resolveGigApplicationAudience,
} from "../_shared/gigApplicationAudience.ts";
import { scheduleCoreActionEmailForNotification } from "../_shared/coreActionEmail.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
}

function extractAccessToken(authHeader: string): string | null {
    const trimmed = (authHeader || '').trim()
    if (!trimmed) return null

    if (trimmed.toLowerCase().startsWith('bearer ')) {
        const token = trimmed.slice(7).trim()
        return token || null
    }

    return trimmed
}

const ALLOWED_ORGANIZER_STATUSES = new Set(['accepted', 'approved', 'rejected', 'cancelled', 'completed', 'fired'])
const ALLOWED_LEADER_DECISIONS = new Set(['approved', 'rejected'])
const ACTIVE_GIG_APPLICATION_STATUSES = ['pending', 'accepted', 'approved']

async function insertCoreNotification(supabaseClient: any, payload: Record<string, unknown>) {
    const { error } = await supabaseClient
        .from('notifications')
        .insert(payload)

    if (error) {
        console.error('gig_application_notification_failed', { message: error.message })
        return
    }

    scheduleCoreActionEmailForNotification(supabaseClient, payload, { source: 'gig-applications' })
}

async function getVenueStaffAccessLevel(client: any, userId: string, gigId: string): Promise<number | null> {
    if (!userId || !gigId) return null

    const { data, error } = await client
        .from('staff_listing_access')
        .select('access_level')
        .eq('staff_user_id', userId)
        .eq('entity_type', 'venue')
        .eq('gig_id', gigId)
        .is('revoked_at', null)
        .maybeSingle()

    if (error) {
        const message = String(error?.message || '').toLowerCase()
        const code = String(error?.code || '').toLowerCase()
        if (code === '42p01' || message.includes('staff_listing_access')) return null
        throw error
    }

    const level = Number(data?.access_level)
    return level === 1 || level === 2 || level === 3 ? level : null
}

const GIG_APPLICATION_SELECT = `
    *,
    applicant:profiles!applicant_id(id, full_name, avatar_url, role, bio, location, is_verified, verification_status),
    submitter:profiles!submitted_by_user_id(id, full_name, avatar_url, email),
    group:groups!group_id(id, name, genre, description, location, rate, group_type),
    production_team:production_team_id(id, name, logo_url),
    production_roster:production_roster_id(
        id,
        entity_kind,
        profile_id,
        group_id,
        roster_profile:profile_id(id, full_name, avatar_url, role, bio, location, is_verified, verification_status),
        roster_group:group_id(id, name, genre, description, location, rate, group_type)
    )
`

const FEATURE_CONSENT_SELECT = `
    id,
    applicant_id,
    group_id,
    gig_id,
    status,
    feature_consent_status,
    show_on_gig_page,
    show_on_profile,
    feature_consent_requested_at,
    feature_consent_responded_at,
    performer_snapshot,
    gig:gig_id(id, name, organizer_id, event_date, location),
    applicant:applicant_id(id, full_name, avatar_url),
    group:group_id(id, name, owner_id),
    production_roster:production_roster_id(
        id,
        profile_id,
        group_id,
        roster_profile:profile_id(id, full_name, avatar_url),
        roster_group:group_id(id, name, owner_id)
    )
`

const ORGANIZER_APPLICATION_SELECT = `
    *,
    gig:gig_id(name, organizer_id),
    applicant:applicant_id(full_name),
    group:group_id(name),
    production_team:production_team_id(name),
    production_roster:production_roster_id(
        entity_kind,
        roster_profile:profile_id(full_name),
        roster_group:group_id(name)
    )
`

function getApplicationStatusNotification(
    normalizedStatus: string,
    gigName: string,
    productionLabel = '',
) {
    if (normalizedStatus === 'rejected') {
        return {
            type: 'warning',
            title: 'Application Declined',
            message: `Your application for "${gigName}"${productionLabel} has been declined.`,
        }
    }

    if (normalizedStatus === 'accepted' || normalizedStatus === 'approved') {
        return {
            type: 'success',
            title: 'Application Accepted!',
            message: `Your application for "${gigName}"${productionLabel} has been accepted.`,
        }
    }

    if (normalizedStatus === 'fired') {
        return {
            type: 'error',
            title: 'Removed from Gig',
            message: `Your contract for "${gigName}"${productionLabel} has been ended by the gig.`,
        }
    }

    if (normalizedStatus === 'cancelled') {
        return {
            type: 'error',
            title: 'Gig Cancelled',
            message: `Your contract for "${gigName}"${productionLabel} has been cancelled.`,
        }
    }

    if (normalizedStatus === 'completed') {
        return {
            type: 'success',
            title: 'Gig Completed',
            message: `Your contract for "${gigName}"${productionLabel} has been marked as completed.`,
        }
    }

    if (normalizedStatus === 'resigned') {
        return {
            type: 'warning',
            title: 'Musician Withdrew',
            message: `A performer withdrew from "${gigName}"${productionLabel}.`,
        }
    }

    return null
}

async function notifyGigApplicationAudience(
    supabaseClient: any,
    applicationId: string,
    normalizedStatus: string,
    options: {
        gigName: string;
        productionLabel?: string;
        actorUserId?: string | null;
        performerName?: string | null;
        includeOrganizer?: boolean;
    },
) {
    const notification = getApplicationStatusNotification(
        normalizedStatus,
        options.gigName,
        options.productionLabel || '',
    )

    if (!notification) return

    const { application, audience } = await resolveGigApplicationAudience(
        supabaseClient,
        applicationId,
        { includeOrganizer: options.includeOrganizer === true },
    )

    if (!application || audience.length === 0) return

    const eventType = `gig_application_${normalizedStatus}`

    for (const member of audience) {
        if (options.actorUserId && member.user_id === options.actorUserId) {
            continue
        }

        const memberNotification =
            member.viewer_access === 'organizer' && normalizedStatus === 'cancelled'
                ? getApplicationStatusNotification('resigned', options.gigName, options.productionLabel || '')
                : notification

        if (!memberNotification) continue

        await insertCoreNotification(supabaseClient, {
            user_id: member.user_id,
            type: memberNotification.type,
            title: memberNotification.title,
            message: memberNotification.message,
            meta: buildNotificationRouteMeta('/bookings', undefined, buildGigApplicationAudienceMeta(application, member, {
                status: normalizedStatus,
                event_type: eventType,
                performer_name: options.performerName || null,
            })),
        })
    }
}

function uniqueStrings(values: unknown[]) {
    return Array.from(
        new Set(
            values.filter((value): value is string => typeof value === 'string' && value.length > 0),
        ),
    )
}

async function loadProfileLegacyById(supabaseClient: any, profileIds: string[]) {
    const ids = uniqueStrings(profileIds)
    const legacyById = new Map<string, any>()
    if (ids.length === 0) return legacyById

    const { data, error } = await supabaseClient
        .from('profiles_legacy_projection')
        .select('id, skills, genres, portfolio_urls')
        .in('id', ids)

    if (error) throw error

    ;(data || []).forEach((row: any) => legacyById.set(row.id, row))
    return legacyById
}

async function loadGroupLegacyById(supabaseClient: any, groupIds: string[]) {
    const ids = uniqueStrings(groupIds)
    const legacyById = new Map<string, any>()
    if (ids.length === 0) return legacyById

    const { data, error } = await supabaseClient
        .from('groups_legacy_projection')
        .select('id, images, members')
        .in('id', ids)

    if (error) throw error

    ;(data || []).forEach((row: any) => legacyById.set(row.id, row))
    return legacyById
}

async function loadGigLegacyById(supabaseClient: any, gigIds: string[]) {
    const ids = uniqueStrings(gigIds)
    const legacyById = new Map<string, any>()
    if (ids.length === 0) return legacyById

    const { data, error } = await supabaseClient
        .from('gigs_legacy_projection')
        .select('id, images')
        .in('id', ids)

    if (error) throw error

    ;(data || []).forEach((row: any) => legacyById.set(row.id, row))
    return legacyById
}

function mergeProfileLegacy(profile: any, legacyById: Map<string, any>) {
    if (!profile?.id) return profile || null
    const legacy = legacyById.get(profile.id)

    return {
        ...profile,
        skills: Array.isArray(legacy?.skills) ? legacy.skills : [],
        genres: Array.isArray(legacy?.genres) ? legacy.genres : [],
        portfolio_urls: Array.isArray(legacy?.portfolio_urls) ? legacy.portfolio_urls : [],
    }
}

function mergeGroupLegacy(group: any, legacyById: Map<string, any>) {
    if (!group?.id) return group || null
    const legacy = legacyById.get(group.id)

    return {
        ...group,
        images: Array.isArray(legacy?.images) ? legacy.images : [],
        members: Array.isArray(legacy?.members) ? legacy.members : [],
    }
}

function mergeGigLegacy(gig: any, legacyById: Map<string, any>) {
    if (!gig?.id) return gig || null
    const legacy = legacyById.get(gig.id)

    return {
        ...gig,
        images: Array.isArray(legacy?.images) ? legacy.images : [],
    }
}

async function hydrateLegacyApplicationFields(supabaseClient: any, input: any) {
    const rows = Array.isArray(input) ? input : input ? [input] : []
    if (rows.length === 0) return Array.isArray(input) ? [] : null

    const profileIds: string[] = []
    const groupIds: string[] = []
    const gigIds: string[] = []

    rows.forEach((row: any) => {
        profileIds.push(row?.applicant?.id, row?.production_roster?.roster_profile?.id)
        groupIds.push(row?.group?.id, row?.production_roster?.roster_group?.id)
        gigIds.push(row?.gig?.id)
    })

    const [profileLegacyById, groupLegacyById, gigLegacyById] = await Promise.all([
        loadProfileLegacyById(supabaseClient, profileIds),
        loadGroupLegacyById(supabaseClient, groupIds),
        loadGigLegacyById(supabaseClient, gigIds),
    ])

    const hydratedRows = rows.map((row: any) => {
        const productionRoster = row.production_roster
            ? {
                ...row.production_roster,
                roster_profile: mergeProfileLegacy(row.production_roster.roster_profile, profileLegacyById),
                roster_group: mergeGroupLegacy(row.production_roster.roster_group, groupLegacyById),
            }
            : row.production_roster

        return {
            ...row,
            applicant: mergeProfileLegacy(row.applicant, profileLegacyById),
            group: mergeGroupLegacy(row.group, groupLegacyById),
            gig: mergeGigLegacy(row.gig, gigLegacyById),
            production_roster: productionRoster,
        }
    })

    return Array.isArray(input) ? hydratedRows : hydratedRows[0] || null
}

type RecommendationCriterionMode = 'required' | 'preferred' | 'ignore'

const DEFAULT_RECOMMENDATION_SETTINGS = {
    enabled: false,
    minimum_score: 75,
    verified_only: true,
    criteria: {
        genres: 'preferred' as RecommendationCriterionMode,
        instruments: 'required' as RecommendationCriterionMode,
        location: 'preferred' as RecommendationCriterionMode,
        portfolio: 'preferred' as RecommendationCriterionMode,
    },
}

function normalizeCriterionMode(value: unknown, fallback: RecommendationCriterionMode) {
    const normalized = String(value || '').trim().toLowerCase()
    return normalized === 'required' || normalized === 'preferred' || normalized === 'ignore'
        ? normalized as RecommendationCriterionMode
        : fallback
}

function normalizeRecommendationSettings(value: any) {
    const criteria = value?.criteria && typeof value.criteria === 'object' ? value.criteria : {}
    const parsedMinimum = Number(value?.minimum_score)

    return {
        enabled: value?.enabled === true,
        minimum_score: Number.isFinite(parsedMinimum)
            ? Math.max(50, Math.min(95, Math.round(parsedMinimum)))
            : DEFAULT_RECOMMENDATION_SETTINGS.minimum_score,
        verified_only: true,
        criteria: {
            genres: normalizeCriterionMode(criteria.genres, DEFAULT_RECOMMENDATION_SETTINGS.criteria.genres),
            instruments: normalizeCriterionMode(criteria.instruments, DEFAULT_RECOMMENDATION_SETTINGS.criteria.instruments),
            location: normalizeCriterionMode(criteria.location, DEFAULT_RECOMMENDATION_SETTINGS.criteria.location),
            portfolio: normalizeCriterionMode(criteria.portfolio, DEFAULT_RECOMMENDATION_SETTINGS.criteria.portfolio),
        },
    }
}

function normalizeMatchValue(value: unknown) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function stringValues(values: unknown[]) {
    return uniqueStrings(
        values
            .flatMap((value) => Array.isArray(value) ? value : [value])
            .map((value) => typeof value === 'string' ? value.trim() : '')
            .filter(Boolean),
    )
}

function valuesOverlap(expected: string[], actual: string[]) {
    const normalizedActual = actual.map(normalizeMatchValue).filter(Boolean)
    return expected.some((expectedValue) => {
        const normalizedExpected = normalizeMatchValue(expectedValue)
        if (!normalizedExpected) return false
        return normalizedActual.some((actualValue) =>
            actualValue === normalizedExpected ||
            actualValue.includes(normalizedExpected) ||
            normalizedExpected.includes(actualValue)
        )
    })
}

function getApplicationPerformer(application: any) {
    const rosterProfile = application?.production_roster?.roster_profile
    const rosterGroup = application?.production_roster?.roster_group
    const profile = rosterProfile || application?.applicant || null
    const group = rosterGroup || application?.group || null
    const memberInstruments = Array.isArray(group?.members)
        ? group.members.map((member: any) => typeof member === 'string' ? '' : member?.instrument)
        : []

    return {
        profile,
        group,
        verified: profile?.is_verified === true &&
            String(profile?.verification_status || '').trim().toUpperCase() === 'APPROVED',
        genres: stringValues([profile?.genres, group?.genre]),
        instruments: stringValues([profile?.skills, memberInstruments]),
        location: String(group?.location || profile?.location || '').trim(),
        hasPortfolio: Boolean(
            application?.video_url ||
            application?.cv_url ||
            (Array.isArray(profile?.portfolio_urls) && profile.portfolio_urls.length > 0)
        ),
    }
}

function getRequirementValues(requirements: any, application: any) {
    const slotType = String(application?.slot_type || '').trim().toLowerCase()
    const slot = requirements?.slots?.[slotType] || {}

    return {
        genres: stringValues([requirements?.genres, slot?.preferred_genres]),
        instruments: stringValues([requirements?.instruments, slot?.preferred_instruments, slot?.roles]),
        location: String(requirements?.location || '').trim(),
    }
}

function evaluateGigApplication(application: any, requirements: any, settings: ReturnType<typeof normalizeRecommendationSettings>) {
    const performer = getApplicationPerformer(application)
    const expected = getRequirementValues(requirements, application)
    const matched: string[] = []
    const missing: string[] = []
    let possiblePoints = 20
    let earnedPoints = performer.verified ? 20 : 0
    let missingRequired = !performer.verified

    if (performer.verified) matched.push('Verified identity')
    else missing.push('Verified identity')

    const applyCriterion = (
        key: keyof typeof settings.criteria,
        label: string,
        weight: number,
        isConfigured: boolean,
        isMatch: boolean,
    ) => {
        const mode = settings.criteria[key]
        if (mode === 'ignore' || !isConfigured) return
        possiblePoints += weight
        if (isMatch) {
            earnedPoints += weight
            matched.push(label)
        } else {
            missing.push(label)
            if (mode === 'required') missingRequired = true
        }
    }

    applyCriterion(
        'instruments',
        'Required instruments or roles',
        30,
        expected.instruments.length > 0,
        valuesOverlap(expected.instruments, performer.instruments),
    )
    applyCriterion(
        'genres',
        'Preferred genres',
        25,
        expected.genres.length > 0,
        valuesOverlap(expected.genres, performer.genres),
    )

    const gigLocation = String(requirements?.gig_location || requirements?.location || '').trim()
    const normalizedGigLocation = normalizeMatchValue(gigLocation)
    const normalizedPerformerLocation = normalizeMatchValue(performer.location)
    applyCriterion(
        'location',
        'Location',
        10,
        Boolean(normalizedGigLocation),
        Boolean(
            normalizedGigLocation &&
            normalizedPerformerLocation &&
            (normalizedGigLocation.includes(normalizedPerformerLocation) ||
                normalizedPerformerLocation.includes(normalizedGigLocation))
        ),
    )
    applyCriterion('portfolio', 'Portfolio or application media', 15, true, performer.hasPortfolio)

    const score = Math.max(0, Math.min(100, Math.round((earnedPoints / Math.max(possiblePoints, 1)) * 100)))
    const isEligible = performer.verified && !missingRequired
    const recommendationStatus = isEligible && score >= settings.minimum_score
        ? 'recommended'
        : isEligible
            ? 'possible_match'
            : 'not_eligible'
    const explanation = recommendationStatus === 'recommended'
        ? `Verified applicant with a ${score}% fit based on the gig's saved requirements.`
        : recommendationStatus === 'possible_match'
            ? `Verified applicant with a ${score}% fit; review the unmatched preferences before deciding.`
            : 'Not recommended because verification or a required criterion is missing.'

    return {
        application_id: application.id,
        gig_id: application.gig_id,
        score,
        is_verified: performer.verified,
        is_eligible: isEligible,
        recommendation_status: recommendationStatus,
        matched_criteria: matched,
        missing_criteria: missing,
        explanation,
        criteria_snapshot: { settings, requirements: expected },
        model_provider: 'rules',
        model_version: 'gig-fit-v1',
    }
}

async function addGroqRecommendationExplanations(evaluations: any[]) {
    const apiKey = Deno.env.get('GROQ_API_KEY') || ''
    if (!apiKey || evaluations.length === 0) return evaluations

    try {
        const model = Deno.env.get('GROQ_MODEL') || 'llama-3.3-70b-versatile'
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                temperature: 0.1,
                response_format: { type: 'json_object' },
                messages: [
                    {
                        role: 'system',
                        content: 'Explain structured gig-applicant fit results. Never accept or reject applicants. Return JSON only as {"recommendations":[{"application_id":"uuid","explanation":"one concise neutral sentence"}]}. Do not infer protected or personal traits.',
                    },
                    {
                        role: 'user',
                        content: JSON.stringify(evaluations.map((item) => ({
                            application_id: item.application_id,
                            score: item.score,
                            status: item.recommendation_status,
                            matched: item.matched_criteria,
                            missing: item.missing_criteria,
                        }))),
                    },
                ],
            }),
            signal: AbortSignal.timeout(8000),
        })

        if (!response.ok) return evaluations
        const payload = await response.json()
        const content = payload?.choices?.[0]?.message?.content
        const parsed = typeof content === 'string' ? JSON.parse(content) : null
        const explanationById = new Map(
            (Array.isArray(parsed?.recommendations) ? parsed.recommendations : [])
                .filter((item: any) => typeof item?.application_id === 'string' && typeof item?.explanation === 'string')
                .map((item: any) => [item.application_id, item.explanation.trim()]),
        )

        return evaluations.map((item) => ({
            ...item,
            explanation: explanationById.get(item.application_id) || item.explanation,
            model_provider: explanationById.has(item.application_id) ? 'groq' : item.model_provider,
            model_version: explanationById.has(item.application_id) ? model : item.model_version,
        }))
    } catch (error) {
        console.warn('gig_recommendation_ai_explanation_failed', { message: String((error as any)?.message || error) })
        return evaluations
    }
}

async function attachGigApplicationRecommendations(supabaseClient: any, gigId: string, applications: any[]) {
    const [
        { data: requirementRows, error: requirementError },
        { data: gigRecord, error: gigError },
    ] = await Promise.all([
        supabaseClient
            .from('gig_requirements')
            .select('requirement_key, requirement_value')
            .eq('gig_id', gigId),
        supabaseClient
            .from('gigs')
            .select('location')
            .eq('id', gigId)
            .maybeSingle(),
    ])

    if (requirementError) throw requirementError
    if (gigError) throw gigError

    const requirements = (requirementRows || []).reduce((acc: Record<string, any>, row: any) => {
        if (row?.requirement_key) acc[row.requirement_key] = row.requirement_value
        return acc
    }, {})
    requirements.gig_location = gigRecord?.location || requirements.location || ''

    const settings = normalizeRecommendationSettings(requirements.ai_recommendation_settings)
    if (!settings.enabled) {
        return applications.map((application) => ({ ...application, ai_recommendation: null }))
    }

    let evaluations = applications.map((application) => evaluateGigApplication(application, requirements, settings))
    evaluations = await addGroqRecommendationExplanations(evaluations)

    if (evaluations.length > 0) {
        const now = new Date().toISOString()
        const { error: upsertError } = await supabaseClient
            .from('gig_application_recommendations')
            .upsert(
                evaluations.map((item) => ({ ...item, generated_at: now, updated_at: now })),
                { onConflict: 'application_id' },
            )

        if (upsertError) {
            console.warn('gig_recommendation_audit_upsert_failed', { message: upsertError.message })
        }
    }

    const evaluationById = new Map(evaluations.map((item) => [item.application_id, item]))
    return applications
        .map((application) => ({
            ...application,
            ai_recommendation: evaluationById.get(application.id) || null,
        }))
        .sort((left, right) => {
            const leftRecommendation = left.ai_recommendation
            const rightRecommendation = right.ai_recommendation
            if (leftRecommendation?.is_eligible !== rightRecommendation?.is_eligible) {
                return Number(rightRecommendation?.is_eligible || false) - Number(leftRecommendation?.is_eligible || false)
            }
            return Number(rightRecommendation?.score || 0) - Number(leftRecommendation?.score || 0)
        })
}

async function getFeatureConsentApplication(supabaseClient: any, applicationId: string) {
    const { data, error } = await supabaseClient
        .from('gig_applications')
        .select(FEATURE_CONSENT_SELECT)
        .eq('id', applicationId)
        .maybeSingle()

    if (error) throw error
    return data || null
}

async function getGroupFeatureConsentActors(supabaseClient: any, groupId: string | null) {
    if (!groupId) return [] as string[]

    const [{ data: group, error: groupError }, { data: members, error: memberError }] = await Promise.all([
        supabaseClient.from('groups').select('owner_id').eq('id', groupId).maybeSingle(),
        supabaseClient
            .from('group_members')
            .select('user_id, role')
            .eq('group_id', groupId)
            .in('role', ['owner', 'admin']),
    ])

    if (groupError) throw groupError
    if (memberError) throw memberError
    return uniqueStrings([group?.owner_id, ...(members || []).map((member: any) => member?.user_id)])
}

async function getFeatureConsentActorIds(supabaseClient: any, application: any) {
    const rosterProfileId = application?.production_roster?.profile_id
    const visibleGroupId = application?.production_roster?.group_id || application?.group_id
    if (visibleGroupId) return getGroupFeatureConsentActors(supabaseClient, visibleGroupId)
    if (rosterProfileId) return [rosterProfileId]
    return uniqueStrings([application?.applicant_id])
}

async function notifyGigFeatureConsentRequest(supabaseClient: any, applicationId: string) {
    const application = await getFeatureConsentApplication(supabaseClient, applicationId)
    if (!application) return

    const actorIds = await getFeatureConsentActorIds(supabaseClient, application)
    const gigName = application?.gig?.name || 'the gig'
    for (const userId of actorIds) {
        await insertCoreNotification(supabaseClient, {
            user_id: userId,
            type: 'info',
            title: 'Featuring permission requested',
            message: `You were accepted for "${gigName}". Choose whether you want to be featured on the gig page or your public profile.`,
            meta: buildNotificationRouteMeta('/gig_feature_consent', { applicationId }, {
                event_type: 'gig_feature_consent_requested',
                application_id: applicationId,
                gig_id: application.gig_id,
                consent_status: 'pending',
            }),
        })
    }
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const authHeader = req.headers.get('Authorization') || ''
        const accessToken = extractAccessToken(authHeader)

        if (!accessToken) {
            return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            })
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

        if (!supabaseUrl || !serviceRoleKey) {
            console.error('Missing Supabase env vars')
            return new Response(JSON.stringify({ error: 'Server misconfiguration: Missing Supabase env vars' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500,
            })
        }

        const supabaseClient = createClient(
            supabaseUrl,
            serviceRoleKey,
        )

        const {
            data: { user: authUser },
            error: authUserError,
        } = await supabaseClient.auth.getUser(accessToken)

        if (authUserError || !authUser) {
            return new Response(JSON.stringify({ error: 'Invalid token' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            })
        }

        const authenticatedUserId = authUser.id

        const { action, ...params } = await req.json()
        const { userId } = params

        if (userId && userId !== authenticatedUserId) {
            return new Response(JSON.stringify({ error: 'Forbidden: userId mismatch' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 403,
            })
        }

        const effectiveUserId = userId || authenticatedUserId

        // FETCH GIG APPLICATIONS (for gig owner)
        if (action === 'fetch_gig_applications') {
            const { gigId } = params;

            if (!gigId) {
                return new Response(JSON.stringify({ error: 'gigId is required' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            const { data: gigRecord, error: gigError } = await supabaseClient
                .from('gigs')
                .select('id, organizer_id')
                .eq('id', gigId)
                .single();

            if (gigError || !gigRecord) {
                return new Response(JSON.stringify({ error: 'Gig not found' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 404,
                })
            }

            const venueStaffAccessLevel = await getVenueStaffAccessLevel(supabaseClient, effectiveUserId, gigId)
            if (gigRecord.organizer_id !== effectiveUserId && !(venueStaffAccessLevel !== null && venueStaffAccessLevel <= 2)) {
                return new Response(JSON.stringify({ error: 'Forbidden' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                })
            }

            const { data, error } = await supabaseClient
                .from('gig_applications')
                .select(GIG_APPLICATION_SELECT)
                .eq('gig_id', gigId)
                .or('leader_approval_status.is.null,leader_approval_status.eq.approved')
                .order('created_at', { ascending: false });

            if (error) throw error;
            const hydratedData = await hydrateLegacyApplicationFields(supabaseClient, data || [])
            const rankedData = await attachGigApplicationRecommendations(supabaseClient, gigId, hydratedData)
            return new Response(JSON.stringify(rankedData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        // FETCH PENDING APPLICATION RECOMMENDATIONS FOR THE OWNER'S BOOKINGS PAGE
        if (action === 'fetch_manager_pending_recommendations') {
            const requestedGigIds = uniqueStrings(
                Array.isArray(params.gigIds) ? params.gigIds : [],
            ).slice(0, 25)

            if (requestedGigIds.length === 0) {
                return new Response(JSON.stringify([]), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200,
                })
            }

            const { data: gigRecords, error: gigError } = await supabaseClient
                .from('gigs')
                .select('id, organizer_id')
                .in('id', requestedGigIds)

            if (gigError) throw gigError

            const allowedGigIds = (
                await Promise.all((gigRecords || []).map(async (gigRecord: any) => {
                    if (gigRecord.organizer_id === effectiveUserId) return gigRecord.id
                    const accessLevel = await getVenueStaffAccessLevel(
                        supabaseClient,
                        effectiveUserId,
                        gigRecord.id,
                    )
                    return accessLevel !== null && accessLevel <= 2 ? gigRecord.id : null
                }))
            ).filter((gigId): gigId is string => typeof gigId === 'string')

            if (allowedGigIds.length === 0) {
                return new Response(JSON.stringify([]), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200,
                })
            }

            const { data, error } = await supabaseClient
                .from('gig_applications')
                .select(GIG_APPLICATION_SELECT)
                .in('gig_id', allowedGigIds)
                .eq('status', 'pending')
                .or('leader_approval_status.is.null,leader_approval_status.eq.approved')
                .order('created_at', { ascending: false })

            if (error) throw error

            const hydratedData = await hydrateLegacyApplicationFields(supabaseClient, data || [])
            const applicationIds = hydratedData.map((application: any) => application.id).filter(Boolean)
            const [recommendationResult, settingsResult] = await Promise.all([
                applicationIds.length > 0
                    ? supabaseClient
                        .from('gig_application_recommendations')
                        .select('*')
                        .in('application_id', applicationIds)
                    : Promise.resolve({ data: [], error: null }),
                supabaseClient
                    .from('gig_requirements')
                    .select('gig_id, requirement_value')
                    .in('gig_id', allowedGigIds)
                    .eq('requirement_key', 'ai_recommendation_settings'),
            ])
            const { data: existingRecommendations, error: recommendationError } = recommendationResult

            if (recommendationError) throw recommendationError
            if (settingsResult.error) throw settingsResult.error

            const recommendationEnabledGigIds = new Set(
                (settingsResult.data || [])
                    .filter((row: any) => normalizeRecommendationSettings(row.requirement_value).enabled)
                    .map((row: any) => row.gig_id),
            )
            const freshRecommendationCutoff = Date.now() - (5 * 60 * 1000)

            const existingByApplicationId = new Map(
                (existingRecommendations || [])
                    .filter((recommendation: any) =>
                        recommendationEnabledGigIds.has(recommendation.gig_id) &&
                        new Date(recommendation.generated_at || 0).getTime() >= freshRecommendationCutoff
                    )
                    .map((recommendation: any) => [
                        recommendation.application_id,
                        recommendation,
                    ]),
            )
            const applicationsByGig = new Map<string, any[]>()
            hydratedData.forEach((application: any) => {
                if (
                    !recommendationEnabledGigIds.has(application.gig_id) ||
                    existingByApplicationId.has(application.id)
                ) return
                const existing = applicationsByGig.get(application.gig_id) || []
                existing.push(application)
                applicationsByGig.set(application.gig_id, existing)
            })

            const rankedGroups = await Promise.all(
                Array.from(applicationsByGig.entries()).map(([gigId, applications]) =>
                    attachGigApplicationRecommendations(supabaseClient, gigId, applications),
                ),
            )

            const generatedByApplicationId = new Map(
                rankedGroups.flat().map((application: any) => [application.id, application.ai_recommendation || null]),
            )
            const rankedApplications = hydratedData
                .map((application: any) => ({
                    ...application,
                    ai_recommendation: existingByApplicationId.get(application.id) ||
                        generatedByApplicationId.get(application.id) ||
                        null,
                }))
                .sort((left: any, right: any) => {
                    const leftRecommendation = left.ai_recommendation
                    const rightRecommendation = right.ai_recommendation
                    if (leftRecommendation?.is_eligible !== rightRecommendation?.is_eligible) {
                        return Number(rightRecommendation?.is_eligible || false) - Number(leftRecommendation?.is_eligible || false)
                    }
                    return Number(rightRecommendation?.score || 0) - Number(leftRecommendation?.score || 0)
                })

            return new Response(JSON.stringify(rankedApplications), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        if (action === 'fetch_feature_consent') {
            const { applicationId } = params
            if (!applicationId) {
                return new Response(JSON.stringify({ error: 'applicationId is required' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            const application = await getFeatureConsentApplication(supabaseClient, applicationId)
            if (!application) {
                return new Response(JSON.stringify({ error: 'Application not found' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 404,
                })
            }

            const actorIds = await getFeatureConsentActorIds(supabaseClient, application)
            if (!actorIds.includes(effectiveUserId)) {
                return new Response(JSON.stringify({ error: 'Only the selected performer or authorized group leader can manage featuring permission' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                })
            }

            return new Response(JSON.stringify(application), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        if (action === 'respond_feature_consent') {
            const { applicationId, showOnGigPage, showOnProfile } = params
            if (!applicationId) {
                return new Response(JSON.stringify({ error: 'applicationId is required' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            const application = await getFeatureConsentApplication(supabaseClient, applicationId)
            if (!application) {
                return new Response(JSON.stringify({ error: 'Application not found' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 404,
                })
            }

            const actorIds = await getFeatureConsentActorIds(supabaseClient, application)
            if (!actorIds.includes(effectiveUserId)) {
                return new Response(JSON.stringify({ error: 'Only the selected performer or authorized group leader can manage featuring permission' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                })
            }

            if (!['accepted', 'approved'].includes(String(application.status || '').toLowerCase())) {
                return new Response(JSON.stringify({ error: 'Featuring permission is available only for accepted applications' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 409,
                })
            }

            const allowGigPage = showOnGigPage === true
            const allowProfile = showOnProfile === true
            const consentStatus = allowGigPage || allowProfile ? 'accepted' : 'declined'
            const { data: updated, error: updateError } = await supabaseClient
                .from('gig_applications')
                .update({
                    feature_consent_status: consentStatus,
                    show_on_gig_page: allowGigPage,
                    show_on_profile: allowProfile,
                    feature_consent_responded_at: new Date().toISOString(),
                })
                .eq('id', applicationId)
                .select(FEATURE_CONSENT_SELECT)
                .single()

            if (updateError) throw updateError

            if (application?.gig?.organizer_id && application.gig.organizer_id !== effectiveUserId) {
                await insertCoreNotification(supabaseClient, {
                    user_id: application.gig.organizer_id,
                    type: consentStatus === 'accepted' ? 'success' : 'info',
                    title: consentStatus === 'accepted' ? 'Featuring permission granted' : 'Performer chose to stay private',
                    message: consentStatus === 'accepted'
                        ? `An accepted performer for "${application.gig.name || 'your gig'}" approved public featuring.`
                        : `An accepted performer for "${application.gig.name || 'your gig'}" chose not to be publicly featured.`,
                    meta: buildNotificationRouteMeta('/manage_gig', { id: application.gig_id, tab: 'Applicants' }, {
                        event_type: 'gig_feature_consent_updated',
                        application_id: applicationId,
                        gig_id: application.gig_id,
                        consent_status: consentStatus,
                    }),
                })
            }

            return new Response(JSON.stringify(updated), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // FETCH GROUP APPLICATIONS (my applications as a group/musician)
        if (action === 'fetch_group_applications') {
            const { groupId } = params;
            let query = supabaseClient.from('gig_applications').select(`
                *,
                gig:gigs!gig_id(id, name, location, budget, event_date, status)
             `);

            if (groupId) {
                query = query.eq('group_id', groupId);
            } else {
                query = query.eq('applicant_id', effectiveUserId);
            }

            const { data, error } = await query.order('created_at', { ascending: false });

            if (error) throw error;
            const hydratedData = await hydrateLegacyApplicationFields(supabaseClient, data || [])
            return new Response(JSON.stringify(hydratedData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        // SUBMIT PRODUCTION GIG APPLICATION
        if (action === 'submit_production_gig_application') {
            const { gigId, teamId, rosterId, pitchMessage, videoUrl, cvUrl, slotType } = params;

            if (!gigId || !teamId || !rosterId) {
                return new Response(JSON.stringify({ error: 'gigId, teamId, and rosterId are required' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            const { data: teamMembership, error: teamMembershipError } = await supabaseClient
                .from('production_team_members')
                .select('role')
                .eq('team_id', teamId)
                .eq('user_id', effectiveUserId)
                .in('role', ['owner', 'manager'])
                .maybeSingle();

            if (teamMembershipError) throw teamMembershipError;

            if (!teamMembership) {
                return new Response(JSON.stringify({ error: 'Only production team owners or managers can send this application' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                })
            }

            const { data: gigRecord, error: gigError } = await supabaseClient
                .from('gigs')
                .select('id, name, organizer_id, status')
                .eq('id', gigId)
                .single();

            if (gigError || !gigRecord) {
                return new Response(JSON.stringify({ error: 'Gig not found' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 404,
                })
            }

            if (gigRecord.status && String(gigRecord.status).toLowerCase() !== 'open') {
                return new Response(JSON.stringify({ error: 'This gig is not currently accepting applications' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 409,
                })
            }

            const { data: rosterRecord, error: rosterError } = await supabaseClient
                .from('production_team_roster')
                .select(`
                    id,
                    team_id,
                    entity_kind,
                    profile_id,
                    group_id,
                    group:group_id(id, name, group_type)
                `)
                .eq('id', rosterId)
                .eq('team_id', teamId)
                .maybeSingle();

            if (rosterError) throw rosterError;

            if (!rosterRecord) {
                return new Response(JSON.stringify({ error: 'Selected production roster entry was not found' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 404,
                })
            }

            const resolvedSlotType = String(
                slotType ||
                (rosterRecord.group?.group_type === 'duo'
                    ? 'duo'
                    : rosterRecord.group
                        ? 'band'
                        : 'solo'),
            ).toLowerCase();

            if (rosterRecord.profile_id && resolvedSlotType !== 'solo') {
                return new Response(JSON.stringify({ error: 'A musician roster entry can only be submitted to a solo slot' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            if (rosterRecord.group_id && rosterRecord.group?.group_type === 'duo' && resolvedSlotType !== 'duo') {
                return new Response(JSON.stringify({ error: 'A duo roster entry can only be submitted to a duo slot' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            if (rosterRecord.group_id && rosterRecord.group?.group_type === 'band' && resolvedSlotType !== 'band') {
                return new Response(JSON.stringify({ error: 'A group roster entry can only be submitted to a band slot' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            const { data: existingTeamApplication, error: existingTeamApplicationError } = await supabaseClient
                .from('gig_applications')
                .select('id, status')
                .eq('gig_id', gigId)
                .eq('production_team_id', teamId)
                .in('status', ACTIVE_GIG_APPLICATION_STATUSES)
                .maybeSingle();

            if (existingTeamApplicationError) throw existingTeamApplicationError;

            if (existingTeamApplication) {
                return new Response(JSON.stringify({ error: 'This production team already has an active application for the selected gig' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 409,
                })
            }

            const applicationPayload: Record<string, unknown> = {
                applicant_id: effectiveUserId,
                gig_id: gigId,
                group_id: rosterRecord.group_id || null,
                pitch_message: pitchMessage || null,
                video_url: videoUrl || null,
                cv_url: cvUrl || null,
                status: 'pending',
                is_solo_application: !rosterRecord.group_id,
                slot_type: resolvedSlotType,
                submitted_by_user_id: effectiveUserId,
                leader_approval_status: rosterRecord.group_id ? 'approved' : null,
                production_team_id: teamId,
                production_roster_id: rosterId,
            };

            const { data: insertedApplication, error: insertError } = await supabaseClient
                .from('gig_applications')
                .insert(applicationPayload)
                .select(GIG_APPLICATION_SELECT)
                .single();

            if (insertError) {
                if (insertError.code === '23505') {
                    return new Response(JSON.stringify({ error: 'This production team already sent an application for this gig' }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 409,
                    })
                }
                throw insertError;
            }

            const hydratedInsertedApplication = await hydrateLegacyApplicationFields(supabaseClient, insertedApplication)
            const performerName =
                rosterRecord.group?.name ||
                hydratedInsertedApplication?.production_roster?.roster_profile?.full_name ||
                'the selected performer';
            const teamName = hydratedInsertedApplication?.production_team?.name || 'Production team';

            if (gigRecord.organizer_id && gigRecord.organizer_id !== effectiveUserId) {
                await insertCoreNotification(supabaseClient, {
                    user_id: gigRecord.organizer_id,
                    type: 'info',
                    title: 'New Application from a Production Team',
                    message: `${teamName} sent ${performerName} for "${gigRecord.name}".`,
                    meta: buildNotificationRouteMeta('/manage_gig', { id: gigId }, {
                        gig_id: gigId,
                        application_id: insertedApplication.id,
                        production_team_id: teamId,
                        production_roster_id: rosterId,
                        performer_name: performerName,
                    }),
                });
            }

            const { application: audienceApplication, audience } = await resolveGigApplicationAudience(
                supabaseClient,
                insertedApplication.id,
            );

            for (const member of audience) {
                if (member.viewer_can_act || member.user_id === effectiveUserId) {
                    continue;
                }

                await insertCoreNotification(supabaseClient, {
                    user_id: member.user_id,
                    type: 'info',
                    title: 'Application Sent',
                    message: `${teamName} sent ${performerName} for "${gigRecord.name}".`,
                    meta: buildNotificationRouteMeta('/bookings', undefined, buildGigApplicationAudienceMeta(audienceApplication, member, {
                        status: 'pending',
                        event_type: 'production_gig_application_submitted',
                        performer_name: performerName,
                    })),
                });
            }

            return new Response(JSON.stringify(hydratedInsertedApplication), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 201,
            })
        }

        // CHECK EXISTING PRODUCTION GIG APPLICATION
        if (action === 'check_existing_production_application') {
            const { gigId, teamId } = params;

            if (!gigId || !teamId) {
                return new Response(JSON.stringify({ error: 'gigId and teamId are required' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            const { data: membership, error: membershipError } = await supabaseClient
                .from('production_team_members')
                .select('role')
                .eq('team_id', teamId)
                .eq('user_id', effectiveUserId)
                .maybeSingle();

            if (membershipError) throw membershipError;

            if (!membership) {
                return new Response(JSON.stringify({ error: 'Only team members can view this application' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                })
            }

            const { data: application, error } = await supabaseClient
                .from('gig_applications')
                .select(GIG_APPLICATION_SELECT)
                .eq('gig_id', gigId)
                .eq('production_team_id', teamId)
                .in('status', ACTIVE_GIG_APPLICATION_STATUSES)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) throw error;
            const hydratedApplication = await hydrateLegacyApplicationFields(supabaseClient, application || null)

            return new Response(JSON.stringify({ application: hydratedApplication || null }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // UPDATE APPLICATION STATUS
        if (action === 'update_application_status') {
            const { applicationId, status } = params;

            if (!applicationId || !status) {
                return new Response(JSON.stringify({ error: 'applicationId and status are required' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            const normalizedStatus = String(status).toLowerCase();
            if (!ALLOWED_ORGANIZER_STATUSES.has(normalizedStatus)) {
                return new Response(JSON.stringify({ error: `Invalid status: ${status}` }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            const { data: appDetails, error: appError } = await supabaseClient
                .from('gig_applications')
                .select(ORGANIZER_APPLICATION_SELECT)
                .eq('id', applicationId)
                .single();

            if (appError) throw appError;

            const venueStaffAccessLevel = appDetails?.gig_id
                ? await getVenueStaffAccessLevel(supabaseClient, effectiveUserId, appDetails.gig_id)
                : null
            if (
                !appDetails ||
                (
                    appDetails.gig?.organizer_id !== effectiveUserId &&
                    !(venueStaffAccessLevel !== null && venueStaffAccessLevel <= 2)
                )
            ) {
                return new Response(JSON.stringify({ error: 'Forbidden' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                })
            }

            if (appDetails.leader_approval_status === 'pending') {
                return new Response(JSON.stringify({ error: 'Application is still awaiting group leader approval' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 409,
                })
            }

            let data: any = null;

            if (normalizedStatus === 'accepted' || normalizedStatus === 'approved') {
                const { data: acceptedApplication, error: acceptError } = await supabaseClient.rpc(
                    'accept_gig_application_safely',
                    {
                        p_application_id: applicationId,
                        p_actor_user_id: effectiveUserId,
                        p_new_status: normalizedStatus,
                    },
                );

                if (acceptError) throw acceptError;
                data = acceptedApplication;
            } else {
                const { data: updatedApplication, error } = await supabaseClient
                    .from('gig_applications')
                    .update({ status: normalizedStatus })
                    .eq('id', applicationId)
                    .select()
                    .single();

                if (error) throw error;
                data = updatedApplication;
            }

            const gigName = appDetails.gig?.name || 'the gig';
            const performerSnapshot =
                appDetails.performer_snapshot && typeof appDetails.performer_snapshot === 'object'
                    ? appDetails.performer_snapshot
                    : {};
            const performerName =
                appDetails.group?.name ||
                appDetails.production_roster?.roster_profile?.full_name ||
                appDetails.production_roster?.roster_group?.name ||
                performerSnapshot.display_name ||
                appDetails.applicant?.full_name ||
                'Applicant';
            const productionLabel = appDetails.production_team?.name
                ? ` via ${appDetails.production_team.name}`
                : '';
            await notifyGigApplicationAudience(supabaseClient, applicationId, normalizedStatus, {
                gigName,
                productionLabel,
                actorUserId: effectiveUserId,
                performerName,
            });

            if (normalizedStatus === 'accepted' || normalizedStatus === 'approved') {
                await notifyGigFeatureConsentRequest(supabaseClient, applicationId)
            }

            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        // UPDATE LEADER APPROVAL (group leader approves/rejects member-submitted application)
        if (action === 'update_leader_approval') {
            const { applicationId, decision } = params;

            if (!applicationId || !decision) {
                return new Response(JSON.stringify({ error: 'applicationId and decision are required' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            const normalizedDecision = String(decision).toLowerCase();
            if (!ALLOWED_LEADER_DECISIONS.has(normalizedDecision)) {
                return new Response(JSON.stringify({ error: `Invalid decision: ${decision}` }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            const { data: appDetails, error: appError } = await supabaseClient
                .from('gig_applications')
                .select(`
                    id,
                    gig_id,
                    group_id,
                    applicant_id,
                    submitted_by_user_id,
                    status,
                    leader_approval_status,
                    gig:gig_id(id, name, organizer_id),
                    group:group_id(id, name, owner_id)
                `)
                .eq('id', applicationId)
                .single();

            if (appError || !appDetails) {
                return new Response(JSON.stringify({ error: 'Application not found' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 404,
                })
            }

            if (!appDetails.group || appDetails.group.owner_id !== effectiveUserId) {
                return new Response(JSON.stringify({ error: 'Only the group leader can review this application' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                })
            }

            if (appDetails.status !== 'pending') {
                return new Response(JSON.stringify({ error: 'Only pending applications can be reviewed by the group leader' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 409,
                })
            }

            if (appDetails.leader_approval_status && appDetails.leader_approval_status !== 'pending') {
                return new Response(JSON.stringify({ error: 'Application has already been reviewed by the group leader' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 409,
                })
            }

            const updates: Record<string, any> = {
                leader_approval_status: normalizedDecision,
                leader_reviewed_at: new Date().toISOString(),
            };

            if (normalizedDecision === 'rejected') {
                updates.status = 'rejected';
            }

            const { data, error } = await supabaseClient
                .from('gig_applications')
                .update(updates)
                .eq('id', applicationId)
                .select()
                .single();

            if (error) throw error;

            const gigName = appDetails.gig?.name || 'the gig';
            const groupName = appDetails.group?.name || 'your group';
            const submitterId = appDetails.submitted_by_user_id || appDetails.applicant_id;

            if (submitterId && submitterId !== effectiveUserId) {
                await insertCoreNotification(supabaseClient, {
                    user_id: submitterId,
                    type: normalizedDecision === 'approved' ? 'success' : 'warning',
                    title:
                        normalizedDecision === 'approved'
                            ? 'Application Forwarded to Gig'
                            : 'Application Rejected by Group Leader',
                    message:
                        normalizedDecision === 'approved'
                            ? `Your ${groupName} application for "${gigName}" was approved by your group leader and sent to the gig owner.`
                            : `Your ${groupName} application for "${gigName}" was rejected by your group leader.`,
                    meta: buildNotificationRouteMeta('/bookings', undefined, {
                        gig_id: appDetails.gig_id,
                        application_id: applicationId,
                        group_id: appDetails.group_id,
                        leader_approval_status: normalizedDecision,
                    }),
                });
            }

            if (normalizedDecision === 'approved' && appDetails.gig?.organizer_id && appDetails.gig.organizer_id !== effectiveUserId) {
                await insertCoreNotification(supabaseClient, {
                    user_id: appDetails.gig.organizer_id,
                    type: 'info',
                    title: 'New Gig Application',
                    message: `${groupName} has a new application for "${gigName}" awaiting your review.`,
                    meta: buildNotificationRouteMeta('/manage_gig', { id: appDetails.gig_id }, {
                        gig_id: appDetails.gig_id,
                        application_id: applicationId,
                        applicant_id: appDetails.applicant_id,
                        group_id: appDetails.group_id,
                        submitted_by_user_id: appDetails.submitted_by_user_id,
                        leader_approved_by: effectiveUserId,
                    }),
                });
            }

            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        // CHECK ELIGIBILITY (Spam Block Check)
        if (action === 'check_eligibility') {
            const { gigId, groupId, productionTeamId } = params;

            if (!gigId) {
                return new Response(JSON.stringify({ blocked: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
            }

            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            let cancellationQuery = supabaseClient
                .from('gig_applications')
                .select('id', { count: 'exact', head: true })
                .eq('status', 'cancelled')
                .eq('gig_id', gigId)
                .gte('updated_at', thirtyDaysAgo.toISOString());

            if (productionTeamId) {
                cancellationQuery = cancellationQuery.eq('production_team_id', productionTeamId);
            } else if (groupId) {
                cancellationQuery = cancellationQuery
                    .eq('group_id', groupId)
                    .is('production_team_id', null);
            } else {
                cancellationQuery = cancellationQuery
                    .eq('applicant_id', effectiveUserId)
                    .is('group_id', null)
                    .is('production_team_id', null);
            }

            const { count, error: countError } = await cancellationQuery;

            if (countError) throw countError;

            const blocked = (count || 0) >= 3;
            return new Response(JSON.stringify({
                blocked,
                reason: blocked ? 'Maximum attempts reached for this gig.' : null
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        // CANCEL APPLICATION
        if (action === 'cancel_application') {
            const { applicationId } = params;

            const { data: existingApp, error: fetchError } = await supabaseClient
                .from('gig_applications')
                .select('applicant_id, submitted_by_user_id, gig_id, group_id, production_team_id, group:groups!group_id(owner_id), gig:gig_id(name)')
                .eq('id', applicationId)
                .single();

            if (fetchError) throw fetchError;
            if (!existingApp) throw new Error('Application not found');

            const isApplicant =
                existingApp.applicant_id === effectiveUserId ||
                existingApp.submitted_by_user_id === effectiveUserId;
            const isGroupOwner =
                !existingApp.production_team_id &&
                existingApp.group?.owner_id === effectiveUserId;
            let isProductionManager = false;

            if (existingApp.production_team_id) {
                const { data: teamMembership, error: teamMembershipError } = await supabaseClient
                    .from('production_team_members')
                    .select('role')
                    .eq('team_id', existingApp.production_team_id)
                    .eq('user_id', effectiveUserId)
                    .in('role', ['owner', 'manager'])
                    .maybeSingle();

                if (teamMembershipError) throw teamMembershipError;
                isProductionManager = !!teamMembership;
            }

            if (!isApplicant && !isGroupOwner && !isProductionManager) {
                return new Response(JSON.stringify({ error: 'Unauthorized to cancel this application' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                });
            }

            const { error: updateError } = await supabaseClient
                .from('gig_applications')
                .update({ status: 'cancelled' })
                .eq('id', applicationId);

            if (updateError) throw updateError;

            try {
                await notifyGigApplicationAudience(supabaseClient, applicationId, 'cancelled', {
                    gigName: existingApp.gig?.name || 'this gig',
                    actorUserId: effectiveUserId,
                    includeOrganizer: true,
                });
            } catch (notifyError) {
                console.error('Failed to notify gig application audience:', notifyError);
            }

            let cancellationCount = 0;

            if (existingApp.gig_id) {
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

                let cancellationQuery = supabaseClient
                    .from('gig_applications')
                    .select('id', { count: 'exact', head: true })
                    .eq('status', 'cancelled')
                    .eq('gig_id', existingApp.gig_id)
                    .gte('updated_at', thirtyDaysAgo.toISOString());

                if (existingApp.production_team_id) {
                    cancellationQuery = cancellationQuery.eq('production_team_id', existingApp.production_team_id);
                } else if (existingApp.group_id) {
                    cancellationQuery = cancellationQuery
                        .eq('group_id', existingApp.group_id)
                        .is('production_team_id', null);
                } else {
                    cancellationQuery = cancellationQuery
                        .eq('applicant_id', existingApp.applicant_id)
                        .is('group_id', null)
                        .is('production_team_id', null);
                }

                const { count } = await cancellationQuery;
                cancellationCount = count || 0;
            }

            return new Response(JSON.stringify({ success: true, cancellation_count: cancellationCount }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        throw new Error('Invalid action')

    } catch (error: any) {
        console.error('Edge Function Error:', error);
        return new Response(JSON.stringify({
            error: error.message,
            details: error.toString(),
            hint: error.hint || null,
            code: error.code || null
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
