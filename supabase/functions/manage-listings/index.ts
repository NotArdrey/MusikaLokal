// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
}

// Helper to decode JWT payload without verification (for getting user ID)
// Uses base64url decoding which is what JWT uses
function decodeJwtPayload(token: string): { sub?: string; email?: string } | null {
    try {
        const parts = token.replace('Bearer ', '').split('.')
        if (parts.length !== 3) return null

        // Base64url to base64 conversion
        let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
        // Add padding if needed
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

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const authHeader = req.headers.get('Authorization');
        console.log('Authorization header present:', !!authHeader);

        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            })
        }

        // Decode JWT to get user info
        const jwtPayload = decodeJwtPayload(authHeader)
        console.log('JWT payload:', { sub: jwtPayload?.sub, email: jwtPayload?.email });

        if (!jwtPayload || !jwtPayload.sub) {
            return new Response(JSON.stringify({ error: 'Invalid token' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            })
        }

        const authenticatedUserId = jwtPayload.sub

        // Create supabase client with service role for database operations
        const supabaseClient = createClient(
            // @ts-ignore
            Deno.env.get('SUPABASE_URL') ?? '',
            // @ts-ignore
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        )

        const { action, ...params } = await req.json()
        const { userId } = params

        // Verify userId matches authenticated user from JWT
        if (userId && userId !== authenticatedUserId) {
            return new Response(JSON.stringify({ error: 'Forbidden: userId mismatch' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 403,
            })
        }

        // Use the authenticated user ID for all operations
        const effectiveUserId = userId || authenticatedUserId

        // --- FETCH LISTS (MY GIGS, GROUPS, STUDIOS) ---

        // FETCH MY GIGS (using view with computed stats)
        if (action === 'fetch_my_gigs') {
            const { data, error } = await supabaseClient
                .from('gigs_with_stats')
                .select('*')
                .eq('organizer_id', userId)
                .order('created_at', { ascending: false })

            if (error) throw error

            // View columns already named 'rating' and 'review_count'
            const mapped = (data || []).map((item: any) => ({
                ...item,
                rating: item.rating || 0,
                review_count: item.review_count || 0
            }))

            return new Response(JSON.stringify(mapped), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }

        // FETCH MY GROUPS (using view with computed stats)
        if (action === 'fetch_my_groups') {
            const { data, error } = await supabaseClient
                .from('groups_with_stats')
                .select('*')
                .eq('owner_id', userId)
                .order('created_at', { ascending: false })

            if (error) throw error

            // View columns already named 'rating' and 'review_count'
            const mapped = (data || []).map((item: any) => ({
                ...item,
                rating: item.rating || 0,
                review_count: item.review_count || 0
            }))

            return new Response(JSON.stringify(mapped), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }

        // FETCH MY STUDIOS (using view with computed stats)
        if (action === 'fetch_my_studios') {
            const { data, error } = await supabaseClient
                .from('studios_with_stats')
                .select('*')
                .eq('owner_id', userId)
                .order('created_at', { ascending: false })

            if (error) throw error

            // View columns already named 'rating' and 'review_count'
            const mapped = (data || []).map((item: any) => ({
                ...item,
                rating: item.rating || 0,
                review_count: item.review_count || 0
            }))

            return new Response(JSON.stringify(mapped), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }

        // FETCH SINGLE ENTITY (SECURE) - using view with computed stats
        if (action === 'fetch_one') {
            const { type, id } = params
            const viewName = type + 's_with_stats'
            const ownerField = type === 'gig' ? 'organizer_id' : 'owner_id'

            const { data, error } = await supabaseClient
                .from(viewName)
                .select('*')
                .eq('id', id)
                .eq(ownerField, userId)
                .maybeSingle()

            if (error) throw error

            // Return null if not found (user doesn't own this entity or doesn't exist)
            if (!data) {
                return new Response(JSON.stringify(null), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
            }

            // If studio, also fetch operating hours and convert to availability format
            if (type === 'studio') {
                const { data: operatingHours, error: hoursError } = await supabaseClient
                    .from('studio_operating_hours')
                    .select('*')
                    .eq('studio_id', id)
                    .order('slot_order', { ascending: true });

                if (!hoursError && operatingHours) {
                    // Convert operating hours to availability format
                    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                    const availability = dayNames.map((dayName, index) => {
                        const dayHours = operatingHours.filter((h: any) => h.day_of_week === index && h.is_open);
                        return {
                            day: dayName,
                            slots: dayHours.map((h: any) => ({
                                start: h.open_time,
                                end: h.close_time
                            }))
                        };
                    });
                    data.availability = availability;
                }
            }

            // View columns already named 'rating' and 'review_count'
            const mapped = {
                ...data,
                rating: data.rating || 0,
                review_count: data.review_count || 0
            }

            return new Response(JSON.stringify(mapped), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }

        // CREATE ENTITY (uses base table for inserts)
        if (action === 'create') {
            const { type, payload } = params
            const table = type + 's'
            const ownerField = type === 'gig' ? 'organizer_id' : 'owner_id'

            // Extract availability only if type is studio, to prevent it from being sent to studios table insert
            let studioAvailability = null;
            let insertPayload = { ...payload };

            // SPAM PREVENTION: Check for blocking rule for Gig Applications
            if (type === 'gig_application') {
                const { gig_id } = insertPayload;

                // Limit tries for THIS specific gig
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

                const { count, error: countError } = await supabaseClient
                    .from('gig_applications')
                    .select('id', { count: 'exact', head: true })
                    .eq('status', 'cancelled') // canceled or rejected? User said "limited tries", usually means re-applying after rejection/cancel.
                    // But if restricted to "cancelled", it means user canceled. If 'rejected', maybe they can't apply again anyway?
                    // Original code checked 'cancelled'. Let's stick to that but scope to gig_id.
                    // Actually, if I was rejected, I probably shouldn't be able to apply again immediately? 
                    // But user specifically said "limited tries".
                    // Let's count both cancelled and rejected to be safe? Or just stick to current logic but scoped to gig.
                    // Current logic: status = 'cancelled'.
                    .eq('applicant_id', userId)
                    .eq('gig_id', gig_id) // Changed from organizer_id to gig_id
                    .gte('updated_at', thirtyDaysAgo.toISOString());

                if (countError) throw countError;

                if (count !== null && count >= 3) { // Threshold: 3 tries per gig
                    throw new Error('You have reached the maximum number of attempts for this gig.');
                }
            }


            if (type === 'studio' && insertPayload.availability) {
                studioAvailability = insertPayload.availability;
                delete insertPayload.availability; // Remove from payload so it doesn't fail insert
            }

            const { data, error } = await supabaseClient
                .from(table)
                .insert({ ...insertPayload, [ownerField]: userId })
                .select()
                .single()

            if (error) throw error

            // If creating a studio, create operating hours and settings
            if (type === 'studio') {
                const studioId = data.id

                // Create default studio settings (30 min buffer, no modifiers)
                await supabaseClient.from('studio_settings').insert({
                    studio_id: studioId,
                    buffer_minutes: 30,
                    weekend_multiplier: 1.0,
                    bulk_discount_threshold_hours: 10,
                    bulk_discount_percentage: 0
                })

                // Create operating hours
                let operatingHours = []

                if (studioAvailability && Array.isArray(studioAvailability) && studioAvailability.length > 0) {
                    // Map user provided availability
                    // Frontend format: { day: 'Monday', slots: [{start, end}] }
                    // DB format: day_of_week (0-6), open_time, close_time
                    // Support multiple slots per day

                    const dayMap: { [key: string]: number } = {
                        'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6
                    };

                    for (const daySchedule of studioAvailability) {
                        const dayIndex = dayMap[daySchedule.day];
                        if (dayIndex !== undefined && daySchedule.slots && daySchedule.slots.length > 0) {
                            // Insert ALL slots for this day (not just first and last)
                            daySchedule.slots.forEach((slot: any, slotIndex: number) => {
                                operatingHours.push({
                                    studio_id: studioId,
                                    day_of_week: dayIndex,
                                    is_open: true,
                                    open_time: slot.start,
                                    close_time: slot.end,
                                    slot_order: slotIndex
                                });
                            });
                        }
                    }
                }

                // If no availability provided or parsed, use defaults
                if (operatingHours.length === 0) {
                    for (let day = 0; day <= 6; day++) {
                        operatingHours.push({
                            studio_id: studioId,
                            day_of_week: day,
                            is_open: true,
                            open_time: '09:00',
                            close_time: '22:00'
                        })
                    }
                }

                await supabaseClient.from('studio_operating_hours').insert(operatingHours)
            }

            // Return with default stats for new entity
            return new Response(JSON.stringify({ ...data, rating: 0, review_count: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }

        // UPDATE ENTITY (uses base table for updates)
        if (action === 'update') {
            const { type, id, payload } = params
            const table = type + 's'
            const ownerField = type === 'gig' ? 'organizer_id' : 'owner_id'

            // Handle availability for studios - store in operating_hours table
            let studioAvailability = null;
            let updatePayload = { ...payload };

            if (type === 'studio' && updatePayload.availability) {
                studioAvailability = updatePayload.availability;
                // Keep availability in payload if column exists in table
                // If you want to use normalized tables instead, uncomment the line below:
                // delete updatePayload.availability;
            }

            const { data, error } = await supabaseClient
                .from(table)
                .update(updatePayload)
                .eq('id', id)
                .eq(ownerField, userId)
                .select()
                .single()

            if (error) throw error

            // Update studio operating hours if availability was provided
            if (type === 'studio' && studioAvailability && Array.isArray(studioAvailability)) {
                const studioId = id;

                // Delete existing operating hours for this studio
                await supabaseClient
                    .from('studio_operating_hours')
                    .delete()
                    .eq('studio_id', studioId);

                // Create new operating hours
                const dayMap: { [key: string]: number } = {
                    'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6
                };

                let operatingHours: any[] = [];
                for (const daySchedule of studioAvailability) {
                    const dayIndex = dayMap[daySchedule.day];
                    if (dayIndex !== undefined && daySchedule.slots && daySchedule.slots.length > 0) {
                        // Insert ALL slots for this day (not just first and last)
                        daySchedule.slots.forEach((slot: any, slotIndex: number) => {
                            operatingHours.push({
                                studio_id: studioId,
                                day_of_week: dayIndex,
                                is_open: true,
                                open_time: slot.start,
                                close_time: slot.end,
                                slot_order: slotIndex
                            });
                        });
                    }
                }

                if (operatingHours.length > 0) {
                    await supabaseClient.from('studio_operating_hours').insert(operatingHours);
                }
            }

            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }

        // DELETE ENTITY (uses base table for deletes)
        if (action === 'delete') {
            const { type, id } = params // type: 'gig', 'group', 'studio'
            const table = type + 's'

            const { error } = await supabaseClient
                .from(table)
                .delete()
                .eq('id', id)
                .eq(type === 'gig' ? 'organizer_id' : 'owner_id', userId) // Security check

            if (error) throw error
            return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
        }

        // --- MANAGE DASHBOARD ACTIONS ---

        // FETCH STUDIO BOOKINGS
        if (action === 'fetch_studio_bookings') {
            const { studioId } = params;
            // Join with profiles to get user info
            const { data, error } = await supabaseClient
                .from('studio_bookings')
                .select(`
                    *,
                    user:profiles!user_id(full_name, avatar_url, email)
                `)
                .eq('studio_id', studioId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        // FETCH GIG APPLICATIONS
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

        // FETCH GROUP APPLICATIONS (My applications as a group/musician)
        if (action === 'fetch_group_applications') {
            const { groupId } = params;
            // Fetch applications where group_id matches OR applicant_id matches the user (if personal)
            // Prioritize group_id if provided
            let query = supabaseClient.from('gig_applications').select(`
                *,
                gig:gigs!gig_id(name, location, budget, event_date, status, images)
             `);

            if (groupId) {
                query = query.eq('group_id', groupId);
            } else {
                query = query.eq('applicant_id', userId);
            }

            const { data, error } = await query.order('created_at', { ascending: false });

            if (error) throw error;
            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        // UPDATE BOOKING STATUS (Studio Bookings)
        if (action === 'update_booking_status') {
            const { bookingId, status, cancellation_reason } = params;

            // First get the booking details to send notification
            const { data: bookingDetails, error: bookingError } = await supabaseClient
                .from('studio_bookings')
                .select(`
                    *,
                    studio:studio_id(name, owner_id),
                    user:user_id(full_name, email)
                `)
                .eq('id', bookingId)
                .single();

            if (bookingError) throw bookingError;

            // Update the booking status (and cancellation reason if provided)
            const updateData: any = { status };
            if (cancellation_reason) {
                updateData.cancellation_reason = cancellation_reason;
            }

            const { data, error } = await supabaseClient
                .from('studio_bookings')
                .update(updateData)
                .eq('id', bookingId)
                .select()
                .single();

            if (error) throw error;

            // Send notification to the user who made the booking
            const studioName = bookingDetails.studio?.name || 'the studio';
            const bookingDate = bookingDetails.booking_date || 'your requested date';

            let notificationType = 'info';
            let notificationTitle = '';
            let notificationMessage = '';

            if (status === 'cancelled') {
                notificationType = 'warning';
                notificationTitle = 'Booking Declined';
                notificationMessage = `Your booking request for "${studioName}" on ${bookingDate} has been declined.${cancellation_reason ? ` Reason: ${cancellation_reason}` : ''}`;
            } else if (status === 'confirmed') {
                notificationType = 'success';
                notificationTitle = 'Booking Confirmed! 🎉';
                notificationMessage = `Great news! Your booking for "${studioName}" on ${bookingDate} has been confirmed.`;
            }

            // Insert notification for the user
            if (notificationTitle) {
                await supabaseClient
                    .from('notifications')
                    .insert({
                        user_id: bookingDetails.user_id,
                        type: notificationType,
                        title: notificationTitle,
                        message: notificationMessage,
                        meta: {
                            studio_id: bookingDetails.studio_id,
                            booking_id: bookingId,
                            status: status,
                            booking_date: bookingDate,
                            cancellation_reason: cancellation_reason || null
                        }
                    });
            }

            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        // PARTIAL SLOT APPROVAL (For multi-slot bookings)
        if (action === 'partial_slot_approval') {
            const { bookingId, acceptedSlots, declinedSlots, cancellation_reason } = params;

            // First get the booking details
            const { data: bookingDetails, error: bookingError } = await supabaseClient
                .from('studio_bookings')
                .select(`
                    *,
                    studio:studio_id(name, owner_id, hourly_rate),
                    user:user_id(full_name, email)
                `)
                .eq('id', bookingId)
                .single();

            if (bookingError) throw bookingError;

            const studioName = bookingDetails.studio?.name || 'the studio';
            const bookingDate = bookingDetails.booking_date;
            const hourlyRate = bookingDetails.studio?.hourly_rate || 0;

            // If there are accepted slots, update the original booking with only accepted slots
            if (acceptedSlots && acceptedSlots.length > 0) {
                // Calculate new pricing for accepted slots
                let totalHours = 0;
                for (const slot of acceptedSlots) {
                    const [startH, startM] = slot.start.split(':').map(Number);
                    const [endH, endM] = slot.end.split(':').map(Number);
                    const hours = (endH + endM / 60) - (startH + startM / 60);
                    totalHours += hours;
                }
                const newPrice = totalHours * hourlyRate;

                // Get overall start and end for backwards compatibility
                const allStartTimes = acceptedSlots.map((s: any) => s.start).sort();
                const allEndTimes = acceptedSlots.map((s: any) => s.end).sort();
                const overallStart = allStartTimes[0];
                const overallEnd = allEndTimes[allEndTimes.length - 1];

                // Update the booking with only accepted slots
                const { error: updateError } = await supabaseClient
                    .from('studio_bookings')
                    .update({
                        status: 'confirmed',
                        time_slots: acceptedSlots,
                        start_time: overallStart,
                        end_time: overallEnd,
                        hours: totalHours,
                        final_price: newPrice,
                        subtotal: newPrice
                    })
                    .eq('id', bookingId);

                if (updateError) throw updateError;

                // Send notification about partial approval
                const formatSlot = (s: any) => {
                    const formatTime = (t: string) => {
                        const [h, m] = t.split(':');
                        const hr = parseInt(h);
                        const period = hr >= 12 ? 'PM' : 'AM';
                        const h12 = hr % 12 || 12;
                        return `${h12}:${m} ${period}`;
                    };
                    return `${formatTime(s.start)} - ${formatTime(s.end)}`;
                };

                const acceptedSlotsText = acceptedSlots.map(formatSlot).join(', ');
                const declinedSlotsText = declinedSlots && declinedSlots.length > 0
                    ? declinedSlots.map(formatSlot).join(', ')
                    : '';

                let notificationMessage = `Your booking for "${studioName}" on ${bookingDate} has been partially approved.\n\n✅ Approved: ${acceptedSlotsText}`;
                if (declinedSlotsText) {
                    notificationMessage += `\n❌ Declined: ${declinedSlotsText}`;
                }
                if (cancellation_reason) {
                    notificationMessage += `\n\nNote: ${cancellation_reason}`;
                }

                await supabaseClient
                    .from('notifications')
                    .insert({
                        user_id: bookingDetails.user_id,
                        type: 'info',
                        title: 'Booking Partially Approved',
                        message: notificationMessage,
                        meta: {
                            studio_id: bookingDetails.studio_id,
                            booking_id: bookingId,
                            status: 'partial',
                            booking_date: bookingDate,
                            accepted_slots: acceptedSlots,
                            declined_slots: declinedSlots
                        }
                    });

                return new Response(JSON.stringify({
                    success: true,
                    message: 'Booking partially approved',
                    acceptedSlots,
                    declinedSlots
                }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
            } else {
                // All slots declined - just cancel the booking
                const { error: updateError } = await supabaseClient
                    .from('studio_bookings')
                    .update({
                        status: 'cancelled',
                        cancellation_reason: cancellation_reason || 'All time slots were declined by the studio owner.'
                    })
                    .eq('id', bookingId);

                if (updateError) throw updateError;

                await supabaseClient
                    .from('notifications')
                    .insert({
                        user_id: bookingDetails.user_id,
                        type: 'warning',
                        title: 'Booking Declined',
                        message: `Your booking request for "${studioName}" on ${bookingDate} has been declined. ${cancellation_reason || ''}`,
                        meta: {
                            studio_id: bookingDetails.studio_id,
                            booking_id: bookingId,
                            status: 'cancelled',
                            booking_date: bookingDate
                        }
                    });

                return new Response(JSON.stringify({
                    success: true,
                    message: 'Booking declined'
                }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
            }
        }

        // UPDATE APPLICATION STATUS
        if (action === 'update_application_status') {
            const { applicationId, status } = params;

            // First get the application details to send notification
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

            // Update the application status
            const { data, error } = await supabaseClient
                .from('gig_applications')
                .update({ status })
                .eq('id', applicationId)
                .select()
                .single();

            if (error) throw error;

            // Send notification to the applicant
            const applicantName = appDetails.group?.name || appDetails.applicant?.full_name || 'Applicant';
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

            // Insert notification for the applicant
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

        // FETCH REVIEWS
        if (action === 'fetch_reviews') {
            const { type, id } = params; // type: 'studio', 'gig', 'group'
            const field = type + '_id'; // e.g., studio_id

            const { data, error } = await supabaseClient
                .from('reviews')
                .select(`
                    *,
                    author:profiles!author_id(full_name, avatar_url)
                `)
                .eq(field, id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        // FETCH MY BOOKINGS (Studio Bookings made by the user)
        if (action === 'fetch_my_bookings') {
            // Join with studio to get studio details
            const { data, error } = await supabaseClient
                .from('studio_bookings')
                .select(`
                    *,
                    studio:studios!studio_id(name, images, location, rate_per_hour)
                `)
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        // CHECK ELIGIBILITY (Spam Block Check)
        if (action === 'check_eligibility') {
            const { gigId } = params; // Changed from organizerId to gigId

            if (!gigId) {
                return new Response(JSON.stringify({ blocked: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
            }

            // Count cancellations for THIS gig in last 30 days
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const { count, error: countError } = await supabaseClient
                .from('gig_applications')
                .select('id', { count: 'exact', head: true })
                .eq('status', 'cancelled')
                .eq('applicant_id', userId)
                .eq('gig_id', gigId) // Scoped to gig
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

            // Verify ownership securely
            const { data: existingApp, error: fetchError } = await supabaseClient
                .from('gig_applications')
                .select('applicant_id, group_id, group:groups!group_id(owner_id)')
                .eq('id', applicationId)
                .single();

            if (fetchError) throw fetchError;
            if (!existingApp) throw new Error('Application not found');

            // Check if consumer is the applicant (individual) OR the owner of the group
            const isApplicant = existingApp.applicant_id === userId;
            const isGroupOwner = existingApp.group?.owner_id === userId;

            if (!isApplicant && !isGroupOwner) {
                return new Response(JSON.stringify({ error: 'Unauthorized to cancel this application' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                });
            }

            // Soft delete: Update status to 'cancelled'
            const { error: updateError } = await supabaseClient
                .from('gig_applications')
                .update({ status: 'cancelled' })
                .eq('id', applicationId);

            if (updateError) throw updateError;

            // SPAM PREVENTION: Get count to show to user
            let cancellationCount = 0;
            try {
                // Get gig details from existingApp (need to ensure gig_id was fetched)
                // We initially only fetched select('applicant_id, group_id...').
                // Let's refetch or improve initial fetch.
                // Improvement: Update initial fetch to include gig_id
            } catch (e) {
                // Ignore count error, just return success
            }

            // To do this cleanly, let's just fetch the gig_id via the existingApp logic if we update the SELECT above.
            // But since I can't easily jump back and forth with one replace, I'll do a fresh small query or assume existingApp has it (I will update the SELECT in the next chunk).

            // Re-fetch gig info for counting
            const { data: appData } = await supabaseClient
                .from('gig_applications')
                .select('gig_id') // We know this app exists
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
                        .eq('applicant_id', userId)
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
        console.error('❌ Error message:', error.message);
        console.error('❌ Error stack:', error.stack);
        console.error('❌ Error details:', JSON.stringify(error, null, 2));

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
