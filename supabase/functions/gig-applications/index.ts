// @ts-ignore
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
}

function decodeJwtPayload(token: string): { sub?: string; email?: string } | null {
    try {
        const parts = token.replace('Bearer ', '').split('.')
        if (parts.length !== 3) return null
        let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
        while (base64.length % 4) {
            base64 += '='
        }
        const payload = JSON.parse(atob(base64))
        return payload
    } catch (e) {
        console.error('JWT decode error:', e)
        return null
    }
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

        const jwtPayload = decodeJwtPayload(authHeader)
        if (!jwtPayload || !jwtPayload.sub) {
            return new Response(JSON.stringify({ error: 'Invalid token' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            })
        }

        const authenticatedUserId = jwtPayload.sub

        const supabaseClient = createClient(
            // @ts-ignore
            Deno.env.get('SUPABASE_URL') ?? '',
            // @ts-ignore
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        )

        if (!Deno.env.get('SUPABASE_URL') || !Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
            console.error('Missing Supabase env vars');
            return new Response(JSON.stringify({ error: 'Server misconfiguration: Missing Supabase env vars' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500,
            })
        }

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
                gig:gigs!gig_id(name, location, budget, event_date, status, images),
                applicant:profiles!applicant_id(id, full_name, avatar_url)
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

        // LEADER APPROVAL FOR GROUP APPLICATIONS
        if (action === 'update_leader_approval') {
            const { applicationId, decision } = params; // decision: 'approved' | 'rejected'

            if (!applicationId || !decision || !['approved', 'rejected'].includes(decision)) {
                return new Response(JSON.stringify({ error: 'Invalid applicationId or decision' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            const { data: appRow, error: appFetchError } = await supabaseClient
                .from('gig_applications')
                .select('id, applicant_id, group_id, gig_id, leader_approval_status, gig:gig_id(name, organizer_id), group:group_id(owner_id, name)')
                .eq('id', applicationId)
                .single();

            if (appFetchError || !appRow) {
                return new Response(JSON.stringify({ error: 'Application not found' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 404,
                });
            }

            if (!appRow.group_id) {
                return new Response(JSON.stringify({ error: 'Leader approval only applies to group applications' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            if (appRow.group?.owner_id !== effectiveUserId) {
                return new Response(JSON.stringify({ error: 'Only the group leader can review this application' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                });
            }

            const { data: updated, error: updateError } = await supabaseClient
                .from('gig_applications')
                .update({
                    leader_approval_status: decision,
                    leader_reviewed_at: new Date().toISOString(),
                })
                .eq('id', applicationId)
                .select('*')
                .single();

            if (updateError) throw updateError;

            await supabaseClient.from('notifications').insert({
                user_id: appRow.applicant_id,
                type: decision === 'approved' ? 'success' : 'warning',
                title: decision === 'approved' ? 'Leader Approved Your Application' : 'Leader Rejected Your Application',
                message:
                    decision === 'approved'
                        ? `Your group leader approved your application for "${appRow.gig?.name || 'this gig'}".`
                        : `Your group leader rejected your application for "${appRow.gig?.name || 'this gig'}".`,
                meta: {
                    application_id: applicationId,
                    gig_id: appRow.gig_id,
                    group_id: appRow.group_id,
                    leader_decision: decision,
                },
            });

            if (decision === 'approved' && appRow.gig?.organizer_id) {
                await supabaseClient.from('notifications').insert({
                    user_id: appRow.gig.organizer_id,
                    type: 'info',
                    title: 'New Approved Group Application',
                    message: `${appRow.group?.name || 'A group'} has an approved application for "${appRow.gig?.name || 'your gig'}".`,
                    meta: {
                        application_id: applicationId,
                        gig_id: appRow.gig_id,
                        group_id: appRow.group_id,
                        source: 'leader_approval',
                    },
                });
            }

            return new Response(JSON.stringify(updated), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // UPDATE APPLICATION STATUS
        if (action === 'update_application_status') {
            const { applicationId, status } = params;

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

            const updatePayload: Record<string, any> = { status };
            if (status === 'accepted') {
                updatePayload.system_status_reason = null;
                updatePayload.reconfirmation_required_at = null;
                updatePayload.reconfirmation_due_at = null;
            } else if (status === 'rejected') {
                updatePayload.system_status_reason = 'user_rejection';
                updatePayload.reconfirmation_required_at = null;
                updatePayload.reconfirmation_due_at = null;
            }

            const { data, error } = await supabaseClient
                .from('gig_applications')
                .update(updatePayload)
                .eq('id', applicationId)
                .select()
                .single();

            if (error) throw error;

            const gigName = appDetails.gig?.name || 'the gig';

            let notificationType = 'info';
            let notificationTitle = '';
            let notificationMessage = '';

            if (status === 'rejected') {
                notificationType = 'warning';
                notificationTitle = 'Application Declined';
                notificationMessage = `Your application for "${gigName}" has been declined.`;
            } else if (status === 'accepted') {
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
                            status: status,
                            status_reason: status === 'rejected' ? 'user_rejection' : null
                        }
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
