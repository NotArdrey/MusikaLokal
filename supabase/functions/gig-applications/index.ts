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
        console.log('DEBUG: Auth Header present:', !!authHeader);
        if (authHeader) console.log('DEBUG: Auth Header length:', authHeader.length);

        if (!authHeader) {
            console.error('DEBUG: Missing authorization header');
            // RETURN 200 FOR DEBUGGING
            return new Response(JSON.stringify({ error: 'Missing authorization header', debug_auth_header: authHeader }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200, 
            })
        }

        const jwtPayload = decodeJwtPayload(authHeader)
        console.log('DEBUG: JWT Payload:', JSON.stringify(jwtPayload));

        if (!jwtPayload || !jwtPayload.sub) {
            console.error('DEBUG: Invalid token payload');
            // RETURN 200 FOR DEBUGGING
            return new Response(JSON.stringify({ error: 'Invalid token', debug_jwt: jwtPayload }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200, 
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

            const { data, error } = await supabaseClient
                .from('gig_applications')
                .update({ status })
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
                            status: status
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