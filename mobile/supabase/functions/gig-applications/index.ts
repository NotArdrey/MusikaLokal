// @ts-ignore
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildNotificationRouteMeta } from "../_shared/notificationRoutes.ts";
import {
    buildGigApplicationAudienceMeta,
    resolveGigApplicationAudience,
} from "../_shared/gigApplicationAudience.ts";

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

const ALLOWED_ORGANIZER_STATUSES = new Set(['accepted', 'rejected', 'cancelled', 'completed', 'fired'])
const ALLOWED_LEADER_DECISIONS = new Set(['approved', 'rejected'])

const GIG_APPLICATION_SELECT = `
    *,
    applicant:profiles!applicant_id(id, full_name, avatar_url, role, bio, location),
    submitter:profiles!submitted_by_user_id(id, full_name, avatar_url, email),
    group:groups!group_id(id, name, genre, description, location, rate, group_type),
    production_team:production_team_id(id, name, logo_url),
    production_roster:production_roster_id(
        id,
        entity_kind,
        profile_id,
        group_id,
        roster_profile:profile_id(id, full_name, avatar_url, role, bio, location),
        roster_group:group_id(id, name, genre, description, location, rate, group_type)
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

    if (normalizedStatus === 'accepted') {
        return {
            type: 'success',
            title: 'Application Accepted!',
            message: `Your application for "${gigName}"${productionLabel} has been accepted.`,
        }
    }

    if (normalizedStatus === 'cancelled' || normalizedStatus === 'fired') {
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
            title: 'Musician Resigned',
            message: `A performer has resigned from "${gigName}"${productionLabel}.`,
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

        await supabaseClient
            .from('notifications')
            .insert({
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

            if (gigRecord.organizer_id !== effectiveUserId) {
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
            return new Response(JSON.stringify(hydratedData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
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
                .neq('status', 'rejected')
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
                await supabaseClient
                    .from('notifications')
                    .insert({
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

                await supabaseClient
                    .from('notifications')
                    .insert({
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

            if (!appDetails || appDetails.gig?.organizer_id !== effectiveUserId) {
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

            const { data, error } = await supabaseClient
                .from('gig_applications')
                .update({ status: normalizedStatus })
                .eq('id', applicationId)
                .select()
                .single();

            if (error) throw error;

            const gigName = appDetails.gig?.name || 'the gig';
            const performerName =
                appDetails.group?.name ||
                appDetails.production_roster?.roster_profile?.full_name ||
                appDetails.production_roster?.roster_group?.name ||
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
                await supabaseClient
                    .from('notifications')
                    .insert({
                        user_id: submitterId,
                        type: normalizedDecision === 'approved' ? 'success' : 'warning',
                        title:
                            normalizedDecision === 'approved'
                                ? 'Application Forwarded to Venue'
                                : 'Application Rejected by Group Leader',
                        message:
                            normalizedDecision === 'approved'
                                ? `Your ${groupName} application for "${gigName}" was approved by your group leader and sent to the venue owner.`
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
                await supabaseClient
                    .from('notifications')
                    .insert({
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
            const { gigId } = params;

            if (!gigId) {
                return new Response(JSON.stringify({ blocked: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
            }

            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const { count, error: countError } = await supabaseClient
                .from('gig_applications')
                .select('id', { count: 'exact', head: true })
                .eq('status', 'cancelled')
                .eq('applicant_id', effectiveUserId)
                .eq('gig_id', gigId)
                .gte('updated_at', thirtyDaysAgo.toISOString());

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
                .select('applicant_id, submitted_by_user_id, group_id, production_team_id, group:groups!group_id(owner_id), gig:gig_id(name)')
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

            const { data: appData } = await supabaseClient
                .from('gig_applications')
                .select('gig_id')
                .eq('id', applicationId)
                .single();

            if (appData?.gig_id) {
                const { data: gigData } = await supabaseClient
                    .from('gigs')
                    .select('organizer_id')
                    .eq('id', appData.gig_id)
                    .single();

                if (gigData) {
                    const thirtyDaysAgo = new Date();
                    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

                    const { count } = await supabaseClient
                        .from('gig_applications')
                        .select('id, gig:gigs!inner(organizer_id)', { count: 'exact', head: true })
                        .eq('status', 'cancelled')
                        .eq('applicant_id', effectiveUserId)
                        .eq('gig.organizer_id', gigData.organizer_id)
                        .gte('updated_at', thirtyDaysAgo.toISOString());

                    cancellationCount = count || 0;
                }
            }

            return new Response(JSON.stringify({ success: true, cancellation_count: cancellationCount }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        throw new Error('Invalid action')

    } catch (error: any) {
        console.error('❌ Edge Function Error:', error);
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
