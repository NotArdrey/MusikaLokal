// @ts-ignore
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildNotificationRouteMeta } from '../_shared/notificationRoutes.ts'
import { buildGigApplicationAudienceMeta, resolveGigApplicationAudience } from '../_shared/gigApplicationAudience.ts'
import { scheduleCoreActionEmailForNotification } from '../_shared/coreActionEmail.ts'
import {
    queueGigPortfolioReview,
    scheduleGigPortfolioReview,
} from '../_shared/gigPortfolioReview.ts'

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
const PRODUCTION_GIG_APPLICATIONS_ENABLED = false

async function insertCoreNotification(supabaseClient: any, payload: Record<string, unknown>) {
    const { error } = await supabaseClient.from('notifications').insert(payload)

    if (error) {
        console.error('gig_application_notification_failed', {
            message: error.message,
        })
        return
    }

    scheduleCoreActionEmailForNotification(supabaseClient, payload, {
        source: 'gig-applications',
    })
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
    applicant:profiles!applicant_id(id, full_name, avatar_url, role, bio, location, latitude, longitude, is_verified, verification_status),
    submitter:profiles!submitted_by_user_id(id, full_name, avatar_url, email),
    group:groups!group_id(id, name, genre, description, location, latitude, longitude, rate, group_type),
    production_team:production_team_id(id, name, logo_url),
    production_roster:production_roster_id(
        id,
        entity_kind,
        profile_id,
        group_id,
        roster_profile:profile_id(id, full_name, avatar_url, role, bio, location, latitude, longitude, is_verified, verification_status),
        roster_group:group_id(id, name, genre, description, location, latitude, longitude, rate, group_type)
    )
`

const GIG_APPLICATION_SUMMARY_SELECT = `
    id,
    gig_id,
    applicant_id,
    group_id,
    production_team_id,
    production_roster_id,
    status,
    slot_type,
    created_at,
    performer_snapshot,
    cv_url,
    video_url,
    applicant:profiles!applicant_id(id, full_name, avatar_url, location, latitude, longitude, is_verified, verification_status),
    group:groups!group_id(id, name, genre, location, latitude, longitude, group_type),
    production_team:production_team_id(id, name, logo_url),
    production_roster:production_roster_id(
        id,
        entity_kind,
        profile_id,
        group_id,
        roster_profile:profile_id(id, full_name, avatar_url, location, latitude, longitude, is_verified, verification_status),
        roster_group:group_id(id, name, genre, location, latitude, longitude, group_type)
    )
`

function toApplicationSummary(application: any) {
    const pickProfile = (profile: any) =>
        profile
            ? {
                  id: profile.id,
                  full_name: profile.full_name,
                  avatar_url: profile.avatar_url,
                  location: profile.location,
                  is_verified: profile.is_verified,
                  verification_status: profile.verification_status,
                  genres: Array.isArray(profile.genres) ? profile.genres : [],
                  skills: Array.isArray(profile.skills) ? profile.skills : [],
              }
            : null
    const pickGroup = (group: any) =>
        group
            ? {
                  id: group.id,
                  name: group.name,
                  genre: group.genre,
                  location: group.location,
                  group_type: group.group_type,
                  images: Array.isArray(group.images) ? group.images.slice(0, 1) : [],
              }
            : null

    return {
        id: application.id,
        gig_id: application.gig_id,
        applicant_id: application.applicant_id,
        group_id: application.group_id,
        production_team_id: application.production_team_id,
        production_roster_id: application.production_roster_id,
        status: application.status,
        slot_type: application.slot_type,
        created_at: application.created_at,
        performer_snapshot: application.performer_snapshot || {},
        applicant: pickProfile(application.applicant),
        group: pickGroup(application.group),
        production_team: application.production_team
            ? { id: application.production_team.id, name: application.production_team.name, logo_url: application.production_team.logo_url }
            : null,
        production_roster: application.production_roster
            ? {
                  id: application.production_roster.id,
                  entity_kind: application.production_roster.entity_kind,
                  profile_id: application.production_roster.profile_id,
                  group_id: application.production_roster.group_id,
                  roster_profile: pickProfile(application.production_roster.roster_profile),
                  roster_group: pickGroup(application.production_roster.roster_group),
              }
            : null,
        ai_recommendation: application.ai_recommendation || null,
        prior_application_counts: application.prior_application_counts || null,
    }
}

async function attachPriorApplicationCounts(
    client: any,
    organizerId: string,
    applications: any[]
) {
    if (!organizerId || !Array.isArray(applications) || applications.length === 0) {
        return applications
    }

    const applicantIds = Array.from(
        new Set(
            applications
                .map((application: any) => application?.applicant_id)
                .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
        )
    )

    if (applicantIds.length === 0) {
        return applications.map((application: any) => ({
            ...application,
            prior_application_counts: { this_gig: 0, owner_gigs: 0 },
        }))
    }

    const { data: ownerGigs, error: ownerGigsError } = await client
        .from('gigs')
        .select('id')
        .eq('organizer_id', organizerId)

    if (ownerGigsError) throw ownerGigsError

    const ownerGigIds = (ownerGigs || [])
        .map((gig: any) => gig?.id)
        .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)

    if (ownerGigIds.length === 0) {
        return applications.map((application: any) => ({
            ...application,
            prior_application_counts: { this_gig: 0, owner_gigs: 0 },
        }))
    }

    const { data: historyRows, error: historyError } = await client
        .from('gig_applications')
        .select('id, gig_id, applicant_id, created_at')
        .in('gig_id', ownerGigIds)
        .in('applicant_id', applicantIds)
        .or('leader_approval_status.is.null,leader_approval_status.eq.approved')

    if (historyError) throw historyError

    const historyByApplicant = new Map<string, any[]>()
    for (const historyRow of historyRows || []) {
        const applicantId = String(historyRow?.applicant_id || '')
        if (!applicantId) continue
        const existingRows = historyByApplicant.get(applicantId)
        if (existingRows) {
            existingRows.push(historyRow)
        } else {
            historyByApplicant.set(applicantId, [historyRow])
        }
    }

    return applications.map((application: any) => {
        const submittedAt = Date.parse(String(application?.created_at || ''))
        const applicantHistory = historyByApplicant.get(String(application?.applicant_id || '')) || []
        let thisGig = 0
        let ownerGigs = 0

        for (const historyRow of applicantHistory) {
            if (historyRow.id === application.id) continue
            const historySubmittedAt = Date.parse(String(historyRow?.created_at || ''))
            if (
                !Number.isFinite(submittedAt) ||
                !Number.isFinite(historySubmittedAt) ||
                historySubmittedAt >= submittedAt
            ) {
                continue
            }

            ownerGigs += 1
            if (historyRow.gig_id === application.gig_id) {
                thisGig += 1
            }
        }

        return {
            ...application,
            prior_application_counts: {
                this_gig: thisGig,
                owner_gigs: ownerGigs,
            },
        }
    })
}

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

function getApplicationStatusNotification(normalizedStatus: string, gigName: string, productionLabel = '') {
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
        gigName: string
        productionLabel?: string
        actorUserId?: string | null
        performerName?: string | null
        includeOrganizer?: boolean
    }
) {
    const notification = getApplicationStatusNotification(
        normalizedStatus,
        options.gigName,
        options.productionLabel || ''
    )

    if (!notification) return

    const { application, audience } = await resolveGigApplicationAudience(supabaseClient, applicationId, {
        includeOrganizer: options.includeOrganizer === true,
    })

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
            meta: buildNotificationRouteMeta(
                '/bookings',
                undefined,
                buildGigApplicationAudienceMeta(application, member, {
                    status: normalizedStatus,
                    event_type: eventType,
                    performer_name: options.performerName || null,
                })
            ),
        })
    }
}

function uniqueStrings(values: unknown[]) {
    return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0)))
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

    const { data, error } = await supabaseClient.from('gigs_legacy_projection').select('id, images').in('id', ids)

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
    location_radius_km: null as number | null,
    criteria: {
        genres: 'preferred' as RecommendationCriterionMode,
        instruments: 'preferred' as RecommendationCriterionMode,
        location: 'preferred' as RecommendationCriterionMode,
        portfolio: 'preferred' as RecommendationCriterionMode,
    },
}

const RECOMMENDATION_MODEL_VERSION = 'gig-fit-v4'

function normalizeCriterionMode(value: unknown, fallback: RecommendationCriterionMode) {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
    return normalized === 'required' || normalized === 'preferred' || normalized === 'ignore'
        ? (normalized as RecommendationCriterionMode)
        : fallback
}

function normalizeRecommendationSettings(value: any) {
    const criteria = value?.criteria && typeof value.criteria === 'object' ? value.criteria : {}
    const parsedMinimum = Number(value?.minimum_score)
    const parsedRadius = Number(value?.location_radius_km)

    return {
        enabled: value?.enabled === true,
        minimum_score: Number.isFinite(parsedMinimum)
            ? Math.max(0, Math.min(100, Math.round(parsedMinimum)))
            : DEFAULT_RECOMMENDATION_SETTINGS.minimum_score,
        location_radius_km:
            value?.location_radius_km === null || value?.location_radius_km === 'any'
                ? null
                : [5, 10, 25, 50, 100].includes(parsedRadius)
                ? parsedRadius
                : null,
        criteria: {
            genres: normalizeCriterionMode(criteria.genres, DEFAULT_RECOMMENDATION_SETTINGS.criteria.genres),
            instruments: normalizeCriterionMode(
                criteria.instruments,
                DEFAULT_RECOMMENDATION_SETTINGS.criteria.instruments
            ),
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
    const collected: string[] = []
    const supportedObjectKeys = [
        'name',
        'label',
        'value',
        'skill',
        'skills',
        'instrument',
        'instruments',
        'preferred_instruments',
        'required_instruments',
        'role',
        'roles',
        'member_role',
        'required_roles',
    ]
    const visit = (value: unknown) => {
        if (typeof value === 'string') {
            const trimmed = value.trim()
            if (trimmed) collected.push(trimmed)
            return
        }
        if (Array.isArray(value)) {
            value.forEach(visit)
            return
        }
        if (!value || typeof value !== 'object') return
        const record = value as Record<string, unknown>
        supportedObjectKeys.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(record, key)) visit(record[key])
        })
    }

    values.forEach(visit)
    return uniqueStrings(collected)
}

function valuesOverlap(expected: string[], actual: string[]) {
    const normalizedActual = actual.map(normalizeMatchValue).filter(Boolean)
    return expected.some((expectedValue) => {
        const normalizedExpected = normalizeMatchValue(expectedValue)
        if (!normalizedExpected) return false
        return normalizedActual.some(
            (actualValue) =>
                actualValue === normalizedExpected ||
                actualValue.includes(normalizedExpected) ||
                normalizedExpected.includes(actualValue)
        )
    })
}

function readCoordinates(source: any) {
    if (source?.latitude === null || source?.latitude === undefined || source?.latitude === '') return null
    if (source?.longitude === null || source?.longitude === undefined || source?.longitude === '') return null
    const latitude = Number(source?.latitude)
    const longitude = Number(source?.longitude)
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null
    return { latitude, longitude }
}

function haversineDistanceKm(
    from: { latitude: number; longitude: number },
    to: { latitude: number; longitude: number }
) {
    const radians = (degrees: number) => (degrees * Math.PI) / 180
    const earthRadiusKm = 6371
    const deltaLatitude = radians(to.latitude - from.latitude)
    const deltaLongitude = radians(to.longitude - from.longitude)
    const latitude1 = radians(from.latitude)
    const latitude2 = radians(to.latitude)
    const a =
        Math.sin(deltaLatitude / 2) ** 2 + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2
    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function getApplicationPerformer(application: any) {
    const rosterProfile = application?.production_roster?.roster_profile
    const rosterGroup = application?.production_roster?.roster_group
    const profile = rosterProfile || application?.applicant || null
    const group = rosterGroup || application?.group || null
    const memberRolesAndInstruments = Array.isArray(group?.members)
        ? group.members.flatMap((member: any) =>
              typeof member === 'string'
                  ? [member]
                  : [member?.instrument, member?.instruments, member?.role, member?.roles, member?.member_role, member?.skills]
          )
        : []
    const snapshot = application?.performer_snapshot || {}

    return {
        profile,
        group,
        verified:
            profile?.is_verified === true &&
            String(profile?.verification_status || '')
                .trim()
                .toUpperCase() === 'APPROVED',
        genres: stringValues([profile?.genres, group?.genre, snapshot?.genres, snapshot?.group_genre]),
        instruments: stringValues([
            profile?.skills,
            profile?.instruments,
            profile?.musician_roles,
            group?.instruments,
            group?.roles,
            memberRolesAndInstruments,
            snapshot?.skills,
            snapshot?.instruments,
            snapshot?.roles,
            snapshot?.instrument,
            snapshot?.role,
        ]),
        location: String(group?.location || profile?.location || '').trim(),
        coordinates: readCoordinates(group) || readCoordinates(profile),
        hasPortfolio: Boolean(
            application?.video_url ||
                application?.cv_url ||
                (Array.isArray(profile?.portfolio_urls) && profile.portfolio_urls.length > 0)
        ),
    }
}

function getRequirementValues(requirements: any, application: any) {
    const rawSlotType = String(application?.slot_type || '')
        .trim()
        .toLowerCase()
    const slotType = rawSlotType.replace(/[\s-]+/g, '_')
    const normalizedSlotType =
        slotType === 'solo_artist' || slotType === 'individual'
            ? 'solo'
            : slotType === 'group' || slotType === 'music_group'
            ? String(application?.group?.group_type || application?.production_roster?.roster_group?.group_type || '').toLowerCase() ===
              'duo'
                ? 'duo'
                : 'band'
            : slotType
    const slot = requirements?.slots?.[normalizedSlotType] || requirements?.slots?.[rawSlotType] || {}
    const globalGenres = stringValues([
        requirements?.genres,
        requirements?.preferred_genres,
        requirements?.required_genres,
    ])
    const slotGenres = stringValues([slot?.genres, slot?.preferred_genres, slot?.required_genres])

    return {
        genres: slotGenres.length > 0 ? slotGenres : globalGenres,
        instruments: stringValues([
            requirements?.preferred_instruments,
            requirements?.required_instruments,
            requirements?.roles,
            requirements?.required_roles,
            slot?.instruments,
            slot?.preferred_instruments,
            slot?.required_instruments,
            slot?.roles,
            slot?.required_roles,
        ]),
        location: String(requirements?.location || '').trim(),
    }
}

function evaluateGigApplication(
    application: any,
    requirements: any,
    settings: ReturnType<typeof normalizeRecommendationSettings>
) {
    const performer = getApplicationPerformer(application)
    const expected = getRequirementValues(requirements, application)
    const matched: string[] = []
    const missing: string[] = []
    let possiblePoints = 0
    let earnedPoints = 0
    let missingRequired = false

    const applyValueCriterion = (
        key: keyof typeof settings.criteria,
        label: string,
        weight: number,
        expectedValues: string[],
        performerValues: string[]
    ) => {
        const mode = settings.criteria[key]
        // Empty gig fields are optional. A mode only affects a criterion after
        // the organizer has supplied values for it.
        if (mode === 'ignore' || expectedValues.length === 0) return

        possiblePoints += weight
        if (performerValues.length === 0) {
            missing.push(`${label} unavailable on the applicant profile or group roster`)
            if (mode === 'required') missingRequired = true
            return
        }
        if (valuesOverlap(expectedValues, performerValues)) {
            earnedPoints += weight
            matched.push(label)
        } else {
            missing.push(label)
            if (mode === 'required') missingRequired = true
        }
    }

    applyValueCriterion(
        'instruments',
        'Instrument or role fit',
        30,
        expected.instruments,
        performer.instruments
    )
    applyValueCriterion(
        'genres',
        'Genre fit',
        25,
        expected.genres,
        performer.genres
    )

    const gigCoordinates = readCoordinates(requirements?.gig_coordinates)
    const distanceKm =
        gigCoordinates && performer.coordinates ? haversineDistanceKm(gigCoordinates, performer.coordinates) : null
    const hasLocationPreference = settings.criteria.location !== 'ignore' && settings.location_radius_km !== null
    if (hasLocationPreference) {
        possiblePoints += 10
        if (distanceKm === null) {
            missing.push('Location distance unavailable')
            if (settings.criteria.location === 'required') missingRequired = true
        }
        else if (distanceKm <= Number(settings.location_radius_km)) {
            earnedPoints += 10
            matched.push(`Within ${settings.location_radius_km} km location range`)
        } else {
            missing.push(`Outside ${settings.location_radius_km} km preferred range`)
            if (settings.criteria.location === 'required') missingRequired = true
        }
    }
    if (settings.criteria.portfolio !== 'ignore') {
        possiblePoints += 15
        if (performer.hasPortfolio) {
            earnedPoints += 15
            matched.push('Portfolio or application media provided')
        } else {
            missing.push('Portfolio or application media not provided')
            if (settings.criteria.portfolio === 'required') missingRequired = true
        }
    }

    const hasApplicableCriteria = possiblePoints > 0
    const score = hasApplicableCriteria
        ? Math.max(0, Math.min(100, Math.round((earnedPoints / possiblePoints) * 100)))
        : null
    const isEligible = hasApplicableCriteria && !missingRequired
    const recommendationStatus = !hasApplicableCriteria
        ? 'insufficient_data'
        : isEligible && Number(score) >= settings.minimum_score
        ? 'recommended'
        : isEligible
        ? 'possible_match'
        : 'not_eligible'
    const explanation =
        recommendationStatus === 'recommended'
            ? `${score}% advisory fit based on the gig's saved requirements.`
            : recommendationStatus === 'possible_match'
            ? `${score}% advisory fit; review the unmatched preferences before deciding.`
            : recommendationStatus === 'insufficient_data'
            ? 'No applicable AI filter criteria are configured for this gig.'
            : 'Not recommended because a required gig criterion is missing.'

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
        distance_km: distanceKm === null ? null : Number(distanceKm.toFixed(1)),
        distance_status:
            distanceKm === null
                ? 'unavailable'
                : settings.location_radius_km === null
                ? 'any_distance'
                : distanceKm <= Number(settings.location_radius_km)
                ? 'inside_range'
                : 'outside_range',
        criteria_snapshot: {
            settings,
            requirements: expected,
            performer: {
                genres: performer.genres,
                instruments: performer.instruments,
                has_portfolio: performer.hasPortfolio,
            },
            distance_km: distanceKm,
        },
        model_provider: 'rules',
        model_version: RECOMMENDATION_MODEL_VERSION,
    }
}

async function addGroqRecommendationExplanations(evaluations: any[]) {
    const apiKey = Deno.env.get('GROQ_API_KEY') || ''
    if (!apiKey || evaluations.length === 0) return evaluations

    try {
        const model = Deno.env.get('GROQ_MODEL') || 'openai/gpt-oss-120b'
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
                        content:
                            'Explain structured gig-applicant fit results. Never accept or reject applicants. Return JSON only as {"recommendations":[{"application_id":"uuid","explanation":"one concise neutral sentence"}]}. Do not infer protected or personal traits.',
                    },
                    {
                        role: 'user',
                        content: JSON.stringify(
                            evaluations.map((item) => ({
                                application_id: item.application_id,
                                score: item.score,
                                status: item.recommendation_status,
                                matched: item.matched_criteria,
                                missing: item.missing_criteria,
                            }))
                        ),
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
                .filter(
                    (item: any) => typeof item?.application_id === 'string' && typeof item?.explanation === 'string'
                )
                .map((item: any) => [item.application_id, item.explanation.trim()])
        )

        return evaluations.map((item) => ({
            ...item,
            explanation: explanationById.get(item.application_id) || item.explanation,
            model_provider: explanationById.has(item.application_id) ? 'groq' : item.model_provider,
        }))
    } catch (error) {
        console.warn('gig_recommendation_ai_explanation_failed', {
            message: String((error as any)?.message || error),
        })
        return evaluations
    }
}

async function addAdvisoryMediaReviewSummaries(supabaseClient: any, evaluations: any[]) {
    const applicationIds = evaluations
        .map((item) => item?.application_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    if (applicationIds.length === 0) return evaluations

    const { data, error } = await supabaseClient
        .from('gig_application_ai_reviews')
        .select('application_id, status, source_summary, face_similarity, evidence')
        .in('application_id', applicationIds)

    if (error) {
        console.warn('gig_recommendation_media_review_read_failed', { message: error.message })
        return evaluations
    }

    const reviewByApplicationId = new Map(
        (data || []).map((review: any) => [String(review.application_id), review])
    )

    return evaluations.map((item) => {
        const review: any = reviewByApplicationId.get(String(item.application_id))
        if (!review || !['completed', 'partial'].includes(String(review.status || ''))) return item

        const reviewEvidence = Array.isArray(review?.evidence) ? review.evidence : []
        const portfolioEvidence = reviewEvidence.find(
            (entry: any) => String(entry?.criterion || '') === 'portfolio_requirement'
        )
        const instrumentEvidence = reviewEvidence.find(
            (entry: any) => String(entry?.criterion || '') === 'instrument_requirement'
        )
        const genreEvidence = reviewEvidence.find(
            (entry: any) => String(entry?.criterion || '') === 'genre_requirement'
        )
        const portfolioResult = String(portfolioEvidence?.result || 'unclear')
        const instrumentResult = String(instrumentEvidence?.result || 'unclear')
        const genreResult = String(genreEvidence?.result || 'unclear')
        let matchedCriteria = Array.isArray(item.matched_criteria) ? item.matched_criteria : []
        let missingCriteria = Array.isArray(item.missing_criteria) ? item.missing_criteria : []
        const applySupportingEvidence = (label: string, result: string) => {
            if (result !== 'supported') return
            missingCriteria = missingCriteria.filter((itemLabel: string) => !itemLabel.startsWith(label))
            if (!matchedCriteria.includes(label)) matchedCriteria = [...matchedCriteria, label]
        }
        applySupportingEvidence('Instrument or role fit', instrumentResult)
        applySupportingEvidence('Genre fit', genreResult)

        const settings = item?.criteria_snapshot?.settings || {}
        const expected = item?.criteria_snapshot?.requirements || {}
        const criteria = settings?.criteria || {}
        const hasMatched = (label: string) => matchedCriteria.includes(label)
        let possiblePoints = 0
        let earnedPoints = 0
        let missingRequired = false

        const addScoredCriterion = (
            mode: string,
            configured: boolean,
            matched: boolean,
            weight: number
        ) => {
            if (mode === 'ignore' || !configured) return
            possiblePoints += weight
            if (matched) earnedPoints += weight
            else if (mode === 'required') missingRequired = true
        }

        addScoredCriterion(
            String(criteria.instruments || ''),
            Array.isArray(expected.instruments) && expected.instruments.length > 0,
            hasMatched('Instrument or role fit'),
            30
        )
        addScoredCriterion(
            String(criteria.genres || ''),
            Array.isArray(expected.genres) && expected.genres.length > 0,
            hasMatched('Genre fit'),
            25
        )
        if (criteria.location !== 'ignore' && settings.location_radius_km !== null) {
            possiblePoints += 10
            if (matchedCriteria.some((label: string) => label.startsWith('Within '))) earnedPoints += 10
            else if (criteria.location === 'required') missingRequired = true
        }
        addScoredCriterion(
            String(criteria.portfolio || ''),
            true,
            hasMatched('Portfolio or application media provided'),
            15
        )

        const hasApplicableCriteria = possiblePoints > 0
        const score = hasApplicableCriteria
            ? Math.max(0, Math.min(100, Math.round((earnedPoints / possiblePoints) * 100)))
            : null
        const isEligible = hasApplicableCriteria && !missingRequired
        const recommendationStatus = !hasApplicableCriteria
            ? 'insufficient_data'
            : isEligible && Number(score) >= Number(settings.minimum_score || 75)
            ? 'recommended'
            : isEligible
            ? 'possible_match'
            : 'not_eligible'
        const notes: string[] = []
        const cvStatus = String(review?.source_summary?.cv_document_classification?.status || '')
        if (cvStatus === 'not_a_cv') {
            notes.push('The uploaded document does not appear to be a CV or resume.')
        } else if (cvStatus === 'uncertain') {
            notes.push('The uploaded document could not be confirmed as a CV or resume.')
        }
        if (portfolioResult === 'not_supported') {
            notes.push('The submitted media does not show relevant performance or portfolio experience.')
        } else if (portfolioResult === 'unclear') {
            notes.push('The submitted media could not be reviewed clearly.')
        }

        const faceStatus = String(review?.face_similarity?.status || '')
        if (faceStatus === 'likely_same_person') {
            notes.push('The person in the video appears to match the profile photo.')
        } else if (faceStatus === 'likely_different_person') {
            notes.push('The person in the video may not match the profile photo. Please review the original files.')
        } else if (faceStatus === 'unclear') {
            notes.push('The profile photo and video could not be compared clearly.')
        } else if (faceStatus === 'not_run') {
            notes.push('The profile photo and video could not be compared.')
        }

        const missingRequiredItems = [
            criteria.instruments === 'required' &&
            Array.isArray(expected.instruments) &&
            expected.instruments.length > 0 &&
            !hasMatched('Instrument or role fit')
                ? 'instrument_or_role'
                : '',
            criteria.genres === 'required' &&
            Array.isArray(expected.genres) &&
            expected.genres.length > 0 &&
            !hasMatched('Genre fit')
                ? 'genre'
                : '',
            criteria.location === 'required' &&
            settings.location_radius_km !== null &&
            !matchedCriteria.some((label: string) => label.startsWith('Within '))
                ? 'location'
                : '',
            criteria.portfolio === 'required' && !hasMatched('Portfolio or application media provided')
                ? 'portfolio'
                : '',
        ].filter(Boolean)
        const requiredMismatchExplanation =
            missingRequiredItems.length !== 1
                ? 'This applicant does not match one or more required gig requirements.'
                : missingRequiredItems[0] === 'instrument_or_role'
                ? 'This applicant does not match the required instrument or role.'
                : missingRequiredItems[0] === 'genre'
                ? 'This applicant does not match the required genre.'
                : missingRequiredItems[0] === 'location'
                ? 'This applicant does not match the required location range.'
                : 'This applicant does not provide the required performance or portfolio evidence.'
        const baseExplanation =
            recommendationStatus === 'recommended'
                ? 'This applicant appears to match the gig requirements.'
                : recommendationStatus === 'possible_match'
                ? 'This applicant may be a match. Please review the items below.'
                : recommendationStatus === 'insufficient_data'
                ? 'No applicable AI filter criteria are configured for this gig.'
                : requiredMismatchExplanation
        return {
            ...item,
            score,
            is_eligible: isEligible,
            recommendation_status: recommendationStatus,
            matched_criteria: matchedCriteria,
            missing_criteria: missingCriteria,
            explanation: `${baseExplanation} ${notes.join(' ')}`.trim(),
        }
    })
}

async function attachGigApplicationRecommendations(supabaseClient: any, gigId: string, applications: any[]) {
    const [{ data: requirementRows, error: requirementError }, { data: gigRecord, error: gigError }] =
        await Promise.all([
            supabaseClient.from('gig_requirements').select('requirement_key, requirement_value').eq('gig_id', gigId),
            supabaseClient.from('gigs').select('location, latitude, longitude').eq('id', gigId).maybeSingle(),
        ])

    if (requirementError) throw requirementError
    if (gigError) throw gigError

    const requirements = (requirementRows || []).reduce((acc: Record<string, any>, row: any) => {
        if (row?.requirement_key) acc[row.requirement_key] = row.requirement_value
        return acc
    }, {})
    requirements.gig_location = gigRecord?.location || requirements.location || ''
    requirements.gig_coordinates = readCoordinates(gigRecord)

    const settings = normalizeRecommendationSettings(requirements.ai_recommendation_settings)
    if (!settings.enabled) {
        return applications.map((application) => ({
            ...application,
            ai_recommendation: null,
        }))
    }

    let evaluations = applications.map((application) => evaluateGigApplication(application, requirements, settings))
    evaluations = await addGroqRecommendationExplanations(evaluations)
    evaluations = await addAdvisoryMediaReviewSummaries(supabaseClient, evaluations)

    if (evaluations.length > 0) {
        const now = new Date().toISOString()
        const { error: upsertError } = await supabaseClient.from('gig_application_recommendations').upsert(
            evaluations.map((item) => ({
                ...item,
                generated_at: now,
                updated_at: now,
            })),
            { onConflict: 'application_id' }
        )

        if (upsertError) {
            console.warn('gig_recommendation_audit_upsert_failed', {
                message: upsertError.message,
            })
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
                return (
                    Number(rightRecommendation?.is_eligible || false) - Number(leftRecommendation?.is_eligible || false)
                )
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
            message: `You were accepted for "${gigName}". Choose whether you want to be featured on the gig and Feed pages or your public profile.`,
            meta: buildNotificationRouteMeta(
                '/gig_feature_consent',
                { applicationId },
                {
                    event_type: 'gig_feature_consent_requested',
                    application_id: applicationId,
                    gig_id: application.gig_id,
                    consent_status: 'pending',
                }
            ),
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
            return new Response(
                JSON.stringify({
                    error: 'Server misconfiguration: Missing Supabase env vars',
                }),
                {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 500,
                }
            )
        }

        const supabaseClient = createClient(supabaseUrl, serviceRoleKey)

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

        if (action === 'request_ai_portfolio_review') {
            const { applicationId } = params
            if (!applicationId) {
                return new Response(JSON.stringify({ error: 'applicationId is required' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
                })
            }
            const { data: application, error: applicationError } = await supabaseClient
                .from('gig_applications')
                .select('id, applicant_id, submitted_by_user_id, group_id, leader_approval_status, ai_portfolio_review_consent')
                .eq('id', applicationId).maybeSingle()
            if (applicationError) throw applicationError
            if (!application) {
                return new Response(JSON.stringify({ error: 'Application not found' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404,
                })
            }
            if (application.applicant_id !== effectiveUserId && application.submitted_by_user_id !== effectiveUserId) {
                return new Response(JSON.stringify({ error: 'Only the applicant who granted consent can request this review' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403,
                })
            }
            if (application.ai_portfolio_review_consent !== true) {
                return new Response(JSON.stringify({ error: 'AI portfolio review consent is required' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409,
                })
            }
            if (application.group_id && application.leader_approval_status === 'pending') {
                return new Response(JSON.stringify({ application_id: applicationId, status: 'awaiting_group_leader_approval' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 202,
                })
            }
            await queueGigPortfolioReview(supabaseClient, applicationId)
            await scheduleGigPortfolioReview(supabaseClient, applicationId, supabaseUrl)
            return new Response(JSON.stringify({ application_id: applicationId, status: 'queued' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 202,
            })
        }

        // FETCH GIG APPLICATIONS (for gig owner)
        if (action === 'fetch_gig_applications') {
            const { gigId } = params

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
                .single()

            if (gigError || !gigRecord) {
                return new Response(JSON.stringify({ error: 'Gig not found' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 404,
                })
            }

            const venueStaffAccessLevel = await getVenueStaffAccessLevel(supabaseClient, effectiveUserId, gigId)
            if (
                gigRecord.organizer_id !== effectiveUserId &&
                !(venueStaffAccessLevel !== null && venueStaffAccessLevel <= 2)
            ) {
                return new Response(JSON.stringify({ error: 'Forbidden' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                })
            }

            const { data, error } = await supabaseClient
                .from('gig_applications')
                .select(GIG_APPLICATION_SUMMARY_SELECT)
                .eq('gig_id', gigId)
                .or('leader_approval_status.is.null,leader_approval_status.eq.approved')
                .order('created_at', { ascending: false })

            if (error) throw error
            const hydratedData = await hydrateLegacyApplicationFields(supabaseClient, data || [])
            const rankedData = await attachGigApplicationRecommendations(supabaseClient, gigId, hydratedData)
            const rankedDataWithHistory = await attachPriorApplicationCounts(
                supabaseClient,
                gigRecord.organizer_id,
                rankedData
            )
            return new Response(JSON.stringify(rankedDataWithHistory.map(toApplicationSummary)), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        if (action === 'fetch_gig_application_details') {
            const { applicationId } = params
            if (!applicationId) {
                return new Response(JSON.stringify({ error: 'applicationId is required' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
                })
            }
            const { data: applicationRecord, error: applicationError } = await supabaseClient
                .from('gig_applications').select(GIG_APPLICATION_SELECT).eq('id', applicationId).maybeSingle()
            if (applicationError) throw applicationError
            if (!applicationRecord) {
                return new Response(JSON.stringify({ error: 'Application not found' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404,
                })
            }
            const { data: gigRecord, error: gigError } = await supabaseClient
                .from('gigs').select('id, organizer_id').eq('id', applicationRecord.gig_id).maybeSingle()
            if (gigError) throw gigError
            const venueStaffAccessLevel = await getVenueStaffAccessLevel(supabaseClient, effectiveUserId, applicationRecord.gig_id)
            if (!gigRecord || (gigRecord.organizer_id !== effectiveUserId && !(venueStaffAccessLevel !== null && venueStaffAccessLevel <= 2))) {
                return new Response(JSON.stringify({ error: 'Forbidden' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403,
                })
            }
            const [hydratedApplication, reviewResult, recommendationResult] = await Promise.all([
                hydrateLegacyApplicationFields(supabaseClient, applicationRecord),
                supabaseClient.from('gig_application_ai_reviews').select('*').eq('application_id', applicationId).maybeSingle(),
                supabaseClient.from('gig_application_recommendations').select('*').eq('application_id', applicationId).maybeSingle(),
            ])
            if (reviewResult.error) console.warn('gig_application_ai_review_read_failed', { message: reviewResult.error.message })
            if (recommendationResult.error) console.warn('gig_application_recommendation_read_failed', { message: recommendationResult.error.message })
            const [applicationWithHistory] = await attachPriorApplicationCounts(
                supabaseClient,
                gigRecord.organizer_id,
                [hydratedApplication]
            )
            return new Response(JSON.stringify({
                ...applicationWithHistory,
                ai_portfolio_review: reviewResult.error ? null : reviewResult.data || null,
                ai_recommendation: recommendationResult.error ? null : recommendationResult.data || null,
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }

        // FETCH PENDING APPLICATION RECOMMENDATIONS FOR THE OWNER'S BOOKINGS PAGE
        if (action === 'fetch_manager_pending_recommendations') {
            const requestedGigIds = uniqueStrings(Array.isArray(params.gigIds) ? params.gigIds : []).slice(0, 25)

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
                await Promise.all(
                    (gigRecords || []).map(async (gigRecord: any) => {
                        if (gigRecord.organizer_id === effectiveUserId) return gigRecord.id
                        const accessLevel = await getVenueStaffAccessLevel(
                            supabaseClient,
                            effectiveUserId,
                            gigRecord.id
                        )
                        return accessLevel !== null && accessLevel <= 2 ? gigRecord.id : null
                    })
                )
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
                    .map((row: any) => row.gig_id)
            )
            const freshRecommendationCutoff = Date.now() - 5 * 60 * 1000

            const existingByApplicationId = new Map(
                (existingRecommendations || [])
                    .filter(
                        (recommendation: any) =>
                            recommendationEnabledGigIds.has(recommendation.gig_id) &&
                            recommendation.model_version === RECOMMENDATION_MODEL_VERSION &&
                            new Date(recommendation.generated_at || 0).getTime() >= freshRecommendationCutoff
                    )
                    .map((recommendation: any) => [recommendation.application_id, recommendation])
            )
            const applicationsByGig = new Map<string, any[]>()
            hydratedData.forEach((application: any) => {
                if (!recommendationEnabledGigIds.has(application.gig_id) || existingByApplicationId.has(application.id))
                    return
                const existing = applicationsByGig.get(application.gig_id) || []
                existing.push(application)
                applicationsByGig.set(application.gig_id, existing)
            })

            const rankedGroups = await Promise.all(
                Array.from(applicationsByGig.entries()).map(([gigId, applications]) =>
                    attachGigApplicationRecommendations(supabaseClient, gigId, applications)
                )
            )

            const generatedByApplicationId = new Map(
                rankedGroups.flat().map((application: any) => [application.id, application.ai_recommendation || null])
            )
            const rankedApplications = hydratedData
                .map((application: any) => ({
                    ...application,
                    ai_recommendation:
                        existingByApplicationId.get(application.id) ||
                        generatedByApplicationId.get(application.id) ||
                        null,
                }))
                .sort((left: any, right: any) => {
                    const leftRecommendation = left.ai_recommendation
                    const rightRecommendation = right.ai_recommendation
                    if (leftRecommendation?.is_eligible !== rightRecommendation?.is_eligible) {
                        return (
                            Number(rightRecommendation?.is_eligible || false) -
                            Number(leftRecommendation?.is_eligible || false)
                        )
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
                return new Response(
                    JSON.stringify({
                        error: 'Only the selected performer or authorized group leader can manage featuring permission',
                    }),
                    {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 403,
                    }
                )
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
                return new Response(
                    JSON.stringify({
                        error: 'Only the selected performer or authorized group leader can manage featuring permission',
                    }),
                    {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 403,
                    }
                )
            }

            if (!['accepted', 'approved'].includes(String(application.status || '').toLowerCase())) {
                return new Response(
                    JSON.stringify({
                        error: 'Featuring permission is available only for accepted applications',
                    }),
                    {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 409,
                    }
                )
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
                    title:
                        consentStatus === 'accepted'
                            ? 'Featuring permission granted'
                            : 'Performer chose to stay private',
                    message:
                        consentStatus === 'accepted'
                            ? `An accepted performer for "${
                                  application.gig.name || 'your gig'
                              }" approved public featuring.`
                            : `An accepted performer for "${
                                  application.gig.name || 'your gig'
                              }" chose not to be publicly featured.`,
                    meta: buildNotificationRouteMeta(
                        '/manage_gig',
                        { id: application.gig_id, tab: 'Applicants' },
                        {
                            event_type: 'gig_feature_consent_updated',
                            application_id: applicationId,
                            gig_id: application.gig_id,
                            consent_status: consentStatus,
                        }
                    ),
                })
            }

            return new Response(JSON.stringify(updated), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // FETCH GROUP APPLICATIONS (my applications as a group/musician)
        if (action === 'fetch_group_applications') {
            const { groupId } = params
            let query = supabaseClient.from('gig_applications').select(`
                *,
                gig:gigs!gig_id(id, name, location, budget, event_date, status)
             `)

            if (groupId) {
                query = query.eq('group_id', groupId)
            } else {
                query = query.eq('applicant_id', effectiveUserId)
            }

            const { data, error } = await query.order('created_at', {
                ascending: false,
            })

            if (error) throw error
            const hydratedData = await hydrateLegacyApplicationFields(supabaseClient, data || [])
            return new Response(JSON.stringify(hydratedData), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        if (action === 'submit_production_gig_application' && !PRODUCTION_GIG_APPLICATIONS_ENABLED) {
            return new Response(
                JSON.stringify({
                    error: 'Production accounts cannot apply to gigs. Apply from a musician account as solo, duo, or group.',
                    code: 'PRODUCTION_GIG_APPLICATIONS_DISABLED',
                }),
                {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                }
            )
        }

        // Legacy implementation retained for historical reads; server and database gates keep it disabled.
        if (action === 'submit_production_gig_application') {
            const {
                gigId,
                teamId,
                rosterId,
                pitchMessage,
                videoUrl,
                cvUrl,
                slotType,
                videoCopyrightAcknowledged,
                videoCopyrightStatus,
                videoCopyrightReviewId,
                videoCopyrightMetadata,
            } = params

            if (!gigId || !teamId || !rosterId) {
                return new Response(JSON.stringify({ error: 'gigId, teamId, and rosterId are required' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            if (videoUrl && videoCopyrightAcknowledged !== true) {
                return new Response(
                    JSON.stringify({
                        error: 'Performance video rights acknowledgment is required',
                    }),
                    {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 400,
                    }
                )
            }

            const { data: teamMembership, error: teamMembershipError } = await supabaseClient
                .from('production_team_members')
                .select('role')
                .eq('team_id', teamId)
                .eq('user_id', effectiveUserId)
                .in('role', ['owner', 'manager'])
                .maybeSingle()

            if (teamMembershipError) throw teamMembershipError

            if (!teamMembership) {
                return new Response(
                    JSON.stringify({
                        error: 'Only production team owners or managers can send this application',
                    }),
                    {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 403,
                    }
                )
            }

            const { data: gigRecord, error: gigError } = await supabaseClient
                .from('gigs')
                .select('id, name, organizer_id, status')
                .eq('id', gigId)
                .single()

            if (gigError || !gigRecord) {
                return new Response(JSON.stringify({ error: 'Gig not found' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 404,
                })
            }

            if (gigRecord.status && String(gigRecord.status).toLowerCase() !== 'open') {
                return new Response(
                    JSON.stringify({
                        error: 'This gig is not currently accepting applications',
                    }),
                    {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 409,
                    }
                )
            }

            const { data: rosterRecord, error: rosterError } = await supabaseClient
                .from('production_team_roster')
                .select(
                    `
                    id,
                    team_id,
                    entity_kind,
                    profile_id,
                    group_id,
                    group:group_id(id, name, group_type)
                `
                )
                .eq('id', rosterId)
                .eq('team_id', teamId)
                .maybeSingle()

            if (rosterError) throw rosterError

            if (!rosterRecord) {
                return new Response(
                    JSON.stringify({
                        error: 'Selected production roster entry was not found',
                    }),
                    {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 404,
                    }
                )
            }

            const resolvedSlotType = String(
                slotType || (rosterRecord.group?.group_type === 'duo' ? 'duo' : rosterRecord.group ? 'band' : 'solo')
            ).toLowerCase()

            if (rosterRecord.profile_id && resolvedSlotType !== 'solo') {
                return new Response(
                    JSON.stringify({
                        error: 'A musician roster entry can only be submitted to a solo slot',
                    }),
                    {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 400,
                    }
                )
            }

            if (rosterRecord.group_id && rosterRecord.group?.group_type === 'duo' && resolvedSlotType !== 'duo') {
                return new Response(
                    JSON.stringify({
                        error: 'A duo roster entry can only be submitted to a duo slot',
                    }),
                    {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 400,
                    }
                )
            }

            if (rosterRecord.group_id && rosterRecord.group?.group_type === 'band' && resolvedSlotType !== 'band') {
                return new Response(
                    JSON.stringify({
                        error: 'A group roster entry can only be submitted to a band slot',
                    }),
                    {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 400,
                    }
                )
            }

            const { data: existingTeamApplication, error: existingTeamApplicationError } = await supabaseClient
                .from('gig_applications')
                .select('id, status')
                .eq('gig_id', gigId)
                .eq('production_team_id', teamId)
                .in('status', ACTIVE_GIG_APPLICATION_STATUSES)
                .maybeSingle()

            if (existingTeamApplicationError) throw existingTeamApplicationError

            if (existingTeamApplication) {
                return new Response(
                    JSON.stringify({
                        error: 'This production team already has an active application for the selected gig',
                    }),
                    {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 409,
                    }
                )
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
                video_copyright_acknowledged: videoCopyrightAcknowledged === true,
                video_copyright_status: String(videoCopyrightStatus || 'not_screened'),
                video_copyright_review_id: videoCopyrightReviewId || null,
                video_copyright_metadata:
                    videoCopyrightMetadata && typeof videoCopyrightMetadata === 'object' ? videoCopyrightMetadata : {},
            }

            const { data: insertedApplication, error: insertError } = await supabaseClient
                .from('gig_applications')
                .insert(applicationPayload)
                .select(GIG_APPLICATION_SELECT)
                .single()

            if (insertError) {
                if (insertError.code === '23505') {
                    return new Response(
                        JSON.stringify({
                            error: 'This production team already sent an application for this gig',
                        }),
                        {
                            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                            status: 409,
                        }
                    )
                }
                throw insertError
            }

            const hydratedInsertedApplication = await hydrateLegacyApplicationFields(
                supabaseClient,
                insertedApplication
            )
            const performerName =
                rosterRecord.group?.name ||
                hydratedInsertedApplication?.production_roster?.roster_profile?.full_name ||
                'the selected performer'
            const teamName = hydratedInsertedApplication?.production_team?.name || 'Production team'

            if (gigRecord.organizer_id && gigRecord.organizer_id !== effectiveUserId) {
                await insertCoreNotification(supabaseClient, {
                    user_id: gigRecord.organizer_id,
                    type: 'info',
                    title: 'New Application from a Production Team',
                    message: `${teamName} sent ${performerName} for "${gigRecord.name}".`,
                    meta: buildNotificationRouteMeta(
                        '/manage_gig',
                        { id: gigId },
                        {
                            gig_id: gigId,
                            application_id: insertedApplication.id,
                            production_team_id: teamId,
                            production_roster_id: rosterId,
                            performer_name: performerName,
                        }
                    ),
                })
            }

            const { application: audienceApplication, audience } = await resolveGigApplicationAudience(
                supabaseClient,
                insertedApplication.id
            )

            for (const member of audience) {
                if (member.viewer_can_act || member.user_id === effectiveUserId) {
                    continue
                }

                await insertCoreNotification(supabaseClient, {
                    user_id: member.user_id,
                    type: 'info',
                    title: 'Application Sent',
                    message: `${teamName} sent ${performerName} for "${gigRecord.name}".`,
                    meta: buildNotificationRouteMeta(
                        '/bookings',
                        undefined,
                        buildGigApplicationAudienceMeta(audienceApplication, member, {
                            status: 'pending',
                            event_type: 'production_gig_application_submitted',
                            performer_name: performerName,
                        })
                    ),
                })
            }

            return new Response(JSON.stringify(hydratedInsertedApplication), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 201,
            })
        }

        // CHECK EXISTING PRODUCTION GIG APPLICATION
        if (action === 'check_existing_production_application') {
            const { gigId, teamId } = params

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
                .maybeSingle()

            if (membershipError) throw membershipError

            if (!membership) {
                return new Response(
                    JSON.stringify({
                        error: 'Only team members can view this application',
                    }),
                    {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 403,
                    }
                )
            }

            const { data: application, error } = await supabaseClient
                .from('gig_applications')
                .select(GIG_APPLICATION_SELECT)
                .eq('gig_id', gigId)
                .eq('production_team_id', teamId)
                .in('status', ACTIVE_GIG_APPLICATION_STATUSES)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()

            if (error) throw error
            const hydratedApplication = await hydrateLegacyApplicationFields(supabaseClient, application || null)

            return new Response(JSON.stringify({ application: hydratedApplication || null }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // UPDATE APPLICATION STATUS
        if (action === 'update_application_status') {
            const { applicationId, status } = params

            if (!applicationId || !status) {
                return new Response(JSON.stringify({ error: 'applicationId and status are required' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            const normalizedStatus = String(status).toLowerCase()
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
                .single()

            if (appError) throw appError

            const venueStaffAccessLevel = appDetails?.gig_id
                ? await getVenueStaffAccessLevel(supabaseClient, effectiveUserId, appDetails.gig_id)
                : null
            if (
                !appDetails ||
                (appDetails.gig?.organizer_id !== effectiveUserId &&
                    !(venueStaffAccessLevel !== null && venueStaffAccessLevel <= 2))
            ) {
                return new Response(JSON.stringify({ error: 'Forbidden' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                })
            }

            if (appDetails.leader_approval_status === 'pending') {
                return new Response(
                    JSON.stringify({
                        error: 'Application is still awaiting group leader approval',
                    }),
                    {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 409,
                    }
                )
            }

            let data: any = null

            if (normalizedStatus === 'accepted' || normalizedStatus === 'approved') {
                const { data: acceptedApplication, error: acceptError } = await supabaseClient.rpc(
                    'accept_gig_application_safely',
                    {
                        p_application_id: applicationId,
                        p_actor_user_id: effectiveUserId,
                        p_new_status: normalizedStatus,
                    }
                )

                if (acceptError) throw acceptError
                data = acceptedApplication
            } else if (normalizedStatus === 'rejected') {
                const { data: declinedApplication, error: declineError } = await supabaseClient.rpc(
                    'decline_gig_application_safely',
                    {
                        p_application_id: applicationId,
                        p_actor_user_id: effectiveUserId,
                        p_reason: params.reason || null,
                    }
                )

                if (declineError) throw declineError
                data = declinedApplication
            } else if (normalizedStatus === 'fired') {
                const { data: firedApplication, error: fireError } = await supabaseClient.rpc(
                    'terminate_gig_application_safely',
                    {
                        p_application_id: applicationId,
                        p_actor_user_id: effectiveUserId,
                        p_reason: params.reason,
                    }
                )

                if (fireError) throw fireError
                data = firedApplication
            } else {
                const { data: updatedApplication, error } = await supabaseClient
                    .from('gig_applications')
                    .update({ status: normalizedStatus })
                    .eq('id', applicationId)
                    .select()
                    .single()

                if (error) throw error
                data = updatedApplication
            }

            const gigName = appDetails.gig?.name || 'the gig'
            const performerSnapshot =
                appDetails.performer_snapshot && typeof appDetails.performer_snapshot === 'object'
                    ? appDetails.performer_snapshot
                    : {}
            const performerName =
                appDetails.group?.name ||
                appDetails.production_roster?.roster_profile?.full_name ||
                appDetails.production_roster?.roster_group?.name ||
                performerSnapshot.display_name ||
                appDetails.applicant?.full_name ||
                'Applicant'
            const productionLabel = appDetails.production_team?.name ? ` via ${appDetails.production_team.name}` : ''
            await notifyGigApplicationAudience(supabaseClient, applicationId, normalizedStatus, {
                gigName,
                productionLabel,
                actorUserId: effectiveUserId,
                performerName,
            })

            if (normalizedStatus === 'accepted' || normalizedStatus === 'approved') {
                await notifyGigFeatureConsentRequest(supabaseClient, applicationId)
            }

            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // UPDATE LEADER APPROVAL (group leader approves/rejects member-submitted application)
        if (action === 'update_leader_approval') {
            const { applicationId, decision } = params

            if (!applicationId || !decision) {
                return new Response(JSON.stringify({ error: 'applicationId and decision are required' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            const normalizedDecision = String(decision).toLowerCase()
            if (!ALLOWED_LEADER_DECISIONS.has(normalizedDecision)) {
                return new Response(JSON.stringify({ error: `Invalid decision: ${decision}` }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                })
            }

            const { data: appDetails, error: appError } = await supabaseClient
                .from('gig_applications')
                .select(
                    `
                    id,
                    gig_id,
                    group_id,
                    applicant_id,
                    submitted_by_user_id,
                    status,
                    leader_approval_status,
                    ai_portfolio_review_consent,
                    gig:gig_id(id, name, organizer_id),
                    group:group_id(id, name, owner_id)
                `
                )
                .eq('id', applicationId)
                .single()

            if (appError || !appDetails) {
                return new Response(JSON.stringify({ error: 'Application not found' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 404,
                })
            }

            if (!appDetails.group || appDetails.group.owner_id !== effectiveUserId) {
                return new Response(
                    JSON.stringify({
                        error: 'Only the group leader can review this application',
                    }),
                    {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 403,
                    }
                )
            }

            if (appDetails.status !== 'pending') {
                return new Response(
                    JSON.stringify({
                        error: 'Only pending applications can be reviewed by the group leader',
                    }),
                    {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 409,
                    }
                )
            }

            if (appDetails.leader_approval_status && appDetails.leader_approval_status !== 'pending') {
                return new Response(
                    JSON.stringify({
                        error: 'Application has already been reviewed by the group leader',
                    }),
                    {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 409,
                    }
                )
            }

            const updates: Record<string, any> = {
                leader_approval_status: normalizedDecision,
                leader_reviewed_at: new Date().toISOString(),
            }

            if (normalizedDecision === 'rejected') {
                updates.status = 'rejected'
            }

            const { data, error } = await supabaseClient
                .from('gig_applications')
                .update(updates)
                .eq('id', applicationId)
                .select()
                .single()

            if (error) throw error

            if (normalizedDecision === 'approved' && appDetails.ai_portfolio_review_consent === true) {
                try {
                    await queueGigPortfolioReview(supabaseClient, applicationId)
                    await scheduleGigPortfolioReview(supabaseClient, applicationId, supabaseUrl)
                } catch (reviewError) {
                    console.warn('group_gig_ai_review_queue_failed', {
                        message: String((reviewError as any)?.message || reviewError),
                    })
                }
            }

            const gigName = appDetails.gig?.name || 'the gig'
            const groupName = appDetails.group?.name || 'your group'
            const submitterId = appDetails.submitted_by_user_id || appDetails.applicant_id

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
                })
            }

            if (
                normalizedDecision === 'approved' &&
                appDetails.gig?.organizer_id &&
                appDetails.gig.organizer_id !== effectiveUserId
            ) {
                await insertCoreNotification(supabaseClient, {
                    user_id: appDetails.gig.organizer_id,
                    type: 'info',
                    title: 'New Gig Application',
                    message: `${groupName} has a new application for "${gigName}" awaiting your review.`,
                    meta: buildNotificationRouteMeta(
                        '/manage_gig',
                        { id: appDetails.gig_id },
                        {
                            gig_id: appDetails.gig_id,
                            application_id: applicationId,
                            applicant_id: appDetails.applicant_id,
                            group_id: appDetails.group_id,
                            submitted_by_user_id: appDetails.submitted_by_user_id,
                            leader_approved_by: effectiveUserId,
                        }
                    ),
                })
            }

            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // CHECK ELIGIBILITY (Spam Block Check)
        if (action === 'check_eligibility') {
            const { gigId, groupId, productionTeamId } = params

            if (!gigId) {
                return new Response(JSON.stringify({ blocked: false }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200,
                })
            }

            const thirtyDaysAgo = new Date()
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

            let cancellationQuery = supabaseClient
                .from('gig_applications')
                .select('id', { count: 'exact', head: true })
                .eq('status', 'cancelled')
                .eq('gig_id', gigId)
                .gte('updated_at', thirtyDaysAgo.toISOString())

            if (productionTeamId) {
                cancellationQuery = cancellationQuery.eq('production_team_id', productionTeamId)
            } else if (groupId) {
                cancellationQuery = cancellationQuery.eq('group_id', groupId).is('production_team_id', null)
            } else {
                cancellationQuery = cancellationQuery
                    .eq('applicant_id', effectiveUserId)
                    .is('group_id', null)
                    .is('production_team_id', null)
            }

            const { count, error: countError } = await cancellationQuery

            if (countError) throw countError

            const blocked = (count || 0) >= 3
            return new Response(
                JSON.stringify({
                    blocked,
                    reason: blocked ? 'Maximum attempts reached for this gig.' : null,
                }),
                {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200,
                }
            )
        }

        // CANCEL APPLICATION
        if (action === 'cancel_application') {
            const { applicationId } = params

            const { data: existingApp, error: fetchError } = await supabaseClient
                .from('gig_applications')
                .select(
                    'applicant_id, submitted_by_user_id, gig_id, group_id, production_team_id, group:groups!group_id(owner_id), gig:gig_id(name)'
                )
                .eq('id', applicationId)
                .single()

            if (fetchError) throw fetchError
            if (!existingApp) throw new Error('Application not found')

            const isApplicant =
                existingApp.applicant_id === effectiveUserId || existingApp.submitted_by_user_id === effectiveUserId
            const isGroupOwner = !existingApp.production_team_id && existingApp.group?.owner_id === effectiveUserId
            let isProductionManager = false

            if (existingApp.production_team_id) {
                const { data: teamMembership, error: teamMembershipError } = await supabaseClient
                    .from('production_team_members')
                    .select('role')
                    .eq('team_id', existingApp.production_team_id)
                    .eq('user_id', effectiveUserId)
                    .in('role', ['owner', 'manager'])
                    .maybeSingle()

                if (teamMembershipError) throw teamMembershipError
                isProductionManager = !!teamMembership
            }

            if (!isApplicant && !isGroupOwner && !isProductionManager) {
                return new Response(JSON.stringify({ error: 'Unauthorized to cancel this application' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                })
            }

            const { error: updateError } = await supabaseClient
                .from('gig_applications')
                .update({ status: 'cancelled' })
                .eq('id', applicationId)

            if (updateError) throw updateError

            try {
                await notifyGigApplicationAudience(supabaseClient, applicationId, 'cancelled', {
                    gigName: existingApp.gig?.name || 'this gig',
                    actorUserId: effectiveUserId,
                    includeOrganizer: true,
                })
            } catch (notifyError) {
                console.error('Failed to notify gig application audience:', notifyError)
            }

            let cancellationCount = 0

            if (existingApp.gig_id) {
                const thirtyDaysAgo = new Date()
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

                let cancellationQuery = supabaseClient
                    .from('gig_applications')
                    .select('id', { count: 'exact', head: true })
                    .eq('status', 'cancelled')
                    .eq('gig_id', existingApp.gig_id)
                    .gte('updated_at', thirtyDaysAgo.toISOString())

                if (existingApp.production_team_id) {
                    cancellationQuery = cancellationQuery.eq('production_team_id', existingApp.production_team_id)
                } else if (existingApp.group_id) {
                    cancellationQuery = cancellationQuery
                        .eq('group_id', existingApp.group_id)
                        .is('production_team_id', null)
                } else {
                    cancellationQuery = cancellationQuery
                        .eq('applicant_id', existingApp.applicant_id)
                        .is('group_id', null)
                        .is('production_team_id', null)
                }

                const { count } = await cancellationQuery
                cancellationCount = count || 0
            }

            return new Response(
                JSON.stringify({
                    success: true,
                    cancellation_count: cancellationCount,
                }),
                {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200,
                }
            )
        }

        throw new Error('Invalid action')
    } catch (error: any) {
        console.error('Edge Function Error:', error)
        return new Response(
            JSON.stringify({
                error: error.message,
                details: error.toString(),
                hint: error.hint || null,
                code: error.code || null,
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            }
        )
    }
})
