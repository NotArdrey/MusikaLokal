// @ts-ignore
import { createClient } from "npm:@supabase/supabase-js@2";

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
            console.error('Missing Supabase env vars');
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
                .select(`
                    *,
                    applicant:profiles!applicant_id(id, full_name, avatar_url, role, skills, genres, bio, location, portfolio_urls),
                    group:groups!group_id(id, name, genre, images, members, description, location, rate)
                `)
                .eq('gig_id', gigId)
                .or('leader_approval_status.is.null,leader_approval_status.eq.approved')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        // FETCH GROUP APPLICATIONS (my applications as a group/musician)
        if (action === 'fetch_group_applications') {
            const { groupId } = params;
            let query = supabaseClient.from('gig_applications').select(`
                *,
                gig:gigs!gig_id(name, location, budget, event_date, status, images)
             `);

            if (groupId) {
                query = query.eq('group_id', groupId);
            } else {
                query = query.eq('applicant_id', effectiveUserId);
            }

            const { data, error } = await query.order('created_at', { ascending: false });

            if (error) throw error;
            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
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
                .select(`
                    *,
                    gig:gig_id(name, organizer_id),
                    applicant:applicant_id(full_name),
                    group:group_id(name)
                `)
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

            let notificationType = 'info';
            let notificationTitle = '';
            let notificationMessage = '';

            if (normalizedStatus === 'rejected') {
                notificationType = 'warning';
                notificationTitle = 'Application Declined';
                notificationMessage = `Your application for "${gigName}" has been declined.`;
            } else if (normalizedStatus === 'accepted') {
                notificationType = 'success';
                notificationTitle = 'Application Accepted! 🎉';
                notificationMessage = `Congratulations! Your application for "${gigName}" has been accepted.`;
            }

            if (notificationTitle) {
                await supabaseClient
                    .from('notifications')
                    .insert({
                        user_id: appDetails.applicant_id,
                        type: notificationType,
                        title: notificationTitle,
                        message: notificationMessage,
                        meta: {
                            gig_id: appDetails.gig_id,
                            application_id: applicationId,
                            status: normalizedStatus
                        }
                    });
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
                        meta: {
                            gig_id: appDetails.gig_id,
                            application_id: applicationId,
                            group_id: appDetails.group_id,
                            leader_approval_status: normalizedDecision,
                        },
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
                        meta: {
                            gig_id: appDetails.gig_id,
                            application_id: applicationId,
                            applicant_id: appDetails.applicant_id,
                            group_id: appDetails.group_id,
                            submitted_by_user_id: appDetails.submitted_by_user_id,
                            leader_approved_by: effectiveUserId,
                        },
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
                .select('applicant_id, group_id, group:groups!group_id(owner_id)')
                .eq('id', applicationId)
                .single();

            if (fetchError) throw fetchError;
            if (!existingApp) throw new Error('Application not found');

            const isApplicant = existingApp.applicant_id === effectiveUserId;
            const isGroupOwner = existingApp.group?.owner_id === effectiveUserId;

            if (!isApplicant && !isGroupOwner) {
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