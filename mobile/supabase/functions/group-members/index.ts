// @ts-ignore
import { createClient } from "npm:@supabase/supabase-js@2";
import {
    buildNotificationRouteMeta,
    withNotificationSeverityType,
} from "../_shared/notificationRoutes.ts";
import { scheduleCoreActionEmailForNotification } from "../_shared/coreActionEmail.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
}

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status,
    });
}

const GROUP_APPLICATION_STATUSES = [
    'pending',
    'accepted',
    'approved',
    'connected',
    'rejected',
    'declined',
    'cancelled',
];

async function insertCoreNotifications(supabaseClient: any, payload: Record<string, unknown> | Record<string, unknown>[]) {
    const payloads = (Array.isArray(payload) ? payload : [payload]).map(withNotificationSeverityType);
    const insertPayload = Array.isArray(payload) ? payloads : payloads[0];
    const { error } = await supabaseClient.from('notifications').insert(insertPayload);

    if (error) {
        console.error('group_member_notification_failed', { message: error.message });
        return;
    }

    for (const item of payloads) {
        scheduleCoreActionEmailForNotification(supabaseClient, item, { source: 'group-members' });
    }
}

function uniqueStrings(values: unknown[]) {
    return Array.from(
        new Set(
            values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
        ),
    );
}

async function loadProfileLegacyById(supabaseClient: any, profileIds: string[]) {
    const ids = uniqueStrings(profileIds);
    const legacyById = new Map<string, any>();
    if (ids.length === 0) return legacyById;

    const { data, error } = await supabaseClient
        .from('profiles_legacy_projection')
        .select('id, skills, genres')
        .in('id', ids);

    if (error) throw error;

    (data || []).forEach((row: any) => legacyById.set(row.id, row));
    return legacyById;
}

function mergeProfileLegacy(profile: any, legacyById: Map<string, any>) {
    if (!profile?.id) return profile || null;
    const legacy = legacyById.get(profile.id);

    return {
        ...profile,
        skills: Array.isArray(legacy?.skills) ? legacy.skills : [],
        genres: Array.isArray(legacy?.genres) ? legacy.genres : [],
    };
}

async function hydrateMemberProfileLegacy(supabaseClient: any, rows: any[]) {
    const legacyById = await loadProfileLegacyById(
        supabaseClient,
        rows.map((row: any) => row?.user?.id || row?.user_id),
    );

    return rows.map((row: any) => ({
        ...row,
        user: mergeProfileLegacy(row?.user, legacyById),
    }));
}

async function hydrateApplicantProfileLegacy(supabaseClient: any, rows: any[]) {
    const legacyById = await loadProfileLegacyById(
        supabaseClient,
        rows.map((row: any) => row?.applicant?.id || row?.sender_id),
    );

    return rows.map((row: any) => ({
        ...row,
        applicant: mergeProfileLegacy(row?.applicant, legacyById),
    }));
}

function isGroupApplicationRequest(request: any) {
    const eventDetails =
        request?.event_details && typeof request.event_details === 'object'
            ? request.event_details
            : {};
    const requestDetails =
        eventDetails?.request_details && typeof eventDetails.request_details === 'object'
            ? eventDetails.request_details
            : {};
    const requestKind = String(
        eventDetails?.request_kind || requestDetails?.request_kind || '',
    ).trim().toLowerCase();
    const applicationScope = String(eventDetails?.application_scope || '').trim().toLowerCase();

    return requestKind === 'application' && applicationScope === 'group_member';
}

function isGroupInviteRequest(request: any) {
    const eventDetails =
        request?.event_details && typeof request.event_details === 'object'
            ? request.event_details
            : {};
    const requestDetails =
        eventDetails?.request_details && typeof eventDetails.request_details === 'object'
            ? eventDetails.request_details
            : {};
    const requestKind = String(
        eventDetails?.request_kind || requestDetails?.request_kind || '',
    ).trim().toLowerCase();
    const applicationScope = String(eventDetails?.application_scope || '').trim().toLowerCase();
    const senderEntityType = String(eventDetails?.sender_entity_type || '').trim().toLowerCase();
    const receiverEntityType = String(eventDetails?.receiver_entity_type || '').trim().toLowerCase();

    return (
        requestKind === 'invite' &&
        applicationScope === 'group_member' &&
        senderEntityType === 'group' &&
        receiverEntityType === 'musician'
    );
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            })
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

        const supabaseClient = createClient(
            supabaseUrl,
            serviceRoleKey,
        )

        if (!supabaseUrl || !serviceRoleKey) {
            console.error('Missing Supabase env vars');
            return new Response(JSON.stringify({ error: 'Server misconfiguration: Missing Supabase env vars' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500,
            })
        }

        const token = authHeader.replace(/^Bearer\s+/i, '')
        const {
            data: { user: authUser },
            error: authUserError,
        } = await supabaseClient.auth.getUser(token)

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

        // FETCH GROUP MEMBERS
        if (action === 'fetch_group_members') {
            const { groupId } = params;

            if (!groupId) {
                return new Response(JSON.stringify({ error: 'Missing groupId' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            const { data, error } = await supabaseClient
                .from('group_members')
                .select(`
                    id,
                    user_id,
                    role,
                    joined_at,
                    user:profiles!user_id(id, full_name, avatar_url, email)
                `)
                .eq('group_id', groupId)
                .order('joined_at', { ascending: true });

            if (error) throw error;
            const hydratedData = await hydrateMemberProfileLegacy(supabaseClient, data || []);

            return new Response(JSON.stringify(hydratedData), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // FETCH MEMBER APPLICATIONS FOR A GROUP
        if (action === 'fetch_group_applications') {
            const { groupId } = params;

            if (!groupId) {
                return jsonResponse({ error: 'Missing groupId' }, 400);
            }

            const { data: group, error: groupError } = await supabaseClient
                .from('groups')
                .select('owner_id, name')
                .eq('id', groupId)
                .single();

            if (groupError || !group) {
                return jsonResponse({ error: 'Group not found' }, 404);
            }

            if (group.owner_id !== effectiveUserId) {
                return jsonResponse({ error: 'Only the group owner can view applications' }, 403);
            }

            const { data: requestRows, error: requestError } = await supabaseClient
                .from('booking_requests')
                .select('id, created_at, sender_id, receiver_id, group_id, status, message, attachment_url, event_details')
                .eq('group_id', groupId)
                .in('status', GROUP_APPLICATION_STATUSES)
                .order('created_at', { ascending: false });

            if (requestError) throw requestError;

            const applications = (requestRows || []).filter(isGroupApplicationRequest);
            const applicantIds = Array.from(
                new Set(
                    applications
                        .map((request: any) => request.sender_id)
                        .filter((senderId: unknown): senderId is string =>
                            typeof senderId === 'string' && senderId.trim().length > 0,
                        ),
                ),
            );
            const applicantProfilesById = new Map<string, any>();

            if (applicantIds.length > 0) {
                const { data: profiles, error: profileError } = await supabaseClient
                    .from('profiles')
                    .select('id, full_name, avatar_url, email')
                    .in('id', applicantIds);

                if (profileError) throw profileError;

                const hydratedProfiles = await hydrateApplicantProfileLegacy(
                    supabaseClient,
                    (profiles || []).map((profile: any) => ({ sender_id: profile.id, applicant: profile })),
                );

                hydratedProfiles.forEach((profileRow: any) => {
                    const profile = profileRow.applicant;
                    if (profile?.id) {
                        applicantProfilesById.set(profile.id, profile);
                    }
                });
            }

            return jsonResponse({
                success: true,
                applications: applications.map((request: any) => ({
                    ...request,
                    applicant: applicantProfilesById.get(request.sender_id) || null,
                })),
            });
        }

        // RESPOND TO A MEMBER APPLICATION
        if (action === 'respond_group_application') {
            const { requestId, decision, memberRole } = params;
            const normalizedDecision = String(decision || '').trim().toLowerCase();
            const isAccepted = ['accept', 'accepted', 'approve', 'approved'].includes(normalizedDecision);
            const isDeclined = ['decline', 'declined', 'reject', 'rejected'].includes(normalizedDecision);

            if (!requestId || (!isAccepted && !isDeclined)) {
                return jsonResponse({ error: 'Missing requestId or valid decision' }, 400);
            }

            const { data: requestRow, error: requestError } = await supabaseClient
                .from('booking_requests')
                .select('id, sender_id, receiver_id, group_id, status, event_details')
                .eq('id', requestId)
                .maybeSingle();

            if (requestError) throw requestError;
            if (!requestRow) {
                return jsonResponse({ error: 'Application not found' }, 404);
            }

            if (!isGroupApplicationRequest(requestRow)) {
                return jsonResponse({ error: 'Request is not a group application' }, 400);
            }

            if (requestRow.status !== 'pending') {
                return jsonResponse({ error: 'This application is no longer pending' }, 409);
            }

            const { data: group, error: groupError } = await supabaseClient
                .from('groups')
                .select('owner_id, name')
                .eq('id', requestRow.group_id)
                .single();

            if (groupError || !group) {
                return jsonResponse({ error: 'Group not found' }, 404);
            }

            if (group.owner_id !== effectiveUserId) {
                return jsonResponse({ error: 'Only the group owner can respond to applications' }, 403);
            }

            const nextStatus = isAccepted ? 'accepted' : 'declined';
            let memberRow = null;

            if (isAccepted) {
                const { data: existingMember, error: existingMemberError } = await supabaseClient
                    .from('group_members')
                    .select('id, group_id, user_id, role, joined_at')
                    .eq('group_id', requestRow.group_id)
                    .eq('user_id', requestRow.sender_id)
                    .maybeSingle();

                if (existingMemberError) throw existingMemberError;

                if (existingMember) {
                    memberRow = existingMember;
                } else {
                    const { data: insertedMember, error: insertMemberError } = await supabaseClient
                        .from('group_members')
                        .insert({
                            group_id: requestRow.group_id,
                            user_id: requestRow.sender_id,
                            role: memberRole || 'member',
                        })
                        .select('id, group_id, user_id, role, joined_at')
                        .single();

                    if (insertMemberError) {
                        if (insertMemberError.code === '23505') {
                            const { data: duplicateMember } = await supabaseClient
                                .from('group_members')
                                .select('id, group_id, user_id, role, joined_at')
                                .eq('group_id', requestRow.group_id)
                                .eq('user_id', requestRow.sender_id)
                                .maybeSingle();
                            memberRow = duplicateMember || null;
                        } else {
                            throw insertMemberError;
                        }
                    } else {
                        memberRow = insertedMember;
                    }
                }
            }

            const previousEventDetails =
                requestRow.event_details && typeof requestRow.event_details === 'object'
                    ? requestRow.event_details
                    : {};
            const updatedEventDetails = {
                ...previousEventDetails,
                status: nextStatus,
                responded_at: new Date().toISOString(),
                responded_by: effectiveUserId,
            };

            const { data: updatedRequest, error: updateError } = await supabaseClient
                .from('booking_requests')
                .update({
                    status: nextStatus,
                    event_details: updatedEventDetails,
                })
                .eq('id', requestId)
                .eq('status', 'pending')
                .select('id, created_at, sender_id, receiver_id, group_id, status, event_details')
                .maybeSingle();

            if (updateError) throw updateError;
            if (!updatedRequest) {
                return jsonResponse({ error: 'This application is no longer pending' }, 409);
            }

            const routeMeta = buildNotificationRouteMeta('/bookings', { tab: 'History' }, {
                type: 'group_member_application_response',
                request_id: requestId,
                group_id: requestRow.group_id,
                status: nextStatus,
            });

            await insertCoreNotifications(supabaseClient, [
                {
                    user_id: requestRow.sender_id,
                    type: isAccepted ? 'success' : 'warning',
                    title: isAccepted ? 'Group Application Accepted' : 'Group Application Declined',
                    message: isAccepted
                        ? `You have been added to "${group.name}".`
                        : `Your application to "${group.name}" was declined.`,
                    meta: routeMeta,
                },
                {
                    user_id: effectiveUserId,
                    type: isAccepted ? 'success' : 'info',
                    title: isAccepted ? 'Member Added' : 'Application Declined',
                    message: isAccepted
                        ? `A new member was added to "${group.name}".`
                        : `You declined an application to "${group.name}".`,
                    meta: routeMeta,
                },
            ]);

            return jsonResponse({
                success: true,
                request: updatedRequest,
                member: memberRow,
            });
        }

        // RESPOND TO A GROUP MEMBER INVITE
        if (action === 'respond_group_invite') {
            const { requestId, decision, memberRole } = params;
            const normalizedDecision = String(decision || '').trim().toLowerCase();
            const isAccepted = ['accept', 'accepted', 'approve', 'approved'].includes(normalizedDecision);
            const isDeclined = ['decline', 'declined', 'reject', 'rejected'].includes(normalizedDecision);

            if (!requestId || (!isAccepted && !isDeclined)) {
                return jsonResponse({ error: 'Missing requestId or valid decision' }, 400);
            }

            const { data: requestRow, error: requestError } = await supabaseClient
                .from('booking_requests')
                .select('id, sender_id, receiver_id, group_id, status, event_details')
                .eq('id', requestId)
                .maybeSingle();

            if (requestError) throw requestError;
            if (!requestRow) {
                return jsonResponse({ error: 'Invite not found' }, 404);
            }

            if (!isGroupInviteRequest(requestRow)) {
                return jsonResponse({ error: 'Request is not a group invite' }, 400);
            }

            if (requestRow.status !== 'pending') {
                return jsonResponse({ error: 'This invite is no longer pending' }, 409);
            }

            if (requestRow.receiver_id !== effectiveUserId) {
                return jsonResponse({ error: 'Only the invited musician can respond' }, 403);
            }

            const { data: group, error: groupError } = await supabaseClient
                .from('groups')
                .select('owner_id, name')
                .eq('id', requestRow.group_id)
                .single();

            if (groupError || !group) {
                return jsonResponse({ error: 'Group not found' }, 404);
            }

            const nextStatus = isAccepted ? 'accepted' : 'declined';
            let memberRow = null;

            if (isAccepted) {
                const { data: existingMember, error: existingMemberError } = await supabaseClient
                    .from('group_members')
                    .select('id, group_id, user_id, role, joined_at')
                    .eq('group_id', requestRow.group_id)
                    .eq('user_id', effectiveUserId)
                    .maybeSingle();

                if (existingMemberError) throw existingMemberError;

                if (existingMember) {
                    memberRow = existingMember;
                } else {
                    const { data: insertedMember, error: insertMemberError } = await supabaseClient
                        .from('group_members')
                        .insert({
                            group_id: requestRow.group_id,
                            user_id: effectiveUserId,
                            role: memberRole || 'member',
                        })
                        .select('id, group_id, user_id, role, joined_at')
                        .single();

                    if (insertMemberError) {
                        if (insertMemberError.code === '23505') {
                            const { data: duplicateMember } = await supabaseClient
                                .from('group_members')
                                .select('id, group_id, user_id, role, joined_at')
                                .eq('group_id', requestRow.group_id)
                                .eq('user_id', effectiveUserId)
                                .maybeSingle();
                            memberRow = duplicateMember || null;
                        } else {
                            throw insertMemberError;
                        }
                    } else {
                        memberRow = insertedMember;
                    }
                }
            }

            const previousEventDetails =
                requestRow.event_details && typeof requestRow.event_details === 'object'
                    ? requestRow.event_details
                    : {};
            const updatedEventDetails = {
                ...previousEventDetails,
                status: nextStatus,
                responded_at: new Date().toISOString(),
                responded_by: effectiveUserId,
            };

            const { data: updatedRequest, error: updateError } = await supabaseClient
                .from('booking_requests')
                .update({
                    status: nextStatus,
                    event_details: updatedEventDetails,
                })
                .eq('id', requestId)
                .eq('status', 'pending')
                .select('id, created_at, sender_id, receiver_id, group_id, status, event_details')
                .maybeSingle();

            if (updateError) throw updateError;
            if (!updatedRequest) {
                return jsonResponse({ error: 'This invite is no longer pending' }, 409);
            }

            const routeMeta = buildNotificationRouteMeta('/bookings', { tab: 'History' }, {
                type: 'group_member_invite_response',
                request_id: requestId,
                group_id: requestRow.group_id,
                status: nextStatus,
            });

            await insertCoreNotifications(supabaseClient, [
                {
                    user_id: group.owner_id,
                    type: isAccepted ? 'success' : 'warning',
                    title: isAccepted ? 'Group Invite Accepted' : 'Group Invite Declined',
                    message: isAccepted
                        ? `A musician accepted your invite to "${group.name}".`
                        : `A musician declined your invite to "${group.name}".`,
                    meta: routeMeta,
                },
                {
                    user_id: effectiveUserId,
                    type: isAccepted ? 'success' : 'info',
                    title: isAccepted ? 'Joined Group' : 'Invite Declined',
                    message: isAccepted
                        ? `You joined "${group.name}".`
                        : `You declined the invite to "${group.name}".`,
                    meta: routeMeta,
                },
            ]);

            return jsonResponse({
                success: true,
                request: updatedRequest,
                member: memberRow,
            });
        }

        // ADD MEMBER TO GROUP
        if (action === 'add_group_member') {
            const { groupId, targetUserId, memberRole } = params;

            if (!groupId || !targetUserId) {
                return new Response(JSON.stringify({ error: 'Missing groupId or targetUserId' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            const { data: group, error: groupError } = await supabaseClient
                .from('groups')
                .select('owner_id, name')
                .eq('id', groupId)
                .single();

            if (groupError || !group) {
                return new Response(JSON.stringify({ error: 'Group not found' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 404,
                });
            }

            if (group.owner_id !== effectiveUserId) {
                return new Response(JSON.stringify({ error: 'Only the group owner can add members' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                });
            }

            const { data: existingMember } = await supabaseClient
                .from('group_members')
                .select('id')
                .eq('group_id', groupId)
                .eq('user_id', targetUserId)
                .maybeSingle();

            if (existingMember) {
                return new Response(JSON.stringify({ error: 'User is already a member of this group' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            const { data, error } = await supabaseClient
                .from('group_members')
                .insert({
                    group_id: groupId,
                    user_id: targetUserId,
                    role: memberRole || 'member'
                })
                .select()
                .single();

            if (error) throw error;

            await insertCoreNotifications(supabaseClient, {
                user_id: targetUserId,
                type: 'success',
                title: 'Added to Group',
                message: `You have been added to the group "${group.name}"`,
                meta: buildNotificationRouteMeta('/group_details', { id: groupId }, {
                    type: 'group_member_added',
                    group_id: groupId,
                })
            });

            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // REMOVE MEMBER FROM GROUP
        if (action === 'remove_group_member') {
            const { groupId, targetUserId } = params;

            if (!groupId || !targetUserId) {
                return new Response(JSON.stringify({ error: 'Missing groupId or targetUserId' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            const { data: group, error: groupError } = await supabaseClient
                .from('groups')
                .select('owner_id, name')
                .eq('id', groupId)
                .single();

            if (groupError || !group) {
                return new Response(JSON.stringify({ error: 'Group not found' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 404,
                });
            }

            if (group.owner_id !== effectiveUserId && targetUserId !== effectiveUserId) {
                return new Response(JSON.stringify({ error: 'Only the group owner can remove members, or members can leave themselves' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                });
            }

            if (targetUserId === group.owner_id) {
                return new Response(JSON.stringify({ error: 'The group owner cannot be removed. Transfer leadership first.' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            const { error } = await supabaseClient
                .from('group_members')
                .delete()
                .eq('group_id', groupId)
                .eq('user_id', targetUserId);

            if (error) throw error;

            if (targetUserId !== effectiveUserId) {
                await insertCoreNotifications(supabaseClient, {
                    user_id: targetUserId,
                    type: 'warning',
                    title: 'Removed from Group',
                    message: `You have been removed from the group "${group.name}"`,
                    meta: buildNotificationRouteMeta('/group_details', { id: groupId }, {
                        type: 'group_member_removed',
                        group_id: groupId,
                    })
                });
            }

            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // UPDATE MEMBER ROLE IN GROUP
        if (action === 'update_group_member_role') {
            const { groupId, targetUserId, newRole } = params;

            if (!groupId || !targetUserId || !newRole) {
                return new Response(JSON.stringify({ error: 'Missing required fields' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            const { data: group, error: groupError } = await supabaseClient
                .from('groups')
                .select('owner_id')
                .eq('id', groupId)
                .single();

            if (groupError || !group || group.owner_id !== effectiveUserId) {
                return new Response(JSON.stringify({ error: 'Only the group owner can update member roles' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                });
            }

            if (targetUserId === group.owner_id) {
                return new Response(JSON.stringify({ error: 'Cannot change owner role. Use leadership transfer instead.' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            const { data, error } = await supabaseClient
                .from('group_members')
                .update({ role: newRole })
                .eq('group_id', groupId)
                .eq('user_id', targetUserId)
                .select()
                .single();

            if (error) throw error;

            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
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
